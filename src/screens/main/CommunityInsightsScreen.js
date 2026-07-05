// Community Health Insights — full list tab

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { COMMUNITY_INSIGHTS } from '../../constants/communityInsights';
import { ScreenHeader, LAYOUT } from '../../components/layout/ScreenHeader';
import InsightCard from '../../components/insights/InsightCard';

const FILTERS = ['All', 'Alerts', 'Wellness', 'Recovery'];

export default function CommunityInsightsScreen() {
  const [filter, setFilter] = useState('All');

  const filtered = filter === 'All'
    ? COMMUNITY_INSIGHTS
    : COMMUNITY_INSIGHTS.filter(i => {
        if (filter === 'Alerts') return i.category.includes('Alert') || i.category.includes('Air');
        if (filter === 'Wellness') return i.category.includes('Wellness') || i.category.includes('Nutrition');
        return i.category.includes('Recovery') || i.category.includes('Rest');
      });

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Community Insights"
        subtitle="Health updates and tips for your area"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>

        {/* Summary strip */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="globe-outline" size={22} color={COLORS.primary} />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>Your community at a glance</Text>
            <Text style={styles.summarySub}>
              {COMMUNITY_INSIGHTS.length} active insights · Updated regularly for your area
            </Text>
          </View>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Insight list */}
        <Text style={styles.listTitle}>All insights</Text>
        {filtered.map((insight, index) => (
          <View key={insight.id} style={styles.listItem}>
            <InsightCard insight={insight} />
            <Text style={styles.dateMeta}>{insight.date}</Text>
            {index < filtered.length - 1 && <View style={styles.listDivider} />}
          </View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="newspaper-outline" size={36} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No insights in this category yet</Text>
          </View>
        )}

        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scroll: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 16 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  summarySub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },

  filterRow: { gap: 8, marginBottom: 20, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.primary },

  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  listItem: { marginBottom: 4 },
  dateMeta: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '500',
    marginTop: 6,
    marginLeft: 4,
    marginBottom: 16,
  },
  listDivider: { height: 0 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
});
