// Year · Month · Day scroll picker for quick, correct date selection.

import React, { useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { COLORS } from '../constants/colors';

const ITEM_HEIGHT = 44;
const VISIBLE = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function WheelColumn({ items, selectedIndex, onSelect, width }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current && selectedIndex >= 0) {
      scrollRef.current.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }, []);

  const handleScrollEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    onSelect(clamped);
  };

  const pad = Math.floor(VISIBLE / 2);

  return (
    <View style={[styles.column, { width }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: pad * ITEM_HEIGHT }}>
        {items.map((label, i) => (
          <View key={`${label}-${i}`} style={styles.item}>
            <Text style={[styles.itemText, i === selectedIndex && styles.itemTextActive]}>
              {label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.highlight} pointerEvents="none" />
    </View>
  );
}

export default function DateOfBirthPicker({ value, onChange }) {
  const today = new Date();
  const maxYear = today.getFullYear();
  const minYear = maxYear - 120;

  const year  = value?.year  ?? 1990;
  const month = value?.month ?? 1;
  const day   = value?.day   ?? 1;

  const years = useMemo(() => {
    const list = [];
    for (let y = maxYear; y >= minYear; y -= 1) list.push(String(y));
    return list;
  }, [maxYear, minYear]);

  const yearIndex  = years.indexOf(String(year));
  const monthIndex = month - 1;
  const maxDay     = daysInMonth(year, month);
  const safeDay    = Math.min(day, maxDay);

  const days = useMemo(() => {
    const list = [];
    for (let d = 1; d <= maxDay; d += 1) list.push(String(d).padStart(2, '0'));
    return list;
  }, [maxDay]);

  const dayIndex = safeDay - 1;

  const setYear = (idx) => {
    const y = Number(years[idx]);
    const m = month;
    const maxD = daysInMonth(y, m);
    onChange({ year: y, month: m, day: Math.min(safeDay, maxD) });
  };

  const setMonth = (idx) => {
    const m = idx + 1;
    const maxD = daysInMonth(year, m);
    onChange({ year, month: m, day: Math.min(safeDay, maxD) });
  };

  const setDay = (idx) => {
    onChange({ year, month, day: idx + 1 });
  };

  const formatted = `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.selectedLabel}>{formatted}</Text>
      <View style={styles.pickerRow}>
        <WheelColumn
          items={years}
          selectedIndex={yearIndex >= 0 ? yearIndex : 0}
          onSelect={setYear}
          width="34%"
        />
        <WheelColumn
          items={MONTHS}
          selectedIndex={monthIndex}
          onSelect={setMonth}
          width="40%"
        />
        <WheelColumn
          items={days}
          selectedIndex={dayIndex}
          onSelect={setDay}
          width="26%"
        />
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.colLabel}>Year</Text>
        <Text style={styles.colLabel}>Month</Text>
        <Text style={styles.colLabel}>Day</Text>
      </View>
    </View>
  );
}

export function ageFromDateParts({ year, month, day }) {
  if (!year || !month || !day) return null;
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function formatDob({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundSecondary,
    overflow: 'hidden',
    marginTop: 6,
  },
  selectedLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pickerRow: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    position: 'relative',
  },
  column: { height: PICKER_HEIGHT },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  itemText: {
    fontSize: 15,
    color: COLORS.textTertiary,
    fontWeight: '500',
  },
  itemTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderWidth: 1,
    borderColor: COLORS.primaryGlow,
  },
  labelsRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  colLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
