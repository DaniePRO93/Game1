import type { Level } from '../builder';
import { createBuilder } from '../builder';

/**
 * Treetops (color): five giant trees with wooden decks, joined by rope bridges.
 * Red bounce mushrooms throw you up to the decks, leaf updrafts carry you up
 * to the high lookouts, and hollow logs on the ground are slide-through tunnels.
 */
export function buildTreetops(): Level {
  const B = 40;
  const b = createBuilder({ id: 'treetops', bounds: B, ground: 'grass' });
  const { box, span, cyl, launchPad, updraft, perimeter, paint, v } = b;

  perimeter(5, 'leafDark', 'leaf', 'brick');

  const DECK = 6;
  /** A tree: trunk, square deck around it at `deckY`, leafy canopy on top. */
  const tree = (x: number, z: number, r: number, h: number, half: number, deckY: number) => {
    paint('bark');
    cyl(x, 0, z, r, h, 'tone');
    paint('wood');
    span(x - half, deckY - 0.3, z - half, x + half, deckY, z + half, 'fill');
    // Support struts under the deck corners.
    paint('woodDark');
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(x + dx * (half - 0.3), 0, z + dz * (half - 0.3), 0.3, deckY - 0.3, 0.3, 'plain');
    // Canopy: stacked leaf blobs (visual only so they never trap you).
    paint('leaf');
    cyl(x, h - 1, z, r * 3.6, 3, 'tone', false);
    paint('leafDark');
    cyl(x + r, h + 1.6, z - r, r * 2.6, 2.4, 'tone', false);
    paint('leaf');
    cyl(x - r * 0.8, h + 3.2, z + r * 0.6, r * 1.8, 2, 'tone', false);
  };

  /** Rope bridge: narrow plank walk with rope rails, axis-aligned. */
  const bridge = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const alongX = x1 - x0 > z1 - z0;
    paint('wood');
    span(x0, y - 0.15, z0, x1, y, z1, 'fill');
    // Slats so it reads as a bridge.
    paint('woodDark');
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let i = 0.5; i < len; i += 1.1) {
      if (alongX) span(x0 + i, y, z0, x0 + i + 0.12, y + 0.04, z1, 'plain', false);
      else span(x0, y, z0 + i, x1, y + 0.04, z0 + i + 0.12, 'plain', false);
    }
    // Rope rails (visual) on posts (solid, thin).
    paint('wood');
    if (alongX) {
      span(x0, y + 0.95, z0 - 0.05, x1, y + 1.0, z0, 'plain', false);
      span(x0, y + 0.95, z1, x1, y + 1.0, z1 + 0.05, 'plain', false);
      for (let x = x0 + 2; x < x1 - 1; x += 4) {
        span(x, y, z0 - 0.1, x + 0.12, y + 1.0, z0, 'plain');
        span(x, y, z1, x + 0.12, y + 1.0, z1 + 0.1, 'plain');
      }
    } else {
      span(x0 - 0.05, y + 0.95, z0, x0, y + 1.0, z1, 'plain', false);
      span(x1, y + 0.95, z0, x1 + 0.05, y + 1.0, z1, 'plain', false);
      for (let z = z0 + 2; z < z1 - 1; z += 4) {
        span(x0 - 0.1, y, z, x0, y + 1.0, z + 0.12, 'plain');
        span(x1, y, z, x1 + 0.1, y + 1.0, z + 0.12, 'plain');
      }
    }
  };

  /** Bounce mushroom: stem + red cap that launches you straight up. */
  const mushroom = (x: number, z: number, size: number, up: number) => {
    paint('houseWall');
    cyl(x, 0, z, size * 0.22, 0.9, 'plain');
    paint('mushroomRed');
    launchPad(x, 0.9, z, size, size, { y: up }, 'tone');
    // White spots.
    paint('white');
    for (const [dx, dz] of [[-0.25, -0.2], [0.22, 0.15], [0, 0.3]]) box(x + dx * size, 1.15, z + dz * size, 0.25, 0.04, 0.25, 'plain', false);
  };

  // ── Trees: center giant + four around it ─────────────────────────────
  tree(0, 0, 2.2, 18, 4.5, DECK);
  tree(0, -27, 1.6, 15, 3.5, DECK);
  tree(0, 27, 1.6, 15, 3.5, DECK);
  tree(27, 0, 1.6, 16, 3.5, DECK);
  tree(-27, 0, 1.6, 16, 3.5, DECK);

  // Bridges from the center deck out to each tree.
  bridge(-0.7, -23.5, 0.7, -4.5, DECK);
  bridge(-0.7, 4.5, 0.7, 23.5, DECK);
  bridge(4.5, -0.7, 23.5, 0.7, DECK);
  bridge(-23.5, -0.7, -4.5, 0.7, DECK);

  // High lookouts: center (12m), east and west trees (11m). Ride the updrafts.
  paint('wood');
  span(2.2, 11.7, -3.5, 8.5, 12, 2, 'fill');
  span(28.6, 10.7, -2.5, 33, 11, 2.5, 'fill');
  span(-33, 10.7, -2.5, -28.6, 11, 2.5, 'fill');
  paint('woodDark');
  span(8.4, 12, -3.5, 8.5, 12.9, 2, 'plain');
  span(32.9, 11, -2.5, 33, 11.9, 2.5, 'plain');
  span(-33, 11, -2.5, -32.9, 11.9, 2.5, 'plain');
  updraft(6.2, 3.5, 1.3, 0.2, 14.5);
  updraft(32, 4.5, 1.3, 0.2, 13.5);
  updraft(-32, -4.5, 1.3, 0.2, 13.5);

  // Mushrooms up to the low decks (6m) from the forest floor.
  mushroom(-5.5, -27, 2.2, 17.5);
  mushroom(5.5, 27, 2.2, 17.5);
  mushroom(27, -5.5, 2.2, 17.5);
  mushroom(-27, 5.5, 2.2, 17.5);
  mushroom(-6.8, 6.8, 2.4, 17.5);
  // Small ones for hopping between bushes.
  mushroom(-16, -16, 1.8, 12);
  mushroom(16, 16, 1.8, 12);
  mushroom(16, -18, 1.8, 12);
  mushroom(-18, 16, 1.8, 12);

  // ── Hollow logs: slide through (1.1m inside) ────────────────────────
  const log = (x0: number, z0: number, x1: number, z1: number) => {
    paint('bark');
    const alongX = x1 - x0 > z1 - z0;
    if (alongX) {
      span(x0, 0, z0, x1, 1.1, z0 + 0.3, 'tone');
      span(x0, 0, z1 - 0.3, x1, 1.1, z1, 'tone');
    } else {
      span(x0, 0, z0, x0 + 0.3, 1.1, z1, 'tone');
      span(x1 - 0.3, 0, z0, x1, 1.1, z1, 'tone');
    }
    span(x0, 1.1, z0, x1, 1.5, z1, 'tone');
    paint('leafDark');
    box((x0 + x1) / 2, 1.5, (z0 + z1) / 2, alongX ? 1.4 : 1.2, 0.3, alongX ? 1.2 : 1.4, 'brick', false); // moss
  };
  log(-22, -12, -10, -10);
  log(10, 10, 22, 12);
  log(12, -24, 14, -12);
  log(-14, 12, -12, 24);

  // ── Rocks and bushes for cover ──────────────────────────────────────
  paint('concrete');
  for (const [x, z, s, h] of [[-10, -20, 2.6, 1.4], [20, -8, 2.2, 1.2], [-20, 8, 2.4, 1.6], [10, 20, 2, 1.1], [-34, -30, 3, 1.8], [33, 31, 3, 1.8], [-8, 33, 2.4, 1.2], [8, -34, 2.4, 1.2]]) {
    box(x, 0, z, s, h, s * 0.8, 'tone');
  }
  paint('leafDark');
  for (const [x, z] of [[-30, -16], [30, 16], [-14, -32], [14, 32], [32, -30], [-32, 30], [-8, -8], [8, 8], [20, 30], [-20, -30]]) {
    box(x, 0, z, 2.2, 1.3, 2.2, 'brick');
  }
  paint('mushroomRed');
  for (const [x, z] of [[-24, -24], [24, 24], [24, -26], [-26, 24]]) {
    // Tiny decorative mushrooms (not bouncy).
    box(x, 0, z, 0.25, 0.4, 0.25, 'plain', false);
    box(x, 0.4, z, 0.7, 0.2, 0.7, 'tone', false);
  }

  const spawnPoints = [
    [-34, -34], [0, -36], [34, -34], [36, -12], [36, 14], [34, 34], [0, 36], [-34, 34], [-36, 12], [-36, -14], [-14, -26], [14, 26],
  ].map(([x, z]) => v(x, 0, z));

  return b.finish({
    spawnPoints,
    versusSpawns: [
      v(0, DECK, 3), v(2.6, DECK, -27), v(-2.6, DECK, 27), v(27, DECK, 2.6), v(-27, DECK, -2.6),
      v(-34, 0, -34), v(34, 0, 34), v(34, 0, -34), v(-34, 0, 34), v(5, 12, -1),
    ],
    playerSpawn: v(10, 0, 14),
    bossSpawn: v(-16, 0, -6),
    idle: { center: v(0, 6, 0), radius: 30, height: 12 },
  });
}
