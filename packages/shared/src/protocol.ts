/**
 * White Exile wire protocol.
 *
 * Versioned handshake: bump PROTOCOL_VERSION on breaking changes; the server
 * rejects mismatched clients on join.
 */
import { z } from 'zod';
import { Vec3Schema, type Vec3 } from './vec3.js';
import {
  CaravanSnapshotSchema,
  DEFAULT_WORLD_CONFIG,
  FollowerSnapshotSchema,
  RaceSchema,
  RelicSnapshotSchema,
  RuinSnapshotSchema,
  WorldConfigSchema,
  ZoneSchema,
  type WorldConfig,
} from './world.js';

/**
 * Bumped to `2` for the White Exile schema (race, light, followers, ruins,
 * relics, caravans, intents). Clients on `1` are rejected on hello.
 */
export const PROTOCOL_VERSION = 2 as const;

export { Vec3Schema };
export type { Vec3 };

/** Authoritative room-level fields any client may display. */
export const RoomSettingsSchema = z.object({
  /** Short label shown in the HUD for everyone in the session. */
  roomNote: z.string().max(200).default(''),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  roomNote: '',
};

/* -------------------------------------------------------------------------- */
/* Client -> Server                                                           */
/* -------------------------------------------------------------------------- */

export const ClientHelloSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  displayName: z.string().min(1).max(24),
  isBot: z.boolean().optional().default(false),
  /**
   * Stable session token. If the server still holds this player (live or
   * within the disconnect grace window), the same record is reattached.
   */
  resumeToken: z.string().min(1).max(64).optional(),
  /** Selected race. Server falls back to a default when missing. */
  race: RaceSchema.optional(),
});
export type ClientHello = z.infer<typeof ClientHelloSchema>;

export const ClientMoveSchema = z.object({
  position: Vec3Schema,
});
export type ClientMove = z.infer<typeof ClientMoveSchema>;

export const ClientRoomSettingsPatchSchema = RoomSettingsSchema.partial();
export type ClientRoomSettingsPatch = z.infer<typeof ClientRoomSettingsPatchSchema>;

/** "Try to rescue any stranded follower currently inside my light radius." */
export const ClientRescueIntentSchema = z.object({
  /** Optional explicit target; server falls back to nearest in-light if absent. */
  followerId: z.string().min(1).max(64).optional(),
});
export type ClientRescueIntent = z.infer<typeof ClientRescueIntentSchema>;

/** "Activate a ruin I'm standing in (releases its follower charge)." */
export const ClientActivateRuinSchema = z.object({
  ruinId: z.string().min(1).max(64),
});
export type ClientActivateRuin = z.infer<typeof ClientActivateRuinSchema>;

/* -------------------------------------------------------------------------- */
/* Server -> Client                                                           */
/* -------------------------------------------------------------------------- */

export const ServerWelcomeSchema = z.object({
  playerId: z.string(),
  traceId: z.string(),
  roomId: z.string(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  tickHz: z.number().int().positive(),
  resumeToken: z.string(),
  resumed: z.boolean().optional().default(false),
  /** Race the server actually assigned (may differ if the request was rejected). */
  race: RaceSchema,
  worldConfig: WorldConfigSchema,
});
export type ServerWelcome = z.infer<typeof ServerWelcomeSchema>;

export const PlayerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  isBot: z.boolean(),
  position: Vec3Schema,
  race: RaceSchema,
  /** Effective solo light radius (already includes followers + relics + race). */
  lightRadius: z.number().nonnegative(),
  /** 0..1 fuel; <0.2 means light is dimming. */
  fuel: z.number().min(0).max(1),
  followerCount: z.number().int().nonnegative(),
  /** Caravan id this player belongs to (their own id when alone). */
  caravanId: z.string(),
  zone: ZoneSchema,
});
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;

export const RoomSnapshotSchema = z.object({
  serverTime: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  settings: RoomSettingsSchema,
  worldConfig: WorldConfigSchema,
  players: z.array(PlayerSnapshotSchema),
  followers: z.array(FollowerSnapshotSchema),
  ruins: z.array(RuinSnapshotSchema),
  relics: z.array(RelicSnapshotSchema),
  caravans: z.array(CaravanSnapshotSchema),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const ServerErrorSchema = z.object({
  code: z.union([
    z.literal('protocol_mismatch'),
    z.literal('rate_limit'),
    z.literal('invalid_payload'),
    z.literal('not_found'),
    z.literal('server_error'),
  ]),
  message: z.string(),
});
export type ServerError = z.infer<typeof ServerErrorSchema>;

export { DEFAULT_WORLD_CONFIG };
export type { WorldConfig };

/* -------------------------------------------------------------------------- */
/* Event name constants                                                       */
/* -------------------------------------------------------------------------- */

export const EVT = {
  client: {
    hello: 'client.hello',
    move: 'client.intent.move',
    roomSettingsPatch: 'client.intent.roomSettingsPatch',
    rescue: 'client.intent.rescue',
    activateRuin: 'client.intent.activateRuin',
  },
  server: {
    welcome: 'server.welcome',
    snapshot: 'server.snapshot.roomState',
    error: 'server.error',
  },
} as const;

export type ClientEventName = (typeof EVT.client)[keyof typeof EVT.client];
export type ServerEventName = (typeof EVT.server)[keyof typeof EVT.server];

export const ClientEventPayloads = {
  [EVT.client.hello]: ClientHelloSchema,
  [EVT.client.move]: ClientMoveSchema,
  [EVT.client.roomSettingsPatch]: ClientRoomSettingsPatchSchema,
  [EVT.client.rescue]: ClientRescueIntentSchema,
  [EVT.client.activateRuin]: ClientActivateRuinSchema,
} as const;
