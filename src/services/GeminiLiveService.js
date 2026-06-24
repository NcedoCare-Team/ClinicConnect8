// src/services/GeminiLiveService.js
// ─────────────────────────────────────────────────────────────────────────────
// BUGS FIXED IN THIS VERSION:
//
// ROOT CAUSE — ALL prior crashes / "goes back to home" were caused by this:
//
//   The Gemini Live API requires camelCase JSON keys.
//   The previous version sent snake_case throughout, which the API silently
//   rejected. The WebSocket closed immediately, onSessionEnded fired before
//   sessionStartedRef was set to true, so safeGoBack() was called → home.
//
//   Specific snake_case → camelCase fixes:
//     generation_config        → generationConfig
//     response_modalities      → responseModalities
//     speech_config            → speechConfig
//     voice_config             → voiceConfig
//     prebuilt_voice_config    → prebuiltVoiceConfig
//     voice_name               → voiceName
//     system_instruction       → systemInstruction
//     context_window_compression → contextWindowCompression
//     trigger_tokens           → triggerTokens
//     sliding_window           → slidingWindow
//     target_tokens            → targetTokens
//     realtime_input           → realtimeInput
//     media_chunks             → (removed — wrong format entirely)
//     mime_type                → mimeType
//     client_content           → (removed — use realtimeInput.text instead)
//     turn_complete            → turnComplete
//
//   Audio message format was also completely wrong:
//     OLD (broken):  { realtime_input: { media_chunks: [{ mime_type, data }] } }
//     NEW (correct): { realtimeInput: { audio: { mimeType: "audio/pcm", data } } }
//
//   Text message format was also wrong:
//     OLD (broken):  { client_content: { turns: [...], turn_complete: true } }
//     NEW (correct): { realtimeInput: { text: "..." } }
//                    — matches the working geminilive.js reference implementation
//
//   Model name: 'gemini-2.0-flash-exp' is deprecated.
//     Use 'gemini-2.0-flash-live-001' (stable) or check AI Studio for latest.
//
// ─────────────────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system/legacy';
import { API_CONFIG } from './ApiService';

// ─── Config ───────────────────────────────────────────────────────────────────
// Connect to the Python relay server instead of directly to Gemini.
// The relay server handles the Gemini API key and protocol details.
// Derive the WS host from the HTTP API base URL (same server, port 8765).
function getRelayUrl() {
  const httpBase = API_CONFIG.BASE_URL; // e.g. "http://10.150.65.148:5000"
  const host = httpBase.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  return `ws://${host}:8765`;
}

const OUTPUT_SAMPLE_RATE = 24000; // Gemini outputs 24 kHz PCM

// ─── WAV Header ───────────────────────────────────────────────────────────────
function buildWavHeader(pcmLen, sr = OUTPUT_SAMPLE_RATE, ch = 1, bits = 16) {
  const byteRate = sr * ch * (bits / 8);
  const blkAlign = ch * (bits / 8);
  const buf  = new ArrayBuffer(44);
  const v    = new DataView(buf);
  const s    = (off, str) => {
    for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
  };
  s(0, 'RIFF');  v.setUint32(4, 36 + pcmLen, true);
  s(8, 'WAVE');  s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, byteRate, true); v.setUint16(32, blkAlign, true);
  v.setUint16(34, bits, true); s(36, 'data'); v.setUint32(40, pcmLen, true);
  return buf;
}

function b64ToU8(b64) {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function u8ToB64(arr) {
  let s = '';
  arr.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}

// ─── System Instruction Builder ───────────────────────────────────────────────
export function buildSystemInstruction(profile = {}, jobText = '') {
  const {
    firstName     = 'Candidate',
    disability    = 'None disclosed',
    accommodation = '',
    field         = 'General',
    experience    = '0',
    education     = 'Not specified',
    skills        = [],
    careerGoal    = 'Full-time employment',
  } = profile;

  const jobCtx = jobText
    ? `\n\nJob Context:\n${jobText}\nBase technical questions strictly on these requirements.`
    : '\n\nNo specific job provided — use general industry questions.';

  const accNote = accommodation
    ? `\nAccommodation: ${accommodation}. Respect this in pacing and style.`
    : '';

  return `
You are VisionAlly, a senior hiring manager conducting a real job interview. You are NOT a coach right now — you are the person who decides whether this candidate gets hired.

Your personality: Professional, direct, fair but demanding. You have high standards. You value substance over fluff. You respect candidates who give specific, concrete examples.

OPENING (your very first response — TURN 1):
Greet ${firstName} briefly: "Hi ${firstName}, thanks for coming in. I'll be interviewing you today. Let's dive right in."
Then ask Question 1: "Tell me about yourself — what makes you the right fit for a role in ${field}?"

Candidate profile: ${firstName}, ${field} field, ${experience} yr(s) experience, education: ${education}.${accNote}
${jobCtx}

INTERVIEW FLOW (exactly 3 turns):
1. TURN 1: Brief greeting + Q1 (as above).
2. TURN 2: After user answers Q1 — give sharp, honest micro-feedback (1 sentence max), then ask Q2: a challenging follow-up that digs deeper based on what the user actually said. If they were vague, call it out and ask for specifics. If they were strong, push harder.
3. TURN 3: After user answers Q2 — give final feedback on Q2 (1-2 sentences), then a direct closing assessment: "Overall, here's where you stand: [honest 2-sentence verdict on their readiness]. Check your feedback report for details. Good luck."

SCORING MINDSET (internal — this shapes how you respond):
- If the candidate gives generic, rehearsed, or vague answers → be skeptical, push back, score LOW.
- If the candidate provides specific examples, numbers, real achievements → acknowledge it, score HIGHER.
- If the candidate rambles or goes off-topic → redirect firmly.
- A perfect score (90+) requires truly exceptional, convincing answers with proof.
- Average performance = 50-65. Good = 70-80. Excellent = 80-90.
- Do NOT inflate scores to be nice. Be fair but strict.

RULES:
- Keep responses SHORT and punchy — maximum 15 seconds of speaking per turn.
- Sound like a real hiring manager, not an AI assistant.
- NEVER narrate your reasoning or describe what you plan to do.
- NEVER repeat what the candidate said back to them.
- Be respectful but make them earn the job.
- Wait for the user to finish speaking before responding.
`.trim();
}

// ─── GeminiLiveService ────────────────────────────────────────────────────────
export class GeminiLiveService {
  constructor() {
    this._ws              = null;
    this._isConnected     = false;
    this._isSetupComplete = false;
    this._audioBuffer     = [];
    this._resumptionToken = null;
    this._msgQueue        = [];
    this._processingQueue = false;

    // Set these before calling connect()
    this.onSetupComplete = null; // ()
    this.onAudioReady    = null; // (wavUri: string)
    this.onTurnComplete  = null; // ()
    this.onInterrupted   = null; // ()
    this.onSessionEnded  = null; // (code, reason)
    this.onError         = null; // (Error)
  }

  async connect(systemInstruction) {
    return new Promise((resolve, reject) => {
    if (this._ws) {
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }

      const relayUrl = getRelayUrl();
      console.log('[GeminiLive] Connecting to relay:', relayUrl);

      try {
        this._ws = new WebSocket(relayUrl);
      } catch (e) {
        reject(e);
        return;
      }

      let settled = false;

      this._ws.onopen = () => {
        console.log('[GeminiLive] WS open — sending setup to relay');
        this._isConnected = true;

        // Send setup to the Python relay server.
        // The relay injects the API key + model config and forwards to Gemini.
        this._ws.send(JSON.stringify({
          setup: {
            systemInstruction: systemInstruction,
            voiceName: 'Aoede',
          },
        }));
      };

      this._msgCount = 0;

      this._ws.onmessage = (evt) => {
        this._msgCount++;
        // Queue messages and process sequentially to prevent race conditions
        this._msgQueue.push({ raw: evt.data, resolveSetup: resolve });
        if (!this._processingQueue) this._drainQueue();
      };

      this._ws.onerror = (err) => {
        if (settled) return;
        settled = true;
        console.log('[GeminiLive] WS error:', err);
        const e = new Error('WebSocket error — verify API key and internet connection');
        if (this.onError) this.onError(e);
        reject(e);
      };

      this._ws.onclose = (evt) => {
        console.log('[GeminiLive] WS closed:', evt.code, evt.reason);
        this._isConnected     = false;
        this._isSetupComplete = false;
        if (!settled && evt.code !== 1000 && evt.code !== 1001) {
          settled = true;
          if (this.onSessionEnded) this.onSessionEnded(evt.code, evt.reason);
        } else if (evt.code !== 1000 && evt.code !== 1001) {
          if (this.onSessionEnded) this.onSessionEnded(evt.code, evt.reason);
        }
      };
    });
  }

  // ✅ FIXED: correct camelCase format + correct audio field structure
  //    OLD (broken): { realtime_input: { media_chunks: [{ mime_type, data }] } }
  //    NEW (correct): { realtimeInput: { audio: { mimeType, data } } }
  sendAudioChunk(b64Pcm) {
    if (!this.isReady) return;
    this._send({
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: b64Pcm,
        },
      },
    });
  }

  // Manual activity signals for strict turn-taking (auto-detection disabled)
  sendActivityStart() {
    if (!this.isReady) return;
    this._send({ realtimeInput: { activityStart: {} } });
  }

  sendActivityEnd() {
    if (!this.isReady) return;
    this._send({ realtimeInput: { activityEnd: {} } });
  }

  // ✅ FIXED: use realtimeInput.text (matches geminilive.js reference)
  //    OLD (broken): { client_content: { turns: [...], turn_complete: true } }
  //    NEW (correct): { realtimeInput: { text: "..." } }
  sendTextPrompt(text) {
    if (!this.isReady) return;
    this._send({
      realtimeInput: {                               // ✅ was: client_content (wrong key + format)
        text: text,
      },
    });
  }

  // ✅ FIXED: for cases where you need a full turn (e.g. kicking off the interview)
  //    Use clientContent with turnComplete (camelCase) when you need a hard turn boundary.
  sendClientTurn(text) {
    if (!this.isReady) return;
    this._send({
      clientContent: {                               // camelCase ✅
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,                          // camelCase ✅ was: turn_complete
      },
    });
  }

  sendVideoFrame(b64Jpeg) {
    if (!this.isReady) return;
    this._send({
      realtimeInput: {                               // ✅ was: realtime_input
        video: {                                     // ✅ was: media_chunks array (wrong)
          mimeType: 'image/jpeg',                    // ✅ was: mime_type inside chunk object
          data: b64Jpeg,
        },
      },
    });
  }

  disconnect() {
    if (this._ws) {
      try { this._ws.close(1000, 'Session ended by user'); } catch { /* ignore */ }
      this._ws = null;
    }
    this._isConnected = this._isSetupComplete = false;
    this._audioBuffer = [];
    this._msgQueue = [];
    this._processingQueue = false;
  }

  async _drainQueue() {
    this._processingQueue = true;
    while (this._msgQueue.length > 0) {
      const { raw, resolveSetup } = this._msgQueue.shift();
      try {
        await this._handleMessage(raw, resolveSetup);
      } catch (e) {
        console.log('[GeminiLive] _handleMessage error:', e);
      }
    }
    this._processingQueue = false;
  }

  async _handleMessage(raw, resolveSetup) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : await raw.text());
    } catch (e) {
      console.log('[GeminiLive] JSON parse failed:', e.message, 'raw type:', typeof raw, 'raw preview:', String(raw).substring(0, 100));
      return;
    }

    if (msg.setupComplete !== undefined) {
      console.log('[GeminiLive] ✅ setupComplete');
      this._isSetupComplete = true;
      if (this.onSetupComplete) this.onSetupComplete();
      if (resolveSetup)         resolveSetup();
      return;
    }

    if (msg.sessionResumptionUpdate?.newHandle) {
      this._resumptionToken = msg.sessionResumptionUpdate.newHandle;
    }

    if (msg.goAway) {
      console.warn('[GeminiLive] GoAway received');
      if (this.onSessionEnded) this.onSessionEnded(0, 'GoAway');
      return;
    }

    const c = msg.serverContent;
    if (!c) {
      console.log('[GeminiLive] non-serverContent msg keys:', Object.keys(msg));
      return;
    }

    if (c.interrupted) {
      console.log('[GeminiLive] interrupted');
      this._audioBuffer = [];
      if (this.onInterrupted) this.onInterrupted();
      return;
    }

    const parts = c.modelTurn?.parts ?? [];
    for (const p of parts) {
      if (p.inlineData?.data) {
        const mime = p.inlineData.mimeType || '';
        if (mime.startsWith('audio/')) {
          this._audioBuffer.push(p.inlineData.data);
        }
      }
    }

    // Flush ALL audio as ONE WAV at generationComplete (eliminates crackling)
    if (c.generationComplete) {
      if (this._audioBuffer.length > 0) {
        const wavUri = await this._flushToWav();
        if (wavUri && this.onAudioReady) await this.onAudioReady(wavUri);
        this._audioBuffer = [];
      }
    }

    if (c.turnComplete) {
      console.log('[GeminiLive] turnComplete, remaining chunks:', this._audioBuffer.length);
      // Safety net — flush any audio that arrived after generationComplete
      if (this._audioBuffer.length > 0) {
        const wavUri = await this._flushToWav();
        if (wavUri && this.onAudioReady) await this.onAudioReady(wavUri);
        this._audioBuffer = [];
      }
      if (this.onTurnComplete) this.onTurnComplete();
    }
  }

  async _flushToWav() {
    try {
      const chunks = this._audioBuffer.map(b => b64ToU8(b));
      const total  = chunks.reduce((s, a) => s + a.length, 0);
      const pcm    = new Uint8Array(total);
      let   off    = 0;
      chunks.forEach(c => { pcm.set(c, off); off += c.length; });

      const hdr = new Uint8Array(buildWavHeader(pcm.length));
      const wav = new Uint8Array(hdr.length + pcm.length);
      wav.set(hdr, 0);
      wav.set(pcm, hdr.length);

      const uri = `${FileSystem.cacheDirectory}va_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(uri, u8ToB64(wav), {
        encoding: FileSystem.EncodingType.Base64,
      });
      return uri;
    } catch (e) {
      console.log('[GeminiLive] _flushToWav:', e);
      return null;
    }
  }

  _send(payload) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      try { this._ws.send(JSON.stringify(payload)); } catch (e) {
        console.log('[GeminiLive] _send error:', e);
      }
    }
  }

  get isReady() { return this._isConnected && this._isSetupComplete; }
  get resumptionToken() { return this._resumptionToken; }
}

// ─── Document Analyser ────────────────────────────────────────────────────────
export async function analyseJobDocument(base64Data, mimeType) {
  // Route through the Flask server so the API key stays server-side
  const url = `${API_CONFIG.BASE_URL}/api/analyse_document`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: base64Data, mimeType }),
  });
  const json = await res.json();
  return json.text ?? '';
}