/**
 * Kill chain. Each kill within the window extends the chain; stylish kills
 * (sword, during slow-mo) count double. Runs on world time, so slow-mo
 * stretches the window.
 */
export class Combo {
  chain = 0;
  timer = 0;
  best = 1;

  constructor(public window = 3, public maxMult = 5) {}

  get mult(): number {
    return Math.min(this.maxMult, 1 + Math.floor(this.chain / 2));
  }

  /** 0..1 time left in the current window. */
  get fraction(): number {
    return this.chain > 0 ? this.timer / this.window : 0;
  }

  /** Register a kill; returns the multiplier that applies to it. */
  onKill(stylish: boolean): number {
    this.chain += stylish ? 2 : 1;
    this.timer = this.window;
    const m = this.mult;
    if (m > this.best) this.best = m;
    return m;
  }

  update(dt: number): void {
    if (this.chain === 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.chain = 0;
      this.timer = 0;
    }
  }

  reset(): void {
    this.chain = 0;
    this.timer = 0;
    this.best = 1;
  }
}
