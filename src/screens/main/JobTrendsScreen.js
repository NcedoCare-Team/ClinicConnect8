// src/screens/main/JobTrendsScreen.js — Care Journey (live queue + visit history)
// Patients never see triage colour codes. They see journey updates and visit history.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ScrollView, ActivityIndicator, RefreshControl,
  LayoutAnimation, UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLLECTIONS } from '../../services/firestorePaths';
import { COLORS } from '../../constants/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function patientStatusLabel(c) {
  if (!c) return '';
  if (c.status === 'completed') return 'Visit complete';
  if (c.patientCalledAt || c.patientNotified) return 'Please come in';
  if (c.status === 'in_review') return 'Under process';
  return 'In queue';
}

function patientStatusMeta(c) {
  const label = patientStatusLabel(c);
  if (label === 'Please come in') {
    return { label, color: '#16A34A', bg: '#DCFCE7', icon: 'notifications' };
  }
  if (label === 'Under process') {
    return { label, color: COLORS.primary, bg: COLORS.primaryVeryLight, icon: 'hourglass' };
  }
  if (label === 'Visit complete') {
    return { label, color: COLORS.low, bg: COLORS.lowLight, icon: 'checkmark-circle' };
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

function journeySteps(activeCase) {
  if (!activeCase) return [];
  const called = !!(activeCase.patientCalledAt || activeCase.patientNotified);
  const reviewing = activeCase.status === 'in_review' || called;
  return [
    {
      id: 'submitted',
      title: 'Assessment submitted',
      detail: activeCase.facilityName
        ? `Sent to ${activeCase.facilityName}`
        : 'Sent to your facility',
      done: true,
      active: false,
    },
    {
      id: 'queue',
      title: 'In facility queue',
      detail: activeCase.queuePosition
        ? `Position #${activeCase.queuePosition}${activeCase.estimatedWait ? ` · Est. ${activeCase.estimatedWait}` : ''}`
        : 'Waiting for clinical staff',
      done: reviewing || called,
      active: activeCase.status === 'queued',
    },
    {
      id: 'process',
      title: 'Under process',
      detail: 'Care team is reviewing your assessment',
      done: called,
      active: reviewing && !called,
    },
    {
      id: 'call',
      title: 'Please come in',
      detail: called
        ? 'A nurse is ready for you at reception / triage'
        : 'You will be notified when it is your turn',
      done: false,
      active: called,
    },
  ];
}

export default function JobTrendsScreen({ navigation }) {
  const [activeCase, setActiveCase] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const uid = auth.currentUser?.uid;

  // Live active journey
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(firestore, COLLECTIONS.TRIAGE_CASES),
      where('patientId', '==', uid),
      where('status', 'in', ['queued', 'in_review']),
      orderBy('createdAt', 'desc')
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

  // Live visit history (auto-updates when a visit completes)
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
    // Listeners keep state live; brief spinner for user feedback
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const statusMeta = activeCase ? patientStatusMeta(activeCase) : null;
  const steps = useMemo(() => journeySteps(activeCase), [activeCase]);

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>My care journey</Text>
        <Text style={styles.headerSub}>
          Live queue updates and a full history of every visit
        </Text>
      </LinearGradient>

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

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : activeCase ? (
          <View
            style={[
              styles.activeCard,
              statusMeta?.label === 'Please come in' && styles.activeCardCall,
            ]}
          >
            <View style={styles.activeCardHeader}>
              <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
                <Ionicons name={statusMeta.icon} size={14} color={statusMeta.color} />
                <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
              {activeCase.facilityName ? (
                <Text style={styles.facilityChip} numberOfLines={1}>
                  {activeCase.facilityName}
                </Text>
              ) : null}
            </View>

            <Text style={styles.activeCardTitle}>
              {statusMeta.label === 'Please come in'
                ? 'A nurse is ready for you'
                : statusMeta.label === 'Under process'
                  ? 'Your assessment is under process'
                  : 'You are in the facility queue'}
            </Text>
            <Text style={styles.activeCardSub}>
              {statusMeta.label === 'Please come in'
                ? 'Please proceed to the triage / reception area now.'
                : 'Wait times update as emergencies and other patients are prioritised. Clinical triage details stay with the care team.'}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>#{activeCase.queuePosition || '—'}</Text>
                <Text style={styles.statLabel}>Position</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{activeCase.estimatedWait || '—'}</Text>
                <Text style={styles.statLabel}>Est. Wait</Text>
              </View>
            </View>

            {/* Journey timeline */}
            <View style={styles.timeline}>
              {steps.map((step, index) => (
                <View key={step.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[
                        styles.timelineDot,
                        step.done && styles.timelineDotDone,
                        step.active && styles.timelineDotActive,
                      ]}
                    />
                    {index < steps.length - 1 ? (
                      <View
                        style={[
                          styles.timelineLine,
                          step.done && styles.timelineLineDone,
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text
                      style={[
                        styles.timelineTitle,
                        step.active && styles.timelineTitleActive,
                      ]}
                    >
                      {step.title}
                    </Text>
                    <Text style={styles.timelineDetail}>{step.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.tipBox}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
              <Text style={styles.tipText}>
                If your condition worsens while waiting, tell triage staff immediately.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="git-network-outline" size={48} color={COLORS.textTertiary} />
            <Text style={styles.emptyTitle}>No active journey</Text>
            <Text style={styles.emptySub}>
              Start an assessment and your live queue status will appear here.
            </Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() =>
                navigation.getParent?.()?.jumpTo('assessment') ||
                navigation.navigate('Main', { tab: 'assessment' })
              }
              activeOpacity={0.85}
            >
              <Text style={styles.startBtnText}>Check Symptoms</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Visit history</Text>
        {history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyText}>
              Completed visits will show here with your care plan summary.
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
                    <View
                      style={[styles.smallBadge, { backgroundColor: COLORS.primaryVeryLight }]}
                    >
                      <Text style={[styles.smallBadgeText, { color: COLORS.primary }]}>
                        Done
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
                    {(item.doctorReviewedByName || item.reviewedByName) && (
                      <Text style={styles.historyMeta}>
                        Recorded by{' '}
                        {item.doctorReviewedByName || item.reviewedByName}
                      </Text>
                    )}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginTop: 4,
  },

  scroll: { paddingTop: 20, paddingHorizontal: 20 },
  loadingWrap: { paddingTop: 60, alignItems: 'center' },

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

  activeCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.09,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  activeCardCall: { borderLeftColor: '#16A34A' },
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
  statValue: { fontSize: 28, fontWeight: '900', color: COLORS.textPrimary },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  statDivider: { width: 1, height: 40, backgroundColor: COLORS.borderLight },

  timeline: { marginBottom: 14 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.borderLight,
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  timelineDotDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timelineDotActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
    transform: [{ scale: 1.15 }],
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 28,
    backgroundColor: COLORS.borderLight,
    marginVertical: 2,
  },
  timelineLineDone: { backgroundColor: COLORS.primaryGlow || '#BFDBFE' },
  timelineBody: { flex: 1, paddingBottom: 14 },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  timelineTitleActive: { color: COLORS.textPrimary },
  timelineDetail: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: 2,
    lineHeight: 17,
  },

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
    padding: 32,
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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
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
  historyMeta: { fontSize: 11, color: COLORS.textTertiary, marginTop: 2 },
});
