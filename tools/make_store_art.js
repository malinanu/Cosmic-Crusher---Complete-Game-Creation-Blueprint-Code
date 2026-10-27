#!/usr/bin/env node
// Renders app and store art with the game's own planet renderer and sprites:
//   mobile/resources/icon.png             1024² opaque app icon
//   mobile/resources/icon-foreground.png  1024² transparent (Android adaptive icon)
//   mobile/resources/splash.png           2732² opaque launch screen
//   store/feature-graphic.png             1024×500 Google Play feature graphic
//   store/screenshot-*.jpg                gameplay at 9:16, 16:9 and 1:1 (no logo,
//                                         as YouTube's listing rules ask)
// Then run `python3 tools/install_app_art.py` to write every native size.
//
//   node tools/make_store_art.js
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'mobile', 'resources');
const STORE = path.join(ROOT, 'store');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Runs in the page. Each composition draws onto a fresh canvas and returns a
// PNG data URL.
function compose({ kind, w, h }) {
  const R = CC.render, A = CC.assets;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const m = Math.min(w, h);
  const rand = R.rng(9);

  function space() {
    const bg = g.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#2b2a7a'); bg.addColorStop(0.55, '#121644'); bg.addColorStop(1, '#070818');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cols = ['#5b2a86', '#1d4e89', '#7a2a6b'];
    for (let i = 0; i < 3; i++) {
      const x = rand() * w, y = rand() * h, r = Math.max(w, h) * 0.4;
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, R.hexA(cols[i], 0.35)); ng.addColorStop(1, R.hexA(cols[i], 0));
      g.fillStyle = ng; g.fillRect(0, 0, w, h);
    }
    // A few hundred stars: enough to read as space, light enough to compress.
    for (let i = 0; i < Math.min(500, (w * h) / 1800); i++) {
      g.globalAlpha = 0.3 + rand() * 0.7;
      g.fillStyle = '#ffffff';
      const s = Math.max(1, rand() < 0.9 ? m * 0.002 : m * 0.004);
      g.fillRect(rand() * w, rand() * h, s, s);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 5; i++) R.sparkle(g, rand() * w, rand() * h, m * (0.006 + rand() * 0.01), '#cfe4ff', 0.9);
  }

  function hero(cx, cy, r) {
    R.drawPlanet(g, 'moon', cx, cy, r, 0.4, '#7fd6ff');
    g.save();
    g.translate(cx, cy - r * 0.97);
    A.drawFeet(g, 'astro_run2', r * 0.95, false);
    g.restore();
  }

  if (kind === 'icon') {
    space();
    hero(w * 0.5, h * 0.84, w * 0.36);
  } else if (kind === 'foreground') {
    // Android crops adaptive icons to the middle ~61%; keep the art inside it.
    hero(w * 0.5, h * 0.68, w * 0.235);
  } else if (kind === 'splash') {
    // Flat background (matches the native launch colour, and a gradient
    // this large would make a 10 MB PNG).
    g.fillStyle = '#070818'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) R.sparkle(g, w * (0.3 + rand() * 0.4), h * (0.25 + rand() * 0.5), m * 0.006, '#cfe4ff', 0.9);
    const logo = A.get('logo');
    const lw = m * 0.42, lh = lw * logo.height / logo.width;
    g.drawImage(logo, (w - lw) / 2, h * 0.36 - lh / 2, lw, lh);
    hero(w * 0.5, h * 0.66, m * 0.09);
  } else if (kind === 'feature') {
    space();
    hero(w * 0.3, h * 0.92, h * 0.5);
    const logo = A.get('logo');
    const lw = w * 0.44, lh = lw * logo.height / logo.width;
    g.drawImage(logo, w * 0.52, h * 0.5 - lh / 2, lw, lh);
    g.save(); g.translate(w * 0.12, h * 0.42); g.rotate(-0.4); A.drawFeet(g, 'alien_bouncer', h * 0.2); g.restore();
    g.save(); g.translate(w * 0.44, h * 0.86); g.rotate(0.9); A.drawCuteAlien(g, h * 0.18, 'orange', 10, 0); g.restore();
  }
  return c.toDataURL('image/png');
}

async function writeDataUrl(file, url) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote ' + path.relative(ROOT, file));
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base + '/index.html');
    await page.waitForSelector('#menu.show', { timeout: 10000 });
    for (const [kind, w, h, file] of [
      ['icon', 1024, 1024, path.join(RES, 'icon.png')],
      ['foreground', 1024, 1024, path.join(RES, 'icon-foreground.png')],
      ['splash', 2732, 2732, path.join(RES, 'splash.png')],
      ['feature', 1024, 500, path.join(STORE, 'feature-graphic.png')]
    ]) {
      await writeDataUrl(file, await page.evaluate(compose, { kind, w, h }));
    }
    await page.close();

    // Gameplay screenshots from the real game.
    for (const [name, vw, vh, scale] of [['portrait-1080x1920', 360, 640, 3], ['landscape-1920x1080', 640, 360, 3], ['square-1080x1080', 540, 540, 2]]) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale, hasTouch: true, isMobile: true });
      const p = await ctx.newPage();
      await p.goto(base + '/index.html?level=6&god=1');
      await p.waitForFunction(() => CC.game && CC.game.state === 'playing', null, { timeout: 10000 });
      const end = Date.now() + 9000;
      while (Date.now() < end) {
        await p.keyboard.down('ArrowRight'); await p.waitForTimeout(800);
        await p.keyboard.up('ArrowRight'); await p.waitForTimeout(200);
      }
      await p.evaluate(() => { CC.game.superCharge = 100; CC.game.combo = 3; CC.game.comboTimer = 60; });
      await p.waitForTimeout(150);
      fs.mkdirSync(STORE, { recursive: true });
      await p.screenshot({ path: path.join(STORE, 'screenshot-' + name + '.jpg'), type: 'jpeg', quality: 90 });
      console.log('wrote store/screenshot-' + name + '.jpg');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})();
