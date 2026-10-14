import { describe, expect, it } from 'vitest';
import { Player } from '../src/game/player';
import type { Input } from '../src/game/input';
import type { Box } from '../src/world/collision';
import { stickVector } from '../src/ui/stick';

const ground: Box = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } };

function stickInput(moveX: number, moveY: number, keys: string[] = []): Input {
  return { keys: new Set(keys), pressed: new Set<string>(), dx: 0, dy: 0, moveX, moveY } as unknown as Input;
}

function walk(input: Input, seconds = 1): Player {
  const p = new Player();
  p.spawn({ x: 0, y: 0, z: 0 } as never);
  for (let t = 0; t < seconds; t += 1 / 120) p.update(1 / 120, input, [ground]);
  return p;
}

describe('touch stick', () => {
  it('ignores a resting thumb, ramps up, and caps at full speed', () => {
    expect(stickVector(3, 0, 56)).toEqual({ x: 0, y: 0 });
    const half = stickVector(0, -31, 56);
    expect(half.x).toBeCloseTo(0);
    expect(half.y).toBeLessThan(-0.4);
    expect(half.y).toBeGreaterThan(-0.6);
    const far = stickVector(300, 400, 56);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1);
    expect(far.x / far.y).toBeCloseTo(0.75);
  });

  it('pushing up walks forward; a small push walks slower than a full one', () => {
    const full = walk(stickInput(0, -1));
    const small = walk(stickInput(0, -0.4));
    // Yaw 0 looks down -z.
    expect(full.pos.z).toBeLessThan(-2);
    expect(Math.abs(full.pos.x)).toBeLessThan(0.01);
    expect(small.pos.z).toBeLessThan(-0.5);
    expect(small.pos.z).toBeGreaterThan(full.pos.z * 0.6);
  });

  it('keys win over the stick', () => {
    const p = walk(stickInput(0, -1, ['KeyS']));
    expect(p.pos.z).toBeGreaterThan(2);
  });
});
