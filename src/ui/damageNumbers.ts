import * as THREE from 'three';
import { numberScale } from '../game/juice';

const LIFE = 0.75;
/** Most numbers on screen at once; the oldest one is reused past this. */
const MAX = 14;

interface Num {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  age: number;
  /** Sideways drift in px so stacked numbers don't overlap exactly. */
  drift: number;
  head: boolean;
}

const tmp = new THREE.Vector3();

/**
 * Comic damage numbers that pop out of hit points and float up. Anchored in
 * the world (re-projected every frame), drawn with a small pool of DOM nodes.
 */
export class DamageNumbers {
  enabled = true;
  private live: Num[] = [];
  private free: HTMLDivElement[] = [];

  constructor(private root: HTMLElement) {}

  spawn(at: THREE.Vector3, dmg: number, head: boolean): void {
    if (!this.enabled || dmg < 0.5) return;
    let n: Num;
    if (this.live.length >= MAX) {
      n = this.live.shift()!;
    } else {
      const el = this.free.pop() ?? document.createElement('div');
      if (!el.parentElement) this.root.append(el);
      n = { el, pos: new THREE.Vector3(), age: 0, drift: 0, head };
    }
    n.pos.copy(at);
    n.age = 0;
    n.head = head;
    n.drift = (Math.random() - 0.5) * 40;
    n.el.className = head ? 'dmg-num head' : 'dmg-num';
    n.el.textContent = String(Math.round(dmg));
    n.el.style.setProperty('--rot', `${(Math.random() - 0.5) * 16}deg`);
    n.el.style.display = '';
    this.live.push(n);
  }

  update(realDt: number, camera: THREE.Camera, w: number, h: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.age += realDt;
      const k = n.age / LIFE;
      tmp.copy(n.pos).project(camera);
      if (k >= 1 || tmp.z > 1) {
        n.el.style.display = 'none';
        if (k >= 1) {
          this.free.push(n.el);
          this.live.splice(i, 1);
        }
        continue;
      }
      const x = (tmp.x * 0.5 + 0.5) * w + n.drift * k;
      // Rises ~60px over its life, easing out.
      const y = (-tmp.y * 0.5 + 0.5) * h - 60 * (1 - (1 - k) * (1 - k));
      n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(var(--rot)) scale(${numberScale(k).toFixed(3)})`;
      n.el.style.opacity = k > 0.75 ? String(1 - (k - 0.75) / 0.25) : '1';
    }
  }

  clear(): void {
    for (const n of this.live) {
      n.el.style.display = 'none';
      this.free.push(n.el);
    }
    this.live = [];
  }
}
