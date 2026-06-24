// src/screens/main/MainScreen.js
// Bottom tab navigation — updated to use real JobTrendsScreen

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, Dimensions,
} from 'react-native';
import { BlurView }       from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import { COLORS }         from '../../constants/colors';

import HomeScreen        from './HomeScreen';
import SmartChatScreen   from './SmartChatScreen';
import SettingsScreen    from './SettingsScreen';
import InterviewerScreen from './InterviewerScreen';
import JobTrendsScreen   from './JobTrendsScreen';

const { width: screenWidth } = Dimensions.get('window');

// ─── Tabs config ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'home',        name: 'Home',        icon: 'home',        component: HomeScreen },
  { id: 'jobtrends',   name: 'Job Trends',  icon: 'trending-up', component: JobTrendsScreen },
  { id: 'chat',        name: 'Smart Chat',  icon: 'chatbubbles', component: SmartChatScreen },
  { id: 'interviewer', name: 'Interviewer', icon: 'mic',         component: InterviewerScreen },
  { id: 'profile',     name: 'Profile',     icon: 'person',      component: SettingsScreen },
];

export default function MainScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState('home');

  // Switch to interviewer tab when returning from interview room
  useEffect(() => {
    if (route?.params?.refreshInterviews) {
      setActiveTab('interviewer');
    }
  }, [route?.params?.refreshInterviews]);

  const ActiveComponent = TABS.find(tab => tab.id === activeTab)?.component;

  // Allow child screens to jump to a tab programmatically
  const jumpTo = (tabId) => setActiveTab(tabId);

  // Pass navigation + jumpTo to screens that need cross-tab navigation
  const getProps = (tabId) => {
    const base = { navigation, route };
    if (['home', 'chat', 'profile', 'interviewer', 'jobtrends'].includes(tabId)) {
      return {
        ...base,
        // Expose jumpTo so Home can navigate to Job Trends tab
        navigation: {
          ...navigation,
          getParent: () => ({ jumpTo }),
        },
      };
    }
    return base;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {ActiveComponent && (
          <ActiveComponent key={activeTab} {...getProps(activeTab)} />
        )}
      </View>

      {/* ── Liquid Glass Bottom Tab Bar ──────────────────────────────────── */}
      <View style={styles.tabBarContainer}>
        <BlurView intensity={95} tint="systemUltraThinMaterial" style={styles.tabBarBlur}>
          <LinearGradient
            colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)']}
            style={styles.liquidGlassOverlay}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />

          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tabItem}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabIconContainer, isActive && styles.tabIconContainerActive]}>
                    <Ionicons
                      name={isActive ? tab.icon : `${tab.icon}-outline`}
                      size={22}
                      color={isActive ? COLORS.primary : COLORS.inkLight}
                    />
                    {isActive && <View style={styles.activeIndicator} />}
                  </View>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
        <View style={styles.bottomSafeArea} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0, left: 10, right: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  tabBarBlur: {
    overflow:              'hidden',
    borderTopLeftRadius:   48,
    borderBottomLeftRadius:50,
    borderTopRightRadius:  48,
    borderBottomRightRadius:50,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  liquidGlassOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '100%', opacity: 0.6,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 12, paddingBottom: 8, paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
  },
  tabIconContainer: {
    width: 52, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, position: 'relative',
  },
  tabIconContainerActive: {
    backgroundColor: `${COLORS.primary}18`,
  },
  activeIndicator: {
    position: 'absolute', bottom: -25,
    width: 8, height: 4, borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  tabLabel: {
    fontSize: 10, fontWeight: '600',
    color: COLORS.inkLight, textAlign: 'center',
  },
  tabLabelActive: { color: COLORS.primary },
  bottomSafeArea: {
    height: Platform.OS === 'ios' ? 20 : 10,
    backgroundColor: 'transparent',
  },
});