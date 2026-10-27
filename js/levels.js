// Level table. Formulas come from the blueprint (§3):
//   spawn interval S(L) = max(30, 120 − 0.9L) frames
//   alien speed    V(L) = 0.8 + 0.02L
//   crush goal     G(L) = 15 + 5L
(function (CC) {
  'use strict';

  var SECTORS = [
    { id: 1, name: 'The Inner Ring', first: 1, last: 20, planet: 'moon', available: true },
    { id: 2, name: 'Asteroid Belt', first: 21, last: 40, available: false },
    { id: 3, name: 'Gas Giants', first: 41, last: 60, available: false },
    { id: 4, name: 'Deep Outer Rim', first: 61, last: 80, available: false },
    { id: 5, name: 'Cosmic Edge', first: 81, last: 100, available: false }
  ];

  var MAX_PLAYABLE = 20;

  function spawnFrames(L) { return Math.max(30, 120 - L * 0.9); }
  function alienSpeed(L) { return 0.8 + 0.02 * L; }
  function crushGoal(L) { return 15 + L * 5; }

  // Which enemy types a level can spawn, as weights.
  function enemyMix(L) {
    var mix = { crawler: 1 };
    if (L >= 4) mix.bouncer = Math.min(0.45, 0.15 + 0.03 * (L - 4));
    if (L >= 11) mix.roller = Math.min(0.3, 0.1 + 0.025 * (L - 11));
    return mix;
  }

  // Score needed for the third star (see CC.config.stars).
  function starTarget(goal, mix, burst, maxAlive, boss) {
    var C = CC.config, P = C.stars, S = C.score;
    var weight = 0, points = 0;
    for (var k in mix) { weight += mix[k]; points += mix[k] * C.enemies[k].score; }
    var crush = goal * points / weight * burst * (P.comboBase + P.comboPerAlive * maxAlive);
    var bossPts = boss ? C.boss[boss.type].hp * boss.hpScale * S.bossHit + S.bossDefeat : 0;
    var clear = C.astronaut.maxHealth * P.clearHealth * S.clearPerHealth;
    return Math.round((crush + bossPts + clear) / 250) * 250;
  }

  function splitGoal(total, waves) {
    var base = Math.floor(total / waves);
    var out = [];
    for (var i = 0; i < waves; i++) out.push(base + (i < total % waves ? 1 : 0));
    return out;
  }

  CC.levels = {
    sectors: SECTORS,
    maxPlayable: MAX_PLAYABLE,
    spawnFrames: spawnFrames,
    alienSpeed: alienSpeed,
    crushGoal: crushGoal,

    sectorFor: function (L) {
      for (var i = 0; i < SECTORS.length; i++) {
        if (L >= SECTORS[i].first && L <= SECTORS[i].last) return SECTORS[i];
      }
      return SECTORS[0];
    },

    get: function (L) {
      L = Math.max(1, Math.min(MAX_PLAYABLE, L | 0));
      var goal = crushGoal(L);
      var boss = null;
      if (L % 10 === 0) {
        // Mid-sector mini boss on 10, full sector boss on 20.
        var full = L % 20 === 0;
        boss = { type: 'blob', scale: full ? 1 : 0.72, hpScale: full ? 1 : 0.5, mini: !full };
        goal = Math.round(goal * 0.4); // shorter minion phase before the boss
      }
      var waves = boss ? 2 : 3 + Math.floor(L / 7);
      // More aliens per spawn tick later on keeps long levels moving.
      var burst = 1 + Math.floor(L / 8);
      var maxAlive = 8 + Math.floor(L / 3);
      var mix = enemyMix(L);
      return {
        level: L,
        sector: this.sectorFor(L),
        spawnFrames: spawnFrames(L),
        speed: alienSpeed(L),
        burst: burst,
        maxAlive: maxAlive,
        goal: goal,
        waves: splitGoal(goal, waves),
        walkScale: 1 + L * 0.02,
        mix: mix,
        boss: boss,
        target: starTarget(goal, mix, burst, maxAlive, boss)
      };
    }
  };
})(window.CC = window.CC || {});
