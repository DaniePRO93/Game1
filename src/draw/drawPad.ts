/**
 * Pre-game drawing pad. The player draws the enemy; strokes persist in
 * localStorage so the same doodle comes back next session.
 */

type Pt = [number, number];
type Stroke = Pt[];

const W = 480;
const H = 600;
const INK = '#23287e';
const STORE_KEY = 'doodle-fps.enemy.v1';

export class DrawPad {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;
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
    this.load();
  }

  get isEmpty(): boolean {
    return this.strokes.length === 0;
  }

  undo(): void {
    this.strokes.pop();
    this.redraw();
    this.save();
  }

  clear(): void {
    this.strokes = [];
    this.redraw();
    this.save();
  }

  /** Replace with the built-in example doodle (spiky angry guy). */
  example(): void {
    this.strokes = exampleStrokes();
    this.redraw();
    this.save();
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
      this.save();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  private redraw(): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const s of this.strokes) {
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
    this.onChange();
  }

  private save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.strokes.map((s) => s.map(([x, y]) => [Math.round(x), Math.round(y)]))));
    } catch {
      /* storage unavailable: drawing just won't persist */
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.strokes = JSON.parse(raw);
    } catch {
      this.strokes = [];
    }
    this.redraw();
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
