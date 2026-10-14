import * as THREE from 'three';
import type { DoodleSprite } from '../draw/sprite';
import { cloudTex, markerTex, sunTex } from '../render/ink';
import { buildLevel, Level, styleMaterial } from '../world/level';
import { raycastBoxes } from '../world/collision';
import type { Hud } from '../ui/hud';
import type { Sfx } from './audio';
import { GameClock } from './clock';
import { ENEMY_DEFS, Enemy, EnemyContext } from './enemy';
import { FX } from './fx';
import type { Input } from './input';
import { Player } from './player';
import { Projectiles } from './projectiles';
import { TimeMeter } from './timeMeter';
import { ViewModel } from './viewmodel';
import { EnemyKind, isBossWave, maxAlive, spawnQueue } from './waves';
import { HEADSHOT_MULT, WEAPONS, WeaponState, damageAt } from './weapons';

interface Pickup {
  kind: 'ammo' | 'health';
  box: THREE.Mesh;
  marker: THREE.Sprite;
  pos: THREE.Vector3;
  life: number;
  t: number;
}

type WaveState = 'intro' | 'fighting' | 'break';

const BASE_FOV = 75;
const ERASER_PINK = new THREE.Color('#ee7fae');
/** Mouse sensitivity at 1.0x on the slider. */
export const BASE_SENSITIVITY = 0.0022;
const ZOOM_FOV = 22;

export class Game {
  readonly world = new THREE.Scene();
  readonly overlay = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 600);
  readonly level: Level;
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
  private sprite: DoodleSprite | null = null;

  wave = 0;
  score = 0;
  kills = 0;
  dead = false;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveState: WaveState = 'intro';
  private stateTimer = 0;
  private damageFlash = 0;
  private zoomed = false;
  private fireBuffer = 0;
  private wasSlow = false;
  private deathT = 0;
  private idleT = 0;
  onDeath: () => void = () => {};

  constructor(private hud: Hud, private sfx: Sfx, private input: Input) {
    this.level = buildLevel();
    this.world.add(this.level.scene);
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

  start(sprite: DoodleSprite): void {
    this.sprite = sprite;
    for (const e of this.enemies) this.removeEnemy(e);
    this.enemies = [];
    for (const p of this.pickups) this.removePickup(p);
    this.pickups = [];
    this.projectiles.clear();
    this.fx.clear();
    this.weapons = WEAPONS.map((d) => new WeaponState(d));
    this.switchWeapon(0, true);
    this.player.spawn(this.level.playerSpawn);
    this.meter.reset();
    this.clock.timeScale = 1;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.dead = false;
    this.deathT = 0;
    this.damageFlash = 0;
    this.zoomed = false;
    this.viewmodel.root.visible = true;
    this.nextWave();
    this.hud.hint('WASD move · SPACE jump · hold SHIFT to slow time · 1-5 swap · 5 = eraser sword · R reload', 6);
  }

  /** Spin the camera over the level behind the menu. */
  idle(realDt: number): void {
    this.idleT += realDt * 0.06;
    const r = 30;
    this.camera.position.set(Math.sin(this.idleT) * r, 9, Math.cos(this.idleT) * r);
    this.camera.lookAt(0, 4, -8);
    this.viewmodel.root.visible = false;
  }

  get postParams() {
    return { slowmo: this.clock.slowAmount, damage: this.damageFlash };
  }

  // ── Main update ──────────────────────────────────────────────────────
  update(realDt: number): void {
    if (this.dead) {
      this.updateDeath(realDt);
      return;
    }
    const input = this.input;
    const wantSlow = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const slow = this.meter.update(realDt, wantSlow);
    if (slow && !this.wasSlow) this.sfx.slowIn();
    if (!slow && this.wasSlow) this.sfx.slowOut();
    this.wasSlow = slow;
    this.clock.update(realDt, slow);
    this.sfx.setSlowmo(this.clock.slowAmount);

    const wDt = this.clock.worldDt(realDt);
    const pDt = this.clock.playerDt(realDt);

    this.player.look(input, this.zoomed ? 0.35 : 1);
    this.player.update(pDt, input, this.level.boxes);
    this.player.applyCamera(this.camera);
    this.camera.updateMatrixWorld(true);

    this.updateWeapons(pDt);

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
        this.sfx.enemyShot();
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
    );
    if (dmg > 0) {
      this.player.hp -= dmg;
      this.damageFlash = 1;
      this.sfx.hurt();
      if (this.player.hp <= 0) this.die();
    }
    this.damageFlash = Math.max(0, this.damageFlash - realDt * 1.8);

    this.updatePickups(wDt, realDt);
    this.updateWaves(wDt);
    this.fx.update(wDt, realDt);

    // Zoom FOV.
    const fov = this.zoomed ? ZOOM_FOV : BASE_FOV;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-realDt * 20));
      this.camera.updateProjectionMatrix();
    }
    const w = this.weapon;
    this.viewmodel.update(pDt, this.player.grounded ? this.player.speed : 0, w.reloading > 0 ? 1 - w.reloading / w.def.reload : 0, this.zoomed);
    this.pushHud();
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
    const wasReloading = w.reloading > 0;
    w.update(dt);
    if (input.pressed.has('KeyR') && w.startReload()) this.sfx.reload();
    this.zoomed = w.def.id === 'sniper' && input.rightDown && w.reloading <= 0;

    if (input.mouseClicked) this.fireBuffer = 0.15;
    else this.fireBuffer = Math.max(0, this.fireBuffer - dt);
    const want = w.def.auto ? input.mouseDown : this.fireBuffer > 0;
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
    if (wasReloading && w.reloading <= 0) this.zoomed = false;
  }

  private shoot(): void {
    const def = this.weapon.def;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const muzzle = this.viewmodel.muzzleWorld(new THREE.Vector3());

    let spread = this.zoomed ? 0.0004 : def.spread;
    if (!this.player.grounded) spread *= 1.6;

    const hits = new Map<Enemy, { dmg: number; head: boolean; dir: THREE.Vector3 }>();
    for (let p = 0; p < def.pellets; p++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

      const wh = raycastBoxes(this.level.boxes, origin, dir, 250);
      let best: { e: Enemy; t: number; head: boolean } | null = null;
      for (const e of this.enemies) {
        const h = e.rayHit(origin, dir);
        if (h && (!wh || h.t < wh.t) && (!best || h.t < best.t)) best = { e, t: h.t, head: h.headshot };
      }
      const endT = best ? best.t : wh ? wh.t : 120;
      const end = origin.clone().addScaledVector(dir, endT);
      if (best) {
        const mult = (best.head ? HEADSHOT_MULT : 1) * (best.e.def.heavy ? def.heavyMult : 1);
        const prev = hits.get(best.e);
        const dmg = damageAt(def, best.t) * mult;
        if (prev) {
          prev.dmg += dmg;
          prev.head ||= best.head;
        } else hits.set(best.e, { dmg, head: best.head, dir });
        this.fx.spray(end, dir, best.e.def.ink, def.pellets > 1 ? 2 : 5);
      } else if (wh) {
        this.fx.splat(end, wh.box, def.id === 'sniper' ? 0.5 : 0.28);
      }
      if (p < 4) this.fx.tracer(muzzle.clone().addScaledVector(dir, 0.15), end);
    }

    for (const [e, h] of hits) {
      const killed = e.damage(h.dmg);
      if (killed) this.onKill(e, h.head, h.dir);
      else if (h.head) this.sfx.headshot();
      else this.sfx.hit();
      this.hud.hitmarker(h.head, killed);
    }

    this.fx.flash(muzzle, def.id === 'shotgun' ? 0.5 : def.id === 'sniper' ? 0.55 : 0.32);
    this.viewmodel.fire(def.recoil * 12);
    this.player.recoil = Math.min(0.2, this.player.recoil + def.recoil);
    this.sfx.shot(def.id);
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
    for (const e of [...this.enemies]) {
      if (!e.ready || !e.alive) continue;
      const dx = e.pos.x - eye.x;
      const dz = e.pos.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > m.range) continue;
      if (eye.y < e.pos.y - 0.5 || eye.y > e.pos.y + e.height + 1.5) continue;
      const cos = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      if (d > 0.8 && cos < Math.cos(m.arc)) continue;
      const to = new THREE.Vector3(e.pos.x, Math.min(eye.y, e.pos.y + e.height * 0.6), e.pos.z);
      const dir = to.clone().sub(eye);
      const len = dir.length();
      dir.divideScalar(len || 1);
      if (raycastBoxes(this.level.boxes, eye, dir, Math.max(0, len - e.radius))) continue;
      this.fx.spray(to, dir, ERASER_PINK, 6, 0.06);
      const killed = e.damage(def.damage * (e.def.heavy ? def.heavyMult : 1));
      if (killed) this.onKill(e, false, dir, true);
      else this.sfx.hit();
      this.hud.hitmarker(false, killed);
    }
  }

  private onKill(e: Enemy, head: boolean, dir: THREE.Vector3, erased = false): void {
    this.kills++;
    this.score += Math.round(e.def.score * (head ? 1.5 : 1));
    this.meter.onKill(head);
    if (erased) this.fx.erase(e, ERASER_PINK);
    else this.fx.shatter(e, dir.clone().multiplyScalar(e.def.kind === 'boss' ? 2 : 5));
    this.sfx.kill();
    this.removeEnemy(e);
    this.enemies = this.enemies.filter((x) => x !== e);
    if (e.def.kind === 'boss') {
      this.hud.banner('THE DOODLER IS ERASED', 2.5);
      this.dropPickup('health', e.pos);
      this.dropPickup('ammo', e.pos.clone().add(new THREE.Vector3(1.5, 0, 0)));
    } else if (Math.random() < 0.3) {
      this.dropPickup(Math.random() < 0.65 ? 'ammo' : 'health', e.pos);
    }
  }

  // ── Waves ─────────────────────────────────────────────────────────────
  private nextWave(): void {
    this.wave++;
    this.queue = spawnQueue(this.wave);
    this.waveState = 'intro';
    this.stateTimer = 2.2;
    this.spawnTimer = 0;
    this.hud.banner(isBossWave(this.wave) ? `WAVE ${this.wave} — THE DOODLER` : `WAVE ${this.wave}`);
    this.sfx.wave();
  }

  private updateWaves(dt: number): void {
    if (this.waveState === 'intro') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.waveState = 'fighting';
      return;
    }
    if (this.waveState === 'break') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.nextWave();
      return;
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.enemies.length < maxAlive(this.wave)) {
      this.spawnEnemy(this.queue.shift()!);
      this.spawnTimer = 0.9;
    }
    if (!this.queue.length && !this.enemies.length) {
      this.waveState = 'break';
      this.stateTimer = 4;
      const bonus = 50 * this.wave;
      this.score += bonus;
      this.hud.banner(`WAVE CLEARED  +${bonus}`);
    }
  }

  private spawnEnemy(kind: EnemyKind, at?: THREE.Vector3): void {
    if (!this.sprite) return;
    let pos = at;
    if (!pos) {
      const pp = this.player.pos;
      const far = this.level.spawnPoints.filter((s) => Math.hypot(s.x - pp.x, s.z - pp.z) > 18);
      const pool = far.length ? far : this.level.spawnPoints;
      pos = pool[Math.floor(Math.random() * pool.length)].clone();
      pos.x += (Math.random() - 0.5) * 3;
      pos.z += (Math.random() - 0.5) * 3;
    }
    if (kind === 'boss') pos = new THREE.Vector3(34, 0, 8);
    const hpScale = kind === 'boss' ? 1 + (this.wave / 5 - 1) * 0.5 : 1 + (this.wave - 1) * 0.06;
    const e = new Enemy(ENEMY_DEFS[kind], this.sprite, pos, hpScale);
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
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), styleMaterial(kind === 'ammo' ? 'brick' : 'tone'));
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
    this.damageFlash = 1 - k * 0.5;
    if (this.deathT >= 1.6 && this.deathT - realDt < 1.6) this.onDeath();
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
    });
  }
}
