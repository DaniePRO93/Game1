import type { WeaponId } from './weapons';

/** Tiny WebAudio synth: no asset files. Everything goes through a lowpass that closes in slow-mo. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private noise!: AudioBuffer;
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
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setSlowmo(k: number): void {
    if (!this.ctx) return;
    this.filter.frequency.setTargetAtTime(18000 - k * 16800, this.ctx.currentTime, 0.05);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number): void {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime;
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
    src.connect(f).connect(g).connect(this.filter);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'square'): void {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.filter);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(id: WeaponId): void {
    switch (id) {
      case 'rifle':
        this.burst(0.09, 1800, 0.8, 0.5);
        this.tone(0.06, 180, 60, 0.25);
        break;
      case 'shotgun':
        this.burst(0.25, 900, 0.5, 0.9, 'lowpass', 200);
        this.tone(0.15, 120, 40, 0.4);
        break;
      case 'pistol':
        this.burst(0.07, 2400, 1, 0.45);
        this.tone(0.05, 260, 90, 0.2);
        break;
      case 'sniper':
        this.burst(0.4, 3000, 0.4, 0.9, 'lowpass', 150);
        this.tone(0.3, 220, 30, 0.5, 'sawtooth');
        break;
      case 'minigun':
        this.burst(0.05, 2000, 0.9, 0.35);
        this.tone(0.04, 150, 70, 0.18);
        break;
      case 'railgun':
        this.tone(0.5, 1400, 90, 0.45, 'sawtooth');
        this.burst(0.3, 4000, 0.3, 0.7, 'lowpass', 300);
        break;
    }
  }

  /** Big "killstreak!" sting. */
  streak(): void {
    this.tone(0.12, 400, 800, 0.25, 'square');
    setTimeout(() => this.tone(0.2, 600, 1200, 0.25, 'square'), 110);
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
  land(): void {
    this.burst(0.06, 400, 1, 0.12, 'lowpass');
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
  enemyShot(): void {
    this.tone(0.12, 700, 250, 0.08, 'triangle');
  }
  hit(): void {
    this.tone(0.04, 1400, 900, 0.08, 'square');
  }
  headshot(): void {
    this.tone(0.08, 2000, 2600, 0.12, 'triangle');
  }
  /** Paper rip. */
  kill(): void {
    this.burst(0.35, 3500, 2, 0.5, 'bandpass', 800);
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
