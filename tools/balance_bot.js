#!/usr/bin/env node
// Headless balance bot with Playwright.
// Tests levels 21-40 (Sector 2) to ensure winnability, duration under 3 minutes,
// and tuned 3-star score targets.
// Usage: node tools/balance_bot.js [--level=N] [--runs=M]
'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');
const playwright = require('playwright');

const ROOT = path.dirname(__dirname);

function parseArgs() {
  const args = { level: null, runs: 3 };
  process.argv.slice(2).forEach((a) => {
    if (a.startsWith('--level=')) args.level = parseInt(a.slice(8), 10);
    if (a.startsWith('--runs=')) args.runs = parseInt(a.slice(7), 10);
  });
  return args;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

function serve(dir) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
      try {
        const data = fs.readFileSync(p);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

async function runBot(page, level, mode = 'strong') {
  return page.evaluate(({ level, mode }) => {
    const TOP = -Math.PI / 2;
    const TAU = Math.PI * 2;
    function wrap(a) {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    }

    CC.storage.data.seenHowTo = true;
    CC.game.startLevel(level);

    let frames = 0;
    const maxFrames = 60 * 180; // 3 minutes max

    while (CC.game.state !== 'won' && CC.game.state !== 'lost' && frames < maxFrames) {
      frames++;
      const g = CC.game;
      let dir = 0;
      let boost = false;
      let slam = false;
      let superActive = false;

      // Find targets
      let targetD = null;
      if (g.boss && g.boss.state === 'landed') {
        targetD = wrap(g.boss.local + g.angle - TOP);
      } else {
        let minDist = Infinity;
        for (let i = 0; i < g.aliens.length; i++) {
          const a = g.aliens[i];
          if (a.state !== 'landed') continue;
          const d = wrap(a.local + g.angle - TOP);
          if (Math.abs(d) < Math.abs(minDist)) {
            minDist = d;
            targetD = d;
          }
        }
      }

      if (targetD !== null) {
        // Spin toward target: dir = 1 decreases angle, dir = -1 increases angle
        dir = targetD > 0 ? 1 : -1;
      }

      // Rock evasion: jump over rocks if rock is directly ahead
      if (g.rocks && g.rocks.length && !g.jump && g.jumpCooldown === 0) {
        for (let ri = 0; ri < g.rocks.length; ri++) {
          const rd = wrap(g.rocks[ri].local + g.angle - TOP);
          if (Math.abs(rd) < 0.45 && (rd > 0 === (dir > 0))) {
            if (mode === 'strong' || Math.random() < 0.4) {
              boost = true;
            }
          }
        }
      }

      // Slam when airborne above crowd (strong mode only)
      if (mode === 'strong' && g.jump && g.jump.p > 0.25) {
        let crowd = 0;
        for (let i = 0; i < g.aliens.length; i++) {
          if (Math.abs(wrap(g.aliens[i].local + g.angle - TOP)) < 0.5) crowd++;
        }
        if (crowd >= 2 || (g.boss && Math.abs(wrap(g.boss.local + g.angle - TOP)) < 0.5)) {
          slam = true;
        }
      }

      // Super activation
      if (g.superCharge >= 100 && g.superTime === 0) {
        if (mode === 'strong') {
          superActive = true;
        } else if (Math.random() < 0.02) {
          superActive = true;
        }
      }

      // Sloppy mode: player hesitates, takes hits, rarely jumps, drops combos
      if (mode === 'sloppy') {
        if (Math.random() < 0.35) {
          dir = Math.random() < 0.5 ? -dir : 0;
        }
      }

      g.update({ dir, boost, slam, super: superActive });
    }

    const won = CC.game.state === 'won';
    const res = CC.game.result(won);
    return {
      level,
      won,
      frames,
      seconds: (frames / 60).toFixed(1),
      score: res.score,
      target: res.target,
      stars: res.stars,
      health: res.health,
      crushes: res.crushes,
      combo: res.bestCombo
    };
  }, { level, mode });
}

(async () => {
  const args = parseArgs();
  const server = await serve(ROOT);
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(base + '/index.html');
  await page.waitForSelector('#menu.show', { timeout: 10000 });

  const levels = args.level ? [args.level] : Array.from({ length: 20 }, (_, i) => i + 21);
  console.log(`\nTesting Sector 2 balance (${levels.length} levels, ${args.runs} runs each)...\n`);

  let totalRuns = 0;
  let wonRuns = 0;
  let threeStarRuns = 0;
  let slowRuns = 0;

  for (const lv of levels) {
    let lvWins = 0;
    let lv3Stars = 0;
    let avgSec = 0;
    let lastResult = null;

    for (let r = 0; r < args.runs; r++) {
      totalRuns++;
      const res = await runBot(page, lv, 'strong');
      lastResult = res;
      if (res.won) {
        wonRuns++;
        lvWins++;
        if (res.stars === 3) {
          threeStarRuns++;
          lv3Stars++;
        }
      }
      avgSec += parseFloat(res.seconds);
      if (parseFloat(res.seconds) > 180) slowRuns++;
    }

    avgSec = (avgSec / args.runs).toFixed(1);
    const starStr = '★'.repeat(lastResult.stars) + '☆'.repeat(3 - lastResult.stars);
    console.log(`L${String(lv).padStart(2)}: Won ${lvWins}/${args.runs} | 3-Star ${lv3Stars}/${args.runs} | Avg ${avgSec}s | Score ${lastResult.score.toLocaleString()} / Target ${lastResult.target.toLocaleString()} (${starStr})`);
  }

  // Also test a couple levels with sloppy bot to confirm it gets 0-1 stars or loses
  console.log('\nTesting sloppy bot runs (should earn 0-1 stars)...');
  for (const lv of [22, 28, 35]) {
    const res = await runBot(page, lv, 'sloppy');
    const starStr = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
    console.log(`L${lv} (Sloppy): ${res.won ? 'Won' : 'Lost'} | ${res.seconds}s | Stars: ${res.stars} (${starStr}) | Health: ${res.health}`);
  }

  await browser.close();
  server.close();

  const winRate = ((wonRuns / totalRuns) * 100).toFixed(0);
  const threeStarRate = ((threeStarRuns / totalRuns) * 100).toFixed(0);

  console.log(`\nOverall Strong Bot:`);
  console.log(`  Win rate: ${winRate}% (${wonRuns}/${totalRuns})`);
  console.log(`  3-Star rate: ${threeStarRate}% (${threeStarRuns}/${totalRuns})`);
  console.log(`  Runs over 3 minutes: ${slowRuns}`);

  const passed = wonRuns === totalRuns && slowRuns === 0 && threeStarRuns >= Math.floor(totalRuns * 0.55);
  console.log(passed ? '\nSector 2 balance tests PASSED!' : '\nBalance tests FAILED!');
  process.exit(passed ? 0 : 1);
})();
