import * as THREE from 'three';
import { styleMaterial } from '../world/level';
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

  constructor() {
    for (const id of ['rifle', 'shotgun', 'pistol', 'sniper'] as WeaponId[]) {
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

  fire(strength: number): void {
    this.kick = Math.min(1.5, this.kick + strength);
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.muzzles.get(this.current)!.getWorldPosition(out);
  }

  update(dt: number, speed: number, reloadK: number, zoomed: boolean): void {
    this.kick = Math.max(0, this.kick - dt * 8);
    this.swap = Math.max(0, this.swap - dt * 4);
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
  }
}

function buildGun(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, style: 'plain' | 'brick' | 'fill' | 'tone' = 'plain') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), styleMaterial(style));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // Sleeve + hand (common).
  const sleeve = add(0.02, -0.1, 0.22, 0.11, 0.11, 0.34, 'brick');
  sleeve.rotation.x = 0.15;
  add(0, -0.07, 0.04, 0.08, 0.09, 0.09, 'plain');

  let muzzle = new THREE.Vector3(0, 0, -0.6);
  switch (id) {
    case 'rifle':
      add(0, 0, -0.1, 0.07, 0.1, 0.42, 'brick');
      add(0, 0.01, -0.45, 0.03, 0.03, 0.3);
      add(0, -0.1, -0.12, 0.05, 0.13, 0.06, 'fill').rotation.x = 0.25;
      add(0, 0.075, -0.1, 0.03, 0.04, 0.14, 'fill');
      add(0, -0.02, 0.15, 0.06, 0.08, 0.12, 'tone');
      muzzle = new THREE.Vector3(0, 0.01, -0.62);
      break;
    case 'shotgun':
      add(0, 0, -0.15, 0.08, 0.09, 0.5, 'tone');
      add(0, 0.015, -0.48, 0.05, 0.05, 0.25);
      add(0, -0.05, -0.32, 0.07, 0.05, 0.16, 'brick');
      add(0, -0.02, 0.15, 0.065, 0.09, 0.14, 'plain');
      muzzle = new THREE.Vector3(0, 0.015, -0.62);
      break;
    case 'pistol':
      add(0, 0.02, -0.12, 0.05, 0.07, 0.22, 'brick');
      add(0, -0.06, -0.04, 0.045, 0.12, 0.06, 'fill').rotation.x = 0.2;
      muzzle = new THREE.Vector3(0, 0.03, -0.25);
      break;
    case 'sniper':
      add(0, 0, -0.1, 0.06, 0.09, 0.5, 'tone');
      add(0, 0.01, -0.55, 0.025, 0.025, 0.42);
      add(0, 0.085, -0.12, 0.05, 0.05, 0.24, 'fill');
      add(0, -0.02, 0.2, 0.06, 0.1, 0.16, 'brick');
      muzzle = new THREE.Vector3(0, 0.01, -0.78);
      break;
  }
  g.userData.muzzle = muzzle;
  return g;
}
