import * as THREE from 'three';

export const INK_BLUE = new THREE.Color('#2a2e85');
export const INK_RED = new THREE.Color('#c0302a');
export const INK_DARK = new THREE.Color('#14163f');
export const PAPER = new THREE.Color('#f7f4ec');

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Orange starburst with ink outline (muzzle flash / impact). */
export const starTex = canvasTex(128, 128, (c) => {
  c.translate(64, 64);
  c.beginPath();
  const n = 9;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? rnd(18, 26) : rnd(46, 60);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.fillStyle = '#f0a640';
  c.fill();
  c.strokeStyle = '#a5561a';
  c.lineWidth = 4;
  c.stroke();
});

/** Ink splat for bullet impacts. */
export const splatTex = canvasTex(64, 64, (c) => {
  c.fillStyle = '#2a2e85';
  c.beginPath();
  c.arc(32, 32, 10, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 7; i++) {
    const a = rnd(0, Math.PI * 2);
    const d = rnd(12, 26);
    c.beginPath();
    c.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, rnd(2, 5), 0, Math.PI * 2);
    c.fill();
  }
});

/**
 * Paint splats: white (tinted per use) with a slightly darker rim and a few
 * drips, in a handful of random shapes.
 */
export const paintTexes: THREE.CanvasTexture[] = Array.from({ length: 5 }, () =>
  canvasTex(128, 128, (c) => {
    const blob = (fill: string, grow: number) => {
      c.fillStyle = fill;
      c.beginPath();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 30 + grow + rnd(-7, 9);
        const x = 64 + Math.cos(a) * r;
        const y = 64 + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      for (let i = 0; i < 9; i++) {
        const a = rnd(0, Math.PI * 2);
        const d = rnd(40, 58);
        c.beginPath();
        c.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(2, 6) + grow * 0.3, 0, Math.PI * 2);
        c.fill();
      }
    };
    blob('rgb(170,170,170)', 3);
    blob('rgb(255,255,255)', 0);
    // Drips.
    c.fillStyle = 'rgb(240,240,240)';
    for (let i = 0; i < 3; i++) {
      const x = rnd(44, 84);
      c.fillRect(x, 64, rnd(3, 6), rnd(30, 56));
      c.beginPath();
      c.arc(x + 2.5, 64 + rnd(34, 58), 4, 0, Math.PI * 2);
      c.fill();
    }
  }),
);

/** White droplets, tinted per use (enemy ink, eraser crumbs). */
export const dropTex = canvasTex(64, 64, (c) => {
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(32, 32, 14, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 5; i++) {
    const a = rnd(0, Math.PI * 2);
    const d = rnd(14, 24);
    c.beginPath();
    c.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, rnd(2, 5), 0, Math.PI * 2);
    c.fill();
  }
});

/** Scribbled oval drop-shadow placed under enemies. */
export const shadowTex = canvasTex(128, 64, (c) => {
  c.strokeStyle = 'rgba(42,46,133,0.7)';
  c.lineWidth = 2.5;
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.ellipse(64 + rnd(-4, 4), 32 + rnd(-2, 2), rnd(30, 56), rnd(10, 24), rnd(-0.1, 0.1), 0, Math.PI * 2);
    c.stroke();
  }
});

/** Red target marker for pickups (from the reference screenshots). */
export function markerTex(kind: 'ammo' | 'health'): THREE.CanvasTexture {
  return canvasTex(64, 64, (c) => {
    c.fillStyle = '#f7f4ec';
    c.strokeStyle = '#2a2e85';
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(6, 6, 52, 52, 6);
    c.fill();
    c.stroke();
    c.strokeStyle = '#c0302a';
    c.fillStyle = '#c0302a';
    c.lineWidth = 5;
    if (kind === 'ammo') {
      c.beginPath();
      c.arc(32, 32, 14, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(32, 32, 5, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillRect(27, 16, 10, 32);
      c.fillRect(16, 27, 32, 10);
    }
  });
}

export const sunTex = canvasTex(256, 256, (c) => {
  c.translate(128, 128);
  c.strokeStyle = '#2a2e85';
  c.lineWidth = 5;
  c.beginPath();
  c.arc(0, 0, 52, Math.PI, Math.PI * 2.02);
  c.stroke();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    c.beginPath();
    c.moveTo(Math.cos(a) * 70, Math.sin(a) * 70);
    c.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
    c.stroke();
  }
});

/** Color-mode sun: a vivid yellow disc with rays. */
export const sunColorTex = canvasTex(256, 256, (c) => {
  c.translate(128, 128);
  c.fillStyle = '#ffd400';
  c.strokeStyle = '#f08a00';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(0, 0, 52, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.lineWidth = 8;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.cos(a) * 68, Math.sin(a) * 68);
    c.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
    c.strokeStyle = '#ffc400';
    c.stroke();
  }
});

/** Color-mode cloud: pure white puffs. */
export const cloudColorTex = canvasTex(256, 128, (c) => {
  c.strokeStyle = 'rgba(42,46,133,0.45)';
  c.fillStyle = '#ffffff';
  c.lineWidth = 4;
  const puffs = [
    [70, 80, 34],
    [115, 60, 42],
    [165, 74, 34],
    [195, 88, 24],
  ];
  c.beginPath();
  for (const [x, y, r] of puffs) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
  c.fill();
  for (const [x, y, r] of puffs) {
    c.beginPath();
    c.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15);
    c.stroke();
  }
});

export const cloudTex = canvasTex(256, 128, (c) => {
  c.strokeStyle = 'rgba(42,46,133,0.55)';
  c.fillStyle = '#f7f4ec';
  c.lineWidth = 4;
  const puffs = [
    [70, 80, 34],
    [115, 60, 42],
    [165, 74, 34],
    [195, 88, 24],
  ];
  c.beginPath();
  for (const [x, y, r] of puffs) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
  c.fill();
  for (const [x, y, r] of puffs) {
    c.beginPath();
    c.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15);
    c.stroke();
  }
});

/** Shared material for a flat ink sprite with alpha. */
export function spriteMaterial(map: THREE.Texture, opts: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...opts });
}

/**
 * Material for player-drawn doodles. Reads ink (R) and interior fill (G),
 * recolors ink, supports hit flash, a bottom-up "being drawn" reveal and
 * sub-rect UVs so death shards can reuse it.
 */
export function doodleMaterial(map: THREE.Texture, ink: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      inkColor: { value: ink.clone() },
      paper: { value: PAPER.clone() },
      flash: { value: 0 },
      reveal: { value: 1 },
      opacity: { value: 1 },
      uvOffset: { value: new THREE.Vector2(0, 0) },
      uvScale: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uvOffset;
      uniform vec2 uvScale;
      varying vec2 vUv;
      void main() {
        vUv = uv * uvScale + uvOffset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 inkColor;
      uniform vec3 paper;
      uniform float flash;
      uniform float reveal;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        if (vUv.y > reveal + 0.002) discard;
        vec4 t = texture2D(map, vUv);
        float ink = t.r;
        float a = max(ink, t.g);
        if (a < 0.35) discard;
        vec3 col = mix(paper, inkColor, smoothstep(0.15, 0.6, ink));
        // Cartoon hit flash: pure white for the first frames, then a yellow afterglow.
        vec3 flashCol = mix(vec3(1.0, 0.86, 0.22), vec3(1.0), smoothstep(0.55, 0.75, flash));
        col = mix(col, flashCol, smoothstep(0.0, 0.2, flash));
        // Pen tip line at the reveal edge.
        if (reveal < 0.999 && vUv.y > reveal - 0.012) col = inkColor;
        gl_FragColor = vec4(col, opacity);
      }
    `,
    side: THREE.DoubleSide,
    transparent: false,
  });
}

// ── Game-feel effects (muzzle flashes, sparks, confetti, shells) ──────────
// All drawn with wobbly pen strokes so they sit in the notebook look.

const PEN = '#2a2e85';

/** A closed shape through `pts`, each point nudged a little so it looks hand-drawn. */
function wobblyPath(c: CanvasRenderingContext2D, pts: [number, number][], wob = 1.5): void {
  c.beginPath();
  pts.forEach(([x, y], i) => {
    const px = x + rnd(-wob, wob);
    const py = y + rnd(-wob, wob);
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  });
  c.closePath();
}

/** Points of a star with `n` spikes between radius `r0` (inner) and `r1` (outer). */
function starPts(n: number, r0: number, r1: number, jag = 0.25): [number, number][] {
  const out: [number, number][] = [];
  const rot = rnd(0, Math.PI);
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 * rnd(1 - jag, 1 + jag) : r1 * rnd(1 - jag, 1);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

/** Kinds of cartoon muzzle flash. */
export type FlashStyle = 'pop' | 'star' | 'bang' | 'ring' | 'zap';

/**
 * Hand-drawn muzzle flash in a gun's own colors: `hues` are the gun's paint
 * hues (outer fill, inner fill). A few random variants per gun.
 */
export function flashTex(style: FlashStyle, hues: number[]): THREE.CanvasTexture {
  const outer = hsl(hues[0] ?? 0.1, 0.95, 0.6);
  const inner = hsl(hues[1] ?? hues[0] ?? 0.14, 0.95, 0.75);
  return canvasTex(128, 128, (c) => {
    c.translate(64, 64);
    c.lineWidth = 4;
    c.strokeStyle = PEN;
    switch (style) {
      case 'pop':
        wobblyPath(c, starPts(6, 22, 40, 0.15));
        c.fillStyle = outer;
        c.fill();
        c.stroke();
        c.beginPath();
        c.arc(0, 0, 13, 0, Math.PI * 2);
        c.fillStyle = '#fffbe6';
        c.fill();
        break;
      case 'star':
        wobblyPath(c, starPts(9, 20, 60, 0.35));
        c.fillStyle = outer;
        c.fill();
        c.stroke();
        wobblyPath(c, starPts(6, 10, 28, 0.3));
        c.fillStyle = inner;
        c.fill();
        break;
      case 'bang': {
        // Comic "BANG" burst: fat irregular cloud with lettering.
        wobblyPath(c, starPts(12, 40, 62, 0.2), 2.5);
        c.fillStyle = outer;
        c.fill();
        c.lineWidth = 5;
        c.stroke();
        wobblyPath(c, starPts(10, 28, 42, 0.2), 2);
        c.fillStyle = inner;
        c.fill();
        c.rotate(rnd(-0.3, 0.3));
        c.font = '30px Bangers, Impact, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = 5;
        c.strokeStyle = '#fffbe6';
        c.strokeText('BANG', 0, 2);
        c.fillStyle = PEN;
        c.fillText('BANG', 0, 2);
        break;
      }
      case 'ring':
        // Shock ring with speed lines shooting out.
        c.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + rnd(-0.1, 0.1);
          const r0 = rnd(34, 40);
          c.beginPath();
          c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          c.lineTo(Math.cos(a) * rnd(52, 62), Math.sin(a) * rnd(52, 62));
          c.stroke();
        }
        c.lineWidth = 7;
        c.strokeStyle = outer;
        c.beginPath();
        c.ellipse(0, 0, 28, 28, 0, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 2.5;
        c.strokeStyle = PEN;
        c.beginPath();
        c.ellipse(0, 0, 32, 31, rnd(0, 3), 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(0, 0, 14, 0, Math.PI * 2);
        c.fillStyle = inner;
        c.fill();
        c.stroke();
        break;
      case 'zap':
        // Lightning zigzags crackling out of a bright core.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rnd(-0.3, 0.3);
          const pts: [number, number][] = [[0, 0]];
          let r = 0;
          let side = 1;
          while (r < 56) {
            r += rnd(8, 14);
            side = -side;
            const off = side * rnd(5, 10);
            pts.push([Math.cos(a) * r - Math.sin(a) * off, Math.sin(a) * r + Math.cos(a) * off]);
          }
          c.beginPath();
          pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.lineWidth = 8;
          c.strokeStyle = PEN;
          c.stroke();
          c.lineWidth = 4;
          c.strokeStyle = i % 2 ? outer : inner;
          c.stroke();
        }
        c.beginPath();
        c.arc(0, 0, 16, 0, Math.PI * 2);
        c.fillStyle = '#ffffff';
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = PEN;
        c.stroke();
        break;
    }
  });
}

/** Little ink-outlined smoke puff (paper colored, drifts off the muzzle). */
export const puffTex = canvasTex(64, 64, (c) => {
  c.fillStyle = 'rgba(247,244,236,0.9)';
  c.strokeStyle = 'rgba(42,46,133,0.75)';
  c.lineWidth = 3;
  c.beginPath();
  for (const [x, y, r] of [
    [24, 36, 13],
    [38, 30, 15],
    [34, 42, 11],
  ]) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
  c.fill();
  for (const [x, y, r, a0, a1] of [
    [24, 36, 13, 1.6, 4.4],
    [38, 30, 15, 3.6, 7.0],
    [34, 42, 11, 0.2, 2.6],
  ]) {
    c.beginPath();
    c.arc(x, y, r, a0, a1);
    c.stroke();
  }
});

/** White 5-point star with a gray rim; tinted per use (hit sparks). */
export const sparkTex = canvasTex(64, 64, (c) => {
  c.translate(32, 32);
  wobblyPath(c, starPts(5, 10, 26, 0.1), 1);
  c.fillStyle = '#ffffff';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#5a5a5a';
  c.stroke();
});

/** Ink scribble confetti: squiggles, loops and zigzags in white (tinted per use). */
export const scribbleTexes: THREE.CanvasTexture[] = Array.from({ length: 4 }, (_, kind) =>
  canvasTex(64, 64, (c) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 5;
    c.beginPath();
    if (kind === 0) {
      for (let x = 8; x <= 56; x += 2) c.lineTo(x, 32 + Math.sin(x * 0.35) * 10);
    } else if (kind === 1) {
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 5;
        const r = 4 + i * 0.6;
        c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
    } else if (kind === 2) {
      for (let i = 0; i <= 6; i++) c.lineTo(8 + i * 8, i % 2 ? 18 : 46);
    } else {
      for (let i = 0; i <= 3; i++) {
        c.moveTo(14 + i * 9, 50);
        c.quadraticCurveTo(10 + i * 9, 30, 20 + i * 9, 12);
      }
    }
    c.stroke();
  }),
);

/** Rolled-paper shell casing (white with a pen outline; tinted per gun). */
export const shellTex = canvasTex(32, 64, (c) => {
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#3a3a3a';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(8, 6, 16, 52, 4);
  c.fill();
  c.stroke();
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(9, 16);
  c.lineTo(23, 20);
  c.moveTo(9, 30);
  c.lineTo(23, 34);
  c.stroke();
});
