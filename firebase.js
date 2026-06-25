import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyD8dVfbxnMCrRFk4RMYctwu_6jMNEGMO24",
  authDomain: "ncedocare.firebaseapp.com",
  projectId: "ncedocare",
  storageBucket: "ncedocare.firebasestorage.app",
  messagingSenderId: "947255920961",
  appId: "1:947255920961:web:d11615fbd863767d4e79c0",
  measurementId: "G-YM2CYT1DQ0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Cloud Firestore
export const firestore = getFirestore(app);

export default app;
