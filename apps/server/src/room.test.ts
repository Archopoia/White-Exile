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

  it('hides soft-disconnected players from snapshots and counts', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.addPlayer(makePlayer('b'));
    room.markDisconnected('a', 1_000);
    expect(room.size()).toBe(1);
    expect(room.totalRecords()).toBe(2);
    expect(room.snapshot().players.map((p) => p.id)).toEqual(['b']);
  });

  it('reattaches an existing record via tryReattach', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.applyBurst('a', 1, 1_000);
    const dustBefore = room.totalDust;
    room.markDisconnected('a', 2_000);
    const reattached = room.tryReattach('a');
    expect(reattached?.id).toBe('a');
    expect(reattached?.disconnected).toBe(false);
    expect(room.totalDust).toBe(dustBefore);
  });

  it('prunes only after the grace window elapses', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('human'));
    room.addPlayer({ ...makePlayer('bot'), isBot: true });
    room.markDisconnected('human', 0);
    room.markDisconnected('bot', 0);

    const earlyDropped = room.pruneDisconnected({
      now: 5_000,
      botGraceMs: 10_000,
      humanGraceMs: 60_000,
    });
    expect(earlyDropped).toEqual([]);

    const midDropped = room.pruneDisconnected({
      now: 15_000,
      botGraceMs: 10_000,
      humanGraceMs: 60_000,
    });
    expect(midDropped).toEqual(['bot']);

    const lateDropped = room.pruneDisconnected({
      now: 65_000,
      botGraceMs: 10_000,
      humanGraceMs: 60_000,
    });
    expect(lateDropped).toEqual(['human']);
    expect(room.totalRecords()).toBe(0);
  });

  it('serializes and restores totalDust + players', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.applyBurst('a', 1, 1_000);
    const data = room.serialize();
    const restored = Room.restore(data);
    expect(restored.totalDust).toBeCloseTo(room.totalDust);
    expect(restored.totalRecords()).toBe(1);
    // Restored players are soft-disconnected until they reconnect.
    expect(restored.snapshot().players).toEqual([]);
    const reattached = restored.tryReattach('a');
    expect(reattached?.essence).toBeGreaterThanOrEqual(0);
    expect(restored.snapshot().players.length).toBe(1);
  });
});
