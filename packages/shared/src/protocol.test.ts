import { describe, expect, it } from 'vitest';
import {
  ClientCursorMoveSchema,
  ClientDropBurstSchema,
  ClientHelloSchema,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  ServerWelcomeSchema,
} from './protocol.js';

describe('protocol envelope', () => {
  it('exposes a numeric protocol version', () => {
    expect(typeof PROTOCOL_VERSION).toBe('number');
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('ClientHelloSchema', () => {
  it('accepts a valid hello', () => {
    const parsed = ClientHelloSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      displayName: 'Spirit',
      isBot: false,
    });
    expect(parsed.displayName).toBe('Spirit');
  });

  it('rejects oversized display names', () => {
    const big = 'x'.repeat(64);
    const result = ClientHelloSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      displayName: big,
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched protocol versions', () => {
    const result = ClientHelloSchema.safeParse({
      protocolVersion: 999,
      displayName: 'Spirit',
    });
    expect(result.success).toBe(false);
  });

  it('defaults isBot to false', () => {
    const parsed = ClientHelloSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      displayName: 'Spirit',
    });
    expect(parsed.isBot).toBe(false);
  });
});

describe('ClientCursorMoveSchema', () => {
  it('accepts finite vectors', () => {
    const parsed = ClientCursorMoveSchema.parse({
      position: { x: 1, y: 2, z: 3 },
    });
    expect(parsed.position.y).toBe(2);
  });

  it('rejects NaN coordinates', () => {
    const result = ClientCursorMoveSchema.safeParse({
      position: { x: 1, y: Number.NaN, z: 3 },
    });
    expect(result.success).toBe(false);
  });
});

describe('ClientDropBurstSchema', () => {
  it('clamps intensity within range', () => {
    const result = ClientDropBurstSchema.safeParse({
      position: { x: 0, y: 0, z: 0 },
      intensity: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('Server schemas', () => {
  it('round-trip welcome', () => {
    const parsed = ServerWelcomeSchema.parse({
      playerId: 'p1',
      traceId: 't1',
      roomId: 'default',
      protocolVersion: PROTOCOL_VERSION,
      tickHz: 15,
    });
    expect(parsed.tickHz).toBe(15);
  });

  it('room snapshot accepts an empty player list', () => {
    const parsed = RoomSnapshotSchema.parse({
      serverTime: 0,
      totalDust: 0,
      planetRadius: 0.5,
      players: [],
    });
    expect(parsed.players).toEqual([]);
  });
});
