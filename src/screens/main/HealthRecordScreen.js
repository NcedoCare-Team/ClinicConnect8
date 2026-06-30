// src/screens/main/HealthRecordScreen.js
// NcedoCare: Patient health profile viewer and visit history timeline.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, getDocs,
} from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';

const PRIORITY_CONFIG = {
  CRITICAL: { color: COLORS.critical, bg: COLORS.criticalLight, label: 'CRITICAL' },
  HIGH:     { color: COLORS.high,     bg: COLORS.highLight,     label: 'HIGH'     },
  MEDIUM:   { color: COLORS.medium,   bg: COLORS.mediumLight,   label: 'MEDIUM'   },
  LOW:      { color: COLORS.low,      bg: COLORS.lowLight,      label: 'LOW'      },
};

export default function HealthRecordScreen() {
  const [profile,    setProfile]    = useState(null);
  const [visits,     setVisits]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    try {
      const p = await UserProfileService.getProfile();
      setProfile(p);

      if (uid) {
        const q = query(
          collection(firestore, 'triage_cases'),
          where('patientId', '==', uid),
          orderBy('createdAt', 'desc')
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
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}>
        <Text style={styles.headerTitle}>Health Records</Text>
        <Text style={styles.headerSub}>Your profile and visit history</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}>

          {/* Health Profile */}
          {profile && (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="person-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.cardTitle}>Health Profile</Text>
              </View>

              <ProfileRow icon="language-outline" label="Preferred Language" value={langLabel(profile.language)} />

              <ProfileRow
                icon="pulse-outline"
                label="Chronic Conditions"
                value={profile.chronicConditions?.length ? profile.chronicConditions.join(', ') : 'None recorded'}
              />

              <ProfileRow
                icon="warning-outline"
                label="Allergies"
                value={profile.allergies || 'None recorded'}
              />

              <ProfileRow
                icon="medkit-outline"
                label="Current Medications"
                value={profile.currentMedications || 'None recorded'}
                last
              />
            </View>
          )}

          {/* Visit History Timeline */}
          <Text style={styles.sectionTitle}>Visit History</Text>

          {visits.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={44} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>No visits yet</Text>
              <Text style={styles.emptySub}>Your consultation history will appear here after your first triage assessment</Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {visits.map((visit, i) => {
                const cfg = PRIORITY_CONFIG[visit.priority] || PRIORITY_CONFIG.LOW;
                return (
                  <View key={visit.id} style={styles.timelineItem}>
                    {/* Timeline line + dot */}
                    <View style={styles.timelineLeft}>
                      <View style={[styles.timelineDot, { backgroundColor: cfg.color }]} />
                      {i < visits.length - 1 && <View style={styles.timelineLine} />}
                    </View>

                    <View style={[styles.visitCard, i === 0 && { borderColor: cfg.color, borderWidth: 2 }]}>
                      <View style={styles.visitCardTop}>
                        <Text style={styles.visitDate}>
                          {visit.createdAt?.toDate
                            ? visit.createdAt.toDate().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                            : 'Visit'}
                        </Text>
                        <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>

                      {visit.diagnosis ? (
                        <Text style={styles.visitDiagnosis}>{visit.diagnosis}</Text>
                      ) : (
                        <Text style={styles.visitSymptoms} numberOfLines={2}>{visit.symptoms}</Text>
                      )}

                      <View style={styles.visitMeta}>
                        <StatusChip status={visit.status} />
                        {visit.nurseDecision && (
                          <View style={styles.metaItem}>
                            <Ionicons name="person-outline" size={11} color={COLORS.textTertiary} />
                            <Text style={styles.metaText}>Nurse: {visit.nurseDecision}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </View>
  );
}

function ProfileRow({ icon, label, value, last }) {
  return (
    <View style={[styles.profileRow, last && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
      <View style={styles.profileRowLeft}>
        <Ionicons name={icon} size={15} color={COLORS.primary} />
        <Text style={styles.profileLabel}>{label}</Text>
      </View>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

function StatusChip({ status }) {
  const MAP = {
    queued:    { label: 'In Queue',   color: COLORS.medium },
    in_review: { label: 'Reviewed',   color: COLORS.primary },
    completed: { label: 'Completed',  color: COLORS.low },
  };
  const s = MAP[status] || { label: status, color: COLORS.textTertiary };
  return (
    <View style={styles.metaItem}>
      <View style={[styles.statusDot, { backgroundColor: s.color }]} />
      <Text style={[styles.metaText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function langLabel(code) {
  const MAP = { en: 'English', zu: 'isiZulu', xh: 'isiXhosa', af: 'Afrikaans', st: 'Sesotho' };
  return MAP[code] || code || 'Not set';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 24, paddingHorizontal: 24,
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.70)', marginTop: 4 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { paddingTop: 20, paddingHorizontal: 20 },
  sectionTitle:{ fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 14 },

  // Health Profile Card
  card: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18, marginBottom: 24,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },

  profileRow: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, marginBottom: 0,
  },
  profileRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  profileLabel:   { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  profileValue:   { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500', paddingLeft: 21 },

  // Timeline
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  timelineLeft: { alignItems: 'center', paddingTop: 6, width: 14 },
  timelineDot:  { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  timelineLine: { flex: 1, width: 2, backgroundColor: COLORS.borderLight, marginTop: 4, minHeight: 40 },

  visitCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  visitCardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  visitDate:      { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary },
  priorityBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  priorityBadgeText:{ fontSize: 10, fontWeight: '700' },
  visitDiagnosis: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  visitSymptoms:  { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8, lineHeight: 18 },

  visitMeta:  { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:   { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },

  // Empty
  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 32,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  emptySub:   { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
