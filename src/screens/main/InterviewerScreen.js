// src/screens/main/InterviewerScreen.js  — repurposed as NurseDashboardScreen
// NcedoCare: Nurse view of the patient queue — review, confirm, adjust, or escalate cases.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, StatusBar, FlatList, Modal, ActivityIndicator,
  Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { COLLECTIONS } from '../../services/firestorePaths';

const PRIORITY_CONFIG = {
  CRITICAL: { color: COLORS.critical, bg: COLORS.criticalLight, icon: 'alert-circle',    label: 'CRITICAL', order: 0 },
  HIGH:     { color: COLORS.high,     bg: COLORS.highLight,     icon: 'warning',          label: 'HIGH',     order: 1 },
  MEDIUM:   { color: COLORS.medium,   bg: COLORS.mediumLight,   icon: 'time',             label: 'MEDIUM',   order: 2 },
  LOW:      { color: COLORS.low,      bg: COLORS.lowLight,      icon: 'checkmark-circle', label: 'LOW',      order: 3 },
};

const OVERRIDE_REASONS = [
  'Clinical assessment differs',
  'Vital signs indicate different urgency',
  'Patient history not captured',
  'Symptoms resolved on examination',
  'Requires immediate specialist input',
  'Other reason',
];

const NURSE_DECISIONS = [
  { label: 'Confirm',   value: 'CONFIRM',   icon: 'checkmark-circle', color: COLORS.low    },
  { label: 'Adjust',    value: 'ADJUST',    icon: 'create',           color: COLORS.medium },
  { label: 'Escalate',  value: 'ESCALATE',  icon: 'arrow-up-circle',  color: COLORS.critical },
];

export default function InterviewerScreen({ navigation }) {
  const [cases,     setCases]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [selected,  setSelected]  = useState(null);   // case being reviewed
  const [modalVisible, setModalVisible] = useState(false);
  const [decision,  setDecision]  = useState(null);   // CONFIRM | ADJUST | ESCALATE
  const [overrideReason, setOverrideReason] = useState('');
  const [adjustedPriority, setAdjustedPriority] = useState(null);
  const [saving,    setSaving]    = useState(false);

  // Real-time listener for queued/in_review cases
  useEffect(() => {
    const q = query(
      collection(firestore, COLLECTIONS.TRIAGE_CASES),
      where('status', 'in', ['queued', 'in_review']),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by priority severity then arrival time
      raw.sort((a, b) => {
        const oa = (PRIORITY_CONFIG[a.priority]?.order ?? 4);
        const ob = (PRIORITY_CONFIG[b.priority]?.order ?? 4);
        return oa - ob;
      });
      setCases(raw);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const openCase = (c) => {
    setSelected(c);
    setDecision(null);
    setOverrideReason('');
    setAdjustedPriority(c.priority);
    setModalVisible(true);
  };

  const handleDecision = async () => {
    if (!decision) {
      Alert.alert('Select decision', 'Please choose CONFIRM, ADJUST, or ESCALATE.');
      return;
    }
    if ((decision === 'ADJUST' || decision === 'ESCALATE') && !overrideReason) {
      Alert.alert('Reason required', 'Please select a reason for the override.');
      return;
    }

    setSaving(true);
    try {
      const caseRef = doc(firestore, COLLECTIONS.TRIAGE_CASES, selected.id);
      const finalPriority = decision === 'ESCALATE' ? 'CRITICAL'
                          : decision === 'ADJUST'   ? (adjustedPriority || selected.priority)
                          : selected.priority;

      await updateDoc(caseRef, {
        nurseDecision:    decision,
        overrideReason:   overrideReason || null,
        priority:         finalPriority,
        status:           'in_review',
        nurseReviewedAt:  serverTimestamp(),
      });

      setModalVisible(false);
      Alert.alert('Decision saved', `Case marked as ${decision}`);
    } catch (err) {
      console.error('Nurse decision error:', err);
      Alert.alert('Error', 'Could not save decision. Please try again.');
    }
    setSaving(false);
  };

  const renderCase = ({ item }) => {
    const cfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.LOW;
    return (
      <TouchableOpacity style={[styles.caseCard, { borderLeftColor: cfg.color }]} onPress={() => openCase(item)} activeOpacity={0.85}>
        <View style={styles.caseCardTop}>
          <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={13} color={cfg.color} />
            <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {item.nurseDecision && (
            <View style={[styles.nursedBadge, { backgroundColor: COLORS.primaryVeryLight }]}>
              <Text style={styles.nursedBadgeText}>Reviewed</Text>
            </View>
          )}
          <Text style={styles.caseTime}>
            {item.createdAt?.toDate
              ? item.createdAt.toDate().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </Text>
        </View>

        <Text style={styles.casePatient}>{item.patientName || 'Anonymous Patient'}</Text>
        <Text style={styles.caseSymptoms} numberOfLines={2}>{item.symptoms || 'No symptoms recorded'}</Text>

        {item.aiReasoning && (
          <Text style={styles.caseReasoning} numberOfLines={2}>{item.aiReasoning}</Text>
        )}

        <View style={styles.caseFooter}>
          <Ionicons name="chevron-forward-circle" size={18} color={cfg.color} />
          <Text style={[styles.caseAction, { color: cfg.color }]}>Tap to review</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />

      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}>
        <Text style={styles.headerTitle}>Nurse Dashboard</Text>
        <Text style={styles.headerSub}>
          {cases.length > 0 ? `${cases.length} patient${cases.length === 1 ? '' : 's'} in queue` : 'No patients in queue'}
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : cases.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-outline" size={56} color={COLORS.textTertiary} />
          <Text style={styles.emptyTitle}>Queue is clear</Text>
          <Text style={styles.emptySub}>No patients are currently waiting</Text>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={item => item.id}
          renderItem={renderCase}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.primary} />}
          ListFooterComponent={<View style={{ height: 120 }} />}
        />
      )}

      {/* Case Review Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {selected && (() => {
              const cfg = PRIORITY_CONFIG[selected.priority] || PRIORITY_CONFIG.LOW;
              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                      <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                      <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalPatient}>{selected.patientName || 'Anonymous Patient'}</Text>
                  <Text style={styles.modalSymptoms}>{selected.symptoms}</Text>

                  {selected.aiReasoning && (
                    <View style={styles.modalReasonBox}>
                      <Ionicons name="bulb-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.modalReasonText}>{selected.aiReasoning}</Text>
                    </View>
                  )}

                  {/* Decision buttons */}
                  <Text style={styles.modalSectionLabel}>Your Decision</Text>
                  <View style={styles.decisionRow}>
                    {NURSE_DECISIONS.map(d => (
                      <TouchableOpacity
                        key={d.value}
                        style={[styles.decisionBtn, decision === d.value && { borderColor: d.color, backgroundColor: `${d.color}12` }]}
                        onPress={() => setDecision(d.value)}>
                        <Ionicons name={d.icon} size={20} color={decision === d.value ? d.color : COLORS.textSecondary} />
                        <Text style={[styles.decisionBtnText, decision === d.value && { color: d.color }]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Adjusted priority for ADJUST */}
                  {decision === 'ADJUST' && (
                    <>
                      <Text style={styles.modalSectionLabel}>Set New Priority</Text>
                      <View style={styles.priorityRow}>
                        {Object.entries(PRIORITY_CONFIG).map(([key, pcfg]) => (
                          <TouchableOpacity
                            key={key}
                            style={[styles.priorityOptionBtn, adjustedPriority === key && { borderColor: pcfg.color, backgroundColor: pcfg.bg }]}
                            onPress={() => setAdjustedPriority(key)}>
                            <Text style={[styles.priorityOptionText, adjustedPriority === key && { color: pcfg.color }]}>{pcfg.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Override reason */}
                  {(decision === 'ADJUST' || decision === 'ESCALATE') && (
                    <>
                      <Text style={styles.modalSectionLabel}>Reason</Text>
                      <View style={styles.reasonsList}>
                        {OVERRIDE_REASONS.map(r => (
                          <TouchableOpacity
                            key={r}
                            style={[styles.reasonBtn, overrideReason === r && styles.reasonBtnActive]}
                            onPress={() => setOverrideReason(r)}>
                            {overrideReason === r && <Ionicons name="checkmark" size={13} color={COLORS.primary} />}
                            <Text style={[styles.reasonBtnText, overrideReason === r && styles.reasonBtnTextActive]}>{r}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Confirm */}
                  <TouchableOpacity
                    style={[styles.submitDecisionBtn, saving && { opacity: 0.6 }]}
                    onPress={handleDecision}
                    disabled={saving}
                    activeOpacity={0.85}>
                    <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.submitDecisionGrad}>
                      {saving
                        ? <ActivityIndicator color={COLORS.white} />
                        : <Text style={styles.submitDecisionText}>Save Decision</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 24, paddingHorizontal: 24,
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.70)', marginTop: 4 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle:  { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  emptySub:    { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },

  list: { paddingTop: 16, paddingHorizontal: 20 },

  caseCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    marginBottom: 14, borderLeftWidth: 5,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  caseCardTop:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  priorityBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  priorityBadgeText:{ fontSize: 11, fontWeight: '700' },
  nursedBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  nursedBadgeText:  { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  caseTime:         { marginLeft: 'auto', fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  casePatient:      { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  caseSymptoms:     { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 4 },
  caseReasoning:    { fontSize: 11, color: COLORS.textTertiary, lineHeight: 16, fontStyle: 'italic' },
  caseFooter:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  caseAction:       { fontSize: 12, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, maxHeight: '90%',
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.borderLight, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalPatient:  { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  modalSymptoms: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 10 },
  modalReasonBox:{ flexDirection: 'row', gap: 8, backgroundColor: COLORS.primaryVeryLight, borderRadius: 10, padding: 12, marginBottom: 16 },
  modalReasonText:{ flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  modalSectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8, marginTop: 4 },

  decisionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  decisionBtn: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border,
  },
  decisionBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },

  priorityRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  priorityOptionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border },
  priorityOptionText:{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },

  reasonsList: { gap: 6, marginBottom: 16 },
  reasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.backgroundSecondary, borderWidth: 1, borderColor: COLORS.border,
  },
  reasonBtnActive:    { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  reasonBtnText:      { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', flex: 1 },
  reasonBtnTextActive:{ color: COLORS.primary, fontWeight: '600' },

  submitDecisionBtn:  { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  submitDecisionGrad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  submitDecisionText: { fontSize: 15, fontWeight: '800', color: COLORS.white },
});
