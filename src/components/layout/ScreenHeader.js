// Shared screen header — clean white band matching onboarding aesthetic.

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

export function HomeHeader({
  greeting,
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
      <LinearGradient
        colors={['rgba(27,107,71,0.06)', 'rgba(27,107,71,0.01)', 'transparent']}
        style={styles.homeGradient}
      />

      <View style={styles.homeTopRow}>
        <View style={styles.homeTextBlock}>
          <Text style={styles.greeting}>
            {greeting}, {userName}
          </Text>
          <View style={styles.facilityRow}>
            <View style={styles.facilityChip}>
              <Ionicons name="business-outline" size={13} color={COLORS.primary} />
              <Text style={styles.facilityText} numberOfLines={1}>
                {facility || 'No facility connected'}
              </Text>
            </View>
            {onChangeFacility && (
              <TouchableOpacity onPress={onChangeFacility} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

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
}) {
  return (
    <View style={styles.screenHeader}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient
        colors={['rgba(27,107,71,0.06)', 'rgba(27,107,71,0.01)', 'transparent']}
        style={styles.homeGradient}
      />

      <View style={styles.screenTopRow}>
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

        {rightIcon && (
          <TouchableOpacity style={styles.iconBtn} onPress={onRightPress} activeOpacity={0.7}>
            <Ionicons name={rightIcon} size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function ProfileHeader({ displayName, facility, avatarUri, onAvatarPress }) {
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  return (
    <View style={styles.profileHeader}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <LinearGradient
        colors={['rgba(27,107,71,0.06)', 'rgba(27,107,71,0.01)', 'transparent']}
        style={styles.homeGradient}
      />

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
  bottomTabClearance: 100,
  cardRadius: 16,
};

const styles = StyleSheet.create({
  homeHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 16,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  homeTextBlock: { flex: 1 },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 10,
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
    maxWidth: '75%',
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
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

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
    alignItems: 'flex-start',
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
