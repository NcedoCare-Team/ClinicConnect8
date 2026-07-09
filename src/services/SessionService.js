// src/services/SessionService.js
// Persists the patient's selected healthcare facility + session identity
// locally per user so the choice survives app restarts.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../firebase';

const facilityKey = (uid) => `@ncedocare_facility_${uid}`;

let _session = null;
let _loadedForUid = null;

export const SessionService = {
  async loadForUser(uid) {
    const userId = uid || auth.currentUser?.uid;
    if (!userId) {
      _session = null;
      _loadedForUid = null;
      return null;
    }
    if (_loadedForUid === userId && _session) return _session;

    try {
      const raw = await AsyncStorage.getItem(facilityKey(userId));
      _session = raw ? JSON.parse(raw) : null;
      _loadedForUid = userId;
      return _session;
    } catch {
      _session = null;
      _loadedForUid = userId;
      return null;
    }
  },

  async setSession(data) {
    const uid = auth.currentUser?.uid;
    _session = { ...data };
    _loadedForUid = uid || null;
    if (!uid) return;
    try {
      await AsyncStorage.setItem(facilityKey(uid), JSON.stringify(_session));
    } catch (err) {
      console.log('[SessionService] persist error:', err);
    }
  },

  getSession() {
    return _session;
  },

  async clearSession() {
    const uid = auth.currentUser?.uid || _loadedForUid;
    _session = null;
    _loadedForUid = null;
    if (!uid) return;
    try {
      await AsyncStorage.removeItem(facilityKey(uid));
    } catch { /* non-critical */ }
  },

  hasFacility() {
    return Boolean(_session?.facilityId || _session?.facilityName);
  },

  getFacilityName() {
    return _session?.facilityName || '';
  },

  consumePendingMainTab() {
    const tab = _session?.pendingMainTab || null;
    if (tab && _session) {
      const { pendingMainTab, ...rest } = _session;
      _session = rest;
      const uid = auth.currentUser?.uid;
      if (uid) {
        AsyncStorage.setItem(facilityKey(uid), JSON.stringify(_session)).catch(() => {});
      }
    }
    return tab;
  },
};
