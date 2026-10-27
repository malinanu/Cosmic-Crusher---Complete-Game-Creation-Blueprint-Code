// The game itself: planet spin physics, spawning, crushing, waves, the boss,
// and drawing the playfield. One update() call is one 1/60 s step.
(function (CC) {
  'use strict';

  var E = CC.entities;
  var TAU = Math.PI * 2;
  var TOP = E.TOP;
  var wrap = E.wrap;

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = new CC.render.Background();
    this.fx = new E.Effects();
    this.listeners = {};
    this.flags = { god: false, debug: false, boss: false };
    this.settings = { shake: true };
    this.t = 0;
    this.mode = 'attract';
    this.state = 'idle';
    this.planetKey = 'moon';
    this.planet = CC.config.planets.moon;
    this.angle = 0;
    this.prevAngle = 0;
    this.omega = 0;
    this.drive = 0;
    this.resetRun();
    this.resize();
  }

  Game.prototype.on = function (type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  };

  Game.prototype.emit = function (type, data) {
    var l = this.listeners[type];
    if (l) for (var i = 0; i < l.length; i++) l[i](data || {});
  };

  Game.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    // A hidden WebView reports 0×0 at first: keep the last good layout and
    // lay out again on the next resize.
    if (!w || !h) {
      if (this.w) return;
      w = w || 1; h = h || 1;
    }
    // Full device resolution (up to 3×) so text and sprites stay sharp,
    // within a pixel budget that keeps big tablets and monitors fast.
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var budget = 9.5e6;   // covers 1080p at 2x and 12.9" tablets
    if (w * h * dpr * dpr > budget) dpr = Math.max(1, Math.sqrt(budget / (w * h)));
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    var portrait = h >= w;
    this.R = Math.max(70, Math.min(260, Math.min(w * 0.32, h * (portrait ? 0.2 : 0.25))));
    this.cx = w / 2;
    this.cy = portrait ? h * 0.5 : h * 0.57;
    if (portrait) {
      // Keep the astronaut below the top HUD (score, boss bar), notch included.
      var clear = 140 + safeTop() + this.R * (1 + CC.config.astronaut.height) + 4;
      this.cy = Math.max(this.cy, Math.min(clear, h - this.R - 8));
    }
    this.bg.resize(w, h, dpr);
  };

  // Height of the notch / status-bar area (CSS env(safe-area-inset-top)).
  var probe = null;
  function safeTop() {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top, 0px)';
      document.body.appendChild(probe);
    }
    return probe.offsetHeight || 0;
  }

  Game.prototype.resetRun = function () {
    var A = CC.config.astronaut;
    this.aliens = [];
    this.goos = [];
    this.boss = null;
    this.fx.clear();
    this.health = A.maxHealth;
    this.score = 0;
    this.crushes = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.superCharge = 0;
    this.superTime = 0;
    this.invuln = 0;
    this.heat = 0;
    this.stumble = 0;
    this.jump = null;
    this.jumpCooldown = 0;
    this.runPhase = 0;
    this.facing = 1;
    this.shakeAmt = 0;
    this.stateTimer = 0;
    this.banner = null;
    this.waveIndex = 0;
    this.waveSpawned = 0;
    this.spawnTimer = 0;
    this.attractCrushes = 0;
  };

  Game.prototype.setPlanet = function (key) {
    if (!CC.config.planets[key] || key === this.planetKey) return;
    this.planetKey = key;
    this.planet = CC.config.planets[key];
    this.omega = Math.max(-this.planet.maxSpin, Math.min(this.planet.maxSpin, this.omega));
    this.fx.ring(this.cx, this.cy, this.R * 0.9, this.R * 1.5, this.planet.glow, 30);
    this.emit('planet', { key: key });
  };

  Game.prototype.startAttract = function () {
    this.mode = 'attract';
    this.state = 'playing';
    this.resetRun();
    this.level = CC.levels.get(3);
  };

  Game.prototype.startLevel = function (n) {
    this.mode = 'level';
    this.resetRun();
    this.level = CC.levels.get(n);
    this.omega = 0;
    this.drive = 0;
    this.state = 'intro';
    this.stateTimer = 110;
    this.banner = {
      title: 'LEVEL ' + this.level.level, sub: this.level.boss ? 'BOSS LEVEL' : 'WAVE 1 / ' + this.level.waves.length,
      goal: '★★★ ' + this.level.target.toLocaleString('en-US') + ' PTS'
    };
    this.emit('levelStart', { level: this.level.level });
  };

  Game.prototype.waveCount = function () {
    return this.level.waves.length + (this.level.boss ? 1 : 0);
  };

  // ---- Update ------------------------------------------------------------------

  Game.prototype.update = function (input) {
    this.t++;
    this.prevAngle = this.angle;
    if (this.state === 'paused' || this.state === 'done' || this.state === 'idle') return;
    var cfg = CC.config;
    var A = cfg.astronaut;
    var P = this.planet;
    var attract = this.mode === 'attract';

    if (attract) input = this.attractInput();

    // --- spin ---
    var superOn = this.superTime > 0;
    var dir = this.stumble > 0 || this.state === 'lost' ? 0 : input.dir;
    if (superOn && Math.abs(dir) < 0.1) dir = this.facing; // super keeps you rolling
    this.drive += (dir - this.drive) * cfg.inputEase;
    var accel = P.accel * (superOn ? 1.4 : 1);
    var friction = superOn ? Math.max(P.friction, 0.985) : P.friction;
    this.omega = (this.omega - this.drive * accel) * friction;
    var max = P.maxSpin * (superOn ? 1.15 : 1);
    if (this.omega > max) this.omega = max;
    if (this.omega < -max) this.omega = -max;
    this.angle = (this.angle + this.omega) % TAU;
    var speed = Math.abs(this.omega);
    if (speed > 0.002) this.facing = this.omega < 0 ? 1 : -1;
    this.runPhase += speed * 7;

    // --- overheat ---
    if (!superOn && !attract && speed > cfg.overheat.zone * P.maxSpin) this.heat++;
    else this.heat = Math.max(0, this.heat - 2);
    if (this.heat >= cfg.overheat.frames) {
      this.heat = 0;
      this.stumble = cfg.overheat.stunFrames;
      this.omega *= 0.2;
      this.fx.pop('TOO FAST!', this.cx, this.cy + this.R * 0.3, this.R * 0.2, 'hurt', { max: 70, vy: 0 });
      this.addShake(8);
      this.emit('stumble');
    }
    if (this.stumble > 0) this.stumble--;

    // --- abilities ---
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.state === 'playing' || this.state === 'boss' || this.state === 'waveBreak') {
      if (input.boost && !this.jump && this.jumpCooldown === 0 && this.stumble === 0) this.startJump();
      if (input.slam && this.jump && this.jump.p > 0.15) this.jump.fast = true;
      if (input.super && this.superCharge >= 100 && !superOn) this.activateSuper();
    }
    if (this.jump) this.updateJump();
    if (this.superTime > 0) {
      this.superTime--;
      if (this.superTime === 0) this.emit('superEnd');
    }
    if (this.invuln > 0) this.invuln--;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;

    // --- dust kicked up by fast spin ---
    if (speed > P.threshold && this.t % 3 === 0 && !this.jump) {
      var fy = this.cy - this.R;
      this.fx.dust(this.cx + (Math.random() - 0.5) * this.R * 0.2, fy, this.omega > 0 ? 2.5 : -2.5, -0.6 - Math.random(),
        this.planetKey === 'mars' ? 'rgba(230,140,80,0.5)' : 'rgba(220,225,240,0.45)');
    }

    // --- state machine ---
    this.stepState();

    // --- entities ---
    this.updateAliens();
    if (this.boss) this.updateBoss();
    this.updateGoos();
    this.fx.update();
    this.shakeAmt *= 0.86;
  };

  Game.prototype.attractInput = function () {
    // Menu background: keep the planet rolling at a crushing speed.
    var want = this.planet.threshold * 1.6;
    return { dir: Math.abs(this.omega) < want ? 1 : 0 };
  };

  Game.prototype.stepState = function () {
    var L = this.level;
    switch (this.state) {
      case 'intro':
        if (--this.stateTimer <= 0) {
          this.state = 'playing';
          this.banner = null;
          this.beginWave(0);
          if (this.flags.boss && L.boss) {
            // debug shortcut (?boss=1): skip the minion waves
            this.waveIndex = L.waves.length - 1;
            this.waveSpawned = L.waves[this.waveIndex];
          }
        }
        break;
      case 'waveBreak':
        if (--this.stateTimer <= 0) { this.state = 'playing'; this.banner = null; }
        break;
      case 'playing':
        if (this.mode === 'attract') { this.spawnAttract(); break; }
        this.spawnWave();
        if (this.waveSpawned >= L.waves[this.waveIndex] && this.liveAliens() === 0) {
          if (this.waveIndex + 1 < L.waves.length) {
            this.beginWave(this.waveIndex + 1);
            this.state = 'waveBreak';
            this.stateTimer = 90;
            this.banner = { title: 'WAVE ' + (this.waveIndex + 1), sub: 'GET READY' };
            this.emit('wave', { index: this.waveIndex });
          } else if (L.boss) {
            this.waveIndex = L.waves.length;
            this.state = 'boss';
            this.boss = new E.Boss(L.boss.type, L.boss);
            this.banner = { title: 'BOSS!', sub: this.boss.name, style: 'boss' };
            this.stateTimer = 120;
            this.emit('bossIntro', { name: this.boss.name });
          } else {
            this.win();
          }
        }
        break;
      case 'boss':
        if (this.stateTimer > 0 && --this.stateTimer === 0) this.banner = null;
        if (this.boss && this.boss.state === 'dying' && this.boss.dying > 95) {
          this.boss = null;
          this.win();
        }
        break;
      case 'won':
      case 'lost':
        if (--this.stateTimer <= 0) {
          var result = this.result(this.state === 'won');
          this.state = 'done';
          this.emit(result.won ? 'win' : 'lose', result);
        }
        break;
    }
  };

  Game.prototype.beginWave = function (i) {
    this.waveIndex = i;
    this.waveSpawned = 0;
    this.spawnTimer = this.level.spawnFrames - 25;
  };

  Game.prototype.liveAliens = function () {
    var n = 0;
    for (var i = 0; i < this.aliens.length; i++) if (!this.aliens[i].bossMinion) n++;
    return n;
  };

  Game.prototype.spawnWave = function () {
    var L = this.level;
    var goal = L.waves[this.waveIndex];
    if (this.waveSpawned >= goal) return;
    if (++this.spawnTimer < L.spawnFrames) return;
    this.spawnTimer = 0;
    for (var b = 0; b < L.burst && this.waveSpawned < goal && this.aliens.length < L.maxAlive; b++) {
      this.spawnAlien(this.pickType());
      this.waveSpawned++;
    }
  };

  Game.prototype.spawnAttract = function () {
    if (++this.spawnTimer < 50 || this.aliens.length >= 7) return;
    this.spawnTimer = 0;
    this.spawnAlien(Math.random() < 0.8 ? 'crawler' : 'bouncer');
  };

  Game.prototype.pickType = function () {
    var mix = this.level.mix, total = 0, k;
    for (k in mix) total += mix[k];
    var r = Math.random() * total;
    for (k in mix) { r -= mix[k]; if (r <= 0) return k; }
    return 'crawler';
  };

  Game.prototype.spawnAlien = function (type, angle, minion) {
    var S = CC.config.spawn;
    if (angle == null) {
      // anywhere but right above the astronaut
      angle = TOP + S.excludeTop + Math.random() * (TAU - S.excludeTop * 2);
    }
    var skin = type;
    if (type === 'crawler') {
      skin = Math.random() < 0.22 ? 'plutonian' : 'cute:' + CC.assets.cuteColors[Math.floor(Math.random() * CC.assets.cuteColors.length)];
    }
    var a = new E.Alien(type, {
      angle: angle,
      dist: 1 + S.distance + Math.random() * 0.25,
      speed: this.level.speed * S.speedScale,
      walkScale: this.level.walkScale,
      skin: skin
    });
    a.bossMinion = !!minion;
    this.aliens.push(a);
    this.emit('spawn');
    return a;
  };

  // ---- Astronaut abilities --------------------------------------------------------

  Game.prototype.astroY = function () {
    var j = this.jump ? Math.sin(Math.min(1, this.jump.p) * Math.PI) * CC.config.astronaut.jump.height * this.R : 0;
    return this.cy - this.R - j;
  };

  Game.prototype.airborne = function () { return !!this.jump && this.jump.p > 0.08 && this.jump.p < 0.94; };

  Game.prototype.startJump = function () {
    var J = CC.config.astronaut.jump;
    this.jump = { p: 0, fast: false };
    this.jumpCooldown = J.cooldown;
    this.fx.ring(this.cx, this.cy - this.R, 4, this.R * 0.35, '#ffc65a', 18);
    this.emit('boost');
  };

  Game.prototype.updateJump = function () {
    var J = CC.config.astronaut.jump;
    var past = this.jump.p >= 0.5;
    this.jump.p += (this.jump.fast && past ? J.fastFall : 1) / J.frames;
    if (this.jump.fast && !past) this.jump.p += 0.6 / J.frames;
    if (this.jump.p >= 1) {
      var hard = this.jump.fast;
      this.jump = null;
      this.slam(hard);
    }
  };

  Game.prototype.slam = function (hard) {
    var A = CC.config.astronaut;
    var arc = A.slamArc * (hard ? 1.25 : 1);
    var fy = this.cy - this.R;
    this.fx.ring(this.cx, fy, 6, this.R * (hard ? 1.1 : 0.85), '#ffe08a', 26);
    this.fx.ring(this.cx, fy, 4, this.R * 0.6, '#ffffff', 18);
    this.addShake(CC.config.shake.slam * (hard ? 1.2 : 0.8));
    var hit = 0;
    for (var i = this.aliens.length - 1; i >= 0; i--) {
      var a = this.aliens[i];
      if (a.state !== 'landed') continue;
      if (Math.abs(wrap(a.local + this.angle - TOP)) < arc + a.halfArc()) {
        this.crush(a, 'slam');
        hit++;
      }
    }
    var b = this.boss;
    if (b && b.state === 'landed' && b.invuln === 0 && Math.abs(wrap(b.local + this.angle - TOP)) < arc + b.halfArc()) {
      this.hitBoss(hard ? 2 : 1, wrap(b.local + this.angle - TOP) >= 0 ? 1 : -1, 1.0);
    }
    this.emit('slam', { hits: hit, hard: hard });
  };

  Game.prototype.activateSuper = function () {
    this.superTime = CC.config.astronaut.superFrames;
    this.superCharge = 0;
    this.fx.ring(this.cx, this.cy - this.R - this.R * 0.25, 10, this.R * 1.6, '#62f0ff', 34);
    this.fx.pop('SUPER CRUSH!', this.cx, this.cy + this.R * 0.3, this.R * 0.22, 'combo', { max: 80, vy: -0.2, rot: 0 });
    this.addShake(10);
    this.emit('super');
  };

  // ---- Combat ---------------------------------------------------------------------

  Game.prototype.crushNeed = function (mult) {
    if (this.superTime > 0) return 0;
    return this.planet.threshold * (mult || 1);
  };

  Game.prototype.updateAliens = function () {
    var A = CC.config.astronaut;
    var footArc = A.footArc;
    var speed = Math.abs(this.omega);
    var air = this.airborne();
    for (var i = this.aliens.length - 1; i >= 0; i--) {
      var a = this.aliens[i];
      var ev = a.update(this.angle);
      if (ev === 'land') {
        var lp = this.surfaceXY(a.local + this.angle, 0);
        this.fx.dust(lp.x, lp.y, 0, -0.5, 'rgba(255,255,255,0.35)');
        this.emit('land');
      }
      if (a.state !== 'landed') continue;

      var d = wrap(a.local + this.angle - TOP);
      var crossed = a.prevD !== null && Math.abs(d) < 0.9 && Math.abs(a.prevD) < 0.9 && (d > 0) !== (a.prevD > 0);
      a.prevD = d;
      if (!(Math.abs(d) < footArc + a.halfArc() || crossed)) continue;
      if (air || this.state === 'lost' || this.state === 'won') continue;

      var side = d >= 0 ? 1 : -1;
      if (a.type === 'bouncer' && !a.grounded()) {
        // Mid-hop bouncers can't be rolled flat: a fast spin swats them
        // away, a slow one lets them bonk you. Slam gets them anywhere.
        if (this.superTime > 0) { this.crush(a, 'roll'); continue; }
        if (a.stun > 0) continue;
        if (speed >= this.crushNeed()) {
          var bp = this.surfaceXY(a.local + this.angle, a.height + 0.2);
          this.fx.pop('BOING!', bp.x, bp.y, this.R * 0.14, 'info', { max: 35, tag: 'boing' });
          this.omega *= 0.75;
          this.emit('boing');
        } else {
          this.hurt(a.cfg.damage, 'BONK!');
        }
        a.knockBack(this.angle, side);
        continue;
      }
      var need = this.crushNeed(a.cfg.armor);
      if (speed >= need) {
        this.crush(a, 'roll');
        if (this.superTime === 0) this.omega *= a.cfg.drag;
      } else if (a.stun === 0 || Math.abs(d) < footArc) {
        // While still flashing from a hit, aliens just bounce off, so a
        // pack can't chain-hit you.
        if (this.hurt(a.cfg.damage, a.type === 'roller' && speed >= this.crushNeed() ? 'TOO SLOW!' : 'OUCH!')) this.omega *= 0.6;
        a.knockBack(this.angle, side);
      }
    }
  };

  Game.prototype.surfaceXY = function (worldAngle, up) {
    var r = this.R * (1 + (up || 0));
    return { x: this.cx + Math.cos(worldAngle) * r, y: this.cy + Math.sin(worldAngle) * r };
  };

  Game.prototype.crush = function (a, how) {
    var S = CC.config.score;
    var A = CC.config.astronaut;
    var idx = this.aliens.indexOf(a);
    if (idx >= 0) this.aliens.splice(idx, 1);
    var p = this.surfaceXY(a.local + this.angle, a.height + 0.12);
    var color = a.color();
    this.fx.splat(p.x, p.y, color, a.type === 'roller' ? 1.1 : 1);
    this.addShake(CC.config.shake.crush);

    if (this.mode === 'attract') {
      if (++this.attractCrushes % 3 === 0) this.fx.pop('SPLAT!', p.x, p.y - this.R * 0.2, this.R * 0.2, 'splat');
      return;
    }

    this.combo = this.comboTimer > 0 ? Math.min(CC.config.combo.max, this.combo + 1) : 1;
    this.comboTimer = CC.config.combo.window;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    var pts = Math.round(a.cfg.score * this.combo * (how === 'slam' ? S.slamMultiplier : 1));
    this.score += pts;
    this.crushes++;
    if (this.superTime === 0) {
      var before = this.superCharge;
      this.superCharge = Math.min(100, this.superCharge + A.superPerCrush + this.combo * A.superPerCombo);
      if (before < 100 && this.superCharge >= 100) this.emit('superReady');
    }

    var word = a.type === 'roller' || how === 'slam' ? 'CRUSH!' : 'SPLAT!';
    var style = color === CC.entities.GOO.green || color === CC.entities.GOO.plutonian ? 'green' : 'splat';
    if (Math.random() < 0.7 || this.combo === 1) {
      // Off to the astronaut's front shoulder so the burst never hides them.
      var pp = how === 'slam' ? this.surfaceXY(a.local + this.angle, 0.55)
        : this.surfaceXY(TOP + this.facing * (0.8 + Math.random() * 0.25), 0.3 + Math.random() * 0.15);
      var margin = this.R * 0.45;
      this.fx.pop(word, Math.max(margin, Math.min(this.w - margin, pp.x)), pp.y, this.R * 0.17, style, { tag: 'splat' + (this.crushes % 2) });
    }
    if (this.combo >= 2) {
      this.fx.pop('X' + this.combo + '\nCOMBO', this.cx - this.facing * this.R * 0.95, this.cy - this.R * 1.4, this.R * 0.2, 'combo',
        { tag: 'combo', max: 70, vy: 0, rot: -0.12 });
    }
    this.emit('crush', { combo: this.combo, type: a.type, how: how, points: pts });
  };

  Game.prototype.hurt = function (dmg, word) {
    if (this.invuln > 0 || this.superTime > 0 || this.mode === 'attract' || this.flags.god) return false;
    if (this.state === 'won' || this.state === 'lost' || this.state === 'done') return false;
    this.health = Math.max(0, this.health - dmg);
    this.invuln = CC.config.astronaut.hurtInvuln;
    this.combo = 0; this.comboTimer = 0;
    this.addShake(CC.config.shake.hurt);
    this.fx.pop(word || 'OUCH!', this.cx - this.facing * this.R * 0.7, this.cy - this.R * 1.3, this.R * 0.17, 'hurt', { max: 50, tag: 'hurt' });
    this.fx.sparks(this.cx, this.cy - this.R * 1.2, '#ff5a5a', 10);
    this.emit('hurt', { health: this.health });
    if (this.health <= 0) this.lose();
    return true;
  };

  Game.prototype.updateBoss = function () {
    var b = this.boss;
    var ev = b.update(this.angle);
    if (ev === 'land') {
      this.addShake(16);
      var lp = b.surfacePoint(this, this.R);
      this.fx.ring(lp.x, lp.y, 10, this.R * 0.9, '#7dff4a', 30);
      this.emit('bossLand');
    }
    if (b.state === 'dying') {
      if (b.dying % 6 === 0) {
        var dp = b.surfacePoint(this, this.R, b.width * 0.35);
        this.fx.splat(dp.x + (Math.random() - 0.5) * this.R * 0.6, dp.y + (Math.random() - 0.5) * this.R * 0.5, '#ff5a2e', 1.3);
        this.addShake(6);
      }
      return;
    }
    if (b.state !== 'landed') return;

    if (ev === 'goo') this.fireGoo(b.enraged() ? 3 : 2);
    if (ev === 'spawn') {
      var wa = b.local + this.angle;
      for (var k = 0; k < 2; k++) this.spawnAlien('crawler', wa + (k ? 0.5 : -0.5), true);
    }

    var d = wrap(b.local + this.angle - TOP);
    var crossed = b.prevD !== null && Math.abs(d) < 0.9 && Math.abs(b.prevD) < 0.9 && (d > 0) !== (b.prevD > 0);
    b.prevD = d;
    if (b.invuln > 0 || this.airborne() || this.state !== 'boss') return;
    if (!(Math.abs(d) < CC.config.astronaut.footArc + b.halfArc() || crossed)) return;
    var side = d >= 0 ? 1 : -1;
    var speed = Math.abs(this.omega);
    if (speed >= this.crushNeed(b.cfg.hitSpeed)) {
      this.hitBoss(speed >= this.planet.threshold * 2.2 ? 2 : 1, side, b.cfg.knockback);
    } else {
      this.hurt(b.cfg.damage, 'SQUISH!');
      b.knockBack(this.angle, side, b.cfg.knockback * 0.7);
    }
    this.omega *= 0.35;
  };

  Game.prototype.hitBoss = function (dmg, side, knock) {
    var b = this.boss;
    b.hp = Math.max(0, b.hp - dmg);
    b.flash = 12;
    b.squash = 1;
    var p = b.surfacePoint(this, this.R, b.width * 0.35);
    this.fx.splat(p.x, p.y, '#ff5a2e', 1.4);
    this.fx.sparks(p.x, p.y, '#ffe08a', 14);
    this.fx.pop('CRUSH!', p.x, p.y - this.R * 0.35, this.R * 0.24, 'boss', { max: 55 });
    this.score += CC.config.score.bossHit * dmg;
    this.addShake(CC.config.shake.bossHit);
    this.emit('bossHit', { hp: b.hp, max: b.maxHp });
    if (b.hp <= 0) {
      b.state = 'dying';
      b.dying = 0;
      this.score += CC.config.score.bossDefeat;
      this.goos.length = 0;
      for (var i = this.aliens.length - 1; i >= 0; i--) if (this.aliens[i].bossMinion) this.crush(this.aliens[i], 'slam');
      this.fx.pop('BOSS DOWN!', this.cx, this.cy + this.R * 0.3, this.R * 0.28, 'boss', { max: 100, vy: -0.15, rot: 0 });
      this.emit('bossDown');
    } else {
      b.knockBack(this.angle, side, knock);
    }
  };

  Game.prototype.fireGoo = function (n) {
    var b = this.boss;
    var C = b.cfg;
    for (var i = 0; i < n; i++) {
      var from = b.surfacePoint(this, this.R, b.width * 0.55);
      var to = { x: this.cx + (Math.random() - 0.5) * this.R * 0.12, y: this.cy - this.R - this.R * 0.18 };
      var g = new E.Goo(from, to, C.gooFlight + i * 14, this.R * (0.9 + Math.random() * 0.4));
      this.goos.push(g);
    }
    this.emit('goo');
  };

  Game.prototype.updateGoos = function () {
    for (var i = this.goos.length - 1; i >= 0; i--) {
      var g = this.goos[i];
      if (g.update() === 'hit') {
        this.goos.splice(i, 1);
        this.fx.splat(g.to.x, g.to.y, '#7dff4a', 0.8);
        if (!this.airborne()) this.hurt(this.boss ? this.boss.cfg.gooDamage : 10, 'SPLAT!');
      } else if (this.t % 2 === 0) {
        var p = g.pos();
        this.fx.dust(p.x, p.y, 0, 0, 'rgba(125,255,74,0.5)');
      }
    }
  };

  Game.prototype.addShake = function (amt) {
    if (this.settings.shake) this.shakeAmt = Math.min(22, this.shakeAmt + amt);
  };

  // ---- End of level -----------------------------------------------------------------

  Game.prototype.win = function () {
    this.state = 'won';
    this.stateTimer = 130;
    this.score += Math.round(this.health * CC.config.score.clearPerHealth);
    this.banner = { title: 'LEVEL CLEAR!', sub: 'STELLAR CRUSHING', style: 'splat' };
    for (var i = this.aliens.length - 1; i >= 0; i--) this.crush(this.aliens[i], 'slam');
    this.emit('levelClear');
  };

  Game.prototype.lose = function () {
    this.state = 'lost';
    this.stateTimer = 130;
    this.jump = null;
    this.banner = { title: 'CRUSHED!', sub: 'THE ALIENS WIN THIS ROUND', style: 'hurt' };
    this.fx.splat(this.cx, this.cy - this.R * 1.1, '#ff4a4a', 1.4);
    this.emit('dead');
  };

  // ★ clear the level, ★★ with half your health or more, ★★★ also reach
  // the level's target score; no stars for a loss.
  Game.prototype.result = function (won) {
    var healthy = this.health >= CC.config.astronaut.maxHealth * CC.config.stars.health;
    var target = this.level.target;
    var stars = !won ? 0 : !healthy ? 1 : this.score >= target ? 3 : 2;
    return {
      won: won, level: this.level.level, score: this.score, crushes: this.crushes,
      bestCombo: this.bestCombo, health: this.health, stars: stars, healthy: healthy, target: target
    };
  };

  Game.prototype.pause = function () {
    if (this.mode !== 'level') return;
    if (this.state === 'paused' || this.state === 'done' || this.state === 'won' || this.state === 'lost') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
  };

  Game.prototype.resume = function () {
    if (this.state === 'paused') this.state = this.pausedFrom || 'playing';
  };

  // HUD snapshot.
  Game.prototype.hud = function () {
    var P = this.planet;
    return {
      health: this.health / CC.config.astronaut.maxHealth,
      score: this.score,
      wave: Math.min(this.waveIndex + 1, this.waveCount()),
      waves: this.waveCount(),
      waveProgress: this.state === 'boss' ? (this.boss ? 1 - this.boss.hp / this.boss.maxHp : 1)
        : this.level.waves[this.waveIndex] ? this.waveSpawned / this.level.waves[this.waveIndex] : 0,
      super: this.superTime > 0 ? this.superTime / CC.config.astronaut.superFrames : this.superCharge / 100,
      superActive: this.superTime > 0,
      superReady: this.superCharge >= 100 && this.superTime === 0,
      spin: Math.min(1, Math.abs(this.omega) / P.maxSpin),
      threshold: P.threshold / P.maxSpin,
      redline: CC.config.overheat.zone,
      heat: this.heat / CC.config.overheat.frames,
      boostReady: 1 - this.jumpCooldown / CC.config.astronaut.jump.cooldown,
      boss: this.boss && this.boss.state !== 'fall' ? { name: this.boss.name, hp: this.boss.hp / this.boss.maxHp } : null,
      planet: this.planetKey,
      level: this.level ? this.level.level : 1,
      target: this.level ? this.level.target : 0
    };
  };

  // ---- Drawing -------------------------------------------------------------------------

  // alpha = how far we are between the last update and the next, so the
  // planet turns smoothly on screens faster than 60 Hz.
  Game.prototype.render = function (alpha) {
    var ctx = this.ctx;
    var R = this.R;
    var simAngle = this.angle;
    if (alpha != null && this.state !== 'paused') {
      this.angle = this.prevAngle + wrap(simAngle - this.prevAngle) * alpha;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var far = this.planetKey === 'earth' ? 'moon' : 'earth';
    this.bg.draw(ctx, this.t, Math.abs(this.omega), far);

    ctx.save();
    if (this.shakeAmt > 0.3) {
      ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    }
    CC.render.drawSwoosh(ctx, this.cx, this.cy, R, this.angle, this.omega, this.planet.maxSpin, this.planet.glow, this.t);
    CC.render.drawPlanet(ctx, this.planetKey, this.cx, this.cy, R, this.angle, this.planet.glow);

    var i;
    for (i = 0; i < this.aliens.length; i++) this.aliens[i].draw(ctx, this, R);
    if (this.boss) this.boss.draw(ctx, this, R);
    this.drawAstronaut(ctx);
    for (i = 0; i < this.goos.length; i++) this.goos[i].draw(ctx, R);
    this.fx.draw(ctx, this.t);
    if (this.flags.debug) this.drawDebug(ctx);
    ctx.restore();

    if (this.banner) this.drawBanner(ctx);
    this.angle = simAngle;
  };

  Game.prototype.drawAstronaut = function (ctx) {
    var A = CC.config.astronaut;
    var R = this.R;
    var h = R * A.height;
    var x = this.cx, y = this.astroY();
    var speed = Math.abs(this.omega);
    var flip = this.facing < 0;
    ctx.save();
    ctx.translate(x, y);
    if (this.invuln > 0 && this.invuln % 8 < 4 && this.state !== 'lost') ctx.globalAlpha = 0.45;

    var key, hh = h;
    if (this.state === 'lost' || this.state === 'done' && this.health <= 0) {
      key = 'astro_splat'; hh = h * 0.6;
    } else if (this.jump) {
      key = 'astro_leap'; hh = h * 1.1;
      ctx.rotate(this.facing * 0.15);
    } else if (this.stumble > 0) {
      key = 'astro_idle';
      ctx.rotate(Math.sin(this.t * 0.5) * 0.35);
    } else if (speed > 0.003) {
      var f = Math.floor(this.runPhase) % 4;
      key = ['astro_run1', 'astro_run2', 'astro_run3', 'astro_run2'][f];
      ctx.rotate(this.facing * Math.min(0.18, speed * 4));
    } else {
      key = 'astro_idle'; hh = h * 1.02;
      ctx.translate(0, Math.sin(this.t * 0.06) * 1.2);
    }
    if (!CC.assets.drawFeet(ctx, key, hh, flip)) CC.assets.drawAstronaut(ctx, h, speed > 0.003 ? 'run' : 'idle', this.runPhase * 4);
    ctx.restore();

    if (this.superTime > 0 && this.state !== 'lost') {
      var pulse = 1 + Math.sin(this.t * 0.25) * 0.05;
      var fade = Math.min(1, this.superTime / 40);
      ctx.save();
      ctx.globalAlpha = 0.75 * fade;
      ctx.translate(x, y - h * 0.5);
      var gg = ctx.createRadialGradient(0, 0, h * 0.3, 0, 0, h * 0.95);
      gg.addColorStop(0, 'rgba(98,240,255,0)'); gg.addColorStop(0.8, 'rgba(98,240,255,0.25)'); gg.addColorStop(1, 'rgba(98,240,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(0, 0, h * 0.95 * pulse, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.55 * fade;
      CC.assets.drawCentered(ctx, 'fx_shield', h * 1.2 * pulse);
      ctx.restore();
    }
  };

  Game.prototype.drawBanner = function (ctx) {
    var b = this.banner;
    var size = Math.max(26, Math.min(this.w * 0.11, 64));
    var y = this.cy - this.R * 0.15;
    var pulse = 1 + Math.sin(this.t * 0.12) * 0.03;
    ctx.save();
    ctx.translate(this.w / 2, y);
    ctx.scale(pulse, pulse);
    CC.render.popText(ctx, b.title, size, b.style || 'info', this.t);
    if (b.sub) {
      ctx.font = Math.round(size * 0.36) + 'px "Russo One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#0a0620';
      ctx.strokeText(b.sub, 0, size * 0.85);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(b.sub, 0, size * 0.85);
    }
    if (b.goal) {
      ctx.font = Math.round(size * 0.3) + 'px "Russo One", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = '#0a0620';
      ctx.strokeText(b.goal, 0, size * 1.32);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(b.goal, 0, size * 1.32);
    }
    ctx.restore();
  };

  Game.prototype.drawDebug = function (ctx) {
    var A = CC.config.astronaut;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R + 4, TOP - A.footArc, TOP + A.footArc); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,0,0.5)';
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R + 10, TOP - A.slamArc, TOP + A.slamArc); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace';
    ctx.fillText('ω ' + this.omega.toFixed(3) + ' thr ' + this.planet.threshold + ' aliens ' + this.aliens.length + ' state ' + this.state, 10, this.h - 10);
    ctx.restore();
  };

  CC.Game = Game;
})(window.CC = window.CC || {});
