// src/contexts/ChatContext.js
import React, { createContext, useContext, useState, useCallback } from 'react';
import { ChatStorageService } from '../services/ChatStorageService';

const ChatContext = createContext();

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const [conversations, setConversations] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refreshConversations = useCallback(async () => {
    try {
      console.log('Refreshing conversations from context...');
      const data = await ChatStorageService.getConversations();
      setConversations(data);
      setLastUpdate(Date.now());
      return data;
    } catch (error) {
      console.error('Error refreshing conversations:', error);
      return [];
    }
  }, []);

  const addOrUpdateConversation = useCallback(async (conversation) => {
    try {
      await ChatStorageService.saveConversation(conversation);
      await refreshConversations();
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  }, [refreshConversations]);

  const deleteConversation = useCallback(async (conversationId) => {
    try {
      await ChatStorageService.deleteConversation(conversationId);
      await refreshConversations();
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }, [refreshConversations]);

  const value = {
    conversations,
    lastUpdate,
    refreshConversations,
    addOrUpdateConversation,
    deleteConversation,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};