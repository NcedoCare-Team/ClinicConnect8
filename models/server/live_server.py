# models/server/live_server.py
# ─────────────────────────────────────────────────────────────────────────────
# NcedoCare — ADK Gemini Live API Real-Time Voice Triage Relay Server
#
# Architecture:
#   React Native app  ←WebSocket→  This server  ←WebSocket→  Gemini Live API
#
# Features:
#   1. Real-time bidirectional voice & text streaming with low latency.
#   2. Clinical Triage Agent Persona (Dr. Ncedo): empathetic, history-taking,
#      anonymised / POPIA compliant (no patient identity passed to AI).
#   3. ADK Tool Execution (Function Calling over Live WebSocket):
#      - get_clinical_attribute (e.g. age_years from sealed session).
#      - submit_triage_case (writes case to Firestore, notifies client & AI).
#   4. Auto-close flow:
#      - AI confirms symptoms with patient -> calls submit_triage_case ->
#        backend persists to Firestore -> AI speaks final closing reassurance ->
#        client transitions patient to queue / journey view.
#
# Usage (STANDALONE — run this file in its own terminal, separate from app.py):
#   pip install websockets python-dotenv imageio-ffmpeg
#   py live_server.py
#
# Audio path:
#   The Expo client cannot record raw PCM on Android (MediaRecorder produces
#   M4A/AAC), so the client sends complete utterances as WAV (iOS) or M4A
#   (Android) and THIS server converts them to the raw 16 kHz mono 16-bit PCM
#   that the Gemini Live API requires. Automatic (server-side) voice activity
#   detection is disabled; the client marks each utterance with explicit
#   activityStart / activityEnd signals per the Live API reference
#   (https://ai.google.dev/api/live).
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import io
import json
import re
import base64
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import wave
from datetime import datetime
import urllib.request
import urllib.error

import websockets
from dotenv import load_dotenv

# Windows cp1252 consoles raise UnicodeEncodeError on emoji logs, which would
# abort the live relay mid-connection. Force UTF-8 output.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# models/server/live_server.py → repo root .env (keys + model names live there)
_SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_SERVER_DIR, "..", ".."))
load_dotenv(os.path.join(_REPO_ROOT, ".env"))
load_dotenv()  # allow a local models/server/.env to override

# ─── Configuration ────────────────────────────────────────────────────────────
# Use the dedicated live key when set; fall back to the text-chat key.
_LIVE_KEY = os.getenv("GEMINI_LIVE_API_KEY", "").strip()
_TEXT_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_API_KEY = _LIVE_KEY or _TEXT_KEY
GEMINI_KEY_SOURCE = "GEMINI_LIVE_API_KEY" if _LIVE_KEY else "GEMINI_API_KEY"

# Same Live model VisionAlly uses successfully on this network.
GEMINI_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-2.5-flash-native-audio-latest")

GEMINI_WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    f"?key={GEMINI_API_KEY}"
)

RELAY_HOST = "0.0.0.0"
RELAY_PORT = int(os.getenv("LIVE_RELAY_PORT", "8765"))

# ─── Client Audio → 16 kHz PCM Conversion ─────────────────────────────────────
# Gemini Live accepts ONLY raw little-endian 16-bit PCM @ 16 kHz as audio input.

_FFMPEG_EXE = None


def _find_ffmpeg():
    """Locate ffmpeg: FFMPEG_PATH env → PATH → bundled imageio-ffmpeg binary."""
    global _FFMPEG_EXE
    if _FFMPEG_EXE:
        return _FFMPEG_EXE
    exe = os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg")
    if not exe:
        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            exe = None
    _FFMPEG_EXE = exe
    return exe


def _wav_to_pcm16k(raw):
    """Extract PCM from a WAV container if it is already 16-bit mono 16 kHz."""
    with wave.open(io.BytesIO(raw), "rb") as wf:
        if wf.getsampwidth() != 2 or wf.getnchannels() != 1 or wf.getframerate() != 16000:
            return None  # unusual format — fall through to ffmpeg
        return wf.readframes(wf.getnframes())


def _ffmpeg_to_pcm16k(raw, suffix):
    """Decode any compressed audio (M4A/AAC/3GP/WEBM/…) to raw 16 kHz mono PCM."""
    exe = _find_ffmpeg()
    if not exe:
        raise RuntimeError("ffmpeg not found. Install with: py -m pip install imageio-ffmpeg")
    in_path = None
    try:
        # MediaRecorder M4A keeps its moov atom at the end, so ffmpeg needs a
        # seekable file — stdin piping is not reliable here.
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(raw)
            in_path = f.name
        proc = subprocess.run(
            [
                exe, "-hide_banner", "-loglevel", "error", "-i", in_path,
                "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", "16000",
                "pipe:1",
            ],
            capture_output=True,
            timeout=20,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore")[:300])
        return proc.stdout
    finally:
        if in_path:
            try:
                os.unlink(in_path)
            except OSError:
                pass


_MIME_SUFFIX = {
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/3gpp": ".3gp",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
}


def convert_to_pcm16k_b64(b64_data, mime):
    """Convert base64 client audio of any supported container to base64 raw PCM."""
    raw = base64.b64decode(b64_data)
    mime_base = (mime or "").split(";")[0].strip().lower()

    pcm = None
    if mime_base in ("audio/wav", "audio/x-wav") or raw[:4] == b"RIFF":
        try:
            pcm = _wav_to_pcm16k(raw)
        except Exception:
            pcm = None
    if pcm is None:
        pcm = _ffmpeg_to_pcm16k(raw, _MIME_SUFFIX.get(mime_base, ".bin"))
    return base64.b64encode(pcm).decode("ascii"), len(pcm)

# ─── Clinical Instructions & Tool Declarations ─────────────────────────────────

LIVE_TRIAGE_INSTRUCTION = """
You are Dr. Ncedo, a clinical triage interviewer for NcedoCare (South African public healthcare).
You speak with patients in plain, warm, professional, conversational spoken language — like a careful, empathetic doctor taking a medical history.

PRIVACY AND POPIA COMPLIANCE (STRICT):
- You have NO access to the patient's personal identity (name, ID number, phone, email, address).
- Do NOT ask the patient for their name, ID/passport, phone number, or address.
- If age is clinically critical for triage decision (e.g. child or elderly risk), call the get_clinical_attribute tool.
- You are strictly an illness and symptom triage interviewer.

SPOKEN CONSULTATION STYLE:
- Speak naturally and conversationally. Keep spoken turns concise (1-3 sentences) so the conversation flows smoothly back and forth.
- Acknowledge what the patient said, then ask ONE focused follow-up question at a time.
- Explore: onset, duration, severity (1-10 scale), location/radiation, triggers, associated symptoms, chronic conditions, medications, allergies, and red flags.
- Match the patient's language naturally (English, isiZulu, isiXhosa, Afrikaans, Sesotho).

ABSOLUTE RULES FOR SPOKEN OUTPUT:
- NEVER speak clinical scorecards, priority levels (CRITICAL/HIGH/MEDIUM/LOW), risk percentages, triage colours, wait-time guesses, or definitive medical diagnoses to the patient.
- Clinical decisions go SOLELY through the submit_triage_case tool.

MANDATORY CONFIRMATION & AUTO-SUBMISSION:
1. When you have gathered enough clinical context, summarize their symptoms in simple, clear words and ask: "Did I capture everything accurately, or is there anything else?"
2. As soon as the patient confirms (e.g. "yes", "that's right", "correct"), immediately call the submit_triage_case tool.
3. For life-threatening emergencies (e.g., severe crushing chest pain radiating to arm/jaw, severe shortness of breath, sudden facial drooping/stroke signs, uncontrolled bleeding, anaphylaxis): briefly confirm the key fact if the patient is able to respond, then immediately call submit_triage_case with priority CRITICAL.
4. After you call submit_triage_case, speak your final closing message warmly: reassure them that their clinical assessment has been sent directly to the care team at their healthcare facility and that they have been added to the queue, then wish them well.
""".strip()

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
                "description": "Short clinical label, e.g. 'Chest tightness with shortness of breath'.",
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


# ─── Firestore Triage Helper Functions ────────────────────────────────────────

def _estimate_wait_minutes(priority, ahead_count=0):
    base = {"CRITICAL": 5, "HIGH": 15, "MEDIUM": 35, "LOW": 60}.get(priority, 35)
    return base + max(0, int(ahead_count)) * 8


def _firestore_create_triage_case(id_token, fields):
    """Create triageCases/{autoId} in Firestore using Firebase Auth ID token."""
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
    headers = {
        "Content-Type": "application/json",
    }
    if id_token:
        headers["Authorization"] = f"Bearer {id_token}"

    req = urllib.request.Request(
        url,
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            name = payload.get("name", "")
            case_id = name.rsplit("/", 1)[-1] if name else None
            return case_id, None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        return None, f"HTTP {e.code}: {err_body[:300]}"
    except Exception as e:
        return None, str(e)


def _release_clinical_attribute(binding, attribute):
    if attribute == "age_years":
        age = binding.get("ageYears")
        if isinstance(age, (int, float)) and 0 < age < 130:
            return {"attribute": "age_years", "value": int(round(age)), "available": True}
        return {"attribute": "age_years", "available": False, "reason": "not_on_file"}
    return {"attribute": attribute, "available": False, "reason": "not_allowed"}


def _as_string_list(value):
    """Gemini sometimes returns riskIndicators as a string or object — always store string[]."""
    if value is None or value is False:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text[0] in "[(":
            try:
                parsed = json.loads(text.replace("'", '"'))
                if isinstance(parsed, list):
                    return _as_string_list(parsed)
            except Exception:
                pass
            text = text.strip("[]() ")
        return [part.strip() for part in re.split(r"[,;\n]+", text) if part.strip()]
    if isinstance(value, dict):
        return [str(v).strip() for v in value.values() if v not in (None, "")]
    if isinstance(value, (list, tuple, set)):
        out = []
        for item in value:
            if isinstance(item, str):
                s = item.strip()
                if s:
                    out.append(s)
            else:
                out.extend(_as_string_list(item))
        return out
    try:
        return _as_string_list(list(value))
    except Exception:
        s = str(value).strip()
        return [s] if s else []


def _execute_submit_triage(binding, args, conversation_id, id_token):
    priority = (args.get("priority") or "MEDIUM").upper()
    if priority not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        priority = "MEDIUM"

    risk_score = int(args.get("risk_score") or args.get("riskScore") or 50)
    confidence = int(args.get("confidence") or 50)
    risk_score = max(0, min(100, risk_score))
    confidence = max(0, min(100, confidence))

    wait_mins = _estimate_wait_minutes(priority, 0)
    wait_label = f"{wait_mins} min" if wait_mins < 60 else f"{wait_mins // 60}h {wait_mins % 60}m"

    fields = {
        "patientId": binding.get("patientId") or "",
        "patientName": binding.get("patientName") or "",
        "facilityId": binding.get("facilityId") or "",
        "facilityName": binding.get("facilityName") or "",
        "chiefComplaint": args.get("chief_complaint") or args.get("chiefComplaint") or "Health Assessment",
        "symptoms": args.get("symptoms_summary") or args.get("symptomsSummary") or "",
        "priority": priority,
        "aiPriority": priority,
        "riskScore": risk_score,
        "confidence": confidence,
        "reasoning": args.get("reasoning") or "",
        "aiReasoning": args.get("reasoning") or "",
        "riskIndicators": _as_string_list(
            args.get("risk_indicators") or args.get("riskIndicators")
        ),
        "recommendedAction": args.get("recommended_action") or args.get("recommendedAction") or "",
        "estimatedWaitMinutes": wait_mins,
        "estimatedWait": wait_label,
        "queuePosition": 1,
        "source": "ai_live_voice_interview",
        "aiPipeline": "gemini_live_function_calling",
        "conversationId": conversation_id,
        "status": "queued",
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "waitUpdatedAt": datetime.utcnow().isoformat() + "Z",
    }

    case_id, err = _firestore_create_triage_case(id_token, fields)
    if err or not case_id:
        print(f"[{_ts()}] ⚠ Direct Firestore write failed: {err}. Returning fallback fields to client.")
        return {
            "ok": False,
            "error": err or "write_failed",
            "fallback_fields": fields,
        }
    print(f"[{_ts()}] ✅ Triage case created in Firestore: {case_id} [{priority}]")
    return {"ok": True, "case_id": case_id, "status": "queued", "priority": priority}


def _ts():
    return datetime.now().strftime("%H:%M:%S")


# ─── Session handler ──────────────────────────────────────────────────────────

async def handle_client(client_ws):
    """Handle a single client WebSocket connection."""
    client_addr = client_ws.remote_address
    print(f"\n[{_ts()}] ✅ Client connected: {client_addr}")

    gemini_ws = None
    session_binding = {}
    id_token = None
    conversation_id = f"live_triage_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    try:
        # 1. Wait for setup message from the client
        raw = await asyncio.wait_for(client_ws.recv(), timeout=20)
        setup_msg = json.loads(raw)

        if "setup" not in setup_msg:
            await client_ws.send(json.dumps({
                "error": "First message must contain a 'setup' key."
            }))
            return

        client_setup = setup_msg["setup"]
        system_instruction = client_setup.get("systemInstruction") or LIVE_TRIAGE_INSTRUCTION
        voice_name = client_setup.get("voiceName", "Aoede")
        conversation_id = client_setup.get("conversationId") or conversation_id
        id_token = client_setup.get("idToken") or None

        # Sealed session binding (never passed into model prompts)
        binding_in = client_setup.get("sessionBinding") or {}
        if isinstance(binding_in, dict):
            for key in ("patientId", "facilityId", "facilityName", "patientName", "ageYears"):
                if key in binding_in and binding_in[key] not in (None, ""):
                    session_binding[key] = binding_in[key]

        print(f"[{_ts()}] Initializing Live Triage Session: {conversation_id}")
        print(f"[{_ts()}] Facility: {session_binding.get('facilityName', 'Unknown')}, Patient: {session_binding.get('patientId', 'Anon')[:8]}...")

        # Build the Gemini setup message per BidiGenerateContent specifications
        gemini_config = {
            "setup": {
                "model": f"models/{GEMINI_MODEL}",
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": voice_name,
                            }
                        }
                    },
                    "thinkingConfig": {
                        "thinkingBudget": 0,
                    },
                },
                "systemInstruction": {
                    "parts": [{"text": system_instruction}],
                },
                "realtimeInputConfig": {
                    "automaticActivityDetection": {
                        "disabled": True,
                    },
                },
                "tools": [
                    {
                        "functionDeclarations": [
                            GET_CLINICAL_ATTRIBUTE_DECL,
                            SUBMIT_TRIAGE_CASE_DECL,
                        ]
                    }
                ],
            }
        }

        # 2. Connect to Gemini Live API
        print(f"[{_ts()}] Connecting to Gemini ({GEMINI_MODEL})…")
        gemini_ws = await websockets.connect(
            GEMINI_WS_URL,
            max_size=16 * 1024 * 1024,
            close_timeout=5,
        )
        print(f"[{_ts()}] Connected to Gemini")

        # 3. Send setup config
        await gemini_ws.send(json.dumps(gemini_config))
        print(f"[{_ts()}] Config sent to Gemini, waiting for setupComplete…")

        # 4. Wait for setupComplete from Gemini
        setup_response = await asyncio.wait_for(gemini_ws.recv(), timeout=20)
        setup_data = json.loads(setup_response)

        if "setupComplete" not in setup_data:
            print(f"[{_ts()}] ⚠ Unexpected response during setup: {json.dumps(setup_data)[:200]}")
            await client_ws.send(json.dumps({
                "error": "Gemini did not return setupComplete",
                "detail": json.dumps(setup_data)[:300],
            }))
            return

        print(f"[{_ts()}] Gemini setupComplete")

        # 5. Notify the client that setup is complete
        await client_ws.send(json.dumps({
            "setupComplete": True,
            "conversationId": conversation_id,
        }))

        # 6. Bidirectional relay with tool interception
        await asyncio.gather(
            _relay_client_to_gemini(client_ws, gemini_ws),
            _relay_gemini_to_client(gemini_ws, client_ws, session_binding, conversation_id, id_token),
        )

    except websockets.exceptions.ConnectionClosed as e:
        print(f"[{_ts()}] Connection closed: {e.code} {e.reason}")
    except asyncio.TimeoutError:
        print(f"[{_ts()}] Timeout during setup")
        try:
            await client_ws.send(json.dumps({"error": "Setup timeout"}))
        except Exception:
            pass
    except Exception as e:
        print(f"[{_ts()}] Session error: {type(e).__name__}: {e}")
        try:
            await client_ws.send(json.dumps({"error": str(e)}))
        except Exception:
            pass
    finally:
        if gemini_ws:
            try:
                await gemini_ws.close()
            except Exception:
                pass
        print(f"[{_ts()}] Session ended for {client_addr}")


async def _relay_client_to_gemini(client_ws, gemini_ws):
    """Forward messages from the React Native client to Gemini (VisionAlly path)."""
    try:
        async for message in client_ws:
            try:
                parsed = json.loads(message)
                if 'realtimeInput' in parsed:
                    ri = parsed['realtimeInput']
                    if 'audio' in ri:
                        print(f"[{_ts()}] → Gemini: audio chunk")
                    elif 'text' in ri:
                        print(f"[{_ts()}] → Gemini: text: {ri['text'][:80]}")
                    elif 'activityStart' in ri:
                        print(f"[{_ts()}] → Gemini: activityStart")
                    elif 'activityEnd' in ri:
                        print(f"[{_ts()}] → Gemini: activityEnd")
                    else:
                        print(f"[{_ts()}] → Gemini: realtimeInput {list(ri.keys())}")
            except Exception:
                print(f"[{_ts()}] → Gemini: (binary {len(message)} bytes)")
            await gemini_ws.send(message)
    except websockets.exceptions.ConnectionClosed:
        pass


async def _relay_gemini_to_client(gemini_ws, client_ws, session_binding, conversation_id, id_token):
    """Forward messages from Gemini back to the React Native client and handle tool calls."""
    msg_count = 0
    triage_submitted = False

    try:
        async for message in gemini_ws:
            msg_count += 1
            if isinstance(message, bytes):
                message = message.decode('utf-8')
            
            try:
                parsed = json.loads(message)
            except Exception:
                await client_ws.send(message)
                continue

            # ─── Check for Tool Calls from Gemini ──────────────────────────────
            tool_calls = []
            
            # Form 1: Top-level toolCall
            if "toolCall" in parsed:
                calls = parsed["toolCall"].get("functionCalls", [])
                for c in calls:
                    tool_calls.append({
                        "id": c.get("id") or f"call_{int(time.time()*1000)}",
                        "name": c.get("name"),
                        "args": c.get("args") or {},
                    })
            
            # Form 2: serverContent.modelTurn.parts[].functionCall
            sc = parsed.get("serverContent", {})
            mt = sc.get("modelTurn", {})
            parts = mt.get("parts", [])
            for p in parts:
                fc = p.get("functionCall")
                if fc:
                    tool_calls.append({
                        "id": fc.get("id") or f"call_{int(time.time()*1000)}",
                        "name": fc.get("name"),
                        "args": fc.get("args") or {},
                    })

            # Execute any intercepted tool calls
            if tool_calls:
                fn_responses = []
                for call in tool_calls:
                    call_id = call["id"]
                    fn_name = call["name"]
                    fn_args = call["args"]
                    print(f"[{_ts()}] ⚙ ADK Tool Call: {fn_name}({json.dumps(fn_args)[:180]})")

                    if fn_name == "get_clinical_attribute":
                        attr_key = fn_args.get("attribute", "")
                        result = _release_clinical_attribute(session_binding, attr_key)
                        fn_responses.append({
                            "id": call_id,
                            "name": fn_name,
                            "response": {"output": result},
                        })

                    elif fn_name == "submit_triage_case":
                        result = _execute_submit_triage(
                            session_binding, fn_args, conversation_id, id_token
                        )
                        triage_submitted = True
                        
                        fn_responses.append({
                            "id": call_id,
                            "name": fn_name,
                            "response": {"output": {
                                "ok": result.get("ok", False),
                                "case_id": result.get("case_id"),
                                "status": "queued",
                                "message": "Triage assessment submitted successfully to facility queue."
                            }},
                        })

                        # Notify mobile client UI immediately about the submitted case
                        await client_ws.send(json.dumps({
                            "triageSubmitted": True,
                            "caseId": result.get("case_id"),
                            "fallbackFields": result.get("fallback_fields"),
                            "status": "queued",
                            "conversationId": conversation_id,
                            "priority": result.get("priority", "MEDIUM"),
                        }))

                    else:
                        fn_responses.append({
                            "id": call_id,
                            "name": fn_name,
                            "response": {"output": {"error": "unknown_function"}},
                        })

                # Send tool response back to Gemini so it speaks the final confirmation
                tool_response_payload = {
                    "toolResponse": {
                        "functionResponses": fn_responses
                    }
                }
                print(f"[{_ts()}] ↩ Sending toolResponse to Gemini ({len(fn_responses)} response(s))")
                await gemini_ws.send(json.dumps(tool_response_payload))

            # Forward audio/text frames to the client
            await client_ws.send(json.dumps(parsed))

    except websockets.exceptions.ConnectionClosed:
        pass
    print(f"[{_ts()}] Total messages from Gemini: {msg_count}")


# ─── Main ──────────────────────────────────────────────────────────────────────

async def main():
    if not GEMINI_API_KEY:
        print("❌ GEMINI_API_KEY or GEMINI_LIVE_API_KEY not set. Please add it to your .env file.")
        sys.exit(1)

    print(f"\n{'═' * 60}")
    print(f"  NcedoCare — ADK Gemini Live Triage Relay Server")
    print(f"{'═' * 60}")
    print(f"  Time:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Model:   {GEMINI_MODEL}")
    print(f"  API key: {GEMINI_KEY_SOURCE} ({GEMINI_API_KEY[:6]}…{GEMINI_API_KEY[-4:]})")
    print(f"  Listen:  ws://{RELAY_HOST}:{RELAY_PORT}")
    print(f"  Clients connect here and get relayed to Gemini Live API")
    print(f"  Persona: Dr. Ncedo (POPIA-compliant Clinical Triage Agent)")
    print(f"  Tools:   get_clinical_attribute, submit_triage_case")
    print(f"  NOTE:    Standalone server. Run app.py separately for text chat.")
    print(f"{'═' * 60}\n")

    stop = asyncio.get_event_loop().create_future()

    def _shutdown():
        if not stop.done():
            stop.set_result(True)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_event_loop().add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            pass

    async with websockets.serve(
        handle_client,
        RELAY_HOST,
        RELAY_PORT,
        max_size=16 * 1024 * 1024,
        ping_interval=20,
        ping_timeout=20,
    ):
        print(f"[{_ts()}] Server ready — waiting for connections…\n")
        try:
            await stop
        except asyncio.CancelledError:
            pass

    print(f"\n[{_ts()}] Server stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown complete.")
