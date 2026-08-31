// Confirm selected facility — then go to Assessment or return to Home.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../firebase';
import { useLocalSearchParams, router } from 'expo-router';
import { replacePatientTab, parseNavParam } from '../../navigation/openPatientTab';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';
import { useFacility } from '../../contexts/FacilityContext';
import { FacilityRegistryService } from '../../services/FacilityRegistryService';

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
  const [isRegistered, setIsRegistered] = useState(facility?.isRegistered === true);
  const [checkingRegistry, setCheckingRegistry] = useState(facility?.isRegistered !== true);

  useEffect(() => {
    (async () => {
      const p = await UserProfileService.getProfile();
      setProfile(p);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (facility?.isRegistered === true && facility?.registeredId) {
        setIsRegistered(true);
        setCheckingRegistry(false);
        return;
      }
      setCheckingRegistry(true);
      const ok = await FacilityRegistryService.isPlaceRegistered(facility);
      if (!cancelled) {
        setIsRegistered(ok);
        setCheckingRegistry(false);
      }
    })();
    return () => { cancelled = true; };
  }, [facility?.id, facility?.name, facility?.isRegistered, facility?.registeredId]);

  const firstName = profile?.firstName || profile?.displayName?.split(' ')[0] || '';
  const lastName  = profile?.lastName  || profile?.displayName?.split(' ').slice(1).join(' ') || '';
  const displayName = profile?.displayName || `${firstName} ${lastName}`.trim();
  const age = profile?.patientAge;
  const idNumber = profile?.idNumber || '';

  const saveFacility = async (nextTab) => {
    if (!isRegistered) return;
    setSaving(true);
    try {
      const boundId = facility?.registeredId || facility?.id || '';
      const sessionData = {
        facilityId:       boundId,
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
        facilityRegistered: true,
        ...(nextTab === 'assessment' ? { pendingMainTab: 'assessment' } : {}),
      };

      await setFacilitySession(sessionData);
      await UserProfileService.saveProfile({
        primaryFacility: facilityName,
        primaryFacilityId: boundId,
        facilityId: boundId,
        location: facilityAddress,
      });

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
            <Ionicons name={headerIcon} size={32} color="#FFFFFF" />
          </View>
          <View style={[styles.checkBadge, !isRegistered && styles.checkBadgeWarn]}>
            <Ionicons name={isRegistered ? 'checkmark' : 'flag'} size={14} color="#FFFFFF" />
          </View>
        </View>

        <Text style={styles.welcomeText}>
          {isRegistered ? "You're connecting to" : 'This facility is nearby'}
        </Text>
        <Text style={styles.facilityName} numberOfLines={2}>{facilityName}</Text>

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
          <Text style={styles.formTitle}>
            {checkingRegistry ? 'Checking registration' : isRegistered ? 'Ready to connect' : 'Not registered yet'}
          </Text>
          <Text style={styles.formSub} numberOfLines={3}>
            {checkingRegistry
              ? 'Confirming whether this facility is on NcedoCare…'
              : isRegistered
                ? 'Your profile will be shared securely with this facility for care and identification.'
                : 'This hospital is not on NcedoCare yet. You can view it here, but you cannot save it or start an assessment until they register.'}
          </Text>
        </View>

        <View style={styles.formBody}>
          {checkingRegistry ? (
            <View style={styles.checkingWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : !isRegistered ? (
            <View style={styles.unregisteredBanner}>
              <Ionicons name="flag" size={18} color={COLORS.error} />
              <Text style={styles.unregisteredBannerText}>
                Choose a facility marked On NcedoCare to send your request to a registered care team.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.identityCard}>
                <Text style={styles.identityCardTitle}>Your details</Text>
                <View style={styles.identityRow}>
                  <View style={styles.identityIcon}>
                    <Ionicons name="person" size={16} color={COLORS.primary} />
                  </View>
                  <View style={styles.identityBody}>
                    <Text style={styles.identityLabel}>Patient</Text>
                    <Text style={styles.identityValue} numberOfLines={1}>
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
                      <Text style={styles.identityValue} numberOfLines={1}>{idNumber}</Text>
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
            </>
          )}
        </View>

        <View style={styles.actions}>
          {checkingRegistry ? null : isRegistered ? (
            <>
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
            </>
          ) : (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.back()}
              activeOpacity={0.87}>
              <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
              <Text style={styles.secondaryBtnText}>Choose another facility</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },

  hero: {
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 0) + 16,
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

  successRing: { marginBottom: 12, marginTop: 8, position: 'relative' },
  facilityIconRing: {
    width: 84, height: 84, borderRadius: 26,
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
  checkBadgeWarn: { backgroundColor: COLORS.error },
  unregisteredBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.errorLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  unregisteredBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.error,
    lineHeight: 19,
  },

  welcomeText:  { fontSize: 13, color: 'rgba(255,255,255,0.80)', fontWeight: '600', marginBottom: 6 },
  facilityName: {
    fontSize: 24, fontWeight: '900', color: '#FFFFFF',
    textAlign: 'center', lineHeight: 30, letterSpacing: -0.5, marginBottom: 12,
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
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    marginTop: -24, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 20,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  formHeader: { marginBottom: 14 },
  formTitle: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, marginBottom: 6 },
  formSub:   { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  formBody:  { flex: 1 },
  checkingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { paddingTop: 8 },

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
