import * as THREE from 'three';
import type { Box } from '../world/collision';
import { FlashStyle, doodleMaterial, dropTex, flashTex, paintTexes, puffTex, scribbleTexes, shellTex, sparkTex, splatTex, spriteMaterial, starTex } from '../render/ink';
import type { Enemy } from './enemy';
import type { WeaponId } from './weapons';

/** Anything drawn as a doodle billboard that can tear apart (enemies, versus players). */
export type Doodled = Pick<Enemy, 'width' | 'height' | 'facing' | 'pos' | 'sprite' | 'mesh'> & { def: { kind: string; ink: THREE.Color } };

/** Copy of what a death effect needs, so it survives the doodle being removed or respawning. */
export function snapshot(e: Doodled): Doodled {
  return { width: e.width, height: e.height, facing: e.facing, pos: e.pos.clone(), sprite: e.sprite, mesh: e.mesh, def: e.def };
}

/** Muzzle flash look and size per gun. */
const MUZZLE: Record<WeaponId, { style: FlashStyle; size: number; puffs: number }> = {
  pistol: { style: 'pop', size: 0.3, puffs: 1 },
  rifle: { style: 'star', size: 0.36, puffs: 0.5 },
  minigun: { style: 'star', size: 0.32, puffs: 0.3 },
  shotgun: { style: 'bang', size: 0.6, puffs: 4 },
  sniper: { style: 'ring', size: 0.62, puffs: 3 },
  railgun: { style: 'zap', size: 0.85, puffs: 3 },
  eraser: { style: 'pop', size: 0, puffs: 0 },
};
/** Pooled sprites alive at once; cosmetic effects are skipped past this. */
const MAX_SPRITES = 320;
const WHITE = new THREE.Color('#ffffff');
const SPARK_YELLOW = new THREE.Color('#ffe14d');
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  fade: (k: number) => void;
  dispose: () => void;
  realTime: boolean;
  /** Ground height to bounce on (default 0.05). */
  floor?: number;
  /** Velocity lost per second (smoke, confetti). */
  drag?: number;
  /** Called (and the particle removed) when it falls to `floor`. */
  onLand?: () => void;
  /** Called when its life runs out. */
  onExpire?: () => void;
}

const tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
tracerGeo.translate(0, 0, -0.5);

/** Overlay effects: paper shards, ink splats, tracers, muzzle flashes. */
export class FX {
  private parts: Particle[] = [];
  private splatMat = spriteMaterial(splatTex, { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  /** Reused sprites (each with its own material) for the short-lived cartoon effects. */
  private pool: THREE.Sprite[] = [];
  private spritesLive = 0;
  private muzzleTexes = new Map<WeaponId, THREE.Texture[]>();

  constructor(private scene: THREE.Scene) {}

  private add(p: Particle): void {
    this.scene.add(p.obj);
    this.parts.push(p);
  }

  /** A sprite from the pool, or null when too many effects are alive. */
  private takeSprite(map: THREE.Texture, color: THREE.Color = WHITE, opacity = 1, depthTest = true): THREE.Sprite | null {
    if (this.spritesLive >= MAX_SPRITES) return null;
    // Created with a map so swapping textures later never needs a shader recompile.
    const s = this.pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
    const m = s.material;
    m.map = map;
    m.color.copy(color);
    m.opacity = opacity;
    m.depthTest = depthTest;
    m.rotation = 0;
    s.scale.set(1, 1, 1);
    s.renderOrder = depthTest ? 0 : 10;
    this.spritesLive++;
    return s;
  }

  private giveBack(s: THREE.Sprite): void {
    this.spritesLive--;
    this.pool.push(s);
  }

  /** Add a pooled sprite particle that fades out by opacity. */
  private addSprite(s: THREE.Sprite, vel: THREE.Vector3, life: number, opts: Partial<Particle> = {}): void {
    const m = s.material;
    const o = m.opacity;
    this.add({
      obj: s,
      vel,
      spin: new THREE.Vector3(),
      life,
      maxLife: life,
      gravity: 0,
      fade: (k) => (m.opacity = o * Math.min(1, k * 3)),
      dispose: () => this.giveBack(s),
      realTime: false,
      ...opts,
    });
  }

  /**
   * Tear an enemy's drawing into tumbling paper shards. `vMax` < 1 leaves out
   * the top of the drawing (the head already popped off).
   */
  shatter(e: Doodled, impulse: THREE.Vector3, vMax = 1): void {
    const cols = e.def.kind === 'boss' ? 5 : 3;
    const rows = Math.max(1, Math.round((e.def.kind === 'boss' ? 6 : 4) * vMax));
    const cw = e.width / cols;
    const ch = (e.height * vMax) / rows;
    const right = new THREE.Vector3(Math.cos(e.facing), 0, -Math.sin(e.facing));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mat = doodleMaterial(e.sprite.texture, e.def.ink);
        mat.uniforms.uvOffset.value.set(c / cols, (r / rows) * vMax);
        mat.uniforms.uvScale.value.set(1 / cols, vMax / rows);
        mat.transparent = true;
        const geo = new THREE.PlaneGeometry(cw, ch);
        const m = new THREE.Mesh(geo, mat);
        const lx = (c + 0.5) * cw - e.width / 2;
        m.position.set(e.pos.x, e.pos.y + (r + 0.5) * ch, e.pos.z).addScaledVector(right, lx);
        m.rotation.set(0, e.facing, 0);
        const vel = new THREE.Vector3(
          right.x * lx * 3 + (Math.random() - 0.5) * 3,
          2 + Math.random() * 4 + r * 0.4,
          right.z * lx * 3 + (Math.random() - 0.5) * 3,
        ).addScaledVector(impulse, 0.6 + Math.random() * 0.6);
        this.add({
          obj: m,
          vel,
          spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
          life: 1.8,
          maxLife: 1.8,
          gravity: 12,
          fade: (k) => (mat.uniforms.opacity.value = Math.min(1, k * 3)),
          dispose: () => {
            geo.dispose();
            mat.dispose();
          },
          realTime: false,
        });
      }
    }
  }

  /** Rub an enemy out top-down, shedding eraser crumbs. */
  erase(e: Doodled, crumb: THREE.Color): void {
    const mat = doodleMaterial(e.sprite.texture, e.def.ink);
    const geo = e.mesh.geometry.clone();
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(e.mesh.position);
    m.rotation.copy(e.mesh.rotation);
    this.add({
      obj: m,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0.55,
      maxLife: 0.55,
      gravity: 0,
      fade: (k) => (mat.uniforms.reveal.value = k),
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
      realTime: false,
    });
    for (let i = 0; i < 6; i++) {
      const p = e.pos.clone();
      p.y += e.height * (1 - i / 6);
      const d = new THREE.Vector3(Math.random() - 0.5, -0.3, Math.random() - 0.5).normalize();
      this.spray(p, d, crumb, 3, 0.06);
    }
  }

  /** Ink splat stuck to a wall, oriented to the face that was hit. */
  splat(p: THREE.Vector3, box: Box, size = 0.35): void {
    const n = faceNormal(p, box);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.splatMat.clone());
    m.position.copy(p).addScaledVector(n, 0.02);
    m.lookAt(m.position.clone().add(n));
    m.rotateZ(Math.random() * Math.PI * 2);
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add({
      obj: m,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 8,
      maxLife: 8,
      gravity: 0,
      fade: (k) => (mat.opacity = Math.min(1, k * 4)),
      dispose: () => {
        m.geometry.dispose();
        mat.dispose();
      },
      realTime: false,
    });
  }

  // ── Paint: persistent splats on walls and floors ────────────────────
  private paintGeo = new THREE.PlaneGeometry(1, 1);
  private paintMats = new Map<string, THREE.MeshBasicMaterial>();
  private paints: THREE.Mesh[] = [];
  private static readonly MAX_PAINT = 400;

  /** Splash paint on the face of `box` at `p`. Stays until clear(). */
  paint(p: THREE.Vector3, box: Box, color: THREE.Color, size = 0.6): void {
    const n = faceNormal(p, box);
    const tex = Math.floor(Math.random() * paintTexes.length);
    const key = `${color.getHexString()}|${tex}`;
    let mat = this.paintMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map: paintTexes[tex], color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      this.paintMats.set(key, mat);
    }
    const m = new THREE.Mesh(this.paintGeo, mat);
    const s = size * (0.7 + Math.random() * 0.6);
    m.scale.set(s, s, 1);
    // Small offset, staggered so overlapping splats don't flicker.
    m.position.copy(p).addScaledVector(n, 0.012 + (this.paints.length % 7) * 0.002);
    m.lookAt(m.position.clone().add(n));
    // On walls, keep drips pointing down; on floors any rotation.
    if (Math.abs(n.y) < 0.5) m.rotateZ((Math.random() - 0.5) * 0.5);
    else m.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(m);
    this.paints.push(m);
    if (this.paints.length > FX.MAX_PAINT) this.scene.remove(this.paints.shift()!);
  }

  clearPaint(): void {
    for (const m of this.paints) this.scene.remove(m);
    this.paints = [];
  }

  /** Thick glowing beam (railgun). */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
    const m = new THREE.Mesh(tracerGeo, mat);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(9, 9, from.distanceTo(to));
    this.add({
      obj: m,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0.45,
      maxLife: 0.45,
      gravity: 0,
      fade: (k) => {
        mat.opacity = k;
        m.scale.x = m.scale.y = 2 + 7 * k;
      },
      dispose: () => mat.dispose(),
      realTime: true,
    });
  }

  /** Little ink drops flying off a hit enemy. */
  spray(p: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, count = 5, size = 0.12): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: dropTex, color, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(size * (1 + Math.random()));
      s.position.copy(p);
      const v = dir.clone().multiplyScalar(-2 - Math.random() * 2);
      v.x += (Math.random() - 0.5) * 4;
      v.y += Math.random() * 3;
      v.z += (Math.random() - 0.5) * 4;
      this.add({
        obj: s,
        vel: v,
        spin: new THREE.Vector3(),
        life: 0.6,
        maxLife: 0.6,
        gravity: 14,
        fade: (k) => (mat.opacity = Math.min(1, k * 3)),
        dispose: () => mat.dispose(),
        realTime: false,
      });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({ color: '#2a2e85', transparent: true, opacity: 0.9, depthWrite: false });
    const m = new THREE.Mesh(tracerGeo, mat);
    const len = from.distanceTo(to);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, len);
    this.add({
      obj: m,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0.12,
      maxLife: 0.12,
      gravity: 0,
      fade: (k) => (mat.opacity = 0.9 * k),
      dispose: () => mat.dispose(),
      realTime: false,
    });
  }

  /** Orange starburst. Real-time so it doesn't hang around in slow-mo. */
  flash(p: THREE.Vector3, size: number, realTime = true): void {
    const s = this.takeSprite(starTex, WHITE, 1, false);
    if (!s) return;
    s.material.rotation = Math.random() * Math.PI;
    s.scale.setScalar(size);
    s.position.copy(p);
    this.addSprite(s, new THREE.Vector3(), 0.06, { realTime, fade: () => {} });
  }

  private muzzleTex(id: WeaponId, hues: number[]): THREE.Texture {
    let list = this.muzzleTexes.get(id);
    if (!list) {
      // Drawn on first use so the comic font has loaded for the shotgun's "BANG".
      list = [0, 1, 2].map((i) => flashTex(MUZZLE[id].style, i === 2 ? [...hues].reverse() : hues));
      this.muzzleTexes.set(id, list);
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Cartoon muzzle flash in the gun's own colors (alive 2-3 frames, random
   * spin) plus a few ink smoke puffs drifting off the barrel.
   */
  muzzle(id: WeaponId, hues: number[], p: THREE.Vector3, dir: THREE.Vector3, scale = 1): void {
    const look = MUZZLE[id];
    if (!look.size) return;
    const s = this.takeSprite(this.muzzleTex(id, hues), WHITE, 1, false);
    if (s) {
      s.material.rotation = Math.random() * Math.PI * 2;
      s.scale.setScalar(look.size * scale * rnd(0.85, 1.15));
      s.position.copy(p).addScaledVector(dir, look.size * 0.25);
      this.addSprite(s, new THREE.Vector3(), 0.045, { realTime: true, fade: () => {} });
    }
    let puffs = look.puffs;
    while (puffs > 0) {
      if (puffs < 1 && Math.random() > puffs) break;
      puffs--;
      const q = this.takeSprite(puffTex, WHITE, 0.85);
      if (!q) break;
      const base = rnd(0.06, 0.1) * Math.max(1, look.size * 2);
      q.material.rotation = Math.random() * Math.PI * 2;
      q.position.copy(p).addScaledVector(dir, rnd(0.05, 0.2));
      const vel = dir.clone().multiplyScalar(rnd(0.4, 1.3));
      vel.x += rnd(-0.25, 0.25);
      vel.y += rnd(0.3, 0.7);
      vel.z += rnd(-0.25, 0.25);
      const life = rnd(0.45, 0.75);
      const m = q.material;
      this.addSprite(q, vel, life, {
        drag: 2.5,
        spin: new THREE.Vector3(0, 0, rnd(-2, 2)),
        fade: (k) => {
          m.opacity = 0.85 * Math.min(1, k * 2);
          q.scale.setScalar(base * (1 + (1 - k) * 1.6));
        },
      });
    }
  }

  /** Little drawn stars plus paint flecks where a shot lands on a doodle. */
  sparks(p: THREE.Vector3, dir: THREE.Vector3, paint: THREE.Color, count = 3): void {
    for (let i = 0; i < count; i++) {
      const s = this.takeSprite(sparkTex, i % 2 ? WHITE : SPARK_YELLOW);
      if (!s) return;
      s.scale.setScalar(rnd(0.07, 0.13));
      s.position.copy(p);
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2.5, 4.5)).addScaledVector(dir, -1.5);
      this.addSprite(s, v, rnd(0.15, 0.24), { gravity: 6, drag: 3, spin: new THREE.Vector3(0, 0, rnd(-12, 12)) });
      const f = this.takeSprite(dropTex, paint);
      if (!f) return;
      f.scale.setScalar(rnd(0.035, 0.07));
      f.position.copy(p);
      const fv = new THREE.Vector3(rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1)).multiplyScalar(rnd(1.5, 3.5)).addScaledVector(dir, -1);
      this.addSprite(f, fv, rnd(0.3, 0.45), { gravity: 14 });
    }
  }

  /** Ink-scribble confetti bursting out of a popped doodle. */
  confetti(p: THREE.Vector3, colors: THREE.Color[], count = 10): void {
    for (let i = 0; i < count; i++) {
      const s = this.takeSprite(scribbleTexes[i % scribbleTexes.length], colors[i % colors.length]);
      if (!s) return;
      s.scale.setScalar(rnd(0.16, 0.28));
      s.material.rotation = Math.random() * Math.PI * 2;
      s.position.copy(p);
      const v = new THREE.Vector3(rnd(-3, 3), rnd(2.5, 6), rnd(-3, 3));
      this.addSprite(s, v, rnd(0.7, 1.0), { gravity: 9, drag: 1.4, spin: new THREE.Vector3(0, 0, rnd(-10, 10)) });
    }
  }

  /** Paper shell casing that pops out of the gun and bounces on the floor. */
  shell(p: THREE.Vector3, vel: THREE.Vector3, tint: THREE.Color, floor: number): void {
    const s = this.takeSprite(shellTex, tint);
    if (!s) return;
    s.scale.set(0.035, 0.07, 1);
    s.position.copy(p);
    this.addSprite(s, vel, 1.1, { gravity: 13, floor: floor + 0.03, spin: new THREE.Vector3(0, 0, rnd(-18, 18)) });
  }

  /** A doodle-shaped plane (whole drawing or a horizontal band of it) for death effects. */
  private doodlePiece(e: Doodled, v0: number, v1: number): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; geo: THREE.PlaneGeometry } {
    const mat = doodleMaterial(e.sprite.texture, e.def.ink);
    mat.uniforms.uvOffset.value.set(0, v0);
    mat.uniforms.uvScale.value.set(1, v1 - v0);
    mat.transparent = true;
    const geo = new THREE.PlaneGeometry(e.width, e.height * (v1 - v0));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(e.pos.x, e.pos.y + e.height * (v0 + v1) * 0.5, e.pos.z);
    mesh.rotation.set(0, e.facing, 0);
    return { mesh, mat, geo };
  }

  /** Headshot: the top quarter of the drawing flies up, spinning. */
  headPop(e: Doodled, impulse: THREE.Vector3): void {
    const { mesh, mat, geo } = this.doodlePiece(e, 0.75, 1);
    const vel = new THREE.Vector3(rnd(-1, 1), rnd(6.5, 8.5), rnd(-1, 1)).addScaledVector(impulse, 0.35);
    this.add({
      obj: mesh,
      vel,
      spin: new THREE.Vector3(rnd(-3, 3), rnd(-4, 4), (Math.random() < 0.5 ? -1 : 1) * rnd(10, 16)),
      life: 1.8,
      maxLife: 1.8,
      gravity: 14,
      floor: e.pos.y + 0.1,
      fade: (k) => (mat.uniforms.opacity.value = Math.min(1, k * 3)),
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
      realTime: false,
    });
  }

  /**
   * Normal kill: the doodle swells (flashing white) for a frame, then bursts
   * into shards and scribble confetti. The swell holds during a freeze frame.
   */
  popKill(e: Doodled, impulse: THREE.Vector3, confetti: THREE.Color[], head: boolean): void {
    const { mesh, mat, geo } = this.doodlePiece(e, 0, 1);
    mat.uniforms.flash.value = 1;
    mesh.scale.set(1.3, 1.22, 1);
    const snap = snapshot(e);
    this.add({
      obj: mesh,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0.05,
      maxLife: 0.05,
      gravity: 0,
      fade: () => {},
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
      realTime: false,
      onExpire: () => {
        if (head) {
          this.headPop(snap, impulse);
          this.shatter(snap, impulse, 0.75);
        } else this.shatter(snap, impulse);
        const c = snap.pos.clone();
        c.y += snap.height * 0.6;
        this.confetti(c, confetti, snap.def.kind === 'boss' ? 22 : 10);
      },
    });
  }

  /**
   * Big hit kill (shotgun, railgun, sword): the whole doodle launches
   * spinning and falls, then shatters (or gets rubbed out) where it lands.
   */
  flyingKill(e: Doodled, impulse: THREE.Vector3, confetti: THREE.Color[], erased: boolean, eraserCrumb: THREE.Color): void {
    const { mesh, mat, geo } = this.doodlePiece(e, 0, 1);
    mat.uniforms.flash.value = 1;
    const snap = snapshot(e);
    const ground = snap.pos.y;
    const vel = new THREE.Vector3(impulse.x, 0, impulse.z);
    vel.y = rnd(5, 6.5);
    const land = () => {
      snap.pos.set(mesh.position.x, ground, mesh.position.z);
      if (erased) {
        // Lay it back down upright and rub it out.
        mesh.position.y = ground + snap.height / 2;
        mesh.rotation.set(0, snap.facing, 0);
        this.erase({ ...snap, mesh }, eraserCrumb);
      } else {
        this.shatter(snap, vel.clone().setY(0).multiplyScalar(0.3));
        this.confetti(snap.pos.clone().setY(ground + 0.4), confetti, 8);
      }
      this.dust(snap.pos);
    };
    this.add({
      obj: mesh,
      vel,
      spin: new THREE.Vector3(rnd(-2, 2), rnd(-3, 3), (Math.random() < 0.5 ? -1 : 1) * rnd(7, 11)),
      life: 2.5,
      maxLife: 2.5,
      gravity: 15,
      floor: ground + snap.height * 0.3,
      // White, then yellow, then its own ink within ~0.2s of flight.
      fade: (k) => (mat.uniforms.flash.value = Math.max(0, 1 - ((1 - k) * 2.5) / 0.2)),
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
      realTime: false,
      onLand: land,
      onExpire: land,
    });
  }

  /** Puff ring on the floor where something lands. */
  private dust(p: THREE.Vector3): void {
    for (let i = 0; i < 5; i++) {
      const q = this.takeSprite(puffTex, WHITE, 0.9);
      if (!q) return;
      const a = (i / 5) * Math.PI * 2;
      q.position.set(p.x + Math.cos(a) * 0.3, p.y + 0.15, p.z + Math.sin(a) * 0.3);
      const base = rnd(0.25, 0.35);
      const m = q.material;
      this.addSprite(q, new THREE.Vector3(Math.cos(a) * 2, 0.4, Math.sin(a) * 2), 0.5, {
        drag: 4,
        fade: (k) => {
          m.opacity = 0.9 * Math.min(1, k * 2);
          q.scale.setScalar(base * (1 + (1 - k)));
        },
      });
    }
  }

  update(worldDt: number, realDt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      const dt = p.realTime ? realDt : worldDt;
      if (dt <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        // Callbacks first: they may still read this particle's mesh. New particles go on the end, so `i` stays valid.
        p.onExpire?.();
        this.remove(i);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      const floor = p.floor ?? 0.05;
      if (p.gravity > 0 && p.obj.position.y < floor && p.vel.y < 0) {
        if (p.onLand) {
          p.onLand();
          this.remove(i);
          continue;
        }
        p.obj.position.y = floor;
        p.vel.multiplyScalar(0.4);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.spin.multiplyScalar(0.5);
      }
      if (p.obj instanceof THREE.Sprite) p.obj.material.rotation += p.spin.z * dt;
      else {
        p.obj.rotation.x += p.spin.x * dt;
        p.obj.rotation.y += p.spin.y * dt;
        p.obj.rotation.z += p.spin.z * dt;
      }
      p.fade(p.life / p.maxLife);
    }
  }

  private remove(i: number): void {
    const p = this.parts[i];
    this.scene.remove(p.obj);
    p.dispose();
    this.parts.splice(i, 1);
  }

  clear(): void {
    this.clearPaint();
    for (const p of this.parts) {
      this.scene.remove(p.obj);
      p.dispose();
    }
    this.parts = [];
  }
}

export function faceNormal(p: THREE.Vector3, b: Box): THREE.Vector3 {
  const cands: [number, THREE.Vector3][] = [
    [Math.abs(p.x - b.min.x), new THREE.Vector3(-1, 0, 0)],
    [Math.abs(p.x - b.max.x), new THREE.Vector3(1, 0, 0)],
    [Math.abs(p.y - b.min.y), new THREE.Vector3(0, -1, 0)],
    [Math.abs(p.y - b.max.y), new THREE.Vector3(0, 1, 0)],
    [Math.abs(p.z - b.min.z), new THREE.Vector3(0, 0, -1)],
    [Math.abs(p.z - b.max.z), new THREE.Vector3(0, 0, 1)],
  ];
  cands.sort((a, c) => a[0] - c[0]);
  return cands[0][1];
}
