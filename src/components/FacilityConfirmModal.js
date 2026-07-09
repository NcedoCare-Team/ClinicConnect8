// Custom modal — facility name shown prominently before assessment.

import React from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

export default function FacilityConfirmModal({
  visible,
  facilityName,
  onConfirm,
  onChangeFacility,
  onCancel,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="business" size={28} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>Confirm your facility</Text>
          <Text style={styles.subtitle}>
            You are about to start your health assessment with:
          </Text>

          <View style={styles.facilityBox}>
            <Text style={styles.facilityName} numberOfLines={3}>
              {facilityName}
            </Text>
          </View>

          <Text style={styles.note}>
            Your care journey will be linked to this facility. Please verify the name before continuing.
          </Text>

          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} activeOpacity={0.88}>
            <Text style={styles.confirmBtnText}>Confirm & continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.changeBtn} onPress={onChangeFacility} activeOpacity={0.88}>
            <Text style={styles.changeBtnText}>Change facility</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  facilityBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FECACA',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  facilityName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#DC2626',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  note: {
    fontSize: 12,
    color: COLORS.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  confirmBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  changeBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  changeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
});
