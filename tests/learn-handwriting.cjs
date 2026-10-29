// Lernt Ziffern aus echten, fertig gelösten Sudoku-Fotos (tests/photos + truth.json)
// und schreibt sie nach js/handwriting.js. Aufruf: npm run learn
// Neue Fotos: Bild nach tests/photos legen, in truth.json Vorgaben + Lösung eintragen, neu lernen.
const fs = require('fs');
const path = require('path');
const { ROOT, openApp, loadPhoto } = require('./browser-helper.cjs');

(async () => {
  const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/photos/truth.json')));
  const { app, close } = await openApp();
  const samples = [];
  for (const [file, t] of Object.entries(truth)) {
    await loadPhoto(app, path.join(ROOT, 'tests/photos', file));
    const got = await app.evaluate(async ({ file, t }) => {
      const V = await import('./js/vision.js');
      const { imageData } = window.__sudoku.state.photo;
      const { width: w, height: h } = imageData;
      const gray = V.toGray(imageData);
      const corners = V.findGrid(gray, w, h);
      const warped = V.warp(gray, w, h, corners);
      const bin = V.adaptiveThreshold(warped, V.SIZE, V.SIZE, Math.round(V.CELL * 0.6), 12);
      const out = [];
      for (let i = 0; i < 81; i++) {
        if (t.solution[i] === '0') continue;
        const g = V.extractDigit(bin, V.SIZE, (i % 9) * V.CELL, Math.floor(i / 9) * V.CELL, V.CELL);
        if (!g) continue;
        out.push({ src: file, digit: Number(t.solution[i]), hand: t.givens[i] === '0', ...V.encodeSample(g.mask, g.stride, g.box) });
      }
      return out;
    }, { file, t });
    console.log(`${file}: ${got.length} Ziffern gelernt`);
    samples.push(...got);
  }
  await close();
  const lines = samples.map(s => '  ' + JSON.stringify(s) + ',');
  fs.writeFileSync(path.join(ROOT, 'js/handwriting.js'),
    '// Gelernte Ziffern aus echten Fotos (Handschrift mit Bleistift und Zeitungsdruck).\n' +
    '// Automatisch erzeugt mit `npm run learn` aus tests/photos – nicht von Hand bearbeiten.\n' +
    'export const SAMPLES = [\n' + lines.join('\n') + '\n];\n');
  console.log(`${samples.length} Beispiele nach js/handwriting.js geschrieben.`);
})();
