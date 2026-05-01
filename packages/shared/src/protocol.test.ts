import { describe, expect, it } from 'vitest';
import {
  ClientHelloSchema,
  ClientMoveSchema,
  ClientRoomSettingsPatchSchema,
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
      displayName: 'Explorer',
      isBot: false,
    });
    expect(parsed.displayName).toBe('Explorer');
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
      displayName: 'Explorer',
    });
    expect(result.success).toBe(false);
  });

  it('defaults isBot to false', () => {
    const parsed = ClientHelloSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      displayName: 'Explorer',
    });
    expect(parsed.isBot).toBe(false);
  });
});

describe('ClientMoveSchema', () => {
  it('accepts finite vectors', () => {
    const parsed = ClientMoveSchema.parse({
      position: { x: 1, y: 2, z: 3 },
    });
    expect(parsed.position.y).toBe(2);
  });

  it('rejects NaN coordinates', () => {
    const result = ClientMoveSchema.safeParse({
      position: { x: 1, y: Number.NaN, z: 3 },
    });
    expect(result.success).toBe(false);
  });
});

describe('ClientRoomSettingsPatchSchema', () => {
  it('accepts partial settings', () => {
    const parsed = ClientRoomSettingsPatchSchema.parse({ roomNote: 'Hello' });
    expect(parsed.roomNote).toBe('Hello');
  });

  it('accepts empty patch', () => {
    const parsed = ClientRoomSettingsPatchSchema.parse({});
    expect(parsed).toEqual({});
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
      resumeToken: 'p1',
      resumed: true,
      race: 'emberfolk',
      worldConfig: {
        fogBaseDensity: 0.02,
        spawnRadius: 600,
        followerCap: 32,
        ruinCap: 8,
        relicCap: 4,
      },
    });
    expect(parsed.tickHz).toBe(15);
    expect(parsed.resumeToken).toBe('p1');
    expect(parsed.resumed).toBe(true);
    expect(parsed.race).toBe('emberfolk');
  });

  it('welcome.resumed defaults to false', () => {
    const parsed = ServerWelcomeSchema.parse({
      playerId: 'p1',
      traceId: 't1',
      roomId: 'default',
      protocolVersion: PROTOCOL_VERSION,
      tickHz: 15,
      resumeToken: 'p1',
      race: 'ashborn',
      worldConfig: {
        fogBaseDensity: 0.02,
        spawnRadius: 600,
        followerCap: 32,
        ruinCap: 8,
        relicCap: 4,
      },
    });
    expect(parsed.resumed).toBe(false);
  });

  it('room snapshot accepts an empty player list', () => {
    const parsed = RoomSnapshotSchema.parse({
      serverTime: 0,
      tick: 0,
      settings: { roomNote: '' },
      worldConfig: {
        fogBaseDensity: 0.02,
        spawnRadius: 600,
        followerCap: 32,
        ruinCap: 8,
        relicCap: 4,
      },
      players: [],
      followers: [],
      ruins: [],
      relics: [],
      caravans: [],
    });
    expect(parsed.players).toEqual([]);
  });
});
