// src/screens/main/LiveChatScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// NcedoCare — Real-Time Live Chat Conversation Triage Screen
//
// Features:
//   - Natural, continuous voice conversation with Dr. Ncedo (AI Triage Agent).
//   - Anonymised & POPIA-compliant (strictly illness/symptom history taking).
//   - Real-time audio streaming, speech visualizer, and live transcript view.
//   - Automatic triage submission & graceful auto-close into facility queue.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { LAYOUT } from '../../components/layout/ScreenHeader';
import { useFacility } from '../../contexts/FacilityContext';
import { SessionService } from '../../services/SessionService';
import { ChatStorageService } from '../../services/ChatStorageService';
import { GeminiLiveService } from '../../services/GeminiLiveService';
import { openPatientJourney, openPatientAssessment, goBackOrHome } from '../../navigation/openPatientTab';
import { COLLECTIONS } from '../../services/firestorePaths';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STATE = {
  CONNECTING:    'connecting',
  READY:         'ready',
  AI_SPEAKING:   'ai_speaking',
  USER_SPEAKING: 'user_speaking',
  SUBMITTING:    'submitting',
  QUEUED:        'queued',
  ENDED:         'ended',
};

// ─── Sound Wave Visualizer Bar Component ─────────────────────────────────────
function VisualizerBars({ active, color = COLORS.primary }) {
  const bars = useRef([...Array(14)].map(() => new Animated.Value(0.2))).current;

  useEffect(() => {
    let animations = [];
    if (active) {
      animations = bars.map((bar, i) => {
        const anim = Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: Math.random() * 0.8 + 0.2,
              duration: 200 + (i % 5) * 60,
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: 0.15,
              duration: 200 + (i % 5) * 60,
              useNativeDriver: true,
            }),
          ])
        );
        anim.start();
        return anim;
      });
    } else {
      bars.forEach(bar => {
        bar.stopAnimation();
        bar.setValue(0.18);
      });
    }

    return () => {
      animations.forEach(a => a.stop());
    };
  }, [active]);

  return (
    <View style={styles.visualizerWrap}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.visualizerBar,
            {
              backgroundColor: color,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function LiveChatScreen() {
  const insets = useSafeAreaInsets();
  const { facilityName, facilityId } = useFacility();

  const [sessionState, setSessionState] = useState(STATE.CONNECTING);
  const [statusText, setStatusText]     = useState('Connecting to Dr. Ncedo…');
  const [isMuted, setIsMuted]           = useState(false);
  const [transcript, setTranscript]     = useState([]);
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');
  const [queuedCaseInfo, setQueuedCaseInfo] = useState(null);

  // ─── Refs for state & Gemini live lifecycle ────────────────────────────────
  const sessionStateRef      = useRef(STATE.CONNECTING);
  const geminiRef            = useRef(null);
  const recordingRef         = useRef(null);
  const chunkIntervalRef     = useRef(null);
  const audioQueueRef        = useRef([]);
  const isPlayingRef         = useRef(false);
  const playNextRef          = useRef(null);
  const playbackSoundRef     = useRef(null);
  const conversationIdRef    = useRef(`live_triage_${Date.now()}`);
  const isMutedRef           = useRef(false);
  const sessionStartedRef    = useRef(false);
  const triageSubmittedRef   = useRef(false);
  const scrollViewRef        = useRef(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const orbRingAnim = useRef(new Animated.Value(1)).current;

  // Sync state ref
  const setSessionStateSynced = useCallback((nextState) => {
    sessionStateRef.current = nextState;
    setSessionState(nextState);
  }, []);

  // ─── Orb Animation ───────────────────────────────────────────────────────────
  useEffect(() => {
    let anim;
    if (sessionState === STATE.AI_SPEAKING) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else if (sessionState === STATE.USER_SPEAKING) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.95, duration: 400, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
    return () => anim?.stop();
  }, [sessionState]);

  // ─── Build Sealed Session Binding ──────────────────────────────────────────
  const getSealedBinding = () => {
    const session = SessionService.getSession();
    const uid = auth.currentUser?.uid || '';
    const age = session?.patientAge;
    return {
      patientId: uid,
      facilityId: facilityId || session?.facilityId || '',
      facilityName: facilityName || session?.facilityName || '',
      patientName: [session?.patientFirstName, session?.patientSurname].filter(Boolean).join(' '),
      ageYears: typeof age === 'number' && age > 0 && age < 130 ? Math.round(age) : null,
    };
  };

  // ─── Mic Capture for Continuous Stream ──────────────────────────────────────
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

  const stopMicCapture = useCallback(async () => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
  }, []);

  const startMicCapture = useCallback(async () => {
    if (recordingRef.current || isMutedRef.current || isPlayingRef.current) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(makeRecordingOptions());
      await rec.startAsync();
      recordingRef.current = rec;

      setSessionStateSynced(STATE.USER_SPEAKING);
      setStatusText('Listening to you…');

      geminiRef.current?.sendActivityStart();

      chunkIntervalRef.current = setInterval(async () => {
        if (!recordingRef.current || isMutedRef.current || isPlayingRef.current) return;
        if (!chunkIntervalRef.current) return;
        try {
          await recordingRef.current.stopAndUnloadAsync();
          if (!chunkIntervalRef.current) return;
          const uri = recordingRef.current.getURI();

          if (uri) {
            const b64Full = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            // Strip 44-byte WAV header
            const raw = atob(b64Full);
            const pcmRaw = raw.slice(44);
            const pcmB64 = btoa(pcmRaw);
            geminiRef.current?.sendAudioChunk(pcmB64);
            FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          }

          if (!chunkIntervalRef.current) return;

          const newRec = new Audio.Recording();
          await newRec.prepareToRecordAsync(makeRecordingOptions());
          await newRec.startAsync();
          recordingRef.current = newRec;
        } catch (e) {
          // ignore transient chunk restarts
        }
      }, 250);
    } catch (err) {
      console.log('[LiveChat] startMicCapture error:', err);
    }
  }, [setSessionStateSynced]);

  // ─── Playback Audio Queue ───────────────────────────────────────────────────
  const playNext = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;

      // If triage was already submitted and final audio ended -> transition to QUEUED!
      if (triageSubmittedRef.current) {
        setSessionStateSynced(STATE.QUEUED);
        setStatusText('Triage assessment completed & added to queue');
        await finishAndSaveCase();
        return;
      }

      setSessionStateSynced(STATE.READY);
      setStatusText('Dr. Ncedo is listening…');
      // Resume mic listening
      if (!isMutedRef.current) {
        startMicCapture();
      }
      return;
    }

    const nextWavUri = audioQueueRef.current.shift();
    if (!nextWavUri) {
      playNext();
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: nextWavUri },
        { shouldPlay: true }
      );
      playbackSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          playbackSoundRef.current = null;
          FileSystem.deleteAsync(nextWavUri, { idempotent: true }).catch(() => {});
          playNext();
        }
      });
    } catch (err) {
      console.log('[LiveChat] playNext error:', err);
      playNext();
    }
  }, [setSessionStateSynced, startMicCapture]);

  playNextRef.current = playNext;

  const enqueueAudio = useCallback(async (wavUri) => {
    audioQueueRef.current.push(wavUri);
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setSessionStateSynced(STATE.AI_SPEAKING);
      setStatusText('Dr. Ncedo is speaking…');

      // Stop mic while AI speaks
      await stopMicCapture();
      geminiRef.current?.sendActivityEnd();

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch {}

      playNextRef.current?.();
    }
  }, [setSessionStateSynced, stopMicCapture]);

  // ─── Finalise Case and Save Storage ─────────────────────────────────────────
  const finishAndSaveCase = async () => {
    const convId = conversationIdRef.current;
    const caseId = queuedCaseInfo?.caseId;
    const fallback = queuedCaseInfo?.fallbackFields;

    let finalCaseId = caseId;

    // Fallback client write if direct server write didn't generate ID
    if (!finalCaseId && fallback && auth.currentUser?.uid) {
      try {
        const autoRef = doc(collection(firestore, COLLECTIONS.TRIAGE_CASES));
        await setDoc(autoRef, {
          ...fallback,
          createdAt: serverTimestamp(),
          waitUpdatedAt: serverTimestamp(),
        });
        finalCaseId = autoRef.id;
      } catch (err) {
        console.log('[LiveChat] Client fallback write error:', err);
      }
    }

    // Save conversation to local storage
    await ChatStorageService.saveConversation({
      id: convId,
      title: 'Live Voice Assessment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: 'Assessment completed & request queued at facility.',
      messageCount: transcript.length + 1,
      archived: false,
      activeCaseId: finalCaseId || null,
      lastCaseId: finalCaseId || null,
    });

    // Add closing system message
    await ChatStorageService.addMessage(convId, {
      id: `sys_${Date.now()}`,
      type: 'text',
      text: 'Your request has been added to the queue at your healthcare facility. The care team has been notified.',
      timestamp: new Date().toISOString(),
      sender: 'ai',
      isSystemNotice: true,
    });
  };

  // ─── Initialize Live Consultation Session ──────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const convId = `live_triage_${Date.now()}`;
    conversationIdRef.current = convId;

    const startSession = async () => {
      try {
        const { status: micStatus } = await Audio.requestPermissionsAsync();
        if (micStatus !== 'granted') {
          Alert.alert(
            'Microphone Permission Required',
            'NcedoCare requires microphone access to conduct your voice consultation with Dr. Ncedo.',
            [{ text: 'OK', onPress: () => goBackOrHome() }]
          );
          return;
        }

        let idToken = null;
        try {
          idToken = (await auth.currentUser?.getIdToken?.()) || null;
        } catch {
          idToken = null;
        }

        const binding = getSealedBinding();
        const liveService = new GeminiLiveService();
        geminiRef.current = liveService;

        liveService.onSetupComplete = () => {
          if (!isMounted) return;
          sessionStartedRef.current = true;
          setSessionStateSynced(STATE.READY);
          setStatusText('Dr. Ncedo is ready');

          // Kick off initial greeting from Dr. Ncedo
          liveService.sendClientTurn(
            'The patient has entered the consultation room. Greet them warmly as Dr. Ncedo, introduce yourself as their AI triage assistant, and ask what symptoms they are experiencing today.'
          );
        };

        liveService.onAudioReady = (wavUri) => {
          if (!isMounted) return;
          enqueueAudio(wavUri);
        };

        liveService.onTurnComplete = () => {
          if (!isMounted) return;
          console.log('[LiveChat] AI Turn complete');
        };

        liveService.onInterrupted = () => {
          if (!isMounted) return;
          console.log('[LiveChat] Interrupted');
          if (playbackSoundRef.current) {
            playbackSoundRef.current.stopAsync().catch(() => {});
            playbackSoundRef.current.unloadAsync().catch(() => {});
            playbackSoundRef.current = null;
          }
          audioQueueRef.current = [];
          isPlayingRef.current = false;
          setSessionStateSynced(STATE.USER_SPEAKING);
          setStatusText('Listening to you…');
        };

        liveService.onTranscript = ({ role, text }) => {
          if (!isMounted || !text) return;
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === role) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: `${last.text} ${text}`.trim() },
              ];
            }
            return [...prev, { id: `tr_${Date.now()}_${Math.random()}`, role, text: text.trim() }];
          });
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        };

        liveService.onTriageSubmitted = (data) => {
          if (!isMounted) return;
          console.log('[LiveChat] Triage submitted handler:', data);
          triageSubmittedRef.current = true;
          setQueuedCaseInfo(data);
          setStatusText('Assessment submitted — Dr. Ncedo closing…');
        };

        liveService.onSessionEnded = (code, reason) => {
          if (!isMounted) return;
          console.log('[LiveChat] Session ended:', code, reason);
          if (!triageSubmittedRef.current && sessionStartedRef.current) {
            setStatusText('Consultation ended');
            setSessionStateSynced(STATE.ENDED);
          }
        };

        liveService.onError = (err) => {
          if (!isMounted) return;
          console.log('[LiveChat] Service error:', err);
          Alert.alert(
            'Consultation Disconnected',
            'Unable to communicate with the live AI service. Please check your internet connection.',
            [{ text: 'OK', onPress: () => goBackOrHome() }]
          );
        };

        await liveService.connect({
          sessionBinding: binding,
          idToken: idToken,
          conversationId: convId,
          voiceName: 'Aoede',
        });
      } catch (err) {
        console.log('[LiveChat] Connection setup failed:', err);
        Alert.alert(
          'Connection Error',
          'Could not establish real-time consultation. Please verify server status.',
          [{ text: 'OK', onPress: () => goBackOrHome() }]
        );
      }
    };

    startSession();

    return () => {
      isMounted = false;
      stopMicCapture();
      if (playbackSoundRef.current) {
        playbackSoundRef.current.unloadAsync().catch(() => {});
      }
      if (geminiRef.current) {
        geminiRef.current.disconnect();
      }
    };
  }, []);

  // ─── Toggle Mute ─────────────────────────────────────────────────────────────
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (next) {
      stopMicCapture();
      setStatusText('Microphone muted');
    } else {
      if (!isPlayingRef.current) {
        startMicCapture();
      }
    }
  };

  // ─── Send Text Fallback ──────────────────────────────────────────────────────
  const handleSendTyped = () => {
    const txt = typedMessage.trim();
    if (!txt || !geminiRef.current) return;
    setTranscript((prev) => [
      ...prev,
      { id: `tr_user_${Date.now()}`, role: 'user', text: txt },
    ]);
    geminiRef.current.sendTextPrompt(txt);
    setTypedMessage('');
    setShowTextInput(false);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ─── End Consultation Early ─────────────────────────────────────────────────
  const handleEndConsultation = () => {
    Alert.alert(
      'End Consultation?',
      'Are you sure you want to end this live triage session? Your progress will not be saved if triage was not submitted.',
      [
        { text: 'Keep Talking', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: () => {
            geminiRef.current?.disconnect();
            goBackOrHome();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Background Gradient */}
      <LinearGradient
        colors={['#0B0F19', '#0F172A', '#1E293B']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleEndConsultation}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Dr. Ncedo</Text>
          <View style={styles.headerPill}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    sessionState === STATE.AI_SPEAKING
                      ? COLORS.primaryLight
                      : sessionState === STATE.USER_SPEAKING
                      ? '#10B981'
                      : sessionState === STATE.QUEUED
                      ? '#10B981'
                      : '#F59E0B',
                },
              ]}
            />
            <Text style={styles.headerPillText}>
              {sessionState === STATE.AI_SPEAKING
                ? 'Speaking'
                : sessionState === STATE.USER_SPEAKING
                ? 'Listening'
                : sessionState === STATE.QUEUED
                ? 'Case Queued'
                : 'Connected'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.headerBtn, showTextInput && styles.headerBtnActive]}
          onPress={() => setShowTextInput((p) => !p)}>
          <Ionicons name="keypad-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Privacy Banner */}
      <View style={styles.privacyBanner}>
        <Ionicons name="shield-checkmark" size={14} color={COLORS.primaryLight} />
        <Text style={styles.privacyText}>
          POPIA Protected · Private Symptom Assessment (No Identity Shared)
        </Text>
      </View>

      {/* Main Visualizer Area */}
      <View style={styles.visualizerContainer}>
        <Animated.View style={[styles.orbWrapper, { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient
            colors={
              sessionState === STATE.AI_SPEAKING
                ? ['#3B82F6', '#1D4ED8', '#1E1B4B']
                : sessionState === STATE.USER_SPEAKING
                ? ['#10B981', '#059669', '#064E3B']
                : sessionState === STATE.QUEUED
                ? ['#10B981', '#047857', '#064E3B']
                : ['#6366F1', '#4338CA', '#1E1B4B']
            }
            style={styles.orbGradient}>
            {sessionState === STATE.QUEUED ? (
              <Ionicons name="checkmark-circle" size={54} color="#FFFFFF" />
            ) : (
              <Ionicons
                name={
                  sessionState === STATE.AI_SPEAKING
                    ? 'volume-high'
                    : sessionState === STATE.USER_SPEAKING
                    ? 'mic'
                    : 'sparkles'
                }
                size={44}
                color="#FFFFFF"
              />
            )}
          </LinearGradient>
        </Animated.View>

        {/* Audio Waveform */}
        <VisualizerBars
          active={sessionState === STATE.AI_SPEAKING || sessionState === STATE.USER_SPEAKING}
          color={
            sessionState === STATE.AI_SPEAKING
              ? COLORS.primaryLight
              : sessionState === STATE.USER_SPEAKING
              ? '#10B981'
              : '#94A3B8'
          }
        />

        {/* Status Subtitle */}
        <Text style={styles.statusLabel}>{statusText}</Text>
        {facilityName ? (
          <Text style={styles.facilitySub} numberOfLines={1}>
            Connected with {facilityName}
          </Text>
        ) : null}
      </View>

      {/* Live Transcript Drawer */}
      <View style={styles.transcriptCard}>
        <View style={styles.transcriptHeader}>
          <Ionicons name="chatbubbles-outline" size={14} color="#94A3B8" />
          <Text style={styles.transcriptHeaderText}>Live Consultation Transcript</Text>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}>
          {transcript.length === 0 ? (
            <Text style={styles.emptyTranscript}>
              Speak into your microphone to talk to Dr. Ncedo. Your conversation will appear here.
            </Text>
          ) : (
            transcript.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.bubbleWrap,
                  item.role === 'user' ? styles.userBubbleWrap : styles.aiBubbleWrap,
                ]}>
                <Text style={styles.bubbleAuthor}>
                  {item.role === 'user' ? 'You' : 'Dr. Ncedo'}
                </Text>
                <View
                  style={[
                    styles.bubble,
                    item.role === 'user' ? styles.userBubble : styles.aiBubble,
                  ]}>
                  <Text style={styles.bubbleText}>{item.text}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Completion Modal / Card if Queued */}
      {sessionState === STATE.QUEUED ? (
        <View style={styles.queuedOverlay}>
          <LinearGradient
            colors={['#1E293B', '#0F172A']}
            style={styles.queuedCard}>
            <View style={styles.queuedIconRing}>
              <Ionicons name="checkmark-done" size={36} color="#10B981" />
            </View>
            <Text style={styles.queuedTitle}>Assessment Complete</Text>
            <Text style={styles.queuedMessage}>
              Dr. Ncedo has submitted your clinical assessment to the queue at{' '}
              <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>
                {facilityName || 'your healthcare facility'}
              </Text>
              . Your care team has been notified.
            </Text>

            <TouchableOpacity
              style={styles.viewQueueBtn}
              activeOpacity={0.88}
              onPress={() => openPatientJourney()}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.viewQueueGradient}>
                <Text style={styles.viewQueueText}>View My Journey & Queue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      ) : null}

      {/* Optional Keyboard Fallback Drawer */}
      {showTextInput && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.textInputDrawer}>
          <View style={styles.textInputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Type symptom or answer to Dr. Ncedo…"
              placeholderTextColor="#64748B"
              value={typedMessage}
              onChangeText={setTypedMessage}
              onSubmitEditing={handleSendTyped}
              returnKeyType="send"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.sendBtn, !typedMessage.trim() && { opacity: 0.5 }]}
              onPress={handleSendTyped}
              disabled={!typedMessage.trim()}>
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Bottom Floating Control Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.actionBtn, isMuted && styles.actionBtnMuted]}
          onPress={toggleMute}
          activeOpacity={0.8}>
          <Ionicons
            name={isMuted ? 'mic-off' : 'mic'}
            size={24}
            color={isMuted ? '#EF4444' : '#FFFFFF'}
          />
          <Text style={styles.actionBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endCallBtn}
          onPress={handleEndConsultation}
          activeOpacity={0.85}>
          <Ionicons name="call" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowTextInput((p) => !p)}
          activeOpacity={0.8}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color="#FFFFFF" />
          <Text style={styles.actionBtnLabel}>Type</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnActive: {
    backgroundColor: COLORS.primary,
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  privacyText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#93C5FD',
    textAlign: 'center',
  },
  visualizerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  orbWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  orbGradient: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    gap: 5,
    marginTop: 18,
  },
  visualizerBar: {
    width: 4,
    height: 30,
    borderRadius: 2,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
    marginTop: 10,
    textAlign: 'center',
  },
  facilitySub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
    textAlign: 'center',
    maxWidth: '80%',
  },
  transcriptCard: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    padding: 16,
    overflow: 'hidden',
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  transcriptHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transcriptScroll: {
    flex: 1,
    marginTop: 10,
  },
  transcriptContent: {
    paddingBottom: 16,
    gap: 12,
  },
  emptyTranscript: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 30,
    lineHeight: 18,
  },
  bubbleWrap: {
    maxWidth: '85%',
  },
  userBubbleWrap: {
    alignSelf: 'flex-end',
  },
  aiBubbleWrap: {
    alignSelf: 'flex-start',
  },
  bubbleAuthor: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 13.5,
    color: '#FFFFFF',
    lineHeight: 19,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  actionBtnMuted: {
    opacity: 0.8,
  },
  actionBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },
  endCallBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  textInputDrawer: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 42,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 21,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queuedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
  },
  queuedCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  queuedIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  queuedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  queuedMessage: {
    fontSize: 14,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  viewQueueBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  viewQueueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  viewQueueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
