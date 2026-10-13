export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface RayHit {
  t: number;
  box: Box;
}

const EPS = 1e-4;

/** Slab test. Returns entry distance t >= 0 or null. `d` need not be normalized. */
export function rayAABB(o: Vec3, d: Vec3, min: Vec3, max: Vec3): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const a of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      const inv = 1 / d[a];
      let t1 = (min[a] - o[a]) * inv;
      let t2 = (max[a] - o[a]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}

export function raycastBoxes(boxes: Box[], o: Vec3, d: Vec3, maxT: number): RayHit | null {
  let best: RayHit | null = null;
  for (const box of boxes) {
    const t = rayAABB(o, d, box.min, box.max);
    if (t !== null && t <= maxT && (!best || t < best.t)) best = { t, box };
  }
  return best;
}

function overlaps(min: Vec3, max: Vec3, b: Box): boolean {
  return (
    min.x < b.max.x - EPS && max.x > b.min.x + EPS &&
    min.y < b.max.y - EPS && max.y > b.min.y + EPS &&
    min.z < b.max.z - EPS && max.z > b.min.z + EPS
  );
}

export interface Body {
  /** Feet position. */
  pos: Vec3;
  vel: Vec3;
  halfW: number;
  height: number;
  grounded: boolean;
}

function bodyAABB(b: Body, out: { min: Vec3; max: Vec3 }) {
  out.min.x = b.pos.x - b.halfW;
  out.min.y = b.pos.y;
  out.min.z = b.pos.z - b.halfW;
  out.max.x = b.pos.x + b.halfW;
  out.max.y = b.pos.y + b.height;
  out.max.z = b.pos.z + b.halfW;
  return out;
}

const tmpBB = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

function anyOverlap(b: Body, boxes: Box[]): boolean {
  bodyAABB(b, tmpBB);
  for (const box of boxes) if (overlaps(tmpBB.min, tmpBB.max, box)) return true;
  return false;
}

/**
 * Move an axis-aligned body through static boxes, resolving one axis at a time.
 * Horizontal moves step up onto ledges no taller than `stepH` when grounded.
 */
export function moveBody(b: Body, boxes: Box[], dx: number, dy: number, dz: number, stepH: number): void {
  const wasGrounded = b.grounded;
  b.grounded = false;

  for (const axis of ['x', 'z'] as const) {
    const amt = axis === 'x' ? dx : dz;
    if (amt === 0) continue;
    b.pos[axis] += amt;
    bodyAABB(b, tmpBB);
    for (const box of boxes) {
      if (!overlaps(tmpBB.min, tmpBB.max, box)) continue;
      const rise = box.max.y - b.pos.y;
      if (wasGrounded && rise > 0 && rise <= stepH) {
        const oldY = b.pos.y;
        b.pos.y = box.max.y + EPS;
        if (!anyOverlap(b, boxes)) {
          bodyAABB(b, tmpBB);
          continue;
        }
        b.pos.y = oldY;
      }
      if (amt > 0) b.pos[axis] = box.min[axis] - b.halfW - EPS * 2;
      else b.pos[axis] = box.max[axis] + b.halfW + EPS * 2;
      b.vel[axis] = 0;
      bodyAABB(b, tmpBB);
    }
  }

  b.pos.y += dy;
  bodyAABB(b, tmpBB);
  for (const box of boxes) {
    if (!overlaps(tmpBB.min, tmpBB.max, box)) continue;
    if (dy <= 0) {
      b.pos.y = box.max.y;
      b.grounded = true;
    } else {
      b.pos.y = box.min.y - b.height - EPS;
    }
    b.vel.y = 0;
    bodyAABB(b, tmpBB);
  }

  // Ground probe so standing still on a surface still counts as grounded.
  if (!b.grounded && dy <= 0) {
    b.pos.y -= 0.02;
    if (anyOverlap(b, boxes)) b.grounded = true;
    b.pos.y += 0.02;
  }
}

/** Push a vertical cylinder (approximated as a circle in XZ) out of boxes. */
export function pushCircleOut(p: Vec3, r: number, boxes: Box[]): boolean {
  let hit = false;
  for (const b of boxes) {
    const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      // Center inside box: push out through nearest face.
      const opts = [
        { d: p.x - b.min.x, x: b.min.x - r, z: p.z },
        { d: b.max.x - p.x, x: b.max.x + r, z: p.z },
        { d: p.z - b.min.z, x: p.x, z: b.min.z - r },
        { d: b.max.z - p.z, x: p.x, z: b.max.z + r },
      ].sort((a, c) => a.d - c.d);
      p.x = opts[0].x;
      p.z = opts[0].z;
    }
  }
  return hit;
}
