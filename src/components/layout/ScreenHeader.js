// Shared screen header — logo-led with the Clinic Connect teal gradient.

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import AppLogo from './AppLogo';

function HeaderDecorations({ light }) {
  const color = light ? 'rgba(255,255,255,0.14)' : 'rgba(22,179,165,0.16)';
  const color2 = light ? 'rgba(255,255,255,0.08)' : 'rgba(22,179,165,0.08)';
  return (
    <>
      <View style={[styles.decoCircle, styles.deco1, { backgroundColor: color }]} />
      <View style={[styles.decoCircle, styles.deco2, { backgroundColor: color2 }]} />
      <View style={[styles.decoCircle, styles.deco3, { backgroundColor: color }]} />
      <View style={[styles.decoDot, styles.dot1, { backgroundColor: light ? 'rgba(255,255,255,0.35)' : COLORS.primaryGlow }]} />
      <View style={[styles.decoDot, styles.dot2, { backgroundColor: light ? 'rgba(255,255,255,0.25)' : COLORS.primaryLight }]} />
      <View style={[styles.decoDot, styles.dot3, { backgroundColor: light ? 'rgba(255,255,255,0.20)' : COLORS.primaryGlow }]} />
    </>
  );
}

export function HomeHeader({ notificationCount = 3, onNotificationPress }) {
  // const badgeLabel = notificationCount > 9 ? '9+' : String(notificationCount);
  // const showBadge = notificationCount > 0;

  return (
    <View style={styles.homeHeaderWrap}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.canvas]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.homeHeader}>
        <HeaderDecorations light />

        <View style={styles.homeTopRow}>
          <AppLogo size="md" showTagline light />

          {/* Notification icon — disabled for now
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={onNotificationPress}
            activeOpacity={0.85}>
            <Ionicons name="notifications" size={24} color="#FFFFFF" />
            {showBadge && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{badgeLabel}</Text>
              </View>
            )}
          </TouchableOpacity>
          */}
        </View>
      </LinearGradient>
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
  tabs,
  activeTab,
  onTabChange,
}) {
  const hasTabs = Array.isArray(tabs) && tabs.length > 0;

  return (
    <View style={styles.screenHeaderWrap}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.screenHeader, hasTabs && styles.screenHeaderWithTabs]}>
        <HeaderDecorations light />

        <View style={styles.screenTopRow}>
          {useLogo ? (
            <AppLogo size="sm" light />
          ) : (
            <View style={styles.screenTextBlock}>
              <Text style={styles.screenTitleLight}>{title}</Text>
              {subtitle ? <Text style={styles.screenSubtitleLight}>{subtitle}</Text> : null}
              {statusLabel ? (
                <View style={styles.statusRow}>
                  {statusDot !== false && <View style={styles.onlineDot} />}
                  <Text style={styles.statusTextLight}>{statusLabel}</Text>
                </View>
              ) : null}
            </View>
          )}

          {rightIcon && (
            <TouchableOpacity style={styles.iconBtnLight} onPress={onRightPress} activeOpacity={0.7}>
              <Ionicons name={rightIcon} size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {hasTabs ? (
          <View style={styles.headerTabs}>
            {tabs.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.headerTab, selected && styles.headerTabActive]}
                  onPress={() => onTabChange?.(tab.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.headerTabInner}>
                    {tab.dot ? (
                      <View style={[styles.headerTabDot, selected && styles.headerTabDotActive]} />
                    ) : null}
                    <Text style={[styles.headerTabText, selected && styles.headerTabTextActive]}>
                      {tab.label}
                    </Text>
                    {tab.badge != null && tab.badge !== '' ? (
                      <View style={[styles.headerTabBadge, selected && styles.headerTabBadgeActive]}>
                        <Text style={[styles.headerTabBadgeText, selected && styles.headerTabBadgeTextActive]}>
                          {tab.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

export function ProfileHeader({ displayName, facility, avatarUri, onAvatarPress }) {
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  return (
    <View style={styles.profileHeaderWrap}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.canvas]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileHeader}>
        <HeaderDecorations light />

        <TouchableOpacity style={styles.profileAvatarWrap} onPress={onAvatarPress} activeOpacity={0.85}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.profileAvatar} />
          ) : (
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarInitial}>{initial}</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.profileNameLight}>{displayName || 'Patient'}</Text>

        {facility ? (
          <View style={styles.profileFacilityBadgeLight}>
            <Ionicons name="location-outline" size={12} color={COLORS.primary} />
            <Text style={styles.profileFacilityText}>{facility}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

export const LAYOUT = {
  screenPadding: 20,
  bottomTabClearance: 108,
  cardRadius: 16,
};

const styles = StyleSheet.create({
  homeHeaderWrap: { overflow: 'hidden' },
  homeHeader: {
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 22,
    paddingHorizontal: LAYOUT.screenPadding,
    position: 'relative',
    overflow: 'hidden',
  },
  homeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 5,
  },

  decoCircle: { position: 'absolute', borderRadius: 999 },
  deco1: { width: 140, height: 140, top: -50, right: -30 },
  deco2: { width: 90, height: 90, bottom: -30, left: -20 },
  deco3: { width: 60, height: 60, top: 20, right: 100 },
  decoDot: { position: 'absolute', borderRadius: 999 },
  dot1: { width: 10, height: 10, top: 18, right: 48 },
  dot2: { width: 6, height: 6, bottom: 28, left: 40 },
  dot3: { width: 8, height: 8, top: 42, left: '55%' },

  avatarBtn: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  notifBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    zIndex: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
      android: { elevation: 6 },
    }),
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.primaryDark,
    zIndex: 11,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 12,
  },
  avatarImage: { width: 46, height: 46, borderRadius: 23 },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

  screenHeaderWrap: { overflow: 'hidden' },
  screenHeader: {
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 18,
    paddingHorizontal: LAYOUT.screenPadding,
    position: 'relative',
    overflow: 'hidden',
  },
  screenHeaderWithTabs: { paddingBottom: 14 },
  headerTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
    borderRadius: 14,
    padding: 4,
    marginTop: 16,
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerTab: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTabActive: {
    backgroundColor: '#FFFFFF',
  },
  headerTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  headerTabDotActive: { backgroundColor: COLORS.primary },
  headerTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.82)',
  },
  headerTabTextActive: { color: COLORS.primaryDark },
  headerTabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerTabBadgeActive: { backgroundColor: COLORS.primaryVeryLight },
  headerTabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  headerTabBadgeTextActive: { color: COLORS.primary },
  screenTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  screenTextBlock: { flex: 1 },
  screenTitleLight: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  screenSubtitleLight: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
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
    backgroundColor: '#86EFAC',
  },
  statusTextLight: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  iconBtnLight: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  profileHeaderWrap: { overflow: 'hidden' },
  profileHeader: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 22,
    paddingHorizontal: LAYOUT.screenPadding,
    position: 'relative',
    overflow: 'hidden',
  },
  profileAvatarWrap: { marginBottom: 12, zIndex: 2 },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  profileAvatarInitial: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  profileNameLight: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    zIndex: 2,
  },
  profileFacilityBadgeLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 2,
  },
  profileFacilityText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
