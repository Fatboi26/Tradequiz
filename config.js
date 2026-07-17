/* ============================================================================
   config.js — loads config/branding.json + config/gamification.json and
   applies branding to the document.
   ----------------------------------------------------------------------------
   To re-brand the platform you edit config/branding.json ONLY. This module
   pushes those values into CSS custom properties, the <title>, the favicon,
   the logos and the footer. No other file needs to know the college's name.
   ========================================================================== */

import { fetchJson, $$, el } from './utils.js';

/** Populated by load(). Import `config` anywhere after boot. */
export const config = { branding: null, game: null };

/* Sensible fallbacks so the app still renders if branding.json is missing. */
const FALLBACK = {
  collegeName: 'Your College',
  platformName: 'TradeQuest',
  tagline: 'Level up your trade.',
  logo: '', logoSecondary: '',
  colors: {}, answerColors: [], fonts: {}, icons: {},
  features: { sound: true, confetti: true, showGroupLogo: false, teacherPin: '2611' },
  footer: { text: '', links: [] },
};

/**
 * Load both config files and apply branding to the document.
 * Call once per page, before rendering.
 * @param {string} [base] Path prefix, if the page is not at the site root.
 */
export async function load(base = '') {
  const [branding, game] = await Promise.all([
    fetchJson(`${base}config/branding.json`).catch((e) => {
      console.warn('branding.json failed to load, using fallbacks.', e);
      return FALLBACK;
    }),
    fetchJson(`${base}config/gamification.json`).catch((e) => {
      console.warn('gamification.json failed to load.', e);
      return { xp: {}, levels: {}, scoring: {}, badges: [], streaks: {} };
    }),
  ]);

  config.branding = { ...FALLBACK, ...branding };
  config.game = game;
  apply(config.branding, base);
  return config;
}

/** Write branding values into CSS variables and document chrome. */
function apply(b, base) {
  const root = document.documentElement;

  // ---- colours → CSS custom properties
  const map = {
    primary: '--c-primary', secondary: '--c-secondary', accent: '--c-accent',
    support: '--c-support', bg: '--c-bg', bgAlt: '--c-bg-alt',
    surface: '--c-surface', surfaceAlt: '--c-surface-alt',
    text: '--c-text', textMuted: '--c-text-muted',
    success: '--c-success', warning: '--c-warning', danger: '--c-danger',
    info: '--c-info', gold: '--c-gold',
  };
  for (const [key, cssVar] of Object.entries(map)) {
    if (b.colors?.[key]) root.style.setProperty(cssVar, b.colors[key]);
  }

  // ---- answer tile colours (used by the .tile components)
  (b.answerColors || []).forEach((c, i) => root.style.setProperty(`--c-ans-${i + 1}`, c));

  // ---- fonts
  if (b.fonts?.heading) root.style.setProperty('--font-heading', b.fonts.heading);
  if (b.fonts?.body) root.style.setProperty('--font-body', b.fonts.body);
  if (b.fonts?.mono) root.style.setProperty('--font-mono', b.fonts.mono);
  if (b.fonts?.googleFontsUrl) {
    document.head.append(el('link', { rel: 'stylesheet', href: b.fonts.googleFontsUrl }));
  }

  // ---- document title & meta
  const pageName = document.body.dataset.pageTitle;
  document.title = pageName
    ? `${pageName} · ${b.platformName} · ${b.collegeShortName || b.collegeName}`
    : `${b.platformName} · ${b.collegeName}`;

  if (b.colors?.primary) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = el('meta', { name: 'theme-color' }); document.head.append(meta); }
    meta.content = b.colors.primary;
  }
  if (b.favicon) {
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) { icon = el('link', { rel: 'icon' }); document.head.append(icon); }
    icon.href = base + b.favicon;
  }

  // ---- fill every [data-brand] slot in the page
  $$('[data-brand]').forEach((node) => {
    const key = node.dataset.brand;
    const value = key.split('.').reduce((o, k) => o?.[k], b);
    if (value === undefined || value === null) return;
    if (node.tagName === 'IMG') { node.src = base + value; }
    else { node.textContent = value; }
  });
  $$('[data-brand-alt]').forEach((n) => { n.alt = n.dataset.brandAlt.split('.').reduce((o, k) => o?.[k], b) || ''; });

  // ---- secondary (group) logo visibility
  $$('[data-brand-group]').forEach((n) => {
    if (!b.features?.showGroupLogo || !b.logoSecondary) n.remove();
  });

  // ---- footer links
  const linkWrap = document.querySelector('[data-brand-links]');
  if (linkWrap) {
    (b.footer?.links || []).forEach((l) =>
      linkWrap.append(el('a', { href: l.url, text: l.label, rel: 'noopener' })));
  }
}

/** Convenience getters used throughout the UI. */
export const icon = (name) => config.branding?.icons?.[name] ?? '';
export const feature = (name) => Boolean(config.branding?.features?.[name]);
