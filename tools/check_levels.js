#!/usr/bin/env node
// Sanity checks for the level table against the blueprint formulas.
//   node tools/check_levels.js
'use strict';

global.window = global;
require('../js/config.js');
require('../js/levels.js');

const L = global.CC.levels;
let failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.log('FAIL ' + msg); }
}

for (let n = 1; n <= L.maxPlayable; n++) {
  const lv = L.get(n);
  check(lv.spawnFrames === Math.max(30, 120 - n * 0.9), `L${n} spawn interval`);
  check(Math.abs(lv.speed - (0.8 + 0.02 * n)) < 1e-9, `L${n} alien speed`);
  const goal = 15 + n * 5;
  const isBoss = n % 10 === 0;
  check(!!lv.boss === isBoss, `L${n} boss flag`);
  check(lv.goal === (isBoss ? Math.round(goal * 0.4) : goal), `L${n} crush goal`);
  check(lv.waves.reduce((a, b) => a + b, 0) === lv.goal, `L${n} waves add up to the goal`);
  check(lv.waves.length === (isBoss ? 2 : 3 + Math.floor(n / 7)), `L${n} wave count`);
  check(!!lv.mix.bouncer === n >= 4, `L${n} bouncers from level 4`);
  check(!!lv.mix.roller === n >= 11, `L${n} rollers from level 11`);
  check(!!lv.mix.beetle === n >= 21, `L${n} beetles from level 21`);
  check(lv.sector.id === (n <= 20 ? 1 : 2), `L${n} is in sector ${n <= 20 ? 1 : 2}`);
}
check(L.get(10).boss.mini === true && L.get(20).boss.mini === false, 'mini boss on 10, full boss on 20');
check(L.get(30).boss.mini === true && L.get(40).boss.mini === false, 'mini boss on 30, full boss on 40');
check(L.get(10).boss.type === 'blob' && L.get(30).boss.type === 'rockgolem', 'Sector 1 blob vs Sector 2 rockgolem');

// Three-star target scores: positive, a multiple of 250, and growing with
// the level (boss levels have a shorter minion phase, so compare them with
// each other).
let prev = 0, prevBoss = 0;
for (let n = 1; n <= L.maxPlayable; n++) {
  const t = L.get(n).target;
  check(Number.isInteger(t) && t > 0 && t % 250 === 0, `L${n} star target is a positive multiple of 250 (${t})`);
  if (n % 10 === 0) { check(t > prevBoss, `L${n} boss target grows`); prevBoss = t; }
  else { check(t > prev, `L${n} target grows (${prev} -> ${t})`); prev = t; }
}
check(L.get(99).level === L.maxPlayable, 'levels past the playable range clamp');

const rows = [1, 4, 10, 11, 19, 20, 21, 30, 31, 40].map((n) => {
  const lv = L.get(n);
  return `L${String(n).padStart(2)}  spawn ${lv.spawnFrames.toFixed(1)}f  speed ${lv.speed.toFixed(2)}  goal ${lv.goal}  waves ${lv.waves.join('/')}  burst ${lv.burst}${lv.boss ? '  BOSS' : ''}`;
});
console.log(rows.join('\n'));
console.log('3-star targets: ' + Array.from({ length: L.maxPlayable }, (_, i) => `L${i + 1} ${L.get(i + 1).target}`).join(', '));
console.log(failed ? `\n${failed} check(s) failed` : '\nlevel table OK');
process.exit(failed ? 1 : 0);
