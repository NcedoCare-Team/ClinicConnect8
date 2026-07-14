from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import google.generativeai as genai
from datetime import datetime
import os
import json
from dotenv import load_dotenv
import tempfile
import time

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini API
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

# Load system instruction
try:
    with open('system_instructions.txt', 'r') as file:
        system_instruction = file.read()
except FileNotFoundError:
    system_instruction = (
        "You are the NcedoCare AI Triage Agent. "
        "Analyse patient symptoms and return a structured JSON triage assessment with fields: "
        "priority (CRITICAL|HIGH|MEDIUM|LOW), riskScore (0-100), confidence (0-100), "
        "reasoning, riskIndicators, recommendedAction, estimatedWait."
    )

# Model configuration
model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction=system_instruction
)

# Chat sessions storage with title tracking
chat_sessions = {}

# ─── Doctor triage interview via Gemini function calling ──────────────────────
# Architecture (matches https://ai.google.dev/gemini-api/docs/function-calling):
#   1. Patient chat is PLAIN TEXT only — never triage scores / JSON / clinical result.
#   2. Identity & facility linkage live in a sealed server session — NEVER in the model prompt.
#   3. Age / demographics are released only when the model calls get_clinical_attribute.
#   4. After the model confirms with the patient, it calls submit_triage_case.
#   5. Backend executes the write to Firestore; patient sees a fixed queue message and chat locks.

QUEUE_CONFIRMATION_MESSAGE = (
    "Your request has been added to the queue at your healthcare facility. "
    "The care team has been notified and will attend to you. "
    "This chat is paused until your care journey for this visit is completed."
)

TRIAGE_INTERVIEW_INSTRUCTION = """
You are Dr. Ncedo, a clinical triage interviewer for NcedoCare (South African public healthcare).
You speak with patients in plain, warm, professional language — like a careful doctor taking a history.

ABSOLUTE RULES FOR WHAT THE PATIENT SEES:
- Reply with PLAIN TEXT only. Never JSON, never markdown code fences, never bullet scorecards.
- NEVER tell the patient a priority colour, risk score, confidence %, triage level, wait-time guess, or diagnosis.
- NEVER say "I am assigning you HIGH/CRITICAL" or similar. Clinical decisions go ONLY through the submit_triage_case tool.
- After you successfully call submit_triage_case, your final spoken reply must simply confirm that their request was added to the facility queue — do not restate clinical findings.

PRIVACY (POPIA) — ANONYMISED BY DEFAULT:
- You are NOT given the patient's name, ID number, phone, address, email, or age up front.
- Do NOT ask for their full name, ID/passport, phone, or address.
- If age (or another allowed clinical attribute) becomes clinically important, call get_clinical_attribute.
- Do not invent demographics. If the tool returns unavailable, continue without that attribute.

CONSULTATION STYLE:
- Acknowledge what they said, then ask ONE focused follow-up at a time (two only if tightly related).
- Cover, as needed: onset, duration, severity 1–10, location/radiation, triggers, associated symptoms, chronic conditions, medicines, allergies, red flags.
- If they report multiple problems (e.g. headache AND stomach ache), clarify which started first, how they relate, and shared causes.
- Match the patient's language (English, isiZulu, isiXhosa, Afrikaans, Sesotho).

CONFIRMATION BEFORE ANY SUBMISSION (MANDATORY):
1. Interview until you have enough clinical context for a safe triage (usually several questions).
2. Re-ask in plain words to confirm: summarise their symptoms back and ask if that is correct.
3. ONLY after the patient clearly confirms, call submit_triage_case with the clinical assessment.
4. Life-threatening red flags (radiating chest pain, severe dyspnoea, stroke signs, uncontrolled bleeding, anaphylaxis, unresponsiveness, sepsis signs): still briefly confirm the key facts if the patient is responsive, then call submit_triage_case immediately with CRITICAL.

TOOLS:
- get_clinical_attribute: request sealed clinical attributes (e.g. age_years) only when needed.
- submit_triage_case: the ONLY way to send an assessment to the facility. Include clear clinical fields for nurses/doctors. Do not put patient identity fields in the tool args — the backend attaches those securely.

If information is insufficient, keep interviewing. Do not guess wildly; when uncertain between two priorities, pick the higher urgency inside submit_triage_case only.
""".strip()

# Sealed binding per conversation: never injected into the model prompt
triage_chat_sessions = {}  # conversation_id -> { chat, binding, submitted }


SUBMIT_TRIAGE_CASE_DECL = {
    "name": "submit_triage_case",
    "description": (
        "Submit the FINAL clinical triage assessment to the patient's healthcare facility queue. "
        "Call ONLY after the patient has confirmed your symptom summary. "
        "Do not include names, IDs, phones, or addresses in arguments."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "priority": {
                "type": "string",
                "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                "description": "Clinical urgency for facility staff only.",
            },
            "risk_score": {
                "type": "integer",
                "description": "Risk score 0-100 for facility staff.",
            },
            "confidence": {
                "type": "integer",
                "description": "Confidence 0-100 in this triage decision.",
            },
            "chief_complaint": {
                "type": "string",
                "description": "Short clinical label, e.g. 'Headache with abdominal pain'.",
            },
            "symptoms_summary": {
                "type": "string",
                "description": "2-4 sentence clinical history summary for nurses.",
            },
            "reasoning": {
                "type": "string",
                "description": "2-3 sentences explaining priority for nurse review.",
            },
            "risk_indicators": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Red flags or notable findings for staff.",
            },
            "recommended_action": {
                "type": "string",
                "description": "Recommended clinical next step for staff.",
            },
        },
        "required": [
            "priority",
            "risk_score",
            "confidence",
            "chief_complaint",
            "symptoms_summary",
            "reasoning",
            "recommended_action",
        ],
    },
}

GET_CLINICAL_ATTRIBUTE_DECL = {
    "name": "get_clinical_attribute",
    "description": (
        "Request an anonymised clinical attribute that was sealed outside the model prompt. "
        "Use only when the attribute is needed for safe triage (e.g. age for paediatric/geriatric risk). "
        "Never request names or identity documents."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "attribute": {
                "type": "string",
                "enum": ["age_years"],
                "description": "Clinical attribute key to release from the sealed session.",
            },
        },
        "required": ["attribute"],
    },
}


def _plain_text_only(text):
    """Strip any JSON / fences the model might leak into the patient channel."""
    raw = (text or "").strip()
    if not raw:
        return "Could you tell me a bit more about how you are feeling?"
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0].strip()
    # If the model accidentally returned JSON, fall back to a safe interviewer prompt
    if raw.startswith("{") and '"priority"' in raw:
        return (
            "Thank you. To make sure I understand correctly — could you confirm the main "
            "symptoms we discussed, and whether anything has changed?"
        )
    # Soft scrub of clinical decision language that must stay facility-only
    banned = (
        "CRITICAL", "risk score", "riskScore", "confidence:",
        "triage level", "PRIORITY:",
    )
    lower = raw.lower()
    if any(b.lower() in lower for b in banned) and ("score" in lower or "priority" in lower):
        return (
            "Thank you for explaining that. I am preparing to send your request to your "
            "healthcare facility. Please confirm that what you told me is still accurate."
        )
    return raw


def _estimate_wait_minutes(priority, ahead_count):
    base = {"CRITICAL": 5, "HIGH": 15, "MEDIUM": 35, "LOW": 60}.get(priority, 35)
    return base + max(0, int(ahead_count)) * 8


def _firestore_create_triage_case(id_token, fields):
    """
    Create triageCases/{autoId} using the patient's Firebase ID token (no service account required).
    fields: dict of Python values to Firestore REST field values.
    """
    import urllib.request
    import urllib.error

    project_id = os.getenv("FIREBASE_PROJECT_ID", "ncedocare")
    url = (
        f"https://firestore.googleapis.com/v1/projects/{project_id}"
        f"/databases/(default)/documents/triageCases"
    )

    def to_fs_value(v, key=None):
        if v is None:
            return {"nullValue": None}
        if key in ("createdAt", "waitUpdatedAt") and isinstance(v, str):
            return {"timestampValue": v if v.endswith("Z") else v + "Z"}
        if isinstance(v, bool):
            return {"booleanValue": v}
        if isinstance(v, int):
            return {"integerValue": str(v)}
        if isinstance(v, float):
            return {"doubleValue": v}
        if isinstance(v, list):
            return {"arrayValue": {"values": [to_fs_value(x) for x in v]}}
        if isinstance(v, dict):
            return {"mapValue": {"fields": {k: to_fs_value(val, k) for k, val in v.items()}}}
        return {"stringValue": str(v)}

    body = json.dumps({"fields": {k: to_fs_value(v, k) for k, v in fields.items()}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {id_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            name = payload.get("name", "")
            case_id = name.rsplit("/", 1)[-1] if name else None
            return case_id, None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        return None, f"HTTP {e.code}: {err_body[:300]}"
    except Exception as e:
        return None, str(e)


def _firestore_count_active_queue(id_token, facility_id):
    """Best-effort count of queued/in_review cases for wait estimate. Fails soft to 0."""
    if not facility_id or not id_token:
        return 0
    # RunQuery can be blocked by rules for list; patients can create but may not list all.
    # Keep estimate conservative without requiring a composite list permission for all cases.
    return 0


def _release_clinical_attribute(binding, attribute):
    if attribute == "age_years":
        age = binding.get("ageYears")
        if isinstance(age, (int, float)) and 0 < age < 130:
            return {"attribute": "age_years", "value": int(round(age)), "available": True}
        return {"attribute": "age_years", "available": False, "reason": "not_on_file"}
    return {"attribute": attribute, "available": False, "reason": "not_allowed"}


def _execute_submit_triage(binding, args, conversation_id, id_token):
    priority = (args.get("priority") or "MEDIUM").upper()
    if priority not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        priority = "MEDIUM"

    risk_score = int(args.get("risk_score") or args.get("riskScore") or 50)
    confidence = int(args.get("confidence") or 50)
    risk_score = max(0, min(100, risk_score))
    confidence = max(0, min(100, confidence))

    ahead = _firestore_count_active_queue(id_token, binding.get("facilityId"))
    wait_mins = _estimate_wait_minutes(priority, ahead)
    wait_label = f"{wait_mins} min" if wait_mins < 60 else f"{wait_mins // 60}h {wait_mins % 60}m"

    fields = {
        "patientId": binding.get("patientId") or "",
        "patientName": binding.get("patientName") or "",
        "facilityId": binding.get("facilityId") or "",
        "facilityName": binding.get("facilityName") or "",
        "chiefComplaint": args.get("chief_complaint") or args.get("chiefComplaint") or "",
        "symptoms": args.get("symptoms_summary") or args.get("symptomsSummary") or "",
        "priority": priority,
        "aiPriority": priority,
        "riskScore": risk_score,
        "confidence": confidence,
        "reasoning": args.get("reasoning") or "",
        "riskIndicators": args.get("risk_indicators") or args.get("riskIndicators") or [],
        "recommendedAction": args.get("recommended_action") or args.get("recommendedAction") or "",
        "estimatedWaitMinutes": wait_mins,
        "estimatedWait": wait_label,
        "queuePosition": ahead + 1,
        "source": "ai_function_call",
        "conversationId": conversation_id,
        "status": "queued",
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }

    case_id, err = _firestore_create_triage_case(id_token, fields)
    if err or not case_id:
        # Fallback payload for the authenticated mobile client to write (still no chat leak)
        return {
            "ok": False,
            "error": err or "write_failed",
            "fallback_fields": fields,
        }
    return {"ok": True, "case_id": case_id, "status": "queued"}


def _extract_function_calls(response):
    calls = []
    try:
        for candidate in response.candidates or []:
            content = getattr(candidate, "content", None)
            if not content:
                continue
            for part in content.parts or []:
                fc = getattr(part, "function_call", None)
                if fc and getattr(fc, "name", None):
                    # fc.args may be a MapComposite / dict-like
                    raw_args = dict(fc.args) if fc.args else {}
                    # Nested values sometimes need recursion for lists
                    calls.append({"name": fc.name, "args": _normalize_fc_args(raw_args)})
    except Exception as e:
        print(f"extract function_calls error: {e}")
    return calls


def _normalize_fc_args(obj):
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {k: _normalize_fc_args(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_normalize_fc_args(v) for v in obj]
    # Proto map / repeated
    try:
        return {k: _normalize_fc_args(v) for k, v in dict(obj).items()}
    except Exception:
        return str(obj)


def _build_triage_model():
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=TRIAGE_INTERVIEW_INSTRUCTION,
        tools=[{
            "function_declarations": [
                GET_CLINICAL_ATTRIBUTE_DECL,
                SUBMIT_TRIAGE_CASE_DECL,
            ],
        }],
    )


@app.route('/api/triage_chat', methods=['POST'])
def triage_chat():
    """
    Doctor-style interview with Gemini function calling.

    Request JSON:
      message, conversation_id,
      id_token (Firebase Auth ID token — used only for Firestore write after tool call),
      session_binding: { patientId, facilityId, facilityName, patientName, ageYears }
        → sealed server-side; NEVER sent to the model prompt.

    Response JSON (patient-safe):
      { status, conversation_id, phase: "interviewing"|"queued",
        response: <plain text>, case_id?, fallback_fields?, processing_time }
    Never returns triage scores or clinical result objects for display.
    """
    start_time = time.time()
    try:
        data = request.get_json(force=True) or {}
        user_message = (data.get("message") or "").strip()
        conversation_id = (data.get("conversation_id") or "").strip()
        id_token = (data.get("id_token") or "").strip()
        binding_in = data.get("session_binding") or {}

        if not user_message:
            return jsonify({
                "error": "no_input",
                "response": "Please describe how you are feeling.",
                "status": "error",
            }), 400

        if not conversation_id:
            conversation_id = f"triage_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Create or refresh sealed binding (never exposed to the model)
        if conversation_id not in triage_chat_sessions:
            interview_model = _build_triage_model()
            triage_chat_sessions[conversation_id] = {
                "chat": interview_model.start_chat(enable_automatic_function_calling=False),
                "binding": {},
                "submitted": False,
            }
            print(f"New triage interview (function calling): {conversation_id}")

        session = triage_chat_sessions[conversation_id]
        if isinstance(binding_in, dict) and binding_in:
            # Merge sealed fields; ignore anything unexpected
            for key in ("patientId", "facilityId", "facilityName", "patientName", "ageYears"):
                if key in binding_in and binding_in[key] not in (None, ""):
                    session["binding"][key] = binding_in[key]

        if session.get("submitted"):
            return jsonify({
                "status": "success",
                "conversation_id": conversation_id,
                "phase": "queued",
                "case_id": session.get("case_id"),
                "response": QUEUE_CONFIRMATION_MESSAGE,
                "processing_time": round(time.time() - start_time, 2),
            }), 200

        chat = session["chat"]

        # ONLY the patient's words go to the model — no identity context
        response = chat.send_message(
            user_message,
            generation_config=genai.types.GenerationConfig(
                temperature=0.4,
                max_output_tokens=800,
            ),
        )

        # Function-calling loop (manual execution — server is the source of truth)
        for _ in range(4):
            calls = _extract_function_calls(response)
            if not calls:
                break

            fn_response_parts = []

            for call in calls:
                name = call["name"]
                args = call.get("args") or {}
                print(f"[FC] {name}({json.dumps(args)[:200]})")

                if name == "get_clinical_attribute":
                    result = _release_clinical_attribute(
                        session["binding"], args.get("attribute")
                    )
                    fn_response_parts.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=name,
                                response=result,
                            )
                        )
                    )

                elif name == "submit_triage_case":
                    if not id_token or not session["binding"].get("patientId"):
                        result = {
                            "ok": False,
                            "error": "missing_auth_or_binding",
                            "message": "Cannot submit without authenticated patient session.",
                        }
                    else:
                        result = _execute_submit_triage(
                            session["binding"], args, conversation_id, id_token
                        )

                    if result.get("ok"):
                        session["submitted"] = True
                        session["case_id"] = result["case_id"]
                        submitted_now = result
                        # Stop tool loop — patient must only see the fixed queue message
                        processing_time = round(time.time() - start_time, 2)
                        print(f"Triage queued [{conversation_id}] case={result['case_id']} in {processing_time}s")
                        triage_chat_sessions.pop(conversation_id, None)
                        return jsonify({
                            "status": "success",
                            "conversation_id": conversation_id,
                            "phase": "queued",
                            "case_id": result["case_id"],
                            "response": QUEUE_CONFIRMATION_MESSAGE,
                            "processing_time": processing_time,
                        }), 200

                    # Write failed — ask mobile to persist sealed clinical fields (not for chat UI)
                    fn_response_parts.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=name,
                                response={
                                    "ok": False,
                                    "error": result.get("error"),
                                    "instruction": "Tell the patient you could not reach the facility queue and to try again shortly. Do NOT reveal triage scores.",
                                },
                            )
                        )
                    )
                    if result.get("fallback_fields"):
                        processing_time = round(time.time() - start_time, 2)
                        return jsonify({
                            "status": "success",
                            "conversation_id": conversation_id,
                            "phase": "queued",
                            "case_id": None,
                            "fallback_fields": result["fallback_fields"],
                            "response": QUEUE_CONFIRMATION_MESSAGE,
                            "processing_time": processing_time,
                        }), 200

                else:
                    fn_response_parts.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=name,
                                response={"ok": False, "error": "unknown_function"},
                            )
                        )
                    )

            if not fn_response_parts:
                break

            response = chat.send_message(
                genai.protos.Content(role="user", parts=fn_response_parts)
            )

        patient_text = _plain_text_only(getattr(response, "text", None) or "")
        processing_time = round(time.time() - start_time, 2)
        print(f"Triage chat [{conversation_id}] interviewing in {processing_time}s")

        return jsonify({
            "status": "success",
            "conversation_id": conversation_id,
            "phase": "interviewing",
            "response": patient_text,
            "processing_time": processing_time,
        }), 200

    except Exception as e:
        print(f"Triage chat error: {e}")
        return jsonify({
            "error": str(e),
            "response": "I ran into a problem processing that. Please try again.",
            "status": "error",
        }), 500

def detect_mime_type(filename, initial_bytes):
    """Detect MIME type from filename and file signature"""
    if filename:
        filename_lower = filename.lower()
        if filename_lower.endswith('.jpg') or filename_lower.endswith('.jpeg'):
            return 'image/jpeg'
        elif filename_lower.endswith('.png'):
            return 'image/png'
        elif filename_lower.endswith('.webp'):
            return 'image/webp'
        elif filename_lower.endswith('.heic'):
            return 'image/heic'
        elif filename_lower.endswith('.heif'):
            return 'image/heif'
    
    if initial_bytes.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    elif initial_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    elif initial_bytes.startswith(b'RIFF') and initial_bytes[8:12] == b'WEBP':
        return 'image/webp'
    
    return 'image/jpeg'

def process_image(image_file):
    """Process image using Gemini File API"""
    temp_image_path = None
    
    try:
        # Create temporary file with proper extension
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            # Read and write the image data
            image_file.seek(0)
            image_data = image_file.read()
            temp_file.write(image_data)
            temp_image_path = temp_file.name
        
        print(f"Uploading image: {image_file.filename}, Size: {len(image_data)} bytes")
        
        # Determine MIME type
        mime_type = detect_mime_type(image_file.filename, image_data[:12])
        
        # Upload to Gemini File API
        uploaded_file = genai.upload_file(path=temp_image_path, mime_type=mime_type)
        print(f"Image uploaded: {uploaded_file.uri}")
        
        return uploaded_file
        
    except Exception as e:
        print(f"Image upload error: {str(e)}")
        return None
    finally:
        # Clean up temp file
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.unlink(temp_image_path)
            except Exception as e:
                print(f"Error cleaning up temp file: {e}")

def is_substantive_message(text, has_image, has_audio):
    """Determine if message is substantive enough for title generation"""
    # An image or audio file always counts as a substantive message
    if has_image or has_audio:
        return True
    
    if not text:
        return False
    
    # Check if text is meaningful
    text = text.strip().lower()
    short_phrases = [
        'hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no',
        'thanks.', 'thank you.', 'okay.', 'yes.', 'no.', 'thanks!', 'hello!', 'hey!',
        'hi there', 'hello there'
    ]
     
    # Check for exact matches to short, non-substantive phrases
    if text in short_phrases:
        return False
    
    # Check length for purely text messages (3 words minimum)
    if len(text.split()) < 3:
        return False
    
    return True

def generate_conversation_title(user_input, ai_response_text, image_present, audio_present):
    """Generate a concise conversation title based on message content"""
    try:
        # Prepare context for title
        user_text = user_input.strip()[:100] if user_input else ""
        ai_text = ai_response_text.strip()[:150]
        context_for_title = f"User: {user_text} | AI: {ai_text}"
        
        prompt = f"Based on this career/employment conversation, generate a specific title in 2-4 words. Context: {context_for_title}"

        # Title generation system instruction
        title_system_instruction = (
            "You are a concise title generator for career and employment conversations. "
            "Generate a 2-4 word title that captures the main topic. "
            "Examples: 'CV Review Feedback', 'Interview Prep Tips', 'Job Search Strategy'. "
            "Output ONLY the title words, nothing else."
        )
        
        title_model = genai.GenerativeModel(
            model_name='gemini-2.0-flash-exp',
            system_instruction=title_system_instruction
        )
        
        response = title_model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.0,
                max_output_tokens=10,
            )
        )

        # Check if response was blocked
        if not response.parts:
            if response.candidates and response.candidates[0].finish_reason.name != 'STOP':
                reason = response.candidates[0].finish_reason.name
                raise Exception(f"Title generation blocked. Reason: {reason}")
            else:
                raise Exception("Title generation returned empty response")
        
        # Clean up response
        title = response.text.strip().strip('"').strip("'").strip()
        title = title.replace('.', '').replace(':', '').replace('!', '').replace('?', '')
        words = title.split()
        
        final_title = ' '.join(words[:4]).title()
        
        if not final_title:
            raise Exception("Title generation produced empty string")
        
        return final_title
        
    except Exception as e:
        print(f"Title generation error: {e}")
        # Fallback titles
        if image_present:
            return "Document Analysis"
        elif audio_present:
            return "Voice Message"
        else:
            return user_input.strip()[:30].strip().title() if user_input.strip() else "New Conversation"


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "NcedoCare AI Triage API is running",
        "timestamp": datetime.now().isoformat()
    }), 200


@app.route('/api/triage', methods=['POST'])
def triage():
    """
    AI triage endpoint.
    Expects JSON: { "symptoms": "...", "context": "..." }
    Returns structured triage assessment JSON.
    """
    start_time = time.time()
    try:
        data = request.get_json(force=True)
        symptoms = (data.get('symptoms') or '').strip()
        context  = (data.get('context')  or '').strip()

        if not symptoms:
            return jsonify({"error": "no_symptoms", "response": "No symptoms provided.", "status": "error"}), 400

        prompt = f"TRIAGE_REQUEST\nSymptoms: {symptoms}"
        if context:
            prompt += f"\n{context}"

        triage_model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=system_instruction
        )
        response = triage_model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.2,
                max_output_tokens=512,
            )
        )

        raw = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[-1]
            if raw.endswith('```'):
                raw = raw.rsplit('```', 1)[0].strip()

        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            # Return raw text wrapped in a minimal structure
            result = {
                "priority":          "MEDIUM",
                "riskScore":         50,
                "confidence":        40,
                "reasoning":         raw[:500],
                "riskIndicators":    [],
                "recommendedAction": "Nurse assessment required",
                "estimatedWait":     "1-2 hours",
            }

        processing_time = round(time.time() - start_time, 2)
        print(f"Triage complete: {result.get('priority')} (score={result.get('riskScore')}) in {processing_time}s")

        return jsonify({
            "status":          "success",
            "response":        json.dumps(result),
            "data":            result,
            "processing_time": processing_time,
        }), 200

    except Exception as e:
        print(f"Triage error: {e}")
        return jsonify({"error": str(e), "response": "Triage analysis failed.", "status": "error"}), 500

@app.route('/api/chatbot', methods=['POST'])
def chatbot_response():
    start_time = time.time()
    
    try:
        user_input = request.form.get("message", "").strip()
        conversation_id = request.form.get("conversation_id", "")
        audio_file = request.files.get("audio")
        image_file = request.files.get("image")
        document_file = request.files.get("document")
        
        print(f"\n=== NcedoCare Request at {datetime.now().strftime('%H:%M:%S')} ===")
        print(f"Text: {user_input[:50] if user_input else 'None'}...")
        print(f"Audio: {audio_file is not None}, Image: {image_file is not None}, Document: {document_file is not None}")
        print(f"Conversation ID: {conversation_id}")
        
        # Validate input
        if not user_input and not audio_file and not image_file and not document_file:
            return jsonify({
                "error": "no_input",
                "response": "I didn't receive any message, audio, image, or document. Please try again.",
                "status": "error"
            }), 400
        
        # Create or get chat session
        if not conversation_id:
            conversation_id = f"conv_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        if conversation_id not in chat_sessions:
            chat_sessions[conversation_id] = {
                'chat': model.start_chat(),
                'title': None
            }
            print(f"New session: {conversation_id}")
        
        session = chat_sessions[conversation_id]
        chat = session['chat']
        content_parts = []
        
        # Handle image using Gemini File API
        if image_file:
            try:
                print(f"Processing image: {image_file.filename}")
                uploaded_image = process_image(image_file)
                
                if uploaded_image:
                    content_parts.append(uploaded_image)
                    print(f"Image uploaded successfully: {uploaded_image.uri}")
                else:
                    return jsonify({
                        "error": "image_upload_failed",
                        "response": "I had trouble uploading your image. Please try a different image format (JPEG, PNG, WEBP, HEIC supported).",
                        "status": "error"
                    }), 400
                    
            except Exception as e:
                print(f"Image upload error: {str(e)}")
                return jsonify({
                    "error": "image_error",
                    "response": "Something went wrong while uploading your image. Please ensure it's a valid image file.",
                    "status": "error"
                }), 400
        
        # Handle audio
        if audio_file:
            temp_audio_path = None
            
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
                    audio_data = audio_file.read()
                    temp_file.write(audio_data)
                    temp_audio_path = temp_file.name
                
                print(f"Processing audio: {audio_file.filename}, Size: {len(audio_data)} bytes")
                
                uploaded_file = genai.upload_file(path=temp_audio_path, mime_type='audio/webm')
                print(f"Audio uploaded: {uploaded_file.uri}")
                
                if not user_input:
                    if image_file:
                        content_parts.insert(0, "Analyze the image and listen to the audio message. Provide career-relevant guidance based on both inputs.")
                    else:
                        content_parts.insert(0, "Please listen and respond to this audio message. Provide career-relevant guidance and support.")
                else:
                    if not image_file:
                        content_parts.append(user_input)
                
                content_parts.append(uploaded_file)
                
                os.unlink(temp_audio_path)
                
            except Exception as e:
                print(f"Audio error: {str(e)}")
                if temp_audio_path and os.path.exists(temp_audio_path):
                    try:
                        os.unlink(temp_audio_path)
                    except:
                        pass
                return jsonify({
                    "error": "audio_processing_failed",
                    "response": "I couldn't process your audio recording. Please try again.",
                    "status": "error"
                }), 400
        
        # Handle document (PDF) using Gemini File API
        if document_file:
            temp_doc_path = None
            try:
                doc_filename = document_file.filename or 'document.pdf'
                doc_ext = os.path.splitext(doc_filename)[1] or '.pdf'
                with tempfile.NamedTemporaryFile(delete=False, suffix=doc_ext) as temp_file:
                    doc_data = document_file.read()
                    temp_file.write(doc_data)
                    temp_doc_path = temp_file.name
                
                print(f"Processing document: {doc_filename}, Size: {len(doc_data)} bytes")
                
                # Determine MIME type for documents
                doc_mime = 'application/pdf'
                if doc_ext.lower() in ['.doc', '.docx']:
                    doc_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                elif doc_ext.lower() == '.txt':
                    doc_mime = 'text/plain'
                
                uploaded_doc = genai.upload_file(path=temp_doc_path, mime_type=doc_mime)
                print(f"Document uploaded: {uploaded_doc.uri}")
                content_parts.append(uploaded_doc)
                
            except Exception as e:
                print(f"Document upload error: {str(e)}")
                return jsonify({
                    "error": "document_error",
                    "response": "Something went wrong while processing your document. Please ensure it is a valid PDF or text file.",
                    "status": "error"
                }), 400
            finally:
                if temp_doc_path and os.path.exists(temp_doc_path):
                    try:
                        os.unlink(temp_doc_path)
                    except:
                        pass
        
        # Add text message
        if user_input:
            if (image_file or document_file) and not audio_file:
                content_parts.insert(0, f"User question about the attached content: {user_input}")
            elif not image_file and not audio_file and not document_file:
                content_parts.append(user_input)
        elif image_file and not audio_file and not user_input:
            content_parts.insert(0, "Please analyze this image and provide career-relevant guidance if applicable.")
        elif document_file and not audio_file and not user_input:
            content_parts.insert(0, "Please analyze this document and provide a concise summary with actionable career-relevant feedback.")
        
        print(f"Sending {len(content_parts)} parts to Gemini...")
        
        # Allow client to request more tokens (e.g. for structured feedback)
        requested_max_tokens = request.form.get("max_tokens", None)
        max_tokens = 800
        if requested_max_tokens:
            try:
                max_tokens = min(int(requested_max_tokens), 4096)
            except (ValueError, TypeError):
                pass
        
        # Send to Gemini
        response = chat.send_message(
            content=content_parts,
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=max_tokens,
                top_p=0.95,
                top_k=40,
            )
        )
        
        response_text = response.text
        processing_time = time.time() - start_time
        
        print(f"✓ Response: {len(response_text)} chars in {processing_time:.2f}s")
        
        # Handle title generation
        conversation_title = None
        should_generate_title = session['title'] is None

        if should_generate_title:
            is_substantive = is_substantive_message(
                user_input, 
                image_file is not None or document_file is not None, 
                audio_file is not None
            )
            
            if is_substantive:
                conversation_title = generate_conversation_title(
                    user_input, 
                    response_text, 
                    image_file is not None or document_file is not None, 
                    audio_file is not None
                )
                session['title'] = conversation_title
                print(f"Generated title: {conversation_title}")
            else:
                print("Message not substantive, skipping title generation")
        else:
            conversation_title = session['title']
            print(f"Using existing title: {conversation_title}")
        
        return jsonify({
            "response": response_text,
            "conversation_id": conversation_id,
            "conversation_title": conversation_title,
            "status": "success",
            "processing_time": round(processing_time, 2)
        }), 200
    
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        processing_time = time.time() - start_time
        
        print(f"\n!!! Error: {error_type} !!!")
        print(f"Message: {error_message}")
        
        if "quota" in error_message.lower() or "rate" in error_message.lower():
            user_message = "I'm currently experiencing high demand. Please wait a moment and try again."
        elif "network" in error_message.lower() or "connection" in error_message.lower():
            user_message = "I'm having trouble connecting to my AI service. Please check your internet connection and try again."
        elif "timeout" in error_message.lower():
            user_message = "Your request took too long to process. Please try with a shorter message or smaller file."
        elif "invalid" in error_message.lower():
            user_message = "There was an issue with your input format. Please try again with a different file or message."
        else:
            user_message = "I encountered an unexpected issue while processing your request. Please try again in a moment."
        
        return jsonify({
            "error": error_type,
            "response": user_message,
            "status": "error",
            "processing_time": round(processing_time, 2)
        }), 500

@app.route('/api/clear_session', methods=['POST'])
def clear_session():
    """Clear a specific chat session"""
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        
        cleared = False
        if conversation_id and conversation_id in chat_sessions:
            del chat_sessions[conversation_id]
            cleared = True
        if conversation_id and conversation_id in triage_chat_sessions:
            del triage_chat_sessions[conversation_id]
            cleared = True

        if cleared:
            return jsonify({
                "status": "success",
                "message": "Session cleared"
            }), 200

        return jsonify({
            "status": "error",
            "message": "Session not found"
        }), 404
    
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/analyse_document', methods=['POST'])
def analyse_document():
    """Analyse a job document (image/PDF) using Gemini."""
    try:
        data = request.get_json()
        b64_data = data.get('data', '')
        mime_type = data.get('mimeType', 'image/jpeg')

        if not b64_data:
            return jsonify({"error": "No data provided", "text": ""}), 400

        import base64 as b64mod
        raw_bytes = b64mod.b64decode(b64_data)

        with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name

        uploaded = genai.upload_file(path=tmp_path, mime_type=mime_type)
        os.unlink(tmp_path)

        doc_model = genai.GenerativeModel(model_name='gemini-2.5-flash')
        response = doc_model.generate_content(
            [
                uploaded,
                'Extract in plain text (no markdown): Job title, Company, '
                'Key responsibilities, Required skills, Nice-to-haves. Be concise.',
            ],
            generation_config=genai.types.GenerationConfig(max_output_tokens=500),
        )

        return jsonify({"text": response.text.strip() if response.text else ""}), 200

    except Exception as e:
        print(f"Document analysis error: {e}")
        return jsonify({"error": str(e), "text": ""}), 500


if __name__ == '__main__':
    print(f"\n{'='*60}")
    print(f"NcedoCare AI Triage Backend Starting")
    print(f"{'='*60}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Triage Endpoint: http://0.0.0.0:5000/api/triage")
    print(f"Chat Endpoint:   http://0.0.0.0:5000/api/chatbot")
    print(f"Health Check:    http://0.0.0.0:5000/health")
    print(f"Model: gemini-2.5-flash")
    print(f"Purpose: AI-Powered Patient Triage — NcedoCare")
    print(f"{'='*60}\n")

    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)