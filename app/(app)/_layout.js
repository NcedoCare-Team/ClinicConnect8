import { NativeTabs, Label, Icon } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';
import { COLORS } from '../../src/constants/colors';
import { useTabStackReset } from '../../src/hooks/useTabStackReset';
import { PATIENT_TAB_ROOTS } from '../../src/navigation/openPatientTab';

export default function PatientTabLayout() {
  useTabStackReset(PATIENT_TAB_ROOTS, '(app)');

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <NativeTabs
      backgroundColor={isDark ? COLORS.inkDark : COLORS.white}
      indicatorColor={isDark ? COLORS.inkSoft : COLORS.backgroundSecondary}
      labelStyle={{ selected: { color: COLORS.primary } }}
    >
      <NativeTabs.Trigger name="home">
        <Label>Care</Label>
        <Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="assessment">
        <Label>Assess</Label>
        <Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="journey">
        <Label>Journey</Label>
        <Icon sf={{ default: 'point.3.connected.trianglepath.dotted', selected: 'point.3.connected.trianglepath.dotted' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="insights">
        <Label>Insights</Label>
        <Icon sf={{ default: 'newspaper', selected: 'newspaper.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Label>Profile</Label>
        <Icon sf={{ default: 'person.circle', selected: 'person.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
