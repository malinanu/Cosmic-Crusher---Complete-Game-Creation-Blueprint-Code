// Stand-in for the YouTube Playables SDK (https://www.youtube.com/game_api/v1)
// used by tools/smoke_test.js. It records every call in window.__yt so the
// test can check the integration rules, and lets the test fire pause/resume
// and audio changes the way YouTube would.
(function () {
  'use strict';
  var log = window.__yt = {
    calls: [], saves: [], scores: [], saved: '', loaded: false, saveBeforeLoad: false,
    menuShownAtGameReady: null, loadingShownAtFirstFrame: null, audio: true,
    pauseFns: [], resumeFns: [], audioFns: []
  };
  function rec(name) { log.calls.push(name); }
  function visible(sel) { return !!document.querySelector(sel); }

  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: 'mock',
    SdkError: Error,
    game: {
      firstFrameReady: function () {
        rec('firstFrameReady');
        log.loadingShownAtFirstFrame = visible('#loading.show');
      },
      gameReady: function () {
        rec('gameReady');
        log.menuShownAtGameReady = visible('#menu.show') && !visible('#loading.show');
      },
      loadData: function () {
        rec('loadData');
        return new Promise(function (resolve) {
          setTimeout(function () { log.loaded = true; resolve(log.saved); }, 150);
        });
      },
      saveData: function (data) {
        rec('saveData');
        if (!log.loaded) log.saveBeforeLoad = true;
        log.saved = data;
        log.saves.push(data.length);
        return Promise.resolve();
      }
    },
    engagement: {
      sendScore: function (score) {
        rec('sendScore');
        log.scores.push(score.value);
        return Promise.resolve();
      },
      openYTContent: function () { rec('openYTContent'); return Promise.resolve(); }
    },
    system: {
      getLanguage: function () { return Promise.resolve('en-US'); },
      isAudioEnabled: function () { return log.audio; },
      onAudioEnabledChange: function (fn) { log.audioFns.push(fn); return function () {}; },
      onPause: function (fn) { log.pauseFns.push(fn); return function () {}; },
      onResume: function (fn) { log.resumeFns.push(fn); return function () {}; }
    },
    health: {
      logError: function () { rec('logError'); },
      logWarning: function () { rec('logWarning'); }
    },
    ads: {
      requestInterstitialAd: function () { return Promise.resolve(); },
      requestRewardedAd: function () { return Promise.resolve(false); }
    }
  };

  log.pause = function () { log.pauseFns.forEach(function (f) { f(); }); };
  log.resume = function () { log.resumeFns.forEach(function (f) { f(); }); };
  log.setAudio = function (on) { log.audio = on; log.audioFns.forEach(function (f) { f(on); }); };
})();
