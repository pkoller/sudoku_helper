// Bilderkennung: Sudoku-Gitter im Foto finden, entzerren und Ziffern erkennen.
// Reines JavaScript, arbeitet auf Graustufen-Arrays. Kein OpenCV nötig.

export const CELL = 40;           // Pixel pro Zelle im entzerrten Bild
export const SIZE = CELL * 9;     // Kantenlänge des entzerrten Bildes
const FEAT = 16;                  // Kantenlänge des Merkmalsbildes einer Ziffer

export function toGray(imageData) {
  const { data, width, height } = imageData;
  const g = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }
  return g;
}

/** Adaptiver Schwellwert: 1 = dunkel (Tinte), 0 = hell. */
export function adaptiveThreshold(gray, w, h, radius, offset) {
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + rowSum;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const sum = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean - offset ? 1 : 0;
    }
  }
  return out;
}

/** Zusammenhängende Komponenten (8er-Nachbarschaft). */
export function components(bin, w, h) {
  const labels = new Int32Array(w * h);
  const comps = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let i = 0; i < w * h; i++) {
    if (!bin[i] || labels[i]) continue;
    const id = next++;
    let sp = 0, count = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    stack[sp++] = i; labels[i] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (bin[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; }
        }
      }
    }
    comps.push({ id, count, minX, minY, maxX, maxY });
  }
  return { labels, comps };
}

/** Findet die vier Ecken des Sudoku-Gitters (größte zusammenhängende Linienstruktur). */
export function findGrid(gray, w, h) {
  const radius = Math.max(5, Math.round(Math.min(w, h) / 40));
  const bin = adaptiveThreshold(gray, w, h, radius, 6);
  const { labels, comps } = components(bin, w, h);
  const minSide = Math.min(w, h) * 0.2;
  const cands = comps.filter(c => {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (bw < minSide || bh < minSide) return false;
    const aspect = bw / bh;
    if (aspect < 0.4 || aspect > 2.5) return false;
    // Gitterlinien füllen ihr Rechteck nur dünn; flächige Objekte (Tisch, Schatten) aussortieren.
    return c.count / (bw * bh) < 0.6;
  }).sort((a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY)).slice(0, 6);
  // Der größte Kandidat ist oft der Papierrand – darum jeden auf echte Gitterlinien prüfen.
  let best = null, bestScore = 0.15;
  for (const c of cands) {
    const corners = componentCorners(labels, w, c);
    const score = gridScore(gray, w, h, corners);
    if (score > bestScore) { bestScore = score; best = corners; }
  }
  return best;
}

function componentCorners(labels, w, comp) {
  let tl, tr, bl, br;
  let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  for (let y = comp.minY; y <= comp.maxY; y++) {
    for (let x = comp.minX; x <= comp.maxX; x++) {
      if (labels[y * w + x] !== comp.id) continue;
      const s = x + y, d = x - y;
      if (s < sMin) { sMin = s; tl = [x, y]; }
      if (s > sMax) { sMax = s; br = [x, y]; }
      if (d > dMax) { dMax = d; tr = [x, y]; }
      if (d < dMin) { dMin = d; bl = [x, y]; }
    }
  }
  return [tl, tr, br, bl];
}

/** Wie gut sieht der Bereich wie ein 9×9-Gitter aus? (Linien dunkel, Zellmitten hell) */
export function gridScore(gray, w, h, corners) {
  const cs = 20, size = cs * 9;
  const wg = warp(gray, w, h, corners, size);
  const bin = adaptiveThreshold(wg, size, size, 8, 8);
  let line = 0, mid = 0, n = 0;
  for (let i = 0; i <= 9; i++) {
    const pos = Math.min(size - 1, i * cs);
    for (let t = 0; t < size; t++) {
      // dunkelster Wert in einem schmalen Band um die erwartete Linie
      let hv = 0, vv = 0;
      for (let o = -2; o <= 2; o++) {
        const p = Math.max(0, Math.min(size - 1, pos + o));
        hv |= bin[p * size + t]; vv |= bin[t * size + p];
      }
      line += hv + vv;
      if (i < 9) {
        const m = pos + cs / 2;
        mid += bin[m * size + t] + bin[t * size + m];
      }
      n++;
    }
  }
  return line / (2 * n) - mid / (2 * n * 0.9);
}

/** Homographie, die die Punkte src[i] auf dst[i] abbildet (je 4 Punkte). */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gauß-Elimination
  const n = 8;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let k = i; k < n; k++) A[r][k] -= f * A[i][k];
      b[r] -= f * b[i];
    }
  }
  const hv = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * hv[k];
    hv[i] = s / A[i][i];
  }
  return [...hv, 1];
}

/** Entzerrt den Bereich innerhalb der Ecken zu einem Quadrat SIZE×SIZE (Graustufen). */
export function warp(gray, w, h, corners, size = SIZE) {
  const dst = [[0, 0], [size, 0], [size, size], [0, size]];
  const H = homography(dst, corners); // Ziel -> Quelle
  const out = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const z = H[6] * px + H[7] * py + H[8];
      const sx = (H[0] * px + H[1] * py + H[2]) / z - 0.5;
      const sy = (H[3] * px + H[4] * py + H[5]) / z - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) { out[y * size + x] = 255; continue; }
      const fx = sx - x0, fy = sy - y0;
      const i = y0 * w + x0;
      out[y * size + x] =
        gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) +
        gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy;
    }
  }
  return out;
}

/**
 * Schneidet die Ziffer aus einer Zelle aus. Liefert null für leere Zellen,
 * sonst ein Merkmalsbild (Float32Array FEAT×FEAT) plus Seitenverhältnis.
 */
export function extractDigit(bin, stride, x0, y0, cell) {
  const m = Math.round(cell * 0.1);
  const iw = cell - 2 * m;
  const sub = new Uint8Array(iw * iw);
  for (let y = 0; y < iw; y++) for (let x = 0; x < iw; x++) sub[y * iw + x] = bin[(y0 + m + y) * stride + x0 + m + x];
  const { labels, comps } = components(sub, iw, iw);
  const cx = iw / 2, cy = iw / 2;
  // Komponenten, die zur Ziffer gehören könnten
  const parts = comps.filter(c => {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (c.count < iw * iw * 0.004) return false;                  // Rauschen
    if (bw > iw * 0.9 || bh > iw * 0.95) return false;            // Gitterlinienreste
    const touches = c.minX === 0 || c.minY === 0 || c.maxX === iw - 1 || c.maxY === iw - 1;
    if (touches && (bw < iw * 0.15 || bh < iw * 0.15)) return false;
    return true;
  });
  if (!parts.length) return null;
  // Hauptkomponente: groß und nah an der Mitte
  let main = null, bestScore = -Infinity;
  for (const c of parts) {
    const mx = (c.minX + c.maxX) / 2, my = (c.minY + c.maxY) / 2;
    const dist = Math.hypot(mx - cx, my - cy) / iw;
    const score = c.count / (iw * iw) - dist * 0.3;
    if (score > bestScore) { bestScore = score; main = c; }
  }
  const mh = main.maxY - main.minY + 1;
  if (mh < iw * 0.3) return null;
  const mcx = (main.minX + main.maxX) / 2, mcy = (main.minY + main.maxY) / 2;
  if (Math.abs(mcx - cx) > iw * 0.3 || Math.abs(mcy - cy) > iw * 0.3) return null;
  // Benachbarte Teile (z. B. abgebrochene Striche) hinzunehmen
  const keep = new Set([main.id]);
  let bx0 = main.minX, by0 = main.minY, bx1 = main.maxX, by1 = main.maxY;
  const pad = iw * 0.08;
  for (const c of parts) {
    if (c === main) continue;
    if (c.maxX < bx0 - pad || c.minX > bx1 + pad || c.maxY < by0 - pad || c.minY > by1 + pad) continue;
    keep.add(c.id);
    bx0 = Math.min(bx0, c.minX); by0 = Math.min(by0, c.minY);
    bx1 = Math.max(bx1, c.maxX); by1 = Math.max(by1, c.maxY);
  }
  const mask = new Uint8Array(iw * iw);
  for (let i = 0; i < mask.length; i++) if (keep.has(labels[i])) mask[i] = 1;
  return normalizeGlyph(mask, iw, bx0, by0, bx1, by1);
}

/** Skaliert den Ziffern-Ausschnitt (Seitenverhältnis bleibt) mittig in ein FEAT×FEAT-Feld. */
export function normalizeGlyph(mask, stride, bx0, by0, bx1, by1) {
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
  const scale = (FEAT - 2) / Math.max(bw, bh);
  const tw = bw * scale, th = bh * scale;
  const ox = (FEAT - tw) / 2, oy = (FEAT - th) / 2;
  const feat = new Float32Array(FEAT * FEAT);
  const cover = new Float32Array(FEAT * FEAT);
  // Flächenmittelung: jedes Quellpixel trägt zu seinem Zielpixel bei
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const fx = Math.min(FEAT - 1, Math.floor(ox + (x - bx0 + 0.5) * scale));
      const fy = Math.min(FEAT - 1, Math.floor(oy + (y - by0 + 0.5) * scale));
      const k = fy * FEAT + fx;
      cover[k] += 1;
      feat[k] += mask[y * stride + x];
    }
  }
  for (let k = 0; k < feat.length; k++) if (cover[k]) feat[k] /= cover[k];
  return { feat: blur(feat), aspect: bw / bh };
}

function blur(f) {
  const out = new Float32Array(f.length);
  for (let y = 0; y < FEAT; y++) for (let x = 0; x < FEAT; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || xx < 0 || yy >= FEAT || xx >= FEAT) continue;
      const wgt = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
      s += f[yy * FEAT + xx] * wgt; n += wgt;
    }
    out[y * FEAT + x] = s / n;
  }
  return out;
}

function normalizeVec(f) {
  let mean = 0;
  for (const v of f) mean += v;
  mean /= f.length;
  const out = new Float32Array(f.length);
  let norm = 0;
  for (let i = 0; i < f.length; i++) { out[i] = f[i] - mean; norm += out[i] * out[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < f.length; i++) out[i] /= norm;
  return out;
}

/** Erzeugt Vorlagen für 1–9 aus verschiedenen Schriftarten (braucht Canvas). */
export function buildTemplates(makeCanvas) {
  const fonts = [
    'sans-serif', 'serif', 'monospace', 'Arial', 'Helvetica', 'Verdana', 'Georgia',
    'Times New Roman', 'Courier New', 'Roboto', 'Noto Serif', 'Trebuchet MS', 'Tahoma',
  ];
  const weights = ['normal', 'bold'];
  const size = 64;
  const templates = [];
  const seen = new Set();
  for (const font of fonts) {
    for (const weight of weights) {
      for (let d = 1; d <= 9; d++) {
        const cv = makeCanvas(size, size);
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000';
        ctx.font = `${weight} ${Math.round(size * 0.7)}px "${font}"`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(d), size / 2, size / 2);
        const img = ctx.getImageData(0, 0, size, size);
        const g = toGray(img);
        const mask = new Uint8Array(size * size);
        let x0 = size, y0 = size, x1 = -1, y1 = -1;
        for (let i = 0; i < g.length; i++) {
          if (g[i] < 128) {
            mask[i] = 1;
            const x = i % size, y = (i - x) / size;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
        }
        if (x1 < 0) continue;
        const key = d + ':' + Array.from(mask).join('');
        if (seen.has(key)) continue; // Schriftart nicht vorhanden -> Duplikat
        seen.add(key);
        const { feat, aspect } = normalizeGlyph(mask, size, x0, y0, x1, y1);
        templates.push({ digit: d, vec: normalizeVec(feat), aspect });
      }
    }
  }
  return templates;
}

export function classify(glyph, templates) {
  const v = normalizeVec(glyph.feat);
  const best = new Array(10).fill(-Infinity);
  for (const t of templates) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * t.vec[i];
    s -= Math.abs(Math.log(glyph.aspect / t.aspect)) * 0.25;
    if (s > best[t.digit]) best[t.digit] = s;
  }
  let digit = 1;
  for (let d = 2; d <= 9; d++) if (best[d] > best[digit]) digit = d;
  const sorted = best.slice(1).sort((a, b) => b - a);
  return { digit, score: best[digit], margin: sorted[0] - sorted[1] };
}

/**
 * Komplette Erkennung.
 * @returns {{grid:number[], confidence:number[], corners, warped:Uint8ClampedArray}|null}
 */
export function recognize(imageData, templates, cornersOverride) {
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const corners = cornersOverride || findGrid(gray, w, h);
  if (!corners) return null;
  const warped = warp(gray, w, h, corners);
  const bin = adaptiveThreshold(warped, SIZE, SIZE, Math.round(CELL * 0.6), 12);
  const grid = new Array(81).fill(0);
  const confidence = new Array(81).fill(1);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const glyph = extractDigit(bin, SIZE, c * CELL, r * CELL, CELL);
      if (!glyph) continue;
      const res = classify(glyph, templates);
      grid[r * 9 + c] = res.digit;
      confidence[r * 9 + c] = Math.min(1, res.margin / 0.1);
    }
  }
  return { grid, confidence, corners, warped };
}
