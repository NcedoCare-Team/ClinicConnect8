// src/navigation/AppNavigator.js
// Flow: Login → (first time) Profile onboarding → Main dashboard
// Facility connection is optional from Home → FacilitySelection → FacilityWelcome

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { StorageService } from '../utils/storage';
import { UserProfileService } from '../services/UserProfileService';
import { SleepTrackingService } from '../services/SleepTrackingService';

import LoginScreen        from '../screens/auth/LoginScreen';
import MainScreen         from '../screens/main/MainScreen';
import OnboardingScreen   from '../screens/main/OnboardingScreen';
import TriageResultScreen       from '../screens/main/TriageResultScreen';
import ChatConversationScreen  from '../screens/main/ChatConversationScreen';
import FacilitySelectionScreen from '../screens/main/FacilitySelectionScreen';
import FacilityWelcomeScreen   from '../screens/main/FacilityWelcomeScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [user,           setUser]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(true);

  useEffect(() => {
    const unsub = UserProfileService.subscribeOnboarding((done) => {
      setOnboardingDone(done);
    });
    return unsub;
  }, []);

  useEffect(() => {
    SleepTrackingService.init();
    return () => SleepTrackingService.destroy();
  }, []);

  useEffect(() => {
    const checkStoredSession = async () => {
      const session = await StorageService.getUserSession();
      if (session) {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            setUser(firebaseUser);
            const done = await UserProfileService.isOnboardingDone();
            setOnboardingDone(done);
          } else {
            StorageService.clearUserSession();
            setUser(null);
          }
          setLoading(false);
        });
        return unsubscribe;
      } else {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser);
          if (firebaseUser) {
            const done = await UserProfileService.isOnboardingDone();
            setOnboardingDone(done);
          }
          setLoading(false);
        });
        return unsubscribe;
      }
    };

    const unsubscribe = checkStoredSession();
    return () => {
      if (unsubscribe && typeof unsubscribe.then === 'function') {
        unsubscribe.then((unsub) => unsub && unsub());
      }
    };
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !onboardingDone ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainScreen} />
            <Stack.Screen
              name="ChatConversation"
              component={ChatConversationScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }}
            />
            <Stack.Screen
              name="TriageResult"
              component={TriageResultScreen}
              options={{ animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }}
            />
            <Stack.Screen
              name="FacilitySelection"
              component={FacilitySelectionScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }}
            />
            <Stack.Screen
              name="FacilityWelcome"
              component={FacilityWelcomeScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
