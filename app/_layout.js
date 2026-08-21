import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider, DefaultTheme } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ChatProvider } from '../src/contexts/ChatContext';
import { FacilityProvider } from '../src/contexts/FacilityContext';
import { COLORS } from '../src/constants/colors';
import { StorageService } from '../src/utils/storage';
import { UserProfileService } from '../src/services/UserProfileService';
import { SleepTrackingService } from '../src/services/SleepTrackingService';

const NcedoTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    background: COLORS.backgroundSecondary,
    card: COLORS.white,
    text: COLORS.textPrimary,
    border: COLORS.border,
  },
};

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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
    let unsubscribeAuth = () => {};

    const bootstrap = async () => {
      const session = await StorageService.getUserSession();
      if (session) {
        unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
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
      } else {
        unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser);
          if (firebaseUser) {
            const done = await UserProfileService.isOnboardingDone();
            setOnboardingDone(done);
          }
          setLoading(false);
        });
      }
    };

    bootstrap();
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (loading) return;

    const root = segments[0];

    if (!user) {
      if (root !== '(auth)') {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (!onboardingDone) {
      if (root !== 'onboarding') {
        router.replace('/onboarding');
      }
      return;
    }

    if (root !== '(app)') {
      router.replace('/(app)/home/HomeMain');
    }
  }, [user, onboardingDone, loading, segments, router]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style="auto" />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading NcedoCare...</Text>
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ChatProvider>
          <FacilityProvider>
            <ThemeProvider value={NcedoTheme}>
              <AuthGate />
            </ThemeProvider>
          </FacilityProvider>
        </ChatProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    gap: 12,
    zIndex: 999,
  },
  loadingText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
});
