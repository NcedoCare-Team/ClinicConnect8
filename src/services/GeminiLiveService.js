// src/services/GeminiLiveService.js
// ─────────────────────────────────────────────────────────────────────────────
// NcedoCare — Gemini Live Real-Time Voice Consultation Client Service
//
// Features:
//   - Bidirectional WebSocket connection to the standalone Python live relay
//     (models/server/live_server.py, port 8765).
//   - Utterance-based audio input: the full recorded file (WAV on iOS, M4A on
//     Android) is sent with explicit activityStart/activityEnd markers; the
//     relay transcodes it to the raw 16 kHz PCM Gemini Live requires.
//   - 24 kHz PCM audio output buffered per turn -> playable WAV file.
//   - Triage submission event listener (onTriageSubmitted) for seamless auto-close.
// ─────────────────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system/legacy';
import { API_CONFIG } from './ApiService';

export function getLiveRelayUrl() {
  // Same host AND port as the working text chatbot.
  // VisionAlly used ws://<lan-ip>:8765, but Windows Firewall often drops that
  // extra port from the phone while HTTP :5000 already works. Flask now
  // accepts the React Native socket at /live and proxies it to live_server.py
  // on localhost:8765 (same two-process setup, reachable path).
  const httpBase = (API_CONFIG.BASE_URL || '').replace(/\/+$/, '');
  const host = httpBase.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  return `ws://${host}:5000/live`;
}

const OUTPUT_SAMPLE_RATE = 24000; // Gemini Live outputs 24 kHz PCM

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

export class GeminiLiveService {
  constructor() {
    this._ws              = null;
    this._isConnected     = false;
    this._isSetupComplete = false;
    this._audioBuffer     = [];
    this._resumptionToken = null;
    this._msgQueue        = [];
    this._processingQueue = false;

    // Callbacks to configure before or right after instantiating
    this.onSetupComplete   = null; // () => void
    this.onAudioReady      = null; // (wavUri: string) => void
    this.onTurnComplete    = null; // () => void
    this.onInterrupted     = null; // () => void
    this.onTriageSubmitted = null; // (data: { caseId, fallbackFields, conversationId, priority }) => void
    this.onSessionEnded    = null; // (code: number, reason: string) => void
    this.onError           = null; // (error: Error) => void
  }

  /**
   * Connect to the Gemini Live relay server.
   * @param {Object|string} config - Options or custom systemInstruction string
   */
  async connect(config = {}) {
    return new Promise((resolve, reject) => {
      if (this._ws) {
        try { this._ws.close(); } catch { /* ignore */ }
        this._ws = null;
      }

      const relayUrl = getLiveRelayUrl();
      this._relayUrl = relayUrl;
      console.log('[GeminiLive] Connecting to relay:', relayUrl);

      try {
        this._ws = new WebSocket(relayUrl);
      } catch (e) {
        reject(e);
        return;
      }

      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.onError) this.onError(err);
        reject(err);
      };

      const timer = setTimeout(() => {
        fail(new Error(`Timed out connecting to ${relayUrl}. Start both servers: py app.py  and  py live_server.py`));
        try { this._ws?.close(); } catch { /* ignore */ }
      }, 15000);

      const setupPayload = typeof config === 'string'
        ? { systemInstruction: config, voiceName: 'Aoede' }
        : {
            systemInstruction: config.systemInstruction || undefined,
            voiceName: config.voiceName || 'Aoede',
            sessionBinding: config.sessionBinding || {},
            idToken: config.idToken || null,
            conversationId: config.conversationId || undefined,
          };

      this._ws.onopen = () => {
        console.log('[GeminiLive] WS open — sending setup to relay');
        this._isConnected = true;
        this._ws.send(JSON.stringify({
          setup: setupPayload,
        }));
      };

      this._ws.onmessage = (evt) => {
        this._msgQueue.push({
          raw: evt.data,
          resolveSetup: () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
          },
        });
        if (!this._processingQueue) this._drainQueue();
      };

      this._ws.onerror = (err) => {
        console.log('[GeminiLive] WS error:', err, 'url=', relayUrl);
        fail(new Error(`Cannot reach ${relayUrl}. Start both servers: py app.py  and  py live_server.py`));
      };

      this._ws.onclose = (evt) => {
        console.log('[GeminiLive] WS closed:', evt.code, evt.reason);
        this._isConnected     = false;
        this._isSetupComplete = false;
        if (!settled) {
          fail(new Error(`Live connection closed (${evt.code || 'no code'}). Is app.py running, and live_server.py on port 8765?`));
        } else if (evt.code !== 1000 && evt.code !== 1001) {
          if (this.onSessionEnded) this.onSessionEnded(evt.code, evt.reason);
        }
      };
    });
  }

  /**
   * Send one complete spoken utterance to the relay.
   *
   * The relay converts WAV/M4A to the raw 16 kHz PCM Gemini requires.
   * Automatic voice detection is disabled server-side, so every utterance
   * must be framed with explicit activityStart / activityEnd markers.
   *
   * @param {string} b64Audio - base64 of the full recorded file (with container)
   * @param {string} mimeType - 'audio/wav' (iOS) or 'audio/mp4' (Android)
   */
  sendAudioUtterance(b64Audio, mimeType) {
    if (!this.isReady) return;
    this._send({ realtimeInput: { activityStart: {} } });
    this._send({
      realtimeInput: {
        audio: {
          mimeType,
          data: b64Audio,
        },
      },
    });
    this._send({ realtimeInput: { activityEnd: {} } });
  }

  sendClientTurn(text) {
    if (!this.isReady) return;
    this._send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
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
      console.log('[GeminiLive] JSON parse failed:', e.message);
      return;
    }

    // 1. Setup acknowledgment
    if (msg.setupComplete !== undefined) {
      console.log('[GeminiLive] ✅ setupComplete verified');
      this._isSetupComplete = true;
      if (this.onSetupComplete) this.onSetupComplete();
      if (resolveSetup) resolveSetup();
      return;
    }

    // 2. Triage submitted notification from relay server
    if (msg.triageSubmitted) {
      console.log('[GeminiLive] 🎯 Triage submitted event received:', msg.caseId, msg.priority);
      if (this.onTriageSubmitted) {
        this.onTriageSubmitted(msg);
      }
    }

    if (msg.sessionResumptionUpdate?.newHandle) {
      this._resumptionToken = msg.sessionResumptionUpdate.newHandle;
    }

    if (msg.goAway) {
      console.warn('[GeminiLive] GoAway received from Gemini');
      if (this.onSessionEnded) this.onSessionEnded(0, 'GoAway');
      return;
    }

    const c = msg.serverContent;
    if (!c) return;

    if (c.interrupted) {
      console.log('[GeminiLive] Interrupted by user');
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

    // Flush audio as ONE clean WAV on generationComplete
    if (c.generationComplete) {
      if (this._audioBuffer.length > 0) {
        const wavUri = await this._flushToWav();
        if (wavUri && this.onAudioReady) await this.onAudioReady(wavUri);
        this._audioBuffer = [];
      }
    }

    if (c.turnComplete) {
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

      const uri = `${FileSystem.cacheDirectory}live_ai_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(uri, u8ToB64(wav), {
        encoding: FileSystem.EncodingType.Base64,
      });
      return uri;
    } catch (e) {
      console.log('[GeminiLive] _flushToWav error:', e);
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
