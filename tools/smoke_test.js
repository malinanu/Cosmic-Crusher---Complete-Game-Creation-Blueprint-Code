#!/usr/bin/env node
// End-to-end smoke test: serves the game, drives it in headless Chromium at a
// phone and a desktop size, saves screenshots to tools/out/, and fails on any
// page error or broken flow.
//
//   npm install --no-save playwright   (once, if Playwright isn't installed)
//   node tools/smoke_test.js
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

const failures = [];
function check(cond, msg) {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failures.push(msg);
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Optional sprites (cute aliens, weapons) and web fonts may be absent.
    if (t.includes('404') || t.includes('ERR_') || t.includes('fonts.g')) return;
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
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
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
})();
