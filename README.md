# Pen Strike

A browser FPS drawn in blue ballpoint on lined notebook paper. You draw the enemy, then fight waves of it.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # logic tests (time meter, waves, weapons, collision)
npm run build    # type-check + production build into dist/
```

## Controls
| | |
|---|---|
| WASD / Space | move / jump (press Space again in the air to double jump) |
| C | slide (jump out of it to keep the speed) |
| Mouse / click | aim / shoot |
| 1-5, wheel, Q | swap rifle, shotgun, pistol, sniper, eraser sword |
| R | reload |
| Hold Shift | slow time |
| Right-click | sniper scope |

## Rules
- **Time bar:** 5 seconds of slow-mo. It drains only while you hold Shift and refills **only from kills** (+0.75 s, +0.5 s more for a headshot).
- **Your drawing is the enemy.** The top quarter of the drawing counts as the head (2× damage). The drawing is saved in localStorage.
- Every 5th wave brings **The Doodler**, a giant version of your drawing. It calls in reinforcements at 66% and 33% HP.
- **Eraser sword (5):** a melee swing that lunges you forward. It hits every enemy within about 3 m in front of you for 100 damage, enough to one-shot grunts, runners and elites. It erases them from the top down. No ammo.
- **Aim sensitivity:** set it with the slider on the drawing screen or the pause screen (0.2×–3×). It's saved between sessions.
- Shotgun does 1.75× damage to heavies and the boss. Killed enemies sometimes drop ammo or health crates.

## Runs
- **Your drawing sets enemy stats.** Big and filled-in means tanky and slow. Thin means fast and fragile. A live stat card on the drawing screen shows the result.
- **Separate boss drawing:** use the *boss* tab. An empty boss sheet falls back to your enemy drawing.
- **Combo:** each kill within 3 s of the last builds a multiplier up to ×5. Sword kills and slow-mo kills count double. The window runs on game time, so slow-mo stretches it.
- **Wave clock:** a countdown per wave, for **bonus points only**. It runs in real time, so slow-mo doesn't stop it. Beat it to earn a time bonus and 4 upgrade choices instead of 3.
- **Upgrades:** after each wave, pick a sticky note (17 kinds: damage, fire rate, time bar, air jumps, slide, sword reach, bullet-swatting sword, ink bombs, ricochet, …).
- **Color mode:** a toggle on the drawing screen that swaps the blue-pen world for vibrant colored ink.
- **Share drawings:** makes a link containing your enemy and boss drawings. From the game-over screen it also includes your score, as a challenge. Links only work for friends when the game is hosted somewhere public; a localhost link only works on your own computer.

## How the look works
`src/render/postfx.ts` renders the world as plain lit boxes, then a fullscreen shader turns it into ink:
edges come from depth and normal discontinuities, crosshatching from the lighting, and the paper plus ruled lines from screen space.
The lines "boil" (re-jitter) at about 8 fps. Enemies, bullets and FX are flat ink sprites drawn on top.

Debug URL flags: `?view=1|2|3` (color / normal / edge buffers), `?noshadow`, `?test` (exposes `window.__game`).
