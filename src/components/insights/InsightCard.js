// Reusable community health insight card — used on Home preview and Insights tab.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { LAYOUT } from '../layout/ScreenHeader';

export default function InsightCard({ insight, style, showViewMore, onViewMore }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name={insight.icon} size={18} color={COLORS.primary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>Community Health Insights</Text>
        {insight.category ? (
          <Text style={styles.category}>{insight.category}</Text>
        ) : null}
        {insight.title ? (
          <Text style={styles.title}>{insight.title}</Text>
        ) : null}
        <Text style={styles.text}>{insight.text}</Text>
        {showViewMore && (
          <TouchableOpacity style={styles.viewMoreBtn} onPress={onViewMore} activeOpacity={0.75}>
            <Text style={styles.viewMoreText}>View more</Text>
            <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.backgroundTertiary,
    borderRadius: LAYOUT.cardRadius,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  text: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
