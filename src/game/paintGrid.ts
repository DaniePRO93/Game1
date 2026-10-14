/**
 * Paint War scoring: the map's footprint split into square cells. A splat
 * claims the cells it covers for the shooter's team (overpainting steals
 * them). Walls count toward the cell they stand on, so painting a building
 * helps too. Coverage = cells owned / all cells.
 */
export const CELL = 1.5;

export class PaintGrid {
  readonly n: number;
  private owner: Int8Array;
  readonly counts: [number, number] = [0, 0];
  /** Cells each player has claimed (for the Picasso award). */
  readonly byPlayer: Record<string, number> = {};

  constructor(readonly bounds: number) {
    this.n = Math.ceil((bounds * 2) / CELL);
    this.owner = new Int8Array(this.n * this.n).fill(-1);
  }

  get total(): number {
    return this.n * this.n;
  }

  coverage(): [number, number] {
    return [this.counts[0] / this.total, this.counts[1] / this.total];
  }

  /** Claim every cell within `r` of (x, z) for `team`. Returns cells newly won. */
  claim(x: number, z: number, r: number, team: number, shooter: string): number {
    let won = 0;
    const toIdx = (v: number) => Math.floor((v + this.bounds) / CELL);
    const i0 = Math.max(0, toIdx(x - r));
    const i1 = Math.min(this.n - 1, toIdx(x + r));
    const j0 = Math.max(0, toIdx(z - r));
    const j1 = Math.min(this.n - 1, toIdx(z + r));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        // Cell center within reach (plus half a cell so small splats still count).
        const cx = -this.bounds + (i + 0.5) * CELL;
        const cz = -this.bounds + (j + 0.5) * CELL;
        if (Math.hypot(cx - x, cz - z) > r + CELL * 0.5) continue;
        const k = i * this.n + j;
        const prev = this.owner[k];
        if (prev === team) continue;
        if (prev === 0 || prev === 1) this.counts[prev]--;
        this.owner[k] = team;
        this.counts[team]++;
        won++;
      }
    }
    if (won) this.byPlayer[shooter] = (this.byPlayer[shooter] ?? 0) + won;
    return won;
  }
}
