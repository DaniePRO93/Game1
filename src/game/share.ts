/**
 * Share links: drawings (and an optional score to beat) packed into the URL
 * hash. Points are delta + zigzag + varint encoded, then deflated when the
 * browser supports CompressionStream, then base64url.
 */
export type Pt = [number, number];
export type Stroke = Pt[];

export interface SharePayload {
  enemy: Stroke[];
  boss: Stroke[];
  score?: number;
  wave?: number;
}

const VERSION = 1;

function zig(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}
function unzig(n: number): number {
  return n & 1 ? -(n + 1) / 2 : n / 2;
}

class Writer {
  bytes: number[] = [];
  varint(n: number): void {
    n = Math.max(0, Math.floor(n));
    while (n >= 0x80) {
      this.bytes.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    this.bytes.push(n);
  }
}

class Reader {
  i = 0;
  constructor(private b: Uint8Array) {}
  varint(): number {
    let n = 0;
    let mul = 1;
    for (;;) {
      if (this.i >= this.b.length) throw new Error('truncated');
      const v = this.b[this.i++];
      n += (v & 0x7f) * mul;
      if (v < 0x80) return n;
      mul *= 128;
    }
  }
}

/** Drop points closer than `minDist` to the previous kept point. */
export function simplify(s: Stroke, minDist = 3): Stroke {
  if (s.length <= 2) return s.map(([x, y]) => [Math.round(x), Math.round(y)]);
  const out: Stroke = [[Math.round(s[0][0]), Math.round(s[0][1])]];
  for (let i = 1; i < s.length - 1; i++) {
    const [px, py] = out[out.length - 1];
    if (Math.hypot(s[i][0] - px, s[i][1] - py) >= minDist) out.push([Math.round(s[i][0]), Math.round(s[i][1])]);
  }
  const l = s[s.length - 1];
  out.push([Math.round(l[0]), Math.round(l[1])]);
  return out;
}

function writeStrokes(w: Writer, strokes: Stroke[]): void {
  w.varint(strokes.length);
  for (const raw of strokes) {
    const s = simplify(raw);
    w.varint(s.length);
    let px = 0;
    let py = 0;
    for (const [x, y] of s) {
      w.varint(zig(x - px));
      w.varint(zig(y - py));
      px = x;
      py = y;
    }
  }
}

function readStrokes(r: Reader): Stroke[] {
  const n = r.varint();
  if (n > 2000) throw new Error('too many strokes');
  const out: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const len = r.varint();
    if (len > 20000) throw new Error('stroke too long');
    const s: Stroke = [];
    let x = 0;
    let y = 0;
    for (let k = 0; k < len; k++) {
      x += unzig(r.varint());
      y += unzig(r.varint());
      s.push([x, y]);
    }
    out.push(s);
  }
  return out;
}

export function packBytes(p: SharePayload): Uint8Array {
  const w = new Writer();
  w.varint(VERSION);
  writeStrokes(w, p.enemy);
  writeStrokes(w, p.boss);
  w.varint(p.score ?? 0);
  w.varint(p.wave ?? 0);
  return new Uint8Array(w.bytes);
}

export function unpackBytes(b: Uint8Array): SharePayload {
  const r = new Reader(b);
  const v = r.varint();
  if (v !== VERSION) throw new Error(`unknown share version ${v}`);
  const enemy = readStrokes(r);
  const boss = readStrokes(r);
  const score = r.varint();
  const wave = r.varint();
  return { enemy, boss, score: score || undefined, wave: wave || undefined };
}

function toB64Url(b: Uint8Array): string {
  let s = '';
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(b: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([b]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Encode to a URL-safe token. 'z' prefix = deflated, 'r' = raw. */
export async function encodeShare(p: SharePayload): Promise<string> {
  const raw = packBytes(p);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const z = await pipe(raw, new CompressionStream('deflate-raw'));
      if (z.length < raw.length) return 'z' + toB64Url(z);
    } catch {
      /* fall through to raw */
    }
  }
  return 'r' + toB64Url(raw);
}

export async function decodeShare(token: string): Promise<SharePayload> {
  const kind = token[0];
  let bytes = fromB64Url(token.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'r') throw new Error('bad share token');
  return unpackBytes(bytes);
}
