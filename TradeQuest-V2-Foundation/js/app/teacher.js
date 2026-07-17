/* ============================================================================
   teacher.js — the teacher dashboard.
   ----------------------------------------------------------------------------
   HOW EDITING WORKS ON A STATIC SITE
   A site on Cloudflare Pages cannot write back to /questions/*.json. So:

     • Quizzes you create or edit here are saved to this browser
       (localStorage) and layered over the shipped JSON by bank.js.
     • They work immediately, on this device, for testing and for a single
       classroom machine.
     • To make them permanent for everyone, press "Export subject file" and
       commit the downloaded JSON to /questions/ in your repo.

   That round trip is the whole model. It keeps the platform serverless while
   still letting you author without touching code.

   The PIN is a speed bump to stop students wandering in — it is NOT security.
   Anything in a static site is readable by anyone. Never put anything
   confidential in here.
   ========================================================================== */

import * as config from '../core/config.js';
import { registerPWA } from '../core/pwa.js';
import * as bank from '../core/bank.js';
import * as store from '../core/storage.js';
import {
  $, el, clone, uid, formatNumber, formatDate, matchesQuery,
  downloadFile, readFileAsText, debounce, announce,
} from '../core/utils.js';
import * as a11y from '../ui/a11y.js';
import * as ui from '../ui/components.js';
import * as fx from '../ui/effects.js';
import { TYPE_LABELS } from '../game/questionTypes.js';

const app = () => $('#app');

/** Dashboard filter state. */
const filters = { query: '', subjectId: 'all', status: 'all' };

/* ------------------------------------------------------------------ boot */

async function boot() {
  await config.load();
  a11y.mount();
  await bank.load();

  if (!store.isTeacherUnlocked()) viewPinGate();
  else viewDashboard();
}

/* ====================================================================== */
/* PIN gate                                                                */
/* ====================================================================== */

function viewPinGate() {
  const input = el('input', {
    class: 'input input--big', type: 'password', inputmode: 'numeric',
    autocomplete: 'off', id: 'pin', 'aria-describedby': 'pin-hint',
  });
  const error = el('p', { class: 'field__error', role: 'alert' });

  const submit = el('button', {
    type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Unlock dashboard',
    on: {
      click: () => {
        const expected = String(config.config.branding.features?.teacherPin ?? '1234');
        if (input.value !== expected) {
          error.textContent = 'That PIN is not right. Try again.';
          input.select();
          return;
        }
        store.setTeacherUnlocked(true);
        viewDashboard();
      },
    },
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });

  app().replaceChildren(el('div', { class: 'onboard stack' }, [
    el('h1', { text: 'Teacher dashboard' }),
    el('div', { class: 'card stack' }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'pin', text: 'Enter your PIN' }),
        input,
        el('p', {
          class: 'field__hint', id: 'pin-hint',
          text: 'Change the PIN in config/branding.json under features.teacherPin. It keeps students out of the dashboard — it is not real security.',
        }),
        error,
      ]),
      submit,
    ]),
    el('a', { class: 'btn btn--ghost', href: 'index.html', text: '← Back to the hub' }),
  ]));
  input.focus();
}

/* ====================================================================== */
/* Dashboard                                                               */
/* ====================================================================== */

function viewDashboard() {
  const list = el('div', { class: 'quiz-list' });

  const search = el('input', {
    class: 'input', type: 'search', id: 'search', placeholder: 'Search titles, topics, tags…',
    on: { input: debounce((e) => { filters.query = e.target.value; paint(); }, 200) },
  });

  const subjectSelect = el('select', {
    class: 'input', id: 'f-subject',
    on: { change: (e) => { filters.subjectId = e.target.value; paint(); } },
  }, [
    el('option', { value: 'all', text: 'All subjects' }),
    ...bank.bank.subjects.map((s) => el('option', { value: s.id, text: s.name })),
  ]);

  const statusSelect = el('select', {
    class: 'input', id: 'f-status',
    on: { change: (e) => { filters.status = e.target.value; paint(); } },
  }, [
    el('option', { value: 'all', text: 'Any status' }),
    el('option', { value: 'live', text: 'Live now' }),
    el('option', { value: 'scheduled', text: 'Scheduled' }),
    el('option', { value: 'expired', text: 'Expired' }),
    el('option', { value: 'local', text: 'Unsaved edits (this device)' }),
  ]);

  /** Redraw just the quiz list, keeping the filter controls focused. */
  function paint() {
    const rows = bank.allQuizzes().filter((q) => {
      if (filters.subjectId !== 'all' && q.subjectId !== filters.subjectId) return false;
      if (filters.status === 'local' && q.source !== 'local') return false;
      if (['live', 'scheduled', 'expired'].includes(filters.status)
          && bank.scheduleStatus(q) !== filters.status) return false;
      if (filters.query && !matchesQuery(filters.query, q.title, q.description, q.topic, ...(q.tags || []))) return false;
      return true;
    });

    list.replaceChildren(...(rows.length
      ? rows.map(quizRow)
      : [ui.emptyState('🔍', 'Nothing matches', 'Try a different search or filter.')]));
    announce(`${rows.length} quizzes listed.`);
  }

  const errors = bank.bank.errors.length ? el('div', { class: 'card card--warn stack' }, [
    el('h2', { text: '⚠️ Some question files did not load' }),
    ...bank.bank.errors.map((e) => el('p', { text: `${e.file}: ${e.message}` })),
    el('p', { class: 'field__hint', text: 'Check the JSON is valid and that the filename in questions/index.json matches exactly.' }),
  ]) : null;

  app().replaceChildren(el('div', { class: 'stack' }, [
    el('header', { class: 'row row--between row--wrap' }, [
      el('div', {}, [
        el('h1', { text: 'Teacher dashboard' }),
        el('p', { class: 'page-head__sub', text: `${bank.allQuizzes().length} quizzes across ${bank.bank.subjects.length} subjects.` }),
      ]),
      el('div', { class: 'row row--wrap' }, [
        el('a', { class: 'btn btn--ghost', href: 'index.html', text: 'Hub' }),
        el('a', { class: 'btn btn--ghost', href: 'student.html', text: 'Play' }),
        el('button', {
          type: 'button', class: 'btn btn--ghost', text: 'Lock',
          on: { click: () => { store.setTeacherUnlocked(false); viewPinGate(); } },
        }),
      ]),
    ]),
    errors,
    el('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),

    el('div', { class: 'row row--wrap' }, [
      el('button', { type: 'button', class: 'btn btn--gold', text: '+ New quiz', on: { click: () => editQuiz(null) } }),
      el('button', { type: 'button', class: 'btn btn--secondary', text: '⬆ Import JSON', on: { click: importDialog } }),
      el('button', { type: 'button', class: 'btn btn--ghost', text: '⬇ Export subject file', on: { click: exportDialog } }),
      el('button', { type: 'button', class: 'btn btn--ghost', text: '⚙ Data & backups', on: { click: dataDialog } }),
    ]),

    el('div', { class: 'filters row row--wrap' }, [
      el('div', { class: 'field field--grow' }, [
        el('label', { class: 'field__label', for: 'search', text: 'Search' }), search,
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'f-subject', text: 'Subject' }), subjectSelect,
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'f-status', text: 'Status' }), statusSelect,
      ]),
    ]),

    list,
  ]));

  paint();
}

/** One row in the dashboard list. */
function quizRow(quiz) {
  const status = bank.scheduleStatus(quiz);
  const statusChip = {
    live: ['chip--live', 'Live'],
    scheduled: ['', `Scheduled ${formatDate(quiz.schedule.publishAt)}`],
    expired: ['', 'Expired'],
  }[status] || ['', status];

  const problems = bank.validateQuiz(quiz);

  return el('div', { class: 'quiz-card quiz-card--admin' }, [
    el('span', { class: 'quiz-card__bar', 'aria-hidden': 'true',
      style: { background: bank.getSubject(quiz.subjectId)?.color || 'var(--c-primary)' } }),
    el('div', { class: 'quiz-card__body stack' }, [
      el('div', { class: 'row row--between row--wrap' }, [
        el('div', {}, [
          el('h3', { class: 'quiz-card__title', text: quiz.title }),
          el('p', { class: 'quiz-card__desc', text: quiz.description || '' }),
        ]),
        el('div', { class: 'row row--wrap' }, [
          el('span', { class: `chip ${statusChip[0]}`, text: statusChip[1] }),
          quiz.source === 'local' ? el('span', { class: 'chip chip--gold', text: 'This device only' }) : null,
          problems.length ? el('span', { class: 'chip chip--warn', text: `⚠ ${problems.length} issue${problems.length > 1 ? 's' : ''}` }) : null,
        ]),
      ]),
      el('div', { class: 'row row--wrap' }, [
        el('span', { class: 'chip', text: bank.getSubject(quiz.subjectId)?.name || quiz.subjectId }),
        el('span', { class: 'chip', text: `${bank.questionCount(quiz)} questions` }),
        el('span', { class: 'chip', text: `≈ ${Math.ceil(bank.estimatedSeconds(quiz) / 60)} min` }),
        quiz.level ? el('span', { class: 'chip', text: quiz.level }) : null,
      ]),
      el('div', { class: 'row row--wrap' }, [
        el('button', { type: 'button', class: 'btn btn--sm btn--primary', text: 'Edit', on: { click: () => editQuiz(quiz) } }),
        el('button', { type: 'button', class: 'btn btn--sm btn--ghost', text: 'Preview', on: { click: () => previewQuiz(quiz) } }),
        el('a', { class: 'btn btn--sm btn--ghost', href: `student.html#/quiz/${quiz.id}`, text: 'Play' }),
        el('button', { type: 'button', class: 'btn btn--sm btn--ghost', text: 'Duplicate', on: { click: () => duplicateQuiz(quiz) } }),
        el('button', { type: 'button', class: 'btn btn--sm btn--danger', text: 'Delete', on: { click: () => deleteQuiz(quiz) } }),
      ]),
    ]),
  ]);
}

/* ====================================================================== */
/* Save / duplicate / delete                                               */
/* ====================================================================== */

/** Write a quiz into the local layer and refresh the bank. */
function saveQuiz(quiz) {
  const map = store.getCustomQuizzes();
  const list = map[quiz.subjectId] || [];
  const i = list.findIndex((q) => q.id === quiz.id);
  if (i >= 0) list[i] = quiz; else list.push(quiz);
  map[quiz.subjectId] = list;
  store.saveCustomQuizzes(map);

  // A previously deleted id being saved again should un-delete it.
  const tombs = store.getDeletedQuizIds().filter((id) => id !== quiz.id);
  store.saveDeletedQuizIds(tombs);

  bank.refreshLocalLayer();
  viewDashboard();
}

function duplicateQuiz(quiz) {
  const copy = clone(quiz);
  copy.id = `${quiz.id}-copy-${Math.random().toString(36).slice(2, 6)}`;
  copy.title = `${quiz.title} (copy)`;
  copy.source = 'local';
  delete copy._shipped;
  saveQuiz(copy);
  fx.toast('Quiz duplicated.', 'success');
}

function deleteQuiz(quiz) {
  const shipped = quiz.source !== 'local';
  const msg = shipped
    ? `Hide "${quiz.title}" on this device?\n\nIt lives in ${bank.getSubject(quiz.subjectId)?.file}, so it will come back for anyone else until you remove it from that file and redeploy.`
    : `Delete "${quiz.title}"? This cannot be undone.`;
  if (!confirm(msg)) return;

  const map = store.getCustomQuizzes();
  if (map[quiz.subjectId]) {
    map[quiz.subjectId] = map[quiz.subjectId].filter((q) => q.id !== quiz.id);
    store.saveCustomQuizzes(map);
  }
  if (shipped) {
    const tombs = store.getDeletedQuizIds();
    if (!tombs.includes(quiz.id)) tombs.push(quiz.id);
    store.saveDeletedQuizIds(tombs);
  }
  bank.refreshLocalLayer();
  viewDashboard();
  fx.toast('Quiz removed.', 'info');
}

/* ====================================================================== */
/* Quiz editor                                                             */
/* ====================================================================== */

/**
 * The editor is deliberately a JSON editor with a guided header, not a
 * hundred bespoke form widgets. Reasons: the question schema keeps growing,
 * teachers copy question sets between quizzes, and JSON is what actually ships.
 * The header covers the fields people change most; the textarea covers the rest,
 * with live validation so mistakes surface before students see them.
 */
function editQuiz(existing) {
  const isNew = !existing;
  const quiz = existing ? clone(existing) : {
    id: `quiz-${uid('').slice(1, 7)}`,
    title: '',
    subjectId: bank.bank.subjects[0]?.id || 'plumbing',
    topic: '',
    level: 'Level 2',
    description: '',
    tags: [],
    schedule: { publishAt: null, expiresAt: null },
    questions: [],
  };

  const field = (label, input, hint = null) => el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: input.id, text: label }),
    input,
    hint ? el('p', { class: 'field__hint', text: hint }) : null,
  ]);

  const titleIn = el('input', { class: 'input', id: 'e-title', value: quiz.title });
  const idIn = el('input', { class: 'input', id: 'e-id', value: quiz.id, disabled: !isNew });
  const descIn = el('input', { class: 'input', id: 'e-desc', value: quiz.description || '' });
  const levelIn = el('input', { class: 'input', id: 'e-level', value: quiz.level || '' });
  const tagsIn = el('input', { class: 'input', id: 'e-tags', value: (quiz.tags || []).join(', ') });

  const subjIn = el('select', { class: 'input', id: 'e-subject' },
    bank.bank.subjects.map((s) => el('option', {
      value: s.id, text: s.name, selected: s.id === quiz.subjectId,
    })));

  const topicIn = el('input', {
    class: 'input', id: 'e-topic', value: quiz.topic || '', list: 'topic-list',
  });
  const topicList = el('datalist', { id: 'topic-list' },
    Array.from(new Set(bank.bank.subjects.flatMap((s) => (s.topics || []).map((t) => t.id))))
      .map((t) => el('option', { value: t })));

  const toLocal = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
  const pubIn = el('input', { class: 'input', id: 'e-pub', type: 'datetime-local', value: toLocal(quiz.schedule?.publishAt) });
  const expIn = el('input', { class: 'input', id: 'e-exp', type: 'datetime-local', value: toLocal(quiz.schedule?.expiresAt) });

  const jsonIn = el('textarea', {
    class: 'textarea textarea--code', id: 'e-json', rows: '22', spellcheck: 'false',
    value: JSON.stringify(quiz.questions || [], null, 2),
  });

  const status = el('p', { class: 'field__hint', role: 'status' });

  /** Parse the textarea and run bank validation without saving. */
  function check() {
    let questions;
    try {
      questions = JSON.parse(jsonIn.value);
    } catch (e) {
      status.textContent = `⚠️ JSON error: ${e.message}`;
      status.className = 'field__error';
      return null;
    }
    if (!Array.isArray(questions)) {
      status.textContent = '⚠️ The questions must be a JSON array [ … ].';
      status.className = 'field__error';
      return null;
    }
    const draft = collect(questions);
    const problems = bank.validateQuiz(draft);
    if (problems.length) {
      status.textContent = `⚠️ ${problems.length} issue(s): ${problems.join(' · ')}`;
      status.className = 'field__error';
      return draft; // still saveable — a warning, not a wall
    }
    status.textContent = `✓ Valid. ${questions.length} question(s).`;
    status.className = 'field__hint';
    return draft;
  }

  function collect(questions) {
    return {
      ...quiz,
      id: idIn.value.trim() || quiz.id,
      title: titleIn.value.trim(),
      subjectId: subjIn.value,
      topic: topicIn.value.trim(),
      level: levelIn.value.trim(),
      description: descIn.value.trim(),
      tags: tagsIn.value.split(',').map((t) => t.trim()).filter(Boolean),
      schedule: {
        publishAt: pubIn.value ? new Date(pubIn.value).toISOString() : null,
        expiresAt: expIn.value ? new Date(expIn.value).toISOString() : null,
      },
      questions,
      source: 'local',
    };
  }

  jsonIn.addEventListener('input', debounce(check, 400));

  const snippets = el('div', { class: 'row row--wrap' },
    Object.keys(TYPE_LABELS).map((type) => el('button', {
      type: 'button', class: 'btn btn--ghost btn--sm',
      text: `+ ${TYPE_LABELS[type]}`,
      on: { click: () => insertSnippet(jsonIn, type, check) },
    })));

  const dlg = modal({
    title: isNew ? 'New quiz' : `Edit: ${quiz.title}`,
    body: el('div', { class: 'stack' }, [
      el('div', { class: 'grid grid--2' }, [
        field('Title', titleIn),
        field('Quiz ID', idIn, isNew ? 'Lowercase, no spaces. Cannot be changed later.' : 'IDs are fixed once created.'),
        field('Subject', subjIn),
        field('Topic', topicIn, 'Groups quizzes on the subject page.'),
        field('Level', levelIn, 'e.g. Level 2, Level 3.'),
        field('Tags', tagsIn, 'Comma separated.'),
        field('Publish from', pubIn, 'Leave blank to publish straight away.'),
        field('Expires', expIn, 'Leave blank for no end date.'),
      ]),
      field('Description', descIn),
      topicList,
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'e-json', text: 'Questions (JSON)' }),
        el('p', { class: 'field__hint', text: 'Add a question with the buttons below, then fill in the blanks. Validation runs as you type.' }),
        snippets,
        jsonIn,
        status,
      ]),
    ]),
    actions: [
      el('button', {
        type: 'button', class: 'btn btn--gold', text: 'Save quiz',
        on: {
          click: () => {
            const draft = check();
            if (!draft) return fx.toast('Fix the JSON error before saving.', 'danger');
            if (!draft.title) return fx.toast('Give the quiz a title.', 'warning');
            if (isNew && bank.getQuiz(draft.id)) return fx.toast('That quiz ID is already taken.', 'warning');
            dlg.close();
            saveQuiz(draft);
            fx.toast('Saved to this device. Export the subject file to make it permanent.', 'success', 6000);
          },
        },
      }),
    ],
  });

  check();
  titleIn.focus();
}

/** Question templates, so nobody has to remember the schema. */
const SNIPPETS = {
  mcq: { type: 'mcq', text: 'Question text?', options: ['A', 'B', 'C', 'D'], answer: 0, time: 20, explain: 'Why this is right.' },
  truefalse: { type: 'truefalse', text: 'A statement to judge.', answer: true, time: 15, explain: '' },
  multi: { type: 'multi', text: 'Select every correct answer.', options: ['A', 'B', 'C', 'D'], answer: [0, 2], time: 30, explain: '' },
  image: { type: 'image', text: 'What is this?', image: 'images/q/example.svg', imageAlt: 'Describe the image for screen readers.', options: ['A', 'B', 'C', 'D'], answer: 0, time: 20, explain: '' },
  order: { type: 'order', text: 'Put these steps in the correct order.', items: ['First', 'Second', 'Third'], time: 45, explain: '' },
  match: { type: 'match', text: 'Match each item to its pair.', pairs: [{ left: 'Item', right: 'Pair' }], time: 45, explain: '' },
  dragdrop: { type: 'dragdrop', text: 'Drag each item to the right place.', targets: [{ id: 't1', label: 'Target', accepts: ['i1'] }], items: [{ id: 'i1', label: 'Item' }], time: 45, explain: '' },
  hotspot: { type: 'hotspot', text: 'Tap the correct part of the image.', image: 'images/q/example.svg', imageAlt: 'Describe the image.', areas: [{ shape: 'rect', x: 10, y: 10, w: 20, h: 20 }], time: 25, explain: '' },
  numeric: { type: 'numeric', text: 'Calculate the answer.', answer: 42, tolerance: 0.5, unit: 'mm', time: 60, explain: '' },
  scenario: { type: 'scenario', text: 'What do you do first?', scenario: 'Describe the situation on site.', options: ['A', 'B', 'C', 'D'], answer: 0, time: 40, explain: '' },
};

function insertSnippet(textarea, type, check) {
  let list;
  try { list = JSON.parse(textarea.value); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  list.push({ id: `q${list.length + 1}`, ...clone(SNIPPETS[type]) });
  textarea.value = JSON.stringify(list, null, 2);
  check();
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  announce(`${TYPE_LABELS[type]} question added.`);
}

/* ====================================================================== */
/* Preview                                                                 */
/* ====================================================================== */

function previewQuiz(quiz) {
  const problems = bank.validateQuiz(quiz);
  modal({
    title: `Preview: ${quiz.title}`,
    body: el('div', { class: 'stack' }, [
      el('div', { class: 'row row--wrap' }, [
        el('span', { class: 'chip', text: bank.getSubject(quiz.subjectId)?.name || quiz.subjectId }),
        el('span', { class: 'chip', text: `${bank.questionCount(quiz)} questions` }),
        el('span', { class: 'chip', text: `≈ ${Math.ceil(bank.estimatedSeconds(quiz) / 60)} min` }),
        el('span', { class: 'chip', text: bank.scheduleStatus(quiz) }),
      ]),
      problems.length ? el('div', { class: 'card card--warn stack' }, [
        el('h3', { text: 'Issues to fix' }),
        ...problems.map((p) => el('p', { text: `• ${p}` })),
      ]) : null,
      el('div', { class: 'stack' }, quiz.questions.map((q, i) => ui.questionSummary(q, i))),
    ]),
    actions: [
      el('a', { class: 'btn btn--primary', href: `student.html#/quiz/${quiz.id}`, text: 'Play it for real' }),
    ],
  });
}

/* ====================================================================== */
/* Import / export                                                         */
/* ====================================================================== */

function importDialog() {
  const file = el('input', { class: 'input', type: 'file', accept: '.json,application/json', id: 'imp-file' });
  const status = el('p', { class: 'field__hint', role: 'status' });

  const dlg = modal({
    title: 'Import quizzes from JSON',
    body: el('div', { class: 'stack' }, [
      el('p', { text: 'Accepts a whole subject file (the same shape as questions/plumbing.json), or a bare array of quizzes.' }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'imp-file', text: 'Choose a file' }),
        file,
        el('p', { class: 'field__hint', text: 'Quizzes with an existing ID are overwritten. Everything imports to this device only — export the subject file afterwards to publish it to everyone.' }),
      ]),
      status,
    ]),
    actions: [
      el('button', {
        type: 'button', class: 'btn btn--gold', text: 'Import',
        on: {
          click: async () => {
            const f = file.files?.[0];
            if (!f) { status.textContent = 'Choose a file first.'; return; }
            try {
              const data = JSON.parse(await readFileAsText(f));
              const quizzes = Array.isArray(data) ? data : (data.quizzes || []);
              const subjectId = data.subject?.id || null;
              if (!quizzes.length) throw new Error('No quizzes found in that file.');

              const map = store.getCustomQuizzes();
              let n = 0;
              for (const q of quizzes) {
                const sid = q.subjectId || subjectId;
                if (!sid) throw new Error(`Quiz "${q.id || q.title}" has no subject. Add a "subject" block or a subjectId.`);
                const list = map[sid] || [];
                const i = list.findIndex((x) => x.id === q.id);
                const rec = { ...q, subjectId: sid, source: 'local' };
                if (i >= 0) list[i] = rec; else list.push(rec);
                map[sid] = list;
                n += 1;
              }
              store.saveCustomQuizzes(map);
              bank.refreshLocalLayer();
              dlg.close();
              viewDashboard();
              fx.toast(`Imported ${n} quiz${n > 1 ? 'zes' : ''}.`, 'success');
            } catch (e) {
              status.textContent = `⚠️ ${e.message}`;
              status.className = 'field__error';
            }
          },
        },
      }),
    ],
  });
}

function exportDialog() {
  const select = el('select', { class: 'input', id: 'exp-subject' },
    bank.bank.subjects.map((s) => el('option', { value: s.id, text: `${s.name} (${s.quizzes.length} quizzes)` })));

  modal({
    title: 'Export subject file',
    body: el('div', { class: 'stack' }, [
      el('p', { text: 'Downloads the subject exactly as questions/<subject>.json expects it, including anything you have added or edited on this device.' }),
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'exp-subject', text: 'Subject' }),
        select,
      ]),
      el('div', { class: 'card stack' }, [
        el('h3', { text: 'To make it permanent for everyone' }),
        el('p', { text: '1. Download the file.' }),
        el('p', { text: '2. Put it in /questions/ in your project, replacing the old one.' }),
        el('p', { text: '3. If the subject is new, add a line for it in questions/index.json.' }),
        el('p', { text: '4. Redeploy to Cloudflare Pages.' }),
      ]),
    ]),
    actions: [
      el('button', {
        type: 'button', class: 'btn btn--gold', text: 'Download JSON',
        on: {
          click: () => {
            const s = bank.getSubject(select.value);
            const out = {
              subject: { id: s.id, name: s.name, icon: s.icon, color: s.color, description: s.description },
              topics: s.topics || [],
              quizzes: s.quizzes.map((q) => {
                // Strip the runtime-only fields so the file stays clean.
                const { subjectId, source, _shipped, ...rest } = q;
                return rest;
              }),
            };
            downloadFile(`${s.id}.json`, JSON.stringify(out, null, 2));
            fx.toast('Downloaded. Drop it into /questions/ and redeploy.', 'success', 6000);
          },
        },
      }),
    ],
  });
}

/* ====================================================================== */
/* Data & backups                                                          */
/* ====================================================================== */

function dataDialog() {
  modal({
    title: 'Data & backups',
    body: el('div', { class: 'stack' }, [
      el('p', {
        text: 'Everything on this platform is stored in this browser: student profiles, XP, badges, leaderboards and your quiz edits. Clearing the browser data clears all of it.',
      }),
      el('div', { class: 'stat-row' }, [
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat__value', text: formatNumber(store.getScores().length) }),
          el('span', { class: 'stat__label', text: 'Scores on this device' }),
        ]),
        el('div', { class: 'stat' }, [
          el('span', { class: 'stat__value', text: formatNumber(Object.values(store.getCustomQuizzes()).flat().length) }),
          el('span', { class: 'stat__label', text: 'Locally edited quizzes' }),
        ]),
      ]),
      el('div', { class: 'row row--wrap' }, [
        el('button', {
          type: 'button', class: 'btn btn--secondary', text: 'Download a full backup',
          on: {
            click: () => {
              const stamp = new Date().toISOString().slice(0, 10);
              downloadFile(`tradequest-backup-${stamp}.json`, JSON.stringify(store.exportAll(), null, 2));
            },
          },
        }),
        el('label', { class: 'btn btn--ghost', for: 'restore-file', text: 'Restore a backup' }),
        el('input', {
          class: 'visually-hidden', type: 'file', id: 'restore-file', accept: '.json',
          on: {
            change: async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!confirm('Restoring replaces the quiz edits and scores on this device. Continue?')) return;
              try {
                store.importAll(JSON.parse(await readFileAsText(f)));
                location.reload();
              } catch (err) {
                fx.toast(`Restore failed: ${err.message}`, 'danger');
              }
            },
          },
        }),
        el('button', {
          type: 'button', class: 'btn btn--danger', text: 'Clear all leaderboard scores',
          on: {
            click: () => {
              if (!confirm('Delete every saved score on this device?')) return;
              store.clearScores();
              fx.toast('Scores cleared.', 'info');
            },
          },
        }),
      ]),
      el('div', { class: 'hazard-rule', 'aria-hidden': 'true' }),
      el('p', {
        class: 'field__hint',
        text: 'On a shared classroom machine, students all share one profile. That is intentional for whiteboard use. Student logins and cloud saves are the natural next step — see the README.',
      }),
    ]),
    actions: [],
  });
}

/* ====================================================================== */
/* Modal helper                                                            */
/* ====================================================================== */

/**
 * A native <dialog>, so focus trapping, Escape and the backdrop are the
 * browser's job rather than ours. Removed from the DOM on close.
 */
function modal({ title, body, actions = [] }) {
  const titleId = uid('dlg');
  const dlg = el('dialog', { class: 'modal modal--wide', 'aria-labelledby': titleId }, [
    el('div', { class: 'modal__body stack' }, [
      el('div', { class: 'row row--between' }, [
        el('h2', { id: titleId, text: title }),
        el('button', {
          type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Close',
          text: '✕', on: { click: () => dlg.close() },
        }),
      ]),
      body,
    ]),
    el('div', { class: 'modal__foot row row--end row--wrap' }, [
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'Close', on: { click: () => dlg.close() } }),
      ...actions,
    ]),
  ]);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/* --------------------------------------------------------------- start */
registerPWA();
boot();
