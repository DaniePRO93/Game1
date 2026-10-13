import { describe, expect, it } from 'vitest';
import { TimeMeter } from '../src/game/timeMeter';

describe('TimeMeter', () => {
  it('starts full at 5 seconds', () => {
    const m = new TimeMeter();
    expect(m.value).toBe(5);
    expect(m.fraction).toBe(1);
  });

  it('drains only while held, and empties after 5s', () => {
    const m = new TimeMeter();
    m.update(1, false);
    expect(m.value).toBe(5);
    for (let i = 0; i < 50; i++) m.update(0.1, true);
    expect(m.value).toBeCloseTo(0);
    expect(m.update(0.1, true)).toBe(false);
  });

  it('refills on kills, with headshot bonus, capped at capacity', () => {
    const m = new TimeMeter();
    m.value = 1;
    m.onKill(false);
    expect(m.value).toBeCloseTo(1.75);
    m.onKill(true);
    expect(m.value).toBeCloseTo(3);
    for (let i = 0; i < 20; i++) m.onKill(true);
    expect(m.value).toBe(5);
  });

  it('does not passively recharge', () => {
    const m = new TimeMeter();
    m.value = 2;
    for (let i = 0; i < 100; i++) m.update(0.1, false);
    expect(m.value).toBe(2);
  });

  it('needs a minimum charge to start but keeps running once active', () => {
    const m = new TimeMeter();
    m.value = 0.1;
    expect(m.update(0.016, true)).toBe(false);
    m.value = 0.3;
    expect(m.update(0.016, true)).toBe(true);
    m.value = 0.1;
    expect(m.update(0.016, true)).toBe(true);
  });
});
