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
