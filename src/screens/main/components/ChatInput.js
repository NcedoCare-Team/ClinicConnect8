// src/screens/main/components/ChatInput.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Text,
  Image,
  ScrollView,
  Platform,
  Alert,
  Keyboard
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AudioRecorder from './AudioRecorder';
import { COLORS } from '../../../constants/colors';

const ChatInput = ({ onSendMessage, disabled }) => {
  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [selectedImages, setSelectedImages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  
  const sendButtonScale = useRef(new Animated.Value(1)).current;
  const mediaButtonRotate = useRef(new Animated.Value(0)).current;

  const maxInputHeight = 120;
  const minInputHeight = 40;

  const buildMessagePayload = () => {
    let type = 'text';
    const payload = {
      text: inputText.trim(),
    };

    if (recordingUri && selectedImages.length > 0) {
      type = 'multimodal';
      payload.audioUri = recordingUri;
      payload.images = selectedImages;
    } else if (recordingUri) {
      type = 'audio';
      payload.audioUri = recordingUri;
    } else if (selectedImages.length > 0) {
      type = 'image';
      payload.images = selectedImages;
    } else if (selectedDocument) {
      type = 'document';
      payload.documentUri = selectedDocument.uri;
      payload.documentName = selectedDocument.name;
      payload.documentMimeType = selectedDocument.mimeType;
    }

    return { type, ...payload };
  };

  const handleSend = async () => {
    if ((!inputText.trim() && selectedImages.length === 0 && !recordingUri && !selectedDocument) || isSending) {
      return;
    }

    setIsSending(true);
    
    const messageContent = buildMessagePayload();
    
    // Clear input IMMEDIATELY
    resetInputState();
    
    try {
      Animated.sequence([
        Animated.timing(sendButtonScale, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(sendButtonScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();

      await onSendMessage(messageContent);
      
    } catch (error) {
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const resetInputState = () => {
    setInputText('');
    setSelectedImages([]);
    setRecordingUri(null);
    setSelectedDocument(null);
    setInputHeight(minInputHeight);
    setShowMediaOptions(false);
    
    // Reset media button rotation to "+" icon
    Animated.spring(mediaButtonRotate, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 5,
    }).start();
    
    Keyboard.dismiss();
  };

  const handleStopRecording = (uri) => {
    setRecordingUri(uri);
    setIsRecording(false);
    
    // Auto-send audio ONLY if no other content
    if (!inputText.trim() && selectedImages.length === 0) {
      const audioMessage = {
        type: 'audio',
        audioUri: uri,
        text: '',
      };
      
      setRecordingUri(null);
      onSendMessage(audioMessage);
    }
  };

  const toggleMediaOptions = () => {
    const toValue = showMediaOptions ? 0 : 1;
    
    Animated.spring(mediaButtonRotate, {
      toValue,
      useNativeDriver: true,
      tension: 50,
      friction: 5,
    }).start();

    setShowMediaOptions(!showMediaOptions);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      maxSelected: 4,
    });

    if (!result.canceled) {
      setSelectedImages([...selectedImages, ...result.assets]);
      
      // Close media options and reset icon to "+"
      setShowMediaOptions(false);
      Animated.spring(mediaButtonRotate, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 5,
      }).start();
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImages([...selectedImages, ...result.assets]);
      
      // Close media options and reset icon to "+"
      setShowMediaOptions(false);
      Animated.spring(mediaButtonRotate, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 5,
      }).start();
    }
  };

  const removeImage = (index) => {
    const updated = selectedImages.filter((_, i) => i !== index);
    setSelectedImages(updated);
    
    // If no images left and media options are open, close them
    if (updated.length === 0 && showMediaOptions) {
      setShowMediaOptions(false);
      Animated.spring(mediaButtonRotate, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 5,
      }).start();
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        setSelectedDocument({
          uri: doc.uri,
          name: doc.name,
          mimeType: doc.mimeType || 'application/pdf',
          size: doc.size,
        });

        // Close media options and reset icon
        setShowMediaOptions(false);
        Animated.spring(mediaButtonRotate, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 5,
        }).start();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  };

  const handleContentSizeChange = (event) => {
    const height = Math.min(
      Math.max(event.nativeEvent.contentSize.height, minInputHeight),
      maxInputHeight
    );
    setInputHeight(height);
  };

  const rotateStyle = {
    transform: [
      {
        rotate: mediaButtonRotate.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '45deg'],
        }),
      },
    ],
  };

  const showAudioButton = !isRecording && !inputText.trim() && !recordingUri;
  const isSendDisabled = isSending || disabled || (!inputText.trim() && selectedImages.length === 0 && !recordingUri && !selectedDocument);

  return (
    <>
      {/* Image Preview Strip */}
      {selectedImages.length > 0 && (
        <ScrollView
          horizontal
          style={styles.imagePreviewStrip}
          showsHorizontalScrollIndicator={false}
        >
          {selectedImages.map((image, index) => (
            <View key={index} style={styles.previewImageContainer}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
              >
                <Ionicons name="close-circle" size={20} color="#FF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Audio Recording Indicator */}
      {recordingUri && !isRecording && (
        <View style={styles.audioRecordedStrip}>
          <Ionicons name="mic-circle" size={20} color={COLORS.primary} />
          <Text style={styles.audioRecordedText}>Audio recorded</Text>
          <TouchableOpacity
            onPress={() => setRecordingUri(null)}
            style={styles.removeAudioButton}
          >
            <Ionicons name="close-circle" size={18} color="#FF4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Document Preview Strip */}
      {selectedDocument && (
        <View style={styles.audioRecordedStrip}>
          <Ionicons name="document-text" size={20} color={COLORS.primary} />
          <Text style={styles.audioRecordedText} numberOfLines={1}>
            {selectedDocument.name}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedDocument(null)}
            style={styles.removeAudioButton}
          >
            <Ionicons name="close-circle" size={18} color="#FF4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Audio Recording UI */}
      {isRecording && (
        <AudioRecorder
          onStopRecording={handleStopRecording}
          onCancel={() => setIsRecording(false)}
        />
      )}

      {/* Main Input Container */}
      <View style={[styles.container, { paddingBottom: keyboardVisible ? 16 : 40 }]}>
        <View style={styles.inputWrapper}>
          {/* Media Button */}
          {!isRecording && (
            <Animated.View style={rotateStyle}>
              <TouchableOpacity
                style={styles.mediaButton}
                onPress={toggleMediaOptions}
                disabled={isSending || disabled}
                accessibilityLabel="Add media"
              >
                <Ionicons 
                  name={showMediaOptions ? "close" : "add"} 
                  size={24} 
                  color={COLORS.primary} 
                />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Text Input */}
          <TextInput
            style={[styles.textInput, { height: Math.max(40, inputHeight) }]}
            placeholder="Type your message..."
            placeholderTextColor="#9B9B9B"
            value={inputText}
            onChangeText={setInputText}
            multiline
            onContentSizeChange={handleContentSizeChange}
            editable={!disabled && !isRecording && !isSending}
            maxLength={1000}
            accessibilityLabel="Message input"
          />

          {/* Send Button - Show when there's content to send */}
          {!isRecording && (inputText.trim() || selectedImages.length > 0 || recordingUri || selectedDocument) && (
            <Animated.View style={{ transform: [{ scale: sendButtonScale }] }}>
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  isSendDisabled && styles.sendButtonDisabled
                ]}
                onPress={handleSend}
                disabled={isSendDisabled}
                accessibilityLabel="Send message"
                accessibilityRole="button"
              >
                <Ionicons 
                  name="send" 
                  size={20} 
                  color={isSendDisabled ? "#9B9B9B" : "#FFFFFF"} 
                />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Audio Button - Allow with images, but not with text */}
          {showAudioButton && (
            <TouchableOpacity
              style={styles.audioButton}
              onPress={() => setIsRecording(true)}
              disabled={isSending || disabled}
              accessibilityLabel="Record audio"
            >
              <MaterialIcons name="mic" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Media Options */}
        {showMediaOptions && (
          <View style={styles.mediaOptions}>
            <TouchableOpacity
              style={styles.mediaOption}
              onPress={pickImage}
              accessibilityLabel="Choose from gallery"
            >
              <View style={styles.mediaIconContainer}>
                <Ionicons name="image" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.mediaOptionText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mediaOption}
              onPress={takePhoto}
              accessibilityLabel="Take photo"
            >
              <View style={[styles.mediaIconContainer, { backgroundColor: '#FF6B6B' }]}>
                <Ionicons name="camera" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.mediaOptionText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mediaOption}
              onPress={pickDocument}
              accessibilityLabel="Upload document"
            >
              <View style={[styles.mediaIconContainer, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="document-text" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.mediaOptionText}>Document</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 105 : 105,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#2E2E2E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    lineHeight: 20,
  },
  mediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#E0E0E0',
    shadowOpacity: 0,
  },
  audioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  mediaOptions: {
    flexDirection: 'row',
    paddingTop: 12,
    gap: 16,
  },
  mediaOption: {
    alignItems: 'center',
  },
  mediaIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mediaOptionText: {
    fontSize: 12,
    color: '#6B6B6B',
    fontWeight: '500',
  },
  imagePreviewStrip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  previewImageContainer: {
    marginRight: 8,
    position: 'relative',
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  audioRecordedStrip: {
    backgroundColor: '#F0FFF0',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  audioRecordedText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  removeAudioButton: {
    padding: 4,
  },
});

export default ChatInput;