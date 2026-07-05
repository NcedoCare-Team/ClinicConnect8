// NcedoCare brand mark — gradient logo + wordmark for headers.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function AppLogo({ size = 'md', showTagline = false, light = false }) {
  const markSize = size === 'lg' ? 54 : size === 'sm' ? 38 : 50;
  const iconSize = size === 'lg' ? 28 : size === 'sm' ? 19 : 26;
  const titleSize = size === 'lg' ? 24 : size === 'sm' ? 17 : 20;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={light ? ['#FFFFFF', '#E0EAFF'] : [COLORS.primary, COLORS.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.mark, { width: markSize, height: markSize, borderRadius: markSize * 0.28 }]}>
        <View style={styles.markInner}>
          <Ionicons name="medical" size={iconSize} color={light ? COLORS.primary : '#FFFFFF'} />
        </View>
        <View style={[styles.markShine, light && { backgroundColor: 'rgba(37,99,235,0.08)' }]} />
      </LinearGradient>

      <View style={styles.textBlock}>
        <Text style={[styles.title, { fontSize: titleSize }, light && styles.titleLight]}>
          Ncedo<Text style={[styles.titleAccent, light && styles.titleAccentLight]}>Care</Text>
        </Text>
        {showTagline && (
          <Text style={[styles.tagline, light && styles.taglineLight]}>
            Smarter care for stronger communities
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    ...{
      shadowColor: COLORS.primaryDark,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 6,
    },
  },
  markInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markShine: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  textBlock: { justifyContent: 'center' },
  title: {
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  titleAccent: { color: COLORS.primary },
  titleLight: { color: '#FFFFFF' },
  titleAccentLight: { color: '#BFDBFE' },
  tagline: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '500',
    marginTop: 1,
  },
  taglineLight: { color: 'rgba(255,255,255,0.72)' },
});
