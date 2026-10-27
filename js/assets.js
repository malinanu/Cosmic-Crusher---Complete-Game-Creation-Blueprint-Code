// Sprite loading plus code-drawn fallbacks. Any key whose PNG is missing from
// assets/sprites/ is drawn with vector art instead, so new art can be dropped
// in later under the same file name without touching the code.
(function (CC) {
  'use strict';

  var SPRITE_DIR = 'assets/sprites/';

  var KEYS = [
    'astro_idle', 'astro_run1', 'astro_run2', 'astro_run3', 'astro_leap', 'astro_splat',
    'fx_shield', 'alien_crawler', 'alien_bouncer', 'alien_roller', 'boss_blob',
    'icon_boost', 'icon_shield', 'icon_trophy', 'icon_suit_white', 'logo', 'prop_asteroid',
    // Optional: cut from the moon / Mars mockups once they are in art/.
    'alien_cute_green', 'alien_cute_orange', 'alien_cute_pink', 'alien_cute_blue', 'alien_cute_yellow',
    'prop_earth', 'planet_moon', 'planet_earth', 'planet_mars'
  ];

  var images = {};

  function load(onProgress) {
    var done = 0;
    return Promise.all(KEYS.map(function (key) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { images[key] = img; finish(); };
        img.onerror = finish;
        function finish() {
          done++;
          if (onProgress) onProgress(done / KEYS.length);
          resolve();
        }
        img.src = SPRITE_DIR + key + '.png';
      });
    }));
  }

  function get(key) { return images[key] || null; }

  // Draw a sprite with its bottom-centre at (0, 0) in the current transform,
  // scaled so its height is h. Returns false when the sprite is missing.
  function drawFeet(ctx, key, h, flip) {
    var img = images[key];
    if (!img) return false;
    var w = h * img.width / img.height;
    ctx.save();
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }

  // Same, but sized by width and centred on (0, 0).
  function drawCentered(ctx, key, w, flip) {
    var img = images[key];
    if (!img) return false;
    var h = w * img.height / img.width;
    ctx.save();
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  // ---- Vector fallbacks ---------------------------------------------------

  var OUTLINE = '#1b1033';

  var CUTE = {
    green:  { body: '#5fd35a', dark: '#2f8f3a', spot: '#8be86f', eyes: 1, limbs: 6, antenna: true },
    orange: { body: '#ff9a3c', dark: '#c25a17', spot: '#ffc06b', eyes: 2, limbs: 4, antenna: true },
    pink:   { body: '#f070c8', dark: '#a33a8a', spot: '#ff9fe0', eyes: 1, limbs: 4, antenna: true },
    blue:   { body: '#6f8cff', dark: '#3d4fb8', spot: '#a7b9ff', eyes: 1, limbs: 6, antenna: false },
    yellow: { body: '#ffd23f', dark: '#c99a12', spot: '#fff08a', eyes: 2, limbs: 2, antenna: false }
  };
  var CUTE_KEYS = Object.keys(CUTE);

  function eye(ctx, x, y, r, look) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(x + look * r * 0.25, y + r * 0.1, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + look * r * 0.25 - r * 0.18, y - r * 0.12, r * 0.17, 0, Math.PI * 2); ctx.fill();
  }

  // Cute tentacled alien, feet at (0, 0), width s. t = time in frames.
  function drawCuteAlien(ctx, s, color, t, squash) {
    var p = CUTE[color] || CUTE.green;
    var r = s * 0.32;
    var cy = -s * 0.42;
    var wob = Math.sin(t * 0.15) * 0.06;
    squash = squash || 0;
    ctx.save();
    ctx.scale(1 + squash * 0.4, 1 - squash * 0.4);
    ctx.lineCap = 'round';
    // limbs
    for (var i = 0; i < p.limbs; i++) {
      var f = p.limbs === 1 ? 0 : i / (p.limbs - 1) - 0.5;
      var baseX = f * r * 1.5;
      var ang = f * 2.2 + Math.sin(t * 0.2 + i * 1.7) * 0.35;
      var len = s * 0.34;
      var ex = baseX + Math.sin(ang) * len;
      var ey = cy + r * 0.6 + Math.cos(ang) * len * 0.75;
      var mx = baseX + Math.sin(ang) * len * 0.5 + Math.cos(t * 0.2 + i) * s * 0.06;
      var my = cy + r * 0.8;
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = s * 0.11;
      ctx.beginPath(); ctx.moveTo(baseX, cy + r * 0.4); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.strokeStyle = p.dark; ctx.lineWidth = s * 0.065;
      ctx.beginPath(); ctx.moveTo(baseX, cy + r * 0.4); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.fillStyle = p.spot;
      ctx.beginPath(); ctx.arc(ex, ey, s * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    // antennae
    if (p.antenna) {
      [-1, 1].forEach(function (d) {
        var ax = d * r * 0.45, ay = cy - r * 0.8;
        var tx = ax + d * s * 0.12 + Math.sin(t * 0.1 + d) * s * 0.03, ty = ay - s * 0.2;
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = s * 0.07;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = p.dark; ctx.lineWidth = s * 0.035;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = p.body; ctx.strokeStyle = OUTLINE; ctx.lineWidth = s * 0.03;
        ctx.beginPath(); ctx.arc(tx, ty, s * 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
    // body with a light sticker rim
    ctx.save();
    ctx.translate(0, cy);
    ctx.rotate(wob);
    ctx.fillStyle = 'rgba(220,240,255,0.85)';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.12 + 3, r + 3, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, p.spot); g.addColorStop(0.55, p.body); g.addColorStop(1, p.dark);
    ctx.fillStyle = g; ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(2, s * 0.045);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.12, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // spots
    ctx.fillStyle = p.dark; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.35, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.7, r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // face
    var look = Math.sin(t * 0.05);
    if (p.eyes === 1) eye(ctx, 0, -r * 0.2, r * 0.42, look);
    else { eye(ctx, -r * 0.38, -r * 0.25, r * 0.3, look); eye(ctx, r * 0.38, -r * 0.25, r * 0.3, look); }
    ctx.fillStyle = '#3a0d2e'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1.5, s * 0.025);
    ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.3, r * 0.2 + squash * r * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff6b8a';
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.15, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // Simple astronaut used only if the suit sprites are missing.
  function drawAstronaut(ctx, h, pose, t) {
    var s = h;
    ctx.save();
    ctx.lineJoin = 'round';
    var bob = pose === 'run' ? Math.sin(t * 0.5) * s * 0.03 : 0;
    ctx.translate(0, bob);
    ctx.fillStyle = '#f2f4f8'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = s * 0.03;
    // legs
    var swing = pose === 'run' ? Math.sin(t * 0.5) * s * 0.1 : 0;
    ctx.beginPath(); ctx.roundRect(-s * 0.16 + swing, -s * 0.3, s * 0.13, s * 0.3, s * 0.04); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(s * 0.03 - swing, -s * 0.3, s * 0.13, s * 0.3, s * 0.04); ctx.fill(); ctx.stroke();
    // body
    ctx.beginPath(); ctx.roundRect(-s * 0.2, -s * 0.62, s * 0.4, s * 0.36, s * 0.08); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9fb4c8';
    ctx.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.1);
    // helmet
    ctx.fillStyle = '#f2f4f8';
    ctx.beginPath(); ctx.arc(0, -s * 0.78, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    var g = ctx.createLinearGradient(0, -s * 0.9, 0, -s * 0.66);
    g.addColorStop(0, '#5ab4ff'); g.addColorStop(1, '#1a3d9c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(s * 0.03, -s * 0.78, s * 0.14, s * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  CC.assets = {
    load: load,
    get: get,
    drawFeet: drawFeet,
    drawCentered: drawCentered,
    cuteColors: CUTE_KEYS,
    drawCuteAlien: drawCuteAlien,
    drawAstronaut: drawAstronaut,
    OUTLINE: OUTLINE
  };
})(window.CC = window.CC || {});
