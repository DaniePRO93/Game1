/**
 * Your drawing decides enemy stats. A big filled blob is a slow tank, a thin
 * stick figure is fast and fragile. Wide drawings are easier to hit, so they
 * get a small HP discount; a small head is a small headshot target by itself
 * (hits are tested against the drawn pixels).
 */
export interface DoodleMetrics {
  /** Fraction of the bounding box that is solid (ink or enclosed fill). */
  coverage: number;
  /** width / height of the drawing. */
  aspect: number;
  /** Fraction of solid pixels in the top quarter (the headshot zone). */
  headShare: number;
}

export interface DoodleStats {
  hpMult: number;
  speedMult: number;
  /** 0..1 bars for the stat card. */
  bars: { hp: number; speed: number; size: number; head: number };
  label: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function doodleStats(m: DoodleMetrics): DoodleStats {
  const bulk = clamp01((m.coverage - 0.15) / 0.45);
  const wide = clamp01((m.aspect - 0.5) / 0.7);
  const hpMult = (0.7 + bulk * 0.9) * (1 - wide * 0.15);
  const speedMult = 1.35 - bulk * 0.6;
  const label =
    bulk > 0.66 ? 'chonky tank' : bulk < 0.25 ? 'speedy stick' : wide > 0.6 ? 'wide boi' : 'balanced doodle';
  return {
    hpMult,
    speedMult,
    bars: {
      hp: clamp01((hpMult - 0.55) / 1.05),
      speed: clamp01((speedMult - 0.7) / 0.7),
      size: clamp01(m.aspect / 1.2),
      head: clamp01(m.headShare / 0.4),
    },
    label,
  };
}
