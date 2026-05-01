/**
 * Wire protocol for the realtime room skeleton.
 *
 * Versioned handshake: bump PROTOCOL_VERSION on breaking changes; the server
 * rejects mismatched clients on join.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

/** Compact 3D vector. Coordinates are clamped server-side to the play volume. */
export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

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
});
export type ClientHello = z.infer<typeof ClientHelloSchema>;

export const ClientMoveSchema = z.object({
  position: Vec3Schema,
});
export type ClientMove = z.infer<typeof ClientMoveSchema>;

export const ClientRoomSettingsPatchSchema = RoomSettingsSchema.partial();
export type ClientRoomSettingsPatch = z.infer<typeof ClientRoomSettingsPatchSchema>;

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
});
export type ServerWelcome = z.infer<typeof ServerWelcomeSchema>;

export const PlayerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  isBot: z.boolean(),
  position: Vec3Schema,
});
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;

export const RoomSnapshotSchema = z.object({
  serverTime: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  settings: RoomSettingsSchema,
  players: z.array(PlayerSnapshotSchema),
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

/* -------------------------------------------------------------------------- */
/* Event name constants                                                       */
/* -------------------------------------------------------------------------- */

export const EVT = {
  client: {
    hello: 'client.hello',
    move: 'client.intent.move',
    roomSettingsPatch: 'client.intent.roomSettingsPatch',
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
} as const;
