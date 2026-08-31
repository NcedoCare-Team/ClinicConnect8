// NcedoCare brand mark — app logo image + wordmark for headers.

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';

const LOGO = require('../../../assets/logo.png');

export default function AppLogo({ size = 'md', showTagline = false, light = false }) {
  const markSize = size === 'lg' ? 54 : size === 'sm' ? 38 : 50;
  const titleSize = size === 'lg' ? 24 : size === 'sm' ? 17 : 20;

  return (
    <View style={styles.wrap}>
      <View style={[styles.mark, { width: markSize, height: markSize, borderRadius: markSize * 0.28 }]}>
        <Image source={LOGO} style={styles.markImage} resizeMode="cover" />
      </View>

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
    overflow: 'hidden',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  markImage: {
    width: '100%',
    height: '100%',
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
