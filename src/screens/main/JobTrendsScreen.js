// src/screens/main/JobTrendsScreen.js  — repurposed as QueueStatusScreen
// NcedoCare: Real-time patient queue status and triage case details.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, getDocs,
  doc, onSnapshot,
} from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';

const PRIORITY_CONFIG = {
  CRITICAL: { color: COLORS.critical, bg: COLORS.criticalLight, icon: 'alert-circle',      label: 'CRITICAL' },
  HIGH:     { color: COLORS.high,     bg: COLORS.highLight,     icon: 'warning',            label: 'HIGH'     },
  MEDIUM:   { color: COLORS.medium,   bg: COLORS.mediumLight,   icon: 'time',               label: 'MEDIUM'   },
  LOW:      { color: COLORS.low,      bg: COLORS.lowLight,      icon: 'checkmark-circle',   label: 'LOW'      },
};

const STATUS_LABELS = {
  queued:    'In Queue',
  in_review: 'Being Reviewed',
  completed: 'Completed',
};

export default function JobTrendsScreen({ navigation }) {
  const [activeCase, setActiveCase]   = useState(null);
  const [history,    setHistory]      = useState([]);
  const [loading,    setLoading]      = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const uid = auth.currentUser?.uid;

  // Real-time listener for active case
  useEffect(() => {
    if (!uid) return;
    const casesRef = collection(firestore, 'triage_cases');
    const q = query(
      casesRef,
      where('patientId', '==', uid),
      where('status', 'in', ['queued', 'in_review']),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveCase({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveCase(null);
      }
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [uid]);

  const loadHistory = useCallback(async () => {
    if (!uid) return;
    try {
      const q = query(
        collection(firestore, 'triage_cases'),
        where('patientId', '==', uid),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc')
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* non-critical */ }
  }, [uid]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const cfg = activeCase ? (PRIORITY_CONFIG[activeCase.priority] || PRIORITY_CONFIG.LOW) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}>
        <Text style={styles.headerTitle}>My Queue</Text>
        <Text style={styles.headerSub}>Track your triage status in real time</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}>

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={COLORS.primary} size="large" /></View>
        ) : activeCase ? (
          <View style={[styles.activeCard, { borderLeftColor: cfg.color }]}>
            <View style={styles.activeCardHeader}>
              <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: COLORS.primaryVeryLight }]}>
                <Text style={[styles.statusPillText, { color: COLORS.primary }]}>
                  {STATUS_LABELS[activeCase.status] || activeCase.status}
                </Text>
              </View>
            </View>

            <Text style={styles.activeCardTitle}>You are currently in the queue</Text>

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

            {activeCase.aiReasoning && (
              <View style={styles.reasoningBox}>
                <Ionicons name="bulb-outline" size={14} color={COLORS.primary} />
                <Text style={styles.reasoningText} numberOfLines={4}>{activeCase.aiReasoning}</Text>
              </View>
            )}

            {activeCase.nurseDecision && (
              <View style={[styles.nurseDecisionBox, { backgroundColor: cfg.bg }]}>
                <Ionicons name="person-circle-outline" size={16} color={cfg.color} />
                <Text style={[styles.nurseDecisionText, { color: cfg.color }]}>
                  Nurse: {activeCase.nurseDecision}
                  {activeCase.overrideReason ? ` — ${activeCase.overrideReason}` : ''}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.low} />
            <Text style={styles.emptyTitle}>No active queue entry</Text>
            <Text style={styles.emptySub}>Use "Check Symptoms" to start a triage assessment</Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => navigation.getParent?.()?.jumpTo('symptoms') || navigation.navigate('Main')}
              activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Check Symptoms</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Visit History</Text>
            {history.map(item => {
              const hcfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.LOW;
              return (
                <View key={item.id} style={styles.historyCard}>
                  <View style={[styles.historyDot, { backgroundColor: hcfg.color }]} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyDate}>
                      {item.completedAt?.toDate
                        ? item.completedAt.toDate().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Completed visit'}
                    </Text>
                    <Text style={styles.historyDiagnosis} numberOfLines={1}>
                      {item.diagnosis || item.symptoms?.substring(0, 60) || 'Consultation completed'}
                    </Text>
                    {item.nurseDecision && (
                      <Text style={styles.historyNurse}>Nurse: {item.nurseDecision}</Text>
                    )}
                  </View>
                  <View style={[styles.smallBadge, { backgroundColor: hcfg.bg }]}>
                    <Text style={[styles.smallBadgeText, { color: hcfg.color }]}>{hcfg.label}</Text>
                  </View>
                </View>
              );
            })}
          </>
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
    paddingBottom: 24, paddingHorizontal: 24,
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.70)', marginTop: 4 },

  scroll:      { paddingTop: 20, paddingHorizontal: 20 },
  loadingWrap: { paddingTop: 60, alignItems: 'center' },

  // Active case card
  activeCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 20,
    marginBottom: 24, borderLeftWidth: 5,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  activeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  priorityBadgeText: { fontSize: 12, fontWeight: '700' },
  statusPill:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:    { fontSize: 11, fontWeight: '700' },

  activeCardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 16 },

  statsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statBox:     { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 28, fontWeight: '900', color: COLORS.textPrimary },
  statLabel:   { fontSize: 12, fontWeight: '500', color: COLORS.textTertiary, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: COLORS.borderLight },

  reasoningBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 10, padding: 12,
  },
  reasoningText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  nurseDecisionBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    borderRadius: 10, padding: 10, marginTop: 10,
  },
  nurseDecisionText: { fontSize: 12, fontWeight: '600', flex: 1 },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 32,
    alignItems: 'center', gap: 10, marginBottom: 24,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  emptySub:   { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  startBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },

  // History
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12 },
  historyCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  historyDot:      { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  historyInfo:     { flex: 1 },
  historyDate:     { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500', marginBottom: 2 },
  historyDiagnosis:{ fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  historyNurse:    { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  smallBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  smallBadgeText:  { fontSize: 10, fontWeight: '700' },
});
