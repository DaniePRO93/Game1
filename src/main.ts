import * as THREE from 'three';
import { DrawPad, Sheet, exampleStrokes } from './draw/drawPad';
import { buildSprite, DoodleSprite } from './draw/sprite';
import { Sfx } from './game/audio';
import { doodleStats } from './game/doodleStats';
import { Doodles, Game } from './game/game';
import { decodeShare, encodeShare } from './game/share';
import { currentAccount, initAccount, mountAccountChip, requireAccount } from './net/accountUi';
import { RunResult, publishMonster, submitScore } from './net/backend';
import { UPGRADES, Upgrade } from './game/upgrades';
import { MAPS, MapId, mapInfo } from './world/level';
import { Input } from './game/input';
import { PostFX } from './render/postfx';
import { Hud } from './ui/hud';
import { Screen, initVersus } from './versusUi';

// All colors in this project are authored as final display values.
THREE.ColorManagement.enabled = false;


const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const params = new URLSearchParams(location.search);
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true; // world is static: render shadows once

const testMode = params.has('test');

const postfx = new PostFX(renderer);
const hud = new Hud();
const sfx = new Sfx();
const input = new Input(canvas);
const game = new Game(hud, sfx, input);
const pad = new DrawPad(document.getElementById('pad')!);

const screens = {
  menu: document.getElementById('menu')!,
  paused: document.getElementById('pause')!,
  over: document.getElementById('over')!,
  upgrade: document.getElementById('upgrade')!,
  versus: document.getElementById('versus')!,
};
let screen: Screen = 'menu';

function show(s: Screen): void {
  screen = s;
  screens.menu.style.display = s === 'menu' ? '' : 'none';
  screens.paused.style.display = s === 'paused' ? '' : 'none';
  screens.over.style.display = s === 'over' ? '' : 'none';
  screens.upgrade.style.display = s === 'upgrade' ? '' : 'none';
  screens.versus.style.display = s === 'versus' ? '' : 'none';
  hud.show(s === 'playing' || s === 'paused' || s === 'upgrade');
}

function resize(): void {
  const pr = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  postfx.setSize(innerWidth, innerHeight, pr);
  game.setAspect(innerWidth / innerHeight);
}
addEventListener('resize', resize);
resize();

// Aim sensitivity slider (menu + pause screen share one value).
const SENS_KEY = 'doodle-fps.sens.v1';
let sens = 1;
try {
  sens = Number(localStorage.getItem(SENS_KEY)) || 1;
} catch {
  /* storage unavailable: default 1x */
}
const sensInputs = Array.from(document.querySelectorAll<HTMLInputElement>('.sens-input'));
function setSens(v: number, save: boolean): void {
  sens = Math.min(3, Math.max(0.2, v));
  game.setSensitivity(sens);
  for (const el of sensInputs) {
    el.value = String(sens);
    el.parentElement!.querySelector('output')!.textContent = `${sens.toFixed(2)}×`;
  }
  if (!save) return;
  try {
    localStorage.setItem(SENS_KEY, String(sens));
  } catch {
    /* ignore */
  }
}
for (const el of sensInputs) el.addEventListener('input', () => setSens(Number(el.value), true));
setSens(sens, false);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ── Color mode (menu toggle, remembered) ─────────────────────────────────
const COLOR_KEY = 'doodle-fps.color.v1';
const colorToggle = $<HTMLInputElement>('color-mode');
try {
  colorToggle.checked = localStorage.getItem(COLOR_KEY) === '1';
} catch {
  /* default off */
}
function setColor(on: boolean, save: boolean): void {
  colorToggle.checked = on;
  game.setColorMode(on);
  postfx.colorMode = on;
  if (!save) return;
  try {
    localStorage.setItem(COLOR_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
setColor(colorToggle.checked, false);
colorToggle.addEventListener('change', () => setColor(colorToggle.checked, true));

// ── Map picker (solo). Picking a map switches to its native look; the color
// toggle can still override it for solo runs. ─────────────────────────────
const MAP_KEY = 'doodle-fps.map.v1';
let soloMap: MapId = 'construction';
try {
  soloMap = mapInfo(params.get('map') ?? localStorage.getItem(MAP_KEY) ?? 'construction').id;
} catch {
  /* default */
}
function mapButton(id: MapId): HTMLButtonElement {
  const m = mapInfo(id);
  const b = document.createElement('button');
  b.className = 'map-btn';
  b.dataset.map = m.id;
  b.innerHTML = `<span class="name"></span><span class="look ${m.look}">${m.look}</span><small></small>`;
  b.querySelector('.name')!.textContent = m.name;
  b.querySelector('small')!.textContent = m.blurb;
  return b;
}
function pickSoloMap(id: MapId, applyLook: boolean): void {
  soloMap = id;
  game.setMap(id);
  if (applyLook) setColor(mapInfo(id).look === 'color', true);
  for (const el of Array.from(document.querySelectorAll<HTMLButtonElement>('#map-list .map-btn'))) el.classList.toggle('active', el.dataset.map === id);
  try {
    localStorage.setItem(MAP_KEY, id);
  } catch {
    /* ignore */
  }
}
for (const m of MAPS) {
  const b = mapButton(m.id);
  b.onclick = () => pickSoloMap(m.id, true);
  $('map-list').append(b);
}
pickSoloMap(soloMap, params.has('map'));

// ── Drawing sheets + live stat card ──────────────────────────────────────
for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'))) {
  tab.onclick = () => {
    pad.setSheet(tab.dataset.sheet as Sheet);
    for (const t of Array.from(document.querySelectorAll('.tab'))) t.classList.toggle('active', t === tab);
  };
}

let statTimer = 0;
function refreshStats(): void {
  if (pad.sheet === 'me') {
    $('stat-who').textContent = 'you, in versus';
    $('stat-label').textContent = 'same HP and speed for everyone';
    for (const k of ['hp', 'speed', 'size', 'head']) $(`stat-${k}`).style.width = '0%';
    return;
  }
  const sheet = pad.sheet === 'boss' && pad.isEmpty('boss') ? 'enemy' : pad.sheet;
  $('stat-who').textContent = pad.sheet === 'boss' ? (pad.isEmpty('boss') ? 'boss (empty: uses your enemy)' : 'your boss') : 'your enemy';
  const sp = pad.isEmpty(sheet) ? null : buildSprite(pad.renderSheet(sheet));
  if (!sp) {
    $('stat-label').textContent = 'draw something!';
    for (const k of ['hp', 'speed', 'size', 'head']) $(`stat-${k}`).style.width = '0%';
    return;
  }
  const st = doodleStats(sp);
  sp.texture.dispose();
  $('stat-label').textContent = st.label;
  for (const [k, v] of Object.entries(st.bars)) $(`stat-${k}`).style.width = `${Math.round(v * 100)}%`;
}
pad.onChange = () => {
  clearTimeout(statTimer);
  statTimer = window.setTimeout(refreshStats, 150);
};
refreshStats();

// ── Share links ──────────────────────────────────────────────────────────
function shareUrl(token: string): string {
  return `${location.origin}${location.pathname}#d=${token}`;
}

async function makeShare(withScore: boolean, input: HTMLInputElement, msg: HTMLElement, box: HTMLElement): Promise<void> {
  pad.ensure('enemy');
  const token = await encodeShare({
    enemy: pad.getStrokes('enemy'),
    boss: pad.getStrokes('boss'),
    score: withScore ? game.score : undefined,
    wave: withScore ? game.wave : undefined,
  });
  const url = shareUrl(token);
  box.style.display = '';
  input.value = url;
  input.select();
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    /* clipboard blocked: user can copy from the box */
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
  msg.textContent = (copied ? 'link copied! ' : 'copy the link above. ') + (local ? '(localhost links only work on this computer)' : '');
}
$('btn-share').onclick = () => void makeShare(false, $<HTMLInputElement>('share-link'), $('share-msg'), $('share-out'));
$('btn-challenge').onclick = () => void makeShare(true, $<HTMLInputElement>('over-link'), $('over-msg'), $('over-share'));

async function loadShareFromHash(): Promise<void> {
  const m = location.hash.match(/[#&]d=([A-Za-z0-9_-]+)/);
  if (!m) return;
  try {
    const p = await decodeShare(m[1]);
    // Shared drawings are used but not saved over your own.
    if (p.enemy.length) pad.setStrokes('enemy', p.enemy, false);
    if (p.boss.length) pad.setStrokes('boss', p.boss, false);
    const banner = $('challenge');
    banner.style.display = '';
    banner.textContent = p.score
      ? `challenge! a friend scored ${p.score} (wave ${p.wave ?? '?'}) against these doodles. beat it.`
      : 'a friend sent you these doodles. go erase them.';
  } catch {
    $('challenge').style.display = '';
    $('challenge').textContent = "couldn't read that share link, sorry.";
  }
}
void loadShareFromHash();

// ── Upgrades between waves ───────────────────────────────────────────────
let upgradeChoices: Upgrade[] = [];
function pickUpgrade(i: number): void {
  if (screen !== 'upgrade' || !upgradeChoices[i]) return;
  game.chooseUpgrade(i);
  upgradeChoices = [];
  show('playing');
  if (testMode) input.locked = true;
  else input.lock();
}
game.onUpgrade = (choices, beatClock) => {
  upgradeChoices = choices;
  const owned = game.ownedUpgrades;
  $('upgrade-sub').textContent = beatClock ? 'beat the clock: 4 choices this time!' : 'beat the wave clock to get 4 choices';
  const host = $('upgrade-cards');
  host.innerHTML = '';
  choices.forEach((u, i) => {
    const b = document.createElement('button');
    b.className = 'note';
    b.style.background = `hsl(${Math.round(u.hue * 360)}, 85%, 80%)`;
    const lvl = owned[u.id] ?? 0;
    b.innerHTML = `<span class="num">${i + 1}</span><div class="name"></div><div class="text"></div><div class="lvl">${u.max > 1 ? `level ${lvl + 1}/${u.max}` : 'one-off'}</div>`;
    b.querySelector('.name')!.textContent = u.name;
    b.querySelector('.text')!.textContent = u.text;
    b.onclick = () => pickUpgrade(i);
    host.append(b);
  });
  hud.clearBanner();
  show('upgrade');
  input.unlock();
};
addEventListener('keydown', (e) => {
  if (screen !== 'upgrade') return;
  const n = Number(e.key);
  if (n >= 1 && n <= upgradeChoices.length) pickUpgrade(n - 1);
});

// ── Start / restart ──────────────────────────────────────────────────────
let doodles: Doodles | null = null;

function sheetSprite(sheet: Sheet): DoodleSprite | null {
  return pad.isEmpty(sheet) ? null : buildSprite(pad.renderSheet(sheet));
}

function makeDoodles(): Doodles {
  pad.ensure('enemy');
  const enemy = sheetSprite('enemy')!;
  // An empty boss sheet falls back to your enemy drawing.
  const boss = sheetSprite('boss') ?? enemy;
  return { enemy, boss };
}

function startGame(fresh: boolean): void {
  sfx.init();
  if (fresh || !doodles) {
    if (doodles) {
      doodles.enemy.texture.dispose();
      if (doodles.boss !== doodles.enemy) doodles.boss.texture.dispose();
    }
    doodles = makeDoodles();
  }
  game.start(doodles);
  show('playing');
  if (testMode) input.locked = true;
  else input.lock();
}

$('btn-undo').onclick = () => pad.undo();
$('btn-clear').onclick = () => pad.clear();
$('btn-example').onclick = () => pad.example();
$('btn-start').onclick = () => startGame(true);
$('btn-again').onclick = () => startGame(false);
$('btn-redraw').onclick = () => show('menu');
$('btn-resume').onclick = () => input.lock();
$('btn-quit').onclick = () => {
  if (versus.active) versus.leave();
  else show('menu');
};

input.onLockChange = (locked) => {
  if (locked && screen === 'paused') show('playing');
  else if (!locked && screen === 'playing' && (!game.dead || versus.playing)) {
    $('pause-title').textContent = versus.playing ? 'match still running!' : 'paused';
    $('btn-resume').textContent = versus.playing ? 'click to play' : 'click to resume';
    $('btn-quit').textContent = versus.playing ? 'leave the game' : 'quit to drawing';
    show('paused');
  }
};

// ── Versus ───────────────────────────────────────────────────────────────
const versus = initVersus({
  game,
  pad,
  hud,
  input,
  show,
  screen: () => screen,
  setLook: (on) => {
    game.setColorMode(on);
    postfx.colorMode = on;
  },
  restoreSolo: () => {
    game.setMap(soloMap);
    setColor(colorToggle.checked, false);
  },
  testMode,
  params,
});

// ── Accounts, leaderboard, gallery ───────────────────────────────────────
initAccount();
mountAccountChip($('acct'));

function postRun(run: RunResult): void {
  const el = $('over-post');
  el.textContent = 'posting your score…';
  submitScore(run).then(
    () => (el.textContent = '✓ posted to the leaderboard'),
    (err: Error) => (el.textContent = `couldn't post: ${err.message}`),
  );
}

$('btn-publish').onclick = () => {
  const msg = $('publish-msg');
  const sheet: Sheet = pad.sheet;
  if (pad.isEmpty(sheet)) {
    msg.textContent = 'draw something first!';
    return;
  }
  requireAccount(async () => {
    msg.textContent = 'publishing…';
    try {
      // Your versus fighter is published like a regular enemy.
      const kind = sheet === 'boss' ? 'boss' : 'enemy';
      const strokes = pad.getStrokes(sheet);
      const token = await encodeShare(kind === 'boss' ? { enemy: [], boss: strokes } : { enemy: strokes, boss: [] });
      await publishMonster(kind, token, $<HTMLInputElement>('monster-name').value);
      msg.textContent = `✓ your ${sheet === 'me' ? 'fighter' : sheet} is in the gallery`;
    } catch (err) {
      msg.textContent = `couldn't publish: ${(err as Error).message}`;
    }
  }, 'to publish monsters to the gallery');
};

game.onDeath = () => {
  input.unlock();
  $('over-share').style.display = 'none';
  $('over-stats').textContent = `wave ${game.wave} · ${game.kills} kills · best combo ×${game.combo.best} · score ${game.score}`;
  const run: RunResult = {
    score: game.score,
    wave: game.wave,
    kills: game.kills,
    bestCombo: game.combo.best,
    durationS: game.runSeconds,
    colorMode: colorToggle.checked,
  };
  const post = $('over-post');
  post.innerHTML = '';
  const acct = currentAccount();
  if (acct.username) {
    postRun(run);
  } else if (game.score > 0) {
    const b = document.createElement('button');
    b.textContent = 'pick a name to post this score';
    b.onclick = () => requireAccount(() => postRun(run), 'to put this score on the leaderboard');
    post.append(b);
  }
  show('over');
};

// Headless test hooks.
if (testMode) {
  Object.assign(window, {
    __game: game,
    __input: input,
    __postfx: postfx,
    __pad: pad,
    __start: () => startGame(true),
    __pick: pickUpgrade,
    __example: exampleStrokes,
    __upgrades: UPGRADES,
    __map: (id: MapId) => pickSoloMap(id, true),
    __versus: versus,
    /** Render a map from straight above (for public/img/maps/*.webp). */
    __topdown: (id: MapId) => {
      pickSoloMap(id, true);
      topdownMap = id;
      for (const el of Object.values(screens)) el.style.display = 'none';
      hud.show(false);
    },
  });
}

let topdownMap: MapId | null = null;
let last = performance.now();
function frame(now: number): void {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.shadowsDirty) {
    renderer.shadowMap.needsUpdate = true;
    game.shadowsDirty = false;
  }
  versus.tick(realDt);
  if (topdownMap) game.topdown();
  else if (versus.playing && game.versus && (screen === 'playing' || screen === 'paused')) {
    // A versus match keeps running behind the pause card; just ignore input there.
    if (screen === 'paused') {
      input.keys.clear();
      input.mouseDown = false;
      input.rightDown = false;
    }
    game.update(realDt);
  } else if (screen === 'playing') game.update(realDt);
  else if (screen === 'menu' || screen === 'versus') game.idle(realDt);
  hud.tick(realDt);
  input.endFrame();
  postfx.render(game.world, game.overlay, game.camera, realDt, screen === 'menu' ? { slowmo: 0, damage: 0 } : game.postParams);
  requestAnimationFrame(frame);
}
show('menu');
requestAnimationFrame(frame);
