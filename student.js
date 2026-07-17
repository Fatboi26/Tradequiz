/* ============================================================================
   student.js — the student experience.
   ----------------------------------------------------------------------------
   This is a controller, not a library. It owns the #app element, listens to
   the hash for routing, and wires the engine to the DOM. All the rules live
   in js/core and js/game; this file only decides what appears on screen.

   Routes (hash-based, so Cloudflare Pages needs no rewrite rules):
     #/            hub
     #/subject/:id subject → quiz list
     #/quiz/:id    quiz → mode picker
     #/play        active run (not linkable; falls back to the hub)
     #/badges      badge cabinet
     #/avatars     avatar picker
     #/history     quiz history
   ========================================================================== */

import * as config from '../core/config.js';
import * as bank from '../core/bank.js';
import * as store from '../core/storage.js';
import { $, el, announce, formatNumber, formatTime, shuffle, sample, clamp } from '../core/utils.js';
import * as a11y from '../ui/a11y.js';
import * as ui from '../ui/components.js';
import * as fx from '../ui/effects.js';
import { MODES, getMode, modesForQuiz } from '../game/modes.js';
import { Engine } from '../game/engine.js';
import { getType, DELIBERATE_TYPES } from '../game/questionTypes.js';
import {
  loadAvatars, avatars, getAvatar, levelInfo, allBadges, getBadge,
} from '../game/gamification.js';
import { applyRun } from '../game/progress.js';

/* -------------------------------------------------------------- app state */

const app = () => $('#app');
let profile = null;
let run = null;          // the live Engine, if any
let runContext = null;   // { quiz, mode, subjectId }

/* ------------------------------------------------------------------ boot */

async function boot() {
  try {
    await config.load();
    a11y.mount();
    await Promise.all([bank.load(), loadAvatars()]);
  } catch (e) {
    console.error('Boot failed:', e);
    app().replaceChildren(ui.emptyState(
      '⚠️', 'Could not load the quizzes',
      'Check that the questions folder uploaded correctly, then refresh.',
    ));
    return;
  }

  profile = store.getProfile();
  window.addEventListener('hashchange', route);
  route();
}

/* --------------------------------------------------------------- routing */

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  // A run in progress is abandoned if the student navigates away.
  if (run && !location.hash.startsWith('#/play')) { run.quit(); run = null; }

  if (!profile) return viewOnboarding();

  const [, section, param] = location.hash.replace(/^#\//, '').split('/');
  const first = location.hash.replace(/^#\//, '').split('/')[0];

  switch (first) {
    case 'subject':  return viewSubject(location.hash.split('/')[2]);
    case 'quiz':     return viewQuiz(location.hash.split('/')[2]);
    case 'badges':   return viewBadges();
    case 'avatars':  return viewAvatars();
    case 'history':  return viewHistory();
    case 'play':     return run ? null : go('#/');
    default:         return viewHub();
  }
}

/** Swap the page contents, with a transition unless motion is reduced. */
function render(...nodes) {
  const root = app();
  root.classList.remove('is-in');
  root.replaceChildren(...nodes.filter(Boolean));
  // Force a reflow so the animation restarts on every view.
  void root.offsetWidth;
  root.classList.add('is-in');
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: fx.motionOK() ? 'smooth' : 'auto' });
}

const pageTitle = (text, sub = null) =>
  el('header', { class: 'page-head' }, [
    el('h1', { class: 'page-head__title', text }),
    sub ? el('p', { class: 'page-head__sub', text: sub }) : null,
  ]);

const backLink = (href, text) =>
  el('a', { class: 'btn btn--ghost btn--sm back-link', href, text: `← ${text}` });

/* ====================================================================== */
/* Onboarding — nickname + avatar                                          */
/* ====================================================================== */

function viewOnboarding() {
  const draft = store.blankProfile();

  const nameInput = el('input', {
    class: 'input input--big', id: 'nickname', type: 'text', maxlength: '18',
    autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. Copper Kid',
    'aria-describedby': 'nickname-hint',
  });
  const error = el('p', { class: 'field__error', role: 'alert' });

  const picker = ui.avatarPicker(draft, {
    onChoose: (id) => { draft.avatarId = id; },
  });

  const submit = el('button', {
    type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Start playing',
    on: {
      click: () => {
        const name = nameInput.value.trim();
        if (name.length < 2) {
          error.textContent = 'Please enter a nickname of at least 2 characters.';
          nameInput.focus();
          return;
        }
        draft.nickname = name;
        store.saveProfile(draft);
        profile = store.getProfile();
        fx.play('start');
        fx.toast(`Welcome, ${name}.`, 'success');
        go('#/');
      },
    },
  });

  // Enter in the name field starts the game — one less tap on a phone.
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });

  render(
    el('div', { class: 'onboard stack' }, [
      pageTitle(
        `Welcome to ${config.config.branding.platformName}`,
        config.config.branding.tagline,
      ),
      el('div', { class: 'card stack' }, [
        el('div', { class: 'field' }, [
          el('label', { class: 'field__label', for: 'nickname', text: 'Pick a nickname' }),
          nameInput,
          el('p', {
            class: 'field__hint', id: 'nickname-hint',
            text: 'This is what shows on the leaderboard. No real names needed.',
          }),
          error,
        ]),
      ]),
      el('div', { class: 'card stack' }, [
        el('h2', { text: 'Choose your avatar' }),
        el('p', {
          class: 'field__hint',
          text: 'More avatars unlock as you earn XP, badges and levels. You can change this at any time.',
        }),
        picker,
      ]),
      submit,
    ]),
  );
  nameInput.focus();
}

/* ====================================================================== */
/* Hub                                                                     */
/* ====================================================================== */

function viewHub() {
  const subjects = bank.bank.subjects.filter(
    (s) => s.quizzes.some((q) => bank.isPublished(q)),
  );

  const grid = el('div', { class: 'subject-grid' },
    subjects.map((s) => ui.subjectCard(s, { onOpen: () => go(`#/subject/${s.id}`) })));

  const randomBtn = el('button', {
    type: 'button', class: 'btn btn--accent btn--lg',
    text: '🎲 Random Mix — questions from every subject',
    on: { click: () => startRun({ quiz: null, mode: getMode('random'), subjectId: null }) },
  });

  render(
    el('div', { class: 'stack' }, [
      ui.playerStrip(profile).node,
      el('nav', { class: 'quick-nav', 'aria-label': 'Your progress' }, [
        el('a', { class: 'btn btn--ghost', href: '#/badges', text: `${config.icon('badge')} Badges` }),
        el('a', { class: 'btn btn--ghost', href: '#/avatars', text: '🧑‍🔧 Avatars' }),
        el('a', { class: 'btn btn--ghost', href: '#/history', text: '📋 History' }),
      ]),
      el('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),
      pageTitle('Choose a subject', 'Pick a trade, then pick a quiz.'),
      subjects.length ? grid : ui.emptyState(
        '📭', 'No quizzes published yet',
        'Your teacher can publish quizzes from the teacher dashboard.',
      ),
      subjects.length ? el('div', { class: 'centered' }, [randomBtn]) : null,
    ]),
  );
}

/* ====================================================================== */
/* Subject → quiz list                                                     */
/* ====================================================================== */

function viewSubject(id) {
  const subject = bank.getSubject(id);
  if (!subject) return go('#/');

  const live = subject.quizzes.filter((q) => bank.isPublished(q));
  const byTopic = new Map();
  live.forEach((q) => {
    const key = q.topic || 'general';
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(q);
  });

  const topicName = (key) =>
    subject.topics?.find((t) => t.id === key)?.name || 'General';

  const sections = Array.from(byTopic.entries()).map(([key, quizzes]) =>
    el('section', { class: 'stack' }, [
      el('h2', { class: 'topic-head', text: topicName(key) }),
      el('div', { class: 'quiz-list' },
        quizzes.map((q) => ui.quizCard(q, { onPlay: () => go(`#/quiz/${q.id}`) }))),
    ]));

  const xp = profile.subjectXp?.[subject.id] || 0;

  render(
    el('div', { class: 'stack' }, [
      backLink('#/', 'All subjects'),
      el('div', { class: 'subject-hero', style: { '--subject-c': subject.color || 'var(--c-primary)' } }, [
        el('span', { class: 'subject-hero__icon', 'aria-hidden': 'true', text: subject.icon || '📘' }),
        el('div', {}, [
          el('h1', { text: subject.name }),
          el('p', { class: 'page-head__sub', text: subject.description || '' }),
          el('p', { class: 'chip', text: `${formatNumber(xp)} XP earned in this subject` }),
        ]),
      ]),
      live.length ? el('div', { class: 'stack' }, sections) : ui.emptyState(
        '📭', 'Nothing live right now',
        'There are no published quizzes in this subject yet. Check back soon.',
      ),
    ]),
  );
}

/* ====================================================================== */
/* Quiz → mode picker                                                      */
/* ====================================================================== */

function viewQuiz(id) {
  const quiz = bank.getQuiz(id);
  if (!quiz) return go('#/');
  const subject = bank.getSubject(quiz.subjectId);
  if (!subject) return go('#/');

  let chosen = getMode('classic');
  let teams = [...(getMode('team').defaultTeams || [])];

  const teamFields = el('div', { class: 'card stack', hidden: true }, [
    el('h3', { text: 'Team names' }),
    el('p', { class: 'field__hint', text: 'Pass the device round, or play it on the big screen.' }),
  ]);
  const teamInputs = el('div', { class: 'stack' });
  teamFields.append(teamInputs);

  function renderTeamInputs() {
    teamInputs.replaceChildren(...teams.map((name, i) =>
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: `team-${i}`, text: `Team ${i + 1}` }),
        el('input', {
          class: 'input', id: `team-${i}`, value: name, maxlength: '16',
          on: { input: (e) => { teams[i] = e.target.value; } },
        }),
      ])), addTeam);
  }
  const addTeam = el('button', {
    type: 'button', class: 'btn btn--ghost btn--sm', text: '+ Add a team',
    on: {
      click: () => {
        if (teams.length >= 4) return fx.toast('Four teams is the maximum.', 'warning');
        teams.push(`Team ${teams.length + 1}`);
        renderTeamInputs();
      },
    },
  });
  renderTeamInputs();

  const modeGrid = el('div', { class: 'mode-grid', role: 'radiogroup', 'aria-label': 'Game mode' },
    modesForQuiz(quiz).map((m) => {
      const card = el('button', {
        type: 'button', class: 'mode-card', role: 'radio',
        'aria-checked': String(m.id === chosen.id),
        style: { '--mode-c': m.colour },
        on: {
          click: () => {
            chosen = m;
            [...modeGrid.children].forEach((c) => c.setAttribute('aria-checked', String(c === card)));
            teamFields.hidden = !m.teams;
            announce(`${m.name} selected.`);
          },
        },
      }, [
        el('span', { class: 'mode-card__icon', 'aria-hidden': 'true', text: m.icon }),
        el('span', { class: 'mode-card__name', text: m.name }),
        el('span', { class: 'mode-card__blurb', text: m.blurb }),
      ]);
      return card;
    }));

  const start = el('button', {
    type: 'button', class: 'btn btn--gold btn--lg btn--block',
    text: 'Start quiz',
    on: {
      click: () => startRun({
        quiz,
        mode: chosen,
        subjectId: subject.id,
        teams: chosen.teams ? teams.filter((t) => t.trim()) : [],
      }),
    },
  });

  const scores = store.getScores(quiz.id)
    .sort((a, b) => b.points - a.points);

  render(
    el('div', { class: 'stack' }, [
      backLink(`#/subject/${subject.id}`, subject.name),
      pageTitle(quiz.title, quiz.description || ''),
      el('div', { class: 'row row--wrap' }, [
        el('span', { class: 'chip', text: `${bank.questionCount(quiz)} questions` }),
        el('span', { class: 'chip', text: `≈ ${Math.ceil(bank.estimatedSeconds(quiz) / 60)} min` }),
        quiz.level ? el('span', { class: 'chip', text: quiz.level }) : null,
        ...(quiz.tags || []).map((t) => el('span', { class: 'chip', text: `#${t}` })),
      ]),
      el('h2', { text: 'Choose a game mode' }),
      modeGrid,
      teamFields,
      start,
      el('section', { class: 'stack' }, [
        el('h2', { text: 'Leaderboard for this quiz' }),
        el('p', { class: 'field__hint', text: 'Scores saved on this device.' }),
        ui.leaderboard(scores, { meId: profile.id }),
      ]),
    ]),
  );
}

/* ====================================================================== */
/* The run                                                                 */
/* ====================================================================== */

/** Build the question pool for a run and hand control to the play view. */
function startRun({ quiz, mode, subjectId, teams = [] }) {
  let questions;

  if (mode.randomPool || !quiz) {
    // Random Mix: pull from every published quiz, tagging each question with
    // its subject so XP can still be credited correctly.
    questions = bank.bank.subjects.flatMap((s) =>
      s.quizzes.filter((q) => bank.isPublished(q))
        .flatMap((q) => q.questions.map((qq) => ({ ...qq, _subjectId: s.id }))));
    questions = sample(questions, mode.poolSize || 15);
    subjectId = null;
  } else {
    questions = quiz.questions.map((q) => ({ ...q, _subjectId: subjectId }));
  }

  if (!questions.length) {
    return fx.toast('That quiz has no questions in it yet.', 'warning');
  }

  runContext = { quiz, mode, subjectId };
  run = new Engine({ quiz, mode, questions, teams });
  history.replaceState(null, '', '#/play');
  viewPlay();
}

function viewPlay() {
  const mode = runContext.mode;

  /* ------------------------------------------------------------ HUD parts */
  const score = el('span', { class: 'hud__score', text: '0' });
  const counter = el('span', { class: 'hud__counter' });
  const streakChip = el('span', { class: 'hud__streak', hidden: true });
  const lives = el('div', { class: 'hud__lives', hidden: !mode.lives });
  const teamBanner = el('div', { class: 'team-banner', hidden: !run.teams.length });
  const bar = el('div', { class: 'progress__fill' });
  const progress = el('div', {
    class: 'progress', role: 'progressbar', 'aria-label': 'Quiz progress',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
  }, [bar]);

  const timerFill = el('div', { class: 'progress__fill progress__fill--timer' });
  const timerBar = el('div', { class: 'progress progress--timer', hidden: !mode.timed && !mode.globalTimeLimit }, [timerFill]);
  const timerText = el('span', { class: 'hud__timer', 'aria-hidden': 'true' });

  const stage = el('div', { class: 'q-stage' });

  const quitBtn = el('button', {
    type: 'button', class: 'btn btn--ghost btn--sm',
    text: 'Quit',
    on: {
      click: () => {
        if (!confirm('Quit this run? Your score will not be saved.')) return;
        run.quit(); run = null;
        go(runContext.subjectId ? `#/subject/${runContext.subjectId}` : '#/');
      },
    },
  });

  const hud = el('div', { class: 'hud' }, [
    el('div', { class: 'row' }, [
      el('span', { class: 'chip', text: `${mode.icon} ${mode.name}` }),
      counter,
      streakChip,
    ]),
    el('div', { class: 'row' }, [
      lives,
      el('span', { class: 'hud__score-wrap' }, [
        el('span', { class: 'visually-hidden', text: 'Score: ' }),
        score,
      ]),
      timerText,
      quitBtn,
    ]),
  ]);

  render(el('div', { class: 'play stack' }, [
    hud, teamBanner, progress, timerBar, stage,
  ]));

  /* ------------------------------------------------------------- wiring */

  run.on('start', () => fx.play('start'));

  run.on('question', ({ question, number, total, team }) => {
    counter.textContent = mode.endless ? `Question ${number}` : `Question ${number} of ${total}`;
    if (team) {
      teamBanner.textContent = `${team}'s turn`;
      teamBanner.hidden = false;
    }
    renderQuestion(question, stage);
    const pct = Math.round(run.progress * 100);
    bar.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(pct));
  });

  run.on('tick', ({ msLeft, msTotal, globalMsLeft }) => {
    const showGlobal = globalMsLeft !== null;
    const left = showGlobal ? globalMsLeft : msLeft;
    const total = showGlobal ? mode.globalTimeLimit * 1000 : msTotal;
    if (!total) return;
    const pct = clamp((left / total) * 100, 0, 100);
    timerFill.style.width = `${pct}%`;
    timerFill.classList.toggle('is-urgent', pct < 25);
    timerText.textContent = formatTime(Math.ceil(left / 1000));
  });

  run.on('answered', ({ correct, points, xp, streak, question, response }) => {
    score.textContent = formatNumber(run.points);
    fx.countUp(score, run.points, { duration: 500 });
    streakChip.hidden = streak < 2;
    streakChip.textContent = `${config.icon('streak')} ${streak} in a row`;
    afterGrade({ question, response, correct, points, xp, stage });
  });

  run.on('timeout', ({ question }) => {
    fx.play('timeout');
    streakChip.hidden = true;
    afterGrade({ question, response: null, correct: false, points: 0, xp: 0, stage, timedOut: true });
  });

  run.on('lifelost', ({ livesLeft }) => {
    lives.replaceChildren(...Array.from({ length: mode.lives }, (_, i) =>
      el('span', { class: `hud__life ${i < livesLeft ? '' : 'is-lost'}`, 'aria-hidden': 'true', text: '❤' })));
    announce(`${livesLeft} lives left.`);
  });

  run.on('end', ({ summary }) => viewResults(summary));

  if (mode.lives) {
    lives.replaceChildren(...Array.from({ length: mode.lives }, () =>
      el('span', { class: 'hud__life', 'aria-hidden': 'true', text: '❤' })));
  }

  run.start();
}

/** Draw one question into the stage. */
function renderQuestion(question, stage) {
  const type = getType(question.type);
  const deliberate = DELIBERATE_TYPES.has(question.type);

  const head = el('div', { class: 'stack' }, [
    question.scenario ? el('div', { class: 'q-scenario' }, [
      el('span', { class: 'q-scenario__label', text: 'Scenario' }),
      el('p', { text: question.scenario }),
    ]) : null,
    el('h2', { class: 'q-text', text: question.text }),
    question.bonus ? el('span', { class: 'chip chip--gold', text: '★ Bonus question — double points' }) : null,
  ]);

  const view = type.render(question, {
    // Instant types grade the moment the tile is tapped.
    onCommit: () => run.answer(view.getResponse()),
    // Deliberate types own their Submit button; we just listen to it.
    onReady: () => {},
  });

  if (deliberate && view.submitButton) {
    view.submitButton.addEventListener('click', () => run.answer(view.getResponse()));
  }

  stage.replaceChildren(head, view.node);
  stage.dataset.type = question.type;
  // Announce, then move focus, so screen readers hear the question first.
  announce(question.text);
  if (!fx.motionOK()) view.focusFirst?.();
  else setTimeout(() => view.focusFirst?.(), 120);
}

/** Reveal the answer, celebrate, then offer the way onward. */
async function afterGrade({ question, response, correct, points, xp, stage, timedOut = false }) {
  const type = getType(question.type);
  type.reveal?.(stage, question, response);

  // Disable anything still live in the stage so a late tap cannot double-grade.
  stage.querySelectorAll('button:not(.next-btn), input, select').forEach((n) => { n.disabled = true; });

  fx.play(correct ? 'correct' : 'wrong');
  fx.verdict(correct, { text: timedOut ? 'Time!' : null });
  if (correct) {
    fx.xpFloat(xp, stage);
    if (question.bonus) fx.confetti({ count: 50 });
  }

  const showExplain = runContext.mode.showExplanations !== false && question.explain;
  const next = el('button', {
    type: 'button', class: 'btn btn--gold btn--lg btn--block next-btn',
    text: runContext.mode.endless ? 'Keep going' : 'Next question',
    on: { click: () => { next.disabled = true; run.continue(); } },
  });

  const panel = el('div', { class: 'stack q-after' }, [
    el('p', {
      class: `q-verdict ${correct ? 'is-correct' : 'is-wrong'}`,
      text: timedOut ? 'Out of time.' : correct ? `Correct. +${formatNumber(points)} points` : 'Not this time.',
    }),
    showExplain ? el('div', { class: 'q-explain' }, [
      el('span', { class: 'q-explain__label', text: 'Why' }),
      el('p', { text: question.explain }),
    ]) : null,
    next,
  ]);

  stage.append(panel);
  next.focus();
}

/* ====================================================================== */
/* Results                                                                 */
/* ====================================================================== */

async function viewResults(summary) {
  const reward = applyRun(summary, { subjectId: runContext.subjectId });
  profile = reward?.profile || profile;
  run = null;

  const verdict = summary.perfect ? 'Perfect round!'
    : summary.accuracy >= 80 ? 'Strong work.'
    : summary.accuracy >= 50 ? 'Getting there.'
    : 'Worth another go.';

  const scoreNode = el('div', { class: 'results-hero__score count-up', text: '0' });

  const review = el('div', { class: 'review' },
    summary.answers.map((a, i) => el('div', { class: 'review__row' }, [
      el('span', { class: `review__mark ${a.correct ? 'is-correct' : 'is-wrong'}`, 'aria-hidden': 'true', text: a.correct ? '✔' : '✘' }),
      el('div', { class: 'review__q' }, [
        el('span', { text: `${i + 1}. ${a.question.text}` }),
        a.question.explain ? el('p', { class: 'review__explain', text: a.question.explain }) : null,
      ]),
      el('span', { class: 'review__pts', text: a.correct ? `+${formatNumber(a.points)}` : '—' }),
      el('span', { class: 'visually-hidden', text: a.correct ? 'Correct' : 'Incorrect' }),
    ])));

  const teamBlock = summary.teamScores ? el('div', { class: 'team-scores' },
    Object.entries(summary.teamScores)
      .sort((a, b) => b[1] - a[1])
      .map(([name, pts], i) => el('div', { class: `team-score ${i === 0 ? 'is-winner' : ''}` }, [
        el('span', { class: 'team-score__name', text: `${i === 0 ? '🏆 ' : ''}${name}` }),
        el('span', { class: 'team-score__value', text: formatNumber(pts) }),
      ]))) : null;

  const scores = runContext.quiz
    ? store.getScores(runContext.quiz.id).sort((a, b) => b.points - a.points)
    : [];

  render(el('div', { class: 'stack results' }, [
    el('div', { class: 'results-hero' }, [
      el('span', { class: 'results-hero__label', text: runContext.quiz?.title || 'Random Mix' }),
      scoreNode,
      el('span', { class: 'results-hero__verdict', text: verdict }),
      el('div', { class: 'row row--wrap centered' }, [
        el('span', { class: 'chip', text: `${summary.correct}/${summary.total} correct` }),
        el('span', { class: 'chip', text: `${summary.accuracy}%` }),
        el('span', { class: 'chip', text: `Best streak ${summary.bestStreak}` }),
        reward?.xpGained ? el('span', { class: 'chip chip--gold', text: `+${reward.xpGained} XP` }) : null,
      ]),
    ]),
    teamBlock,
    ui.playerStrip(profile).node,
    el('div', { class: 'row row--wrap centered' }, [
      el('button', {
        type: 'button', class: 'btn btn--primary btn--lg',
        text: 'Play again',
        on: { click: () => startRun({ ...runContext, teams: run?.teams || [] }) },
      }),
      el('a', {
        class: 'btn btn--secondary btn--lg',
        href: runContext.subjectId ? `#/subject/${runContext.subjectId}` : '#/',
        text: 'Choose another quiz',
      }),
    ]),
    scores.length ? el('section', { class: 'stack' }, [
      el('h2', { text: 'Leaderboard' }),
      ui.leaderboard(scores, { meId: profile.id }),
    ]) : null,
    el('section', { class: 'stack' }, [
      el('h2', { text: 'Review your answers' }),
      review,
    ]),
  ]));

  /* ------------------------------------------------------- celebrations */
  fx.countUp(scoreNode, summary.points, { duration: 1200 });
  if (summary.perfect) { fx.play('levelup'); fx.confetti({ count: 140 }); }
  else if (summary.accuracy >= 80) fx.confetti({ count: 60 });

  // Queue the rewards so they do not fight each other for the screen.
  if (reward?.leveledUp) {
    const info = levelInfo(profile.xp);
    await fx.levelUp(info.level, info.title, scoreNode);
  }
  for (const badge of reward?.newBadges || []) {
    await fx.badgeUnlock(badge);
  }
  if (reward?.newAvatars?.length) {
    const names = reward.newAvatars.map((a) => a.name).join(', ');
    fx.toast(`New avatar unlocked: ${names}. Find it in Avatars.`, 'success', 6000);
  }
  if (reward?.dayStreak?.count > 1) {
    announce(`Day streak: ${reward.dayStreak.count} days.`);
  }
}

/* ====================================================================== */
/* Badges / avatars / history                                              */
/* ====================================================================== */

function viewBadges() {
  const earned = profile.badges.length;
  render(el('div', { class: 'stack' }, [
    backLink('#/', 'Hub'),
    pageTitle('Badge cabinet', `${earned} of ${allBadges().length} earned.`),
    ui.badgeGrid(profile),
  ]));
}

function viewAvatars() {
  const grid = ui.avatarPicker(profile, {
    onChoose: (id) => {
      profile.avatarId = id;
      store.saveProfile(profile);
      fx.play('tick');
      announce(`${getAvatar(id)?.name} selected.`);
    },
  });
  render(el('div', { class: 'stack' }, [
    backLink('#/', 'Hub'),
    pageTitle('Your avatar', 'Locked avatars show what you need to do to earn them.'),
    grid,
  ]));
}

function viewHistory() {
  const st = profile.stats;
  render(el('div', { class: 'stack' }, [
    backLink('#/', 'Hub'),
    pageTitle('Your history'),
    el('div', { class: 'stat-row' }, [
      stat('Quizzes completed', formatNumber(st.quizzesCompleted)),
      stat('Questions answered', formatNumber(st.questionsAnswered)),
      stat('Accuracy', st.questionsAnswered ? `${Math.round((st.correctAnswers / st.questionsAnswered) * 100)}%` : '—'),
      stat('Best streak', formatNumber(st.bestStreak)),
      stat('Perfect rounds', formatNumber(st.perfectQuizzes)),
      stat('Day streak', `${profile.dayStreak.count} (best ${profile.dayStreak.best})`),
    ]),
    el('h2', { text: 'Recent quizzes' }),
    ui.historyList(profile, { limit: 25 }),
    el('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),
    el('button', {
      type: 'button', class: 'btn btn--danger btn--sm',
      text: 'Reset my progress on this device',
      on: {
        click: () => {
          if (!confirm('This deletes your nickname, XP, badges and history on this device. Continue?')) return;
          store.clearProfile();
          profile = null;
          go('#/');
        },
      },
    }),
  ]));
}

const stat = (label, value) => el('div', { class: 'stat' }, [
  el('span', { class: 'stat__value', text: value }),
  el('span', { class: 'stat__label', text: label }),
]);

/* --------------------------------------------------------------- start */
boot();
