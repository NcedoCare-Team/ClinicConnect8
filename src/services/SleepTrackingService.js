// src/services/SleepTrackingService.js
// Tracks sleep by monitoring the longest consecutive period of phone inactivity
// that overlaps with nighttime hours. Uses AppState to detect when the phone is
// put down and AsyncStorage to survive app restarts between sleep and wake.

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BG_TIME  = '@ncedo_sleep_bg_timestamp';
const KEY_SLEEP    = '@ncedo_sleep_latest';

const MIN_SLEEP_H   = 2;   // minimum hours inactive to consider as sleep
const MAX_BG_AGE_H  = 24;  // ignore a saved bg timestamp older than this
const NIGHT_START_H = 18;  // 6 PM  — earliest plausible sleep start
const NIGHT_END_H   = 11;  // 11 AM — latest plausible wake time

let _sleepData           = null;
let _listeners           = [];
let _appStateSubscription = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isLikelySleep(startMs, endMs) {
  const durationH = (endMs - startMs) / 3_600_000;
  if (durationH < MIN_SLEEP_H) return false;
  const startH = new Date(startMs).getHours();
  const endH   = new Date(endMs).getHours();
  // Counts as sleep if it started in the evening OR ended in the morning
  return startH >= NIGHT_START_H || endH <= NIGHT_END_H;
}

function _notify(data) {
  _listeners.forEach(cb => { try { cb(data); } catch {} });
}

// ── Core handlers ─────────────────────────────────────────────────────────────
async function _saveBackgroundTime() {
  try {
    await AsyncStorage.setItem(KEY_BG_TIME, String(Date.now()));
  } catch {}
}

async function _checkInactivityAndRecord() {
  try {
    const stored = await AsyncStorage.getItem(KEY_BG_TIME);
    if (!stored) return;

    const bgMs  = parseInt(stored, 10);
    const nowMs = Date.now();

    // Clear immediately so a second wakeup doesn't double-count
    await AsyncStorage.removeItem(KEY_BG_TIME);

    // Ignore stale timestamps (e.g. app was killed days ago)
    if ((nowMs - bgMs) / 3_600_000 > MAX_BG_AGE_H) return;

    if (!isLikelySleep(bgMs, nowMs)) return;

    const hours = Math.round(((nowMs - bgMs) / 3_600_000) * 10) / 10;
    const data  = {
      hours,
      bedtime:   new Date(bgMs).toISOString(),
      wakeTime:  new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    };

    _sleepData = data;
    await AsyncStorage.setItem(KEY_SLEEP, JSON.stringify(data));
    _notify(data);
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────
export const SleepTrackingService = {
  getSleepData: () => _sleepData,

  /** Subscribe to sleep data updates. Returns an unsubscribe function. */
  addListener(cb) {
    _listeners.push(cb);
    return () => { _listeners = _listeners.filter(l => l !== cb); };
  },

  async init() {
    // Restore last calculated sleep session
    try {
      const stored = await AsyncStorage.getItem(KEY_SLEEP);
      if (stored) _sleepData = JSON.parse(stored);
    } catch {}

    // The app may have been killed while in background (e.g. user slept, rebooted).
    // Check right now if there is an unresolved background timestamp.
    await _checkInactivityAndRecord();

    // Listen for future state transitions
    _appStateSubscription = AppState.addEventListener('change', async nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        await _saveBackgroundTime();
      } else if (nextState === 'active') {
        await _checkInactivityAndRecord();
      }
    });
  },

  destroy() {
    _appStateSubscription?.remove();
    _appStateSubscription = null;
    _listeners = [];
  },
};
