// Boot: load save + sprites, wire up input/HUD/UI, and run the main loop.
// Debug URL params (development copy only): ?level=N jumps straight into a
// level, &god=1 makes the astronaut invulnerable, &boss=1 skips to the boss
// on boss levels, &debug=1 draws hit zones.
(function (CC) {
  'use strict';

  var STEP = 1 / CC.config.fps;
  var BUILD = CC.BUILD || { target: 'dev', dev: true };

  function params() {
    var out = {};
    if (!BUILD.dev) return out;
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '1');
    });
    return out;
  }

  function nextPaint() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  function boot() {
    var q = params();
    var P = CC.platform;
    var touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

    window.addEventListener('error', function (e) { P.logError(e.error || e.message); });
    window.addEventListener('unhandledrejection', function (e) { P.logError(e.reason); });

    var canvas = document.getElementById('game');
    var game = new CC.Game(canvas);
    game.flags.god = q.god === '1';
    game.flags.debug = q.debug === '1';
    game.flags.boss = q.boss === '1';
    CC.game = game;

    CC.input.init({
      canvas: canvas,
      left: document.getElementById('dpLeft'),
      right: document.getElementById('dpRight'),
      up: document.getElementById('dpUp'),
      down: document.getElementById('dpDown'),
      boost: document.getElementById('btnBoost'),
      super: document.getElementById('btnSuper')
    });

    // Audio may only start after a user gesture.
    function unlock() {
      CC.audio.unlock();
      if (!game.level || game.mode === 'attract') CC.audio.startMusic('menu');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    window.addEventListener('resize', function () { game.resize(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    var fill = document.getElementById('loadFill');
    var fonts = document.fonts && document.fonts.load ? Promise.all([
      document.fonts.load('40px "Luckiest Guy"'), document.fonts.load('20px "Russo One"')
    ]).catch(function () {}) : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 2500); });

    // The loading screen is on screen once it has painted.
    nextPaint().then(function () {
      P.firstFrameReady();
      return Promise.all([
        P.init().then(function () { return CC.storage.load(); }),
        CC.assets.load(function (p) { fill.style.width = Math.round(p * 100) + '%'; }),
        Promise.race([fonts, timeout])
      ]);
    }).then(function () {
      CC.hud.init();
      CC.ui.init(game, { touch: touch });
      CC.audio.setSystemAllowed(P.audioAllowed());
      P.onAudioChange(function (on) { CC.audio.setSystemAllowed(on); });
      if (q.level) {
        CC.storage.data.seenHowTo = true;
        CC.ui.startLevel(parseInt(q.level, 10) || 1);
      } else {
        CC.ui.goMenu();
      }
      loop.start();
      // Interactive from here (main menu or a level).
      return nextPaint().then(P.gameReady);
    }).catch(function (err) {
      P.logError(err);
    });

    var loop = makeLoop(game);
    CC.loop = loop;

    // Host pause (YouTube onPause, app in background, browser tab hidden):
    // stop everything and save; on resume wait in the pause screen.
    P.onPause(function () {
      CC.ui.systemPause();
      loop.stop();
      CC.input.setEnabled(false);
      CC.audio.suspend();
      CC.storage.flush();
    });
    P.onResume(function () {
      CC.audio.resume();
      loop.start();
    });
  }

  function makeLoop(game) {
    var raf = 0, last = 0, acc = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 6) {
        game.update(CC.input.read());
        acc -= STEP;
        steps++;
      }
      if (steps === 6) acc = 0;
      game.render(acc / STEP);
      CC.hud.update(game);
    }
    return {
      start: function () {
        if (raf) return;
        last = performance.now();
        acc = 0;
        raf = requestAnimationFrame(frame);
      },
      stop: function () {
        cancelAnimationFrame(raf);
        raf = 0;
      },
      get running() { return raf !== 0; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.CC = window.CC || {});
