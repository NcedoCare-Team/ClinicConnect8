import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyB-tR5SmMPC_d2dfADcTe4KtOSHbAw9kgE",
  authDomain: "visionally-caa02.firebaseapp.com",
  projectId: "visionally-caa02",
  storageBucket: "visionally-caa02.firebasestorage.app",
  messagingSenderId: "430951115006",
  appId: "1:430951115006:web:4fa3c9d76c94d3d5bd5daf"
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