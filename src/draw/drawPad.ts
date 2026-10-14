/**
 * Pre-game drawing pad with three sheets: the regular enemy, the boss, and
 * "you" (your fighter in versus).
 * Strokes persist in localStorage so your doodles come back next session.
 */
import type { Pt, Stroke } from '../game/share';
import { DOODLES } from './doodles';

export type Sheet = 'enemy' | 'boss' | 'me';

const W = 480;
const H = 600;
const INK = '#23287e';
const STORE_KEYS: Record<Sheet, string> = { enemy: 'doodle-fps.enemy.v1', boss: 'doodle-fps.boss.v1', me: 'doodle-fps.me.v1' };

export class DrawPad {
  /** Visible canvas: shows the active sheet. */
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sheets: Record<Sheet, Stroke[]> = { enemy: [], boss: [], me: [] };
  private current: Stroke | null = null;
  sheet: Sheet = 'enemy';
  onChange: () => void = () => {};

  constructor(host: HTMLElement) {
    const guide = document.createElement('canvas');
    guide.width = W;
    guide.height = H;
    guide.className = 'pad-guide';
    drawGuide(guide.getContext('2d')!);

    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = 'pad-ink';
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    host.append(guide, this.canvas);
    this.bind();
    for (const k of ['enemy', 'boss', 'me'] as Sheet[]) this.load(k);
    this.redraw();
  }

  private get strokes(): Stroke[] {
    return this.sheets[this.sheet];
  }

  isEmpty(sheet: Sheet = this.sheet): boolean {
    return this.sheets[sheet].length === 0;
  }

  setSheet(sheet: Sheet): void {
    this.sheet = sheet;
    this.current = null;
    this.redraw();
  }

  getStrokes(sheet: Sheet): Stroke[] {
    return this.sheets[sheet];
  }

  /** Replace a sheet (e.g. from a share link). `persist` false keeps your saved drawing untouched. */
  setStrokes(sheet: Sheet, strokes: Stroke[], persist: boolean): void {
    this.sheets[sheet] = strokes;
    if (persist) this.save(sheet);
    this.redraw();
  }

  undo(): void {
    this.strokes.pop();
    this.redraw();
    this.save(this.sheet);
  }

  clear(): void {
    this.sheets[this.sheet] = [];
    this.redraw();
    this.save(this.sheet);
  }

  private exampleIdx: Record<Sheet, number> = { enemy: 0, boss: 0, me: 0 };
  /** Name of the example last put on a sheet (for the UI). */
  exampleName = '';

  /** Replace the active sheet with the next built-in example (cycles through all of them). */
  example(): void {
    const list = examplesFor(this.sheet);
    const i = (this.exampleIdx[this.sheet] = (this.exampleIdx[this.sheet] + 1) % list.length);
    this.sheets[this.sheet] = list[i].strokes();
    this.exampleName = list[i].name;
    this.redraw();
    this.save(this.sheet);
  }

  /** Fill a sheet with its example if it is empty. */
  ensure(sheet: Sheet): void {
    if (!this.isEmpty(sheet)) return;
    this.sheets[sheet] = exampleFor(sheet);
    this.save(sheet);
    if (sheet === this.sheet) this.redraw();
  }

  /** Render a sheet into an offscreen canvas (for sprite building). */
  renderSheet(sheet: Sheet): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    paint(cv.getContext('2d', { willReadFrequently: true })!, this.sheets[sheet]);
    return cv;
  }

  private bind(): void {
    const toLocal = (e: PointerEvent): Pt => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.current = [toLocal(e)];
      this.strokes.push(this.current);
      this.redraw();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.current) return;
      const p = toLocal(e);
      const last = this.current[this.current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
      this.current.push(p);
      this.redraw();
    });
    const end = () => {
      if (!this.current) return;
      this.current = null;
      this.save(this.sheet);
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  private redraw(): void {
    paint(this.ctx, this.strokes);
    this.onChange();
  }

  private save(sheet: Sheet): void {
    try {
      localStorage.setItem(STORE_KEYS[sheet], JSON.stringify(this.sheets[sheet].map((s) => s.map(([x, y]) => [Math.round(x), Math.round(y)]))));
    } catch {
      /* storage unavailable: drawing just won't persist */
    }
  }

  private load(sheet: Sheet): void {
    try {
      const raw = localStorage.getItem(STORE_KEYS[sheet]);
      if (raw) this.sheets[sheet] = JSON.parse(raw);
    } catch {
      this.sheets[sheet] = [];
    }
  }
}

/** Draw strokes (in pad coordinates) onto a context; `scale` maps the 480×600 pad onto it. */
export function paintStrokes(c: CanvasRenderingContext2D, strokes: Stroke[], scale = 1, ink = INK): void {
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  paint(c, strokes, ink);
  c.restore();
}

export const PAD_W = W;
export const PAD_H = H;

function paint(c: CanvasRenderingContext2D, strokes: Stroke[], ink = INK): void {
  c.clearRect(0, 0, W, H);
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const s of strokes) {
    if (s.length === 1) {
      c.beginPath();
      c.arc(s[0][0], s[0][1], 3.5, 0, Math.PI * 2);
      c.fill();
      continue;
    }
    c.beginPath();
    c.moveTo(s[0][0], s[0][1]);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i][0] + s[i + 1][0]) / 2;
      const my = (s[i][1] + s[i + 1][1]) / 2;
      c.quadraticCurveTo(s[i][0], s[i][1], mx, my);
    }
    const l = s[s.length - 1];
    c.lineTo(l[0], l[1]);
    c.stroke();
  }
}

function drawGuide(c: CanvasRenderingContext2D): void {
  c.clearRect(0, 0, W, H);
  c.strokeStyle = 'rgba(60, 80, 160, 0.18)';
  c.lineWidth = 3;
  c.setLineDash([10, 10]);
  c.beginPath();
  c.arc(W / 2, 130, 70, 0, Math.PI * 2);
  c.moveTo(W / 2 - 60, 220);
  c.lineTo(W / 2 + 60, 220);
  c.lineTo(W / 2 + 70, 400);
  c.lineTo(W / 2 - 70, 400);
  c.closePath();
  c.moveTo(W / 2 - 40, 400);
  c.lineTo(W / 2 - 50, 560);
  c.moveTo(W / 2 + 40, 400);
  c.lineTo(W / 2 + 50, 560);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = 'rgba(60, 80, 160, 0.35)';
  c.font = '18px "Patrick Hand", "Comic Sans MS", cursive';
  c.textAlign = 'center';
  c.fillText('head up here — top quarter = headshots', W / 2, 30);
  c.fillText('feet down here', W / 2, H - 14);
}

function circle(cx: number, cy: number, r: number, n = 28, wob = 0): Stroke {
  const s: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + Math.sin(a * 5) * wob;
    s.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return s;
}

function exampleFor(sheet: Sheet): Stroke[] {
  return sheet === 'boss' ? bossExampleStrokes() : sheet === 'me' ? heroExampleStrokes() : exampleStrokes();
}

/** Examples per sheet: the classic one first, then the ten doodles. */
function examplesFor(sheet: Sheet): { name: string; strokes: () => Stroke[] }[] {
  return [{ name: sheet === 'boss' ? 'The Doodler' : sheet === 'me' ? 'Pencil Kid' : 'Grumpy Guy', strokes: () => exampleFor(sheet) }, ...DOODLES];
}

/** Default "you": a grinning doodle with a cap and a pencil. */
export function heroExampleStrokes(): Stroke[] {
  const cx = W / 2;
  const s: Stroke[] = [];
  s.push(circle(cx, 140, 68, 32, 1.5));
  // Cap.
  s.push([[cx - 66, 120], [cx - 50, 80], [cx, 66], [cx + 50, 80], [cx + 66, 120]]);
  s.push([[cx + 40, 104], [cx + 110, 110]]);
  // Eyes + grin.
  s.push(circle(cx - 24, 140, 7, 10));
  s.push(circle(cx + 24, 140, 7, 10));
  s.push([[cx - 30, 172], [cx - 10, 186], [cx + 10, 186], [cx + 30, 172]]);
  // Body.
  s.push([[cx - 48, 215], [cx - 56, 330], [cx - 46, 400], [cx + 46, 400], [cx + 56, 330], [cx + 48, 215], [cx - 48, 215]]);
  s.push([[cx - 20, 260], [cx + 20, 260]]);
  // Arms: one waving, one holding a pencil.
  s.push([[cx - 52, 235], [cx - 100, 190], [cx - 110, 140]]);
  s.push([[cx + 52, 235], [cx + 105, 290], [cx + 120, 340]]);
  s.push([[cx + 110, 360], [cx + 135, 300], [cx + 150, 306], [cx + 125, 366], [cx + 110, 360]]);
  // Legs.
  s.push([[cx - 28, 400], [cx - 36, 480], [cx - 40, 560], [cx - 70, 566]]);
  s.push([[cx + 28, 400], [cx + 36, 480], [cx + 40, 560], [cx + 70, 566]]);
  return s;
}

export function exampleStrokes(): Stroke[] {
  const cx = W / 2;
  const s: Stroke[] = [];
  s.push(circle(cx, 140, 70, 32, 2));
  // Spiky hair.
  const hair: Stroke = [];
  for (let i = 0; i <= 8; i++) {
    const x = cx - 60 + i * 15;
    hair.push([x, i % 2 ? 50 : 82]);
  }
  s.push(hair);
  // Angry eyes + frown.
  s.push([[cx - 40, 112], [cx - 14, 124]]);
  s.push([[cx + 40, 112], [cx + 14, 124]]);
  s.push(circle(cx - 24, 138, 6, 10));
  s.push(circle(cx + 24, 138, 6, 10));
  s.push([[cx - 26, 180], [cx - 10, 170], [cx + 10, 170], [cx + 26, 180]]);
  // Body.
  s.push([[cx - 50, 215], [cx - 62, 330], [cx - 50, 400], [cx + 50, 400], [cx + 62, 330], [cx + 50, 215], [cx - 50, 215]]);
  // Arms.
  s.push([[cx - 55, 235], [cx - 110, 300], [cx - 120, 360]]);
  s.push([[cx + 55, 235], [cx + 110, 260], [cx + 150, 230]]);
  s.push(circle(cx + 158, 224, 12, 12));
  // Legs.
  s.push([[cx - 30, 400], [cx - 40, 480], [cx - 44, 560], [cx - 72, 566]]);
  s.push([[cx + 30, 400], [cx + 40, 480], [cx + 44, 560], [cx + 72, 566]]);
  return s;
}

/** Default boss: a horned blob monster with a big toothy grin. */
export function bossExampleStrokes(): Stroke[] {
  const cx = W / 2;
  const s: Stroke[] = [];
  // Body blob.
  const body: Stroke = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 170 + Math.sin(a * 6) * 10;
    body.push([cx + Math.cos(a) * r * 0.85, 330 + Math.sin(a) * r]);
  }
  s.push(body);
  // Horns.
  s.push([[cx - 90, 200], [cx - 130, 90], [cx - 60, 180]]);
  s.push([[cx + 90, 200], [cx + 130, 90], [cx + 60, 180]]);
  // Eyes.
  s.push(circle(cx - 55, 270, 22, 16));
  s.push(circle(cx + 55, 270, 22, 16));
  s.push(circle(cx - 55, 274, 7, 8));
  s.push(circle(cx + 55, 274, 7, 8));
  s.push([[cx - 90, 230], [cx - 30, 250]]);
  s.push([[cx + 90, 230], [cx + 30, 250]]);
  // Toothy grin.
  const mouth: Stroke = [];
  for (let i = 0; i <= 10; i++) mouth.push([cx - 90 + i * 18, 360 + (i % 2 ? 22 : 0) + Math.sin((i / 10) * Math.PI) * 30]);
  s.push(mouth);
  s.push([[cx - 90, 360], [cx - 40, 410], [cx + 40, 410], [cx + 90, 360]]);
  // Stubby legs.
  s.push([[cx - 70, 485], [cx - 80, 560], [cx - 30, 560], [cx - 30, 495]]);
  s.push([[cx + 70, 485], [cx + 80, 560], [cx + 30, 560], [cx + 30, 495]]);
  return s;
}
