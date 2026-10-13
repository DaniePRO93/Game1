import * as THREE from 'three';
import { Body, Box, moveBody } from '../world/collision';
import type { Input } from './input';

const WALK = 6.5;
const ACCEL_GROUND = 60;
const ACCEL_AIR = 14;
const GRAVITY = 22;
const JUMP = 7.6;
const STEP = 0.42;
export const EYE = 1.6;

export class Player implements Body {
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  halfW = 0.35;
  height = 1.75;
  grounded = false;
  yaw = 0;
  pitch = 0;
  hp = 100;
  maxHp = 100;
  sensitivity = 0.0022;
  /** Visual recoil offset, decays back to 0. */
  recoil = 0;
  speed = 0;

  spawn(at: THREE.Vector3): void {
    this.pos = { x: at.x, y: at.y, z: at.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.recoil = 0;
  }

  look(input: Input, sensScale: number): void {
    this.yaw -= input.dx * this.sensitivity * sensScale;
    this.pitch -= input.dy * this.sensitivity * sensScale;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  update(dt: number, input: Input, boxes: Box[]): void {
    const k = input.keys;
    let fx = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;

    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    const tx = wx * WALK;
    const tz = wz * WALK;
    this.vel.x += clampMag(tx - this.vel.x, accel * dt);
    this.vel.z += clampMag(tz - this.vel.z, accel * dt);

    if (this.grounded && k.has('Space')) {
      this.vel.y = JUMP;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    moveBody(this, boxes, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, STEP);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // Fell out somehow: put back on the ground.
    if (this.pos.y < -5) {
      this.pos.y = 2;
      this.vel.y = 0;
    }
    this.recoil = Math.max(0, this.recoil - dt * 0.6);
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  applyCamera(cam: THREE.PerspectiveCamera): void {
    cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    cam.rotation.set(this.pitch + this.recoil, this.yaw, 0, 'YXZ');
  }

  /** Is a world point inside the player's (generous) hit capsule? */
  contains(p: THREE.Vector3): boolean {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    return dx * dx + dz * dz < 0.45 * 0.45 && p.y > this.pos.y && p.y < this.pos.y + 1.85;
  }
}

function clampMag(v: number, m: number): number {
  return Math.max(-m, Math.min(m, v));
}
