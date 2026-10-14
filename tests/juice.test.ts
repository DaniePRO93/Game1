import { describe, expect, it } from 'vitest';
import { Hitstop, KNOCKBACK, RECOIL, Spring, Trauma, fliesOnKill, numberScale, panFor, pitchJitter, shakeNoise, tallyHit } from '../src/game/juice';
import type { Tally } from '../src/game/juice';

describe('spring', () => {
  it('kicked out, overshoots past rest, then settles back to 0', () => {
    const s = new Spring(300, 12);
    s.x = 1;
    let min = Infinity;
    for (let i = 0; i < 60; i++) min = Math.min(min, s.step(1 / 60));
    expect(min).toBeLessThan(0); // the wobble
    expect(min).toBeGreaterThan(-0.6); // but a small one
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    expect(Math.abs(s.x)).toBeLessThan(0.01);
  });
  it('stays stable with stiff springs and big frames', () => {
    const s = new Spring(1100, 30);
    s.x = 0.5;
    for (let i = 0; i < 20; i++) s.step(0.05);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(0.01);
  });
  it('heads to a non-zero target and impulses add velocity', () => {
    const s = new Spring(200, 20);
    for (let i = 0; i < 200; i++) s.step(1 / 60, 2);
    expect(s.x).toBeCloseTo(2, 2);
    s.impulse(5);
    expect(s.v).toBeGreaterThan(4.9);
  });
});

describe('trauma', () => {
  it('clamps to 0..1 and shakes by trauma squared', () => {
    const t = new Trauma();
    t.add(0.5);
    expect(t.shake).toBeCloseTo(0.25);
    t.add(5);
    expect(t.value).toBe(1);
    t.add(-9);
    expect(t.value).toBe(0);
  });
  it('a full hit is gone in about 0.25s', () => {
    const t = new Trauma();
    t.add(1);
    t.step(0.2);
    expect(t.value).toBeGreaterThan(0);
    t.step(0.06);
    expect(t.value).toBe(0);
  });
  it('noise stays within -1..1', () => {
    for (let i = 0; i < 500; i++) {
      const n = shakeNoise(i * 0.013, i % 6);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });
});

describe('hitstop', () => {
  it('freezes the world for the time given, then lets it run', () => {
    const h = new Hitstop();
    expect(h.step(0.016)).toBe(1);
    h.trigger(0.05);
    expect(h.step(0.016)).toBe(0);
    expect(h.step(0.016)).toBe(0);
    expect(h.step(0.016)).toBe(0);
    expect(h.step(0.016)).toBe(0);
    expect(h.step(0.016)).toBe(1);
  });
  it('does not stack, a bigger freeze extends it', () => {
    const h = new Hitstop();
    h.trigger(0.05);
    h.trigger(0.05);
    expect(h.left).toBe(0.05);
    h.trigger(0.09);
    expect(h.left).toBe(0.09);
    h.trigger(0.02);
    expect(h.left).toBe(0.09);
  });
});

describe('damage number merging', () => {
  type T = Tally & { at: number };
  it('adds shotgun pellets on one target into one number, keeping the first hit point', () => {
    const map = new Map<string, T>();
    const make = (at: number) => () => ({ dmg: 0, head: false, count: 0, at });
    for (let i = 0; i < 5; i++) tallyHit(map, 'a', 18, false, make(i));
    tallyHit(map, 'b', 10, false, make(9));
    tallyHit(map, 'a', 18, true, make(7));
    expect(map.size).toBe(2);
    const a = map.get('a')!;
    expect(a.dmg).toBe(108);
    expect(a.count).toBe(6);
    expect(a.head).toBe(true);
    expect(a.at).toBe(0);
    expect(map.get('b')!.dmg).toBe(10);
  });
  it('pops past full size, then settles', () => {
    expect(numberScale(0)).toBeLessThan(0.5);
    expect(numberScale(0.12)).toBeGreaterThan(1.3);
    expect(numberScale(0.5)).toBe(1);
    expect(numberScale(1)).toBeLessThan(1);
  });
});

describe('weapon personalities', () => {
  it('heavier guns kick, shake and push harder', () => {
    expect(RECOIL.shotgun.back).toBeGreaterThan(RECOIL.pistol.back * 3);
    expect(RECOIL.railgun.trauma).toBeGreaterThan(RECOIL.shotgun.trauma);
    expect(RECOIL.rifle.trauma).toBe(0);
    expect(KNOCKBACK.shotgun).toBeGreaterThan(KNOCKBACK.rifle);
    // Railgun slams out (stretch) instead of squashing in.
    expect(RECOIL.railgun.squash).toBeLessThan(0);
  });
  it('only big hitters launch doodles', () => {
    expect(fliesOnKill('shotgun')).toBe(true);
    expect(fliesOnKill('railgun')).toBe(true);
    expect(fliesOnKill('eraser')).toBe(true);
    expect(fliesOnKill('rifle')).toBe(false);
  });
  it('pitch jitter stays within ±8% and pan follows the angle', () => {
    expect(pitchJitter(0)).toBeCloseTo(0.92);
    expect(pitchJitter(1)).toBeCloseTo(1.08);
    expect(panFor(0)).toBeCloseTo(0);
    expect(panFor(Math.PI / 2)).toBeGreaterThan(0.8);
    expect(panFor(-Math.PI / 2)).toBeLessThan(-0.8);
  });
});
