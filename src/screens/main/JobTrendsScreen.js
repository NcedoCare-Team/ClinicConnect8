// Care Journey — summary + past visits, then live queue journey with countdown.
// Patients never see triage colour codes.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ScrollView, ActivityIndicator, RefreshControl,
  LayoutAnimation, UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, onSnapshot, limit,
} from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLLECTIONS } from '../../services/firestorePaths';
import { COLORS } from '../../constants/colors';
import { ScreenHeader, LAYOUT } from '../../components/layout/ScreenHeader';
import { SessionService } from '../../services/SessionService';
import { UserProfileService } from '../../services/UserProfileService';
import {
  estimateWaitMinutes,
  formatWaitMinutes,
  formatCountdown,
} from '../../utils/queueWait';
import FacilityJourneyStepper from '../../components/FacilityJourneyStepper';
import { openPatientTab } from '../../navigation/openPatientTab';
import {
  getFacilityJourneyPhase,
  facilityJourneyLabel,
} from '../../utils/facilityJourney';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function shortId(uid) {
  return uid ? `NC-${uid.slice(-6).toUpperCase()}` : '—';
}

function patientStatusMeta(c) {
  const phase = getFacilityJourneyPhase(c);
  const label = facilityJourneyLabel(phase) || 'Waiting';
  if (phase === 'completed') {
    return { label, color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-circle' };
  }
  if (phase === 'attended') {
    return { label, color: COLORS.primary, bg: COLORS.primaryVeryLight, icon: 'medical' };
  }
  return { label, color: COLORS.medium, bg: COLORS.mediumLight, icon: 'time' };
}

function formatWhen(ts) {
  if (!ts?.toDate) return null;
  return ts.toDate().toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Wait is patients-ahead only (short nurse slots), never AI "±1 hour" labels.
 */
function resolveWaitMinutes(activeCase) {
  if (!activeCase) return null;
  if (getFacilityJourneyPhase(activeCase) !== 'waiting') return 0;
  const ahead = Math.max(0, Number(activeCase.queuePosition || 1) - 1);
  const fromPosition = estimateWaitMinutes(activeCase.priority || 'MEDIUM', ahead);
  const stored = Number(activeCase.estimatedWaitMinutes);
  if (Number.isFinite(stored) && stored >= 0 && stored <= 40) return stored;
  return fromPosition;
}

function remainingSeconds(anchorAt, waitMins, nowMs) {
  if (waitMins == null) return null;
  if (waitMins <= 0) return 0;
  if (!anchorAt) return waitMins * 60;
  const endMs = anchorAt + waitMins * 60 * 1000;
  return Math.max(0, Math.round((endMs - nowMs) / 1000));
}

export default function JobTrendsScreen({ navigation }) {
  const [activeCase, setActiveCase] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [patient, setPatient] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [waitAnchor, setWaitAnchor] = useState(null); // { at, mins }

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    (async () => {
      const profile = await UserProfileService.getProfile();
      const session = SessionService.getSession();
      setPatient({ ...profile, ...session });
    })();
  }, []);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    // Latest case for this patient (any status) — stays live through Waiting → Attended → Completed
    const q = query(
      collection(firestore, COLLECTIONS.TRIAGE_CASES),
      where('patientId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          setActiveCase({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setActiveCase(null);
        }
        setLoadError('');
        setLoading(false);
      },
      (err) => {
        console.log('[Journey] active listener error:', err.message);
        setLoadError(
          err.message?.includes('index')
            ? 'Journey index is updating. Pull to refresh in a moment.'
            : 'Could not load your live journey. Pull to refresh.'
        );
        setLoading(false);
      }
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(firestore, COLLECTIONS.TRIAGE_CASES),
      where('patientId', '==', uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRefreshing(false);
      },
      (err) => {
        console.log('[Journey] history listener error:', err.message);
        setRefreshing(false);
      }
    );
    return unsub;
  }, [uid]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const statusMeta = activeCase ? patientStatusMeta(activeCase) : null;
  const liveWaitMins = useMemo(() => resolveWaitMinutes(activeCase), [activeCase]);
  const liveWaitLabel = liveWaitMins == null ? '—' : formatWaitMinutes(liveWaitMins);
  const displayCase = useMemo(() => {
    if (!activeCase) return null;
    return {
      ...activeCase,
      estimatedWaitMinutes: liveWaitMins,
      estimatedWait: liveWaitLabel,
    };
  }, [activeCase, liveWaitMins, liveWaitLabel]);

  // Re-anchor countdown when position / wait estimate changes (or stamp is stale)
  useEffect(() => {
    if (!activeCase || liveWaitMins == null) {
      setWaitAnchor(null);
      return;
    }
    if (getFacilityJourneyPhase(activeCase) !== 'waiting') {
      setWaitAnchor({ at: Date.now(), mins: 0 });
      return;
    }
    const stamp = activeCase.waitUpdatedAt?.toMillis?.();
    const endFromStamp = stamp != null ? stamp + liveWaitMins * 60 * 1000 : 0;
    const at = stamp && endFromStamp > Date.now() ? stamp : Date.now();
    setWaitAnchor({ at, mins: liveWaitMins });
  }, [
    activeCase?.id,
    activeCase?.status,
    activeCase?.queuePosition,
    activeCase?.waitUpdatedAt,
    activeCase?.patientCalledAt,
    activeCase?.patientNotified,
    activeCase?.reviewStartedAt,
    activeCase?.nurseDecision,
    liveWaitMins,
  ]);

  const secsLeft = useMemo(
    () => remainingSeconds(waitAnchor?.at, waitAnchor?.mins ?? liveWaitMins, nowTick),
    [waitAnchor, liveWaitMins, nowTick]
  );
  const countdownLabel = formatCountdown(secsLeft);
  const journeyPhase = getFacilityJourneyPhase(displayCase);
  const isLiveVisit = journeyPhase === 'waiting' || journeyPhase === 'attended';

  const name = [
    patient?.patientFirstName || patient?.firstName,
    patient?.patientSurname || patient?.lastName,
  ].filter(Boolean).join(' ') || patient?.displayName || 'Patient';
  const age = patient?.patientAge || patient?.age || '—';
  const facility =
    patient?.facilityName || patient?.primaryFacility || 'No facility linked';
  const totalVisits = history.length + (isLiveVisit ? 1 : 0);
  const sealedCount = (() => {
    const ids = new Set(history.map((h) => h.id));
    let n = history.length;
    if (activeCase?.status === 'completed' && !ids.has(activeCase.id)) n += 1;
    return n;
  })();

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Care Journey"
        subtitle="Visit history and live queue updates in one place"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loadError ? (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={18} color="#B45309" />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        {/* ── Summary card ── */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryCard}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryAvatar}>
              <Ionicons name="person" size={26} color={COLORS.primary} />
            </View>
            <View style={styles.summaryMeta}>
              <Text style={styles.summaryName}>{name}</Text>
              <Text style={styles.summarySub}>
                Age {age} · {shortId(uid)}
              </Text>
            </View>
            <View style={styles.fileBadge}>
              <Ionicons name="document-text" size={12} color="#FFFFFF" />
              <Text style={styles.fileBadgeText}>PATIENT FILE</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.facilityRow}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={styles.facilityText} numberOfLines={1}>{facility}</Text>
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatVal}>{totalVisits}</Text>
              <Text style={styles.summaryStatLbl}>Total</Text>
            </View>
            <View style={styles.summaryStatDiv} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatVal}>{activeCase ? 1 : 0}</Text>
              <Text style={styles.summaryStatLbl}>Active</Text>
            </View>
            <View style={styles.summaryStatDiv} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatVal}>{sealedCount}</Text>
              <Text style={styles.summaryStatLbl}>Completed</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Past visits ── */}
        <Text style={styles.sectionTitle}>Past visits</Text>
        {loading && history.length === 0 && !activeCase ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyText}>
              Completed visits will appear here with your care plan summary.
            </Text>
          </View>
        ) : (
          history.map((item) => {
            const open = expandedId === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.historyCard}
                onPress={() => toggleExpand(item.id)}
                activeOpacity={0.85}
              >
                <View style={styles.historyTop}>
                  <View style={[styles.historyDot, { backgroundColor: COLORS.primary }]} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyDate}>
                      {formatWhen(item.completedAt) || 'Completed visit'}
                    </Text>
                    <Text style={styles.historyDiagnosis} numberOfLines={open ? 0 : 2}>
                      {item.doctorConclusion ||
                        item.diagnosis ||
                        item.chiefComplaint ||
                        'Consultation completed'}
                    </Text>
                    {item.facilityName ? (
                      <Text style={styles.historyNurse}>{item.facilityName}</Text>
                    ) : null}
                  </View>
                  <View style={styles.historyRight}>
                    <View style={[styles.smallBadge, { backgroundColor: COLORS.primaryVeryLight }]}>
                      <Text style={[styles.smallBadgeText, { color: COLORS.primary }]}>Done</Text>
                    </View>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={COLORS.textTertiary}
                      style={{ marginTop: 8 }}
                    />
                  </View>
                </View>

                {open ? (
                  <View style={styles.historyExpand}>
                    {(item.doctorConclusion || item.diagnosis) && (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Clinical conclusion</Text>
                        <Text style={styles.detailValue}>
                          {item.doctorConclusion || item.diagnosis}
                        </Text>
                      </View>
                    )}
                    {item.medications ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Medications</Text>
                        <Text style={styles.detailValue}>{item.medications}</Text>
                      </View>
                    ) : null}
                    {item.guidelines ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Guidelines & follow-up</Text>
                        <Text style={styles.detailValue}>{item.guidelines}</Text>
                      </View>
                    ) : null}
                    {item.symptoms ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Reported symptoms</Text>
                        <Text style={styles.detailValue}>{item.symptoms}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Live journey (under history) ── */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Live journey</Text>

        {displayCase && statusMeta ? (
          <View
            style={[
              styles.activeCard,
              journeyPhase === 'completed' && styles.activeCardCall,
              journeyPhase === 'attended' && styles.activeCardAttended,
            ]}
          >
            <View style={styles.activeCardHeader}>
              <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
                <Ionicons name={statusMeta.icon} size={14} color={statusMeta.color} />
                <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
              {displayCase.facilityName ? (
                <Text style={styles.facilityChip} numberOfLines={1}>
                  {displayCase.facilityName}
                </Text>
              ) : null}
            </View>

            <Text style={styles.activeCardTitle}>
              {journeyPhase === 'completed'
                ? 'Your assessment is completed'
                : journeyPhase === 'attended'
                  ? 'You are being attended'
                  : 'You are waiting in the facility queue'}
            </Text>
            <Text style={styles.activeCardSub}>
              {journeyPhase === 'waiting'
                ? 'Updates appear here in real time as staff review you on the facility portal.'
                : journeyPhase === 'attended'
                  ? 'A healthcare worker has started your review. Stay nearby until you are called.'
                  : 'Your visit is finished. You can start a new assessment when you need one.'}
            </Text>

            {journeyPhase === 'waiting' ? (
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>#{displayCase.queuePosition || '—'}</Text>
                  <Text style={styles.statLabel}>Position</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, styles.countdownValue]}>
                    {countdownLabel}
                  </Text>
                  <Text style={styles.statLabel}>Countdown</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValueSmall}>
                    {liveWaitLabel}
                  </Text>
                  <Text style={styles.statLabel}>Est. wait</Text>
                </View>
              </View>
            ) : null}

            <FacilityJourneyStepper
              caseData={displayCase}
              countdownLabel={journeyPhase === 'waiting' ? countdownLabel : ''}
            />

            {journeyPhase !== 'completed' ? (
              <View style={styles.tipBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                <Text style={styles.tipText}>
                  If your condition worsens while waiting, tell triage staff immediately.
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="git-network-outline" size={40} color={COLORS.textTertiary} />
            <Text style={styles.emptyTitle}>No active journey</Text>
            <Text style={styles.emptySub}>
              Start an assessment and your live queue countdown will appear here.
            </Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => openPatientTab('assessment')}
              activeOpacity={0.85}
            >
              <Text style={styles.startBtnText}>Check Symptoms</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  scroll: { paddingTop: 16, paddingHorizontal: LAYOUT.screenPadding },
  loadingWrap: { paddingTop: 40, alignItems: 'center' },

  errorCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  errorText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  summaryCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryMeta: { flex: 1 },
  summaryName: { fontSize: 17, fontWeight: '800', color: COLORS.white },
  summarySub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  fileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fileBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.white, letterSpacing: 0.4 },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 14,
  },
  facilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  facilityText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  summaryStats: { flexDirection: 'row', alignItems: 'center' },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatVal: { fontSize: 22, fontWeight: '900', color: COLORS.white },
  summaryStatLbl: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  summaryStatDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },

  historyEmpty: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 10,
  },
  historyEmptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  historyDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 4 },
  historyInfo: { flex: 1 },
  historyRight: { alignItems: 'flex-end' },
  historyDate: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '500',
    marginBottom: 2,
  },
  historyDiagnosis: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  historyNurse: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  smallBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  smallBadgeText: { fontSize: 10, fontWeight: '700' },
  historyExpand: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: 10,
  },
  detailBlock: { gap: 2 },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 19 },

  activeCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
  },
  activeCardCall: { borderLeftColor: '#16A34A' },
  activeCardAttended: { borderLeftColor: COLORS.primary },
  activeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  facilityChip: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  activeCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  activeCardSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },

  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '900', color: COLORS.textPrimary },
  countdownValue: { fontVariant: ['tabular-nums'], color: COLORS.primary },
  statValueSmall: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  statDivider: { width: 1, height: 40, backgroundColor: COLORS.borderLight },

  tipBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: 10,
    padding: 12,
  },
  tipText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  startBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
});
