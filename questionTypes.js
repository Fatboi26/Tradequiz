/* ============================================================================
   questionTypes.js — one renderer + one grader per question type.
   ----------------------------------------------------------------------------
   Each type exports { render, grade, reveal? } via the TYPES registry.

     render(q, ctx) → { node, getResponse, focusFirst }
     grade(q, response) → { correct, detail }

   ACCESSIBILITY CONTRACT: every type must be completable with a keyboard
   alone. Nothing here relies on pointer drag as the only route — drag is
   always an enhancement over a click/keyboard path that works on its own.

   ADD A NEW TYPE: add an entry to TYPES, add its name to QUESTION_TYPES in
   bank.js, and add a validation case there. Nothing else changes.
   ========================================================================== */

import { el, $$, shuffle, announce } from '../core/utils.js';

/* Shared: build the coloured Kahoot-style answer tiles. */
function tileGrid(options, { multi = false, onPick }) {
  const glyphs = ['◆', '●', '▲', '■', '★', '⬢'];
  const grid = el('div', { class: 'answers', role: multi ? 'group' : 'group' });
  options.forEach((opt, i) => {
    const btn = el('button', {
      type: 'button',
      class: 'tile',
      style: { '--tile-c': `var(--c-ans-${(i % 6) + 1})` },
      dataset: { index: String(i) },
      'aria-pressed': multi ? 'false' : null,
      on: { click: () => onPick(i, btn) },
    }, [
      el('span', { class: 'tile__glyph', 'aria-hidden': 'true', text: glyphs[i % 6] }),
      el('span', { class: 'tile__label', text: opt }),
    ]);
    grid.append(btn);
  });
  return grid;
}

/** Mark the tiles up after grading so the learner sees what was right. */
function revealTiles(root, { correctIndexes, chosenIndexes }) {
  $$('.tile', root).forEach((tile) => {
    const i = Number(tile.dataset.index);
    tile.disabled = true;
    if (correctIndexes.includes(i)) tile.classList.add('is-correct');
    else if (chosenIndexes.includes(i)) tile.classList.add('is-wrong');
    else tile.classList.add('is-dimmed');
  });
}

/* ========================================================================== */
/* Multiple choice / image / scenario — one answer from several                */
/* ========================================================================== */
const singleChoice = {
  render(q, { onCommit }) {
    let chosen = null;
    const wrap = el('div', { class: 'stack' });

    if (q.image) {
      wrap.append(el('figure', { class: 'q-figure' }, [
        el('img', { src: q.image, alt: q.imageAlt || '', loading: 'lazy' }),
      ]));
    }

    // Options are shuffled for display but we track the ORIGINAL index, so the
    // JSON author never has to worry about answer position.
    const order = shuffle(q.options.map((_, i) => i));
    const grid = tileGrid(order.map((i) => q.options[i]), {
      onPick: (displayIndex) => { chosen = order[displayIndex]; onCommit(); },
    });
    // Rewrite data-index to the original index so reveal() lines up.
    $$('.tile', grid).forEach((t, d) => { t.dataset.index = String(order[d]); });
    wrap.append(grid);

    return {
      node: wrap,
      getResponse: () => chosen,
      focusFirst: () => $$('.tile', grid)[0]?.focus(),
    };
  },
  grade: (q, response) => ({ correct: response === q.answer }),
  reveal: (root, q, response) =>
    revealTiles(root, { correctIndexes: [q.answer], chosenIndexes: response === null ? [] : [response] }),
};

/* ========================================================================== */
/* True or false                                                              */
/* ========================================================================== */
const trueFalse = {
  render(q, { onCommit }) {
    let chosen = null;
    const wrap = el('div', { class: 'stack' });
    if (q.image) wrap.append(el('figure', { class: 'q-figure' }, [el('img', { src: q.image, alt: q.imageAlt || '' })]));

    const grid = el('div', { class: 'answers' });
    [['True', true, 'var(--c-success)', '✔'], ['False', false, 'var(--c-danger)', '✘']]
      .forEach(([label, value, colour, glyph]) => {
        grid.append(el('button', {
          type: 'button', class: 'tile', style: { '--tile-c': colour },
          dataset: { index: String(value) },
          on: { click: () => { chosen = value; onCommit(); } },
        }, [
          el('span', { class: 'tile__glyph', 'aria-hidden': 'true', text: glyph }),
          el('span', { class: 'tile__label', text: label }),
        ]));
      });
    wrap.append(grid);

    return { node: wrap, getResponse: () => chosen, focusFirst: () => $$('.tile', grid)[0]?.focus() };
  },
  grade: (q, response) => ({ correct: response === q.answer }),
  reveal(root, q, response) {
    $$('.tile', root).forEach((tile) => {
      const v = tile.dataset.index === 'true';
      tile.disabled = true;
      if (v === q.answer) tile.classList.add('is-correct');
      else if (v === response) tile.classList.add('is-wrong');
      else tile.classList.add('is-dimmed');
    });
  },
};

/* ========================================================================== */
/* Multiple answers — pick all that apply, then Submit                        */
/* ========================================================================== */
const multiAnswer = {
  render(q, { onReady }) {
    const chosen = new Set();
    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'q-hint', text: 'Select every correct answer, then choose Submit.' }));

    const order = shuffle(q.options.map((_, i) => i));
    const grid = tileGrid(order.map((i) => q.options[i]), {
      multi: true,
      onPick: (displayIndex, btn) => {
        const real = order[displayIndex];
        if (chosen.has(real)) { chosen.delete(real); btn.setAttribute('aria-pressed', 'false'); }
        else { chosen.add(real); btn.setAttribute('aria-pressed', 'true'); }
        submit.disabled = chosen.size === 0;
        announce(`${chosen.size} selected.`);
        onReady?.(chosen.size > 0);
      },
    });
    $$('.tile', grid).forEach((t, d) => { t.dataset.index = String(order[d]); });

    const submit = el('button', {
      type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Submit answer', disabled: true,
    });
    wrap.append(grid, submit);

    return {
      node: wrap,
      getResponse: () => Array.from(chosen).sort((a, b) => a - b),
      focusFirst: () => $$('.tile', grid)[0]?.focus(),
      submitButton: submit,
    };
  },
  grade(q, response) {
    const want = [...q.answer].sort((a, b) => a - b).join(',');
    const got = [...(response || [])].sort((a, b) => a - b).join(',');
    return { correct: want === got };
  },
  reveal: (root, q, response) => revealTiles(root, { correctIndexes: q.answer, chosenIndexes: response || [] }),
};

/* ========================================================================== */
/* Ordering — sequence steps correctly                                        */
/* ========================================================================== */
/* Drag is offered, but the Move up / Move down buttons are the primary path:
   they work with a keyboard, a screen reader and a shaky hand on a tablet. */
const ordering = {
  render(q, { onReady }) {
    // q.items are authored in the CORRECT order; shuffle for display.
    let current = shuffle(q.items.map((label, i) => ({ id: i, label })));
    // Guard against a shuffle that happens to be correct already.
    if (current.every((it, i) => it.id === i) && current.length > 1) current.reverse();

    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'q-hint', text: 'Put these in the correct order, then choose Submit.' }));
    const list = el('ol', { class: 'order-list', 'aria-label': 'Draggable list. Use the move buttons or drag to reorder.' });

    const paint = () => {
      list.replaceChildren();
      current.forEach((item, i) => {
        const li = el('li', { class: 'order-item', draggable: 'true', dataset: { id: String(item.id) } }, [
          el('span', { class: 'order-item__num', 'aria-hidden': 'true', text: String(i + 1) }),
          el('span', { class: 'order-item__label', text: item.label }),
          el('span', { class: 'order-item__ctrl' }, [
            el('button', {
              type: 'button', class: 'btn btn--sm btn--ghost', 'aria-label': `Move "${item.label}" up`,
              disabled: i === 0, text: '▲',
              on: { click: () => { swap(i, i - 1); announce(`${item.label} moved to position ${i}.`); } },
            }),
            el('button', {
              type: 'button', class: 'btn btn--sm btn--ghost', 'aria-label': `Move "${item.label}" down`,
              disabled: i === current.length - 1, text: '▼',
              on: { click: () => { swap(i, i + 1); announce(`${item.label} moved to position ${i + 2}.`); } },
            }),
          ]),
        ]);

        // Pointer drag as an enhancement only.
        li.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', String(item.id));
          li.classList.add('is-dragging');
        });
        li.addEventListener('dragend', () => li.classList.remove('is-dragging'));
        li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('is-over'); });
        li.addEventListener('dragleave', () => li.classList.remove('is-over'));
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          li.classList.remove('is-over');
          const fromId = Number(e.dataTransfer.getData('text/plain'));
          const from = current.findIndex((x) => x.id === fromId);
          if (from < 0 || from === i) return;
          const [moved] = current.splice(from, 1);
          current.splice(i, 0, moved);
          paint();
        });

        list.append(li);
      });
      // Keep focus sensible after a re-render triggered by a move button.
      onReady?.(true);
    };

    const swap = (a, b) => {
      [current[a], current[b]] = [current[b], current[a]];
      paint();
      // Return focus to the button the user just pressed, in its new row.
      const dir = b > a ? '▼' : '▲';
      const target = $$('.order-item', list)[b];
      $$('button', target).find((btn) => btn.textContent === dir)?.focus();
    };

    paint();
    const submit = el('button', { type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Submit order' });
    wrap.append(list, submit);

    return {
      node: wrap,
      getResponse: () => current.map((x) => x.id),
      focusFirst: () => $$('button', list)[0]?.focus(),
      submitButton: submit,
    };
  },
  grade(q, response) {
    const correct = (response || []).every((id, i) => id === i);
    return { correct };
  },
  reveal(root, q) {
    const list = root.querySelector('.order-list');
    if (!list) return;
    list.replaceChildren();
    q.items.forEach((label, i) => {
      list.append(el('li', { class: 'order-item is-correct' }, [
        el('span', { class: 'order-item__num', text: String(i + 1) }),
        el('span', { class: 'order-item__label', text: label }),
      ]));
    });
    root.querySelector('.btn--gold')?.remove();
  },
};

/* ========================================================================== */
/* Matching — pair left items with right items                               */
/* ========================================================================== */
/* Implemented as native <select> elements: fully accessible for free, works
   on a phone, and reads clearly on a whiteboard. */
const matching = {
  render(q, { onReady }) {
    const rights = shuffle(q.pairs.map((p, i) => ({ i, text: p.right })));
    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'q-hint', text: 'Choose the matching answer for each item, then Submit.' }));

    const table = el('div', { class: 'match-list' });
    const selects = [];

    q.pairs.forEach((pair, i) => {
      const id = `match-${q.id}-${i}`;
      const select = el('select', { class: 'select', id, dataset: { index: String(i) } }, [
        el('option', { value: '', text: 'Choose…' }),
        ...rights.map((r) => el('option', { value: String(r.i), text: r.text })),
      ]);
      select.addEventListener('change', () => {
        submit.disabled = selects.some((s) => !s.value);
        onReady?.(!submit.disabled);
      });
      selects.push(select);
      table.append(el('div', { class: 'match-row' }, [
        el('label', { class: 'match-row__left', htmlFor: id, text: pair.left }),
        select,
      ]));
    });

    const submit = el('button', { type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Submit matches', disabled: true });
    wrap.append(table, submit);

    return {
      node: wrap,
      getResponse: () => selects.map((s) => (s.value === '' ? null : Number(s.value))),
      focusFirst: () => selects[0]?.focus(),
      submitButton: submit,
    };
  },
  grade(q, response) {
    const correct = (response || []).every((chosen, i) => chosen === i);
    return { correct, detail: (response || []).map((c, i) => c === i) };
  },
  reveal(root, q, response) {
    $$('.match-row', root).forEach((row, i) => {
      const ok = response?.[i] === i;
      row.classList.add(ok ? 'is-correct' : 'is-wrong');
      const select = row.querySelector('select');
      select.disabled = true;
      if (!ok) {
        row.append(el('p', { class: 'match-row__fix', text: `Correct: ${q.pairs[i].right}` }));
      }
    });
    root.querySelector('.btn--gold')?.remove();
  },
};

/* ========================================================================== */
/* Drag and drop — assign items to labelled targets                          */
/* ========================================================================== */
/* Two routes to the same result:
     Pointer: drag an item onto a target.
     Keyboard/tap: activate an item to "pick it up", then activate a target. */
const dragDrop = {
  render(q, { onReady }) {
    const placed = new Map();       // targetId → itemId
    let held = null;                // itemId currently picked up

    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'q-hint', text: 'Drag each item to its target — or select an item, then select its target.' }));

    const tray = el('div', { class: 'dd-tray', 'aria-label': 'Items to place' });
    const targets = el('div', { class: 'dd-targets' });

    const refresh = () => {
      // Tray: hide items already placed
      $$('.dd-item', tray).forEach((node) => {
        const isPlaced = Array.from(placed.values()).includes(node.dataset.id);
        node.classList.toggle('is-placed', isPlaced);
        node.classList.toggle('is-held', held === node.dataset.id);
        node.setAttribute('aria-pressed', held === node.dataset.id ? 'true' : 'false');
        node.disabled = isPlaced;
      });
      // Targets: show what has landed
      $$('.dd-target', targets).forEach((node) => {
        const itemId = placed.get(node.dataset.id);
        const slot = node.querySelector('.dd-target__slot');
        const item = q.items.find((it) => it.id === itemId);
        slot.textContent = item ? item.label : 'Empty';
        node.classList.toggle('is-filled', Boolean(item));
        node.classList.toggle('is-armed', held !== null && !item);
      });
      submit.disabled = placed.size !== q.targets.length;
      onReady?.(!submit.disabled);
    };

    const place = (targetId, itemId) => {
      // One item per target; drop whatever was there back to the tray.
      for (const [t, it] of placed) if (it === itemId) placed.delete(t);
      placed.set(targetId, itemId);
      held = null;
      const label = q.items.find((i) => i.id === itemId)?.label;
      const tLabel = q.targets.find((t) => t.id === targetId)?.label;
      announce(`${label} placed on ${tLabel}.`);
      refresh();
    };

    shuffle(q.items).forEach((item) => {
      const node = el('button', {
        type: 'button', class: 'dd-item', draggable: 'true',
        dataset: { id: item.id }, text: item.label, 'aria-pressed': 'false',
        on: {
          click: () => {
            held = held === item.id ? null : item.id;
            announce(held ? `${item.label} picked up. Now choose a target.` : 'Put down.');
            refresh();
          },
          dragstart: (e) => { held = item.id; e.dataTransfer.setData('text/plain', item.id); node.classList.add('is-dragging'); },
          dragend: () => { node.classList.remove('is-dragging'); refresh(); },
        },
      });
      tray.append(node);
    });

    q.targets.forEach((target) => {
      const node = el('button', {
        type: 'button', class: 'dd-target', dataset: { id: target.id },
        on: {
          click: () => {
            if (held) return place(target.id, held);
            // Tapping a filled target lifts the item back out.
            if (placed.has(target.id)) {
              held = placed.get(target.id);
              placed.delete(target.id);
              announce('Item lifted.');
              refresh();
            }
          },
          dragover: (e) => { e.preventDefault(); node.classList.add('is-over'); },
          dragleave: () => node.classList.remove('is-over'),
          drop: (e) => {
            e.preventDefault(); node.classList.remove('is-over');
            place(target.id, e.dataTransfer.getData('text/plain'));
          },
        },
      }, [
        el('span', { class: 'dd-target__label', text: target.label }),
        el('span', { class: 'dd-target__slot', text: 'Empty' }),
      ]);
      targets.append(node);
    });

    const submit = el('button', { type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Submit placements', disabled: true });
    wrap.append(tray, targets, submit);
    refresh();

    return {
      node: wrap,
      getResponse: () => Object.fromEntries(placed),
      focusFirst: () => $$('.dd-item', tray)[0]?.focus(),
      submitButton: submit,
    };
  },
  grade(q, response) {
    const r = response || {};
    const correct = q.targets.every((t) => r[t.id] === t.accepts);
    return { correct };
  },
  reveal(root, q, response) {
    const r = response || {};
    $$('.dd-target', root).forEach((node) => {
      const target = q.targets.find((t) => t.id === node.dataset.id);
      const ok = r[target.id] === target.accepts;
      node.classList.add(ok ? 'is-correct' : 'is-wrong');
      node.disabled = true;
      if (!ok) {
        const right = q.items.find((i) => i.id === target.accepts)?.label;
        node.append(el('span', { class: 'dd-target__fix', text: `Correct: ${right}` }));
      }
    });
    root.querySelector('.btn--gold')?.remove();
    root.querySelector('.dd-tray')?.classList.add('is-done');
  },
};

/* ========================================================================== */
/* Hotspot — click the right part of an image                                */
/* ========================================================================== */
/* Keyboard route: arrow keys nudge a crosshair, Enter places it. Coordinates
   are percentages of the image box, so it scales to any screen. */
const hotspot = {
  render(q, { onReady }) {
    let point = null;   // { x, y } as percentages

    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'q-hint', text: 'Select the correct spot on the image. Keyboard: arrow keys to aim, Enter to place.' }));

    const marker = el('div', { class: 'hs-marker hidden', 'aria-hidden': 'true' });
    const stage = el('div', {
      class: 'hs-stage', tabIndex: 0, role: 'application',
      'aria-label': `${q.imageAlt || 'Image'}. Aim with the arrow keys and press Enter to place your marker.`,
    }, [
      el('img', { src: q.image, alt: q.imageAlt || '', draggable: 'false' }),
      marker,
    ]);

    const setPoint = (x, y, announceIt = true) => {
      point = { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
      marker.classList.remove('hidden');
      marker.style.left = `${point.x}%`;
      marker.style.top = `${point.y}%`;
      submit.disabled = false;
      onReady?.(true);
      if (announceIt) announce(`Marker at ${Math.round(point.x)} percent across, ${Math.round(point.y)} percent down.`);
    };

    stage.addEventListener('click', (e) => {
      const r = stage.getBoundingClientRect();
      setPoint(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100, false);
      stage.focus();
    });

    stage.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      const p = point || { x: 50, y: 50 };
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        setPoint(p.x + moves[e.key][0], p.y + moves[e.key][1], false);
      } else if (e.key === 'Enter' && point) {
        e.preventDefault();
        submit.click();
      }
    });

    const submit = el('button', { type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Submit selection', disabled: true });
    wrap.append(stage, submit);

    return { node: wrap, getResponse: () => point, focusFirst: () => stage.focus(), submitButton: submit };
  },
  grade(q, response) {
    if (!response) return { correct: false };
    const hit = (q.areas || []).some((a) => {
      if (a.shape === 'circle') {
        return Math.hypot(response.x - a.x, response.y - a.y) <= a.r;
      }
      // default: rect, given as percentages
      return response.x >= a.x && response.x <= a.x + a.w
          && response.y >= a.y && response.y <= a.y + a.h;
    });
    return { correct: hit };
  },
  reveal(root, q, response) {
    const stage = root.querySelector('.hs-stage');
    if (!stage) return;
    (q.areas || []).forEach((a) => {
      const box = a.shape === 'circle'
        ? { left: `${a.x - a.r}%`, top: `${a.y - a.r}%`, width: `${a.r * 2}%`, height: `${a.r * 2}%`, borderRadius: '50%' }
        : { left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` };
      stage.append(el('div', { class: 'hs-area', style: box, 'aria-hidden': 'true' }));
    });
    const marker = stage.querySelector('.hs-marker');
    if (marker && response) marker.classList.add(hotspot.grade(q, response).correct ? 'is-correct' : 'is-wrong');
    root.querySelector('.btn--gold')?.remove();
  },
};

/* ========================================================================== */
/* Numeric — type a number, graded with a tolerance                          */
/* ========================================================================== */
const numeric = {
  render(q, { onReady }) {
    const wrap = el('div', { class: 'stack' });
    const id = `num-${q.id}`;
    const input = el('input', {
      class: 'input input--big', id, type: 'text', inputMode: 'decimal',
      autocomplete: 'off', placeholder: '0',
      'aria-describedby': `${id}-hint`,
    });
    input.addEventListener('input', () => {
      submit.disabled = input.value.trim() === '';
      onReady?.(!submit.disabled);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !submit.disabled) { e.preventDefault(); submit.click(); }
    });

    const submit = el('button', { type: 'button', class: 'btn btn--gold btn--lg btn--block', text: 'Submit answer', disabled: true });

    wrap.append(
      el('div', { class: 'num-field' }, [
        el('label', { class: 'visually-hidden', htmlFor: id, text: 'Your answer' }),
        input,
        q.unit ? el('span', { class: 'num-field__unit', text: q.unit }) : null,
      ]),
      el('p', { class: 'q-hint', id: `${id}-hint`, text: q.tolerance ? `Accepted within ±${q.tolerance}${q.unit ? ' ' + q.unit : ''}.` : 'Enter an exact value.' }),
      submit,
    );

    return { node: wrap, getResponse: () => input.value.trim(), focusFirst: () => input.focus(), submitButton: submit };
  },
  grade(q, response) {
    // Tolerate the ways learners actually type numbers: "£1,008", "44.1 MJ".
    const cleaned = String(response ?? '').replace(/[£$,\s]/g, '').replace(/[a-zA-Zµ²³Ω°]/g, '');
    const value = Number.parseFloat(cleaned);
    if (Number.isNaN(value)) return { correct: false, detail: 'not-a-number' };
    const tol = q.tolerance ?? 0;
    return { correct: Math.abs(value - q.answer) <= tol, detail: value };
  },
  reveal(root, q, response) {
    const input = root.querySelector('.input--big');
    if (!input) return;
    input.disabled = true;
    const ok = numeric.grade(q, response).correct;
    input.classList.add(ok ? 'is-correct' : 'is-wrong');
    if (!ok) {
      root.querySelector('.num-field')?.after(
        el('p', { class: 'field__error', text: `Correct answer: ${q.answer}${q.unit ? ' ' + q.unit : ''}` }));
    }
    root.querySelector('.btn--gold')?.remove();
  },
};

/* ========================================================================== */
/* Registry                                                                   */
/* ========================================================================== */
export const TYPES = {
  mcq: singleChoice,
  image: singleChoice,      // same interaction; the renderer picks up q.image
  scenario: singleChoice,   // same interaction; the engine renders q.scenario above
  truefalse: trueFalse,
  multi: multiAnswer,
  order: ordering,
  match: matching,
  dragdrop: dragDrop,
  hotspot,
  numeric,
};

/** Friendly names, used in the teacher dashboard. */
export const TYPE_LABELS = {
  mcq: 'Multiple choice',
  truefalse: 'True or false',
  multi: 'Multiple answers',
  image: 'Image question',
  order: 'Ordering / sequencing',
  match: 'Matching',
  dragdrop: 'Drag and drop',
  hotspot: 'Image hotspot',
  numeric: 'Calculation',
  scenario: 'Practical scenario',
};

/**
 * Types where the learner assembles an answer and presses Submit, rather than
 * committing the moment they tap. The engine uses this to decide whether to
 * grade on tap or wait.
 */
export const DELIBERATE_TYPES = new Set(['multi', 'order', 'match', 'dragdrop', 'hotspot', 'numeric']);

export const getType = (name) => TYPES[name] || TYPES.mcq;
