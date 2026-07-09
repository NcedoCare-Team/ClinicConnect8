// src/screens/main/HealthRecordScreen.js
// "My Health Journey" — immutable patient file with full activity records.
// Every assessment, AI result, and nurse decision is recorded here permanently.
// Completed records are sealed and cannot be modified.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { COLLECTIONS } from '../../services/firestorePaths';
import { ScreenHeader, LAYOUT } from '../../components/layout/ScreenHeader';
import { SessionService } from '../../services/SessionService';
import { UserProfileService } from '../../services/UserProfileService';
import { useFacility } from '../../contexts/FacilityContext';

// ── Config ────────────────────────────────────────────────────────────────────
const PRIORITY_CFG = {
  CRITICAL: { color: COLORS.critical, bg: COLORS.criticalLight, dot: '#DC2626', label: 'Critical'  },
  HIGH:     { color: COLORS.high,     bg: COLORS.highLight,     dot: '#EA580C', label: 'High'      },
  MEDIUM:   { color: COLORS.medium,   bg: COLORS.mediumLight,   dot: '#D97706', label: 'Moderate'  },
  LOW:      { color: COLORS.low,      bg: COLORS.lowLight,      dot: '#16A34A', label: 'Low Risk'  },
};

const DECISION_CFG = {
  CONFIRM:  { label: 'Confirmed AI Assessment', color: COLORS.low,      icon: 'checkmark-circle'  },
  ADJUST:   { label: 'Priority Adjusted',       color: COLORS.medium,   icon: 'create-outline'    },
  ESCALATE: { label: 'Escalated — Urgent Care', color: COLORS.critical, icon: 'arrow-up-circle'   },
};

const FILTERS = [
  { id: 'all',    label: 'All Records'   },
  { id: 'active', label: 'Active'        },
  { id: 'sealed', label: 'Sealed'        },
];

function fmtDate(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(ts) {
  if (!ts?.toDate) return '—';
  const d = ts.toDate();
  return `${d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} at ${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
}
function shortId(uid) {
  return uid ? `NC-${uid.slice(-6).toUpperCase()}` : '—';
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HealthRecordScreen() {
  const { session: facilitySession } = useFacility();
  const [cases,      setCases]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState({});
  const [filter,     setFilter]     = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [patient,    setPatient]    = useState(null);

  useEffect(() => {
    loadPatient();
    loadCases();
  }, [facilitySession]);

  const loadPatient = async () => {
    const session = facilitySession || SessionService.getSession();
    const profile = await UserProfileService.getProfile();
    setPatient({ ...profile, ...session });
  };

  const loadCases = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    try {
      const q    = query(
        collection(firestore, COLLECTIONS.TRIAGE_CASES),
        where('patientId', '==', uid),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* non-critical — access rules */ }
    setLoading(false);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCases();
    setRefreshing(false);
  };

  const toggleExpand = id =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const filteredCases = useMemo(() => {
    if (filter === 'active') return cases.filter(c => c.status !== 'completed');
    if (filter === 'sealed') return cases.filter(c => c.status === 'completed');
    return cases;
  }, [cases, filter]);

  const uid       = auth.currentUser?.uid;
  const totalCases  = cases.length;
  const sealedCount = cases.filter(c => c.status === 'completed').length;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Health Journey"
        subtitle="Your care history, most recent first"
        rightIcon="filter-outline"
        onRightPress={() => setShowFilter(true)}
      />

      {/* Filter modal */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <View style={styles.filterSheet}>
            <Text style={styles.filterTitle}>Filter Records</Text>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterOption, filter === f.id && styles.filterOptionActive]}
                onPress={() => { setFilter(f.id); setShowFilter(false); }}>
                <Text style={[styles.filterOptionText, filter === f.id && styles.filterOptionTextActive]}>
                  {f.label}
                </Text>
                {filter === f.id && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Loading patient file…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          showsVerticalScrollIndicator={false}>

          {/* Patient Identity Card */}
          <PatientCard patient={patient} uid={uid} totalCases={totalCases} sealedCount={sealedCount} />

          {/* Active filter chip */}
          {filter !== 'all' && (
            <View style={styles.activeFilter}>
              <Ionicons name="funnel" size={12} color={COLORS.primary} />
              <Text style={styles.activeFilterText}>
                {FILTERS.find(f => f.id === filter)?.label}
              </Text>
              <TouchableOpacity onPress={() => setFilter('all')}>
                <Ionicons name="close-circle" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Section header */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Activity Timeline</Text>
            <Text style={styles.sectionCount}>{filteredCases.length} record{filteredCases.length !== 1 ? 's' : ''}</Text>
          </View>

          {filteredCases.length === 0 ? (
            <EmptyState hasFilter={filter !== 'all'} />
          ) : (
            <View style={styles.timeline}>
              {filteredCases.map((c, i) => (
                <CaseRecord
                  key={c.id}
                  caseData={c}
                  isFirst={i === 0}
                  isLast={i === filteredCases.length - 1}
                  isExpanded={!!expanded[c.id]}
                  onToggle={() => toggleExpand(c.id)}
                />
              ))}
            </View>
          )}

          <View style={{ height: LAYOUT.bottomTabClearance + 8 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Patient Identity Card ─────────────────────────────────────────────────────
function PatientCard({ patient, uid, totalCases, sealedCount }) {
  const name = [patient?.patientFirstName || patient?.firstName, patient?.patientSurname || patient?.lastName]
    .filter(Boolean).join(' ') || 'Patient';
  const age      = patient?.patientAge || patient?.age || '—';
  const facility = patient?.facilityName || patient?.primaryFacility || 'No facility linked';

  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.patientCard}>
      <View style={styles.deco1} /><View style={styles.deco2} />

      <View style={styles.patientRow}>
        <View style={styles.patientAvatar}>
          <Ionicons name="person" size={26} color={COLORS.primary} />
        </View>
        <View style={styles.patientMeta}>
          <Text style={styles.patientName}>{name}</Text>
          <Text style={styles.patientSub}>Age {age} • {shortId(uid)}</Text>
        </View>
        <View style={styles.patientFileBadge}>
          <Ionicons name="document-text" size={12} color="#FFFFFF" />
          <Text style={styles.patientFileBadgeText}>PATIENT FILE</Text>
        </View>
      </View>

      <View style={styles.patientDivider} />

      <View style={styles.patientFacilityRow}>
        <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
        <Text style={styles.patientFacility} numberOfLines={1}>{facility}</Text>
      </View>

      <View style={styles.patientStats}>
        <View style={styles.patientStat}>
          <Text style={styles.patientStatVal}>{totalCases}</Text>
          <Text style={styles.patientStatLbl}>Total</Text>
        </View>
        <View style={styles.patientStatDivider} />
        <View style={styles.patientStat}>
          <Text style={styles.patientStatVal}>{totalCases - sealedCount}</Text>
          <Text style={styles.patientStatLbl}>Active</Text>
        </View>
        <View style={styles.patientStatDivider} />
        <View style={styles.patientStat}>
          <Text style={styles.patientStatVal}>{sealedCount}</Text>
          <Text style={styles.patientStatLbl}>Sealed</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ── Individual case record ────────────────────────────────────────────────────
function CaseRecord({ caseData: c, isFirst, isLast, isExpanded, onToggle }) {
  const priority  = PRIORITY_CFG[c.priority] || PRIORITY_CFG.LOW;
  const isSealed  = c.status === 'completed';
  const decision  = c.nurseDecision ? DECISION_CFG[c.nurseDecision] : null;
  const riskPct   = c.riskScore ?? null;
  const indicators = Array.isArray(c.riskIndicators) ? c.riskIndicators : [];

  return (
    <View style={styles.timelineItem}>
      {/* Rail */}
      <View style={styles.rail}>
        <View style={[styles.railDot, { backgroundColor: priority.dot }]}>
          <Ionicons name="sparkles" size={10} color="#FFFFFF" />
        </View>
        {!isLast && <View style={styles.railLine} />}
      </View>

      {/* Card */}
      <View style={[
        styles.recordCard,
        isFirst && styles.recordCardFirst,
        isSealed && styles.recordCardSealed,
      ]}>
        {/* ── Header row ── */}
        <TouchableOpacity style={styles.recordHeader} onPress={onToggle} activeOpacity={0.82}>
          <View style={styles.recordHeaderLeft}>
            <View style={[styles.priorityPill, { backgroundColor: priority.bg }]}>
              <View style={[styles.priorityDot, { backgroundColor: priority.dot }]} />
              <Text style={[styles.priorityLabel, { color: priority.color }]}>{priority.label}</Text>
            </View>
            {isSealed && (
              <View style={styles.sealedBadge}>
                <Ionicons name="lock-closed" size={9} color={COLORS.low} />
                <Text style={styles.sealedBadgeText}>Sealed</Text>
              </View>
            )}
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16} color={COLORS.textTertiary} />
        </TouchableOpacity>

        {/* Date + title */}
        <Text style={styles.recordDate}>{fmtDate(c.createdAt)} · {fmtTime(c.createdAt)}</Text>
        <Text style={styles.recordTitle} numberOfLines={isExpanded ? undefined : 2}>
          {c.symptoms || 'Health Assessment'}
        </Text>

        {/* Risk bar (always visible) */}
        {riskPct !== null && (
          <View style={styles.riskRow}>
            <Text style={styles.riskLabel}>AI Risk Score</Text>
            <View style={styles.riskBarTrack}>
              <View style={[styles.riskBarFill, {
                width: `${riskPct}%`,
                backgroundColor:
                  riskPct >= 80 ? COLORS.critical :
                  riskPct >= 60 ? COLORS.high :
                  riskPct >= 40 ? COLORS.medium : COLORS.low,
              }]} />
            </View>
            <Text style={styles.riskVal}>{riskPct}<Text style={styles.riskMax}>/100</Text></Text>
          </View>
        )}

        {/* ── Expanded detail ── */}
        {isExpanded && (
          <View style={styles.expandedBody}>

            {/* ① Assessment submitted */}
            <EventRow
              icon="send-outline"
              iconColor={COLORS.primary}
              title="Assessment Submitted"
              time={fmtDateTime(c.createdAt)}
            />

            {/* ② AI Triage Result */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionBlockHeader}>
                <Ionicons name="sparkles" size={13} color={COLORS.primary} />
                <Text style={styles.sectionBlockTitle}>AI Triage Assessment</Text>
              </View>

              {c.confidence !== undefined && (
                <DetailRow label="Confidence" value={`${c.confidence}%`} />
              )}
              {c.reasoning ? (
                <View style={styles.reasoningBox}>
                  <Text style={styles.reasoningLabel}>Clinical Reasoning</Text>
                  <Text style={styles.reasoningText}>{c.reasoning}</Text>
                </View>
              ) : null}
              {indicators.length > 0 && (
                <View style={styles.indicatorBlock}>
                  <Text style={styles.indicatorTitle}>Risk Indicators</Text>
                  {indicators.map((ind, idx) => (
                    <View key={idx} style={styles.indicatorRow}>
                      <View style={[styles.indicatorDot, { backgroundColor: priority.dot }]} />
                      <Text style={styles.indicatorText}>{ind}</Text>
                    </View>
                  ))}
                </View>
              )}
              {c.recommendedAction ? (
                <DetailRow label="Recommended Action" value={c.recommendedAction} />
              ) : null}
              {c.estimatedWait ? (
                <DetailRow label="Estimated Wait" value={c.estimatedWait} />
              ) : null}

              <EventRow
                icon="checkmark-circle-outline"
                iconColor={COLORS.info}
                title="AI Triage Complete"
                time={fmtDateTime(c.createdAt)}
              />
            </View>

            {/* ③ Nurse Review */}
            {c.nurseDecision && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionBlockHeader}>
                  <Ionicons name="medical" size={13} color={COLORS.high} />
                  <Text style={styles.sectionBlockTitle}>Nurse Review</Text>
                </View>

                {decision && (
                  <View style={[styles.decisionRow, { backgroundColor: decision.color + '18' }]}>
                    <Ionicons name={decision.icon} size={16} color={decision.color} />
                    <Text style={[styles.decisionText, { color: decision.color }]}>{decision.label}</Text>
                  </View>
                )}
                {c.overrideReason ? (
                  <DetailRow label="Override Reason" value={c.overrideReason} />
                ) : null}
                {c.nurseReviewedAt && (
                  <EventRow
                    icon="eye-outline"
                    iconColor={COLORS.high}
                    title="Nurse Review Recorded"
                    time={fmtDateTime(c.nurseReviewedAt)}
                  />
                )}
              </View>
            )}

            {/* ④ Sealed footer */}
            {isSealed ? (
              <View style={styles.sealedFooter}>
                <Ionicons name="lock-closed" size={14} color={COLORS.low} />
                <View>
                  <Text style={styles.sealedFooterTitle}>Record Sealed — Permanent</Text>
                  <Text style={styles.sealedFooterSub}>
                    This record is complete and cannot be modified.
                    {c.nurseReviewedAt ? `  Sealed ${fmtDateTime(c.nurseReviewedAt)}.` : ''}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.openFooter}>
                <Ionicons name="time-outline" size={13} color={COLORS.medium} />
                <Text style={styles.openFooterText}>Record in progress — awaiting nurse review</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function EventRow({ icon, iconColor, title, time }) {
  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventIcon, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon} size={12} color={iconColor} />
      </View>
      <Text style={styles.eventTitle}>{title}</Text>
      <Text style={styles.eventTime}>{time}</Text>
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function EmptyState({ hasFilter }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name="git-network-outline" size={36} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>
        {hasFilter ? 'No matching records' : 'Your journey starts here'}
      </Text>
      <Text style={styles.emptySub}>
        {hasFilter
          ? 'Try changing your filter to see more records.'
          : 'After your first AI health assessment, every consultation, nurse review, and outcome will be permanently recorded here.'}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = Platform.select({
  ios:     { shadowColor: '#0F1A14', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  scroll: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 20 },

  // ── Filter modal ──
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  filterSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 4,
  },
  filterTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12 },
  filterOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12,
  },
  filterOptionActive:     { backgroundColor: COLORS.primaryVeryLight },
  filterOptionText:       { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  filterOptionTextActive: { color: COLORS.primary },

  // ── Active filter chip ──
  activeFilter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryVeryLight, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12,
  },
  activeFilterText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // ── Section header ──
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary },
  sectionCount: { fontSize: 12, fontWeight: '600', color: COLORS.textTertiary },

  // ── Patient Card ──
  patientCard: {
    borderRadius: 20, padding: 20, marginBottom: 20,
    overflow: 'hidden', position: 'relative', ...S,
  },
  deco1: {
    position: 'absolute', top: -30, right: -30, width: 120, height: 120,
    borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.09)',
  },
  deco2: {
    position: 'absolute', bottom: -20, left: -20, width: 80, height: 80,
    borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  patientRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  patientAvatar:   {
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  patientMeta:     { flex: 1 },
  patientName:     { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.3 },
  patientSub:      { fontSize: 12, color: 'rgba(255,255,255,0.70)', marginTop: 2 },
  patientFileBadge:{
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  patientFileBadgeText: { fontSize: 8, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 },
  patientDivider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 12 },
  patientFacilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  patientFacility: { fontSize: 12, color: 'rgba(255,255,255,0.75)', flex: 1 },
  patientStats:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  patientStat:     { alignItems: 'center', flex: 1 },
  patientStatVal:  { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  patientStatLbl:  { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600', marginTop: 2 },
  patientStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },

  // ── Timeline ──
  timeline:      { gap: 0 },
  timelineItem:  { flexDirection: 'row', gap: 12 },
  rail:          { alignItems: 'center', width: 26 },
  railDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  railLine: { flex: 1, width: 2, backgroundColor: COLORS.borderLight, marginVertical: 4, minHeight: 32 },

  // ── Record card ──
  recordCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.borderLight, ...S,
  },
  recordCardFirst:  { borderColor: COLORS.primaryGlow, borderWidth: 1.5 },
  recordCardSealed: { backgroundColor: '#FAFCFA' },

  recordHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  recordHeaderLeft:{ flexDirection: 'row', alignItems: 'center', gap: 8 },

  priorityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  priorityDot:   { width: 6, height: 6, borderRadius: 3 },
  priorityLabel: { fontSize: 11, fontWeight: '800' },

  sealedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.lowLight,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  sealedBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.low },

  recordDate:  { fontSize: 10, fontWeight: '600', color: COLORS.textTertiary, marginBottom: 4 },
  recordTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 20, marginBottom: 10 },

  // Risk bar
  riskRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  riskLabel:    { fontSize: 10, fontWeight: '600', color: COLORS.textTertiary, width: 80 },
  riskBarTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.backgroundTertiary, overflow: 'hidden' },
  riskBarFill:  { height: '100%', borderRadius: 3 },
  riskVal:      { fontSize: 13, fontWeight: '800', color: COLORS.textPrimary, width: 38, textAlign: 'right' },
  riskMax:      { fontSize: 9, fontWeight: '500', color: COLORS.textTertiary },

  // ── Expanded ──
  expandedBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 12, gap: 12 },

  sectionBlock: {
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12, padding: 12, gap: 8,
  },
  sectionBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionBlockTitle:  { fontSize: 12, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: 0.2 },

  reasoningBox:  { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.borderLight },
  reasoningLabel:{ fontSize: 10, fontWeight: '700', color: COLORS.textTertiary, marginBottom: 4 },
  reasoningText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  indicatorBlock: { gap: 4 },
  indicatorTitle: { fontSize: 10, fontWeight: '700', color: COLORS.textTertiary },
  indicatorRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  indicatorDot:   { width: 5, height: 5, borderRadius: 3 },
  indicatorText:  { fontSize: 12, color: COLORS.textSecondary, flex: 1 },

  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  detailLabel:  { fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, flex: 1 },
  detailValue:  { fontSize: 11, fontWeight: '700', color: COLORS.textPrimary, flex: 2, textAlign: 'right' },

  decisionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, padding: 10,
  },
  decisionText: { fontSize: 13, fontWeight: '800' },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  eventTitle:{ flex: 1, fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  eventTime: { fontSize: 10, color: COLORS.textTertiary, fontWeight: '500' },

  sealedFooter: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.lowLight, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: COLORS.low + '30',
  },
  sealedFooterTitle: { fontSize: 11, fontWeight: '800', color: COLORS.low },
  sealedFooterSub:   { fontSize: 10, color: COLORS.low + 'AA', lineHeight: 15, marginTop: 1, flex: 1 },

  openFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.mediumLight, borderRadius: 10, padding: 10,
  },
  openFooterText: { fontSize: 11, fontWeight: '600', color: COLORS.medium },

  // ── Empty ──
  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: LAYOUT.cardRadius,
    padding: 32, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLight, ...S,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
