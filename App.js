import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ChatProvider } from './src/contexts/ChatContext';
import { FacilityProvider } from './src/contexts/FacilityContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ChatProvider>
      <FacilityProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </FacilityProvider>
    </ChatProvider>
  );
}
