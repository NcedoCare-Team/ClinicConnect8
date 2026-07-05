// Shared screen header — logo-led, hospitality blue aesthetic.

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import AppLogo from './AppLogo';

const HEADER_GRADIENT = ['rgba(37,99,235,0.07)', 'rgba(37,99,235,0.02)', 'transparent'];

export function HomeHeader({
  userName,
  facility,
  avatarUri,
  onProfilePress,
  onChangeFacility,
}) {
  const initial = userName ? userName.charAt(0).toUpperCase() : 'U';

  return (
    <View style={styles.homeHeader}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient colors={HEADER_GRADIENT} style={styles.homeGradient} />

      <View style={styles.homeTopRow}>
        <AppLogo size="md" showTagline />

        <TouchableOpacity style={styles.avatarBtn} onPress={onProfilePress} activeOpacity={0.8}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.facilityRow}>
        <View style={styles.facilityChip}>
          <Ionicons name="business-outline" size={13} color={COLORS.primary} />
          <Text style={styles.facilityText} numberOfLines={1}>
            {facility || 'Connect a healthcare facility'}
          </Text>
        </View>
        {onChangeFacility && (
          <TouchableOpacity onPress={onChangeFacility} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
            <Text style={styles.changeLink}>Change</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  rightIcon,
  onRightPress,
  statusDot,
  statusLabel,
  useLogo,
}) {
  return (
    <View style={styles.screenHeader}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient colors={HEADER_GRADIENT} style={styles.homeGradient} />

      <View style={styles.screenTopRow}>
        {useLogo ? (
          <AppLogo size="sm" />
        ) : (
          <View style={styles.screenTextBlock}>
            <Text style={styles.screenTitle}>{title}</Text>
            {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
            {statusLabel ? (
              <View style={styles.statusRow}>
                {statusDot !== false && <View style={styles.onlineDot} />}
                <Text style={styles.statusText}>{statusLabel}</Text>
              </View>
            ) : null}
          </View>
        )}

        {rightIcon && (
          <TouchableOpacity style={styles.iconBtn} onPress={onRightPress} activeOpacity={0.7}>
            <Ionicons name={rightIcon} size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {useLogo && title ? (
        <Text style={styles.logoScreenSubtitle}>{subtitle || title}</Text>
      ) : null}
    </View>
  );
}

export function ProfileHeader({ displayName, facility, avatarUri, onAvatarPress }) {
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  return (
    <View style={styles.profileHeader}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient colors={HEADER_GRADIENT} style={styles.homeGradient} />

      <TouchableOpacity style={styles.profileAvatarWrap} onPress={onAvatarPress} activeOpacity={0.85}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.profileAvatar} />
        ) : (
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.profileAvatar}>
            <Text style={styles.profileAvatarInitial}>{initial}</Text>
          </LinearGradient>
        )}
      </TouchableOpacity>

      <Text style={styles.profileName}>{displayName || 'Patient'}</Text>

      {facility ? (
        <View style={styles.profileFacilityBadge}>
          <Ionicons name="location-outline" size={12} color={COLORS.primary} />
          <Text style={styles.profileFacilityText}>{facility}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const LAYOUT = {
  screenPadding: 20,
  bottomTabClearance: 108,
  cardRadius: 16,
};

const styles = StyleSheet.create({
  homeHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 14,
    paddingHorizontal: LAYOUT.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  homeGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  homeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  facilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  facilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryVeryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: '78%',
  },
  facilityText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    flexShrink: 1,
  },
  changeLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight,
    textDecorationLine: 'underline',
  },
  avatarBtn: { borderRadius: 24, overflow: 'hidden' },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },

  screenHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 16,
    paddingHorizontal: LAYOUT.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  screenTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTextBlock: { flex: 1 },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  logoScreenSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 10,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },

  profileHeader: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 20,
    paddingHorizontal: LAYOUT.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  profileAvatarWrap: { marginBottom: 12 },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarInitial: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  profileFacilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryVeryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileFacilityText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
