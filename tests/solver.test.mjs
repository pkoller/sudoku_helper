import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGrid, solve, nextStep, solveLogically, computeCandidates, applyStep, TECHNIQUES, ALL, PEERS,
} from '../js/solver.js';

const PUZZLES = {
  easy: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  medium: '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
  hard: '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
  xwing: '100000569492056108056109240009640801064010000218035604040500016905061402621000005',
  ywing: '900040000000600031020000090000700020002935600070002000060000073510009000000080009',
  expert: '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
};

function rng(seed) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

function randomPuzzle(rand) {
  const g = new Array(81).fill(0);
  // Zufällige Lösung: Diagonalblöcke füllen, dann lösen.
  for (const b of [0, 4, 8]) {
    const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rand() - 0.5);
    let k = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g[(Math.floor(b / 3) * 3 + r) * 9 + (b % 3) * 3 + c] = ds[k++];
  }
  const full = solve(g, 1).solution;
  const p = full.slice();
  const order = [...Array(81).keys()].sort(() => rand() - 0.5);
  for (const c of order) {
    const v = p[c];
    p[c] = 0;
    if (solve(p, 2).count !== 1) p[c] = v;
  }
  return { puzzle: p, solution: full };
}

test('Backtracking findet eindeutige Lösung', () => {
  for (const s of Object.values(PUZZLES)) {
    const { count, solution } = solve(parseGrid(s));
    assert.equal(count, 1);
    assert.ok(solution.every(v => v >= 1 && v <= 9));
  }
});

test('Leeres Gitter hat mehrere Lösungen, Widerspruch keine', () => {
  assert.equal(solve(new Array(81).fill(0)).count, 2);
  const g = parseGrid(PUZZLES.easy); g[2] = 5;
  assert.equal(solve(g).count, 0);
});

function checkSteps(puzzle, solution) {
  const g = puzzle.slice();
  const elim = new Array(81).fill(0);
  const used = new Set();
  for (let i = 0; i < 400; i++) {
    const step = nextStep(g, elim, solution, puzzle.map(v => v > 0));
    assert.ok(step, 'nextStep liefert immer etwas');
    if (step.technique === 'solved') break;
    assert.ok(!step.error, `unerwarteter Fehler: ${step.text}`);
    for (const { cell, digit } of step.place) {
      assert.equal(digit, solution[cell], `${step.technique} setzt falsche Ziffer`);
    }
    for (const { cell, digit } of step.eliminate) {
      assert.notEqual(digit, solution[cell], `${step.technique} streicht richtigen Kandidaten: ${step.text}`);
      assert.ok(computeCandidates(g, elim)[cell] & (1 << digit), 'Streichung muss echter Kandidat sein');
    }
    assert.ok(step.place.length + step.eliminate.length > 0, 'Schritt muss Fortschritt bringen');
    used.add(step.technique);
    applyStep(g, elim, step);
  }
  assert.deepEqual(g, solution);
  return used;
}

test('Alle Schritte sind korrekt (Beispielrätsel)', () => {
  const used = new Set();
  for (const s of Object.values(PUZZLES)) {
    const p = parseGrid(s);
    for (const t of checkSteps(p, solve(p).solution)) used.add(t);
  }
  assert.ok(used.has('hidden-single'));
});

test('Alle Schritte sind korrekt (200 Zufallsrätsel)', () => {
  const rand = rng(42);
  const used = new Map();
  for (let i = 0; i < 200; i++) {
    const { puzzle, solution } = randomPuzzle(rand);
    for (const t of checkSteps(puzzle, solution)) used.set(t, (used.get(t) || 0) + 1);
  }
  console.log('Verwendete Techniken:', Object.fromEntries(used));
  assert.ok(used.size >= 5);
});

test('Erkennt falsch eingetragene Ziffer', () => {
  const p = parseGrid(PUZZLES.easy);
  const sol = solve(p).solution;
  const g = p.slice();
  const empty = g.indexOf(0);
  g[empty] = sol[empty] === 1 ? 2 : 1;
  // Nur prüfen, wenn es keinen direkten Konflikt gibt.
  const step = nextStep(g, new Array(81).fill(0), sol, p.map(v => v > 0));
  assert.ok(['mistake', 'conflict'].includes(step.technique));
});

test('Erkennt versehentlich gestrichenen Kandidaten', () => {
  const p = parseGrid(PUZZLES.hard);
  const sol = solve(p).solution;
  const elim = new Array(81).fill(0);
  const empty = p.indexOf(0);
  elim[empty] = 1 << sol[empty];
  const step = nextStep(p, elim, sol, p.map(v => v > 0));
  assert.equal(step.technique, 'lost-candidate');
  assert.deepEqual(step.restore, [empty]);
});

test('Gelöstes Gitter wird erkannt', () => {
  const p = parseGrid(PUZZLES.easy);
  const sol = solve(p).solution;
  assert.equal(nextStep(sol, new Array(81).fill(0), sol, p.map(v => v > 0)).technique, 'solved');
});

test('Logischer Solver schafft die leichteren Rätsel ohne Raten', () => {
  for (const k of ['easy', 'medium', 'hard']) {
    assert.ok(solveLogically(parseGrid(PUZZLES[k])).solved, k);
  }
});

test('Jede Technik hat Texte', () => {
  assert.ok(TECHNIQUES.length > 10);
  assert.equal(ALL, 0b1111111110);
  assert.equal(PEERS[0].length, 20);
});

test('Versteckter Einer nennt vorher gestrichene Kandidaten', () => {
  // Spalte 1: die 6 ist nur durch Z3S2 und durch Streichungen in Z5S1/Z9S1 ausgeschlossen.
  const g = parseGrid('005000090040300000060010000100000048000008700738401000200500600070140025000009100');
  const elim = new Array(81).fill(0);
  elim[36] = 1 << 6; elim[72] = 1 << 6;
  const step = nextStep(g, elim);
  assert.equal(step.technique, 'hidden-single');
  assert.deepEqual(step.place, [{ cell: 63, digit: 6 }]);
  assert.match(step.text, /Z5S1 und Z9S1 wurde die 6 schon vorher als Kandidat gestrichen/);
  // Ohne Streichungen darf dieser Einer nicht behauptet werden.
  const plain = nextStep(g, new Array(81).fill(0));
  assert.ok(!(plain.technique === 'hidden-single' && plain.place[0].cell === 63));
});
