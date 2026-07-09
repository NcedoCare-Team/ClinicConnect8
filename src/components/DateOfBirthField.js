// Native date picker — centered modal (not stuck at bottom).

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ageFromDate(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const md = today.getMonth() - date.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < date.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function formatDobISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DateOfBirthField({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const openPicker = () => {
    setTempDate(value);
    setShowPicker(true);
  };

  const confirmIOS = () => {
    onChange(tempDate);
    setShowPicker(false);
  };

  const onPickerChange = (event, selected) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'set' && selected) onChange(selected);
      return;
    }
    if (selected) setTempDate(selected);
  };

  return (
    <View>
      <TouchableOpacity style={styles.field} onPress={openPicker} activeOpacity={0.85}>
        <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
        <Text style={styles.fieldText}>{formatDisplayDate(value)}</Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textTertiary} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={showPicker} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Date of birth</Text>
                <TouchableOpacity onPress={confirmIOS}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                onChange={onPickerChange}
                themeVariant="light"
                style={styles.picker}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : showPicker ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={new Date(1900, 0, 1)}
          onChange={onPickerChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 4,
  },
  fieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 100 : 72,
    paddingHorizontal: 28,
    backgroundColor: 'rgba(15,23,42,0.50)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalCancel: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modalDone: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '800',
  },
  picker: {
    height: 200,
    width: '100%',
  },
});
