// src/services/InterviewStorageService.js
// Persists completed interview sessions to expo AsyncStorage.
// Each session stores the full interaction transcript, AI feedback,
// and metadata so the user can replay and review past interviews.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SESSIONS_LIST:  '@visionally_interview_sessions',  // Array of session IDs (newest first)
  SESSION_PREFIX: '@visionally_session_',             // + sessionId → full session object
  ABOUT_ME_CACHE: '@visionally_about_me_cache',       // Local mirror of Firestore profile
};

// ─── Types (JSDoc) ───────────────────────────────────────────────────────────
/**
 * @typedef  {object} QAExchange
 * @property {number} questionIndex  - 1-4
 * @property {string} question       - AI question text
 * @property {string} userAnswer     - Transcribed / summarised user response
 * @property {string} feedback       - AI feedback for that answer
 */

/**
 * @typedef  {object} InterviewSession
 * @property {string}       id            - Unique session ID
 * @property {string}       role          - Job role (from job context or "General Practice")
 * @property {string}       company       - Company name (from job context or "—")
 * @property {string}       date          - Human-readable date string
 * @property {string}       duration      - e.g. "18 min"
 * @property {number|null}  score         - 0–100 or null if not calculated yet
 * @property {'completed'|'incomplete'} status
 * @property {string[]}     tags          - Skill tags derived from the session
 * @property {string}       feedback      - Combined short summary feedback
 * @property {boolean}      isFavorite
 * @property {string}       scoreColor    - Hex color for score ring
 * @property {QAExchange[]} exchanges     - Full Q&A transcript
 * @property {string}       systemPrompt  - System instruction used (for replay context)
 * @property {number}       createdAt     - Unix timestamp ms
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function scoreToColor(score) {
  if (!score) return '#6B7280';
  if (score >= 80)  return '#10B981'; // green
  if (score >= 60)  return '#F59E0B'; // amber
  return '#EF4444';                   // red
}

/**
 * Derives a 0–100 score from the Q&A exchanges.
 * Simple heuristic: average of per-answer scores the AI embeds in feedback,
 * or a default mid-range if none are found.
 */
function deriveScore(exchanges) {
  if (!exchanges || exchanges.length === 0) return null;
  // AI feedback often contains phrases like "8/10" or "strong". We do a simple
  // character-count proxy: longer, more coherent answers score higher.
  const base = exchanges.reduce((sum, ex) => {
    const words = (ex.userAnswer ?? '').split(' ').filter(Boolean).length;
    return sum + Math.min(100, 50 + Math.floor(words / 2));
  }, 0);
  return Math.round(base / exchanges.length);
}

/**
 * Extracts relevant skill tags from the Q&A content.
 */
function deriveTags(exchanges, profile) {
  const tags = [];
  if (profile?.skills?.length) tags.push(...profile.skills.filter(Boolean).slice(0, 2));
  if (profile?.careerGoal) tags.push(profile.careerGoal.split(' ')[0]);
  return [...new Set(tags)].slice(0, 3);
}

// ─── Service ─────────────────────────────────────────────────────────────────
export const InterviewStorageService = {

  // ── Save a completed session ────────────────────────────────────────────────
  /**
   * @param {object} opts
   * @param {QAExchange[]} opts.exchanges
   * @param {object}  opts.profile       - About Me profile used in this session
   * @param {string}  opts.jobRole       - Role from job context
   * @param {string}  opts.jobCompany    - Company from job context
   * @param {string}  opts.systemPrompt  - Full system instruction used
   * @param {number}  opts.durationMs    - Session duration in milliseconds
   * @param {'completed'|'incomplete'} opts.status
   * @returns {Promise<string>}          - Session ID
   */
  async saveSession({ exchanges, profile, jobRole, jobCompany, systemPrompt, durationMs, status, audioUri, feedbackReport }) {
    try {
      const id      = generateSessionId();
      const now     = new Date();
      const score   = feedbackReport?.score ?? (status === 'completed' ? deriveScore(exchanges) : null);
      const tags    = deriveTags(exchanges, profile);

      // Build a concise combined feedback from all AI feedback texts
      const allFeedback = (exchanges ?? []).map(e => e.feedback).filter(Boolean);
      const combinedFeedback = feedbackReport?.generalAssessment
        || (allFeedback.length ? allFeedback[allFeedback.length - 1] : 'Session recorded.');

      /** @type {InterviewSession} */
      const session = {
        id,
        role:         jobRole    || 'General Practice',
        company:      jobCompany || '—',
        date:         formatDate(now),
        duration:     durationMs ? formatDuration(durationMs) : '—',
        score,
        status,
        tags,
        feedback:     combinedFeedback,
        isFavorite:   false,
        scoreColor:   scoreToColor(score),
        exchanges:    exchanges ?? [],
        systemPrompt: systemPrompt ?? '',
        audioUri:     audioUri ?? null,
        feedbackReport: feedbackReport ?? null,
        createdAt:    now.getTime(),
      };

      // Write session object
      await AsyncStorage.setItem(
        KEYS.SESSION_PREFIX + id,
        JSON.stringify(session),
      );

      // Prepend ID to list
      const existingRaw  = await AsyncStorage.getItem(KEYS.SESSIONS_LIST);
      const existingList = existingRaw ? JSON.parse(existingRaw) : [];
      existingList.unshift(id);
      await AsyncStorage.setItem(KEYS.SESSIONS_LIST, JSON.stringify(existingList));

      return id;
    } catch (err) {
      console.log('[InterviewStorage] saveSession error:', err);
      throw err;
    }
  },

  // ── Load all sessions (metadata list) ───────────────────────────────────────
  /** @returns {Promise<InterviewSession[]>} */
  async getAllSessions() {
    try {
      const listRaw = await AsyncStorage.getItem(KEYS.SESSIONS_LIST);
      if (!listRaw) return [];
      const ids = JSON.parse(listRaw);
      const sessions = await Promise.all(
        ids.map(async (id) => {
          const raw = await AsyncStorage.getItem(KEYS.SESSION_PREFIX + id);
          return raw ? JSON.parse(raw) : null;
        }),
      );
      return sessions.filter(Boolean);
    } catch (err) {
      console.log('[InterviewStorage] getAllSessions error:', err);
      return [];
    }
  },

  // ── Update a session (e.g. add feedback after async generation) ──────────────
  async updateSession(id, updates) {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SESSION_PREFIX + id);
      if (!raw) return;
      const session = { ...JSON.parse(raw), ...updates };
      await AsyncStorage.setItem(KEYS.SESSION_PREFIX + id, JSON.stringify(session));
    } catch (err) {
      console.log('[InterviewStorage] updateSession error:', err);
    }
  },

  // ── Load a single session (including full transcript) ───────────────────────
  /** @returns {Promise<InterviewSession|null>} */
  async getSession(id) {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SESSION_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  // ── Toggle favourite ────────────────────────────────────────────────────────
  async toggleFavorite(id) {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SESSION_PREFIX + id);
      if (!raw) return;
      const session = JSON.parse(raw);
      session.isFavorite = !session.isFavorite;
      await AsyncStorage.setItem(KEYS.SESSION_PREFIX + id, JSON.stringify(session));
      return session.isFavorite;
    } catch (err) {
      console.log('[InterviewStorage] toggleFavorite error:', err);
    }
  },

  // ── Delete a session ────────────────────────────────────────────────────────
  async deleteSession(id) {
    try {
      await AsyncStorage.removeItem(KEYS.SESSION_PREFIX + id);
      const listRaw = await AsyncStorage.getItem(KEYS.SESSIONS_LIST);
      if (listRaw) {
        const ids = JSON.parse(listRaw).filter(i => i !== id);
        await AsyncStorage.setItem(KEYS.SESSIONS_LIST, JSON.stringify(ids));
      }
    } catch (err) {
      console.log('[InterviewStorage] deleteSession error:', err);
    }
  },

  // ── Cache About Me locally (for offline / fast access) ──────────────────────
  async cacheAboutMe(profile) {
    try {
      await AsyncStorage.setItem(KEYS.ABOUT_ME_CACHE, JSON.stringify(profile));
    } catch { /* non-critical */ }
  },

  async getCachedAboutMe() {
    try {
      const raw = await AsyncStorage.getItem(KEYS.ABOUT_ME_CACHE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  // ── Clear all sessions (dev / reset) ────────────────────────────────────────
  async clearAll() {
    try {
      const listRaw = await AsyncStorage.getItem(KEYS.SESSIONS_LIST);
      if (listRaw) {
        const ids = JSON.parse(listRaw);
        await Promise.all(ids.map(id => AsyncStorage.removeItem(KEYS.SESSION_PREFIX + id)));
      }
      await AsyncStorage.removeItem(KEYS.SESSIONS_LIST);
    } catch (err) {
      console.log('[InterviewStorage] clearAll error:', err);
    }
  },
};

// ─── Format Helpers ───────────────────────────────────────────────────────────
function formatDate(date) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d     = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff  = (today - d) / 86400000;

  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `Today, ${timeStr}`;
  if (diff === 1) return `Yesterday, ${timeStr}`;
  return `${date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}, ${timeStr}`;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min      = Math.floor(totalSec / 60);
  const sec      = totalSec % 60;
  return min > 0 ? `${min} min${sec > 0 ? ` ${sec}s` : ''}` : `${sec}s`;
}