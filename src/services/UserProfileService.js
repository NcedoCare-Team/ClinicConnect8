// src/services/UserProfileService.js
// Patient profile — local cache + Firestore patients/{uid} (cloud rules).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '../../firebase';
import { patientRef } from './firestorePaths';

const KEYS = {
  PROFILE_CACHE:   (uid) => `@ncedocare_profile_${uid}`,
  PROFILE_PICTURE: (uid) => `@ncedocare_profile_picture_${uid}`,
  ONBOARDING_DONE: (uid) => `@ncedocare_onboarding_done_${uid}`,
  APP_SETTINGS:    '@ncedocare_app_settings',
};

const DEFAULT_PROFILE = {
  displayName: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'patient',
  phoneNumber: '',
  dateOfBirth: '',
  idNumber: '',
  patientAge: null,
  location: '',
  bio: '',
  primaryFacility: '',
  primaryFacilityId: '',
  facilityId: '',
  language: 'en',
  chronicConditions: [],
  allergies: '',
  currentMedications: '',
  healthData: null,
  targetRole: '',
  skills: [],
  field: '',
  experience: '',
  education: '',
  careerGoal: '',
  disability: '',
  accommodation: '',
  updatedAt: null,
};

function toFirestorePatient(merged) {
  return {
    displayName: merged.displayName,
    firstName: merged.firstName,
    lastName: merged.lastName,
    email: merged.email || auth.currentUser?.email || '',
    role: 'patient',
    phoneNumber: merged.phoneNumber,
    dateOfBirth: merged.dateOfBirth,
    idNumber: merged.idNumber,
    patientAge: merged.patientAge,
    location: merged.location,
    bio: merged.bio,
    primaryFacility: merged.primaryFacility,
    primaryFacilityId: merged.primaryFacilityId,
    facilityId: merged.primaryFacilityId || merged.facilityId || '',
    language: merged.language,
    chronicConditions: merged.chronicConditions,
    allergies: merged.allergies,
    currentMedications: merged.currentMedications,
    healthData: merged.healthData,
    updatedAt: merged.updatedAt,
  };
}

export const UserProfileService = {

  async getProfile() {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ...DEFAULT_PROFILE };

    try {
      const cached = await AsyncStorage.getItem(KEYS.PROFILE_CACHE(uid));
      if (cached) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(cached) };
      }
    } catch { /* fall through */ }

    try {
      return await this.syncFromFirebase();
    } catch {
      return { ...DEFAULT_PROFILE, email: auth.currentUser?.email || '' };
    }
  },

  async syncFromFirebase() {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ...DEFAULT_PROFILE };

    try {
      const snap = await getDoc(patientRef(firestore, uid));
      const data = snap.exists() ? snap.data() : {};

      const merged = {
        ...DEFAULT_PROFILE,
        ...data,
        email: auth.currentUser?.email || data.email || '',
        facilityId: data.facilityId || data.primaryFacilityId || '',
        primaryFacilityId: data.primaryFacilityId || data.facilityId || '',
      };

      await AsyncStorage.setItem(KEYS.PROFILE_CACHE(uid), JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.log('[UserProfileService] syncFromFirebase error:', err);
      throw err;
    }
  },

  async saveProfile(updates) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const current = await this.getProfile();
    const merged = {
      ...current,
      ...updates,
      role: 'patient',
      facilityId: updates.primaryFacilityId || updates.facilityId || current.primaryFacilityId || current.facilityId || '',
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(KEYS.PROFILE_CACHE(uid), JSON.stringify(merged));

    try {
      await setDoc(patientRef(firestore, uid), toFirestorePatient(merged), { merge: true });
    } catch (err) {
      console.log('[UserProfileService] Firebase save error (data saved locally):', err);
    }
  },

  async getProfilePicture() {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    try {
      return await AsyncStorage.getItem(KEYS.PROFILE_PICTURE(uid));
    } catch { return null; }
  },

  async saveProfilePicture(uri) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await AsyncStorage.setItem(KEYS.PROFILE_PICTURE(uid), uri);
  },

  _onboardingListeners: [],

  async isOnboardingDone() {
    const uid = auth.currentUser?.uid;
    if (!uid) return true;
    try {
      const val = await AsyncStorage.getItem(KEYS.ONBOARDING_DONE(uid));
      return val === 'true';
    } catch { return false; }
  },

  async setOnboardingDone() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await AsyncStorage.setItem(KEYS.ONBOARDING_DONE(uid), 'true');
    this._onboardingListeners.forEach((fn) => {
      try { fn(true); } catch { /* ignore */ }
    });
  },

  subscribeOnboarding(listener) {
    this._onboardingListeners.push(listener);
    return () => {
      this._onboardingListeners = this._onboardingListeners.filter((fn) => fn !== listener);
    };
  },

  async getSettings() {
    try {
      const raw = await AsyncStorage.getItem(KEYS.APP_SETTINGS);
      return raw ? JSON.parse(raw) : {
        notifications: true,
        soundEffects: true,
        biometricAuth: false,
        autoLock: true,
        language: 'en',
      };
    } catch {
      return {};
    }
  },

  async saveSettings(updates) {
    try {
      const current = await this.getSettings();
      const merged = { ...current, ...updates };
      await AsyncStorage.setItem(KEYS.APP_SETTINGS, JSON.stringify(merged));
    } catch { /* non-critical */ }
  },

  async clearAll() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await AsyncStorage.removeItem(KEYS.PROFILE_CACHE(uid));
      await AsyncStorage.removeItem(KEYS.PROFILE_PICTURE(uid));
    } catch { /* non-critical */ }
  },
};
