# models/server/live_server.py
# ─────────────────────────────────────────────────────────────────────────────
# VisionAlly — Gemini Live API WebSocket Relay Server
#
# Architecture:
#   React Native app  ←WebSocket→  This server  ←WebSocket→  Gemini Live API
#
# The app sends simple JSON messages (audio/video/text).
# This server relays them to Gemini and streams audio responses back.
# The API key never leaves the server.
#
# Usage:
#   pip install websockets google-generativeai python-dotenv
#   python live_server.py
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import json
import base64
import os
import signal
import sys
from datetime import datetime

import websockets

from dotenv import load_dotenv

load_dotenv()

# ─── Configuration ────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_LIVE_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash-native-audio-latest"

GEMINI_WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    f"?key={GEMINI_API_KEY}"
)

RELAY_HOST = "0.0.0.0"
RELAY_PORT = 8765


# ─── Session handler ──────────────────────────────────────────────────────────
async def handle_client(client_ws):
    """Handle a single client WebSocket connection."""
    client_addr = client_ws.remote_address
    print(f"\n[{_ts()}] ✅ Client connected: {client_addr}")

    gemini_ws = None

    try:
        # 1. Wait for the setup message from the client
        raw = await asyncio.wait_for(client_ws.recv(), timeout=15)
        setup_msg = json.loads(raw)

        if "setup" not in setup_msg:
            await client_ws.send(json.dumps({
                "error": "First message must contain a 'setup' key."
            }))
            return

        client_setup = setup_msg["setup"]
        system_instruction = client_setup.get("systemInstruction", "")

        # Build the Gemini setup message per the BidiGenerateContent docs
        # Top-level key must be "setup", generation settings under "generationConfig"
        gemini_config = {
            "setup": {
                "model": f"models/{GEMINI_MODEL}",
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": client_setup.get("voiceName", "Aoede"),
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
            }
        }

        # 2. Connect to Gemini Live API
        print(f"[{_ts()}] Connecting to Gemini ({GEMINI_MODEL})…")
        gemini_ws = await websockets.connect(
            GEMINI_WS_URL,
            max_size=16 * 1024 * 1024,  # 16 MB for audio chunks
            close_timeout=5,
        )
        print(f"[{_ts()}] Connected to Gemini")

        # 3. Send config
        await gemini_ws.send(json.dumps(gemini_config))
        print(f"[{_ts()}] Config sent to Gemini, waiting for setupComplete…")

        # 4. Wait for setupComplete from Gemini
        setup_response = await asyncio.wait_for(gemini_ws.recv(), timeout=15)
        setup_data = json.loads(setup_response)

        if "setupComplete" not in setup_data:
            print(f"[{_ts()}] ⚠ Unexpected first response: {json.dumps(setup_data)[:200]}")
            await client_ws.send(json.dumps({
                "error": "Gemini did not return setupComplete",
                "detail": json.dumps(setup_data)[:300],
            }))
            return

        print(f"[{_ts()}] Gemini setupComplete")

        # 5. Notify the client
        await client_ws.send(json.dumps({"setupComplete": True}))

        # 6. Relay messages bidirectionally
        await asyncio.gather(
            _relay_client_to_gemini(client_ws, gemini_ws),
            _relay_gemini_to_client(gemini_ws, client_ws),
        )

    except websockets.exceptions.ConnectionClosed as e:
        print(f"[{_ts()}] Connection closed: {e.code} {e.reason}")
    except asyncio.TimeoutError:
        print(f"[{_ts()}] Timeout waiting for setup")
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
    """Forward messages from the React Native client to Gemini."""
    try:
        async for message in client_ws:
            try:
                parsed = json.loads(message)
                keys = list(parsed.keys())
                # Log message type without dumping huge audio/video data
                if 'realtimeInput' in parsed:
                    ri = parsed['realtimeInput']
                    if 'audio' in ri:
                        print(f"[{_ts()}] → Gemini: audio chunk")
                    elif 'video' in ri:
                        print(f"[{_ts()}] → Gemini: video frame")
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


async def _relay_gemini_to_client(gemini_ws, client_ws):
    """Forward messages from Gemini back to the React Native client."""
    msg_count = 0
    try:
        async for message in gemini_ws:
            msg_count += 1
            # Gemini may send binary frames — decode to text for the RN client
            if isinstance(message, bytes):
                message = message.decode('utf-8')
            try:
                parsed = json.loads(message)
                sc = parsed.get('serverContent', {})
                mt = sc.get('modelTurn', {})
                parts = mt.get('parts', [])
                has_audio = any(
                    p.get('inlineData', {}).get('mimeType', '').startswith('audio')
                    for p in parts
                )
                has_text = any('text' in p for p in parts)
                turn_complete = sc.get('turnComplete', False)

                if has_audio:
                    print(f"[{_ts()}] ← Gemini #{msg_count}: audio part(s)")
                elif has_text:
                    txt = next((p['text'] for p in parts if 'text' in p), '')
                    print(f"[{_ts()}] ← Gemini #{msg_count}: text: {txt[:80]}")
                elif turn_complete:
                    print(f"[{_ts()}] ← Gemini #{msg_count}: turnComplete")
                else:
                    summary = json.dumps(parsed)[:150]
                    print(f"[{_ts()}] ← Gemini #{msg_count}: {summary}")
            except Exception:
                print(f"[{_ts()}] ← Gemini #{msg_count}: (binary {len(message)} bytes)")
            await client_ws.send(message)
    except websockets.exceptions.ConnectionClosed:
        pass
    print(f"[{_ts()}] Total messages from Gemini: {msg_count}")


def _ts():
    return datetime.now().strftime("%H:%M:%S")


# ─── Main ──────────────────────────────────────────────────────────────────────
async def main():
    if not GEMINI_API_KEY:
        print("❌ GEMINI_API_KEY not set. Add it to .env or set the environment variable.")
        sys.exit(1)

    print(f"\n{'═' * 60}")
    print(f"  VisionAlly — Gemini Live Relay Server")
    print(f"{'═' * 60}")
    print(f"  Time:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Model:   {GEMINI_MODEL}")
    print(f"  Listen:  ws://{RELAY_HOST}:{RELAY_PORT}")
    print(f"  Clients connect here and get relayed to Gemini Live API")
    print(f"{'═' * 60}\n")

    stop = asyncio.get_event_loop().create_future()

    # Graceful shutdown on Ctrl+C
    def _shutdown():
        if not stop.done():
            stop.set_result(True)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_event_loop().add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
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
