/** Pure touch-control math (kept apart from the DOM so it can be tested). */

/**
 * Virtual stick: finger offset (px) from where the thumb landed → move
 * vector in -1..1. A small dead zone ignores resting-thumb wobble, then the
 * response ramps from 0 so slight pushes walk slowly.
 */
export function stickVector(dx: number, dy: number, radius: number, dead = 0.12): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const k = Math.min(1, d / radius);
  if (k <= dead) return { x: 0, y: 0 };
  const mag = (k - dead) / (1 - dead);
  return { x: (dx / d) * mag, y: (dy / d) * mag };
}

/** Touch drag px are much bigger than mouse counts; this maps a drag onto the mouse look scale. */
export const TOUCH_LOOK_SCALE = 1.4;
