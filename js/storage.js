// Save data in localStorage. Storage can be unavailable (private windows,
// blocked site data), so every access is guarded and the game still runs
// with in-memory defaults.
(function (CC) {
  'use strict';

  var KEY = 'cosmicCrusher.save.v1';

  function defaults() {
    return {
      version: 1,
      unlocked: 1,
      levels: {},          // { "3": { best: 1234, stars: 2 } }
      leaderboard: [],     // [{ name, score, level, date }]
      lastName: '',
      planet: 'moon',
      seenHowTo: false,
      settings: { music: 0.7, sfx: 0.9, vibration: true, shake: true, controls: 'dpad', muted: false }
    };
  }

  var data = defaults();

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var d = defaults();
        for (var k in parsed) d[k] = parsed[k];
        d.settings = Object.assign(defaults().settings, parsed.settings || {});
        data = d;
      }
    } catch (e) {
      data = defaults();
    }
    return data;
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }

  function recordLevel(result) {
    var key = String(result.level);
    var prev = data.levels[key] || { best: 0, stars: 0 };
    var out = { newBest: result.score > prev.best };
    data.levels[key] = { best: Math.max(prev.best, result.score), stars: Math.max(prev.stars, result.stars) };
    if (result.won) data.unlocked = Math.max(data.unlocked, Math.min(CC.levels.maxPlayable, result.level + 1));
    save();
    return out;
  }

  function qualifies(score) {
    if (score <= 0) return false;
    var lb = data.leaderboard;
    return lb.length < 10 || score > lb[lb.length - 1].score;
  }

  function addScore(name, score, level) {
    name = (name || 'CADET').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').slice(0, 12) || 'CADET';
    data.lastName = name;
    var entry = { name: name, score: score, level: level, date: Date.now() };
    data.leaderboard.push(entry);
    data.leaderboard.sort(function (a, b) { return b.score - a.score; });
    data.leaderboard = data.leaderboard.slice(0, 10);
    save();
    return data.leaderboard.indexOf(entry);
  }

  function totalStars() {
    var n = 0;
    for (var k in data.levels) n += data.levels[k].stars || 0;
    return n;
  }

  CC.storage = {
    load: load,
    save: save,
    get data() { return data; },
    recordLevel: recordLevel,
    qualifies: qualifies,
    addScore: addScore,
    totalStars: totalStars
  };
})(window.CC = window.CC || {});
