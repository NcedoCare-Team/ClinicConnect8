// Confirm selected facility — then go to Assessment or return to Home.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth, firestore } from '../../../firebase';
import { setDoc, getDoc } from 'firebase/firestore';
import { useLocalSearchParams, router } from 'expo-router';
import { replacePatientTab, parseNavParam } from '../../navigation/openPatientTab';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';
import { useFacility } from '../../contexts/FacilityContext';
import { facilityRef } from '../../services/firestorePaths';

const TYPE_ICON = {
  hospital: 'business',
  clinic:   'medical',
  pharmacy: 'flask',
  doctor:   'person-circle',
};

const TYPE_COLOR = {
  hospital: ['#1E3A8A', COLORS.primaryDark, COLORS.primary],
  clinic:   [COLORS.primaryDark, COLORS.primary, '#059669'],
  pharmacy: ['#0C4A6E', '#0369A1', '#0EA5E9'],
  doctor:   ['#5B21B6', '#7C3AED', '#A78BFA'],
};

export default function FacilityWelcomeScreen() {
  const searchParams = useLocalSearchParams();
  const facility = parseNavParam(searchParams.facility, {});
  const { setFacilitySession } = useFacility();

  const facilityName      = facility?.name     || 'Healthcare Facility';
  const facilityType      = facility?.type     || 'clinic';
  const facilityAddress   = facility?.address  || 'South Africa';
  const facilityOwnership = facility?.ownership || 'public';
  const distance          = facility?.distance;

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
        facilityId: facility?.id || '',
        location: facilityAddress,
      });

      // Create facility doc only if missing (updates require admin per shared rules)
      if (facility?.id) {
        try {
          const ref = facilityRef(firestore, facility.id);
          const existing = await getDoc(ref);
          if (!existing.exists()) {
            await setDoc(ref, {
              facilityId: facility.id,
              name: facilityName,
              address: facilityAddress,
              lat: facility?.lat ?? null,
              lng: facility?.lng ?? null,
              type: facilityType,
              ownership: facilityOwnership,
              country: 'South Africa',
              isActive: true,
              hasAdmin: false,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.log('Facility doc create error:', err);
        }
      }

      replacePatientTab(nextTab === 'assessment' ? 'assessment' : 'home');
    } catch (err) {
      console.log('Facility save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const distLabel = distance != null && distance < 999
    ? (distance < 1 ? `${Math.round(distance * 1000)} m away` : `${distance.toFixed(1)} km away`)
    : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <View style={styles.backBtnInner}>
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.deco1} />
          <View style={styles.deco2} />
          <View style={styles.deco3} />

          <View style={styles.successRing}>
            <View style={styles.facilityIconRing}>
              <Ionicons name={headerIcon} size={36} color="#FFFFFF" />
            </View>
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.welcomeText}>You're connecting to</Text>
          <Text style={styles.facilityName} numberOfLines={3}>{facilityName}</Text>

          <View style={styles.heroMetaRow}>
            {distLabel ? (
              <View style={styles.heroBadge}>
                <Ionicons name="navigate" size={12} color="rgba(255,255,255,0.95)" />
                <Text style={styles.heroBadgeText}>{distLabel}</Text>
              </View>
            ) : null}
            <View style={styles.heroBadge}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.95)" />
              <Text style={styles.heroBadgeText} numberOfLines={1}>{facilityAddress}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons
                name={facilityOwnership === 'private' ? 'card-outline' : 'shield-checkmark-outline'}
                size={12} color="rgba(255,255,255,0.95)" />
              <Text style={styles.heroBadgeText}>
                {facilityOwnership === 'private' ? 'Private' : 'Public'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Ready to connect</Text>
            <Text style={styles.formSub}>
              Your profile will be shared securely with this facility for care and identification.
            </Text>
          </View>

          <View style={styles.identityCard}>
            <Text style={styles.identityCardTitle}>Your details</Text>
            <View style={styles.identityRow}>
              <View style={styles.identityIcon}>
                <Ionicons name="person" size={16} color={COLORS.primary} />
              </View>
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
                <View style={styles.identityIcon}>
                  <Ionicons name="card" size={16} color={COLORS.primary} />
                </View>
                <View style={styles.identityBody}>
                  <Text style={styles.identityLabel}>ID / Passport</Text>
                  <Text style={styles.identityValue}>{idNumber}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed" size={16} color={COLORS.primary} />
            <Text style={styles.privacyText}>
              End-to-end encrypted to {facilityName} only. No third party can access your data.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={() => saveFacility('assessment')}
            disabled={saving}
            activeOpacity={0.87}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
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
            <Ionicons name="home-outline" size={20} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Done — back to My Care</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { flexGrow: 1 },

  hero: {
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top:  Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    left: 20,
    zIndex: 10,
  },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  deco1: {
    position: 'absolute', top: -50, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  deco2: {
    position: 'absolute', bottom: -40, left: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  deco3: {
    position: 'absolute', top: '30%', left: '10%',
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  successRing: { marginBottom: 18, marginTop: 12, position: 'relative' },
  facilityIconRing: {
    width: 96, height: 96, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.50)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute', bottom: 0, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.success,
    borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },

  welcomeText:  { fontSize: 14, color: 'rgba(255,255,255,0.80)', fontWeight: '600', marginBottom: 8 },
  facilityName: {
    fontSize: 28, fontWeight: '900', color: '#FFFFFF',
    textAlign: 'center', lineHeight: 34, letterSpacing: -0.6, marginBottom: 16,
    paddingHorizontal: 8,
  },
  heroMetaRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    maxWidth: 220,
  },
  heroBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.95)', fontWeight: '700' },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    marginTop: -24, padding: 24, flex: 1,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  formHeader: { marginBottom: 20 },
  formTitle: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, marginBottom: 6 },
  formSub:   { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21 },

  identityCard: {
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 18, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: 14,
  },
  identityCardTitle: {
    fontSize: 11, fontWeight: '800', color: COLORS.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  identityBody: { flex: 1 },
  identityLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, marginBottom: 2 },
  identityValue: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },

  privacyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 14,
    padding: 14, marginBottom: 22,
    borderWidth: 1, borderColor: COLORS.primaryGlow,
  },
  privacyText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '600', lineHeight: 18 },

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
