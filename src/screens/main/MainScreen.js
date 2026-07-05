// src/screens/main/MainScreen.js
// NcedoCare patient app — 4-tab navigation (My Care · Assessment · Health Journey · Profile)

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

import HomeScreen         from './HomeScreen';
import SmartChatScreen    from './SmartChatScreen';
import HealthRecordScreen from './HealthRecordScreen';
import SettingsScreen     from './SettingsScreen';

const TABS = [
  { id: 'home',       name: 'My Care',        icon: 'heart',         iconOutline: 'heart-outline'         },
  { id: 'assessment', name: 'Assessment',     icon: 'sparkles',      iconOutline: 'sparkles-outline',      action: true },
  { id: 'journey',    name: 'Health Journey', icon: 'git-network',   iconOutline: 'git-network-outline'   },
  { id: 'profile',    name: 'Profile',        icon: 'person',        iconOutline: 'person-outline'        },
];

export default function MainScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    if (route?.params?.tab) {
      const mapped = route.params.tab === 'symptoms' ? 'assessment'
        : route.params.tab === 'records' ? 'journey'
        : route.params.tab === 'queue' ? 'home'
        : route.params.tab;
      setActiveTab(mapped);
    }
  }, [route?.params?.tab]);

  const ActiveComponent = {
    home:       HomeScreen,
    assessment: SmartChatScreen,
    journey:    HealthRecordScreen,
    profile:    SettingsScreen,
  }[activeTab];

  const jumpTo = (tabId) => {
    const mapped = tabId === 'symptoms' ? 'assessment'
      : tabId === 'records' ? 'journey'
      : tabId === 'queue' ? 'home'
      : tabId;
    setActiveTab(mapped);
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
            const isAction = tab.action;

            if (isAction) {
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.actionTab}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.85}>
                  <View style={[styles.actionBtn, isActive && styles.actionBtnActive]}>
                    <Ionicons
                      name={isActive ? tab.icon : tab.iconOutline}
                      size={24}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.name}
                  </Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}>
                <Ionicons
                  name={isActive ? tab.icon : tab.iconOutline}
                  size={22}
                  color={isActive ? COLORS.primary : COLORS.inkLight}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                  {tab.name}
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
      ios:     { shadowColor: '#0F1A14', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 52,
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.inkLight,
    textAlign: 'center',
  },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },

  actionTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    gap: 2,
  },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    ...Platform.select({
      ios:     { shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  actionBtnActive: {
    backgroundColor: COLORS.primaryDark,
    transform: [{ scale: 1.05 }],
  },

  bottomSafeArea: {
    height: Platform.OS === 'ios' ? 24 : 8,
    backgroundColor: '#FFFFFF',
  },
});
