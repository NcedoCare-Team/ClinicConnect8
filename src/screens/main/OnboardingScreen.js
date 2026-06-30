// src/screens/main/OnboardingScreen.js
// NcedoCare patient health profile — collected once after first login.
// Captures: language preference, chronic conditions, allergies, medications.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, StatusBar, KeyboardAvoidingView, ScrollView,
  Animated, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'st', label: 'Sesotho' },
];

const COMMON_CONDITIONS = [
  'Hypertension', 'Diabetes', 'Asthma', 'HIV/AIDS',
  'Heart Disease', 'Epilepsy', 'Arthritis', 'TB',
];

export default function OnboardingScreen({ navigation }) {
  const displayName = auth.currentUser?.displayName || 'there';
  const firstName   = displayName.split(' ')[0];

  const [language,    setLanguage]    = useState('en');
  const [conditions,  setConditions]  = useState([]);   // selected from chips
  const [customCond,  setCustomCond]  = useState('');   // freetext additional
  const [allergies,   setAllergies]   = useState('');
  const [medications, setMedications] = useState('');
  const [saving,      setSaving]      = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const toggleCondition = (cond) => {
    setConditions(prev =>
      prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]
    );
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const allConditions = [
        ...conditions,
        ...customCond.split(',').map(s => s.trim()).filter(Boolean),
      ];
      await UserProfileService.saveProfile({
        displayName,
        language,
        chronicConditions: allConditions,
        allergies: allergies.trim(),
        currentMedications: medications.trim(),
      });
      await UserProfileService.setOnboardingDone();
      navigation.replace('Main');
    } catch (err) {
      console.log('Onboarding save error:', err);
      Alert.alert('Error', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await UserProfileService.setOnboardingDone();
    navigation.replace('Main');
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient
        colors={['rgba(27,107,71,0.07)', 'rgba(27,107,71,0.01)', 'transparent']}
        style={s.topGradient}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* Welcome */}
            <View style={s.welcomeSection}>
              <View style={s.iconWrap}>
                <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={s.iconGradient}>
                  <Ionicons name="heart-outline" size={28} color="#FFFFFF" />
                </LinearGradient>
              </View>
              <Text style={s.welcomeTitle}>Welcome, {firstName}!</Text>
              <Text style={s.welcomeSub}>
                Help us keep you safe by sharing a few health details. This information is encrypted and only seen by your healthcare team.
              </Text>
            </View>

            {/* Language */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="language-outline" size={18} color={COLORS.primary} />
                <Text style={s.sectionTitle}>Preferred Language</Text>
              </View>
              <View style={s.chipsRow}>
                {LANGUAGES.map(l => (
                  <TouchableOpacity
                    key={l.code}
                    style={[s.chip, language === l.code && s.chipActive]}
                    onPress={() => setLanguage(l.code)}>
                    <Text style={[s.chipText, language === l.code && s.chipTextActive]}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Chronic conditions */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="pulse-outline" size={18} color={COLORS.primary} />
                <Text style={s.sectionTitle}>Chronic Conditions</Text>
              </View>
              <Text style={s.sectionSub}>Select all that apply</Text>
              <View style={s.chipsRow}>
                {COMMON_CONDITIONS.map(cond => (
                  <TouchableOpacity
                    key={cond}
                    style={[s.chip, conditions.includes(cond) && s.chipActive]}
                    onPress={() => toggleCondition(cond)}>
                    {conditions.includes(cond) && (
                      <Ionicons name="checkmark" size={12} color={COLORS.primary} />
                    )}
                    <Text style={[s.chipText, conditions.includes(cond) && s.chipTextActive]}>{cond}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={s.input}
                placeholder="Other conditions, comma separated..."
                placeholderTextColor={COLORS.textTertiary}
                value={customCond}
                onChangeText={setCustomCond}
              />
            </View>

            {/* Allergies */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="warning-outline" size={18} color={COLORS.primary} />
                <Text style={s.sectionTitle}>Allergies</Text>
              </View>
              <TextInput
                style={s.input}
                placeholder="e.g. Penicillin, Peanuts, Latex..."
                placeholderTextColor={COLORS.textTertiary}
                value={allergies}
                onChangeText={setAllergies}
              />
            </View>

            {/* Current medications */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="medkit-outline" size={18} color={COLORS.primary} />
                <Text style={s.sectionTitle}>Current Medications</Text>
              </View>
              <TextInput
                style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="e.g. Metformin 500mg, Amlodipine 5mg..."
                placeholderTextColor={COLORS.textTertiary}
                value={medications}
                onChangeText={setMedications}
                multiline
              />
            </View>

            {/* Continue */}
            <TouchableOpacity
              style={s.continueBtn}
              onPress={handleComplete}
              disabled={saving}
              activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={s.continueBtnGradient}>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={s.continueBtnText}>{saving ? 'Saving...' : 'Complete Setup'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
              <Text style={s.skipText}>Skip for now</Text>
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#FFFFFF' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 70 : (StatusBar.currentHeight || 0) + 30,
  },

  welcomeSection: { alignItems: 'center', marginBottom: 28 },
  iconWrap:       { marginBottom: 16 },
  iconGradient: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  welcomeSub:   {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 8,
  },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  sectionSub:    { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10, marginTop: -6 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  chipActive:    { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  chipText:      { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive:{ color: COLORS.primary },

  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14, color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundSecondary, marginTop: 6,
  },

  continueBtn:         { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  continueBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 8,
  },
  continueBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  skipBtn:  { alignItems: 'center', paddingVertical: 16 },
  skipText: { fontSize: 14, fontWeight: '600', color: COLORS.textTertiary },
});
