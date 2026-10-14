import { pitchJitter } from './juice';
import type { WeaponId } from './weapons';

/** Where a sound goes: `bus` gets ducked under big shots, `front` (the big shots themselves) doesn't. */
interface Out {
  dest?: AudioNode;
  /** Seconds from now. */
  delay?: number;
  /** -1 left .. 1 right. */
  pan?: number;
}

/** Tiny WebAudio synth: no asset files. Everything goes through a lowpass that closes in slow-mo. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  /** Everything except big shots; ducks briefly under them. */
  private bus!: GainNode;
  private front!: GainNode;
  muted = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.master = c.createGain();
    this.master.gain.value = 0.5;
    this.filter.connect(this.master).connect(c.destination);
    this.bus = c.createGain();
    this.front = c.createGain();
    this.bus.connect(this.filter);
    this.front.connect(this.filter);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setSlowmo(k: number): void {
    if (!this.ctx) return;
    this.filter.frequency.setTargetAtTime(18000 - k * 16800, this.ctx.currentTime, 0.05);
  }

  /** Route through an optional stereo panner to `out.dest` (default: the duckable bus). */
  private route(node: AudioNode, out: Out): void {
    const c = this.ctx!;
    const dest = out.dest ?? this.bus;
    if (out.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = out.pan;
      node.connect(p).connect(dest);
    } else node.connect(dest);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number, out: Out = {}): void {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + (out.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g);
    this.route(g, out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'square', out: Out = {}): void {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + (out.delay ?? 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    this.route(g, out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Tone with a wobbling pitch (boing, squeak). `rate` Hz, `depth` 0..1 of the pitch. */
  private wobble(dur: number, f0: number, f1: number, gain: number, rate: number, depth: number, type: OscillatorType = 'triangle', out: Out = {}): void {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + (out.delay ?? 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = rate;
    const lg = c.createGain();
    lg.gain.setValueAtTime(f0 * depth, t);
    lg.gain.exponentialRampToValueAtTime(Math.max(1, f1 * depth * 0.2), t + dur);
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    this.route(g, out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }

  /** Big shots push everything else down for a moment so they hit harder. */
  private duck(amount: number, hold: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const g = this.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - amount, t + 0.01);
    g.setTargetAtTime(1, t + hold, 0.08);
  }

  /** Low sub "thump" under heavy shots. */
  private thump(gain: number, f0 = 110): void {
    this.tone(0.16, f0, 38, gain, 'sine', { dest: this.front });
  }

  /**
   * Gunshot in three layers (transient click, body, short tail), each shot
   * pitched ±8% so automatic fire doesn't sound like a loop.
   */
  shot(id: WeaponId): void {
    if (!this.ctx) return;
    const p = pitchJitter();
    const out: Out = { dest: this.front };
    const click = (f: number, g: number) => this.burst(0.014, f * p, 0.7, g, 'highpass', undefined, out);
    switch (id) {
      case 'rifle':
        click(5000, 0.35);
        this.burst(0.08, 1800 * p, 0.8, 0.45, 'bandpass', undefined, out);
        this.tone(0.06, 180 * p, 60, 0.22, 'square', out);
        this.burst(0.16, 700 * p, 0.6, 0.12, 'lowpass', 200, out);
        break;
      case 'shotgun':
        click(4000, 0.5);
        this.burst(0.25, 900 * p, 0.5, 0.85, 'lowpass', 200, out);
        this.tone(0.15, 120 * p, 40, 0.35, 'square', out);
        this.burst(0.45, 500 * p, 0.5, 0.18, 'lowpass', 90, out);
        this.thump(0.7, 95 * p);
        // Pump: two clacks after the blast.
        this.burst(0.04, 3200, 3, 0.25, 'bandpass', undefined, { delay: 0.28 });
        this.burst(0.05, 2200, 3, 0.28, 'bandpass', undefined, { delay: 0.4 });
        this.duck(0.55, 0.12);
        break;
      case 'pistol':
        click(6000, 0.3);
        this.burst(0.07, 2400 * p, 1, 0.4, 'bandpass', undefined, out);
        this.tone(0.05, 260 * p, 90, 0.18, 'square', out);
        this.burst(0.12, 900 * p, 0.6, 0.08, 'lowpass', 250, out);
        break;
      case 'sniper':
        click(5000, 0.5);
        this.burst(0.4, 3000 * p, 0.4, 0.85, 'lowpass', 150, out);
        this.tone(0.3, 220 * p, 30, 0.45, 'sawtooth', out);
        this.burst(0.7, 400 * p, 0.4, 0.15, 'lowpass', 60, out);
        this.thump(0.8, 120 * p);
        this.duck(0.6, 0.18);
        break;
      case 'minigun':
        click(5500, 0.22);
        this.burst(0.05, 2000 * p, 0.9, 0.3, 'bandpass', undefined, out);
        this.tone(0.04, 150 * p, 70, 0.15, 'square', out);
        break;
      case 'railgun':
        click(7000, 0.4);
        this.tone(0.5, 1400 * p, 90, 0.4, 'sawtooth', out);
        this.burst(0.3, 4000 * p, 0.3, 0.65, 'lowpass', 300, out);
        this.burst(0.8, 300 * p, 0.5, 0.2, 'lowpass', 50, out);
        this.thump(0.9, 80 * p);
        this.duck(0.7, 0.25);
        break;
    }
  }

  /** Big "killstreak!" sting. */
  streak(): void {
    this.tone(0.12, 400, 800, 0.25, 'square');
    setTimeout(() => this.tone(0.2, 600, 1200, 0.25, 'square'), 110);
  }

  /** Cartoon "boing" for launch pads and trampolines. */
  boing(): void {
    this.wobble(0.45, 180, 520, 0.22, 16, 0.25, 'triangle');
  }
  jump(): void {
    this.tone(0.08, 300, 520, 0.08, 'triangle');
  }
  airJump(): void {
    this.tone(0.1, 520, 900, 0.09, 'triangle');
  }
  /** Pencil scraping across paper. */
  slide(): void {
    this.burst(0.45, 2500, 0.8, 0.25, 'bandpass', 900);
  }
  land(hard = false): void {
    this.burst(0.06, 400, 1, 0.12, 'lowpass');
    if (hard) this.tone(0.12, 140, 50, 0.18, 'sine');
  }
  combo(mult: number): void {
    this.tone(0.09, 440 * Math.pow(1.19, mult), 440 * Math.pow(1.19, mult) * 1.5, 0.1, 'triangle');
  }
  inkBomb(): void {
    this.burst(0.3, 300, 0.7, 0.4, 'lowpass', 80);
  }
  upgrade(): void {
    this.tone(0.12, 523, 523, 0.12, 'triangle');
    setTimeout(() => this.tone(0.12, 659, 659, 0.12, 'triangle'), 90);
    setTimeout(() => this.tone(0.2, 784, 784, 0.12, 'triangle'), 180);
  }
  tick(): void {
    this.tone(0.03, 1800, 1800, 0.05, 'square');
  }

  /** Rubbery whoosh. */
  swing(): void {
    this.burst(0.22, 600, 1.5, 0.45, 'bandpass', 2400);
  }
  /** Enemy shot, panned toward where it came from (-1 left .. 1 right). */
  enemyShot(pan = 0, gain = 1): void {
    const p = pitchJitter();
    this.tone(0.12, 700 * p, 250, 0.08 * gain, 'triangle', { pan });
    this.burst(0.05, 1500 * p, 1, 0.06 * gain, 'bandpass', undefined, { pan });
  }
  hit(): void {
    this.tone(0.04, 1400 * pitchJitter(), 900, 0.08, 'square');
  }
  /** Bright "ding". */
  private ding(gain: number, f = 1760, delay = 0): void {
    this.tone(0.35, f, f, gain, 'sine', { delay });
    this.tone(0.2, f * 1.5, f * 1.5, gain * 0.4, 'sine', { delay });
  }
  headshot(): void {
    this.tone(0.06, 2000, 2600, 0.08, 'triangle');
    this.ding(0.16);
  }
  /** Rubber squeak (eraser sword hits). */
  squeak(): void {
    this.wobble(0.13, 1300 * pitchJitter(), 1900, 0.12, 28, 0.12, 'sine');
  }
  /**
   * Kill: squeaky "pop" pitched by size (`height` m, small doodles pop
   * higher), a paper rip under it and a "ding" on top.
   */
  kill(height = 1.9, head = false): void {
    const f = Math.max(220, Math.min(1400, 1500 / Math.max(0.8, height))) * pitchJitter();
    this.tone(0.09, f * 0.6, f * 1.8, 0.3, 'sine');
    this.burst(0.02, 3000, 1, 0.3, 'highpass');
    this.burst(0.3, 3500, 2, 0.3, 'bandpass', 800);
    this.ding(head ? 0.18 : 0.12, head ? 2093 : 1568, 0.05);
  }
  hurt(): void {
    this.tone(0.18, 220, 90, 0.25, 'sawtooth');
  }
  reload(): void {
    this.burst(0.05, 4000, 3, 0.25);
    setTimeout(() => this.burst(0.06, 2500, 3, 0.3), 180);
  }
  empty(): void {
    this.tone(0.03, 1200, 1100, 0.06, 'square');
  }
  pickup(): void {
    this.tone(0.1, 600, 1200, 0.15, 'triangle');
  }
  slowIn(): void {
    this.tone(0.5, 500, 70, 0.2, 'sine');
  }
  slowOut(): void {
    this.tone(0.3, 90, 400, 0.12, 'sine');
  }
  wave(): void {
    this.tone(0.15, 440, 440, 0.12, 'triangle');
    setTimeout(() => this.tone(0.25, 660, 660, 0.12, 'triangle'), 150);
  }
}
