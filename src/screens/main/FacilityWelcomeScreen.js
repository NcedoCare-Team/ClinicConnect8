// Confirm selected facility — then go to Assessment or return to Home.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';
import { useFacility } from '../../contexts/FacilityContext';

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
  const { facility } = route.params || {};
  const { setFacilitySession } = useFacility();

  const facilityName      = facility?.name     || 'Healthcare Facility';
  const facilityType      = facility?.type     || 'clinic';
  const facilityAddress   = facility?.address  || 'South Africa';
  const facilityOwnership = facility?.ownership || 'public';

  const headerGradient = TYPE_COLOR[facilityType] || TYPE_COLOR.clinic;
  const headerIcon     = TYPE_ICON[facilityType]  || 'business';

  const [profile, setProfile] = useState(null);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    (async () => {
      const p = await UserProfileService.getProfile();
      setProfile(p);
    })();
  }, []);

  const firstName = profile?.firstName || profile?.displayName?.split(' ')[0] || '';
  const lastName  = profile?.lastName  || profile?.displayName?.split(' ').slice(1).join(' ') || '';
  const displayName = profile?.displayName || `${firstName} ${lastName}`.trim();
  const age = profile?.patientAge;
  const idNumber = profile?.idNumber || '';

  const saveFacility = async (nextTab) => {
    setSaving(true);
    try {
      const sessionData = {
        facilityId:       facility?.id   || '',
        facilityName,
        facilityType,
        facilityAddress,
        facilityOwnership,
        facilityLat:      facility?.lat  || null,
        facilityLng:      facility?.lng  || null,
        patientFirstName: firstName,
        patientSurname:   lastName,
        patientAge:       age ?? null,
        patientIdNumber:  idNumber,
        sessionStartedAt: new Date().toISOString(),
        ...(nextTab === 'assessment' ? { pendingMainTab: 'assessment' } : {}),
      };

      await setFacilitySession(sessionData);
      await UserProfileService.saveProfile({
        primaryFacility: facilityName,
        primaryFacilityId: facility?.id || '',
        location: facilityAddress,
      });

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: nextTab === 'assessment' ? { tab: 'assessment' } : { tab: 'home' } }],
      });
    } catch (err) {
      console.log('Facility save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}>

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.deco1} />
          <View style={styles.deco2} />

          <View style={styles.facilityIconWrap}>
            <View style={styles.facilityIconRing}>
              <Ionicons name={headerIcon} size={38} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.welcomeText}>Connected facility</Text>
          <Text style={styles.facilityName} numberOfLines={2}>{facilityName}</Text>

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

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Facility linked</Text>
          <Text style={styles.formSub}>
            Your profile will be shared securely with {facilityName} for care and identification.
          </Text>

          <View style={styles.identityCard}>
            <View style={styles.identityRow}>
              <Ionicons name="person-outline" size={18} color={COLORS.primary} />
              <View style={styles.identityBody}>
                <Text style={styles.identityLabel}>Patient</Text>
                <Text style={styles.identityValue}>
                  {displayName || auth.currentUser?.email}
                  {age != null ? ` · ${age} yrs` : ''}
                </Text>
              </View>
            </View>
            {idNumber ? (
              <View style={styles.identityRow}>
                <Ionicons name="card-outline" size={18} color={COLORS.primary} />
                <View style={styles.identityBody}>
                  <Text style={styles.identityLabel}>ID / Passport</Text>
                  <Text style={styles.identityValue}>{idNumber}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={13} color={COLORS.primary} />
            <Text style={styles.privacyText}>
              Your data is end-to-end encrypted and delivered only to {facilityName}. No other party can access your information.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={() => saveFacility('assessment')}
            disabled={saving}
            activeOpacity={0.87}>
            <LinearGradient
              colors={headerGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.btnGrad}>
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : (
                  <>
                    <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Start assessment</Text>
                  </>
                )
              }
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, saving && styles.btnDisabled]}
            onPress={() => saveFacility('home')}
            disabled={saving}
            activeOpacity={0.87}>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Done — back to My Care</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scrollContent: { flexGrow: 1 },

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
  formSub:   { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 20 },

  identityCard: {
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: 14,
  },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  identityBody: { flex: 1 },
  identityLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  identityValue: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },

  privacyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 12,
    padding: 12, marginBottom: 20,
  },
  privacyText: { flex: 1, fontSize: 11, color: COLORS.primary, fontWeight: '500', lineHeight: 17 },

  primaryBtn:   { borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  btnDisabled:  { opacity: 0.6 },
  btnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, gap: 10,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 18,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
});
