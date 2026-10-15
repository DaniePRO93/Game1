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

## Weapons, aiming, paint, killstreaks
- **Aim down sights:** hold right-click or F (any gun): zoom, ~3× tighter spread, slower movement and look. The sniper aims through its scope.
- **Shotgun:** 8 pellets × 18 damage, 0.7s between shots, 7 shells, reaches further before falling off.
- **Sniper:** 95 body damage (no longer one-shots everything), headshots ×3, passes through one target, 1.2s between shots.
- **Paint:** every shot splashes paint in a random color from the gun you're holding: on the wall it hits, or on the wall behind a doodle it hits. Up to 400 splats stay until the run/round ends; in versus you see others' paint too.
- **Killstreaks:** 3 kills in a row → **minigun** (200 rounds, spins up), 5 → **railgun** (6 shots that pierce every target in line). They vanish when empty. The streak resets when you take damage (solo) or die (versus).

## Difficulty (solo)
Easy / normal / hard in the menu (`src/game/difficulty.ts`). It scales enemy HP, enemy damage, fire rate, bullet speed, wave size and how many are alive at once. Score is multiplied by 0.5 / 1 / 1.5 so easy runs don't top the leaderboard; the server's score ceiling allows for the 1.5× (`supabase/migrations/20261014200000_difficulty_score_ceiling.sql`).

## Maps
Five maps (`src/world/maps/`, registry in `src/world/level.ts`), built from boxes with the small DSL in `src/world/builder.ts`. Every box carries both looks (ink style + color paint).

| Map | Look | Parkour |
| --- | --- | --- |
| Construction Site | color | the original: scaffold floors, stairs, house roof, crane |
| Rooftops | ink | roof-to-roof loop, launch vents, air-con ducts to slide under |
| Factory | ink | conveyor belts, steam vents up to a catwalk loop, pipe racks, silo + gantry rail |
| Playground | color | trampolines, crawl tubes (slide through), climbing fort, monkey-bar beam |
| Treetops | color | bounce mushrooms, rope bridges, leaf updrafts, hollow logs |

Movement pieces: launch pads (`launchPad`), updrafts (`updraft`), conveyors (`conveyor`), and a 1m collision height while sliding so 1.1m gaps can be slid through. Solo picks a map in the menu (switches to its native look; the color toggle still overrides).

Map vote pictures live in `public/img/maps/`. After changing a map, regenerate them: `npx vite --port 5173` then `node scripts/render-map-thumbs.mjs` (needs Playwright + ffmpeg).

## Multiplayer
- **Menu:** main menu → Multiplayer → **create a game** (5-letter code + invite link `/play/#room=CODE`) or join with a code. 2–4 players.
- **Room:** 1) draw your fighter (live for everyone), 2) vote for a map (top-down photos), 3) the **host** picks the mode and presses **Start**; the most-voted map is played.
- **Modes:**
  - *Free-for-all* (versus): first to 10 kills or 5 min.
  - *Team Deathmatch* (versus): orange vs blue, split by join order; first team to 15 kills or 5 min; no friendly fire.
  - *Co-op Waves*: the whole team against the solo waves, using the **host's** enemy and boss drawings. Enemies chase the nearest player and there are more of them (and slightly tougher) per extra player. Upgrades between waves (the game keeps running; the next wave starts when everyone picked, or after 20s). If you go down you spectate a teammate and come back at the next wave; when everyone is down the run ends and the results show the wave you reached. No wave clock, no slow-mo, no health regen (health drops only).
- **In a match:** damage arrows show where hits come from, comic bursts ("POW!", "NICE SHOT!", "DOUBLE!", "ZZZAP!") pop by the gun, and while respawning in versus you spectate your killer through their eyes.
- **Results:** winner (or team bar / wave reached), awards (MVP, Sharpshooter, Unstoppable, Clean Sweep, Doormat), then the host picks **rematch** (same map + mode) or **back to lobby**.
- Versus: no slow-mo, no upgrades. Same HP/speed for everyone; health regenerates after 4s; 3s respawn with 1.5s spawn protection. Sniper/eraser/killstreak guns do a bit less damage than in solo.
- **Networking, no database:** a Supabase Realtime channel (`penstrike-room-CODE`) is used only for presence and to set up direct WebRTC links. Gameplay goes peer to peer. If a direct link fails, that pair relays through the channel.
- The earliest joiner hosts (round clock, mode, start, awards); if they leave the next player takes over. Hits are decided by the shooter (fine between friends, not cheat-proof); multiplayer results don't go to the leaderboard.
- **Co-op networking:** the host runs the waves and enemy AI and sends enemy positions (10×/s), enemy shots, kills and wave changes. Everyone else mirrors the enemies, sends their hits to the host (who decides kills and drops), and dodges the same bullets on their own screen. If the host leaves mid-run, the run ends at the wave it reached.
- Code: `src/net/signal.ts`, `src/net/mesh.ts`, `src/net/versus.ts` (room, modes, teams, awards), `src/versusUi.ts`, `src/game/remotePlayer.ts`, co-op section of `src/game/game.ts`.
- Local testing without Supabase: two tabs of `/play/?test&net=local&name=A`.

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
