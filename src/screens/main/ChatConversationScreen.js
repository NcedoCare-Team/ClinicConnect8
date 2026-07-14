import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  ActivityIndicator,
  Alert,
  StatusBar,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, addDoc, doc, onSnapshot, serverTimestamp, query, where, orderBy, getDocs } from 'firebase/firestore';
import { auth, firestore } from '../../../firebase';
import { COLORS } from '../../constants/colors';
import { COLLECTIONS } from '../../services/firestorePaths';
import ApiService from '../../services/ApiService';
import { ChatStorageService } from '../../services/ChatStorageService';
import { SessionService } from '../../services/SessionService';
import { estimateWaitMinutes, formatWaitMinutes, sortQueueByUrgency } from '../../utils/queueWait';
import MessageBubble from './components/MessageBubble';
import ChatInput from './components/ChatInput';

export default function ChatConversationScreen({ route, navigation }) {
  const { conversationId: initialConversationId, conversationTitle: initialTitle } = route.params || {};
  
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [conversationTitle, setConversationTitle] = useState(initialTitle);
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [caseStatus, setCaseStatus] = useState(null);
  const [patientCalled, setPatientCalled] = useState(false);

  const flatListRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(100)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const contextSentRef = useRef(false);
  const caseUnsubRef = useRef(null);
  const completionHandledRef = useRef(false);

  // Chat is locked from the moment a case is submitted until the facility completes it
  const caseLocked = Boolean(activeCaseId) && caseStatus !== 'completed';

  useEffect(() => {
    loadMessages();
    
    // Slide in from right animation
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();

    // Hide the default header
    navigation.setOptions({
      headerShown: false,
    });

    return () => {
      if (caseUnsubRef.current) caseUnsubRef.current();
    };
  }, []);

  // Restore any active case tied to this conversation and watch its status
  useEffect(() => {
    (async () => {
      if (!conversationId) return;
      const conversation = await ChatStorageService.getConversation(conversationId);
      if (conversation?.activeCaseId) {
        setActiveCaseId(conversation.activeCaseId);
        contextSentRef.current = true;
      }
    })();
  }, [conversationId]);

  // Live status of the submitted case — unlocks the chat when the facility completes it
  useEffect(() => {
    if (caseUnsubRef.current) {
      caseUnsubRef.current();
      caseUnsubRef.current = null;
    }
    if (!activeCaseId) {
      setCaseStatus(null);
      return;
    }

    const caseRef = doc(firestore, COLLECTIONS.TRIAGE_CASES, activeCaseId);
    caseUnsubRef.current = onSnapshot(
      caseRef,
      (snap) => {
        if (!snap.exists()) {
          setCaseStatus('completed');
          setPatientCalled(false);
          return;
        }
        const data = snap.data() || {};
        const status = data.status || 'queued';
        setCaseStatus(status);
        setPatientCalled(Boolean(data.patientCalledAt || data.patientNotified));
        if (status === 'completed') {
          markCaseCompleted();
        }
      },
      (err) => {
        console.log('[Triage] case listener error:', err.message);
        setCaseStatus('queued');
        setPatientCalled(false);
      }
    );

    return () => {
      if (caseUnsubRef.current) {
        caseUnsubRef.current();
        caseUnsubRef.current = null;
      }
    };
  }, [activeCaseId]);

  const markCaseCompleted = async () => {
    if (!conversationId || completionHandledRef.current) return;
    completionHandledRef.current = true;
    const conversation = await ChatStorageService.getConversation(conversationId);
    if (conversation?.activeCaseId) {
      await ChatStorageService.saveConversation({
        ...conversation,
        activeCaseId: null,
        lastCaseId: conversation.activeCaseId,
      });
    }

    const completionMessage = {
      id: generateUniqueId(),
      type: 'text',
      text: 'Your visit for this case has been completed by your healthcare facility. You can start a new assessment anytime if you need further help.',
      timestamp: new Date().toISOString(),
      sender: 'ai',
    };
    await ChatStorageService.addMessage(conversationId, completionMessage);
    const updated = await ChatStorageService.getMessages(conversationId);
    setMessages(updated);
    setActiveCaseId(null);
    contextSentRef.current = false;
  };

  useEffect(() => {
    if (typing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
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
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [typing]);

  const loadMessages = async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    
    try {
      setLoading(true);
      const data = await ChatStorageService.getMessages(conversationId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const generateUniqueId = () => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const createNewConversation = async () => {
    const newConversationId = `conv_${Date.now()}`;
    const newConversation = {
      id: newConversationId,
      title: 'Health Assessment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: '',
      messageCount: 0,
      archived: false,
    };

    await ChatStorageService.saveConversation(newConversation);
    return newConversationId;
  };

  const updateConversationInfo = async (lastMessage, newTitle = null) => {
    if (!conversationId) return;

    const conversation = await ChatStorageService.getConversation(conversationId);
    if (conversation) {
      const updates = {
        lastMessage: lastMessage?.text || lastMessage?.documentName || 'Image/Audio message',
        updatedAt: new Date().toISOString(),
        messageCount: messages.length + 1,
      };

      if (newTitle) {
        updates.title = newTitle;
        setConversationTitle(newTitle);
      }

      await ChatStorageService.saveConversation({
        ...conversation,
        ...updates
      });
    }
  };

  const buildPatientContext = () => {
    // POPIA: never send name, ID, phone, email, or facility-bound identity to the AI.
    // Age (years) is the only demographic allowed for clinical context.
    const session = SessionService.getSession();
    const age = session?.patientAge;
    if (typeof age === 'number' && age > 0 && age < 130) {
      return `POPIA: No identifying patient details. Age only (years): ${Math.round(age)}. Use symptoms and age for clinical guidance; do not request or store the patient's name, ID, phone, or address.`;
    }
    return 'POPIA: No identifying patient details. Use symptom history only. Age unknown.';
  };

  const handleSend = async (messageContent) => {
    if (caseLocked) return;

    let currentConversationId = conversationId;

    if (!currentConversationId) {
      currentConversationId = await createNewConversation();
      setConversationId(currentConversationId);
    }

    const userMessage = {
      id: generateUniqueId(),
      ...messageContent,
      timestamp: new Date().toISOString(),
      sender: 'user'
    };

    await ChatStorageService.addMessage(currentConversationId, userMessage);
    
    const updatedMessages = await ChatStorageService.getMessages(currentConversationId);
    setMessages(updatedMessages);
    
    await updateConversationInfo(messageContent);
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    await getAIResponse(messageContent, currentConversationId);
  };

  const getAIResponse = async (userMessage, currentConvId) => {
    setTyping(true);
    
    let aiResponseMessage = null;
    let finalTriage = null;
    
    try {
      // Patient context goes with the first message of the interview only
      const patientContext = contextSentRef.current ? '' : buildPatientContext();

      const response = await ApiService.sendTriageChatMessage(
        userMessage.text || 'The patient sent a non-text message. Ask them to describe their symptoms in words.',
        currentConvId,
        patientContext,
      );

      if (response.success && response.data) {
        contextSentRef.current = true;
        aiResponseMessage = {
          id: generateUniqueId(),
          type: 'text',
          text: response.data.response,
          timestamp: new Date().toISOString(),
          sender: 'ai',
          processingTime: response.data.processing_time,
          isError: false
        };

        if (response.data.phase === 'final' && response.data.triage) {
          finalTriage = response.data.triage;
        }
      } else {
        aiResponseMessage = {
          id: generateUniqueId(),
          type: 'text',
          text: response.message || 'Sorry, I encountered an issue. Please try again.',
          timestamp: new Date().toISOString(),
          sender: 'ai',
          isError: true
        };
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      aiResponseMessage = {
        id: generateUniqueId(),
        type: 'text',
        text: 'Unable to connect to the AI service. Please check your internet connection and try again.',
        timestamp: new Date().toISOString(),
        sender: 'ai',
        isError: true
      };
    } finally {
      setTyping(false);
    }

    if (aiResponseMessage) {
      await ChatStorageService.addMessage(currentConvId, aiResponseMessage);
      
      const updatedMessages = await ChatStorageService.getMessages(currentConvId);
      setMessages(updatedMessages);
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }

    // The doctor reached a confident decision — submit the case to the facility
    if (finalTriage) {
      await submitFinalCase(finalTriage, currentConvId);
    }
  };

  // Save the AI's final validated decision to Firestore and lock the chat.
  const submitFinalCase = async (triage, currentConvId) => {
    const session = SessionService.getSession();
    const uid = auth.currentUser?.uid;
    let caseId = null;
    let waitMins = estimateWaitMinutes(triage.priority || 'MEDIUM', 0);

    if (uid) {
      try {
        const aiPriority = triage.priority || 'MEDIUM';
        // Count facility queue so wait is based on patients ahead — never AI "1 hour" guesses
        let aheadCount = 0;
        try {
          if (session?.facilityId) {
            const q = query(
              collection(firestore, COLLECTIONS.TRIAGE_CASES),
              where('facilityId', '==', session.facilityId),
              orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            const active = sortQueueByUrgency(
              snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((c) => c.status === 'queued' || c.status === 'in_review')
            );
            aheadCount = active.length; // new case joins after current queue
          }
        } catch (e) {
          console.log('[Triage] queue count skipped:', e.message);
        }
        waitMins = estimateWaitMinutes(aiPriority, aheadCount);
        const waitLabel = formatWaitMinutes(waitMins);
        const ref = await addDoc(collection(firestore, COLLECTIONS.TRIAGE_CASES), {
          patientId: uid,
          patientName: [session?.patientFirstName, session?.patientSurname].filter(Boolean).join(' '),
          facilityId: session?.facilityId || '',
          facilityName: session?.facilityName || '',
          chiefComplaint: triage.chiefComplaint || '',
          symptoms: triage.symptomsSummary || '',
          priority: aiPriority,
          aiPriority,
          riskScore: triage.riskScore ?? 50,
          confidence: triage.confidence ?? 50,
          reasoning: triage.reasoning || '',
          riskIndicators: triage.riskIndicators || [],
          recommendedAction: triage.recommendedAction || '',
          estimatedWaitMinutes: waitMins,
          estimatedWait: waitLabel,
          queuePosition: aheadCount + 1,
          waitUpdatedAt: serverTimestamp(),
          source: 'ai_interview',
          conversationId: currentConvId,
          status: 'queued',
          createdAt: serverTimestamp(),
        });
        caseId = ref.id;
      } catch (err) {
        console.log('[Triage] Firestore save error:', err.message);
      }
    }

    // Notify the patient their case was transferred, then lock the chat.
    // Do not expose triage colour / priority — that is for clinical staff only.
    const facilityName = session?.facilityName || 'your healthcare facility';
    const transferMessage = {
      id: generateUniqueId(),
      type: 'text',
      text: caseId
        ? `Your assessment has been transferred to ${facilityName}. You are now in the queue — the care team will call you when they are ready. This chat is paused until your visit is completed.`
        : `Your assessment is complete, but we could not reach ${facilityName} right now. Please speak to reception when you arrive, or try again once you are back online.`,
      timestamp: new Date().toISOString(),
      sender: 'ai',
      isSystemNotice: true,
    };
    await ChatStorageService.addMessage(currentConvId, transferMessage);
    const updated = await ChatStorageService.getMessages(currentConvId);
    setMessages(updated);

    if (caseId) {
      const conversation = await ChatStorageService.getConversation(currentConvId);
      if (conversation) {
        await ChatStorageService.saveConversation({
          ...conversation,
          activeCaseId: caseId,
          title: triage.chiefComplaint || conversation.title,
        });
      }
      if (triage.chiefComplaint) setConversationTitle(triage.chiefComplaint);
      completionHandledRef.current = false;
      setActiveCaseId(caseId);
      setCaseStatus('queued');
    }

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);

    // Show the structured result screen on top of the locked chat
    navigation.navigate('TriageResult', {
      priority: triage.priority || 'MEDIUM',
      riskScore: triage.riskScore,
      confidence: triage.confidence,
      reasoning: triage.reasoning,
      riskIndicators: triage.riskIndicators,
      recommendedAction: triage.recommendedAction,
      estimatedWait: formatWaitMinutes(waitMins),
      symptoms: (triage.symptomsSummary || '').slice(0, 400),
      caseId,
    });
  };

  const handleBack = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Slide out to right animation
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      navigation.goBack();
    });
  };

  const clearConversation = async () => {
    if (!conversationId) return;
    
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to clear all messages in this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await ChatStorageService.clearMessages(conversationId);
            setMessages([]);

            // Reset the doctor interview on the server so a fresh one starts
            ApiService.clearChatSession(conversationId).catch(() => {});
            if (!caseLocked) contextSentRef.current = false;

            const conversation = await ChatStorageService.getConversation(conversationId);
            if (conversation) {
              await ChatStorageService.saveConversation({
                ...conversation,
                lastMessage: '',
                messageCount: 0,
                updatedAt: new Date().toISOString(),
              });
            }
          },
        },
      ]
    );
  };

  const renderMessage = ({ item, index }) => {
    const isFirstInGroup = index === 0 || messages[index - 1]?.sender !== item.sender;
    const isLastInGroup = index === messages.length - 1 || messages[index + 1]?.sender !== item.sender;

    return (
      <MessageBubble
        message={item}
        isFirstInGroup={isFirstInGroup}
        isLastInGroup={isLastInGroup}
      />
    );
  };

  const renderTypingIndicator = () => {
    if (!typing) return null;

    return (
      <View style={styles.typingContainer}>
        <View style={styles.typingContent}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
        <Text style={styles.typingText}>AI is thinking...</Text>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>
        {conversationId ? 'No messages yet' : 'Start a conversation'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {conversationId
          ? 'Send a message to start your health assessment with NcedoCare AI'
          : 'Describe how you feel — symptoms, duration, and any concerns'}
      </Text>

      <View style={styles.suggestionContainer}>
        <Text style={styles.suggestionTitle}>Try asking:</Text>
        {[
          'I have had a fever and cough for two days',
          'I feel chest tightness when I walk',
          'Can you help me understand my symptoms?',
        ].map((suggestion, index) => (
          <TouchableOpacity
            key={index}
            style={styles.suggestionChip}
            onPress={() => handleSend({ type: 'text', text: suggestion })}
          >
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {conversationId && messages.length === 0 && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={clearConversation}
        >
          <Text style={styles.clearButtonText}>Clear Conversation</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Animated.View style={[
      styles.container, 
      { transform: [{ translateX: slideAnim }] }
    ]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* Professional Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[COLORS.background, COLORS.backgroundSecondary]}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            {/* Back Button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <View style={styles.backButtonInner}>
                <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
              </View>
            </TouchableOpacity>

            {/* AI Logo & Branding */}
            <View style={styles.brandingSection}>
              <Animated.View style={[
                styles.aiLogoContainer,
                { transform: [{ scale: pulseAnim }] }
              ]}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  style={styles.aiLogoGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons
                    name="medical"
                    size={26}
                    color={COLORS.white}
                  />
                </LinearGradient>
                <View style={styles.logoShadow} />
              </Animated.View>

              <View style={styles.brandTextContainer}>
                <View style={styles.brandNameRow}>
                  <Text style={styles.brandNameText}>NcedoCare</Text>
                  <View style={styles.aiChip}>
                    <Text style={styles.aiChipText}>AI</Text>
                  </View>
                </View>
                <Text style={styles.conversationTitleText} numberOfLines={1}>
                  {conversationTitle || 'Health Assessment'}
                </Text>
              </View>
            </View>

            {/* Right: case status when submitted, consultation status otherwise */}
            <View style={styles.statusSection}>
              {caseLocked ? (
                <View style={styles.casePill}>
                  <Ionicons
                    name={patientCalled ? 'notifications' : 'business'}
                    size={12}
                    color={patientCalled ? COLORS.success || '#16A34A' : COLORS.warning}
                  />
                  <Text style={styles.casePillText}>
                    {patientCalled
                      ? 'Please come in'
                      : caseStatus === 'in_review'
                        ? 'Under process'
                        : 'In queue'}
                  </Text>
                </View>
              ) : (
                <View style={styles.statusPill}>
                  <View style={[styles.statusDot, typing && styles.statusDotThinking]} />
                  <Text style={[styles.statusText, typing && styles.statusTextThinking]}>
                    {typing ? 'Thinking' : 'Online'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Header Shadow */}
        <View style={styles.headerShadow} />
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={!loading ? renderEmptyState : null}
          ListFooterComponent={renderTypingIndicator}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        {caseLocked ? (
          <View style={styles.lockedBar}>
            <View style={styles.lockedIconWrap}>
              <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedTitle}>
                {patientCalled
                  ? 'Please come in'
                  : 'Case sent to your facility'}
              </Text>
              <Text style={styles.lockedSub}>
                {patientCalled
                  ? 'A nurse is ready for you — proceed to triage / reception.'
                  : caseStatus === 'in_review'
                    ? 'Your assessment is under process. Track your journey for live updates.'
                    : 'You are in the queue. The chat unlocks when your visit is completed.'}
              </Text>
            </View>
          </View>
        ) : (
          <ChatInput
            onSendMessage={handleSend}
            disabled={typing}
          />
        )}
      </KeyboardAvoidingView>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  
  // Professional Header Styles
  headerContainer: {
    backgroundColor: COLORS.background,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerShadow: {
    height: 1,
    backgroundColor: COLORS.border,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  // Back Button
  backButton: {
    marginRight: 12,
  },
  backButtonInner: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },

  // Branding Section
  brandingSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiLogoContainer: {
    position: 'relative',
    marginRight: 12,
  },
  aiLogoGradient: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoShadow: {
    position: 'absolute',
    bottom: -4,
    left: 4,
    right: 4,
    height: 8,
    backgroundColor: COLORS.primary,
    opacity: 0.15,
    borderRadius: 14,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  brandTextContainer: {
    flex: 1,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  brandNameText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  aiChip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.primaryVeryLight,
    borderRadius: 6,
  },
  aiChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  conversationTitleText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
    letterSpacing: -0.1,
  },

  // Case status pill (chat locked while case is at the facility)
  casePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.warningLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },
  casePillText: { fontSize: 11, fontWeight: '800', color: COLORS.warning },

  // Locked input bar
  lockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 105 : 105,
  },
  lockedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryVeryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 2 },
  lockedSub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 },

  // Status Section
  statusSection: {
    marginLeft: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.success,
    marginRight: 6,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  statusDotThinking: {
    backgroundColor: COLORS.warning,
    shadowColor: COLORS.warning,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
    letterSpacing: 0.2,
  },
  statusTextThinking: {
    color: COLORS.warning,
  },

  // Chat Container
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexGrow: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  typingContent: {
    marginRight: 12,
  },
  typingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 100,
  },
  emptyIconWrapper: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestionContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  suggestionTitle: {
    fontSize: 13,
    color: COLORS.textTertiary,
    fontWeight: '500',
    marginBottom: 12,
  },
  suggestionChip: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  suggestionText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
    textAlign: 'center',
  },
  clearButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.error + '20',
    borderRadius: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: COLORS.error,
    fontWeight: '500',
  },
});