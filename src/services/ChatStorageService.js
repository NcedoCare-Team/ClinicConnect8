// src/services/ChatStorageService.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  CONVERSATIONS: '@visionally_conversations',
  MESSAGES: '@visionally_messages_',
};

export const ChatStorageService = {
  // Get all conversations
  getConversations: async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      const conversations = data ? JSON.parse(data) : [];
      
      // Sort by updatedAt (newest first)
      return conversations.sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  },

  // Save a single conversation (add or update)
  saveConversation: async (conversation) => {
    try {
      const conversations = await ChatStorageService.getConversations();
      
      // Check if conversation already exists
      const existingIndex = conversations.findIndex(c => c.id === conversation.id);
      
      if (existingIndex >= 0) {
        // Update existing conversation
        conversations[existingIndex] = {
          ...conversations[existingIndex],
          ...conversation,
          updatedAt: new Date().toISOString(),
        };
      } else {
        // Add new conversation
        conversations.unshift({
          ...conversation,
          createdAt: conversation.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.CONVERSATIONS,
        JSON.stringify(conversations)
      );
      return true;
    } catch (error) {
      console.error('Error saving conversation:', error);
      return false;
    }
  },

  // Get a specific conversation by ID
  getConversation: async (conversationId) => {
    try {
      const conversations = await ChatStorageService.getConversations();
      return conversations.find(c => c.id === conversationId) || null;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  },

  // Delete a conversation and its messages
  deleteConversation: async (conversationId) => {
    try {
      // Delete messages first
      await AsyncStorage.removeItem(`${STORAGE_KEYS.MESSAGES}${conversationId}`);
      
      // Remove from conversations list
      const conversations = await ChatStorageService.getConversations();
      const updatedConversations = conversations.filter(c => c.id !== conversationId);
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.CONVERSATIONS,
        JSON.stringify(updatedConversations)
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  },

  // Archive/unarchive conversation
  archiveConversation: async (conversationId, archived) => {
    try {
      const conversations = await ChatStorageService.getConversations();
      const conversation = conversations.find(c => c.id === conversationId);
      
      if (conversation) {
        conversation.archived = archived;
        conversation.updatedAt = new Date().toISOString();
        
        await AsyncStorage.setItem(
          STORAGE_KEYS.CONVERSATIONS,
          JSON.stringify(conversations)
        );
      }

      return true;
    } catch (error) {
      console.error('Error archiving conversation:', error);
      return false;
    }
  },

  // Get messages for a specific conversation
  getMessages: async (conversationId) => {
    try {
      const data = await AsyncStorage.getItem(`${STORAGE_KEYS.MESSAGES}${conversationId}`);
      const messages = data ? JSON.parse(data) : [];
      
      // Sort by timestamp (oldest first for display)
      return messages.sort((a, b) => 
        new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
      );
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  },

  // Save messages for a specific conversation
  saveMessages: async (conversationId, messages) => {
    try {
      await AsyncStorage.setItem(
        `${STORAGE_KEYS.MESSAGES}${conversationId}`,
        JSON.stringify(messages)
      );
      return true;
    } catch (error) {
      console.error('Error saving messages:', error);
      return false;
    }
  },

  // Add a single message to a conversation
  addMessage: async (conversationId, message) => {
    try {
      const messages = await ChatStorageService.getMessages(conversationId);
      messages.push(message);
      
      await ChatStorageService.saveMessages(conversationId, messages);
      
      // Update conversation's last message and timestamp
      const conversation = await ChatStorageService.getConversation(conversationId);
      if (conversation) {
        conversation.lastMessage = message.text || 'Image/Audio message';
        conversation.updatedAt = new Date().toISOString();
        conversation.messageCount = messages.length;
        
        await ChatStorageService.saveConversation(conversation);
      }
      
      return true;
    } catch (error) {
      console.error('Error adding message:', error);
      return false;
    }
  },

  // Clear all messages for a conversation
  clearMessages: async (conversationId) => {
    try {
      await AsyncStorage.removeItem(`${STORAGE_KEYS.MESSAGES}${conversationId}`);
      return true;
    } catch (error) {
      console.error('Error clearing messages:', error);
      return false;
    }
  },

  // Get conversation count
  getConversationCount: async () => {
    const conversations = await ChatStorageService.getConversations();
    return conversations.length;
  },

  // Search conversations
  searchConversations: async (query) => {
    const conversations = await ChatStorageService.getConversations();
    const searchTerm = query.toLowerCase();
    
    return conversations.filter(conv => 
      conv.title?.toLowerCase().includes(searchTerm) ||
      conv.lastMessage?.toLowerCase().includes(searchTerm)
    );
  },

  // Get recent conversations (last 7 days)
  getRecentConversations: async (days = 7) => {
    const conversations = await ChatStorageService.getConversations();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return conversations.filter(conv => 
      new Date(conv.updatedAt) > cutoffDate
    );
  },
};