// src/screens/main/FacilitySelectionScreen.js
// NcedoCare — Facility selection via Nominatim (OpenStreetMap geocoding API).
// Free, no key required. Nominatim is OSM's official search API for apps.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Platform, StatusBar, ActivityIndicator,
  RefreshControl, Keyboard, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';      
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  openFacilityWelcome,
  goBackOrHome,
} from '../../navigation/openPatientTab';
import { COLORS } from '../../constants/colors';
import { FacilityRegistryService } from '../../services/FacilityRegistryService';

// ── OSM APIs ──────────────────────────────────────────────────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS  = 'https://overpass-api.de/api/interpreter';
const BOX_DEG   = 0.13; // ~14 km bounding box at SA latitudes
const USER_AGENT = 'NcedoCare/1.0 healthcare-triage-app';

let nearbyCache = { key: '', places: [] };

function nearbyCacheKey(lat, lng) {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
}

function xhrGetJson(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('User-Agent', USER_AGENT);
    xhr.timeout = timeout;
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

const REGISTRATION_TYPES = [
  { id: 'all',          label: 'All'            },
  { id: 'registered',   label: 'Registered'     },
  { id: 'unregistered', label: 'Not registered' },
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

  return xhrGetJson(url, 15000);
}

function isHealthcarePlace(place) {
  const type = String(place.type || '').toLowerCase();
  const cls = String(place.class || '').toLowerCase();
  const extra = place.extratags || {};
  const addr = place.address || {};
  if (AMENITY_MAP[type]) return true;
  if (addr.amenity && AMENITY_MAP[String(addr.amenity).toLowerCase()]) return true;
  if (cls === 'healthcare' || extra.healthcare) return true;
  if (['hospital', 'clinic', 'doctors', 'pharmacy', 'dentist', 'doctors_office'].includes(type)) return true;
  const hay = `${place.display_name || ''} ${type} ${cls}`.toLowerCase();
  return /\b(hospital|clinic|pharmacy|medical centre|medical center|day hospital)\b/.test(hay);
}

function nominatimCountrySearch(query) {
  const q = encodeURIComponent(query);
  const url = (
    `${NOMINATIM}?q=${q}` +
    `&format=json&countrycodes=za&limit=50` +
    `&addressdetails=1&extratags=1&dedupe=1`
  );
  return xhrGetJson(url, 15000).then((places) =>
    (Array.isArray(places) ? places : []).filter(isHealthcarePlace)
  );
}

async function nominatimTextSearch(query) {
  const term = String(query || '').trim();
  if (!term) return [];
  const results = await Promise.allSettled([
    nominatimCountrySearch(term),
    nominatimCountrySearch(`${term} hospital`),
    nominatimCountrySearch(`${term} clinic`),
  ]);
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || []);
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
      const addrParts = [
        addr.road,
        addr.suburb,
        addr.city || addr.town || addr.village,
        addr.state,
      ].filter(Boolean);

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

function parseOverpassResults(elements, userLat, userLng) {
  const seen = new Set();
  return (elements || [])
    .map((el) => {
      const tags = el.tags || {};
      const amenity = tags.amenity;
      if (!AMENITY_MAP[amenity]) return null;
      const name = tags.name || tags['name:en'] || amenity;
      if (!name) return null;

      const lat = parseFloat(el.lat ?? el.center?.lat);
      const lng = parseFloat(el.lon ?? el.center?.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

      const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const addrParts = [tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean);
      return {
        id: `${el.type === 'way' ? 'w' : 'n'}${el.id}`,
        name,
        lat,
        lng,
        type: AMENITY_MAP[amenity] || 'clinic',
        ownership: guessOwnership(name, tags),
        address: addrParts.join(', ') || tags['addr:full'] || 'South Africa',
        phone: tags.phone || tags['contact:phone'] || '',
        distance: haversine(userLat, userLng, lat, lng),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}

async function overpassNearby(lat, lng) {
  const s = lat - BOX_DEG;
  const n = lat + BOX_DEG;
  const w = lng - BOX_DEG;
  const e = lng + BOX_DEG;
  const query = `[out:json][timeout:8];(node["amenity"~"hospital|clinic|doctors|pharmacy"](${s},${w},${n},${e});way["amenity"~"hospital|clinic|doctors|pharmacy"](${s},${w},${n},${e}););out center tags;`;
  const data = await xhrGetJson(`${OVERPASS}?data=${encodeURIComponent(query)}`, 9000);
  return parseOverpassResults(data?.elements, lat, lng);
}

async function nominatimNearbyParallel(lat, lng) {
  const amenities = ['hospital', 'clinic', 'doctors', 'pharmacy'];
  const results = await Promise.allSettled(
    amenities.map((a) => nominatimFetch(a, lat, lng))
  );
  const allPlaces = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || []);
  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.warn('[Nominatim]', r.reason?.message));
  return parseNominatimResults(allPlaces, lat, lng);
}

function FacilitySearchBar({
  search,
  onChangeSearch,
  searching,
  searchRef,
  searchFocused,
  onSearchFocus,
  onSearchBlur,
  onDismissKeyboard,
}) {
  return (
    <View style={styles.searchSticky}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.primary} />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Search any hospital in South Africa..."
          placeholderTextColor={COLORS.textTertiary}
          value={search}
          onChangeText={onChangeSearch}
          onFocus={onSearchFocus}
          onBlur={onSearchBlur}
          onSubmitEditing={onDismissKeyboard}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          blurOnSubmit
          returnKeyType="search"
          keyboardType={Platform.OS === 'ios' ? 'web-search' : 'default'}
          enablesReturnKeyAutomatically
          accessibilityLabel="Search facilities"
        />
        {searching ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
        {search.length > 0 ? (
          <TouchableOpacity
            onPress={() => onChangeSearch('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
          </TouchableOpacity>
        ) : null}
        {searchFocused ? (
          <TouchableOpacity
            onPress={onDismissKeyboard}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.keyboardDismissBtn}
            accessibilityLabel="Close keyboard">
            <Text style={styles.keyboardDismissText}>Done</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function FacilityFilterRows({
  typeFilter,
  onTypeFilter,
  registryFilter,
  onRegistryFilter,
  ownerFilter,
  onOwnerFilter,
  resultLabel,
  searchingNationwide,
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterCaption}>
        {searchingNationwide
          ? 'Searching hospitals across South Africa'
          : 'Nearby within 14 km · search nationwide'}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}>
        {FACILITY_TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.filterChip, typeFilter === t.id && styles.filterChipActive]}
            onPress={() => onTypeFilter(t.id)}>
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
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}>
        {REGISTRATION_TYPES.map((r) => {
          const active = registryFilter === r.id;
          const registeredActive = active && r.id === 'registered';
          const unregisteredActive = active && r.id === 'unregistered';
          return (
            <TouchableOpacity
              key={r.id}
              style={[
                styles.ownerChip,
                active && styles.ownerChipActive,
                registeredActive && styles.registryChipRegistered,
                unregisteredActive && styles.registryChipUnregistered,
              ]}
              onPress={() => onRegistryFilter(r.id)}>
              {r.id === 'registered' ? (
                <Ionicons name="checkmark-circle" size={13} color={active ? COLORS.success : COLORS.textSecondary} />
              ) : r.id === 'unregistered' ? (
                <Ionicons name="flag" size={12} color={active ? COLORS.error : COLORS.textSecondary} />
              ) : null}
              <Text style={[
                styles.ownerChipText,
                active && styles.ownerChipTextActive,
                registeredActive && { color: COLORS.success },
                unregisteredActive && { color: COLORS.error },
              ]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.ownerRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={styles.ownerScroll}
          contentContainerStyle={styles.filterScrollContent}>
          {OWNERSHIP_TYPES.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.ownerChip, ownerFilter === o.id && styles.ownerChipActive]}
              onPress={() => onOwnerFilter(o.id)}>
              <Text style={[styles.ownerChipText, ownerFilter === o.id && styles.ownerChipTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {resultLabel ? (
          <View style={styles.resultPill}>
            <Text style={styles.resultCount}>{resultLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FacilitySelectionScreen() {
  const [locationStatus, setLocationStatus] = useState('loading');
  const [userLocation,   setUserLocation]   = useState(null);
  const [facilities,     setFacilities]     = useState(nearbyCache.places || []);
  const [filtered,       setFiltered]       = useState([]);
  const [search,         setSearch]         = useState('');
  const [typeFilter,     setTypeFilter]     = useState('all');
  const [ownerFilter,    setOwnerFilter]    = useState('all');
  const [registryFilter, setRegistryFilter] = useState('all');
  const [fetching,       setFetching]       = useState(false);
  const [searching,      setSearching]      = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);
  const [apiError,       setApiError]       = useState(null);
  const [remoteResults,  setRemoteResults]  = useState(null);
  const [searchFocused,  setSearchFocused]  = useState(false);
  const searchRef   = useRef(null);
  const inFlightRef = useRef(false);
  const searchTimerRef = useRef(null);
  const searchReqRef   = useRef(0);

  useEffect(() => { requestLocation(); }, []);

  const handleBack = () => {
    goBackOrHome();
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

  const applyPlaces = useCallback((places) => {
    const list = places || [];
    setFacilities(list);
    nearbyCache = { key: nearbyCache.key, places: list };
    FacilityRegistryService.annotatePlacesAsync(list).then((annotated) => {
      setFacilities(annotated);
      nearbyCache = { key: nearbyCache.key, places: annotated };
    });
  }, []);

  // ── Nearby fetch: Nominatim first (fast), Overpass only if empty ───────────
  const fetchFacilities = useCallback(async (coords, isRefresh = false) => {
    if (!coords || inFlightRef.current) return;
    inFlightRef.current = true;

    const key = nearbyCacheKey(coords.lat, coords.lng);
    const cached = nearbyCache.key === key && nearbyCache.places.length > 0
      ? nearbyCache.places
      : [];

    if (cached.length && !isRefresh) {
      setFacilities(cached);
      setFetching(false);
    } else if (!isRefresh) {
      setFetching(true);
    } else {
      setRefreshing(true);
    }
    if (!isRefresh) setApiError(null);

    try {
      let parsed = await nominatimNearbyParallel(coords.lat, coords.lng);
      if (!parsed.length) {
        try {
          parsed = await overpassNearby(coords.lat, coords.lng);
        } catch (overpassErr) {
          console.warn('[Overpass]', overpassErr.message);
        }
      }

      if (parsed.length > 0) {
        nearbyCache = { key, places: parsed };
        applyPlaces(parsed);
        setApiError(null);
      } else if (cached.length > 0) {
        applyPlaces(cached);
      } else {
        setApiError('No healthcare facilities found nearby.\n\nCheck your internet connection and try again.');
      }
    } catch (err) {
      console.warn('[Nearby] fetch error:', err.message);
      if (cached.length > 0) {
        applyPlaces(cached);
      } else if (!isRefresh) {
        const rateLimited = String(err.message).includes('429');
        setApiError(
          rateLimited
            ? 'The map service is busy. Wait a few seconds and try again.'
            : `Could not load nearby facilities.\n${err.message}`
        );
      } else {
        Alert.alert('Refresh failed', 'Could not refresh facilities. Your previous results are still shown.');
      }
    } finally {
      setFetching(false);
      setRefreshing(false);
      inFlightRef.current = false;
    }
  }, [applyPlaces]);

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
        const annotated = await FacilityRegistryService.annotatePlacesAsync(parsed);
        if (reqId !== searchReqRef.current) return;
        setRemoteResults(annotated);
      } catch (err) {
        if (reqId !== searchReqRef.current) return;
        console.warn('[Nominatim] text search:', err.message);
        setRemoteResults(null);
      } finally {
        if (reqId === searchReqRef.current) setSearching(false);
      }
    }, 280);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, userLocation]);

  // ── Client-side filter + search ───────────────────────────────────────────
  useEffect(() => {
    const q = search.trim().toLowerCase();
    const matchesQuery = (f) =>
      !q || f.name.toLowerCase().includes(q) || (f.address || '').toLowerCase().includes(q);

    let results;
    if (q) {
      const localHits = facilities.filter(matchesQuery);
      if (remoteResults?.length) {
        const seen = new Set(localHits.map((f) => f.id));
        results = [...localHits];
        remoteResults.forEach((f) => {
          if (!seen.has(f.id)) {
            seen.add(f.id);
            results.push(f);
          }
        });
      } else {
        results = localHits;
      }
    } else {
      results = facilities;
    }

    if (typeFilter  !== 'all') results = results.filter(f => f.type      === typeFilter);
    if (ownerFilter !== 'all') results = results.filter(f => f.ownership === ownerFilter);
    if (registryFilter === 'registered') {
      results = results.filter(f => f.isRegistered === true);
    } else if (registryFilter === 'unregistered') {
      results = results.filter(f => f.isRegistered !== true);
    }
    setFiltered(results);
  }, [facilities, remoteResults, typeFilter, ownerFilter, registryFilter, search]);

  const dismissSearchKeyboard = useCallback(() => {
    searchRef.current?.blur();
    Keyboard.dismiss();
    setSearchFocused(false);
  }, []);

  const handleSelect = (facility) => {
    dismissSearchKeyboard();
    openFacilityWelcome(facility, userLocation);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderFacility = ({ item, index }) => {
    const cfg     = TYPE_CONFIG[item.type] || TYPE_CONFIG.clinic;
    const dist    = item.distance < 999 ? distanceLabel(item.distance) : null;
    const distCol = item.distance < 999 ? distanceColor(item.distance) : COLORS.textTertiary;
    const isNearest = index === 0 && !search.trim() && typeFilter === 'all' && ownerFilter === 'all' && registryFilter === 'all';
    const unregistered = item.isRegistered !== true;

    return (
      <TouchableOpacity
        style={[
          styles.facilityCard,
          isNearest && !unregistered && styles.facilityCardFeatured,
          unregistered && styles.facilityCardUnregistered,
        ]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.88}>
        {isNearest && !unregistered && (
          <View style={styles.nearestRibbon}>
            <Ionicons name="star" size={10} color="#FFFFFF" />
            <Text style={styles.nearestRibbonText}>Nearest to you</Text>
          </View>
        )}

        <View style={[styles.cardAccent, { backgroundColor: unregistered ? COLORS.error : cfg.color }]} />

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
            {unregistered ? (
              <View style={styles.unregisteredBadge}>
                <Ionicons name="flag" size={10} color={COLORS.error} />
                <Text style={styles.unregisteredBadgeText}>Not registered yet</Text>
              </View>
            ) : (
              <View style={styles.registeredBadge}>
                <Ionicons name="checkmark-circle" size={10} color={COLORS.success} />
                <Text style={styles.registeredBadgeText}>On NcedoCare</Text>
              </View>
            )}
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

  const listHeader = (
    <FacilityFilterRows
      typeFilter={typeFilter}
      onTypeFilter={setTypeFilter}
      registryFilter={registryFilter}
      onRegistryFilter={setRegistryFilter}
      ownerFilter={ownerFilter}
      onOwnerFilter={setOwnerFilter}
      searchingNationwide={Boolean(search.trim())}
      resultLabel={
        filtered.length > 0
          ? (search.trim() ? `${filtered.length} found` : `${filtered.length} nearby`)
          : ''
      }
    />
  );

  // Kept so Fast Refresh from earlier edits does not crash on a stale render.
  const renderSearchAndFilters = () => listHeader;

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
        subtitle="Nearby 14 km · search all of South Africa"
      />

      {fetching && facilities.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.stateTitle}>Finding nearby facilities...</Text>
          <Text style={styles.stateSub}>Searching hospitals, clinics, pharmacies...</Text>
        </View>
      ) : apiError && facilities.length === 0 ? (
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
        <View style={styles.listWrap}>
          <FacilitySearchBar
            search={search}
            onChangeSearch={setSearch}
            searching={searching}
            searchRef={searchRef}
            searchFocused={searchFocused}
            onSearchFocus={() => setSearchFocused(true)}
            onSearchBlur={() => setSearchFocused(false)}
            onDismissKeyboard={dismissSearchKeyboard}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderFacility}
            ListHeaderComponent={renderSearchAndFilters()}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
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
                {search.trim()
                  ? searching
                    ? 'Searching hospitals across South Africa...'
                    : 'Try the hospital name, suburb, or city'
                  : 'No facilities found within 14 km. Pull down to refresh, or search nationwide.'}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 40 }} />}
          />
        </View>
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

  listWrap: { flex: 1 },
  listContent: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 8 },

  searchSticky: {
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: COLORS.primaryGlow, borderRadius: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary, fontWeight: '500', paddingVertical: 0 },
  keyboardDismissBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    backgroundColor: COLORS.primaryVeryLight,
  },
  keyboardDismissText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  filterBlock: { paddingBottom: 4 },
  filterCaption: {
    fontSize: 12, fontWeight: '600', color: COLORS.textTertiary,
    marginBottom: 10, marginLeft: 2, lineHeight: 16,
  },
  filterScroll: { marginBottom: 8, marginHorizontal: -4 },
  filterScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingRight: 12 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  ownerScroll: { flex: 1, marginHorizontal: -4 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.border,
  },
  filterChipActive:     { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  filterChipTextActive: { color: '#FFFFFF' },

  ownerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.border,
  },
  ownerChipActive:     { backgroundColor: COLORS.primaryVeryLight, borderColor: COLORS.primary },
  ownerChipText:       { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  ownerChipTextActive: { color: COLORS.primary },
  registryChipRegistered:   { backgroundColor: COLORS.successLight, borderColor: COLORS.success },
  registryChipUnregistered: { backgroundColor: COLORS.errorLight, borderColor: COLORS.error },
  resultPill: {
    flexShrink: 0, alignSelf: 'center',
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
  facilityCardUnregistered: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFCFC',
  },
  unregisteredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: COLORS.errorLight,
  },
  unregisteredBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.error },
  registeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: COLORS.successLight,
  },
  registeredBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.success },
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
