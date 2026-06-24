// src/screens/main/components/MessageBubble.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import AudioPlayer from './AudioPlayer';
import MarkdownText from './MarkdownText'; // ADD THIS IMPORT

const MessageBubble = ({ message, isFirstInGroup, isLastInGroup }) => {
  const isUser = message.sender === 'user';

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle both single image and multiple images
  const renderImages = () => {
    if (!message.images && !message.image) return null;

    const images = message.images || [message.image];
    
    return (
      <View style={styles.imagesContainer}>
        {images.map((image, index) => (
          <Image 
            key={index}
            source={{ uri: image.uri || image }} 
            style={styles.messageImage}
            resizeMode="cover"
          />
        ))}
      </View>
    );
  };

  return (
    <View style={[
      styles.messageContainer,
      isUser ? styles.userContainer : styles.aiContainer,
      isFirstInGroup && (isUser ? styles.userFirst : styles.aiFirst),
      isLastInGroup && (isUser ? styles.userLast : styles.aiLast),
    ]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Ionicons name="shield-checkmark" size={26} color={COLORS.primary} />
        </View>
      )}

      <View style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.aiBubble,
      ]}>
        {/* Image Message */}
        {renderImages()}

        {/* Document Attachment */}
        {message.documentName && (
          <View style={styles.documentAttachment}>
            <View style={styles.documentIcon}>
              <Ionicons name="document-text" size={20} color={isUser ? COLORS.white : COLORS.primary} />
            </View>
            <Text
              style={[styles.documentName, isUser ? styles.userText : styles.aiText]}
              numberOfLines={1}
            >
              {message.documentName}
            </Text>
          </View>
        )}

        {/* Audio Message */}
        {message.audioUri && (
          <AudioPlayer 
            uri={message.audioUri}
            duration={message.duration || '0:00'}
            isUser={isUser}
          />
        )}

        {/* Text Message - UPDATED TO USE MARKDOWN */}
        {message.text && (
          <MarkdownText 
            text={message.text}
            style={[
              styles.messageText,
              isUser ? styles.userText : styles.aiText
            ]}
            isUser={isUser}
          />
        )}

        {/* Processing Time for AI Messages */}
        {!isUser && message.processingTime && (
          <Text style={styles.processingTime}>
            Processed in {message.processingTime}s
          </Text>
        )}

        {/* Error Message */}
        {message.isError && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={14} color="#FF6B6B" />
            <Text style={styles.errorText}>Message failed to send</Text>
          </View>
        )}

        <Text style={[
          styles.timestamp,
          isUser ? styles.userTimestamp : styles.aiTimestamp
        ]}>
          {formatTime(message.timestamp || message.createdAt)}
        </Text>
      </View>

      {isUser && <View style={styles.userSpacer} />}
    </View>
  );
};

// ... rest of the styles remain exactly the same
const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 8,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  aiContainer: {
    justifyContent: 'flex-start',
  },
  userFirst: {
    marginTop: 8,
  },
  aiFirst: {
    marginTop: 8,
  },
  userLast: {
    marginBottom: 8,
  },
  aiLast: {
    marginBottom: 18,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
    marginBottom: 4,
    marginLeft: -15,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 18,
    padding: 10,
    marginBottom: -4,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
    marginRight: -40,
  },
  aiBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: -9,
  },
  imagesContainer: {
    gap: 8,
    marginBottom: 8,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  documentAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    gap: 8,
  },
  documentIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: COLORS.white,
  },
  aiText: {
    color: COLORS.textPrimary,
  },
  processingTime: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#FF6B6B',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  userTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  aiTimestamp: {
    color: COLORS.textTertiary,
  },
  userSpacer: {
    width: 40,
  },
});

export default MessageBubble;