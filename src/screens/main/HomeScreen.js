// src/screens/main/HomeScreen.js
// Tab One — "My Care" (Home)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { HOME_INSIGHT_PREVIEW } from '../../constants/communityInsights';
import { UserProfileService } from '../../services/UserProfileService';
import { HomeHeader, LAYOUT } from '../../components/layout/ScreenHeader';
import InsightCard from '../../components/insights/InsightCard';

const STATUS_BADGE = {
  queued:    { label: 'Submitted', color: COLORS.medium,  bg: COLORS.mediumLight  },
  in_review: { label: 'Reviewed',  color: COLORS.primary, bg: COLORS.primaryVeryLight },
  completed: { label: 'Closed',    color: COLORS.low,     bg: COLORS.lowLight     },
};

export default function HomeScreen({ navigation }) {
  const [userName,         setUserName]         = useState('');
  const [facility,         setFacility]         = useState('');
  const [avatarUri,        setAvatarUri]        = useState(null);
  const [careItems,        setCareItems]        = useState([]);
  const [lastAssessment,   setLastAssessment]   = useState(null);
  const [loading,          setLoading]          = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    const profile = await UserProfileService.getProfile();
    const pic = await UserProfileService.getProfilePicture();

    setUserName((profile.displayName || auth.currentUser?.displayName || '').split(' ')[0] || 'there');
    setFacility(profile.primaryFacility || profile.location || '');
    setAvatarUri(pic);

    if (uid) {
      try {
        const casesRef = collection(firestore, 'triage_cases');
        const snap = await getDocs(query(
          casesRef,
          where('patientId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(5),
        ));
        const cases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCareItems(buildCareTimeline(cases, profile));
        setLastAssessment(cases[0] || null);
      } catch { /* non-critical */ }
    }
    setLoading(false);
  }, []);

  const handleChangeFacility = () => {
    Alert.alert('Change Facility', 'Facility selection will be available in a future update.');
  };

  const goToInsights = () => navigation.getParent()?.jumpTo('insights');

  return (
    <View style={styles.container}>
      <HomeHeader
        userName={userName}
        facility={facility || 'Connect a healthcare facility'}
        avatarUri={avatarUri}
        onProfilePress={() => navigation.getParent()?.jumpTo('profile')}
        onChangeFacility={handleChangeFacility}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Primary Action Card */}
        <TouchableOpacity
          style={styles.actionCardWrap}
          onPress={() => navigation.getParent()?.jumpTo('assessment')}
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

        {/* Personal Health Snapshot — directly under action card */}
        <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Personal Health Snapshot</Text>
        <View style={styles.statsGrid}>
          <StatTile icon="heart-outline" label="Heart Rate" value="—" unit="bpm" />
          <StatTile icon="thermometer-outline" label="Temperature" value="—" unit="°C" />
          <StatTile
            icon="clipboard-outline"
            label="Last Assessment"
            value={formatAssessmentDate(lastAssessment)}
            compact
          />
          <TouchableOpacity style={styles.statTile} activeOpacity={0.8}>
            <View style={[styles.statIcon, { backgroundColor: COLORS.infoLight }]}>
              <Ionicons name="watch-outline" size={18} color={COLORS.info} />
            </View>
            <Text style={styles.statLabel}>Health Device</Text>
            <Text style={styles.statConnect}>Connect a device</Text>
          </TouchableOpacity>
        </View>

        {/* Care Timeline */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>Care Timeline</Text>
          <TouchableOpacity onPress={() => navigation.getParent()?.jumpTo('journey')}>
            <Text style={styles.sectionLink}>View all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : careItems.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Ionicons name="calendar-outline" size={32} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No upcoming care items yet</Text>
            <Text style={styles.emptySub}>Start an assessment to begin your care journey</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timelineScroll}>
            {careItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.timelineCard}
                onPress={() => navigation.getParent()?.jumpTo('journey')}
                activeOpacity={0.85}>
                <View style={[styles.timelineIcon, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
                <Text style={styles.timelineTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.timelineMeta}>{item.meta}</Text>
                {item.badge ? (
                  <View style={[styles.timelineBadge, { backgroundColor: item.badge.bg }]}>
                    <Text style={[styles.timelineBadgeText, { color: item.badge.color }]}>
                      {item.badge.label}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Community Health Insights — 3 preview cards */}
        <Text style={[styles.sectionTitle, { marginBottom: 12, marginTop: 4 }]}>
          Community Health Insights
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.insightsScroll}>
          {HOME_INSIGHT_PREVIEW.map((insight, index) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              style={styles.insightCard}
              showViewMore={index === HOME_INSIGHT_PREVIEW.length - 1}
              onViewMore={goToInsights}
            />
          ))}
        </ScrollView>

        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

function StatTile({ icon, label, value, unit, compact }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: COLORS.primaryVeryLight }]}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={compact ? 2 : 1}>
        {value}{unit ? ` ${unit}` : ''}
      </Text>
    </View>
  );
}

function formatAssessmentDate(assessment) {
  if (!assessment?.createdAt?.toDate) return 'None yet';
  return assessment.createdAt.toDate().toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short',
  });
}

function buildCareTimeline(cases, profile) {
  const items = [];

  if (profile.currentMedications) {
    items.push({
      id: 'med-reminder',
      icon: 'medkit-outline',
      iconColor: COLORS.primary,
      iconBg: COLORS.primaryVeryLight,
      title: profile.currentMedications.split(',')[0]?.trim() || 'Medication',
      meta: 'Daily reminder · 08:00',
    });
  }

  cases.slice(0, 4).forEach(c => {
    const badge = STATUS_BADGE[c.status] || STATUS_BADGE.queued;
    items.push({
      id: c.id,
      icon: 'document-text-outline',
      iconColor: badge.color,
      iconBg: badge.bg,
      title: c.diagnosis || c.symptoms?.substring(0, 40) || 'Health Assessment',
      meta: c.createdAt?.toDate
        ? c.createdAt.toDate().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
        : 'Recent',
      badge,
    });
  });

  if (items.length === 0) {
    items.push({
      id: 'follow-up',
      icon: 'calendar-outline',
      iconColor: COLORS.info,
      iconBg: COLORS.infoLight,
      title: 'Schedule a follow-up',
      meta: 'After your first assessment',
    });
  }

  return items;
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scrollContent: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 20 },

  actionCardWrap: { marginBottom: 24, borderRadius: LAYOUT.cardRadius, overflow: 'hidden', ...cardShadow },
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
  sectionLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
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
  statLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  statConnect: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  loadingRow: { paddingVertical: 32, alignItems: 'center' },
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

  insightsScroll: { gap: 12, paddingBottom: 4, marginBottom: 8 },
  insightCard: { width: 280 },
});
