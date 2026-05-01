import { describe, expect, it } from 'vitest';
import { Room } from './room.js';

function makePlayer(id: string) {
  return {
    id,
    name: `p_${id}`,
    isBot: false,
    tier: 'dust' as const,
    position: { x: 0, y: 0, z: 0 },
    essence: 0,
  };
}

describe('Room', () => {
  it('adds and lists players', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.addPlayer(makePlayer('b'));
    expect(room.size()).toBe(2);
    expect(room.list().map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('applies bursts and accumulates totalDust', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    const result = room.applyBurst('a', 1, 1_000);
    expect(result.ok).toBe(true);
    expect(result.dustAdded).toBeGreaterThan(0);
    expect(room.totalDust).toBeCloseTo(result.dustAdded);
  });

  it('rejects bursts within cooldown', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    expect(room.applyBurst('a', 1, 1_000).ok).toBe(true);
    expect(room.applyBurst('a', 1, 1_010).ok).toBe(false);
  });

  it('extract rewards at least the configured minimum', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    const result = room.applyExtract('a', 5_000, () => 0);
    expect(result.ok).toBe(true);
    expect(result.essenceGained).toBeGreaterThan(0);
  });

  it('snapshot includes derived planet radius', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.applyBurst('a', 1, 1_000);
    const snap = room.snapshot();
    expect(snap.players.length).toBe(1);
    expect(snap.planetRadius).toBeGreaterThan(0);
  });
});
