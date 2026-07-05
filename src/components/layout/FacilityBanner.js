// Facility connection banner — sits above the primary action card on My Care.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { LAYOUT } from '../layout/ScreenHeader';

export default function FacilityBanner({ facility, onPress, onChangePress }) {
  const connected = Boolean(facility && !facility.startsWith('Connect'));

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#FFFFFF', COLORS.primaryVeryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={styles.leftAccent} />
        <TouchableOpacity style={styles.mainTap} onPress={onPress} activeOpacity={0.88}>
          <View style={styles.iconRing}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.iconGradient}>
              <Ionicons name="business" size={20} color="#FFFFFF" />
            </LinearGradient>
          </View>

          <View style={styles.body}>
            <Text style={styles.eyebrow}>
              {connected ? 'Connected facility' : 'Healthcare facility'}
            </Text>
            <Text style={styles.facilityName} numberOfLines={1}>
              {facility || 'Connect a healthcare facility'}
            </Text>
            {!connected && (
              <Text style={styles.hint}>Tap to link your primary care facility</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.changeBtn}
          onPress={onChangePress}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Text style={styles.changeText}>{connected ? 'Change' : 'Connect'}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, borderRadius: LAYOUT.cardRadius, ...cardShadow },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: LAYOUT.cardRadius,
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 6,
    borderWidth: 1,
    borderColor: COLORS.primaryGlow,
    overflow: 'hidden',
    gap: 12,
  },
  leftAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    marginVertical: 4,
  },
  mainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconRing: {
    padding: 3,
    borderRadius: 16,
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  iconGradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  facilityName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 3,
    fontWeight: '500',
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
