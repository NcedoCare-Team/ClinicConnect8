// NcedoCare brand mark — gradient logo + wordmark for headers.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function AppLogo({ size = 'md', showTagline = false }) {
  const markSize = size === 'lg' ? 48 : size === 'sm' ? 36 : 42;
  const iconSize = size === 'lg' ? 26 : size === 'sm' ? 18 : 22;
  const titleSize = size === 'lg' ? 24 : size === 'sm' ? 17 : 20;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.mark, { width: markSize, height: markSize, borderRadius: markSize * 0.28 }]}>
        <View style={styles.markInner}>
          <Ionicons name="medical" size={iconSize} color="#FFFFFF" />
        </View>
        <View style={styles.markShine} />
      </LinearGradient>

      <View style={styles.textBlock}>
        <Text style={[styles.title, { fontSize: titleSize }]}>
          Ncedo<Text style={styles.titleAccent}>Care</Text>
        </Text>
        {showTagline && (
          <Text style={styles.tagline}>Smarter care for stronger communities</Text>
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
  tagline: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '500',
    marginTop: 1,
  },
});
