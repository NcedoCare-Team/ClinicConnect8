// Assessment tab — choose consultation mode (text chat or live — coming soon)

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Alert,
  ScrollView, StatusBar, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { LAYOUT } from '../../components/layout/ScreenHeader';

function AssessmentHeader() {
  return (
    <View style={styles.headerWrap}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, '#1E3A8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}>
        <View style={styles.decoCircle1} />
        <View style={styles.decoCircle2} />
        <View style={styles.decoDot1} />
        <View style={styles.decoDot2} />

        <View style={styles.headerContent}>
          <View style={styles.aiOrbWrap}>
            <LinearGradient
              colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.10)']}
              style={styles.aiOrbRing}>
              <LinearGradient
                colors={['#FFFFFF', '#E0EAFF']}
                style={styles.aiOrb}>
                <Ionicons name="sparkles" size={32} color={COLORS.primary} />
              </LinearGradient>
            </LinearGradient>
          </View>

          <Text style={styles.headerTitle}>NcedoCare AI</Text>
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

  const startTextConsultation = () => {
    navigation.navigate('ChatConversation', {
      conversationId: null,
      conversationTitle: 'Health Assessment',
    });
  };

  const startLiveChat = () => {
    Alert.alert(
      'Live Chat',
      'Real-time voice consultation is coming soon. We\'re designing an experience that feels natural and safe — check back shortly.',
      [{ text: 'OK' }],
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <AssessmentHeader />

      <View style={styles.bodySheet}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}>

          <View style={[styles.centerBlock, { width: contentWidth, maxWidth: contentWidth }]}>
            <Text style={styles.sectionLabel}>Start your consultation</Text>
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

const sheetShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primaryDark },

  headerWrap: { overflow: 'hidden' },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 36,
    paddingHorizontal: LAYOUT.screenPadding,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  decoCircle1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -60,
    right: -40,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  decoCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    bottom: -20,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decoDot1: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 24,
    left: '18%',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  decoDot2: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    bottom: 40,
    right: '22%',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  headerContent: { alignItems: 'center', zIndex: 2, width: '100%' },
  aiOrbWrap: { marginBottom: 14 },
  aiOrbRing: {
    padding: 4,
    borderRadius: 40,
  },
  aiOrb: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 14,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#86EFAC',
  },
  onlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
  },

  bodySheet: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -18,
    overflow: 'hidden',
    ...sheetShadow,
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
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: 8,
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
