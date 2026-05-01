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
        selfPlayerId: null,
        snapshot: null,
        elapsed: 0,
      });
      expect(Number.isFinite(out.position.x)).toBe(true);
      expect(Number.isFinite(out.position.y)).toBe(true);
      expect(Number.isFinite(out.position.z)).toBe(true);
    }
  });

  it('drifter keeps updating position over time', () => {
    const rng = mulberry32(1);
    const behavior = createBehavior('drifter', rng);
    const ctx = {
      rng,
      botId: 0,
      selfPlayerId: null,
      snapshot: null,
      elapsed: 0,
    };
    let last = behavior.tick(1.0, ctx).position;
    let moved = 0;
    // 10 ticks with cooldown drained each time guarantees at least one retarget.
    for (let i = 0; i < 10; i++) {
      const next = behavior.tick(1.0, ctx).position;
      moved += (next.x - last.x) ** 2 + (next.y - last.y) ** 2 + (next.z - last.z) ** 2;
      last = next;
    }
    expect(moved).toBeGreaterThan(1e-6);
  });
});
