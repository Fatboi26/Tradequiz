/* ============================================================================
   progress.js — turn a finished run into profile changes.
   ----------------------------------------------------------------------------
   The engine produces a summary. The profile is what persists. This module is
   the single place where one becomes the other, so the rules live in exactly
   one file rather than being sprinkled through the page controllers.

   Nothing here touches the DOM. It returns a "reward" object describing what
   changed, and the UI decides how to celebrate it.
   ========================================================================== */

import { getProfile, saveProfile, addScore } from '../core/storage.js';
import {
  levelInfo, touchDayStreak, evaluateBadges,
  avatars, isAvatarUnlocked,
} from './gamification.js';

const FAST_MS = 5000; // "fast correct" threshold, used by the Quick Draw badge

/**
 * Apply a completed run to the stored profile.
 *
 * @param {object} summary  The object emitted by Engine 'end'.
 * @param {object} [opts]
 * @param {string|null} [opts.subjectId] Subject to credit XP to. Null for
 *   Random Mix, where XP is credited per question's own subject if known.
 * @returns {object} reward — {
 *     profile, xpGained, levelBefore, levelAfter, leveledUp,
 *     newBadges[], newAvatars[], dayStreak, historyRow
 *   }
 */
export function applyRun(summary, { subjectId = null } = {}) {
  const profile = getProfile();
  if (!profile) return null;

  const mode = summary.mode || {};
  const countsToXp = mode.countsToXp !== false;

  const levelBefore = levelInfo(profile.xp).level;
  const knownAvatars = avatars.list
    .filter((a) => isAvatarUnlocked(a, profile))
    .map((a) => a.id);

  /* ---------------------------------------------------------------- stats */
  const st = profile.stats;
  st.questionsAnswered += summary.answers.length;
  st.correctAnswers += summary.correct;
  st.fastCorrect += summary.answers.filter((a) => a.correct && a.ms <= FAST_MS).length;
  st.bestStreak = Math.max(st.bestStreak, summary.bestStreak || 0);
  st.totalPlayMs += Math.round(summary.durationMs || 0);

  // Practice runs are deliberately excluded from "quizzes completed" so the
  // badges still mean something.
  if (countsToXp) {
    st.quizzesCompleted += 1;
    if (summary.perfect) st.perfectQuizzes += 1;
  }

  if (mode.id === 'survival') {
    st.bestSurvivalRun = Math.max(st.bestSurvivalRun, summary.reached || 0);
  }
  if (mode.id === 'timeattack') {
    st.bestTimeAttack = Math.max(st.bestTimeAttack, summary.points || 0);
  }

  /* ------------------------------------------------------------------- XP */
  const xpGained = countsToXp ? (summary.xp || 0) : 0;
  profile.xp += xpGained;

  if (xpGained > 0) {
    if (subjectId) {
      // Whole-quiz run: all XP belongs to one subject.
      profile.subjectXp[subjectId] = (profile.subjectXp[subjectId] || 0) + xpGained;
    } else {
      // Random Mix: credit each question's XP to its own subject, so mixed
      // play still moves the trade badges along.
      summary.answers.forEach((a) => {
        const sid = a.question?._subjectId;
        if (!sid || !a.xp) return;
        profile.subjectXp[sid] = (profile.subjectXp[sid] || 0) + a.xp;
      });
    }
  }

  /* -------------------------------------------------------------- streaks */
  const dayStreak = countsToXp ? touchDayStreak(profile) : profile.dayStreak;

  /* --------------------------------------------------------------- record */
  const historyRow = {
    at: new Date().toISOString(),
    quizId: summary.quiz?.id || 'random',
    quizTitle: summary.quiz?.title || 'Random Mix',
    subjectId: subjectId || 'mixed',
    modeId: mode.id,
    modeName: mode.name,
    correct: summary.correct,
    total: summary.total,
    accuracy: summary.accuracy,
    points: summary.points,
    xp: xpGained,
    perfect: Boolean(summary.perfect),
    bestStreak: summary.bestStreak || 0,
  };
  profile.history.push(historyRow);
  // Keep the history bounded — localStorage is not infinite.
  if (profile.history.length > 200) profile.history = profile.history.slice(-200);

  /* --------------------------------------------------- badges and avatars */
  const newBadges = evaluateBadges(profile);
  const newAvatars = avatars.list.filter(
    (a) => isAvatarUnlocked(a, profile) && !knownAvatars.includes(a.id),
  );
  // Remember unlocks explicitly, so a later rule change never takes an avatar
  // back off a student who has already earned it.
  newAvatars.forEach((a) => {
    if (!profile.unlockedAvatars.includes(a.id)) profile.unlockedAvatars.push(a.id);
  });

  saveProfile(profile);

  // Leaderboards are per-device and per-quiz; Practice does not post scores.
  if (mode.leaderboard !== false && countsToXp) {
    addScore({
      quizId: historyRow.quizId,
      modeId: mode.id,
      nickname: profile.nickname,
      avatarId: profile.avatarId,
      points: summary.points,
      accuracy: summary.accuracy,
      at: historyRow.at,
      playerId: profile.id,
    });
  }

  const levelAfter = levelInfo(profile.xp).level;

  return {
    profile,
    xpGained,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    newBadges,
    newAvatars,
    dayStreak,
    historyRow,
  };
}
