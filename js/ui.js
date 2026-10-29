// Menus and screens: main menu, level select, settings, leaderboard,
// weapons preview, how-to, pause and results.
(function (CC) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var game;
  var current = null;
  var backStack = [];
  var lastResult = null;
  var touch = false;

  var WEAPONS = [
    { id: 'gravity_launcher', name: 'Gravity Launcher', text: 'Pulls falling aliens straight down into your path.' },
    { id: 'meteor_hammer', name: 'Meteor Hammer', text: 'Supercharges SLAM with a huge fiery shockwave.' },
    { id: 'plasma_blaster', name: 'Plasma Blaster', text: 'Auto-zaps the nearest falling alien.' },
    { id: 'sonic_blunderbuss', name: 'Sonic Wave Blunderbuss', text: 'A sound blast that knocks aliens back and stuns them.' },
    { id: 'orbit_discs', name: 'Orbit Discs', text: 'Two saw discs circle the planet, shredding what they touch.' },
    { id: 'quantum_grapple', name: 'Quantum Grapple', text: 'Yanks hovering enemies down to be crushed.' },
    { id: 'super_size_booster', name: 'Super-Size Booster', text: 'Grow giant for a few seconds: a much wider crush zone.' },
    { id: 'alien_harpoon', name: 'Alien Harpoon', text: 'Pierces a line of aliens; heavy damage to bosses.' }
  ];

  function settings() { return CC.storage.data.settings; }

  // ---- Screen routing -------------------------------------------------------------

  function show(id, opts) {
    opts = opts || {};
    if (current && current !== id && !opts.noStack) backStack.push(current);
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('show', s.id === id); });
    current = id;
    if (id === 'levels') renderLevels();
    if (id === 'settings') renderSettings();
  }

  function hideScreens() {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('show'); });
    current = null;
    backStack = [];
  }

  function back() {
    var prev = backStack.pop() || 'menu';
    show(prev, { noStack: true });
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ---- Flow -------------------------------------------------------------------------

  function goMenu() {
    game.startAttract();
    CC.hud.show(false);
    CC.input.setEnabled(false);
    backStack = [];
    current = null;
    show('menu', { noStack: true });
    CC.audio.startMusic('menu');
  }

  // The level map, with the main menu behind it for BACK.
  function goLevels() {
    goMenu();
    show('levels');
  }

  function startLevel(n) {
    var d = CC.storage.data;
    if (!d.seenHowTo) {
      d.seenHowTo = true;
      CC.storage.save();
      $('howtoGo').onclick = function () { CC.audio.play('ui'); startLevel(n); };
      backStack = [];
      current = null;
      show('howto', { noStack: true });
      return;
    }
    hideScreens();
    game.setPlanet(d.planet || 'moon');
    game.startLevel(n);
    CC.hud.show(true);
    CC.input.setEnabled(true);
    if (settings().controls === 'tilt') CC.input.enableTilt();
  }

  function pauseGame() {
    if (game.mode !== 'level' || game.state === 'done' || current === 'results') return;
    if (game.state === 'paused') { resumeGame(); return; }
    game.pause();
    if (game.state !== 'paused') return;
    CC.input.setEnabled(false);
    backStack = [];
    current = null;
    show('pause', { noStack: true });
  }

  // Esc / Android back: close the open screen, or pause a running level.
  // Returns false at the main menu so the app can exit there.
  var CLOSABLE = { levels: 1, settings: 1, weapons: 1 };
  function escape() {
    if (current && CLOSABLE[current]) { back(); return true; }
    if (current === 'howto') { $('howtoGo').click(); return true; }
    if (current === 'pause') { resumeGame(); return true; }
    if (current === 'results') { goLevels(); return true; }
    if (!current && game.mode === 'level') { pauseGame(); return true; }
    return false;
  }

  // The system paused us (YouTube onPause, app backgrounded, tab hidden).
  function systemPause() {
    if (!game) return;
    if (game.mode === 'level' && !current && game.state !== 'paused' && game.state !== 'done') pauseGame();
  }

  function resumeGame() {
    hideScreens();
    game.resume();
    CC.input.setEnabled(true);
  }

  function onResult(result) {
    lastResult = result;
    CC.input.setEnabled(false);
    var rec = CC.storage.recordLevel(result);
    var last = result.won && result.level >= CC.levels.maxPlayable;
    var sec1 = result.won && result.level === 20;
    var sec2 = result.won && result.level === 40;
    $('resTitle').textContent = !result.won ? 'CRUSHED!' : sec1 ? 'SECTOR 1 CLEARED!' : sec2 ? 'SECTOR 2 CLEARED!' : 'LEVEL ' + result.level + ' CLEAR!';
    $('resPlate').classList.toggle('red', !result.won);
    $('resSplat').classList.toggle('hidden', result.won);
    // Stars always show, empty on a loss; the checklist says what each needs.
    $('resStars').querySelectorAll('span').forEach(function (s, i) { s.classList.toggle('on', i < result.stars); });
    $('resStars').setAttribute('aria-label', result.stars + ' of 3 stars');
    $('goalClear').classList.toggle('done', result.won);
    $('goalHealth').classList.toggle('done', result.won && result.healthy);
    $('goalScore').classList.toggle('done', result.won && result.score >= result.target);
    $('goalScoreVal').textContent = result.target.toLocaleString('en-US');
    $('resScore').textContent = result.score.toLocaleString('en-US');
    $('resCrushes').textContent = result.crushes;
    $('resCombo').textContent = 'x' + result.bestCombo;
    $('resBest').classList.toggle('hidden', !rec.newBest || result.score === 0);
    $('resRank').textContent = rec.rank === 0 ? 'YOUR BEST RUN EVER!' : rec.rank > 0 ? '#' + (rec.rank + 1) + ' IN YOUR TOP RUNS' : '';
    $('resRank').classList.toggle('hidden', rec.rank < 0);
    var next = $('resNext');
    next.classList.toggle('hidden', !result.won || last);
    // Tell the player plainly when there is nothing more to play yet.
    $('resEnd').classList.toggle('hidden', !last);
    backStack = [];
    current = null;
    show('results', { noStack: true });
  }

  // ---- Screens ------------------------------------------------------------------------

  function renderLevels() {
    var d = CC.storage.data;
    var list = $('levelList');
    var next = Math.min(d.unlocked, CC.levels.maxPlayable);
    var nextTile = null;
    list.innerHTML = '';
    $('starTotal').textContent = '★ ' + CC.storage.totalStars() + ' / ' + CC.levels.maxPlayable * 3;
    CC.levels.sectors.forEach(function (sec) {
      var wrap = document.createElement('div');
      wrap.className = 'sector' + (sec.available ? '' : ' locked');
      var head = document.createElement('div');
      head.className = 'sector-head';
      head.innerHTML = '<span>SECTOR ' + sec.id + ' · ' + sec.name.toUpperCase() + '</span><span class="range">' + sec.first + '–' + sec.last + '</span>';
      wrap.appendChild(head);
      if (!sec.available) {
        var soon = document.createElement('div');
        soon.className = 'soon';
        soon.textContent = 'COMING SOON';
        wrap.appendChild(soon);
      } else {
        var grid = document.createElement('div');
        grid.className = 'level-grid';
        for (var n = sec.first; n <= sec.last; n++) {
          var b = document.createElement('button');
          var info = d.levels[n] || { stars: 0, best: 0 };
          var open = n <= d.unlocked;
          var boss = n % 10 === 0;
          b.className = 'level-tile' + (open ? '' : ' locked') + (boss ? ' boss' : '') + (n === next ? ' next' : '');
          b.disabled = !open;
          b.innerHTML = '<span class="num">' + (open ? n : '🔒') + '</span>' +
            '<span class="st">' + [0, 1, 2].map(function (i) { return '<i class="' + (i < info.stars ? 'on' : '') + '">★</i>'; }).join('') + '</span>' +
            (boss ? '<span class="tag">BOSS</span>' : '') +
            (n === next ? '<span class="play">PLAY</span>' : '');
          b.setAttribute('aria-label', 'Level ' + n + (open ? ', ' + info.stars + ' of 3 stars' : ' (locked)'));
          if (n === next) nextTile = b;
          (function (lvl) { b.onclick = function () { CC.audio.play('ui'); startLevel(lvl); }; })(n);
          grid.appendChild(b);
        }
        wrap.appendChild(grid);
      }
      list.appendChild(wrap);
    });
    if (nextTile) nextTile.scrollIntoView({ block: 'nearest' });
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function renderWeapons() {
    var list = $('weaponList');
    list.innerHTML = '';
    WEAPONS.forEach(function (w) {
      var card = document.createElement('div');
      card.className = 'weapon-card';
      card.innerHTML = '<div class="w-img"></div>' +
        '<div class="w-name"></div><div class="w-text"></div><div class="w-lock">LOCKED</div>';
      card.querySelector('.w-name').textContent = w.name;
      card.querySelector('.w-text').textContent = w.text;
      var box = card.querySelector('.w-img');
      var url = CC.assets.url('weapon_' + w.id);
      if (url) {
        var img = new Image();
        img.alt = '';
        img.onerror = function () { box.classList.add('missing'); img.remove(); };
        img.src = url;
        box.appendChild(img);
      } else {
        box.classList.add('missing');
      }
      list.appendChild(card);
    });
  }

  function renderSettings() {
    var s = settings();
    $('setMusic').value = Math.round(s.music * 100);
    $('setSfx').value = Math.round(s.sfx * 100);
    $('musicPct').textContent = Math.round(s.music * 100) + '%';
    $('sfxPct').textContent = Math.round(s.sfx * 100) + '%';
    setToggle($('setVibration'), s.vibration);
    setToggle($('setShake'), s.shake);
    document.querySelectorAll('.style-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-controls') === s.controls);
    });
    paintSlider($('setMusic'));
    paintSlider($('setSfx'));
    updateFullscreenUI();
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function toggleFullscreen() {
    if (!isFullscreen()) {
      var el = document.documentElement;
      var rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (rfs) rfs.call(el).catch(function () {});
    } else {
      var efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (efs) efs.call(document).catch(function () {});
    }
  }

  function updateFullscreenUI() {
    var fs = isFullscreen();
    document.querySelectorAll('.fs-enter').forEach(function (el) { el.classList.toggle('hidden', fs); });
    document.querySelectorAll('.fs-exit').forEach(function (el) { el.classList.toggle('hidden', !fs); });
    var setBtn = $('setFullscreen');
    if (setBtn) setToggle(setBtn, fs);
  }

  function setToggle(btn, on) {
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.innerHTML = '<span class="t-on">ON</span><span class="t-off">OFF</span><span class="knob"></span>';
  }

  function paintSlider(input) {
    input.style.setProperty('--v', input.value + '%');
  }

  function applySettings() {
    var s = settings();
    CC.audio.setVolumes(s.music, s.sfx);
    // On YouTube the player's own mute is the only mute (no in-game button).
    CC.audio.setMuted(CC.platform.id === 'youtube' ? false : s.muted);
    game.settings.shake = s.shake;
    CC.hud.setControls(s.controls, touch);
    document.getElementById('btnSound').classList.toggle('muted', !!s.muted);
  }

  function bindSettings() {
    ['setMusic', 'setSfx'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        var v = this.value / 100;
        if (id === 'setMusic') { settings().music = v; $('musicPct').textContent = this.value + '%'; }
        else { settings().sfx = v; $('sfxPct').textContent = this.value + '%'; }
        paintSlider(this);
        applySettings();
      });
      $(id).addEventListener('change', function () { CC.storage.save(); if (id === 'setSfx') CC.audio.play('splat'); });
    });
    $('setVibration').onclick = function () {
      settings().vibration = !settings().vibration;
      CC.storage.save(); renderSettings();
      if (settings().vibration) CC.platform.haptic(40);
    };
    $('setShake').onclick = function () {
      settings().shake = !settings().shake;
      CC.storage.save(); renderSettings(); applySettings();
    };
    var setFs = $('setFullscreen');
    if (setFs) {
      setFs.onclick = function () {
        toggleFullscreen();
      };
    }
    document.querySelectorAll('.style-btn').forEach(function (b) {
      b.onclick = function () {
        var mode = b.getAttribute('data-controls');
        $('tiltNote').textContent = '';
        if (mode === 'tilt') {
          CC.input.enableTilt().then(function (res) {
            var ok = (typeof res === 'object') ? res.ok : !!res;
            var reason = (typeof res === 'object') ? res.reason : '';
            if (!ok) {
              if (reason === 'insecure' || (typeof window !== 'undefined' && window.isSecureContext === false)) {
                $('tiltNote').textContent = 'Tilt requires HTTPS (SSL). Enable SSL in CloudPanel to use tilt.';
              } else if (reason === 'denied') {
                $('tiltNote').textContent = 'Motion sensor permission was denied in your browser settings.';
              } else {
                $('tiltNote').textContent = 'Tilt sensors blocked or unavailable. Check browser permissions.';
              }
              settings().controls = 'tilt';
            } else {
              settings().controls = 'tilt';
              $('tiltNote').textContent = 'Tilt your phone left and right to spin.';
            }
            CC.storage.save(); renderSettings(); applySettings();
          });
        } else {
          CC.input.disableTilt();
          settings().controls = 'dpad';
          $('tiltNote').textContent = 'Slide the virtual joystick left and right to spin with analog control.';
          CC.storage.save(); renderSettings(); applySettings();
        }
      };
    });
  }

  // ---- Wiring ---------------------------------------------------------------------------

  function bindGameEvents() {
    var A = CC.audio;
    function buzz(ms) { if (settings().vibration && game.mode === 'level') CC.platform.haptic(ms); }
    game.on('crush', function (e) { A.play('splat', e); buzz(12); });
    game.on('hurt', function () { A.play('hurt'); buzz([40, 30, 40]); });
    game.on('boost', function () { A.play('boost'); });
    game.on('slam', function () { A.play('slam'); buzz(30); });
    game.on('super', function () { A.play('super'); buzz(60); });
    game.on('superReady', function () { A.play('superReady'); });
    game.on('superEnd', function () { A.play('superEnd'); });
    game.on('land', function () { if (game.mode === 'level') A.play('land'); });
    game.on('goo', function () { A.play('goo'); });
    game.on('bossIntro', function () { A.play('bossIntro'); A.startMusic('boss'); });
    game.on('bossLand', function () { A.play('bossLand'); buzz(80); });
    game.on('bossHit', function () { A.play('bossHit'); buzz(50); });
    game.on('bossDown', function () { A.play('bossDown'); buzz([60, 40, 120]); });
    game.on('wave', function () { A.play('wave'); });
    game.on('boing', function () { A.play('boing'); });
    game.on('stumble', function () { A.play('stumble'); buzz(60); });
    game.on('planet', function (e) {
      A.play('planet');
      if (game.mode === 'level') { CC.storage.data.planet = e.key; CC.storage.save(); }
    });
    game.on('levelStart', function () { A.startMusic('game'); });
    game.on('levelClear', function () { A.play('win'); });
    game.on('dead', function () { A.play('lose'); buzz(200); });
    game.on('win', onResult);
    game.on('lose', onResult);
  }

  // Images that fail to load are replaced by text (data-fallback) or removed.
  // Done here rather than with inline onerror="" so YouTube's script policy,
  // which only allows nonce-tagged scripts, has nothing to block.
  function bindImageFallbacks() {
    document.querySelectorAll('img[data-fallback]').forEach(function (img) {
      function swap() {
        var fb = img.getAttribute('data-fallback');
        if (fb === 'logo') {
          var h = document.createElement('h1');
          h.className = 'title-text big';
          h.innerHTML = 'ASTRO<br>SPIN';
          img.replaceWith(h);
        } else if (fb) {
          img.replaceWith(document.createTextNode(fb));
        } else {
          img.remove();
        }
      }
      if (img.complete && img.naturalWidth === 0) swap();
      else img.addEventListener('error', swap);
    });
  }

  function init(g, opts) {
    game = g;
    touch = !!opts.touch;
    bindImageFallbacks();

    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { CC.audio.play('ui'); show(b.getAttribute('data-go')); });
    });
    document.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { CC.audio.play('ui'); back(); });
    });
    document.querySelectorAll('[data-action]').forEach(function (b) {
      b.addEventListener('click', function () {
        CC.audio.play('ui');
        var a = b.getAttribute('data-action');
        if (a === 'start') {
          if (touch && !isFullscreen()) {
            var el = document.documentElement;
            var rfs = el.requestFullscreen || el.webkitRequestFullscreen;
            if (rfs) rfs.call(el).catch(function () {});
          }
          show('levels');
        }
        else if (a === 'levels') goLevels();
        else if (a === 'resume') resumeGame();
        else if (a === 'restart') startLevel(game.level.level);
        else if (a === 'retry') startLevel(lastResult ? lastResult.level : 1);
        else if (a === 'next') startLevel(Math.min(CC.levels.maxPlayable, (lastResult ? lastResult.level : 0) + 1));
        else if (a === 'quit') goMenu();
        else if (a === 'howto') {
          $('howtoGo').onclick = function () { CC.audio.play('ui'); back(); };
          show('howto');
        }
      });
    });

    var btnFs = $('btnFullscreen');
    if (btnFs) btnFs.addEventListener('click', function () { CC.audio.play('ui'); toggleFullscreen(); });
    var btnMenuFs = $('btnMenuFullscreen');
    if (btnMenuFs) btnMenuFs.addEventListener('click', function () { CC.audio.play('ui'); toggleFullscreen(); });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, updateFullscreenUI);
    });

    $('btnPause').addEventListener('click', function () { CC.audio.play('ui'); pauseGame(); });
    $('btnSound').addEventListener('click', function () {
      settings().muted = !settings().muted;
      CC.storage.save();
      applySettings();
    });
    document.querySelectorAll('#selector button').forEach(function (b) {
      b.addEventListener('click', function () { game.setPlanet(b.getAttribute('data-planet')); });
    });

    CC.input.on('pause', pauseGame);
    CC.input.on('escape', escape);
    CC.platform.onBack(function () { if (!escape()) CC.platform.exitApp(); });
    CC.input.on('planet', function (key) { if (game.mode === 'level' && game.state !== 'paused') game.setPlanet(key); });

    document.body.classList.add('platform-' + CC.platform.id);
    if (!CC.platform.tiltAvailable) document.querySelector('.style-btn[data-controls="tilt"]').classList.add('hidden');

    if (!touch) {
      $('howtoKeys').classList.add('show');
    }

    bindSettings();
    bindGameEvents();
    renderWeapons();
    applySettings();
  }

  CC.ui = {
    init: init,
    systemPause: systemPause,
    goMenu: goMenu,
    startLevel: startLevel,
    show: show,
    toast: toast
  };
})(window.CC = window.CC || {});
