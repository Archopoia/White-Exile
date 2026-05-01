import { describe, expect, it } from 'vitest';
import { Room } from './room.js';

function makePlayer(id: string) {
  return {
    id,
    name: `p_${id}`,
    isBot: false,
    tier: 'dust' as const,
    position: { x: 0, y: 0, z: 0 },
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

  it('applies bursts and increases player essence spread', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    const result = room.applyBurst('a', 1, 1_000);
    expect(result.ok).toBe(true);
    expect(result.essenceSpreadAdded).toBeGreaterThan(0);
    expect(room.get('a')?.essenceSpread).toBeCloseTo(result.essenceSpreadAdded);
  });

  it('rejects bursts within cooldown', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    expect(room.applyBurst('a', 1, 1_000).ok).toBe(true);
    expect(room.applyBurst('a', 1, 1_010).ok).toBe(false);
  });

  it('snapshot includes derived planet radius from aggregate spread', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.applyBurst('a', 1, 1_000);
    const snap = room.snapshot();
    expect(snap.players.length).toBe(1);
    expect(snap.players[0]?.essenceSpread).toBeGreaterThan(0);
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
    const spreadBefore = room.get('a')?.essenceSpread ?? 0;
    room.markDisconnected('a', 2_000);
    const reattached = room.tryReattach('a');
    expect(reattached?.id).toBe('a');
    expect(reattached?.disconnected).toBe(false);
    expect(room.get('a')?.essenceSpread).toBe(spreadBefore);
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

  it('serializes and restores players with essence spread', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.applyBurst('a', 1, 1_000);
    const data = room.serialize();
    const restored = Room.restore(data);
    expect(restored.totalRecords()).toBe(1);
    expect(restored.snapshot().players).toEqual([]);
    const reattached = restored.tryReattach('a');
    expect(reattached?.essenceSpread).toBeGreaterThanOrEqual(0);
    expect(restored.snapshot().players.length).toBe(1);
  });
});
