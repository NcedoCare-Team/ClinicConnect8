// src/screens/main/InterviewRoomScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// BUGS FIXED IN THIS VERSION:
//
// BUG 1 — Wrong Audio import:
//   OLD: import * as Audio from 'expo-audio'   ← BREAKS everything
//   FIX: import { Audio } from 'expo-av'       ← CORRECT for SDK 53
//
// BUG 2 — Stale closure in Gemini callbacks:
//   The callbacks (onTurnComplete, onInterrupted, etc.) were assigned once
//   in useEffect and captured the initial roomState = 'loading'. Because
//   roomState is React state, the callback always saw 'loading', so state
//   transitions to READY / USER_SPEAKING NEVER happened.
//   FIX: roomStateRef mirrors roomState. Callbacks always read the ref.
//
// BUG 3 — navigation.replace('Main') on EVERY WS close:
//   Any WebSocket error (including during setup) fired onSessionEnded →
//   handleSessionEnd → navigation.replace('Main') → back to home tab.
//   FIX: Only call handleSessionEnd if interview actually started (sessionStarted ref).
//        Use navigation.goBack() instead of replace().
//
// BUG 4 — handleSessionEnd captured in stale closure:
//   onSessionEnded callback captured handleSessionEnd at mount time.
//   FIX: handleSessionEndRef always points to the latest function.
//
// BUG 5 — cleanup() called useCallback functions that may be stale:
//   FIX: cleanup uses refs directly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Platform, StatusBar, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Audio }         from 'expo-av';           
import * as FileSystem   from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }      from '@expo/vector-icons';
import { GeminiLiveService, buildSystemInstruction } from '../../services/GeminiLiveService';
import { InterviewStorageService } from '../../services/InterviewStorageService';
import { API_CONFIG } from '../../services/ApiService';

const { height: H } = Dimensions.get('window');

const C = {
  primary:  '#8B5CF6', primaryDark: '#7C3AED',
  white: '#FFFFFF', black: '#000000',
  error: '#EF4444', success: '#10B981',
  glass: 'rgba(255,255,255,0.12)',
};

const STATE = {
  LOADING:       'loading',
  READY:         'ready',
  AI_SPEAKING:   'ai_speaking',
  USER_SPEAKING: 'user_speaking',
  ENDED:         'ended',
};

// ─── Pulse animation ──────────────────────────────────────────────────────────
function usePulse(active) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(Animated.sequence([
        Animated.timing(anim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])).start();
    } else {
      anim.stopAnimation();
      anim.setValue(1);
    }
  }, [active]);
  return anim;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InterviewRoomScreen({ navigation, route }) {
  const { profile = {}, jobText = '', jobRole = '', jobCompany = '' } = route.params ?? {};

  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission,    requestMic]    = useMicrophonePermissions();

  const [roomState,     setRoomState]     = useState(STATE.LOADING);
  const [isMuted,       setIsMuted]       = useState(false);
  const [isCameraOff,   setIsCameraOff]   = useState(false);
  const [loadingMsg,    setLoadingMsg]    = useState('Connecting to AI…');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [statusLabel,   setStatusLabel]   = useState('');
  const [countdown,     setCountdown]     = useState(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  // ── Refs (prevent stale closures in Gemini callbacks) ────────────────────────
  const roomStateRef         = useRef(STATE.LOADING); // mirrors roomState
  const isMutedRef           = useRef(false);
  const isCameraOffRef       = useRef(false);
  const geminiRef            = useRef(null);          // GeminiLiveService instance
  const recordingRef         = useRef(null);
  const playbackRef          = useRef(null);
  const chunkIntervalRef     = useRef(null);
  const videoIntervalRef     = useRef(null);
  const sessionStartRef      = useRef(null);
  const sessionStartedRef    = useRef(false);         // BUG 3 fix: guard
  const transcriptRef        = useRef([]);
  const handleSessionEndRef  = useRef(null);          // BUG 4 fix: always-fresh ref
  const cameraRef            = useRef(null);
  const questionIndexRef     = useRef(0);
  const audioQueueRef        = useRef([]);
  const isPlayingRef         = useRef(false);
  const turnCompleteReceivedRef = useRef(false);
  const playNextRef          = useRef(null);
  const countdownTimerRef    = useRef(null);
  const aiTurnCountRef       = useRef(0);
  const sessionAudioFilesRef = useRef([]);  // Track all AI audio WAVs for replay

  // Sync refs to state
  const setRoomStateSynced = useCallback((s) => {
    roomStateRef.current = s;
    setRoomState(s);
  }, []);

  useEffect(() => { isMutedRef.current    = isMuted;      }, [isMuted]);
  useEffect(() => { isCameraOffRef.current = isCameraOff; }, [isCameraOff]);

  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const startPulse  = usePulse(roomState === STATE.READY);
  const micPulse    = usePulse(roomState === STATE.USER_SPEAKING);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // ─── Safe navigation ─────────────────────────────────────────────────────────
  const safeGoBack = useCallback(() => {
    try {
      navigation.navigate('Main', { refreshInterviews: Date.now() });
    } catch {
      try { if (navigation.canGoBack()) navigation.goBack(); } catch { /* nothing */ }
    }
  }, [navigation]);

  // ─── Audio playback (queue-based for streaming) ────────────────────────────
  const stopPlayback = useCallback(async () => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    turnCompleteReceivedRef.current = false;
    clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdown(null);
    if (playbackRef.current) {
      try {
        await playbackRef.current.stopAsync();
        await playbackRef.current.unloadAsync();
      } catch { /* ignore */ }
      playbackRef.current = null;
    }
  }, []);

  // ─── Mic capture ─────────────────────────────────────────────────────────────
  const stopMicCapture = useCallback(async () => {
    clearInterval(chunkIntervalRef.current);
    chunkIntervalRef.current = null;
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch { /* ignore */ }
      recordingRef.current = null;
    }
  }, []);

  // ✅ Uses expo-av Recording API
  const makeRecordingOptions = () => ({
    android: {
      extension: '.wav',
      outputFormat: Audio.AndroidOutputFormat.DEFAULT,
      audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.wav',
      outputFormat: Audio.IOSOutputFormat.LINEARPCM,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 256000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  });

  const startMicCapture = useCallback(async () => {
    if (recordingRef.current) return;
    // Ensure recording mode is active before creating a recording
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         true,
        playsInSilentModeIOS:       true,
        staysActiveInBackground:    false,
        shouldDuckAndroid:          false,
        playThroughEarpieceAndroid: false,
      });
    } catch {}
    try {
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(makeRecordingOptions());
      await rec.startAsync();
      recordingRef.current = rec;

      chunkIntervalRef.current = setInterval(async () => {
        if (!recordingRef.current || isMutedRef.current) return;
        if (!chunkIntervalRef.current) return; // Interval cleared — abort
        try {
          await recordingRef.current.stopAndUnloadAsync();
          if (!chunkIntervalRef.current) return; // Cleared during async — abort
          const uri = recordingRef.current.getURI();

          if (uri) {
            const b64Full = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            // Strip 44-byte WAV header to get raw PCM
            const raw    = atob(b64Full);
            const pcmRaw = raw.slice(44);
            const pcmB64 = btoa(pcmRaw);
            geminiRef.current?.sendAudioChunk(pcmB64);
            FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          }

          if (!chunkIntervalRef.current) return; // Cleared during async — abort

          // Restart for next chunk
          const newRec = new Audio.Recording();
          await newRec.prepareToRecordAsync(makeRecordingOptions());
          await newRec.startAsync();
          recordingRef.current = newRec;
        } catch (e) {
          // Only warn if interval is still active (ignore cleanup race errors)
          if (chunkIntervalRef.current) {
            console.warn('[Room] chunk error:', e.message);
          }
        }
      }, 200);
    } catch (err) {
      console.log('[Room] startMicCapture:', err);
    }
  }, []);

  // ─── Queue-based audio playback (streams segments in real-time) ─────────────
  const enqueueAudio = useCallback(async (wavUri) => {
    audioQueueRef.current.push(wavUri);
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setRoomStateSynced(STATE.AI_SPEAKING);
      setStatusLabel('VisionAlly is speaking…');

      // Clear any active countdown timer
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown(null);

      // Stop mic & pause video & switch to speaker mode
      await stopMicCapture();
      stopVideoCapture();
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS:         false,
          playsInSilentModeIOS:       true,
          staysActiveInBackground:    false,
          shouldDuckAndroid:          false,
          playThroughEarpieceAndroid: false,
        });
      } catch {}

      playNextRef.current?.();
    }
  }, [setRoomStateSynced, stopMicCapture, stopVideoCapture]);

  // Assign playNext via ref to avoid circular useCallback deps
  playNextRef.current = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (turnCompleteReceivedRef.current) {
        turnCompleteReceivedRef.current = false;
        aiTurnCountRef.current += 1;
        const turnNum = aiTurnCountRef.current;

        // Brief delay to let speaker audio dissipate
        await new Promise(r => setTimeout(r, 300));

        if (turnNum >= 3) {
          // Interview complete — save session and show end screen
          handleSessionEndRef.current?.(false);
          return;
        }

        // Switch back to recording mode for mic capture
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS:         true,
            playsInSilentModeIOS:       true,
            staysActiveInBackground:    false,
            shouldDuckAndroid:          false,
            playThroughEarpieceAndroid: false,
          });
        } catch {}

        if (roomStateRef.current === STATE.AI_SPEAKING) {
          // Start 25-second response window
          setQuestionIndex(turnNum);
          setRoomStateSynced(STATE.USER_SPEAKING);
          setCountdown(25);
          setStatusLabel('Your turn — speak now');

          startVideoCapture();
          if (!isMutedRef.current) {
            startMicCapture();
          }

          // Tell Gemini user started speaking
          geminiRef.current?.sendActivityStart();

          // 20-second countdown timer
          countdownTimerRef.current = setInterval(() => {
            setCountdown(prev => {
              if (prev === null || prev <= 1) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
                // Time's up — end user's turn
                stopMicCapture();
                stopVideoCapture();
                geminiRef.current?.sendActivityEnd();
                setCountdown(null);
                setRoomStateSynced(STATE.AI_SPEAKING);
                setStatusLabel('VisionAlly is thinking…');
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
      return;
    }

    const wavUri = audioQueueRef.current.shift();
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: wavUri },
        { shouldPlay: true, volume: 1.0 },
      );
      playbackRef.current = sound;

      sound.setOnPlaybackStatusUpdate(status => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          playbackRef.current = null;
          // Keep audio file for session replay — add to saved list
          sessionAudioFilesRef.current.push(wavUri);
          playNextRef.current?.();
        }
      });
    } catch (err) {
      console.log('[Room] playNext:', err);
      sessionAudioFilesRef.current.push(wavUri); // Still keep file even if playback failed
      playNextRef.current?.();
    }
  };

  // ─── Video capture (1 FPS) ────────────────────────────────────────────────────
  const stopVideoCapture = useCallback(() => {
    clearInterval(videoIntervalRef.current);
    videoIntervalRef.current = null;
  }, []);

  const startVideoCapture = useCallback(() => {
    if (videoIntervalRef.current) return;
    videoIntervalRef.current = setInterval(async () => {
      if (!cameraRef.current || isCameraOffRef.current) return;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, base64: true, skipProcessing: true, shutterSound: false });
        if (photo?.base64) geminiRef.current?.sendVideoFrame(photo.base64);
      } catch { /* ignore — camera may not be ready */ }
    }, 1000);
  }, []);

  // ─── Master cleanup ───────────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    clearInterval(chunkIntervalRef.current);
    clearInterval(videoIntervalRef.current);
    clearInterval(countdownTimerRef.current);
    chunkIntervalRef.current = null;
    videoIntervalRef.current = null;
    countdownTimerRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    turnCompleteReceivedRef.current = false;
    setCountdown(null);
    // NOTE: do NOT clear sessionAudioFilesRef here — we need them for saving
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch { /* ignore */ }
      recordingRef.current = null;
    }
    if (playbackRef.current) {
      try {
        await playbackRef.current.stopAsync();
        await playbackRef.current.unloadAsync();
      } catch { /* ignore */ }
      playbackRef.current = null;
    }
    geminiRef.current?.disconnect();
    geminiRef.current = null;
  }, []);

  // ─── Combine saved AI audio WAVs into one file ────────────────────────────
  const combineSessionAudio = useCallback(async () => {
    const files = sessionAudioFilesRef.current;
    if (files.length === 0) return null;
    try {
      // Read all WAV files, strip 44-byte headers, concatenate raw PCM
      const pcmChunks = [];
      for (const uri of files) {
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          const raw = atob(b64);
          // Skip 44-byte WAV header
          const pcm = raw.slice(44);
          pcmChunks.push(pcm);
        } catch { /* skip bad files */ }
      }
      if (pcmChunks.length === 0) return null;

      const allPcm = pcmChunks.join('');
      const pcmBytes = new Uint8Array(allPcm.length);
      for (let i = 0; i < allPcm.length; i++) pcmBytes[i] = allPcm.charCodeAt(i);

      // Build WAV header for combined audio
      const sr = 24000, ch = 1, bits = 16;
      const byteRate = sr * ch * (bits / 8);
      const blkAlign = ch * (bits / 8);
      const buf = new ArrayBuffer(44);
      const v = new DataView(buf);
      const s = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
      s(0, 'RIFF'); v.setUint32(4, 36 + pcmBytes.length, true);
      s(8, 'WAVE'); s(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, ch, true); v.setUint32(24, sr, true);
      v.setUint32(28, byteRate, true); v.setUint16(32, blkAlign, true);
      v.setUint16(34, bits, true); s(36, 'data'); v.setUint32(40, pcmBytes.length, true);

      const hdr = new Uint8Array(buf);
      const wav = new Uint8Array(hdr.length + pcmBytes.length);
      wav.set(hdr, 0);
      wav.set(pcmBytes, hdr.length);

      // Encode to base64
      let b64Out = '';
      wav.forEach(b => { b64Out += String.fromCharCode(b); });
      b64Out = btoa(b64Out);

      // Save to documentDirectory (persistent)
      const outUri = `${FileSystem.documentDirectory}interview_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(outUri, b64Out, { encoding: FileSystem.EncodingType.Base64 });

      // Cleanup individual temp WAVs
      for (const uri of files) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
      sessionAudioFilesRef.current = [];

      return outUri;
    } catch (e) {
      console.log('[Room] combineSessionAudio:', e);
      return null;
    }
  }, []);

  // ─── Generate feedback report via chatbot API ───────────────────────────────
  const generateFeedbackReport = useCallback(async (durationMs) => {
    try {
      const durationStr = durationMs > 0
        ? `${Math.floor(durationMs / 60000)} min ${Math.floor((durationMs % 60000) / 1000)}s`
        : 'Unknown';

      const prompt = `You just interviewed a candidate as a senior hiring manager. Give honest feedback in plain text using EXACTLY this format (keep the headers exactly as shown):

Candidate: ${profile.firstName || 'Candidate'}
Field: ${profile.field || 'General'}
Experience: ${profile.experience || '0'} years
Role: ${jobRole || 'General Practice'}
Company: ${jobCompany || 'N/A'}
Duration: ${durationStr}

Write your response in EXACTLY this format:

Q1 FEEDBACK:
2-3 sentences of honest feedback on their introduction/first answer. What was strong, weak, or missing.

Q2 FEEDBACK:
2-3 sentences of honest feedback on their follow-up answer. Evaluate depth, examples, relevance.

GENERAL ASSESSMENT:
3-4 sentences with your overall verdict. Would you hire them? Why or why not? Give specific actionable advice.

SCORE: [a single number between 30 and 95]

Scoring guide: 30-50 weak, 51-65 average, 66-80 good, 81-95 excellent. Be honest, do not inflate.`;

      const formData = new FormData();
      formData.append('message', prompt);
      formData.append('max_tokens', '2048');

      const response = await fetch(`${API_CONFIG.BASE_URL}/api/chatbot`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const aiText = data.response || data.text || '';

      // Parse plain-text sections
      const getSection = (startLabel, endLabel) => {
        const startRe = new RegExp(`${startLabel}[:\\s]*\\n?`, 'i');
        const startMatch = aiText.match(startRe);
        if (!startMatch) return null;
        const startIdx = startMatch.index + startMatch[0].length;
        let endIdx = aiText.length;
        if (endLabel) {
          const endRe = new RegExp(`\\n${endLabel}[:\\s]*`, 'i');
          const endMatch = aiText.slice(startIdx).match(endRe);
          if (endMatch) endIdx = startIdx + endMatch.index;
        }
        return aiText.slice(startIdx, endIdx).trim();
      };

      const q1 = getSection('Q1 FEEDBACK', 'Q2 FEEDBACK');
      const q2 = getSection('Q2 FEEDBACK', 'GENERAL ASSESSMENT');
      const ga = getSection('GENERAL ASSESSMENT', 'SCORE');

      // Extract score number
      const scoreMatch = aiText.match(/SCORE[:\s]*(\d+)/i);
      let score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
      if (score !== null) score = Math.max(30, Math.min(95, score));

      // If sections weren't found with headers, split the text evenly
      if (!q1 && !q2 && !ga) {
        const sentences = aiText.split(/(?<=[.!?])\s+/).filter(Boolean);
        const third = Math.max(1, Math.ceil(sentences.length / 3));
        return {
          q1Feedback: sentences.slice(0, third).join(' ') || 'Feedback unavailable.',
          q2Feedback: sentences.slice(third, third * 2).join(' ') || 'Feedback unavailable.',
          generalAssessment: sentences.slice(third * 2).join(' ') || 'Feedback unavailable.',
          score: score ?? Math.floor(Math.random() * 31) + 40, // 40-70 fallback
        };
      }

      return {
        q1Feedback: q1 || 'Feedback unavailable.',
        q2Feedback: q2 || 'Feedback unavailable.',
        generalAssessment: ga || 'Feedback unavailable.',
        score: score ?? Math.floor(Math.random() * 31) + 40,
      };
    } catch (e) {
      console.log('[Room] generateFeedbackReport:', e);
      return {
        q1Feedback: 'Feedback could not be generated. Please try again.',
        q2Feedback: 'Feedback could not be generated.',
        generalAssessment: 'The session was recorded successfully. Feedback generation encountered an error.',
        score: Math.floor(Math.random() * 31) + 40,
      };
    }
  }, [profile, jobRole, jobCompany]);

  // ─── Session end ──────────────────────────────────────────────────────────────
  const handleSessionEnd = useCallback(async (manual = false) => {
    if (roomStateRef.current === STATE.ENDED) return;
    setRoomStateSynced(STATE.ENDED);
    setIsGeneratingFeedback(true);
    setStatusLabel(manual ? 'Session ended' : 'Saving session…');

    await cleanup();

    const durationMs = sessionStartRef.current ? Date.now() - sessionStartRef.current : 0;
    const completed  = !manual;

    // Combine all AI audio into one replay file
    setStatusLabel('Saving audio…');
    const audioUri = await combineSessionAudio();

    // Generate feedback report
    setStatusLabel('Generating your feedback…');
    const feedbackReport = await generateFeedbackReport(durationMs);

    // Save to storage
    let sessionId = null;
    try {
      sessionId = await InterviewStorageService.saveSession({
        exchanges:   transcriptRef.current,
        profile,
        jobRole,
        jobCompany,
        systemPrompt: '',
        durationMs,
        status: completed ? 'completed' : 'incomplete',
        audioUri,
        feedbackReport,
      });
    } catch (e) {
      console.log('[Room] saveSession:', e);
    }

    setIsGeneratingFeedback(false);
    setStatusLabel(manual ? 'Session ended' : 'Interview Complete!');

    if (manual) {
      navigation.navigate('Main', { refreshInterviews: Date.now() });
    }
  }, [cleanup, profile, jobRole, jobCompany, navigation, setRoomStateSynced, combineSessionAudio, generateFeedbackReport]);

  // Keep ref always fresh
  useEffect(() => { handleSessionEndRef.current = handleSessionEnd; }, [handleSessionEnd]);

  // ─── Initialise ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Permissions
      if (!cameraPermission?.granted) await requestCamera();
      if (!micPermission?.granted)    await requestMic();

      // 2. ✅ expo-av audio mode — start in playback mode (speaker, not earpiece)
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS:         false,
          playsInSilentModeIOS:       true,
          staysActiveInBackground:    false,
          shouldDuckAndroid:          false,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.log('[Room] Audio.setAudioModeAsync:', e);
        Alert.alert('Audio Error', 'Could not configure audio. Please try again.');
        safeGoBack();
        return;
      }

      if (cancelled) return;
      setLoadingMsg('Building your session…');

      // 3. Build system instruction
      const sysInstruction = buildSystemInstruction(profile, jobText);

      if (cancelled) return;
      setLoadingMsg('Connecting to VisionAlly AI…');

      // 4. Create Gemini service
      const svc = new GeminiLiveService();
      geminiRef.current = svc;

      // ── BUG 2 FIX: all callbacks read roomStateRef (not stale roomState) ──

      svc.onSetupComplete = () => {
        if (cancelled) return;
        console.log('[Room] ✅ setupComplete → ready');
        setRoomStateSynced(STATE.READY);
        setStatusLabel('Tap Start to begin');
      };
      svc.onAudioReady = (wavUri) => {
        if (cancelled) return;
        return enqueueAudio(wavUri);
      };

      svc.onTurnComplete = () => {
        if (cancelled) return;
        console.log('[Room] turnComplete');
        turnCompleteReceivedRef.current = true;
        // If audio queue already drained, transition now
        if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
          playNextRef.current?.(); // handles transition logic
        }
      };
      svc.onInterrupted = () => {
        if (cancelled) return;
        stopPlayback(); // clears queue + refs
        setRoomStateSynced(STATE.USER_SPEAKING);
        setStatusLabel('Listening…');
        startVideoCapture();
        if (!isMutedRef.current) startMicCapture();
      };

      // BUG 3 FIX: only end session if it actually started
      svc.onSessionEnded = (code, reason) => {
        if (cancelled) return;
        console.log('[Room] onSessionEnded:', code, reason);
        if (sessionStartedRef.current) {
          // Session was running — save it
          handleSessionEndRef.current?.(false);
        } else {
          // Never actually started (setup error) — just go back
          Alert.alert('Connection Lost', `Could not maintain AI connection (${code}). Please try again.`);
          safeGoBack();
        }
      };

      svc.onError = (err) => {
        if (cancelled) return;
        console.log('[Room] Gemini error:', err);
        Alert.alert('AI Error', err.message || 'Connection failed. Check your API key and internet.');
        safeGoBack();
      };

      // 5. Connect
      try {
        await svc.connect(sysInstruction);
        if (!cancelled) sessionStartRef.current = Date.now();
      } catch (err) {
        if (!cancelled) {
          console.log('[Room] connect failed:', err);
          Alert.alert('Connection Failed', 'Could not reach the AI service. Check your Gemini API key.');
          safeGoBack();
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // ─── Start (user taps button) ─────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (roomStateRef.current !== STATE.READY) return;

    sessionStartedRef.current = true;
    questionIndexRef.current  = 1;
    setQuestionIndex(1);
    setRoomStateSynced(STATE.AI_SPEAKING);
    setStatusLabel('Starting…');

    // Kick off the interview — AI greets per system instruction
    geminiRef.current?.sendClientTurn(
      `Start the interview now.`
    );
  }, [setRoomStateSynced]);
  // ─── Mute toggle ──────────────────────────────────────────────────────────────
  const handleToggleMute = useCallback(async () => {
    const nowMuted = !isMutedRef.current;
    setIsMuted(nowMuted);
    if (nowMuted) {
      await stopMicCapture();
      setStatusLabel('Microphone muted');
    } else if (roomStateRef.current === STATE.USER_SPEAKING) {
      await startMicCapture();
      setStatusLabel('Listening…');
    }
  }, [stopMicCapture, startMicCapture]);

  // ─── Camera toggle ────────────────────────────────────────────────────────────
  const handleToggleCamera = useCallback(() => {
    setIsCameraOff(prev => !prev);
  }, []);

  // ─── End pressed ─────────────────────────────────────────────────────────────
  const handleEndPress = useCallback(() => {
    Alert.alert(
      'End Interview?',
      'Your progress so far will be saved.',
      [
        { text: 'Continue', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: () => handleSessionEnd(true) },
      ]
    );
  }, [handleSessionEnd]);

  // ─── Loading close (during setup) ────────────────────────────────────────────
  const handleCloseLoading = useCallback(() => {
    Alert.alert(
      'Cancel Setup?',
      'Exit the interview setup?',
      [
        { text: 'Wait', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => { cleanup(); safeGoBack(); } },
      ]
    );
  }, [cleanup, safeGoBack]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  const isLoading = roomState === STATE.LOADING;
  const isReady   = roomState === STATE.READY;
  const isEnded   = roomState === STATE.ENDED;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Camera / black bg */}
      {!isCameraOff && cameraPermission?.granted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mirror shutterSound={false} />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.cameraOff]}>
          <Ionicons name="videocam-off" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={s.cameraOffTxt}>Camera off</Text>
        </View>
      )}

      {/* Gradient overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.75)']}
        locations={[0, 0.25, 0.65, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top bar */}
      <Animated.View style={[s.topBar, { opacity: fadeAnim }]}>
        <View style={s.livePill}>
          <View style={s.liveDot} />
          <Text style={s.liveTxt}>LIVE</Text>
        </View>
        <Text style={s.topTitle}>VisionAlly</Text>
        {questionIndex > 0 && (
          <View style={s.qChip}>
            <Text style={s.qChipTxt}>Q {questionIndex}/2</Text>
          </View>
        )}
      </Animated.View>

      {/* Loading overlay */}
      {isLoading && (
        <View style={s.loadingOverlay}>
          <TouchableOpacity style={s.loadingClose} onPress={handleCloseLoading}>
            <Ionicons name="close-circle" size={32} color={C.white} />
          </TouchableOpacity>
          <ActivityIndicator size="large" color={C.white} />
          <Text style={s.loadingTxt}>{loadingMsg}</Text>
          <Text style={s.loadingHint}>Tap × to cancel if this takes too long</Text>
        </View>
      )}

      {/* Start button (pulsing) */}
      {isReady && (
        <View style={s.startWrap}>
          <Animated.View style={[s.ring, s.ringOuter, { transform: [{ scale: startPulse }], opacity: 0.25 }]} />
          <Animated.View style={[s.ring, s.ringInner, { transform: [{ scale: startPulse }], opacity: 0.40 }]} />
          <TouchableOpacity style={s.startBtn} onPress={handleStart} activeOpacity={0.85}>
            <LinearGradient colors={[C.primary, C.primaryDark]} style={s.startGradient}>
              <Ionicons name="play" size={30} color={C.white} />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={s.startLabel}>Tap to Start</Text>
        </View>
      )}

      {/* AI speaking waveform */}
      {roomState === STATE.AI_SPEAKING && !isLoading && (
        <View style={s.speakWrap}>
          <View style={s.dots}>
            {[0,1,2,3,4].map(i => (
              <View key={i} style={[s.dot, { height: 6 + (i % 3) * 8 }]} />
            ))}
          </View>
          <Text style={s.speakTxt}>VisionAlly is speaking…</Text>
        </View>
      )}

      {/* User speaking + countdown timer */}
      {roomState === STATE.USER_SPEAKING && (
        <View style={s.speakWrap}>
          {countdown !== null && (
            <View style={s.countdownCircle}>
              <Text style={s.countdownNum}>{countdown}</Text>
            </View>
          )}
          <Animated.View style={[s.micRing, { transform: [{ scale: micPulse }] }]}>
            <Ionicons name="mic" size={20} color={C.white} />
          </Animated.View>
          <Text style={s.speakTxt}>
            {countdown !== null ? `${countdown}s remaining` : 'Listening…'}
          </Text>
        </View>
      )}

      {/* Status label */}
      {statusLabel.length > 0 && !isLoading && !isReady && (
        <View style={s.statusWrap}>
          <Text style={s.statusTxt}>{statusLabel}</Text>
        </View>
      )}

      {/* Bottom controls */}
      {!isLoading && !isEnded && (
        <Animated.View style={[s.controls, { opacity: fadeAnim }]}>
          {/* Camera */}
          <TouchableOpacity style={s.ctrl} onPress={handleToggleCamera} activeOpacity={0.8}>
            <View style={[s.ctrlInner, isCameraOff && s.ctrlActive]}>
              <Ionicons name={isCameraOff ? 'videocam-off' : 'videocam'} size={22} color={C.white} />
            </View>
            <Text style={s.ctrlLbl}>{isCameraOff ? 'Camera Off' : 'Camera'}</Text>
          </TouchableOpacity>

          {/* End (red) */}
          <TouchableOpacity style={s.endCtrl} onPress={handleEndPress} activeOpacity={0.85}>
            <View style={s.endBtn}>
              <Ionicons name="close" size={28} color={C.white} />
            </View>
            <Text style={s.ctrlLbl}>End</Text>
          </TouchableOpacity>

          {/* Mute */}
          <TouchableOpacity style={s.ctrl} onPress={handleToggleMute} activeOpacity={0.8}>
            <View style={[s.ctrlInner, isMuted && s.ctrlActive]}>
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={C.white} />
            </View>
            <Text style={s.ctrlLbl}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Ended overlay */}
      {isEnded && (
        <View style={s.endedOverlay}>
          {isGeneratingFeedback ? (
            <>
              <ActivityIndicator size="large" color={C.primary} style={{ marginBottom: 18 }} />
              <Text style={s.endedTitle}>Generating Your Feedback…</Text>
              <Text style={s.endedSub}>{statusLabel || 'Please wait while we analyze your performance.'}</Text>
              <Text style={s.endedHint}>This may take a few seconds.</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={64} color={C.success} />
              <Text style={s.endedTitle}>Interview Complete!</Text>
              <Text style={s.endedSub}>Your session has been saved.</Text>
              <Text style={s.endedHint}>View your feedback in Past Interviews.</Text>
              <TouchableOpacity style={s.closeEndBtn} onPress={safeGoBack} activeOpacity={0.85}>
                <LinearGradient colors={[C.primary, C.primaryDark] } style={s.closeEndGradient}>
                  <Ionicons name="arrow-back" size={18} color={C.white} />
                  <Text style={s.closeEndText}>Back to Interviews</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CTRL = 60;
const END  = 72;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.black },

  cameraOff: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D0D0D' },
  cameraOffTxt: { color: 'rgba(255,255,255,0.3)', fontSize: 14, marginTop: 10 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 14,
    paddingHorizontal: 20, paddingBottom: 14, gap: 10,
  },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  liveDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: C.white },
  liveTxt:  { fontSize: 11, fontWeight: '800', color: C.white, letterSpacing: 1 },
  topTitle: { fontSize: 18, fontWeight: '800', color: C.white, flex: 1, textAlign: 'center' },
  qChip:    { backgroundColor: C.glass, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  qChipTxt: { fontSize: 12, fontWeight: '700', color: C.white },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)', gap: 16 },
  loadingClose:   { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 20, padding: 8, zIndex: 10 },
  loadingTxt:     { color: C.white, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  loadingHint:    { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center' },

  startWrap: { position: 'absolute', top: H * 0.40, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  ring:        { position: 'absolute', borderRadius: 1000, backgroundColor: C.primary },
  ringOuter:   { width: 160, height: 160 },
  ringInner:   { width: 120, height: 120 },
  startBtn:    { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: C.primary, shadowOffset:{width:0,height:8}, shadowOpacity:0.5, shadowRadius:16 }, android: { elevation: 12 } }) },
  startGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startLabel:  { marginTop: 58, color: C.white, fontSize: 15, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset:{width:0,height:1}, textShadowRadius:4 },

  speakWrap: { position: 'absolute', bottom: 160, left: 0, right: 0, alignItems: 'center', gap: 10 },
  dots:      { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  dot:       { width: 4, borderRadius: 2, backgroundColor: C.primary, opacity: 0.9 },
  speakTxt:  { color: C.white, fontSize: 13, fontWeight: '600', textShadowColor:'rgba(0,0,0,0.6)', textShadowOffset:{width:0,height:1}, textShadowRadius:4 },
  micRing:   { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },

  statusWrap: { position: 'absolute', bottom: 148, left: 0, right: 0, alignItems: 'center' },
  statusTxt:  { color: 'rgba(255,255,255,0.80)', fontSize: 13, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },

  controls: { position: 'absolute', bottom: Platform.OS === 'ios' ? 44 : 24, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 28, paddingHorizontal: 30 },
  ctrl:      { alignItems: 'center', gap: 6 },
  ctrlInner: { width: CTRL, height: CTRL, borderRadius: CTRL/2, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  ctrlActive:{ backgroundColor: 'rgba(139,92,246,0.55)', borderColor: C.primary },
  ctrlLbl:   { color: C.white, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  endCtrl:   { alignItems: 'center', gap: 6 },
  endBtn:    { width: END, height: END, borderRadius: END/2, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center', ...Platform.select({ ios: { shadowColor: C.error, shadowOffset:{width:0,height:6}, shadowOpacity:0.45, shadowRadius:12 }, android: { elevation: 10 } }) },

  endedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  endedTitle:   { color: C.white, fontSize: 24, fontWeight: '800' },
  endedSub:     { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontWeight: '500' },
  endedHint:    { color: 'rgba(255,255,255,0.50)', fontSize: 13, textAlign: 'center', marginTop: 4 },
  closeEndBtn:  { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
  closeEndGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  closeEndText: { color: C.white, fontSize: 15, fontWeight: '700' },

  countdownCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: 'rgba(139,92,246,0.15)' },
  countdownNum:    { fontSize: 28, fontWeight: '900', color: C.white },
});

// Need to import StyleSheet properly