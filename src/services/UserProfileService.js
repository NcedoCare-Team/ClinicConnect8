// src/services/UserProfileService.js
// Single source of truth for user profile data.
// Loads instantly from AsyncStorage (local cache), then syncs with Firebase in background.
// Profile picture is stored locally only (no Firebase Storage cost).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '../../firebase';

const KEYS = {
  PROFILE_CACHE:   (uid) => `@va_profile_${uid}`,
  PROFILE_PICTURE: (uid) => `@visionally_profile_picture_${uid}`,
  ONBOARDING_DONE: (uid) => `@va_onboarding_done_${uid}`,
  APP_SETTINGS:    '@va_app_settings',
};

// Firestore document path: users/{uid}/profile/main
const profileDocRef = (uid) => doc(firestore, 'users', uid, 'profile', 'main');
// Legacy about_me path used by InterviewerScreen
const aboutMeDocRef = (uid) => doc(firestore, 'users', uid, 'profile', 'about_me');

// Default profile shape
const DEFAULT_PROFILE = {
  displayName: '',
  email: '',
  phoneNumber: '',
  location: '',
  bio: '',
  // Professional / About Me
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

export const UserProfileService = {

  // ── Load profile (local-first, fast) ──────────────────────────────────────
  async getProfile() {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ...DEFAULT_PROFILE };

    try {
      // 1. Load from local cache (instant)
      const cached = await AsyncStorage.getItem(KEYS.PROFILE_CACHE(uid));
      if (cached) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(cached) };
      }
    } catch { /* fall through */ }

    // 2. If no cache, load from Firebase
    try {
      const profile = await this.syncFromFirebase();
      return profile;
    } catch {
      return { ...DEFAULT_PROFILE, email: auth.currentUser?.email || '' };
    }
  },

  // ── Sync: pull from Firebase → update local cache ─────────────────────────
  async syncFromFirebase() {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ...DEFAULT_PROFILE };

    try {
      // Load from main profile doc
      const mainSnap = await getDoc(profileDocRef(uid));
      // Load from legacy about_me doc
      const aboutSnap = await getDoc(aboutMeDocRef(uid));
      // Load from user root doc (displayName, email, phone)
      const userSnap = await getDoc(doc(firestore, 'users', uid));

      const mainData = mainSnap.exists() ? mainSnap.data() : {};
      const aboutData = aboutSnap.exists() ? aboutSnap.data() : {};
      const userData = userSnap.exists() ? userSnap.data() : {};

      // Merge all sources (main profile takes precedence)
      const merged = {
        ...DEFAULT_PROFILE,
        displayName: mainData.displayName || userData.displayName || aboutData.firstName || '',
        email: auth.currentUser?.email || userData.email || '',
        phoneNumber: mainData.phoneNumber || userData.phoneNumber || '',
        location: mainData.location || userData.location || '',
        bio: mainData.bio || userData.bio || '',
        targetRole: mainData.targetRole || aboutData.field || '',
        skills: mainData.skills?.length ? mainData.skills : (aboutData.skills || []),
        field: mainData.field || aboutData.field || '',
        experience: mainData.experience || aboutData.experience || '',
        education: mainData.education || aboutData.education || '',
        careerGoal: mainData.careerGoal || aboutData.careerGoal || '',
        disability: mainData.disability || aboutData.disability || '',
        accommodation: mainData.accommodation || aboutData.accommodation || '',
        updatedAt: mainData.updatedAt || aboutData.updatedAt || null,
      };

      // Cache locally
      await AsyncStorage.setItem(KEYS.PROFILE_CACHE(uid), JSON.stringify(merged));

      return merged;
    } catch (err) {
      console.log('[UserProfileService] syncFromFirebase error:', err);
      throw err;
    }
  },

  // ── Save profile (local + Firebase) ───────────────────────────────────────
  async saveProfile(updates) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const current = await this.getProfile();
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };

    // 1. Save locally (instant)
    await AsyncStorage.setItem(KEYS.PROFILE_CACHE(uid), JSON.stringify(merged));

    // 2. Save to Firebase (background)
    try {
      await setDoc(profileDocRef(uid), merged, { merge: true });

      // Also update the root user doc for displayName / phoneNumber
      await setDoc(doc(firestore, 'users', uid), {
        displayName: merged.displayName,
        phoneNumber: merged.phoneNumber,
        location: merged.location,
        bio: merged.bio,
        updatedAt: merged.updatedAt,
      }, { merge: true });

      // Also update legacy about_me doc so InterviewerScreen stays in sync
      await setDoc(aboutMeDocRef(uid), {
        firstName: merged.displayName?.split(' ')[0] || '',
        disability: merged.disability,
        accommodation: merged.accommodation,
        field: merged.field || merged.targetRole,
        experience: merged.experience,
        education: merged.education,
        skills: merged.skills,
        careerGoal: merged.careerGoal,
        updatedAt: merged.updatedAt,
      }, { merge: true });

      // Also update InterviewStorageService cache for offline access
      const { InterviewStorageService } = require('./InterviewStorageService');
      await InterviewStorageService.cacheAboutMe({
        firstName: merged.displayName?.split(' ')[0] || '',
        disability: merged.disability,
        accommodation: merged.accommodation,
        field: merged.field || merged.targetRole,
        experience: merged.experience,
        education: merged.education,
        skills: merged.skills,
        careerGoal: merged.careerGoal,
      });
    } catch (err) {
      console.log('[UserProfileService] Firebase save error (data saved locally):', err);
    }
  },

  // ── Profile picture (local only) ─────────────────────────────────────────
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

  // ── Onboarding flag ──────────────────────────────────────────────────────
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
  },

  // ── App settings (local only) ─────────────────────────────────────────────
  async getSettings() {
    try {
      const raw = await AsyncStorage.getItem(KEYS.APP_SETTINGS);
      return raw ? JSON.parse(raw) : {
        notifications: true,
        jobRecommendations: true,
        interviewReminders: true,
        soundEffects: true,
        biometricAuth: false,
        autoLock: true,
        language: 'en',
        jobRecommendationFrequency: 'daily',
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

  // ── Clear everything (logout) ─────────────────────────────────────────────
  async clearAll() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await AsyncStorage.removeItem(KEYS.PROFILE_CACHE(uid));
      await AsyncStorage.removeItem(KEYS.PROFILE_PICTURE(uid));
    } catch { /* non-critical */ }
  },
};
