// src/screens/main/MainScreen.js
// NcedoCare patient app — 5-tab navigation with elevated active tab

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

import HomeScreen               from './HomeScreen';
import SmartChatScreen          from './SmartChatScreen';
import HealthRecordScreen       from './HealthRecordScreen';
import CommunityInsightsScreen  from './CommunityInsightsScreen';
import SettingsScreen           from './SettingsScreen';

const TABS = [
  { id: 'home',       name: 'My Care',    short: 'Care',     icon: 'heart',         iconOutline: 'heart-outline'         },
  { id: 'assessment', name: 'Assessment', short: 'Assess',   icon: 'sparkles',      iconOutline: 'sparkles-outline'      },
  { id: 'journey',    name: 'Journey',    short: 'Journey',  icon: 'git-network',   iconOutline: 'git-network-outline'   },
  { id: 'insights',   name: 'Insights',   short: 'Insights', icon: 'newspaper',     iconOutline: 'newspaper-outline'     },
  { id: 'profile',    name: 'Profile',    short: 'Profile',  icon: 'person',        iconOutline: 'person-outline'        },
];

const TAB_MAP = {
  home:       HomeScreen,
  assessment: SmartChatScreen,
  journey:    HealthRecordScreen,
  insights:   CommunityInsightsScreen,
  profile:    SettingsScreen,
  symptoms:   SmartChatScreen,
  records:    HealthRecordScreen,
  queue:      HomeScreen,
};

export default function MainScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    if (route?.params?.tab) {
      const mapped = route.params.tab === 'symptoms' ? 'assessment'
        : route.params.tab === 'records' ? 'journey'
        : route.params.tab === 'queue' ? 'home'
        : route.params.tab;
      if (TAB_MAP[mapped]) setActiveTab(mapped);
    }
  }, [route?.params?.tab]);

  const ActiveComponent = TAB_MAP[activeTab];

  const jumpTo = (tabId) => {
    const mapped = tabId === 'symptoms' ? 'assessment'
      : tabId === 'records' ? 'journey'
      : tabId === 'queue' ? 'home'
      : tabId;
    if (TAB_MAP[mapped]) setActiveTab(mapped);
  };

  const getProps = () => ({
    navigation: {
      ...navigation,
      getParent: () => ({ jumpTo }),
      navigate:  (screen, params) => navigation.navigate(screen, params),
    },
    route,
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.contentContainer}>
        {ActiveComponent && <ActiveComponent key={activeTab} {...getProps()} />}
      </View>

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabSlot}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.85}>
                <View style={[styles.tabBtn, isActive && styles.tabBtnActive]}>
                  <Ionicons
                    name={isActive ? tab.icon : tab.iconOutline}
                    size={isActive ? 22 : 20}
                    color={isActive ? '#FFFFFF' : COLORS.inkLight}
                  />
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                  {tab.short}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.bottomSafeArea} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#FFFFFF' },
  contentContainer: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  tabBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.07, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingBottom: 2,
    paddingHorizontal: 2,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    gap: 3,
  },
  tabBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabBtnActive: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    marginTop: -18,
    ...Platform.select({
      ios:     { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.38, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.inkLight,
    textAlign: 'center',
  },
  tabLabelActive: { color: COLORS.primary, fontWeight: '800', fontSize: 9 },

  bottomSafeArea: {
    height: Platform.OS === 'ios' ? 24 : 8,
    backgroundColor: '#FFFFFF',
  },
});
