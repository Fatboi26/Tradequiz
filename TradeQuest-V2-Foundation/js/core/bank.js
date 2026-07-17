/* ============================================================================
   bank.js — loads and indexes the question bank.
   ----------------------------------------------------------------------------
   Sources, merged in this order (later wins):
     1. /questions/index.json  → the subject registry
     2. /questions/<subject>.json → the shipped quizzes
     3. localStorage custom quizzes → teacher edits made in the dashboard
     4. localStorage tombstones → quizzes the teacher deleted

   ADDING A SUBJECT: drop a JSON file into /questions/ and add one line to
   index.json. Nothing in this file, or any other, needs to change.
   ========================================================================== */

import { fetchJson, matchesQuery, clone } from './utils.js';
import { getCustomQuizzes, getDeletedQuizIds } from './storage.js';

export const bank = {
  subjects: [],        // [{ id, name, icon, color, description, topics, quizzes }]
  loaded: false,
  errors: [],          // [{ file, message }] — surfaced in the teacher dashboard
};

/**
 * Load the whole bank. Safe to call more than once.
 * A broken subject file logs an error and is skipped rather than killing
 * the page — one bad upload should not take the platform down.
 */
export async function load(base = '') {
  if (bank.loaded) return bank;
  bank.errors = [];

  const registry = await fetchJson(`${base}questions/index.json`);
  const enabled = (registry.subjects || []).filter((s) => s.enabled !== false);

  const results = await Promise.all(enabled.map(async (entry) => {
    try {
      const data = await fetchJson(base + entry.file);
      return normaliseSubject(data, entry);
    } catch (e) {
      bank.errors.push({ file: entry.file, message: e.message });
      console.error(`Subject "${entry.id}" failed to load:`, e);
      return null;
    }
  }));

  bank.subjects = results.filter(Boolean);
  applyLocalLayer();
  bank.loaded = true;
  return bank;
}

/** Force a reload after a teacher edit. */
export function refreshLocalLayer() {
  bank.subjects.forEach((s) => { s.quizzes = s._shipped.map(clone); });
  applyLocalLayer();
}

/** Validate and fill in defaults for one subject file. */
function normaliseSubject(data, entry) {
  const subj = data.subject || {};
  const quizzes = (data.quizzes || []).map((q) => normaliseQuiz(q, subj.id || entry.id));
  const out = {
    id: subj.id || entry.id,
    name: subj.name || entry.id,
    icon: subj.icon || '📘',
    color: subj.color || '#00857D',
    description: subj.description || '',
    file: entry.file,
    topics: data.topics || [],
    quizzes,
  };
  out._shipped = quizzes.map(clone);   // pristine copy, so edits can be reverted
  return out;
}

/** Fill in per-question defaults so the engine never has to guess. */
function normaliseQuiz(q, subjectId) {
  return {
    schedule: { publishAt: null, expiresAt: null },
    tags: [],
    level: '',
    description: '',
    ...q,
    subjectId,
    source: q.source || 'shipped',
    questions: (q.questions || []).map((qq, i) => ({
      id: qq.id || `q${i + 1}`,
      type: qq.type || 'mcq',
      time: qq.time ?? 20,
      bonus: qq.bonus === true,
      points: qq.points ?? null,
      explain: qq.explain || '',
      ...qq,
    })),
  };
}

/** Layer teacher edits and deletions over the shipped quizzes. */
function applyLocalLayer() {
  const custom = getCustomQuizzes();
  const deleted = new Set(getDeletedQuizIds());

  for (const subject of bank.subjects) {
    // Remove tombstoned quizzes
    subject.quizzes = subject.quizzes.filter((q) => !deleted.has(q.id));

    // Merge in teacher quizzes: same id replaces, new id appends
    const mine = (custom[subject.id] || []).map((q) => normaliseQuiz({ ...q, source: 'local' }, subject.id));
    for (const q of mine) {
      const i = subject.quizzes.findIndex((existing) => existing.id === q.id);
      if (i >= 0) subject.quizzes[i] = q;
      else subject.quizzes.push(q);
    }
  }

  // A teacher may create a quiz for a subject id with no shipped file yet.
  for (const [subjectId, quizzes] of Object.entries(custom)) {
    if (bank.subjects.some((s) => s.id === subjectId)) continue;
    bank.subjects.push({
      id: subjectId, name: subjectId, icon: '🆕', color: '#6C3F98',
      description: 'Created in the dashboard.', topics: [], _shipped: [],
      quizzes: quizzes.map((q) => normaliseQuiz({ ...q, source: 'local' }, subjectId)),
    });
  }
}

/* ------------------------------------------------------------------ lookups */

export const getSubject = (id) => bank.subjects.find((s) => s.id === id) || null;

export function getQuiz(quizId) {
  for (const s of bank.subjects) {
    const q = s.quizzes.find((x) => x.id === quizId);
    if (q) return q;
  }
  return null;
}

/** Every quiz across every subject, flattened. */
export const allQuizzes = () => bank.subjects.flatMap((s) => s.quizzes);

/** Every question across every subject — used by Random Question Mode. */
export const allQuestions = () =>
  bank.subjects.flatMap((s) =>
    s.quizzes.filter(isPublished).flatMap((q) =>
      q.questions.map((qq) => ({ ...qq, _quizId: q.id, _quizTitle: q.title, _subjectId: s.id }))));

/**
 * Is this quiz visible to students right now?
 * publishAt in the future = not yet; expiresAt in the past = closed.
 * The teacher dashboard ignores this and shows everything.
 */
export function isPublished(quiz, now = new Date()) {
  const { publishAt, expiresAt } = quiz.schedule || {};
  if (publishAt && new Date(publishAt) > now) return false;
  if (expiresAt && new Date(expiresAt) < now) return false;
  return true;
}

export function scheduleStatus(quiz, now = new Date()) {
  const { publishAt, expiresAt } = quiz.schedule || {};
  if (publishAt && new Date(publishAt) > now) return { state: 'scheduled', label: 'Scheduled' };
  if (expiresAt && new Date(expiresAt) < now) return { state: 'closed', label: 'Closed' };
  return { state: 'live', label: 'Live' };
}

/** Free-text search across title, description, tags, level, subject and topic. */
export function searchQuizzes(query, { subjectId = null, topicId = null, includeUnpublished = true } = {}) {
  let list = subjectId ? (getSubject(subjectId)?.quizzes || []) : allQuizzes();
  if (topicId) list = list.filter((q) => q.topic === topicId);
  if (!includeUnpublished) list = list.filter(isPublished);
  return list.filter((q) => {
    const subject = getSubject(q.subjectId);
    return matchesQuery(query, q.title, q.description, q.level, (q.tags || []).join(' '), subject?.name, q.topic);
  });
}

export const questionCount = (quiz) => quiz.questions?.length || 0;

/** Rough duration in seconds, used for the "≈ 4 min" label on quiz cards. */
export const estimatedSeconds = (quiz) =>
  (quiz.questions || []).reduce((sum, q) => sum + (q.time || 20) + 4, 0);

/* --------------------------------------------------------------- validation */

/** Types the engine knows how to render and grade. */
export const QUESTION_TYPES = [
  'mcq', 'truefalse', 'multi', 'image', 'order', 'match', 'dragdrop', 'hotspot', 'numeric', 'scenario',
];

/**
 * Check an imported quiz object before it is saved.
 * @returns {string[]} A list of human-readable problems. Empty means valid.
 */
export function validateQuiz(quiz) {
  const errors = [];
  if (!quiz || typeof quiz !== 'object') return ['The file did not contain a quiz object.'];
  if (!quiz.title) errors.push('Missing "title".');
  if (!quiz.id) errors.push('Missing "id".');
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push('A quiz needs at least one question.');
    return errors;
  }

  quiz.questions.forEach((q, i) => {
    const at = `Question ${i + 1}`;
    if (!q.text) errors.push(`${at}: missing "text".`);
    if (!QUESTION_TYPES.includes(q.type)) {
      errors.push(`${at}: unknown type "${q.type}". Use one of: ${QUESTION_TYPES.join(', ')}.`);
      return;
    }
    switch (q.type) {
      case 'mcq': case 'image': case 'scenario':
        if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${at}: needs at least 2 options.`);
        else if (typeof q.answer !== 'number' || !q.options[q.answer]) errors.push(`${at}: "answer" must be the index of a valid option.`);
        break;
      case 'truefalse':
        if (typeof q.answer !== 'boolean') errors.push(`${at}: "answer" must be true or false.`);
        break;
      case 'multi':
        if (!Array.isArray(q.answer) || q.answer.length === 0) errors.push(`${at}: "answer" must be an array of option indexes.`);
        break;
      case 'order':
        if (!Array.isArray(q.items) || q.items.length < 2) errors.push(`${at}: needs an "items" array in the CORRECT order.`);
        break;
      case 'match':
        if (!Array.isArray(q.pairs) || q.pairs.length < 2) errors.push(`${at}: needs at least 2 "pairs" of { left, right }.`);
        break;
      case 'dragdrop':
        if (!Array.isArray(q.targets) || !Array.isArray(q.items)) errors.push(`${at}: needs "targets" and "items".`);
        break;
      case 'hotspot':
        if (!q.image) errors.push(`${at}: needs an "image".`);
        if (!Array.isArray(q.areas) || q.areas.length === 0) errors.push(`${at}: needs at least one "areas" entry.`);
        break;
      case 'numeric':
        if (typeof q.answer !== 'number') errors.push(`${at}: "answer" must be a number.`);
        break;
    }
    if ((q.type === 'image' || q.type === 'hotspot') && !q.imageAlt) {
      errors.push(`${at}: add "imageAlt" so screen reader users can access the question.`);
    }
  });

  return errors;
}
