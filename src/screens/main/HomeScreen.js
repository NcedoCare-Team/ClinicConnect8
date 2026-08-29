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
import { COLLECTIONS, patientRef } from '../../services/firestorePaths';
import { HOME_INSIGHT_PREVIEW } from '../../constants/communityInsights';
import { UserProfileService } from '../../services/UserProfileService';
import { HomeHeader, LAYOUT } from '../../components/layout/ScreenHeader';
import FacilityBanner from '../../components/layout/FacilityBanner';
import InsightCard from '../../components/insights/InsightCard';
import { SessionService } from '../../services/SessionService';
import { openPatientTab, openFacilitySelection } from '../../navigation/openPatientTab';
import { SleepTrackingService } from '../../services/SleepTrackingService';
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
  const [healthData,       setHealthData]       = useState(null);
  const [sleepData,        setSleepData]        = useState(() => SleepTrackingService.getSleepData());
  // const [notificationCount, setNotificationCount] = useState(3);

  // Real-time health metrics listener (smartwatch data via Firestore)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(
      patientRef(firestore, uid),
      snap => { if (snap.exists()) setHealthData(snap.data().healthData || null); },
      () => { /* permission denied — stress/BP tiles show — */ }
    );
    return unsub;
  }, []);

  // Sleep tracking — phone-inactivity based, updates when the service detects sleep
  useEffect(() => {
    setSleepData(SleepTrackingService.getSleepData());
    return SleepTrackingService.addListener(data => setSleepData(data));
  }, []);

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

        {/* Personal Health Snapshot */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Health Monitoring</Text>
          {healthData?.deviceConnected && (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionDesc}>
          Connect your smartwatch to monitor stress, blood pressure and sleep in real time.
        </Text>
        <View style={styles.statsGrid}>
          <HealthMetricTile
            icon="pulse-outline"
            label="Stress Level"
            {...stressProps(healthData?.stress)}
          />
          <HealthMetricTile
            icon="heart-circle-outline"
            label="Blood Pressure"
            {...bpProps(healthData?.bloodPressure)}
          />
          <HealthMetricTile
            icon="moon-outline"
            label="Sleep"
            {...sleepProps(sleepData)}
          />
          <TouchableOpacity
            style={styles.statTile}
            activeOpacity={0.8}
            onPress={openFacilitySelection}>
            <View style={[styles.statIcon, {
              backgroundColor: healthData?.deviceConnected ? COLORS.lowLight : COLORS.infoLight,
            }]}>
              <Ionicons
                name="watch-outline"
                size={18}
                color={healthData?.deviceConnected ? COLORS.low : COLORS.info}
              />
            </View>
            <Text style={styles.statLabel}>
              {healthData?.deviceConnected ? healthData.deviceName || 'Smartwatch' : 'Health Device'}
            </Text>
            <Text style={[styles.statConnect, {
              color: healthData?.deviceConnected ? COLORS.low : COLORS.info,
            }]}>
              {healthData?.deviceConnected ? 'Connected' : 'Connect a device'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Primary Action Card — before Care Timeline */}
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

        {/* Care Timeline */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>Care Timeline</Text>
          <TouchableOpacity onPress={() => openPatientTab('journey')}>
            <Text style={styles.sectionLink}>View journey</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>
          Live visit steps now, and signed-out visits with your doctor follow-up.
        </Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.timelineBlock}>
            <TouchableOpacity
              style={styles.liveJourneyCard}
              onPress={() => openPatientTab('journey')}
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
                        onPress={() => openPatientTab('journey')}
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

// ── Health metric tile ────────────────────────────────────────────────────────
function HealthMetricTile({ icon, label, value, unit, iconBg, iconColor, chipLabel, chipColor, chipBg }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: iconBg || COLORS.primaryVeryLight }]}>
        <Ionicons name={icon} size={18} color={iconColor || COLORS.primary} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value || '—'}{value && unit ? ` ${unit}` : ''}
      </Text>
      {chipLabel ? (
        <View style={[styles.metricChip, { backgroundColor: chipBg || COLORS.primaryVeryLight }]}>
          <Text style={[styles.metricChipText, { color: chipColor || COLORS.primary }]}>{chipLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Stress display props ──────────────────────────────────────────────────────
function stressProps(stress) {
  if (!stress?.score && stress?.score !== 0) {
    return { value: null, iconBg: COLORS.backgroundTertiary, iconColor: COLORS.textTertiary };
  }
  const score = stress.score;
  const level = score <= 33 ? 'Low' : score <= 66 ? 'Medium' : 'High';
  const color = score <= 33 ? COLORS.low : score <= 66 ? COLORS.medium : COLORS.critical;
  const bg    = score <= 33 ? COLORS.lowLight : score <= 66 ? COLORS.mediumLight : COLORS.criticalLight;
  return {
    value: String(score), unit: '/ 100',
    iconBg: bg, iconColor: color,
    chipLabel: level, chipColor: color, chipBg: bg,
  };
}

// ── Blood pressure display props ──────────────────────────────────────────────
function bpProps(bp) {
  if (!bp?.systolic) {
    return { value: null, iconBg: COLORS.backgroundTertiary, iconColor: COLORS.textTertiary };
  }
  const { systolic, diastolic } = bp;
  let label = 'Normal', color = COLORS.low, bg = COLORS.lowLight;
  if (systolic >= 140 || diastolic >= 90) { label = 'High Stage 2'; color = COLORS.critical; bg = COLORS.criticalLight; }
  else if (systolic >= 130 || diastolic >= 80) { label = 'High Stage 1'; color = COLORS.high;     bg = COLORS.highLight;    }
  else if (systolic >= 120)                    { label = 'Elevated';     color = COLORS.medium;   bg = COLORS.mediumLight;  }
  return {
    value: `${systolic}/${diastolic}`, unit: 'mmHg',
    iconBg: bg, iconColor: color,
    chipLabel: label, chipColor: color, chipBg: bg,
  };
}

// ── Sleep display props ───────────────────────────────────────────────────────
function sleepProps(sleep) {
  if (!sleep?.hours && sleep?.hours !== 0) {
    return { value: null, iconBg: COLORS.backgroundTertiary, iconColor: COLORS.textTertiary };
  }
  const h = sleep.hours;
  const label = h >= 8 ? 'Excellent' : h >= 7 ? 'Good' : h >= 6 ? 'Fair' : 'Poor';
  const color = h >= 8 ? COLORS.low : h >= 7 ? COLORS.primary : h >= 6 ? COLORS.medium : COLORS.high;
  const bg    = h >= 8 ? COLORS.lowLight : h >= 7 ? COLORS.primaryVeryLight : h >= 6 ? COLORS.mediumLight : COLORS.highLight;
  return {
    value: `${h.toFixed(1)}`, unit: 'hrs',
    iconBg: bg, iconColor: color,
    chipLabel: label, chipColor: color, chipBg: bg,
  };
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scrollContent: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 16 },

  actionCardWrap: { marginBottom: 28, marginTop: 4, borderRadius: LAYOUT.cardRadius, overflow: 'hidden', ...cardShadow },
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

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statTile: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statLabel:   { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  statValue:   { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  statConnect: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  metricChip: {
    alignSelf: 'flex-start', marginTop: 5,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
  },
  metricChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.lowLight, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.low,
  },
  liveText: { fontSize: 10, fontWeight: '900', color: COLORS.low, letterSpacing: 0.8 },

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
