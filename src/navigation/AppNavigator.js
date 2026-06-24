// src/navigation/AppNavigator.js
// Registers all screens including Onboarding, AboutMe, and InterviewRoom.

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { StorageService } from '../utils/storage';
import { UserProfileService } from '../services/UserProfileService';

import LoginScreen            from '../screens/auth/LoginScreen';
import MainScreen             from '../screens/main/MainScreen';
import ChatConversationScreen from '../screens/main/ChatConversationScreen';
import AboutMeScreen          from '../screens/main/AboutMeScreen';
import InterviewRoomScreen    from '../screens/main/InterviewRoomScreen';
import OnboardingScreen       from '../screens/main/OnboardingScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [user,             setUser]             = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [onboardingDone,   setOnboardingDone]   = useState(true); // default true to avoid flash

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
        {user ? (
          <>
            {/* ── Authenticated stack ─────────────────────────────────────── */}

            {/* Show onboarding first if not completed */}
            {!onboardingDone && (
              <Stack.Screen
                name="Onboarding"
                component={OnboardingScreen}
                options={{ animation: 'fade' }}
              />
            )}

            {/* Main tab screen */}
            <Stack.Screen name="Main" component={MainScreen} />

            {/* Chat conversation overlay */}
            <Stack.Screen
              name="ChatConversation"
              component={ChatConversationScreen}
              options={{ headerShown: false, headerBackTitleVisible: false }}
            />

            {/* About Me profile form */}
            <Stack.Screen
              name="AboutMe"
              component={AboutMeScreen}
              options={{
                headerShown:         false,
                animation:           'slide_from_bottom',
                gestureEnabled:      true,
                gestureDirection:    'vertical',
              }}
            />

            {/* Full-screen AI interview room */}
            <Stack.Screen
              name="InterviewRoom"
              component={InterviewRoomScreen}
              options={{
                headerShown:      false,
                animation:        'fade',
                gestureEnabled:   false,
              }}
            />
          </>
        ) : (
          /* ── Unauthenticated stack ─────────────────────────────────── */
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}