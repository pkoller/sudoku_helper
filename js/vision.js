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
  const m = Math.round(cell * 0.07);
  const iw = cell - 2 * m;
  const sub = new Uint8Array(iw * iw);
  for (let y = 0; y < iw; y++) for (let x = 0; x < iw; x++) sub[y * iw + x] = bin[(y0 + m + y) * stride + x0 + m + x];
  const { labels, comps } = components(sub, iw, iw);
  const cx = iw / 2, cy = iw / 2;
  // Komponenten, die zur Ziffer gehören könnten
  const parts = comps.filter(c => {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (c.count < iw * iw * 0.004) return false;                  // Rauschen
    // Gitterlinienreste: lang, dünn und am Rand (eine „1“ steht dagegen in der Mitte)
    const nearX = Math.min(c.maxX, iw - 1 - c.minX) < iw * 0.25;
    const nearY = Math.min(c.maxY, iw - 1 - c.minY) < iw * 0.25;
    if (bh > iw * 0.6 && bw < iw * 0.2 && nearX) return false;
    if (bw > iw * 0.6 && bh < iw * 0.2 && nearY) return false;
    if (bw > iw * 0.95 && bh > iw * 0.95) return false;
    const touches = c.minX === 0 || c.minY === 0 || c.maxX === iw - 1 || c.maxY === iw - 1;
    if (touches && (bw < iw * 0.15 || bh < iw * 0.15)) return false;
    return true;
  });
  if (!parts.length) return null;
  // Hauptkomponente: groß, hoch und nah an der Mitte. Kleine Notizziffern am Rand verlieren.
  let main = null, bestScore = -Infinity;
  for (const c of parts) {
    const bh = c.maxY - c.minY + 1;
    const mx = (c.minX + c.maxX) / 2, my = (c.minY + c.maxY) / 2;
    const dist = Math.hypot(mx - cx, my - cy) / iw;
    const score = c.count / (iw * iw) + bh / iw * 0.15 - dist * 0.3;
    if (score > bestScore) { bestScore = score; main = c; }
  }
  const mh = main.maxY - main.minY + 1;
  if (mh < iw * 0.3) return null;
  const mcx = (main.minX + main.maxX) / 2, mcy = (main.minY + main.maxY) / 2;
  if (Math.abs(mcx - cx) > iw * 0.3 || Math.abs(mcy - cy) > iw * 0.3) return null;
  // Abgesetzte Striche derselben Ziffer (Querstrich der 5, Teile der 4) hinzunehmen,
  // aber keine kleinen Notizziffern daneben oder darunter.
  const keep = new Set([main.id]);
  let bx0 = main.minX, by0 = main.minY, bx1 = main.maxX, by1 = main.maxY;
  const pad = iw * 0.06;
  let added = true;
  while (added) {
    added = false;
    for (const c of parts) {
      if (keep.has(c.id)) continue;
      if (c.maxX < bx0 - pad || c.minX > bx1 + pad || c.maxY < by0 - pad || c.minY > by1 + pad) continue;
      const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
      const ox = Math.min(c.maxX, bx1) - Math.max(c.minX, bx0) + 1;
      const oy = Math.min(c.maxY, by1 + pad) - Math.max(c.minY, by0 - pad) + 1;
      const tall = bh >= (by1 - by0 + 1) * 0.6;
      if (!tall && (ox < bw * 0.6 || oy < bh * 0.8)) continue;
      keep.add(c.id); added = true;
      bx0 = Math.min(bx0, c.minX); by0 = Math.min(by0, c.minY);
      bx1 = Math.max(bx1, c.maxX); by1 = Math.max(by1, c.maxY);
    }
  }
  const mask = new Uint8Array(iw * iw);
  for (let i = 0; i < mask.length; i++) if (keep.has(labels[i])) mask[i] = 1;
  return makeGlyph(mask, iw, [bx0, by0, bx1, by1]);
}

/**
 * Glyph aus einer Ziffernmaske: Merkmalsvektor, Seitenverhältnis und Strichstärke.
 * Gedruckte Ziffern haben dicke Striche (überstehen eine Erosion), Bleistift-Ziffern dünne.
 */
export function makeGlyph(mask, stride, box) {
  let [bx0, by0, bx1, by1] = box;
  const ink = strokeThickness(mask, stride, box);
  if (ink >= PRINTED_INK) {
    // Gedruckt: dünne Bleistiftstriche (Kreise, Notizen), die die Ziffer berühren, abtrennen.
    const open = opening(mask, stride, box);
    let x0 = stride, y0 = stride, x1 = -1, y1 = -1;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (!open[y * stride + x]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 >= 0 && y1 - y0 + 1 >= (by1 - by0 + 1) * 0.5) { mask = open; [bx0, by0, bx1, by1] = [x0, y0, x1, y1]; }
  }
  const { vec, aspect } = glyphVector(mask, stride, [bx0, by0, bx1, by1]);
  return { vec, aspect, ink, hand: ink < PRINTED_INK, mask, stride, box: [bx0, by0, bx1, by1] };
}

const PRINTED_INK = 0.2;

/** Anteil der Tintenpixel, die eine 3×3-Erosion überstehen (≈ Strichstärke). */
function strokeThickness(mask, stride, [bx0, by0, bx1, by1]) {
  let n = 0, inner = 0;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    if (!mask[y * stride + x]) continue;
    n++;
    if (x > 0 && y > 0 && x < stride - 1 && mask[(y - 1) * stride + x - 1] && mask[(y - 1) * stride + x] &&
      mask[(y - 1) * stride + x + 1] && mask[y * stride + x - 1] && mask[y * stride + x + 1] &&
      mask[(y + 1) * stride + x - 1] && mask[(y + 1) * stride + x] && mask[(y + 1) * stride + x + 1]) inner++;
  }
  return n ? inner / n : 0;
}

/** Morphologisches Öffnen (Erosion, dann Dilatation) mit 3×3 – entfernt dünne Striche. */
function opening(mask, stride, [bx0, by0, bx1, by1]) {
  const rows = mask.length / stride;
  const at = (m, x, y) => x >= 0 && y >= 0 && x < stride && y < rows && m[y * stride + x];
  const ero = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    let all = 1;
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (!at(mask, x + dx, y + dy)) { all = 0; break; }
    ero[y * stride + x] = all;
  }
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    let any = 0;
    for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) if (at(ero, x + dx, y + dy)) { any = 1; break; }
    out[y * stride + x] = any & mask[y * stride + x];
  }
  return out;
}

/**
 * Merkmalsvektor einer Ziffer: Schräglage ausgleichen (Handschrift ist oft geneigt),
 * auf FEAT×FEAT skalieren, dann Pixelbild + Richtungen der Strichkanten kombinieren.
 */
export function glyphVector(mask, stride, box) {
  const { feat, aspect } = deslant(mask, stride, box);
  const pix = normalizeVec(feat), dir = normalizeVec(gradientFeatures(feat));
  const vec = new Float32Array(pix.length + dir.length);
  const wp = Math.sqrt(1 - DIR_WEIGHT), wd = Math.sqrt(DIR_WEIGHT);
  for (let i = 0; i < pix.length; i++) vec[i] = pix[i] * wp;
  for (let i = 0; i < dir.length; i++) vec[pix.length + i] = dir[i] * wd;
  return { vec, aspect };
}

const DIR_WEIGHT = 0.6;

/** Schert die Ziffer so, dass ihre Hauptachse senkrecht steht, und normalisiert sie. */
function deslant(mask, stride, [x0, y0, x1, y1]) {
  let n = 0, mx = 0, my = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * stride + x]) { n++; mx += x; my += y; }
  mx /= n; my /= n;
  let cxy = 0, cyy = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (mask[y * stride + x]) { cxy += (x - mx) * (y - my); cyy += (y - my) ** 2; }
  }
  const k = cyy ? Math.max(-0.6, Math.min(0.6, cxy / cyy)) : 0;
  const bh = y1 - y0 + 1, W = (x1 - x0 + 1) + Math.ceil(bh * 0.6) * 2 + 2, off = Math.ceil(bh * 0.6) + 1;
  const out = new Uint8Array(W * bh);
  let bx0 = W, bx1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!mask[y * stride + x]) continue;
    const nx = Math.round(x - x0 - k * (y - my)) + off;
    out[(y - y0) * W + nx] = 1;
    if (nx < bx0) bx0 = nx; if (nx > bx1) bx1 = nx;
  }
  return normalizeGlyph(out, W, bx0, 0, bx1, bh - 1);
}

/** Richtungen der Kanten (4 Orientierungen) in 4×4 Bereichen des Merkmalsbildes. */
function gradientFeatures(f) {
  const out = new Float32Array(4 * 16);
  for (let y = 1; y < FEAT - 1; y++) for (let x = 1; x < FEAT - 1; x++) {
    const gx = f[y * FEAT + x + 1] - f[y * FEAT + x - 1], gy = f[(y + 1) * FEAT + x] - f[(y - 1) * FEAT + x];
    const mag = Math.hypot(gx, gy);
    if (!mag) continue;
    let a = Math.atan2(gy, gx);
    if (a < 0) a += Math.PI;
    const b = a / Math.PI * 4, b0 = Math.floor(b) % 4, b1 = (b0 + 1) % 4, w1 = b - Math.floor(b);
    const c = (y >> 2) * 4 + (x >> 2);
    out[b0 * 16 + c] += mag * (1 - w1);
    out[b1 * 16 + c] += mag * w1;
  }
  return out;
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

/**
 * Erzeugt Vorlagen für 1–9 aus verschiedenen Schriftarten (braucht Canvas)
 * und aus gelernten Beispielen echter Fotos (Handschrift und Zeitungsdruck, siehe handwriting.js).
 */
export function buildTemplates(makeCanvas, samples = []) {
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
        templates.push({ digit: d, ...glyphVector(mask, size, [x0, y0, x1, y1]) });
      }
    }
  }
  for (const s of samples) {
    const { mask, w, h } = decodeSample(s);
    templates.push({ digit: s.digit, src: s.src, hand: s.hand, ...glyphVector(mask, w, [0, 0, w - 1, h - 1]) });
  }
  return templates;
}

/** Gelernte Beispiele sind als Bitmaske (Base64, zeilenweise) gespeichert. */
export function encodeSample(mask, stride, [x0, y0, x1, y1]) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const bytes = new Uint8Array(Math.ceil(w * h / 8));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[(y0 + y) * stride + x0 + x]) { const i = y * w + x; bytes[i >> 3] |= 128 >> (i & 7); }
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { w, h, bits: btoa(bin) };
}

function decodeSample({ w, h, bits }) {
  const bin = atob(bits);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return { mask, w, h };
}

export function classify(glyph, templates) {
  const v = glyph.vec;
  const best = new Array(10).fill(-Infinity);
  for (const t of templates) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * t.vec[i];
    s -= Math.abs(Math.log(glyph.aspect / t.aspect)) * 0.1;
    if (s > best[t.digit]) best[t.digit] = s;
  }
  let digit = 1;
  for (let d = 2; d <= 9; d++) if (best[d] > best[digit]) digit = d;
  const sorted = best.slice(1).sort((a, b) => b - a);
  return { digit, score: best[digit], margin: sorted[0] - sorted[1], scores: best };
}

/**
 * Doppelte Ziffern in Zeile/Spalte/Block sind fast immer Lesefehler: die unsicherste
 * beteiligte Zelle bekommt ihre nächstbeste Ziffer, wenn die kaum schlechter bewertet ist
 * und keinen neuen Konflikt erzeugt. Klar geschriebene (echte) Fehler bleiben stehen.
 */
function fixConflicts(grid, scores) {
  const peers = c => {
    const r = Math.floor(c / 9), k = c % 9, br = r - r % 3, bc = k - k % 3, out = [];
    for (let i = 0; i < 9; i++) {
      out.push(r * 9 + i, i * 9 + k, (br + Math.floor(i / 3)) * 9 + bc + i % 3);
    }
    return out.filter(p => p !== c);
  };
  const conflicted = () => {
    const set = new Set();
    for (let c = 0; c < 81; c++) if (grid[c] && peers(c).some(p => grid[p] === grid[c])) set.add(c);
    return set;
  };
  for (let iter = 0; iter < 20; iter++) {
    const bad = conflicted();
    if (!bad.size) return;
    let bestCell = -1, bestDigit = 0, bestLoss = MAX_FIX_LOSS;
    for (const c of bad) {
      const s = scores[c];
      for (let d = 1; d <= 9; d++) {
        if (d === grid[c] || peers(c).some(p => grid[p] === d)) continue;
        const loss = s[grid[c]] - s[d];
        if (loss < bestLoss) { bestLoss = loss; bestCell = c; bestDigit = d; }
      }
    }
    if (bestCell < 0) return;
    grid[bestCell] = bestDigit;
  }
}

const MAX_FIX_LOSS = 0.12;

/**
 * Komplette Erkennung.
 * @returns {{grid:number[], hand:boolean[], confidence:number[], corners, warped:Uint8ClampedArray}|null}
 *   hand[i] = true: Ziffer ist (Bleistift-)Handschrift, sonst gedruckt.
 */
export function recognize(imageData, templates, cornersOverride) {
  const { width: w, height: h } = imageData;
  const gray = toGray(imageData);
  const corners = cornersOverride || findGrid(gray, w, h);
  if (!corners) return null;
  const warped = warp(gray, w, h, corners);
  const bin = adaptiveThreshold(warped, SIZE, SIZE, Math.round(CELL * 0.6), 12);
  const grid = new Array(81).fill(0);
  const hand = new Array(81).fill(false);
  const confidence = new Array(81).fill(1);
  const scores = new Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const glyph = extractDigit(bin, SIZE, c * CELL, r * CELL, CELL);
      if (!glyph) continue;
      const res = classify(glyph, templates);
      const i = r * 9 + c;
      grid[i] = res.digit;
      hand[i] = glyph.hand;
      scores[i] = res.scores;
      confidence[i] = Math.min(1, res.margin / 0.1);
    }
  }
  const before = grid.slice();
  fixConflicts(grid, scores);
  for (let i = 0; i < 81; i++) if (grid[i] !== before[i]) confidence[i] = 0;
  // Ohne erkennbaren Unterschied (z. B. dünne Druckschrift, keine Handschrift) gilt alles als gedruckt.
  if (hand.filter((v, i) => grid[i] && !v).length < 17) hand.fill(false);
  return { grid, hand, confidence, corners, warped };
}
