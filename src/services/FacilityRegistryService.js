// Matches nearby OSM facilities to hospitals registered on NcedoCare (Firestore).
// Registered = facilities/{id} with hasAdmin or isRegistered set by the staff portal.

import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { COLLECTIONS } from './firestorePaths';

const CACHE_MS = 5 * 60 * 1000;
const NAME_MATCH_KM = 3;

const TYPE_WORDS = new Set([
  'hospital', 'clinic', 'medical', 'centre', 'center', 'private', 'public',
  'district', 'provincial', 'academic', 'day', 'health', 'healthcare',
  'the', 'of', 'and', 'hospitality',
]);

let _cache = null;
let _cachedAt = 0;

function isRegisteredDoc(data) {
  if (!data) return false;
  return data.hasAdmin === true || data.isRegistered === true;
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distinctiveName(name) {
  const tokens = normalizeName(name)
    .split(' ')
    .filter((t) => t && !TYPE_WORDS.has(t));
  return tokens.join(' ').trim();
}

function namesMatch(a, b) {
  const fullA = normalizeName(a);
  const fullB = normalizeName(b);
  if (!fullA || !fullB) return false;
  if (fullA === fullB) return true;

  const distA = distinctiveName(a);
  const distB = distinctiveName(b);
  if (distA && distB && distA === distB) return true;
  if (distA.length >= 8 && distB.length >= 8 && (distA.includes(distB) || distB.includes(distA))) {
    return true;
  }
  return false;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function toRegistryItem(id, data) {
  return {
    id,
    facilityId: data.facilityId || id,
    name: data.name || '',
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    address: data.address || '',
    type: data.type || '',
    ownership: data.ownership || '',
  };
}

function pickClosest(hits, place) {
  if (hits.length === 1) return hits[0];
  if (place?.lat == null || place?.lng == null) return hits[0];
  return hits
    .filter((h) => h.lat != null && h.lng != null)
    .map((h) => ({ h, km: haversineKm(place.lat, place.lng, h.lat, h.lng) }))
    .sort((a, b) => a.km - b.km)[0]?.h || hits[0];
}

export const FacilityRegistryService = {
  async getRegisteredFacilities(force = false) {
    if (!force && _cache && Date.now() - _cachedAt < CACHE_MS) return _cache;

    const snap = await getDocs(collection(firestore, COLLECTIONS.FACILITIES));
    const list = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (!isRegisteredDoc(data)) return;
      list.push(toRegistryItem(docSnap.id, data));
    });

    _cache = list;
    _cachedAt = Date.now();
    return list;
  },

  matchPlace(place, registry) {
    if (!place || !registry?.length) return null;

    const placeId = place.id || place.facilityId || place.registeredId;
    const byId = registry.find((r) =>
      r.id === placeId || r.facilityId === placeId
    );
    if (byId) return byId;

    const nameHits = registry.filter((r) => namesMatch(r.name, place.name || place.facilityName));
    if (!nameHits.length) return null;

    const withCoords = nameHits.filter((h) => h.lat != null && h.lng != null && place.lat != null && place.lng != null);
    if (withCoords.length) {
      const closest = pickClosest(withCoords, place);
      const km = haversineKm(place.lat, place.lng, closest.lat, closest.lng);
      if (km <= NAME_MATCH_KM) return closest;
    }

    const distinctive = distinctiveName(place.name || place.facilityName);
    if (distinctive.length >= 8) return pickClosest(nameHits, place);
    return null;
  },

  annotatePlaces(places, registry) {
    return (places || []).map((place) => {
      const match = this.matchPlace(place, registry);
      return {
        ...place,
        isRegistered: Boolean(match),
        registeredId: match?.id || null,
      };
    });
  },

  async annotatePlacesAsync(places) {
    try {
      const registry = await this.getRegisteredFacilities();
      return this.annotatePlaces(places, registry);
    } catch (err) {
      console.warn('[FacilityRegistry] lookup failed:', err?.message);
      return (places || []).map((p) => ({ ...p, isRegistered: false, registeredId: null }));
    }
  },

  async isPlaceRegistered(place) {
    if (!place) return false;
    if (place.isRegistered === true && place.registeredId) {
      try {
        const registry = await this.getRegisteredFacilities();
        return registry.some((r) => r.id === place.registeredId || r.facilityId === place.registeredId);
      } catch {
        return false;
      }
    }
    try {
      const registry = await this.getRegisteredFacilities();
      return Boolean(this.matchPlace({
        id: place.id || place.facilityId,
        name: place.name || place.facilityName,
        lat: place.lat ?? place.facilityLat ?? null,
        lng: place.lng ?? place.facilityLng ?? null,
      }, registry));
    } catch {
      return false;
    }
  },
};
