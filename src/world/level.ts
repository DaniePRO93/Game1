import * as THREE from 'three';
import type { Box } from './collision';

/**
 * World materials encode style for the postfx shader:
 *   color = (1, pattern, tone)  →  R = lighting, G/R = pattern, B/R = tone.
 * pattern 0 = plain hatching, 0.25 = colored ink (tone = hue),
 * 0.5 = diamond crosshatch (brick/lattice),
 * 1 = solid lavender fill. tone = extra lavender wash.
 */
export type Style = 'plain' | 'brick' | 'fill' | 'tone';

const STYLE_COLORS: Record<Style, THREE.Color> = {
  plain: new THREE.Color(1, 0, 0),
  brick: new THREE.Color(1, 0.5, 0),
  fill: new THREE.Color(1, 1, 0),
  tone: new THREE.Color(1, 0, 0.55),
};

const matCache = new Map<Style, THREE.MeshLambertMaterial>();
export function styleMaterial(style: Style): THREE.MeshLambertMaterial {
  let m = matCache.get(style);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: STYLE_COLORS[style] });
    matCache.set(style, m);
  }
  return m;
}

const colorCache = new Map<number, THREE.MeshLambertMaterial>();
/** Colored ink (pattern code 0.25, hue in B). Used for weapons. */
export function colorMaterial(hue: number): THREE.MeshLambertMaterial {
  let m = colorCache.get(hue);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(1, 0.25, hue) });
    colorCache.set(hue, m);
  }
  return m;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

/** Vibrant palette per style for color mode (hues 0..1). */
const COLOR_HUES: Record<Style, number[]> = {
  plain: [0.14, 0.33, 0.5, 0.08],
  brick: [0.56, 0.6, 0.52],
  fill: [0.78, 0.92, 0.72],
  tone: [0.03, 0.95, 0.1],
};

export interface Level {
  scene: THREE.Group;
  /** Swap every box between pen-only and vibrant color materials. */
  setColorMode: (on: boolean) => void;
  /** All collidable boxes (including the ground slab). */
  boxes: Box[];
  /** Boxes that block ground-level walkers (enemies). */
  obstacles: Box[];
  spawnPoints: THREE.Vector3[];
  playerSpawn: THREE.Vector3;
  bounds: number;
}

export function buildLevel(): Level {
  const scene = new THREE.Group();
  const boxes: Box[] = [];
  const styled: THREE.Mesh[] = [];

  /** Box with bottom at y, centered at x/z. */
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, style: Style = 'plain', collide = true) => {
    const m = new THREE.Mesh(unitBox, styleMaterial(style));
    const hues = COLOR_HUES[style];
    m.userData.style = style;
    m.userData.hue = hues[styled.length % hues.length];
    styled.push(m);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y + sy / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (collide) {
      boxes.push({
        min: { x: x - sx / 2, y, z: z - sz / 2 },
        max: { x: x + sx / 2, y: y + sy, z: z + sz / 2 },
      });
    }
    return m;
  };
  /** Box from min/max corners. */
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, style: Style = 'plain', collide = true) =>
    box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, style, collide);

  /** Solid staircase rising along +dir from (x,z), `steps` of `rise` x `run`. */
  const stairs = (x: number, z: number, dir: 'x+' | 'x-' | 'z+' | 'z-', width: number, steps: number, rise: number, run: number, baseY = 0) => {
    for (let i = 0; i < steps; i++) {
      const h = baseY + rise * (i + 1);
      const along = run * i + run / 2;
      const cx = dir === 'x+' ? x + along : dir === 'x-' ? x - along : x;
      const cz = dir === 'z+' ? z + along : dir === 'z-' ? z - along : z;
      const sx = dir[0] === 'x' ? run : width;
      const sz = dir[0] === 'z' ? run : width;
      box(cx, 0, cz, sx, h, sz, 'plain');
    }
  };

  const B = 42;

  // Ground: collision slab, visible plane.
  boxes.push({ min: { x: -200, y: -2, z: -200 }, max: { x: 200, y: 0, z: 200 } });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), styleMaterial('plain'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter walls.
  span(-B - 1, 0, -B - 1, B + 1, 6, -B, 'brick');
  span(-B - 1, 0, B, B + 1, 6, B + 1, 'brick');
  span(-B - 1, 0, -B, -B, 6, B, 'brick');
  span(B, 0, -B, B + 1, 6, B, 'brick');
  // Wall caps for a chunkier silhouette.
  for (const [x0, z0, x1, z1] of [
    [-B - 1.3, -B - 1.3, B + 1.3, -B + 0.3],
    [-B - 1.3, B - 0.3, B + 1.3, B + 1.3],
    [-B - 1.3, -B, -B + 0.3, B],
    [B - 0.3, -B, B + 1.3, B],
  ]) span(x0, 6, z0, x1, 6.4, z1, 'plain', false);

  // ── Scaffold building (the unfinished concrete frame) ──────────────────
  const bx0 = -16, bx1 = 0, bz0 = -19, bz1 = -9;
  const floorH = 3.6;
  const colsX = [bx0 + 0.3, -10.6, -5.3, bx1 - 0.3];
  const colsZ = [bz0 + 0.3, -14, bz1 - 0.3];
  for (const cx of colsX) for (const cz of colsZ) box(cx, 0, cz, 0.6, floorH * 3 + 0.3, 0.6, 'plain');
  for (let lvl = 1; lvl <= 3; lvl++) {
    const y = lvl * floorH;
    span(bx0, y - 0.3, bz0, bx1, y, bz1, lvl === 3 ? 'plain' : 'tone');
    // Railings (skip east side on reachable floors to let stairs in).
    span(bx0, y, bz0, bx1, y + 1, bz0 + 0.12, 'plain');
    span(bx0, y, bz1 - 0.12, bx1, y + 1, bz1, 'plain');
    span(bx0, y, bz0, bx0 + 0.12, y + 1, -15, 'plain');
    if (lvl === 3) span(bx1 - 0.12, y, bz0, bx1, y + 1, bz1, 'plain');
    // Half-height interior partitions for cover / visual density.
    if (lvl < 3) {
      span(-12, y, -16.5, -11.8, y + 1.2, -11.5, 'brick');
      span(-7, y, -12.5, -3, y + 1.0, -12.3, 'plain');
    }
  }
  // Ground-floor walls partially enclosing the base.
  span(bx0, 0, bz0, -8, 2.4, bz0 + 0.3, 'brick');
  span(-4, 0, bz0, bx1, 2.4, bz0 + 0.3, 'brick');
  span(bx0, 0, -14.5, bx0 + 0.3, 2.4, bz1, 'brick');

  // Stairs: ground → floor 1 on the east side, rising north.
  stairs(0.9, -6.4, 'z-', 1.6, 12, 0.3, 0.9);
  span(0, floorH - 0.3, -19, 1.7, floorH, -17.2, 'tone'); // landing
  // Floor 1 → floor 2, rising south, outside the first flight.
  stairs(2.55, -17.6, 'z+', 1.6, 12, 0.3, 0.38, floorH);
  span(0, 2 * floorH - 0.3, -13.05, 3.4, 2 * floorH, -10.2, 'tone'); // landing
  span(1.7, floorH, -19, 3.4, floorH + 0.3, -17.6, 'tone'); // turn

  // Elevated walkway from floor 1 west to the perimeter wall.
  span(-B, floorH - 0.4, -15, bx0, floorH, -13, 'tone');
  span(-B, floorH, -15, bx0, floorH + 0.9, -14.88, 'plain');
  span(-B, floorH, -13.12, bx0, floorH + 0.9, -13, 'plain');
  for (const px of [-36, -28, -21]) box(px, 0, -14, 0.7, floorH - 0.4, 0.7, 'brick');

  // ── Tower crane ───────────────────────────────────────────────────────
  const cx = 12, cz = -30;
  box(cx, 0, cz, 3, 0.8, 3, 'plain');
  box(cx, 0.8, cz, 1.4, 23, 1.4, 'brick');
  box(cx, 22, cz + 0.2, 2, 2, 2.2, 'tone', false); // cab
  span(cx - 9, 24, cz - 0.4, cx + 24, 24.8, cz + 0.4, 'brick', false); // jib
  span(cx - 9, 22.2, cz - 1, cx - 5, 24, cz + 1, 'fill', false); // counterweight
  box(cx, 24.8, cz, 0.5, 4, 0.5, 'plain', false); // mast top
  box(cx + 21, 13, cz, 0.08, 11, 0.08, 'plain', false); // cable
  box(cx + 21, 12.2, cz, 0.7, 0.8, 0.7, 'fill', false); // hook

  // ── Small house with roof access ───────────────────────────────────────
  const hx0 = 13.5, hx1 = 22.5, hz0 = -8, hz1 = 0, hh = 6;
  span(hx0, 0, hz0, hx1, hh, hz1, 'brick');
  span(hx0 - 0.2, hh, hz0 - 0.2, hx1 + 0.2, hh + 0.3, hz1 + 0.05, 'plain');
  // Windows/door as inset dark panels.
  for (const wx of [15.5, 20.5]) span(wx - 0.9, 3, hz1, wx + 0.9, 4.6, hz1 + 0.06, 'fill', false);
  span(hx0 - 0.06, 0, -3, hx0, 2.4, -1.4, 'fill', false); // door
  span(hx0 - 0.06, 3, -6.5, hx0, 4.6, -4.5, 'fill', false);
  // Roof railings.
  span(hx0, hh + 0.3, hz0, hx1, hh + 1.3, hz0 + 0.12, 'plain');
  span(hx1 - 0.12, hh + 0.3, hz0, hx1, hh + 1.3, hz1, 'plain');
  // Stairs along the south face, rising west; step off north onto the roof.
  stairs(25.5, 1.0, 'x-', 1.8, 21, 0.3, 0.52);

  // ── Shipping containers ────────────────────────────────────────────────
  span(26, 0, 14, 32, 2.6, 16.4, 'tone');
  span(26, 0, 17.4, 32, 2.6, 19.8, 'brick');
  span(26.5, 2.6, 15.2, 32.5, 5.2, 17.6, 'tone');
  span(-34, 0, 20, -31.6, 2.6, 26, 'tone');

  // ── Cover: concrete blocks, crates, low walls, pipes ───────────────────
  const blocks: [number, number, number, number, number, Style][] = [
    [-4, 4, 2.2, 1.2, 1.2, 'plain'],
    [4, 6, 1.4, 1.4, 1.4, 'fill'],
    [5.6, 6, 1.2, 0.9, 1.2, 'tone'],
    [-10, 12, 3, 1.1, 0.8, 'plain'],
    [10, 18, 0.9, 2.2, 3.2, 'brick'],
    [-18, 4, 1.4, 1.4, 1.4, 'fill'],
    [-17, 5.8, 1.0, 1.0, 1.0, 'tone'],
    [-24, -26, 4, 1.6, 1.2, 'plain'],
    [0, -28, 1.6, 1.6, 1.6, 'fill'],
    [-30, 4, 1.2, 1.2, 1.2, 'fill'],
    [30, -18, 3.5, 1.2, 1.2, 'plain'],
    [34, 0, 1.4, 1.4, 1.4, 'tone'],
    [-6, 26, 1.2, 1.2, 1.2, 'fill'],
    [16, 30, 3, 1.1, 1.2, 'plain'],
    [-26, 32, 1.4, 1.4, 1.4, 'tone'],
    [26, 32, 1.4, 1.4, 1.4, 'fill'],
    [-36, -30, 1.4, 1.4, 1.4, 'tone'],
    [36, -36, 1.4, 1.4, 1.4, 'fill'],
  ];
  for (const [x, z, sx, sy, sz, st] of blocks) box(x, 0, z, sx, sy, sz, st);
  // L-shaped low walls.
  span(-22, 0, 12, -14, 1.3, 12.6, 'brick');
  span(-22, 0, 12, -21.4, 1.3, 18, 'brick');
  span(14, 0, 8, 22, 1.3, 8.6, 'brick');
  span(6, 0, -22, 6.6, 1.6, -16, 'brick');
  span(-30, 0, -4, -24, 2.2, -3.4, 'brick');
  // Stacked pipes (as boxes).
  span(-8, 0, 30, 2, 0.8, 31, 'plain');
  span(-7, 0.8, 30.1, 1, 1.6, 30.9, 'plain');
  // Tall dark slab near the north-east (the hatched wedge from the reference).
  span(30, 0, -42, 40, 12, -38, 'fill');

  const obstacles = boxes.filter((b) => b.max.y > 0.3 && b.min.y < 1.2 && b.min.y > -1);

  const spawnPoints = [
    [-36, -36], [-20, -36], [0, -36], [24, -36], [36, -24],
    [36, 6], [36, 26], [20, 37], [0, 37], [-18, 37],
    [-37, 34], [-37, 8], [-37, -8], [-37, -22],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const setColorMode = (on: boolean) => {
    for (const m of styled) m.material = on ? colorMaterial(m.userData.hue) : styleMaterial(m.userData.style);
  };

  return {
    scene,
    setColorMode,
    boxes,
    obstacles,
    spawnPoints,
    playerSpawn: new THREE.Vector3(0, 0, 18),
    bounds: B,
  };
}
