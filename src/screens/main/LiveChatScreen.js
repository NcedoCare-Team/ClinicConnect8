// Live voice triage — same look as Assess / text consultation. Voice only, no transcript.

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
import { GeminiLiveService, getLiveRelayUrl } from '../../services/GeminiLiveService';
import { openPatientJourney, goBackOrHome } from '../../navigation/openPatientTab';
import { COLLECTIONS } from '../../services/firestorePaths';

const STATE = {
  CONNECTING: 'connecting',
  READY: 'ready',
  AI_SPEAKING: 'ai_speaking',
  USER_SPEAKING: 'user_speaking',
  QUEUED: 'queued',
  ENDED: 'ended',
};

// ── Utterance capture tuning ──────────────────────────────────────────────────
// One continuous recording per patient turn. Metering (dBFS) detects when the
// patient stops talking; the whole utterance is then sent to the relay, which
// transcodes it (WAV/M4A → 16 kHz PCM) for Gemini Live.
const METER_INTERVAL_MS = 200;   // metering poll rate
const SPEECH_DB         = -35;   // above this dBFS counts as speech
const SILENCE_MS        = 1500;  // this much quiet after speech ⇒ turn finished
const MAX_UTTERANCE_MS  = 60000; // hard cap per spoken turn
const IDLE_RESTART_MS   = 45000; // restart file if nothing was said at all

// iOS records real PCM WAV; Android's MediaRecorder can only produce AAC in an
// MP4 container — the relay server converts both to raw PCM for Gemini.
const UTTERANCE_MIME = Platform.OS === 'ios' ? 'audio/wav' : 'audio/mp4';

function VisualizerBars({ active, color = COLORS.primary }) {
  const bars = useRef([...Array(12)].map(() => new Animated.Value(0.22))).current;

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
              toValue: 0.18,
              duration: 200 + (i % 5) * 60,
              useNativeDriver: true,
            }),
          ])
        );
        anim.start();
        return anim;
      });
    } else {
      bars.forEach((bar) => {
        bar.stopAnimation();
        bar.setValue(0.18);
      });
    }
    return () => animations.forEach((a) => a.stop());
  }, [active]);

  return (
    <View style={styles.visualizerWrap}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[styles.visualizerBar, { backgroundColor: color, transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

export default function LiveChatScreen() {
  const insets = useSafeAreaInsets();
  const { facilityName, facilityId } = useFacility();

  const [sessionState, setSessionState] = useState(STATE.CONNECTING);
  const [statusText, setStatusText] = useState(`Connecting to ${getLiveRelayUrl()}…`);
  const [isMuted, setIsMuted] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');
  const [queuedCaseInfo, setQueuedCaseInfo] = useState(null);

  const sessionStateRef = useRef(STATE.CONNECTING);
  const geminiRef = useRef(null);
  const recordingRef = useRef(null);
  const meterIntervalRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const silenceMsRef = useRef(0);
  const utteranceMsRef = useRef(0);
  const startMicCaptureRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const playNextRef = useRef(null);
  const playbackSoundRef = useRef(null);
  const conversationIdRef = useRef(`live_triage_${Date.now()}`);
  const isMutedRef = useRef(false);
  const sessionStartedRef = useRef(false);
  const triageSubmittedRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const setSessionStateSynced = useCallback((nextState) => {
    sessionStateRef.current = nextState;
    setSessionState(nextState);
  }, []);

  useEffect(() => {
    let anim;
    if (sessionState === STATE.AI_SPEAKING || sessionState === STATE.USER_SPEAKING) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
    return () => anim?.stop();
  }, [sessionState, pulseAnim]);

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

  const makeRecordingOptions = () => ({
    isMeteringEnabled: true,
    android: {
      // MediaRecorder cannot record WAV/PCM — AAC in an MP4 container is the
      // best it can do. The relay server transcodes it to PCM for Gemini.
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
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

  /** Stop and DISCARD any in-progress recording (mute, AI speaking, unmount). */
  const stopMicCapture = useCallback(async () => {
    if (meterIntervalRef.current) {
      clearInterval(meterIntervalRef.current);
      meterIntervalRef.current = null;
    }
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      } catch { /* ignore */ }
    }
  }, []);

  /** Stop the recording and SEND the whole utterance to Dr. Ncedo. */
  const finishUtterance = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    if (meterIntervalRef.current) {
      clearInterval(meterIntervalRef.current);
      meterIntervalRef.current = null;
    }
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) return;
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

      geminiRef.current?.sendAudioUtterance(b64, UTTERANCE_MIME);
      setSessionStateSynced(STATE.READY);
      setStatusText('Dr. Ncedo is thinking…');
    } catch (err) {
      console.log('[LiveChat] finishUtterance error:', err);
    }
  }, [setSessionStateSynced]);

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
      speechDetectedRef.current = false;
      silenceMsRef.current = 0;
      utteranceMsRef.current = 0;

      setSessionStateSynced(STATE.USER_SPEAKING);
      setStatusText('Listening… speak naturally, then pause');

      meterIntervalRef.current = setInterval(async () => {
        const current = recordingRef.current;
        if (!current || isMutedRef.current || isPlayingRef.current) return;

        let status;
        try {
          status = await current.getStatusAsync();
        } catch {
          return;
        }
        if (!status.isRecording) return;

        utteranceMsRef.current += METER_INTERVAL_MS;
        const level = typeof status.metering === 'number' ? status.metering : null;

        if (level === null) {
          // Metering unsupported on this device — send fixed 6 s windows.
          if (utteranceMsRef.current >= 6000) finishUtterance();
          return;
        }

        if (level > SPEECH_DB) {
          speechDetectedRef.current = true;
          silenceMsRef.current = 0;
        } else if (speechDetectedRef.current) {
          silenceMsRef.current += METER_INTERVAL_MS;
          if (silenceMsRef.current >= SILENCE_MS) {
            finishUtterance();
            return;
          }
        }

        if (speechDetectedRef.current && utteranceMsRef.current >= MAX_UTTERANCE_MS) {
          finishUtterance();
        } else if (!speechDetectedRef.current && utteranceMsRef.current >= IDLE_RESTART_MS) {
          // Nothing said — restart so the silent file doesn't grow unbounded.
          await stopMicCapture();
          startMicCaptureRef.current?.();
        }
      }, METER_INTERVAL_MS);
    } catch (err) {
      console.log('[LiveChat] startMicCapture error:', err);
    }
  }, [setSessionStateSynced, finishUtterance, stopMicCapture]);

  startMicCaptureRef.current = startMicCapture;

  const playNext = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (triageSubmittedRef.current) {
        setSessionStateSynced(STATE.QUEUED);
        setStatusText('Assessment sent to your facility');
        await finishAndSaveCase();
        return;
      }
      setSessionStateSynced(STATE.READY);
      setStatusText('Your turn — Dr. Ncedo is listening');
      if (!isMutedRef.current) startMicCapture();
      return;
    }

    const nextWavUri = audioQueueRef.current.shift();
    if (!nextWavUri) {
      playNext();
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync({ uri: nextWavUri }, { shouldPlay: true });
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
      await stopMicCapture();
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch { /* ignore */ }
      playNextRef.current?.();
    }
  }, [setSessionStateSynced, stopMicCapture]);

  const finishAndSaveCase = async () => {
    const convId = conversationIdRef.current;
    const fallback = queuedCaseInfo?.fallbackFields;
    let finalCaseId = queuedCaseInfo?.caseId;

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

    await ChatStorageService.saveConversation({
      id: convId,
      title: 'Live Voice Assessment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: 'Assessment completed & request queued at facility.',
      messageCount: 1,
      archived: false,
      activeCaseId: finalCaseId || null,
      lastCaseId: finalCaseId || null,
    });

    await ChatStorageService.addMessage(convId, {
      id: `sys_${Date.now()}`,
      type: 'text',
      text: 'Your request has been added to the queue at your healthcare facility. The care team has been notified.',
      timestamp: new Date().toISOString(),
      sender: 'ai',
      isSystemNotice: true,
    });
  };

  useEffect(() => {
    let isMounted = true;
    const convId = `live_triage_${Date.now()}`;
    conversationIdRef.current = convId;

    const startSession = async () => {
      try {
        const { status: micStatus } = await Audio.requestPermissionsAsync();
        if (micStatus !== 'granted') {
          Alert.alert(
            'Microphone required',
            'NcedoCare needs the microphone for a voice assessment with Dr. Ncedo.',
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

        const liveService = new GeminiLiveService();
        geminiRef.current = liveService;

        liveService.onSetupComplete = () => {
          if (!isMounted) return;
          sessionStartedRef.current = true;
          setSessionStateSynced(STATE.READY);
          setStatusText('Dr. Ncedo is ready');
          liveService.sendClientTurn(
            'The patient has entered the consultation room. Greet them warmly as Dr. Ncedo, introduce yourself as their AI triage assistant, and ask what symptoms they are experiencing today.'
          );
        };

        liveService.onAudioReady = (wavUri) => {
          if (!isMounted) return;
          enqueueAudio(wavUri);
        };

        liveService.onInterrupted = () => {
          if (!isMounted) return;
          if (playbackSoundRef.current) {
            playbackSoundRef.current.stopAsync().catch(() => {});
            playbackSoundRef.current.unloadAsync().catch(() => {});
            playbackSoundRef.current = null;
          }
          audioQueueRef.current = [];
          isPlayingRef.current = false;
          setSessionStateSynced(STATE.USER_SPEAKING);
          setStatusText('Listening…');
        };

        liveService.onTriageSubmitted = (data) => {
          if (!isMounted) return;
          triageSubmittedRef.current = true;
          setQueuedCaseInfo(data);
          setStatusText('Assessment submitted — wrapping up…');
        };

        liveService.onSessionEnded = () => {
          if (!isMounted) return;
          if (!triageSubmittedRef.current && sessionStartedRef.current) {
            setStatusText('Consultation ended');
            setSessionStateSynced(STATE.ENDED);
          }
        };

        liveService.onError = (err) => {
          if (!isMounted) return;
          Alert.alert(
            'Could not start live assessment',
            err?.message || `Unable to reach ${getLiveRelayUrl()}. Start app.py and live_server.py.`,
            [{ text: 'OK', onPress: () => goBackOrHome() }]
          );
        };

        await liveService.connect({
          sessionBinding: getSealedBinding(),
          idToken,
          conversationId: convId,
          voiceName: 'Aoede',
        });
      } catch (err) {
        console.log('[LiveChat] Connection setup failed:', err);
        Alert.alert(
          'Connection error',
          err?.message || `Could not reach ${getLiveRelayUrl()}. Start app.py and live_server.py.`,
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

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (next) {
      stopMicCapture();
      setStatusText('Microphone muted');
    } else if (!isPlayingRef.current) {
      startMicCapture();
    }
  };

  const handleSendTyped = () => {
    const txt = typedMessage.trim();
    if (!txt || !geminiRef.current) return;
    // Discard any half-recorded audio so it doesn't mix with the typed turn.
    stopMicCapture();
    geminiRef.current.sendClientTurn(txt);
    setStatusText('Dr. Ncedo is thinking…');
    setTypedMessage('');
    setShowTextInput(false);
  };

  const handleEndConsultation = () => {
    Alert.alert(
      'End consultation?',
      'Leave this live assessment? Progress is only saved after Dr. Ncedo submits your case.',
      [
        { text: 'Keep talking', style: 'cancel' },
        {
          text: 'End session',
          style: 'destructive',
          onPress: () => {
            geminiRef.current?.disconnect();
            goBackOrHome();
          },
        },
      ]
    );
  };

  const statusLabel =
    sessionState === STATE.AI_SPEAKING
      ? 'Speaking'
      : sessionState === STATE.USER_SPEAKING
        ? 'Listening'
        : sessionState === STATE.QUEUED
          ? 'Queued'
          : sessionState === STATE.CONNECTING
            ? 'Connecting'
            : 'Online';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[COLORS.background, COLORS.backgroundSecondary]}
          style={[styles.headerGradient, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={handleEndConsultation} activeOpacity={0.7}>
              <View style={styles.backButtonInner}>
                <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
              </View>
            </TouchableOpacity>

            <View style={styles.brandingSection}>
              <Animated.View style={[styles.aiLogoContainer, { transform: [{ scale: pulseAnim }] }]}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  style={styles.aiLogoGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="mic" size={24} color={COLORS.white} />
                </LinearGradient>
              </Animated.View>
              <View style={styles.brandTextContainer}>
                <View style={styles.brandNameRow}>
                  <Text style={styles.brandNameText}>NcedoCare</Text>
                  <View style={styles.aiChip}>
                    <Text style={styles.aiChipText}>AI</Text>
                  </View>
                </View>
                <Text style={styles.conversationTitleText}>Live Voice Assessment</Text>
              </View>
            </View>

            <View style={styles.statusPill}>
              {sessionState === STATE.CONNECTING ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <View
                  style={[
                    styles.statusDot,
                    sessionState === STATE.QUEUED && { backgroundColor: COLORS.success },
                    sessionState === STATE.USER_SPEAKING && { backgroundColor: COLORS.success },
                  ]}
                />
              )}
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.headerShadow} />
      </View>

      <View style={styles.body}>
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.primary} />
          <Text style={styles.privacyNoteText}>
            Private voice assessment. Nothing is shown as a written transcript.
          </Text>
        </View>

        <View style={styles.stageCard}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient
              colors={
                sessionState === STATE.QUEUED
                  ? [COLORS.success, '#15803D']
                  : sessionState === STATE.USER_SPEAKING
                    ? [COLORS.primaryLight, COLORS.primary]
                    : [COLORS.primary, COLORS.primaryDark]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.orb}
            >
              <Ionicons
                name={
                  sessionState === STATE.QUEUED
                    ? 'checkmark'
                    : sessionState === STATE.AI_SPEAKING
                      ? 'volume-high'
                      : sessionState === STATE.CONNECTING
                        ? 'sparkles'
                        : 'mic'
                }
                size={40}
                color={COLORS.white}
              />
            </LinearGradient>
          </Animated.View>

          <VisualizerBars
            active={sessionState === STATE.AI_SPEAKING || sessionState === STATE.USER_SPEAKING}
            color={sessionState === STATE.USER_SPEAKING ? COLORS.success : COLORS.primary}
          />

          <Text style={styles.statusLabel}>{statusText}</Text>
          {facilityName ? (
            <Text style={styles.facilitySub} numberOfLines={2}>
              {facilityName}
            </Text>
          ) : null}

          {sessionState === STATE.CONNECTING ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 16 }} />
          ) : null}

          <Text style={styles.hint}>
            Speak naturally, then pause — Dr. Ncedo answers after a short moment of silence. When enough is gathered, your case is sent to the care team.
          </Text>
        </View>
      </View>

      {sessionState === STATE.QUEUED ? (
        <View style={styles.queuedOverlay}>
          <View style={styles.queuedCard}>
            <View style={styles.queuedIcon}>
              <Ionicons name="checkmark-circle" size={36} color={COLORS.success} />
            </View>
            <Text style={styles.queuedTitle}>Assessment complete</Text>
            <Text style={styles.queuedMessage}>
              Your clinical assessment was sent to the queue at{' '}
              <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>
                {facilityName || 'your healthcare facility'}
              </Text>
              . The care team has been notified.
            </Text>
            <TouchableOpacity
              style={styles.viewQueueBtn}
              activeOpacity={0.88}
              onPress={() => openPatientJourney('JourneyMain', { tab: 'live' })}
            >
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.viewQueueGradient}>
                <Text style={styles.viewQueueText}>View my journey</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {showTextInput ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.textDrawer}>
          <View style={styles.textInputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a short answer…"
              placeholderTextColor={COLORS.textTertiary}
              value={typedMessage}
              onChangeText={setTypedMessage}
              onSubmitEditing={handleSendTyped}
              returnKeyType="send"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.sendBtn, !typedMessage.trim() && { opacity: 0.45 }]}
              onPress={handleSendTyped}
              disabled={!typedMessage.trim()}
            >
              <Ionicons name="send" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={toggleMute} activeOpacity={0.8}>
          <View style={[styles.actionCircle, isMuted && styles.actionCircleMuted]}>
            <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color={isMuted ? COLORS.error : COLORS.primary} />
          </View>
          <Text style={styles.actionBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endCallBtn} onPress={handleEndConsultation} activeOpacity={0.85}>
          <Ionicons name="call" size={26} color={COLORS.white} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowTextInput((p) => !p)} activeOpacity={0.8}>
          <View style={[styles.actionCircle, showTextInput && styles.actionCircleOn]}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.actionBtnLabel}>Type</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  headerContainer: { backgroundColor: COLORS.background },
  headerGradient: {
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerShadow: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  backButton: { marginRight: 12 },
  backButtonInner: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandingSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiLogoContainer: { marginRight: 12 },
  aiLogoGradient: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextContainer: { flex: 1 },
  brandNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  brandNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  aiChip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: 6,
  },
  aiChipText: { fontSize: 11, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.4 },
  conversationTitleText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: 12,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  body: {
    flex: 1,
    paddingHorizontal: LAYOUT.screenPadding,
    paddingTop: 16,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  privacyNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  stageCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    ...cardShadow,
  },
  orb: {
    width: 112,
    height: 112,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    gap: 5,
    marginTop: 22,
  },
  visualizerBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  facilitySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginTop: 18,
    maxWidth: 320,
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 28,
    paddingTop: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  actionBtn: { alignItems: 'center', width: 72 },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircleMuted: { backgroundColor: COLORS.errorLight },
  actionCircleOn: { backgroundColor: COLORS.primaryGlow },
  actionBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  endCallBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textDrawer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  textInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queuedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 20,
  },
  queuedCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...cardShadow,
  },
  queuedIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  queuedTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  queuedMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  viewQueueBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  viewQueueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  viewQueueText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
});
