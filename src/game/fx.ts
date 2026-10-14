import * as THREE from 'three';
import type { Box } from '../world/collision';
import { doodleMaterial, dropTex, paintTexes, splatTex, spriteMaterial, starTex } from '../render/ink';
import type { Enemy } from './enemy';

/** Anything drawn as a doodle billboard that can tear apart (enemies, versus players). */
export type Doodled = Pick<Enemy, 'width' | 'height' | 'facing' | 'pos' | 'sprite' | 'mesh'> & { def: { kind: string; ink: THREE.Color } };

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
}

const tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
tracerGeo.translate(0, 0, -0.5);

/** Overlay effects: paper shards, ink splats, tracers, muzzle flashes. */
export class FX {
  private parts: Particle[] = [];
  private splatMat = spriteMaterial(splatTex, { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });

  constructor(private scene: THREE.Scene) {}

  private add(p: Particle): void {
    this.scene.add(p.obj);
    this.parts.push(p);
  }

  /** Tear an enemy's drawing into tumbling paper shards. */
  shatter(e: Doodled, impulse: THREE.Vector3): void {
    const cols = e.def.kind === 'boss' ? 5 : 3;
    const rows = e.def.kind === 'boss' ? 6 : 4;
    const cw = e.width / cols;
    const ch = e.height / rows;
    const right = new THREE.Vector3(Math.cos(e.facing), 0, -Math.sin(e.facing));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mat = doodleMaterial(e.sprite.texture, e.def.ink);
        mat.uniforms.uvOffset.value.set(c / cols, r / rows);
        mat.uniforms.uvScale.value.set(1 / cols, 1 / rows);
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
    const mat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false, depthWrite: false, rotation: Math.random() * Math.PI });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    s.position.copy(p);
    s.renderOrder = 10;
    this.add({
      obj: s,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0.06,
      maxLife: 0.06,
      gravity: 0,
      fade: () => {},
      dispose: () => mat.dispose(),
      realTime,
    });
  }

  update(worldDt: number, realDt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      const dt = p.realTime ? realDt : worldDt;
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        p.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.gravity > 0 && p.obj.position.y < 0.05) {
        p.obj.position.y = 0.05;
        p.vel.multiplyScalar(0.4);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.spin.multiplyScalar(0.5);
      }
      p.obj.rotation.x += p.spin.x * dt;
      p.obj.rotation.y += p.spin.y * dt;
      p.obj.rotation.z += p.spin.z * dt;
      p.fade(p.life / p.maxLife);
    }
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
