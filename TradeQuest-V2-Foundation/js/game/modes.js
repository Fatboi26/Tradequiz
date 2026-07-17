/* ============================================================================
   modes.js — game mode definitions.
   ----------------------------------------------------------------------------
   A mode is pure configuration. The engine reads these flags; it has no
   per-mode branching beyond them. Adding a mode is an entry in this list.
   ========================================================================== */

export const MODES = [
  {
    id: 'classic',
    name: 'Classic Race',
    icon: '🏁',
    blurb: 'Answer fast, score big. The full quiz, against the clock.',
    colour: 'var(--c-primary)',
    // Engine flags
    timed: true,
    lives: null,             // null = unlimited
    shuffleQuestions: true,
    showExplanations: true,
    countsToXp: true,
    leaderboard: true,
    teams: false,
    globalTimeLimit: null,   // seconds for the whole run, null = per-question only
  },
  {
    id: 'team',
    name: 'Team Battle',
    icon: '🤝',
    blurb: 'Split the room into teams. Pass the device, or play on the board.',
    colour: 'var(--c-secondary)',
    timed: true,
    lives: null,
    shuffleQuestions: true,
    showExplanations: true,
    countsToXp: true,
    leaderboard: true,
    teams: true,
    defaultTeams: ['Red Team', 'Blue Team'],
    globalTimeLimit: null,
  },
  {
    id: 'survival',
    name: 'Survival',
    icon: '🛡️',
    blurb: 'Three lives. One wrong answer costs you one. How far can you get?',
    colour: 'var(--c-danger)',
    timed: true,
    lives: 3,
    shuffleQuestions: true,
    endless: true,           // recycle the pool until lives run out
    showExplanations: false, // keep the pace up
    countsToXp: true,
    leaderboard: true,
    teams: false,
    globalTimeLimit: null,
  },
  {
    id: 'timeattack',
    name: 'Time Attack',
    icon: '⏱️',
    blurb: 'Ninety seconds. As many correct answers as you can land.',
    colour: 'var(--c-warning)',
    timed: false,            // no per-question clock — one clock for the run
    lives: null,
    shuffleQuestions: true,
    endless: true,
    showExplanations: false,
    countsToXp: true,
    leaderboard: true,
    teams: false,
    globalTimeLimit: 90,
  },
  {
    id: 'practice',
    name: 'Practice',
    icon: '📖',
    blurb: 'No clock, no pressure. Full explanations after every question.',
    colour: 'var(--c-support)',
    timed: false,
    lives: null,
    shuffleQuestions: false,
    showExplanations: true,
    countsToXp: true,
    xpMultiplier: 0.5,       // still worth doing, worth less than a real run
    leaderboard: false,
    teams: false,
    globalTimeLimit: null,
  },
  {
    id: 'challenge',
    name: 'Teacher Challenge',
    icon: '🎯',
    blurb: 'Tighter clock, no explanations, double XP. Set by your tutor.',
    colour: 'var(--c-accent)',
    timed: true,
    timeMultiplier: 0.6,     // 40% less thinking time
    lives: null,
    shuffleQuestions: true,
    shuffleOptions: true,
    showExplanations: false,
    countsToXp: true,
    xpMultiplier: 2,
    leaderboard: true,
    teams: false,
    globalTimeLimit: null,
  },
  {
    id: 'random',
    name: 'Random Mix',
    icon: '🎲',
    blurb: 'Twenty questions pulled from every subject on the platform.',
    colour: 'var(--c-info)',
    timed: true,
    lives: null,
    shuffleQuestions: true,
    showExplanations: true,
    countsToXp: true,
    leaderboard: false,
    teams: false,
    randomPool: true,        // ignore the chosen quiz; draw from the whole bank
    poolSize: 20,
    globalTimeLimit: null,
  },
];

export const getMode = (id) => MODES.find((m) => m.id === id) || MODES[0];

/** Modes valid for a given quiz. Random Mix needs no quiz at all. */
export const modesForQuiz = (quiz) => MODES.filter((m) => !m.randomPool || !quiz);
