// src/screens/main/MainScreen.js
// NcedoCare bottom tab navigator — 5 tabs with liquid glass bar.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, Dimensions,
} from 'react-native';
import { BlurView }       from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import { COLORS }         from '../../constants/colors';

import HomeScreen         from './HomeScreen';
import SmartChatScreen    from './SmartChatScreen';
import JobTrendsScreen    from './JobTrendsScreen';
import InterviewerScreen  from './InterviewerScreen';
import HealthRecordScreen from './HealthRecordScreen';
import SettingsScreen     from './SettingsScreen';

const { width: screenWidth } = Dimensions.get('window');

const TABS = [
  { id: 'home',     name: 'Home',     icon: 'home',          component: HomeScreen         },
  { id: 'symptoms', name: 'Symptoms', icon: 'pulse',         component: SmartChatScreen    },
  { id: 'queue',    name: 'Queue',    icon: 'list',          component: JobTrendsScreen    },
  { id: 'records',  name: 'Records',  icon: 'document-text', component: HealthRecordScreen },
  { id: 'profile',  name: 'Profile',  icon: 'person',        component: SettingsScreen     },
];

export default function MainScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    if (route?.params?.tab) setActiveTab(route.params.tab);
  }, [route?.params?.tab]);

  const ActiveComponent = TABS.find(tab => tab.id === activeTab)?.component;

  const jumpTo = (tabId) => setActiveTab(tabId);

  const getProps = (tabId) => ({
    navigation: {
      ...navigation,
      getParent: () => ({ jumpTo }),
      navigate:  (screen, params) => navigation.navigate(screen, params),
    },
    route,
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={styles.contentContainer}>
        {ActiveComponent && <ActiveComponent key={activeTab} {...getProps(activeTab)} />}
      </View>

      {/* Liquid Glass Bottom Tab Bar */}
      <View style={styles.tabBarContainer}>
        <BlurView intensity={95} tint="systemUltraThinMaterial" style={styles.tabBarBlur}>
          <LinearGradient
            colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)']}
            style={styles.liquidGlassOverlay}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          />
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tabItem}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}>
                  <View style={[styles.tabIconContainer, isActive && styles.tabIconContainerActive]}>
                    <Ionicons
                      name={isActive ? tab.icon : `${tab.icon}-outline`}
                      size={22}
                      color={isActive ? COLORS.primary : COLORS.inkLight}
                    />
                    {isActive && <View style={styles.activeIndicator} />}
                  </View>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.name}</Text>
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
  container:        { flex: 1, backgroundColor: COLORS.background },
  contentContainer: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  tabBarContainer: {
    position: 'absolute', bottom: 0, left: 10, right: 10,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  tabBarBlur: {
    overflow: 'hidden',
    borderTopLeftRadius: 48, borderBottomLeftRadius: 50,
    borderTopRightRadius: 48, borderBottomRightRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  liquidGlassOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '100%', opacity: 0.6,
  },
  tabBar: {
    flexDirection: 'row', paddingTop: 12, paddingBottom: 8, paddingHorizontal: 8,
  },
  tabItem:          { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIconContainer: {
    width: 52, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, position: 'relative',
  },
  tabIconContainerActive: { backgroundColor: `${COLORS.primary}18` },
  activeIndicator: {
    position: 'absolute', bottom: -25,
    width: 8, height: 4, borderRadius: 2, backgroundColor: COLORS.primary,
  },
  tabLabel:       { fontSize: 10, fontWeight: '600', color: COLORS.inkLight, textAlign: 'center' },
  tabLabelActive: { color: COLORS.primary },
  bottomSafeArea: { height: Platform.OS === 'ios' ? 20 : 10, backgroundColor: 'transparent' },
});
