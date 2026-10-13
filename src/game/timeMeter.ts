/**
 * Slow-mo meter. Holds `capacity` seconds of slow motion, drains in real time
 * only while active, and is refilled exclusively by kills.
 */
export class TimeMeter {
  value: number;
  active = false;

  constructor(
    public capacity = 5,
    public killRefill = 0.75,
    public headshotBonus = 0.5,
    /** Minimum charge needed to (re)start slow-mo, prevents flicker at ~0. */
    public minToStart = 0.25,
  ) {
    this.value = capacity;
  }

  /** Advance by real (unscaled) time. Returns whether slow-mo is active this frame. */
  update(realDt: number, wantActive: boolean): boolean {
    if (!wantActive || this.value <= 0) {
      this.active = false;
    } else if (!this.active && this.value < this.minToStart) {
      this.active = false;
    } else {
      this.active = true;
      this.value = Math.max(0, this.value - realDt);
      if (this.value === 0) this.active = false;
    }
    return this.active;
  }

  onKill(headshot: boolean): void {
    const gain = this.killRefill + (headshot ? this.headshotBonus : 0);
    this.value = Math.min(this.capacity, this.value + gain);
  }

  reset(): void {
    this.value = this.capacity;
    this.active = false;
  }

  get fraction(): number {
    return this.value / this.capacity;
  }
}
