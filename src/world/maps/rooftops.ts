import type { Paint } from '../../render/palette';
import type { Level, Style } from '../builder';
import { createBuilder } from '../builder';

/**
 * Rooftops (ink): a city block around a street plaza. The roofs form a loop
 * you can run without touching the street: jumpable gaps, launch vents that
 * throw you up to the next taller roof, and air-con ducts you have to slide
 * under (or double-jump over).
 */
export function buildRooftops(): Level {
  const B = 44;
  const b = createBuilder({ id: 'rooftops', bounds: B, ground: 'white' });
  const { box, span, cyl, stairs, launchPad, perimeter, paint, v } = b;

  perimeter(4, 'concreteDark', 'concreteLight', 'plain');

  interface Bldg {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    h: number;
    wall: Paint;
    style: Style;
  }
  const bldgs: Record<string, Bldg> = {
    A: { x0: -42, z0: -42, x1: -24, z1: -22, h: 8, wall: 'brickRed', style: 'brick' },
    B: { x0: -20, z0: -42, x1: -4, z1: -28, h: 11, wall: 'concreteLight', style: 'tone' },
    C: { x0: 2, z0: -42, x1: 16, z1: -26, h: 6, wall: 'houseWall', style: 'brick' },
    D: { x0: 22, z0: -42, x1: 42, z1: -20, h: 9, wall: 'cinder', style: 'brick' },
    E: { x0: 28, z0: -14, x1: 42, z1: 4, h: 5, wall: 'brickRed', style: 'brick' },
    F: { x0: 24, z0: 10, x1: 42, z1: 26, h: 12, wall: 'concrete', style: 'tone' },
    G: { x0: 6, z0: 30, x1: 22, z1: 42, h: 7, wall: 'houseWall', style: 'brick' },
    H: { x0: -16, z0: 28, x1: 0, z1: 42, h: 9, wall: 'cinder', style: 'brick' },
    I: { x0: -42, z0: 12, x1: -26, z1: 42, h: 6, wall: 'brickRed', style: 'brick' },
    J: { x0: -42, z0: -16, x1: -30, z1: 6, h: 10, wall: 'concreteLight', style: 'tone' },
  };

  for (const k of Object.keys(bldgs)) {
    const { x0, z0, x1, z1, h, wall, style } = bldgs[k];
    paint(wall);
    span(x0, 0, z0, x1, h, z1, style);
    // Roof lip.
    paint('concreteDark');
    span(x0 - 0.15, h, z0 - 0.15, x1 + 0.15, h + 0.25, z1 + 0.15, 'plain', false);
    // Window rows on the faces that look at the plaza (decorative insets).
    paint('glass');
    for (let y = 1.6; y < h - 1; y += 3) {
      for (let x = x0 + 1.5; x < x1 - 1.5; x += 3) {
        if (z1 < 0) span(x, y, z1, x + 1.4, y + 1.4, z1 + 0.06, 'fill', false);
        if (z0 > 0) span(x, y, z0 - 0.06, x + 1.4, y + 1.4, z0, 'fill', false);
      }
      for (let z = z0 + 1.5; z < z1 - 1.5; z += 3) {
        if (x1 < 0) span(x1, y, z, x1 + 0.06, y + 1.4, z + 1.4, 'fill', false);
        if (x0 > 0) span(x0 - 0.06, y, z, x0, y + 1.4, z + 1.4, 'fill', false);
      }
    }
  }
  const top = (k: string) => bldgs[k].h + 0.25;
  // Roof lips are visual only; the walkable roof is the building top.
  const roof = (k: string) => bldgs[k].h;

  /** Air-con duct across a roof: 1.1m of clearance underneath, so slide (C) under it or double-jump over. */
  const duct = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    paint('steel');
    span(x0, y + 1.1, z0, x1, y + 1.9, z1, 'tone');
    // Legs at the ends only, so the middle is open.
    const along = x1 - x0 > z1 - z0;
    paint('concreteDark');
    if (along) {
      span(x0, y, z0, x0 + 0.3, y + 1.1, z1, 'plain');
      span(x1 - 0.3, y, z0, x1, y + 1.1, z1, 'plain');
    } else {
      span(x0, y, z0, x1, y + 1.1, z0 + 0.3, 'plain');
      span(x0, y, z1 - 0.3, x1, y + 1.1, z1, 'plain');
    }
  };

  // ── Roof furniture ───────────────────────────────────────────────────
  duct(-20, -36, -4, -34.6, roof('B'));
  duct(30, -42, 31.4, -20, roof('D'));
  duct(24, 17, 42, 18.4, roof('F'));
  duct(-42, 24, -26, 25.4, roof('I'));

  // Water tower on F.
  paint('woodDark');
  for (const [x, z] of [[34, 20], [38, 20], [34, 24], [38, 24]]) box(x, roof('F'), z, 0.3, 3, 0.3, 'plain');
  paint('wood');
  cyl(36, roof('F') + 3, 22, 2.4, 3.2, 'tone');
  paint('roof');
  cyl(36, roof('F') + 6.2, 22, 2.6, 0.4, 'fill', false);

  // Billboard on B (cover from the plaza).
  paint('steel');
  span(-17, roof('B'), -30, -16.6, roof('B') + 3, -29.6, 'plain');
  span(-8, roof('B'), -30, -7.6, roof('B') + 3, -29.6, 'plain');
  paint('craneYellow');
  span(-18, roof('B') + 3, -30, -6.6, roof('B') + 6, -29.6, 'fill');

  // Rooftop cover crates / chimneys.
  paint('concrete');
  box(-33, roof('A'), -30, 2, 1.4, 2, 'plain');
  box(9, roof('C'), -34, 1.6, 1.2, 1.6, 'tone');
  box(35, roof('E'), -6, 2.4, 1.2, 1.2, 'plain');
  box(14, roof('G'), 36, 1.4, 1.4, 1.4, 'fill');
  box(-8, roof('H'), 35, 3, 1.1, 1, 'plain');
  box(-36, roof('J'), -6, 1.2, 2.2, 1.2, 'brick');

  // ── The roof loop: launch vents that throw you to the next roof ─────
  // Vents use the same look: a slab with ink arrows above it.
  paint('craneOrange');
  launchPad(35, roof('E'), -11.5, 2.4, 2.4, { y: 16.5, z: -10 }); // E → D (north, up 4)
  launchPad(4.5, roof('C'), -32.5, 2.4, 2.4, { y: 16.5, x: -11 }); // C → B (west, up 5)
  launchPad(-33, roof('A'), -24.5, 2.4, 2.4, { y: 13.5, z: 12 }); // A → J (south, up 2)
  launchPad(-28.5, roof('I'), 34, 2.4, 2.4, { y: 15, x: 15 }); // I → H (east, up 3)
  launchPad(19.5, roof('G'), 32.5, 2.4, 2.4, { y: 17, x: 8, z: -11 }); // G → F (up 5)

  // Street vents up to the lowest roofs, so you can always get back up.
  launchPad(25, 0, 1, 2.6, 2.6, { y: 17.5, x: 5 }); // → E
  launchPad(9, 0, -23, 2.6, 2.6, { y: 18, z: -5 }); // → C
  launchPad(-23, 0, 22, 2.6, 2.6, { y: 18, x: -5 }); // → I
  launchPad(14, 0, 27, 2.6, 2.6, { y: 19.5, z: 5 }); // → G

  // Fire escape: stairs up the west face of E.
  paint('steel');
  stairs(27.2, -13.6, 'z+', 1.4, 17, 0.3, 0.55, 0, 'plain');

  // Plank from H out over G (walk off it and drop onto G).
  paint('wood');
  span(-4.2, roof('H') - 0.2, 34, 6, roof('H'), 35, 'fill');

  // ── Street plaza: cars, kiosks, planters, a fountain ─────────────────
  const car = (x: number, z: number, along: 'x' | 'z', color: Paint) => {
    const [sx, sz] = along === 'x' ? [4.2, 1.9] : [1.9, 4.2];
    paint(color);
    box(x, 0, z, sx, 1.0, sz, 'tone');
    box(x, 1.0, z, along === 'x' ? 2.4 : 1.7, 0.7, along === 'x' ? 1.7 : 2.4, 'plain');
  };
  car(-12, -18, 'x', 'containerRed');
  car(6, -16, 'x', 'containerBlue');
  car(20, 6, 'z', 'containerGreen');
  car(-20, 4, 'z', 'craneYellow');
  car(-4, 22, 'x', 'containerBlue');

  paint('concrete');
  cyl(0, 0, 0, 3.2, 0.7, 'tone'); // fountain basin
  paint('concreteLight');
  cyl(0, 0.7, 0, 0.6, 1.8, 'plain');

  paint('woodDark');
  box(-14, 0, 8, 3, 2.4, 2.2, 'fill'); // kiosk
  paint('tarpBlue');
  box(-14, 2.4, 8, 3.6, 0.3, 2.8, 'tone', false);
  paint('woodDark');
  box(12, 0, 14, 2.2, 2.4, 3, 'fill');
  paint('containerRed');
  box(12, 2.4, 14, 2.8, 0.3, 3.6, 'tone', false);

  paint('cinder');
  for (const [x, z] of [[-8, -8], [8, 8], [-8, 10], [10, -6], [-22, -10], [20, -12], [-2, 14]]) box(x, 0, z, 2, 0.8, 2, 'brick');
  // Bus stop shelter.
  paint('steel');
  span(-26, 0, -14, -25.8, 2.6, -13.8, 'plain');
  span(-26, 0, -8, -25.8, 2.6, -7.8, 'plain');
  paint('glass');
  span(-26.2, 2.6, -14.2, -24.6, 2.8, -7.6, 'fill', false);
  span(-26, 0.4, -14, -25.9, 2.4, -7.8, 'fill');

  const spawnPoints = [
    [-20, -24], [0, -22], [18, -22], [24, 0], [20, 26], [0, 26], [-20, 26], [-24, 8], [-24, -18], [-10, 0], [10, 0], [0, -10],
  ].map(([x, z]) => v(x, 0, z));

  return b.finish({
    spawnPoints,
    versusSpawns: [
      v(0, 0, 8), v(-33, top('A') - 0.25, -36), v(-12, roof('B'), -40), v(32, roof('D'), -26), v(34, roof('F'), 12),
      v(14, roof('G'), 40), v(-34, roof('I'), 16), v(-36, roof('J'), 2), v(24, 0, -10), v(-22, 0, -2), v(0, 0, -20),
    ],
    playerSpawn: v(0, 0, 8),
    bossSpawn: v(0, 0, -12),
    idle: { center: v(0, 5, 0), radius: 30, height: 14 },
  });
}
