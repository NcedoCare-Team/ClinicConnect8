// src/screens/main/SmartChatScreen.js  — SymptomInputScreen
// NcedoCare: Text or voice symptom entry → AI triage analysis → TriageResultScreen

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, StatusBar, ScrollView, Alert, ActivityIndicator,
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

const COMMON_SYMPTOMS = [
  'Chest pain', 'Difficulty breathing', 'High fever', 'Severe headache',
  'Persistent cough', 'Dizziness', 'Nausea / vomiting', 'Abdominal pain',
  'Back pain', 'Rash / skin changes', 'Fatigue', 'Joint pain',
];

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
    Alert.alert('Recording saved', 'Tap "Analyse Symptoms" to continue.');
  };

  const buildSymptomText = () => {
    const parts = [];
    if (selected.length > 0)  parts.push(selected.join(', '));
    if (symptoms.trim())       parts.push(symptoms.trim());
    if (duration.trim())       parts.push(`Duration: ${duration.trim()}`);
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
        profile.allergies           ? `Allergies: ${profile.allergies}`               : '',
        profile.currentMedications  ? `Medications: ${profile.currentMedications}`    : '',
      ].filter(Boolean).join('\n');

      const result = await ApiService.sendChatMessage({ text: `TRIAGE_REQUEST\n${context}` });

      if (!result.success) {
        Alert.alert('Triage Error', result.message || 'Analysis failed. Please try again.');
        setLoading(false);
        return;
      }

      const aiText   = result.data.response || '';
      const priority = parsePriority(aiText);
      const riskScore = parseRiskScore(aiText);
      const reasoning = parseReasoning(aiText);

      const caseRef = await addDoc(collection(firestore, 'triage_cases'), {
        patientId:      uid,
        patientName:    profile.displayName || auth.currentUser?.displayName || '',
        symptoms:       symptomText,
        aiResponse:     aiText,
        priority,
        riskScore,
        aiReasoning:    reasoning,
        status:         'queued',
        createdAt:      serverTimestamp(),
        queuePosition:  null,
        estimatedWait:  null,
        nurseDecision:  null,
        overrideReason: null,
      });

      setSymptoms(''); setSelected([]); setDuration(''); setSeverity(5); setRecordingUri(null);

      navigation.navigate('TriageResult', {
        caseId: caseRef.id, priority, riskScore, reasoning, symptoms: symptomText, aiText,
      });
    } catch (err) {
      console.error('Triage submit error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      {/* Header */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}>
        <Text style={styles.headerTitle}>Check Symptoms</Text>
        <Text style={styles.headerSub}>Tell us how you feel — we'll assess your urgency</Text>

        <View style={styles.modeToggle}>
          {['text', 'voice'].map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => setMode(m)}>
              <Ionicons
                name={m === 'text' ? 'create-outline' : 'mic-outline'}
                size={16}
                color={mode === m ? COLORS.primary : COLORS.white}
              />
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'text' ? 'Type' : 'Speak'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Privacy notice */}
          <View style={styles.privacyBanner}>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.primary} />
            <Text style={styles.privacyText}>
              Your information is private and encrypted. Only your healthcare team can view it.
            </Text>
          </View>

          {mode === 'text' ? (
            <>
              {/* Symptom chips */}
              <Text style={styles.cardLabel}>Common Symptoms</Text>
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

              {/* Freetext */}
              <Text style={styles.cardLabel}>Describe in your own words</Text>
              <View style={styles.textAreaWrap}>
                <TextInput
                  style={styles.textArea}
                  placeholder='e.g. "I have had chest pain for two days with shortness of breath..."'
                  placeholderTextColor={COLORS.textTertiary}
                  value={symptoms}
                  onChangeText={setSymptoms}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Duration */}
              <Text style={styles.cardLabel}>How long have you had these symptoms?</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="time-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.inlineInput}
                  placeholder="e.g. 2 days, since yesterday morning..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={duration}
                  onChangeText={setDuration}
                />
              </View>

              {/* Severity */}
              <Text style={styles.cardLabel}>
                Pain / Discomfort Severity:{' '}
                <Text style={{ color: severity >= 8 ? COLORS.critical : COLORS.primary }}>{severity}/10</Text>
              </Text>
              <View style={styles.severityRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
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
            </>
          ) : (
            /* Voice mode */
            <View style={styles.voiceContainer}>
              <View style={[styles.micCircle, isRecording && styles.micCircleActive]}>
                <Ionicons
                  name={isRecording ? 'stop-circle' : 'mic'}
                  size={56}
                  color={isRecording ? COLORS.critical : COLORS.primary}
                />
              </View>
              <Text style={styles.voiceTitle}>
                {recordingUri ? 'Recording saved' : isRecording ? 'Listening...' : 'Tap to speak'}
              </Text>
              <Text style={styles.voiceSub}>
                {recordingUri
                  ? 'Your voice recording is ready for analysis'
                  : isRecording
                    ? 'Speak clearly about your symptoms'
                    : 'Describe your symptoms naturally in your own language'}
              </Text>

              {!isRecording && !recordingUri && (
                <TouchableOpacity style={styles.recordBtn} onPress={startRecording}>
                  <Text style={styles.recordBtnText}>Start Recording</Text>
                </TouchableOpacity>
              )}
              {isRecording && (
                <TouchableOpacity
                  style={[styles.recordBtn, { backgroundColor: COLORS.critical }]}
                  onPress={stopRecording}>
                  <Text style={styles.recordBtnText}>Stop Recording</Text>
                </TouchableOpacity>
              )}
              {recordingUri && !isRecording && (
                <TouchableOpacity style={styles.recordBtn} onPress={() => setRecordingUri(null)}>
                  <Text style={styles.recordBtnText}>Re-record</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.submitGradient}>
              {loading
                ? <ActivityIndicator color={COLORS.white} />
                : (
                  <>
                    <Ionicons name="analytics-outline" size={20} color={COLORS.white} />
                    <Text style={styles.submitText}>Analyse Symptoms</Text>
                  </>
                )
              }
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            This is an AI-assisted assessment. A healthcare professional will make the final decision.
          </Text>
          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Parse helpers ────────────────────────────────────────────────────────────

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 24, paddingHorizontal: 24,
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.70)', marginTop: 4 },

  modeToggle: {
    flexDirection: 'row', marginTop: 16, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 3, gap: 2,
  },
  modeBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  modeBtnActive:    { backgroundColor: COLORS.white },
  modeBtnText:      { fontSize: 13, fontWeight: '600', color: COLORS.white },
  modeBtnTextActive:{ color: COLORS.primary },

  scroll: { paddingTop: 16, paddingHorizontal: 20 },

  privacyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 10,
    padding: 10, marginBottom: 20,
  },
  privacyText: { flex: 1, fontSize: 11, color: COLORS.primary, fontWeight: '500', lineHeight: 15 },

  cardLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.border,
  },
  chipActive:    { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  chipText:      { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive:{ color: COLORS.primary },

  textAreaWrap: {
    backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1.5,
    borderColor: COLORS.border, padding: 14, marginBottom: 20, minHeight: 100,
  },
  textArea: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 22, minHeight: 80 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1.5,
    borderColor: COLORS.border, paddingHorizontal: 14, height: 50, marginBottom: 20,
  },
  inlineInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },

  severityRow: { flexDirection: 'row', gap: 5, marginBottom: 24 },
  severityBtn: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: COLORS.backgroundTertiary, borderWidth: 1, borderColor: COLORS.border,
  },
  severityBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  severityText:      { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  severityTextActive:{ color: COLORS.white },

  // Voice
  voiceContainer: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  micCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.primaryGlow,
  },
  micCircleActive: { backgroundColor: COLORS.criticalLight, borderColor: COLORS.critical },
  voiceTitle:      { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  voiceSub:        { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
  recordBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 8,
  },
  recordBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },

  // Submit
  submitBtn:         { borderRadius: 16, overflow: 'hidden', marginTop: 8, marginBottom: 12 },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 10,
  },
  submitText: { fontSize: 16, fontWeight: '800', color: COLORS.white },

  disclaimer: {
    fontSize: 11, color: COLORS.textTertiary, textAlign: 'center',
    lineHeight: 16, paddingHorizontal: 16,
  },
});
