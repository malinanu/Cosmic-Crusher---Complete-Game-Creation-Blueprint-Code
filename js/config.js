// Every gameplay tunable lives here. Speeds are per 1/60 s frame, angles in
// radians, sizes as fractions of the planet radius R unless noted.
(function (CC) {
  'use strict';

  CC.config = {
    fps: 60,

    // Spin physics: ω = (ω + α) · μ each frame (blueprint §2), capped at maxSpin.
    // threshold = slowest spin that still crushes a landed alien.
    // Low accel + high friction = a spin that builds up and coasts down gently.
    planets: {
      moon: {
        name: 'Moon', accel: 0.00066, friction: 0.985, maxSpin: 0.033, threshold: 0.0114,
        glow: '#7fd6ff', blurb: 'Light & slippery: fast top speed, slow to stop.'
      },
      earth: {
        name: 'Earth', accel: 0.00066, friction: 0.975, maxSpin: 0.027, threshold: 0.0093,
        glow: '#5fb8ff', blurb: 'Balanced all-rounder.'
      },
      mars: {
        name: 'Mars', accel: 0.00072, friction: 0.965, maxSpin: 0.023, threshold: 0.0072,
        glow: '#ff9a55', blurb: 'Heavy: crushes at low speed, stops fast.'
      }
    },
    // Share of the gap between the current push and the input closed each
    // frame, so pressing and releasing ease in instead of snapping.
    inputEase: 0.12,
    planetOrder: ['mars', 'earth', 'moon'],

    // Holding the spin in the red zone too long makes the astronaut stumble.
    overheat: { zone: 0.82, frames: 200, stunFrames: 60 },

    astronaut: {
      height: 0.62,         // sprite height as a fraction of R
      footArc: 0.19,        // half-width of the crush zone at the top, radians at R
      maxHealth: 100,
      hurtInvuln: 60,
      jump: { height: 0.5, frames: 40, cooldown: 240, fastFall: 2.2 },
      slamArc: 0.45,        // ±25° shockwave on landing
      superFrames: 360,     // SHIELD/CRUSH duration
      superPerCrush: 8,
      superPerCombo: 1
    },

    // Enemy types. size = sprite width as a fraction of R.
    enemies: {
      // drag = share of spin kept after rolling one flat
      crawler: { size: 0.42, walk: 0.0032, damage: 10, score: 100, drag: 0.95 },
      bouncer: { size: 0.4, walk: 0.0045, damage: 8, score: 150, drag: 0.95, hopFrames: 70, hopHeight: 0.42 },
      roller:  { size: 0.36, walk: 0.0060, damage: 12, score: 200, drag: 0.88, armor: 1.5 }
    },

    boss: {
      blob: {
        name: 'GIGANT BLOB', size: 0.85, hp: 20, creep: 0.0024, damage: 25,
        hitSpeed: 1.3,       // × planet threshold needed to land a hit
        knockback: 1.4, stunFrames: 50,
        gooEvery: [260, 170],   // frames between goo volleys (calm, enraged)
        spawnEvery: [420, 300],
        gooDamage: 12, gooFlight: 70
      }
    },

    combo: { window: 90, max: 8 },

    score: {
      slamMultiplier: 1.5,
      bossHit: 500,
      bossDefeat: 5000,
      clearPerHealth: 10
    },

    // How far out aliens appear (× R) and how descent speed maps to pixels.
    spawn: { distance: 1.35, excludeTop: 0.7, speedScale: 1 / 100 },

    shake: { crush: 4, hurt: 10, slam: 12, bossHit: 14 }
  };
})(window.CC = window.CC || {});
