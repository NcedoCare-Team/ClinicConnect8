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
    with open('system_instruction.txt', 'r') as file:
        system_instruction = file.read()
except FileNotFoundError:
    system_instruction = "You are VisionAlly, Assist users with their requests calmly and guide them professionally"
  
# Model configuration
model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction=system_instruction
)

# Chat sessions storage with title tracking
chat_sessions = {}

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
        
        prompt = f"Based on this safety/GBV conversation, generate a specific title in 2-4 words. Context: {context_for_title}"

        # Title generation system instruction
        title_system_instruction = (
            "You are a concise title generator for safety conversations. "
            "Generate a 2-4 word title that captures the main topic. "
            "Examples: 'Emergency Alert Help', 'Safety Planning Advice', 'Domestic Violence Support'. "
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
            return "Image Analysis"
        elif audio_present:
            return "Voice Message"
        else:
            return user_input.strip()[:30].strip().title() if user_input.strip() else "New Conversation"


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "message": "SafeLink AI Assistant API is running",
        "timestamp": datetime.now().isoformat()
    }), 200

@app.route('/api/chatbot', methods=['POST'])
def chatbot_response():
    start_time = time.time()
    
    try:
        user_input = request.form.get("message", "").strip()
        conversation_id = request.form.get("conversation_id", "")
        audio_file = request.files.get("audio")
        image_file = request.files.get("image")
        
        print(f"\n=== SafeLink Request at {datetime.now().strftime('%H:%M:%S')} ===")
        print(f"Text: {user_input[:50] if user_input else 'None'}...")
        print(f"Audio: {audio_file is not None}, Image: {image_file is not None}")
        print(f"Conversation ID: {conversation_id}")
        
        # Validate input
        if not user_input and not audio_file and not image_file:
            return jsonify({
                "error": "no_input",
                "response": "I didn't receive any message, audio, or image. Please try again.",
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
                        content_parts.insert(0, "Analyze the image and listen to the audio message. Provide safety guidance based on both inputs.")
                    else:
                        content_parts.insert(0, "Please listen and respond to this audio message. Provide safety guidance and support.")
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
        
        # Add text message
        if user_input:
            if image_file and not audio_file:
                content_parts.insert(0, f"User question about the image (safety/GBV context): {user_input}")
            elif not image_file and not audio_file:
                content_parts.append(user_input)
        elif image_file and not audio_file and not user_input:
            content_parts.insert(0, "Please analyze this image in the context of safety and provide guidance if needed.")
        
        print(f"Sending {len(content_parts)} parts to Gemini...")
        
        # Send to Gemini
        response = chat.send_message(
            content=content_parts,
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=2000,
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
                image_file is not None, 
                audio_file is not None
            )
            
            if is_substantive:
                conversation_title = generate_conversation_title(
                    user_input, 
                    response_text, 
                    image_file is not None, 
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
        
        if conversation_id and conversation_id in chat_sessions:
            del chat_sessions[conversation_id]
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

if __name__ == '__main__':
    print(f"\n{'='*60}")
    print(f"VisionAlly AI Assistant Backend Starting")
    print(f"{'='*60}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)