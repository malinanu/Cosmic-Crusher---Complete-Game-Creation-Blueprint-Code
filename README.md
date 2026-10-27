# Cosmic Crusher

Spin the planet, roll the aliens under your astronaut, and **SPLAT!** them before they reach you.
A 2D arcade game for phones and desktop browsers, built from the [game blueprint](docs/BLUEPRINT.md) and the art sheets in [`art/`](art/).

<p>
  <img src="docs/screenshots/menu-phone.jpg" width="200" alt="Main menu">
  <img src="docs/screenshots/gameplay-phone.jpg" width="200" alt="Gameplay on the Moon">
  <img src="docs/screenshots/boss-desktop.jpg" width="420" alt="Gigant Blob boss fight">
</p>

This is the **Phase 1 preview**. It includes Sector 1 (levels 1–20) with a mini boss on level 10 and the Gigant Blob on level 20, the Classic White suit, the full HUD, settings and a leaderboard on this device. Sectors 2–5, the other suits and the weapons come next (see [Roadmap](#roadmap)).

## Play it

- **On your computer:** double-click `index.html`. There's no install and no build step.
- **On your phone:** host it with GitHub Pages (below) and open the link. You can also run `python3 -m http.server` in this folder and browse to your computer's IP on port 8000.

### Put it online with GitHub Pages

1. Merge this branch into `main`.
2. In the GitHub repo, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`, and save.
4. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

## How to play

| Action | Keyboard | Touch |
|---|---|---|
| Spin the planet (your run direction) | `←` `→` or `A` `D`, or drag | D-pad left/right, drag, or tilt |
| BOOST (jump), then SLAM on landing | `↑` / `W` | BOOST/SLAM button, D-pad up, or flick up |
| Slam down fast while in the air | `↓` / `S` | press BOOST/SLAM again, D-pad down, or flick down |
| SHIELD/CRUSH (needs a full Super Bar) | `Space` | SHIELD/CRUSH button |
| Switch planet (Mars / Earth / Moon) | `1` `2` `3` | Object Selector |
| Pause | `P` / `Esc` | pause button |

- **Crushing.** An alien that rolls under you while the planet spins faster than the white notch on the **ROLL SPEED** gauge gets crushed. If the spin is slower, it hurts you.
- **Overheating.** Holding the needle in the red too long makes the astronaut stumble.
- **Momentum.** Every crush costs a little spin, and armored Spiky Rollers cost a lot. Keep tapping to stay in the green–yellow zone.
- **Enemies.**
  - Lunar Bouncers can't be flattened mid-hop. A fast spin swats them away, but a slow one lets them bonk you. A slam gets them anywhere.
  - Spiky Rollers (level 11+) need a faster spin than other aliens.
- **The boss.** It only takes a hit from a really fast pass or a slam. Jump to dodge its goo.
- **Combos.** Chain crushes for combos up to X8.
- **Super.** Crushes fill the Super Bar. When it's full, SHIELD/CRUSH makes you invulnerable for 6 s and crushes everything you touch.
- **Planets.**

  | Planet | Character |
  |---|---|
  | Mars | heavy: crushes at low speed, stops quickly |
  | Earth | balanced |
  | Moon | light and slippery: fastest top speed, hardest to stop |

- **Stars.** Clearing a level unlocks the next one. Stars depend on how much health you have left.

## Project layout

```
index.html            screens, HUD and script tags (no build step)
css/style.css         the neon UI
js/config.js          every gameplay number: planets, enemies, boss, scoring
js/levels.js          level table (blueprint formulas for spawn rate, speed, crush goal)
js/game.js            physics, spawning, crushing, waves, boss, drawing the playfield
js/entities.js        aliens, boss, goo shots, particles and comic pop text
js/render.js          procedural planets, starfield, comic text
js/assets.js          sprite loader + code-drawn fallbacks
js/hud.js, ui.js      HUD and menus
js/input.js           keyboard, drag, D-pad, tilt
js/audio.js           synthesized sound effects and music (Web Audio, no files)
js/storage.js         save data in localStorage
assets/sprites/       transparent PNGs cut from the art sheets
art/                  your original art sheets and mockups
tools/                sprite extractor and tests
```

## Your art

`tools/extract_sprites.py` cuts each sprite out of the sheets in `art/` and saves it as a transparent PNG in `assets/sprites/`. It does this by flood-filling the dark sheet background from the edge of each crop box. To see the result, open the contact sheet it writes to `tools/out/contact_sheet.png`.

```bash
python3 tools/extract_sprites.py            # all sprites
python3 tools/extract_sprites.py logo       # just one
```

**Adding or replacing art.** Drop a PNG with the right name into `assets/sprites/` and the game picks it up; no code changes are needed. Any name that has no file is drawn in code instead.

| File name | Used for | Status |
|---|---|---|
| `astro_idle`, `astro_run1–3`, `astro_leap`, `astro_splat`, `fx_shield` | Classic White suit | ✅ from the suits sheet |
| `alien_crawler`, `alien_bouncer`, `alien_roller`, `boss_blob` | enemies | ✅ from the aliens sheet |
| `logo`, `icon_boost`, `icon_shield`, `icon_trophy`, `prop_asteroid` | UI and props | ✅ from the mockups |
| `alien_cute_green`/`orange`/`pink`/`blue`/`yellow` | the cute basic aliens | ⏳ drawn in code until the moon/Mars mockups are added to `art/` |
| `weapon_<id>` (e.g. `weapon_plasma_blaster`) | weapons screen | ⏳ waiting for the weapons pack |
| `planet_moon`, `planet_earth`, `planet_mars`, `prop_earth` | planet textures | optional; planets are drawn in code |

To cut new sprites from a newly added sheet, add it to `SOURCES` in the extractor and add one line per sprite to `SPRITES`, giving its crop box in source pixels.

## Tuning

All balance numbers live in `js/config.js`: spin acceleration, friction, top speed and crush threshold per planet; enemy size, speed and damage; boss HP; and the super duration. `js/levels.js` holds the blueprint's level formulas:

| Formula | Meaning |
|---|---|
| `S(L) = max(30, 120 − 0.9L)` | frames between spawns |
| `V(L) = 0.8 + 0.02L` | alien speed |
| `G(L) = 15 + 5L` | crushes needed to clear level L |

Some URL options help when testing:

| URL | Effect |
|---|---|
| `index.html?level=12` | jump straight into a level |
| `&god=1` | no damage |
| `&boss=1` | skip to the boss on levels 10 and 20 |
| `&debug=1` | show hit zones |

## Tests

```bash
node tools/check_levels.js     # level table matches the blueprint formulas
node tools/smoke_test.js       # plays through menus, a level, super, pause, win/lose, the boss
```

The smoke test needs Playwright (`npm install --no-save playwright && npx playwright install chromium`). It writes screenshots to `tools/out/`.

## Roadmap

Phase 2, after your feedback on this preview:

- **Sectors 2–5**
  - Asteroid Belt: low friction, irregular rocks
  - Gas Giants: gravity wells
  - Deep Outer Rim: freezing waves, stealth Voidlings
  - Cosmic Edge: black-hole vortices
- **New enemies:** the Cosmic Splicer and ice beetles
- **Four more bosses,** including the Final Boss from the mockup
- **Suits:** Magma Vanguard (Kinetic Aura) and Void Strider (Energy Field)
- **The 8 weapons from the Weapons pack:** equip one and it auto-fires on a cooldown, with upgrades bought from a shop
- **Optional extras:** an online leaderboard and a Ring Run bonus mode
