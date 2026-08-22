// src/services/GeminiLiveService.js
// ─────────────────────────────────────────────────────────────────────────────
// NcedoCare — Gemini Live Real-Time Voice Consultation Client Service
//
// Features:
//   - Low-latency bidirectional WebSocket connection to Python relay server.
//   - Audio streaming (16kHz PCM input / 24kHz PCM output -> WAV generation).
//   - Text prompting and activity tracking (activityStart, activityEnd).
//   - Triage submission event listener (onTriageSubmitted) for seamless auto-close.
//   - Live transcript events for real-time visual conversation display.
// ─────────────────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system/legacy';
import { API_CONFIG } from './ApiService';

function getRelayUrl() {
  const httpBase = API_CONFIG.BASE_URL; // e.g. "http://192.168.68.105:5000"
  const host = httpBase.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  return `ws://${host}:8765`;
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
    this.onTranscript      = null; // (data: { role: 'ai'|'user', text: string, turnComplete?: boolean }) => void
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

      const relayUrl = getRelayUrl();
      console.log('[GeminiLive] Connecting to relay:', relayUrl);

      try {
        this._ws = new WebSocket(relayUrl);
      } catch (e) {
        reject(e);
        return;
      }

      let settled = false;

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
        this._msgQueue.push({ raw: evt.data, resolveSetup: resolve });
        if (!this._processingQueue) this._drainQueue();
      };

      this._ws.onerror = (err) => {
        if (settled) return;
        settled = true;
        console.log('[GeminiLive] WS error:', err);
        const e = new Error('WebSocket error — verify relay server and internet connection');
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

  sendActivityStart() {
    if (!this.isReady) return;
    this._send({ realtimeInput: { activityStart: {} } });
  }

  sendActivityEnd() {
    if (!this.isReady) return;
    this._send({ realtimeInput: { activityEnd: {} } });
  }

  sendTextPrompt(text) {
    if (!this.isReady) return;
    this._send({
      realtimeInput: {
        text: text,
      },
    });
    if (this.onTranscript) {
      this.onTranscript({ role: 'user', text });
    }
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
    let turnText = '';
    for (const p of parts) {
      if (p.inlineData?.data) {
        const mime = p.inlineData.mimeType || '';
        if (mime.startsWith('audio/')) {
          this._audioBuffer.push(p.inlineData.data);
        }
      }
      if (p.text) {
        turnText += p.text;
      }
    }

    if (turnText && this.onTranscript) {
      this.onTranscript({ role: 'ai', text: turnText });
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
