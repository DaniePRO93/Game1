import * as THREE from 'three';

/**
 * Turns a plainly-lit scene into blue ballpoint pen on ruled notebook paper.
 *
 * Pass 1: world scene → color RT (+depth texture). World materials encode
 *         lighting in R, pattern id in G/R and fill tone in B/R.
 * Pass 2: world scene with normal override → normal RT (for crease edges).
 * Pass 3: fullscreen composite: paper, ruled lines, hatching from lighting,
 *         ink edges from depth+normal discontinuities, all jittered at ~8 fps
 *         ("line boil"). Writes gl_FragDepth so pass 4 depth-tests correctly.
 * Pass 4: overlay scene (drawn sprites: enemies, bullets, FX) on top.
 */

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const frag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float pxScale;
uniform float boil;
uniform float slowmo;
uniform float damage;
uniform float cameraNear;
uniform float cameraFar;
uniform int debugView;
varying vec2 vUv;

const vec3 INK = vec3(0.16, 0.18, 0.52);
const vec3 LAV = vec3(0.71, 0.72, 0.92);
const vec3 RULE = vec3(0.60, 0.70, 0.86);
const vec3 MARGIN = vec3(0.90, 0.52, 0.52);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float linDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = d * 2.0 - 1.0;
  return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

float hatch(vec2 p, float ang, float spacing, float width) {
  vec2 dir = vec2(cos(ang), sin(ang));
  // Slight waviness so lines look hand-drawn.
  float v = dot(p, dir) + (noise(p * 0.05) - 0.5) * 2.0;
  float d = abs(fract(v / spacing) - 0.5) * spacing;
  return 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.9, d);
}

float edgeAt(vec2 uvIn, float t) {
  // Symmetric whole-pixel stencil: depth is nearest-sampled, and an uneven
  // stencil makes the 2nd-derivative test fire on smooth distant ground.
  vec2 uv = (floor(uvIn * resolution) + 0.5) / resolution;
  vec2 o = max(1.0, floor(t + 0.5)) / resolution;
  // Inverse depth is linear in screen space across any plane, so its second
  // derivative is ~0 on flat surfaces at any angle and spikes at silhouettes.
  float dc = 1.0 / linDepth(uv);
  float d1 = 1.0 / linDepth(uv + vec2(o.x, 0.0));
  float d2 = 1.0 / linDepth(uv - vec2(o.x, 0.0));
  float d3 = 1.0 / linDepth(uv + vec2(0.0, o.y));
  float d4 = 1.0 / linDepth(uv - vec2(0.0, o.y));
  float dd = (abs(d1 + d2 - 2.0 * dc) + abs(d3 + d4 - 2.0 * dc)) / max(dc, 1e-4);
  vec3 nc = texture2D(tNormal, uv).xyz;
  float nd = length(texture2D(tNormal, uv + vec2(o.x, 0.0)).xyz - nc)
           + length(texture2D(tNormal, uv - vec2(o.x, 0.0)).xyz - nc)
           + length(texture2D(tNormal, uv + vec2(0.0, o.y)).xyz - nc)
           + length(texture2D(tNormal, uv - vec2(0.0, o.y)).xyz - nc);
  float e = smoothstep(0.015, 0.04, dd);
  e = max(e, smoothstep(0.3, 0.55, nd));
  return e;
}

void main() {
  vec2 css = gl_FragCoord.xy / pxScale;
  vec2 jit = vec2(hash(vec2(boil, 1.3)), hash(vec2(boil, 7.9))) - 0.5;

  // Hand-drawn wobble of the whole image, re-rolled each boil frame.
  vec2 w = vec2(noise(vUv * 24.0 + boil * 3.7), noise(vUv * 24.0 + boil * 5.1 + 17.0)) - 0.5;
  vec2 uv = vUv + w * 2.2 * pxScale / resolution;

  float dRaw = texture2D(tDepth, vUv).x;
  bool geo = texture2D(tDepth, uv).x < 1.0;

  vec3 paper = vec3(0.968, 0.958, 0.925) * (0.975 + 0.025 * noise(css * 0.7));
  vec3 col = paper;

  if (geo) {
    vec4 c = texture2D(tColor, uv);
    float L = clamp(c.r, 0.0, 1.0);
    float inv = 1.0 / max(c.r, 0.02);
    float pat = clamp(c.g * inv, 0.0, 1.0);
    float tone = clamp(c.b * inv, 0.0, 1.0);
    float shade = 1.0 - L;

    // pattern ≈ 0.25 marks "colored ink": tone is then a hue (weapons).
    bool colored = pat > 0.15 && pat < 0.35;
    vec3 hatchInk = INK;
    if (colored) {
      vec3 hc = hsv2rgb(vec3(tone, 0.62, 0.97));
      col = mix(col, hc, 0.9);
      hatchInk = hc * 0.42;
      col = mix(col, hatchInk, smoothstep(0.3, 0.9, shade) * 0.25);
    } else {
      col = mix(col, LAV, tone * 0.85);
      col = mix(col, LAV, smoothstep(0.2, 0.8, shade) * 0.45);
      col = mix(col, vec3(0.56, 0.57, 0.86), step(0.75, pat) * 0.65);
    }

    vec2 hp = css + jit * 3.0;
    float h = 0.0;
    h = max(h, hatch(hp, 0.785, 6.0, 0.9) * smoothstep(0.22, 0.30, shade));
    h = max(h, hatch(hp, -0.785, 6.0, 0.9) * smoothstep(0.42, 0.50, shade));
    h = max(h, hatch(hp, 0.0, 4.0, 0.9) * smoothstep(0.62, 0.70, shade));
    float diamond = max(hatch(hp, 1.05, 5.0, 0.8), hatch(hp, -1.05, 5.0, 0.8));
    h = max(h, diamond * step(0.4, pat) * step(pat, 0.6) * 0.8);
    h *= 0.55 + 0.45 * noise(hp * 0.12);
    col = mix(col, hatchInk, h * 0.7);
  }

  // Faint ruled lines over everything, red margin on the left.
  float m = mod(css.y, 30.0);
  float rule = 1.0 - smoothstep(0.4, 1.3, min(m, 30.0 - m));
  col = mix(col, RULE, rule * (geo ? 0.18 : 0.55));
  float mg = 1.0 - smoothstep(0.5, 1.4, abs(css.x - 64.0));
  col = mix(col, MARGIN, mg * 0.5);

  // Ink outlines. Thicker in slow-mo.
  float t = (1.0 + slowmo) * pxScale;
  float e = edgeAt(uv, t);
  e *= 0.75 + 0.25 * noise(css * 0.3 + boil);
  col = mix(col, INK, clamp(e, 0.0, 1.0));

  // Slow-mo: cooler paper and a scribbled vignette.
  vec2 cuv = vUv - 0.5;
  float r = length(cuv * vec2(resolution.x / resolution.y, 1.0));
  if (slowmo > 0.001) {
    col *= mix(vec3(1.0), vec3(0.9, 0.93, 1.0), slowmo);
    float vig = smoothstep(0.6, 1.0, r) * slowmo;
    float sc = max(hatch(css + jit * 5.0, 0.3, 4.0, 1.2), hatch(css - jit * 4.0, -0.5, 6.0, 1.0));
    col = mix(col, INK, vig * sc * 0.45);
  }
  if (damage > 0.001) {
    float vig = smoothstep(0.35, 0.9, r) * damage;
    float sc = hatch(css + jit * 5.0, -0.6, 5.0, 1.4);
    col = mix(col, vec3(0.82, 0.18, 0.16), vig * (0.35 + sc * 0.5));
  }

  // ?view=1|2|3 shows the color, normal and edge buffers for debugging.
  if (debugView == 1) col = texture2D(tColor, vUv).rgb;
  if (debugView == 2) col = texture2D(tNormal, vUv).rgb;
  if (debugView == 3) col = vec3(1.0 - edgeAt(vUv, pxScale));
  gl_FragColor = vec4(col, 1.0);
  gl_FragDepth = dRaw;
}
`;

export interface FrameParams {
  slowmo: number;
  damage: number;
}

export class PostFX {
  private colorRT: THREE.WebGLRenderTarget;
  private normalRT: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial();
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private boilTimer = 0;
  private boil = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
      type: THREE.HalfFloatType,
    });
    this.normalRT = new THREE.WebGLRenderTarget(1, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tNormal: { value: this.normalRT.texture },
        tDepth: { value: this.colorRT.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        pxScale: { value: 1 },
        boil: { value: 0 },
        slowmo: { value: 0 },
        damage: { value: 0 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        debugView: { value: Number(new URLSearchParams(location.search).get('view') ?? 0) },
      },
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.AlwaysDepth,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    const pw = Math.floor(w * pixelRatio);
    const ph = Math.floor(h * pixelRatio);
    this.colorRT.setSize(pw, ph);
    this.normalRT.setSize(pw, ph);
    this.mat.uniforms.resolution.value.set(pw, ph);
    this.mat.uniforms.pxScale.value = pixelRatio;
  }

  render(
    world: THREE.Scene,
    overlay: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    realDt: number,
    params: FrameParams,
  ): void {
    const r = this.renderer;

    // ~8 fps line boil, slower in slow-mo for a dreamy feel.
    this.boilTimer += realDt;
    const boilRate = 1 / (8 - params.slowmo * 4);
    if (this.boilTimer >= boilRate) {
      this.boilTimer = 0;
      this.boil = (this.boil + 1) % 64;
    }

    r.autoClear = true;
    r.setRenderTarget(this.colorRT);
    r.setClearColor(0x000000, 1);
    r.render(world, camera);

    world.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.normalRT);
    r.render(world, camera);
    world.overrideMaterial = null;

    const u = this.mat.uniforms;
    u.boil.value = this.boil;
    u.slowmo.value = params.slowmo;
    u.damage.value = params.damage;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;

    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);

    r.autoClear = false;
    r.render(overlay, camera);
    r.autoClear = true;
  }
}
