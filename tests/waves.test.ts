import { describe, expect, it } from 'vitest';
import { composeWave, isBossWave, maxAlive, spawnQueue, waveSize } from '../src/game/waves';

describe('waves', () => {
  it('wave 1 is only grunts', () => {
    expect(composeWave(1)).toEqual([{ kind: 'grunt', count: 4 }]);
  });

  it('every 5th wave has the boss first', () => {
    expect(isBossWave(5)).toBe(true);
    expect(isBossWave(4)).toBe(false);
    expect(spawnQueue(5)[0]).toBe('boss');
    expect(spawnQueue(10).filter((k) => k === 'boss')).toHaveLength(1);
  });

  it('waves grow and unlock tougher enemies', () => {
    expect(waveSize(4)).toBeGreaterThan(waveSize(1));
    expect(composeWave(4).map((g) => g.kind)).toContain('elite');
    expect(composeWave(3).map((g) => g.kind)).toContain('heavy');
  });

  it('queue length matches wave size', () => {
    for (let n = 1; n <= 12; n++) expect(spawnQueue(n)).toHaveLength(waveSize(n));
  });

  it('caps simultaneous enemies', () => {
    expect(maxAlive(100)).toBe(10);
  });
});
