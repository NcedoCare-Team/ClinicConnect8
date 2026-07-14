// src/screens/main/JobTrendsScreen.js  — patient queue / journey status
// Patients never see triage colour codes — staff-only. This screen shows
// queue position, wait estimates, and call-in notifications only.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLLECTIONS } from '../../services/firestorePaths';
import { COLORS } from '../../constants/colors';

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
    return { label, color: COLORS.success || '#16A34A', bg: '#DCFCE7', icon: 'notifications' };
  }
  if (label === 'Under process') {
    return { label, color: COLORS.primary, bg: COLORS.primaryVeryLight, icon: 'hourglass' };
  }
  if (label === 'Visit complete') {
    return { label, color: COLORS.low, bg: COLORS.lowLight, icon: 'checkmark-circle' };
  }
  return { label, color: COLORS.medium, bg: COLORS.mediumLight, icon: 'time' };
}

export default function JobTrendsScreen({ navigation }) {
  const [activeCase, setActiveCase]   = useState(null);
  const [history,    setHistory]      = useState([]);
  const [loading,    setLoading]      = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const casesRef = collection(firestore, COLLECTIONS.TRIAGE_CASES);
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
        collection(firestore, COLLECTIONS.TRIAGE_CASES),
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

  const statusMeta = activeCase ? patientStatusMeta(activeCase) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}>
        <Text style={styles.headerTitle}>My care journey</Text>
        <Text style={styles.headerSub}>Queue status updates as the facility prioritises patients</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}>

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={COLORS.primary} size="large" /></View>
        ) : activeCase ? (
          <View style={[styles.activeCard, statusMeta?.label === 'Please come in' && styles.activeCardCall]}>
            <View style={styles.activeCardHeader}>
              <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
                <Ionicons name={statusMeta.icon} size={14} color={statusMeta.color} />
                <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
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
                ? 'Please proceed to the triage / reception area when called.'
                : 'Wait times update automatically based on emergencies and patients ahead of you. Triage decisions are for clinical staff only.'}
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

            <View style={styles.tipBox}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
              <Text style={styles.tipText}>
                If your condition worsens while waiting, tell triage staff immediately.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.low} />
            <Text style={styles.emptyTitle}>No active queue entry</Text>
            <Text style={styles.emptySub}>Use &quot;Check Symptoms&quot; to start a triage assessment</Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => navigation.getParent?.()?.jumpTo('symptoms') || navigation.navigate('Main')}
              activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Check Symptoms</Text>
            </TouchableOpacity>
          </View>
        )}

        {history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Visit history</Text>
            {history.map(item => (
              <View key={item.id} style={styles.historyCard}>
                <View style={[styles.historyDot, { backgroundColor: COLORS.primary }]} />
                <View style={styles.historyInfo}>
                  <Text style={styles.historyDate}>
                    {item.completedAt?.toDate
                      ? item.completedAt.toDate().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Completed visit'}
                  </Text>
                  <Text style={styles.historyDiagnosis} numberOfLines={2}>
                    {item.doctorConclusion || item.diagnosis || 'Consultation completed'}
                  </Text>
                  {item.facilityName ? (
                    <Text style={styles.historyNurse}>{item.facilityName}</Text>
                  ) : null}
                </View>
                <View style={[styles.smallBadge, { backgroundColor: COLORS.primaryVeryLight }]}>
                  <Text style={[styles.smallBadgeText, { color: COLORS.primary }]}>Done</Text>
                </View>
              </View>
            ))}
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

  activeCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 20,
    marginBottom: 24, borderLeftWidth: 5, borderLeftColor: COLORS.primary,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  activeCardCall: { borderLeftColor: '#16A34A' },
  activeCardHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 12 },
  statusPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText:    { fontSize: 11, fontWeight: '700' },

  activeCardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  activeCardSub:   { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 16 },

  statsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statBox:     { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 28, fontWeight: '900', color: COLORS.textPrimary },
  statLabel:   { fontSize: 12, fontWeight: '500', color: COLORS.textTertiary, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: COLORS.borderLight },

  tipBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 10, padding: 12,
  },
  tipText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

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
