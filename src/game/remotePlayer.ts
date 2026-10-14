import * as THREE from 'three';
import { DoodleSprite, maskAt } from '../draw/sprite';
import { doodleMaterial, shadowTex, spriteMaterial } from '../render/ink';
import { Spring } from './juice';

/** How far behind real time remote players are drawn, to smooth out jitter. */
const INTERP_MS = 100;
const STAND_H = 1.85;
const SLIDE_H = 1.15;

interface Snap {
  at: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sl: boolean;
  alive: boolean;
}

/**
 * Another player in a versus match: a billboard of their "you" drawing in
 * their ink color, with a name tag. Positions arrive ~20×/s and are
 * interpolated 100ms behind.
 */
export class RemotePlayer {
  mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly tag: THREE.Sprite;
  mat: THREE.ShaderMaterial;
  readonly pos = new THREE.Vector3();
  readonly ink: THREE.Color;
  /** Shape `FX.shatter` / `FX.erase` expect. */
  readonly def: { kind: string; ink: THREE.Color };
  facing = 0;
  /** Where they're looking (for spectating them). */
  yaw = 0;
  width = 1;
  height = STAND_H;
  alive = false;
  sliding = false;
  /** Share token their current sprite came from. */
  userToken: string | null = null;
  private snaps: Snap[] = [];
  private flash = 0;
  /** Local-only hit squash (never sent over the network). */
  private squash = new Spring(320, 13);
  /** Width scale without the squash, so hit tests never depend on the juice. */
  private baseScaleX = 1;
  private bob = 0;
  private walkPhase = 0;
  private lastPos = new THREE.Vector3();

  constructor(
    readonly id: string,
    public name: string,
    ink: string,
    public sprite: DoodleSprite,
  ) {
    this.ink = new THREE.Color(ink);
    this.def = { kind: 'player', ink: this.ink };
    this.mat = doodleMaterial(sprite.texture, this.ink);
    this.mesh = new THREE.Mesh(this.geometry(), this.mat);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), spriteMaterial(shadowTex, { opacity: 0.8 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(name, ink), transparent: true, depthWrite: false }));
    this.tag.scale.set(2.6, 0.65, 1);
    this.setVisible(false);
  }

  /** Width follows the drawing's shape, within sane limits. */
  private geometry(): THREE.PlaneGeometry {
    this.width = Math.min(1.5, Math.max(0.55, STAND_H * this.sprite.aspect));
    const geo = new THREE.PlaneGeometry(this.width, STAND_H);
    geo.translate(0, STAND_H / 2, 0);
    return geo;
  }

  /** Their drawing arrived (or changed). */
  setSprite(sprite: DoodleSprite): void {
    this.sprite = sprite;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometry();
    this.mat.uniforms.map.value = sprite.texture;
  }

  setName(name: string, ink: string): void {
    if (name === this.name && this.ink.getHexString() === new THREE.Color(ink).getHexString()) return;
    this.name = name;
    this.ink.set(ink);
    this.mat.uniforms.inkColor.value.copy(this.ink);
    this.tag.material.map?.dispose();
    this.tag.material.map = nameTex(name, ink);
  }

  push(s: { p: [number, number, number]; yaw: number; sl: number; alive: number }): void {
    const at = performance.now();
    this.snaps.push({ at, x: s.p[0], y: s.p[1], z: s.p[2], yaw: s.yaw, sl: !!s.sl, alive: !!s.alive });
    if (this.snaps.length > 30) this.snaps.splice(0, this.snaps.length - 30);
    // Respawned somewhere new: don't slide across the map.
    const prev = this.snaps[this.snaps.length - 2];
    if (prev && !prev.alive && s.alive) this.snaps = [this.snaps[this.snaps.length - 1]];
  }

  /** Local hit reaction: white flash and a squash. `push` grows the squash for heavy guns. */
  hitFlash(push = 1): void {
    this.flash = 1;
    this.squash.impulse(4 + push * 1.2);
  }

  /** Mark dead right away (the death message beats the next snapshot). */
  kill(): void {
    this.alive = false;
    this.snaps = this.snaps.filter((s) => !s.alive);
    this.setVisible(false);
  }

  update(dt: number, camera: THREE.Vector3): void {
    const now = performance.now();
    const t = now - INTERP_MS;
    let a: Snap | undefined;
    let b: Snap | undefined;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].at <= t) {
        a = this.snaps[i];
        b = this.snaps[i + 1];
        break;
      }
    }
    if (!a) a = this.snaps[0];
    if (!a || now - this.snaps[this.snaps.length - 1].at > 3000) {
      // Nothing recent: hide (lagging or gone).
      this.alive = false;
      this.setVisible(false);
      return;
    }
    if (b && b.alive === a.alive) {
      const k = Math.min(1, (t - a.at) / Math.max(1, b.at - a.at));
      this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      let dy = b.yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw = a.yaw + dy * k;
    } else {
      this.pos.set(a.x, a.y, a.z);
      this.yaw = a.yaw;
    }
    this.alive = a.alive;
    this.sliding = a.sl;
    this.setVisible(this.alive);
    if (!this.alive) return;

    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    this.lastPos.copy(this.pos);
    this.walkPhase += moved * 2.4;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.uniforms.flash.value = this.flash;
    const sq = Math.max(-0.4, Math.min(0.5, this.squash.step(dt) * 0.09));

    this.facing = Math.atan2(camera.x - this.pos.x, camera.z - this.pos.z);
    this.height = this.sliding ? SLIDE_H : STAND_H;
    this.bob = this.sliding ? 0 : Math.abs(Math.sin(this.walkPhase)) * 0.08;
    this.mesh.position.set(this.pos.x, this.pos.y + this.bob, this.pos.z);
    this.baseScaleX = this.sliding ? 1.25 : 1;
    this.mesh.scale.set(this.baseScaleX * (1 + sq), (this.height / STAND_H) * (1 - sq * 0.8), 1);
    this.mesh.rotation.set(0, this.facing, this.sliding ? 0.25 : Math.sin(this.walkPhase) * 0.07);
    this.shadow.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
    this.tag.position.set(this.pos.x, this.pos.y + this.height + 0.45, this.pos.z);
  }

  private setVisible(v: boolean): void {
    this.mesh.visible = v;
    this.shadow.visible = v;
    this.tag.visible = v;
  }

  /**
   * Ray test against the drawing's mask, plus a narrow core column so a
   * stick-thin drawing can't dodge every bullet.
   */
  rayHit(o: THREE.Vector3, d: THREE.Vector3): { t: number; headshot: boolean } | null {
    if (!this.alive) return null;
    const nx = Math.sin(this.facing);
    const nz = Math.cos(this.facing);
    const denom = d.x * nx + d.z * nz;
    if (Math.abs(denom) < 1e-5) return null;
    const t = ((this.pos.x - o.x) * nx + (this.pos.z - o.z) * nz) / denom;
    if (t <= 0) return null;
    const hx = o.x + d.x * t;
    const hy = o.y + d.y * t;
    const hz = o.z + d.z * t;
    const lx = (hx - this.pos.x) * Math.cos(this.facing) - (hz - this.pos.z) * Math.sin(this.facing);
    const w = this.width * this.baseScaleX;
    const u = lx / w + 0.5;
    const v = (hy - this.pos.y - this.bob) / this.height;
    if (v < 0 || v > 1 || u < 0 || u > 1) return null;
    const core = Math.abs(lx) < 0.22;
    if (!core && !maskAt(this.sprite, u, v)) return null;
    return { t, headshot: v > 0.75 };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}

function nameTex(name: string, ink: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.font = '44px "Patrick Hand", "Comic Sans MS", cursive';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 7;
  c.strokeStyle = '#f7f4ec';
  c.strokeText(name, 128, 34);
  c.fillStyle = ink;
  c.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
