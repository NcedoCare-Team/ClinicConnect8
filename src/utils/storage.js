import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  USER_SESSION: '@visionally_user_session',
  USER_ID: '@visionally_user_id',
  PROFILE_PICTURE: '@visionally_profile_picture',
  APP_SETTINGS: '@visionally_app_settings',
  TRUSTED_CONTACTS: '@visionally_trusted_contacts',
};

export const StorageService = {
  // User Session Management
  saveUserSession: async (userId, email) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify({ userId, email }));
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ID, userId);
      return true;
    } catch (error) {
      console.log('Error saving user session:', error);
      return false;
    }
  },

  getUserSession: async () => {
    try {
      const session = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
      return session ? JSON.parse(session) : null;
    } catch (error) {
      console.log('Error getting user session:', error);
      return null;
    }
  },

  clearUserSession: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_SESSION);
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_ID);
      return true;
    } catch (error) {
      console.log('Error clearing user session:', error);
      return false;
    }
  },

  isLoggedIn: async () => {
    try {
      const session = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
      return session !== null;
    } catch (error) {
      console.log('Error checking login status:', error);
      return false;
    }
  },

  // Profile Picture Management
  saveProfilePicture: async (imageUri) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PROFILE_PICTURE, imageUri);
      return true;
    } catch (error) {
      console.log('Error saving profile picture:', error);
      return false;
    }
  },

  getProfilePicture: async () => {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.PROFILE_PICTURE);
    } catch (error) {
      console.log('Error getting profile picture:', error);
      return null;
    }
  },

  removeProfilePicture: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.PROFILE_PICTURE);
      return true;
    } catch (error) {
      console.log('Error removing profile picture:', error);
      return false;
    }
  },

  // App Settings Management
  saveAppSettings: async (settings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.log('Error saving app settings:', error);
      return false;
    }
  },

  getAppSettings: async () => {
    try {
      const settings = await AsyncStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
      return settings ? JSON.parse(settings) : {
        notifications: true,
        locationTracking: true,
        emergencyAlerts: true,
        soundEffects: true,
        darkMode: false,
        biometricAuth: false,
        autoLock: true,
      };
    } catch (error) {
      console.log('Error getting app settings:', error);
      return null;
    }
  },

  // Get all storage keys (for debugging)
  getAllKeys: async () => {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.log('Error getting all keys:', error);
      return [];
    }
  },
};