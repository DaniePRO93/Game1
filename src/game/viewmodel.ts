import * as THREE from 'three';
import { paintMaterial } from '../render/palette';
import { colorMaterial, styleMaterial } from '../world/level';
import type { WeaponId } from './weapons';

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
  private kick = 0;
  private bobT = 0;
  private swap = 0;
  /** 1 → 0 over a melee swing. */
  private swing = 0;

  constructor() {
    for (const id of ['rifle', 'shotgun', 'pistol', 'sniper', 'eraser'] as WeaponId[]) {
      const g = buildGun(id);
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(g.userData.muzzle as THREE.Vector3);
      g.add(muzzle);
      this.muzzles.set(id, muzzle);
      g.visible = id === this.current;
      this.models.set(id, g);
      this.root.add(g);
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

  fire(strength: number): void {
    this.kick = Math.min(1.5, this.kick + strength);
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.muzzles.get(this.current)!.getWorldPosition(out);
  }

  update(dt: number, speed: number, reloadK: number, zoomed: boolean): void {
    this.kick = Math.max(0, this.kick - dt * 8);
    this.swap = Math.max(0, this.swap - dt * 4);
    this.swing = Math.max(0, this.swing - dt * 4.5);
    this.bobT += dt * speed * 1.6;
    const bob = Math.min(1, speed / 6);
    const reloadDip = Math.sin(Math.min(1, reloadK) * Math.PI);
    this.root.visible = !zoomed;
    this.root.position.set(
      0.24 + Math.sin(this.bobT) * 0.012 * bob,
      -0.25 - Math.abs(Math.cos(this.bobT)) * 0.012 * bob - reloadDip * 0.18 - this.swap * 0.3,
      -0.42 + this.kick * 0.07,
    );
    this.root.rotation.set(this.kick * 0.12 - reloadDip * 0.5, 0, reloadDip * 0.4);
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
