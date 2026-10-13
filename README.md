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
| WASD / Space | move / jump |
| Mouse / click | aim / shoot |
| 1-4, wheel, Q | swap rifle, shotgun, pistol, sniper |
| R | reload |
| Hold Shift | slow time |
| Right-click | sniper scope |

## Rules
- **Time bar:** 5 seconds of slow-mo. It drains only while you hold Shift and refills **only from kills** (+0.75 s, +0.5 s more for a headshot).
- **Your drawing is the enemy.** The top quarter of the drawing counts as the head (2× damage). The drawing is saved in localStorage.
- Every 5th wave brings **The Doodler**, a giant version of your drawing. It calls in reinforcements at 66% and 33% HP.
- Shotgun does 1.75× damage to heavies and the boss. Killed enemies sometimes drop ammo or health crates.

## How the look works
`src/render/postfx.ts` renders the world as plain lit boxes, then a fullscreen shader turns it into ink:
edges come from depth and normal discontinuities, crosshatching from the lighting, and the paper plus ruled lines from screen space.
The lines "boil" (re-jitter) at about 8 fps. Enemies, bullets and FX are flat ink sprites drawn on top.

Debug URL flags: `?view=1|2|3` (color / normal / edge buffers), `?noshadow`, `?test` (exposes `window.__game`).
