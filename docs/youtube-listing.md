# YouTube Playables listing: Cosmic Crusher

Paste these into the Playables Developer Portal.

YouTube's metadata rules (Design 4.1 and 4.2):
- Every required field must be filled in.
- No other brands, logos or company names can appear in the title, description or thumbnails.
- Nothing may suggest the game is made for kids (Trust & Safety 1.2: content is for a general 13+ audience).

## Title

Cosmic Crusher

## Short description

Spin the planet, roll the aliens under your astronaut and SPLAT them before they reach you.

## Description

Aliens are landing on your moon, and you have no blaster. All you have is the planet.

**How to play:**
- Spin the world under your astronaut's feet.
- Anything that rolls underneath while the planet turns fast enough gets crushed.
- Too slow, and the aliens knock you over.

**What's in it:**
- **Momentum:** build speed, chain crushes into combos up to X8 and fill the Super Bar.
- **SHIELD/CRUSH:** while it's active, everything you touch is flattened.
- **BOOST:** leap over the boss's goo and SLAM down to crush a whole crowd at once.
- **Planets:** swap between heavy Mars, balanced Earth and the fast, slippery Moon mid-level.
- **Enemies:** hopping Lunar Bouncers and armored Spiky Rollers.
- **Bosses:** the Gigant Blob on levels 10 and 20.

Sector 1 has 20 levels, with 3 stars to earn on each. More sectors are on the way.

**Controls:**
- **Touch:** D-pad or drag to spin; BOOST/SLAM and SHIELD/CRUSH buttons.
- **Mouse:** click and hold the D-pad, or drag on the planet.
- **Keyboard:** ← → or A D to spin, ↑ boost, ↓ slam, Space for super, 1 2 3 to pick a planet, P to pause, Esc to go back.

## Genre

Arcade (secondary: Action)

## Content notes

- Cartoon action: aliens are squashed with comic "SPLAT!" effects (coloured goo, no blood or realistic injury).
- No chat, no user-generated content, no text entry.
- No ads, no purchases, no external links.
- Audience: general, 13+. Not made for kids.

## Thumbnails

All of these are gameplay with no logo:

| Aspect | File | Size |
|---|---|---|
| 16:9 | `store/screenshot-landscape-1920x1080.jpg` | 1920×1080 |
| 9:16 | `store/screenshot-portrait-1080x1920.jpg` | 1080×1920 |
| 1:1 | `store/screenshot-square-1080x1080.jpg` | 1080×1080 |

If the portal asks for other sizes, regenerate them with `node tools/make_store_art.js` after adding the size to its screenshot list.

## Accessibility tags (Accessible Gaming Initiative)

Pick only tags that are true. Inaccurate tags break YouTube's policies (Accessibility 3).

What the game offers today:
- **Controls:** fully playable by touch, mouse or keyboard alone. Every action has an on-screen button.
- **Pausing:** the game can be paused at any time (pause button or P).
- **Settings:** separate music and sound-effect volume, plus vibration on/off and screen shake on/off. Screen shake starts off when the device asks for reduced motion.
- **Visuals:** high-contrast HUD with large text and buttons.
- **Speech:** no reading of dialogue is needed (short how-to screen only); no voice.
- **Timing:** the game *does* need timing and quick reactions, so don't pick tags claiming otherwise.

## Before you submit

1. Run `python3 tools/build.py youtube` and upload `dist/cosmic-crusher-youtube.zip`. CI also attaches it to every run as `youtube-playables-bundle`.
2. In the Developer Portal, run the SDK test suite on the uploaded build.
3. Play it in the portal's test environment on:
   - a phone (YouTube app on Android and on iOS);
   - desktop Chrome and Firefox.
4. Fill in the fields above and pick the accessibility tags.
5. Confirm the rights checklist:
   - The art is your own. The sprite sheets in `art/` are yours, and AI-generated art must be yours to publish.
   - The fonts are open-licensed; their licences are in `fonts/`.
   - All sound is synthesized in code.
