import type { EnemyKind } from './waves';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  blurb: string;
  enemyHp: number;
  enemyDamage: number;
  /** Multiplies the time between enemy shots (bigger = slower shooting). */
  fireInterval: number;
  projSpeed: number;
  /** Multiplies how many enemies each wave has. */
  count: number;
  /** Added to the max enemies alive at once. */
  maxAlive: number;
  /** Score multiplier, so easy runs don't top the leaderboard. */
  score: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { id: 'easy', label: 'easy', blurb: 'fewer, weaker enemies with slow shots · score ×0.5', enemyHp: 0.7, enemyDamage: 0.6, fireInterval: 1.35, projSpeed: 0.8, count: 0.75, maxAlive: -1, score: 0.5 },
  normal: { id: 'normal', label: 'normal', blurb: 'the way it was drawn · score ×1', enemyHp: 1, enemyDamage: 1, fireInterval: 1, projSpeed: 1, count: 1, maxAlive: 0, score: 1 },
  hard: { id: 'hard', label: 'hard', blurb: 'more, tougher enemies that shoot faster · score ×1.5', enemyHp: 1.3, enemyDamage: 1.35, fireInterval: 0.8, projSpeed: 1.15, count: 1.3, maxAlive: 2, score: 1.5 },
};

/**
 * Resize a spawn queue for a difficulty. The boss always stays; extra enemies
 * copy random non-boss entries, and removed ones are dropped from the end.
 */
export function scaleQueue(q: EnemyKind[], mult: number, rand: () => number = Math.random): EnemyKind[] {
  if (mult === 1) return q;
  const boss = q.filter((k) => k === 'boss');
  const rest = q.filter((k) => k !== 'boss');
  const target = Math.max(1, Math.round(rest.length * mult));
  if (target <= rest.length) return [...boss, ...rest.slice(0, target)];
  const out = [...rest];
  while (out.length < target) out.splice(Math.floor(rand() * (out.length + 1)), 0, rest[Math.floor(rand() * rest.length)]);
  return [...boss, ...out];
}

/** Co-op: normal difficulty, with more (and slightly tougher) enemies for each extra player. */
export function coopDifficulty(players: number): DifficultyDef {
  const extra = Math.max(0, players - 1);
  return { ...DIFFICULTIES.normal, count: 1 + 0.6 * extra, enemyHp: 1 + 0.1 * extra, maxAlive: 2 * extra };
}
