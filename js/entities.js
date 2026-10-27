// Aliens, the boss, goo shots and visual effects. Positions on the planet are
// stored as a planet-local angle (`local`) plus a height above the surface,
// so they turn with the planet; falling things use a fixed world angle and a
// distance from the planet centre in units of R.
(function (CC) {
  'use strict';

  var TAU = Math.PI * 2;
  var TOP = -Math.PI / 2;

  function wrap(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }

  var GOO = {
    green: '#6be04f', orange: '#ff9a3c', pink: '#f070c8', blue: '#7f9bff', yellow: '#ffd23f',
    plutonian: '#7ed957', bouncer: '#b06bff', roller: '#ff8a2a', blob: '#ff5a2e'
  };

  // ---- Aliens -------------------------------------------------------------

  function Alien(type, opts) {
    var cfg = CC.config.enemies[type];
    this.type = type;
    this.cfg = cfg;
    this.skin = opts.skin || type;
    this.state = 'warp';
    this.worldAngle = opts.angle;
    this.dist = opts.dist;
    this.speed = opts.speed;
    this.walkScale = opts.walkScale || 1;
    this.local = 0;
    this.height = 0;     // above the surface, in R units
    this.vh = 0;         // for knock-back hops
    this.hop = Math.random();
    this.rest = 0;
    this.stun = 0;
    this.spin = 0;
    this.t = Math.random() * 1000;
    this.warp = 0;
    this.squash = 0;
    this.prevD = null;
    this.moveDir = 0;
    this.width = cfg.size * (this.skin === 'plutonian' ? 1.4 : 1);
  }

  Alien.prototype.halfArc = function () { return this.width * 0.3; };

  Alien.prototype.color = function () {
    if (this.skin.indexOf('cute:') === 0) return GOO[this.skin.slice(5)] || GOO.green;
    return GOO[this.skin] || GOO.green;
  };

  Alien.prototype.update = function (planetAngle) {
    this.t++;
    this.squash *= 0.85;
    if (this.state === 'warp') {
      this.warp += 1 / 18;
      if (this.warp >= 1) { this.warp = 1; this.state = 'fall'; }
      return null;
    }
    if (this.state === 'fall') {
      this.dist -= this.speed;
      if (this.dist <= 1) {
        this.dist = 1;
        this.state = 'landed';
        this.local = this.worldAngle - planetAngle;
        this.squash = 1;
        return 'land';
      }
      return null;
    }
    if (this.state !== 'landed') return null;

    // knock-back hop
    if (this.vh !== 0 || this.height > 0 && this.type !== 'bouncer') {
      this.height += this.vh;
      this.vh -= 0.012;
      if (this.height <= 0) { this.height = 0; this.vh = 0; this.squash = 0.6; }
    }

    if (this.stun > 0) { this.stun--; return null; }

    var target = TOP - planetAngle;
    var diff = wrap(target - this.local);
    var dir = diff > 0 ? 1 : -1;
    var step = this.cfg.walk * this.walkScale;

    if (this.type === 'bouncer') {
      if (this.rest > 0) {
        this.rest--;
        if (this.rest === 0) this.hop = 0;
      } else {
        this.hop += 1 / this.cfg.hopFrames;
        this.height = Math.sin(Math.min(1, this.hop) * Math.PI) * this.cfg.hopHeight;
        if (this.hop >= 1) { this.height = 0; this.rest = 22; this.squash = 1; }
        else this.local += dir * step * 1.6;
      }
    } else {
      this.local += dir * step;
      if (this.type === 'roller') this.spin += dir * step * 6;
    }
    this.moveDir = dir;
    return null;
  };

  Alien.prototype.grounded = function () { return this.height < 0.08; };

  Alien.prototype.knockBack = function (planetAngle, side) {
    this.local = TOP + side * 0.62 - planetAngle;
    this.stun = 55;
    this.vh = 0.06;
    this.height = Math.max(this.height, 0.01);
    if (this.type === 'bouncer') { this.rest = 30; this.hop = 0; }
  };

  Alien.prototype.draw = function (ctx, g, R) {
    var wa, h;
    if (this.state === 'warp' || this.state === 'fall') { wa = this.worldAngle; h = (this.dist - 1) * R; }
    else { wa = this.local + g.angle; h = this.height * R; }
    var x = g.cx + Math.cos(wa) * (R + h);
    var y = g.cy + Math.sin(wa) * (R + h);
    var w = this.width * R;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wa + Math.PI / 2);
    if (this.state === 'warp') {
      var k = this.warp;
      ctx.globalAlpha = k;
      CC.render.sparkle(ctx, 0, -w * 0.4, w * 0.18 * (1.5 - k), '#a8fff4', 1 - k * 0.5);
      ctx.scale(k, k);
    }
    if (this.state === 'fall') ctx.rotate(Math.sin(this.t * 0.08) * 0.15);
    var sq = this.squash;
    ctx.scale(1 + sq * 0.25, 1 - sq * 0.25);
    if (this.stun > 0 && this.stun % 8 < 4) ctx.globalAlpha *= 0.6;
    drawAlienBody(ctx, this, w);
    ctx.restore();
  };

  function drawAlienBody(ctx, a, w) {
    var flip = a.moveDir < 0;
    var A = CC.assets;
    if (a.skin.indexOf('cute:') === 0) {
      var color = a.skin.slice(5);
      if (!A.drawFeet(ctx, 'alien_cute_' + color, w * 0.95, flip)) A.drawCuteAlien(ctx, w, color, a.t, a.squash);
      return;
    }
    if (a.type === 'roller') {
      ctx.translate(0, -w / 2);
      ctx.rotate(a.spin);
      if (!A.drawCentered(ctx, 'alien_roller', w)) fallbackBall(ctx, w, '#ff8a2a', true);
      return;
    }
    if (a.type === 'bouncer') {
      if (!A.drawFeet(ctx, 'alien_bouncer', w * 0.95, flip)) A.drawCuteAlien(ctx, w, 'pink', a.t, a.squash);
      return;
    }
    if (!A.drawFeet(ctx, 'alien_crawler', w * 0.35, flip)) A.drawCuteAlien(ctx, w * 0.7, 'green', a.t, a.squash);
  }

  function fallbackBall(ctx, w, color, spikes) {
    var r = w * 0.38;
    ctx.fillStyle = color; ctx.strokeStyle = CC.assets.OUTLINE; ctx.lineWidth = 2;
    if (spikes) {
      ctx.beginPath();
      for (var i = 0; i < 24; i++) {
        var rr = i % 2 ? r : r * 1.3, an = i / 24 * TAU;
        ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  // ---- Boss -----------------------------------------------------------------

  function Boss(kind, spec) {
    var cfg = CC.config.boss[kind];
    this.kind = kind;
    this.cfg = cfg;
    this.name = (spec.mini ? 'MINI ' : '') + cfg.name;
    this.width = cfg.size * spec.scale;
    this.maxHp = Math.max(4, Math.round(cfg.hp * spec.hpScale));
    this.hp = this.maxHp;
    this.state = 'fall';
    this.worldAngle = 0.5;
    this.dist = 3.2;
    this.local = 0;
    this.stun = 0;
    this.invuln = 0;
    this.flash = 0;
    this.t = 0;
    this.gooTimer = 120;
    this.spawnTimer = 200;
    this.dying = 0;
    this.prevD = null;
    this.moveDir = 0;
    this.squash = 0;
  }

  Boss.prototype.enraged = function () { return this.hp <= this.maxHp / 2; };
  Boss.prototype.halfArc = function () { return this.width * 0.32; };

  Boss.prototype.update = function (planetAngle) {
    this.t++;
    this.squash *= 0.9;
    if (this.flash > 0) this.flash--;
    if (this.invuln > 0) this.invuln--;
    if (this.state === 'fall') {
      this.dist -= 0.035;
      if (this.dist <= 1) {
        this.dist = 1;
        this.state = 'landed';
        this.local = this.worldAngle - planetAngle;
        this.squash = 1;
        return 'land';
      }
      return null;
    }
    if (this.state === 'dying') { this.dying++; return null; }
    if (this.stun > 0) { this.stun--; return null; }
    var diff = wrap(TOP - planetAngle - this.local);
    this.moveDir = diff > 0 ? 1 : -1;
    this.local += this.moveDir * this.cfg.creep * (this.enraged() ? 1.6 : 1);
    var ev = null;
    if (--this.gooTimer <= 0) {
      this.gooTimer = this.cfg.gooEvery[this.enraged() ? 1 : 0];
      ev = 'goo';
    }
    if (--this.spawnTimer <= 0) {
      this.spawnTimer = this.cfg.spawnEvery[this.enraged() ? 1 : 0];
      ev = ev || 'spawn';
    }
    return ev;
  };

  Boss.prototype.knockBack = function (planetAngle, side, amount) {
    this.local = TOP + side * amount - planetAngle;
    this.stun = this.cfg.stunFrames;
    this.invuln = this.cfg.stunFrames;
  };

  Boss.prototype.surfacePoint = function (g, R, up) {
    var wa = this.state === 'fall' ? this.worldAngle : this.local + g.angle;
    var h = this.state === 'fall' ? (this.dist - 1) * R : 0;
    var rr = R + h + (up || 0) * R;
    return { x: g.cx + Math.cos(wa) * rr, y: g.cy + Math.sin(wa) * rr, a: wa };
  };

  Boss.prototype.draw = function (ctx, g, R) {
    var p = this.surfacePoint(g, R, 0);
    var w = this.width * R;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a + Math.PI / 2);
    var wob = Math.sin(this.t * 0.09) * 0.05;
    var sq = this.squash * 0.3;
    var k = this.state === 'dying' ? Math.max(0, 1 - this.dying / 90) : 1;
    ctx.scale((1 + wob + sq) * k, (1 - wob - sq) * (this.state === 'dying' ? k * k : 1));
    if (this.invuln > 0 && this.invuln % 10 < 5) ctx.globalAlpha = 0.75;
    var flip = this.moveDir > 0;
    if (!CC.assets.drawFeet(ctx, 'boss_blob', w * 0.82, flip)) CC.assets.drawCuteAlien(ctx, w, 'orange', this.t, this.squash);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash / 12;
      CC.assets.drawFeet(ctx, 'boss_blob', w * 0.82, flip);
    }
    ctx.restore();
  };

  // ---- Goo shot (boss projectile) ----------------------------------------------

  function Goo(from, to, flight, arc) {
    this.from = from; this.to = to;
    this.flight = flight; this.arc = arc;
    this.t = 0;
    this.done = false;
  }
  Goo.prototype.pos = function () {
    var k = this.t / this.flight;
    return {
      x: this.from.x + (this.to.x - this.from.x) * k,
      y: this.from.y + (this.to.y - this.from.y) * k - Math.sin(k * Math.PI) * this.arc
    };
  };
  Goo.prototype.update = function () {
    this.t++;
    if (this.t >= this.flight) { this.done = true; return 'hit'; }
    return null;
  };
  Goo.prototype.draw = function (ctx, R) {
    var p = this.pos();
    var r = R * 0.09;
    ctx.save();
    // target marker on the astronaut
    var k = this.t / this.flight;
    ctx.strokeStyle = 'rgba(140,255,90,' + (0.3 + 0.5 * k) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.to.x, this.to.y, r * (2.4 - k * 1.2), 0, TAU); ctx.stroke();
    var gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
    gg.addColorStop(0, 'rgba(160,255,90,0.6)'); gg.addColorStop(1, 'rgba(160,255,90,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7dff4a'; ctx.strokeStyle = '#1f5a12'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  };

  // ---- Effects ---------------------------------------------------------------

  function Effects() { this.parts = []; this.pops = []; }

  Effects.prototype.clear = function () { this.parts.length = 0; this.pops.length = 0; };

  Effects.prototype.splat = function (x, y, color, scale) {
    var n = Math.round(14 * scale);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = (1.5 + Math.random() * 4) * scale;
      this.parts.push({ kind: 'goo', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        life: 0, max: 30 + Math.random() * 25, size: (3 + Math.random() * 5) * scale, color: color });
    }
    for (i = 0; i < 5; i++) {
      a = Math.random() * TAU; s = 2 + Math.random() * 3;
      this.parts.push({ kind: 'star', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 30 + Math.random() * 15, size: (6 + Math.random() * 6) * scale, rot: Math.random() * 3,
        color: Math.random() < 0.8 ? '#ffd23f' : '#62c8ff' });
    }
  };

  Effects.prototype.sparks = function (x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = 2 + Math.random() * 5;
      this.parts.push({ kind: 'spark', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 18 + Math.random() * 14, size: 2 + Math.random() * 2, color: color });
    }
  };

  Effects.prototype.dust = function (x, y, vx, vy, color) {
    this.parts.push({ kind: 'dust', x: x, y: y, vx: vx, vy: vy, life: 0, max: 26, size: 3 + Math.random() * 4, color: color });
  };

  Effects.prototype.ring = function (x, y, r0, r1, color, max) {
    this.parts.push({ kind: 'ring', x: x, y: y, r0: r0, r1: r1, life: 0, max: max || 26, color: color });
  };

  Effects.prototype.pop = function (text, x, y, size, style, opts) {
    opts = opts || {};
    this.pops.push({ text: text, x: x, y: y, size: size, style: style, life: 0,
      max: opts.max || 60, vy: opts.vy == null ? -0.6 : opts.vy, rot: opts.rot || (Math.random() - 0.5) * 0.3,
      tag: opts.tag });
    if (opts.tag) {
      // only one pop per tag on screen (e.g. the combo counter)
      for (var i = this.pops.length - 2; i >= 0; i--) if (this.pops[i].tag === opts.tag) this.pops.splice(i, 1);
    }
  };

  Effects.prototype.update = function () {
    var p, i;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i];
      p.life++;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      if (p.kind === 'ring') continue;
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'goo') { p.vy += 0.18; p.vx *= 0.98; }
      else { p.vx *= 0.94; p.vy *= 0.94; }
      if (p.rot != null) p.rot += 0.15;
    }
    for (i = this.pops.length - 1; i >= 0; i--) {
      p = this.pops[i];
      p.life++;
      p.y += p.vy;
      if (p.life >= p.max) this.pops.splice(i, 1);
    }
  };

  Effects.prototype.draw = function (ctx, t) {
    var i, p, k;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      if (p.kind === 'goo') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU); ctx.fill();
      } else if (p.kind === 'star') {
        CC.render.star5(ctx, p.x, p.y, p.size * (0.6 + k * 0.4), p.rot, p.color);
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.stroke();
      } else if (p.kind === 'dust') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - k), 0, TAU); ctx.fill();
      } else if (p.kind === 'ring') {
        var r = p.r0 + (p.r1 - p.r0) * (1 - k * k);
        ctx.strokeStyle = p.color; ctx.lineWidth = 2 + 6 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < this.pops.length; i++) {
      p = this.pops[i];
      var life = p.life;
      // elastic pop-in, fade out
      var s = life < 10 ? 0.3 + (life / 10) * 0.95 : life < 16 ? 1.25 - (life - 10) / 6 * 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.max - life) / 15);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(s, s);
      CC.render.popText(ctx, p.text, p.size, p.style, t);
      ctx.restore();
    }
  };

  CC.entities = {
    wrap: wrap,
    TOP: TOP,
    GOO: GOO,
    Alien: Alien,
    Boss: Boss,
    Goo: Goo,
    Effects: Effects
  };
})(window.CC = window.CC || {});
