// src/screens/main/FacilitySelectionScreen.js
// NcedoCare — Facility selection via Nominatim (OpenStreetMap geocoding API).
// Free, no key required. Nominatim is OSM's official search API for apps.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Platform, StatusBar, ActivityIndicator,
  RefreshControl, Keyboard, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';      
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { replacePatientTab } from '../../navigation/openPatientTab';
import { COLORS } from '../../constants/colors';

// ── Nominatim API ─────────────────────────────────────────────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const BOX_DEG   = 0.13; // ~14 km bounding box at SA latitudes

// ── Filter definitions ────────────────────────────────────────────────────────
const FACILITY_TYPES = [
  { id: 'all',      label: 'All',       icon: 'grid-outline'     },
  { id: 'hospital', label: 'Hospital',  icon: 'business-outline' },
  { id: 'clinic',   label: 'Clinic',    icon: 'medical-outline'  },
  { id: 'pharmacy', label: 'Pharmacy',  icon: 'flask-outline'    },
  { id: 'doctor',   label: 'GP/Doctor', icon: 'person-outline'   },
];

const OWNERSHIP_TYPES = [
  { id: 'all',     label: 'All'     },
  { id: 'public',  label: 'Public'  },
  { id: 'private', label: 'Private' },
];

const TYPE_CONFIG = {
  hospital: { icon: 'business', color: COLORS.critical, bg: COLORS.criticalLight,    label: 'Hospital'  },
  clinic:   { icon: 'medical',  color: COLORS.primary,  bg: COLORS.primaryVeryLight, label: 'Clinic'    },
  pharmacy: { icon: 'flask',    color: COLORS.info,     bg: COLORS.infoLight,        label: 'Pharmacy'  },
  doctor:   { icon: 'person',   color: COLORS.medium,   bg: COLORS.mediumLight,      label: 'GP/Doctor' },
};

// ── Nominatim amenity → NcedoCare type ───────────────────────────────────────
const AMENITY_MAP = {
  hospital: 'hospital',
  clinic:   'clinic',
  doctors:  'doctor',
  pharmacy: 'pharmacy',
};

// ── Private hospital brands common in South Africa ───────────────────────────
const PRIVATE_KEYWORDS = [
  'netcare', 'life ', 'mediclinic', 'intercare', 'clinix', 'busamed',
  'lenmed', 'medi-clinic', 'private', 'emed',
];

function guessOwnership(name, extratags) {
  const raw = (extratags?.['operator:type'] || '').toLowerCase();
  if (raw === 'private') return 'private';
  if (raw === 'public' || raw === 'government') return 'public';
  const n = (name || '').toLowerCase();
  return PRIVATE_KEYWORDS.some(k => n.includes(k)) ? 'private' : 'public';
}

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
function distanceColor(km) {
  if (km < 2)  return COLORS.low;
  if (km < 5)  return COLORS.medium;
  if (km < 10) return COLORS.high;
  return COLORS.textTertiary;
}

// ── Nominatim fetch for one amenity type ─────────────────────────────────────
function nominatimFetch(amenity, lat, lng) {
  const viewbox = `${lng - BOX_DEG},${lat + BOX_DEG},${lng + BOX_DEG},${lat - BOX_DEG}`;
  const url = (
    `${NOMINATIM}?amenity=${amenity}` +
    `&format=json&countrycodes=za&bounded=1` +
    `&viewbox=${viewbox}&limit=50` +
    `&addressdetails=1&extratags=1`
  );

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('User-Agent', 'NcedoCare/1.0 healthcare-triage-app');
    xhr.timeout = 15000;
    xhr.ontimeout = () => reject(new Error('Timeout'));
    xhr.onerror  = () => reject(new Error('Network error'));
    xhr.onload   = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try   { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid response')); }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.send();
  });
}

function nominatimTextSearch(query) {
  const url = (
    `${NOMINATIM}?q=${encodeURIComponent(`${query} hospital clinic pharmacy South Africa`)}` +
    `&format=json&countrycodes=za&limit=40` +
    `&addressdetails=1&extratags=1`
  );

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('User-Agent', 'NcedoCare/1.0 healthcare-triage-app');
    xhr.timeout = 15000;
    xhr.ontimeout = () => reject(new Error('Timeout'));
    xhr.onerror  = () => reject(new Error('Network error'));
    xhr.onload   = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const places = JSON.parse(xhr.responseText);
          resolve(places.filter(p => {
            const addr = p.address || {};
            if (addr.amenity) return true;
            return p.class === 'amenity' && AMENITY_MAP[p.type];
          }));
        } catch { reject(new Error('Invalid response')); }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.send();
  });
}

// ── Parse Nominatim results into app facility objects ─────────────────────────
function parseNominatimResults(allPlaces, userLat, userLng) {
  const seen = new Set();
  return allPlaces
    .map(place => {
      const addr  = place.address || {};
      const name  = addr.amenity
        || (place.display_name || '').split(',')[0].trim();
      if (!name) return null;

      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const dist = haversine(userLat, userLng, lat, lng);
      const addrParts = [addr.road, addr.suburb, addr.city || addr.town].filter(Boolean);

      return {
        id:        `${place.osm_type || 'n'}${place.osm_id || place.place_id}`,
        name,
        lat,
        lng,
        type:      AMENITY_MAP[place.type] || 'clinic',
        ownership: guessOwnership(name, place.extratags),
        address:   addrParts.join(', ') || 'South Africa',
        phone:     place.extratags?.phone || place.extratags?.['contact:phone'] || '',
        distance:  dist,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FacilitySelectionScreen({ navigation }) {
  const [locationStatus, setLocationStatus] = useState('loading');
  const [userLocation,   setUserLocation]   = useState(null);
  const [facilities,     setFacilities]     = useState([]);
  const [filtered,       setFiltered]       = useState([]);
  const [search,         setSearch]         = useState('');
  const [typeFilter,     setTypeFilter]     = useState('all');
  const [ownerFilter,    setOwnerFilter]    = useState('all');
  const [fetching,       setFetching]       = useState(false);
  const [searching,      setSearching]      = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [apiError,       setApiError]       = useState(null);
  const [remoteResults,  setRemoteResults]  = useState(null);
  const searchRef   = useRef(null);
  const inFlightRef = useRef(false);
  const searchTimerRef = useRef(null);
  const searchReqRef   = useRef(0);

  useEffect(() => { requestLocation(); }, []);

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else replacePatientTab('home');
  };

  const requestLocation = async () => {
    setLocationStatus('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationStatus('denied'); return; }
      const pos    = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(coords);
      setLocationStatus('granted');
      fetchFacilities(coords);
    } catch {
      setLocationStatus('denied');
    }
  };

  // ── Fetch from Nominatim (4 amenity types in parallel) ───────────────────
  const fetchFacilities = useCallback(async (coords, isRefresh = false) => {
    if (!coords || inFlightRef.current) return;
    inFlightRef.current = true;
    isRefresh ? setRefreshing(true) : setFetching(true);
    if (!isRefresh) setApiError(null);

    try {
      const amenities = ['hospital', 'clinic', 'doctors', 'pharmacy'];
      const results   = await Promise.allSettled(
        amenities.map(a => nominatimFetch(a, coords.lat, coords.lng))
      );

      const allPlaces = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

      results
        .filter(r => r.status === 'rejected')
        .forEach(r => console.warn('[Nominatim]', r.reason?.message));

      const parsed = parseNominatimResults(allPlaces, coords.lat, coords.lng);
      setFacilities(parsed);

      if (!isRefresh && parsed.length === 0 && allPlaces.length === 0) {
        setApiError('No healthcare facilities found nearby.\n\nCheck your internet connection and try again.');
      }
    } catch (err) {
      console.warn('[Nominatim] fetch error:', err.message);
      if (!isRefresh) {
        setApiError(`Could not load nearby facilities.\n${err.message}`);
      } else {
        Alert.alert('Refresh failed', 'Could not refresh facilities. Your previous results are still shown.');
      }
    } finally {
      setFetching(false);
      setRefreshing(false);
      inFlightRef.current = false;
    }
  }, []);

  // ── Live Nominatim text search while typing ───────────────────────────────
  useEffect(() => {
    const q = search.trim();

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (q.length < 2) {
      setRemoteResults(null);
      setSearching(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      const reqId = ++searchReqRef.current;
      setSearching(true);

      try {
        const places = await nominatimTextSearch(q);
        if (reqId !== searchReqRef.current) return;

        const origin = userLocation || { lat: -26.2041, lng: 28.0473 };
        const parsed = parseNominatimResults(places, origin.lat, origin.lng);
        setRemoteResults(parsed);
      } catch (err) {
        if (reqId !== searchReqRef.current) return;
        console.warn('[Nominatim] text search:', err.message);
        setRemoteResults([]);
      } finally {
        if (reqId === searchReqRef.current) setSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, userLocation]);

  // ── Client-side filter + search ───────────────────────────────────────────
  useEffect(() => {
    const source = search.trim().length >= 2 && remoteResults != null ? remoteResults : facilities;
    let results = source;
    if (typeFilter  !== 'all') results = results.filter(f => f.type      === typeFilter);
    if (ownerFilter !== 'all') results = results.filter(f => f.ownership === ownerFilter);
    if (search.trim().length >= 2 && remoteResults == null) {
      const q = search.trim().toLowerCase();
      results = results.filter(
        f => f.name.toLowerCase().includes(q) || f.address.toLowerCase().includes(q)
      );
    }
    setFiltered(results);
  }, [facilities, remoteResults, typeFilter, ownerFilter, search]);

  const handleSelect = facility => {
    Keyboard.dismiss();
    navigation.navigate('FacilityWelcome', { facility, userLocation });
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderFacility = ({ item, index }) => {
    const cfg     = TYPE_CONFIG[item.type] || TYPE_CONFIG.clinic;
    const dist    = item.distance < 999 ? distanceLabel(item.distance) : null;
    const distCol = item.distance < 999 ? distanceColor(item.distance) : COLORS.textTertiary;
    const isNearest = index === 0 && !search.trim() && typeFilter === 'all' && ownerFilter === 'all';

    return (
      <TouchableOpacity
        style={[styles.facilityCard, isNearest && styles.facilityCardFeatured]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.88}>
        {isNearest && (
          <View style={styles.nearestRibbon}>
            <Ionicons name="star" size={10} color="#FFFFFF" />
            <Text style={styles.nearestRibbonText}>Nearest to you</Text>
          </View>
        )}

        <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />

        <LinearGradient
          colors={[cfg.bg, '#FFFFFF']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.facilityIconBox}>
          <Ionicons name={cfg.icon} size={24} color={cfg.color} />
        </LinearGradient>

        <View style={styles.facilityInfo}>
          <Text style={styles.facilityName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.facilityMeta}>
            <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <View style={[styles.badge, {
              backgroundColor: item.ownership === 'private' ? COLORS.infoLight : COLORS.lowLight,
            }]}>
              <Text style={[styles.badgeText, {
                color: item.ownership === 'private' ? COLORS.info : COLORS.low,
              }]}>
                {item.ownership === 'private' ? 'Private' : 'Public'}
              </Text>
            </View>
          </View>
          {item.address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textTertiary} />
              <Text style={styles.facilityAddress} numberOfLines={1}>{item.address}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.facilityRight}>
          {dist ? (
            <View style={[styles.distPill, { backgroundColor: `${distCol}18` }]}>
              <Text style={[styles.distValue, { color: distCol }]}>{dist}</Text>
            </View>
          ) : null}
          <View style={styles.chevronCircle}>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <>
      <View style={styles.heroHint}>
        <Ionicons name="navigate-circle" size={18} color={COLORS.primary} />
        <Text style={styles.heroHintText}>
          Choose a facility near you to connect your care journey
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <LinearGradient
          colors={['#FFFFFF', COLORS.primaryVeryLight]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.searchGradient}>
          <Ionicons name="search" size={18} color={COLORS.primary} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Search hospitals, clinics, area..."
            placeholderTextColor={COLORS.textTertiary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
          {searching && (
            <ActivityIndicator size="small" color={COLORS.primary} />
          )}
        </LinearGradient>
      </View>

      <Text style={styles.filterLabel}>Filter by type</Text>
      <View style={styles.filterRow}>
        {FACILITY_TYPES.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.filterChip, typeFilter === t.id && styles.filterChipActive]}
            onPress={() => setTypeFilter(t.id)}>
            <Ionicons
              name={t.icon}
              size={13}
              color={typeFilter === t.id ? '#FFFFFF' : COLORS.textSecondary}
            />
            <Text style={[styles.filterChipText, typeFilter === t.id && styles.filterChipTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.filterRow, styles.ownerRow]}>
        {OWNERSHIP_TYPES.map(o => (
          <TouchableOpacity
            key={o.id}
            style={[styles.ownerChip, ownerFilter === o.id && styles.ownerChipActive]}
            onPress={() => setOwnerFilter(o.id)}>
            <Text style={[styles.ownerChipText, ownerFilter === o.id && styles.ownerChipTextActive]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
        {filtered.length > 0 && (
          <View style={styles.resultPill}>
            <Text style={styles.resultCount}>
              {search.trim().length >= 2 ? `${filtered.length} found` : `${filtered.length} nearby`}
            </Text>
          </View>
        )}
      </View>
    </>
  );

  if (locationStatus === 'loading') {
    return (
      <View style={styles.container}>
        <ScreenHeader onBack={handleBack} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.stateTitle}>Getting your location...</Text>
          <Text style={styles.stateSub}>Only used to find facilities near you</Text>
        </View>
      </View>
    );
  }

  if (locationStatus === 'denied') {
    return (
      <View style={styles.container}>
        <ScreenHeader onBack={handleBack} />
        <View style={styles.centered}>
          <View style={styles.stateIcon}>
            <Ionicons name="location-outline" size={40} color={COLORS.textTertiary} />
          </View>
          <Text style={styles.stateTitle}>Location access needed</Text>
          <Text style={styles.stateSub}>
            NcedoCare uses your location only to show nearby facilities. It is not stored or shared.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={requestLocation}>
            <Text style={styles.retryBtnText}>Allow Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} translucent />
      <ScreenHeader
        onBack={handleBack}
        subtitle="Within 14 km of your location"
      />

      {fetching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.stateTitle}>Finding nearby facilities...</Text>
          <Text style={styles.stateSub}>Searching hospitals, clinics, pharmacies...</Text>
        </View>
      ) : apiError ? (
        <View style={styles.centered}>
          <View style={styles.stateIcon}>
            <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textTertiary} />
          </View>
          <Text style={styles.stateTitle}>Could not load facilities</Text>
          <Text style={styles.stateSub}>{apiError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchFacilities(userLocation)}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderFacility}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchFacilities(userLocation, true)}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={40} color={COLORS.textTertiary} />
              <Text style={styles.stateTitle}>No facilities found</Text>
              <Text style={styles.stateSub}>
                {search.trim().length >= 2
                  ? searching
                    ? 'Searching OpenStreetMap...'
                    : 'Try a different search term or clear the filter'
                  : 'No facilities found within 14 km. Pull down to refresh.'}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
    </View>
  );
}

function ScreenHeader({ onBack, subtitle, count }) {
  return (
    <LinearGradient
      colors={['#1E3A8A', COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.header}>
      <View style={styles.headerDeco1} />
      <View style={styles.headerDeco2} />

      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <View style={styles.backBtnInner}>
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      <View style={styles.headerText}>
        <Text style={styles.headerEyebrow}>Healthcare near you</Text>
        <Text style={styles.headerTitle}>Find your facility</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>

      <View style={styles.locationPill}>
        <Ionicons name="location" size={18} color="#FFFFFF" />
      </View>
    </LinearGradient>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop:    Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 24, paddingHorizontal: 20,
    position: 'relative', overflow: 'hidden',
  },
  headerDeco1: {
    position: 'absolute', top: -30, right: -20,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerDeco2: {
    position: 'absolute', bottom: -40, left: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  backBtn:     { zIndex: 2 },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText:  { flex: 1, zIndex: 2 },
  headerEyebrow: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: '500' },
  locationPill:{
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },

  listContent: { paddingTop: 8, paddingHorizontal: 18, paddingBottom: 8 },

  heroHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.primaryGlow,
    ...cardShadow,
  },
  heroHintText: {
    flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, lineHeight: 18,
  },

  searchWrap: { marginBottom: 16, borderRadius: 16, overflow: 'hidden', ...cardShadow },
  searchGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, height: 54,
    borderWidth: 1.5, borderColor: COLORS.primaryGlow, borderRadius: 16,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary, fontWeight: '500' },

  filterLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 4,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  ownerRow: { marginBottom: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.border,
  },
  filterChipActive:     { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  filterChipTextActive: { color: '#FFFFFF' },

  ownerChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.border,
  },
  ownerChipActive:     { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  ownerChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  ownerChipTextActive: { color: COLORS.primary },
  resultPill: {
    marginLeft: 'auto', alignSelf: 'center',
    backgroundColor: COLORS.primaryVeryLight,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  resultCount: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },

  facilityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.borderLight,
    position: 'relative', overflow: 'hidden',
    ...cardShadow,
  },
  facilityCardFeatured: {
    borderColor: COLORS.primaryGlow,
    borderWidth: 1.5,
  },
  nearestRibbon: {
    position: 'absolute', top: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10, paddingVertical: 5,
    borderBottomLeftRadius: 14,
    zIndex: 1,
  },
  nearestRibbonText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  cardAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
  },
  facilityIconBox: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginLeft: 6,
  },
  facilityInfo:    { flex: 1, gap: 6, paddingRight: 4 },
  facilityName:    { fontSize: 15, fontWeight: '900', color: COLORS.textPrimary, lineHeight: 20 },
  facilityMeta:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:       { fontSize: 10, fontWeight: '800' },
  addressRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  facilityAddress: { flex: 1, fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  facilityRight:   { alignItems: 'center', gap: 8, minWidth: 48 },
  distPill:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  distValue:       { fontSize: 13, fontWeight: '900' },
  chevronCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center', justifyContent: 'center',
  },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  stateIcon: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.borderLight,
    ...cardShadow,
  },
  stateTitle: { fontSize: 20, fontWeight: '900', color: COLORS.textPrimary, textAlign: 'center' },
  stateSub:   { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  retryBtn:   {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  retryBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  emptyWrap:    { paddingTop: 48, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
});
