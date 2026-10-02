// src/screens/main/SettingsScreen.js
// Tab Four — "Profile"

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Switch, Platform, Image, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../constants/colors';
import { auth } from '../../../firebase';
import { signOut, updatePassword } from 'firebase/auth';
import { StorageService } from '../../utils/storage';
import { UserProfileService } from '../../services/UserProfileService';
import { useFacility } from '../../contexts/FacilityContext';
import { openFacilitySelection } from '../../navigation/openPatientTab';
import { ProfileHeader, LAYOUT } from '../../components/layout/ScreenHeader';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'xh', name: 'isiXhosa' },
  { code: 'st', name: 'Sesotho' },
];

const PROFILE_SECTIONS = [      
  {
    title: 'Personal Information',
    rows: [
      { icon: 'person-outline', label: 'Personal Information', sub: 'Name, contact details', key: 'personal' },
    ],
  },
  {
    title: 'Medical Information',
    rows: [
      { icon: 'pulse-outline', label: 'Medical Information', sub: 'Allergies, conditions, blood type', key: 'medical' },
      { icon: 'call-outline', label: 'Emergency Contacts', sub: 'Add or update contacts', key: 'emergency' },
    ],
  },
  {
    title: 'Connected Care',
    rows: [
      { icon: 'business-outline', label: 'Healthcare Facility', sub: 'View or change facility', key: 'facility' },
    ],
  },
  {
    title: 'Privacy & Security',
    rows: [
      { icon: 'lock-closed-outline', label: 'Privacy', sub: 'Data sharing controls', key: 'privacy' },
      { icon: 'shield-checkmark-outline', label: 'Security', sub: 'Password, biometric login', key: 'security' },
    ],
  },
  {
    title: 'Application',
    rows: [
      { icon: 'settings-outline', label: 'Application Settings', sub: 'Language, notifications, accessibility', key: 'app' },
      { icon: 'help-circle-outline', label: 'Support', sub: 'FAQ, contact, live chat', key: 'support' },
    ],
  },
];

export default function SettingsScreen({ navigation }) {
  const { facilityName } = useFacility();
  const [profile, setProfile] = useState({
    displayName: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || '',
    phoneNumber: '',
    allergies: '',
    chronicConditions: [],
    currentMedications: '',
    primaryFacility: '',
    language: 'en',
  });
  const [profilePicture, setProfilePicture] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    biometricAuth: false,
    language: 'en',
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [expandedSection, setExpandedSection] = useState(null);

  useEffect(() => {
    (async () => {
      const [cached, pic, savedSettings] = await Promise.all([
        UserProfileService.getProfile(),
        UserProfileService.getProfilePicture(),
        UserProfileService.getSettings(),
      ]);
      setProfile(p => ({ ...p, ...cached }));
      setProfilePicture(pic);
      setSettings(s => ({ ...s, ...savedSettings, language: cached.language || s.language }));

      setSyncing(true);
      try {
        const fresh = await UserProfileService.syncFromFirebase();
        setProfile(p => ({ ...p, ...fresh }));
      } catch { /* offline */ }
      setSyncing(false);
    })();
  }, []);

  const updateSetting = useCallback(async (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await UserProfileService.saveSettings({ [key]: value });
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      setProfilePicture(result.assets[0].uri);
      await UserProfileService.saveProfilePicture(result.assets[0].uri);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile.displayName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    setSaving(true);
    await UserProfileService.saveProfile({
      displayName: profile.displayName.trim(),
      phoneNumber: profile.phoneNumber.trim(),
      allergies: profile.allergies,
      currentMedications: profile.currentMedications,
      language: settings.language,
    });
    setEditingProfile(false);
    setSaving(false);
    Alert.alert('Saved', 'Your profile has been updated.');
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setEditingPassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Success', 'Password updated.');
    } catch (err) {
      Alert.alert('Error',
        err.code === 'auth/requires-recent-login'
          ? 'Please log out and log in again first.'
          : 'Failed to change password.');
    }
    setSaving(false);
  };

  const handleRowPress = (key) => {
    if (key === 'personal') setExpandedSection(expandedSection === 'personal' ? null : 'personal');
    else if (key === 'medical') setExpandedSection(expandedSection === 'medical' ? null : 'medical');
    else if (key === 'security') setExpandedSection(expandedSection === 'security' ? null : 'security');
    else if (key === 'app') setExpandedSection(expandedSection === 'app' ? null : 'app');
    else if (key === 'facility') openFacilitySelection();
    else Alert.alert('Coming soon', 'This section will be available in a future update.');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // Keep per-user facility choice in AsyncStorage so it restores on next login
          await UserProfileService.clearAll();
          await signOut(auth);
          await StorageService.clearUserSession();
        },
      },
    ]);
  };

  const facility = facilityName || profile.primaryFacility || profile.location || '';

  return (
    <View style={styles.container}>
      <ProfileHeader
        displayName={profile.displayName}
        facility={facility}
        avatarUri={profilePicture}
        onAvatarPress={pickImage}
      />

      {syncing && (
        <View style={styles.syncBar}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.syncText}>Syncing profile…</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {PROFILE_SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.rows.map((row, idx) => (
                <View key={row.key}>
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => handleRowPress(row.key)}
                    activeOpacity={0.7}>
                    <View style={styles.settingIcon}>
                      <Ionicons name={row.icon} size={18} color={COLORS.primary} />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingTitle}>{row.label}</Text>
                      <Text style={styles.settingSub}>{row.sub}</Text>
                    </View>
                    <Ionicons
                      name={expandedSection === row.key ? 'chevron-up' : 'chevron-forward'}
                      size={18}
                      color={COLORS.textTertiary}
                    />
                  </TouchableOpacity>
                  {idx < section.rows.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Expanded: Personal Information */}
        {expandedSection === 'personal' && (
          <View style={styles.expandCard}>
            <InputField label="Full name" value={profile.displayName}
              onChangeText={v => setProfile(p => ({ ...p, displayName: v }))} />
            <InputField label="Email" value={profile.email} editable={false} />
            <InputField label="Phone number" value={profile.phoneNumber}
              onChangeText={v => setProfile(p => ({ ...p, phoneNumber: v }))}
              keyboardType="phone-pad" />
            <SaveButton onPress={handleSaveProfile} saving={saving} />
          </View>
        )}

        {/* Expanded: Medical Information */}
        {expandedSection === 'medical' && (
          <View style={styles.expandCard}>
            <InputField label="Allergies" value={profile.allergies || ''}
              onChangeText={v => setProfile(p => ({ ...p, allergies: v }))}
              placeholder="e.g. Penicillin, Peanuts" />
            <InputField label="Current medications" value={profile.currentMedications || ''}
              onChangeText={v => setProfile(p => ({ ...p, currentMedications: v }))}
              multiline style={{ height: 72, textAlignVertical: 'top', paddingTop: 12 }} />
            <Text style={styles.conditionsLabel}>Chronic conditions</Text>
            <Text style={styles.conditionsValue}>
              {profile.chronicConditions?.length
                ? profile.chronicConditions.join(', ')
                : 'None recorded — update during onboarding'}
            </Text>
            <SaveButton onPress={handleSaveProfile} saving={saving} />
          </View>
        )}

        {/* Expanded: Security */}
        {expandedSection === 'security' && (
          <View style={styles.expandCard}>
            <SettingToggle
              icon="finger-print-outline"
              title="Biometric login"
              sub="Use fingerprint or Face ID"
              value={settings.biometricAuth}
              onChange={v => updateSetting('biometricAuth', v)}
            />
            <TouchableOpacity
              style={styles.inlineBtn}
              onPress={() => setEditingPassword(!editingPassword)}>
              <Ionicons name="key-outline" size={16} color={COLORS.primary} />
              <Text style={styles.inlineBtnText}>Change password</Text>
            </TouchableOpacity>
            {editingPassword && (
              <>
                <InputField label="Current password" value={currentPassword}
                  onChangeText={setCurrentPassword} secureTextEntry />
                <InputField label="New password" value={newPassword}
                  onChangeText={setNewPassword} secureTextEntry />
                <InputField label="Confirm password" value={confirmPassword}
                  onChangeText={setConfirmPassword} secureTextEntry />
                <SaveButton label="Update password" onPress={handleChangePassword} saving={saving} />
              </>
            )}
          </View>
        )}

        {/* Expanded: Application Settings */}
        {expandedSection === 'app' && (
          <View style={styles.expandCard}>
            <SettingToggle
              icon="notifications-outline"
              title="Notifications"
              sub="Medication reminders and care updates"
              value={settings.notifications}
              onChange={v => updateSetting('notifications', v)}
            />
            <TouchableOpacity
              style={styles.inlineBtn}
              onPress={() => Alert.alert('Language', 'Choose your language', [
                ...LANGUAGES.map(l => ({
                  text: l.name,
                  onPress: () => {
                    updateSetting('language', l.code);
                    setProfile(p => ({ ...p, language: l.code }));
                  },
                })),
                { text: 'Cancel', style: 'cancel' },
              ])}>
              <Ionicons name="language-outline" size={16} color={COLORS.primary} />
              <Text style={styles.inlineBtnText}>
                Language: {LANGUAGES.find(l => l.code === settings.language)?.name || 'English'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>ClinicConnect8 v1.0 · Patient App</Text>
        <View style={{ height: LAYOUT.bottomTabClearance }} />
      </ScrollView>
    </View>
  );
}

function SettingToggle({ icon, title, sub, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
        <View>
          <Text style={styles.toggleTitle}>{title}</Text>
          <Text style={styles.toggleSub}>{sub}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : COLORS.textTertiary}
      />
    </View>
  );
}

function InputField({ label, style, ...props }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, props.editable === false && styles.inputDisabled, style]}
        placeholderTextColor={COLORS.textTertiary}
        {...props}
      />
    </View>
  );
}

function SaveButton({ onPress, saving, label = 'Save changes' }) {
  return (
    <TouchableOpacity style={styles.saveBtn} onPress={onPress} disabled={saving} activeOpacity={0.85}>
      <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.saveBtnGradient}>
        {saving
          ? <ActivityIndicator color="#FFFFFF" size="small" />
          : <Text style={styles.saveBtnText}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0F1A14', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: COLORS.primaryVeryLight,
  },
  syncText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: LAYOUT.screenPadding, paddingTop: 16 },

  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
    ...cardShadow,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
    gap: 12,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
  settingSub: { fontSize: 12, color: COLORS.textSecondary },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginLeft: 64 },

  expandCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: LAYOUT.cardRadius,
    padding: 16,
    marginBottom: 16,
    marginTop: -8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...cardShadow,
  },

  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundSecondary,
  },
  inputDisabled: { opacity: 0.6 },

  conditionsLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 },
  conditionsValue: { fontSize: 14, color: COLORS.textPrimary, marginBottom: 14, lineHeight: 20 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  toggleLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  toggleSub: { fontSize: 11, color: COLORS.textSecondary },

  inlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  inlineBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  saveBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  saveBtnGradient: { paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: LAYOUT.cardRadius,
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: COLORS.error },

  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textTertiary,
    marginBottom: 8,
  },
});
