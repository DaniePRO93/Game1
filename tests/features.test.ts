import { describe, expect, it } from 'vitest';
import { Combo } from '../src/game/combo';
import { doodleStats } from '../src/game/doodleStats';
import { UPGRADES, modsFrom, rollUpgrades } from '../src/game/upgrades';
import { decodeShare, encodeShare, packBytes, unpackBytes } from '../src/game/share';
import { parTime, timeBonus } from '../src/game/waves';

describe('doodle stats', () => {
  it('fat drawings are tanky and slow, thin ones fast and fragile', () => {
    const fat = doodleStats({ coverage: 0.7, aspect: 0.6, headShare: 0.25 });
    const thin = doodleStats({ coverage: 0.12, aspect: 0.6, headShare: 0.25 });
    expect(fat.hpMult).toBeGreaterThan(1.3);
    expect(fat.speedMult).toBeLessThan(0.9);
    expect(thin.hpMult).toBeLessThan(0.8);
    expect(thin.speedMult).toBeGreaterThan(1.3);
  });
  it('bars stay in 0..1', () => {
    for (const c of [0, 0.3, 1]) for (const a of [0.1, 1, 3]) {
      const s = doodleStats({ coverage: c, aspect: a, headShare: c });
      for (const v of Object.values(s.bars)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('combo', () => {
  it('builds multiplier, caps at x5, and resets after the window', () => {
    const c = new Combo(3);
    expect(c.onKill(false)).toBe(1);
    expect(c.onKill(false)).toBe(2);
    for (let i = 0; i < 20; i++) c.onKill(true);
    expect(c.mult).toBe(5);
    c.update(3.1);
    expect(c.mult).toBe(1);
    expect(c.best).toBe(5);
  });
  it('stylish kills count double', () => {
    const c = new Combo();
    expect(c.onKill(true)).toBe(2);
  });
});

describe('upgrades', () => {
  it('rolls distinct, non-maxed upgrades', () => {
    const owned = { jump: 1, swatter: 1 };
    for (let i = 0; i < 50; i++) {
      const r = rollUpgrades(owned, 3);
      expect(new Set(r.map((u) => u.id)).size).toBe(3);
      expect(r.find((u) => u.id === 'jump' || u.id === 'swatter')).toBeUndefined();
    }
  });
  it('stacks modifiers', () => {
    const m = modsFrom({ nib: 2, exposure: 1, jump: 1 });
    expect(m.damage).toBeCloseTo(1.4);
    expect(m.meterCap).toBe(2);
    expect(m.airJumps).toBe(2);
  });
  it('every upgrade has a valid max', () => {
    for (const u of UPGRADES) expect(u.max).toBeGreaterThan(0);
  });
});

describe('wave clock', () => {
  it('par time grows and boss waves get extra', () => {
    expect(parTime(4)).toBeGreaterThan(parTime(1));
    expect(parTime(5)).toBeGreaterThan(parTime(4));
    expect(timeBonus(3, 0)).toBe(0);
    expect(timeBonus(3, 10)).toBe(150);
  });
});

describe('share links', () => {
  const payload = {
    enemy: [[[10, 20], [15, 25], [30, 40]], [[200, 300]]] as [number, number][][],
    boss: [[[1, 2], [100, 2], [100, 200]]] as [number, number][][],
    score: 1234,
    wave: 6,
  };
  it('round-trips bytes', () => {
    expect(unpackBytes(packBytes(payload))).toEqual(payload);
  });
  it('round-trips through a URL token', async () => {
    const t = await encodeShare(payload);
    expect(t).toMatch(/^[zr][A-Za-z0-9_-]+$/);
    expect(await decodeShare(t)).toEqual(payload);
  });
  it('rejects garbage', async () => {
    await expect(decodeShare('x123')).rejects.toThrow();
  });
});
