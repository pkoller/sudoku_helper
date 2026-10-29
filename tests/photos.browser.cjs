// Test mit echten Fotos gelöster Sudokus (gedruckte Vorgaben + Bleistift-Handschrift).
// Jedes Foto wird nur mit den Beispielen der *anderen* Fotos erkannt, damit der Test ehrlich ist.
// Aufruf: npm run test:photos
const fs = require('fs');
const path = require('path');
const { ROOT, openApp, loadPhoto } = require('./browser-helper.cjs');

(async () => {
  const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/photos/truth.json')));
  const { app, close } = await openApp();
  let total = 0, digitsOk = 0, kindOk = 0;
  for (const [file, t] of Object.entries(truth)) {
    await loadPhoto(app, path.join(ROOT, 'tests/photos', file));
    const r = await app.evaluate(async file => {
      const V = await import('./js/vision.js');
      const { SAMPLES } = await import('./js/handwriting.js');
      const templates = V.buildTemplates((w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
        SAMPLES.filter(s => s.src !== file));
      const res = V.recognize(window.__sudoku.state.photo.imageData, templates);
      return res && { grid: res.grid.join(''), hand: res.hand };
    }, file);
    const wrong = [];
    for (let i = 0; i < 81; i++) {
      if (t.solution[i] === '0') continue;
      const hand = t.givens[i] === '0';
      const got = r ? r.grid[i] : '0';
      total++;
      if (got === t.solution[i]) digitsOk++;
      if (r && r.hand[i] === hand) kindOk++;
      if (got !== t.solution[i] || !r || r.hand[i] !== hand) {
        wrong.push(`Z${Math.floor(i / 9) + 1}S${i % 9 + 1}${hand ? '✎' : ''}:${t.solution[i]}→${got}${r && r.hand[i] !== hand ? (r.hand[i] ? '(als Handschrift)' : '(als Druck)') : ''}`);
      }
    }
    console.log(`${file}: ${wrong.length ? 'FEHLER ' + wrong.join(' ') : 'ok'}`);
  }
  console.log(`Ziffern korrekt: ${digitsOk}/${total}, Druck/Handschrift korrekt: ${kindOk}/${total}`);
  await close();
  if (digitsOk / total < 0.95 || kindOk / total < 0.98) process.exitCode = 1;
})();
