// Assessment tab — choose consultation mode (text chat or live — coming soon)

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { ScreenHeader, LAYOUT } from '../../components/layout/ScreenHeader';

export default function SmartChatScreen({ navigation }) {
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
      <ScreenHeader
        title="NcedoCare AI"
        subtitle="Choose how you'd like to start your consultation"
        statusLabel="Online"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.intro}>
          Start a new health assessment. Your conversation is private and reviewed by your care team when needed.
        </Text>

        {/* Text consultation */}
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
              <Ionicons name="chatbubbles" size={28} color="#FFFFFF" />
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitleLight}>Text Consultation</Text>
              <Text style={styles.optionSubLight}>
                Chat with NcedoCare AI — describe symptoms, ask questions, get guided next steps.
              </Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Live chat — coming soon */}
        <TouchableOpacity
          style={styles.optionWrap}
          onPress={startLiveChat}
          activeOpacity={0.85}>
          <View style={styles.optionCardSecondary}>
            <View style={[styles.optionIconSecondary, { backgroundColor: COLORS.primaryVeryLight }]}>
              <Ionicons name="mic" size={26} color={COLORS.primary} />
            </View>
            <View style={styles.optionBody}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>Live Chat</Text>
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>Coming soon</Text>
                </View>
              </View>
              <Text style={styles.optionSub}>
                Speak in real time with AI — voice-first assessment when you're on the go.
              </Text>
            </View>
            <Ionicons name="lock-closed-outline" size={22} color={COLORS.textTertiary} />
          </View>
        </TouchableOpacity>

        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
          <Text style={styles.noteText}>
            A healthcare professional reviews AI assessments before any care decision is made.
          </Text>
        </View>

        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  scroll: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 20 },

  intro: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginBottom: 24,
  },

  optionWrap: { marginBottom: 16, borderRadius: LAYOUT.cardRadius, overflow: 'hidden', ...cardShadow },

  optionCardPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  optionDeco: {
    position: 'absolute',
    right: -24,
    top: -24,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  optionIconPrimary: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1 },
  optionTitleLight: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  optionSubLight: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },

  optionCardSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    opacity: 0.92,
  },
  optionIconSecondary: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  optionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  optionSub: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
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
    marginTop: 8,
    padding: 14,
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: LAYOUT.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
});
