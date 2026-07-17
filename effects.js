/* ============================================================================
   effects.js — celebrations, toasts and sound.
   ----------------------------------------------------------------------------
   Everything here checks the reduced-motion preference and the branding
   feature flags before doing anything. Effects are never load-bearing: if
   they all no-op, the app still works and still tells the user what happened.
   ========================================================================== */

import { el, $, sleep, announce } from '../core/utils.js';
import { config, feature } from '../core/config.js';
import { getA11y } from '../core/storage.js';

/** Should we animate? Honours the OS setting and our own toggle. */
export function motionOK() {
  const pref = document.documentElement.dataset.motion;
  if (pref === 'reduced') return false;
  if (pref === 'full') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------------ toasts */
function toastStack() {
  let stack = $('.toast-stack');
  if (!stack) {
    stack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  return stack;
}

/**
 * Show a transient message.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'danger'} [tone]
 */
export function toast(message, tone = 'info', ms = 3600) {
  const node = el('div', { class: `toast toast--${tone}` }, [
    el('span', { class: 'toast__icon', 'aria-hidden': 'true', text: { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '⛔' }[tone] }),
    el('span', { text: message }),
  ]);
  toastStack().append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

/* ---------------------------------------------------------------- confetti */

/**
 * Fire confetti from the top of the viewport.
 * Uses CSS animations on plain divs — no canvas, no library, no jank.
 */
export function confetti({ count = 90, colours = null } = {}) {
  if (!motionOK() || !feature('confetti')) return;
  const palette = colours || [
    config.branding?.colors?.gold, config.branding?.colors?.primary,
    config.branding?.colors?.accent, config.branding?.colors?.info,
    config.branding?.colors?.success,
  ].filter(Boolean);

  const layer = el('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    layer.append(el('div', {
      class: 'confetti-bit',
      style: {
        left: `${Math.random() * 100}%`,
        background: palette[i % palette.length],
        '--drift': `${(Math.random() - 0.5) * 260}px`,
        '--spin': `${Math.random() * 1080 - 540}deg`,
        '--fall': `${1900 + Math.random() * 1500}ms`,
        '--delay': `${Math.random() * 500}ms`,
        width: `${6 + Math.random() * 7}px`,
        height: `${9 + Math.random() * 10}px`,
      },
    }));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4200);
}

/* ------------------------------------------------------------ verdict stamp */

/** Big CORRECT / NOT QUITE stamp over the screen. Resolves when it clears. */
export async function verdict(correct, { text = null } = {}) {
  const label = text || (correct ? 'Correct!' : 'Not quite');
  announce(label);
  if (!motionOK()) return;
  const node = el('div', { class: `verdict verdict--${correct ? 'correct' : 'wrong'}`, 'aria-hidden': 'true' }, [
    el('div', { class: 'verdict__stamp', text: label }),
  ]);
  document.body.append(node);
  await sleep(760);
  node.remove();
}

/* ---------------------------------------------------------------- XP float */

/** "+34 XP" floating up from an element. */
export function xpFloat(amount, anchor) {
  if (!motionOK() || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const node = el('div', {
    class: 'xp-float', 'aria-hidden': 'true',
    text: `+${amount} ${config.branding?.icons?.xp || 'XP'}`,
    style: { left: `${r.left + r.width / 2}px`, top: `${r.top}px` },
  });
  document.body.append(node);
  setTimeout(() => node.remove(), 1200);
}

/* ------------------------------------------------------------ badge unlock */

/** Slam a badge unlock banner in. Awaited so several can queue politely. */
export async function badgeUnlock(badge) {
  announce(`Badge unlocked: ${badge.name}. ${badge.desc}`);
  play('badge');
  if (!motionOK()) { toast(`Badge unlocked: ${badge.name}`, 'success'); return; }
  const node = el('div', { class: 'badge-pop', role: 'status' }, [
    el('div', { class: 'badge-pop__icon', 'aria-hidden': 'true', text: badge.icon }),
    el('div', {}, [
      el('div', { class: 'badge-pop__eyebrow', text: 'Badge unlocked' }),
      el('div', { class: 'badge-pop__name', text: badge.name }),
      el('div', { class: 'badge-pop__desc', text: badge.desc }),
    ]),
  ]);
  document.body.append(node);
  confetti({ count: 50 });
  await sleep(3600);
  node.remove();
}

/* --------------------------------------------------------------- count up */

/**
 * Animate a number from its current value to `to`.
 * Falls back to setting the value instantly under reduced motion.
 */
export function countUp(node, to, { duration = 900, prefix = '', suffix = '' } = {}) {
  const from = Number(node.dataset.value || 0);
  node.dataset.value = String(to);
  if (!motionOK() || from === to) {
    node.textContent = prefix + Math.round(to).toLocaleString('en-GB') + suffix;
    return;
  }
  const start = performance.now();
  node.classList.add('is-ticking');
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    // easeOutCubic: fast then settles, which reads as "counting up"
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = prefix + Math.round(from + (to - from) * eased).toLocaleString('en-GB') + suffix;
    if (t < 1) requestAnimationFrame(step);
    else node.classList.remove('is-ticking');
  };
  requestAnimationFrame(step);
}

/* -------------------------------------------------------------- level up */

export async function levelUp(level, title, anchor) {
  announce(`Level up. You are now level ${level}, ${title}.`);
  play('levelup');
  toast(`Level ${level} — ${title}`, 'success', 4500);
  confetti({ count: 120 });
  if (anchor && motionOK()) {
    anchor.style.position = anchor.style.position || 'relative';
    const ring = el('div', { class: 'levelup__ring', 'aria-hidden': 'true' });
    anchor.append(ring);
    await sleep(900);
    ring.remove();
  }
}

/* ------------------------------------------------------------------ sound */
/*
 * Sounds are synthesised with the Web Audio API rather than shipped as files:
 * nothing to download, nothing to licence, and it works offline. Drop real
 * files into /audio/ and swap `play()` over if you prefer.
 */
let ctx = null;
const soundOn = () => feature('sound') && getA11y().sound !== false;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers suspend the context until a user gesture; resume on first play.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

const TONES = {
  correct:  [[660, 0], [880, 0.08], [1320, 0.16]],
  wrong:    [[220, 0], [165, 0.1]],
  tick:     [[1400, 0]],
  badge:    [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]],
  levelup:  [[392, 0], [523, 0.08], [659, 0.16], [784, 0.24], [1047, 0.34]],
  start:    [[440, 0], [660, 0.1]],
  timeout:  [[300, 0], [200, 0.12], [140, 0.24]],
};

/** Play a named UI sound. Silent if sound is off or unsupported. */
export function play(name) {
  if (!soundOn()) return;
  const notes = TONES[name];
  const ac = audio();
  if (!notes || !ac) return;

  for (const [freq, delay] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = name === 'wrong' ? 'sawtooth' : 'triangle';
    osc.frequency.value = freq;
    const t0 = ac.currentTime + delay;
    // Short attack/decay envelope so it clicks rather than beeps.
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.24);
  }
}
