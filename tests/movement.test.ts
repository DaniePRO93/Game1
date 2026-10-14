import { describe, expect, it } from 'vitest';
import { Player } from '../src/game/player';
import type { Input } from '../src/game/input';
import type { Box } from '../src/world/collision';
import type { Trigger } from '../src/world/builder';

const ground: Box = { min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } };

function fakeInput(keys: string[] = []): Input {
  return { keys: new Set(keys), pressed: new Set<string>(), dx: 0, dy: 0 } as unknown as Input;
}

function run(p: Player, input: Input, boxes: Box[], seconds: number, triggers: Trigger[] = []): void {
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    p.update(dt, input, boxes);
    p.applyTriggers(triggers, dt);
    input.pressed.clear();
  }
}

describe('movement', () => {
  it('launch pad throws the player up and keeps unspecified axes', () => {
    const p = new Player();
    p.spawn({ x: 0, y: 0, z: 0 } as never);
    const pad: Trigger = { kind: 'launch', box: { min: { x: -1, y: -0.05, z: -1 }, max: { x: 1, y: 0.35, z: 1 } }, vel: { y: 17 } };
    let peak = 0;
    const input = fakeInput();
    const dt = 1 / 120;
    for (let t = 0; t < 1.5; t += dt) {
      p.update(dt, input, [ground]);
      p.applyTriggers([pad], dt);
      peak = Math.max(peak, p.pos.y);
    }
    // v²/2g = 289/44 ≈ 6.6m.
    expect(peak).toBeGreaterThan(6);
    expect(peak).toBeLessThan(7.2);
  });

  it('updraft lifts the player while inside', () => {
    const p = new Player();
    p.spawn({ x: 0, y: 0, z: 0 } as never);
    const up: Trigger = { kind: 'updraft', box: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 10, z: 1 } }, lift: 34, maxUp: 11 };
    run(p, fakeInput(), [ground], 1.5, [up]);
    expect(p.pos.y).toBeGreaterThan(5);
  });

  it('slides under a 1.1m gap that blocks walking', () => {
    // Low ceiling from x=3..8, 1.1m above the ground.
    const ceiling: Box = { min: { x: 3, y: 1.1, z: -5 }, max: { x: 8, y: 2, z: 5 } };
    const boxes = [ground, ceiling];

    // Walking: stopped at the ceiling's edge.
    const walker = new Player();
    walker.spawn({ x: 0, y: 0, z: 0 } as never);
    walker.yaw = -Math.PI / 2; // face +x
    run(walker, fakeInput(['KeyW']), boxes, 2);
    expect(walker.pos.x).toBeLessThan(3);

    // Sliding: gets under and out the other side even though the slide would
    // normally end halfway (it keeps crawling while something is overhead).
    const slider = new Player();
    slider.spawn({ x: 0, y: 0, z: 0 } as never);
    slider.yaw = -Math.PI / 2;
    const input = fakeInput(['KeyW']);
    run(slider, input, boxes, 0.6);
    input.pressed.add('KeyC');
    run(slider, input, boxes, 3);
    expect(slider.pos.x).toBeGreaterThan(8);
    expect(slider.height).toBeCloseTo(1.75);
  });
});
