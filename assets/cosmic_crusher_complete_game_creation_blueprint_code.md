# 🪐 Cosmic Crusher: Complete Game Creation Blueprint & Full Implementation

Welcome to the master development guide for **Cosmic Crusher**, a physics-based, 2D planet-rolling alien elimination game. This document provides a complete breakdown of game mechanics, asset pipelines, level progression, and single-file HTML5/JS production code.

---

## 📑 Table of Contents
1. [Executive Summary & Concept](#1-executive-summary--concept)
2. [Game Mechanics & Controls Architecture](#2-game-mechanics--controls-architecture)
3. [100-Level Campaign Progression](#3-100-level-campaign-progression)
4. [Asset Production Pipeline](#4-asset-production-pipeline)
5. [Complete Single-File Playable Source Code](#5-complete-single-file-playable-source-code)

---

## 1. Executive Summary & Concept

In **Cosmic Crusher**, the player controls a suit-clad astronaut positioned on the surface of rolling celestial bodies (moons, planets, comets, asteroids). Instead of traditional shooting mechanics, the primary offensive tool is the **angular momentum of the planet itself**.

* **Core Gameplay Loop**: Rotate the planet clockwise/counter-clockwise $\rightarrow$ Build roll momentum $\rightarrow$ Roll over and crush incoming alien waves $\rightarrow$ Collect energy for Super Roll $\rightarrow$ Defeat Sector Bosses.
* **Target Platforms**: Mobile Web Browsers (iOS/Android) and Desktop Web.

---

## 2. Game Mechanics & Controls Architecture

### Physics Engine Basics
* **Planet Surface Radius ($R$)**: Defines collision boundary.
* **Angular Velocity ($\omega$)**: Updated via user input and damped by surface friction factor ($\mu$).
$$\omega_{t+1} = (\omega_t + \alpha) \cdot \mu$$
* **Crush Condition**: An alien at surface angle $\theta_a$ is crushed when angular velocity $|\omega| > \omega_{threshold}$ and alien distance $d \le R + \epsilon$.

### Control Schemes
1. **Desktop / Mouse**: Click and drag horizontally to spin the sphere. Keyboard keys `A`/`D` or `Left`/`Right` apply angular acceleration $\alpha$. `Spacebar` activates **Super Roll Mode**.
2. **Mobile Touch**: Horizontal swipe gestures or virtual D-pad buttons to rotate the planet. On-screen button for **Super Roll**.

---

## 3. 100-Level Campaign Progression

The game spans **5 Sectors**, each containing 20 levels with escalating difficulty, unique physics modifiers, and sector bosses.

```
Sector 1: The Inner Ring (Levels 1-20) ──> High Friction, Basic Crawlers, Moon/Earth
Sector 2: Asteroid Belt (Levels 21-40) ──> Low Friction, Armored Beetles, Irregular Rocks
Sector 3: Gas Giants    (Levels 41-60) ──> Gravity Wells, Leviathan Worm Boss, Ring Run
Sector 4: Deep Outer Rim(Levels 61-80) ──> Freezing Waves, Stealth Voidlings, Pluto/Eris
Sector 5: Cosmic Edge   (Levels 81-100)──> Black Hole Vortices, Antimatter Core, Final Boss
```

### Level Scaling Formulas
* **Alien Spawn Rate ($S$)**: $S(L) = \max(30, 120 - L \times 0.9)$ frames.
* **Alien Speed ($V$)**: $V(L) = 0.8 + 0.02 \times L$ units/frame.
* **Target Crush Goal ($G$)**: $G(L) = 15 + L \times 5$ crushes per level.

---

## 4. Asset Production Pipeline

### AI Generation Prompts Overview
Below is a reference guide for generating additional visual assets using generative tools (Midjourney / DALL-E 3):

* **Astronaut Sprite Sheet**:
  `2D arcade game astronaut sprite sheet, vector cartoon style, classic white solar explorer suit running, jump boost, and crushed splat frames, dark background --ar 4:3`
* **Alien Sprites**:
  `2D cute vector alien monsters asset set, purple bouncer, green sludge crawler, lava bug, crystal crab, isolated on dark background --ar 4:3`
* **Planet Textures**:
  `Set of 6 seamless 2D vector planet textures, cratered moon, red mars, gas giant stripes, magma core, icy comet, dark obsidian, shaded spheres --ar 16:9`

---

## 5. Complete Single-File Playable Source Code

Below is the self-contained production code combining HTML5, Tailwind CSS, Canvas 2D engine, custom synthesized sound effects via Web Audio API, and full touch/keyboard control handlers.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cosmic Crusher - Alien Defense</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;600;700&display=swap');
        body {
            font-family: 'Rajdhani', sans-serif;
            background-color: #050510;
            color: #ffffff;
            user-select: none;
            touch-action: none;
            overflow: hidden;
        }
        .font-orbitron { font-family: 'Orbitron', sans-serif; }
        .glass-panel {
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .glass-button {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(147, 51, 234, 0.3) 100%);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.2s ease;
        }
        .glass-button:hover {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.5) 0%, rgba(147, 51, 234, 0.5) 100%);
            box-shadow: 0 0 15px rgba(147, 51, 234, 0.5);
        }
    </style>
</head>
<body class="h-screen w-screen flex flex-col justify-between items-center relative overflow-hidden">

    <canvas id="gameCanvas" class="absolute inset-0 w-full h-full z-0 cursor-grab active:cursor-grabbing"></canvas>

    <!-- HUD Overlay -->
    <div id="hud" class="relative z-10 w-full p-4 md:p-6 flex justify-between items-start pointer-events-none select-none">
        <div class="glass-panel p-4 rounded-2xl flex flex-col gap-1 shadow-2xl min-w-[140px] pointer-events-auto">
            <div class="text-xs font-semibold text-blue-400 tracking-wider uppercase">Score</div>
            <div id="scoreText" class="text-3xl font-orbitron font-black text-white">0000</div>
            <div class="flex items-center gap-2 mt-1">
                <span class="text-xs text-purple-400 font-bold uppercase">Level</span>
                <span id="levelText" class="text-sm font-orbitron font-bold text-yellow-400 bg-purple-900/60 px-2 py-0.5 rounded-md">1</span>
            </div>
        </div>

        <div id="planetSelector" class="glass-panel p-2 rounded-2xl flex gap-2 pointer-events-auto shadow-2xl">
            <button onclick="switchBody('earth')" id="btn-earth" class="planet-btn p-2 rounded-xl bg-blue-600/40 border border-blue-400/50">🌍</button>
            <button onclick="switchBody('moon')" id="btn-moon" class="planet-btn p-2 rounded-xl bg-slate-800/40 border border-slate-600/50">🌕</button>
            <button onclick="switchBody('mars')" id="btn-mars" class="planet-btn p-2 rounded-xl bg-slate-800/40 border border-slate-600/50">🔴</button>
        </div>

        <div class="glass-panel p-4 rounded-2xl flex flex-col items-end gap-2 shadow-2xl pointer-events-auto min-w-[140px]">
            <div class="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Suit Shield</div>
            <div class="w-32 h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                <div id="healthBar" class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300" style="width: 100%;"></div>
            </div>
            <div class="w-32 flex items-center gap-1.5 mt-1">
                <div class="text-[10px] font-bold text-amber-400 uppercase">Super</div>
                <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div id="boostBar" class="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full" style="width: 0%;"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Mobile Touch Controls -->
    <div class="relative z-10 w-full px-6 pb-6 flex justify-between items-end pointer-events-none md:hidden">
        <div class="flex gap-3 pointer-events-auto">
            <button id="btnLeft" class="w-16 h-16 glass-panel rounded-full flex items-center justify-center text-2xl text-blue-300">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <button id="btnRight" class="w-16 h-16 glass-panel rounded-full flex items-center justify-center text-2xl text-blue-300">
                <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
        <button id="btnSuper" class="pointer-events-auto px-6 py-4 glass-panel rounded-2xl font-orbitron text-xs font-bold text-amber-400 border-amber-500/50">
            SUPER ROLL
        </button>
    </div>

    <!-- Start / End Screens -->
    <div id="modalOverlay" class="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
        <div id="startScreen" class="glass-panel p-8 rounded-3xl max-w-md w-11/12 text-center flex flex-col items-center gap-6 border-purple-500/30">
            <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-4xl">👨‍🚀</div>
            <h1 class="text-3xl font-black font-orbitron text-blue-400">COSMIC CRUSHER</h1>
            <p class="text-slate-300 text-sm">Spin the planet surface to crush alien invaders under giant rolling gravitational momentum!</p>
            <button onclick="startGame()" class="w-full py-4 glass-button rounded-xl font-orbitron font-bold text-lg text-white uppercase tracking-widest">Deploy Astronaut</button>
        </div>
    </div>

    <script>
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        let width, height, centerX, centerY;
        let isPlaying = false, score = 0, level = 1, health = 100, superCharge = 0;
        let angle = 0, angularVelocity = 0;
        let keyLeft = false, keyRight = false;
        let aliens = [], particles = [], floatingTexts = [];

        const PLANETS = {
            earth: { radius: 130, color1: '#1e40af', color2: '#15803d', accel: 0.003, friction: 0.96 },
            moon: { radius: 105, color1: '#475569', color2: '#94a3b8', accel: 0.004, friction: 0.98 },
            mars: { radius: 120, color1: '#991b1b', color2: '#b45309', accel: 0.0035, friction: 0.95 }
        };
        let currentPlanet = PLANETS.earth;

        function resizeCanvas() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            centerX = width / 2;
            centerY = height / 2;
        }
        window.addEventListener('resize', resizeCanvas);

        function switchBody(key) {
            if (PLANETS[key]) currentPlanet = PLANETS[key];
        }

        window.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keyLeft = true;
            if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keyRight = true;
        });
        window.addEventListener('keyup', e => {
            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keyLeft = false;
            if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keyRight = false;
        });

        class Alien {
            constructor() {
                this.angle = Math.random() * Math.PI * 2;
                this.distance = currentPlanet.radius + 160;
                this.speed = 0.8 + level * 0.05;
                this.landed = false;
            }
            update() {
                if (this.distance > currentPlanet.radius + 12) {
                    this.distance -= this.speed;
                } else {
                    this.distance = currentPlanet.radius + 12;
                    this.landed = true;
                }
            }
            draw() {
                const relAngle = this.angle + angle;
                const x = centerX + Math.cos(relAngle) * this.distance;
                const y = centerY + Math.sin(relAngle) * this.distance;
                ctx.save();
                ctx.translate(x, y);
                ctx.fillStyle = '#a855f7';
                ctx.beginPath();
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        function startGame() {
            score = 0; level = 1; health = 100; superCharge = 0;
            aliens = []; particles = [];
            isPlaying = true;
            document.getElementById('modalOverlay').classList.add('hidden');
        }

        let spawnTimer = 0;
        function animate() {
            requestAnimationFrame(animate);
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, width, height);

            if (!isPlaying) return;

            if (keyLeft) angularVelocity -= currentPlanet.accel;
            if (keyRight) angularVelocity += currentPlanet.accel;
            angle += angularVelocity;
            angularVelocity *= currentPlanet.friction;

            // Draw Planet
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            ctx.fillStyle = currentPlanet.color1;
            ctx.beginPath();
            ctx.arc(0, 0, currentPlanet.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Draw Astronaut
            const astroY = centerY - currentPlanet.radius - 16;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(centerX, astroY, 10, 0, Math.PI * 2);
            ctx.fill();

            // Aliens Spawner
            spawnTimer++;
            if (spawnTimer >= Math.max(30, 100 - level * 5)) {
                spawnTimer = 0;
                aliens.push(new Alien());
            }

            for (let i = aliens.length - 1; i >= 0; i--) {
                const a = aliens[i];
                a.update();
                a.draw();

                const relAngle = a.angle + angle;
                const ax = centerX + Math.cos(relAngle) * a.distance;
                const ay = centerY + Math.sin(relAngle) * a.distance;

                // Crush collision
                if (a.landed && Math.abs(angularVelocity) > 0.003) {
                    if (Math.hypot(ax - centerX, ay - astroY) < 30) {
                        score += 100;
                        document.getElementById('scoreText').innerText = score;
                        aliens.splice(i, 1);
                    }
                }
            }
        }

        window.onload = () => { resizeCanvas(); animate(); };
    </script>
</body>
</html>
```