// src/screens/main/FacilityWelcomeScreen.js
// NcedoCare — Welcome to selected facility + patient intake form.
// Collects name, surname, and age for this session, saves to Firestore,
// then routes to the Assessment (symptom checker) tab.

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Platform, StatusBar, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { SessionService } from '../../services/SessionService';

const TYPE_ICON = {
  hospital: 'business',
  clinic:   'medical',
  pharmacy: 'flask',
  doctor:   'person-circle',
};

const TYPE_COLOR = {
  hospital: [COLORS.primaryDark, COLORS.primary],
  clinic:   [COLORS.primary, '#2D8A5E'],
  pharmacy: ['#0369A1', '#0EA5E9'],
  doctor:   ['#7C3AED', '#A78BFA'],
};

export default function FacilityWelcomeScreen({ navigation, route }) {
  const { facility, userLocation } = route.params || {};

  const facilityName     = facility?.name     || 'Healthcare Facility';
  const facilityType     = facility?.type     || 'clinic';
  const facilityAddress  = facility?.address  || 'South Africa';
  const facilityOwnership = facility?.ownership || 'public';

  const headerGradient = TYPE_COLOR[facilityType] || TYPE_COLOR.clinic;
  const headerIcon     = TYPE_ICON[facilityType]  || 'business';

  const [firstName, setFirstName] = useState('');
  const [surname,   setSurname]   = useState('');
  const [age,       setAge]       = useState('');
  const [saving,    setSaving]    = useState(false);

  const surnameRef = useRef(null);
  const ageRef     = useRef(null);

  const validate = () => {
    if (!firstName.trim()) { Alert.alert('First name required', 'Please enter your first name.'); return false; }
    if (!surname.trim())   { Alert.alert('Surname required', 'Please enter your surname.'); return false; }
    const ageNum = parseInt(age, 10);
    if (!age.trim() || isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      Alert.alert('Valid age required', 'Please enter a valid age between 1 and 120.');
      return false;
    }
    return true;
  };

  const handleStart = async () => {
    if (!validate()) return;
    Keyboard.dismiss();
    setSaving(true);

    const sessionData = {
      facilityId:      facility?.id   || '',
      facilityName,
      facilityType,
      facilityAddress,
      facilityOwnership,
      facilityLat:     facility?.lat  || null,
      facilityLng:     facility?.lng  || null,
      patientFirstName: firstName.trim(),
      patientSurname:   surname.trim(),
      patientAge:       parseInt(age, 10),
      sessionStartedAt: new Date().toISOString(),
    };

    // Session stored in-memory only — clears on app restart (by design)
    SessionService.setSession(sessionData);

    setSaving(false);

    // Navigate to Main and switch directly to Assessment tab
    navigation.navigate('Main', { tab: 'assessment' });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" translucent />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Gradient hero header */}
        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}>

          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Decorative circles */}
          <View style={styles.deco1} />
          <View style={styles.deco2} />

          {/* Facility icon */}
          <View style={styles.facilityIconWrap}>
            <View style={styles.facilityIconRing}>
              <Ionicons name={headerIcon} size={38} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.facilityName} numberOfLines={2}>{facilityName}</Text>

          {/* Address + ownership row */}
          <View style={styles.heroMetaRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroBadgeText} numberOfLines={1}>{facilityAddress}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons
                name={facilityOwnership === 'private' ? 'card-outline' : 'shield-checkmark-outline'}
                size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroBadgeText}>
                {facilityOwnership === 'private' ? 'Private' : 'Public'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Form card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Tell us about yourself</Text>
          <Text style={styles.formSub}>
            This helps your healthcare team identify you quickly. Your information is kept private.
          </Text>

          {/* First name */}
          <Text style={styles.label}>First Name</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Thabo"
              placeholderTextColor={COLORS.textTertiary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => surnameRef.current?.focus()}
            />
          </View>

          {/* Surname */}
          <Text style={styles.label}>Surname</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              ref={surnameRef}
              style={styles.input}
              placeholder="e.g. Nkosi"
              placeholderTextColor={COLORS.textTertiary}
              value={surname}
              onChangeText={setSurname}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => ageRef.current?.focus()}
            />
          </View>

          {/* Age */}
          <Text style={styles.label}>Age</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              ref={ageRef}
              style={styles.input}
              placeholder="e.g. 34"
              placeholderTextColor={COLORS.textTertiary}
              value={age}
              onChangeText={t => setAge(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={3}
              onSubmitEditing={handleStart}
            />
          </View>

          {/* Privacy note */}
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={13} color={COLORS.primary} />
            <Text style={styles.privacyText}>
              Your details are encrypted and only visible to the healthcare staff at {facilityName}.
            </Text>
          </View>

          {/* CTA button */}
          <TouchableOpacity
            style={[styles.startBtn, saving && styles.startBtnDisabled]}
            onPress={handleStart}
            disabled={saving}
            activeOpacity={0.87}>
            <LinearGradient
              colors={headerGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.startBtnGrad}>
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : (
                  <>
                    <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                    <Text style={styles.startBtnText}>Start My Care Journey</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </>
                )
              }
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.sessionNote}>
            Your session at {facilityName} begins when you tap the button above.
            To use a different facility, simply close and reopen the app.
          </Text>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scrollContent: { flexGrow: 1 },

  // Hero
  hero: {
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top:  Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    left: 20,
    padding: 8,
    zIndex: 10,
  },
  deco1: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  deco2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  facilityIconWrap: { marginBottom: 16, marginTop: 8 },
  facilityIconRing: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  welcomeText:  { fontSize: 14, color: 'rgba(255,255,255,0.78)', fontWeight: '600', marginBottom: 6 },
  facilityName: {
    fontSize: 26, fontWeight: '900', color: '#FFFFFF',
    textAlign: 'center', lineHeight: 32, letterSpacing: -0.5, marginBottom: 14,
  },
  heroMetaRow:  { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.20)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    maxWidth: 200,
  },
  heroBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.92)', fontWeight: '600' },

  // Form card
  formCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    marginTop: -20, padding: 24, flex: 1,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.07, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  formTitle: { fontSize: 20, fontWeight: '900', color: COLORS.textPrimary, marginBottom: 6 },
  formSub:   { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 52, marginBottom: 16,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary },

  // Privacy
  privacyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 12,
    padding: 12, marginBottom: 24,
  },
  privacyText: { flex: 1, fontSize: 11, color: COLORS.primary, fontWeight: '500', lineHeight: 17 },

  // CTA
  startBtn:         { borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  startBtnDisabled: { opacity: 0.6 },
  startBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, gap: 10,
  },
  startBtnText: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.3 },

  sessionNote: {
    fontSize: 11, color: COLORS.textTertiary, textAlign: 'center',
    lineHeight: 17, paddingHorizontal: 8,
  },
});
