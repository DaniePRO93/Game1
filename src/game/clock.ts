/** World speed while slow-mo is fully engaged. */
export const SLOWMO_SCALE = 0.2;

/**
 * Global time scale. The world (enemies, bullets, FX) runs at `timeScale`;
 * the player runs a bit faster than the world so slow-mo is an advantage.
 * Mouse look is never scaled.
 */
export class GameClock {
  timeScale = 1;
  target = 1;

  update(realDt: number, slowmo: boolean): void {
    this.target = slowmo ? SLOWMO_SCALE : 1;
    const k = 1 - Math.exp(-realDt * 14);
    this.timeScale += (this.target - this.timeScale) * k;
    if (Math.abs(this.timeScale - this.target) < 1e-3) this.timeScale = this.target;
  }

  worldDt(realDt: number): number {
    return realDt * this.timeScale;
  }

  /** Player time: 60% speed in full slow-mo, i.e. 3x faster than the world. */
  playerDt(realDt: number): number {
    return realDt * (0.5 + 0.5 * this.timeScale);
  }

  /** 0 = normal speed, 1 = full slow-mo. Drives visuals/audio. */
  get slowAmount(): number {
    return (1 - this.timeScale) / (1 - SLOWMO_SCALE);
  }
}
