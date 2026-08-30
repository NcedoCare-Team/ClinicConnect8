// src/services/GeminiLiveService.js
// Same live WebSocket client as VisionAlly (audio only) — NcedoCare triage extras kept.

import * as FileSystem from 'expo-file-system/legacy';

const LIVE_CONFIG = {
  // RELAY_URL: 'ws://YOUR_LOCAL_IP:8765',

  RELAY_URL: 'ws://192.168.68.108:8765',    // <-- Replace with your IP like shown above
};

export function getLiveRelayUrl() {
  return LIVE_CONFIG.RELAY_URL;
}

const OUTPUT_SAMPLE_RATE = 24000;

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

    this.onSetupComplete   = null;
    this.onAudioReady      = null;
    this.onTurnComplete    = null;
    this.onInterrupted     = null;
    this.onTriageSubmitted = null;
    this.onSessionEnded    = null;
    this.onError           = null;
  }

  async connect(config = {}) {
    return new Promise((resolve, reject) => {
      if (this._ws) {
        try { this._ws.close(); } catch { /* ignore */ }
        this._ws = null;
      }

      const relayUrl = getLiveRelayUrl();
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

      this._msgCount = 0;

      this._ws.onmessage = (evt) => {
        this._msgCount++;
        this._msgQueue.push({ raw: evt.data, resolveSetup: resolve });
        if (!this._processingQueue) this._drainQueue();
      };

      this._ws.onerror = (err) => {
        if (settled) return;
        settled = true;
        console.log('[GeminiLive] WS error:', err);
        const e = new Error(`WebSocket error — cannot reach ${relayUrl}. Start: py live_server.py`);
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

    if (msg.setupComplete !== undefined) {
      console.log('[GeminiLive] ✅ setupComplete');
      this._isSetupComplete = true;
      if (this.onSetupComplete) this.onSetupComplete();
      if (resolveSetup) resolveSetup();
      return;
    }

    if (msg.triageSubmitted) {
      console.log('[GeminiLive] 🎯 Triage submitted:', msg.caseId, msg.priority);
      if (this.onTriageSubmitted) this.onTriageSubmitted(msg);
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
    if (!c) return;

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
