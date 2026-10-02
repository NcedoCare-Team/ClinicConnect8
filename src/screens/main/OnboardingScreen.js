// First-login profile — name, ID, date of birth. Then opens the app dashboard.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, StatusBar, KeyboardAvoidingView, ScrollView,
  Animated, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';
import DateOfBirthField, { ageFromDate, formatDobISO } from '../../components/DateOfBirthField';

export default function OnboardingScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [idNumber,  setIdNumber]  = useState('');
  const [dob, setDob] = useState(new Date(1990, 0, 1));
  const [saving, setSaving] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleComplete = async () => {
    if (!firstName.trim()) return Alert.alert('Required', 'Please enter your first name.');
    if (!lastName.trim())  return Alert.alert('Required', 'Please enter your last name.');
    if (!idNumber.trim())  return Alert.alert('Required', 'Please enter your ID or passport number.');

    const age = ageFromDate(dob);
    if (age === null) return Alert.alert('Required', 'Please select a valid date of birth.');

    setSaving(true);
    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      const dateOfBirth = formatDobISO(dob);

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName });
      }

      await UserProfileService.saveProfile({
        displayName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        idNumber: idNumber.trim(),
        dateOfBirth,
        patientAge: age,
      });
      await UserProfileService.setOnboardingDone();
    } catch (err) {
      console.log('Onboarding save error:', err);
      Alert.alert('Error', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient
        colors={['rgba(22,179,165,0.12)', 'rgba(22,179,165,0.02)', 'transparent']}
        style={s.topGradient}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            <View style={s.welcomeSection}>
              <View style={s.iconWrap}>
                <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={s.iconGradient}>
                  <Ionicons name="shield-checkmark-outline" size={28} color="#FFFFFF" />
                </LinearGradient>
              </View>
              <Text style={s.welcomeTitle}>Complete your profile</Text>
              <Text style={s.welcomeSub}>
                These details identify you at your healthcare facility. They are encrypted and accessible only to your chosen facility.
              </Text>
            </View>

            <View style={s.card}>
              <Text style={s.label}>First Name</Text>
              <View style={s.inputWrap}>
                <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={s.input}
                  placeholder="First name"
                  placeholderTextColor={COLORS.textTertiary}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>

              <Text style={s.label}>Last Name</Text>
              <View style={s.inputWrap}>
                <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={s.input}
                  placeholder="Last name"
                  placeholderTextColor={COLORS.textTertiary}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>

              <Text style={s.label}>ID / Passport Number</Text>
              <View style={s.inputWrap}>
                <Ionicons name="card-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={s.input}
                  placeholder="National ID or passport"
                  placeholderTextColor={COLORS.textTertiary}
                  value={idNumber}
                  onChangeText={setIdNumber}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={s.label}>Date of Birth</Text>
              <DateOfBirthField value={dob} onChange={setDob} />
            </View>

            <View style={s.securityNote}>
              <Ionicons name="lock-closed" size={16} color={COLORS.primary} />
              <Text style={s.securityText}>
                Your name, ID, and date of birth are stored securely and transmitted end-to-end to your selected healthcare facility only. No third party can access your data.
              </Text>
            </View>

            <TouchableOpacity
              style={s.continueBtn}
              onPress={handleComplete}
              disabled={saving}
              activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={s.continueBtnGradient}>
                <Ionicons name="arrow-forward-circle" size={20} color="#FFFFFF" />
                <Text style={s.continueBtnText}>
                  {saving ? 'Saving...' : 'Continue to dashboard'}
                </Text>
              </LinearGradient>
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

  welcomeSection: { alignItems: 'center', marginBottom: 24 },
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
  label: {
    fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8, marginTop: 4,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 52, marginBottom: 14,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary },

  securityNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 14,
    padding: 14, marginBottom: 20,
  },
  securityText: {
    flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '500', lineHeight: 18,
  },

  continueBtn:         { borderRadius: 16, overflow: 'hidden' },
  continueBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 8,
  },
  continueBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
