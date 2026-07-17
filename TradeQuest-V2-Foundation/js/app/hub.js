/* ============================================================================
   hub.js — the landing page (index.html).
   ----------------------------------------------------------------------------
   Deliberately thin. Its whole job is: show the brand, show what is on offer,
   and get the person into either the student flow or the dashboard in one tap.
   On a classroom whiteboard this is the screen that sits up while everyone
   gets their phones out.
   ========================================================================== */

import * as config from '../core/config.js';
import { registerPWA } from '../core/pwa.js';
import * as bank from '../core/bank.js';
import * as store from '../core/storage.js';
import { $, el, formatNumber } from '../core/utils.js';
import * as a11y from '../ui/a11y.js';
import * as ui from '../ui/components.js';
import { loadAvatars, getAvatar, levelInfo } from '../game/gamification.js';

async function boot() {
  await config.load();
  a11y.mount();

  const b = config.config.branding;
  const root = $('#app');

  // Storage being unavailable (private mode on some browsers, or a locked-down
  // college build) is worth saying out loud rather than failing quietly later.
  const storageWarning = store.isAvailable() ? null : el('div', { class: 'card card--warn' }, [
    el('p', { text: 'This browser is blocking local storage, so scores, XP and badges will not be saved between sessions. Quizzes still play normally.' }),
  ]);

  root.replaceChildren(el('div', { class: 'stack hub' }, [
    el('section', { class: 'hero' }, [
      el('img', { class: 'hero__logo', src: b.logo, alt: `${b.collegeName} logo` }),
      el('h1', { class: 'hero__title', text: b.platformName }),
      el('p', { class: 'hero__tagline', text: b.tagline }),
      el('div', { class: 'row row--wrap centered' }, [
        el('a', { class: 'btn btn--gold btn--lg', href: 'student.html', text: '▶ Play a quiz' }),
        el('a', { class: 'btn btn--secondary btn--lg', href: 'teacher.html', text: 'Teacher dashboard' }),
      ]),
    ]),
    storageWarning,
    el('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),
    el('div', { class: 'loading-slot' }, [ui.loader('Loading subjects…')]),
  ]));

  // The bank is the slow part, so the hero paints first and subjects fill in.
  await Promise.all([bank.load(), loadAvatars()]);
  const slot = $('.loading-slot');

  const profile = store.getProfile();
  const subjects = bank.bank.subjects.filter((s) => s.quizzes.some((q) => bank.isPublished(q)));
  const liveCount = bank.allQuizzes().filter((q) => bank.isPublished(q)).length;

  slot.replaceChildren(el('div', { class: 'stack' }, [
    profile ? welcomeBack(profile) : null,
    el('header', { class: 'page-head' }, [
      el('h2', { class: 'page-head__title', text: 'What can you learn here?' }),
      el('p', {
        class: 'page-head__sub',
        text: `${liveCount} quizzes across ${subjects.length} subjects. Earn XP, unlock badges, climb the leaderboard.`,
      }),
    ]),
    subjects.length
      ? el('div', { class: 'subject-grid' }, subjects.map((s) => ui.subjectCard(s, {
        onOpen: () => { location.href = `student.html#/subject/${s.id}`; },
      })))
      : ui.emptyState('📭', 'No quizzes published yet', 'Add a subject file to /questions/ and list it in questions/index.json.'),
    el('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),
    featureRow(),
  ]));
}

/** A returning student sees their level and a one-tap way back in. */
function welcomeBack(profile) {
  const info = levelInfo(profile.xp);
  const avatar = getAvatar(profile.avatarId);
  return el('div', { class: 'card welcome row row--between row--wrap' }, [
    el('div', { class: 'row' }, [
      el('img', { class: 'avatar-chip avatar-chip--lg', src: avatar?.file || '', alt: '' }),
      el('div', {}, [
        el('h2', { text: `Welcome back, ${profile.nickname}.` }),
        el('p', {
          class: 'page-head__sub',
          text: `Level ${info.level} · ${info.title} · ${formatNumber(profile.xp)} XP · ${profile.badges.length} badges`,
        }),
      ]),
    ]),
    el('a', { class: 'btn btn--primary', href: 'student.html', text: 'Carry on' }),
  ]);
}

const FEATURES = [
  ['🎯', 'Real trade content', 'Tool ID, regs, pipework, wiring, joints, RAMS and calculations — written for the workshop, not a textbook.'],
  ['🏁', 'Seven game modes', 'Classic race, team battle, survival, time attack, practice, teacher challenge and random mix.'],
  ['🏅', 'Badges worth chasing', 'From Plumbing Apprentice to Master Tradesperson, with XP, levels and daily streaks along the way.'],
  ['♿', 'Built for everyone', 'Keyboard-first, screen reader friendly, high contrast, reduced motion and adjustable text.'],
];

const featureRow = () => el('div', { class: 'grid grid--4' },
  FEATURES.map(([icon, title, body]) => el('div', { class: 'card feature stack' }, [
    el('span', { class: 'feature__icon', 'aria-hidden': 'true', text: icon }),
    el('h3', { text: title }),
    el('p', { class: 'page-head__sub', text: body }),
  ])));

registerPWA();
boot();
