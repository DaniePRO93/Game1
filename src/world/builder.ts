import * as THREE from 'three';
import { Paint, paintMaterial } from '../render/palette';
import type { Box, Vec3 } from './collision';

/**
 * World materials encode style for the postfx shader:
 *   color = (1, pattern, tone)  →  R = lighting, G/R = pattern, B/R = tone.
 * pattern 0 = plain hatching, 0.2 = colored ink (tone = hue),
 * 0.3 = palette paint (tone = palette index, see render/palette.ts),
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
/** Colored ink (pattern code 0.2, hue in B). Used for weapons. */
export function colorMaterial(hue: number): THREE.MeshLambertMaterial {
  let m = colorCache.get(hue);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(1, 0.2, hue) });
    colorCache.set(hue, m);
  }
  return m;
}

/** Color-mode paint when a box doesn't set one explicitly. */
const DEFAULT_PAINT: Record<Style, Paint> = {
  plain: 'concrete',
  brick: 'brickRed',
  fill: 'wood',
  tone: 'tarpBlue',
};

/** Parkour volumes, checked against the player every frame. */
export type Trigger =
  /** Sets velocity when the player touches it (jump pads, trampolines). Axes left undefined keep their speed. */
  | { kind: 'launch'; box: Box; vel: Partial<Vec3> }
  /** Pushes the player upward while inside (wind / updraft). */
  | { kind: 'updraft'; box: Box; lift: number; maxUp: number }
  /** Carries you along while you stand on it. */
  | { kind: 'conveyor'; box: Box; vel: { x: number; z: number } };

export type MapId = 'construction' | 'rooftops' | 'factory' | 'playground' | 'treetops';

export interface Level {
  id: MapId;
  scene: THREE.Group;
  /** Overlay-pass sprites (arrows, swirls). */
  decor: THREE.Group;
  /** Swap every box between pen-only and real-world color materials. */
  setColorMode: (on: boolean) => void;
  /** Animated decorations (updraft swirls etc.). */
  update: (dt: number) => void;
  /** All collidable boxes (including the ground slab). */
  boxes: Box[];
  /** Boxes that block ground-level walkers (enemies). */
  obstacles: Box[];
  triggers: Trigger[];
  /** Ground-level enemy spawns (solo). */
  spawnPoints: THREE.Vector3[];
  /** Spread-out spawns for versus mode (may be elevated). */
  versusSpawns: THREE.Vector3[];
  playerSpawn: THREE.Vector3;
  bossSpawn: THREE.Vector3;
  /** Point the menu camera orbits around, and its radius/height. */
  idle: { center: THREE.Vector3; radius: number; height: number };
  /** Half size of the walkable square. */
  bounds: number;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);

/** Arrow decal for launch pads (ink on transparent). */
const arrowTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.strokeStyle = '#2a2e85';
  c.lineWidth = 9;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const y of [70, 34]) {
    c.beginPath();
    c.moveTo(30, y + 34);
    c.lineTo(64, y);
    c.lineTo(98, y + 34);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
})();

/** Swirl decal for updrafts. */
const swirlTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.strokeStyle = 'rgba(42, 46, 133, 0.85)';
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 4.2;
    const r = 6 + i * 0.85;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r * 0.55;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
})();

export interface BuildOpts {
  id: MapId;
  bounds: number;
  /** Ground paint in color mode. */
  ground: Paint;
}

/**
 * Small DSL for building maps out of boxes. Every box carries both looks: an
 * ink `style` and a color-mode `paint` (set with `paint(...)` before adding).
 */
export function createBuilder(o: BuildOpts) {
  const scene = new THREE.Group();
  /** Sprites drawn in the overlay pass (not ink-outlined). */
  const decor = new THREE.Group();
  const boxes: Box[] = [];
  const triggers: Trigger[] = [];
  const styled: THREE.Mesh[] = [];
  const animated: ((t: number) => void)[] = [];
  let paint: Paint | null = null;
  let time = 0;

  const addStyled = (m: THREE.Mesh, style: Style) => {
    m.userData.style = style;
    m.userData.paint = paint ?? DEFAULT_PAINT[style];
    styled.push(m);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  /** Box with bottom at y, centered at x/z. */
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, style: Style = 'plain', collide = true) => {
    const m = addStyled(new THREE.Mesh(unitBox, styleMaterial(style)), style);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y + sy / 2, z);
    if (collide) boxes.push({ min: { x: x - sx / 2, y, z: z - sz / 2 }, max: { x: x + sx / 2, y: y + sy, z: z + sz / 2 } });
    return m;
  };
  /** Box from min/max corners. */
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, style: Style = 'plain', collide = true) =>
    box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, style, collide);

  /** Upright cylinder (visual); collides as its bounding square. */
  const cyl = (x: number, y: number, z: number, r: number, h: number, style: Style = 'plain', collide = true) => {
    const m = addStyled(new THREE.Mesh(unitCyl, styleMaterial(style)), style);
    m.scale.set(r * 2, h, r * 2);
    m.position.set(x, y + h / 2, z);
    if (collide) boxes.push({ min: { x: x - r, y, z: z - r }, max: { x: x + r, y: y + h, z: z + r } });
    return m;
  };

  /** Solid staircase rising along `dir` from (x,z): `steps` of `rise` × `run`. */
  const stairs = (x: number, z: number, dir: 'x+' | 'x-' | 'z+' | 'z-', width: number, steps: number, rise: number, run: number, baseY = 0, style: Style = 'plain') => {
    for (let i = 0; i < steps; i++) {
      const h = baseY + rise * (i + 1);
      const along = run * i + run / 2;
      const cx = dir === 'x+' ? x + along : dir === 'x-' ? x - along : x;
      const cz = dir === 'z+' ? z + along : dir === 'z-' ? z - along : z;
      const sx = dir[0] === 'x' ? run : width;
      const sz = dir[0] === 'z' ? run : width;
      box(cx, 0, cz, sx, h, sz, style);
    }
  };

  /**
   * Jump pad: a thin slab you stand on that throws you along `vel`
   * (undefined axes keep the player's speed). Adds a floating arrow decal.
   */
  const launchPad = (x: number, y: number, z: number, sx: number, sz: number, vel: Partial<Vec3>, style: Style = 'fill') => {
    box(x, y, z, sx, 0.25, sz, style);
    const top = y + 0.25;
    triggers.push({ kind: 'launch', box: { min: { x: x - sx / 2, y: top - 0.05, z: z - sz / 2 }, max: { x: x + sx / 2, y: top + 0.35, z: z + sz / 2 } }, vel });
    const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex, transparent: true, depthWrite: false }));
    const s = Math.min(sx, sz) * 0.8;
    arrow.scale.set(s, s, 1);
    arrow.position.set(x, top + 0.6 + s / 2, z);
    decor.add(arrow);
    const phase = x * 0.37 + z * 0.11;
    animated.push((t) => {
      arrow.position.y = top + 0.6 + s / 2 + Math.sin(t * 3 + phase) * 0.15;
    });
  };

  /** Updraft column: lifts you while you're inside. Swirl decals drift up through it. */
  const updraft = (x: number, z: number, r: number, y0: number, y1: number, lift = 34, maxUp = 11) => {
    triggers.push({ kind: 'updraft', box: { min: { x: x - r, y: y0, z: z - r }, max: { x: x + r, y: y1, z: z + r } }, lift, maxUp });
    const n = Math.max(3, Math.round((y1 - y0) / 2.5));
    for (let i = 0; i < n; i++) {
      const sw = new THREE.Sprite(new THREE.SpriteMaterial({ map: swirlTex, transparent: true, depthWrite: false, opacity: 0.7 }));
      sw.scale.set(r * 1.6, r * 0.9, 1);
      decor.add(sw);
      const off = i / n;
      animated.push((t) => {
        const k = (off + t * 0.25) % 1;
        sw.position.set(x + Math.sin(t + i) * 0.2, y0 + k * (y1 - y0), z);
        sw.material.opacity = Math.sin(k * Math.PI) * 0.75;
      });
    }
  };

  /**
   * Conveyor belt along its long axis, `speed` m/s (negative = toward -x/-z).
   * 0.35m tall so you can step onto it. Chevrons on top show the direction.
   */
  const conveyor = (x0: number, z0: number, x1: number, z1: number, speed: number) => {
    const alongX = x1 - x0 > z1 - z0;
    const h = 0.35;
    box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, 'tone');
    triggers.push({
      kind: 'conveyor',
      box: { min: { x: x0, y: h - 0.05, z: z0 }, max: { x: x1, y: h + 0.4, z: z1 } },
      vel: { x: alongX ? speed : 0, z: alongX ? 0 : speed },
    });
    const len = alongX ? x1 - x0 : z1 - z0;
    const wid = alongX ? z1 - z0 : x1 - x0;
    const n = Math.max(2, Math.floor(len / 3));
    const mat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, opacity: 0.8 });
    // Arrow texture points "up" (+v); lay it flat and turn it to face the belt direction.
    const yaw = alongX ? (speed > 0 ? -Math.PI / 2 : Math.PI / 2) : speed > 0 ? Math.PI : 0;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.7, wid * 0.7), mat);
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.rotateZ(yaw);
      decor.add(m);
      animated.push((t) => {
        const k = (((i / n + (t * speed) / len) % 1) + 1) % 1;
        const a = alongX ? x0 + k * len : z0 + k * len;
        m.position.set(alongX ? a : (x0 + x1) / 2, h + 0.02, alongX ? (z0 + z1) / 2 : a);
      });
    }
  };

  // Ground: collision slab + visible plane.
  boxes.push({ min: { x: -200, y: -2, z: -200 }, max: { x: 200, y: 0, z: 200 } });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), styleMaterial('plain'));
  ground.rotation.x = -Math.PI / 2;
  paint = o.ground;
  addStyled(ground, 'plain');
  ground.castShadow = false;
  paint = null;

  /** Perimeter wall of height h around the square, with a cap. */
  const perimeter = (h: number, wall: Paint, cap: Paint, style: Style = 'brick') => {
    const B = o.bounds;
    paint = wall;
    span(-B - 1, 0, -B - 1, B + 1, h, -B, style);
    span(-B - 1, 0, B, B + 1, h, B + 1, style);
    span(-B - 1, 0, -B, -B, h, B, style);
    span(B, 0, -B, B + 1, h, B, style);
    paint = cap;
    for (const [x0, z0, x1, z1] of [
      [-B - 1.3, -B - 1.3, B + 1.3, -B + 0.3],
      [-B - 1.3, B - 0.3, B + 1.3, B + 1.3],
      [-B - 1.3, -B, -B + 0.3, B],
      [B - 0.3, -B, B + 1.3, B],
    ]) {
      span(x0, h, z0, x1, h + 0.4, z1, 'plain', false);
    }
    paint = null;
  };

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  return {
    scene,
    boxes,
    triggers,
    box,
    span,
    cyl,
    stairs,
    launchPad,
    updraft,
    conveyor,
    perimeter,
    v,
    /** Set the color-mode paint for boxes added next (null = default by style). */
    paint: (p: Paint | null) => {
      paint = p;
    },
    finish(rest: Omit<Level, 'id' | 'scene' | 'decor' | 'setColorMode' | 'update' | 'boxes' | 'obstacles' | 'triggers' | 'bounds'>): Level {
      const obstacles = boxes.filter((b) => b.max.y > 0.3 && b.min.y < 1.2 && b.min.y > -1);
      return {
        id: o.id,
        scene,
        decor,
        boxes,
        obstacles,
        triggers,
        bounds: o.bounds,
        setColorMode: (on: boolean) => {
          for (const m of styled) m.material = on ? paintMaterial(m.userData.paint) : styleMaterial(m.userData.style);
        },
        update: (dt: number) => {
          time += dt;
          for (const f of animated) f(time);
        },
        ...rest,
      };
    },
  };
}

export type Builder = ReturnType<typeof createBuilder>;
