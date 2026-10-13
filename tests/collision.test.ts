import { describe, expect, it } from 'vitest';
import { Body, Box, moveBody, pushCircleOut, rayAABB } from '../src/world/collision';

const ground: Box = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } };
const wall: Box = { min: { x: 2, y: 0, z: -5 }, max: { x: 3, y: 4, z: 5 } };
const step: Box = { min: { x: 2, y: 0, z: -5 }, max: { x: 3, y: 0.3, z: 5 } };

function body(): Body {
  return { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, halfW: 0.35, height: 1.75, grounded: true };
}

describe('collision', () => {
  it('ray hits box and misses when pointing away', () => {
    const o = { x: 0, y: 1, z: 0 };
    expect(rayAABB(o, { x: 1, y: 0, z: 0 }, wall.min, wall.max)).toBeCloseTo(2);
    expect(rayAABB(o, { x: -1, y: 0, z: 0 }, wall.min, wall.max)).toBeNull();
  });

  it('lands on ground', () => {
    const b = body();
    b.pos.y = 1;
    b.grounded = false;
    moveBody(b, [ground], 0, -2, 0, 0.4);
    expect(b.pos.y).toBe(0);
    expect(b.grounded).toBe(true);
  });

  it('is blocked by a wall', () => {
    const b = body();
    moveBody(b, [ground, wall], 3, 0, 0, 0.4);
    expect(b.pos.x).toBeLessThan(2 - 0.35 + 1e-3);
  });

  it('steps up a low ledge', () => {
    const b = body();
    moveBody(b, [ground, step], 2.2, 0, 0, 0.4);
    expect(b.pos.y).toBeCloseTo(0.3, 2);
    expect(b.pos.x).toBeCloseTo(2.2);
  });

  it('pushes circles out of boxes', () => {
    const p = { x: 1.8, y: 0, z: 0 };
    expect(pushCircleOut(p, 0.5, [wall])).toBe(true);
    expect(p.x).toBeCloseTo(1.5);
  });
});
