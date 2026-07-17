/* ============================================================================
   gamification.js — levels, badges, day streaks and avatar unlocks.
   ----------------------------------------------------------------------------
   Rules live in config/gamification.json and avatars/index.json. Adding a new
   badge or unlockable avatar is a config change, not a code change — unless
   you invent a brand new rule *type*, which is the one switch below.
   ========================================================================== */

import { config } from '../core/config.js';

/* -------------------------------------------------------------- levelling */

/**
 * Total XP needed to reach a given level.
 * Quadratic-ish growth: each level costs a bit more than the last, so early
 * levels come fast (hook) and later ones mean something (retention).
 */
export function xpForLevel(level) {
  const L = config.game?.levels || {};
  const base = L.base ?? 120;
  const growth = L.growth ?? 1.25;
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) total += Math.round(base * Math.pow(i, growth));
  return total;
}

/** Current level for a given total XP. */
export function levelFromXp(xp) {
  const max = config.game?.levels?.maxLevel ?? 60;
  let level = 1;
  while (level < max && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/**
 * Everything the XP bar needs.
 * @returns {{ level, title, xpIntoLevel, xpForNext, progress, isMax }}
 */
export function levelInfo(xp) {
  const max = config.game?.levels?.maxLevel ?? 60;
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const isMax = level >= max;
  const span = ceiling - floor;
  return {
    level,
    title: levelTitle(level),
    xpIntoLevel: xp - floor,
    xpForNext: isMax ? 0 : span,
    progress: isMax ? 1 : (span > 0 ? (xp - floor) / span : 0),
    isMax,
  };
}

/** The highest title whose threshold this level has passed. */
export function levelTitle(level) {
  const titles = config.game?.levels?.titles || {};
  const reached = Object.keys(titles).map(Number).filter((n) => n <= level).sort((a, b) => b - a);
  return titles[reached[0]] || 'Trainee';
}

/* ----------------------------------------------------------- day streaks */

/**
 * Update the daily practice streak. Called once per completed quiz.
 * A streak survives a gap of up to `dailyResetHours` (default 36) so a
 * learner who plays at 9am Monday and 6pm Tuesday keeps it.
 */
export function touchDayStreak(profile, now = new Date()) {
  const window = (config.game?.streaks?.dailyResetHours ?? 36) * 3600 * 1000;
  const ds = profile.dayStreak || { count: 0, lastPlayed: null, best: 0 };
  const last = ds.lastPlayed ? new Date(ds.lastPlayed) : null;

  if (!last) {
    ds.count = 1;
  } else {
    const sameDay = last.toDateString() === now.toDateString();
    const gap = now - last;
    if (sameDay) { /* already counted today — leave the count alone */ }
    else if (gap <= window) ds.count += 1;
    else ds.count = 1;
  }

  ds.lastPlayed = now.toISOString();
  ds.best = Math.max(ds.best || 0, ds.count);
  profile.dayStreak = ds;
  return ds;
}

/* ---------------------------------------------------------------- badges */

export const allBadges = () => config.game?.badges || [];
export const getBadge = (id) => allBadges().find((b) => b.id === id) || null;

/**
 * Evaluate one badge rule against a profile.
 * ADD A NEW RULE TYPE: add a case here and use it from gamification.json.
 */
function ruleMet(rule, profile) {
  const st = profile.stats || {};
  switch (rule.type) {
    case 'quizzesCompleted': return st.quizzesCompleted >= rule.value;
    case 'fastCorrect':      return st.fastCorrect >= rule.value;
    case 'perfectQuiz':      return st.perfectQuizzes >= rule.value;
    case 'bestStreak':       return st.bestStreak >= rule.value;
    case 'dayStreak':        return (profile.dayStreak?.best || 0) >= rule.value;
    case 'subjectXp':        return (profile.subjectXp?.[rule.subject] || 0) >= rule.value;
    case 'survivalRun':      return st.bestSurvivalRun >= rule.value;
    case 'timeAttackScore':  return st.bestTimeAttack >= rule.value;
    case 'totalXp':          return profile.xp >= rule.value;
    case 'badgeSet':         return rule.value.every((id) => profile.badges.includes(id));
    default:
      console.warn(`Unknown badge rule type "${rule.type}" — badge will never unlock.`);
      return false;
  }
}

/**
 * Award any newly-earned badges. Mutates profile.badges.
 * Runs twice so that a badgeSet badge (e.g. Master Tradesperson) can trigger
 * in the same pass as the last badge it depends on.
 * @returns {object[]} The badge definitions awarded this call.
 */
export function evaluateBadges(profile) {
  const awarded = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const badge of allBadges()) {
      if (profile.badges.includes(badge.id)) continue;
      if (ruleMet(badge.rule, profile)) {
        profile.badges.push(badge.id);
        awarded.push(badge);
      }
    }
  }
  return awarded;
}

/** Progress towards a badge, 0–1. Used to show "3/5" style hints. */
export function badgeProgress(badge, profile) {
  const r = badge.rule;
  const st = profile.stats || {};
  const value = {
    quizzesCompleted: st.quizzesCompleted, fastCorrect: st.fastCorrect,
    perfectQuiz: st.perfectQuizzes, bestStreak: st.bestStreak,
    dayStreak: profile.dayStreak?.best || 0,
    subjectXp: profile.subjectXp?.[r.subject] || 0,
    survivalRun: st.bestSurvivalRun, timeAttackScore: st.bestTimeAttack,
    totalXp: profile.xp,
    badgeSet: r.type === 'badgeSet' ? r.value.filter((id) => profile.badges.includes(id)).length : 0,
  }[r.type] ?? 0;

  const target = r.type === 'badgeSet' ? r.value.length : r.value;
  return { value, target, ratio: target ? Math.min(1, value / target) : 0 };
}

/* --------------------------------------------------------------- avatars */

/** Avatar roster, loaded once from avatars/index.json. */
export const avatars = { list: [], loaded: false };

export async function loadAvatars(base = '') {
  if (avatars.loaded) return avatars.list;
  const data = await (await fetch(`${base}avatars/index.json`, { cache: 'no-cache' })).json();
  avatars.list = data.avatars || [];
  avatars.loaded = true;
  return avatars.list;
}

export const getAvatar = (id) => avatars.list.find((a) => a.id === id) || avatars.list[0] || null;

/** Is this avatar available to this profile? */
export function isAvatarUnlocked(avatar, profile) {
  if (!avatar) return false;
  const u = avatar.unlock || { type: 'free' };
  if (u.type === 'free') return true;
  if (profile.unlockedAvatars?.includes(avatar.id)) return true;
  switch (u.type) {
    case 'badge':  return profile.badges.includes(u.id);
    case 'level':  return levelFromXp(profile.xp) >= u.value;
    case 'xp':     return profile.xp >= u.value;
    case 'streak': return (profile.stats?.bestStreak || 0) >= u.value;
    default:       return false;
  }
}

/** Human-readable unlock condition, shown under a locked avatar. */
export function unlockLabel(avatar) {
  const u = avatar.unlock || { type: 'free' };
  switch (u.type) {
    case 'free':   return 'Available now';
    case 'badge':  return `Earn the ${getBadge(u.id)?.name || u.id} badge`;
    case 'level':  return `Reach level ${u.value}`;
    case 'xp':     return `Earn ${u.value.toLocaleString('en-GB')} XP`;
    case 'streak': return `Hit a ${u.value}-answer streak`;
    default:       return 'Locked';
  }
}

/** Avatars that have become available since the last check. */
export function newlyUnlockedAvatars(profile, previouslyKnown = []) {
  const known = new Set(previouslyKnown);
  return avatars.list.filter((a) => isAvatarUnlocked(a, profile) && !known.has(a.id) && a.unlock?.type !== 'free');
}
