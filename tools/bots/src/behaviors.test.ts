import { describe, expect, it } from 'vitest';
import { ALL_BEHAVIORS, createBehavior } from './behaviors.js';
import { mulberry32 } from './rng.js';

describe('bot behaviors', () => {
  it('produces a finite position for every behavior', () => {
    for (const name of ALL_BEHAVIORS) {
      const behavior = createBehavior(name, mulberry32(42));
      const out = behavior.tick(0.1, {
        rng: mulberry32(7),
        botId: 0,
        snapshot: null,
        elapsed: 0,
      });
      expect(Number.isFinite(out.position.x)).toBe(true);
      expect(Number.isFinite(out.position.y)).toBe(true);
      expect(Number.isFinite(out.position.z)).toBe(true);
    }
  });

  it('clicker eventually emits a burst', () => {
    const behavior = createBehavior('clicker', mulberry32(1));
    let bursts = 0;
    for (let i = 0; i < 200; i++) {
      const out = behavior.tick(0.1, {
        rng: mulberry32(i),
        botId: 0,
        snapshot: null,
        elapsed: i * 0.1,
      });
      if (out.burst) bursts++;
    }
    expect(bursts).toBeGreaterThan(0);
  });
});
