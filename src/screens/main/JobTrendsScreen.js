// Care Journey — Live visit roadmap and signed-out History, as header subtabs.
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
import { useLocalSearchParams } from 'expo-router';
import { openPatientTab, openFacilitySelection } from '../../navigation/openPatientTab';
import { useFacility } from '../../contexts/FacilityContext';
import {
  getFacilityJourneyPhase,
  facilityJourneyLabel,
  isVisitLive,
} from '../../utils/facilityJourney';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function shortId(uid) {
  return uid ? `NC-${uid.slice(-6).toUpperCase()}` : '—';
}

function patientStatusMeta(c, extras = {}) {
  const phase = getFacilityJourneyPhase(c, extras);
  const label = facilityJourneyLabel(phase) || 'Waiting for nurse';
  if (phase === 'signed_out' || phase === 'completed') {
    return { label, color: COLORS.success, bg: COLORS.successLight, icon: 'exit-outline' };
  }
  if (phase === 'stay') {
    return { label, color: COLORS.primary, bg: COLORS.primaryVeryLight, icon: 'home' };
  }
  if (phase === 'see_doctor' || phase === 'see_nurse' || phase === 'attended') {
    return { label, color: COLORS.primary, bg: COLORS.primaryVeryLight, icon: 'medical' };
  }
  if (phase === 'assessment' || phase === 'facility') {
    return { label, color: COLORS.info, bg: COLORS.infoLight, icon: 'flag' };
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
  if (getFacilityJourneyPhase(activeCase) !== 'waiting_nurse') return 0;
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

function liveTitleForPhase(phase, hasFacility) {
  switch (phase) {
    case 'facility':
      return hasFacility ? 'Facility linked' : 'Choose a healthcare facility';
    case 'assessment':
      return 'Start your health assessment';
    case 'waiting_nurse':
      return 'Waiting for a nurse to call you';
    case 'see_nurse':
      return 'Please see the nurse';
    case 'waiting_doctor':
      return 'Waiting for the doctor to call you';
    case 'see_doctor':
      return 'Please see the doctor';
    case 'stay':
      return 'Stay at the facility';
    default:
      return 'Your visit roadmap';
  }
}

function liveSubForPhase(phase) {
  switch (phase) {
    case 'facility':
      return 'Your care team can only follow this visit after you connect a facility.';
    case 'assessment':
      return 'Tell Dr. Ncedo how you feel. Your case is sent to the nurse when the assessment is submitted.';
    case 'waiting_nurse':
      return 'You are in the nurse queue. Updates appear here when staff call you in.';
    case 'see_nurse':
      return 'A nurse is ready for you. Stay nearby until you are seen.';
    case 'waiting_doctor':
      return 'Nurse triage is done. Please wait nearby for the doctor.';
    case 'see_doctor':
      return 'The doctor is ready for you. They will decide whether you stay or are signed out.';
    case 'stay':
      return 'The doctor has asked you to remain for further care. This visit stays live until you are signed out.';
    default:
      return 'Follow each step as the care team updates your visit.';
  }
}

export default function JobTrendsScreen({ navigation }) {
  const { hasFacility, hasRegisteredFacility, facilityName } = useFacility();
  const routeParams = useLocalSearchParams();
  const [activeCase, setActiveCase] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [patient, setPatient] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [waitAnchor, setWaitAnchor] = useState(null); // { at, mins }
  const [journeyTab, setJourneyTab] = useState('live');

  useEffect(() => {
    const tab = Array.isArray(routeParams.tab) ? routeParams.tab[0] : routeParams.tab;
    if (tab === 'live' || tab === 'history') setJourneyTab(tab);
  }, [routeParams.tab]);

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
    // Recent cases — live visit is the latest that has not been signed out
    const q = query(
      collection(firestore, COLLECTIONS.TRIAGE_CASES),
      where('patientId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(8)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const cases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setActiveCase(cases.find((c) => isVisitLive(c)) || null);
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
  const statusMeta = patientStatusMeta(displayCase, { hasFacility });

  // Re-anchor countdown when position / wait estimate changes (or stamp is stale)
  useEffect(() => {
    if (!activeCase || liveWaitMins == null) {
      setWaitAnchor(null);
      return;
    }
    if (getFacilityJourneyPhase(activeCase) !== 'waiting_nurse') {
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
    activeCase?.doctorCalledAt,
    activeCase?.disposition,
    liveWaitMins,
  ]);

  const secsLeft = useMemo(
    () => remainingSeconds(waitAnchor?.at, waitAnchor?.mins ?? liveWaitMins, nowTick),
    [waitAnchor, liveWaitMins, nowTick]
  );
  const countdownLabel = formatCountdown(secsLeft);
  const journeyPhase = getFacilityJourneyPhase(displayCase, { hasFacility });
  const liveVisit = isVisitLive(displayCase);

  const name = [
    patient?.patientFirstName || patient?.firstName,
    patient?.patientSurname || patient?.lastName,
  ].filter(Boolean).join(' ') || patient?.displayName || 'Patient';
  const age = patient?.patientAge || patient?.age || '—';
  const facility =
    facilityName || patient?.facilityName || patient?.primaryFacility || 'No facility linked';
  const totalVisits = history.length + (liveVisit ? 1 : 0);
  const sealedCount = history.length;

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Care Journey"
        subtitle={journeyTab === 'live'
          ? 'Follow your current visit step by step'
          : 'Signed-out visits and care to follow'}
      />

      <View style={styles.tabShell}>
        <View style={styles.tabRow}>
          {[
            { id: 'live', label: 'Live journey', dot: liveVisit },
            { id: 'history', label: 'History', badge: sealedCount || undefined },
          ].map((tab) => {
            const selected = tab.id === journeyTab;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabButton, selected && styles.tabButtonActive]}
                onPress={() => setJourneyTab(tab.id)}
                activeOpacity={0.9}
              >
                <View style={styles.tabButtonInner}>
                  {tab.dot ? <View style={[styles.tabDot, selected && styles.tabDotActive]} /> : null}
                  <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
                  {tab.badge != null && tab.badge !== '' ? (
                    <View style={[styles.tabBadge, selected && styles.tabBadgeActive]}>
                      <Text style={[styles.tabBadgeText, selected && styles.tabBadgeTextActive]}>{tab.badge}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        key={journeyTab}
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
        {loadError && journeyTab === 'live' ? (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={18} color="#B45309" />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        {journeyTab === 'live' ? (
        <>
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

        <Text style={styles.sectionHint}>
          Your current visit as a step-by-step roadmap. Signed-out visits move to History.
        </Text>

        <View
            style={[
              styles.activeCard,
              journeyPhase === 'stay' && styles.activeCardStay,
              (journeyPhase === 'see_nurse' || journeyPhase === 'see_doctor') && styles.activeCardAttended,
            ]}
          >
            <View style={styles.activeCardHeader}>
              <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
                <Ionicons name={statusMeta.icon} size={14} color={statusMeta.color} />
                <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
              {(displayCase?.facilityName || facilityName) ? (
                <Text style={styles.facilityChip} numberOfLines={1}>
                  {displayCase?.facilityName || facilityName}
                </Text>
              ) : null}
            </View>

            <Text style={styles.activeCardTitle}>
              {liveTitleForPhase(journeyPhase, hasFacility)}
            </Text>
            <Text style={styles.activeCardSub}>
              {liveSubForPhase(journeyPhase)}
            </Text>

            {journeyPhase === 'waiting_nurse' && displayCase ? (
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

            {journeyPhase === 'stay' && (displayCase?.guidelines || displayCase?.doctorConclusion) ? (
              <View style={styles.followBox}>
                <Text style={styles.detailLabel}>While you stay</Text>
                <Text style={styles.detailValue}>
                  {displayCase.guidelines || displayCase.doctorConclusion}
                </Text>
              </View>
            ) : null}

            <FacilityJourneyStepper
              caseData={displayCase}
              countdownLabel={journeyPhase === 'waiting_nurse' ? countdownLabel : ''}
              hasFacility={hasFacility}
              facilityName={facilityName}
            />

            {liveVisit ? (
              <View style={styles.tipBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                <Text style={styles.tipText}>
                  If your condition worsens while waiting, tell triage staff immediately.
                </Text>
              </View>
            ) : !hasRegisteredFacility ? (
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => openFacilitySelection()}
                activeOpacity={0.85}
              >
                <Text style={styles.startBtnText}>
                  {hasFacility ? 'Choose a registered facility' : 'Choose facility'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => openPatientTab('assessment')}
                activeOpacity={0.85}
              >
                <Text style={styles.startBtnText}>Start assessment</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
        ) : (
        <>
        <Text style={styles.sectionHint}>
          Signed-out visits with the doctor's conclusion and anything you need to follow.
        </Text>
        {loading && history.length === 0 && !activeCase ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Ionicons name="file-tray-outline" size={22} color={COLORS.textTertiary} />
            <Text style={styles.historyEmptyText}>
              When a doctor signs you out, that visit moves here with your care plan.
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
                  <View style={[styles.historyDot, { backgroundColor: COLORS.success }]} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyDate}>
                      {formatWhen(item.completedAt || item.doctorReviewedAt) || 'Signed-out visit'}
                    </Text>
                    <Text style={styles.historyDiagnosis} numberOfLines={open ? 0 : 2}>
                      {item.doctorConclusion ||
                        item.diagnosis ||
                        item.chiefComplaint ||
                        'Visit completed'}
                    </Text>
                    {item.facilityName ? (
                      <Text style={styles.historyNurse}>{item.facilityName}</Text>
                    ) : null}
                  </View>
                  <View style={styles.historyRight}>
                    <View style={[styles.smallBadge, { backgroundColor: COLORS.successLight }]}>
                      <Text style={[styles.smallBadgeText, { color: COLORS.success }]}>
                        Signed out
                      </Text>
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
                    {(item.doctorConclusion || item.diagnosis) ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Doctor conclusion</Text>
                        <Text style={styles.detailValue}>
                          {item.doctorConclusion || item.diagnosis}
                        </Text>
                      </View>
                    ) : null}
                    {item.medications ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Medications</Text>
                        <Text style={styles.detailValue}>{item.medications}</Text>
                      </View>
                    ) : null}
                    {item.guidelines ? (
                      <View style={styles.followBox}>
                        <Text style={styles.detailLabel}>What you should follow</Text>
                        <Text style={styles.detailValue}>{item.guidelines}</Text>
                      </View>
                    ) : null}
                    {item.doctorNotes && !item.guidelines ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Care notes</Text>
                        <Text style={styles.detailValue}>{item.doctorNotes}</Text>
                      </View>
                    ) : null}
                    {item.symptoms ? (
                      <View style={styles.detailBlock}>
                        <Text style={styles.detailLabel}>Reported symptoms</Text>
                        <Text style={styles.detailValue}>{item.symptoms}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.historyTreeLabel}>Visit path</Text>
                    <FacilityJourneyStepper caseData={item} compact />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
        </>
        )}

        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  scroll: { paddingTop: 12, paddingHorizontal: LAYOUT.screenPadding },
  loadingWrap: { paddingTop: 40, alignItems: 'center' },

  tabShell: {
    paddingHorizontal: LAYOUT.screenPadding,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.backgroundSecondary,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.primaryVeryLight,
  },
  tabButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textTertiary,
    opacity: 0.7,
  },
  tabDotActive: {
    backgroundColor: COLORS.primary,
    opacity: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mediumLight,
  },
  tabBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },

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

  sectionHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },

  historyEmpty: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 10,
    alignItems: 'center',
    gap: 8,
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
  followBox: {
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  historyTreeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },

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
  activeCardStay: { borderLeftColor: '#0EA5E9' },
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
