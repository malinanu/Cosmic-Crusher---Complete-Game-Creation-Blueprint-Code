// Synthesized sound effects and a small procedural music loop (Web Audio API).
// Nothing is downloaded; every sound is built from oscillators and noise.
(function (CC) {
  'use strict';

  var ac = null, master, sfxBus, musicBus, noiseBuf;
  // system = the host allows sound (YouTube's audio setting); paused = the
  // host paused the game. Either one silences everything.
  var vol = { music: 0.7, sfx: 0.9, muted: false, system: true, paused: false };
  var lastPlayed = {};

  function quiet(p) { if (p && p.catch) p.catch(function () {}); }

  function ensure() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    // iOS: let the silent switch and volume buttons control game sound.
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* unsupported */ }
    ac = new AC();
    master = ac.createGain();
    master.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
    // Some engines start the context asynchronously: keep it suspended while
    // the host disallows sound, whenever it reports running.
    ac.onstatechange = function () {
      if ((!vol.system || vol.paused) && ac.state === 'running') quiet(ac.suspend());
    };
    if ((!vol.system || vol.paused) && ac.state === 'running') quiet(ac.suspend());
    return ac;
  }

  // Browsers only allow audio after a user gesture.
  function silent() { return vol.muted || !vol.system || vol.paused; }

  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended' && !vol.paused && vol.system) quiet(ac.resume());
  }

  function applyVolumes() {
    if (!ac) return;
    master.gain.value = silent() ? 0 : 1;
    sfxBus.gain.value = vol.sfx * 0.8;
    musicBus.gain.value = vol.music * 0.32;
  }

  function setVolumes(music, sfx) { vol.music = music; vol.sfx = sfx; applyVolumes(); }
  function setMuted(m) { vol.muted = m; applyVolumes(); }
  // The host's audio setting (YouTube mute): off means no output at all.
  function setSystemAllowed(on) {
    vol.system = !!on;
    applyVolumes();
    if (!ac) return;
    if (!vol.system && ac.state === 'running') quiet(ac.suspend());
    else if (vol.system && !vol.paused && ac.state === 'suspended') quiet(ac.resume());
  }

  // Host pause: stop the music clock and the audio hardware entirely.
  function suspend() {
    vol.paused = true;
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
    applyVolumes();
    if (ac && ac.state === 'running') quiet(ac.suspend());
  }

  function resume() {
    vol.paused = false;
    applyVolumes();
    if (ac && ac.state === 'suspended' && vol.system) quiet(ac.resume());
    if (music.song && !music.timer) runMusic();
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(type, f0, f1, dur, peak, when, dest) {
    var t = (when || ac.currentTime);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.005, peak, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, peak, filterType, f0, f1, when, dest) {
    var t = (when || ac.currentTime);
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(f0 || 2000, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  var SFX = {
    splat: function (o) {
      var c = Math.min(8, o.combo || 1);
      var p = Math.pow(2, (c - 1) / 12 * 2);
      noise(0.16, 0.5, 'lowpass', 2400, 300);
      tone('sine', 320 * p, 70, 0.18, 0.5);
      if (c > 1) tone('square', 523 * p, 523 * p * 1.5, 0.08, 0.08, ac.currentTime + 0.03);
    },
    hurt: function () {
      tone('sawtooth', 180, 55, 0.3, 0.3);
      noise(0.2, 0.25, 'lowpass', 900, 200);
    },
    boost: function () {
      noise(0.35, 0.25, 'bandpass', 400, 2400);
      tone('sine', 220, 880, 0.3, 0.2);
    },
    slam: function () {
      tone('sine', 110, 38, 0.45, 0.7);
      noise(0.3, 0.45, 'lowpass', 1200, 120);
    },
    super: function () {
      var t = ac.currentTime;
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone('triangle', f, f, 0.25, 0.18, t + i * 0.05); });
      noise(0.6, 0.12, 'highpass', 3000, 8000);
    },
    superReady: function () {
      var t = ac.currentTime;
      tone('triangle', 880, 880, 0.12, 0.2, t);
      tone('triangle', 1320, 1320, 0.2, 0.2, t + 0.1);
    },
    superEnd: function () { tone('triangle', 660, 330, 0.25, 0.15); },
    land: function () { tone('sine', 150, 90, 0.07, 0.12); },
    spawn: function () { tone('sine', 1200, 2400, 0.06, 0.03); },
    goo: function () { tone('sine', 180, 620, 0.22, 0.25); noise(0.15, 0.1, 'bandpass', 600, 1500); },
    bossLand: function () { tone('sine', 70, 30, 0.8, 0.8); noise(0.6, 0.5, 'lowpass', 600, 60); },
    bossHit: function () {
      tone('square', 140, 60, 0.3, 0.25);
      noise(0.3, 0.5, 'lowpass', 3000, 200);
      tone('sine', 400, 90, 0.25, 0.4);
    },
    bossDown: function () {
      var t = ac.currentTime;
      for (var i = 0; i < 5; i++) noise(0.4, 0.4, 'lowpass', 1500, 100, t + i * 0.12);
      tone('sawtooth', 300, 40, 1.2, 0.3);
    },
    bossIntro: function () {
      var t = ac.currentTime;
      tone('sawtooth', 82, 78, 0.9, 0.25, t);
      tone('sawtooth', 87, 82, 0.9, 0.2, t + 0.45);
    },
    wave: function () {
      var t = ac.currentTime;
      tone('square', 660, 660, 0.08, 0.12, t);
      tone('square', 990, 990, 0.12, 0.12, t + 0.1);
    },
    stumble: function () { tone('triangle', 500, 200, 0.4, 0.2); },
    boing: function () { tone('sine', 220, 660, 0.12, 0.25); tone('sine', 660, 330, 0.15, 0.15, ac.currentTime + 0.1); },
    win: function () {
      var t = ac.currentTime;
      [523, 659, 784, 1047].forEach(function (f, i) { tone('square', f, f, 0.18, 0.13, t + i * 0.12); });
      tone('triangle', 1047, 1047, 0.6, 0.2, t + 0.5);
    },
    lose: function () {
      var t = ac.currentTime;
      [392, 370, 349, 262].forEach(function (f, i) { tone('sawtooth', f, f * 0.97, i === 3 ? 0.7 : 0.3, 0.14, t + i * 0.3); });
    },
    ui: function () { tone('sine', 880, 1200, 0.05, 0.12); },
    planet: function () { tone('sine', 300, 600, 0.12, 0.15); }
  };

  function play(name, opts) {
    if (!ac || silent() || !SFX[name]) return;
    var now = ac.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < 0.04) return;
    lastPlayed[name] = now;
    SFX[name](opts || {});
  }

  // ---- Music: bass + arpeggio + light drums, scheduled slightly ahead ----------

  var SONGS = {
    menu: { bpm: 96, drums: false, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    game: { bpm: 124, drums: true, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    boss: { bpm: 138, drums: true, prog: [[52, 55, 59], [53, 56, 60], [52, 55, 59], [50, 53, 57]] }
  };
  var music = { song: null, timer: null, step: 0, next: 0 };

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scheduleStep(song, step, t) {
    var bar = Math.floor(step / 16) % song.prog.length;
    var chord = song.prog[bar];
    var s = step % 16;
    var stepDur = 60 / song.bpm / 4;
    if (s % 4 === 0) tone('triangle', mtof(chord[0] - 24), mtof(chord[0] - 24), stepDur * 3.5, 0.5, t, musicBus);
    if (s % 2 === 0) {
      var n = chord[(s / 2) % 3] + (s >= 8 ? 12 : 0);
      tone('square', mtof(n), mtof(n), stepDur * 1.6, 0.06, t, musicBus);
    }
    if (song.drums) {
      if (s % 8 === 0) tone('sine', 120, 40, 0.18, 0.6, t, musicBus);
      if (s % 8 === 4) noise(0.12, 0.25, 'highpass', 1500, 900, t, musicBus);
      if (s % 2 === 1) noise(0.03, 0.08, 'highpass', 7000, 7000, t, musicBus);
    }
  }

  function startMusic(name) {
    if (!ensure()) return;
    if (music.song === SONGS[name]) return;
    stopMusic();
    music.song = SONGS[name];
    music.step = 0;
    if (!vol.paused) runMusic();
  }

  function runMusic() {
    music.next = ac.currentTime + 0.1;
    music.timer = setInterval(function () {
      if (!music.song || ac.state !== 'running') return;
      var stepDur = 60 / music.song.bpm / 4;
      if (music.next < ac.currentTime) music.next = ac.currentTime + 0.05;
      while (music.next < ac.currentTime + 0.15) {
        if (vol.music > 0 && !silent()) scheduleStep(music.song, music.step, music.next);
        music.next += stepDur;
        music.step++;
      }
    }, 30);
  }

  function stopMusic() {
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
    music.song = null;
  }

  CC.audio = {
    unlock: unlock,
    play: play,
    setVolumes: setVolumes,
    setMuted: setMuted,
    setSystemAllowed: setSystemAllowed,
    suspend: suspend,
    resume: resume,
    get masterGain() { return master ? master.gain.value : null; },
    get state() { return ac ? ac.state : 'none'; },
    startMusic: startMusic,
    stopMusic: stopMusic
  };
})(window.CC = window.CC || {});
