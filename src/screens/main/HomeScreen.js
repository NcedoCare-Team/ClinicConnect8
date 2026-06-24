// src/screens/main/HomeScreen.js
// VisionAlly Home — Clean blue/black professional design
// Sections: Header · Market Trends · For You Jobs · Interview Tips

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, ActivityIndicator,
  Linking, Alert, Animated, Dimensions, Modal,
  TextInput, KeyboardAvoidingView, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';
import {
  fetchJobsForUser,
  fetchMarketTrends,
  JOB_CATEGORIES,
} from '../../services/JobService';
import { InterviewStorageService } from '../../services/InterviewStorageService';
import { UserProfileService } from '../../services/UserProfileService';

const { width: W } = Dimensions.get('window');
const JOB_CARD_W   = W - 48; // full-width minus padding

// ─── Interview Tips data ──────────────────────────────────────────────────────
const TIPS = [
  {
    id: '1',
    icon:    'search-outline',
    color:   COLORS.primary,
    title:   'Research the Company',
    text:    'Spend 20 min on their website, LinkedIn, and recent news before the interview.',
  },
  {
    id: '2',
    icon:    'star-outline',
    color:   '#10B981',
    title:   'Use the STAR Method',
    text:    'Structure every answer: Situation → Task → Action → Result. Keep it under 2 min.',
  },
  {
    id: '3',
    icon:    'body-outline',
    color:   '#F59E0B',
    title:   'Body Language Counts',
    text:    'Eye contact, upright posture, and calm breathing signal confidence to interviewers.',
  },
];

// ─── Skills Prompt Modal ──────────────────────────────────────────────────────
const SkillsPromptModal = ({ visible, onSave, onSkip }) => {
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [s3, setS3] = useState('');

  const handleSave = () => {
    const skills = [s1, s2, s3].map(s => s.trim()).filter(Boolean);
    if (skills.length === 0) { onSkip(); return; }
    onSave(skills);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          {/* Handle bar */}
          <View style={styles.modalHandle} />

          <View style={styles.modalIconWrap}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.modalIcon}>
              <Ionicons name="flash" size={24} color={COLORS.white} />
            </LinearGradient>
          </View>

          <Text style={styles.modalTitle}>Set Your Top Skills</Text>
          <Text style={styles.modalSub}>
            We'll use these to find the most relevant jobs and opportunities for you. You can always update them later in Settings.
          </Text>

          {[
            { val: s1, set: setS1, ph: 'Skill 1 — e.g. React Native', n: 1 },
            { val: s2, set: setS2, ph: 'Skill 2 — e.g. Project Management', n: 2 },
            { val: s3, set: setS3, ph: 'Skill 3 — e.g. Data Analysis', n: 3 },
          ].map(({ val, set, ph, n }) => (
            <View key={n} style={styles.modalInputRow}>
              <View style={styles.modalInputBadge}>
                <Text style={styles.modalInputBadgeText}>{n}</Text>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder={ph}
                placeholderTextColor={COLORS.textTertiary}
                value={val}
                onChangeText={set}
                autoCapitalize="words"
              />
            </View>
          ))}

          <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.modalSaveBtnGradient}>
              <Text style={styles.modalSaveBtnText}>Find My Jobs →</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.modalSkipBtn} onPress={onSkip}>
            <Text style={styles.modalSkipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Trend Card ───────────────────────────────────────────────────────────────
const TrendCard = ({ item }) => {
  const isUp    = item.trend === 'up';
  const pct     = Math.abs(item.trendPct);
  const loading = item.count === 0;

  return (
    <View style={[styles.trendCard, { borderTopColor: item.color }]}>
      <View style={[styles.trendIconWrap, { backgroundColor: `${item.color}18` }]}>
        <Ionicons name={item.icon} size={18} color={item.color} />
      </View>
      <Text style={styles.trendLabel} numberOfLines={1}>{item.label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.textTertiary} style={{ marginTop: 4 }} />
      ) : (
        <>
          <Text style={styles.trendCount}>
            {item.count > 999 ? `${(item.count / 1000).toFixed(1)}k` : item.count}
          </Text>
          <View style={styles.trendBadge}>
            <Ionicons
              name={isUp ? 'arrow-up' : 'remove'}
              size={10}
              color={isUp ? COLORS.success : COLORS.textTertiary}
            />
            <Text style={[styles.trendBadgeText, { color: isUp ? COLORS.success : COLORS.textTertiary }]}>
              {isUp ? `+${pct}%` : 'Stable'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

// ─── Job Card ─────────────────────────────────────────────────────────────────
const JobCard = ({ job }) => {
  const handleApply = async () => {
    try {
      await Linking.openURL(job.applyUrl);
    } catch {
      Alert.alert('Could not open link', 'Please try again.');
    }
  };

  // Get first letter of company for avatar
  const initials = job.company.charAt(0).toUpperCase();

  // Derive category color
  const catMeta = JOB_CATEGORIES.find(c => c.tag === job.categoryTag);
  const catColor = catMeta?.color ?? COLORS.primary;

  return (
    <View style={styles.jobCard}>
      {/* Header row */}
      <View style={styles.jobCardHeader}>
        {/* Company Avatar */}
        <View style={[styles.companyAvatar, { backgroundColor: `${catColor}18` }]}>
          <Text style={[styles.companyAvatarText, { color: catColor }]}>{initials}</Text>
        </View>

        {/* Company + title */}
        <View style={styles.jobCardTitles}>
          <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
          <Text style={styles.jobCompany} numberOfLines={1}>{job.company}</Text>
        </View>

        {/* Posted time */}
        <Text style={styles.jobPosted}>{job.postedAt}</Text>
      </View>

      {/* Meta row */}
      <View style={styles.jobMetaRow}>
        <View style={styles.jobMetaItem}>
          <Ionicons name="location-outline" size={12} color={COLORS.textTertiary} />
          <Text style={styles.jobMetaText} numberOfLines={1}>{job.location}</Text>
        </View>
        {job.salary && (
          <View style={styles.jobMetaItem}>
            <Ionicons name="cash-outline" size={12} color={COLORS.success} />
            <Text style={[styles.jobMetaText, { color: COLORS.success }]}>{job.salary}</Text>
          </View>
        )}
        <View style={[styles.jobTypePill, { backgroundColor: `${catColor}18` }]}>
          <Text style={[styles.jobTypePillText, { color: catColor }]}>
            {job.type === 'full_time' ? 'Full-time' : job.type === 'part_time' ? 'Part-time' : job.type ?? 'Full-time'}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.jobDesc} numberOfLines={2}>{job.description}</Text>

      {/* Divider + Apply */}
      <View style={styles.jobCardFooter}>
        <View style={styles.jobCatChip}>
          <Ionicons name={catMeta?.icon ?? 'briefcase-outline'} size={11} color={catColor} />
          <Text style={[styles.jobCatChipText, { color: catColor }]}>{job.category}</Text>
        </View>

        {/* Apply — Black button per user preference */}
        <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.85}>
          <Text style={styles.applyBtnText}>Apply →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Main HomeScreen ──────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const [userName,      setUserName]      = useState('');
  const [userPhoto,     setUserPhoto]     = useState(null);
  const [userSkills,    setUserSkills]    = useState([]);
  const [showSkillsModal,setShowSkillsModal] = useState(false);
  const [trends,        setTrends]        = useState(
    JOB_CATEGORIES.slice(0, 6).map(c => ({ ...c, count: 0, trend: 'stable', trendPct: 0 }))
  );
  const [jobs,          setJobs]          = useState([]);
  const [jobsLoading,   setJobsLoading]   = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Greeting ──────────────────────────────────────────────────────────────
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  // ── Load user data & check skills ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;

      // Get display name — try UserProfileService first (local cache), then auth
      const profileData = await UserProfileService.getProfile();
      const firstName = (profileData.displayName || auth.currentUser?.displayName || '')
        .split(' ')[0] || 'there';
      setUserName(firstName);

      // Load profile picture from UserProfileService (same key as HomeScreen)
      if (uid) {
        const localPhoto = await UserProfileService.getProfilePicture();
        setUserPhoto(localPhoto || auth.currentUser?.photoURL || null);
      } else {
        setUserPhoto(auth.currentUser?.photoURL || null);
      }

      if (!uid) return;

      try {
        // Load skills from profile data (already loaded above)
        if (profileData.skills?.length > 0) {
          setUserSkills(profileData.skills.filter(Boolean));
        } else {
          // Fall back to Firestore about_me
          const snap    = await getDoc(doc(firestore, 'users', uid, 'profile', 'about_me'));
          const profile = snap.exists() ? snap.data() : null;

          if (profile?.skills?.length > 0) {
            setUserSkills(profile.skills.filter(Boolean));
          } else {
            const cached = await InterviewStorageService.getCachedAboutMe();
            if (cached?.skills?.length > 0) {
              setUserSkills(cached.skills.filter(Boolean));
            } else {
              setTimeout(() => setShowSkillsModal(true), 1200);
            }
          }

          // Update name from about_me if profile data didn't have it
          if (!profileData.displayName && profile?.firstName) {
            setUserName(profile.firstName.split(' ')[0]);
          }
        }
      } catch {
        const cached = await InterviewStorageService.getCachedAboutMe();
        if (cached?.skills?.length > 0) setUserSkills(cached.skills.filter(Boolean));
        else setTimeout(() => setShowSkillsModal(true), 1200);
      }

      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    })();
  }, []);

  // ── Load jobs when skills are known ─────────────────────────────────────
  useEffect(() => {
    if (userSkills.length > 0) loadJobs(userSkills);
  }, [userSkills]);

  // ── Load trends once ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const data = await fetchMarketTrends();
      setTrends(data);
      setTrendsLoading(false);
    })();
  }, []);

  const loadJobs = useCallback(async (skills) => {
    setJobsLoading(true);
    const result = await fetchJobsForUser(skills, 1);
    setJobs(result.jobs);
    setJobsLoading(false);
  }, []);

  // ── Skills modal save ────────────────────────────────────────────────────
  const handleSkillsSave = useCallback(async (skills) => {
    setShowSkillsModal(false);
    setUserSkills(skills);
    // Cache locally
    await InterviewStorageService.cacheAboutMe({ skills });
    loadJobs(skills);
  }, [loadJobs]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.inkDark} translucent />

      {/* Skills Prompt Modal */}
      <SkillsPromptModal
        visible={showSkillsModal}
        onSave={handleSkillsSave}
        onSkip={() => { setShowSkillsModal(false); loadJobs([]); }}
      />

      {/* ── Fixed Hero Header ─────────────────────────────────────────── */}
      <LinearGradient
        colors={[COLORS.inkDark, COLORS.inkSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.heroHeader}
      >
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroGreeting}>{greeting},</Text>
              <Text style={styles.heroName}>{userName} 👋</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.getParent()?.jumpTo('profile')}
              activeOpacity={0.8}
            >
              {userPhoto ? (
                <Image
                  source={{ uri: userPhoto }}
                  style={styles.profileImage}
                />
              ) : (
                <Text style={styles.profileInitials}>
                  {userName ? userName.charAt(0).toUpperCase() : 'U'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.heroSub}>
            {userSkills.length > 0
              ? `${userSkills.slice(0, 2).join(' · ')} · SA Jobs`
              : 'Finding opportunities in South Africa'}
          </Text>
        </View>
        {/* Decorative circles */}
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />
      </LinearGradient>

      <View style={styles.contentSheet}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── White content area ───────────────────────────────────────── */}
        <View style={styles.contentArea}>

          {/* ════════════════════════════════════════════════════════════ */}
          {/*  SECTION 1 — Job Market Trends                              */}
          {/* ════════════════════════════════════════════════════════════ */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.sectionTitle}>Market Trends</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.getParent()?.jumpTo('jobtrends')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>View All →</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendScroll}
          >
            {trendsLoading
              ? Array(5).fill(0).map((_, i) => (
                  <View key={i} style={[styles.trendCard, styles.trendCardSkeleton]} />
                ))
              : trends.map((item, idx) => <TrendCard key={idx} item={item} />)
            }
          </ScrollView>

          {/* ════════════════════════════════════════════════════════════ */}
          {/*  SECTION 2 — For You Jobs                                   */}
          {/* ════════════════════════════════════════════════════════════ */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionDot, { backgroundColor: COLORS.ink }]} />
              <Text style={styles.sectionTitle}>For You</Text>
            </View>
            {userSkills.length > 0 && (
              <View style={styles.skillsChipRow}>
                {userSkills.slice(0, 2).map((s, i) => (
                  <View key={i} style={styles.skillChip}>
                    <Text style={styles.skillChipText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {jobsLoading ? (
            <View style={styles.jobsList}>
              {Array(3).fill(0).map((_, i) => (
                <View key={i} style={styles.jobCardSkeleton}>
                  <View style={styles.skeletonRow}>
                    <View style={[styles.skeletonBox, { width: 42, height: 42, borderRadius: 12 }]} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={[styles.skeletonBox, { height: 14, width: '70%', borderRadius: 6 }]} />
                      <View style={[styles.skeletonBox, { height: 11, width: '45%', borderRadius: 6 }]} />
                    </View>
                  </View>
                  <View style={[styles.skeletonBox, { height: 11, width: '90%', borderRadius: 6, marginTop: 12 }]} />
                  <View style={[styles.skeletonBox, { height: 11, width: '60%', borderRadius: 6, marginTop: 6 }]} />
                </View>
              ))}
            </View>
          ) : jobs.length === 0 ? (
            <View style={styles.noJobs}>
              <Ionicons name="briefcase-outline" size={36} color={COLORS.textTertiary} />
              <Text style={styles.noJobsText}>No jobs found</Text>
              <Text style={styles.noJobsSub}>Try updating your skills in About Me</Text>
              <TouchableOpacity
                style={styles.noJobsBtn}
                onPress={() => navigation.getParent()?.jumpTo('interviewer')}
              >
                <Text style={styles.noJobsBtnText}>Update Skills</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.jobsList}>
              {jobs.slice(0, 3).map(job => <JobCard key={job.id} job={job} />)}

              {/* View All */}
              {jobs.length > 3 && (
                <TouchableOpacity
                  style={styles.seeMoreBtn}
                  onPress={() => navigation.getParent()?.jumpTo('jobtrends')}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[COLORS.ink, COLORS.inkSoft]}
                    style={styles.seeMoreGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.seeMoreText}>View All Jobs</Text>
                    <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/*  SECTION 3 — Interview Tips                                 */}
          {/* ════════════════════════════════════════════════════════════ */}
          <View style={[styles.sectionHeader, { marginTop: 28 }]}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.sectionTitle}>Interview Tips</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.getParent()?.jumpTo('interviewer')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>Practice →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tipsGrid}>
            {TIPS.map(tip => (
              <View key={tip.id} style={styles.tipCard}>
                <View style={[styles.tipIconWrap, { backgroundColor: `${tip.color}15` }]}>
                  <Ionicons name={tip.icon} size={22} color={tip.color} />
                </View>
                <View style={styles.tipTextBlock}>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipText}>{tip.text}</Text>
                </View>
              </View>
            ))}
          </View>

        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  // Fixed Hero Header (matching JobTrends)
  heroHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 44, paddingHorizontal: 24,
    position: 'relative', overflow: 'hidden',
  },
  heroContent: { zIndex: 2 },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.70)', fontWeight: '500' },
  heroName: { fontSize: 30, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  heroSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginTop: 6,
  },
  heroDeco1: {
    position: 'absolute', right: -30, top: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDeco2: {
    position: 'absolute', right: 50, bottom: -50,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  profileBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%', height: '100%', borderRadius: 26,
  },
  profileInitials: {
    fontSize: 20, fontWeight: '800', color: COLORS.white,
  },
  bellDot: {
    position: 'absolute', top: 9, right: 9,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: COLORS.white,
  },

  scrollContent: {
    paddingTop: 0,
  },

  // Content sheet with rounded top corners
  contentSheet: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
    borderTopRightRadius: 28,
    marginTop: -20,
    overflow: 'hidden',
  },

  // White content area
  contentArea: {
    backgroundColor: COLORS.background,
    paddingTop: 24,
    minHeight: 600,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot:      { width: 6, height: 6, borderRadius: 3 },
  sectionTitle:    { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  viewAllText:     { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  // Skills chips
  skillsChipRow: { flexDirection: 'row', gap: 6 },
  skillChip: {
    backgroundColor: `${COLORS.primary}12`, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: `${COLORS.primary}25`,
  },
  skillChipText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },

  // Trend cards
  trendScroll:       { paddingLeft: 20, paddingRight: 8, paddingBottom: 4 },
  trendCard: {
    width: W * 0.38, backgroundColor: COLORS.white, borderRadius: 16,
    padding: 14, marginRight: 10, borderTopWidth: 3,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8 },
      android: { elevation: 2 },
    }),
  },
  trendCardSkeleton: { borderTopColor: '#CBD5E1', backgroundColor: '#F1F5F9', opacity: 0.8, height: 110 },
  trendIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  trendLabel:     { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  trendCount:     { fontSize: 20, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -0.5 },
  trendBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  trendBadgeText: { fontSize: 10, fontWeight: '700' },

  // Jobs loading/empty
  jobsLoading: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  jobsLoadingText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500' },

  // Skeleton
  jobCardSkeleton: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:8 },
      android: { elevation: 2 },
    }),
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonBox: { backgroundColor: '#E2E8F0' },
  noJobs: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 32, gap: 8 },
  noJobsText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  noJobsSub:  { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  noJobsBtn: {
    marginTop: 8, backgroundColor: COLORS.primary,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },
  noJobsBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },

  // Job list
  jobsList: { paddingHorizontal: 20, gap: 12 },
  jobCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:10 },
      android: { elevation: 3 },
    }),
  },
  jobCardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  companyAvatar: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  companyAvatarText: { fontSize: 17, fontWeight: '800' },
  jobCardTitles:   { flex: 1 },
  jobTitle:        { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  jobCompany:      { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontWeight: '500' },
  jobPosted:       { fontSize: 10, color: COLORS.textTertiary, fontWeight: '500' },

  jobMetaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' },
  jobMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  jobMetaText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  jobTypePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  jobTypePillText: { fontSize: 10, fontWeight: '700' },

  jobDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 12 },

  jobCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobCatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.backgroundSecondary,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  jobCatChipText: { fontSize: 10, fontWeight: '600' },

  // Black apply button (per user preference)
  applyBtn:         { borderRadius: 10, overflow: 'hidden' },
  applyBtnText: {
    backgroundColor: COLORS.ink,
    color: COLORS.white, fontWeight: '700', fontSize: 12,
    paddingHorizontal: 14, paddingVertical: 8, overflow: 'hidden', borderRadius: 10,
  },

  // See more (black gradient)
  seeMoreBtn:      { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  seeMoreGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 8,
  },
  seeMoreText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },

  // Tips — vertical stack
  tipsGrid: { paddingHorizontal: 20, gap: 10, paddingBottom: 4 },
  tipCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 16,
    padding: 16, gap: 14,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8 },
      android: { elevation: 2 },
    }),
  },
  tipIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tipTextBlock: { flex: 1 },
  tipTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  tipText:  { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, fontWeight: '500' },

  // Skills Modal
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  modalSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 20,
  },
  modalIconWrap:  { alignItems: 'center', marginBottom: 16 },
  modalIcon: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle:     { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 8 },
  modalSub:       { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  modalInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  modalInputBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center',
  },
  modalInputBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  modalInput: {
    flex: 1, height: 46, backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12, paddingHorizontal: 14,
    fontSize: 14, color: COLORS.textPrimary, fontWeight: '500',
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  modalSaveBtn:         { borderRadius: 14, overflow: 'hidden', marginTop: 8, marginBottom: 10 },
  modalSaveBtnGradient: {
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  modalSaveBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  modalSkipBtn:     { alignItems: 'center', paddingVertical: 8 },
  modalSkipText:    { fontSize: 13, color: COLORS.textTertiary, fontWeight: '600' },
});