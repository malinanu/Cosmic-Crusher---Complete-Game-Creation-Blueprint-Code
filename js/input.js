// Keyboard, mouse/touch drag, on-screen D-pad and buttons, and tilt.
// read() returns { dir, boost, slam, super } once per update step; dir is
// -1..1 (positive = run right) and the other three are one-shot presses.
(function (CC) {
  'use strict';

  var keys = { left: false, right: false };
  var pad = { left: false, right: false };
  var pending = { boost: false, slam: false, super: false };
  var tilt = { enabled: false, value: 0, listening: false };
  var drag = { active: false, id: null, lastX: 0, lastY: 0, startX: 0, startY: 0, startT: 0, vel: 0 };
  var joystick = { active: false, id: null, dir: 0, originX: 0, originY: 0, maxRadius: 52, deadzone: 5, boostTriggered: false, slamTriggered: false };
  var handlers = {};
  var enabled = false;

  function on(name, fn) { handlers[name] = fn; }
  function fire(name, arg) { if (handlers[name]) handlers[name](arg); }

  function setEnabled(v) {
    enabled = v;
    if (!v) {
      keys.left = keys.right = pad.left = pad.right = false;
      joystick.active = false; joystick.dir = 0;
      pending.boost = pending.slam = pending.super = false;
      drag.active = false; drag.vel = 0;
    }
  }

  function keyDir(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') return 'left';
    if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'right';
    return null;
  }

  function onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    var d = keyDir(e);
    if (d) { keys[d] = true; if (enabled) e.preventDefault(); return; }
    if (e.repeat) return;
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W':
        if (enabled) { pending.boost = true; e.preventDefault(); }
        break;
      case 'ArrowDown': case 's': case 'S':
        if (enabled) { pending.slam = true; e.preventDefault(); }
        break;
      case ' ':
        if (enabled) { pending.super = true; e.preventDefault(); }
        break;
      case 'p': case 'P':
        fire('pause');
        break;
      case 'Escape':
        // never preventDefault on Esc: the host page (YouTube) needs it too
        fire('escape');
        break;
      case '1': fire('planet', 'mars'); break;
      case '2': fire('planet', 'earth'); break;
      case '3': fire('planet', 'moon'); break;
    }
  }

  function onKeyUp(e) {
    var d = keyDir(e);
    if (d) keys[d] = false;
  }

  // Drag horizontally on the playfield to spin; a quick flick up = boost,
  // flick down = slam.
  function bindDrag(el) {
    el.addEventListener('pointerdown', function (e) {
      if (!enabled || drag.active) return;
      drag.active = true; drag.id = e.pointerId;
      drag.lastX = drag.startX = e.clientX;
      drag.lastY = drag.startY = e.clientY;
      drag.startT = performance.now();
      drag.vel = 0;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag.active || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.lastX;
      drag.vel = drag.vel * 0.5 + dx * 0.5;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
    });
    function end(e) {
      if (!drag.active || e.pointerId !== drag.id) return;
      var dt = performance.now() - drag.startT;
      var dy = e.clientY - drag.startY, dx = e.clientX - drag.startX;
      if (dt < 300 && Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        if (dy < 0) pending.boost = true; else pending.slam = true;
      }
      drag.active = false; drag.vel = 0;
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // Floating virtual joystick: smooth analog thumbstick anywhere on the left zone.
  function bindJoystick(zone, base, stick) {
    if (!zone || !base || !stick) return;

    function start(e) {
      if (!enabled || joystick.active) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      joystick.active = true;
      joystick.id = e.pointerId;
      joystick.dir = 0;
      joystick.boostTriggered = false;
      joystick.slamTriggered = false;

      joystick.originX = e.clientX;
      joystick.originY = e.clientY;

      base.style.left = e.clientX + 'px';
      base.style.top = e.clientY + 'px';
      base.style.bottom = 'auto';
      base.classList.add('floating');
      base.classList.add('active');
      stick.style.transform = 'translate(0px, 0px)';

      try { zone.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    }

    function move(e) {
      if (!joystick.active || e.pointerId !== joystick.id) return;
      var dx = e.clientX - joystick.originX;
      var dy = e.clientY - joystick.originY;
      var dist = Math.hypot(dx, dy);

      var stickX = dx;
      var stickY = dy;
      if (dist > joystick.maxRadius) {
        var angle = Math.atan2(dy, dx);
        stickX = Math.cos(angle) * joystick.maxRadius;
        stickY = Math.sin(angle) * joystick.maxRadius;
      }

      stick.style.transform = 'translate(' + stickX.toFixed(1) + 'px, ' + stickY.toFixed(1) + 'px)';

      var absX = Math.abs(stickX);
      if (absX < joystick.deadzone) {
        joystick.dir = 0;
      } else {
        var sign = Math.sign(stickX);
        var norm = (absX - joystick.deadzone) / (joystick.maxRadius - joystick.deadzone);
        joystick.dir = Math.max(-1, Math.min(1, sign * norm));
      }

      // Vertical gestures: flick/push up = boost, pull down = slam
      if (stickY < -0.65 * joystick.maxRadius && !joystick.boostTriggered) {
        pending.boost = true;
        joystick.boostTriggered = true;
      } else if (stickY > -0.3 * joystick.maxRadius) {
        joystick.boostTriggered = false;
      }

      if (stickY > 0.65 * joystick.maxRadius && !joystick.slamTriggered) {
        pending.slam = true;
        joystick.slamTriggered = true;
      } else if (stickY < 0.3 * joystick.maxRadius) {
        joystick.slamTriggered = false;
      }

      e.preventDefault();
    }

    function end(e) {
      if (!joystick.active || (e && e.pointerId !== joystick.id)) return;
      joystick.active = false;
      joystick.id = null;
      joystick.dir = 0;
      joystick.boostTriggered = false;
      joystick.slamTriggered = false;

      base.classList.remove('floating');
      base.classList.remove('active');
      stick.style.transform = 'translate(0px, 0px)';
      base.style.left = '';
      base.style.top = '';
      base.style.bottom = '';
    }

    zone.addEventListener('pointerdown', start);
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // Hold-style button: sets a flag while pressed.
  function hold(el, set) {
    if (!el) return;
    function down(e) {
      e.preventDefault();
      set(true);
      el.classList.add('pressed');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    function up() { set(false); el.classList.remove('pressed'); }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function tap(el, fn) {
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      el.classList.add('pressed');
      fn();
    });
    function up() { el.classList.remove('pressed'); }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function onOrientation(e) {
    if (e.gamma == null) return;
    var angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    var v;
    if (angle === 90) v = e.beta;
    else if (angle === -90 || angle === 270) v = -e.beta;
    else v = e.gamma;
    var dead = 4;
    if (Math.abs(v) < dead) v = 0;
    else v = (v - Math.sign(v) * dead) / 22;
    tilt.value = Math.max(-1, Math.min(1, v));
  }

  // iOS asks for motion permission, and only from a tap.
  // Modern browsers require a secure context (HTTPS) for DeviceOrientationEvent.
  function enableTilt() {
    tilt.enabled = true;
    function listen() {
      if (!tilt.listening) {
        window.addEventListener('deviceorientation', onOrientation, true);
        window.addEventListener('deviceorientationabsolute', onOrientation, true);
        tilt.listening = true;
      }
      return true;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      listen();
      return Promise.resolve({ ok: false, reason: 'insecure' });
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission()
        .then(function (state) {
          if (state === 'granted') { listen(); return { ok: true }; }
          return { ok: false, reason: 'denied' };
        })
        .catch(function () { return { ok: false, reason: 'denied' }; });
    }
    if (typeof DeviceOrientationEvent !== 'undefined' || 'ondeviceorientation' in window) {
      listen();
      return Promise.resolve({ ok: true });
    }
    listen();
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  function disableTilt() { tilt.enabled = false; tilt.value = 0; }

  function init(opts) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { keys.left = keys.right = false; });
    bindDrag(opts.canvas);
    bindJoystick(opts.joystickZone, opts.joystickBase, opts.joystickStick);
    hold(opts.left, function (v) { pad.left = v; });
    hold(opts.right, function (v) { pad.right = v; });
    tap(opts.up, function () { if (enabled) pending.boost = true; });
    tap(opts.down, function () { if (enabled) pending.slam = true; });
    tap(opts.boost, function () { if (enabled) { pending.boost = true; pending.slam = true; } });
    tap(opts.super, function () { if (enabled) pending.super = true; });
  }

  function read() {
    var dir = 0;
    if (enabled) {
      if (keys.left || pad.left) dir -= 1;
      if (keys.right || pad.right) dir += 1;
      if (joystick.active) dir += joystick.dir;
      if (tilt.enabled) dir += tilt.value;
      if (drag.active) {
        dir += Math.max(-1, Math.min(1, drag.vel / 5));
        drag.vel *= 0.8;
      }
    }
    var out = {
      dir: Math.max(-1, Math.min(1, dir)),
      boost: pending.boost, slam: pending.slam, super: pending.super
    };
    pending.boost = pending.slam = pending.super = false;
    return out;
  }

  CC.input = {
    init: init,
    read: read,
    on: on,
    setEnabled: setEnabled,
    enableTilt: enableTilt,
    disableTilt: disableTilt
  };
})(window.CC = window.CC || {});
