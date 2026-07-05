// src/screens/main/HealthRecordScreen.js
// Tab Three — "My Health Journey"

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { ScreenHeader, LAYOUT } from '../../components/layout/ScreenHeader';

const PRIORITY_CONFIG = {
  CRITICAL: { color: COLORS.critical, bg: COLORS.criticalLight, label: 'Urgent'   },
  HIGH:     { color: COLORS.high,     bg: COLORS.highLight,     label: 'High'     },
  MEDIUM:   { color: COLORS.medium,   bg: COLORS.mediumLight,   label: 'Moderate' },
  LOW:      { color: COLORS.low,      bg: COLORS.lowLight,      label: 'Low'      },
};

const STATUS_CONFIG = {
  queued:    { label: 'Submitted', color: COLORS.medium,  icon: 'send-outline'       },
  in_review: { label: 'Reviewed',  color: COLORS.primary, icon: 'eye-outline'        },
  completed: { label: 'Closed',    color: COLORS.low,     icon: 'checkmark-circle-outline' },
};

const EVENT_ICONS = {
  assessment: 'sparkles-outline',
  consultation: 'medical-outline',
  medication: 'medkit-outline',
  default: 'document-text-outline',
};

export default function HealthRecordScreen() {
  const [visits,     setVisits]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    try {
      if (uid) {
        const q = query(
          collection(firestore, 'triage_cases'),
          where('patientId', '==', uid),
          orderBy('createdAt', 'desc'),
        );
        const snap = await getDocs(q);
        setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Health Journey"
        subtitle="Your care history, most recent first"
        rightIcon="filter-outline"
        onRightPress={() => {}}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Setting things up…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}>

          {visits.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="git-network-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Your journey starts here</Text>
              <Text style={styles.emptySub}>
                After your first AI health assessment, your care timeline will appear here — assessments, consultations, and more.
              </Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {visits.map((visit, i) => (
                <TimelineEntry key={visit.id} visit={visit} isLast={i === visits.length - 1} isFirst={i === 0} />
              ))}
            </View>
          )}

          <View style={{ height: LAYOUT.bottomTabClearance }} />
        </ScrollView>
      )}
    </View>
  );
}

function TimelineEntry({ visit, isLast, isFirst }) {
  const priority = PRIORITY_CONFIG[visit.priority] || PRIORITY_CONFIG.LOW;
  const status   = STATUS_CONFIG[visit.status] || { label: visit.status, color: COLORS.textTertiary, icon: 'ellipse-outline' };

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: priority.color, borderColor: priority.bg }]}>
          <Ionicons name={EVENT_ICONS.assessment} size={12} color="#FFFFFF" />
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      <TouchableOpacity
        style={[styles.entryCard, isFirst && styles.entryCardFirst]}
        activeOpacity={0.85}>
        <View style={styles.entryTop}>
          <Text style={styles.entryTitle} numberOfLines={1}>
            {visit.diagnosis || 'Health Assessment'}
          </Text>
          <View style={[styles.urgencyBadge, { backgroundColor: priority.bg }]}>
            <Text style={[styles.urgencyText, { color: priority.color }]}>{priority.label}</Text>
          </View>
        </View>

        <Text style={styles.entryDate}>
          {visit.createdAt?.toDate
            ? visit.createdAt.toDate().toLocaleDateString('en-ZA', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              })
            : 'Recent'}
        </Text>

        {visit.symptoms ? (
          <Text style={styles.entrySymptoms} numberOfLines={2}>{visit.symptoms}</Text>
        ) : null}

        <View style={styles.entryFooter}>
          <View style={styles.statusChip}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          {visit.status === 'completed' && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={11} color={COLORS.primary} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F1A14', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },

  scroll: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 20 },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 14 },
  timelineRail: { alignItems: 'center', width: 28, paddingTop: 4 },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    marginTop: 4,
    minHeight: 48,
  },

  entryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  entryCardFirst: { borderColor: COLORS.primaryGlow, borderWidth: 1.5 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  entryTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  urgencyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  urgencyText: { fontSize: 10, fontWeight: '700' },
  entryDate: { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, marginBottom: 8 },
  entrySymptoms: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 10 },
  entryFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.primaryVeryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  verifiedText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
});
