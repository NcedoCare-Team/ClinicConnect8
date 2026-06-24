// src/screens/main/OnboardingScreen.js
// Shown once after first account creation. Collects target role + 2 skills.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, StatusBar, KeyboardAvoidingView, ScrollView,
  Animated, Dimensions, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';

const { width: W } = Dimensions.get('window');

const TARGET_ROLES = [
  { label: 'Software Developer',   icon: 'code-slash',       value: 'Software Developer' },
  { label: 'Business Analyst',     icon: 'analytics-outline', value: 'Business Analyst' },
  { label: 'Data Analyst',         icon: 'bar-chart-outline', value: 'Data Analyst' },
  { label: 'Project Manager',      icon: 'people-outline',    value: 'Project Manager' },
  { label: 'UX / UI Designer',     icon: 'color-palette-outline', value: 'UX/UI Designer' },
  { label: 'Marketing Specialist', icon: 'megaphone-outline', value: 'Marketing Specialist' },
  { label: 'Accountant / Finance', icon: 'calculator-outline', value: 'Accountant' },
  { label: 'Admin / Office Support', icon: 'desktop-outline', value: 'Admin Support' },
  { label: 'Customer Service',     icon: 'chatbubble-ellipses-outline', value: 'Customer Service' },
  { label: 'Other',                icon: 'ellipsis-horizontal', value: 'Other' },
];

export default function OnboardingScreen({ navigation }) {
  const displayName = auth.currentUser?.displayName || 'there';
  const firstName = displayName.split(' ')[0];

  const [targetRole, setTargetRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [skill1, setSkill1] = useState('');
  const [skill2, setSkill2] = useState('');
  const [saving, setSaving] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const resolvedRole = targetRole === 'Other' ? customRole.trim() : targetRole;
  const isValid = resolvedRole.length > 0 && skill1.trim().length > 0 && skill2.trim().length > 0;

  const handleComplete = async () => {
    if (!isValid) {
      Alert.alert('Almost there', 'Please select a target role and enter at least 2 skills.');
      return;
    }

    setSaving(true);
    try {
      await UserProfileService.saveProfile({
        displayName,
        targetRole: resolvedRole,
        field: resolvedRole,
        skills: [skill1.trim(), skill2.trim()],
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

      {/* Decorative gradient at top */}
      <LinearGradient
        colors={['rgba(37,99,235,0.08)', 'rgba(37,99,235,0.01)', 'transparent']}
        style={s.topGradient}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* Welcome */}
            <View style={s.welcomeSection}>
              <View style={s.iconWrap}>
                <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={s.iconGradient}>
                  <Ionicons name="rocket-outline" size={28} color="#FFFFFF" />
                </LinearGradient>
              </View>
              <Text style={s.welcomeTitle}>Welcome, {firstName}!</Text>
              <Text style={s.welcomeSub}>
                Let's set up your career profile so VisionAlly can find the best opportunities for you.
              </Text>
            </View>

            {/* Target Role */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="briefcase-outline" size={18} color={COLORS.primary} />
                <Text style={s.sectionTitle}>What role are you targeting?</Text>
              </View>
              <Text style={s.sectionSub}>Pick the one that best describes your goal</Text>

              <View style={s.rolesGrid}>
                {TARGET_ROLES.map((role) => (
                  <TouchableOpacity
                    key={role.value}
                    style={[s.roleChip, targetRole === role.value && s.roleChipActive]}
                    onPress={() => setTargetRole(role.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={role.icon}
                      size={16}
                      color={targetRole === role.value ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text style={[s.roleChipText, targetRole === role.value && s.roleChipTextActive]}>
                      {role.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {targetRole === 'Other' && (
                <TextInput
                  style={s.input}
                  placeholder="Enter your target role..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={customRole}
                  onChangeText={setCustomRole}
                  autoCapitalize="words"
                />
              )}
            </View>

            {/* Skills */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Ionicons name="flash-outline" size={18} color={COLORS.primary} />
                <Text style={s.sectionTitle}>Your top skills</Text>
              </View>
              <Text style={s.sectionSub}>Add at least 2 — you can add more in Settings later</Text>

              <View style={s.skillRow}>
                <View style={s.skillBadge}><Text style={s.skillBadgeText}>1</Text></View>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="e.g. JavaScript, Financial Analysis..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={skill1}
                  onChangeText={setSkill1}
                  autoCapitalize="words"
                />
              </View>

              <View style={s.skillRow}>
                <View style={s.skillBadge}><Text style={s.skillBadgeText}>2</Text></View>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="e.g. React Native, Project Management..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={skill2}
                  onChangeText={setSkill2}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={[s.continueBtn, !isValid && s.continueBtnDisabled]}
              onPress={handleComplete}
              disabled={!isValid || saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isValid ? [COLORS.primary, COLORS.primaryDark] : ['#D1D5DB', '#9CA3AF']}
                style={s.continueBtnGradient}
              >
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={s.continueBtnText}>
                  {saving ? 'Saving...' : 'Get Started'}
                </Text>
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 70 : (StatusBar.currentHeight || 0) + 30,
  },

  welcomeSection: { alignItems: 'center', marginBottom: 28 },
  iconWrap: { marginBottom: 16 },
  iconGradient: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  welcomeTitle: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  welcomeSub: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 10,
  },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  sectionSub: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 14, marginLeft: 26 },

  rolesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  roleChipActive: {
    backgroundColor: `${COLORS.primary}10`,
    borderColor: COLORS.primary,
  },
  roleChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  roleChipTextActive: { color: COLORS.primary },

  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 14, color: COLORS.textPrimary, fontWeight: '500',
    backgroundColor: COLORS.backgroundSecondary, marginBottom: 10, marginTop: 10,
  },

  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  skillBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  skillBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },

  continueBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  continueBtnDisabled: { opacity: 0.6 },
  continueBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 8,
  },
  continueBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  skipBtn: { alignItems: 'center', paddingVertical: 16 },
  skipText: { fontSize: 14, fontWeight: '600', color: COLORS.textTertiary },
});
