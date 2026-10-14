# Pen Strike

A browser FPS drawn in blue ballpoint on lined notebook paper. You draw the enemy, then fight waves of it.

```bash
npm install
npm run dev      # landing page: http://localhost:5173  ·  game: http://localhost:5173/play/
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
- **Color mode:** a toggle on the drawing screen. The world switches to colored ink but keeps the pen outlines and hatching: grey concrete building, white ground, light-blue sky, yellow sun, a yellow-and-orange crane, and real-world colors for everything else (red brick, wooden crates, colored shipping containers). Paints are named in `src/render/palette.ts`.
- **Share drawings:** makes a link containing your enemy and boss drawings. From the game-over screen it also includes your score, as a challenge. Links only work for friends when the game is hosted somewhere public; a localhost link only works on your own computer.

## How the look works
`src/render/postfx.ts` renders the world as plain lit boxes, then a fullscreen shader turns it into ink:
edges come from depth and normal discontinuities, crosshatching from the lighting, and the paper plus ruled lines from screen space.
The lines "boil" (re-jitter) at about 8 fps. Enemies, bullets and FX are flat ink sprites drawn on top.

Debug URL flags: `?view=1|2|3` (color / normal / edge buffers), `?noshadow`, `?test` (exposes `window.__game`).

## Site & hosting
- `index.html` + `src/landing/` is the landing page. Its drawing pad saves to the same storage key as the game, so a doodle drawn there becomes the enemy in `/play/`.
- `play/index.html` is the game.
- `.github/workflows/pages.yml` runs the tests, builds `dist/`, and deploys it to GitHub Pages on every push to `feature/doodle-fps`.

One-time setup for **penstrike.paycoach.app**:
1. GitHub → repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. At the DNS provider for `paycoach.app`, add a **CNAME** record: name `penstrike`, value `daniepro93.github.io`. On Cloudflare, set it to *DNS only* (grey cloud).
3. GitHub → **Settings → Pages → Custom domain**: `penstrike.paycoach.app`, Save. Once the certificate is issued (minutes to an hour), tick **Enforce HTTPS**.
4. Re-run the **Deploy site** workflow (Actions tab), or push any commit.

## Accounts, leaderboard & monster gallery (Supabase)
- Project: **penstrike** (`lyzktwgegfujkyilpfev`, PROFITLEAK org). The schema and security rules live in `supabase/migrations/`.
- Client: `src/net/backend.ts` (API) and `src/net/accountUi.ts` (name chip and dialog, shared by the landing page and the game).
- **Guest play always works.** Posting scores and publishing or reporting monsters only needs a **name** (no email, no password, no dashboard setup).
- How names work: the browser makes a random secret and keeps it in localStorage; the server stores only its sha256 hash. Every write is a database function that takes that secret; the tables have no direct API access. Limits: 5 new names per IP per day, 10 monsters per player and 20 per IP per day.
- Trade-off: clearing browser data, or switching device, loses the name (it can't be reclaimed because it's taken). Fine for an arcade board; add real accounts later if people care.
- **Leaderboard** shows each player's best run. The server rejects implausible runs (score vs. kills/wave, wave vs. run time) and limits posts to one every 20 s. That stops casual cheating, but it isn't cheat-proof, because the game runs in the browser.
- **Gallery** monsters appear immediately. 3 reports from different players hide one. To review: Supabase → Table Editor → `monsters`, set `hidden` back to `false` to restore, or delete the row.

The old email-account tables were renamed to `legacy_*` (they were empty). You can delete them in Table Editor whenever.
