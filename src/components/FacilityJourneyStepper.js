import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { buildFacilityJourneySteps } from '../utils/facilityJourney';

const STEP_ICONS = {
  facility: 'business',
  assessment: 'chatbubbles',
  waiting_nurse: 'time',
  see_nurse: 'medkit',
  waiting_doctor: 'hourglass',
  see_doctor: 'stethoscope',
  stay: 'home',
  signed_out: 'log-out',
  outcome: 'flag',
};

/**
 * Live facility visit roadmap for the patient.
 * Choose facility → Assessment → Nurse → Doctor → Stay / Sign out
 */
export default function FacilityJourneyStepper({
  caseData,
  countdownLabel,
  compact = false,
  hasFacility = false,
  facilityName = '',
}) {
  const steps = buildFacilityJourneySteps(caseData, {
    countdownLabel,
    hasFacility,
    facilityName,
  });
  if (!steps.length) return null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const icon = STEP_ICONS[step.id] || 'ellipse';
        const accent = step.done
          ? COLORS.success
          : step.active
            ? COLORS.primary
            : COLORS.textTertiary;

        return (
          <View key={`${step.id}-${index}`} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  compact && styles.dotCompact,
                  {
                    backgroundColor: step.done || step.active ? accent : '#E2E8F0',
                    borderColor: accent,
                  },
                ]}
              >
                <Ionicons
                  name={icon}
                  size={compact ? 11 : 13}
                  color={step.done || step.active ? '#FFFFFF' : COLORS.textTertiary}
                />
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: step.done ? COLORS.success : '#E2E8F0' },
                  ]}
                />
              )}
            </View>
            <View style={[styles.body, compact && styles.bodyCompact]}>
              <Text
                style={[
                  styles.title,
                  compact && styles.titleCompact,
                  step.active && styles.titleActive,
                  step.done && !step.active && styles.titleDone,
                ]}
              >
                {step.title}
              </Text>
              <Text style={[styles.detail, compact && styles.detailCompact]}>
                {step.detail}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4 },
  wrapCompact: { paddingVertical: 0 },
  row: { flexDirection: 'row', minHeight: 52 },
  rail: { width: 28, alignItems: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  dotCompact: { width: 22, height: 22, borderRadius: 11 },
  line: { flex: 1, width: 2, marginVertical: 2, borderRadius: 1 },
  body: { flex: 1, paddingLeft: 10, paddingBottom: 14 },
  bodyCompact: { paddingBottom: 8 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  titleCompact: { fontSize: 13 },
  titleActive: { color: COLORS.primary },
  titleDone: { color: COLORS.success },
  detail: {
    fontSize: 12,
    color: COLORS.textTertiary,
    lineHeight: 16,
    fontWeight: '500',
  },
  detailCompact: { fontSize: 11, lineHeight: 15 },
});
