// Facility connection row — blue accent line + icon, no card container.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export default function FacilityBanner({ facility, onPress, onChangePress }) {
  const connected = Boolean(facility && !facility.startsWith('Connect'));

  return (
    <View style={styles.row}>
      <View style={styles.leftAccent} />

      <TouchableOpacity style={styles.mainTap} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.iconWrap}>
          <Ionicons name="business" size={20} color={COLORS.primary} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  leftAccent: {
    width: 4,
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  mainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
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
    paddingVertical: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
