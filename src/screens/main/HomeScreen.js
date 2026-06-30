// src/screens/main/HomeScreen.js
// NcedoCare Patient Home Dashboard
// Sections: Header · Current Queue Status · Quick Actions · Recent Activity

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, Linking, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { UserProfileService } from '../../services/UserProfileService';

const PRIORITY_CONFIG = {
  CRITICAL: { color: COLORS.critical, bg: COLORS.criticalLight, label: 'CRITICAL', icon: 'alert-circle' },
  HIGH:     { color: COLORS.high,     bg: COLORS.highLight,     label: 'HIGH',     icon: 'warning'      },
  MEDIUM:   { color: COLORS.medium,   bg: COLORS.mediumLight,   label: 'MEDIUM',   icon: 'time'         },
  LOW:      { color: COLORS.low,      bg: COLORS.lowLight,      label: 'LOW',      icon: 'checkmark-circle' },
};

const QUICK_ACTIONS = [
  { id: 'symptoms', icon: 'pulse',          label: 'Check\nSymptoms',     color: COLORS.primary,  tab: 'symptoms' },
  { id: 'queue',    icon: 'list',            label: 'My\nQueue',           color: COLORS.high,     tab: 'queue'    },
  { id: 'records',  icon: 'document-text',  label: 'Health\nRecords',     color: COLORS.info,     tab: 'records'  },
  { id: 'emergency',icon: 'call',           label: 'Emergency\nHotline',  color: COLORS.critical, action: 'emergency' },
];

export default function HomeScreen({ navigation }) {
  const [userName,   setUserName]   = useState('');
  const [userRole,   setUserRole]   = useState('patient');
  const [activeCase, setActiveCase] = useState(null);   // current triage case in queue
  const [recentVisits, setRecentVisits] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;

    // Load user name and role
    const profile = await UserProfileService.getProfile();
    setUserName((profile.displayName || auth.currentUser?.displayName || '').split(' ')[0] || 'there');

    if (uid) {
      try {
        const userSnap = await getDoc(doc(firestore, 'users', uid));
        const role = userSnap.exists() ? (userSnap.data().role || 'patient') : 'patient';
        setUserRole(role);

        // Load active triage case for patient
        if (role === 'patient') {
          const casesRef = collection(firestore, 'triage_cases');
          const q = query(
            casesRef,
            where('patientId', '==', uid),
            where('status', 'in', ['queued', 'in_review']),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) setActiveCase({ id: snap.docs[0].id, ...snap.docs[0].data() });

          // Load recent visits
          const visitQ = query(
            casesRef,
            where('patientId', '==', uid),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc'),
            limit(3)
          );
          const visitSnap = await getDocs(visitQ);
          setRecentVisits(visitSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch { /* non-critical */ }
    }
    setLoading(false);
  }, []);

  const handleQuickAction = (action) => {
    if (action.tab) {
      navigation.getParent()?.jumpTo(action.tab);
    } else if (action.action === 'emergency') {
      Alert.alert('Emergency Services', 'Call 10177 (Emergency) or 0800 029 999 (Health Hotline)?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call 10177', onPress: () => Linking.openURL('tel:10177') },
        { text: 'Health Hotline', onPress: () => Linking.openURL('tel:0800029999') },
      ]);
    }
  };

  const priorityCfg = activeCase ? (PRIORITY_CONFIG[activeCase.priority] || PRIORITY_CONFIG.LOW) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      {/* Hero Header */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.heroHeader}>
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroGreeting}>{greeting},</Text>
              <Text style={styles.heroName}>{userName}</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.getParent()?.jumpTo('profile')}>
              <Text style={styles.profileInitials}>
                {userName ? userName.charAt(0).toUpperCase() : 'U'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.heroSub}>NcedoCare · Smarter care for stronger communities</Text>
        </View>
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />
      </LinearGradient>

      <View style={styles.contentSheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Active Queue Status */}
          {loading ? (
            <View style={styles.statusCard}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : activeCase ? (
            <TouchableOpacity
              style={[styles.statusCard, { borderLeftColor: priorityCfg.color }]}
              onPress={() => navigation.getParent()?.jumpTo('queue')}>
              <View style={styles.statusHeader}>
                <View style={[styles.priorityBadge, { backgroundColor: priorityCfg.bg }]}>
                  <Ionicons name={priorityCfg.icon} size={14} color={priorityCfg.color} />
                  <Text style={[styles.priorityText, { color: priorityCfg.color }]}>
                    {priorityCfg.label}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
              </View>
              <Text style={styles.statusTitle}>You are currently in the queue</Text>
              <Text style={styles.statusSub}>
                Position #{activeCase.queuePosition || '—'} · Est. wait: {activeCase.estimatedWait || 'Calculating...'}
              </Text>
              {activeCase.aiReasoning && (
                <Text style={styles.statusReason} numberOfLines={2}>
                  {activeCase.aiReasoning}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.statusCard, { borderLeftColor: COLORS.low }]}>
              <View style={[styles.priorityBadge, { backgroundColor: COLORS.lowLight }]}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.low} />
                <Text style={[styles.priorityText, { color: COLORS.low }]}>No Active Cases</Text>
              </View>
              <Text style={styles.statusTitle}>Not currently in queue</Text>
              <Text style={styles.statusSub}>Use "Check Symptoms" to start a triage assessment</Text>
            </View>
          )}

          {/* Quick Actions */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map(action => (
              <TouchableOpacity
                key={action.id}
                style={styles.quickActionCard}
                onPress={() => handleQuickAction(action)}
                activeOpacity={0.8}>
                <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}15` }]}>
                  <Ionicons name={action.icon} size={26} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recent Visits */}
          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <Text style={styles.sectionTitle}>Recent Visits</Text>
          </View>
          {recentVisits.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={36} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No visits yet</Text>
              <Text style={styles.emptySub}>Your consultation history will appear here</Text>
            </View>
          ) : (
            recentVisits.map(visit => {
              const cfg = PRIORITY_CONFIG[visit.priority] || PRIORITY_CONFIG.LOW;
              return (
                <View key={visit.id} style={styles.visitCard}>
                  <View style={[styles.visitPriorityDot, { backgroundColor: cfg.color }]} />
                  <View style={styles.visitInfo}>
                    <Text style={styles.visitDate}>
                      {visit.completedAt?.toDate
                        ? visit.completedAt.toDate().toLocaleDateString('en-ZA')
                        : 'Recent visit'}
                    </Text>
                    <Text style={styles.visitDiagnosis} numberOfLines={1}>
                      {visit.diagnosis || 'Consultation completed'}
                    </Text>
                  </View>
                  <View style={[styles.smallBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.smallBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  heroHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 44, paddingHorizontal: 24,
    position: 'relative', overflow: 'hidden',
  },
  heroContent:  { zIndex: 2 },
  heroTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.70)', fontWeight: '500' },
  heroName:     { fontSize: 30, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  heroSub:      { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginTop: 6 },
  heroDeco1: {
    position: 'absolute', right: -30, top: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDeco2: {
    position: 'absolute', right: 50, bottom: -50,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  profileBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.50)',
  },
  profileInitials: { fontSize: 20, fontWeight: '800', color: COLORS.white },

  contentSheet: {
    flex: 1, backgroundColor: COLORS.backgroundSecondary,
    borderTopRightRadius: 28, marginTop: -20, overflow: 'hidden',
  },
  scrollContent: { paddingTop: 20, paddingHorizontal: 20 },

  // Queue status card
  statusCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    marginBottom: 20, borderLeftWidth: 4,
    borderLeftColor: COLORS.border,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:10 },
      android: { elevation: 3 },
    }),
  },
  statusHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  priorityText:  { fontSize: 12, fontWeight: '700' },
  statusTitle:   { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  statusSub:     { fontSize: 13, color: COLORS.textSecondary },
  statusReason:  { fontSize: 12, color: COLORS.textTertiary, marginTop: 8, lineHeight: 16 },

  // Section
  sectionHeader: { marginBottom: 12 },
  sectionTitle:  { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },

  // Quick actions
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  quickActionCard: {
    width: '47%', backgroundColor: COLORS.white, borderRadius: 16,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8 },
      android: { elevation: 2 },
    }),
  },
  quickActionIcon:  { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickActionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', lineHeight: 16 },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 28,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  emptySub:  { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },

  // Visit cards
  visitCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:6 },
      android: { elevation: 2 },
    }),
  },
  visitPriorityDot: { width: 10, height: 10, borderRadius: 5 },
  visitInfo:        { flex: 1 },
  visitDate:        { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500', marginBottom: 2 },
  visitDiagnosis:   { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  smallBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  smallBadgeText:   { fontSize: 10, fontWeight: '700' },
});
