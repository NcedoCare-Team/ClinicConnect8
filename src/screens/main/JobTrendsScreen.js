// src/screens/main/JobTrendsScreen.js
// Real SA job market data via Adzuna API
// — Category filter chips  — Job listings  — Search  — Pagination

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Platform, StatusBar, ActivityIndicator,
  Linking, Alert, Animated, Dimensions, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import {
  searchJobs,
  fetchJobsByCategory,
  fetchMarketTrends,
  JOB_CATEGORIES,
} from '../../services/JobService';

const { width: W } = Dimensions.get('window');

// ─── Category bar (All + each Adzuna category) ────────────────────────────────
const ALL_CATS = [{ label: 'All Jobs', tag: '', icon: 'grid-outline', color: COLORS.primary }, ...JOB_CATEGORIES];

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, color }) => (
  <View style={[styles.statCard, { borderTopColor: color }]}>
    <Ionicons name={icon} size={18} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ─── Job List Card ────────────────────────────────────────────────────────────
const JobListCard = ({ job, index }) => {
  const catMeta  = JOB_CATEGORIES.find(c => c.tag === job.categoryTag);
  const catColor = catMeta?.color ?? COLORS.primary;
  const initial  = job.company.charAt(0).toUpperCase();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue:  1,
      duration: 300,
      delay:    index * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleApply = async () => {
    try {
      await Linking.openURL(job.applyUrl);
    } catch {
      Alert.alert('Could not open link', 'Please try again.');
    }
  };

  return (
    <Animated.View style={[styles.listCard, { opacity: fadeAnim }]}>
      {/* Left accent bar */}
      <View style={[styles.listCardAccent, { backgroundColor: catColor }]} />

      <View style={styles.listCardBody}>
        {/* Row 1: Avatar + info + posted */}
        <View style={styles.listCardRow}>
          <View style={[styles.listAvatar, { backgroundColor: `${catColor}18` }]}>
            <Text style={[styles.listAvatarText, { color: catColor }]}>{initial}</Text>
          </View>
          <View style={styles.listCardInfo}>
            <Text style={styles.listTitle} numberOfLines={1}>{job.title}</Text>
            <Text style={styles.listCompany}>{job.company}</Text>
          </View>
          <Text style={styles.listPosted}>{job.postedAt}</Text>
        </View>

        {/* Row 2: Location + Salary */}
        <View style={styles.listMeta}>
          <View style={styles.listMetaItem}>
            <Ionicons name="location-outline" size={11} color={COLORS.textTertiary} />
            <Text style={styles.listMetaText} numberOfLines={1}>{job.location}</Text>
          </View>
          {job.salary && (
            <View style={styles.listMetaItem}>
              <Ionicons name="cash-outline" size={11} color={COLORS.success} />
              <Text style={[styles.listMetaText, { color: COLORS.success, fontWeight: '700' }]}>
                {job.salary}
              </Text>
            </View>
          )}
        </View>

        {/* Row 3: Category tag + Apply button */}
        <View style={styles.listCardFooter}>
          <View style={[styles.listCatPill, { backgroundColor: `${catColor}15` }]}>
            <Ionicons name={catMeta?.icon ?? 'briefcase-outline'} size={10} color={catColor} />
            <Text style={[styles.listCatText, { color: catColor }]}>{job.category}</Text>
          </View>

          {/* Black apply button */}
          <TouchableOpacity style={styles.listApplyBtn} onPress={handleApply} activeOpacity={0.85}>
            <Text style={styles.listApplyText}>Apply</Text>
            <Ionicons name="arrow-forward-outline" size={12} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function JobTrendsScreen({ navigation }) {
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeCategory, setActiveCat] = useState('');  // '' = All
  const [jobs,           setJobs]      = useState([]);
  const [loading,        setLoading]   = useState(true);
  const [loadingMore,    setLoadingMore]= useState(false);
  const [page,           setPage]      = useState(1);
  const [totalJobs,      setTotalJobs] = useState(0);
  const [trends,         setTrends]    = useState([]);
  const [trendsLoading,  setTrendsLoading] = useState(true);

  const searchTimeout    = useRef(null);
  const flatListRef      = useRef(null);
  const scrollableHeight = useRef(0);
  const isStickyRef      = useRef(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [snapOffset,    setSnapOffset]    = useState(0);

  const handleScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldStick = scrollableHeight.current > 0 && y >= scrollableHeight.current;
    if (shouldStick !== isStickyRef.current) {
      isStickyRef.current = shouldStick;
      setStickyVisible(shouldStick);
    }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    loadTrends();
    loadJobs(1, '', '');
  }, []);

  const loadTrends = async () => {
    const data = await fetchMarketTrends();
    setTrends(data);
    setTrendsLoading(false);
  };

  // ── Core job loader ─────────────────────────────────────────────────────
  const loadJobs = useCallback(async (pg, query, category, append = false) => {
    if (pg === 1) setLoading(true);
    else          setLoadingMore(true);

    let result;
    if (category) {
      result = await fetchJobsByCategory(category, pg);
    } else {
      result = await searchJobs(query, '', pg);
    }

    setTotalJobs(result.total);
    setJobs(prev => append ? [...prev, ...result.jobs] : result.jobs);
    setPage(pg);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  // ── Search with debounce ─────────────────────────────────────────────────
  const handleSearch = (text) => {
    setSearchQuery(text);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setActiveCat('');
      loadJobs(1, text, '');
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 500);
  };

  // ── Category select ──────────────────────────────────────────────────────
  const handleCategoryPress = (tag) => {
    setActiveCat(tag);
    setSearchQuery('');
    loadJobs(1, '', tag);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // ── Load more (infinite scroll) ──────────────────────────────────────────
  const handleLoadMore = () => {
    if (loadingMore || jobs.length >= totalJobs) return;
    loadJobs(page + 1, searchQuery, activeCategory, true);
  };

  // ─── Top stats summary (from trends) ────────────────────────────────────
  const totalListed = trends.reduce((sum, t) => sum + (t.count || 0), 0);
  const topCat      = trends[0];

  // ─── List helpers ─────────────────────────────────────────────────────────
  const renderJob = useCallback(({ item, index }) => (
    <JobListCard job={item} index={index} />
  ), []);

  const keyExtractor = useCallback(item => item.id, []);

  // ── Shared search + filter (used both inline and as sticky overlay) ──────
  const renderSearchAndFilter = () => (
    <>
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search jobs in South Africa…"
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); loadJobs(1, '', activeCategory); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catChips}
      >
        {ALL_CATS.map(item => {
          const active = activeCategory === item.tag;
          return (
            <TouchableOpacity
              key={item.tag || 'all'}
              style={[styles.catChip, active && { backgroundColor: item.color, borderColor: item.color }]}
              onPress={() => handleCategoryPress(item.tag)}
              activeOpacity={0.8}
            >
              <Ionicons name={item.icon} size={13} color={active ? COLORS.white : item.color} />
              <Text style={[styles.catChipText, { color: active ? COLORS.white : item.color }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!loading && (
        <View style={styles.resultsCount}>
          <Text style={styles.resultsCountText}>
            {totalJobs > 0
              ? `${totalJobs.toLocaleString()} jobs found`
              : 'No jobs found'}
          </Text>
          {activeCategory && (
            <TouchableOpacity onPress={() => handleCategoryPress('')} style={styles.clearFilter}>
              <Text style={styles.clearFilterText}>Clear filter</Text>
              <Ionicons name="close" size={12} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );

  const ListHeader = () => (
    <View>
      {/* ── Scrollable zone: stats + hottest categories (scrolls away) ──── */}
      <View onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        scrollableHeight.current = h;
        if (h !== snapOffset) setSnapOffset(h);
      }}>
        <View style={styles.statsRow}>
          <StatCard
            icon="briefcase-outline"
            label="Total Listings"
            value={totalListed > 0 ? `${(totalListed / 1000).toFixed(0)}k+` : '—'}
            color={COLORS.primary}
          />
          <StatCard
            icon="trending-up"
            label="Top Category"
            value={topCat?.label ?? '—'}
            color={COLORS.success}
          />
          <StatCard
            icon="search-outline"
            label="Your Results"
            value={totalJobs > 0 ? `${totalJobs}` : '—'}
            color={COLORS.inkMid}
          />
        </View>

        {!trendsLoading && (
          <View style={styles.trendBarsSection}>
            <Text style={styles.trendBarsTitle}>Hottest Categories</Text>
            {trends.slice(0, 5).map((t, i) => {
              const pct = totalListed > 0 ? (t.count / totalListed) : 0;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.trendBar}
                  onPress={() => handleCategoryPress(t.tag)}
                  activeOpacity={0.7}
                >
                  <View style={styles.trendBarLeft}>
                    <Ionicons name={t.icon} size={14} color={t.color} />
                    <Text style={styles.trendBarLabel}>{t.label}</Text>
                  </View>
                  <View style={styles.trendBarTrack}>
                    <View style={[styles.trendBarFill, { width: `${Math.min(pct * 100 * 3, 100)}%`, backgroundColor: t.color }]} />
                  </View>
                  <Text style={[styles.trendBarCount, { color: t.color }]}>
                    {t.count > 999 ? `${(t.count / 1000).toFixed(1)}k` : t.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Sticky zone: search + filter (also rendered as overlay) ──────── */}
      {renderSearchAndFilter()}
    </View>
  );

  const ListFooter = () => (
    <View style={styles.listFooter}>
      {loadingMore && <ActivityIndicator size="small" color={COLORS.primary} />}
      {!loadingMore && jobs.length >= totalJobs && totalJobs > 0 && (
        <Text style={styles.endText}>You've seen all {totalJobs} jobs</Text>
      )}
      <View style={{ height: 110 }} />
    </View>
  );

  const ListEmpty = () => (
    loading ? (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading jobs…</Text>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <Ionicons name="briefcase-outline" size={48} color={COLORS.border} />
        <Text style={styles.emptyTitle}>No jobs found</Text>
        <Text style={styles.emptyText}>Try adjusting your search or selecting a different category.</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => { setSearchQuery(''); handleCategoryPress(''); }}>
          <Text style={styles.emptyBtnText}>Show All Jobs</Text>
        </TouchableOpacity>
      </View>
    )
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.inkDark} />

      {/* ── Fixed Hero Header ──────────────────────────────────────────── */}
      <LinearGradient
        colors={[COLORS.inkDark, COLORS.inkSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.heroHeader}
      >
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Job Market</Text>
          <Text style={styles.heroTitle2}>South Africa</Text>
          <Text style={styles.heroSub}>
            Live data · Powered by Adzuna
          </Text>
        </View>
        {/* Decorative circles */}
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />
      </LinearGradient>

      <View style={styles.contentSheet}>
        {/* Sticky search + filter — appears when scrolled past the stats/trends */}
        {stickyVisible && (
          <View style={styles.stickyWrapper}>
            {renderSearchAndFilter()}
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={loading ? [] : jobs}
          renderItem={renderJob}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader()}
          ListFooterComponent={ListFooter()}
          ListEmptyComponent={ListEmpty()}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.flatContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          snapToOffsets={snapOffset > 0 ? [snapOffset] : undefined}
          snapToEnd={false}
          decelerationRate="fast"
          removeClippedSubviews
          maxToRenderPerBatch={8}
          windowSize={10}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.backgroundSecondary },
  flatContent: { paddingBottom: 20 },

  // Hero
  heroHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 44, paddingHorizontal: 24,
    position: 'relative', overflow: 'hidden',
  },
  heroContent: { zIndex: 2 },
  heroTitle:   { fontSize: 30, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  heroTitle2:  { fontSize: 30, fontWeight: '900', color: COLORS.primaryLight, letterSpacing: -0.5 },
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

  // Content sheet with rounded top corners
  contentSheet: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
    borderTopRightRadius: 28,
    marginTop: -20,
    overflow: 'hidden',
  },

  // Sticky search + filter overlay
  stickyWrapper: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: 10, padding: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  statCard: {
    flex: 1, backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 14, padding: 12,
    alignItems: 'center', gap: 4,
    borderTopWidth: 3,
  },
  statValue: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  statLabel: { fontSize: 9,  fontWeight: '600', color: COLORS.textTertiary, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Trend bars
  trendBarsSection: {
    backgroundColor: COLORS.white, padding: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  trendBarsTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12 },
  trendBar:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  trendBarLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6, width: 110 },
  trendBarLabel:  { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, flex: 1 },
  trendBarTrack:  { flex: 1, height: 6, backgroundColor: COLORS.borderLight, borderRadius: 3, overflow: 'hidden' },
  trendBarFill:   { height: '100%', borderRadius: 3 },
  trendBarCount:  { fontSize: 11, fontWeight: '800', width: 40, textAlign: 'right' },

  // Search
  searchSection: { backgroundColor: COLORS.white, paddingHorizontal: 16, paddingVertical: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 14, paddingHorizontal: 14, height: 46,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },

  // Category chips
  catChips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: COLORS.white },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  catChipText: { fontSize: 11, fontWeight: '700' },

  // Results count
  resultsCount: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  resultsCountText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  clearFilter:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearFilterText:  { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // Job list card
  listCard: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    marginHorizontal: 16, marginTop: 10, borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:8 },
      android: { elevation: 3 },
    }),
  },
  listCardAccent: { width: 4 },
  listCardBody:   { flex: 1, padding: 14 },
  listCardRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  listAvatar: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  listAvatarText: { fontSize: 16, fontWeight: '900' },
  listCardInfo:   { flex: 1 },
  listTitle:      { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  listCompany:    { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, fontWeight: '500' },
  listPosted:     { fontSize: 10, color: COLORS.textTertiary, fontWeight: '500' },

  listMeta: { flexDirection: 'row', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  listMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listMetaText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },

  listCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listCatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  listCatText: { fontSize: 10, fontWeight: '700' },

  // Black apply button
  listApplyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.ink, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
  },
  listApplyText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },

  // Loading / empty
  loadingCenter: { paddingVertical: 60, alignItems: 'center', gap: 14 },
  loadingText:   { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500' },

  emptyState: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  emptyText:  { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 10, backgroundColor: COLORS.primary,
    paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12,
  },
  emptyBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },

  // Footer
  listFooter: { paddingVertical: 20, alignItems: 'center' },
  endText:    { fontSize: 12, color: COLORS.textTertiary, fontWeight: '500' },
});