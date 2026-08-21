import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="HomeMain">
      <Stack.Screen name="HomeMain" />
      <Stack.Screen name="FacilitySelection" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
      <Stack.Screen name="FacilityWelcome" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
    </Stack>
  );
}
