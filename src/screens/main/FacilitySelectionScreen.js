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
  const [refreshing,     setRefreshing]     = useState(false);
  const [apiError,       setApiError]       = useState(null);
  const searchRef   = useRef(null);
  const inFlightRef = useRef(false);

  useEffect(() => { requestLocation(); }, []);

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
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

  // ── Client-side filter + search ───────────────────────────────────────────
  useEffect(() => {
    let results = facilities;
    if (typeFilter  !== 'all') results = results.filter(f => f.type      === typeFilter);
    if (ownerFilter !== 'all') results = results.filter(f => f.ownership === ownerFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(
        f => f.name.toLowerCase().includes(q) || f.address.toLowerCase().includes(q)
      );
    }
    setFiltered(results);
  }, [facilities, typeFilter, ownerFilter, search]);

  const handleSelect = facility => {
    Keyboard.dismiss();
    navigation.navigate('FacilityWelcome', { facility, userLocation });
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderFacility = ({ item }) => {
    const cfg     = TYPE_CONFIG[item.type] || TYPE_CONFIG.clinic;
    const dist    = item.distance < 999 ? distanceLabel(item.distance) : null;
    const distCol = item.distance < 999 ? distanceColor(item.distance) : COLORS.textTertiary;

    return (
      <TouchableOpacity style={styles.facilityCard} onPress={() => handleSelect(item)} activeOpacity={0.82}>
        <View style={[styles.facilityIconBox, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={styles.facilityInfo}>
          <Text style={styles.facilityName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.facilityMeta}>
            <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {item.ownership === 'private' && (
              <View style={[styles.badge, { backgroundColor: COLORS.infoLight }]}>
                <Text style={[styles.badgeText, { color: COLORS.info }]}>Private</Text>
              </View>
            )}
          </View>
          {item.address ? (
            <Text style={styles.facilityAddress} numberOfLines={1}>{item.address}</Text>
          ) : null}
        </View>
        <View style={styles.facilityRight}>
          {dist ? (
            <>
              <Text style={[styles.distValue, { color: distCol }]}>{dist}</Text>
              <Text style={styles.distLabel}>away</Text>
            </>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} style={{ marginTop: 4 }} />
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Search by name or area..."
          placeholderTextColor={COLORS.textTertiary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {FACILITY_TYPES.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.filterChip, typeFilter === t.id && styles.filterChipActive]}
            onPress={() => setTypeFilter(t.id)}>
            <Ionicons name={t.icon} size={12} color={typeFilter === t.id ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.filterChipText, typeFilter === t.id && styles.filterChipTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.filterRow, { marginBottom: 6 }]}>
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
          <Text style={styles.resultCount}>{filtered.length} found</Text>
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
                {search
                  ? 'Try a different search term or clear the filter'
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

function ScreenHeader({ onBack, subtitle }) {
  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>Select a Facility</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>
      <View style={styles.locationPill}>
        <Ionicons name="location" size={16} color="#FFFFFF" />
      </View>
    </LinearGradient>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop:    Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 0) + 16,
    paddingBottom: 20, paddingHorizontal: 20,
  },
  backBtn:     { padding: 6 },
  headerText:  { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4 },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.68)', marginTop: 2 },
  locationPill:{
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  listContent: { paddingTop: 16, paddingHorizontal: 20 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 50, marginBottom: 14, ...cardShadow,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.border,
  },
  filterChipActive:     { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  filterChipText:       { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.primary },

  ownerChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.border,
  },
  ownerChipActive:     { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  ownerChipText:       { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  ownerChipTextActive: { color: COLORS.primary },
  resultCount:         { marginLeft: 'auto', fontSize: 12, color: COLORS.textTertiary, fontWeight: '500', alignSelf: 'center' },

  facilityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.borderLight, ...cardShadow,
  },
  facilityIconBox: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  facilityInfo:    { flex: 1, gap: 4 },
  facilityName:    { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, lineHeight: 18 },
  facilityMeta:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:           { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeText:       { fontSize: 10, fontWeight: '700' },
  facilityAddress: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '500' },
  facilityRight:   { alignItems: 'center', gap: 2, minWidth: 44 },
  distValue:       { fontSize: 14, fontWeight: '800' },
  distLabel:       { fontSize: 10, color: COLORS.textTertiary, fontWeight: '500' },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  stateIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: COLORS.backgroundTertiary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  stateTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  stateSub:   { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:   {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 13, marginTop: 8,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  emptyWrap:    { paddingTop: 40, alignItems: 'center', gap: 10, paddingHorizontal: 20 },
});
