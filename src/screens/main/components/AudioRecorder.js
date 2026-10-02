// src/screens/main/components/AudioRecorder.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../../constants/colors';

const AudioRecorder = ({ onStopRecording, onCancel }) => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [duration, setDuration] = useState(0);
  const soundWaves = useRef([...Array(20)].map(() => new Animated.Value(0.3))).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    const startRecording = async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!active || !permission.granted) {
          if (active) onCancel();
          return;
        }
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        if (!active) return;
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (err) {
        console.error('Recording error:', err);
        if (active) onCancel();
      }
    };

    startRecording();
    animateWaves();
    animatePulse();

    return () => {
      active = false;
      clearInterval(interval);
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  const stopRecording = async () => {
    try {
      await recorder.stop();
      onStopRecording(recorder.uri);
    } catch (error) {
      console.error('Stop recording error:', error);
      onCancel();
    }
  };

  const animateWaves = () => {
    soundWaves.forEach((wave, index) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(wave, {
            toValue: Math.random() * 0.7 + 0.3,
            duration: 300 + index * 50,
            useNativeDriver: true,
          }),
          Animated.timing(wave, {
            toValue: 0.3,
            duration: 300 + index * 50,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  };

  const animatePulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.recordingContainer}>
      <LinearGradient
        colors={[`${COLORS.primary}1A`, `${COLORS.primary}0D`]}
        style={styles.recordingBackground}
      >
        <View style={styles.waveContainer}>
          {soundWaves.map((wave, index) => (
            <Animated.View
              key={index}
              style={[
                styles.wave,
                {
                  transform: [{ scaleY: wave }],
                  backgroundColor: index % 2 === 0 ? COLORS.primary : COLORS.primaryDark,
                },
              ]}
            />
          ))}
        </View>

        <Text style={styles.recordingText}>Recording...</Text>
        <Text style={styles.durationText}>{formatDuration(duration)}</Text>

        <View style={styles.recordingControls}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
          >
            <Ionicons name="close" size={24} color="#FF4444" />
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={styles.stopButton}
              onPress={stopRecording}
            >
              <View style={styles.stopIcon} />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  recordingContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    padding: 16,
  },
  recordingBackground: {
    borderRadius: 12,
    padding: 16,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    marginBottom: 16,
    gap: 3,
  },
  wave: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  recordingText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  durationText: {
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    marginBottom: 20,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFE5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
});

export default AudioRecorder;
