// src/screens/main/SmartChatScreen.js — Assessment tab
// Chat-style AI health assessment (layout aligned with wireframe)

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { auth, firestore } from '../../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { COLORS } from '../../constants/colors';
import ApiService from '../../services/ApiService';
import { UserProfileService } from '../../services/UserProfileService';
import { ScreenHeader, LAYOUT } from '../../components/layout/ScreenHeader';

const COMMON_SYMPTOMS = [
  'Chest pain', 'Difficulty breathing', 'High fever', 'Severe headache',
  'Persistent cough', 'Dizziness', 'Nausea / vomiting', 'Abdominal pain',
];

const AI_GREETING = "Hi — I'm here to help understand how you're feeling. You can type below or use your voice. Take your time.";

export default function SmartChatScreen({ navigation }) {
  const [mode,         setMode]         = useState('text');
  const [symptoms,     setSymptoms]     = useState('');
  const [selected,     setSelected]     = useState([]);
  const [duration,     setDuration]     = useState('');
  const [severity,     setSeverity]     = useState(5);
  const [loading,      setLoading]      = useState(false);
  const [recording,    setRecording]    = useState(null);
  const [recordingUri, setRecordingUri] = useState(null);
  const [isRecording,  setIsRecording]  = useState(false);

  const toggleSymptom = (s) =>
    setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Microphone access is needed for voice input.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch {
      Alert.alert('Error', 'Could not start recording. Please use text input instead.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    setRecordingUri(recording.getURI());
    setRecording(null);
  };

  const buildSymptomText = () => {
    const parts = [];
    if (selected.length > 0) parts.push(selected.join(', '));
    if (symptoms.trim())     parts.push(symptoms.trim());
    if (duration.trim())     parts.push(`Duration: ${duration.trim()}`);
    parts.push(`Severity: ${severity}/10`);
    return parts.join('. ');
  };

  const handleSubmit = async () => {
    const symptomText = buildSymptomText();
    if (!symptomText && !recordingUri) {
      Alert.alert('No symptoms entered', 'Please describe your symptoms or use voice input.');
      return;
    }
    setLoading(true);
    try {
      const uid     = auth.currentUser?.uid;
      const profile = await UserProfileService.getProfile();

      const context = [
        `Symptoms: ${symptomText}`,
        profile.chronicConditions?.length ? `Chronic conditions: ${profile.chronicConditions.join(', ')}` : '',
        profile.allergies          ? `Allergies: ${profile.allergies}`            : '',
        profile.currentMedications ? `Medications: ${profile.currentMedications}` : '',
      ].filter(Boolean).join('\n');

      const result = await ApiService.sendChatMessage({ text: `TRIAGE_REQUEST\n${context}` });

      if (!result.success) {
        Alert.alert('Assessment Error', result.message || 'Analysis failed. Please try again.');
        setLoading(false);
        return;
      }

      const aiText    = result.data.response || '';
      const priority  = parsePriority(aiText);
      const riskScore = parseRiskScore(aiText);
      const reasoning = parseReasoning(aiText);

      const caseRef = await addDoc(collection(firestore, 'triage_cases'), {
        patientId: uid,
        patientName: profile.displayName || auth.currentUser?.displayName || '',
        symptoms: symptomText,
        aiResponse: aiText,
        priority,
        riskScore,
        aiReasoning: reasoning,
        status: 'queued',
        createdAt: serverTimestamp(),
        queuePosition: null,
        estimatedWait: null,
        nurseDecision: null,
        overrideReason: null,
      });

      setSymptoms(''); setSelected([]); setDuration(''); setSeverity(5); setRecordingUri(null);

      navigation.navigate('TriageResult', {
        caseId: caseRef.id, priority, riskScore, reasoning, symptoms: symptomText, aiText,
      });
    } catch (err) {
      console.error('Assessment submit error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="NcedoCare AI"
        statusLabel="Online"
        rightIcon="information-circle-outline"
        onRightPress={() => Alert.alert(
          'About NcedoCare AI',
          'This AI helps gather your symptoms and suggests urgency levels. A healthcare professional always makes the final decision.',
        )}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* AI greeting bubble */}
          <View style={styles.aiRow}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={16} color={COLORS.primary} />
            </View>
            <View style={styles.aiBubble}>
              <Text style={styles.aiBubbleText}>{AI_GREETING}</Text>
            </View>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeRow}>
            {['text', 'voice'].map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipActive]}
                onPress={() => setMode(m)}>
                <Ionicons
                  name={m === 'text' ? 'chatbubble-outline' : 'mic-outline'}
                  size={15}
                  color={mode === m ? COLORS.primary : COLORS.textSecondary}
                />
                <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>
                  {m === 'text' ? 'Text' : 'Voice'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'text' ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Common symptoms</Text>
              <View style={styles.chipsWrap}>
                {COMMON_SYMPTOMS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, selected.includes(s) && styles.chipActive]}
                    onPress={() => toggleSymptom(s)}>
                    {selected.includes(s) && (
                      <Ionicons name="checkmark" size={11} color={COLORS.primary} />
                    )}
                    <Text style={[styles.chipText, selected.includes(s) && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.cardLabel}>Describe in your own words</Text>
              <TextInput
                style={styles.textArea}
                placeholder='e.g. "I have had chest pain for two days..."'
                placeholderTextColor={COLORS.textTertiary}
                value={symptoms}
                onChangeText={setSymptoms}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.cardLabel}>How long have you had these symptoms?</Text>
              <View style={styles.inputRow}>
                <Ionicons name="time-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.inlineInput}
                  placeholder="e.g. 2 days, since yesterday..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={duration}
                  onChangeText={setDuration}
                />
              </View>

              <Text style={styles.cardLabel}>
                Discomfort level:{' '}
                <Text style={{ color: severity >= 8 ? COLORS.critical : COLORS.primary }}>{severity}/10</Text>
              </Text>
              <View style={styles.severityRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.severityBtn,
                      severity === n && styles.severityBtnActive,
                      severity === n && n >= 8 && { backgroundColor: COLORS.critical, borderColor: COLORS.critical },
                    ]}
                    onPress={() => setSeverity(n)}>
                    <Text style={[styles.severityText, severity === n && styles.severityTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.voiceCard}>
              <View style={[styles.micCircle, isRecording && styles.micCircleActive]}>
                <Ionicons
                  name={isRecording ? 'radio' : 'mic'}
                  size={48}
                  color={isRecording ? COLORS.critical : COLORS.primary}
                />
              </View>
              <Text style={styles.voiceTitle}>
                {recordingUri ? 'Ready to analyse' : isRecording ? 'Listening...' : 'Tap to speak'}
              </Text>
              <Text style={styles.voiceSub}>
                {isRecording
                  ? 'Speak clearly about your symptoms'
                  : 'Describe your symptoms naturally — real-time, no record-and-send'}
              </Text>

              {!isRecording && !recordingUri && (
                <TouchableOpacity style={styles.voiceBtn} onPress={startRecording}>
                  <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.voiceBtnGradient}>
                    <Ionicons name="mic" size={20} color="#FFFFFF" />
                    <Text style={styles.voiceBtnText}>Start speaking</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              {isRecording && (
                <TouchableOpacity style={styles.voiceBtn} onPress={stopRecording}>
                  <View style={[styles.voiceBtnGradient, { backgroundColor: COLORS.critical }]}>
                    <Ionicons name="stop" size={20} color="#FFFFFF" />
                    <Text style={styles.voiceBtnText}>Stop</Text>
                  </View>
                </TouchableOpacity>
              )}
              {recordingUri && !isRecording && (
                <TouchableOpacity style={styles.voiceBtn} onPress={() => setRecordingUri(null)}>
                  <View style={[styles.voiceBtnGradient, { backgroundColor: COLORS.backgroundTertiary, borderWidth: 1, borderColor: COLORS.border }]}>
                    <Text style={[styles.voiceBtnText, { color: COLORS.textPrimary }]}>Re-record</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.submitGradient}>
              {loading
                ? <ActivityIndicator color="#FFFFFF" />
                : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                    <Text style={styles.submitText}>Submit Assessment</Text>
                  </>
                )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            A healthcare professional will review this before any decision is made.
          </Text>

          <View style={{ height: LAYOUT.bottomTabClearance }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function parsePriority(text) {
  const upper = text.toUpperCase();
  if (upper.includes('CRITICAL')) return 'CRITICAL';
  if (upper.includes('HIGH'))     return 'HIGH';
  if (upper.includes('MEDIUM'))   return 'MEDIUM';
  return 'LOW';
}

function parseRiskScore(text) {
  const match = text.match(/risk[_ ]?score[:\s]+(\d+(?:\.\d+)?)/i);
  return match ? parseFloat(match[1]) : null;
}

function parseReasoning(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 20);
  return lines.slice(0, 3).join(' ') || text.substring(0, 300);
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F1A14', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scroll: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 16 },

  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  aiBubbleText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 21 },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  modeChipActive: { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  modeChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  modeChipTextActive: { color: COLORS.primary },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  cardLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10, marginTop: 4 },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary },

  textArea: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 21,
    minHeight: 90,
    backgroundColor: COLORS.backgroundSecondary,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 16,
  },
  inlineInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },

  severityRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  severityBtn: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  severityBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  severityText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  severityTextActive: { color: '#FFFFFF' },

  voiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  micCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primaryGlow,
    marginBottom: 16,
  },
  micCircleActive: { backgroundColor: COLORS.criticalLight, borderColor: COLORS.critical },
  voiceTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  voiceSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  voiceBtn: { borderRadius: 14, overflow: 'hidden', width: '100%' },
  voiceBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  voiceBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  submitBtn: { borderRadius: LAYOUT.cardRadius, overflow: 'hidden', marginBottom: 12 },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  disclaimer: {
    fontSize: 11,
    color: COLORS.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
  },
});
