// Sudoku-Logik: Kandidaten, menschliche Lösungstechniken und ein Backtracking-Solver.
// Ein Gitter ist ein Array mit 81 Zahlen (0 = leer), Index = Zeile * 9 + Spalte.
// Kandidaten werden als Bitmasken gespeichert (Bit d steht für die Ziffer d).

export const ALL = 0x3fe; // Bits 1..9

const ROWS = [], COLS = [], BOXES = [];
for (let i = 0; i < 9; i++) {
  ROWS.push([]); COLS.push([]); BOXES.push([]);
}
for (let c = 0; c < 81; c++) {
  ROWS[row(c)].push(c);
  COLS[col(c)].push(c);
  BOXES[box(c)].push(c);
}
// Reihenfolge: erst Blöcke, dann Zeilen, dann Spalten (Blöcke sind für Menschen am leichtesten).
export const UNITS = [
  ...BOXES.map((cells, i) => ({ type: 'box', index: i, cells })),
  ...ROWS.map((cells, i) => ({ type: 'row', index: i, cells })),
  ...COLS.map((cells, i) => ({ type: 'col', index: i, cells })),
];
export const PEERS = [];
for (let c = 0; c < 81; c++) {
  const s = new Set([...ROWS[row(c)], ...COLS[col(c)], ...BOXES[box(c)]]);
  s.delete(c);
  PEERS.push([...s]);
}
const PEER_SET = PEERS.map(p => new Set(p));

export function row(c) { return Math.floor(c / 9); }
export function col(c) { return c % 9; }
export function box(c) { return Math.floor(row(c) / 3) * 3 + Math.floor(col(c) / 3); }
export function sees(a, b) { return a !== b && PEER_SET[a].has(b); }

export function popcount(m) {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
}
export function digitsOf(m) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d);
  return out;
}

export function cellName(c) { return `Z${row(c) + 1}S${col(c) + 1}`; }
export function unitName(u) {
  if (u.type === 'box') return `Block ${u.index + 1}`;
  if (u.type === 'row') return `Zeile ${u.index + 1}`;
  return `Spalte ${u.index + 1}`;
}
function unitNameDat(u) {
  // "in Block 3" / "in Zeile 4" / "in Spalte 7"
  return `in ${unitName(u)}`;
}
function list(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' und ' + items[items.length - 1];
}
function cellList(cells) { return list(cells.map(cellName)); }
function digitList(ds) { return list(ds.map(String)); }

/** Kandidaten aus dem Gitter berechnen; elim enthält vom Nutzer/Tipps gestrichene Kandidaten. */
export function computeCandidates(grid, elim) {
  const cands = new Array(81).fill(0);
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    let m = ALL;
    for (const p of PEERS[c]) if (grid[p]) m &= ~(1 << grid[p]);
    if (elim) m &= ~elim[c];
    cands[c] = m;
  }
  return cands;
}

/** Liefert Liste von Konflikten (Zellpaare mit gleicher Ziffer in einer Einheit). */
export function findConflicts(grid) {
  const bad = new Set();
  for (let c = 0; c < 81; c++) {
    if (!grid[c]) continue;
    for (const p of PEERS[c]) if (grid[p] === grid[c]) { bad.add(c); bad.add(p); }
  }
  return [...bad];
}

// ---------------------------------------------------------------------------
// Backtracking-Solver (für Lösungsprüfung, Eindeutigkeit und Fehlererkennung)

/** Zählt Lösungen bis maximal `limit`. Gibt {count, solution} zurück. */
export function solve(grid, limit = 2) {
  const g = grid.slice();
  if (findConflicts(g).length) return { count: 0, solution: null };
  const rowM = new Array(9).fill(0), colM = new Array(9).fill(0), boxM = new Array(9).fill(0);
  for (let c = 0; c < 81; c++) {
    if (g[c]) {
      const b = 1 << g[c];
      rowM[row(c)] |= b; colM[col(c)] |= b; boxM[box(c)] |= b;
    }
  }
  let count = 0, solution = null;
  function rec() {
    let best = -1, bestMask = 0, bestN = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      const m = ALL & ~(rowM[row(c)] | colM[col(c)] | boxM[box(c)]);
      const n = popcount(m);
      if (n < bestN) { best = c; bestMask = m; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) {
      count++;
      if (!solution) solution = g.slice();
      return count >= limit;
    }
    if (bestN === 0) return false;
    const r = row(best), k = col(best), x = box(best);
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      if (!(bestMask & b)) continue;
      g[best] = d; rowM[r] |= b; colM[k] |= b; boxM[x] |= b;
      if (rec()) return true;
      g[best] = 0; rowM[r] &= ~b; colM[k] &= ~b; boxM[x] &= ~b;
    }
    return false;
  }
  rec();
  return { count, solution };
}

// ---------------------------------------------------------------------------
// Menschliche Techniken. Jede Funktion gibt einen Schritt zurück oder null.
// Ein Schritt:
// {
//   technique, title,          // interner Name und deutscher Titel
//   hint,                      // vager Tipp (Stufe 1)
//   text,                      // vollständige Erklärung (Stufe 2)
//   place: [{cell, digit}],    // zu setzende Ziffern
//   eliminate: [{cell, digit}],// zu streichende Kandidaten
//   focus: [cells],            // grob hervorzuhebender Bereich (Stufe 1)
//   cells: [cells],            // beteiligte Zellen (Stufe 2)
//   keyCands: [{cell, digit}], // Kandidaten, die das Muster bilden
// }

function fullHouse(grid, cands) {
  for (const u of UNITS) {
    const empty = u.cells.filter(c => !grid[c]);
    if (empty.length !== 1) continue;
    const c = empty[0];
    if (popcount(cands[c]) !== 1) continue;
    const d = digitsOf(cands[c])[0];
    return {
      technique: 'full-house',
      title: 'Letzte freie Zelle',
      hint: `${unitName(u)} ist fast voll – dort fehlt nur noch eine Ziffer.`,
      text: `${unitName(u)} hat nur noch eine freie Zelle (${cellName(c)}). Die einzige Ziffer, die dort noch fehlt, ist die ${d}.`,
      place: [{ cell: c, digit: d }], eliminate: [],
      focus: u.cells, cells: [c], keyCands: [{ cell: c, digit: d }],
    };
  }
  return null;
}

function hiddenSingle(grid, cands, types) {
  for (const u of UNITS) {
    if (!types.includes(u.type)) continue;
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      if (u.cells.some(c => grid[c] === d)) continue;
      const spots = u.cells.filter(c => cands[c] & b);
      if (spots.length !== 1) continue;
      const c = spots[0];
      // Welche gesetzten Ziffern blockieren die anderen Zellen? (für die Hervorhebung)
      const blockers = new Set();
      for (const o of u.cells) {
        if (o === c || grid[o]) continue;
        const blocker = PEERS[o].find(p => grid[p] === d);
        if (blocker !== undefined) blockers.add(blocker);
      }
      return {
        technique: 'hidden-single',
        title: 'Versteckter Einer (Hidden Single)',
        hint: `Suche die ${d} ${unitNameDat(u)}.`,
        text: `${unitName(u)} braucht noch eine ${d}. In allen anderen freien Zellen ${unitNameDat(u).replace('in ', 'von ')} ist die ${d} unmöglich` +
          (blockers.size ? ` (blockiert durch die ${d} in ${cellList([...blockers])})` : '') +
          `. Also muss die ${d} nach ${cellName(c)}.`,
        place: [{ cell: c, digit: d }], eliminate: [],
        focus: u.cells, cells: [c, ...blockers], keyCands: [{ cell: c, digit: d }],
      };
    }
  }
  return null;
}

function nakedSingle(grid, cands) {
  for (let c = 0; c < 81; c++) {
    if (grid[c] || popcount(cands[c]) !== 1) continue;
    const d = digitsOf(cands[c])[0];
    return {
      technique: 'naked-single',
      title: 'Einziger Kandidat (Naked Single)',
      hint: `Schau dir ${cellName(c)} genau an: Welche Ziffern sind dort überhaupt noch möglich?`,
      text: `In ${cellName(c)} sind alle Ziffern außer der ${d} ausgeschlossen – durch Zeile ${row(c) + 1}, Spalte ${col(c) + 1} und Block ${box(c) + 1}` +
        ` (bzw. bereits gestrichene Kandidaten). Also kommt dort die ${d} hin.`,
      place: [{ cell: c, digit: d }], eliminate: [],
      focus: [c], cells: [c], keyCands: [{ cell: c, digit: d }],
    };
  }
  return null;
}

function lockedCandidates(grid, cands) {
  // Typ 1 (Pointing): Kandidaten eines Blocks liegen alle in einer Zeile/Spalte.
  for (let bi = 0; bi < 9; bi++) {
    const bu = UNITS[bi];
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const spots = bu.cells.filter(c => cands[c] & b);
      if (spots.length < 2) continue;
      for (const lineType of ['row', 'col']) {
        const f = lineType === 'row' ? row : col;
        if (!spots.every(c => f(c) === f(spots[0]))) continue;
        const line = (lineType === 'row' ? ROWS : COLS)[f(spots[0])];
        const elim = line.filter(c => box(c) !== bi && (cands[c] & b));
        if (!elim.length) continue;
        const lu = { type: lineType, index: f(spots[0]) };
        return {
          technique: 'pointing',
          title: 'Blockade (Pointing)',
          hint: `Schau dir die ${d} in Block ${bi + 1} an – wo kann sie dort überhaupt stehen?`,
          text: `In Block ${bi + 1} kann die ${d} nur in ${cellList(spots)} stehen. Die liegen alle in ${unitName(lu)}. ` +
            `Egal welche davon es wird: die ${d} von ${unitName(lu)} liegt in Block ${bi + 1}. ` +
            `Also kann die ${d} in ${cellList(elim)} gestrichen werden.`,
          place: [], eliminate: elim.map(cell => ({ cell, digit: d })),
          focus: bu.cells, cells: [...spots, ...elim], keyCands: spots.map(cell => ({ cell, digit: d })),
        };
      }
    }
  }
  // Typ 2 (Claiming): Kandidaten einer Zeile/Spalte liegen alle in einem Block.
  for (let ui = 9; ui < 27; ui++) {
    const lu = UNITS[ui];
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const spots = lu.cells.filter(c => cands[c] & b);
      if (spots.length < 2) continue;
      const bi = box(spots[0]);
      if (!spots.every(c => box(c) === bi)) continue;
      const elim = BOXES[bi].filter(c => !lu.cells.includes(c) && (cands[c] & b));
      if (!elim.length) continue;
      return {
        technique: 'claiming',
        title: 'Reihe-Block-Prüfung (Claiming)',
        hint: `Schau dir die ${d} ${unitNameDat(lu)} an – wo kann sie dort überhaupt stehen?`,
        text: `${unitName(lu)} kann die ${d} nur in ${cellList(spots)} bekommen – alle in Block ${bi + 1}. ` +
          `Damit ist die ${d} von Block ${bi + 1} in ${unitName(lu)} „reserviert“. ` +
          `Also kann die ${d} in den übrigen Zellen des Blocks gestrichen werden: ${cellList(elim)}.`,
        place: [], eliminate: elim.map(cell => ({ cell, digit: d })),
        focus: lu.cells, cells: [...spots, ...elim], keyCands: spots.map(cell => ({ cell, digit: d })),
      };
    }
  }
  return null;
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

const SUBSET_NAMES = { 2: 'Paar', 3: 'Dreier', 4: 'Vierer' };
const SUBSET_EN = { 2: 'Pair', 3: 'Triple', 4: 'Quad' };

function nakedSubset(grid, cands, n) {
  for (const u of UNITS) {
    const empty = u.cells.filter(c => !grid[c]);
    const pool = empty.filter(c => { const p = popcount(cands[c]); return p >= 2 && p <= n; });
    if (pool.length < n || empty.length <= n) continue;
    for (const combo of combinations(pool, n)) {
      const mask = combo.reduce((m, c) => m | cands[c], 0);
      if (popcount(mask) !== n) continue;
      const elim = [];
      for (const c of empty) {
        if (combo.includes(c)) continue;
        for (const d of digitsOf(cands[c] & mask)) elim.push({ cell: c, digit: d });
      }
      if (!elim.length) continue;
      const ds = digitsOf(mask);
      return {
        technique: `naked-${n}`,
        title: `Nacktes ${SUBSET_NAMES[n]} (Naked ${SUBSET_EN[n]})`,
        hint: `${unitName(u)}: ${n} Zellen teilen sich genau ${n} Kandidaten.`,
        text: `In ${unitName(u)} kommen in ${cellList(combo)} nur die Ziffern ${digitList(ds)} vor. ` +
          `${n} Zellen, ${n} Ziffern – diese Ziffern müssen also genau auf diese Zellen verteilt werden. ` +
          `Darum können ${digitList(ds)} aus den anderen Zellen ${unitNameDat(u).replace('in ', 'von ')} gestrichen werden: ` +
          `${list(elim.map(e => `${e.digit} in ${cellName(e.cell)}`))}.`,
        place: [], eliminate: elim,
        focus: u.cells, cells: [...combo, ...new Set(elim.map(e => e.cell))],
        keyCands: combo.flatMap(c => digitsOf(cands[c]).map(digit => ({ cell: c, digit }))),
      };
    }
  }
  return null;
}

function hiddenSubset(grid, cands, n) {
  for (const u of UNITS) {
    const empty = u.cells.filter(c => !grid[c]);
    if (empty.length <= n) continue;
    const digits = [];
    for (let d = 1; d <= 9; d++) {
      const cnt = empty.filter(c => cands[c] & (1 << d)).length;
      if (cnt >= 1 && cnt <= n) digits.push(d);
    }
    if (digits.length < n) continue;
    for (const combo of combinations(digits, n)) {
      const dmask = combo.reduce((m, d) => m | (1 << d), 0);
      const cells = empty.filter(c => cands[c] & dmask);
      if (cells.length !== n) continue;
      const elim = [];
      for (const c of cells) for (const d of digitsOf(cands[c] & ~dmask)) elim.push({ cell: c, digit: d });
      if (!elim.length) continue;
      return {
        technique: `hidden-${n}`,
        title: `Verstecktes ${SUBSET_NAMES[n]} (Hidden ${SUBSET_EN[n]})`,
        hint: `${unitName(u)}: Die Ziffern ${digitList(combo)} passen nur in wenige Zellen.`,
        text: `In ${unitName(u)} können die Ziffern ${digitList(combo)} nur in ${cellList(cells)} stehen. ` +
          `${n} Ziffern für ${n} Zellen – diese Zellen sind damit für ${digitList(combo)} reserviert. ` +
          `Alle anderen Kandidaten in diesen Zellen können gestrichen werden: ` +
          `${list(elim.map(e => `${e.digit} in ${cellName(e.cell)}`))}.`,
        place: [], eliminate: elim,
        focus: u.cells, cells,
        keyCands: cells.flatMap(c => digitsOf(cands[c] & dmask).map(digit => ({ cell: c, digit }))),
      };
    }
  }
  return null;
}

const FISH_NAMES = { 2: 'X-Wing', 3: 'Swordfish', 4: 'Jellyfish' };

function fish(grid, cands, n) {
  for (let d = 1; d <= 9; d++) {
    const b = 1 << d;
    for (const orient of ['row', 'col']) {
      const base = orient === 'row' ? ROWS : COLS;
      const cover = orient === 'row' ? COLS : ROWS;
      const crossOf = orient === 'row' ? col : row;
      const lines = [];
      for (let i = 0; i < 9; i++) {
        const spots = base[i].filter(c => cands[c] & b);
        if (spots.length >= 2 && spots.length <= n) lines.push({ i, spots });
      }
      if (lines.length < n) continue;
      for (const combo of combinations(lines, n)) {
        const crossSet = new Set(combo.flatMap(l => l.spots.map(crossOf)));
        if (crossSet.size !== n) continue;
        const baseIdx = new Set(combo.map(l => l.i));
        const elim = [];
        for (const k of crossSet) {
          for (const c of cover[k]) {
            const bi = orient === 'row' ? row(c) : col(c);
            if (!baseIdx.has(bi) && (cands[c] & b)) elim.push({ cell: c, digit: d });
          }
        }
        if (!elim.length) continue;
        const baseName = orient === 'row' ? 'Zeilen' : 'Spalten';
        const coverName = orient === 'row' ? 'Spalten' : 'Zeilen';
        const baseNums = [...baseIdx].sort().map(i => i + 1);
        const coverNums = [...crossSet].sort().map(i => i + 1);
        const spots = combo.flatMap(l => l.spots);
        return {
          technique: `fish-${n}`,
          title: FISH_NAMES[n],
          hint: `Achte auf die ${d}: In ${n} ${baseName} gibt es nur wenige Plätze für sie.`,
          text: `In den ${baseName} ${digitList(baseNums)} kann die ${d} jeweils nur in den ${coverName} ${digitList(coverNums)} stehen. ` +
            `Diese ${n} ${baseName} brauchen also ihre ${n} Ziffern ${d} genau in diesen ${n} ${coverName}. ` +
            `Darum kann die ${d} in den ${coverName} ${digitList(coverNums)} sonst nirgends stehen – streiche sie in ${cellList(elim.map(e => e.cell))}.`,
          place: [], eliminate: elim,
          focus: spots, cells: [...spots, ...elim.map(e => e.cell)],
          keyCands: spots.map(cell => ({ cell, digit: d })),
        };
      }
    }
  }
  return null;
}

function xyWing(grid, cands) {
  const bivalue = [];
  for (let c = 0; c < 81; c++) if (!grid[c] && popcount(cands[c]) === 2) bivalue.push(c);
  for (const pivot of bivalue) {
    const [x, y] = digitsOf(cands[pivot]);
    const wings = bivalue.filter(c => sees(pivot, c));
    for (const a of wings) {
      if (!(cands[a] & (1 << x)) || (cands[a] & (1 << y))) continue;
      const z = digitsOf(cands[a] & ~(1 << x))[0];
      for (const bc of wings) {
        if (bc === a) continue;
        if (cands[bc] !== ((1 << y) | (1 << z))) continue;
        const elim = [];
        for (let c = 0; c < 81; c++) {
          if (c === pivot || c === a || c === bc || grid[c]) continue;
          if ((cands[c] & (1 << z)) && sees(c, a) && sees(c, bc)) elim.push({ cell: c, digit: z });
        }
        if (!elim.length) continue;
        return {
          technique: 'xy-wing',
          title: 'XY-Wing',
          hint: `Suche drei Zellen mit je zwei Kandidaten, die sich gegenseitig „sehen“ – eine davon ist ${cellName(pivot)}.`,
          text: `${cellName(pivot)} hat nur ${x} oder ${y}. ${cellName(a)} (${x}/${z}) und ${cellName(bc)} (${y}/${z}) sehen beide ${cellName(pivot)}. ` +
            `Ist ${cellName(pivot)} = ${x}, dann ist ${cellName(a)} = ${z}. Ist ${cellName(pivot)} = ${y}, dann ist ${cellName(bc)} = ${z}. ` +
            `In jedem Fall steht in ${cellName(a)} oder ${cellName(bc)} eine ${z}. Jede Zelle, die beide sieht, kann also keine ${z} sein: ` +
            `streiche die ${z} in ${cellList(elim.map(e => e.cell))}.`,
          place: [], eliminate: elim,
          focus: [pivot, a, bc], cells: [pivot, a, bc, ...elim.map(e => e.cell)],
          keyCands: [pivot, a, bc].flatMap(c => digitsOf(cands[c]).map(digit => ({ cell: c, digit }))),
        };
      }
    }
  }
  return null;
}

function xyzWing(grid, cands) {
  for (let pivot = 0; pivot < 81; pivot++) {
    if (grid[pivot] || popcount(cands[pivot]) !== 3) continue;
    const wings = PEERS[pivot].filter(c => !grid[c] && popcount(cands[c]) === 2 && (cands[c] & ~cands[pivot]) === 0);
    for (const [a, bc] of combinations(wings, 2)) {
      if ((cands[a] | cands[bc]) !== cands[pivot] || cands[a] === cands[bc]) continue;
      const zm = cands[a] & cands[bc];
      if (popcount(zm) !== 1) continue;
      const z = digitsOf(zm)[0];
      const elim = [];
      for (let c = 0; c < 81; c++) {
        if (c === pivot || c === a || c === bc || grid[c]) continue;
        if ((cands[c] & zm) && sees(c, pivot) && sees(c, a) && sees(c, bc)) elim.push({ cell: c, digit: z });
      }
      if (!elim.length) continue;
      return {
        technique: 'xyz-wing',
        title: 'XYZ-Wing',
        hint: `${cellName(pivot)} hat drei Kandidaten – zwei Nachbarzellen mit je zwei davon bilden ein Muster.`,
        text: `${cellName(pivot)} (${digitList(digitsOf(cands[pivot]))}), ${cellName(a)} (${digitList(digitsOf(cands[a]))}) und ${cellName(bc)} (${digitList(digitsOf(cands[bc]))}) ` +
          `teilen sich drei Ziffern. Wie man es auch verteilt: Eine dieser drei Zellen enthält die ${z}. ` +
          `Zellen, die alle drei sehen, können daher keine ${z} sein: streiche die ${z} in ${cellList(elim.map(e => e.cell))}.`,
        place: [], eliminate: elim,
        focus: [pivot, a, bc], cells: [pivot, a, bc, ...elim.map(e => e.cell)],
        keyCands: [pivot, a, bc].flatMap(c => digitsOf(cands[c]).map(digit => ({ cell: c, digit }))),
      };
    }
  }
  return null;
}

// Starke Verbindung für Ziffer d: eine Einheit, in der d nur noch in genau zwei Zellen möglich ist.
function strongLinks(cands, d) {
  const b = 1 << d;
  const links = new Map(); // cell -> [{other, unit}]
  for (const u of UNITS) {
    const spots = u.cells.filter(c => cands[c] & b);
    if (spots.length !== 2) continue;
    const [p, q] = spots;
    for (const [x, y] of [[p, q], [q, p]]) {
      if (!links.has(x)) links.set(x, []);
      if (!links.get(x).some(l => l.other === y)) links.get(x).push({ other: y, unit: u });
    }
  }
  return links;
}

/** X-Chain: Kette aus abwechselnd starken und schwachen Verbindungen für eine Ziffer. */
function xChain(grid, cands, minStrong, maxStrong) {
  for (let len = minStrong; len <= maxStrong; len++) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const links = strongLinks(cands, d);
      const candCells = [];
      for (let c = 0; c < 81; c++) if (cands[c] & b) candCells.push(c);
      // chain: [{cell, via}] – Zellen abwechselnd: start(falsch) =stark=> wahr -schwach-> falsch =stark=> wahr ...
      const found = (chain) => {
        const start = chain[0].cell, end = chain[chain.length - 1].cell;
        const elim = candCells.filter(c => !chain.some(e => e.cell === c) && sees(c, start) && sees(c, end))
          .map(cell => ({ cell, digit: d }));
        return elim.length ? elim : null;
      };
      const dfs = (chain, used, strongCount) => {
        const last = chain[chain.length - 1].cell;
        // last ist "wahr" (am Ende einer starken Verbindung)
        if (strongCount === len) {
          const elim = found(chain);
          return elim ? { chain, elim } : null;
        }
        // schwache Verbindung zu einer Zelle, die last sieht, dann starke Verbindung weiter
        for (const next of candCells) {
          if (used.has(next) || !sees(last, next)) continue;
          for (const l of links.get(next) || []) {
            if (used.has(l.other)) continue;
            used.add(next); used.add(l.other);
            chain.push({ cell: next, weak: true }, { cell: l.other, unit: l.unit });
            const r = dfs(chain, used, strongCount + 1);
            if (r) return r;
            chain.pop(); chain.pop();
            used.delete(next); used.delete(l.other);
          }
        }
        return null;
      };
      for (const [start, ls] of links) {
        for (const l of ls) {
          const used = new Set([start, l.other]);
          const r = dfs([{ cell: start }, { cell: l.other, unit: l.unit }], used, 1);
          if (!r) continue;
          const { chain, elim } = r;
          const s = chain[0].cell, e = chain[chain.length - 1].cell;
          const steps = [];
          for (let i = 1; i < chain.length; i++) {
            const prev = cellName(chain[i - 1].cell), cur = cellName(chain[i].cell);
            if (chain[i].weak) steps.push(`dann ist ${cur} keine ${d} (sieht ${prev})`);
            else steps.push(`dann ist ${cur} eine ${d} (einzige andere Stelle ${unitNameDat(chain[i].unit)})`);
          }
          const name = len === 2 ? 'Wolkenkratzer / Drachen (Skyscraper / Kite)' : 'X-Kette (X-Chain)';
          return {
            technique: len === 2 ? 'turbot' : 'x-chain',
            title: name,
            hint: `Verfolge die ${d}: Von ${cellName(s)} führt eine Kette bis ${cellName(e)}.`,
            text: `Angenommen, ${cellName(s)} ist keine ${d}: ${steps.join(', ')}. ` +
              `Also ist ${cellName(s)} oder ${cellName(e)} eine ${d} – mindestens eine von beiden. ` +
              `Zellen, die beide sehen, können keine ${d} sein: streiche die ${d} in ${cellList(elim.map(x => x.cell))}.`,
            place: [], eliminate: elim,
            focus: chain.map(x => x.cell), cells: [...chain.map(x => x.cell), ...elim.map(x => x.cell)],
            keyCands: chain.map(x => ({ cell: x.cell, digit: d })),
          };
        }
      }
    }
  }
  return null;
}

/** XY-Chain: Kette aus Zellen mit je zwei Kandidaten. */
function xyChain(grid, cands, maxLen) {
  const bivalue = [];
  for (let c = 0; c < 81; c++) if (!grid[c] && popcount(cands[c]) === 2) bivalue.push(c);
  for (let len = 4; len <= maxLen; len++) {
    for (const start of bivalue) {
      for (const z of digitsOf(cands[start])) {
        const first = digitsOf(cands[start] & ~(1 << z))[0];
        // chain-Einträge: {cell, out} – out = Ziffer, die in dieser Zelle steht, wenn start ≠ z
        const chain = [{ cell: start, out: first }];
        const used = new Set([start]);
        const dfs = () => {
          const last = chain[chain.length - 1];
          if (chain.length === len) {
            if (last.out !== z) return null;
            const e = last.cell;
            const elim = [];
            for (let c = 0; c < 81; c++) {
              if (used.has(c) || grid[c]) continue;
              if ((cands[c] & (1 << z)) && sees(c, start) && sees(c, e)) elim.push({ cell: c, digit: z });
            }
            return elim.length ? elim : null;
          }
          const inD = last.out;
          for (const nx of bivalue) {
            if (used.has(nx) || !sees(last.cell, nx) || !(cands[nx] & (1 << inD))) continue;
            const out = digitsOf(cands[nx] & ~(1 << inD))[0];
            used.add(nx); chain.push({ cell: nx, out, inD });
            const r = dfs();
            if (r) return r;
            chain.pop(); used.delete(nx);
          }
          return null;
        };
        const elim = dfs();
        if (!elim) continue;
        const e = chain[chain.length - 1].cell;
        const steps = chain.slice(1).map(x => `${cellName(x.cell)} keine ${x.inD} → ${x.out}`);
        return {
          technique: 'xy-chain',
          title: 'XY-Kette (XY-Chain)',
          hint: `Zellen mit je zwei Kandidaten bilden eine Kette von ${cellName(start)} bis ${cellName(e)}.`,
          text: `Angenommen, ${cellName(start)} ist keine ${z}, dann ist sie ${first}. Daraus folgt: ${steps.join(', ')}. ` +
            `Am Ende ist ${cellName(e)} eine ${z}. Also ist ${cellName(start)} oder ${cellName(e)} eine ${z}. ` +
            `Zellen, die beide sehen, können keine ${z} sein: streiche die ${z} in ${cellList(elim.map(x => x.cell))}.`,
          place: [], eliminate: elim,
          focus: chain.map(x => x.cell), cells: [...chain.map(x => x.cell), ...elim.map(x => x.cell)],
          keyCands: chain.flatMap(x => digitsOf(cands[x.cell]).map(digit => ({ cell: x.cell, digit }))),
        };
      }
    }
  }
  return null;
}

/** Unique Rectangle Typ 1 – nur gültig, wenn das Rätsel eindeutig lösbar ist. */
function uniqueRectangle(grid, cands) {
  for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) {
    for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
      const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (new Set(cells.map(box)).size !== 2) continue;
      if (cells.some(c => grid[c])) continue;
      const pairs = cells.filter(c => popcount(cands[c]) === 2);
      if (pairs.length !== 3 || new Set(pairs.map(c => cands[c])).size !== 1) continue;
      const m = cands[pairs[0]];
      const extra = cells.find(c => !pairs.includes(c));
      if ((cands[extra] & m) !== m) continue;
      const [a, b] = digitsOf(m);
      return {
        technique: 'unique-rectangle',
        title: 'Eindeutiges Rechteck (Unique Rectangle)',
        hint: `Vier Zellen bilden ein Rechteck mit den Kandidaten ${a} und ${b}.`,
        text: `${cellList(pairs)} enthalten nur ${a}/${b}. Wäre auch ${cellName(extra)} nur ${a} oder ${b}, ` +
          `könnte man ${a} und ${b} im Rechteck vertauschen – das Sudoku hätte zwei Lösungen. ` +
          `Da es eindeutig ist, kann ${cellName(extra)} weder ${a} noch ${b} sein: streiche beide dort.`,
        place: [], eliminate: [{ cell: extra, digit: a }, { cell: extra, digit: b }],
        focus: cells, cells,
        keyCands: pairs.flatMap(c => [a, b].map(digit => ({ cell: c, digit }))),
      };
    }
  }
  return null;
}

export const TECHNIQUES = [
  { name: 'Letzte freie Zelle', fn: fullHouse },
  { name: 'Versteckter Einer im Block', fn: (g, c) => hiddenSingle(g, c, ['box']) },
  { name: 'Versteckter Einer in Zeile/Spalte', fn: (g, c) => hiddenSingle(g, c, ['row', 'col']) },
  { name: 'Einziger Kandidat', fn: nakedSingle },
  { name: 'Blockade / Claiming', fn: lockedCandidates },
  { name: 'Nacktes Paar', fn: (g, c) => nakedSubset(g, c, 2) },
  { name: 'Verstecktes Paar', fn: (g, c) => hiddenSubset(g, c, 2) },
  { name: 'Nackter Dreier', fn: (g, c) => nakedSubset(g, c, 3) },
  { name: 'Versteckter Dreier', fn: (g, c) => hiddenSubset(g, c, 3) },
  { name: 'X-Wing', fn: (g, c) => fish(g, c, 2) },
  { name: 'XY-Wing', fn: xyWing },
  { name: 'XYZ-Wing', fn: xyzWing },
  { name: 'Skyscraper / Kite', fn: (g, c) => xChain(g, c, 2, 2) },
  { name: 'Swordfish', fn: (g, c) => fish(g, c, 3) },
  { name: 'Unique Rectangle', fn: uniqueRectangle, needsUnique: true },
  { name: 'Nackter Vierer', fn: (g, c) => nakedSubset(g, c, 4) },
  { name: 'Versteckter Vierer', fn: (g, c) => hiddenSubset(g, c, 4) },
  { name: 'Jellyfish', fn: (g, c) => fish(g, c, 4) },
  { name: 'X-Kette', fn: (g, c) => xChain(g, c, 3, 4) },
  { name: 'XY-Kette', fn: (g, c) => xyChain(g, c, 8) },
];

/**
 * Findet den nächsten sinnvollen Schritt.
 * @param grid aktuelles Gitter
 * @param elim gestrichene Kandidaten (Bitmasken)
 * @param solution bekannte Lösung (optional) – zum Erkennen von Fehlern
 * @param givens Bool-Array: welche Zellen vorgegeben sind
 */
export function nextStep(grid, elim, solution, givens) {
  const conflicts = findConflicts(grid);
  if (conflicts.length) {
    return {
      technique: 'conflict', title: 'Widerspruch',
      hint: 'Es gibt doppelte Ziffern in einer Zeile, Spalte oder einem Block.',
      text: `Diese Zellen widersprechen sich: ${cellList(conflicts)}. Bitte korrigiere sie zuerst.`,
      place: [], eliminate: [], focus: conflicts, cells: conflicts, keyCands: [], error: true,
    };
  }
  if (solution) {
    const wrong = [];
    for (let c = 0; c < 81; c++) {
      if (grid[c] && !(givens && givens[c]) && grid[c] !== solution[c]) wrong.push(c);
    }
    if (wrong.length) {
      return {
        technique: 'mistake', title: 'Fehler gefunden',
        hint: 'Mindestens eine eingetragene Ziffer ist falsch.',
        text: `Die Ziffer in ${cellList(wrong)} passt nicht zur Lösung. Lösche sie und versuch es nochmal.`,
        place: [], eliminate: [], focus: wrong, cells: wrong, keyCands: [], error: true, wrong,
      };
    }
  }
  const cands = computeCandidates(grid, elim);
  if (solution) {
    const lost = [];
    for (let c = 0; c < 81; c++) {
      if (!grid[c] && !(cands[c] & (1 << solution[c]))) lost.push(c);
    }
    if (lost.length) {
      return {
        technique: 'lost-candidate', title: 'Zu viel gestrichen',
        hint: 'Ein richtiger Kandidat wurde versehentlich gestrichen.',
        text: `In ${cellList(lost)} wurde die richtige Ziffer als Kandidat gestrichen. Die Kandidaten dort werden wiederhergestellt.`,
        place: [], eliminate: [], restore: lost, focus: lost, cells: lost, keyCands: [], error: true,
      };
    }
  }
  for (let c = 0; c < 81; c++) {
    if (!grid[c] && cands[c] === 0) {
      return {
        technique: 'dead-cell', title: 'Sackgasse',
        hint: `In ${cellName(c)} ist keine Ziffer mehr möglich.`,
        text: `In ${cellName(c)} ist keine Ziffer mehr möglich – irgendwo vorher ist ein Fehler passiert.`,
        place: [], eliminate: [], focus: [c], cells: [c], keyCands: [], error: true,
      };
    }
  }
  if (grid.every(v => v)) {
    return {
      technique: 'solved', title: 'Gelöst! 🎉', hint: 'Das Sudoku ist vollständig gelöst.',
      text: 'Alle Felder sind ausgefüllt. Glückwunsch!', place: [], eliminate: [], focus: [], cells: [], keyCands: [],
    };
  }
  for (const t of TECHNIQUES) {
    if (t.needsUnique && !solution) continue;
    const step = t.fn(grid, cands);
    if (step) return step;
  }
  // Keine bekannte Technik greift: Zelle aus der Lösung verraten.
  if (solution) {
    let best = -1, bestN = 10;
    for (let c = 0; c < 81; c++) {
      if (grid[c]) continue;
      const n = popcount(cands[c]);
      if (n < bestN) { best = c; bestN = n; }
    }
    const d = solution[best];
    return {
      technique: 'reveal', title: 'Lösung verraten',
      hint: 'Hier hilft keine der eingebauten Techniken mehr weiter.',
      text: `Für diese Stelle bräuchte man sehr fortgeschrittene Techniken (z. B. Ketten). Als Abkürzung: In ${cellName(best)} steht die ${d}.`,
      place: [{ cell: best, digit: d }], eliminate: [], focus: [best], cells: [best], keyCands: [{ cell: best, digit: d }],
    };
  }
  return null;
}

/** Löst ein Sudoku nur mit den eingebauten Techniken; liefert die Liste der Schritte. */
export function solveLogically(grid, { assumeUnique = true, maxSteps = 500 } = {}) {
  const g = grid.slice();
  const elim = new Array(81).fill(0);
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    if (g.every(v => v)) return { solved: true, steps, grid: g };
    const cands = computeCandidates(g, elim);
    let step = null;
    for (const t of TECHNIQUES) {
      if (t.needsUnique && !assumeUnique) continue;
      step = t.fn(g, cands);
      if (step) break;
    }
    if (!step) return { solved: false, steps, grid: g };
    applyStep(g, elim, step);
    steps.push(step);
  }
  return { solved: false, steps, grid: g };
}

export function applyStep(grid, elim, step) {
  for (const { cell, digit } of step.place) grid[cell] = digit;
  for (const { cell, digit } of step.eliminate) elim[cell] |= 1 << digit;
}

/** Parst eine Zeichenkette mit 81 Zeichen (0 oder . für leer). */
export function parseGrid(str) {
  const chars = str.replace(/[^0-9.]/g, '');
  if (chars.length !== 81) throw new Error('Erwarte 81 Zeichen');
  return [...chars].map(ch => (ch === '.' ? 0 : Number(ch)));
}
export function gridToString(grid) { return grid.map(v => v || '.').join(''); }
