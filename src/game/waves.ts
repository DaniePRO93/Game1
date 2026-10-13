export type EnemyKind = 'grunt' | 'runner' | 'heavy' | 'elite' | 'boss';

export interface WaveGroup {
  kind: EnemyKind;
  count: number;
}

export const BOSS_EVERY = 5;

export function isBossWave(n: number): boolean {
  return n > 0 && n % BOSS_EVERY === 0;
}

/** Enemy composition for wave `n` (1-based). */
export function composeWave(n: number): WaveGroup[] {
  if (n < 1) return [];
  const groups: WaveGroup[] = [];
  if (isBossWave(n)) {
    groups.push({ kind: 'boss', count: 1 });
    groups.push({ kind: 'grunt', count: 2 + Math.floor(n / 2) });
    return groups;
  }
  groups.push({ kind: 'grunt', count: 3 + n });
  if (n >= 2) groups.push({ kind: 'runner', count: Math.floor(n / 2) + 1 });
  if (n >= 3) groups.push({ kind: 'heavy', count: Math.floor(n / 3) });
  if (n >= 4) groups.push({ kind: 'elite', count: Math.floor(n / 4) });
  return groups.filter((g) => g.count > 0);
}

export function waveSize(n: number): number {
  return composeWave(n).reduce((s, g) => s + g.count, 0);
}

/** Max simultaneously alive enemies for wave `n`. */
export function maxAlive(n: number): number {
  return Math.min(10, 4 + Math.floor(n / 2));
}

/** Flatten and shuffle a wave into a spawn queue. Boss always spawns first. */
export function spawnQueue(n: number, rand: () => number = Math.random): EnemyKind[] {
  const q: EnemyKind[] = [];
  for (const g of composeWave(n)) for (let i = 0; i < g.count; i++) q.push(g.kind);
  const rest = q.filter((k) => k !== 'boss');
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return q.includes('boss') ? ['boss', ...rest] : rest;
}
