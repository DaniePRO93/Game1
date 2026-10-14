import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, scaleQueue } from '../src/game/difficulty';
import { spawnQueue } from '../src/game/waves';

describe('difficulty', () => {
  it('normal leaves waves alone', () => {
    const q = spawnQueue(4, () => 0.3);
    expect(scaleQueue(q, DIFFICULTIES.normal.count)).toEqual(q);
  });

  it('hard adds enemies, easy removes some, the boss always stays first', () => {
    const q = spawnQueue(5, () => 0.3);
    const hard = scaleQueue(q, DIFFICULTIES.hard.count, () => 0.5);
    const easy = scaleQueue(q, DIFFICULTIES.easy.count, () => 0.5);
    expect(hard.length).toBeGreaterThan(q.length);
    expect(easy.length).toBeLessThan(q.length);
    for (const w of [hard, easy]) {
      expect(w[0]).toBe('boss');
      expect(w.filter((k) => k === 'boss').length).toBe(1);
    }
  });

  it('every wave keeps at least one enemy', () => {
    for (let n = 1; n <= 12; n++) expect(scaleQueue(spawnQueue(n), DIFFICULTIES.easy.count).length).toBeGreaterThan(0);
  });

  it('hard is tougher and pays more than easy on every axis', () => {
    const { easy, hard } = DIFFICULTIES;
    expect(hard.enemyHp).toBeGreaterThan(easy.enemyHp);
    expect(hard.enemyDamage).toBeGreaterThan(easy.enemyDamage);
    expect(hard.fireInterval).toBeLessThan(easy.fireInterval);
    expect(hard.score).toBeGreaterThan(easy.score);
  });
});
