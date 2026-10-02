import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, PALETTE } from '../../src/constants/colors';
import { TAB_BAR_HEIGHT } from '../../src/constants/layout';
import { useTabStackReset } from '../../src/hooks/useTabStackReset';
import { PATIENT_TAB_ROOTS } from '../../src/navigation/openPatientTab';

function tabIcon(outline, filled) {
  return ({ color, focused, size }) => (
    <Ionicons name={focused ? filled : outline} size={size ?? 24} color={color} />
  );
}

export default function PatientTabLayout() {
  useTabStackReset(PATIENT_TAB_ROOTS, '(app)');

  const insets = useSafeAreaInsets();

  const bottomInset = Platform.OS === 'android' ? insets.bottom : Math.max(insets.bottom, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.sun,
        tabBarInactiveTintColor: PALETTE.mut,
        tabBarStyle: {
          backgroundColor: COLORS.canvas,
          borderTopColor: PALETTE.line,
          borderTopWidth: 1,
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Care', tabBarIcon: tabIcon('heart-outline', 'heart') }}
      />
      <Tabs.Screen
        name="assessment"
        options={{ title: 'Assess', tabBarIcon: tabIcon('sparkles-outline', 'sparkles') }}
      />
      <Tabs.Screen
        name="journey"
        options={{ title: 'Journey', tabBarIcon: tabIcon('footsteps-outline', 'footsteps') }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Insights', tabBarIcon: tabIcon('newspaper-outline', 'newspaper') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
      />
    </Tabs>
  );
}
