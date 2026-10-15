import * as THREE from 'three';
import { DoodleSprite, maskAt } from '../draw/sprite';
import { INK_BLUE, INK_DARK, INK_RED, doodleMaterial, shadowTex, spriteMaterial } from '../render/ink';
import { Box, pushCircleOut, raycastBoxes } from '../world/collision';
import { Spring } from './juice';
import type { EnemyKind } from './waves';

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  speed: number;
  height: number;
  ink: THREE.Color;
  fireInterval: number;
  burst: number;
  burstGap: number;
  projSpeed: number;
  damage: number;
  spread: number;
  prefDist: number;
  score: number;
  heavy: boolean;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: { kind: 'grunt', hp: 60, speed: 3.2, height: 1.9, ink: INK_BLUE, fireInterval: 2.0, burst: 1, burstGap: 0, projSpeed: 19, damage: 8, spread: 0.06, prefDist: 14, score: 10, heavy: false },
  runner: { kind: 'runner', hp: 35, speed: 6.5, height: 1.45, ink: new THREE.Color('#2f6d4a'), fireInterval: 2.6, burst: 1, burstGap: 0, projSpeed: 17, damage: 6, spread: 0.08, prefDist: 6, score: 15, heavy: false },
  heavy: { kind: 'heavy', hp: 240, speed: 2.0, height: 2.7, ink: INK_DARK, fireInterval: 2.4, burst: 3, burstGap: 0.18, projSpeed: 16, damage: 10, spread: 0.07, prefDist: 12, score: 30, heavy: true },
  elite: { kind: 'elite', hp: 90, speed: 3.8, height: 2.0, ink: INK_RED, fireInterval: 1.3, burst: 2, burstGap: 0.15, projSpeed: 24, damage: 9, spread: 0.04, prefDist: 16, score: 25, heavy: false },
  boss: { kind: 'boss', hp: 1800, speed: 2.3, height: 6.2, ink: new THREE.Color('#7a1d2a'), fireInterval: 1.7, burst: 3, burstGap: 0.3, projSpeed: 15, damage: 12, spread: 0.02, prefDist: 18, score: 500, heavy: true },
};

export interface EnemyContext {
  playerEye: THREE.Vector3;
  boxes: Box[];
  obstacles: Box[];
  bounds: number;
  others: Enemy[];
  fire: (from: THREE.Vector3, dir: THREE.Vector3, e: Enemy) => void;
  onBossPhase: (e: Enemy, phase: number) => void;
}

const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();

export class Enemy {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  readonly pos: THREE.Vector3;
  readonly width: number;
  readonly height: number;
  hp: number;
  maxHp: number;
  alive = true;
  /** Network id (co-op): the host numbers its enemies, everyone else mirrors them. */
  id = 0;
  /** Co-op on a non-host: where the host last said this enemy is. */
  netTarget: THREE.Vector3 | null = null;
  /** Co-op on a non-host: when the host last mentioned it (seconds, game time). */
  netSeen = 0;
  /** Facing angle (rotation.y) of the billboard. */
  facing = 0;
  private reveal = 0;
  private fireTimer: number;
  private burstLeft = 0;
  private burstTimer = 0;
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 0;
  private losTimer = Math.random() * 0.25;
  private hasLOS = false;
  private detourTimer = 0;
  private detourDir = new THREE.Vector3();
  private stuckTime = 0;
  private walkPhase = Math.random() * 10;
  private flash = 0;
  private bossPhase = 0;
  /** Hit squash (+ = wide and short), springs back with a wobble. */
  private squash = new Spring(320, 13);
  /** Knockback slide (m/s) and the little hop that goes with it. */
  private knock = new THREE.Vector3();
  private hopY = 0;
  private hopV = 0;

  /** Movement speed after drawing stats. */
  readonly speed: number;

  constructor(public def: EnemyDef, public sprite: DoodleSprite, at: THREE.Vector3, hpScale = 1, speedMult = 1) {
    this.speed = def.speed * speedMult;
    this.height = def.height;
    this.width = def.height * sprite.aspect;
    this.hp = this.maxHp = def.hp * hpScale;
    this.pos = at.clone();
    this.fireTimer = def.fireInterval * (0.8 + Math.random() * 0.8);

    const geo = new THREE.PlaneGeometry(this.width, this.height);
    geo.translate(0, this.height / 2, 0);
    this.mat = doodleMaterial(sprite.texture, def.ink);
    this.mat.uniforms.reveal.value = 0;
    this.mesh = new THREE.Mesh(geo, this.mat);

    const sw = Math.max(this.width, this.height * 0.45) * 1.1;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.45), spriteMaterial(shadowTex, { opacity: 0.8 }));
    this.shadow.rotation.x = -Math.PI / 2;
  }

  get radius(): number {
    return Math.max(0.35, this.width * 0.3);
  }

  get ready(): boolean {
    return this.reveal >= 1;
  }

  get center(): THREE.Vector3 {
    return tmpV.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  update(dt: number, ctx: EnemyContext): void {
    if (!this.alive) return;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.uniforms.flash.value = this.flash;
    this.updateReaction(dt, ctx);

    const eye = ctx.playerEye;
    const toX = eye.x - this.pos.x;
    const toZ = eye.z - this.pos.z;
    const dist = Math.hypot(toX, toZ) || 0.001;
    this.facing = Math.atan2(toX, toZ);

    if (this.reveal < 1) {
      this.reveal = Math.min(1, this.reveal + dt / (this.def.kind === 'boss' ? 1.6 : 0.7));
      this.mat.uniforms.reveal.value = this.reveal;
      this.place(0);
      return;
    }

    // Line of sight, re-checked a few times per second.
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.25;
      const from = this.center.clone();
      tmpD.subVectors(eye, from);
      const len = tmpD.length();
      tmpD.divideScalar(len);
      const hit = raycastBoxes(ctx.boxes, from, tmpD, len);
      this.hasLOS = !hit;
    }

    // Movement intent.
    const fx = toX / dist;
    const fz = toZ / dist;
    let mx = 0;
    let mz = 0;
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.4 + Math.random() * 1.8;
      if (Math.random() < 0.6) this.strafeDir *= -1;
    }
    const pref = this.def.prefDist;
    if (this.detourTimer > 0) {
      this.detourTimer -= dt;
      mx = this.detourDir.x;
      mz = this.detourDir.z;
    } else if (!this.hasLOS || dist > pref + 3) {
      mx = fx;
      mz = fz;
    } else if (dist < pref - 4) {
      mx = -fx * 0.8 + -fz * this.strafeDir * 0.4;
      mz = -fz * 0.8 + fx * this.strafeDir * 0.4;
    } else {
      mx = -fz * this.strafeDir * 0.7;
      mz = fx * this.strafeDir * 0.7;
    }

    // Separation from other enemies.
    for (const o of ctx.others) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const r = this.radius + o.radius + 0.6;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        mx += (dx / d) * (1 - d / r) * 1.5;
        mz += (dz / d) * (1 - d / r) * 1.5;
      }
    }

    const ml = Math.hypot(mx, mz);
    let moving = false;
    if (ml > 0.01) {
      const sp = this.speed * Math.min(1, ml);
      const px = this.pos.x;
      const pz = this.pos.z;
      this.pos.x += (mx / ml) * sp * dt;
      this.pos.z += (mz / ml) * sp * dt;
      pushCircleOut(this.pos, this.radius, ctx.obstacles);
      const b = ctx.bounds - 0.6;
      this.pos.x = Math.max(-b, Math.min(b, this.pos.x));
      this.pos.z = Math.max(-b, Math.min(b, this.pos.z));
      const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
      moving = moved > sp * dt * 0.2;
      if (moved < sp * dt * 0.3) this.stuckTime += dt;
      else this.stuckTime = Math.max(0, this.stuckTime - dt);
      if (this.stuckTime > 0.5 && this.detourTimer <= 0) {
        // Slide around whatever is blocking: go sideways for a moment.
        const side = Math.random() < 0.5 ? -1 : 1;
        this.detourDir.set(-fz * side + fx * 0.2, 0, fx * side + fz * 0.2).normalize();
        this.detourTimer = 1.0 + Math.random();
        this.stuckTime = 0;
      }
    }
    if (moving) this.walkPhase += dt * this.speed * 2.2;

    // Shooting.
    this.fireTimer -= dt;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.shoot(ctx);
        this.burstLeft--;
        this.burstTimer = this.def.burstGap;
      }
    } else if (this.fireTimer <= 0) {
      if (this.hasLOS && dist < 48) {
        this.burstLeft = this.def.burst;
        this.burstTimer = 0;
        this.fireTimer = this.def.fireInterval * (0.8 + Math.random() * 0.5);
      } else {
        this.fireTimer = 0.3;
      }
    }

    // Boss minion phases at 66% / 33%.
    if (this.def.kind === 'boss') {
      const phase = this.hp < this.maxHp * 0.33 ? 2 : this.hp < this.maxHp * 0.66 ? 1 : 0;
      if (phase > this.bossPhase) {
        this.bossPhase = phase;
        ctx.onBossPhase(this, phase);
      }
    }

    // Wind-up tell: jitter just before a burst.
    const tell = this.burstLeft === 0 && this.fireTimer < 0.35 && this.hasLOS ? 1 : 0;
    this.place(tell);
  }

  /**
   * Co-op mirror of the host's enemy: no AI, just glide to where the host
   * says it is (`netTarget`) and keep the reveal, flash and squash going.
   */
  ghostStep(dt: number): void {
    if (!this.alive) return;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.uniforms.flash.value = this.flash;
    this.squash.step(dt);
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 22 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) this.hopY = this.hopV = 0;
    }
    if (this.reveal < 1) {
      this.reveal = Math.min(1, this.reveal + dt / (this.def.kind === 'boss' ? 1.6 : 0.7));
      this.mat.uniforms.reveal.value = this.reveal;
    }
    const t = this.netTarget;
    if (t) {
      const px = this.pos.x;
      const pz = this.pos.z;
      if (this.pos.distanceTo(t) > 6) this.pos.copy(t);
      else this.pos.lerp(t, 1 - Math.exp(-dt * 12));
      this.walkPhase += Math.hypot(this.pos.x - px, this.pos.z - pz) * 2.2;
    }
    this.place(0);
  }

  /** Turn the billboard toward this screen's camera (co-op: enemies may be chasing someone else). */
  faceCamera(cam: THREE.Vector3): void {
    this.facing = Math.atan2(cam.x - this.pos.x, cam.z - this.pos.z);
    this.mesh.rotation.y = this.facing;
  }

  /** White hit flash without taking damage (co-op: the host decides the damage). */
  flashHit(): void {
    this.flash = 1;
  }

  /** How much hits move this one (heavies and the boss barely budge). */
  private get resist(): number {
    return this.def.kind === 'boss' ? 0.12 : this.def.heavy ? 0.4 : 1;
  }

  /**
   * Cartoon hit reaction (visual + a small shove): squash, knockback along
   * the shot and a hop. `push` is the gun's knockback speed.
   */
  react(dir: THREE.Vector3, push: number): void {
    const r = this.resist;
    this.squash.impulse(4 + push * 1.2 * Math.max(0.35, r));
    // Mirrors only wobble: the host moves the real one.
    if (this.netTarget) return;
    const len = Math.hypot(dir.x, dir.z) || 1;
    this.knock.x += (dir.x / len) * push * r;
    this.knock.z += (dir.z / len) * push * r;
    // Clamp so a minigun stream can't fling anyone across the map.
    const k = Math.hypot(this.knock.x, this.knock.z);
    if (k > 9) this.knock.multiplyScalar(9 / k);
    if (this.hopY <= 0.001) this.hopV = Math.min(3.2, 0.6 + push * 0.35) * r;
  }

  private updateReaction(dt: number, ctx: EnemyContext): void {
    this.squash.step(dt);
    if (this.knock.x !== 0 || this.knock.z !== 0) {
      this.pos.x += this.knock.x * dt;
      this.pos.z += this.knock.z * dt;
      pushCircleOut(this.pos, this.radius, ctx.obstacles);
      const b = ctx.bounds - 0.6;
      this.pos.x = Math.max(-b, Math.min(b, this.pos.x));
      this.pos.z = Math.max(-b, Math.min(b, this.pos.z));
      this.knock.multiplyScalar(Math.exp(-dt * 9));
      if (this.knock.lengthSq() < 0.0004) this.knock.set(0, 0, 0);
    }
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 22 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) this.hopY = this.hopV = 0;
    }
  }

  private place(tell: number): void {
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.08 * this.height + this.hopY;
    const tilt = Math.sin(this.walkPhase) * 0.07 + Math.max(-0.25, Math.min(0.25, this.knock.x * 0.02));
    const jitter = tell ? (Math.random() - 0.5) * 0.06 : 0;
    const sq = Math.max(-0.4, Math.min(0.5, this.squash.x * 0.09));
    this.mesh.scale.set(1 + sq, 1 - sq * 0.8, 1);
    this.mesh.position.set(this.pos.x + jitter, this.pos.y + bob, this.pos.z);
    this.mesh.rotation.set(0, this.facing, tilt);
    this.shadow.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
  }

  private shoot(ctx: EnemyContext): void {
    const from = this.center.clone();
    from.y = this.pos.y + this.height * 0.6;
    const target = ctx.playerEye.clone();
    target.y -= 0.35;
    const dir = target.sub(from).normalize();
    // Step the muzzle out of the sprite toward the player.
    from.addScaledVector(dir, 0.4 + this.width * 0.15);
    if (this.def.kind === 'boss') {
      for (let i = -2; i <= 2; i++) {
        const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.12);
        ctx.fire(from, d, this);
      }
      return;
    }
    const s = this.def.spread;
    dir.x += (Math.random() - 0.5) * 2 * s;
    dir.y += (Math.random() - 0.5) * s;
    dir.z += (Math.random() - 0.5) * 2 * s;
    ctx.fire(from, dir.normalize(), this);
  }

  /** Billboard ray test against the drawing's alpha mask. */
  rayHit(o: THREE.Vector3, d: THREE.Vector3): { t: number; headshot: boolean } | null {
    if (!this.alive || this.reveal < 0.3) return null;
    const nx = Math.sin(this.facing);
    const nz = Math.cos(this.facing);
    const denom = d.x * nx + d.z * nz;
    if (Math.abs(denom) < 1e-5) return null;
    const t = ((this.pos.x - o.x) * nx + (this.pos.z - o.z) * nz) / denom;
    if (t <= 0) return null;
    const hx = o.x + d.x * t;
    const hy = o.y + d.y * t;
    const hz = o.z + d.z * t;
    // Plane right vector for rotation.y = facing is (cos, 0, -sin).
    const lx = (hx - this.pos.x) * Math.cos(this.facing) - (hz - this.pos.z) * Math.sin(this.facing);
    const u = lx / this.width + 0.5;
    const v = (hy - this.mesh.position.y) / this.height;
    if (!maskAt(this.sprite, u, v)) return null;
    return { t, headshot: v > 0.75 };
  }

  damage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 1;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}
