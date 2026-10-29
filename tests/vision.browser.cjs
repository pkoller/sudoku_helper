const { chromium } = require('playwright');
// Browser-Test der Bilderkennung: rendert Sudokus als „Fotos“ (Perspektive, Unschärfe,
// Schatten, verschiedene Schriften) und prüft, ob die App alle Ziffern erkennt.
// Aufruf: npm run test:vision   (braucht Playwright mit Chromium)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-vision-'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const PUZ = [
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
  '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
];
const VARIANTS = [
  { font: 'Arial', transform: 'none', blur: 0, light: false },
  { font: 'Georgia, serif', transform: 'perspective(900px) rotateX(18deg) rotateZ(4deg)', blur: 0.6, light: true },
  { font: "'Courier New', monospace", transform: 'perspective(700px) rotateY(-20deg) rotateZ(-6deg) scale(0.85)', blur: 1, light: true },
  { font: "'Times New Roman', serif", transform: 'rotateZ(9deg) scale(0.8)', blur: 0.8, light: false },
  { font: 'Verdana, sans-serif', transform: 'perspective(800px) rotateX(-15deg) rotateY(12deg) scale(0.9)', blur: 1.3, light: true },
  { font: 'Arial', weight: 'bold', transform: 'perspective(600px) rotateX(28deg) rotateZ(-3deg) scale(0.9)', blur: 0.7, light: true },
  { font: 'Helvetica, sans-serif', transform: 'rotateZ(-4deg) scale(0.45)', blur: 0.4, light: true, news: true },
  { font: 'Georgia, serif', transform: 'perspective(900px) rotateY(10deg) scale(0.95)', blur: 1, light: true, shadow: true },
];
function sceneHtml(p, v) {
  let cells = '';
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const st = [`border-right:${c % 3 === 2 ? 3 : 1}px solid #222`, `border-bottom:${r % 3 === 2 ? 3 : 1}px solid #222`];
    cells += `<div style="${st.join(';')}">${p[i] === '0' ? '' : p[i]}</div>`;
  }
  return `<html><body style="margin:0;width:900px;height:1200px;display:flex;align-items:center;justify-content:center;
    background:${v.light ? 'radial-gradient(circle at 20% 30%, #fffaf0, #9a9488)' : '#c8c2b8'};">
  <div style="position:relative;transform:${v.transform};filter:blur(${v.blur}px)">
   ${v.news ? '<p style="position:absolute;top:-260px;left:-200px;width:1100px;font:30px serif;color:#333">' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit 1234 5678 9. '.repeat(8) + '</p>' : ''}
   ${v.shadow ? '<div style="position:absolute;inset:-100px;z-index:2;background:linear-gradient(100deg,transparent 40%,rgba(0,0,0,.45) 55%,rgba(0,0,0,.45))"></div>' : ''}
   <div style="background:${v.light ? 'linear-gradient(120deg,#fff,#d9d4ca)' : '#fbfbf7'};padding:30px">
    <div style="display:grid;grid-template-columns:repeat(9,68px);grid-auto-rows:68px;border-left:3px solid #222;border-top:3px solid #222;
      font-family:${v.font};font-weight:${v.weight||'normal'};font-size:46px;color:#151515;text-align:center;line-height:68px">${cells}</div>
   </div></div></body></html>`;
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const b = await chromium.launch();
  const shot = await b.newPage({ viewport: { width: 900, height: 1200 } });
  const app = await b.newPage({ viewport: { width: 412, height: 900 } });
  app.on('pageerror', e => console.log('PAGEERROR', e.message));
  await app.goto(`${base}/index.html`);
  let total = 0, ok = 0, fails = 0;
  for (const [pi, p] of PUZ.entries()) for (const [vi, v] of VARIANTS.entries()) {
    await shot.setContent(sceneHtml(p, v));
    const file = `${SP}/scene-${pi}-${vi}.jpg`;
    await shot.screenshot({ path: file, type: 'jpeg', quality: 80 });
    await app.evaluate(() => { document.getElementById('screen-start').hidden = false; });
    await app.setInputFiles('#input-file', file);
    await app.waitForFunction(() => document.getElementById('busy').hidden && window.__sudoku.state.review);
    await app.waitForTimeout(100);
    const grid = await app.evaluate(() => window.__sudoku.state.review.grid.join(''));
    let wrong = [];
    for (let i = 0; i < 81; i++) if (grid[i] !== p[i]) wrong.push(`${i}:${p[i]}->${grid[i]}`);
    total += 81; ok += 81 - wrong.length; if (wrong.length) fails++;
    console.log(`P${pi} V${vi} ${wrong.length ? 'FEHLER ' + wrong.join(' ') : 'ok'}`);
    await app.evaluate(() => { window.__sudoku.state.review = null; });
  }
  console.log(`Zellen korrekt: ${ok}/${total}, Bilder mit Fehlern: ${fails}`);
  await b.close();
  server.close();
  fs.rmSync(SP, { recursive: true, force: true });
  // Mindestens 99 % der Zellen müssen stimmen.
  if (ok / total < 0.99) process.exitCode = 1;
})();
