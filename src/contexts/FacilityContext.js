// src/contexts/FacilityContext.js
// Shares the patient's selected healthcare facility across the app.
// Backed by SessionService (AsyncStorage per user).

import React, {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { SessionService } from '../services/SessionService';

const FacilityContext = createContext(null);

export const useFacility = () => {
  const ctx = useContext(FacilityContext);
  if (!ctx) throw new Error('useFacility must be used within a FacilityProvider');
  return ctx;
};

export const FacilityProvider = ({ children }) => {
  const [session, setSessionState] = useState(null);
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(async (uid) => {
    if (!uid) {
      setSessionState(null);
      setReady(true);
      return;
    }
    setReady(false);
    const loaded = await SessionService.loadForUser(uid);
    setSessionState(loaded);
    setReady(true);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      hydrate(user?.uid);
    });
    return unsub;
  }, [hydrate]);

  const setFacilitySession = useCallback(async (data) => {
    await SessionService.setSession(data);
    setSessionState(SessionService.getSession());
  }, []);

  const clearFacility = useCallback(async () => {
    await SessionService.clearSession();
    setSessionState(null);
  }, []);

  const value = {
    session,
    ready,
    facilityName: session?.facilityName || '',
    hasFacility: Boolean(session?.facilityId || session?.facilityName),
    setFacilitySession,
    clearFacility,
    refresh: () => hydrate(auth.currentUser?.uid),
  };

  return (
    <FacilityContext.Provider value={value}>
      {children}
    </FacilityContext.Provider>
  );
};
