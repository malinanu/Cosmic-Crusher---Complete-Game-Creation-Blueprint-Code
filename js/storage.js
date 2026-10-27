// Save data: progress, settings and the top runs on this device. Reading and
// writing go through CC.platform (YouTube cloud save, the app's preferences,
// or localStorage). The game still runs on defaults if a save can't be read.
(function (CC) {
  'use strict';

  var VERSION = 2;
  var TOP_RUNS = 10;

  function defaults() {
    return {
      version: VERSION,
      unlocked: 1,
      levels: {},          // { "3": { best: 1234, stars: 2 } }
      leaderboard: [],     // top runs: [{ score, level, date }] best first, no names
      planet: 'moon',
      seenHowTo: false,
      settings: { music: 0.7, sfx: 0.9, vibration: true, shake: true, controls: 'dpad', muted: false }
    };
  }

  var data = defaults();
  var timer = null;

  function int(v, min, max) {
    v = Math.floor(Number(v));
    if (!isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  // Accept saves from any earlier version (or garbage) without crashing.
  function migrate(raw) {
    var d = defaults();
    var p;
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    if (!p || typeof p !== 'object') return d;
    d.unlocked = int(p.unlocked, 1, CC.levels.maxPlayable);
    if (p.levels && typeof p.levels === 'object') {
      for (var k in p.levels) {
        var lv = p.levels[k];
        if (lv && /^\d+$/.test(k)) d.levels[k] = { best: int(lv.best, 0, 1e12), stars: int(lv.stars, 0, 3) };
      }
    }
    if (Array.isArray(p.leaderboard)) {
      // v1 entries carried a player name; it is dropped here.
      d.leaderboard = p.leaderboard
        .filter(function (e) { return e && e.score > 0; })
        .map(function (e) { return { score: int(e.score, 0, 1e12), level: int(e.level, 1, 999), date: int(e.date, 0, 1e15) }; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, TOP_RUNS);
    }
    if (typeof p.planet === 'string' && CC.config.planets[p.planet]) d.planet = p.planet;
    d.seenHowTo = !!p.seenHowTo;
    var s = p.settings || {};
    if (typeof s.music === 'number') d.settings.music = Math.max(0, Math.min(1, s.music));
    if (typeof s.sfx === 'number') d.settings.sfx = Math.max(0, Math.min(1, s.sfx));
    if (typeof s.vibration === 'boolean') d.settings.vibration = s.vibration;
    if (typeof s.shake === 'boolean') d.settings.shake = s.shake;
    if (s.controls === 'tilt' || s.controls === 'dpad') d.settings.controls = s.controls;
    if (typeof s.muted === 'boolean') d.settings.muted = s.muted;
    return d;
  }

  function load() {
    return CC.platform.load().then(function (raw) {
      data = migrate(raw);
      // Keep YouTube's displayed best in step with the save.
      if (data.leaderboard.length) CC.platform.sendScore(data.leaderboard[0].score);
      return data;
    });
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    return CC.platform.save(JSON.stringify(data));
  }

  // Settings and small changes are batched; progress is saved right away.
  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }

  function recordLevel(result) {
    var key = String(result.level);
    var prev = data.levels[key] || { best: 0, stars: 0 };
    var out = { newBest: result.score > prev.best, rank: -1 };
    data.levels[key] = { best: Math.max(prev.best, result.score), stars: Math.max(prev.stars, result.stars) };
    if (result.won) data.unlocked = Math.max(data.unlocked, Math.min(CC.levels.maxPlayable, result.level + 1));

    if (result.score > 0) {
      var lb = data.leaderboard;
      var oldTop = lb.length ? lb[0].score : 0;
      var entry = { score: result.score, level: result.level, date: Date.now() };
      lb.push(entry);
      lb.sort(function (a, b) { return b.score - a.score; });
      data.leaderboard = lb.slice(0, TOP_RUNS);
      out.rank = data.leaderboard.indexOf(entry);
      if (data.leaderboard[0].score > oldTop) CC.platform.sendScore(data.leaderboard[0].score);
    }
    flush();
    return out;
  }

  function totalStars() {
    var n = 0;
    for (var k in data.levels) n += data.levels[k].stars || 0;
    return n;
  }

  CC.storage = {
    load: load,
    save: save,
    flush: flush,
    migrate: migrate,
    get data() { return data; },
    recordLevel: recordLevel,
    totalStars: totalStars
  };
})(window.CC = window.CC || {});
