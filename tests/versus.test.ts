import { describe, expect, it } from 'vitest';
import { computeAwards, makeTeams, parseMode, pickMap, teamKills } from '../src/net/versus';
import { coopDifficulty } from '../src/game/difficulty';

describe('versus room logic', () => {
  it('splits players into alternating teams', () => {
    expect(makeTeams(['a', 'b', 'c', 'd'])).toEqual({ a: 0, b: 1, c: 0, d: 1 });
  });

  it('picks the most voted map', () => {
    expect(pickMap({ a: 'factory', b: 'factory', c: 'rooftops' })).toBe('factory');
  });

  it('hands out awards from the kill log and paint', () => {
    const ev = [
      { victim: 'b', by: 'a', head: true, erased: false },
      { victim: 'c', by: 'a', head: false, erased: false },
      { victim: 'b', by: 'a', head: true, erased: false },
      { victim: 'a', by: 'c', head: false, erased: true },
      { victim: 'b', by: 'c', head: false, erased: false },
    ];
    const aw = Object.fromEntries(computeAwards(ev, ['a', 'b', 'c']).map((x) => [x.id, x]));
    expect(aw.mvp.player).toBe('a');
    expect(aw.sharpshooter.player).toBe('a');
    expect(aw.sharpshooter.value).toBe(2);
    expect(aw.streak.player).toBe('a');
    expect(aw.streak.value).toBe(3);
    expect(aw.eraser.player).toBe('c');
    expect(aw.doormat.player).toBe('b');
  });

  it('ignores players who left', () => {
    const aw = computeAwards([{ victim: 'b', by: 'gone', head: true, erased: false }], ['b']);
    expect(aw.find((x) => x.id === 'mvp')).toBeUndefined();
  });
});

describe('team deathmatch and co-op', () => {
  it('adds up kills per team', () => {
    expect(teamKills({ a: 3, b: 2, c: 4, d: 0 }, { a: 0, b: 1, c: 0, d: 1 })).toEqual([7, 2]);
  });

  it('reads modes, falling back to free-for-all', () => {
    expect(parseMode('teams')).toBe('teams');
    expect(parseMode('coop')).toBe('coop');
    expect(parseMode('paintwar')).toBe('deathmatch');
  });

  it('co-op enemy kills count for the killer, never for the enemy', () => {
    const ev = [
      { victim: 'enemy', by: 'a', head: true, erased: false },
      { victim: 'enemy', by: 'a', head: false, erased: false },
      { victim: 'a', by: 'enemy', head: false, erased: false },
    ];
    const aw = Object.fromEntries(computeAwards(ev, ['a', 'b']).map((x) => [x.id, x]));
    expect(aw.mvp.player).toBe('a');
    expect(aw.mvp.value).toBe(2);
    expect(aw.doormat.player).toBe('a');
  });

  it('co-op scales enemies with the team size', () => {
    expect(coopDifficulty(1).count).toBe(1);
    expect(coopDifficulty(3).count).toBeCloseTo(2.2);
    expect(coopDifficulty(4).enemyHp).toBeCloseTo(1.3);
  });
});
