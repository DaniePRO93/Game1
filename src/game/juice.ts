import type { WeaponId } from './weapons';

/**
 * Game-feel helpers ("juice"): small, pure pieces of math so the bouncy
 * cartoon reactions stay testable and allocation-free in the hot path.
 */

/** Longest step a spring takes at once; bigger frames are split so stiff springs stay stable. */
const SPRING_MAX_STEP = 1 / 240;

/**
 * Damped spring pulled toward a target. Underdamped settings overshoot and
 * wobble before settling, which is what makes a kick read as "bouncy".
 */
export class Spring {
  x = 0;
  v = 0;

  /** `k` stiffness, `c` damping (per second). Damping ratio = c / (2·√k). */
  constructor(
    public k: number,
    public c: number,
  ) {}

  /** Add velocity (a push). */
  impulse(v: number): void {
    this.v += v;
  }

  step(dt: number, target = 0): number {
    let left = Math.max(0, dt);
    while (left > 1e-9) {
      const h = Math.min(SPRING_MAX_STEP, left);
      // Semi-implicit Euler: update velocity first, then position (stable for springs).
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    return this.x;
  }

  reset(): void {
    this.x = this.v = 0;
  }
}

/**
 * Trauma-based screen shake: events add trauma (0..1), the camera moves by
 * trauma², so small bumps stay tiny and big hits feel big. Decays to 0 fast.
 */
export class Trauma {
  value = 0;

  /** Trauma lost per second (4 → a full hit is gone in 0.25s). */
  constructor(public decay = 4) {}

  add(amount: number): void {
    this.value = Math.min(1, Math.max(0, this.value + amount));
  }

  step(dt: number): void {
    this.value = Math.max(0, this.value - this.decay * dt);
  }

  /** How strong the shake is right now (0..1). */
  get shake(): number {
    return this.value * this.value;
  }
}

/** Max shake at trauma 1 (before the Options slider). */
export const SHAKE_MAX_ROT = (1.5 * Math.PI) / 180;
export const SHAKE_MAX_OFFSET = 0.04;
/** prefers-reduced-motion scales shake down to this. */
export const REDUCED_MOTION_SHAKE = 0.3;

/** Smooth pseudo-noise in -1..1 (sum of sines), so shake wobbles instead of buzzing randomly. */
export function shakeNoise(t: number, seed: number): number {
  return (Math.sin(t * 47 + seed * 3.1) * 0.6 + Math.sin(t * 83 + seed * 7.7) * 0.3 + Math.sin(t * 131 + seed * 1.3) * 0.1);
}

/**
 * Freeze frames: a short real-time window where the world doesn't move.
 * Triggers don't stack; a bigger one extends the current freeze.
 */
export class Hitstop {
  left = 0;

  trigger(seconds: number): void {
    this.left = Math.max(this.left, seconds);
  }

  /** Advances real time; returns the world time scale for this frame (0 while frozen). */
  step(realDt: number): number {
    if (this.left <= 0) return 1;
    this.left = Math.max(0, this.left - realDt);
    return 0;
  }

  get frozen(): boolean {
    return this.left > 0;
  }
}

export const HITSTOP_KILL = 0.05;
/** Headshots, multi-kills and railgun multi-pierce hold a bit longer. */
export const HITSTOP_BIG = 0.09;

/** What one target took from one shot (all pellets merged). */
export interface Tally {
  dmg: number;
  head: boolean;
  /** Pellets that landed. */
  count: number;
}

/**
 * Merge one pellet's damage into the per-target tally for this shot, so a
 * shotgun blast shows (and applies) as one number per target.
 */
export function tallyHit<K, T extends Tally>(map: Map<K, T>, key: K, dmg: number, head: boolean, make: () => T): T {
  let t = map.get(key);
  if (!t) {
    t = make();
    t.dmg = 0;
    t.head = false;
    t.count = 0;
    map.set(key, t);
  }
  t.dmg += dmg;
  t.head ||= head;
  t.count++;
  return t;
}

/** Damage number scale over its life k (0..1): pop past full size, settle, shrink at the end. */
export function numberScale(k: number): number {
  if (k < 0.12) return 0.3 + (k / 0.12) * 1.1;
  if (k < 0.25) return 1.4 - ((k - 0.12) / 0.13) * 0.4;
  if (k > 0.8) return 1 - ((k - 0.8) / 0.2) * 0.4;
  return 1;
}

/** How a gun's viewmodel reacts to a shot. Distances in m, angles in rad. */
export interface RecoilProfile {
  /** Pushed back toward the camera. */
  back: number;
  /** Muzzle flips up. */
  pitch: number;
  /** Roll (sniper). */
  roll: number;
  /** Random sideways yaw per shot (rifle buzz, minigun). */
  yaw: number;
  /** Squash along the barrel (+ compresses, then wobbles into a stretch). */
  squash: number;
  /** Spring stiffness / damping for this gun's kick. */
  k: number;
  c: number;
  /** Shotgun: twirl after the shot. */
  twirl?: boolean;
  /** Screen-shake trauma per shot. */
  trauma: number;
  /** Crosshair bloom per shot (0..1). */
  bloom: number;
}

export const RECOIL: Record<WeaponId, RecoilProfile> = {
  pistol: { back: 0.03, pitch: 0.16, roll: 0, yaw: 0.02, squash: 0.5, k: 700, c: 26, trauma: 0, bloom: 0.3 },
  rifle: { back: 0.035, pitch: 0.06, roll: 0, yaw: 0.04, squash: 0.35, k: 900, c: 30, trauma: 0, bloom: 0.16 },
  shotgun: { back: 0.14, pitch: 0.38, roll: 0.05, yaw: 0.03, squash: 1.2, k: 260, c: 13, twirl: true, trauma: 0.45, bloom: 0.7 },
  sniper: { back: 0.12, pitch: 0.3, roll: 0.35, yaw: 0, squash: 1, k: 220, c: 11, trauma: 0.45, bloom: 0.6 },
  // Light continuous rumble: each shot tops trauma up, it decays between shots.
  minigun: { back: 0.02, pitch: 0.025, roll: 0.02, yaw: 0.05, squash: 0.25, k: 1100, c: 30, trauma: 0.25, bloom: 0.08 },
  railgun: { back: 0.18, pitch: 0.42, roll: 0.1, yaw: 0, squash: -1.4, k: 200, c: 10, trauma: 0.75, bloom: 0.9 },
  eraser: { back: 0, pitch: 0, roll: 0, yaw: 0, squash: 0, k: 300, c: 20, trauma: 0, bloom: 0 },
};

/** Trauma for non-gun events. */
export const TRAUMA_HURT = 0.4;
export const TRAUMA_INK_BOMB = 0.7;
/** Landings faster than this (m/s) shake a little. */
export const HARD_LANDING = 10;

/** Knockback speed (m/s) a hit gives a normal enemy. Heavier guns push more. */
export const KNOCKBACK: Record<WeaponId, number> = { pistol: 1.6, rifle: 1.1, minigun: 0.6, shotgun: 7, sniper: 6, railgun: 9, eraser: 7 };

/** Kills that launch the whole doodle spinning instead of a plain pop. */
export function fliesOnKill(id: WeaponId): boolean {
  return id === 'shotgun' || id === 'railgun' || id === 'eraser';
}

/** Small random pitch change (±8%) so repeated shots don't sound like a loop. */
export function pitchJitter(rand = Math.random()): number {
  return 1 + (rand - 0.5) * 0.16;
}

/** Stereo pan (-1 left .. 1 right) for a sound at `angle` (0 = ahead, + = right). */
export function panFor(angle: number): number {
  return Math.max(-1, Math.min(1, Math.sin(angle))) * 0.85;
}
