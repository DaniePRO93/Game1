import * as THREE from 'three';

/**
 * Named paints for color mode. A paint material encodes its palette index for
 * the postfx shader: color = (1, PAINT_CODE, (index + 0.5) / PALETTE_SIZE), so
 * R still carries lighting and G/R marks the surface as "paletted".
 * `pattern` adds the diamond crosshatch (bricks, cinder blocks, lattice).
 */
export const PALETTE_SIZE = 32;
export const PAINT_CODE = 0.3;

const PAINTS = {
  white: { hex: '#ffffff', pattern: false },
  concreteLight: { hex: '#d6d8dc', pattern: false },
  concrete: { hex: '#b4b8bf', pattern: false },
  concreteDark: { hex: '#8a8f98', pattern: false },
  cinder: { hex: '#9da2aa', pattern: true },
  asphalt: { hex: '#5d636d', pattern: false },
  steel: { hex: '#7c8794', pattern: false },
  brickRed: { hex: '#e8735a', pattern: true },
  craneYellow: { hex: '#ffd60a', pattern: false },
  craneOrange: { hex: '#ff7a00', pattern: false },
  containerRed: { hex: '#e2402f', pattern: false },
  containerBlue: { hex: '#2d7fe6', pattern: false },
  containerGreen: { hex: '#2fb45f', pattern: false },
  wood: { hex: '#cf9555', pattern: false },
  woodDark: { hex: '#8b5a2b', pattern: false },
  tarpBlue: { hex: '#3a8ff0', pattern: false },
  houseWall: { hex: '#f6dca8', pattern: false },
  roof: { hex: '#a8553a', pattern: false },
  glass: { hex: '#8fdcff', pattern: false },
  pipeOrange: { hex: '#f08a3c', pattern: false },
  safetyGreen: { hex: '#5a8f3c', pattern: false },
  skin: { hex: '#f1c48f', pattern: false },
  sleeve: { hex: '#3c4b78', pattern: true },
} as const;

export type Paint = keyof typeof PAINTS;

const NAMES = Object.keys(PAINTS) as Paint[];
if (NAMES.length > PALETTE_SIZE) throw new Error('palette too large');

/** Uniform arrays for the postfx shader. */
export const paletteColors: THREE.Vector3[] = Array.from({ length: PALETTE_SIZE }, (_, i) => {
  const name = NAMES[i];
  if (!name) return new THREE.Vector3(1, 0, 1);
  const c = new THREE.Color(PAINTS[name].hex);
  return new THREE.Vector3(c.r, c.g, c.b);
});
export const palettePatterns: number[] = Array.from({ length: PALETTE_SIZE }, (_, i) => {
  const name = NAMES[i];
  return name && PAINTS[name].pattern ? 1 : 0;
});

const cache = new Map<Paint, THREE.MeshLambertMaterial>();
export function paintMaterial(name: Paint): THREE.MeshLambertMaterial {
  let m = cache.get(name);
  if (!m) {
    const idx = NAMES.indexOf(name);
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(1, PAINT_CODE, (idx + 0.5) / PALETTE_SIZE) });
    cache.set(name, m);
  }
  return m;
}
