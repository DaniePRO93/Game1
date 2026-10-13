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
        col = mix(col, vec3(0.95, 0.35, 0.2), flash * 0.7);
        // Pen tip line at the reveal edge.
        if (reveal < 0.999 && vUv.y > reveal - 0.012) col = inkColor;
        gl_FragColor = vec4(col, opacity);
      }
    `,
    side: THREE.DoubleSide,
    transparent: false,
  });
}
