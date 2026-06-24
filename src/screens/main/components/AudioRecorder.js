// src/screens/main/components/AudioRecorder.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Audio }         from 'expo-av';           
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../../constants/colors';

const AudioRecorder = ({ onStopRecording, onCancel }) => {
  const [recording, setRecording] = useState(null);
  const [duration, setDuration] = useState(0);
  const [soundWaves] = useState([...Array(20)].map(() => useRef(new Animated.Value(0.3)).current));
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    startRecording();
    animateWaves();
    animatePulse();

    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);

      // Update duration
      const interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) {
          clearInterval(interval);
        }
      });
    } catch (err) {
      console.error('Recording error:', err);
      onCancel();
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      onStopRecording(uri); // This will trigger auto-send
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