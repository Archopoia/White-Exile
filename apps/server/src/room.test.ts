import { describe, expect, it } from 'vitest';
import { Room } from './room.js';

function makePlayer(id: string) {
  return {
    id,
    name: `p_${id}`,
    isBot: false,
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

  it('snapshot lists visible players and settings', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.patchRoomSettings({ roomNote: 'Hi' });
    const snap = room.snapshot();
    expect(snap.players.length).toBe(1);
    expect(snap.players[0]?.id).toBe('a');
    expect(snap.settings.roomNote).toBe('Hi');
    expect(snap.tick).toBeGreaterThanOrEqual(0);
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
    room.setPosition('a', { x: 1, y: 2, z: 3 });
    room.markDisconnected('a', 2_000);
    const reattached = room.tryReattach('a');
    expect(reattached?.id).toBe('a');
    expect(reattached?.disconnected).toBe(false);
    expect(room.get('a')?.position.x).toBeCloseTo(1, 5);
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

  it('serializes and restores players', () => {
    const room = new Room('test');
    room.addPlayer(makePlayer('a'));
    room.patchRoomSettings({ roomNote: 'Saved' });
    const data = room.serialize();
    const restored = Room.restore(data);
    expect(restored.totalRecords()).toBe(1);
    expect(restored.snapshot().players).toEqual([]);
    restored.tryReattach('a');
    expect(restored.snapshot().players.length).toBe(1);
    expect(restored.getSettings().roomNote).toBe('Saved');
  });
});
