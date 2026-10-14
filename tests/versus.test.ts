import { describe, expect, it } from 'vitest';
import { computeAwards, makeTeams, pickMap } from '../src/net/versus';
import { PaintGrid } from '../src/game/paintGrid';

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
    const aw = Object.fromEntries(computeAwards(ev, { c: 40, a: 5 }, ['a', 'b', 'c']).map((x) => [x.id, x]));
    expect(aw.mvp.player).toBe('a');
    expect(aw.sharpshooter.player).toBe('a');
    expect(aw.sharpshooter.value).toBe(2);
    expect(aw.streak.player).toBe('a');
    expect(aw.streak.value).toBe(3);
    expect(aw.picasso.player).toBe('c');
    expect(aw.eraser.player).toBe('c');
    expect(aw.doormat.player).toBe('b');
  });

  it('ignores players who left', () => {
    const aw = computeAwards([{ victim: 'b', by: 'gone', head: true, erased: false }], {}, ['b']);
    expect(aw.find((x) => x.id === 'mvp')).toBeUndefined();
  });
});

describe('paint war grid', () => {
  it('claims cells for a team and overpainting steals them', () => {
    const g = new PaintGrid(10);
    const a = g.claim(0, 0, 1, 0, 'p1');
    expect(a).toBeGreaterThan(0);
    expect(g.counts[0]).toBe(a);
    // Same spot by the other team flips the cells.
    g.claim(0, 0, 1, 1, 'p2');
    expect(g.counts[0]).toBe(0);
    expect(g.counts[1]).toBe(a);
    expect(g.byPlayer.p1).toBe(a);
    expect(g.byPlayer.p2).toBe(a);
    const [c0, c1] = g.coverage();
    expect(c0).toBe(0);
    expect(c1).toBeCloseTo(a / g.total);
  });

  it('repainting your own cells scores nothing extra', () => {
    const g = new PaintGrid(10);
    g.claim(3, 3, 1, 0, 'p1');
    expect(g.claim(3, 3, 1, 0, 'p1')).toBe(0);
  });
});
