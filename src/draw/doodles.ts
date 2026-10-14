/**
 * Ten hand-drawn example doodles (pen strokes on the 480×600 pad). Used by the
 * "example" button and as margin sketches around the menus and landing page.
 * Heads sit in the top quarter so they work as enemies (headshots).
 */
import type { Pt, Stroke } from '../game/share';

const W = 480;
const cx = W / 2;

/** Seeded wobble so lines look hand-drawn but the same every time. */
let seed = 1;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647 - 0.5;
}
const j = (p: Pt, a = 1.5): Pt => [p[0] + rnd() * a, p[1] + rnd() * a];

function line(...pts: Pt[]): Stroke {
  const s: Stroke = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
    for (let k = 0; k < n; k++) s.push(j([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]));
  }
  s.push(j(pts[pts.length - 1]));
  return s;
}
function ellipse(x: number, y: number, rx: number, ry: number, from = 0, to = Math.PI * 2, n = 30): Stroke {
  const s: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    s.push(j([x + Math.cos(a) * rx, y + Math.sin(a) * ry], 1.2));
  }
  return s;
}
const circle = (x: number, y: number, r: number, n = 26) => ellipse(x, y, r, r, 0, Math.PI * 2, n);
const dot = (x: number, y: number): Stroke => [[x, y]];
function spiral(x: number, y: number, r: number, turns: number, dir = 1): Stroke {
  const s: Stroke = [];
  const n = Math.round(turns * 24);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = dir * t * turns * Math.PI * 2;
    s.push(j([x + Math.cos(a) * r * t, y + Math.sin(a) * r * t], 0.8));
  }
  return s;
}
function zigzag(x0: number, y0: number, x1: number, y1: number, n: number, amp: number): Stroke {
  const s: Stroke = [];
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = i % 2 ? amp : -amp;
    s.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]);
  }
  return s;
}
function star(x: number, y: number, r: number, pts = 5): Stroke {
  const s: Stroke = [];
  for (let i = 0; i <= pts * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / pts;
    const rr = i % 2 ? r * 0.45 : r;
    s.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return s;
}
/** Two angry/happy eyes with pupils. */
function eyes(x: number, y: number, gap: number, r: number, look = 0): Stroke[] {
  return [circle(x - gap, y, r, 14), circle(x + gap, y, r, 14), dot(x - gap + look, y + 1), dot(x + gap + look, y + 1)];
}
/** Simple stick legs with feet. */
function legs(x: number, y0: number, spread: number, foot = 26): Stroke[] {
  return [
    line([x - spread * 0.5, y0], [x - spread, 520], [x - spread - 4, 565], [x - spread - foot, 568]),
    line([x + spread * 0.5, y0], [x + spread, 520], [x + spread + 4, 565], [x + spread + foot, 568]),
  ];
}

// ── The doodles ──────────────────────────────────────────────────────────
function robot(): Stroke[] {
  const s: Stroke[] = [];
  s.push(line([cx - 70, 70], [cx + 70, 70], [cx + 70, 180], [cx - 70, 180], [cx - 70, 70])); // head
  s.push(line([cx, 70], [cx, 30]), circle(cx, 22, 9, 12)); // antenna
  s.push(line([cx - 46, 105], [cx - 18, 105], [cx - 18, 130], [cx - 46, 130], [cx - 46, 105]));
  s.push(line([cx + 18, 105], [cx + 46, 105], [cx + 46, 130], [cx + 18, 130], [cx + 18, 105]));
  s.push(dot(cx - 32, 117), dot(cx + 32, 117));
  s.push(zigzag(cx - 40, 155, cx + 40, 155, 8, 7)); // grill mouth
  s.push(line([cx - 14, 180], [cx - 14, 196]), line([cx + 14, 180], [cx + 14, 196])); // neck
  s.push(line([cx - 80, 196], [cx + 80, 196], [cx + 80, 400], [cx - 80, 400], [cx - 80, 196])); // body
  s.push(circle(cx - 30, 260, 14, 14), circle(cx + 10, 260, 10, 12), line([cx - 50, 330], [cx + 50, 330]), line([cx - 50, 350], [cx + 30, 350]));
  // Claw arms.
  s.push(line([cx - 80, 220], [cx - 140, 270], [cx - 150, 330]), line([cx - 166, 330], [cx - 150, 345], [cx - 134, 330]));
  s.push(line([cx + 80, 220], [cx + 140, 200], [cx + 170, 150]), line([cx + 158, 142], [cx + 175, 132], [cx + 186, 150]));
  // Tank treads.
  s.push(line([cx - 90, 470], [cx + 90, 470]), ellipse(cx, 520, 110, 50));
  for (const x of [-60, -20, 20, 60]) s.push(circle(cx + x, 520, 14, 12));
  s.push(line([cx - 40, 400], [cx - 40, 470]), line([cx + 40, 400], [cx + 40, 470]));
  return s;
}

function ghost(): Stroke[] {
  const s: Stroke[] = [];
  const body: Stroke = [];
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    body.push(j([cx + Math.cos(a) * 130, 200 + Math.sin(a) * 150]));
  }
  body.push(j([cx + 130, 380]), j([cx + 140, 520]));
  for (let i = 0; i <= 8; i++) body.push(j([cx + 140 - i * 35, 520 + (i % 2 ? 40 : 0)]));
  body.push(j([cx - 130, 380]), j([cx - 130, 200]));
  s.push(body);
  s.push(ellipse(cx - 45, 140, 22, 32, 0, Math.PI * 2, 16), ellipse(cx + 45, 140, 22, 32, 0, Math.PI * 2, 16));
  s.push(circle(cx - 40, 150, 8, 10), circle(cx + 50, 150, 8, 10));
  s.push(ellipse(cx, 230, 30, 36, 0, Math.PI * 2, 18)); // "oooo" mouth
  s.push(line([cx - 130, 300], [cx - 200, 260], [cx - 215, 230]), line([cx + 130, 300], [cx + 200, 330], [cx + 222, 300])); // arms
  // Little "boo" swirls.
  s.push(spiral(cx + 190, 80, 22, 1.6), spiral(cx - 190, 420, 18, 1.4, -1));
  return s;
}

function octopus(): Stroke[] {
  const s: Stroke[] = [];
  s.push(ellipse(cx, 160, 120, 125)); // head
  s.push(...eyes(cx, 160, 44, 22, 4));
  s.push(line([cx - 70, 110], [cx - 25, 125]), line([cx + 70, 110], [cx + 25, 125])); // eyebrows
  s.push(ellipse(cx, 225, 30, 16, 0, Math.PI, 12));
  for (const x of [-60, 60]) s.push(circle(cx + x, 80, 9, 10)); // spots
  // Six curly tentacles.
  const tips: [number, number, number][] = [[-170, 470, -1], [-110, 540, 1], [-40, 560, -1], [40, 560, 1], [110, 540, -1], [170, 470, 1]];
  tips.forEach(([tx, ty, d], i) => {
    const x0 = cx - 90 + i * 36;
    const t = line([x0, 270], [cx + tx * 0.6, 380], [cx + tx, ty - 40]);
    s.push(t);
    s.push(spiral(cx + tx + d * 18, ty - 30, 22, 1.2, d));
  });
  // Suckers on two of them.
  for (const k of [0, 1, 2]) s.push(circle(cx - 120 + k * 10, 340 + k * 40, 5, 8), circle(cx + 120 - k * 10, 340 + k * 40, 5, 8));
  return s;
}

function dino(): Stroke[] {
  const s: Stroke[] = [];
  // Big head facing right.
  s.push(line([cx - 60, 60], [cx + 90, 50], [cx + 150, 90], [cx + 150, 150], [cx + 40, 160], [cx + 20, 210], [cx - 40, 220], [cx - 70, 150], [cx - 60, 60]));
  s.push(circle(cx + 40, 85, 14, 14), dot(cx + 44, 86), line([cx + 20, 65], [cx + 60, 70]));
  s.push(zigzag(cx + 40, 130, cx + 148, 128, 9, 8)); // teeth
  s.push(dot(cx + 130, 70), dot(cx + 138, 72)); // nostrils
  // Body + tail.
  s.push(line([cx - 40, 220], [cx - 120, 300], [cx - 140, 400], [cx - 230, 470], [cx - 120, 450], [cx - 70, 470]));
  s.push(line([cx + 20, 210], [cx + 70, 300], [cx + 70, 420], [cx + 30, 470]));
  // Tiny arms (the joke).
  s.push(line([cx + 55, 270], [cx + 90, 285], [cx + 98, 275]), line([cx + 90, 285], [cx + 100, 292]));
  // Back spikes: little triangles sticking out along the back.
  for (const t of [0.15, 0.4, 0.65]) {
    const x = cx - 40 - 80 * t, y = 220 + 80 * t;
    s.push(line([x, y], [x - 26, y - 8], [x - 12, y + 18]));
  }
  s.push(...legs(cx - 20, 470, 50, 34));
  s.push(line([cx - 90, 330], [cx - 30, 330]), line([cx - 95, 370], [cx - 25, 380])); // belly stripes
  return s;
}

function ninjaCat(): Stroke[] {
  const s: Stroke[] = [];
  s.push(circle(cx, 150, 85, 30)); // head
  s.push(line([cx - 75, 110], [cx - 90, 40], [cx - 35, 75]), line([cx + 75, 110], [cx + 90, 40], [cx + 35, 75])); // ears
  // Headband + flying tails.
  s.push(line([cx - 84, 120], [cx + 84, 120]), line([cx - 84, 138], [cx + 84, 138]));
  s.push(line([cx - 84, 128], [cx - 150, 110], [cx - 200, 125]), line([cx - 84, 132], [cx - 140, 150], [cx - 190, 160]));
  s.push(line([cx - 50, 168], [cx - 18, 160]), line([cx + 50, 168], [cx + 18, 160])); // determined eyes
  s.push(line([cx - 8, 190], [cx, 198], [cx + 8, 190]));
  for (const d of [-1, 1]) for (const y of [192, 204]) s.push(line([cx + d * 30, y], [cx + d * 85, y + (y - 198) * 1.5]));
  s.push(line([cx - 55, 235], [cx - 65, 400], [cx + 65, 400], [cx + 55, 235])); // body
  s.push(line([cx - 60, 300], [cx + 60, 300])); // belt
  // Sword held up.
  s.push(line([cx + 55, 260], [cx + 120, 230], [cx + 135, 200]));
  s.push(line([cx + 135, 200], [cx + 175, 30]), line([cx + 120, 205], [cx + 152, 212]));
  s.push(line([cx - 55, 260], [cx - 120, 300], [cx - 130, 270]));
  // Curly tail.
  s.push(line([cx - 60, 390], [cx - 140, 420]), spiral(cx - 160, 400, 26, 1.3, -1));
  s.push(...legs(cx, 400, 40));
  return s;
}

function alien(): Stroke[] {
  const s: Stroke[] = [];
  s.push(ellipse(cx, 155, 110, 100)); // big head
  // Three eyes.
  s.push(ellipse(cx - 50, 150, 26, 18, 0, Math.PI * 2, 16), ellipse(cx + 50, 150, 26, 18, 0, Math.PI * 2, 16), ellipse(cx, 95, 20, 15, 0, Math.PI * 2, 14));
  s.push(dot(cx - 50, 150), dot(cx + 50, 150), dot(cx, 95));
  s.push(ellipse(cx, 210, 26, 10, 0, Math.PI, 10));
  // Antennae with stars.
  s.push(line([cx - 40, 52], [cx - 70, 30]), star(cx - 76, 24, 13), line([cx + 40, 52], [cx + 80, 32]), star(cx + 86, 26, 13));
  // Skinny body, raygun.
  s.push(line([cx, 255], [cx, 420]), line([cx - 40, 260], [cx + 40, 260], [cx + 30, 420], [cx - 30, 420], [cx - 40, 260]));
  s.push(line([cx - 40, 280], [cx - 110, 330], [cx - 150, 300]));
  s.push(line([cx + 40, 280], [cx + 120, 290]), line([cx + 110, 270], [cx + 170, 270], [cx + 170, 295], [cx + 120, 300], [cx + 110, 270]));
  s.push(line([cx + 175, 282], [cx + 200, 282]), line([cx + 205, 270], [cx + 215, 262]), line([cx + 205, 294], [cx + 215, 302]));
  s.push(...legs(cx, 420, 34, 30));
  return s;
}

function pirateSkeleton(): Stroke[] {
  const s: Stroke[] = [];
  // Tricorn hat.
  s.push(line([cx - 120, 90], [cx - 60, 40], [cx, 60], [cx + 60, 40], [cx + 120, 90], [cx - 120, 90]));
  s.push(...[circle(cx, 65, 10, 10)], line([cx - 8, 58], [cx + 8, 72]), line([cx + 8, 58], [cx - 8, 72])); // skull & bones badge
  // Skull.
  s.push(line([cx - 85, 95], [cx - 90, 170], [cx - 55, 215], [cx + 55, 215], [cx + 90, 170], [cx + 85, 95]));
  s.push(circle(cx - 35, 140, 20, 14), line([cx + 10, 128], [cx + 60, 128], [cx + 60, 155], [cx + 10, 155], [cx + 10, 128])); // eye + patch
  s.push(line([cx - 90, 115], [cx + 90, 140])); // patch strap
  s.push(line([cx - 8, 170], [cx, 182], [cx + 8, 170]));
  for (let x = -40; x <= 40; x += 16) s.push(line([cx + x, 198], [cx + x, 214]));
  // Ribcage + spine.
  s.push(line([cx, 220], [cx, 400]));
  for (let k = 0; k < 4; k++) s.push(ellipse(cx, 260 + k * 32, 60 - k * 6, 12, Math.PI * 0.05, Math.PI * 0.95, 10));
  s.push(ellipse(cx, 410, 45, 20, 0, Math.PI, 10)); // hips
  // Bony arms + hook.
  s.push(line([cx - 55, 240], [cx - 110, 300], [cx - 120, 360]), circle(cx - 120, 368, 8, 8));
  s.push(line([cx + 55, 240], [cx + 120, 290], [cx + 130, 330]), ellipse(cx + 145, 340, 16, 16, Math.PI, Math.PI * 2.4, 12));
  // Peg leg + bony leg.
  s.push(line([cx - 30, 420], [cx - 45, 560], [cx - 75, 565]), line([cx + 30, 420], [cx + 34, 565]), circle(cx + 34, 568, 6, 8));
  return s;
}

function pizzaMonster(): Stroke[] {
  const s: Stroke[] = [];
  // Slice pointing down, crust on top.
  s.push(line([cx - 150, 60], [cx + 150, 60], [cx, 430], [cx - 150, 60]));
  s.push(ellipse(cx, 60, 152, 24, Math.PI, Math.PI * 2, 18)); // crust bump
  for (const [x, y, r] of [[-70, 120, 22], [60, 130, 20], [-10, 210, 18], [40, 270, 14], [-40, 300, 12]] as const) s.push(circle(cx + x, y, r, 14)); // pepperoni
  // Angry face.
  s.push(line([cx - 60, 150], [cx - 20, 168]), line([cx + 60, 150], [cx + 20, 168]));
  s.push(...eyes(cx, 185, 36, 12));
  s.push(ellipse(cx, 240, 34, 18, 0, Math.PI, 12), zigzag(cx - 30, 244, cx + 30, 244, 6, 5));
  // Cheese drips.
  s.push(line([cx - 120, 140], [cx - 125, 200]), circle(cx - 125, 208, 6, 8), line([cx + 100, 200], [cx + 102, 250]), circle(cx + 102, 256, 5, 8));
  // Arms with fork.
  s.push(line([cx - 110, 200], [cx - 180, 240], [cx - 190, 200]));
  s.push(line([cx + 100, 220], [cx + 170, 200], [cx + 175, 120]), line([cx + 160, 120], [cx + 160, 95]), line([cx + 175, 120], [cx + 175, 92]), line([cx + 190, 120], [cx + 190, 95]), line([cx + 160, 120], [cx + 190, 120]));
  s.push(...legs(cx, 420, 30, 30));
  return s;
}

function wizard(): Stroke[] {
  const s: Stroke[] = [];
  // Floppy pointy hat with stars.
  s.push(line([cx - 110, 130], [cx - 20, 20], [cx + 40, 10], [cx + 20, 40], [cx + 110, 130], [cx - 110, 130]));
  s.push(star(cx - 20, 90, 14), star(cx + 30, 70, 10), circle(cx + 50, 110, 5, 8));
  s.push(...eyes(cx, 160, 30, 9, -3));
  s.push(line([cx - 50, 145], [cx - 15, 140]), line([cx + 50, 145], [cx + 15, 140]));
  // Big wavy beard.
  const beard: Stroke = [];
  for (let i = 0; i <= 12; i++) beard.push(j([cx - 70 + i * 11.6, 185 + (i % 2 ? 0 : 6)]));
  s.push(beard);
  s.push(line([cx - 70, 185], [cx - 60, 280], [cx - 20, 330], [cx, 360], [cx + 20, 330], [cx + 60, 280], [cx + 70, 185]));
  s.push(line([cx - 30, 230], [cx - 20, 300]), line([cx + 25, 230], [cx + 15, 300]));
  // Robe.
  s.push(line([cx - 60, 280], [cx - 120, 560], [cx + 120, 560], [cx + 60, 280]));
  s.push(star(cx - 40, 470, 12), star(cx + 50, 420, 10), circle(cx + 10, 520, 6, 8));
  // Staff with swirl.
  s.push(line([cx + 95, 280], [cx + 160, 300]), line([cx + 160, 560], [cx + 165, 130]), spiral(cx + 165, 110, 28, 1.6));
  s.push(line([cx - 90, 300], [cx - 150, 260], [cx - 160, 220]), star(cx - 165, 200, 16)); // spell sparkle
  return s;
}

function cactusCowboy(): Stroke[] {
  const s: Stroke[] = [];
  // Cowboy hat.
  s.push(ellipse(cx, 100, 140, 22), line([cx - 70, 95], [cx - 60, 30], [cx, 45], [cx + 60, 30], [cx + 70, 95]), line([cx - 66, 78], [cx + 66, 78]));
  // Cactus body with arms.
  s.push(line([cx - 70, 110], [cx - 70, 520]), line([cx + 70, 110], [cx + 70, 520]));
  s.push(line([cx - 70, 300], [cx - 140, 300], [cx - 150, 200], [cx - 110, 195], [cx - 105, 260], [cx - 70, 262]));
  s.push(line([cx + 70, 260], [cx + 140, 260], [cx + 150, 160], [cx + 110, 155], [cx + 105, 220], [cx + 70, 222]));
  // Face + mustache.
  s.push(...eyes(cx, 150, 28, 10));
  s.push(line([cx - 50, 195], [cx - 20, 185], [cx, 192], [cx + 20, 185], [cx + 50, 195]), line([cx - 50, 195], [cx - 58, 205]), line([cx + 50, 195], [cx + 58, 205]));
  s.push(ellipse(cx, 215, 18, 8, 0, Math.PI, 10));
  // Spines.
  for (const [x, y] of [[-40, 260], [30, 300], [-20, 350], [40, 390], [-35, 430], [10, 470], [-130, 240], [130, 200]] as const) {
    s.push(line([cx + x - 6, y - 6], [cx + x + 6, y + 6]), line([cx + x + 6, y - 6], [cx + x - 6, y + 6]));
  }
  // Pot instead of legs.
  s.push(line([cx - 100, 520], [cx + 100, 520], [cx + 80, 580], [cx - 80, 580], [cx - 100, 520]), line([cx - 105, 520], [cx + 105, 520]));
  // Sheriff star.
  s.push(star(cx + 35, 330, 16, 6));
  return s;
}

export interface Doodle {
  id: string;
  name: string;
  strokes: () => Stroke[];
}

const make = (f: () => Stroke[], id: number) => () => {
  seed = 1234 + id * 97;
  return f();
};

export const DOODLES: Doodle[] = [
  { id: 'robot', name: 'Tank-Bot', strokes: make(robot, 1) },
  { id: 'ghost', name: 'Boo Sheet', strokes: make(ghost, 2) },
  { id: 'octopus', name: 'Octo-Grump', strokes: make(octopus, 3) },
  { id: 'dino', name: 'Tiny-Arms Rex', strokes: make(dino, 4) },
  { id: 'cat', name: 'Ninja Whiskers', strokes: make(ninjaCat, 5) },
  { id: 'alien', name: 'Three-Eye', strokes: make(alien, 6) },
  { id: 'skeleton', name: 'Captain Bones', strokes: make(pirateSkeleton, 7) },
  { id: 'pizza', name: 'Angry Slice', strokes: make(pizzaMonster, 8) },
  { id: 'wizard', name: 'Doodle Wizard', strokes: make(wizard, 9) },
  { id: 'cactus', name: 'Sheriff Prickles', strokes: make(cactusCowboy, 10) },
];
