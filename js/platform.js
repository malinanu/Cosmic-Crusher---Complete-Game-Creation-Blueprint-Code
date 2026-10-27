// Where the game is running and how to talk to it. Three backends share one
// API so the rest of the code never checks the platform itself:
//   youtube   – inside YouTube Playables (ytgame SDK present and active)
//   capacitor – the Android / iOS app
//   web       – any other browser
// YouTube's rules: save only through the SDK (and only after loadData),
// pause/resume only through its callbacks, honour its audio setting.
(function (CC) {
  'use strict';

  var KEY = 'cosmicCrusher.save.v1';
  var yt = typeof window.ytgame !== 'undefined' && !!window.ytgame.IN_PLAYABLES_ENV ? window.ytgame : null;
  var cap = !yt && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform() ? window.Capacitor : null;

  var loaded = false;      // SAVE-3: no saving until a load has succeeded
  var readySent = { first: false, game: false };

  function plugin(name) {
    return cap && cap.Plugins ? cap.Plugins[name] || null : null;
  }

  function logError(err) {
    if (yt) {
      try { yt.health.logError(); } catch (e) { /* best effort */ }
    }
    if (window.console) console.error(err);
  }

  function logWarning(msg) {
    if (yt) {
      try { yt.health.logWarning(); } catch (e) { /* best effort */ }
    }
    if (window.console) console.warn(msg);
  }

  function readLocal() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function loadOnce() {
    if (yt) return yt.game.loadData();
    var prefs = plugin('Preferences');
    if (prefs) return prefs.get({ key: KEY }).then(function (r) { return r && r.value; });
    return Promise.resolve(readLocal());
  }

  // Resolves with the saved string (or null). YouTube can briefly report the
  // API as unavailable, so retry a few times before giving up; if it never
  // loads we play on defaults but never save, so cloud progress is not wiped.
  function load() {
    var tries = 0;
    function attempt() {
      return loadOnce().then(function (raw) {
        loaded = true;
        return raw || null;
      }, function (err) {
        if (++tries < 4) {
          return new Promise(function (r) { setTimeout(r, 400 * tries); }).then(attempt);
        }
        logError(err);
        return null;
      });
    }
    return attempt();
  }

  function save(str) {
    if (!loaded) return Promise.resolve(false);
    if (yt) {
      if (str.length * 2 > 3 * 1024 * 1024 || (str.isWellFormed && !str.isWellFormed())) {
        logWarning('save data rejected locally: too large or malformed');
        return Promise.resolve(false);
      }
      return yt.game.saveData(str).then(function () { return true; }, function (err) { logWarning(err); return false; });
    }
    var prefs = plugin('Preferences');
    if (prefs) return prefs.set({ key: KEY, value: str }).then(function () { return true; }, function () { return false; });
    try { window.localStorage.setItem(KEY, str); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); }
  }

  // ---- Lifecycle ---------------------------------------------------------------

  var pauseFns = [], resumeFns = [];
  function firePause() { pauseFns.forEach(function (fn) { fn(); }); }
  function fireResume() { resumeFns.forEach(function (fn) { fn(); }); }

  function bindLifecycle() {
    if (yt) {
      yt.system.onPause(firePause);
      yt.system.onResume(fireResume);
      return;
    }
    var app = plugin('App');
    if (app) {
      app.addListener('pause', firePause);
      app.addListener('resume', fireResume);
      return;
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) firePause(); else fireResume();
    });
  }

  function init() {
    bindLifecycle();
    var bar = plugin('StatusBar');
    if (bar) bar.hide().catch(function () {});
    return Promise.resolve();
  }

  function firstFrameReady() {
    if (readySent.first) return;
    readySent.first = true;
    if (yt) yt.game.firstFrameReady();
  }

  function gameReady() {
    if (readySent.game) return;
    firstFrameReady();
    readySent.game = true;
    if (yt) yt.game.gameReady();
    var splash = plugin('SplashScreen');
    if (splash) splash.hide().catch(function () {});
  }

  // ---- Audio, score, haptics, back button -------------------------------------------

  function audioAllowed() {
    if (!yt) return true;
    try { return yt.system.isAudioEnabled(); } catch (e) { return true; }
  }

  function onAudioChange(fn) {
    if (yt) yt.system.onAudioEnabledChange(fn);
  }

  function sendScore(value) {
    if (!yt) return;
    value = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
    yt.engagement.sendScore({ value: value }).catch(logWarning);
  }

  // ms: a duration or a navigator.vibrate pattern.
  function haptic(ms) {
    var h = plugin('Haptics');
    if (h) {
      var peak = Array.isArray(ms) ? Math.max.apply(null, ms) : ms;
      h.impact({ style: peak >= 60 ? 'HEAVY' : peak >= 25 ? 'MEDIUM' : 'LIGHT' }).catch(function () {});
      return;
    }
    // Browsers refuse (and log an error) until the player has interacted.
    var active = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
    if (navigator.vibrate && active) {
      try { navigator.vibrate(ms); } catch (e) { /* unsupported */ }
    }
  }

  function onBack(fn) {
    var app = plugin('App');
    if (app) app.addListener('backButton', fn);
  }

  function exitApp() {
    var app = plugin('App');
    if (app && app.exitApp) app.exitApp();
  }

  CC.platform = {
    id: yt ? 'youtube' : cap ? 'capacitor' : 'web',
    init: init,
    load: load,
    save: save,
    onPause: function (fn) { pauseFns.push(fn); },
    onResume: function (fn) { resumeFns.push(fn); },
    firstFrameReady: firstFrameReady,
    gameReady: gameReady,
    audioAllowed: audioAllowed,
    onAudioChange: onAudioChange,
    sendScore: sendScore,
    haptic: haptic,
    onBack: onBack,
    exitApp: exitApp,
    logError: logError,
    // Tilt asks for a motion permission; YouTube's player doesn't allow it.
    tiltAvailable: !yt
  };
})(window.CC = window.CC || {});
