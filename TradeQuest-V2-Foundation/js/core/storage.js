/* ============================================================================
   storage.js — the only module that touches localStorage.
   ----------------------------------------------------------------------------
   Everything is namespaced under `tq.` so the app can share a domain safely.

   FUTURE EXPANSION: to move to cloud saves / real accounts, reimplement the
   four functions in the "driver" block below against your API and leave the
   rest of the app untouched. `getProfile`/`saveProfile` are the seam.
   ========================================================================== */

import { uid } from './utils.js';

const NS = 'tq.';
const KEY_PROFILE = `${NS}profile`;
const KEY_QUIZZES = `${NS}customQuizzes`;   // teacher-authored, layered over the JSON banks
const KEY_SCORES  = `${NS}scores`;          // local leaderboard rows
const KEY_A11Y    = `${NS}a11y`;
const KEY_TEACHER = `${NS}teacherSession`;
const SCHEMA = 3;

/* ------------------------------------------------------------------ driver */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`Could not read ${key}`, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Most likely quota exceeded, or Safari private browsing.
    console.error(`Could not save ${key}`, e);
    return false;
  }
}

const remove = (key) => localStorage.removeItem(key);

/** True if storage is usable at all (private mode / disabled cookies). */
export function isAvailable() {
  try {
    localStorage.setItem(`${NS}__t`, '1');
    localStorage.removeItem(`${NS}__t`);
    return true;
  } catch { return false; }
}

/* ----------------------------------------------------------------- profile */

/** The shape of a brand-new student. Keep every field additive. */
export function blankProfile() {
  return {
    schema: SCHEMA,
    id: uid('stu'),
    nickname: '',
    avatarId: 'pipe-maestro',
    createdAt: new Date().toISOString(),
    xp: 0,
    subjectXp: {},          // { plumbing: 320, ... }
    badges: [],             // ['first-steps', ...]
    unlockedAvatars: [],    // ids unlocked beyond the free set
    history: [],            // completed attempts, newest last
    stats: {
      quizzesCompleted: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      fastCorrect: 0,       // correct in under 5s
      perfectQuizzes: 0,
      bestStreak: 0,
      bestSurvivalRun: 0,
      bestTimeAttack: 0,
      totalPlayMs: 0,
    },
    dayStreak: { count: 0, lastPlayed: null, best: 0 },
  };
}

/** Load the current profile, creating one if absent, migrating if old. */
export function getProfile() {
  let p = read(KEY_PROFILE, null);
  if (!p) return null;
  if (p.schema !== SCHEMA) p = migrate(p);
  // Defensive merge: guarantees new fields exist on profiles saved by old builds.
  return { ...blankProfile(), ...p, stats: { ...blankProfile().stats, ...p.stats } };
}

export const saveProfile = (profile) => write(KEY_PROFILE, profile);
export const clearProfile = () => remove(KEY_PROFILE);
export const hasProfile = () => Boolean(read(KEY_PROFILE, null));

/** Upgrade an older profile to the current schema. */
function migrate(old) {
  const next = { ...blankProfile(), ...old };
  next.schema = SCHEMA;
  next.subjectXp = old.subjectXp || {};
  next.history = Array.isArray(old.history) ? old.history : [];
  console.info(`Profile migrated to schema ${SCHEMA}.`);
  return next;
}

/* -------------------------------------------------- teacher custom quizzes */
/**
 * Teacher-authored quizzes live here rather than in the JSON files, because a
 * static site cannot write back to /questions/. The bank merges these on load,
 * and the dashboard's Export button produces a file you can commit to the repo
 * to make them permanent for everyone.
 * Shape: { [subjectId]: Quiz[] }
 */
export const getCustomQuizzes = () => read(KEY_QUIZZES, {});
export const saveCustomQuizzes = (map) => write(KEY_QUIZZES, map);

/** Quizzes deleted from a shipped JSON file are tombstoned by id. */
const KEY_DELETED = `${NS}deletedQuizzes`;
export const getDeletedQuizIds = () => read(KEY_DELETED, []);
export const saveDeletedQuizIds = (ids) => write(KEY_DELETED, ids);

/* ------------------------------------------------------------ leaderboard */
/**
 * Local leaderboard. On a static site this is per-device — which is exactly
 * right for a classroom whiteboard, where everyone plays on the same machine.
 * FUTURE: swap these two for an API call to get a cross-class board.
 */
export function getScores(quizId = null) {
  const all = read(KEY_SCORES, []);
  return quizId ? all.filter((s) => s.quizId === quizId) : all;
}

export function addScore(row) {
  const all = read(KEY_SCORES, []);
  all.push({ ...row, at: new Date().toISOString() });
  // Keep the store bounded — 500 rows is plenty for a term.
  write(KEY_SCORES, all.slice(-500));
}

export const clearScores = () => remove(KEY_SCORES);

/* ----------------------------------------------------- accessibility prefs */
export const getA11y = () => read(KEY_A11Y, { contrast: 'normal', motion: 'auto', fontScale: 1, sound: true });
export const saveA11y = (prefs) => write(KEY_A11Y, prefs);

/* --------------------------------------------------------- teacher session */
export const isTeacherUnlocked = () => read(KEY_TEACHER, false) === true;
export const setTeacherUnlocked = (v) => write(KEY_TEACHER, v === true);

/* ------------------------------------------------------------------ export */
/** Everything this device knows, for backup or moving to another machine. */
export function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    schema: SCHEMA,
    profile: read(KEY_PROFILE, null),
    customQuizzes: read(KEY_QUIZZES, {}),
    deletedQuizIds: read(KEY_DELETED, []),
    scores: read(KEY_SCORES, []),
  };
}

export function importAll(data) {
  if (!data || typeof data !== 'object') throw new Error('That file is not a valid backup.');
  if (data.profile) write(KEY_PROFILE, data.profile);
  if (data.customQuizzes) write(KEY_QUIZZES, data.customQuizzes);
  if (data.deletedQuizIds) write(KEY_DELETED, data.deletedQuizIds);
  if (data.scores) write(KEY_SCORES, data.scores);
}
