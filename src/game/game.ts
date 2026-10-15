import * as THREE from 'three';
import type { DoodleSprite } from '../draw/sprite';
import { cloudColorTex, cloudTex, markerTex, sunColorTex, sunTex } from '../render/ink';
import { paintMaterial } from '../render/palette';
import { buildLevel, Level, MapId, styleMaterial } from '../world/level';
import { Box, raycastBoxes } from '../world/collision';
import type { Hud } from '../ui/hud';
import type { Sfx } from './audio';
import { GameClock } from './clock';
import { Combo } from './combo';
import { DIFFICULTIES, Difficulty, DifficultyDef, scaleQueue } from './difficulty';
import { DoodleStats, doodleStats } from './doodleStats';
import { ENEMY_DEFS, Enemy, EnemyContext } from './enemy';
import { Doodled, FX } from './fx';
import {
  HARD_LANDING,
  HITSTOP_BIG,
  HITSTOP_KILL,
  Hitstop,
  KNOCKBACK,
  RECOIL,
  SHAKE_MAX_OFFSET,
  SHAKE_MAX_ROT,
  Spring,
  TRAUMA_HURT,
  TRAUMA_INK_BOMB,
  Tally,
  Trauma,
  fliesOnKill,
  panFor,
  shakeNoise,
  tallyHit,
} from './juice';
import { RemotePlayer } from './remotePlayer';
import { PaintGrid } from './paintGrid';
import { TEAM_COLORS } from '../net/versus';
import type { Input } from './input';
import { Player } from './player';
import { Projectiles } from './projectiles';
import { TimeMeter } from './timeMeter';
import { ViewModel } from './viewmodel';
import { Mods, Upgrade, maxedUpgrades, modsFrom, rollUpgrades } from './upgrades';
import { EnemyKind, isBossWave, maxAlive, parTime, spawnQueue, timeBonus } from './waves';
import { ALL_WEAPONS, HEADSHOT_MULT, STREAKS, WEAPONS, WeaponDef, WeaponId, WeaponState, damageAt, spinStep } from './weapons';

interface Pickup {
  kind: 'ammo' | 'health';
  box: THREE.Mesh;
  marker: THREE.Sprite;
  pos: THREE.Vector3;
  life: number;
  t: number;
}

type WaveState = 'intro' | 'fighting' | 'break' | 'choosing';

export interface Doodles {
  enemy: DoodleSprite;
  boss: DoodleSprite;
}

/** What the game needs from a versus room (VersusRoom implements it). */
export interface VersusLink {
  readonly selfId: string;
  /** Paint War team of a player (null in deathmatch). */
  teamOf(id: string): number | null;
  sendSnap(s: { p: [number, number, number]; yaw: number; sl: number; w: number; alive: number }): void;
  sendShot(from: number[], ends: number[][], weapon: number): void;
  sendSwing(): void;
  sendHit(to: string, dmg: number, head: boolean, erased: boolean): void;
  sendDied(by: string, head: boolean, erased: boolean): void;
}

/** Versus damage scaling, so one-hit weapons don't dominate. */
const VERSUS_DAMAGE: Record<WeaponId, number> = { rifle: 1, shotgun: 1, pistol: 1, sniper: 0.8, eraser: 0.7, minigun: 0.8, railgun: 0.6 };
const RESPAWN_S = 3;
const SPAWN_SHIELD = 1.5;
const REGEN_DELAY = 4;
const REGEN_RATE = 25;
const SNAP_INTERVAL = 0.05;

const BASE_FOV = 75;
const ERASER_PINK = new THREE.Color('#ee7fae');
/** Mouse sensitivity at 1.0x on the slider. */
export const BASE_SENSITIVITY = 0.0022;
const ZOOM_FOV = 22;
/** Field of view while aiming down sights (non-sniper). */
const AIM_FOV = 55;
/** Paint splat size per gun. */
const PAINT_SIZE: Record<WeaponId, number> = { rifle: 0.85, shotgun: 0.55, pistol: 0.75, sniper: 1.3, eraser: 0.9, minigun: 0.65, railgun: 1.7 };
const paintColors = new Map<number, THREE.Color>();
const teamColors = TEAM_COLORS.map((c) => new THREE.Color(c));
function teamColor(team: number): THREE.Color {
  return teamColors[team] ?? teamColors[0];
}
/** One target's share of a shot: merged pellets, where it was first hit and the shot direction. */
type ShotHit = Tally & { dir: THREE.Vector3; at: THREE.Vector3 };
const shellColors = new Map<WeaponId, THREE.Color>();
/** Paper shells take a pale wash of the gun's main color. */
function shellColor(def: WeaponDef): THREE.Color {
  let c = shellColors.get(def.id);
  if (!c) {
    c = new THREE.Color().setHSL(def.paint[0], 0.7, 0.82);
    shellColors.set(def.id, c);
  }
  return c;
}
function paintColor(def: WeaponDef): THREE.Color {
  const h = def.paint[Math.floor(Math.random() * def.paint.length)];
  let c = paintColors.get(h);
  if (!c) {
    c = new THREE.Color().setHSL(h, 0.9, 0.55);
    paintColors.set(h, c);
  }
  return c;
}

export class Game {
  readonly world = new THREE.Scene();
  readonly overlay = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 600);
  level: Level;
  /** Set when the map changed so the renderer re-bakes shadows. */
  shadowsDirty = true;
  readonly player = new Player();
  readonly clock = new GameClock();
  readonly meter = new TimeMeter();
  private weapons = WEAPONS.map((d) => new WeaponState(d));
  private wIdx = 0;
  private viewmodel = new ViewModel();
  private enemies: Enemy[] = [];
  private projectiles: Projectiles;
  private fx: FX;
  private pickups: Pickup[] = [];
  private markerTextures = { ammo: markerTex('ammo'), health: markerTex('health') };
  private sunSprite!: THREE.Sprite;
  private cloudSprites: THREE.Sprite[] = [];
  private colorMode = false;
  private doodles: Doodles | null = null;
  private stats: { enemy: DoodleStats; boss: DoodleStats } | null = null;
  readonly combo = new Combo();
  private owned: Record<string, number> = {};
  /** Easter-egg cheats, toggled from the menus. Single player only. */
  cheats = { infiniteInk: false, godPen: false };
  mods: Mods = modsFrom({});
  difficulty: DifficultyDef = DIFFICULTIES.normal;
  /** Real-time seconds left on the wave clock (bonus only). */
  private clockLeft = 0;
  private lastTick = 0;

  wave = 0;
  score = 0;
  kills = 0;
  /** Real seconds played this run (for leaderboard sanity checks). */
  runSeconds = 0;
  dead = false;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveState: WaveState = 'intro';
  private stateTimer = 0;
  private damageFlash = 0;
  private zoomed = false;
  /** Holding the aim button (right mouse or F). */
  private aiming = false;
  /** Minigun spin-up 0..1. */
  private spin = 0;
  /** Kills in a row (solo: without getting hit; versus: without dying). */
  streak = 0;
  /** Weapon slot to go back to when a killstreak gun runs dry. */
  private streakReturn = 0;
  private fireBuffer = 0;
  private wasSlow = false;
  private deathT = 0;
  private idleT = 0;
  onDeath: () => void = () => {};
  /** Called between waves with upgrade choices; the caller pauses and calls chooseUpgrade. */
  onUpgrade: (choices: Upgrade[], beatClock: boolean) => void = () => {};
  private choices: Upgrade[] = [];
  private beatClock = false;

  // ── Versus ──
  versus: VersusLink | null = null;
  readonly remotes = new Map<string, RemotePlayer>();
  private respawnT = 0;
  private spawnShield = 0;
  private sinceHurt = 0;
  private snapT = 0;
  /** Paint War coverage (null outside Paint War). */
  paintGrid: PaintGrid | null = null;
  private killerId = '';
  private lastKillT = -10;
  private killChain = 0;
  private brrrt = false;
  private time = 0;
  /** Versus kill/death events for the HUD feed. */
  onVersusEvent: (text: string) => void = () => {};

  // ── Game feel ──
  /** Screen shake strength from Options (0..1, already lowered for reduced motion). */
  shakeScale = 0.6;
  private trauma = new Trauma();
  /** Freeze frames (single player only). */
  private hitstop = new Hitstop();
  /** Camera shove away from whatever hit me (local x offset, roll). */
  private nudgeX = new Spring(140, 12);
  private nudgeRoll = new Spring(140, 12);
  private hurtAngle = 0;
  private tmpV = new THREE.Vector3();

  constructor(private hud: Hud, private sfx: Sfx, private input: Input) {
    this.level = buildLevel();
    this.world.add(this.level.scene);
    this.overlay.add(this.level.decor);
    this.world.add(this.camera);
    this.camera.add(this.viewmodel.root);
    this.projectiles = new Projectiles(this.overlay);
    this.fx = new FX(this.overlay);

    // Lighting: Lambert output is (ambient + sun·N)/π, tuned so lit tops ≈ 1.
    this.world.add(new THREE.AmbientLight(0xffffff, 0.4 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7 * Math.PI);
    sun.position.set(45, 100, 30);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 10;
    sc.far = 250;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.world.add(sun, sun.target);

    // Doodled sky.
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false }));
    sunSprite.position.set(-160, 70, -300);
    sunSprite.scale.setScalar(90);
    this.overlay.add(sunSprite);
    this.sunSprite = sunSprite;
    const clouds: [number, number, number, number][] = [
      [-60, 55, -280, 70],
      [80, 65, -300, 90],
      [260, 50, -60, 80],
      [-280, 60, 40, 80],
      [40, 60, 290, 90],
    ];
    for (const [x, y, z, s] of clouds) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
      c.position.set(x, y, z);
      c.scale.set(s, s / 2, 1);
      this.overlay.add(c);
      this.cloudSprites.push(c);
    }

    this.player.spawn(this.level.playerSpawn);
    this.player.applyCamera(this.camera);
  }

  private get weapon(): WeaponState {
    return this.weapons[this.wIdx];
  }

  setSensitivity(mult: number): void {
    this.player.sensitivity = BASE_SENSITIVITY * mult;
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  setColorMode(on: boolean): void {
    this.colorMode = on;
    this.level.setColorMode(on);
    this.viewmodel.setColorMode(on);
    this.sunSprite.material.map = on ? sunColorTex : sunTex;
    for (const c of this.cloudSprites) c.material.map = on ? cloudColorTex : cloudTex;
    for (const p of this.pickups) p.box.material = this.pickupMaterial(p.kind);
  }

  /** Swap the map (keeps color mode). */
  setMap(id: MapId): void {
    if (this.level.id === id) return;
    this.world.remove(this.level.scene);
    this.overlay.remove(this.level.decor);
    this.level = buildLevel(id);
    this.world.add(this.level.scene);
    this.overlay.add(this.level.decor);
    this.level.setColorMode(this.colorMode);
    this.shadowsDirty = true;
    this.player.spawn(this.level.playerSpawn);
  }

  private pickupMaterial(kind: 'ammo' | 'health'): THREE.Material {
    if (this.colorMode) return paintMaterial(kind === 'ammo' ? 'safetyGreen' : 'white');
    return styleMaterial(kind === 'ammo' ? 'brick' : 'tone');
  }

  start(doodles: Doodles, difficulty: Difficulty = 'normal'): void {
    this.doodles = doodles;
    this.difficulty = DIFFICULTIES[difficulty];
    this.stats = { enemy: statsOf(doodles.enemy), boss: statsOf(doodles.boss) };
    this.owned = this.cheats.godPen ? maxedUpgrades() : {};
    this.combo.reset();
    for (const e of this.enemies) this.removeEnemy(e);
    this.enemies = [];
    for (const p of this.pickups) this.removePickup(p);
    this.pickups = [];
    this.projectiles.clear();
    this.fx.clear();
    this.resetJuice();
    this.weapons = WEAPONS.map((d) => new WeaponState(d));
    // Killstreak guns stay finite so they still run dry and hand back your gun.
    for (const w of this.weapons) w.infinite = this.cheats.infiniteInk;
    this.switchWeapon(0, true);
    this.applyMods();
    this.streak = 0;
    this.spin = 0;
    this.player.spawn(this.level.playerSpawn);
    this.meter.reset();
    this.clock.timeScale = 1;
    this.score = 0;
    this.kills = 0;
    this.runSeconds = 0;
    this.wave = 0;
    this.dead = false;
    this.deathT = 0;
    this.damageFlash = 0;
    this.zoomed = false;
    this.viewmodel.root.visible = true;
    this.nextWave();
    this.hud.hint('WASD move · SPACE jump (twice!) · C slide · right-click/F aim · hold SHIFT to slow time', 6);
  }

  /** Straight-down view of the whole map (used to render the map vote pictures). */
  topdown(): void {
    const B = this.level.bounds + 2;
    const h = 300;
    this.camera.fov = (2 * Math.atan(B / h) * 180) / Math.PI;
    this.camera.position.set(0, h, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.viewmodel.root.visible = false;
    this.level.update(0.016);
  }

  /** Spin the camera over the level behind the menu. */
  idle(realDt: number): void {
    this.idleT += realDt * 0.06;
    const { center, radius, height } = this.level.idle;
    this.camera.position.set(center.x + Math.sin(this.idleT) * radius, height, center.z + Math.cos(this.idleT) * radius);
    this.camera.lookAt(center);
    this.level.update(realDt);
    this.viewmodel.root.visible = false;
  }

  get postParams() {
    return { slowmo: this.clock.slowAmount, damage: this.damageFlash };
  }

  // ── Main update ──────────────────────────────────────────────────────
  update(realDt: number): void {
    this.time += realDt;
    if (this.versus) {
      this.updateVersus(realDt);
      return;
    }
    if (this.dead) {
      this.updateDeath(realDt);
      return;
    }
    this.runSeconds += realDt;
    const input = this.input;
    const wantSlow = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const slow = this.meter.update(realDt, wantSlow);
    if (slow && !this.wasSlow) this.sfx.slowIn();
    if (!slow && this.wasSlow) this.sfx.slowOut();
    this.wasSlow = slow;
    this.clock.update(realDt, slow);
    this.sfx.setSlowmo(this.clock.slowAmount);

    // Freeze frames stop the world (enemies, shots, debris) but never the player's own aim.
    const wDt = this.clock.worldDt(realDt) * this.hitstop.step(realDt);
    const pDt = this.clock.playerDt(realDt);

    this.player.look(input, this.zoomed ? 0.35 : this.aiming ? 0.65 : 1);
    this.player.update(pDt, input, this.level.boxes);
    this.player.applyTriggers(this.level.triggers, pDt, this.level.boxes);
    this.level.update(realDt);
    this.movementEvents();
    this.player.applyCamera(this.camera);
    this.camera.updateMatrixWorld(true);

    this.updateWeapons(pDt);
    // Shake goes on after shooting so it never moves where bullets go.
    this.applyShake(realDt);

    const eye = this.player.eye(new THREE.Vector3());
    const ctx: EnemyContext = {
      playerEye: eye,
      boxes: this.level.boxes,
      obstacles: this.level.obstacles,
      bounds: this.level.bounds,
      others: this.enemies,
      fire: (from, dir, e) => {
        this.projectiles.spawn(from, dir, e.def.projSpeed, e.def.damage);
        this.fx.flash(from, e.def.kind === 'boss' ? 1.4 : 0.6, false);
        this.enemyShotSound(from);
      },
      onBossPhase: (boss) => {
        this.hud.banner('THE DOODLER SCRIBBLES MORE!', 1.8);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const at = boss.pos.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
          this.spawnEnemy('grunt', at);
        }
      },
    };
    for (const e of this.enemies) e.update(wDt, ctx);

    const dmg = this.projectiles.update(
      wDt,
      this.level.boxes,
      (p) => this.player.contains(p),
      (p, box) => this.fx.splat(p, box, 0.45),
      (vel) => {
        this.hurtAngle = this.angleTo(this.player.pos.x - vel.x, this.player.pos.z - vel.z);
        this.hud.damageArrow(this.hurtAngle);
      },
    );
    if (dmg > 0) {
      this.player.hp -= dmg;
      this.damageFlash = 1;
      this.hurtJolt(this.hurtAngle);
      this.sfx.hurt();
      this.streak = 0;
      if (this.player.hp <= 0) this.die();
    }
    this.damageFlash = Math.max(0, this.damageFlash - realDt * 1.8);

    this.updatePickups(wDt, realDt);
    this.combo.update(wDt);
    this.updateWaves(wDt, realDt);
    this.fx.update(wDt, realDt);

    // Zoom FOV, with a speed kick when sliding / moving fast.
    const speedKick = Math.max(0, Math.min(12, (this.player.speed - 7) * 1.5));
    const fov = this.zoomed ? ZOOM_FOV : this.aiming ? AIM_FOV : BASE_FOV + speedKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-realDt * 20));
      this.camera.updateProjectionMatrix();
    }
    this.updateViewmodel(pDt);
    this.hud.nums.update(realDt, this.camera, innerWidth, innerHeight);
    this.pushHud();
  }

  private updateViewmodel(dt: number): void {
    const w = this.weapon;
    // Railgun winds up as its next shot gets ready.
    const charge = w.def.id === 'railgun' ? 1 - Math.min(1, w.cooldown / (w.def.interval / w.rateMult)) : 0;
    this.viewmodel.update(dt, this.player.grounded ? this.player.speed : 0, w.reloading > 0 ? 1 - w.reloading / w.def.reload : 0, this.zoomed, this.aiming ? 1 : 0, this.spin, charge);
  }

  /** Sounds and puffs for jumps, pads and landings (solo and versus). */
  private movementEvents(): void {
    const feet = () => this.player.eye(this.tmpV).setY(this.player.pos.y + 0.1);
    switch (this.player.event) {
      case 'launch':
        this.sfx.boing();
        this.fx.spray(feet(), new THREE.Vector3(0, 1, 0), ERASER_PINK, 6, 0.06);
        break;
      case 'jump':
        this.sfx.jump();
        break;
      case 'airjump':
        this.sfx.airJump();
        this.fx.spray(feet(), new THREE.Vector3(0, 1, 0), ERASER_PINK, 4, 0.05);
        break;
      case 'slide':
        this.sfx.slide();
        break;
      case 'land': {
        const hard = this.player.landImpact > HARD_LANDING;
        this.sfx.land(hard);
        if (hard) this.trauma.add(Math.min(0.3, 0.12 + (this.player.landImpact - HARD_LANDING) * 0.02));
        break;
      }
    }
  }

  // ── Game feel ────────────────────────────────────────────────────────
  /**
   * Trauma shake plus the hurt shove, on top of the player's camera. Off
   * while aiming or scoped so precise shots never fight the camera.
   */
  private applyShake(realDt: number): void {
    this.trauma.step(realDt);
    const nx = this.nudgeX.step(realDt);
    const nr = this.nudgeRoll.step(realDt);
    const k = this.zoomed || this.aiming ? 0 : this.shakeScale;
    const s = this.trauma.shake * k;
    if (s < 1e-5 && Math.abs(nx * k) < 1e-4 && Math.abs(nr * k) < 1e-4) return;
    const t = this.time;
    const cam = this.camera;
    cam.rotation.x += SHAKE_MAX_ROT * s * shakeNoise(t, 1);
    cam.rotation.y += SHAKE_MAX_ROT * s * shakeNoise(t, 2);
    cam.rotation.z += SHAKE_MAX_ROT * s * shakeNoise(t, 3) + nr * k;
    cam.translateX(SHAKE_MAX_OFFSET * s * shakeNoise(t, 4) + nx * k);
    cam.translateY(SHAKE_MAX_OFFSET * s * shakeNoise(t, 5));
    cam.updateMatrixWorld(true);
  }

  /** Getting hit: medium shake, a shove away from the source and a jolt on the HP bar. */
  private hurtJolt(angle: number): void {
    this.trauma.add(TRAUMA_HURT);
    const side = Math.sin(angle);
    this.nudgeX.x -= side * 0.07;
    this.nudgeRoll.x += side * 0.035;
    this.hud.hurt();
  }

  private enemyShotSound(from: THREE.Vector3): void {
    const d = from.distanceTo(this.player.pos);
    this.sfx.enemyShot(panFor(this.angleTo(from.x, from.z)), Math.max(0.35, Math.min(1, 14 / Math.max(1, d))));
  }

  private resetJuice(): void {
    this.trauma.value = 0;
    this.hitstop.left = 0;
    this.nudgeX.reset();
    this.nudgeRoll.reset();
    this.hud.nums.clear();
  }

  /** Freeze frame in solo; versus never pauses, so it gets a white flash instead. */
  private impact(seconds: number, strong: boolean): void {
    if (this.versus) this.hud.whiteFlash(strong);
    else this.hitstop.trigger(seconds);
  }

  /** How a doodle goes when it dies: a quick pop, a head flying off, or the whole thing launched. */
  private deathFx(target: Doodled, head: boolean, dir: THREE.Vector3, erased: boolean, fly: boolean, gun: WeaponDef): void {
    const boss = target.def.kind === 'boss';
    const confetti = [target.def.ink, paintColor(gun), paintColor(gun)];
    if (fly && !head && !boss) {
      const push = target.def.kind === 'heavy' ? 4 : 8;
      const flat = this.tmpV.set(dir.x, 0, dir.z).normalize().multiplyScalar(push);
      this.fx.flyingKill(target, flat, confetti, erased, ERASER_PINK);
    } else if (erased && !head) {
      this.fx.erase(target, ERASER_PINK);
    } else {
      this.fx.popKill(target, dir.clone().multiplyScalar(boss ? 2 : 5), confetti, head);
    }
  }

  // ── Weapons ───────────────────────────────────────────────────────────
  private switchWeapon(i: number, instant = false): void {
    if (i === this.wIdx && !instant) return;
    this.weapon.cancelReload();
    this.wIdx = i;
    this.viewmodel.setWeapon(this.weapon.def.id);
    if (!instant) this.weapon.cooldown = Math.max(this.weapon.cooldown, 0.25);
  }

  private updateWeapons(dt: number): void {
    const input = this.input;
    const n = this.weapons.length;
    for (let i = 0; i < n; i++) if (input.pressed.has(`Digit${i + 1}`)) this.switchWeapon(i);
    if (input.wheel !== 0) this.switchWeapon((this.wIdx + (input.wheel > 0 ? 1 : n - 1)) % n);
    if (input.pressed.has('KeyQ')) this.switchWeapon((this.wIdx + 1) % n);

    const w = this.weapon;
    w.update(dt);
    if (input.pressed.has('KeyR') && w.startReload()) this.sfx.reload();
    // Aim down sights: right mouse or F. The sniper aims through its scope.
    this.aiming = (input.rightDown || input.keys.has('KeyF')) && !w.def.melee && w.reloading <= 0;
    this.zoomed = this.aiming && w.def.id === 'sniper';
    this.player.moveMult = (this.aiming ? 0.6 : 1) * (w.def.id === 'minigun' ? 0.8 : 1);

    // Minigun spins up while the trigger is held.
    this.spin = spinStep(this.spin, w.def, input.mouseDown, dt);
    if (!input.mouseDown) this.brrrt = false;

    if (input.mouseClicked) this.fireBuffer = 0.15;
    else this.fireBuffer = Math.max(0, this.fireBuffer - dt);
    const want = w.def.auto ? input.mouseDown && (!w.def.spinUp || this.spin >= 1) : this.fireBuffer > 0;
    if (want) {
      if (w.ammo === 0 && w.reloading <= 0) {
        if (w.startReload()) this.sfx.reload();
        else if (input.mouseClicked) this.sfx.empty();
      } else if (w.fire()) {
        this.fireBuffer = 0;
        if (w.def.melee) this.swing();
        else this.shoot();
        if (w.ammo === 0 && w.startReload()) this.sfx.reload();
      }
    }
    // Killstreak guns go away when they run dry.
    if (this.wIdx >= WEAPONS.length && w.ammo === 0) this.dropStreakWeapon();
  }

  // ── Killstreaks ─────────────────────────────────────────────────────
  private addStreakKill(): void {
    this.streak++;
    const reward = STREAKS.find((s) => s.kills === this.streak);
    if (reward) this.giveStreakWeapon(reward.def);
  }

  private giveStreakWeapon(def: WeaponDef): void {
    if (this.weapons.length > WEAPONS.length) this.weapons.length = WEAPONS.length;
    else this.streakReturn = this.wIdx;
    if (this.wIdx >= WEAPONS.length) this.wIdx = this.streakReturn;
    const st = new WeaponState(def);
    st.rateMult = this.mods.fireRate;
    this.weapons.push(st);
    this.switchWeapon(this.weapons.length - 1, true);
    this.hud.banner(`KILLSTREAK ×${this.streak}: ${def.name}!`, 2.2);
    this.hud.comic('ON FIRE!', true);
    this.hud.hint(def.hint, 3);
    this.sfx.streak();
  }

  private dropStreakWeapon(): void {
    if (this.weapons.length <= WEAPONS.length) return;
    this.weapons.length = WEAPONS.length;
    this.wIdx = Math.min(this.streakReturn, WEAPONS.length - 1);
    this.viewmodel.setWeapon(this.weapon.def.id);
    this.weapon.cooldown = Math.max(this.weapon.cooldown, 0.25);
    this.spin = 0;
  }

  /**
   * Splash paint where a shot landed. In Paint War the paint is the shooter's
   * team color and claims ground for the team.
   */
  private paintAt(p: THREE.Vector3, box: Box, def: WeaponDef, scale = 1, shooter?: string): void {
    const size = PAINT_SIZE[def.id] * scale;
    const who = shooter ?? this.versus?.selfId ?? '';
    const team = this.versus && this.paintGrid ? this.versus.teamOf(who) : null;
    if (team !== null && this.paintGrid) {
      this.fx.paint(p, box, teamColor(team), size * 1.2);
      this.paintGrid.claim(p.x, p.z, size * 0.6, team, who);
    } else {
      this.fx.paint(p, box, paintColor(def), size);
    }
  }

  /** A hit on a doodle splatters paint on whatever is right behind it. */
  private paintBehind(from: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef): void {
    const start = from.clone().addScaledVector(dir, 0.3);
    const hit = raycastBoxes(this.level.boxes, start, dir, 6);
    if (hit) this.paintAt(start.addScaledVector(dir, hit.t), hit.box, def, 0.8);
  }

  /** Is this remote player on my Paint War team? (no friendly fire) */
  private teammate(id: string): boolean {
    if (!this.versus) return false;
    const mine = this.versus.teamOf(this.versus.selfId);
    return mine !== null && this.versus.teamOf(id) === mine;
  }

  /** Angle of a world point relative to where I'm looking (0 = ahead, + = right). */
  private angleTo(x: number, z: number): number {
    const dx = x - this.player.pos.x;
    const dz = z - this.player.pos.z;
    const yaw = this.player.yaw;
    const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    return Math.atan2(right, fwd);
  }

  /** Comic burst for a kill. */
  private comicKill(head: boolean, erased: boolean): void {
    const chain = this.time - this.lastKillT < 1.3 ? this.killChain + 1 : 1;
    this.killChain = chain;
    this.lastKillT = this.time;
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    if (chain === 2) this.hud.comic('DOUBLE!', true);
    else if (chain >= 3) this.hud.comic(chain === 3 ? 'TRIPLE!' : 'RAMPAGE!', true);
    else if (head) this.hud.comic(pick(['NICE SHOT!', 'HEADSHOT!', 'BULLSEYE!']));
    else if (erased) this.hud.comic(pick(['ERASED!', 'SCRUB!', 'SWOOSH!']));
    else if (this.weapon.def.id === 'shotgun') this.hud.comic(pick(['KA-BLAM!', 'BLAM!']));
    else this.hud.comic(pick(['POW!', 'BOOM!', 'WHAM!', 'SPLAT!', 'KAPOW!']));
  }

  private shoot(): void {
    const def = this.weapon.def;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const muzzle = this.viewmodel.muzzleWorld(new THREE.Vector3());

    let spread = this.zoomed ? 0.0004 : def.spread * (this.aiming ? 0.35 : 1);
    if (!this.player.grounded) spread *= 1.6;
    const maxHits = 1 + (def.pierce ?? 0);
    const headMult = def.headMult ?? HEADSHOT_MULT;

    const hits = new Map<Enemy, ShotHit>();
    const remoteHits = new Map<RemotePlayer, ShotHit>();
    const ends: number[][] = [];
    for (let p = 0; p < def.pellets; p++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

      const wh = raycastBoxes(this.level.boxes, origin, dir, 250);
      const wallT = wh ? wh.t : Infinity;
      // Everything the shot crosses before the wall, nearest first; piercing guns take several.
      const cands: { t: number; head: boolean; e?: Enemy; r?: RemotePlayer }[] = [];
      for (const e of this.enemies) {
        const h = e.rayHit(origin, dir);
        if (h && h.t < wallT) cands.push({ t: h.t, head: h.headshot, e });
      }
      if (this.versus) {
        for (const rp of this.remotes.values()) {
          if (this.teammate(rp.id)) continue;
          const h = rp.rayHit(origin, dir);
          if (h && h.t < wallT) cands.push({ t: h.t, head: h.headshot, r: rp });
        }
      }
      cands.sort((x, y) => x.t - y.t);
      const taken = cands.slice(0, maxHits);
      for (const c of taken) {
        const at = origin.clone().addScaledVector(dir, c.t);
        const make = (): ShotHit => ({ dmg: 0, head: false, count: 0, dir, at: at.clone() });
        if (c.r) {
          const dmg = damageAt(def, c.t) * (c.head ? headMult : 1) * VERSUS_DAMAGE[def.id];
          tallyHit(remoteHits, c.r, dmg, c.head, make);
          this.fx.spray(at, dir, c.r.ink, def.pellets > 1 ? 2 : 5);
        } else if (c.e) {
          const mult = (c.head ? headMult + this.mods.headshot : 1) * (c.e.def.heavy ? def.heavyMult : 1) * this.mods.damage;
          tallyHit(hits, c.e, damageAt(def, c.t) * mult, c.head, make);
          this.fx.spray(at, dir, c.e.def.ink, def.pellets > 1 ? 2 : 5);
        }
        this.fx.sparks(at, dir, paintColor(def), def.pellets > 1 ? 1 : 3);
        this.paintBehind(at, dir, def);
      }
      const stopped = taken.length >= maxHits;
      const endT = stopped ? taken[taken.length - 1].t : wh ? wh.t : 120;
      const end = origin.clone().addScaledVector(dir, endT);
      if (!stopped && wh) {
        this.paintAt(end, wh.box, def);
        if (this.mods.ricochet) this.ricochet(end, def, hits);
      }
      if (p < 4) {
        if (def.id === 'railgun') this.fx.beam(muzzle.clone().addScaledVector(dir, 0.15), end, paintColor(def));
        else this.fx.tracer(muzzle.clone().addScaledVector(dir, 0.15), end);
        ends.push([+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)]);
      }
    }

    // Shotgun pellets push in proportion to how many landed.
    const pushOf = (h: ShotHit) => KNOCKBACK[def.id] * (def.pellets > 1 ? Math.min(1, (h.count / def.pellets) * 1.6) : 1);
    let kills = 0;
    let bigKill = false;
    for (const [e, h] of hits) {
      this.hud.nums.spawn(h.at, h.dmg, h.head);
      const killed = e.damage(h.dmg);
      if (killed) {
        kills++;
        bigKill ||= h.head;
        this.onKill(e, h.head, h.dir, false, fliesOnKill(def.id));
      } else {
        e.react(h.dir, pushOf(h));
        if (h.head) this.sfx.headshot();
        else this.sfx.hit();
      }
      this.hud.hitmarker(h.head, killed);
    }
    // Multi-kills and railgun skewers hold the freeze a little longer.
    if (kills >= 2 || bigKill || (def.id === 'railgun' && hits.size >= 2)) this.impact(HITSTOP_BIG, true);
    if (this.versus) {
      for (const [rp, h] of remoteHits) {
        this.versus.sendHit(rp.id, Math.round(h.dmg), h.head, false);
        rp.hitFlash(pushOf(h));
        this.hud.nums.spawn(h.at, Math.round(h.dmg), h.head);
        if (h.head) this.sfx.headshot();
        else this.sfx.hit();
        this.hud.hitmarker(h.head, false);
      }
      const wi = ALL_WEAPONS.findIndex((d) => d.id === def.id);
      this.versus.sendShot([+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2)], ends, wi);
    }

    if (def.id === 'railgun') this.hud.comic('ZZZAP!', true);
    if (def.id === 'minigun' && !this.brrrt) {
      this.brrrt = true;
      this.hud.comic('BRRRT!');
    }
    if (!this.zoomed) this.fx.muzzle(def.id, def.paint, muzzle, fwd, this.aiming ? 0.55 : 1);
    this.ejectShell(def, muzzle, fwd, right, up);
    this.viewmodel.fire();
    const r = RECOIL[def.id];
    this.trauma.add(r.trauma);
    this.hud.kickCrosshair(r.bloom);
    this.player.recoil = Math.min(0.2, this.player.recoil + def.recoil);
    this.sfx.shot(def.id);
  }

  /** Paper shell casing flipping out to the right of the gun. */
  private ejectShell(def: WeaponDef, muzzle: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    if (def.id === 'railgun' || (def.id === 'minigun' && Math.random() < 0.5)) return;
    const at = muzzle.clone().addScaledVector(fwd, -0.3).addScaledVector(right, 0.05).addScaledVector(up, 0.03);
    const vel = right.clone().multiplyScalar(1.6 + Math.random()).addScaledVector(up, 1.6 + Math.random()).addScaledVector(fwd, -0.4).add(this.player.vel);
    this.fx.shell(at, vel, shellColor(def), this.player.pos.y);
  }

  /** Eraser sword: hits every enemy in a short frontal arc, lunges forward. */
  private swing(): void {
    const def = this.weapon.def;
    const m = def.melee!;
    this.viewmodel.startSwing();
    this.sfx.swing();
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl;
    const fz = fwd.z / fl;
    if (this.player.grounded) {
      this.player.vel.x += fx * m.lunge;
      this.player.vel.z += fz * m.lunge;
    }
    const range = m.range * this.mods.swordRange;
    if (this.mods.swatter) {
      for (const p of this.projectiles.eraseInCone(eye, fx, fz, range + 0.5, Math.cos(m.arc))) {
        this.fx.spray(p, fwd, ERASER_PINK, 3, 0.05);
      }
    }
    if (this.versus) {
      this.versus.sendSwing();
      for (const rp of this.remotes.values()) {
        if (!rp.alive || this.teammate(rp.id)) continue;
        const dx = rp.pos.x - eye.x;
        const dz = rp.pos.z - eye.z;
        const d = Math.hypot(dx, dz);
        if (d - 0.4 > range) continue;
        if (eye.y < rp.pos.y - 0.5 || eye.y > rp.pos.y + rp.height + 1.5) continue;
        const cos = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
        if (d > 0.8 && cos < Math.cos(m.arc)) continue;
        const to = new THREE.Vector3(rp.pos.x, Math.min(eye.y, rp.pos.y + rp.height * 0.6), rp.pos.z);
        const dir = to.clone().sub(eye);
        const len = dir.length();
        dir.divideScalar(len || 1);
        if (raycastBoxes(this.level.boxes, eye, dir, Math.max(0, len - 0.4))) continue;
        this.fx.spray(to, dir, ERASER_PINK, 6, 0.06);
        const vd = Math.round(def.damage * VERSUS_DAMAGE.eraser);
        this.versus.sendHit(rp.id, vd, false, true);
        rp.hitFlash(KNOCKBACK.eraser);
        this.hud.nums.spawn(to, vd, false);
        this.sfx.squeak();
        this.hud.hitmarker(false, false);
      }
    }
    for (const e of [...this.enemies]) {
      if (!e.ready || !e.alive) continue;
      const dx = e.pos.x - eye.x;
      const dz = e.pos.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > range) continue;
      if (eye.y < e.pos.y - 0.5 || eye.y > e.pos.y + e.height + 1.5) continue;
      const cos = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (d > 0.8 && cos < Math.cos(m.arc)) continue;
      const to = new THREE.Vector3(e.pos.x, Math.min(eye.y, e.pos.y + e.height * 0.6), e.pos.z);
      const dir = to.clone().sub(eye);
      const len = dir.length();
      dir.divideScalar(len || 1);
      if (raycastBoxes(this.level.boxes, eye, dir, Math.max(0, len - e.radius))) continue;
      this.fx.spray(to, dir, ERASER_PINK, 6, 0.06);
      const dmg = def.damage * (e.def.heavy ? def.heavyMult : 1) * this.mods.damage;
      this.hud.nums.spawn(to, dmg, false);
      const killed = e.damage(dmg);
      this.sfx.squeak();
      if (killed) this.onKill(e, false, dir, true, true);
      else e.react(dir, KNOCKBACK.eraser);
      this.hud.hitmarker(false, killed);
    }
  }

  /** `fly`: the kill launches the whole doodle (shotgun, railgun, sword). */
  private onKill(e: Enemy, head: boolean, dir: THREE.Vector3, erased = false, fly = false): void {
    this.kills++;
    this.comicKill(head, erased);
    this.addStreakKill();
    const prevMult = this.combo.mult;
    const mult = this.combo.onKill(erased || this.clock.slowAmount > 0.5);
    if (mult > prevMult) this.sfx.combo(mult);
    this.score += Math.round(e.def.score * (head ? 1.5 : 1) * mult * this.difficulty.score);
    this.meter.onKill(head);
    if (this.mods.healOnKill) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.mods.healOnKill);
    this.deathFx(e, head, dir, erased, fly, this.weapon.def);
    this.impact(head ? HITSTOP_BIG : HITSTOP_KILL, head);
    this.sfx.kill(e.height, head);
    this.removeEnemy(e);
    this.enemies = this.enemies.filter((x) => x !== e);
    if (this.mods.inkBomb > 0) this.inkBomb(e);
    if (e.def.kind === 'boss') {
      this.hud.banner('THE DOODLER IS ERASED', 2.5);
      this.dropPickup('health', e.pos);
      this.dropPickup('ammo', e.pos.clone().add(new THREE.Vector3(1.5, 0, 0)));
    } else if (Math.random() < 0.3) {
      this.dropPickup(Math.random() < 0.65 ? 'ammo' : 'health', e.pos);
    }
  }

  /** Ink Bomb upgrade: a kill splashes damage on everyone nearby (can chain). */
  private inkBomb(dead: Enemy): void {
    const at = dead.pos.clone();
    at.y += dead.height * 0.5;
    this.fx.flash(at, 2.2, false);
    this.fx.spray(at, new THREE.Vector3(0, -1, 0), dead.def.ink, 10, 0.15);
    this.trauma.add(TRAUMA_INK_BOMB * Math.min(1, 14 / Math.max(1, at.distanceTo(this.player.pos))));
    this.sfx.inkBomb();
    for (const o of [...this.enemies]) {
      if (!o.alive || !o.ready) continue;
      const d = Math.hypot(o.pos.x - dead.pos.x, o.pos.z - dead.pos.z) - o.radius;
      if (d > 3.5) continue;
      if (o.damage(this.mods.inkBomb)) this.onKill(o, false, new THREE.Vector3(o.pos.x - at.x, 0.5, o.pos.z - at.z).normalize());
    }
  }

  /** Ricochet upgrade: a shot that hits a wall bounces to the nearest visible enemy within 10m. */
  private ricochet(from: THREE.Vector3, def: WeaponState['def'], hits: Map<Enemy, ShotHit>): void {
    let best: Enemy | null = null;
    let bestD = 10;
    const target = new THREE.Vector3();
    for (const e of this.enemies) {
      if (!e.alive || !e.ready) continue;
      target.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
      const d = from.distanceTo(target);
      if (d >= bestD) continue;
      const dir = target.clone().sub(from).normalize();
      const start = from.clone().addScaledVector(dir, 0.05);
      if (raycastBoxes(this.level.boxes, start, dir, d - e.radius)) continue;
      best = e;
      bestD = d;
    }
    if (!best) return;
    target.set(best.pos.x, best.pos.y + best.height * 0.5, best.pos.z);
    const dir = target.clone().sub(from).normalize();
    this.fx.tracer(from, target);
    const at = target.clone();
    tallyHit(hits, best, def.damage * 0.6 * this.mods.damage, false, () => ({ dmg: 0, head: false, count: 0, dir, at }));
  }

  // ── Upgrades ──────────────────────────────────────────────────────────
  chooseUpgrade(i: number): void {
    if (this.waveState !== 'choosing') return;
    const u = this.choices[i];
    if (u) {
      this.owned[u.id] = (this.owned[u.id] ?? 0) + 1;
      const hpBefore = this.mods.maxHp;
      this.applyMods();
      // New max HP comes with matching health.
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + (this.mods.maxHp - hpBefore));
      this.sfx.upgrade();
      this.hud.hint(`${u.name}: ${u.text}`, 2.5);
    }
    this.choices = [];
    this.nextWave();
  }

  get ownedUpgrades(): Record<string, number> {
    return { ...this.owned };
  }

  private applyMods(): void {
    const m = (this.mods = modsFrom(this.owned));
    this.player.airJumps = m.airJumps;
    this.player.slideMult = m.slide;
    this.player.speedMult = m.moveSpeed;
    this.player.maxHp = 100 + m.maxHp;
    this.meter.capacity = 5 + m.meterCap;
    this.meter.killRefill = 0.75 + m.meterRefill;
    this.combo.window = 3 + m.comboWindow;
    for (const w of this.weapons) {
      w.rateMult = m.fireRate;
      w.reloadMult = m.reload;
      w.setReserveMult(m.reserve);
    }
  }

  // ── Waves ─────────────────────────────────────────────────────────────
  private nextWave(): void {
    this.wave++;
    this.queue = scaleQueue(spawnQueue(this.wave), this.difficulty.count);
    this.waveState = 'intro';
    this.stateTimer = 2.2;
    this.spawnTimer = 0;
    this.clockLeft = parTime(this.wave);
    this.hud.banner(isBossWave(this.wave) ? `WAVE ${this.wave} — THE DOODLER` : `WAVE ${this.wave}`);
    this.sfx.wave();
  }

  private updateWaves(dt: number, realDt: number): void {
    if (this.waveState === 'choosing') return;
    if (this.waveState === 'intro') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.waveState = 'fighting';
      return;
    }
    if (this.waveState === 'break') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.waveState = 'choosing';
        this.choices = rollUpgrades(this.owned, this.beatClock ? 4 : 3);
        if (this.choices.length) this.onUpgrade(this.choices, this.beatClock);
        else this.nextWave();
      }
      return;
    }
    // Wave clock runs in real time: slow-mo slows enemies, not the clock.
    if (this.clockLeft > 0) {
      this.clockLeft = Math.max(0, this.clockLeft - realDt);
      const sec = Math.ceil(this.clockLeft);
      if (sec <= 5 && sec !== this.lastTick && this.clockLeft > 0) this.sfx.tick();
      this.lastTick = sec;
      if (this.clockLeft === 0) this.hud.hint('clock ran out: no time bonus this wave', 2);
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.enemies.length < Math.max(2, maxAlive(this.wave) + this.difficulty.maxAlive)) {
      this.spawnEnemy(this.queue.shift()!);
      this.spawnTimer = 0.9;
    }
    if (!this.queue.length && !this.enemies.length) {
      this.waveState = 'break';
      this.stateTimer = 1.8;
      const clear = Math.round(50 * this.wave * this.difficulty.score);
      const tb = Math.round(timeBonus(this.wave, this.clockLeft) * this.difficulty.score);
      this.beatClock = tb > 0;
      this.score += clear + tb;
      this.hud.banner(tb > 0 ? `WAVE CLEARED  +${clear}  ⏱ +${tb}` : `WAVE CLEARED  +${clear}`);
    }
  }

  private spawnEnemy(kind: EnemyKind, at?: THREE.Vector3): void {
    if (!this.doodles || !this.stats) return;
    let pos = at;
    if (!pos) {
      const pp = this.player.pos;
      const far = this.level.spawnPoints.filter((s) => Math.hypot(s.x - pp.x, s.z - pp.z) > 18);
      const pool = far.length ? far : this.level.spawnPoints;
      pos = pool[Math.floor(Math.random() * pool.length)].clone();
      pos.x += (Math.random() - 0.5) * 3;
      pos.z += (Math.random() - 0.5) * 3;
    }
    if (kind === 'boss') pos = this.level.bossSpawn.clone();
    const hpScale = kind === 'boss' ? 1 + (this.wave / 5 - 1) * 0.5 : 1 + (this.wave - 1) * 0.06;
    const boss = kind === 'boss';
    const st = boss ? this.stats.boss : this.stats.enemy;
    const d = this.difficulty;
    const base = ENEMY_DEFS[kind];
    const def = { ...base, fireInterval: base.fireInterval * d.fireInterval, projSpeed: base.projSpeed * d.projSpeed, damage: base.damage * d.enemyDamage };
    const e = new Enemy(def, boss ? this.doodles.boss : this.doodles.enemy, pos, hpScale * st.hpMult * d.enemyHp, st.speedMult);
    this.enemies.push(e);
    this.overlay.add(e.mesh, e.shadow);
  }

  private removeEnemy(e: Enemy): void {
    this.overlay.remove(e.mesh, e.shadow);
    e.dispose();
  }

  get enemiesLeft(): number {
    return this.queue.length + this.enemies.length;
  }

  // ── Pickups ───────────────────────────────────────────────────────────
  private dropPickup(kind: 'ammo' | 'health', at: THREE.Vector3): void {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), this.pickupMaterial(kind));
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTextures[kind], transparent: true, depthWrite: false }));
    marker.scale.setScalar(0.5);
    const pos = at.clone();
    pos.y = 0;
    this.world.add(box);
    this.overlay.add(marker);
    this.pickups.push({ kind, box, marker, pos, life: 30, t: Math.random() * 6 });
  }

  private removePickup(p: Pickup): void {
    this.world.remove(p.box);
    this.overlay.remove(p.marker);
    p.box.geometry.dispose();
    p.marker.material.dispose();
  }

  private updatePickups(wDt: number, realDt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= wDt;
      p.t += realDt;
      p.box.position.set(p.pos.x, 0.35 + Math.sin(p.t * 3) * 0.08, p.pos.z);
      p.box.rotation.y = p.t;
      p.marker.position.set(p.pos.x, 1.0 + Math.sin(p.t * 3) * 0.08, p.pos.z);
      const pp = this.player.pos;
      const near = Math.hypot(pp.x - p.pos.x, pp.z - p.pos.z) < 1.3 && Math.abs(pp.y - p.pos.y) < 1.5;
      if (near) {
        if (p.kind === 'ammo') {
          for (const w of this.weapons) w.addAmmoFraction(0.3);
          this.hud.hint('+ammo', 1.2);
        } else {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
          this.hud.hint('+30 hp', 1.2);
        }
        this.sfx.pickup();
      }
      if (near || p.life <= 0) {
        this.removePickup(p);
        this.pickups.splice(i, 1);
      }
    }
  }

  // ── Death ─────────────────────────────────────────────────────────────
  private die(): void {
    this.dead = true;
    this.deathT = 0;
    this.player.hp = 0;
    this.zoomed = false;
    this.viewmodel.root.visible = false;
    this.meter.active = false;
    this.wasSlow = false;
    this.clock.timeScale = 1;
    this.sfx.setSlowmo(0);
    this.hud.banner('YOU GOT ERASED', 3);
    this.pushHud();
  }

  private updateDeath(realDt: number): void {
    this.deathT += realDt;
    const k = Math.min(1, this.deathT / 1.2);
    this.camera.position.y = this.player.pos.y + 1.6 - k * 1.3;
    this.camera.rotation.z = k * 0.9;
    this.fx.update(realDt * 0.3, realDt);
    this.hud.nums.update(realDt, this.camera, innerWidth, innerHeight);
    this.damageFlash = 1 - k * 0.5;
    if (this.deathT >= 1.6 && this.deathT - realDt < 1.6) this.onDeath();
  }

  // ── Versus ───────────────────────────────────────────────────────────
  /** Start (or restart) versus play on the current map. */
  startVersus(link: VersusLink): void {
    this.versus = link;
    for (const e of this.enemies) this.removeEnemy(e);
    this.enemies = [];
    this.queue = [];
    for (const p of this.pickups) this.removePickup(p);
    this.pickups = [];
    this.projectiles.clear();
    this.fx.clear();
    this.resetJuice();
    this.owned = {};
    this.applyMods();
    this.meter.reset();
    this.meter.active = false;
    this.clock.timeScale = 1;
    this.sfx.setSlowmo(0);
    this.combo.reset();
    this.paintGrid = link.teamOf(link.selfId) !== null ? new PaintGrid(this.level.bounds) : null;
    this.respawn();
    this.hud.setVersus(true);
  }

  stopVersus(): void {
    this.versus = null;
    this.paintGrid = null;
    for (const id of Array.from(this.remotes.keys())) this.removeRemote(id);
    this.dead = false;
    this.hud.setVersus(false);
  }

  addRemote(r: RemotePlayer): void {
    this.remotes.set(r.id, r);
    this.overlay.add(r.mesh, r.shadow, r.tag);
  }

  removeRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.overlay.remove(r.mesh, r.shadow, r.tag);
    r.dispose();
    this.remotes.delete(id);
  }

  /** Spawn point far from everyone else. */
  private versusSpawn(): THREE.Vector3 {
    const others = Array.from(this.remotes.values()).filter((r) => r.alive).map((r) => r.pos);
    const scored = this.level.versusSpawns.map((p) => ({
      p,
      d: others.length ? Math.min(...others.map((o) => o.distanceTo(p))) : Math.random() * 10,
    }));
    scored.sort((a, b) => b.d - a.d);
    const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
    return pick.p.clone();
  }

  private respawn(): void {
    this.weapons = WEAPONS.map((d) => new WeaponState(d));
    this.switchWeapon(0, true);
    this.applyMods();
    const at = this.versusSpawn();
    this.player.spawn(at);
    // Face the middle of the map.
    this.player.yaw = Math.atan2(at.x - this.level.idle.center.x, at.z - this.level.idle.center.z);
    this.dead = false;
    this.deathT = 0;
    this.damageFlash = 0;
    this.zoomed = false;
    this.spawnShield = SPAWN_SHIELD;
    this.spin = 0;
    this.sinceHurt = 0;
    this.viewmodel.root.visible = true;
    this.camera.rotation.z = 0;
    this.hud.spectating(null);
  }

  /** Someone hit me. */
  versusHit(from: string, dmg: number, head: boolean, erased: boolean): void {
    if (!this.versus || this.dead || this.spawnShield > 0) return;
    this.player.hp -= dmg;
    this.damageFlash = 1;
    this.sinceHurt = 0;
    const src = this.remotes.get(from);
    const angle = src ? this.angleTo(src.pos.x, src.pos.z) : 0;
    if (src) this.hud.damageArrow(angle);
    this.hurtJolt(angle);
    this.hud.comic(Math.random() < 0.5 ? 'OUCH!' : 'OOF!');
    this.sfx.hurt();
    if (this.player.hp <= 0) {
      this.dead = true;
      this.deathT = 0;
      this.player.hp = 0;
      this.respawnT = RESPAWN_S;
      this.zoomed = false;
      this.aiming = false;
      this.streak = 0;
      this.viewmodel.root.visible = false;
      this.killerId = from;
      this.versus.sendDied(from, head, erased);
      const name = this.remotes.get(from)?.name ?? 'someone';
      this.hud.banner(`${erased ? 'ERASED' : 'SCRIBBLED OUT'} BY ${name.toUpperCase()}`, RESPAWN_S - 0.4);
      this.onVersusEvent(`${name} ${erased ? 'erased' : 'got'} you`);
      this.sendSnap(true);
    }
  }

  /** A remote player died (by me or someone else). */
  remoteDied(victim: string, by: string, head: boolean, erased: boolean, selfId: string): void {
    const r = this.remotes.get(victim);
    if (r && r.alive) {
      const dir = r.pos.clone().sub(this.player.pos).setY(0.3).normalize();
      // Local-only flourish: my big guns launch them, everyone else's kills pop.
      const mine = by === selfId;
      this.deathFx(r, head, dir, erased, erased || (mine && fliesOnKill(this.weapon.def.id)), mine ? this.weapon.def : WEAPONS[0]);
      r.kill();
    }
    const vName = r?.name ?? 'someone';
    if (by === selfId) {
      this.comicKill(head, erased);
      this.addStreakKill();
      this.sfx.kill(r?.height ?? 1.85, head);
      this.impact(HITSTOP_BIG, head);
      this.hud.hitmarker(head, true);
      this.hud.hint(`you ${erased ? 'erased' : 'scribbled out'} ${vName}${head ? ' (headshot!)' : ''}`, 2);
      this.onVersusEvent(`you ${erased ? 'erased' : 'got'} ${vName}`);
    } else {
      const kName = this.remotes.get(by)?.name ?? 'someone';
      this.onVersusEvent(`${kName} ${erased ? 'erased' : 'got'} ${vName}`);
    }
  }

  remoteShot(id: string, from: number[], ends: number[][], weapon: number): void {
    const r = this.remotes.get(id);
    if (!r || !Array.isArray(from) || from.length !== 3) return;
    const o = new THREE.Vector3(from[0], from[1], from[2]);
    const def = ALL_WEAPONS[weapon] ?? WEAPONS[0];
    for (const e of (ends ?? []).slice(0, 4)) {
      if (!Array.isArray(e) || e.length !== 3) continue;
      const end = new THREE.Vector3(e[0], e[1], e[2]);
      if (def.id === 'railgun') this.fx.beam(o, end, paintColor(def));
      else this.fx.tracer(o, end);
      // Their paint lands on the same walls.
      const dir = end.clone().sub(o);
      const len = dir.length();
      if (len < 0.01) continue;
      dir.divideScalar(len);
      const hit = raycastBoxes(this.level.boxes, o, dir, len + 0.3);
      if (hit) this.paintAt(o.clone().addScaledVector(dir, hit.t), hit.box, def, 1, id);
    }
    this.fx.flash(o, weapon === 1 ? 0.5 : 0.35, false);
    if (o.distanceTo(this.player.pos) < 60) this.enemyShotSound(o);
  }

  remoteSwing(id: string): void {
    const r = this.remotes.get(id);
    if (!r || !r.alive) return;
    this.fx.spray(r.pos.clone().setY(r.pos.y + 1.2), new THREE.Vector3(0, 1, 0), ERASER_PINK, 4, 0.05);
    if (r.pos.distanceTo(this.player.pos) < 30) this.sfx.swing();
  }

  private sendSnap(force = false): void {
    if (!this.versus) return;
    if (!force && this.snapT > 0) return;
    this.snapT = SNAP_INTERVAL;
    const p = this.player.pos;
    this.versus.sendSnap({
      p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      yaw: +this.player.yaw.toFixed(2),
      sl: this.player.sliding > 0 ? 1 : 0,
      w: this.wIdx,
      alive: this.dead ? 0 : 1,
    });
  }

  private updateVersus(realDt: number): void {
    this.clock.update(realDt, false);
    this.snapT -= realDt;
    this.level.update(realDt);
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    for (const r of this.remotes.values()) r.update(realDt, cam);

    if (this.dead) {
      this.deathT += realDt;
      const k = Math.min(1, this.deathT / 1.2);
      const killer = this.remotes.get(this.killerId);
      if (this.deathT > 0.9 && killer && killer.alive) {
        // Spectate whoever got me, through their eyes.
        this.camera.position.set(killer.pos.x, killer.pos.y + (killer.sliding ? 1.0 : 1.6), killer.pos.z);
        this.camera.rotation.set(0, killer.yaw, 0, 'YXZ');
        killer.mesh.visible = killer.shadow.visible = killer.tag.visible = false;
        this.hud.spectating(killer.name);
        this.damageFlash = 0.15;
      } else {
        this.camera.position.y = this.player.pos.y + 1.6 - k * 1.3;
        this.camera.rotation.z = k * 0.9;
        this.damageFlash = 1 - k * 0.5;
      }
      this.fx.update(realDt, realDt);
      this.respawnT -= realDt;
      if (this.respawnT <= 0) this.respawn();
      this.sendSnap();
      this.pushHud();
      return;
    }

    const input = this.input;
    this.player.look(input, this.zoomed ? 0.35 : this.aiming ? 0.65 : 1);
    this.player.update(realDt, input, this.level.boxes);
    this.player.applyTriggers(this.level.triggers, realDt, this.level.boxes);
    this.movementEvents();
    this.player.applyCamera(this.camera);
    this.camera.updateMatrixWorld(true);
    this.updateWeapons(realDt);
    this.applyShake(realDt);

    this.spawnShield = Math.max(0, this.spawnShield - realDt);
    this.sinceHurt += realDt;
    if (this.sinceHurt > REGEN_DELAY && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + REGEN_RATE * realDt);
    }
    this.damageFlash = Math.max(0, this.damageFlash - realDt * 1.8);
    this.fx.update(realDt, realDt);

    const speedKick = Math.max(0, Math.min(12, (this.player.speed - 7) * 1.5));
    const fov = this.zoomed ? ZOOM_FOV : this.aiming ? AIM_FOV : BASE_FOV + speedKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-realDt * 20));
      this.camera.updateProjectionMatrix();
    }
    this.updateViewmodel(realDt);
    this.hud.nums.update(realDt, this.camera, innerWidth, innerHeight);
    this.sendSnap();
    this.pushHud();
  }

  private pushHud(): void {
    const w = this.weapon;
    const boss = this.enemies.find((e) => e.def.kind === 'boss');
    this.hud.update({
      score: this.score,
      wave: this.wave,
      enemiesLeft: this.enemiesLeft,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      ammo: w.ammo,
      mag: w.def.mag,
      reserve: w.reserve,
      weapon: w.def.id,
      reloading: w.reloading > 0,
      meter: this.meter.fraction,
      slowActive: this.meter.active,
      boss: boss ? { name: 'THE DOODLER', frac: boss.hp / boss.maxHp } : null,
      zoomed: this.zoomed,
      combo: this.combo.chain > 0 ? { mult: this.combo.mult, frac: this.combo.fraction } : null,
      clock: this.waveState === 'fighting' || this.waveState === 'intro' ? { left: this.clockLeft, par: parTime(this.wave) } : null,
    });
  }
}

function statsOf(s: DoodleSprite): DoodleStats {
  return doodleStats({ coverage: s.coverage, aspect: s.aspect, headShare: s.headShare });
}
