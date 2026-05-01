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

  it('drifter keeps updating position over time', () => {
    const behavior = createBehavior('drifter', mulberry32(1));
    const a = behavior.tick(0.1, {
      rng: mulberry32(1),
      botId: 0,
      snapshot: null,
      elapsed: 0,
    }).position;
    const b = behavior.tick(0.5, {
      rng: mulberry32(2),
      botId: 0,
      snapshot: null,
      elapsed: 0.5,
    }).position;
    const moved = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
    expect(moved).toBeGreaterThan(1e-6);
  });
});
