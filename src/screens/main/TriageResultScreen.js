// src/screens/main/TriageResultScreen.js
// NcedoCare: Shows AI triage result after symptom analysis.
// Displays priority badge, risk score, AI reasoning, and next actions.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRoute } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { openPatientTab } from '../../navigation/openPatientTab';
import { asStringArray } from '../../utils/clinicalFields';

const PRIORITY_CONFIG = {
  CRITICAL: {
    color:     COLORS.critical,
    bg:        COLORS.criticalLight,
    gradient:  ['#DC2626', '#B91C1C'],
    icon:      'alert-circle',
    label:     'CRITICAL',
    headline:  'Immediate attention required',
    subtext:   'Please see a nurse right away. Do not wait.',
    action:    'alert a nurse now',
    actionIcon:'call',
  },
  HIGH: {
    color:     COLORS.high,
    bg:        COLORS.highLight,
    gradient:  ['#EA580C', '#C2410C'],
    icon:      'warning',
    label:     'HIGH',
    headline:  'Urgent care needed',
    subtext:   'You will be seen soon. Please remain in the waiting area.',
    action:    'view your queue position',
    actionIcon:'list',
  },
  MEDIUM: {
    color:     COLORS.medium,
    bg:        COLORS.mediumLight,
    gradient:  ['#D97706', '#B45309'],
    icon:      'time',
    label:     'MEDIUM',
    headline:  'Moderate urgency',
    subtext:   'You are in the queue. A nurse will call you when it is your turn.',
    action:    'view your queue position',
    actionIcon:'list',
  },
  LOW: {
    color:     COLORS.low,
    bg:        COLORS.lowLight,
    gradient:  ['#16A34A', '#15803D'],
    icon:      'checkmark-circle',
    label:     'LOW',
    headline:  'Non-urgent',
    subtext:   'Your symptoms appear stable. You are in the queue.',
    action:    'view your queue position',
    actionIcon:'list',
  },
};

export default function TriageResultScreen() {
  const route = useRoute();
  const {
    priority = 'LOW',
    riskScore,
    confidence,
    reasoning,
    riskIndicators,
    recommendedAction,
    estimatedWait,
    symptoms,
    caseId,
  } = route.params || {};
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.LOW;
  const indicatorList = asStringArray(riskIndicators);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

    // Pulse animation for CRITICAL
    if (priority === 'CRITICAL') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  const riskPercent = riskScore != null ? Math.round(riskScore) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={cfg.gradient[1]} translucent />

      {/* Colored header */}
      <LinearGradient
        colors={cfg.gradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.heroHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.heroTitle}>Triage Assessment</Text>

        {/* Priority badge — pulses if CRITICAL */}
        <Animated.View style={[styles.priorityCircle, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.priorityCircleInner, { borderColor: cfg.color }]}>
            <Ionicons name={cfg.icon} size={40} color={COLORS.white} />
            <Text style={styles.priorityLabel}>{cfg.label}</Text>
          </View>
        </Animated.View>

        <Text style={styles.heroHeadline}>{cfg.headline}</Text>
        <Text style={styles.heroSubtext}>{cfg.subtext}</Text>
      </LinearGradient>

      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Risk score gauge */}
          {riskPercent != null && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Risk Score</Text>
              <View style={styles.gaugeRow}>
                <View style={styles.gaugeTrack}>
                  <View style={[styles.gaugeFill, { width: `${riskPercent}%`, backgroundColor: cfg.color }]} />
                </View>
                <Text style={[styles.gaugeValue, { color: cfg.color }]}>{riskPercent}%</Text>
              </View>
              <View style={styles.gaugeLabels}>
                <Text style={styles.gaugeLabelText}>Low</Text>
                <Text style={styles.gaugeLabelText}>High</Text>
              </View>
            </View>
          )}

          {/* AI reasoning */}
          {reasoning ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="bulb-outline" size={18} color={COLORS.primary} />
                <Text style={styles.cardTitle}>Why this priority?</Text>
              </View>
              <Text style={styles.reasoningText}>{reasoning}</Text>
            </View>
          ) : null}

          {/* Recommended action */}
          {recommendedAction ? (
            <View style={[styles.card, styles.actionCard]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="medkit-outline" size={18} color={cfg.color} />
                <Text style={styles.cardTitle}>Recommended Action</Text>
              </View>
              <Text style={[styles.reasoningText, { color: COLORS.textPrimary, fontWeight: '600' }]}>
                {recommendedAction}
              </Text>
              {estimatedWait ? (
                <View style={styles.waitRow}>
                  <Ionicons name="time-outline" size={14} color={COLORS.textTertiary} />
                  <Text style={styles.waitText}>Estimated wait: {estimatedWait}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Risk indicators */}
          {indicatorList.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="warning-outline" size={18} color={cfg.color} />
                <Text style={styles.cardTitle}>Risk Indicators</Text>
              </View>
              {indicatorList.map((indicator, i) => (
                <View key={i} style={styles.indicatorRow}>
                  <View style={[styles.indicatorDot, { backgroundColor: cfg.color }]} />
                  <Text style={styles.indicatorText}>{indicator}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Confidence */}
          {confidence != null ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>AI Confidence</Text>
              <View style={styles.gaugeRow}>
                <View style={styles.gaugeTrack}>
                  <View style={[styles.gaugeFill, { width: `${Math.round(confidence)}%`, backgroundColor: COLORS.primary }]} />
                </View>
                <Text style={[styles.gaugeValue, { color: COLORS.primary }]}>{Math.round(confidence)}%</Text>
              </View>
            </View>
          ) : null}

          {/* Symptoms recap */}
          {symptoms ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
                <Text style={styles.cardTitle}>Reported Symptoms</Text>
              </View>
              <Text style={styles.symptomsText}>{symptoms}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => openPatientTab('journey')}
              activeOpacity={0.85}>
              <LinearGradient
                colors={cfg.gradient}
                style={styles.primaryActionGrad}>
                <Ionicons name="git-network-outline" size={20} color={COLORS.white} />
                <Text style={styles.primaryActionText}>Track my care journey</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => openPatientTab('assessment')}
              activeOpacity={0.8}>
              <Ionicons name="sparkles-outline" size={18} color={COLORS.textSecondary} />
              <Text style={styles.secondaryActionText}>Start New Assessment</Text>
            </TouchableOpacity>
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.textTertiary} />
            <Text style={styles.disclaimerText}>
              This AI assessment guides the care team only. A nurse or doctor will review your case. Identifying details are not shared with the AI model (POPIA). In a life-threatening emergency, call 10177 immediately.
            </Text>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  heroHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 32, paddingHorizontal: 24,
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 16,
    left: 20,
    padding: 8,
  },
  heroTitle:    { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginBottom: 24 },
  heroHeadline: { fontSize: 22, fontWeight: '900', color: COLORS.white, textAlign: 'center', marginTop: 16 },
  heroSubtext:  { fontSize: 13, color: 'rgba(255,255,255,0.78)', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  priorityCircle: { marginTop: 8 },
  priorityCircleInner: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  priorityLabel: { fontSize: 13, fontWeight: '900', color: COLORS.white, letterSpacing: 1 },

  scroll: { paddingTop: 20, paddingHorizontal: 20 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },

  // Gauge
  gaugeRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  gaugeTrack:  { flex: 1, height: 10, backgroundColor: COLORS.backgroundTertiary, borderRadius: 5, overflow: 'hidden' },
  gaugeFill:   { height: '100%', borderRadius: 5 },
  gaugeValue:  { fontSize: 16, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLabelText: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },

  // Reasoning / action card
  reasoningText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  symptomsText:  { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  actionCard: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  waitText: { fontSize: 12, color: COLORS.textTertiary, fontWeight: '600' },

  // Risk indicators
  indicatorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  indicatorDot:  { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, flexShrink: 0 },
  indicatorText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },

  // Actions
  actionsSection: { gap: 12, marginBottom: 16 },
  primaryAction:     { borderRadius: 16, overflow: 'hidden' },
  primaryActionGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 10,
  },
  primaryActionText:   { fontSize: 16, fontWeight: '800', color: COLORS.white },
  secondaryAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  // Disclaimer
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.backgroundTertiary, borderRadius: 12, padding: 14,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: COLORS.textTertiary, lineHeight: 17 },
});
