import * as THREE from 'three';
import { DrawPad, exampleStrokes } from './draw/drawPad';
import { buildSprite, DoodleSprite } from './draw/sprite';
import { Sfx } from './game/audio';
import { Game } from './game/game';
import { Input } from './game/input';
import { PostFX } from './render/postfx';
import { Hud } from './ui/hud';

// All colors in this project are authored as final display values.
THREE.ColorManagement.enabled = false;

type Screen = 'menu' | 'playing' | 'paused' | 'over';

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
};
let screen: Screen = 'menu';

function show(s: Screen): void {
  screen = s;
  screens.menu.style.display = s === 'menu' ? '' : 'none';
  screens.paused.style.display = s === 'paused' ? '' : 'none';
  screens.over.style.display = s === 'over' ? '' : 'none';
  hud.show(s === 'playing' || s === 'paused');
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

let sprite: DoodleSprite | null = null;

function makeSprite(): DoodleSprite {
  if (pad.isEmpty) pad.example();
  const s = buildSprite(pad.canvas);
  if (s) return s;
  // Should not happen (pad has ink), but never start without an enemy.
  pad.example();
  return buildSprite(pad.canvas)!;
}

function startGame(fresh: boolean): void {
  sfx.init();
  if (fresh || !sprite) {
    sprite?.texture.dispose();
    sprite = makeSprite();
  }
  game.start(sprite);
  show('playing');
  if (testMode) input.locked = true;
  else input.lock();
}

document.getElementById('btn-undo')!.onclick = () => pad.undo();
document.getElementById('btn-clear')!.onclick = () => pad.clear();
document.getElementById('btn-example')!.onclick = () => pad.example();
document.getElementById('btn-start')!.onclick = () => startGame(true);
document.getElementById('btn-again')!.onclick = () => startGame(false);
document.getElementById('btn-redraw')!.onclick = () => show('menu');
document.getElementById('btn-resume')!.onclick = () => input.lock();
document.getElementById('btn-quit')!.onclick = () => show('menu');

input.onLockChange = (locked) => {
  if (locked && screen === 'paused') show('playing');
  else if (!locked && screen === 'playing' && !game.dead) show('paused');
};

game.onDeath = () => {
  input.unlock();
  document.getElementById('over-stats')!.textContent = `wave ${game.wave} · ${game.kills} kills · score ${game.score}`;
  show('over');
};

// Headless test hooks.
if (testMode) {
  Object.assign(window, { __game: game, __input: input, __pad: pad, __start: () => startGame(true), __example: exampleStrokes });
}

let last = performance.now();
function frame(now: number): void {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (screen === 'playing') game.update(realDt);
  else if (screen === 'menu') game.idle(realDt);
  hud.tick(realDt);
  input.endFrame();
  postfx.render(game.world, game.overlay, game.camera, realDt, screen === 'menu' ? { slowmo: 0, damage: 0 } : game.postParams);
  requestAnimationFrame(frame);
}
show('menu');
requestAnimationFrame(frame);
