// Assessment tab — choose consultation mode (text chat or live — coming soon)

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Alert,
  ScrollView, StatusBar, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { LAYOUT } from '../../components/layout/ScreenHeader';
import { useFacility } from '../../contexts/FacilityContext';
import FacilityConfirmModal from '../../components/FacilityConfirmModal';
import { SessionService } from '../../services/SessionService';
import { openFacilitySelection } from '../../navigation/openPatientTab';

function AssessmentHeader() {
  return (
    <View style={styles.headerWrap}>
      <LinearGradient
        colors={['#FFFFFF', '#FAFBFC', COLORS.backgroundSecondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}>
        <View style={styles.decoCircle1} />
        <View style={styles.decoCircle2} />
        <View style={styles.decoDot1} />
        <View style={styles.decoDot2} />
        <View style={styles.decoDot3} />

        <View style={styles.headerContent}>
          <View style={styles.aiOrbWrap}>
            <View style={styles.aiOrbRing}>
              <LinearGradient
                colors={[COLORS.primaryVeryLight, '#FFFFFF']}
                style={styles.aiOrb}>
                <Ionicons name="sparkles" size={30} color={COLORS.primary} />
              </LinearGradient>
            </View>
          </View>

          <Text style={styles.headerTitle}>
            Ncedo<Text style={styles.headerTitleAccent}>Care</Text> AI
          </Text>
          <Text style={styles.headerSubtitle}>Health Assessment</Text>

          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online · Ready to help</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

export default function SmartChatScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - LAYOUT.screenPadding * 2, 420);
  const { hasFacility, facilityName, ready } = useFacility();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useFocusEffect(
    useCallback(() => {
      SessionService.consumePendingMainTab();
    }, []),
  );

  const runPendingAction = () => {
    if (pendingAction === 'text') {
      navigation.navigate('ChatConversation', {
        conversationId: null,
        conversationTitle: 'Health Assessment',
        facilityName,
      });
    } else if (pendingAction === 'live') {
      Alert.alert(
        'Live Chat',
        'Real-time voice consultation is coming soon. We\'re designing an experience that feels natural and safe — check back shortly.',
        [{ text: 'OK' }],
      );
    }
    setPendingAction(null);
  };

  const confirmFacilityThen = (action) => {
    if (!ready) return;

    if (!hasFacility) {
      Alert.alert(
        'Choose a healthcare facility',
        'Connect to a healthcare facility before starting your assessment so your care team can follow your journey.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Find facilities',
            onPress: () => openFacilitySelection(),
          },
        ],
      );
      return;
    }

    setPendingAction(action);
    setShowConfirmModal(true);
  };

  const startTextConsultation = () => confirmFacilityThen('text');
  const startLiveChat = () => confirmFacilityThen('live');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AssessmentHeader />

      <FacilityConfirmModal
        visible={showConfirmModal}
        facilityName={facilityName}
        onConfirm={() => {
          setShowConfirmModal(false);
          runPendingAction();
        }}
        onChangeFacility={() => {
          setShowConfirmModal(false);
          setPendingAction(null);
          openFacilitySelection();
        }}
        onCancel={() => {
          setShowConfirmModal(false);
          setPendingAction(null);
        }}
      />

      <View style={styles.bodySheet}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}>

          <View style={[styles.centerBlock, { width: contentWidth, maxWidth: contentWidth }]}>
            <Text style={styles.sectionLabel}>Start your consultation</Text>
            {hasFacility ? (
              <View style={styles.facilityNameWrap}>
                <Text style={styles.facilityNameOnly} numberOfLines={2}>
                  {facilityName}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.facilityMissingRow}
                onPress={() => openFacilitySelection()}
                activeOpacity={0.85}>
                <Ionicons name="location-outline" size={16} color={COLORS.warning} />
                <Text style={styles.facilityMissingText}>
                  Connect a healthcare facility before you start
                </Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.warning} />
              </TouchableOpacity>
            )}
            <Text style={styles.intro}>
              Choose how you'd like to begin. Your conversation is private and reviewed by your care team when needed.
            </Text>

            <TouchableOpacity
              style={styles.optionWrap}
              onPress={startTextConsultation}
              activeOpacity={0.9}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.optionCardPrimary}>
                <View style={styles.optionDeco} />
                <View style={styles.optionIconPrimary}>
                  <Ionicons name="chatbubbles" size={26} color="#FFFFFF" />
                </View>
                <View style={styles.optionBody}>
                  <Text style={styles.optionTitleLight}>Text Consultation</Text>
                  <Text style={styles.optionSubLight}>
                    Chat with AI — describe symptoms and get guided next steps.
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={22} color="rgba(255,255,255,0.9)" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionWrap}
              onPress={startLiveChat}
              activeOpacity={0.85}>
              <View style={styles.optionCardSecondary}>
                <View style={styles.optionIconSecondary}>
                  <Ionicons name="mic" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.optionBody}>
                  <View style={styles.optionTitleRow}>
                    <Text style={styles.optionTitle}>Live Chat</Text>
                    <View style={styles.soonBadge}>
                      <Text style={styles.soonBadgeText}>Coming soon</Text>
                    </View>
                  </View>
                  <Text style={styles.optionSub}>
                    Real-time voice assessment — launching soon.
                  </Text>
                </View>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textTertiary} />
              </View>
            </TouchableOpacity>

            <View style={styles.note}>
              <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.primary} />
              <Text style={styles.noteText}>
                A healthcare professional reviews AI assessments before any care decision is made.
              </Text>
            </View>
          </View>

          <View style={{ height: LAYOUT.bottomTabClearance }} />
        </ScrollView>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  headerWrap: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 26,
    paddingHorizontal: LAYOUT.screenPadding,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  decoCircle1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -55,
    right: -35,
    backgroundColor: 'rgba(37,99,235,0.05)',
  },
  decoCircle2: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    bottom: -18,
    left: -28,
    backgroundColor: 'rgba(37,99,235,0.04)',
  },
  decoDot1: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 28,
    left: '16%',
    backgroundColor: COLORS.primaryGlow,
    opacity: 0.7,
  },
  decoDot2: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    bottom: 36,
    right: '20%',
    backgroundColor: COLORS.primaryLight,
    opacity: 0.35,
  },
  decoDot3: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    top: '42%',
    right: '12%',
    backgroundColor: COLORS.primaryGlow,
    opacity: 0.5,
  },
  headerContent: { alignItems: 'center', zIndex: 2, width: '100%' },
  aiOrbWrap: { marginBottom: 14 },
  aiOrbRing: {
    padding: 3,
    borderRadius: 22,
    backgroundColor: 'rgba(37,99,235,0.06)',
  },
  aiOrb: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerTitleAccent: { color: COLORS.primary },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  onlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  bodySheet: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingTop: 28,
    paddingBottom: 16,
    minHeight: '100%',
  },
  centerBlock: {
    alignSelf: 'center',
    alignItems: 'stretch',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: 8,
  },
  facilityNameWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  facilityNameOnly: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primary,
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  facilityMissingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 14,
    maxWidth: '100%',
  },
  facilityMissingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.warning,
  },
  intro: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginBottom: 28,
    textAlign: 'center',
  },

  optionWrap: { marginBottom: 14, borderRadius: LAYOUT.cardRadius, overflow: 'hidden', ...cardShadow },
  optionCardPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  optionDeco: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  optionIconPrimary: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1 },
  optionTitleLight: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 },
  optionSubLight: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },

  optionCardSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  optionIconSecondary: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' },
  optionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  optionSub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  soonBadge: {
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  soonBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.warning },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
    textAlign: 'left',
  },
});
