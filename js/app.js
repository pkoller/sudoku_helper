import {
  solve, nextStep, computeCandidates, findConflicts, digitsOf, applyStep, PEERS,
} from './solver.js';
import { recognize, buildTemplates } from './vision.js';
import { SAMPLES } from './handwriting.js';

const $ = id => document.getElementById(id);
const STORE_KEY = 'sudoku-helper-state-v1';
const MAX_SIDE = 1200;

const state = {
  screen: 'start',
  // Prüfen
  review: null,      // {grid, confidence, hand} – hand[i]: eigene (Bleistift-)Ziffer statt Vorgabe
  photo: null,       // {imageData, canvas, corners}
  // Spielen
  givens: null, grid: null, elim: null, solution: null,
  history: [],
  selected: -1,
  notes: false,
  showCands: true,
  hint: null,        // {step, level}
};

let templates = null;
function getTemplates() {
  if (!templates) {
    templates = buildTemplates((w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }, SAMPLES);
  }
  return templates;
}

// ---------------------------------------------------------------------------
// Bildschirme

function show(screen) {
  state.screen = screen;
  for (const s of ['start', 'review', 'play']) $(`screen-${s}`).hidden = s !== screen;
  $('btn-home').hidden = screen === 'start';
  if (screen === 'start') $('btn-resume').hidden = !loadSaved();
  window.scrollTo(0, 0);
}

function busy(on) { $('busy').hidden = !on; }

// ---------------------------------------------------------------------------
// Foto laden und erkennen

async function handleFile(file) {
  if (!file) return;
  busy(true);
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    await nextFrame();
    const res = recognize(imageData, getTemplates());
    const corners = res ? res.corners : defaultCorners(canvas.width, canvas.height);
    state.photo = { imageData, canvas, corners };
    startReview(res);
  } catch (e) {
    console.error(e);
    alert('Das Bild konnte nicht gelesen werden: ' + e.message);
  } finally {
    busy(false);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unbekanntes Bildformat')); };
    img.src = url;
  });
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

function defaultCorners(w, h) {
  const s = Math.min(w, h) * 0.8;
  const x = (w - s) / 2, y = (h - s) / 2;
  return [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
}

function startReview(res) {
  const msg = $('review-msg');
  if (res) {
    state.review = { grid: res.grid, confidence: res.confidence, hand: res.hand };
    const n = res.grid.filter((v, i) => v && !res.hand[i]).length;
    const own = res.grid.filter((v, i) => v && res.hand[i]).length;
    msg.textContent = `${n} Vorgaben${own ? ` und ${own} eigene Ziffern (blau)` : ''} erkannt. ` +
      'Bitte vergleiche mit dem Foto und korrigiere Fehler.';
    msg.classList.toggle('error', n < 17);
    if (n < 17) msg.textContent += ' (Ein Sudoku braucht mindestens 17 Ziffern – evtl. Rahmen anpassen.)';
  } else {
    state.review = { grid: new Array(81).fill(0), confidence: new Array(81).fill(1), hand: new Array(81).fill(false) };
    msg.textContent = state.photo
      ? 'Kein Sudoku gefunden. Ziehe die Ecken auf das Sudoku und tippe „Neu erkennen“ – oder gib die Ziffern selbst ein.'
      : 'Gib die vorgegebenen Ziffern ein.';
    msg.classList.toggle('error', !!state.photo);
  }
  $('photo-wrap').hidden = !state.photo;
  state.selected = -1;
  show('review');
  if (state.photo) drawPhoto();
  renderReview();
}

// --- Foto mit verschiebbaren Ecken ---

let dragIdx = -1;
function drawPhoto() {
  const { canvas: src, corners } = state.photo;
  const cv = $('photo-canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const lw = Math.max(2, src.width / 250);
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#ffcc00';
  ctx.fillStyle = 'rgba(255, 204, 0, 0.12)';
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.arc(x, y, lw * 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 204, 0, 0.85)'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = lw / 2; ctx.stroke();
  }
}

function photoPoint(e) {
  const cv = $('photo-canvas');
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
}

$('photo-canvas').addEventListener('pointerdown', e => {
  if (!state.photo) return;
  const p = photoPoint(e);
  let best = -1, bestD = Infinity;
  state.photo.corners.forEach((c, i) => {
    const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
    if (d < bestD) { bestD = d; best = i; }
  });
  const cv = $('photo-canvas');
  if (bestD < cv.width * 0.15) {
    dragIdx = best;
    cv.setPointerCapture(e.pointerId);
  }
});
$('photo-canvas').addEventListener('pointermove', e => {
  if (dragIdx < 0) return;
  const [x, y] = photoPoint(e);
  const { width, height } = state.photo.canvas;
  state.photo.corners[dragIdx] = [Math.max(0, Math.min(width - 1, x)), Math.max(0, Math.min(height - 1, y))];
  drawPhoto();
});
const endDrag = () => { dragIdx = -1; };
$('photo-canvas').addEventListener('pointerup', endDrag);
$('photo-canvas').addEventListener('pointercancel', endDrag);

$('btn-rescan').addEventListener('click', async () => {
  busy(true);
  await nextFrame();
  try {
    const res = recognize(state.photo.imageData, getTemplates(), state.photo.corners.map(p => p.slice()));
    startReview(res);
  } finally { busy(false); }
});

// --- Prüfen-Gitter ---

function renderReview() {
  const { grid, confidence, hand } = state.review;
  const conflicts = new Set(findConflicts(grid));
  renderGrid($('review-grid'), c => ({
    value: grid[c],
    classes: [
      grid[c] ? (hand[c] ? 'user' : 'given') : '',
      c === state.selected ? 'sel' : '',
      conflicts.has(c) ? 'err' : (grid[c] && confidence[c] < 0.3 ? 'unsure' : ''),
    ],
  }), c => { state.selected = c; renderReview(); });
}

function reviewInput(d) {
  if (state.selected < 0) return;
  const { grid, hand } = state.review;
  if (!grid[state.selected] || !d) hand[state.selected] = false;
  grid[state.selected] = d;
  state.review.confidence[state.selected] = 1;
  renderReview();
}

// Vorgabe (gedruckt) ↔ eigene Ziffer (Handschrift) umschalten
$('btn-kind').addEventListener('click', () => {
  const c = state.selected;
  if (c < 0 || !state.review.grid[c]) return;
  state.review.hand[c] = !state.review.hand[c];
  renderReview();
});

$('btn-accept').addEventListener('click', () => {
  const { grid: all, hand } = state.review;
  const grid = all.map((v, i) => hand[i] ? 0 : v);
  const msg = $('review-msg');
  // Doppelte eigene Ziffern dürfen sein (echte Fehler zeigt das Spiel an), doppelte Vorgaben nicht.
  if (findConflicts(grid).length) {
    msg.textContent = 'Es gibt doppelte Ziffern (rot markiert). Bitte korrigieren.';
    msg.classList.add('error');
    return;
  }
  const { count, solution } = solve(grid, 2);
  if (count === 0) {
    msg.textContent = 'Dieses Sudoku hat keine Lösung – vermutlich wurde eine Ziffer falsch erkannt.';
    msg.classList.add('error');
    return;
  }
  if (count > 1 && !confirm('Dieses Sudoku hat mehr als eine Lösung (evtl. fehlt eine Ziffer). Trotzdem starten? Fehlerprüfung ist dann ausgeschaltet.')) {
    return;
  }
  startGame(grid, count === 1 ? solution : null, all);
});

// ---------------------------------------------------------------------------
// Spiel

function startGame(grid, solution, entries = grid) {
  state.givens = grid.map(v => v > 0);
  state.grid = entries.slice();
  state.elim = new Array(81).fill(0);
  state.solution = solution;
  state.history = [];
  state.selected = -1;
  state.hint = null;
  state.photo = null;
  save();
  show('play');
  renderPlay();
}

function pushHistory() {
  state.history.push({ grid: state.grid.slice(), elim: state.elim.slice() });
  if (state.history.length > 300) state.history.shift();
}

function playInput(d) {
  const c = state.selected;
  if (c < 0 || state.givens[c]) return;
  pushHistory();
  if (d === 0) {
    state.grid[c] = 0;
  } else if (state.notes) {
    if (state.grid[c]) { state.history.pop(); return; }
    state.elim[c] ^= 1 << d;
  } else {
    state.grid[c] = state.grid[c] === d ? 0 : d;
  }
  state.hint = null;
  afterChange();
}

function afterChange() {
  save();
  renderPlay();
  if (state.grid.every(v => v) && !findConflicts(state.grid).length) {
    showHint(nextStep(state.grid, state.elim, state.solution, state.givens), 2);
  }
}

function showHint(step, level) {
  state.hint = step ? { step, level } : null;
  renderPlay();
  if (state.hint) $('hint-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('btn-hint').addEventListener('click', () => {
  if (state.hint && state.hint.level === 1) { state.hint.level = 2; renderPlay(); return; }
  const step = nextStep(state.grid, state.elim, state.solution, state.givens);
  if (!step) {
    showHint({ title: 'Kein Schritt gefunden', hint: 'Ich finde keinen logischen Schritt mehr.', text: 'Ich finde keinen logischen Schritt mehr.', place: [], eliminate: [], focus: [], cells: [], keyCands: [] }, 2);
    return;
  }
  showHint(step, step.error ? 2 : 1);
});
$('btn-hint-more').addEventListener('click', () => { state.hint.level = 2; renderPlay(); });
$('btn-hint-close').addEventListener('click', () => { state.hint = null; renderPlay(); });
$('btn-hint-apply').addEventListener('click', () => {
  const step = state.hint && state.hint.step;
  if (!step) return;
  pushHistory();
  if (step.wrong) for (const c of step.wrong) state.grid[c] = 0;
  if (step.restore) for (const c of step.restore) state.elim[c] = 0;
  applyStep(state.grid, state.elim, step);
  if (step.place.length) state.selected = step.place[0].cell;
  state.hint = null;
  afterChange();
});

$('btn-undo').addEventListener('click', () => {
  const h = state.history.pop();
  if (!h) return;
  state.grid = h.grid; state.elim = h.elim; state.hint = null;
  save(); renderPlay();
});
$('btn-mode').addEventListener('click', () => { state.notes = !state.notes; renderPlay(); });
$('btn-cands').addEventListener('click', () => { state.showCands = !state.showCands; renderPlay(); });

function renderPlay() {
  const { grid, givens } = state;
  const cands = computeCandidates(grid, state.elim);
  const conflicts = new Set(findConflicts(grid));
  const hint = state.hint;
  const step = hint && hint.step;
  const lvl2 = hint && hint.level === 2;
  const focus = new Set(step ? step.focus : []);
  const cells = new Set(lvl2 ? step.cells : []);
  const key = new Set(lvl2 ? step.keyCands.map(k => k.cell * 10 + k.digit) : []);
  const elim = new Set(lvl2 ? step.eliminate.map(k => k.cell * 10 + k.digit) : []);
  const place = new Map(lvl2 ? step.place.map(p => [p.cell, p.digit]) : []);
  const selVal = state.selected >= 0 ? grid[state.selected] : 0;
  // Kandidaten anzeigen, wenn eingeschaltet – oder wenn der Tipp sie braucht.
  const candsVisible = state.showCands || (lvl2 && step.eliminate.length > 0);

  renderGrid($('play-grid'), c => {
    const classes = [];
    if (givens[c]) classes.push('given'); else if (grid[c]) classes.push('user');
    if (selVal && grid[c] === selVal) classes.push('same');
    if (focus.has(c)) classes.push('focus');
    if (cells.has(c)) classes.push('hl');
    if (c === state.selected) classes.push('sel');
    if (conflicts.has(c) || (step && step.error && cells.has(c))) classes.push('err');
    if (place.has(c)) {
      classes.push('place');
      return { value: place.get(c), classes, ghost: true };
    }
    if (grid[c]) return { value: grid[c], classes };
    if (!candsVisible) return { value: 0, classes };
    const m = cands[c];
    const cand = [];
    for (let d = 1; d <= 9; d++) {
      const has = m & (1 << d);
      const k = c * 10 + d;
      cand.push({ d, has, cls: elim.has(k) ? 'elim' : (key.has(k) && has ? 'key' : '') });
    }
    return { cands: cand, classes };
  }, c => { state.selected = c; renderPlay(); });

  // Ziffernblock: Zähler für bereits gesetzte Ziffern
  const counts = new Array(10).fill(0);
  for (const v of grid) counts[v]++;
  $('play-pad').querySelectorAll('button[data-d]').forEach(b => {
    const d = Number(b.dataset.d);
    if (!d) return;
    b.classList.toggle('done', counts[d] >= 9);
    b.querySelector('.cnt').textContent = 9 - counts[d] > 0 ? 9 - counts[d] : '';
  });

  $('btn-mode').textContent = state.notes ? '📝 Notiz' : '✏️ Ziffer';
  $('btn-mode').classList.toggle('on', state.notes);
  $('btn-cands').classList.toggle('on', state.showCands);
  $('btn-undo').disabled = !state.history.length;

  const panel = $('hint-panel');
  panel.hidden = !hint;
  if (hint) {
    panel.classList.toggle('error', !!step.error);
    $('hint-title').textContent = hint.level === 1 ? 'Tipp' : step.title;
    $('hint-text').textContent = hint.level === 1 ? step.hint : step.text;
    $('btn-hint-more').hidden = hint.level !== 1;
    const canApply = step.place.length || step.eliminate.length || step.wrong || step.restore;
    $('btn-hint-apply').hidden = !canApply;
    $('btn-hint-apply').textContent = step.wrong ? 'Falsche Ziffern löschen' : step.restore ? 'Wiederherstellen' : 'Anwenden';
  }
  $('btn-hint').textContent = hint && hint.level === 1 ? '💡 Ganze Erklärung zeigen' : '💡 Nächster Schritt';
}

// ---------------------------------------------------------------------------
// Gemeinsame Darstellung

function renderGrid(el, cellInfo, onSelect) {
  if (el.children.length !== 81) {
    el.innerHTML = '';
    for (let c = 0; c < 81; c++) {
      const div = document.createElement('div');
      div.dataset.c = c;
      el.appendChild(div);
    }
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-c]');
      if (t) el._onSelect(Number(t.dataset.c));
    });
  }
  el._onSelect = onSelect;
  for (let c = 0; c < 81; c++) {
    const info = cellInfo(c);
    const div = el.children[c];
    const r = Math.floor(c / 9), k = c % 9;
    div.className = ['cell', k === 2 || k === 5 ? 'br' : '', r === 2 || r === 5 ? 'bb' : '', ...info.classes]
      .filter(Boolean).join(' ');
    if (info.cands) {
      div.innerHTML = '<div class="cands">' +
        info.cands.map(x => `<span class="${x.cls}">${x.has || x.cls ? x.d : ''}</span>`).join('') + '</div>';
    } else {
      div.innerHTML = info.value ? `<span class="val">${info.value}</span>` : '';
    }
  }
}

function buildPad(el, onDigit) {
  el.innerHTML = '';
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    const b = document.createElement('button');
    b.dataset.d = d;
    b.innerHTML = d ? `${d}<span class="cnt"></span>` : '⌫';
    b.setAttribute('aria-label', d ? `Ziffer ${d}` : 'Löschen');
    b.addEventListener('click', () => onDigit(d));
    el.appendChild(b);
  }
}
buildPad($('review-pad'), reviewInput);
buildPad($('play-pad'), playInput);

// Tastatur (Desktop)
document.addEventListener('keydown', e => {
  if (state.screen === 'start' || e.ctrlKey || e.metaKey || e.altKey) return;
  const input = state.screen === 'review' ? reviewInput : playInput;
  const rerender = state.screen === 'review' ? renderReview : renderPlay;
  if (/^[1-9]$/.test(e.key)) { input(Number(e.key)); e.preventDefault(); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { input(0); e.preventDefault(); return; }
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (moves[e.key]) {
    const s = state.selected < 0 ? 0 : state.selected;
    const n = s + moves[e.key];
    if (n >= 0 && n < 81 && !(Math.abs(moves[e.key]) === 1 && Math.floor(n / 9) !== Math.floor(s / 9))) state.selected = n;
    rerender();
    e.preventDefault();
  }
  if (state.screen === 'play' && (e.key === 'n' || e.key === 'N')) { state.notes = !state.notes; renderPlay(); }
  if (state.screen === 'play' && (e.key === 'h' || e.key === 'H')) $('btn-hint').click();
});

// ---------------------------------------------------------------------------
// Speichern

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      givens: state.givens, grid: state.grid, elim: state.elim, solution: state.solution,
    }));
  } catch { /* Speicher nicht verfügbar */ }
}
function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!s || !Array.isArray(s.grid) || s.grid.length !== 81) return null;
    const solved = s.grid.every(v => v) && (s.solution ? s.grid.every((v, i) => v === s.solution[i]) : !findConflicts(s.grid).length);
    if (!solved) return s;
  } catch { /* ignorieren */ }
  return null;
}

// ---------------------------------------------------------------------------
// Start

$('input-camera').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('input-file').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('btn-manual').addEventListener('click', () => { state.photo = null; startReview(null); });
$('btn-resume').addEventListener('click', () => {
  const s = loadSaved();
  if (!s) return;
  Object.assign(state, { givens: s.givens, grid: s.grid, elim: s.elim, solution: s.solution, history: [], hint: null, selected: -1 });
  show('play');
  renderPlay();
});
$('btn-home').addEventListener('click', () => {
  if (state.screen === 'play' || confirm('Zurück zum Start? Die Eingaben gehen verloren.')) show('start');
});

show('start');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Für Tests
window.__sudoku = { state, recognize, getTemplates, startGame, PEERS, digitsOf };
