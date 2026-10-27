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
  check(lv.sector.id === 1, `L${n} is in sector 1`);
}
check(L.get(10).boss.mini === true && L.get(20).boss.mini === false, 'mini boss on 10, full boss on 20');
check(L.get(99).level === L.maxPlayable, 'levels past the playable range clamp');

const rows = [1, 4, 10, 11, 19, 20].map((n) => {
  const lv = L.get(n);
  return `L${String(n).padStart(2)}  spawn ${lv.spawnFrames.toFixed(1)}f  speed ${lv.speed.toFixed(2)}  goal ${lv.goal}  waves ${lv.waves.join('/')}  burst ${lv.burst}${lv.boss ? '  BOSS' : ''}`;
});
console.log(rows.join('\n'));
console.log(failed ? `\n${failed} check(s) failed` : '\nlevel table OK');
process.exit(failed ? 1 : 0);
