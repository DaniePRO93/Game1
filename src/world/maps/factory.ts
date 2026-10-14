import type { Level } from '../builder';
import { createBuilder } from '../builder';

/**
 * Factory (ink): a yard of conveyor belts that carry you around, a catwalk
 * loop at 5m with steam vents that blow you up to it, pipe racks you have to
 * slide under, and a silo + gantry rail for the high route.
 */
export function buildFactory(): Level {
  const B = 42;
  const b = createBuilder({ id: 'factory', bounds: B, ground: 'white' });
  const { box, span, cyl, stairs, updraft, conveyor, perimeter, paint, v } = b;

  perimeter(5, 'cinder', 'concreteLight', 'brick');

  const CW = 5; // catwalk height
  const R = 24; // catwalk loop half size

  // ── Conveyor belts (a loop around the yard: ride them to cross fast) ──
  paint('asphalt');
  conveyor(-15.2, -30, -12.8, 30, 6);
  conveyor(12.8, -30, 15.2, 30, -6);
  conveyor(-24, 30.8, 30, 33.2, -6);
  conveyor(-24, -33.2, 30, -30.8, 6);

  // ── Catwalk loop at 5m, plus a cross walk through the middle ────────
  const walk = (x0: number, z0: number, x1: number, z1: number) => {
    paint('steel');
    span(x0, CW - 0.2, z0, x1, CW, z1, 'brick');
    // Thin railings on the long sides (visual, so you can jump off anywhere).
    paint('craneYellow');
    if (x1 - x0 > z1 - z0) {
      span(x0, CW + 0.95, z0 - 0.04, x1, CW + 1.0, z0, 'plain', false);
      span(x0, CW + 0.95, z1, x1, CW + 1.0, z1 + 0.04, 'plain', false);
    } else {
      span(x0 - 0.04, CW + 0.95, z0, x0, CW + 1.0, z1, 'plain', false);
      span(x1, CW + 0.95, z0, x1 + 0.04, CW + 1.0, z1, 'plain', false);
    }
  };
  walk(-R, -R - 0.7, R, -R + 0.7);
  walk(-R, R - 0.7, R, R + 0.7);
  walk(-R - 0.7, -R, -R + 0.7, R);
  walk(R - 0.7, -R, R + 0.7, R);
  walk(-0.7, -R, 0.7, R);
  // Posts.
  paint('concreteDark');
  for (const t of [-R, -16, -8, 8, 16, R]) {
    for (const [x, z] of [[t, -R], [t, R], [-R, t], [R, t]]) box(x, 0, z, 0.35, CW - 0.2, 0.35, 'plain');
  }
  for (const z of [-16, 16]) box(0, 0, z, 0.35, CW - 0.2, 0.35, 'plain');
  // Stairs up beside the east and west walks.
  paint('steel');
  stairs(R + 1.4, 10, 'z-', 1.4, 16, 0.3, 0.5, 0, 'plain');
  stairs(-R - 1.4, -10, 'z+', 1.4, 16, 0.3, 0.5, 0, 'plain');
  // Steam vents at two corners blow you up to the catwalk.
  paint('asphalt');
  for (const [x, z] of [[R + 3, -R - 3], [-R - 3, R + 3]]) {
    box(x, 0, z, 2.4, 0.15, 2.4, 'fill');
    updraft(x, z, 1.2, 0.1, 9.5);
  }

  // ── Central machine block with a chimney ─────────────────────────────
  paint('concrete');
  span(-6, 0, -6, 6, 3, 6, 'tone');
  paint('concreteDark');
  span(-4, 3, -4, -1.5, 4.2, -1.5, 'plain', true);
  paint('brickRed');
  cyl(3.5, 3, -3.5, 1.1, 13, 'brick');
  paint('steel');
  box(-3, 0, 6.6, 3, 1.2, 1.2, 'plain'); // step up onto the block
  box(6.6, 0, 2, 1.2, 1.6, 2.4, 'plain');

  // ── Pipe racks: 1.1m under, slide through (or jump over) ────────────
  const rack = (x0: number, z0: number, x1: number, z1: number, base = 0) => {
    const alongX = x1 - x0 > z1 - z0;
    paint('pipeOrange');
    span(x0, base + 1.1, z0, x1, base + 1.75, z1, 'tone');
    paint('steel');
    if (alongX) {
      for (let x = x0; x <= x1 - 0.3; x += Math.max(4, (x1 - x0 - 0.3) / 2)) span(x, base, z0, x + 0.3, base + 1.1, z0 + 0.3, 'plain');
      span(x1 - 0.3, base, z0, x1, base + 1.1, z0 + 0.3, 'plain');
    } else {
      for (let z = z0; z <= z1 - 0.3; z += Math.max(4, (z1 - z0 - 0.3) / 2)) span(x0, base, z, x0 + 0.3, base + 1.1, z + 0.3, 'plain');
      span(x0, base, z1 - 0.3, x0 + 0.3, base + 1.1, z1, 'plain');
    }
  };
  // Over the belts: riding a belt, you have to slide under these.
  rack(-16.5, -1, -11.5, 1, 0.35);
  rack(11.5, 8, 16.5, 10, 0.35);
  rack(2, 30.4, 6, 33.6, 0.35);
  // In the open yard.
  rack(28, 6, 40, 8.4);
  rack(-40, -8, -28, -5.6);
  rack(-8, 12, -6, 22);

  // ── Silo + gantry rail (the high route) ─────────────────────────────
  paint('concreteLight');
  cyl(-34, 0, -35, 4, 12, 'tone');
  paint('concreteDark');
  cyl(-34, 12, -35, 4.2, 0.3, 'plain');
  // Vent next to the silo reaches its top.
  paint('asphalt');
  box(-27.5, 0, -33.5, 2.2, 0.15, 2.2, 'fill');
  updraft(-27.5, -33.5, 1.1, 0.1, 14.5);
  // Gantry rail at 10m along the north side; drop on from the silo.
  paint('craneYellow');
  span(-30, 9.7, -38.6, 30, 10, -37.4, 'brick');
  for (const x of [-20, 0, 20]) box(x, 0, -38, 0.6, 9.7, 0.6, 'brick');
  paint('craneOrange');
  box(8, 10, -38, 2.2, 1.6, 2.2, 'fill'); // trolley = cover up top

  // ── Cover: crates, tanks, a forklift ───────────────────────────────
  paint('wood');
  for (const [x, z, s] of [[-34, 14, 1.6], [-32.4, 14, 1.4], [-33.2, 15.6, 1.2], [34, -14, 1.6], [32.4, -16, 1.4], [20, 18, 1.4], [-20, -18, 1.4], [8, 16, 1.6], [-9, -15, 1.6]] as const) {
    box(x, 0, z, s, s, s, 'fill');
  }
  paint('containerBlue');
  span(18, 0, -20, 22, 1.8, -17, 'tone');
  span(-22, 0, 17, -18, 1.8, 20, 'tone');
  paint('craneYellow');
  box(30, 0, 18, 2, 1.2, 3, 'tone');
  box(30, 1.2, 17.6, 1.6, 1.0, 1.4, 'plain');

  const spawnPoints = [
    [-38, 0], [38, 0], [0, 38], [-36, 38], [36, 38], [38, -24], [-38, 24], [-20, 0], [20, 0], [0, -20], [0, 20], [-30, -24],
  ].map(([x, z]) => v(x, 0, z));

  return b.finish({
    spawnPoints,
    versusSpawns: [
      v(0, CW, -R + 4), v(R, CW, -4), v(-R, CW, 4), v(0, CW, R - 4), v(-34, 12, -35), v(-36, 0, 36), v(36, 0, 36),
      v(36, 0, -36), v(-38, 0, 0), v(38, 0, 0), v(0, 3, 4),
    ],
    playerSpawn: v(0, 0, 36),
    bossSpawn: v(-20, 0, 8),
    idle: { center: v(0, 4, 0), radius: 32, height: 14 },
  });
}
