import * as THREE from 'three';
import { paintMaterial } from '../render/palette';
import { colorMaterial, styleMaterial } from '../world/level';
import { RECOIL, Spring } from './juice';
import type { WeaponId } from './weapons';

/** Seconds a shotgun twirl takes, and how long after the shot it starts. */
const TWIRL_S = 0.32;
const TWIRL_DELAY = 0.12;

/**
 * First-person gun + sleeve, built from boxes so the postfx pass outlines and
 * hatches it like everything else.
 */
export class ViewModel {
  readonly root = new THREE.Group();
  private models = new Map<WeaponId, THREE.Group>();
  private current: WeaponId = 'rifle';
  /** World-space muzzle position is read from this marker. */
  private muzzles = new Map<WeaponId, THREE.Object3D>();
  // Recoil springs (displacement from rest): bounce out, snap back, wobble.
  private kickBack = new Spring(600, 24);
  private kickPitch = new Spring(600, 24);
  private kickRoll = new Spring(400, 16);
  private kickYaw = new Spring(600, 24);
  private squash = new Spring(500, 14);
  /** Shotgun twirl progress (counts up from -TWIRL_DELAY; <0 waiting, >TWIRL_S done). */
  private twirlT = Infinity;
  /** Minigun: recently fired, for continuous jitter. */
  private firingT = 0;
  private bobT = 0;
  private swap = 0;
  /** 1 → 0 over a melee swing. */
  private swing = 0;
  /** 0 = hip, 1 = aiming down sights. */
  private aimK = 0;
  private barrels: THREE.Object3D | null = null;
  private spinAngle = 0;

  constructor() {
    for (const id of ['rifle', 'shotgun', 'pistol', 'sniper', 'eraser', 'minigun', 'railgun'] as WeaponId[]) {
      const g = buildGun(id);
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(g.userData.muzzle as THREE.Vector3);
      g.add(muzzle);
      this.muzzles.set(id, muzzle);
      g.visible = id === this.current;
      this.models.set(id, g);
      this.root.add(g);
      if (g.userData.barrels) this.barrels = g.userData.barrels as THREE.Object3D;
    }
    this.root.position.set(0.24, -0.25, -0.42);
  }

  setWeapon(id: WeaponId): void {
    if (id === this.current) return;
    this.models.get(this.current)!.visible = false;
    this.current = id;
    this.models.get(id)!.visible = true;
    this.swap = 1;
  }

  setColorMode(on: boolean): void {
    this.root.traverse((o) => {
      const cm = o.userData.colorMode as { ink: THREE.Material; paint: THREE.Material } | undefined;
      if (cm && o instanceof THREE.Mesh) o.material = on ? cm.paint : cm.ink;
    });
  }

  startSwing(): void {
    this.swing = 1;
  }

  /** Kick the gun with its own recoil personality. */
  fire(): void {
    const r = RECOIL[this.current];
    // Aiming keeps the sights readable: half the visual kick.
    const m = 1 - this.aimK * 0.5;
    for (const s of [this.kickBack, this.kickPitch, this.kickRoll, this.kickYaw]) {
      s.k = r.k;
      s.c = r.c;
    }
    // Displace instantly, then let the spring snap back past rest and wobble.
    this.kickBack.x = Math.min(0.25, this.kickBack.x + r.back * m);
    this.kickPitch.x = Math.min(0.6, this.kickPitch.x + r.pitch * m);
    this.kickRoll.x += r.roll * m * (Math.random() < 0.5 ? -0.4 : 1);
    this.kickYaw.x += (Math.random() - 0.5) * 2 * r.yaw * m;
    this.squash.x = r.squash;
    this.squash.v = 0;
    if (r.twirl) this.twirlT = -TWIRL_DELAY;
    this.firingT = 0.12;
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.muzzles.get(this.current)!.getWorldPosition(out);
  }

  /**
   * `aim` 0..1 brings the gun to the center; `spin` 0..1 turns the minigun
   * barrels; `charge` 0..1 squashes the railgun as it gets ready.
   */
  update(dt: number, speed: number, reloadK: number, zoomed: boolean, aim = 0, spin = 0, charge = 0): void {
    this.aimK += (aim - this.aimK) * (1 - Math.exp(-dt * 16));
    this.spinAngle += dt * spin * 40;
    if (this.barrels) this.barrels.rotation.z = this.spinAngle;
    const a = this.aimK;
    const back = this.kickBack.step(dt);
    const pitch = this.kickPitch.step(dt);
    const roll = this.kickRoll.step(dt);
    const yaw = this.kickYaw.step(dt);
    const sq = this.squash.step(dt);
    this.firingT = Math.max(0, this.firingT - dt);
    let twirl = 0;
    if (this.twirlT < TWIRL_S) {
      this.twirlT += dt;
      const k = Math.max(0, Math.min(1, this.twirlT / TWIRL_S));
      // Ease in-out full turn around the barrel.
      twirl = (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * Math.PI * 2;
    }
    // Railgun winds up (squashed, trembling) as its next shot gets ready; the shot slams it out.
    const coil = this.current === 'railgun' ? charge * 0.12 : 0;
    const shiver = this.current === 'railgun' && charge >= 1 ? 0.004 : this.current === 'minigun' && this.firingT > 0 ? 0.006 * spin : 0;
    const jx = shiver ? (Math.random() - 0.5) * shiver : 0;
    const jy = shiver ? (Math.random() - 0.5) * shiver : 0;
    const model = this.models.get(this.current)!;
    // Squash-and-stretch along the barrel (z), keeping volume roughly constant.
    const sz = Math.max(0.6, 1 - sq * 0.16 - coil);
    const sxy = 1 / Math.sqrt(sz);
    model.scale.set(sxy, sxy, sz);
    model.rotation.z = twirl;
    this.swap = Math.max(0, this.swap - dt * 4);
    this.swing = Math.max(0, this.swing - dt * 4.5);
    this.bobT += dt * speed * 1.6;
    const bob = Math.min(1, speed / 6) * (1 - a * 0.8);
    const reloadDip = Math.sin(Math.min(1, reloadK) * Math.PI);
    this.root.visible = !zoomed;
    this.root.position.set(
      0.24 * (1 - a) + Math.sin(this.bobT) * 0.012 * bob + jx,
      -0.25 + a * 0.04 - Math.abs(Math.cos(this.bobT)) * 0.012 * bob - reloadDip * 0.18 - this.swap * 0.3 + jy,
      -0.42 + a * 0.06 + back,
    );
    this.root.rotation.set(pitch - reloadDip * 0.5 + (twirl ? Math.sin(twirl / 2) * 0.35 : 0), yaw, roll + reloadDip * 0.4);
    if (this.swing > 0) {
      // Diagonal slash: wind up top-right, cut down across to the left.
      const p = 1 - this.swing;
      const e = p < 0.15 ? -p / 0.15 * 0.3 : Math.sin(((p - 0.15) / 0.85) * Math.PI * 0.5);
      this.root.rotation.x += -0.4 * Math.sin(p * Math.PI);
      this.root.rotation.y += 0.5 - e * 1.6;
      this.root.rotation.z += 0.3 - e * 1.1;
      this.root.position.x -= e * 0.12;
    }
  }
}

function buildGun(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const box = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  /** Colored part; hue 0..1. */
  const c = (hue: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => box(colorMaterial(hue), x, y, z, sx, sy, sz);
  const ink = (style: 'plain' | 'brick' | 'fill', x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    box(styleMaterial(style), x, y, z, sx, sy, sz);

  // Sleeve + hand (common). Tagged so color mode can paint them.
  const sleeve = ink('brick', 0.02, -0.1, 0.22, 0.11, 0.11, 0.34);
  sleeve.rotation.x = 0.15;
  sleeve.userData.colorMode = { ink: styleMaterial('brick'), paint: paintMaterial('sleeve') };
  const hand = ink('plain', 0, -0.07, 0.04, 0.08, 0.09, 0.09);
  hand.userData.colorMode = { ink: styleMaterial('plain'), paint: paintMaterial('skin') };

  let muzzle = new THREE.Vector3(0, 0, -0.6);
  switch (id) {
    case 'rifle': // orange body, teal barrel, yellow mag
      c(0.07, 0, 0, -0.1, 0.07, 0.1, 0.42);
      c(0.5, 0, 0.01, -0.45, 0.03, 0.03, 0.3);
      c(0.14, 0, -0.1, -0.12, 0.05, 0.13, 0.06).rotation.x = 0.25;
      c(0.5, 0, 0.075, -0.1, 0.03, 0.04, 0.14);
      c(0.07, 0, -0.02, 0.15, 0.06, 0.08, 0.12);
      muzzle = new THREE.Vector3(0, 0.01, -0.62);
      break;
    case 'shotgun': // red body, yellow barrel, teal pump
      c(0.0, 0, 0, -0.15, 0.08, 0.09, 0.5);
      c(0.13, 0, 0.015, -0.48, 0.05, 0.05, 0.25);
      c(0.48, 0, -0.05, -0.32, 0.07, 0.05, 0.16);
      c(0.0, 0, -0.02, 0.15, 0.065, 0.09, 0.14);
      muzzle = new THREE.Vector3(0, 0.015, -0.62);
      break;
    case 'pistol': // green slide, purple grip
      c(0.33, 0, 0.02, -0.12, 0.05, 0.07, 0.22);
      c(0.78, 0, -0.06, -0.04, 0.045, 0.12, 0.06).rotation.x = 0.2;
      muzzle = new THREE.Vector3(0, 0.03, -0.25);
      break;
    case 'sniper': // purple body, cyan barrel, pink scope
      c(0.75, 0, 0, -0.1, 0.06, 0.09, 0.5);
      c(0.55, 0, 0.01, -0.55, 0.025, 0.025, 0.42);
      c(0.92, 0, 0.085, -0.12, 0.05, 0.05, 0.24);
      c(0.75, 0, -0.02, 0.2, 0.06, 0.1, 0.16);
      muzzle = new THREE.Vector3(0, 0.01, -0.78);
      break;
    case 'minigun': {
      // Orange body, a spinning cluster of yellow barrels, red ammo box.
      c(0.07, 0, -0.01, -0.02, 0.12, 0.13, 0.32);
      c(0.02, 0.07, -0.1, 0.0, 0.08, 0.12, 0.16);
      const barrels = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.5), colorMaterial(0.15));
        b.position.set(Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0);
        barrels.add(b);
      }
      barrels.position.set(0, 0.0, -0.4);
      g.add(barrels);
      g.userData.barrels = barrels;
      c(0.07, 0, 0, -0.62, 0.11, 0.11, 0.03);
      muzzle = new THREE.Vector3(0, 0, -0.68);
      break;
    }
    case 'railgun': // long cyan rails with pink coils
      c(0.85, 0, 0, -0.05, 0.08, 0.1, 0.4);
      c(0.52, 0.035, 0.01, -0.45, 0.018, 0.05, 0.55);
      c(0.52, -0.035, 0.01, -0.45, 0.018, 0.05, 0.55);
      for (const z of [-0.28, -0.42, -0.56]) c(0.95, 0, 0.01, z, 0.11, 0.11, 0.03);
      c(0.6, 0, 0.08, -0.05, 0.04, 0.04, 0.2);
      muzzle = new THREE.Vector3(0, 0.01, -0.75);
      break;
    case 'eraser': {
      // A giant pencil: yellow grip, silver ferrule, pink eraser blade.
      const sword = new THREE.Group();
      const part = (mat: THREE.Material, z: number, sx: number, sy: number, sz: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        m.position.z = z;
        sword.add(m);
      };
      part(colorMaterial(0.14), 0.02, 0.055, 0.055, 0.26);
      part(styleMaterial('brick'), -0.13, 0.068, 0.068, 0.07);
      part(colorMaterial(0.95), -0.47, 0.075, 0.13, 0.62);
      part(colorMaterial(0.95), -0.8, 0.06, 0.1, 0.05);
      sword.position.set(0, -0.02, 0);
      sword.rotation.set(0.75, 0.25, 0.1);
      g.add(sword);
      muzzle = new THREE.Vector3(0, 0.45, -0.55);
      break;
    }
  }
  g.userData.muzzle = muzzle;
  return g;
}
