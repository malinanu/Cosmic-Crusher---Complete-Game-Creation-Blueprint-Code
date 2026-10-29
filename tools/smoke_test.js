#!/usr/bin/env node
// End-to-end smoke test, in headless Chromium:
//   1. the development copy at a phone and a desktop size (all screens, play,
//      super, pause, win/lose, boss)
//   2. the YouTube Playables build under YouTube's content security policy
//      with a recording stand-in for the SDK (tools/yt_sdk_mock.js): ready
//      signals, cloud saves, scores, pause/resume, audio, no network calls,
//      mouse-only play
//   3. the YouTube build across a range of aspect ratios
//   4. the mobile build with a stand-in for the Capacitor native bridge
//      (saves, splash/status bar, Android back button, app pause/resume)
// Screenshots go to tools/out/. Exits non-zero if any check fails.
//
//   npm install --no-save playwright   (once, if Playwright isn't installed)
//   node tools/smoke_test.js [--browser=chromium|firefox|webkit] [--only=youtube]
// --only=youtube runs just the YouTube build sections (used for the extra
// browsers in CI).
'use strict';

const http = require('http');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ENGINE = ARGS.browser || 'chromium';
const ONLY = ARGS.only || 'all';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain'
};
const SDK_URL = 'https://www.youtube.com/game_api/v1';
// Mirrors the policy in YouTube's Playables test-suite guide.
// Scripts: like YouTube's live policy, only nonce-tagged or same-origin files
// run, so inline code (onerror="...", <script>...</script>) would be refused.
const NONCE = 'cosmic-test-nonce';
const YT_CSP = [
  "default-src 'none'",
  "script-src 'report-sample' 'self' 'nonce-" + NONCE + "' 'unsafe-eval' blob: https://www.youtube.com/game_api/v0 https://www.youtube.com/game_api/v1",
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
    if (headers && file.endsWith('.html')) {
      Object.assign(h, headers);
      // Tag script elements with the nonce, as YouTube's server does.
      res.writeHead(200, h);
      res.end(fs.readFileSync(file, 'utf8').replace(/<script /g, '<script nonce="' + NONCE + '" '));
      return;
    }
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
    const t = m.text();
    // Content-security-policy refusals are reported as warnings by some engines.
    if (m.type() !== 'error' && !/Content.Security.Policy|Refused to/i.test(t)) return;
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
  const ctx = await browser.newContext(contextOptions(viewport, touch));
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // Menu and its screens
  await page.goto(base + '/index.html');
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  await wait(page, 800);
  await shot(page, label + '_01_menu');
  check(await game(page, () => CC.game.mode === 'attract'), 'menu shows the attract-mode planet');

  const stack = await page.$$eval('#menu .menu-buttons button', (bs) => bs.map((b) => b.textContent.trim()));
  check(stack.join('|') === 'START GAME|WEAPONS UPGRADES', 'menu buttons: ' + stack.join(', '));
  for (const [sel, id, name] of [['#btnMenuSettings', 'settings', 'the ⚙ corner button'], ['#menu button:has-text("START GAME")', 'levels', 'START GAME'],
    ['#menu button:has-text("WEAPONS UPGRADES")', 'weapons', 'WEAPONS UPGRADES']]) {
    await page.click(sel);
    await page.waitForSelector(`#${id}.show`);
    await wait(page, 250);
    await shot(page, `${label}_02_${id}`);
    check(true, `${name} opens the ${id} screen`);
    if (id === 'levels') {
      const lv = await page.evaluate(() => ({
        tiles: document.querySelectorAll('#levelList .level-tile').length,
        next: [...document.querySelectorAll('#levelList .level-tile.next .num')].map((n) => n.textContent),
        locked: document.querySelectorAll('#levelList .level-tile:disabled').length,
        total: document.getElementById('starTotal').textContent
      }));
      check(lv.tiles === 40, 'sectors 1 & 2 show 40 level tiles');
      check(lv.next.join() === '1' && lv.locked === 39, `level 1 is marked to play next, the rest are locked (next ${lv.next}, locked ${lv.locked})`);
      check(lv.total === '★ 0 / 120', `level select shows the star total (${lv.total})`);
    }
    await page.click(`#${id} [data-back]`);
    await page.waitForSelector('#menu.show');
  }

  // First start: START GAME → pick level 1 → how-to → play
  await page.click('#menu button:has-text("START GAME")');
  await page.waitForSelector('#levels.show');
  await page.click('#levelList .level-tile.next');
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

  // Planet progression
  check(await game(page, () => CC.game.planetKey === 'moon'), 'level 1 starts on Moon');
  await game(page, () => CC.game.setPlanet('earth'));
  check(await game(page, () => CC.game.planetKey === 'earth'), 'planet changes to Earth');

  // Pause / resume
  await page.keyboard.press('p');
  await page.waitForSelector('#pause.show');
  await shot(page, label + '_06_pause');
  check(await game(page, () => CC.game.state === 'paused'), 'P pauses');
  await page.click('#pause button:has-text("RESUME")');
  check(await game(page, () => CC.game.state !== 'paused'), 'resume works');

  // Star rule: ★ clear, ★★ half health or more, ★★★ also the target score.
  const rule = await game(page, () => {
    const g = CC.game, t = g.level.target, keep = { health: g.health, score: g.score }, out = [];
    for (const [health, score, won] of [[100, t, true], [80, t - 1, true], [30, t * 2, true], [100, t * 2, false]]) {
      g.health = health; g.score = score; out.push(g.result(won).stars);
    }
    Object.assign(g, keep);
    return out.join();
  });
  check(rule === '3,2,1,0', `stars: target + health 3, missed target 2, low health 1, loss 0 (${rule})`);
  check(await page.isVisible('#target') && await page.textContent('#targetVal') === (await game(page, () => CC.game.level.target)).toLocaleString('en-US'), 'HUD shows the three-star target score');

  // Win with the target reached → 3 stars → level map
  await game(page, () => { CC.game.score = CC.game.level.target; CC.game.win(); });
  await page.waitForSelector('#results.show', { timeout: 6000 });
  await wait(page, 600);
  await shot(page, label + '_07_win');
  check(await page.locator('#resStars span.on').count() === 3 && await page.locator('#resGoals li.done').count() === 3, 'a clean, high-scoring clear earns 3 stars with every goal ticked');
  check(await page.locator('input[type=text], input:not([type])').count() === 0, 'no text input (no names collected)');
  check(await page.isVisible('#resRank'), 'results show the run\'s place in your top runs');
  check(await game(page, () => CC.storage.data.leaderboard.length === 1 && CC.storage.data.unlocked >= 2), 'run recorded and level 2 unlocked');
  await page.click('#results button:has-text("LEVELS")');
  await page.waitForSelector('#levels.show');
  const map = await page.evaluate(() => ({
    l1: document.querySelectorAll('#levelList .level-tile:nth-child(1) .st i.on').length,
    next: [...document.querySelectorAll('#levelList .level-tile.next .num')].map((n) => n.textContent).join(),
    total: document.getElementById('starTotal').textContent
  }));
  check(map.l1 === 3 && map.next === '2' && map.total === '★ 3 / 120', `level map shows the stars and moves on to level 2 (L1 ${map.l1}★, next ${map.next}, ${map.total})`);
  await shot(page, label + '_07b_levels');
  await page.click('#levels [data-back]');
  await page.waitForSelector('#menu.show');

  // Losing
  await page.goto(base + '/index.html?level=2');
  await wait(page, 1500);
  await game(page, () => { CC.game.state = 'playing'; CC.game.hurt(999); });
  await page.waitForSelector('#results.show', { timeout: 6000 });
  await wait(page, 400);
  await shot(page, label + '_09_lose');
  check(await page.textContent('#resTitle') === 'CRUSHED!', 'losing shows the CRUSHED! screen');
  check(await page.isVisible('#resStars') && await page.locator('#resStars span.on').count() === 0, 'losing shows three empty stars');

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

// Phones at 3x, everything else at 2x: the densities the art must stay sharp at.
function contextOptions(viewport, touch) {
  const o = { viewport, hasTouch: !!touch, deviceScaleFactor: touch ? 3 : 2 };
  if (ENGINE !== 'firefox') o.isMobile = !!touch;   // Firefox has no mobile emulation
  return o;
}

async function ytPage(browser, base, viewport, touch, init) {
  const ctx = await browser.newContext(contextOptions(viewport, touch));
  if (init) await ctx.addInitScript(init.fn, init.arg);
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
  if (init && init.noWait) return { ctx, page, errors, external };
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  await page.waitForFunction(() => window.__yt && window.__yt.calls.includes('gameReady'), null, { timeout: 5000 });
  return { ctx, page, errors, external };
}

// Device pixels drawn per image pixel, for canvas sprites (tracked while
// drawing) and visible <img> elements. Above ~1.15 the art looks soft.
async function sharpness(page) {
  return page.evaluate(() => {
    const out = Object.assign({}, CC.assets.upscale.max);
    const c = CC.game.canvas;
    out.canvas = c.clientWidth * devicePixelRatio / c.width;
    document.querySelectorAll('img').forEach((img) => {
      const r = img.getBoundingClientRect();
      if (!r.width || !img.naturalWidth || !img.offsetParent) return;
      const k = r.width * devicePixelRatio / img.naturalWidth;
      const key = 'img:' + img.src.split('/').pop();
      out[key] = Math.max(out[key] || 0, k);
    });
    return out;
  });
}

function blurry(scales) {
  return Object.entries(scales).filter(([, k]) => k > 1.15).map(([key, k]) => `${key} ${k.toFixed(2)}x`);
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
  if (ENGINE === 'chromium') {
    // Launched with autoplay allowed, as inside YouTube: sound must start
    // without waiting for a tap.
    check(await page.evaluate(() => CC.audio.state === 'running'), 'audio starts without waiting for a tap (' + await page.evaluate(() => CC.audio.state) + ')');
  } else {
    // Headless Firefox/WebKit have no audio device, so no AudioContext ever runs.
    console.log('  note audio autostart is checked on chromium only (no audio device in headless ' + ENGINE + ')');
  }

  // Esc closes a dialog
  await page.click('#btnMenuSettings');
  await page.keyboard.press('Escape');
  check(await page.isVisible('#menu.show'), 'Esc closes the settings screen');

  // Mouse-only play
  await page.click('#menu button:has-text("START GAME")');
  await page.waitForSelector('#levels.show');
  await page.click('#levelList .level-tile.next');
  await page.waitForSelector('#howto.show');
  await page.click('#howtoGo');
  await page.evaluate(() => { CC.game.flags.god = true; });
  await wait(page, 2000);
  for (let i = 0; i < 9; i++) { await holdMouse(page, '#dpRight', 800); await wait(page, 250); }
  // Spinning in the red zone can end in a stumble, which blocks jumping for
  // a second; wait until a jump is allowed.
  await page.waitForFunction(() => CC.game.stumble === 0 && CC.game.jumpCooldown === 0 && !CC.game.jump, null, { polling: 100, timeout: 5000 }).catch(() => {});
  await page.click('#btnBoost');
  await wait(page, 150);
  const jumped = await page.evaluate(() => ({ jump: !!CC.game.jump, state: CC.game.state, stumble: CC.game.stumble, cooldown: CC.game.jumpCooldown }));
  check(jumped.jump, `mouse click on BOOST/SLAM jumps (${jumped.state}, stumble ${jumped.stumble}, cooldown ${jumped.cooldown})`);
  await wait(page, 900);
  const crushed = await page.evaluate(() => CC.game.crushes);
  check(crushed > 0, `mouse-held D-pad spins and crushes (crushes=${crushed})`);
  await shot(page, 'youtube_01_play');

  // Host pause: everything stops, progress saved
  await page.evaluate(() => { CC.game.superCharge = 100; });
  await wait(page, 200);
  const before = await yt(page);
  const t0 = await page.evaluate(() => { __yt.pause(); return CC.game.t; });
  await wait(page, 600);
  const paused = await page.evaluate(() => ({ t: CC.game.t, running: CC.loop.running, audio: CC.audio.state, screen: !!document.querySelector('#pause.show') }));
  check(paused.t === t0 && !paused.running, 'onPause stops the game loop and rendering');
  check(paused.audio !== 'running', 'onPause suspends audio (' + paused.audio + ')');
  check(paused.screen, 'onPause leaves the level on the pause screen');
  check(await page.evaluate(() => getComputedStyle(document.getElementById('btnSuper')).animationPlayState === 'paused'), 'onPause freezes CSS animations too');
  check((await yt(page)).saves > before.saves, 'onPause saves progress');
  await page.evaluate(() => __yt.resume());
  await wait(page, 300);
  check(await page.evaluate(() => CC.loop.running && !!document.querySelector('#pause.show')), 'onResume restarts the loop and waits on the pause screen');
  await page.click('#pause button:has-text("RESUME")');
  const t1 = await page.evaluate(() => CC.game.t);
  await wait(page, 400);
  const after = await page.evaluate(() => ({ t: CC.game.t, state: CC.game.state, running: CC.loop.running, kicks: CC.loop.kicks, screens: [...document.querySelectorAll('.screen.show')].map((s) => s.id).join(',') }));
  check(after.t > t1, `game runs again after RESUME (t ${t1} -> ${after.t}, ${after.state}, loop ${after.running}, screens [${after.screens}], frame watchdog kicks ${after.kicks})`);

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

// ---- Mobile (Capacitor) build ----------------------------------------------------------

// Pretends to be the Android app's native bridge, backed by localStorage so a
// reload keeps the "device" storage.
function capacitorBridge() {
  const cap = window.__cap = { sets: 0, haptics: [], listeners: {}, exited: false, statusHidden: false, splashHidden: false };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      Preferences: {
        get: ({ key }) => Promise.resolve({ value: localStorage.getItem('prefs:' + key) }),
        set: ({ key, value }) => { cap.sets++; localStorage.setItem('prefs:' + key, value); return Promise.resolve(); }
      },
      App: {
        addListener: (name, fn) => { (cap.listeners[name] = cap.listeners[name] || []).push(fn); return Promise.resolve({ remove() {} }); },
        exitApp: () => { cap.exited = true; }
      },
      Haptics: { impact: (o) => { cap.haptics.push(o.style); return Promise.resolve(); } },
      StatusBar: { hide: () => { cap.statusHidden = true; return Promise.resolve(); } },
      SplashScreen: { hide: () => { cap.splashHidden = true; return Promise.resolve(); } }
    }
  };
  cap.fire = (name) => (cap.listeners[name] || []).forEach((fn) => fn({}));
}

async function runCapacitor(browser, base) {
  console.log('\n[mobile] dist/mobile with a stand-in Capacitor bridge');
  const ctx = await browser.newContext(contextOptions({ width: 390, height: 844 }, true));
  await ctx.addInitScript(capacitorBridge);
  const page = await ctx.newPage();
  const errors = watchErrors(page, true);
  await page.goto(base + '/index.html');
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  await wait(page, 300);
  const st = await page.evaluate(() => ({ id: CC.platform.id, status: __cap.statusHidden, splash: __cap.splashHidden }));
  check(st.id === 'capacitor', 'game detects the native app');
  check(st.status && st.splash, 'status bar hidden and splash dismissed once the menu is ready');

  await page.evaluate(() => { CC.storage.data.seenHowTo = true; CC.ui.startLevel(1); });
  await wait(page, 400);
  await page.evaluate(() => __cap.fire('backButton'));
  check(await page.isVisible('#pause.show'), 'Android back pauses a level');
  await page.evaluate(() => __cap.fire('backButton'));
  check(await page.evaluate(() => !document.querySelector('#pause.show') && CC.game.state !== 'paused'), 'Android back again resumes');

  await page.evaluate(() => __cap.fire('pause'));
  await wait(page, 300);
  check(await page.evaluate(() => !CC.loop.running && !!document.querySelector('#pause.show')), 'app going to the background stops the game');
  await page.evaluate(() => __cap.fire('resume'));
  await wait(page, 200);
  check(await page.evaluate(() => CC.loop.running), 'app coming back restarts the loop');

  await page.evaluate(() => CC.platform.haptic(40));
  check(await page.evaluate(() => __cap.haptics[__cap.haptics.length - 1] === 'MEDIUM'), 'vibration uses native haptics');

  await page.click('#pause button:has-text("RESUME")');
  await page.evaluate(() => CC.game.win());
  await page.waitForSelector('#results.show', { timeout: 6000 });
  check(await page.evaluate(() => __cap.sets > 0), 'progress is saved to device preferences');
  await page.reload();
  await page.waitForSelector('#menu.show', { timeout: 10000 });
  check(await page.evaluate(() => CC.storage.data.unlocked >= 2), 'progress survives an app restart');
  await page.evaluate(() => __cap.fire('backButton'));
  check(await page.evaluate(() => __cap.exited), 'Android back on the main menu exits the app');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Starts the way YouTube does on Android: a 1x1 hidden view where
// requestAnimationFrame doesn't run. The game must still load and report ready.
function freezeFrames() {
  const real = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  const queue = new Map();
  let id = 0;
  window.__frozen = true;
  // Held requests get negative ids so cancelling them works like the real thing.
  window.requestAnimationFrame = (cb) => { if (window.__frozen) { queue.set(--id, cb); return id; } return real(cb); };
  window.cancelAnimationFrame = (n) => { if (!queue.delete(n)) realCancel(n); };
  window.__unfreeze = () => { window.__frozen = false; const q = [...queue.values()]; queue.clear(); q.forEach((cb) => real(cb)); };
}

async function runHiddenBoot(browser, base) {
  console.log('\n[youtube] hidden start (1x1 view, no animation frames) and audio off');
  const { ctx, page, errors } = await ytPage(browser, base, { width: 1, height: 1 }, true, { fn: freezeFrames, noWait: true });
  await page.waitForFunction(() => window.__yt && window.__yt.calls.includes('gameReady'), null, { timeout: 8000 }).catch(() => {});
  const calls = await page.evaluate(() => __yt.calls.slice());
  check(['firstFrameReady', 'loadData', 'gameReady'].every((c) => calls.includes(c)), 'ready signals are sent while hidden: ' + calls.filter((c) => /Ready|loadData/.test(c)).join(', '));
  await page.evaluate(() => window.__unfreeze());
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(page, 500);
  const lay = await page.evaluate(() => ({ w: CC.game.w, h: CC.game.h, R: CC.game.R, menu: !!document.querySelector('#menu.show'), running: CC.loop.running }));
  check(lay.w === 390 && lay.h === 844 && lay.R > 100 && lay.menu && lay.running, `lays out properly once shown (${lay.w}x${lay.h}, R=${Math.round(lay.R)})`);
  await shot(page, 'youtube_hidden_boot');
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();

  const off = await ytPage(browser, base, { width: 390, height: 844 }, true, { fn: () => { window.__ytAudioStart = false; } });
  await wait(off.page, 300);
  const a = await off.page.evaluate(() => ({ state: CC.audio.state, gain: CC.audio.masterGain }));
  check(a.gain === 0 && a.state !== 'running', `YouTube audio off at start: silent (${a.state}, gain ${a.gain})`);
  await off.ctx.close();
}

// ---- Aspect ratios --------------------------------------------------------------------

// Covers YouTube's listed ratios 9:32, 9:21, 9:16, 3:4, 1:1, 4:3, 16:9, 21:9, 32:9.
const VIEWPORTS = [
  [320, 1138, true], [360, 840, true], [360, 640, true], [320, 568, true], [390, 844, true],
  [768, 1024, true], [600, 600, false], [1024, 768, true], [1280, 720, false], [640, 360, true],
  [1920, 823, false], [1050, 450, false], [1280, 360, false]
];

async function runViewports(browser, base) {
  console.log('\n[youtube] aspect ratios');
  for (const [w, h, touch] of VIEWPORTS) {
    const { ctx, page, errors } = await ytPage(browser, base, { width: w, height: h }, touch);
    const tag = `vp_${w}x${h}`;
    await page.evaluate(() => { CC.assets.upscale.on = true; });
    await wait(page, 400);
    await shot(page, tag + '_menu');
    const menuScales = await sharpness(page);
    const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    // Menu: everything on screen, and the ⚙ corner button clear of the logo and buttons.
    const menu = await page.evaluate(() => {
      const box = (el, sel) => { const r = el.getBoundingClientRect(); return { sel, x: r.left, y: r.top, r: r.right, b: r.bottom }; };
      const logo = document.querySelector('#menu .logo, #menu h1');
      const parts = [...document.querySelectorAll('#menu .menu-buttons button')].map((b) => box(b, b.textContent.trim()));
      if (logo) parts.unshift(box(logo, 'logo'));
      const spill = [...document.querySelectorAll('#menu .menu-buttons button')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim());
      return { gear: box(document.getElementById('btnMenuSettings'), 'gear'), parts, spill, w: innerWidth, h: innerHeight };
    });
    const onScreen = (r) => r.x >= -0.5 && r.y >= -0.5 && r.r <= menu.w + 0.5 && r.b <= menu.h + 0.5;
    const gearHits = menu.parts.filter((p) => hit(menu.gear, p)).map((p) => p.sel);
    const cut = [menu.gear, ...menu.parts].filter((r) => !onScreen(r)).map((r) => r.sel);
    check(gearHits.length === 0 && cut.length === 0 && menu.spill.length === 0, `${w}x${h}: menu fits and the settings gear is clear of the logo and buttons` +
      (gearHits.length ? ' (gear hits ' + gearHits.join(', ') + ')' : '') + (cut.length ? ' (off screen: ' + cut.join(', ') + ')' : '') +
      (menu.spill.length ? ' (text spills out of: ' + menu.spill.join(', ') + ')' : ''));
    await page.evaluate(() => { CC.storage.data.seenHowTo = true; CC.ui.startLevel(10); CC.game.flags.god = true; });
    await wait(page, 2200);
    await page.evaluate(() => { CC.game.superCharge = 100; });
    await shot(page, tag + '_play');
    const layout = await page.evaluate(() => {
      const g = CC.game;
      const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { sel, x: r.left, y: r.top, r: r.right, b: r.bottom }; };
      const blocks = ['.hud-tl', '.hud-tr', '.hud-bl', '.hud-br', '#keyHint'].map(rect).filter((r) => r.r > r.x);
      const ah = g.R * CC.config.astronaut.height;
      const astro = { sel: 'astronaut', x: g.cx - ah * 0.35, y: g.cy - g.R - ah, r: g.cx + ah * 0.35, b: g.cy - g.R };
      return { blocks, astro, w: innerWidth, h: innerHeight, canvasW: g.canvas.clientWidth, canvasH: g.canvas.clientHeight };
    });
    const clashes = [];
    for (let i = 0; i < layout.blocks.length; i++) {
      for (let j = i + 1; j < layout.blocks.length; j++) if (hit(layout.blocks[i], layout.blocks[j])) clashes.push(layout.blocks[i].sel + '/' + layout.blocks[j].sel);
      if (hit(layout.blocks[i], layout.astro)) clashes.push(layout.blocks[i].sel + '/astronaut');
    }
    check(layout.canvasW === layout.w && layout.canvasH === layout.h, `${w}x${h}: playfield fills the viewport`);
    const soft = blurry(Object.assign(menuScales, await sharpness(page)));
    check(soft.length === 0, `${w}x${h}: art is drawn at or below its pixel size` + (soft.length ? ' (soft: ' + soft.join(', ') + ')' : ''));
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
  const py = process.platform === 'win32' ? 'py' : 'python3';
  const pyArgs = process.platform === 'win32' ? ['-3.12', path.join(__dirname, 'build.py'), 'all'] : [path.join(__dirname, 'build.py'), 'all'];
  execFileSync(py, pyArgs, { stdio: 'inherit' });
  const dev = await serve(ROOT);
  const ytDir = path.join(ROOT, 'dist', 'youtube');
  const ytServer = await serve(ytDir, { 'Content-Security-Policy': YT_CSP });
  const mobileServer = await serve(path.join(ROOT, 'dist', 'mobile'));
  const base = 'http://127.0.0.1:' + dev.address().port;
  const ytBase = 'http://127.0.0.1:' + ytServer.address().port;
  // Allow sound without a gesture, as YouTube does when it focuses a Playable.
  const launch = {
    chromium: { args: ['--autoplay-policy=no-user-gesture-required'] },
    firefox: { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0, 'media.autoplay.block-webaudio': false } },
    webkit: {}
  }[ENGINE];
  console.log(`engine: ${ENGINE}${ONLY !== 'all' ? ', sections: ' + ONLY : ''}`);
  const browser = await playwright[ENGINE].launch(launch);
  try {
    if (ONLY === 'youtube') {
      await runYouTube(browser, ytBase);
      await runHiddenBoot(browser, ytBase);
      await runViewports(browser, ytBase);
      return;
    }
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
    await runHiddenBoot(browser, ytBase);
    await runViewports(browser, ytBase);
    await runCapacitor(browser, 'http://127.0.0.1:' + mobileServer.address().port);
  } finally {
    await browser.close();
    dev.close();
    ytServer.close();
    mobileServer.close();
    console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
    process.exit(failures.length ? 1 : 0);
  }
})();
