import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Switch, Platform, Image, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../constants/colors';
import { auth } from '../../../firebase';
import { signOut, updatePassword } from 'firebase/auth';
import { StorageService } from '../../utils/storage';
import { UserProfileService } from '../../services/UserProfileService';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'af', name: 'Afrikaans', flag: '🇿🇦' },
  { code: 'zu', name: 'isiZulu', flag: '🇿🇦' },
  { code: 'xh', name: 'isiXhosa', flag: '🇿🇦' },
];

export default function SettingsScreen({ navigation }) {
  // Profile (loaded instantly from local cache)
  const [profile, setProfile] = useState({
    displayName: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || '',
    phoneNumber: '', location: '', bio: '',
    targetRole: '', skills: [], field: '', experience: '',
    education: '', careerGoal: '', disability: '', accommodation: '',
  });
  const [profilePicture, setProfilePicture] = useState(null);
  const [syncing, setSyncing] = useState(false);   // tiny spinner on profile card only
  const [saving, setSaving] = useState(false);

  // Settings (local-only, instant)
  const [settings, setSettings] = useState({
    notifications: true, jobRecommendations: true, interviewReminders: true,
    soundEffects: true, biometricAuth: false, autoLock: true,
    language: 'en', jobRecommendationFrequency: 'daily',
  });

  // Edit / expand states
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [editingSkills, setEditingSkills] = useState(false);
  const [newSkill, setNewSkill] = useState('');

  // ── Load locally first (instant), then sync Firebase in background ────────
  useEffect(() => {
    (async () => {
      // 1. Instant: load cached profile + picture + settings
      const [cached, pic, savedSettings] = await Promise.all([
        UserProfileService.getProfile(),
        UserProfileService.getProfilePicture(),
        UserProfileService.getSettings(),
      ]);
      setProfile(cached);
      setProfilePicture(pic);
      setSettings(s => ({ ...s, ...savedSettings }));

      // 2. Background: sync from Firebase (only updates the profile card)
      setSyncing(true);
      try {
        const fresh = await UserProfileService.syncFromFirebase();
        setProfile(fresh);
      } catch { /* offline — local cache is already shown */ }
      setSyncing(false);
    })();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const updateSetting = useCallback(async (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await UserProfileService.saveSettings({ [key]: value });
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll permission is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setProfilePicture(uri);
      await UserProfileService.saveProfilePicture(uri);
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
      location: profile.location.trim(),
      bio: profile.bio.trim(),
    });
    setEditingProfile(false);
    setSaving(false);
    Alert.alert('Saved', 'Profile updated.');
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
      Alert.alert('Success', 'Password changed.');
    } catch (err) {
      Alert.alert('Error',
        err.code === 'auth/requires-recent-login'
          ? 'Please log out and log in again first.'
          : 'Failed to change password.');
    }
    setSaving(false);
  };

  const handleAddSkill = async () => {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    const updated = [...(profile.skills || []), trimmed];
    setProfile(p => ({ ...p, skills: updated }));
    setNewSkill('');
    await UserProfileService.saveProfile({ skills: updated });
  };

  const handleRemoveSkill = async (index) => {
    const updated = profile.skills.filter((_, i) => i !== index);
    setProfile(p => ({ ...p, skills: updated }));
    await UserProfileService.saveProfile({ skills: updated });
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await UserProfileService.clearAll();
          await signOut(auth);
          await StorageService.clearUserSession();
        },
      },
    ]);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const SettingRow = ({ icon, iconColor, iconBg, title, sub, right, onPress }) => (
    <TouchableOpacity style={st.settingItem} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.6 : 1}>
      <View style={st.settingLeft}>
        <View style={[st.settingIcon, { backgroundColor: iconBg }]}>
          {icon}
        </View>
        <View style={st.settingInfo}>
          <Text style={st.settingTitle}>{title}</Text>
          {sub ? <Text style={st.settingDesc}>{sub}</Text> : null}
        </View>
      </View>
      {right}
    </TouchableOpacity>
  );

  const Divider = () => <View style={st.divider} />;

  // ── HEADER ─────────────────────────────────────────────────────────────────
  const renderHeader = () => (
    <LinearGradient colors={[COLORS.inkDark, COLORS.inkSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.heroHeader}>
      <View style={st.heroContent}>
        <Text style={st.heroTitle}>Profile</Text>
        <Text style={st.heroTitle2}>Settings</Text>
        <Text style={st.heroSub}>Manage your account & preferences</Text>
      </View>
      <View style={st.heroDeco1} />
      <View style={st.heroDeco2} />
    </LinearGradient>
  );

  // ── PROFILE CARD ───────────────────────────────────────────────────────────
  const renderProfileSection = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="person" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>Profile</Text>
        {syncing && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 6 }} />}
      </View>

      <View style={st.card}>
        {/* Avatar */}
        <View style={st.profileImageSection}>
          <TouchableOpacity onPress={pickImage} style={st.profileImageWrapper}>
            {profilePicture ? (
              <Image source={{ uri: profilePicture }} style={st.profileImage} />
            ) : (
              <View style={st.profileImagePlaceholder}>
                <Ionicons name="person" size={40} color={COLORS.textTertiary} />
              </View>
            )}
            <View style={st.cameraIcon}><Ionicons name="camera" size={14} color="#FFF" /></View>
          </TouchableOpacity>
        </View>

        {editingProfile ? (
          <View style={st.editForm}>
            <InputField label="Full Name *" value={profile.displayName}
              onChangeText={v => setProfile(p => ({ ...p, displayName: v }))} />
            <InputField label="Email" value={profile.email} editable={false} />
            <View style={st.inputGroup}>
              <Text style={st.inputLabel}>Phone Number</Text>
              <View style={st.phoneInputContainer}>
                <View style={st.countryCode}>
                  <Text style={{ fontSize: 18 }}>🇿🇦</Text>
                  <Text style={st.countryCodeText}>+27</Text>
                </View>
                <TextInput style={st.phoneInput} placeholder="123456789"
                  placeholderTextColor={COLORS.textTertiary} value={profile.phoneNumber}
                  onChangeText={v => setProfile(p => ({ ...p, phoneNumber: v }))}
                  keyboardType="phone-pad" maxLength={9} />
              </View>
            </View>
            <InputField label="Location" value={profile.location} placeholder="City, Province"
              onChangeText={v => setProfile(p => ({ ...p, location: v }))} />
            <InputField label="Bio" value={profile.bio} placeholder="Short professional bio..."
              onChangeText={v => setProfile(p => ({ ...p, bio: v }))}
              multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top', paddingTop: 14 }} />

            <View style={st.editActions}>
              <TouchableOpacity style={[st.editButton, st.cancelButton]}
                onPress={() => setEditingProfile(false)}>
                <Text style={st.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.editButton, st.saveButton]} onPress={handleSaveProfile} disabled={saving}>
                <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={st.saveButtonGradient}>
                  {saving
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={st.saveButtonText}>Save Changes</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={st.profileInfo}>
            <ProfileRow label="NAME" value={profile.displayName} />
            <Divider />
            <ProfileRow label="EMAIL" value={profile.email} />
            <Divider />
            <ProfileRow label="PHONE" value={profile.phoneNumber ? `+27 ${profile.phoneNumber}` : null} />
            {profile.location ? <><Divider /><ProfileRow label="LOCATION" value={profile.location} /></> : null}
            <TouchableOpacity style={st.editProfileButton} onPress={() => setEditingProfile(true)}>
              <Ionicons name="create-outline" size={18} color={COLORS.primary} />
              <Text style={st.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  // ── ABOUT ME / CAREER PROFILE ─────────────────────────────────────────────
  const renderAboutMeSection = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="briefcase" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>Career Profile</Text>
      </View>

      <View style={st.card}>
        {/* Target Role */}
        <View style={st.aboutRow}>
          <View style={[st.aboutIcon, { backgroundColor: `${COLORS.primary}15` }]}>
            <Ionicons name="rocket-outline" size={18} color={COLORS.primary} />
          </View>
          <View style={st.aboutInfo}>
            <Text style={st.aboutLabel}>Target Role</Text>
            <Text style={st.aboutValue}>{profile.targetRole || 'Not set'}</Text>
          </View>
        </View>
        <Divider />

        {/* Skills */}
        <View style={st.aboutRow}>
          <View style={[st.aboutIcon, { backgroundColor: `${COLORS.success}15` }]}>
            <Ionicons name="flash-outline" size={18} color={COLORS.success} />
          </View>
          <View style={[st.aboutInfo, { flex: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={st.aboutLabel}>Skills</Text>
              <TouchableOpacity onPress={() => setEditingSkills(!editingSkills)}>
                <Ionicons name={editingSkills ? 'chevron-up' : 'add-circle-outline'} size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <View style={st.skillsWrap}>
              {(profile.skills || []).map((s, i) => (
                <View key={i} style={st.skillChip}>
                  <Text style={st.skillChipText}>{s}</Text>
                  {editingSkills && (
                    <TouchableOpacity onPress={() => handleRemoveSkill(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {(!profile.skills || profile.skills.length === 0) && (
                <Text style={st.aboutValueMuted}>No skills added yet</Text>
              )}
            </View>
            {editingSkills && (
              <View style={st.addSkillRow}>
                <TextInput style={st.addSkillInput} placeholder="Add a skill..."
                  placeholderTextColor={COLORS.textTertiary} value={newSkill}
                  onChangeText={setNewSkill} onSubmitEditing={handleAddSkill} />
                <TouchableOpacity style={st.addSkillBtn} onPress={handleAddSkill}>
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        <Divider />

        {/* Field / Experience / Education / Career Goal */}
        <AboutInfoRow icon="school-outline" iconColor={COLORS.warning} label="Education" value={profile.education} />
        <Divider />
        <AboutInfoRow icon="trending-up" iconColor={COLORS.info} label="Experience" value={profile.experience} />
        <Divider />
        <AboutInfoRow icon="flag-outline" iconColor={COLORS.primary} label="Career Goal" value={profile.careerGoal} />
        {(profile.disability || profile.accommodation) && (
          <>
            <Divider />
            <AboutInfoRow icon="accessibility-outline" iconColor={COLORS.primaryLight} label="Accommodation" value={profile.accommodation || profile.disability} />
          </>
        )}

        {/* Edit full profile in AboutMe screen */}
        <TouchableOpacity style={st.editProfileButton} onPress={() => navigation.navigate('AboutMe')}>
          <Ionicons name="open-outline" size={16} color={COLORS.primary} />
          <Text style={st.editProfileButtonText}>Edit Full Career Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── CAREER SETTINGS ────────────────────────────────────────────────────────
  const renderCareerSettings = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <MaterialCommunityIcons name="briefcase-search" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>Career Settings</Text>
      </View>
      <View style={st.card}>
        <SettingRow icon={<MaterialCommunityIcons name="bell-badge" size={20} color={COLORS.primary} />}
          iconBg={`${COLORS.primary}15`} title="Job Recommendations" sub="Get notified about new opportunities"
          right={<Switch value={settings.jobRecommendations}
            onValueChange={v => updateSetting('jobRecommendations', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={settings.jobRecommendations ? COLORS.primary : COLORS.textTertiary} />} />
        <Divider />
        <SettingRow icon={<MaterialCommunityIcons name="calendar-clock" size={20} color={COLORS.success} />}
          iconBg={`${COLORS.success}15`} title="Frequency"
          sub={settings.jobRecommendationFrequency.charAt(0).toUpperCase() + settings.jobRecommendationFrequency.slice(1)}
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />}
          onPress={() => Alert.alert('Frequency', 'How often?', [
            { text: 'Daily', onPress: () => updateSetting('jobRecommendationFrequency', 'daily') },
            { text: 'Weekly', onPress: () => updateSetting('jobRecommendationFrequency', 'weekly') },
            { text: 'Monthly', onPress: () => updateSetting('jobRecommendationFrequency', 'monthly') },
            { text: 'Cancel', style: 'cancel' },
          ])} />
        <Divider />
        <SettingRow icon={<MaterialCommunityIcons name="video-outline" size={20} color={COLORS.warning} />}
          iconBg={`${COLORS.warning}15`} title="Interview Reminders" sub="Get alerts before scheduled interviews"
          right={<Switch value={settings.interviewReminders}
            onValueChange={v => updateSetting('interviewReminders', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={settings.interviewReminders ? COLORS.primary : COLORS.textTertiary} />} />
      </View>
    </View>
  );

  // ── SECURITY ───────────────────────────────────────────────────────────────
  const renderSecurity = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>Security & Privacy</Text>
      </View>
      <View style={st.card}>
        <SettingRow icon={<Ionicons name="key" size={20} color={COLORS.warning} />}
          iconBg={`${COLORS.warning}20`} title="Change Password" sub="Update your password"
          right={<Ionicons name={editingPassword ? 'chevron-up' : 'chevron-forward'} size={20} color={COLORS.textSecondary} />}
          onPress={() => setEditingPassword(!editingPassword)} />
        {editingPassword && (
          <View style={st.passwordForm}>
            <InputField label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
            <InputField label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <InputField label="Confirm" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
            <TouchableOpacity style={st.changePasswordButton} onPress={handleChangePassword} disabled={saving}>
              <LinearGradient colors={[COLORS.warning, '#F97316']} style={st.changePasswordGradient}>
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={st.changePasswordText}>Update Password</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
        <Divider />
        <SettingRow icon={<MaterialCommunityIcons name="fingerprint" size={20} color={COLORS.primary} />}
          iconBg={`${COLORS.primary}20`} title="Biometric Authentication" sub="Fingerprint / Face ID"
          right={<Switch value={settings.biometricAuth}
            onValueChange={v => updateSetting('biometricAuth', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={settings.biometricAuth ? COLORS.primary : COLORS.textTertiary} />} />
        <Divider />
        <SettingRow icon={<Ionicons name="lock-closed" size={20} color={COLORS.error} />}
          iconBg={`${COLORS.error}20`} title="Auto-Lock" sub="Lock app when inactive"
          right={<Switch value={settings.autoLock}
            onValueChange={v => updateSetting('autoLock', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={settings.autoLock ? COLORS.primary : COLORS.textTertiary} />} />
      </View>
    </View>
  );

  // ── PREFERENCES ────────────────────────────────────────────────────────────
  const renderPreferences = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="options" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>Preferences</Text>
      </View>
      <View style={st.card}>
        <SettingRow icon={<Ionicons name="notifications" size={20} color={COLORS.success} />}
          iconBg={`${COLORS.success}20`} title="Push Notifications" sub="Receive app notifications"
          right={<Switch value={settings.notifications}
            onValueChange={v => updateSetting('notifications', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={settings.notifications ? COLORS.primary : COLORS.textTertiary} />} />
        <Divider />
        <SettingRow icon={<MaterialCommunityIcons name="accessibility" size={20} color={COLORS.primary} />}
          iconBg={`${COLORS.primary}20`} title="Accessibility" sub="Enhance app for your needs"
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />}
          onPress={() => Alert.alert('Accessibility', 'Accessibility settings coming soon.')} />
        <Divider />
        <SettingRow icon={<Ionicons name="volume-high" size={20} color={COLORS.warning} />}
          iconBg={`${COLORS.warning}20`} title="Sound Effects" sub="App sounds and alerts"
          right={<Switch value={settings.soundEffects}
            onValueChange={v => updateSetting('soundEffects', v)}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={settings.soundEffects ? COLORS.primary : COLORS.textTertiary} />} />
        <Divider />
        <SettingRow icon={<Ionicons name="language" size={20} color={COLORS.primary} />}
          iconBg={`${COLORS.primary}20`} title="Language"
          sub={LANGUAGES.find(l => l.code === settings.language)?.name || 'English'}
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />}
          onPress={() => Alert.alert('Language', 'Choose your language', [
            ...LANGUAGES.map(l => ({ text: `${l.flag} ${l.name}`, onPress: () => updateSetting('language', l.code) })),
            { text: 'Cancel', style: 'cancel' },
          ])} />
      </View>
    </View>
  );

  // ── CONNECTED SERVICES (demo) ─────────────────────────────────────────────
  const renderConnectedServices = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="link" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>Connected Services</Text>
      </View>
      <View style={st.card}>
        <SettingRow icon={<Ionicons name="logo-linkedin" size={20} color="#0077B5" />}
          iconBg="#0077B515" title="LinkedIn" sub="Import profile data"
          right={<View style={st.comingSoonBadge}><Text style={st.comingSoonText}>Soon</Text></View>} />
        <Divider />
        <SettingRow icon={<Ionicons name="document-attach" size={20} color={COLORS.primary} />}
          iconBg={`${COLORS.primary}15`} title="Resume / CV" sub="Upload for AI analysis"
          right={<View style={st.comingSoonBadge}><Text style={st.comingSoonText}>Soon</Text></View>} />
        <Divider />
        <SettingRow icon={<Ionicons name="calendar-outline" size={20} color={COLORS.success} />}
          iconBg={`${COLORS.success}15`} title="Google Calendar" sub="Sync interview schedules"
          right={<View style={st.comingSoonBadge}><Text style={st.comingSoonText}>Soon</Text></View>} />
      </View>
    </View>
  );

  // ── ABOUT & SUPPORT ────────────────────────────────────────────────────────
  const renderAboutSupport = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="information-circle" size={20} color={COLORS.primary} />
        <Text style={st.sectionTitle}>About & Support</Text>
      </View>
      <View style={st.card}>
        <SettingRow icon={<Ionicons name="help-circle" size={20} color={COLORS.primary} />}
          iconBg={`${COLORS.primary}20`} title="Help Center" sub="Get help and support"
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />} />
        <Divider />
        <SettingRow icon={<Ionicons name="document-text" size={20} color={COLORS.success} />}
          iconBg={`${COLORS.success}20`} title="Privacy Policy" sub="How we protect your data"
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />} />
        <Divider />
        <SettingRow icon={<Ionicons name="star" size={20} color={COLORS.warning} />}
          iconBg={`${COLORS.warning}20`} title="Rate VisionAlly" sub="Share your experience"
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />} />
        <Divider />
        <SettingRow icon={<Ionicons name="code-slash" size={20} color={COLORS.textSecondary} />}
          iconBg={`${COLORS.textSecondary}20`} title="App Version" sub="1.0.0" right={null} />
      </View>
    </View>
  );

  // ── DANGER ZONE ────────────────────────────────────────────────────────────
  const renderDangerZone = () => (
    <View style={st.section}>
      <View style={st.sectionHeader}>
        <Ionicons name="warning" size={20} color={COLORS.error} />
        <Text style={[st.sectionTitle, { color: COLORS.error }]}>Danger Zone</Text>
      </View>
      <View style={st.card}>
        <SettingRow icon={<Ionicons name="log-out" size={20} color={COLORS.warning} />}
          iconBg={`${COLORS.warning}20`} title="Logout" sub="Sign out of your account"
          right={<Ionicons name="chevron-forward" size={20} color={COLORS.warning} />}
          onPress={handleLogout} />
      </View>
    </View>
  );

  // ── MAIN RENDER (no full-screen loader!) ─────────────────────────────────
  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.inkDark} />
      {renderHeader()}

      <View style={st.contentSheet}>
        <ScrollView style={st.scrollView} contentContainerStyle={st.scrollContent}
          showsVerticalScrollIndicator={false}>
          {renderProfileSection()}
          {renderAboutMeSection()}
          {renderCareerSettings()}
          {renderSecurity()}
          {renderPreferences()}
          {renderConnectedServices()}
          {renderAboutSupport()}
          {renderDangerZone()}

          <View style={st.footer}>
            <Text style={st.footerText}>Made with ❤️ for your career</Text>
            <Text style={st.footerVersion}>VisionAlly v1.0.0</Text>
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    </View>
  );
}

// ── Reusable tiny components ──────────────────────────────────────────────────
function ProfileRow({ label, value }) {
  return (
    <View style={st.profileInfoRow}>
      <Text style={st.profileLabel}>{label}</Text>
      <Text style={st.profileValue}>{value || 'Not set'}</Text>
    </View>
  );
}

function AboutInfoRow({ icon, iconColor, label, value }) {
  return (
    <View style={st.aboutRow}>
      <View style={[st.aboutIcon, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={st.aboutInfo}>
        <Text style={st.aboutLabel}>{label}</Text>
        <Text style={st.aboutValue}>{value || 'Not set'}</Text>
      </View>
    </View>
  );
}

function InputField({ label, style, ...props }) {
  return (
    <View style={st.inputGroup}>
      <Text style={st.inputLabel}>{label}</Text>
      <TextInput
        style={[st.input, props.editable === false && st.inputDisabled, style]}
        placeholderTextColor={COLORS.textTertiary}
        {...props}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSecondary },

  // Hero
  heroHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 44, paddingHorizontal: 24,
    position: 'relative', overflow: 'hidden',
  },
  heroContent: { zIndex: 2 },
  heroTitle: { fontSize: 30, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
  heroTitle2: { fontSize: 30, fontWeight: '900', color: COLORS.primaryLight, letterSpacing: -0.5 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginTop: 6 },
  heroDeco1: {
    position: 'absolute', right: -30, top: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDeco2: {
    position: 'absolute', right: 50, bottom: -50,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  // Content sheet
  contentSheet: {
    flex: 1, backgroundColor: COLORS.backgroundSecondary,
    borderTopRightRadius: 28, marginTop: -20, overflow: 'hidden',
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },

  // Card
  card: {
    backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },

  // Profile avatar
  profileImageSection: { alignItems: 'center', paddingVertical: 20 },
  profileImageWrapper: { position: 'relative' },
  profileImage: { width: 90, height: 90, borderRadius: 45 },
  profileImagePlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.backgroundSecondary, alignItems: 'center', justifyContent: 'center',
  },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFF',
  },
  profileInfo: { padding: 20, paddingTop: 0 },
  profileInfoRow: { paddingVertical: 12 },
  profileLabel: {
    fontSize: 11, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  profileValue: { fontSize: 15, color: COLORS.textPrimary, fontWeight: '500' },
  editProfileButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, backgroundColor: `${COLORS.primary}10`,
    borderRadius: 10, gap: 6, marginTop: 12, marginHorizontal: 16, marginBottom: 16,
  },
  editProfileButtonText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  // Edit form
  editForm: { padding: 20, paddingTop: 0, gap: 16 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  input: {
    backgroundColor: COLORS.backgroundSecondary, borderRadius: 10, padding: 14,
    fontSize: 14, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border,
  },
  inputDisabled: { opacity: 0.6 },
  phoneInputContainer: { flexDirection: 'row', gap: 10 },
  countryCode: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary, borderRadius: 10,
    paddingHorizontal: 10, gap: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  countryCodeText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  phoneInput: {
    flex: 1, backgroundColor: COLORS.backgroundSecondary, borderRadius: 10,
    padding: 14, fontSize: 14, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border,
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  editButton: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  cancelButton: { backgroundColor: COLORS.backgroundSecondary, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  saveButton: {},
  saveButtonGradient: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // About Me / Career Profile
  aboutRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  aboutIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  aboutInfo: { flex: 1 },
  aboutLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  aboutValue: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
  aboutValueMuted: { fontSize: 13, color: COLORS.textTertiary, fontStyle: 'italic' },
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  skillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.primary}10`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  skillChipText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  addSkillRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  addSkillInput: {
    flex: 1, backgroundColor: COLORS.backgroundSecondary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border,
  },
  addSkillBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    width: 38, alignItems: 'center', justifyContent: 'center',
  },

  // Setting rows
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  settingIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 },
  settingDesc: { fontSize: 12, color: COLORS.textSecondary },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 66 },

  // Password
  passwordForm: { padding: 16, paddingTop: 0, gap: 14 },
  changePasswordButton: { borderRadius: 10, overflow: 'hidden', marginTop: 8 },
  changePasswordGradient: { paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  changePasswordText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Connected Services badge
  comingSoonBadge: { backgroundColor: `${COLORS.primary}15`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  comingSoonText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },

  // Footer
  footer: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  footerText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  footerVersion: { fontSize: 11, color: COLORS.textTertiary },
});