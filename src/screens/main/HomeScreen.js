// src/screens/main/HomeScreen.js
// Tab One — "My Care" (Home)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { COLLECTIONS } from '../../services/firestorePaths';
import { HOME_INSIGHT_PREVIEW } from '../../constants/communityInsights';
import { UserProfileService } from '../../services/UserProfileService';
import { HomeHeader, LAYOUT } from '../../components/layout/ScreenHeader';
import FacilityBanner from '../../components/layout/FacilityBanner';
import InsightCard from '../../components/insights/InsightCard';
import { SessionService } from '../../services/SessionService';
import { openPatientTab, openPatientJourney, openFacilitySelection } from '../../navigation/openPatientTab';
import { useFacility } from '../../contexts/FacilityContext';
import {
  getFacilityJourneyPhase,
  facilityJourneyLabel,
  isVisitLive,
} from '../../utils/facilityJourney';
import FacilityJourneyStepper from '../../components/FacilityJourneyStepper';

function statusBadgeForCase(c) {
  const phase = getFacilityJourneyPhase(c);
  const label = facilityJourneyLabel(phase) || 'Waiting for nurse';
  if (phase === 'signed_out' || phase === 'completed') {
    return { label, color: COLORS.success, bg: COLORS.successLight };
  }
  if (phase === 'stay') {
    return { label, color: COLORS.info, bg: COLORS.infoLight };
  }
  if (phase === 'see_nurse' || phase === 'see_doctor' || phase === 'attended') {
    return { label, color: COLORS.primary, bg: COLORS.primaryVeryLight };
  }
  return { label, color: COLORS.medium, bg: COLORS.mediumLight };
}

export default function HomeScreen({ navigation }) {
  const { facilityName, hasFacility } = useFacility();
  const [facility,         setFacility]         = useState('');
  const [liveCase,         setLiveCase]         = useState(null);
  const [historyItems,     setHistoryItems]     = useState([]);
  const [loading,          setLoading]          = useState(true);

  // Keep banner in sync with shared facility context
  useEffect(() => {
    if (facilityName) setFacility(facilityName);
  }, [facilityName]);

  useFocusEffect(
    useCallback(() => {
      if (facilityName) setFacility(facilityName);
      else if (hasFacility) setFacility(SessionService.getFacilityName());
    }, [facilityName, hasFacility])
  );

  // Live queue + recent signed-out visits for Care Timeline
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const unsubRef = { current: null };
    (async () => {
      const profile = await UserProfileService.getProfile();
      if (cancelled) return;
      const sessionFacility = SessionService.getFacilityName();
      setFacility(sessionFacility || profile.primaryFacility || profile.location || '');

      unsubRef.current = onSnapshot(
        query(
          collection(firestore, COLLECTIONS.TRIAGE_CASES),
          where('patientId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(8),
        ),
        (snap) => {
          const cases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setLiveCase(cases.find((c) => isVisitLive(c)) || null);
          setHistoryItems(cases.filter((c) => !isVisitLive(c)).slice(0, 4));
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
    })();

    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const handleChangeFacility = () => {
    openFacilitySelection();
  };

  // const handleNotifications = () => {
  //   Alert.alert('Notifications', 'Your care updates and reminders will appear here.');
  // };

  const goToInsights = () => openPatientTab('insights');

  const facilityDisplay = facility || '';

  return (
    <View style={styles.container}>
      <HomeHeader
        // notificationCount={notificationCount}
        // onNotificationPress={handleNotifications}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        <FacilityBanner
          facility={facilityDisplay}
          onPress={handleChangeFacility}
          onChangePress={handleChangeFacility}
          showConnect={!facilityDisplay}
        />

        {/* Care Timeline */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>Care Timeline</Text>
          <TouchableOpacity onPress={() => openPatientJourney('JourneyMain', { tab: 'live' })}>
            <Text style={styles.sectionLink}>View journey</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>
          Live visit steps now, and signed-out visits with your doctor follow-up.
        </Text>

        <TouchableOpacity
          style={styles.actionCardWrap}
          onPress={() => openPatientTab('assessment')}
          activeOpacity={0.9}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionCard}>
            <View style={styles.actionCardDeco} />
            <View style={styles.actionIconWrap}>
              <Ionicons name="sparkles" size={28} color="#FFFFFF" />
            </View>
            <View style={styles.actionTextBlock}>
              <Text style={styles.actionTitle}>Start AI Health Assessment</Text>
              <Text style={styles.actionSub}>
                Tell us what's going on — we'll guide you.
              </Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.timelineBlock}>
            <TouchableOpacity
              style={styles.liveJourneyCard}
              onPress={() => openPatientJourney('JourneyMain', { tab: 'live' })}
              activeOpacity={0.88}
            >
              <View style={styles.liveJourneyHead}>
                <View>
                  <Text style={styles.liveKicker}>
                    {liveCase ? 'Live visit' : hasFacility ? 'Ready to start' : 'Get started'}
                  </Text>
                  <Text style={styles.liveTitle}>
                    {liveCase
                      ? facilityJourneyLabel(getFacilityJourneyPhase(liveCase)) || 'In progress'
                      : hasFacility
                        ? 'Start assessment'
                        : 'Choose a facility'}
                  </Text>
                </View>
                {liveCase ? (
                  <View style={[styles.timelineBadge, { backgroundColor: statusBadgeForCase(liveCase).bg }]}>
                    <Text style={[styles.timelineBadgeText, { color: statusBadgeForCase(liveCase).color }]}>
                      {statusBadgeForCase(liveCase).label}
                    </Text>
                  </View>
                ) : null}
              </View>
              <FacilityJourneyStepper
                caseData={liveCase}
                compact
                hasFacility={hasFacility}
                facilityName={facilityDisplay}
              />
            </TouchableOpacity>

            {historyItems.length > 0 ? (
              <>
                <Text style={styles.recentLabel}>Recent signed-out visits</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timelineScroll}>
                  {historyItems.map((item) => {
                    const badge = statusBadgeForCase(item);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.timelineCard}
                        onPress={() => openPatientJourney('JourneyMain', { tab: 'history' })}
                        activeOpacity={0.85}>
                        <View style={[styles.timelineIcon, { backgroundColor: badge.bg }]}>
                          <Ionicons name="exit-outline" size={18} color={badge.color} />
                        </View>
                        <Text style={styles.timelineTitle} numberOfLines={2}>
                          {item.doctorConclusion || item.diagnosis || item.chiefComplaint || 'Visit'}
                        </Text>
                        <Text style={styles.timelineMeta}>
                          {item.completedAt?.toDate
                            ? item.completedAt.toDate().toLocaleDateString('en-ZA', {
                                day: 'numeric',
                                month: 'short',
                              })
                            : 'Signed out'}
                        </Text>
                        {item.guidelines ? (
                          <Text style={styles.timelineFollow} numberOfLines={2}>
                            {item.guidelines}
                          </Text>
                        ) : null}
                        <View style={[styles.timelineBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.timelineBadgeText, { color: badge.color }]}>
                            Signed out
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
          </View>
        )}

        {/* Community Health Insights — vertical list */}
        <Text style={[styles.sectionTitle, { marginBottom: 12, marginTop: 4 }]}>
          Community Health Insights
        </Text>
        <View style={styles.insightsList}>
          {HOME_INSIGHT_PREVIEW.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              compact
              showViewMore
              onViewMore={goToInsights}
            />
          ))}
        </View>

        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scrollContent: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 16 },

  actionCardWrap: { marginBottom: 16, borderRadius: LAYOUT.cardRadius, overflow: 'hidden', ...cardShadow },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  actionCardDeco: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextBlock: { flex: 1 },
  actionTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  actionSub: { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 18 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  sectionDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  sectionLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  loadingRow: { paddingVertical: 32, alignItems: 'center' },
  timelineBlock: { marginBottom: 24 },
  liveJourneyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 14,
    ...cardShadow,
  },
  liveJourneyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  liveKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  liveTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  recentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textTertiary,
    marginBottom: 10,
  },
  emptyTimeline: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  emptyText: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  emptySub: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },

  timelineScroll: { gap: 12, paddingBottom: 4, marginBottom: 24 },
  timelineCard: {
    width: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  timelineIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4, lineHeight: 17 },
  timelineMeta: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  timelineBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  timelineBadgeText: { fontSize: 10, fontWeight: '700' },
  timelineFollow: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
    marginTop: 6,
  },

  insightsList: { gap: 12, marginBottom: 8 },
});
