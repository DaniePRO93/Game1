import * as THREE from 'three';

/**
 * A player drawing converted into a game sprite.
 * Texture channels: R = ink coverage, G = interior fill (paper).
 * Rows are stored bottom-first so v=0 is the drawing's feet.
 */
export interface DoodleSprite {
  texture: THREE.DataTexture;
  /** 1 where the sprite is solid (hittable). Same layout as the texture. */
  mask: Uint8Array;
  width: number;
  height: number;
  /** width / height */
  aspect: number;
  /** Fraction of the box that is solid. */
  coverage: number;
  /** Fraction of solid pixels in the top quarter (headshot zone). */
  headShare: number;
}

const MAX_H = 256;

export function buildSprite(src: HTMLCanvasElement): DoodleSprite | null {
  const sctx = src.getContext('2d')!;
  const full = sctx.getImageData(0, 0, src.width, src.height);

  // Bounding box of ink.
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (full.data[(y * src.width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;

  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(src.width - 1, x1 + pad);
  y1 = Math.min(src.height - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  // Downscale crop to working size.
  const scale = Math.min(1, MAX_H / ch);
  const w = Math.max(8, Math.round(cw * scale));
  const h = Math.max(8, Math.round(ch * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d')!;
  wctx.drawImage(src, x0, y0, cw, ch, 0, 0, w, h);
  const img = wctx.getImageData(0, 0, w, h).data;

  const ink = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = img[i * 4 + 3] / 255;

  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = ink[i] > 0.25 ? 1 : 0;

  // Dilate ink to close small gaps before flood-filling the outside.
  const dil = dilate(solid, w, h, 3);
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!outside[i] && !dil[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  // Thin strokes are hard to hit: thicken the hitbox a little.
  const hitInk = dilate(solid, w, h, 2);
  const data = new Uint8Array(w * h * 4);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = h - 1 - y; // flip: bottom row first
    for (let x = 0; x < w; x++) {
      const si = y * w + x;
      const di = fy * w + x;
      const fill = outside[si] ? 0 : 1;
      data[di * 4] = Math.round(ink[si] * 255);
      data[di * 4 + 1] = fill * 255;
      data[di * 4 + 2] = 0;
      data[di * 4 + 3] = Math.max(Math.round(ink[si] * 255), fill * 255);
      mask[di] = fill || hitInk[si] ? 1 : 0;
    }
  }

  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  let solidCount = 0;
  let headCount = 0;
  const headRow = Math.floor(h * 0.75);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      solidCount++;
      if (y >= headRow) headCount++;
    }
  }

  return {
    texture,
    mask,
    width: w,
    height: h,
    aspect: w / h,
    coverage: solidCount / (w * h),
    headShare: solidCount ? headCount / solidCount : 0,
  };
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || dx * dx + dy * dy > r * r) continue;
          out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** Sample the hit mask at uv (0..1, v up). */
export function maskAt(s: DoodleSprite, u: number, v: number): boolean {
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  return s.mask[Math.floor(v * s.height) * s.width + Math.floor(u * s.width)] === 1;
}
