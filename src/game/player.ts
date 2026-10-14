import * as THREE from 'three';
import { Body, Box, Vec3, anyOverlap, moveBody, overlaps } from '../world/collision';
import type { Trigger } from '../world/level';
import type { Input } from './input';

const WALK = 6.5;
const ACCEL_GROUND = 60;
const ACCEL_AIR = 22;
const AIR_DRAG = 0.25;
const GRAVITY = 22;
const JUMP = 7.6;
const AIR_JUMP = 7.0;
const STEP = 0.42;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.12;
/** After landing, momentum above walk speed bleeds off slowly for a moment (bunny-hop window). */
const LAND_GRACE = 0.15;
const SLIDE_TIME = 0.75;
const SLIDE_MIN_SPEED = 4;
const SLIDE_BOOST = 1.45;
const SLIDE_FRICTION = 4;
const SLIDE_COOLDOWN = 0.35;
export const EYE = 1.6;
const SLIDE_EYE = 0.85;
const STAND_H = 1.75;
/** Collision height while sliding: fits through 1.1m gaps (tubes, ducts, logs). */
const SLIDE_H = 1.0;

export class Player implements Body {
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  halfW = 0.35;
  height = STAND_H;
  grounded = false;
  yaw = 0;
  pitch = 0;
  hp = 100;
  maxHp = 100;
  sensitivity = 0.0022;
  /** Visual recoil offset, decays back to 0. */
  recoil = 0;
  speed = 0;

  /** Set from upgrades. */
  airJumps = 1;
  slideMult = 1;
  speedMult = 1;
  /** Temporary movement scale (aiming down sights, heavy minigun). */
  moveMult = 1;

  sliding = 0;
  private slideCooldown = 0;
  private airJumpsLeft = 1;
  private sinceGrounded = 0;
  private jumpBuffer = 0;
  private landGrace = 0;
  private eyeH = EYE;
  /** Set for one frame when a movement event happens (for sounds). */
  event: 'jump' | 'airjump' | 'slide' | 'land' | 'launch' | null = null;
  /** Downward speed (m/s) at the last landing, for landing shake. */
  landImpact = 0;

  spawn(at: THREE.Vector3): void {
    this.pos = { x: at.x, y: at.y, z: at.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.recoil = 0;
    this.sliding = 0;
    this.height = STAND_H;
    this.eyeH = EYE;
  }

  /** Jump pad / trampoline: set the given velocity axes and refill air jumps. */
  launch(v: Partial<Vec3>): void {
    if (v.x !== undefined) this.vel.x = v.x;
    if (v.y !== undefined) this.vel.y = v.y;
    if (v.z !== undefined) this.vel.z = v.z;
    this.grounded = false;
    this.sinceGrounded = COYOTE;
    this.jumpBuffer = 0;
    this.airJumpsLeft = this.airJumps;
    this.sliding = 0;
    this.landGrace = 0;
    this.event = 'launch';
  }

  /** Launch pads, updrafts and conveyors. Call after update(). */
  applyTriggers(triggers: Trigger[], dt: number, boxes: Box[]): void {
    const min = { x: this.pos.x - this.halfW, y: this.pos.y, z: this.pos.z - this.halfW };
    const max = { x: this.pos.x + this.halfW, y: this.pos.y + this.height, z: this.pos.z + this.halfW };
    for (const t of triggers) {
      if (!overlaps(min, max, t.box)) continue;
      if (t.kind === 'launch') {
        // Only while coming down or standing, so one touch = one bounce.
        if (this.vel.y <= 1) this.launch(t.vel);
      } else if (t.kind === 'conveyor') {
        if (this.grounded) moveBody(this, boxes, t.vel.x * dt, 0, t.vel.z * dt, STEP);
      } else {
        this.vel.y = Math.min(t.maxUp, this.vel.y + t.lift * dt);
        this.grounded = false;
        this.airJumpsLeft = this.airJumps;
      }
    }
  }

  look(input: Input, sensScale: number): void {
    this.yaw -= input.dx * this.sensitivity * sensScale;
    this.pitch -= input.dy * this.sensitivity * sensScale;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  update(dt: number, input: Input, boxes: Box[]): void {
    this.event = null;
    const k = input.keys;
    let fx = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    let len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    } else {
      // Touch stick is analog: a small push walks slowly.
      fx = input.moveX || 0;
      fz = input.moveY || 0;
      len = Math.hypot(fx, fz);
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    const walk = WALK * this.speedMult * this.moveMult;
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);

    // Timers.
    this.sinceGrounded = this.grounded ? 0 : this.sinceGrounded + dt;
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.landGrace = Math.max(0, this.landGrace - dt);
    if (input.pressed.has('Space')) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // Start slide: C while moving on the ground. (Not Ctrl: Ctrl+W closes the browser tab.)
    const slideKey = input.pressed.has('KeyC');
    if (slideKey && this.grounded && this.sliding <= 0 && this.slideCooldown <= 0 && hSpeed > SLIDE_MIN_SPEED) {
      const boost = Math.max(hSpeed, walk) * SLIDE_BOOST * (1 + (this.slideMult - 1) * 0.5);
      this.vel.x = (this.vel.x / hSpeed) * boost;
      this.vel.z = (this.vel.z / hSpeed) * boost;
      this.sliding = SLIDE_TIME * this.slideMult;
      this.event = 'slide';
    }

    if (this.sliding > 0) {
      this.sliding -= dt;
      // Low friction, slight steering.
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = Math.max(0, sp - (SLIDE_FRICTION / this.slideMult) * dt);
      if (sp > 0) {
        let dx = this.vel.x / sp;
        let dz = this.vel.z / sp;
        if (len > 0) {
          dx += wx * dt * 2;
          dz += wz * dt * 2;
          const dl = Math.hypot(dx, dz);
          dx /= dl;
          dz /= dl;
        }
        this.vel.x = dx * ns;
        this.vel.z = dz * ns;
      }
      if (this.sliding <= 0 || ns < 3 || !this.grounded) {
        this.sliding = 0;
        this.slideCooldown = SLIDE_COOLDOWN;
      }
    } else if (this.grounded && this.landGrace <= 0) {
      const tx = wx * walk;
      const tz = wz * walk;
      this.vel.x += clampMag(tx - this.vel.x, ACCEL_GROUND * dt);
      this.vel.z += clampMag(tz - this.vel.z, ACCEL_GROUND * dt);
    } else if (this.grounded) {
      // Landing grace: keep momentum, mild friction.
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > walk) {
        const ns = sp - 10 * dt;
        this.vel.x *= ns / sp;
        this.vel.z *= ns / sp;
      }
    } else {
      // Air: accelerate toward wish dir only up to walk speed, never brake momentum.
      if (len > 0) {
        const along = this.vel.x * wx + this.vel.z * wz;
        const add = Math.max(0, Math.min(walk - along, ACCEL_AIR * dt));
        this.vel.x += wx * add;
        this.vel.z += wz * add;
      }
      const drag = 1 - AIR_DRAG * dt;
      this.vel.x *= drag;
      this.vel.z *= drag;
    }

    // Jumping: coyote time + buffer + air jumps.
    if (this.jumpBuffer > 0) {
      if (this.grounded || this.sinceGrounded < COYOTE) {
        this.vel.y = JUMP;
        this.grounded = false;
        this.sinceGrounded = COYOTE;
        this.jumpBuffer = 0;
        this.airJumpsLeft = this.airJumps;
        this.event = 'jump';
        if (this.sliding > 0) {
          // Slide-jump keeps all the slide speed.
          this.sliding = 0;
          this.slideCooldown = SLIDE_COOLDOWN;
        }
      } else if (this.airJumpsLeft > 0) {
        this.airJumpsLeft--;
        this.vel.y = AIR_JUMP;
        this.jumpBuffer = 0;
        // Air jump lets you redirect toward input without losing speed.
        if (len > 0) {
          const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), walk * 0.8);
          this.vel.x = wx * sp;
          this.vel.z = wz * sp;
        }
        this.event = 'airjump';
      }
    }
    this.vel.y -= GRAVITY * dt;

    // Duck while sliding; stay ducked (and keep sliding) while something is overhead.
    if (this.sliding > 0) this.height = SLIDE_H;
    else if (this.height < STAND_H) {
      this.height = STAND_H;
      if (anyOverlap(this, boxes)) {
        this.height = SLIDE_H;
        this.sliding = 0.12;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp < 4) {
          const dx = sp > 0.1 ? this.vel.x / sp : len > 0 ? wx : -sin;
          const dz = sp > 0.1 ? this.vel.z / sp : len > 0 ? wz : -cos;
          this.vel.x = dx * 4;
          this.vel.z = dz * 4;
        }
      }
    }

    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    moveBody(this, boxes, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, STEP);
    if (this.grounded) this.airJumpsLeft = this.airJumps;
    if (this.grounded && !wasGrounded) {
      this.landGrace = LAND_GRACE;
      if (!this.event) this.event = 'land';
      this.landImpact = Math.max(0, fallSpeed);
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    const targetEye = this.sliding > 0 ? SLIDE_EYE : EYE;
    this.eyeH += (targetEye - this.eyeH) * (1 - Math.exp(-dt * 18));

    // Fell out somehow: put back on the ground.
    if (this.pos.y < -5) {
      this.pos.y = 2;
      this.vel.y = 0;
    }
    this.recoil = Math.max(0, this.recoil - dt * 0.6);
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }

  applyCamera(cam: THREE.PerspectiveCamera): void {
    cam.position.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
    const roll = this.sliding > 0 ? 0.06 : 0;
    cam.rotation.set(this.pitch + this.recoil, this.yaw, roll, 'YXZ');
  }

  /** Is a world point inside the player's (generous) hit capsule? Sliding makes you shorter. */
  contains(p: THREE.Vector3): boolean {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const top = this.sliding > 0 ? 1.1 : 1.85;
    return dx * dx + dz * dz < 0.45 * 0.45 && p.y > this.pos.y && p.y < this.pos.y + top;
  }
}

function clampMag(v: number, m: number): number {
  return Math.max(-m, Math.min(m, v));
}
