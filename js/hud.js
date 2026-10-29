// The in-game HUD (DOM overlay). update() is called every frame and only
// touches the DOM when a value actually changes.
(function (CC) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var last = {};
  var NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // Gauge: half circle from 180° (slow) to 360° (max spin).
  var GX = 100, GY = 104, GR = 78;
  function pt(frac, r) {
    var a = Math.PI + frac * Math.PI;
    return (GX + Math.cos(a) * r).toFixed(2) + ' ' + (GY + Math.sin(a) * r).toFixed(2);
  }

  function buildGauge() {
    var g = $('gauge');
    var cols = ['#3b82f6', '#22d3ee', '#22c55e', '#facc15', '#f97316', '#ef4444'];
    svg('path', { d: 'M' + pt(0, GR) + ' A' + GR + ' ' + GR + ' 0 0 1 ' + pt(1, GR), class: 'g-back' }, g);
    for (var i = 0; i < cols.length; i++) {
      var a0 = i / cols.length, a1 = (i + 1) / cols.length;
      svg('path', { d: 'M' + pt(a0 + 0.004, GR) + ' A' + GR + ' ' + GR + ' 0 0 1 ' + pt(a1 - 0.004, GR), stroke: cols[i], class: 'g-seg' }, g);
    }
    for (i = 0; i <= 10; i++) {
      svg('path', { d: 'M' + pt(i / 10, GR - 16) + ' L' + pt(i / 10, GR - 24), class: 'g-tick' }, g);
    }
    el.thr = svg('path', { d: 'M100 ' + (GY - GR - 13) + ' l-8 -12 h16 z', class: 'g-thr' }, g);
    el.needle = svg('g', { class: 'g-needle' }, g);
    svg('path', { d: 'M96 ' + GY + ' L100 ' + (GY - GR + 10) + ' L104 ' + GY + ' Z' }, el.needle);
    svg('circle', { cx: GX, cy: GY, r: 9, class: 'g-hub' }, g);
  }

  function init() {
    el.hud = $('hud');
    el.hp = $('hpFill');
    el.score = $('score');
    el.target = $('target');
    el.targetVal = $('targetVal');
    el.waveText = $('waveText');
    el.waveRing = $('waveRing');
    el.superFill = $('superFill');
    el.superLabel = $('superLabel');
    el.bossBar = $('bossBar');
    el.bossFill = $('bossFill');
    el.bossName = $('bossName');
    el.boostBtn = $('btnBoost');
    el.superBtn = $('btnSuper');
    el.boostCd = $('boostCd');
    el.superCd = $('superCd');
    buildGauge();
  }

  function set(key, value, fn) {
    if (last[key] === value) return;
    last[key] = value;
    fn(value);
  }

  function update(game) {
    if (!el.hud || el.hud.classList.contains('hidden')) return;
    var h = game.hud();
    set('hp', Math.round(h.health * 1000), function () {
      el.hp.style.width = (h.health * 100) + '%';
      el.hp.parentNode.classList.toggle('low', h.health < 0.3);
    });
    set('score', h.score, function (v) { el.score.textContent = v.toLocaleString('en-US'); });
    // Third-star target: turns gold once the score reaches it.
    set('target', h.target + (h.score >= h.target ? 'hit' : ''), function () {
      el.targetVal.textContent = h.target.toLocaleString('en-US');
      el.target.classList.toggle('hit', h.score >= h.target);
    });
    set('wave', h.wave + '/' + h.waves, function () {
      el.waveText.textContent = h.wave > h.waves - 1 && game.level && game.level.boss ? 'BOSS WAVE' : 'WAVE ' + h.wave;
    });
    set('wp', Math.round(h.waveProgress * 50), function () {
      var c = 2 * Math.PI * 14;
      el.waveRing.style.strokeDasharray = c;
      el.waveRing.style.strokeDashoffset = c * (1 - h.waveProgress);
    });
    set('super', Math.round(h.super * 200) + (h.superActive ? 'a' : h.superReady ? 'r' : ''), function () {
      el.superFill.style.width = (h.super * 100) + '%';
      el.superFill.parentNode.classList.toggle('ready', h.superReady);
      el.superFill.parentNode.classList.toggle('active', h.superActive);
      el.superLabel.textContent = h.superActive ? 'SHIELD UP!' : h.superReady ? 'SUPER READY!' : 'SUPER BAR';
      el.superBtn.classList.toggle('ready', h.superReady);
      el.superBtn.classList.toggle('active', h.superActive);
      el.superCd.style.setProperty('--p', h.superActive ? 1 - h.super : h.super);
    });
    set('boost', Math.round(h.boostReady * 40), function () {
      el.boostCd.style.setProperty('--p', h.boostReady);
      el.boostBtn.classList.toggle('cooling', h.boostReady < 1);
    });
    set('boss', h.boss ? h.boss.name + Math.round(h.boss.hp * 100) : '', function () {
      el.bossBar.classList.toggle('hidden', !h.boss);
      if (h.boss) {
        el.bossFill.style.width = (h.boss.hp * 100) + '%';
        el.bossName.textContent = h.boss.name + ' HP';
      }
    });
    set('thr', h.threshold, function (v) {
      el.thr.setAttribute('transform', 'rotate(' + (-90 + v * 180) + ' ' + GX + ' ' + GY + ')');
    });
    set('spin', Math.round(h.spin * 300) + (h.heat > 0.35 ? 'h' : ''), function () {
      el.needle.setAttribute('transform', 'rotate(' + (-90 + h.spin * 180) + ' ' + GX + ' ' + GY + ')');
      el.needle.classList.toggle('hot', h.heat > 0.35);
      el.needle.classList.toggle('crush', h.spin >= h.threshold);
    });
  }

  function show(v) {
    el.hud.classList.toggle('hidden', !v);
    el.hud.setAttribute('aria-hidden', v ? 'false' : 'true');
    last = {};
  }

  function setControls(mode, touch) {
    el.hud.classList.toggle('tilt-mode', mode === 'tilt');
    el.hud.classList.toggle('touch', !!touch);
  }

  CC.hud = { init: init, update: update, show: show, setControls: setControls };
})(window.CC = window.CC || {});
