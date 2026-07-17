/* ============================================================================
   a11y.js — the accessibility settings panel and its persistence.
   ----------------------------------------------------------------------------
   Four controls, all saved to localStorage and re-applied on every page:
     · Contrast   normal | high
     · Motion     auto (follow the OS) | reduced | full
     · Text size  100% | 115% | 130% | 150%
     · Sound      on | off

   Preferences are applied to <html> as data attributes; the CSS in tokens.css
   does the rest, so nothing else in the app needs to know these exist.
   ========================================================================== */

import { el, $, $$, announce } from '../core/utils.js';
import { getA11y, saveA11y } from '../core/storage.js';

const SIZES = [
  { label: 'Standard', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Larger', value: 1.3 },
  { label: 'Largest', value: 1.5 },
];

/** Push saved preferences onto the document. Call early on every page. */
export function applyPrefs() {
  const p = getA11y();
  const root = document.documentElement;
  root.dataset.contrast = p.contrast || 'normal';
  root.dataset.motion = p.motion || 'auto';
  root.style.setProperty('--font-scale', String(p.fontScale || 1));
  return p;
}

function update(patch) {
  const next = { ...getA11y(), ...patch };
  saveA11y(next);
  applyPrefs();
  return next;
}

/** Build a segmented control bound to one preference key. */
function segment({ legend, hint, options, current, onChange }) {
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': legend });
  const paint = (value) => $$('.seg__btn', seg).forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.value === String(value) ? 'true' : 'false'));

  options.forEach((opt) => {
    seg.append(el('button', {
      type: 'button', class: 'seg__btn', dataset: { value: String(opt.value) }, text: opt.label,
      on: { click: () => { onChange(opt.value); paint(opt.value); announce(`${legend}: ${opt.label}`); } },
    }));
  });
  paint(current);

  return el('div', { class: 'switch' }, [
    el('div', {}, [
      el('div', { class: 'switch__label', text: legend }),
      hint ? el('div', { class: 'field__hint', text: hint }) : null,
    ]),
    seg,
  ]);
}

/**
 * Mount the settings button + dialog. Safe to call on any page that includes
 * a <div id="a11y-mount"> and the shared <dialog id="a11y-dialog">.
 */
export function mount() {
  const p = applyPrefs();
  const mountPoint = $('#a11y-mount');
  if (!mountPoint) return;

  const dialog = el('dialog', { class: 'modal', id: 'a11y-dialog', 'aria-labelledby': 'a11y-title' });

  const body = el('div', { class: 'modal__body stack' }, [
    el('h2', { id: 'a11y-title', text: 'Display & sound' }),
    el('p', { class: 'field__hint', text: 'These settings are saved on this device and apply to every quiz.' }),

    segment({
      legend: 'Contrast',
      hint: 'High contrast uses pure black and white with solid outlines.',
      options: [{ label: 'Normal', value: 'normal' }, { label: 'High', value: 'high' }],
      current: p.contrast,
      onChange: (v) => update({ contrast: v }),
    }),

    segment({
      legend: 'Motion',
      hint: 'Reduced turns off confetti, transitions and celebration animations.',
      options: [{ label: 'Follow device', value: 'auto' }, { label: 'Reduced', value: 'reduced' }, { label: 'Full', value: 'full' }],
      current: p.motion,
      onChange: (v) => update({ motion: v }),
    }),

    segment({
      legend: 'Text size',
      options: SIZES,
      current: p.fontScale,
      onChange: (v) => update({ fontScale: v }),
    }),

    segment({
      legend: 'Sound effects',
      options: [{ label: 'On', value: true }, { label: 'Off', value: false }],
      current: p.sound !== false,
      onChange: (v) => update({ sound: v === true || v === 'true' }),
    }),
  ]);

  const foot = el('div', { class: 'modal__foot' }, [
    el('button', {
      type: 'button', class: 'btn btn--ghost', text: 'Reset to defaults',
      on: {
        click: () => {
          saveA11y({ contrast: 'normal', motion: 'auto', fontScale: 1, sound: true });
          applyPrefs();
          dialog.close();
          announce('Display settings reset.');
        },
      },
    }),
    el('button', { type: 'button', class: 'btn btn--primary', text: 'Done', on: { click: () => dialog.close() } }),
  ]);

  dialog.append(body, foot);
  document.body.append(dialog);

  mountPoint.append(el('button', {
    type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': 'Display and sound settings',
    title: 'Display & sound',
    html: '<span aria-hidden="true">⚙️</span>',
    on: { click: () => dialog.showModal() },
  }));
}

/* Fix the segment label style locally so components.css stays generic. */
const style = document.createElement('style');
style.textContent = `.switch__label { font-weight: 700; }`;
document.head.append(style);
