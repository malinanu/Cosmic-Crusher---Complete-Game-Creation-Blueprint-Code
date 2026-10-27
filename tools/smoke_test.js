#!/usr/bin/env node
// End-to-end smoke test, in headless Chromium:
//   1. the development copy at a phone and a desktop size (all screens, play,
//      super, pause, win/lose, boss)
//   2. the YouTube Playables build under YouTube's content security policy
//      with a recording stand-in for the SDK (tools/yt_sdk_mock.js): ready
//      signals, cloud saves, scores, pause/resume, audio, no network calls,
//      mouse-only play
//   3. the YouTube build across a range of aspect ratios
// Screenshots go to tools/out/. Exits non-zero if any check fails.
//
//   npm install --no-save playwright   (once, if Playwright isn't installed)
//   node tools/smoke_test.js
'use strict';

const http = require('http');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain'
};
const SDK_URL = 'https://www.youtube.com/game_api/v1';
// Mirrors the policy in YouTube's Playables test-suite guide.
const YT_CSP = [
  "default-src 'none'",
  "script-src 'report-sample' 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.youtube.com/game_api/v0 https://www.youtube.com/game_api/v1",
  "object-src 'none'",
  "style-src 'report-sample' 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' blob: data:",
  'sandbox allow-pointer-lock allow-same-origin allow-scripts',
  "base-uri 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:"
].join('; ');

function serve(dir, headers) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(dir, url === '/' ? 'index.html' : url);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    const h = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (headers && file.endsWith('.html')) Object.assign(h, headers);
    res.writeHead(200, h);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const failures = [];
function check(cond, msg) {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failures.push(msg);
}

// strict: release builds must not even miss an optional file.
function watchErrors(page, strict) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // The development copy probes for optional sprites that may not exist.
    if (!strict && (t.includes('404') || t.includes('ERR_FILE_NOT_FOUND'))) return;
    errors.push(t);
  });
  return errors;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
}

const wait = (page, ms) => page.waitForTimeout(ms);
const game = (page, fn) => page.evaluate(fn);

// Spin in bursts so the roll speed stays above crushing speed without
// overheating.
async function spin(page, ms, key) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.keyboard.down(key || 'ArrowRight');
    await wait(page, 700);
    await page.keyboard.up(key || 'ArrowRight');
    await wait(page, 250);
  }
}

async function run(browser, base, label, viewport, touch) {
  console.log(`\n[${label}] ${viewport.width}x${viewport.height}`);
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // Menu and its screens
  await page.goto(base + '/index.html');
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  await wait(page, 800);
  await shot(page, label + '_01_menu');
  check(await game(page, () => CC.game.mode === 'attract'), 'menu shows the attract-mode planet');

  for (const [btn, id] of [['LEVELS', 'levels'], ['SETTINGS', 'settings'], ['LEADERBOARD', 'leaderboard'], ['WEAPONS UPGRADES', 'weapons']]) {
    await page.click(`#menu button:has-text("${btn}")`);
    await page.waitForSelector(`#${id}.show`);
    await wait(page, 250);
    await shot(page, `${label}_02_${id}`);
    check(true, `${id} screen opens`);
    if (id === 'levels') check(await page.locator('#levelList .level-tile').count() === 20, 'sector 1 shows 20 level tiles');
    await page.click(`#${id} [data-back]`);
    await page.waitForSelector('#menu.show');
  }

  // First start shows how-to, then level 1
  await page.click('#menu button:has-text("START GAME")');
  await page.waitForSelector('#howto.show');
  await shot(page, label + '_03_howto');
  await page.click('#howtoGo');
  await wait(page, 300);
  check(await game(page, () => CC.game.mode === 'level' && CC.game.level.level === 1), 'level 1 starts after how-to');
  await game(page, () => { CC.game.flags.god = true; });
  await wait(page, 2200);
  await spin(page, 9000);
  await page.keyboard.press('ArrowUp');
  await wait(page, 450);
  await shot(page, label + '_04_play');
  await spin(page, 4000);
  const s1 = await game(page, () => ({ score: CC.game.score, crushes: CC.game.crushes, superCharge: CC.game.superCharge }));
  check(s1.crushes > 0 && s1.score > 0, `crushing works (crushes=${s1.crushes}, score=${s1.score})`);
  check(s1.superCharge > 0, 'crushes charge the super bar');

  // Super
  await game(page, () => { CC.game.superCharge = 100; });
  await page.keyboard.press('Space');
  await wait(page, 600);
  check(await game(page, () => CC.game.superTime > 0), 'SHIELD/CRUSH activates when the bar is full');
  await shot(page, label + '_05_super');

  // Planet switch
  await page.keyboard.press('1');
  await wait(page, 300);
  check(await game(page, () => CC.game.planetKey === 'mars'), 'key 1 switches to Mars');
  await page.click('#selector button[data-planet="earth"]');
  check(await game(page, () => CC.game.planetKey === 'earth'), 'selector button switches to Earth');

  // Pause / resume
  await page.keyboard.press('p');
  await page.waitForSelector('#pause.show');
  await shot(page, label + '_06_pause');
  check(await game(page, () => CC.game.state === 'paused'), 'P pauses');
  await page.click('#pause button:has-text("RESUME")');
  check(await game(page, () => CC.game.state !== 'paused'), 'resume works');

  // Win → results → leaderboard entry
  await game(page, () => CC.game.win());
  await page.waitForSelector('#results.show', { timeout: 6000 });
  await wait(page, 600);
  await shot(page, label + '_07_win');
  check(await page.locator('input[type=text], input:not([type])').count() === 0, 'no text input (no names collected)');
  check(await page.isVisible('#resRank'), 'results show the run\'s place in your top runs');
  check(await game(page, () => CC.storage.data.leaderboard.length === 1 && CC.storage.data.unlocked >= 2), 'run recorded and level 2 unlocked');
  await page.click('#results button:has-text("MENU")');
  await page.click('#menu button:has-text("LEADERBOARD")');
  await wait(page, 300);
  await shot(page, label + '_08_leaderboard');
  check(await page.locator('#lbList li').count() === 1, 'leaderboard lists the saved score');

  // Losing
  await page.goto(base + '/index.html?level=2');
  await wait(page, 1500);
  await game(page, () => { CC.game.state = 'playing'; CC.game.hurt(999); });
  await page.waitForSelector('#results.show', { timeout: 6000 });
  await wait(page, 400);
  await shot(page, label + '_09_lose');
  check(await page.textContent('#resTitle') === 'CRUSHED!', 'losing shows the CRUSHED! screen');

  // Boss
  await page.goto(base + '/index.html?level=20&god=1&boss=1');
  await wait(page, 3500);
  check(await game(page, () => !!CC.game.boss), 'level 20 spawns the boss');
  await wait(page, 2500);
  await spin(page, 12000);
  const boss = await game(page, () => CC.game.boss ? { hp: CC.game.boss.hp, max: CC.game.boss.maxHp } : { hp: 0, max: 1 });
  check(boss.hp < boss.max, `boss takes damage (hp ${boss.hp}/${boss.max})`);
  await shot(page, label + '_10_boss');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// ---- YouTube Playables build ------------------------------------------------------

async function ytPage(browser, base, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: !!touch, deviceScaleFactor: touch ? 3 : 1 });
  const page = await ctx.newPage();
  const errors = watchErrors(page, true);
  const external = [];
  const mock = fs.readFileSync(path.join(__dirname, 'yt_sdk_mock.js'), 'utf8');
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === SDK_URL) return route.fulfill({ contentType: 'text/javascript', body: mock });
    if (url.startsWith(base)) return route.continue();
    external.push(url);
    return route.abort();
  });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  await page.waitForFunction(() => window.__yt && window.__yt.calls.includes('gameReady'), null, { timeout: 5000 });
  return { ctx, page, errors, external };
}

const yt = (page) => page.evaluate(() => ({
  calls: __yt.calls.slice(), saves: __yt.saves.length, scores: __yt.scores.slice(), saved: __yt.saved,
  sbl: __yt.saveBeforeLoad, menu: __yt.menuShownAtGameReady, loading: __yt.loadingShownAtFirstFrame
}));

async function holdMouse(page, selector, ms) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await wait(page, ms);
  await page.mouse.up();
}

async function runYouTube(browser, base) {
  console.log('\n[youtube] dist/youtube with the YouTube CSP and a mock SDK, mouse only');
  const { ctx, page, errors, external } = await ytPage(browser, base, { width: 1280, height: 720 });

  let y = await yt(page);
  const ff = y.calls.indexOf('firstFrameReady'), gr = y.calls.indexOf('gameReady');
  check(ff >= 0 && ff < gr, 'firstFrameReady is sent before gameReady');
  check(y.loading === true, 'firstFrameReady is sent while the loading screen shows');
  check(y.menu === true, 'gameReady is sent once the menu is interactive');
  check(y.calls.filter((c) => c === 'gameReady').length === 1, 'gameReady is sent exactly once');
  check(y.calls.indexOf('loadData') >= 0 && !y.sbl, 'loadData finishes before any saveData');
  check(await page.evaluate(() => CC.platform.id === 'youtube'), 'game detects the Playables environment');
  check(await page.evaluate(() => getComputedStyle(document.getElementById('btnSound')).display === 'none'), 'no in-game mute button');
  check(await page.evaluate(() => document.querySelector('.style-btn[data-controls="tilt"]').classList.contains('hidden')), 'tilt (motion permission) option hidden');
  check(await page.locator('input[type=text], input:not([type])').count() === 0, 'no text entry anywhere');

  // Esc closes a dialog
  await page.click('#menu button:has-text("SETTINGS")');
  await page.keyboard.press('Escape');
  check(await page.isVisible('#menu.show'), 'Esc closes the settings screen');

  // Mouse-only play
  await page.click('#menu button:has-text("START GAME")');
  await page.waitForSelector('#howto.show');
  await page.click('#howtoGo');
  await page.evaluate(() => { CC.game.flags.god = true; });
  await wait(page, 2000);
  for (let i = 0; i < 9; i++) { await holdMouse(page, '#dpRight', 800); await wait(page, 250); }
  await page.click('#btnBoost');
  await wait(page, 150);
  check(await page.evaluate(() => !!CC.game.jump), 'mouse click on BOOST/SLAM jumps');
  await wait(page, 900);
  const crushed = await page.evaluate(() => CC.game.crushes);
  check(crushed > 0, `mouse-held D-pad spins and crushes (crushes=${crushed})`);
  await shot(page, 'youtube_01_play');

  // Host pause: everything stops, progress saved
  const before = await yt(page);
  const t0 = await page.evaluate(() => { __yt.pause(); return CC.game.t; });
  await wait(page, 600);
  const paused = await page.evaluate(() => ({ t: CC.game.t, running: CC.loop.running, audio: CC.audio.state, screen: !!document.querySelector('#pause.show') }));
  check(paused.t === t0 && !paused.running, 'onPause stops the game loop and rendering');
  check(paused.audio !== 'running', 'onPause suspends audio (' + paused.audio + ')');
  check(paused.screen, 'onPause leaves the level on the pause screen');
  check((await yt(page)).saves > before.saves, 'onPause saves progress');
  await page.evaluate(() => __yt.resume());
  await wait(page, 300);
  check(await page.evaluate(() => CC.loop.running && !!document.querySelector('#pause.show')), 'onResume restarts the loop and waits on the pause screen');
  await page.click('#pause button:has-text("RESUME")');
  const t1 = await page.evaluate(() => CC.game.t);
  await wait(page, 300);
  check(await page.evaluate((t) => CC.game.t > t, t1), 'game runs again after RESUME');

  // YouTube audio setting
  await page.evaluate(() => __yt.setAudio(false));
  check(await page.evaluate(() => CC.audio.masterGain === 0), 'YouTube audio off silences the game');
  await page.evaluate(() => __yt.setAudio(true));
  check(await page.evaluate(() => CC.audio.masterGain === 1), 'YouTube audio on restores sound');

  // Level clear: cloud save + score
  await page.evaluate(() => CC.game.win());
  await page.waitForSelector('#results.show', { timeout: 6000 });
  y = await yt(page);
  const save = JSON.parse(y.saved || '{}');
  check(save.unlocked >= 2 && save.levels && save.levels['1'], 'level clear is saved to the cloud save');
  const best = save.leaderboard && save.leaderboard[0] ? save.leaderboard[0].score : -1;
  const sent = y.scores[y.scores.length - 1];
  check(Number.isInteger(sent) && sent === best, `sendScore sends an integer matching the saved best (${sent} vs ${best})`);
  check(y.saved.length < 500 * 1024, `save data is small (${y.saved.length} chars)`);

  // A reload loads the cloud save back
  const savedData = y.saved;
  await page.addInitScript((d) => { window.__ytInitialSave = d; }, savedData);
  await page.route(SDK_URL, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: fs.readFileSync(path.join(__dirname, 'yt_sdk_mock.js'), 'utf8') + ';__yt.saved = window.__ytInitialSave || "";'
  }));
  await page.reload();
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  check(await page.evaluate(() => CC.storage.data.unlocked >= 2), 'progress comes back from the cloud save after a reload');

  check(external.length === 0, 'no external network requests' + (external.length ? ': ' + external.join(', ') : ''));
  check(errors.length === 0, 'no page errors or CSP violations' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// ---- Aspect ratios --------------------------------------------------------------------

const VIEWPORTS = [
  [360, 640, true], [390, 844, true], [768, 1024, true], [1024, 768, true],
  [1280, 720, false], [640, 360, true], [600, 600, false], [1050, 450, false]
];

async function runViewports(browser, base) {
  console.log('\n[youtube] aspect ratios');
  for (const [w, h, touch] of VIEWPORTS) {
    const { ctx, page, errors } = await ytPage(browser, base, { width: w, height: h }, touch);
    const tag = `vp_${w}x${h}`;
    await wait(page, 400);
    await shot(page, tag + '_menu');
    await page.evaluate(() => { CC.storage.data.seenHowTo = true; CC.ui.startLevel(10); CC.game.flags.god = true; });
    await wait(page, 2200);
    await page.evaluate(() => { CC.game.superCharge = 100; });
    await shot(page, tag + '_play');
    const layout = await page.evaluate(() => {
      const g = CC.game;
      const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { sel, x: r.left, y: r.top, r: r.right, b: r.bottom }; };
      const blocks = ['.hud-tl', '.hud-tr', '#selector', '.hud-bl', '.hud-br'].map(rect).filter((r) => r.r > r.x);
      const ah = g.R * CC.config.astronaut.height;
      const astro = { sel: 'astronaut', x: g.cx - ah * 0.35, y: g.cy - g.R - ah, r: g.cx + ah * 0.35, b: g.cy - g.R };
      return { blocks, astro, w: innerWidth, h: innerHeight, canvasW: g.canvas.clientWidth, canvasH: g.canvas.clientHeight };
    });
    const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    const clashes = [];
    for (let i = 0; i < layout.blocks.length; i++) {
      for (let j = i + 1; j < layout.blocks.length; j++) if (hit(layout.blocks[i], layout.blocks[j])) clashes.push(layout.blocks[i].sel + '/' + layout.blocks[j].sel);
      if (hit(layout.blocks[i], layout.astro)) clashes.push(layout.blocks[i].sel + '/astronaut');
    }
    check(layout.canvasW === layout.w && layout.canvasH === layout.h, `${w}x${h}: playfield fills the viewport`);
    check(clashes.length === 0, `${w}x${h}: HUD blocks and astronaut don't overlap` + (clashes.length ? ' (' + clashes.join(', ') + ')' : ''));
    if (w === 390) {
      const s0 = await page.evaluate(() => ({ level: CC.game.level.level, score: CC.game.score, t: CC.game.t }));
      await page.setViewportSize({ width: h, height: w });
      await wait(page, 400);
      await page.setViewportSize({ width: w, height: h });
      await wait(page, 300);
      const s1 = await page.evaluate(() => ({ level: CC.game.level.level, score: CC.game.score, t: CC.game.t, mode: CC.game.mode }));
      check(s1.mode === 'level' && s1.level === s0.level && s1.score >= s0.score && s1.t > s0.t, 'rotating the screen keeps the level running');
    }
    check(errors.length === 0, `${w}x${h}: no page errors` + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync('python3', [path.join(__dirname, 'build.py'), 'youtube'], { stdio: 'inherit' });
  const dev = await serve(ROOT);
  const ytDir = path.join(ROOT, 'dist', 'youtube');
  const ytServer = await serve(ytDir, { 'Content-Security-Policy': YT_CSP });
  const base = 'http://127.0.0.1:' + dev.address().port;
  const ytBase = 'http://127.0.0.1:' + ytServer.address().port;
  const browser = await chromium.launch();
  try {
    await run(browser, base, 'phone', { width: 390, height: 844 }, true);
    await run(browser, base, 'desktop', { width: 1280, height: 800 }, false);

    console.log('\n[file://] double-click play');
    const page = await browser.newPage();
    const errors = watchErrors(page);
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForSelector('#menu.show', { timeout: 10000 });
    check(await page.evaluate(() => !!CC.assets.get('astro_idle')), 'sprites load over file://');
    check(errors.length === 0, 'no page errors over file://' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await page.close();

    await runYouTube(browser, ytBase);
    await runViewports(browser, ytBase);
  } finally {
    await browser.close();
    dev.close();
    ytServer.close();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
})();
