// src/screens/main/components/AudioPlayer.js
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const AudioPlayer = ({ uri, duration, isUser }) => {
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const rewoundRef = useRef(false);

  useEffect(() => {
    if (status.didJustFinish && !rewoundRef.current) {
      rewoundRef.current = true;
      player.seekTo(0);
    }
    if (status.playing) rewoundRef.current = false;
  }, [player, status.didJustFinish, status.playing]);

  const playSound = async () => {
    if (!player.isLoaded) return;
    if (status.playing) {
      player.pause();
      return;
    }
    const atEnd = status.duration > 0 && status.currentTime >= status.duration - 0.05;
    if (atEnd) await player.seekTo(0);
    player.play();
  };

  const formatTime = (millis) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const positionMs = (status.currentTime || 0) * 1000;
  const durationMs = (status.duration || 0) * 1000;
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity
        style={[styles.playButton, isUser && styles.userPlayButton]}
        onPress={playSound}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={20}
          color={isUser ? COLORS.white : COLORS.primary}
        />
      </TouchableOpacity>

      <View style={styles.audioInfo}>
        <View style={styles.waveformContainer}>
          {[...Array(15)].map((_, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: 4 + Math.random() * 12,
                  backgroundColor: isUser ? 'rgba(255, 255, 255, 0.5)' : '#D0D0D0',
                },
              ]}
            />
          ))}
        </View>
        
        <View
          style={[
            styles.progressBar,
            { width: `${progress * 100}%` },
          ]}
        />
        
        <Text style={[styles.audioDuration, isUser && styles.userAudioDuration]}>
          {formatTime(positionMs)} / {durationMs > 0 ? formatTime(durationMs) : (duration || '0:00')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  audioPlayerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    minWidth: 200,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22, 179, 165, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userPlayButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  audioInfo: {
    flex: 1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
    marginBottom: 4,
  },
  waveformBar: {
    width: 2,
    borderRadius: 1,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  audioDuration: {
    fontSize: 11,
    color: '#6B6B6B',
    marginTop: 4,
  },
  userAudioDuration: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
});

export default AudioPlayer;
