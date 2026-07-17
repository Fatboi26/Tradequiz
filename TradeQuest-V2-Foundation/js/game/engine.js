/* ============================================================================
   engine.js — the quiz state machine.
   ----------------------------------------------------------------------------
   The engine owns the run: which question, how long is left, what the score
   is, when it ends. It knows NOTHING about the DOM. It emits events; the
   student page listens and renders. That separation is what lets the same
   engine drive a phone, a whiteboard and (later) a live multiplayer room.

   Events emitted:
     'start'      { total }
     'question'   { question, index, total, timeLimitMs }
     'tick'       { msLeft, msTotal, globalMsLeft }
     'answered'   { correct, points, xp, streak, question, response }
     'timeout'    { question }
     'lifelost'   { livesLeft }
     'end'        { summary }

   Usage:
     const run = new Engine({ quiz, mode, questions });
     run.on('question', ({ question }) => render(question));
     run.start();
     run.answer(response);
   ========================================================================== */

import { shuffle, clamp } from '../core/utils.js';
import { getType } from './questionTypes.js';
import { questionPoints, questionXp, perfectRoundPoints, completionXp, summarise } from './scoring.js';

const TICK_MS = 100;

export class Engine {
  /**
   * @param {object} o
   * @param {object|null} o.quiz     The quiz being played (null for Random Mix).
   * @param {object} o.mode          A mode object from modes.js.
   * @param {Array}  o.questions     The question pool for this run.
   * @param {string[]} [o.teams]     Team names, for Team Battle.
   */
  constructor({ quiz, mode, questions, teams = [] }) {
    this.quiz = quiz;
    this.mode = mode;
    this.teams = teams;

    // Build the running order.
    let pool = questions.slice();
    if (mode.shuffleQuestions) pool = shuffle(pool);
    if (mode.randomPool && mode.poolSize) pool = pool.slice(0, mode.poolSize);
    this.pool = pool;

    this.state = 'idle';          // idle | running | grading | ended
    this.index = -1;
    this.answers = [];            // { question, response, correct, points, xp, ms }
    this.streak = 0;
    this.bestStreak = 0;
    this.lives = mode.lives;
    this.teamScores = Object.fromEntries(teams.map((t) => [t, 0]));
    this.currentTeam = 0;

    this._listeners = new Map();
    this._timer = null;
    this._startedAt = 0;
    this._questionStart = 0;
    this._msLeft = 0;
    this._msTotal = 0;
    this._runStart = 0;
  }

  /* ------------------------------------------------------------- events -- */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return this;
  }

  off(event, fn) { this._listeners.get(event)?.delete(fn); return this; }

  _emit(event, payload = {}) {
    this._listeners.get(event)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`Listener for "${event}" threw:`, e); }
    });
  }

  /* -------------------------------------------------------------- getters */
  get total() { return this.mode.endless ? Infinity : this.pool.length; }
  get current() { return this.pool[this.index] ?? null; }
  get points() { return this.answers.reduce((n, a) => n + (a.points || 0), 0); }
  get correctCount() { return this.answers.filter((a) => a.correct).length; }

  /** Seconds allowed for a question, after the mode's multiplier. */
  timeLimitMs(question) {
    if (!this.mode.timed) return 0;
    const base = (question.time ?? 20) * 1000;
    return Math.round(base * (this.mode.timeMultiplier ?? 1));
  }

  /* --------------------------------------------------------------- control */

  start() {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this._runStart = performance.now();
    this._emit('start', { total: this.total, mode: this.mode, quiz: this.quiz });
    this._next();
  }

  /** Advance to the next question, or end the run. */
  _next() {
    if (this.state === 'ended') return;
    this.index += 1;

    // Endless modes recycle the pool rather than stopping.
    if (this.index >= this.pool.length) {
      if (this.mode.endless && this.pool.length) this.pool = shuffle(this.pool);
      else return this.end();
      this.index = 0;
    }

    // Global clock (Time Attack) can end the run between questions.
    if (this._globalExpired()) return this.end();

    const question = this.current;
    this._msTotal = this.timeLimitMs(question);
    this._msLeft = this._msTotal;
    this._questionStart = performance.now();

    this._emit('question', {
      question,
      index: this.index,
      number: this.answers.length + 1,
      total: this.total,
      timeLimitMs: this._msTotal,
      team: this.teams[this.currentTeam] || null,
    });

    this._startTimer();
  }

  _startTimer() {
    this._stopTimer();
    // Practice has no clock at all; Time Attack has one clock for the whole run.
    if (!this.mode.timed && !this.mode.globalTimeLimit) return;

    this._timer = setInterval(() => {
      const elapsed = performance.now() - this._questionStart;
      this._msLeft = Math.max(0, this._msTotal - elapsed);

      this._emit('tick', {
        msLeft: this._msLeft,
        msTotal: this._msTotal,
        globalMsLeft: this._globalMsLeft(),
      });

      if (this._globalExpired()) return this.end();
      if (this.mode.timed && this._msLeft <= 0) this._timeout();
    }, TICK_MS);
  }

  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  _globalMsLeft() {
    if (!this.mode.globalTimeLimit) return null;
    return Math.max(0, this.mode.globalTimeLimit * 1000 - (performance.now() - this._runStart));
  }

  _globalExpired() {
    const left = this._globalMsLeft();
    return left !== null && left <= 0;
  }

  /* --------------------------------------------------------------- answering */

  /**
   * Submit a response for the current question.
   * @param {*} response Shape depends on the question type.
   */
  answer(response) {
    if (this.state !== 'running') return null;
    this.state = 'grading';
    this._stopTimer();

    const question = this.current;
    const ms = performance.now() - this._questionStart;
    const { correct } = getType(question.type).grade(question, response);

    this.streak = correct ? this.streak + 1 : 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);

    let points = 0;
    let xp = 0;
    if (correct) {
      const args = {
        timeLeftMs: this.mode.timed ? this._msLeft : this._msTotal || 1,
        timeLimitMs: this._msTotal || 1,
        streak: this.streak,
        bonus: question.bonus,
        override: question.points,
      };
      // Untimed modes get the base points but none of the speed component.
      points = this.mode.timed ? questionPoints(args).total
                               : questionPoints({ ...args, timeLeftMs: 0 }).total;
      xp = Math.round(questionXp(args) * (this.mode.xpMultiplier ?? 1));
    } else if (this.lives !== null) {
      this.lives -= 1;
      this._emit('lifelost', { livesLeft: this.lives });
    }

    const record = { question, response, correct, points, xp, ms, streak: this.streak };
    this.answers.push(record);

    if (this.teams.length) {
      this.teamScores[this.teams[this.currentTeam]] += points;
    }

    this._emit('answered', { ...record, index: this.index, livesLeft: this.lives });
    return record;
  }

  /** The clock ran out. Counts as a wrong answer. */
  _timeout() {
    if (this.state !== 'running') return;
    this._stopTimer();
    const question = this.current;
    this.streak = 0;
    if (this.lives !== null) {
      this.lives -= 1;
      this._emit('lifelost', { livesLeft: this.lives });
    }
    this.answers.push({ question, response: null, correct: false, points: 0, xp: 0, ms: this._msTotal, timedOut: true });
    this.state = 'grading';
    this._emit('timeout', { question, index: this.index, livesLeft: this.lives });
  }

  /**
   * Called by the UI once it has finished showing the result and any
   * explanation. Moves the run on, or ends it.
   */
  continue() {
    if (this.state === 'ended') return;
    this.state = 'running';

    if (this.lives !== null && this.lives <= 0) return this.end();

    // Team Battle passes the device on after every question.
    if (this.teams.length) this.currentTeam = (this.currentTeam + 1) % this.teams.length;

    this._next();
  }

  /** Stop the run and emit the summary. Idempotent. */
  end() {
    if (this.state === 'ended') return this.summary;
    this.state = 'ended';
    this._stopTimer();

    const base = summarise(this.answers);
    // A perfect round only counts on a finite mode where you saw every question.
    const perfect = !this.mode.endless && base.perfect && this.answers.length === this.pool.length;

    const bonusPoints = perfect ? perfectRoundPoints() : 0;
    const bonusXp = Math.round(completionXp({ perfect }) * (this.mode.xpMultiplier ?? 1));

    this.summary = {
      ...base,
      perfect,
      points: base.points + bonusPoints,
      xp: base.xp + bonusXp,
      bonusPoints,
      bonusXp,
      bestStreak: this.bestStreak,
      durationMs: performance.now() - this._runStart,
      answers: this.answers,
      mode: this.mode,
      quiz: this.quiz,
      teamScores: this.teams.length ? { ...this.teamScores } : null,
      livesLeft: this.lives,
      reached: this.answers.length,
    };

    this._emit('end', { summary: this.summary });
    return this.summary;
  }

  /** Abandon the run without recording anything. */
  quit() {
    this._stopTimer();
    this.state = 'ended';
  }

  /** 0–1 progress through a finite run. */
  get progress() {
    if (this.mode.endless) return clamp(this.answers.length / 20, 0, 1);
    return this.pool.length ? clamp(this.answers.length / this.pool.length, 0, 1) : 0;
  }
}
