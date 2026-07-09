// src/screens/main/MainScreen.js
// NcedoCare patient app — 5-tab navigation with elevated active tab

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { SessionService } from '../../services/SessionService';

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

function mapTab(tabId) {
  if (tabId === 'symptoms') return 'assessment';
  if (tabId === 'records')  return 'journey';
  if (tabId === 'queue')    return 'home';
  return tabId;
}

export default function MainScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState('home');

  const changeTab = useCallback((tabId) => {
    const mapped = mapTab(tabId);
    if (!TAB_MAP[mapped] || mapped === activeTab) return;
    setActiveTab(mapped);
  }, [activeTab]);

  useEffect(() => {
    if (route?.params?.tab) changeTab(route.params.tab);
  }, [route?.params?.tab, changeTab]);

  useEffect(() => {
    const pending = SessionService.consumePendingMainTab();
    if (pending) changeTab(pending);
  }, [changeTab]);

  const ActiveComponent = TAB_MAP[activeTab];

  const jumpTo = (tabId) => changeTab(tabId);

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
                onPress={() => changeTab(tab.id)}
                activeOpacity={0.85}>
                <View style={[styles.tabBtn, isActive && styles.tabBtnActive]}>
                  <Ionicons
                    name={isActive ? tab.icon : tab.iconOutline}
                    size={isActive ? 26 : 24}
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
    overflow: 'visible',
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.07, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 14,
    paddingBottom: 4,
    paddingHorizontal: 2,
    overflow: 'visible',
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    gap: 4,
    overflow: 'visible',
  },
  tabBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabBtnActive: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    marginTop: -26,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios:     { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.42, shadowRadius: 10 },
      android: { elevation: 10 },
    }),
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.inkLight,
    textAlign: 'center',
  },
  tabLabelActive: { color: COLORS.primary, fontWeight: '800', fontSize: 10 },

  bottomSafeArea: {
    height: Platform.OS === 'ios' ? 24 : 8,
    backgroundColor: '#FFFFFF',
  },
});
