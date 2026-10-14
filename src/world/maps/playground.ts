import type { Paint } from '../../render/palette';
import type { Level } from '../builder';
import { createBuilder } from '../builder';

/**
 * Playground (color): a giant kids' playground. A climbing fort in the middle
 * with a bridge and a stepped slide, trampolines that bounce you onto the high
 * spots, monkey-bar beams, and crawl tubes you can only get through by sliding.
 */
export function buildPlayground(): Level {
  const B = 38;
  const b = createBuilder({ id: 'playground', bounds: B, ground: 'grass' });
  const { box, span, cyl, stairs, launchPad, perimeter, paint, v } = b;

  perimeter(3, 'wood', 'woodDark', 'fill');

  /** Platform deck on four posts with low rails on the given sides. */
  const deck = (x0: number, z0: number, x1: number, z1: number, y: number, post: Paint, floor: Paint, rails: ('n' | 's' | 'e' | 'w')[]) => {
    paint(post);
    for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) box(x, 0, z, 0.35, y, 0.35, 'plain');
    paint(floor);
    span(x0, y - 0.25, z0, x1, y, z1, 'tone');
    paint(post);
    if (rails.includes('n')) span(x0, y, z0, x1, y + 0.9, z0 + 0.12, 'plain');
    if (rails.includes('s')) span(x0, y, z1 - 0.12, x1, y + 0.9, z1, 'plain');
    if (rails.includes('w')) span(x0, y, z0, x0 + 0.12, y + 0.9, z1, 'plain');
    if (rails.includes('e')) span(x1 - 0.12, y, z0, x1, y + 0.9, z1, 'plain');
  };

  /** Crawl tube: 1.1m inside, so you have to slide (C) through. Walk on top with a double jump. */
  const tube = (x0: number, z0: number, x1: number, z1: number, color: Paint) => {
    paint(color);
    const alongX = x1 - x0 > z1 - z0;
    if (alongX) {
      span(x0, 0, z0, x1, 1.1, z0 + 0.25, 'tone');
      span(x0, 0, z1 - 0.25, x1, 1.1, z1, 'tone');
    } else {
      span(x0, 0, z0, x0 + 0.25, 1.1, z1, 'tone');
      span(x1 - 0.25, 0, z0, x1, 1.1, z1, 'tone');
    }
    span(x0, 1.1, z0, x1, 1.45, z1, 'tone');
    // Rings so it reads as a tube.
    paint('white');
    const n = Math.floor((alongX ? x1 - x0 : z1 - z0) / 3);
    for (let i = 1; i < n; i++) {
      const t = (alongX ? x0 : z0) + i * 3;
      if (alongX) span(t, 1.45, z0 - 0.02, t + 0.25, 1.5, z1 + 0.02, 'plain', false);
      else span(x0 - 0.02, 1.45, t, x1 + 0.02, 1.5, t + 0.25, 'plain', false);
    }
  };

  /** Trampoline: a bouncy mat on a frame. Bounces you straight up. */
  const trampoline = (x: number, z: number, size: number, up: number, mat: Paint) => {
    paint('steel');
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(x + (dx * size) / 2, 0, z + (dz * size) / 2, 0.2, 0.5, 0.2, 'plain');
    paint(mat);
    launchPad(x, 0.5, z, size, size, { y: up }, 'tone');
  };

  // ── Climbing fort ────────────────────────────────────────────────────
  deck(-7, -4, -2, 1, 3, 'containerRed', 'craneYellow', ['n', 'w']);
  deck(4, -4, 9, 1, 3, 'containerBlue', 'craneYellow', ['n', 's']);
  // Top lookout on the east tower.
  paint('containerBlue');
  for (const [x, z] of [[4.2, -3.8], [8.8, -3.8], [4.2, 0.8], [8.8, 0.8]]) box(x, 3, z, 0.3, 2.6, 0.3, 'plain');
  paint('plasticPurple');
  span(4, 5.35, -4, 9, 5.6, 1, 'tone');
  paint('containerRed');
  span(3.8, 5.6, -4.2, 9.2, 5.75, 1.2, 'fill', false); // roof trim
  // Bridge between the towers.
  paint('wood');
  span(-2, 2.8, -2.2, 4, 3, -0.8, 'fill');
  paint('plasticTeal');
  span(-2, 3, -2.3, 4, 3.8, -2.2, 'plain');
  span(-2, 3, -0.8, 4, 3.8, -0.7, 'plain');
  // Stairs up to the west tower from the south.
  paint('plasticPink');
  stairs(-4.5, 5, 'z-', 1.6, 10, 0.3, 0.4, 0, 'plain');
  // Stepped slide down from the east tower, heading east.
  paint('craneYellow');
  stairs(16, -2, 'x-', 1.4, 10, 0.3, 0.7, 0, 'tone');
  paint('craneOrange');
  span(9, 0, -2.9, 16, 0.6, -2.7, 'plain', false);
  span(9, 0, -1.3, 16, 0.6, -1.1, 'plain', false);
  // Trampoline next to the fort reaches the lookout.
  trampoline(6.5, 4.5, 2.6, 18, 'plasticTeal');

  // ── Monkey-bar beams (north-west) ────────────────────────────────────
  paint('plasticPurple');
  for (const x of [-26, -20, -14, -8]) box(x, 0, -14, 0.35, 3.3, 0.35, 'plain');
  paint('steel');
  span(-26, 3.3, -14.25, -8, 3.5, -13.75, 'plain'); // walkable beam
  for (let x = -25.5; x < -8; x += 1.2) span(x, 3.5, -14.6, x + 0.12, 3.62, -13.4, 'plain', false); // rungs
  trampoline(-28.5, -14, 2.4, 14.5, 'plasticPink');
  // Beam runs on to a high lookout platform.
  deck(-8, -17, -4, -11, 3.5, 'plasticPurple', 'plasticTeal', ['n', 'e']);

  // ── Tall tower platform (south-west), reached by a big trampoline ───
  deck(-24, 16, -18, 22, 7, 'containerRed', 'plasticPurple', ['w', 's']);
  paint('containerRed');
  span(-24.2, 7, 15.8, -17.8, 7.15, 16, 'plain', false);
  trampoline(-15, 19, 2.8, 20, 'plasticPink');
  // Ladder-like steps down the east side (one way back).
  paint('craneYellow');
  stairs(-17.5, 23.5, 'z-', 1.2, 10, 0.3, 0.45, 3.9, 'plain');

  // ── Crawl tubes (slide through: C while running) ────────────────────
  tube(-10, 19, 8, 21, 'plasticTeal');
  tube(21, -18, 23, 0, 'plasticPurple');
  tube(-30, -4, -16, -2, 'containerRed');
  tube(12, 26, 28, 28, 'plasticPink');

  // ── Swings, merry-go-round, sandbox, spring riders ──────────────────
  paint('containerBlue');
  for (const x of [16, 26]) {
    span(x - 0.15, 0, -30, x + 0.15, 3.6, -29.7, 'plain');
    span(x - 0.15, 0, -26.3, x + 0.15, 3.6, -26, 'plain');
  }
  span(16, 3.6, -30, 26, 3.85, -26, 'plain', false);
  paint('craneYellow');
  for (const x of [18.5, 21, 23.5]) {
    box(x, 0.7, -28, 1.1, 0.12, 0.6, 'fill', false);
    span(x - 0.5, 0.82, -28.05, x - 0.45, 3.6, -27.95, 'plain', false);
    span(x + 0.45, 0.82, -28.05, x + 0.5, 3.6, -27.95, 'plain', false);
  }
  paint('mushroomRed');
  cyl(-22, 0, -28, 3, 0.45, 'tone');
  paint('white');
  cyl(-22, 0.45, -28, 0.3, 1.4, 'plain');

  paint('sand');
  span(18, 0, 10, 30, 0.08, 20, 'plain', false);
  paint('wood');
  span(17.6, 0, 9.6, 30.4, 0.4, 10, 'fill');
  span(17.6, 0, 20, 30.4, 0.4, 20.4, 'fill');
  span(17.6, 0, 10, 18, 0.4, 20, 'fill');
  span(30, 0, 10, 30.4, 0.4, 20, 'fill');
  paint('plasticTeal');
  box(22, 0.08, 13, 2, 1.2, 2, 'tone'); // sand castle-ish blocks for cover
  paint('plasticPink');
  box(26, 0.08, 17, 1.6, 1.6, 1.6, 'tone');

  for (const [x, z, c] of [[-30, 30, 'plasticTeal'], [30, -6, 'craneOrange'], [0, -30, 'plasticPurple'], [-6, 30, 'craneYellow']] as [number, number, Paint][]) {
    paint('steel');
    box(x, 0, z, 0.25, 0.7, 0.25, 'plain');
    paint(c);
    box(x, 0.7, z, 1.6, 0.9, 0.7, 'tone');
  }

  // Low cover: picnic tables, bins, big toy blocks.
  paint('wood');
  for (const [x, z] of [[-30, 8], [30, 30], [-2, -24], [-14, 30]]) {
    box(x, 0, z, 3, 0.85, 1.4, 'fill');
  }
  const blocks: [number, number, number, Paint][] = [
    [-12, -26, 1.6, 'containerRed'],
    [12, -14, 1.4, 'craneYellow'],
    [-30, 22, 1.5, 'containerBlue'],
    [30, 2, 1.5, 'plasticPurple'],
    [-4, 12, 1.4, 'craneOrange'],
    [12, 8, 1.6, 'plasticTeal'],
    [-16, 6, 1.4, 'containerGreen'],
    [32, -32, 1.6, 'plasticPink'],
  ];
  for (const [x, z, s, c] of blocks) {
    paint(c);
    box(x, 0, z, s, s, s, 'tone');
  }

  const spawnPoints = [
    [-32, -32], [0, -34], [32, -20], [34, 10], [34, 34], [8, 34], [-20, 34], [-34, 12], [-34, -18], [-16, -24], [14, 22], [26, -12],
  ].map(([x, z]) => v(x, 0, z));

  return b.finish({
    spawnPoints,
    versusSpawns: [
      v(0, 0, 10), v(-32, 0, -32), v(32, 0, 34), v(-21, 7, 19), v(6.5, 5.6, -1.5), v(-6, 3.5, -14),
      v(34, 0, -24), v(-34, 0, 30), v(20, 0, 24), v(-4.5, 3, -1.5),
    ],
    playerSpawn: v(0, 0, 12),
    bossSpawn: v(26, 0, 0),
    idle: { center: v(0, 3, 0), radius: 26, height: 10 },
  });
}
