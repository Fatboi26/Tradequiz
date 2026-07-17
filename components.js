/* ============================================================================
   components.js — reusable render functions shared by the pages.
   Each returns a DOM node. None of them keep state.
   ========================================================================== */

import { el, formatNumber, formatDate } from '../core/utils.js';
import { config, icon } from '../core/config.js';
import { levelInfo, getAvatar, allBadges, badgeProgress, isAvatarUnlocked, unlockLabel, avatars } from '../game/gamification.js';
import { getSubject, questionCount, estimatedSeconds, scheduleStatus } from '../core/bank.js';
import { TYPE_LABELS } from '../game/questionTypes.js';

/* --------------------------------------------------------------- XP header */

/**
 * The player strip: avatar, nickname, level, spirit-level XP bar, streak.
 * Returns { node, update } so the caller can refresh it without a rebuild.
 */
export function playerStrip(profile) {
  const avatar = getAvatar(profile.avatarId);
  const img = el('img', { class: 'avatar-chip', src: avatar?.file || '', alt: '' });
  const name = el('span', { class: 'player-strip__name', text: profile.nickname || 'Player' });
  const levelChip = el('span', { class: 'chip chip--gold' });
  const streakChip = el('span', { class: 'chip' });
  const fill = el('div', { class: 'xp-level__fill' });
  const bubble = el('div', { class: 'xp-level__bubble' });
  const xpText = el('span', { class: 'player-strip__xp' });

  const bar = el('div', {
    class: 'xp-level', role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Progress to next level',
  }, [
    fill,
    el('div', { class: 'xp-level__mark xp-level__mark--a' }),
    el('div', { class: 'xp-level__mark xp-level__mark--b' }),
    bubble,
  ]);

  const node = el('div', { class: 'player-strip' }, [
    img,
    el('div', { class: 'player-strip__main' }, [
      el('div', { class: 'player-strip__top' }, [name, levelChip, streakChip]),
      bar,
      xpText,
    ]),
  ]);

  function update(p = profile) {
    const info = levelInfo(p.xp);
    const pct = Math.round(info.progress * 100);
    const av = getAvatar(p.avatarId);
    img.src = av?.file || '';
    img.alt = `Your avatar: ${av?.name || 'unknown'}`;
    name.textContent = p.nickname || 'Player';
    levelChip.textContent = `${icon('level')} Lv ${info.level} · ${info.title}`;
    fill.style.width = `${pct}%`;
    bubble.style.left = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuetext',
      info.isMax ? 'Maximum level reached' : `${formatNumber(info.xpIntoLevel)} of ${formatNumber(info.xpForNext)} XP to level ${info.level + 1}`);
    xpText.textContent = info.isMax
      ? `${formatNumber(p.xp)} XP · max level`
      : `${formatNumber(info.xpIntoLevel)} / ${formatNumber(info.xpForNext)} XP to level ${info.level + 1}`;

    const streak = p.dayStreak?.count || 0;
    streakChip.hidden = streak < 2;
    streakChip.innerHTML = '';
    streakChip.append(
      el('span', { class: 'streak-flame', 'aria-hidden': 'true', text: icon('streak') }),
      el('span', { text: ` ${streak}-day streak` }),
    );
  }

  update();
  return { node, update, avatarNode: img, xpBar: bar };
}

/* ------------------------------------------------------------ subject card */

export function subjectCard(subject, { onOpen }) {
  const live = subject.quizzes.length;
  return el('button', {
    type: 'button', class: 'subject-card', style: { '--sc': subject.color },
    on: { click: () => onOpen(subject) },
  }, [
    el('span', { class: 'subject-card__icon', 'aria-hidden': 'true', text: subject.icon }),
    el('span', { class: 'subject-card__name', text: subject.name }),
    el('span', { class: 'subject-card__desc', text: subject.description }),
    el('span', { class: 'subject-card__meta', text: `${live} ${live === 1 ? 'quiz' : 'quizzes'}` }),
  ]);
}

/* --------------------------------------------------------------- quiz card */

export function quizCard(quiz, { onPlay, showStatus = false }) {
  const subject = getSubject(quiz.subjectId);
  const status = scheduleStatus(quiz);
  const mins = Math.max(1, Math.round(estimatedSeconds(quiz) / 60));

  return el('article', { class: 'quiz-card' }, [
    el('div', { class: 'quiz-card__bar', style: { background: subject?.color || 'var(--c-primary)' } }),
    el('div', { class: 'quiz-card__body' }, [
      el('div', { class: 'row row--wrap', style: { gap: '.4rem' } }, [
        el('span', { class: 'chip', text: `${subject?.icon || ''} ${subject?.name || quiz.subjectId}` }),
        quiz.level ? el('span', { class: 'chip', text: quiz.level }) : null,
        showStatus ? el('span', { class: `chip ${status.state === 'live' ? 'chip--gold' : ''}`, text: status.label }) : null,
      ]),
      el('h3', { class: 'quiz-card__title', text: quiz.title }),
      el('p', { class: 'quiz-card__desc', text: quiz.description }),
      el('div', { class: 'quiz-card__meta' }, [
        el('span', { text: `${questionCount(quiz)} questions` }),
        el('span', { 'aria-hidden': 'true', text: '·' }),
        el('span', { text: `≈ ${mins} min` }),
      ]),
      el('button', {
        type: 'button', class: 'btn btn--primary btn--block', text: 'Play',
        on: { click: () => onPlay(quiz) },
      }),
    ]),
  ]);
}

/* ------------------------------------------------------------ leaderboard */

/**
 * @param {Array} rows [{ name, avatarId, score, id }]
 * @param {string} [meId] Highlight this row.
 */
export function leaderboard(rows, { meId = null, limit = 10, emptyText = 'No scores yet. Be the first.' } = {}) {
  if (!rows.length) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: icon('trophy') }),
      el('p', { text: emptyText }),
    ]);
  }

  const sorted = rows.slice().sort((a, b) => b.score - a.score).slice(0, limit);
  return el('ol', { class: 'leaderboard stagger' },
    sorted.map((row, i) => {
      const avatar = getAvatar(row.avatarId);
      return el('li', {
        class: `lb-row ${row.id && row.id === meId ? 'lb-row--me' : ''}`,
        style: { '--i': String(i) },
      }, [
        el('span', { class: 'lb-row__rank', dataset: { rank: String(i + 1) }, text: String(i + 1) }),
        el('img', { src: avatar?.file || '', alt: '' }),
        el('span', { class: 'lb-row__name', text: row.name }),
        el('span', { class: 'lb-row__score', text: formatNumber(row.score) }),
      ]);
    }));
}

/* --------------------------------------------------------------- badges */

export function badgeGrid(profile) {
  return el('div', { class: 'badge-grid' },
    allBadges().map((badge) => {
      const earned = profile.badges.includes(badge.id);
      const prog = badgeProgress(badge, profile);
      return el('div', {
        class: `badge-tile ${earned ? 'is-earned' : 'is-locked'}`,
        title: badge.desc,
      }, [
        el('span', { class: 'badge-tile__icon', 'aria-hidden': 'true', text: badge.icon }),
        el('span', { class: 'badge-tile__name', text: badge.name }),
        el('span', { class: 'badge-tile__desc', text: badge.desc }),
        earned
          ? el('span', { class: 'chip chip--gold', text: 'Earned' })
          : el('span', { class: 'badge-tile__prog', text: `${formatNumber(prog.value)} / ${formatNumber(prog.target)}` }),
      ]);
    }));
}

/* -------------------------------------------------------- avatar picker */

export function avatarPicker(profile, { onChoose }) {
  const grid = el('div', { class: 'avatar-grid' });

  avatars.list.forEach((a) => {
    const unlocked = isAvatarUnlocked(a, profile);
    const btn = el('button', {
      type: 'button',
      class: `avatar-pick ${unlocked ? '' : 'is-locked'}`,
      'aria-pressed': profile.avatarId === a.id ? 'true' : 'false',
      'aria-label': unlocked
        ? `${a.name}, ${a.archetype}, holding a ${a.tool}`
        : `${a.name} — locked. ${unlockLabel(a)}`,
      disabled: !unlocked,
      title: unlocked ? a.archetype : unlockLabel(a),
      on: { click: () => unlocked && onChoose(a) },
    }, [
      el('img', { src: a.file, alt: '', loading: 'lazy' }),
    ]);
    grid.append(el('div', {}, [btn, el('span', { class: 'avatar-pick__name', text: unlocked ? a.name : unlockLabel(a) })]));
  });

  return grid;
}

/* -------------------------------------------------------------- history */

export function historyList(profile, { limit = 12 } = {}) {
  const rows = profile.history.slice(-limit).reverse();
  if (!rows.length) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: '📋' }),
      el('p', { text: 'Nothing here yet. Play a quiz and it will show up.' }),
    ]);
  }

  return el('div', { class: 'history' },
    rows.map((h) => el('div', { class: 'history__row' }, [
      el('div', { class: 'history__main' }, [
        el('span', { class: 'history__title', text: h.quizTitle }),
        el('span', { class: 'history__meta', text: `${h.modeName} · ${formatDate(h.at)}` }),
      ]),
      el('div', { class: 'history__stats' }, [
        el('span', { class: `chip ${h.accuracy === 100 ? 'chip--gold' : ''}`, text: `${h.accuracy}%` }),
        el('span', { class: 'chip', text: `${formatNumber(h.points)} pts` }),
        el('span', { class: 'chip', text: `+${h.xp} XP` }),
      ]),
    ])));
}

/* ------------------------------------------------------------ loader/empty */

export const loader = (text = 'Loading…') =>
  el('div', { class: 'loader', role: 'status' }, [
    el('div', { class: 'loader__spin', 'aria-hidden': 'true' }),
    el('span', { class: 'loader__text', text }),
  ]);

export const emptyState = (icon, title, body, action = null) =>
  el('div', { class: 'empty' }, [
    el('div', { class: 'empty__icon', 'aria-hidden': 'true', text: icon }),
    el('h3', { text: title }),
    el('p', { text: body }),
    action,
  ]);

/** A read-only summary line for a question, used in the teacher preview. */
export const questionSummary = (q, i) =>
  el('div', { class: 'q-summary' }, [
    el('span', { class: 'q-summary__num', text: String(i + 1) }),
    el('div', {}, [
      el('div', { class: 'q-summary__text', text: q.text }),
      el('div', { class: 'q-summary__meta' }, [
        el('span', { class: 'chip', text: TYPE_LABELS[q.type] || q.type }),
        el('span', { class: 'chip', text: `${q.time ?? 20}s` }),
        q.bonus ? el('span', { class: 'chip chip--gold', text: 'Bonus ×2' }) : null,
      ]),
    ]),
  ]);
