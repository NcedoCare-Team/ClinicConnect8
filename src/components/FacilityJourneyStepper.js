import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { buildFacilityJourneySteps } from '../utils/facilityJourney';

const STEP_ICONS = {
  waiting: 'time',
  attended: 'medical',
  completed: 'checkmark-circle',
};

/**
 * Live facility queue journey for the patient.
 * Renders Waiting → Attended → Assessment completed from triageCases status.
 */
export default function FacilityJourneyStepper({ caseData, countdownLabel, compact = false }) {
  const steps = buildFacilityJourneySteps(caseData, { countdownLabel });
  if (!steps.length) return null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const icon = STEP_ICONS[step.id] || 'ellipse';
        const accent = step.done
          ? COLORS.success || '#16A34A'
          : step.active
            ? COLORS.primary
            : COLORS.textTertiary;

        return (
          <View key={step.id} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: step.done || step.active ? accent : '#E2E8F0',
                    borderColor: accent,
                  },
                ]}
              >
                <Ionicons
                  name={icon}
                  size={compact ? 12 : 14}
                  color={step.done || step.active ? '#FFFFFF' : COLORS.textTertiary}
                />
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: step.done ? accent : '#E2E8F0' },
                  ]}
                />
              )}
            </View>
            <View style={[styles.body, compact && styles.bodyCompact]}>
              <Text
                style={[
                  styles.title,
                  step.active && styles.titleActive,
                  step.done && !step.active && styles.titleDone,
                ]}
              >
                {step.title}
              </Text>
              <Text style={styles.detail}>{step.detail}</Text>
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
  row: { flexDirection: 'row', minHeight: 56 },
  rail: { width: 28, alignItems: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  line: { flex: 1, width: 2, marginVertical: 2, borderRadius: 1 },
  body: { flex: 1, paddingLeft: 10, paddingBottom: 14 },
  bodyCompact: { paddingBottom: 10 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  titleActive: { color: COLORS.primary },
  titleDone: { color: COLORS.success || '#16A34A' },
  detail: {
    fontSize: 12,
    color: COLORS.textTertiary,
    lineHeight: 16,
    fontWeight: '500',
  },
});
