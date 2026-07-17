/* ============================================================================
   utils.js — small, dependency-free helpers used across the app.
   ========================================================================== */

/** querySelector shorthand. */
export const $ = (sel, root = document) => root.querySelector(sel);

/** querySelectorAll shorthand, returns a real Array. */
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Create an element.
 * @param {string} tag       Tag name.
 * @param {object} [props]   Properties/attributes. `class`, `dataset`, `html`,
 *                           `text` and `on` (event map) are handled specially.
 * @param {Array}  [kids]    Child nodes or strings.
 */
export function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** Escape a string for safe interpolation into HTML. */
export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

/** Fisher–Yates shuffle. Returns a NEW array; does not mutate the input. */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick n random items without replacement. */
export const sample = (arr, n) => shuffle(arr).slice(0, n);

/** Random item. */
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Short, collision-resistant id — good enough for client-side records. */
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** "1,234" */
export const formatNumber = (n) => Math.round(n).toLocaleString('en-GB');

/** Seconds → "m:ss" */
export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** ISO date → "12 Mar 2026, 14:30" */
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deep clone via structuredClone with a JSON fallback for older browsers. */
export const clone = (obj) =>
  (typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));

/** Case-insensitive "does haystack contain needle" across several fields. */
export function matchesQuery(query, ...fields) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return fields.filter(Boolean).join(' ').toLowerCase().includes(q);
}

/** Fetch JSON with a clear error message on failure. */
export async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return res.json();
}

/** Trigger a client-side file download. */
export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read a File object as text (for JSON import). */
export const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsText(file);
  });

/** Announce a message to screen readers via the shared live region. */
export function announce(message) {
  const region = document.getElementById('sr-live');
  if (!region) return;
  region.textContent = '';
  // The clear-then-set forces AT to re-read identical consecutive messages.
  setTimeout(() => { region.textContent = message; }, 40);
}
