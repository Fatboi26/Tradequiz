/* ============================================================================
   scoring.js — points and XP maths. Pure functions, no DOM, no state.
   All tunables come from config/gamification.json.
   ========================================================================== */

import { config } from '../core/config.js';
import { clamp } from '../core/utils.js';

const S = () => config.game?.scoring || {};
const X = () => config.game?.xp || {};

/**
 * Points for one correct answer.
 *
 * Speed component is linear against the question's own time limit, so a 60s
 * calculation question is not punished for taking longer than a 15s recall one.
 *
 * @param {object} o
 * @param {number} o.timeLeftMs   Milliseconds remaining when answered.
 * @param {number} o.timeLimitMs  The question's full allowance.
 * @param {number} o.streak       Consecutive correct answers INCLUDING this one.
 * @param {boolean} o.bonus       Is this a bonus question?
 * @param {number} [o.override]   Per-question "points" value from the JSON.
 * @returns {{ total:number, base:number, speed:number, streak:number }}
 */
export function questionPoints({ timeLeftMs, timeLimitMs, streak = 1, bonus = false, override = null }) {
  const s = S();
  const basePoints = override ?? s.basePoints ?? 1000;
  const speedWeight = s.speedWeight ?? 0.5;

  // Fraction of the allowance still on the clock, 0–1.
  const fraction = timeLimitMs > 0 ? clamp(timeLeftMs / timeLimitMs, 0, 1) : 1;

  // Half the points are guaranteed for being right; half are earned by speed.
  const base = Math.round(basePoints * (1 - speedWeight));
  const speed = Math.round(basePoints * speedWeight * fraction);

  const streakBonus = Math.min(
    Math.max(0, streak - 1) * (s.streakBonusPerStep ?? 100),
    s.streakBonusCap ?? 500,
  );

  let total = base + speed + streakBonus;
  if (bonus) total *= (X().bonusQuestionMultiplier ?? 2);

  return { total: Math.round(total), base, speed, streak: streakBonus };
}

/** Points awarded for answering every question in a quiz correctly. */
export const perfectRoundPoints = () => S().perfectRoundBonus ?? 2000;

/**
 * XP for one correct answer. XP is deliberately a much flatter curve than
 * points: points decide who wins today, XP rewards turning up repeatedly.
 */
export function questionXp({ timeLeftMs, timeLimitMs, streak = 1, bonus = false }) {
  const x = X();
  const fraction = timeLimitMs > 0 ? clamp(timeLeftMs / timeLimitMs, 0, 1) : 1;

  const base = x.perCorrect ?? 10;
  const speed = Math.round((x.speedBonusMax ?? 10) * fraction);
  const streakXp = Math.min(Math.max(0, streak - 1) * (x.streakStep ?? 2), x.streakCapBonus ?? 20);

  let total = base + speed + streakXp;
  if (bonus) total *= (x.bonusQuestionMultiplier ?? 2);
  return Math.round(total);
}

/** XP added at the end of a quiz. */
export function completionXp({ perfect }) {
  const x = X();
  return (x.quizCompleteBonus ?? 25) + (perfect ? (x.perfectRoundBonus ?? 50) : 0);
}

/** Accuracy as a whole percentage. */
export const accuracy = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);

/**
 * Score a whole run. Used by the results screen and by the engine.
 * @param {Array} answers Array of { correct, points, xp }
 */
export function summarise(answers) {
  const correct = answers.filter((a) => a.correct).length;
  const points = answers.reduce((n, a) => n + (a.points || 0), 0);
  const xp = answers.reduce((n, a) => n + (a.xp || 0), 0);
  const perfect = answers.length > 0 && correct === answers.length;
  return { correct, total: answers.length, points, xp, perfect, accuracy: accuracy(correct, answers.length) };
}
