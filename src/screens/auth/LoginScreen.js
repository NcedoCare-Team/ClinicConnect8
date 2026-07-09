import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth, firestore } from '../../../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { StorageService } from '../../utils/storage';
import { COLORS } from '../../constants/colors';

export default function LoginScreen() {
  const [isLogin, setIsLogin]               = useState(true);
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]               = useState(false);
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);

  const createUserDocument = async (user) => {
    if (!user) return;
    const userRef  = doc(firestore, 'users', user.uid);
    const snapshot = await getDoc(userRef);
    const now      = new Date();

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        email: user.email,
        role: 'patient',
        createdAt: now,
        lastLogin: now,
      });
    } else {
      await setDoc(userRef, { lastLogin: now }, { merge: true });
    }
  };

  const handleSignUp = async () => {
    if (!email.trim())       return Alert.alert('Error', 'Please enter your email');
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');
    if (password !== confirmPassword) {
      return Alert.alert('Error', 'Passwords do not match');
    }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await createUserDocument(user);
      await StorageService.saveUserSession(user.uid, user.email);
    } catch (error) {
      const msgs = {
        'auth/email-already-in-use': 'This email is already registered',
        'auth/invalid-email':        'Invalid email address',
        'auth/weak-password':        'Password is too weak',
      };
      Alert.alert('Error', msgs[error.code] || error.message);
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email.trim()) return Alert.alert('Error', 'Please enter your email');
    if (!password)     return Alert.alert('Error', 'Please enter your password');

    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await createUserDocument(user);
      await StorageService.saveUserSession(user.uid, user.email);
    } catch {
      Alert.alert('Error', 'Invalid email or password. Please try again.');
      setPassword('');
    }
    setLoading(false);
  };

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <LinearGradient colors={['#EBF5EF', '#F4FAF6', '#FFFFFF']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kbView}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="heart-circle" size={64} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>NcedoCare</Text>
            <Text style={styles.subtitle}>Smarter care for stronger communities</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, isLogin && styles.toggleButtonActive]}
                onPress={() => setIsLogin(true)} disabled={loading}>
                <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>Log In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, !isLogin && styles.toggleButtonActive]}
                onPress={() => setIsLogin(false)} disabled={loading}>
                <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            {!isLogin && (
              <Text style={styles.registerHint}>
                Create your account to access secure patient care. You will complete your profile next.
              </Text>
            )}

            <View style={styles.inputsContainer}>
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.input} placeholder="your@email.com"
                    placeholderTextColor={COLORS.textTertiary}
                    value={email} onChangeText={setEmail}
                    keyboardType="email-address" autoCapitalize="none" editable={!loading}
                  />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.input} placeholder="At least 6 characters"
                    placeholderTextColor={COLORS.textTertiary}
                    value={password} onChangeText={setPassword}
                    secureTextEntry={!showPassword} editable={!loading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20} color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {!isLogin && (
                <View style={styles.inputWrapper}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />
                    <TextInput
                      style={styles.input} placeholder="Re-enter your password"
                      placeholderTextColor={COLORS.textTertiary}
                      value={confirmPassword} onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirm} editable={!loading}
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                      <Ionicons
                        name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                        size={20} color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {isLogin && (
                <TouchableOpacity style={styles.forgotPassword}>
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={isLogin ? handleLogin : handleSignUp} disabled={loading}>
              {loading
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.submitButtonText}>{isLogin ? 'Log In' : 'Create Account'}</Text>
              }
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{isLogin ? "Don't have an account? " : 'Already have an account? '}</Text>
              <TouchableOpacity onPress={toggleForm} disabled={loading}>
                <Text style={styles.footerLink}>{isLogin ? 'Register' : 'Log In'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.privacyNote}>
              Protected under POPIA. Your information is encrypted and shared only with your chosen healthcare facility.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  kbView:     { flex: 1 },
  scroll:     { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },

  header:       { alignItems: 'center', marginBottom: 36 },
  logoContainer: { marginBottom: 12 },
  title:        { fontSize: 34, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -0.5 },
  subtitle:     { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },

  formContainer: {
    backgroundColor: COLORS.white, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 5,
  },
  toggleContainer: {
    flexDirection: 'row', backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12, padding: 4, marginBottom: 16,
  },
  toggleButton:       { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  toggleButtonActive: { backgroundColor: COLORS.primary },
  toggleText:         { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  toggleTextActive:   { color: COLORS.white },

  registerHint: {
    fontSize: 13, color: COLORS.textSecondary, lineHeight: 19,
    marginBottom: 20, textAlign: 'center',
  },

  inputsContainer: { marginBottom: 24 },
  inputWrapper:    { marginBottom: 16 },
  label:           { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 8 },
  inputContainer:  {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12, paddingHorizontal: 14, height: 52,
    borderWidth: 1, borderColor: COLORS.border,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary, marginLeft: 10 },

  forgotPassword:     { alignSelf: 'flex-end', marginTop: 4 },
  forgotPasswordText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  submitButton: {
    backgroundColor: COLORS.primary, borderRadius: 12, height: 52,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText:     { fontSize: 16, fontWeight: 'bold', color: COLORS.white },

  footer:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText:    { fontSize: 14, color: COLORS.textSecondary },
  footerLink:    { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  privacyNote: {
    fontSize: 11, color: COLORS.textTertiary, textAlign: 'center', marginTop: 16, lineHeight: 16,
  },
});
