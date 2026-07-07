// src/services/SessionService.js
// In-memory only — intentionally NOT persisted to AsyncStorage.
// Clears automatically every time the app process restarts,
// so the user always goes through facility selection fresh.

let _session = null;

export const SessionService = {
  setSession(data)  { _session = { ...data }; },
  getSession()      { return _session; },
  clearSession()    { _session = null; },
  hasFacility()     { return Boolean(_session?.facilityId); },
  getFacilityName() { return _session?.facilityName || ''; },
};
