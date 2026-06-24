// src/screens/main/AboutMeScreen.js
// Collects the user's profile information and saves it to Firestore.
// This data directly enriches the AI interviewer's system instructions,
// so fields are carefully chosen: only what the AI truly needs to know.

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { InterviewStorageService } from '../../services/InterviewStorageService';
import { UserProfileService } from '../../services/UserProfileService';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  primary:          '#8B5CF6',
  primaryDark:      '#7C3AED',
  primaryLight:     '#A78BFA',
  primaryVeryLight: '#EDE9FE',
  bg:               '#FAFAFA',
  white:            '#FFFFFF',
  text:             '#111827',
  textSec:          '#6B7280',
  textTer:          '#9CA3AF',
  border:           '#E5E7EB',
  borderLight:      '#F3F4F6',
  success:          '#10B981',
  error:            '#EF4444',
};

// ─── Option Sets (concise — only what the AI needs) ──────────────────────────
const DISABILITY_OPTIONS = [
  { label: 'Visual Impairment',               value: 'visual_impairment' },
  { label: 'Hearing Impairment',              value: 'hearing_impairment' },
  { label: 'Physical / Motor Disability',     value: 'physical_motor' },
  { label: 'Cognitive / Neurological\n(ADHD, Autism, Dyslexia…)', value: 'cognitive_neurological' },
  { label: 'Speech / Communication',          value: 'speech_communication' },
  { label: 'Mental Health Condition',         value: 'mental_health' },
  { label: 'Chronic Illness',                 value: 'chronic_illness' },
  { label: 'Multiple Disabilities',           value: 'multiple' },
  { label: 'Prefer not to disclose',          value: 'not_disclosed' },
];

const EDUCATION_OPTIONS = [
  { label: 'High School / GED',              value: 'high_school' },
  { label: "Associate's Degree",             value: 'associates' },
  { label: "Bachelor's Degree",              value: 'bachelors' },
  { label: "Master's Degree",                value: 'masters' },
  { label: 'PhD / Doctorate',                value: 'phd' },
  { label: 'Professional Certification',     value: 'certification' },
  { label: 'Bootcamp / Self-taught',         value: 'bootcamp' },
  { label: 'Currently Studying',             value: 'student' },
];

const CAREER_GOAL_OPTIONS = [
  { label: '💼 Full-time Employment',         value: 'Full-time employment' },
  { label: '⏰ Part-time / Flexible Work',    value: 'Part-time employment' },
  { label: '🎓 Internship / Graduate Role',   value: 'Internship' },
  { label: '🔄 Career Change',                value: 'Career change' },
  { label: '📈 Promotion / Step Up',          value: 'Promotion' },
  { label: '🌍 Freelance / Contract',         value: 'Freelance work' },
];

const EXPERIENCE_RANGES = [
  { label: 'Student / No experience', value: '0' },
  { label: '< 1 year',                value: '0.5' },
  { label: '1–2 years',               value: '1' },
  { label: '3–5 years',               value: '3' },
  { label: '6–10 years',              value: '6' },
  { label: '10+ years',               value: '10' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const SectionLabel = ({ icon, title, subtitle }) => (
  <View style={styles.sectionLabel}>
    <View style={styles.sectionLabelIcon}>
      <Ionicons name={icon} size={16} color={C.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionLabelTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionLabelSub}>{subtitle}</Text>}
    </View>
  </View>
);

const OptionPill = ({ option, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.pill, selected && styles.pillSelected]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
      {option.label}
    </Text>
    {selected && <Ionicons name="checkmark" size={12} color={C.primary} style={{ marginLeft: 4 }} />}
  </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AboutMeScreen({ navigation, route }) {
  const { onComplete } = route?.params ?? {};  // callback after save
  const uid = auth.currentUser?.uid;

  const [saving,      setSaving]      = useState(false);
  const [loading,     setLoading]     = useState(true);
  const fadeAnim                      = useRef(new Animated.Value(0)).current;

  // ── Form state ──────────────────────────────────────────────────────────────
  const [firstName,    setFirstName]    = useState('');
  const [disability,   setDisability]   = useState('');
  const [accommodation,setAccommodation]= useState('');
  const [field,        setField]        = useState('');
  const [experience,   setExperience]   = useState('');
  const [education,    setEducation]    = useState('');
  const [skills,       setSkills]       = useState(['', '', '']);  // exactly 3 skill slots
  const [careerGoal,   setCareerGoal]   = useState('');

  // ── Load existing data ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (!uid) return;
        // Load from UserProfileService (local-first, then Firebase)
        const cached = await UserProfileService.getProfile();

        if (cached && (cached.disability || cached.field || cached.careerGoal)) {
          setFirstName(cached.displayName?.split(' ')[0] ?? auth.currentUser?.displayName?.split(' ')[0] ?? '');
          setDisability(cached.disability  ?? '');
          setAccommodation(cached.accommodation ?? '');
          setField(cached.field            ?? '');
          setExperience(cached.experience  ?? '');
          setEducation(cached.education    ?? '');
          setSkills(cached.skills?.length ? [...cached.skills, '', '', ''].slice(0, 3) : ['', '', '']);
          setCareerGoal(cached.careerGoal  ?? '');
        } else {
          // Fallback: try Firestore directly
          const snap = await getDoc(doc(firestore, 'users', uid, 'profile', 'about_me'));
          const data = snap.exists() ? snap.data() : null;

          if (data) {
            setFirstName(data.firstName   ?? auth.currentUser?.displayName?.split(' ')[0] ?? '');
            setDisability(data.disability  ?? '');
            setAccommodation(data.accommodation ?? '');
            setField(data.field            ?? '');
            setExperience(data.experience  ?? '');
            setEducation(data.education    ?? '');
            setSkills(data.skills?.length ? [...data.skills, '', '', ''].slice(0, 3) : ['', '', '']);
            setCareerGoal(data.careerGoal  ?? '');
          } else {
            const name = auth.currentUser?.displayName ?? '';
            setFirstName(name.split(' ')[0]);
          }
        }
      } catch (err) {
        console.error('[AboutMe] load error:', err);
      } finally {
        setLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    })();
  }, [uid]);

  // ── Validation ───────────────────────────────────────────────────────────────
  const isValid = firstName.trim().length > 0
    && disability.length > 0
    && field.trim().length > 0
    && experience.length > 0
    && education.length > 0
    && careerGoal.length > 0
    && skills.some(s => s.trim().length > 0);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isValid) {
      Alert.alert('Incomplete Profile', 'Please fill in all required fields before saving.');
      return;
    }
    setSaving(true);
    try {
      const profile = {
        firstName:     firstName.trim(),
        disability,
        accommodation: accommodation.trim(),
        field:         field.trim(),
        experience,
        education,
        skills:        skills.map(s => s.trim()).filter(Boolean),
        careerGoal,
        updatedAt:     new Date().toISOString(),
      };

      // Save to Firestore (legacy path)
      await setDoc(doc(firestore, 'users', uid, 'profile', 'about_me'), profile, { merge: true });

      // Cache locally for fast access
      await InterviewStorageService.cacheAboutMe(profile);

      // Also sync through UserProfileService so Settings and all screens stay consistent
      await UserProfileService.saveProfile({
        displayName: auth.currentUser?.displayName || firstName.trim(),
        disability,
        accommodation: accommodation.trim(),
        field: field.trim(),
        experience,
        education,
        skills: skills.map(s => s.trim()).filter(Boolean),
        careerGoal,
        targetRole: field.trim(),
      });

      Alert.alert(
        '✅ Profile Saved',
        `Great, ${profile.firstName}! Your profile is ready. The AI will use this to personalise every interview session.`,
        [{ text: 'Continue', onPress: () => onComplete ? onComplete(profile) : navigation.goBack() }],
      );
    } catch (err) {
      console.error('[AboutMe] save error:', err);
      Alert.alert('Save Failed', 'Could not save your profile. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Header */}
      <LinearGradient
        colors={['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.02)']}
        style={styles.headerGradient}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : null}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>About Me</Text>
          <Text style={styles.headerSub}>Helps the AI personalise your interview</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Info Banner ────────────────────────────────────────────────── */}
          <View style={styles.infoBanner}>
            <Ionicons name="shield-checkmark" size={18} color={C.primary} />
            <Text style={styles.infoBannerText}>
              Your information is stored securely and only used to tailor your mock interview sessions.
            </Text>
          </View>

          {/* ══ SECTION 1: Identity ══════════════════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel icon="person-outline" title="First Name *" subtitle="How the AI will address you" />
            <TextInput
              style={styles.input}
              placeholder="e.g. Jordan"
              placeholderTextColor={C.textTer}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
          </View>

          {/* ══ SECTION 2: Disability ════════════════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel
              icon="accessibility-outline"
              title="Disability / Accessibility Category *"
              subtitle="Helps the AI adapt its communication style and pacing"
            />
            <View style={styles.pillGrid}>
              {DISABILITY_OPTIONS.map(opt => (
                <OptionPill
                  key={opt.value}
                  option={opt}
                  selected={disability === opt.value}
                  onPress={() => setDisability(opt.value)}
                />
              ))}
            </View>
          </View>

          {/* ══ SECTION 3: Accommodation Needs ══════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel
              icon="options-outline"
              title="Specific Accommodation Needs"
              subtitle="Optional — e.g. 'I need more processing time', 'I use a screen reader'"
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Describe any specific needs for the AI to be aware of…"
              placeholderTextColor={C.textTer}
              value={accommodation}
              onChangeText={setAccommodation}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ══ SECTION 4: Professional Background ══════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel
              icon="briefcase-outline"
              title="Industry / Field *"
              subtitle="So the AI asks role-relevant questions"
            />
            <TextInput
              style={styles.input}
              placeholder="e.g. Software Engineering, Marketing, Finance…"
              placeholderTextColor={C.textTer}
              value={field}
              onChangeText={setField}
              autoCapitalize="words"
            />
          </View>

          {/* ══ SECTION 5: Experience ════════════════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel
              icon="time-outline"
              title="Years of Experience *"
              subtitle="Helps calibrate question difficulty"
            />
            <View style={styles.pillGrid}>
              {EXPERIENCE_RANGES.map(opt => (
                <OptionPill
                  key={opt.value}
                  option={opt}
                  selected={experience === opt.value}
                  onPress={() => setExperience(opt.value)}
                />
              ))}
            </View>
          </View>

          {/* ══ SECTION 6: Education ════════════════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel icon="school-outline" title="Highest Education Level *" />
            <View style={styles.pillGrid}>
              {EDUCATION_OPTIONS.map(opt => (
                <OptionPill
                  key={opt.value}
                  option={opt}
                  selected={education === opt.value}
                  onPress={() => setEducation(opt.value)}
                />
              ))}
            </View>
          </View>

          {/* ══ SECTION 7: Top Skills ════════════════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel
              icon="flash-outline"
              title="Top 3 Skills *"
              subtitle="The AI will frame questions around these"
            />
            {skills.map((skill, idx) => (
              <View key={idx} style={styles.skillRow}>
                <View style={styles.skillBadge}>
                  <Text style={styles.skillBadgeText}>{idx + 1}</Text>
                </View>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={`Skill ${idx + 1} — e.g. ${['React Native', 'Project Management', 'Data Analysis'][idx]}`}
                  placeholderTextColor={C.textTer}
                  value={skill}
                  onChangeText={(v) => {
                    const updated = [...skills];
                    updated[idx]  = v;
                    setSkills(updated);
                  }}
                />
              </View>
            ))}
          </View>

          {/* ══ SECTION 8: Career Goal ═══════════════════════════════════════ */}
          <View style={styles.card}>
            <SectionLabel
              icon="trending-up-outline"
              title="Current Career Goal *"
              subtitle="Sets the interview's focus and tone"
            />
            <View style={styles.goalGrid}>
              {CAREER_GOAL_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.goalItem, careerGoal === opt.value && styles.goalItemSelected]}
                  onPress={() => setCareerGoal(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.goalText, careerGoal === opt.value && styles.goalTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Validation hint ─────────────────────────────────────────────── */}
          {!isValid && (
            <View style={styles.validationHint}>
              <Ionicons name="information-circle-outline" size={16} color={C.textSec} />
              <Text style={styles.validationHintText}>
                Fields marked * are required before starting an interview.
              </Text>
            </View>
          )}

          {/* ── Save Button ─────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, (!isValid || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isValid || saving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={isValid && !saving ? [C.primary, C.primaryDark] : ['#D1D5DB', '#9CA3AF']}
              style={styles.saveBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={C.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={C.white} />
                  <Text style={styles.saveBtnText}>Save Profile</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  loadingContainer:{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

  headerGradient: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: Platform.OS === 'ios' ? 200 : 180, zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingTop:    Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 14,
    paddingHorizontal: 20,
    paddingBottom:  14,
    gap: 12,
    zIndex: 1,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity:0.08, shadowRadius:6 },
      android: { elevation: 3 },
    }),
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 12, color: C.textSec, marginTop: 2, fontWeight: '500' },

  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  // Banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: `${C.primary}12`,
    borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: `${C.primary}20`,
  },
  infoBannerText: { flex: 1, fontSize: 12, color: C.textSec, lineHeight: 18, fontWeight: '500' },

  // Cards
  card: {
    backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 14,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity:0.06, shadowRadius:8 },
      android: { elevation: 2 },
    }),
  },

  // Section label
  sectionLabel: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  sectionLabelIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: `${C.primary}15`, alignItems: 'center', justifyContent: 'center',
  },
  sectionLabelTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  sectionLabelSub:   { fontSize: 11, color: C.textSec, marginTop: 2, fontWeight: '500' },

  // Inputs
  input: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 14, color: C.text, fontWeight: '500',
    backgroundColor: C.bg, marginBottom: 10,
  },
  inputMultiline: { height: 90, paddingTop: 12 },

  // Pills
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: C.borderLight,
    borderWidth: 1.5, borderColor: C.border,
  },
  pillSelected: {
    backgroundColor: `${C.primary}15`,
    borderColor: C.primary,
  },
  pillText:         { fontSize: 12, fontWeight: '600', color: C.textSec },
  pillTextSelected: { color: C.primary },

  // Skills
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  skillBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${C.primary}15`, alignItems: 'center', justifyContent: 'center',
  },
  skillBadgeText: { fontSize: 12, fontWeight: '800', color: C.primary },

  // Career goals
  goalGrid: { gap: 8 },
  goalItem: {
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
    backgroundColor: C.borderLight, borderWidth: 1.5, borderColor: C.border,
  },
  goalItemSelected: { backgroundColor: `${C.primary}15`, borderColor: C.primary },
  goalText:         { fontSize: 13, fontWeight: '600', color: C.textSec },
  goalTextSelected: { color: C.primaryDark },

  // Validation
  validationHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 4, marginBottom: 12,
  },
  validationHintText: { fontSize: 12, color: C.textSec, fontWeight: '500', flex: 1 },

  // Save Button
  saveBtn:           { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  saveBtnDisabled:   { opacity: 0.6 },
  saveBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: C.white, letterSpacing: 0.2 },
});