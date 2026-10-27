// Drawing helpers: space background, procedural planets, comic pop text.
(function (CC) {
  'use strict';

  var TAU = Math.PI * 2;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // ---- Planets --------------------------------------------------------------

  function crater(g, x, y, r, base, shade, rim) {
    g.fillStyle = shade;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = base;
    g.beginPath(); g.arc(x + r * 0.16, y + r * 0.18, r * 0.84, 0, TAU); g.fill();
    g.strokeStyle = rim; g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath(); g.arc(x, y, r * 0.98, 0.1 * Math.PI, 0.65 * Math.PI); g.stroke();
    g.strokeStyle = 'rgba(30,20,50,0.45)'; g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  }

  function blob(g, x, y, r, rand, points) {
    points = points || 22;
    var offs = [];
    for (var i = 0; i < 4; i++) offs.push(rand() * TAU);
    g.beginPath();
    for (var k = 0; k <= points; k++) {
      var a = k / points * TAU;
      var m = 1 + 0.22 * Math.sin(a * 2 + offs[0]) + 0.14 * Math.sin(a * 3 + offs[1]) + 0.08 * Math.sin(a * 5 + offs[2]);
      var px = x + Math.cos(a) * r * m, py = y + Math.sin(a) * r * m * 0.85;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  var PLANET_STYLE = {
    moon:  { stops: ['#f4f5f6', '#cfd2d8', '#9ea3ae'], seed: 7 },
    earth: { stops: ['#55b6ff', '#2273dc', '#143f92'], seed: 3 },
    mars:  { stops: ['#ffa266', '#d35f2e', '#8e3418'], seed: 11 }
  };

  function paintPlanet(type, S) {
    var c = makeCanvas(S, S), g = c.getContext('2d');
    var st = PLANET_STYLE[type] || PLANET_STYLE.moon;
    var rand = rng(st.seed);
    var r = S / 2;
    g.save();
    g.beginPath(); g.arc(r, r, r, 0, TAU); g.clip();
    var grad = g.createRadialGradient(r * 0.8, r * 0.75, 0, r, r, r);
    grad.addColorStop(0, st.stops[0]); grad.addColorStop(0.6, st.stops[1]); grad.addColorStop(1, st.stops[2]);
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    var i, x, y, cr, a, d;

    if (type === 'earth') {
      for (i = 0; i < 7; i++) {
        a = rand() * TAU; d = rand() * r * 0.8;
        x = r + Math.cos(a) * d; y = r + Math.sin(a) * d;
        cr = r * (0.16 + rand() * 0.2);
        blob(g, x, y, cr, rand);
        g.fillStyle = '#4cc04f'; g.fill();
        g.lineWidth = r * 0.025; g.strokeStyle = '#25702f'; g.stroke();
        blob(g, x - cr * 0.15, y - cr * 0.1, cr * 0.5, rand);
        g.fillStyle = rand() < 0.4 ? '#d8c77d' : '#7fdc62'; g.fill();
      }
      for (i = 0; i < 6; i++) {
        a = rand() * TAU; d = rand() * r * 0.85;
        x = r + Math.cos(a) * d; y = r + Math.sin(a) * d; cr = r * (0.12 + rand() * 0.12);
        var cg = g.createRadialGradient(x, y, 0, x, y, cr);
        cg.addColorStop(0, 'rgba(255,255,255,0.5)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cg;
        g.beginPath(); g.ellipse(x, y, cr * 1.6, cr * 0.7, a, 0, TAU); g.fill();
      }
    } else {
      var moon = type === 'moon';
      for (i = 0; i < 16; i++) {
        a = rand() * TAU; d = rand() * r;
        g.fillStyle = moon ? 'rgba(110,116,135,0.16)' : 'rgba(110,35,15,0.22)';
        blob(g, r + Math.cos(a) * d, r + Math.sin(a) * d, r * (0.08 + rand() * 0.2), rand); g.fill();
      }
      var base = moon ? '#c5c9d0' : '#cf6a3a';
      var shade = moon ? '#8a909c' : '#8e3a1c';
      var rim = moon ? 'rgba(255,255,255,0.75)' : 'rgba(255,200,150,0.7)';
      for (i = 0; i < 26; i++) {
        cr = r * (0.035 + Math.pow(rand(), 2) * 0.16);
        a = rand() * TAU; d = rand() * r * 0.95;
        crater(g, r + Math.cos(a) * d, r + Math.sin(a) * d, cr, base, shade, rim);
      }
      for (i = 0; i < 260; i++) {
        a = rand() * TAU; d = rand() * r;
        g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(40,30,60,0.18)';
        g.fillRect(r + Math.cos(a) * d, r + Math.sin(a) * d, 1.5, 1.5);
      }
    }
    g.restore();
    return c;
  }

  var texCache = {};
  function planetTexture(type, R) {
    var S = Math.min(2048, Math.ceil(R * 2 * Math.min(3, window.devicePixelRatio || 1)));
    var key = type + ':' + S;
    if (!texCache[key]) {
      var override = CC.assets.get('planet_' + type);
      if (override) {
        var c = makeCanvas(S, S), g = c.getContext('2d');
        g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, TAU); g.clip();
        g.drawImage(override, 0, 0, S, S);
        texCache[key] = c;
      } else {
        texCache[key] = paintPlanet(type, S);
      }
    }
    return texCache[key];
  }

  function drawPlanet(ctx, type, x, y, R, angle, glow) {
    ctx.save();
    ctx.translate(x, y);
    // soft atmosphere glow
    var gg = ctx.createRadialGradient(0, 0, R * 0.95, 0, 0, R * 1.3);
    gg.addColorStop(0, hexA(glow || '#7fd6ff', 0.55));
    gg.addColorStop(1, hexA(glow || '#7fd6ff', 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, TAU); ctx.fill();

    ctx.rotate(angle);
    ctx.drawImage(planetTexture(type, R), -R, -R, R * 2, R * 2);
    ctx.rotate(-angle);

    // fixed lighting: bright top-left, shade bottom-right
    var lg = ctx.createRadialGradient(-R * 0.45, -R * 0.5, R * 0.1, -R * 0.1, -R * 0.1, R * 1.3);
    lg.addColorStop(0, 'rgba(255,255,255,0.22)');
    lg.addColorStop(0.55, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(8,6,30,0.55)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();

    ctx.lineWidth = Math.max(2, R * 0.03);
    ctx.strokeStyle = '#120a26';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, R * 0.018);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.97, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    ctx.restore();
  }

  // Motion streaks around the planet when it spins fast (the blue swirl in the mockups).
  function drawSwoosh(ctx, x, y, R, angle, omega, maxSpin, color, t) {
    var k = Math.min(1, Math.abs(omega) / maxSpin);
    if (k < 0.25) return;
    var dir = omega > 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      var rr = R * (1.05 + i * 0.035);
      var start = angle * (1 + i * 0.07) + i * 1.9;
      var len = 0.5 + k * 0.9;
      ctx.strokeStyle = hexA(color, (k - 0.2) * 0.6 * (1 - i * 0.18));
      ctx.lineWidth = Math.max(1.5, R * (0.025 - i * 0.004));
      ctx.beginPath();
      if (dir > 0) ctx.arc(0, 0, rr, start - len, start);
      else ctx.arc(0, 0, rr, start, start + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)) + ')';
  }

  // ---- Background -------------------------------------------------------------

  function Background() {
    this.w = 0; this.h = 0;
    this.stars = [];
    this.rocks = [];
    this.nebula = null;
  }

  Background.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h;
    var rand = rng(42);
    var c = makeCanvas(w * dpr, h * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    var base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#0b1233'); base.addColorStop(0.5, '#0a0d26'); base.addColorStop(1, '#070818');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    var cols = ['#5b2a86', '#1d4e89', '#1a6b7a', '#7a2a6b', '#2b3a8f'];
    for (var i = 0; i < 7; i++) {
      var x = rand() * w, y = rand() * h, r = Math.max(w, h) * (0.2 + rand() * 0.3);
      var ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, hexA(cols[i % cols.length], 0.32));
      ng.addColorStop(1, hexA(cols[i % cols.length], 0));
      g.fillStyle = ng; g.fillRect(0, 0, w, h);
    }
    // faint galaxy band
    for (i = 0; i < 900; i++) {
      var tt = rand();
      var bx = tt * w * 1.2 - w * 0.1;
      var by = h * 0.15 + tt * h * 0.25 + (rand() - 0.5) * h * 0.08;
      g.fillStyle = 'rgba(200,210,255,' + (rand() * 0.25) + ')';
      g.fillRect(bx, by, 1, 1);
    }
    this.nebula = c;

    var n = Math.round(w * h / 2600);
    this.stars = [];
    for (i = 0; i < n; i++) {
      var layer = rand() < 0.7 ? 0 : rand() < 0.8 ? 1 : 2;
      this.stars.push({
        x: rand() * w, y: rand() * h, layer: layer,
        r: layer === 0 ? 0.6 + rand() * 0.7 : layer === 1 ? 1.1 + rand() * 0.8 : 2.5 + rand() * 3,
        phase: rand() * TAU, tw: 0.02 + rand() * 0.05,
        color: ['#ffffff', '#cfe4ff', '#ffe6b0', '#ffc6f0', '#a8fff4'][Math.floor(rand() * 5)]
      });
    }
    this.rocks = [
      { x: w * 0.1, y: h * 0.3, s: 0.05, rot: 0, vr: 0.004, vx: 0.05, vy: 0.02 },
      { x: w * 0.9, y: h * 0.72, s: 0.065, rot: 1, vr: -0.003, vx: -0.04, vy: -0.02 },
      { x: w * 0.78, y: h * 0.78, s: 0.025, rot: 2, vr: 0.006, vx: -0.03, vy: 0.03 }
    ];
    this.beltRocks = [
      { x: w * 0.08, y: h * 0.22, s: 0.055, rot: 0.2, vr: 0.005, vx: 0.07, vy: 0.025 },
      { x: w * 0.25, y: h * 0.35, s: 0.035, rot: 1.1, vr: -0.006, vx: 0.05, vy: 0.02 },
      { x: w * 0.42, y: h * 0.48, s: 0.07, rot: 2.3, vr: 0.003, vx: 0.06, vy: 0.03 },
      { x: w * 0.65, y: h * 0.62, s: 0.045, rot: 0.8, vr: -0.004, vx: 0.08, vy: 0.035 },
      { x: w * 0.85, y: h * 0.75, s: 0.065, rot: 3.1, vr: 0.005, vx: 0.05, vy: 0.02 },
      { x: w * 0.92, y: h * 0.30, s: 0.03, rot: 1.5, vr: -0.007, vx: -0.04, vy: -0.015 },
      { x: w * 0.15, y: h * 0.80, s: 0.04, rot: 2.8, vr: 0.004, vx: 0.06, vy: -0.02 }
    ];
  };

  Background.prototype.draw = function (ctx, t, drift, farPlanet, sectorId) {
    var w = this.w, h = this.h;
    ctx.drawImage(this.nebula, 0, 0, w, h);

    if (sectorId === 2) {
      // Asteroid belt dust band
      ctx.save();
      var dg = ctx.createLinearGradient(0, h * 0.05, w, h * 0.95);
      dg.addColorStop(0, 'rgba(180, 110, 50, 0)');
      dg.addColorStop(0.35, 'rgba(215, 135, 65, 0.12)');
      dg.addColorStop(0.5, 'rgba(245, 165, 80, 0.18)');
      dg.addColorStop(0.65, 'rgba(215, 135, 65, 0.12)');
      dg.addColorStop(1, 'rgba(180, 110, 50, 0)');
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, w, h);

      // Belt stardust specks
      for (var bi = 0; bi < 24; bi++) {
        var bu = (bi * 0.042 + t * 0.0003) % 1;
        var bx = bu * w;
        var by = h * 0.05 + bu * (h * 0.9) + Math.sin(bi * 1.7 + t * 0.01) * (h * 0.08);
        ctx.fillStyle = 'rgba(255, 210, 150, ' + (0.3 + 0.3 * Math.sin(bi + t * 0.03)) + ')';
        ctx.fillRect(bx, by, 1.5, 1.5);
      }
      ctx.restore();
    }

    var speeds = [0.04, 0.1, 0.18];
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      var sy = (s.y + t * speeds[s.layer] * (1 + drift * 6)) % h;
      var a = 0.55 + 0.45 * Math.sin(t * s.tw + s.phase);
      if (s.layer === 2) {
        sparkle(ctx, s.x, sy, s.r * (0.8 + 0.3 * a), s.color, a);
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x - s.r / 2, sy - s.r / 2, s.r, s.r);
      }
    }
    ctx.globalAlpha = 1;
    var m = Math.min(w, h);
    if (farPlanet) {
      var fx = w * 0.82, fy = h * (w > h ? 0.3 : 0.24), fr = m * 0.09;
      drawPlanet(ctx, farPlanet, fx, fy, fr, t * 0.002, farPlanet === 'earth' ? '#5fb8ff' : '#cfd8ff');
    }
    var rocks = sectorId === 2 ? this.beltRocks : this.rocks;
    for (i = 0; i < rocks.length; i++) {
      var r = rocks[i];
      var rx = ((r.x + r.vx * t) % (w + 100) + w + 100) % (w + 100) - 50;
      var ry = ((r.y + r.vy * t) % (h + 100) + h + 100) % (h + 100) - 50;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(r.rot + r.vr * t);
      if (!CC.assets.drawCentered(ctx, 'prop_asteroid', m * r.s * 1.6)) {
        ctx.fillStyle = '#5a5470';
        ctx.beginPath(); ctx.arc(0, 0, m * r.s * 0.7, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  };

  function sparkle(ctx, x, y, r, color, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    g.addColorStop(0, hexA(color, 0.7)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 2); ctx.quadraticCurveTo(0, 0, r * 2, 0); ctx.quadraticCurveTo(0, 0, 0, r * 2);
    ctx.quadraticCurveTo(0, 0, -r * 2, 0); ctx.quadraticCurveTo(0, 0, 0, -r * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Comic effects -----------------------------------------------------------

  function star5(ctx, x, y, r, rot, fill) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.45 : r;
      var a = i * Math.PI / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.strokeStyle = '#7a3b00';
    ctx.stroke();
    ctx.restore();
  }

  function burst(ctx, r, spikes, fill, stroke) {
    ctx.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var rr = i % 2 ? r * 0.62 : r;
      var a = i * Math.PI / spikes;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = stroke; ctx.stroke();
  }

  var POP_STYLES = {
    splat:  { top: '#fff25a', bottom: '#ff7a1a', burst: '#ffd23f' },
    green:  { top: '#d4ff6b', bottom: '#2fbf3a', burst: '#ffcf3a' },
    combo:  { top: '#fff06a', bottom: '#ff8a1a', burst: null, second: ['#9ff3ff', '#2a8cff'] },
    hurt:   { top: '#ffffff', bottom: '#ff3b3b', burst: null },
    info:   { top: '#e8fbff', bottom: '#41d8ff', burst: null },
    boss:   { top: '#ffe66b', bottom: '#ff5a3b', burst: '#ff8a3b' }
  };

  function outlinedText(ctx, text, y, size, top, bottom) {
    ctx.font = size + 'px "Luckiest Guy", "Russo One", Impact, sans-serif';
    ctx.lineWidth = size * 0.32; ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, 0, y);
    ctx.lineWidth = size * 0.18; ctx.strokeStyle = '#2a0b3d';
    ctx.strokeText(text, 0, y);
    var g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillText(text, 0, y);
  }

  // Comic text with a white + dark outline. "X2\nCOMBO" draws two lines,
  // the second in the style's second colour.
  function popText(ctx, text, size, style, t) {
    var st = POP_STYLES[style] || POP_STYLES.splat;
    var lines = text.split('\n');
    ctx.save();
    if (st.burst) {
      ctx.save();
      ctx.rotate(t * 0.01);
      burst(ctx, size * Math.max(1.2, lines[0].length * 0.34), 12, st.burst, '#a24a00');
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (lines.length === 1) {
      outlinedText(ctx, text, 0, size, st.top, st.bottom);
    } else {
      var second = st.second || [st.top, st.bottom];
      outlinedText(ctx, lines[0], -size * 0.45, size * 1.15, st.top, st.bottom);
      outlinedText(ctx, lines[1], size * 0.55, size * 0.85, second[0], second[1]);
    }
    ctx.restore();
  }

  CC.render = {
    TAU: TAU,
    rng: rng,
    hexA: hexA,
    makeCanvas: makeCanvas,
    planetTexture: planetTexture,
    drawPlanet: drawPlanet,
    drawSwoosh: drawSwoosh,
    Background: Background,
    star5: star5,
    burst: burst,
    popText: popText,
    sparkle: sparkle
  };
})(window.CC = window.CC || {});
