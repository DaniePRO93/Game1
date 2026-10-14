import type { Level, Style } from '../builder';
import { createBuilder } from '../builder';

/** The original map: a construction site with a concrete frame, crane and house. Ink look. */
export function buildConstruction(): Level {
  const b = createBuilder({ id: 'construction', bounds: 42, ground: 'white' });
  const { box, span, stairs, perimeter, paint, v } = b;

  const B = 42;

  // Perimeter walls: red brick with concrete caps.
  perimeter(6, 'brickRed', 'concreteLight');

  // ── Scaffold building (the unfinished concrete frame) ──────────────────
  const bx0 = -16, bx1 = 0, bz0 = -19, bz1 = -9;
  const floorH = 3.6;
  const colsX = [bx0 + 0.3, -10.6, -5.3, bx1 - 0.3];
  const colsZ = [bz0 + 0.3, -14, bz1 - 0.3];
  // Shades of grey: light columns, mid slabs, dark railings, cinder walls.
  paint('concreteLight');
  for (const cx of colsX) for (const cz of colsZ) box(cx, 0, cz, 0.6, floorH * 3 + 0.3, 0.6, 'plain');
  for (let lvl = 1; lvl <= 3; lvl++) {
    const y = lvl * floorH;
    paint('concrete');
    span(bx0, y - 0.3, bz0, bx1, y, bz1, lvl === 3 ? 'plain' : 'tone');
    // Railings (skip east side on reachable floors to let stairs in).
    paint('concreteDark');
    span(bx0, y, bz0, bx1, y + 1, bz0 + 0.12, 'plain');
    span(bx0, y, bz1 - 0.12, bx1, y + 1, bz1, 'plain');
    span(bx0, y, bz0, bx0 + 0.12, y + 1, -15, 'plain');
    if (lvl === 3) span(bx1 - 0.12, y, bz0, bx1, y + 1, bz1, 'plain');
    // Half-height interior partitions for cover / visual density.
    if (lvl < 3) {
      paint('cinder');
      span(-12, y, -16.5, -11.8, y + 1.2, -11.5, 'brick');
      paint('concreteDark');
      span(-7, y, -12.5, -3, y + 1.0, -12.3, 'plain');
    }
  }
  // Ground-floor walls partially enclosing the base.
  paint('cinder');
  span(bx0, 0, bz0, -8, 2.4, bz0 + 0.3, 'brick');
  span(-4, 0, bz0, bx1, 2.4, bz0 + 0.3, 'brick');
  span(bx0, 0, -14.5, bx0 + 0.3, 2.4, bz1, 'brick');

  // Stairs: ground → floor 1 on the east side, rising north.
  paint('concrete');
  stairs(0.9, -6.4, 'z-', 1.6, 12, 0.3, 0.9);
  span(0, floorH - 0.3, -19, 1.7, floorH, -17.2, 'tone'); // landing
  // Floor 1 → floor 2, rising south, outside the first flight.
  stairs(2.55, -17.6, 'z+', 1.6, 12, 0.3, 0.38, floorH);
  span(0, 2 * floorH - 0.3, -13.05, 3.4, 2 * floorH, -10.2, 'tone'); // landing
  span(1.7, floorH, -19, 3.4, floorH + 0.3, -17.6, 'tone'); // turn

  // Elevated walkway from floor 1 west to the perimeter wall.
  paint('concrete');
  span(-B, floorH - 0.4, -15, bx0, floorH, -13, 'tone');
  paint('steel');
  span(-B, floorH, -15, bx0, floorH + 0.9, -14.88, 'plain');
  span(-B, floorH, -13.12, bx0, floorH + 0.9, -13, 'plain');
  paint('concreteDark');
  for (const px of [-36, -28, -21]) box(px, 0, -14, 0.7, floorH - 0.4, 0.7, 'brick');

  // ── Tower crane ───────────────────────────────────────────────────────
  // Vivid yellow lattice and jib, orange cab/counterweight/hook.
  const cx = 12, cz = -30;
  paint('concreteDark');
  box(cx, 0, cz, 3, 0.8, 3, 'plain');
  paint('craneYellow');
  box(cx, 0.8, cz, 1.4, 23, 1.4, 'brick');
  paint('craneOrange');
  box(cx, 22, cz + 0.2, 2, 2, 2.2, 'tone', false); // cab
  paint('craneYellow');
  span(cx - 9, 24, cz - 0.4, cx + 24, 24.8, cz + 0.4, 'brick', false); // jib
  paint('craneOrange');
  span(cx - 9, 22.2, cz - 1, cx - 5, 24, cz + 1, 'fill', false); // counterweight
  paint('craneYellow');
  box(cx, 24.8, cz, 0.5, 4, 0.5, 'plain', false); // mast top
  paint('asphalt');
  box(cx + 21, 13, cz, 0.08, 11, 0.08, 'plain', false); // cable
  paint('craneOrange');
  box(cx + 21, 12.2, cz, 0.7, 0.8, 0.7, 'fill', false); // hook

  // ── Small house with roof access ───────────────────────────────────────
  const hx0 = 13.5, hx1 = 22.5, hz0 = -8, hz1 = 0, hh = 6;
  paint('houseWall');
  span(hx0, 0, hz0, hx1, hh, hz1, 'brick');
  paint('roof');
  span(hx0 - 0.2, hh, hz0 - 0.2, hx1 + 0.2, hh + 0.3, hz1 + 0.05, 'plain');
  // Windows/door as inset dark panels.
  paint('glass');
  for (const wx of [15.5, 20.5]) span(wx - 0.9, 3, hz1, wx + 0.9, 4.6, hz1 + 0.06, 'fill', false);
  paint('woodDark');
  span(hx0 - 0.06, 0, -3, hx0, 2.4, -1.4, 'fill', false); // door
  paint('glass');
  span(hx0 - 0.06, 3, -6.5, hx0, 4.6, -4.5, 'fill', false);
  // Roof railings.
  paint('steel');
  span(hx0, hh + 0.3, hz0, hx1, hh + 1.3, hz0 + 0.12, 'plain');
  span(hx1 - 0.12, hh + 0.3, hz0, hx1, hh + 1.3, hz1, 'plain');
  // Stairs along the south face, rising west; step off north onto the roof.
  paint('concrete');
  stairs(25.5, 1.0, 'x-', 1.8, 21, 0.3, 0.52);

  // ── Shipping containers ────────────────────────────────────────────────
  paint('containerRed');
  span(26, 0, 14, 32, 2.6, 16.4, 'tone');
  paint('containerBlue');
  span(26, 0, 17.4, 32, 2.6, 19.8, 'brick');
  paint('containerGreen');
  span(26.5, 2.6, 15.2, 32.5, 5.2, 17.6, 'tone');
  paint('containerBlue');
  span(-34, 0, 20, -31.6, 2.6, 26, 'tone');
  // Props below use their style's default paint (concrete, crates, tarps, bricks).
  paint(null);

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
  paint('pipeOrange');
  span(-8, 0, 30, 2, 0.8, 31, 'plain');
  span(-7, 0.8, 30.1, 1, 1.6, 30.9, 'plain');
  // Tall dark slab near the north-east (the hatched wedge from the reference).
  paint('asphalt');
  span(30, 0, -42, 40, 12, -38, 'fill');


  const spawnPoints = [
    [-36, -36], [-20, -36], [0, -36], [24, -36], [36, -24],
    [36, 6], [36, 26], [20, 37], [0, 37], [-18, 37],
    [-37, 34], [-37, 8], [-37, -8], [-37, -22],
  ].map(([x, z]) => v(x, 0, z));

  return b.finish({
    spawnPoints,
    versusSpawns: [
      v(0, 0, 18), v(-36, 0, -36), v(36, 0, 26), v(-30, 0, 30), v(30, 0, -18),
      v(-8, 3.6, -16), v(18, 6.3, -4), v(-37, 0, 0), v(20, 0, 37), v(36, 0, -36),
    ],
    playerSpawn: v(0, 0, 18),
    bossSpawn: v(34, 0, 8),
    idle: { center: v(0, 4, -8), radius: 30, height: 9 },
  });
}
