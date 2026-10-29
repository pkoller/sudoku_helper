// Gemeinsame Hilfen für die Browser-Tests: statischer Server + App-Seite in Chromium.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

async function openApp() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const app = await browser.newPage({ viewport: { width: 412, height: 900 } });
  app.on('pageerror', e => console.log('PAGEERROR', e.message));
  await app.goto(`${base}/index.html`);
  const close = async () => { await browser.close(); server.close(); };
  return { browser, app, base, close };
}

/** Lädt ein Foto wie die App (gleiche Skalierung) und liefert danach state.photo im Browser. */
async function loadPhoto(app, file) {
  await app.evaluate(() => { window.__sudoku.state.review = null; document.getElementById('screen-start').hidden = false; });
  await app.setInputFiles('#input-file', file);
  await app.waitForFunction(() => document.getElementById('busy').hidden && window.__sudoku.state.review);
}

module.exports = { ROOT, openApp, loadPhoto };
