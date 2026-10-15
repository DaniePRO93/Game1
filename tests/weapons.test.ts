import { describe, expect, it } from 'vitest';
import { WEAPONS, WeaponState, damageAt } from '../src/game/weapons';

const rifle = WEAPONS.find((w) => w.id === 'rifle')!;
const pistol = WEAPONS.find((w) => w.id === 'pistol')!;

describe('weapons', () => {
  it('damage falls off to 50%', () => {
    expect(damageAt(rifle, 10)).toBe(rifle.damage);
    expect(damageAt(rifle, 1000)).toBe(rifle.damage * 0.5);
    const mid = damageAt(rifle, (rifle.falloffStart + rifle.falloffEnd) / 2);
    expect(mid).toBeCloseTo(rifle.damage * 0.75);
  });

  it('fires, respects cooldown, and reloads from reserve', () => {
    const w = new WeaponState(rifle);
    expect(w.fire()).toBe(true);
    expect(w.fire()).toBe(false);
    w.update(rifle.interval);
    expect(w.fire()).toBe(true);
    expect(w.ammo).toBe(rifle.mag - 2);
    expect(w.startReload()).toBe(true);
    w.update(rifle.reload + 0.01);
    expect(w.ammo).toBe(rifle.mag);
    expect(w.reserve).toBe(rifle.reserve - 2);
  });

  it('pistol reserve is infinite', () => {
    const w = new WeaponState(pistol);
    w.ammo = 0;
    w.startReload();
    w.update(10);
    expect(w.ammo).toBe(pistol.mag);
    expect(w.reserve).toBe(Infinity);
  });

  it('cannot reload a full mag', () => {
    expect(new WeaponState(rifle).startReload()).toBe(false);
  });
});

describe('eraser sword', () => {
  const eraser = WEAPONS.find((w) => w.id === 'eraser')!;
  it('is melee and never consumes ammo or reloads', () => {
    expect(eraser.melee).toBeDefined();
    const w = new WeaponState(eraser);
    for (let i = 0; i < 50; i++) {
      expect(w.fire()).toBe(true);
      w.update(eraser.interval);
    }
    expect(w.ammo).toBe(Infinity);
    expect(w.startReload()).toBe(false);
  });
});

import { ALL_WEAPONS, STREAKS } from '../src/game/weapons';

describe('weapon balance + killstreaks', () => {
  it('sniper body shots no longer one-shot heavies or high-wave elites, headshots still do', () => {
    const sniper = WEAPONS.find((w) => w.id === 'sniper')!;
    expect(sniper.damage).toBeLessThan(100);
    expect(sniper.damage * (sniper.headMult ?? 2)).toBeGreaterThan(240);
  });

  it('killstreak rewards come at 3 and 5 kills, every gun has paint colors and a unique id', () => {
    expect(STREAKS.map((s) => [s.kills, s.def.id])).toEqual([[3, 'minigun'], [5, 'railgun']]);
    for (const w of ALL_WEAPONS) expect(w.paint.length).toBeGreaterThan(0);
    expect(new Set(ALL_WEAPONS.map((w) => w.id)).size).toBe(ALL_WEAPONS.length);
  });
});

describe('minigun spin-up', () => {
  it('reaches full spin while the trigger is held, then winds down when let go', async () => {
    const { MINIGUN, spinStep } = await import('../src/game/weapons');
    let spin = 0;
    for (let t = 0; t < MINIGUN.spinUp! + 0.05; t += 1 / 60) spin = spinStep(spin, MINIGUN, true, 1 / 60);
    expect(spin).toBe(1);
    spin = spinStep(spin, MINIGUN, false, 0.1);
    expect(spin).toBeCloseTo(0.8);
    expect(spinStep(0.5, rifle, true, 0.1)).toBe(0);
  });

  it('infinite ink never spends ammo or reloads', () => {
    const w = new WeaponState(rifle);
    w.infinite = true;
    for (let i = 0; i < rifle.mag * 3; i++) {
      w.cooldown = 0;
      expect(w.fire()).toBe(true);
    }
    expect(w.ammo).toBe(rifle.mag);
    expect(w.startReload()).toBe(false);
  });
});
