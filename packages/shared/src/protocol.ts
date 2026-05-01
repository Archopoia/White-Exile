/**
 * Tutelary wire protocol.
 *
 * Single source of truth for client <-> server messages. Both apps and tools
 * import from here; never duplicate event names or payload shapes elsewhere.
 *
 * Versioned envelope: bump PROTOCOL_VERSION on breaking changes; the server
 * rejects mismatched clients on the join handshake.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

/** Compact 3D vector. Floats are clamped server-side to a play volume. */
export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

export const SpiritTierSchema = z.union([
  z.literal('dust'),
  z.literal('water'),
  z.literal('fire'),
  z.literal('air'),
  z.literal('verdant'),
]);
export type SpiritTier = z.infer<typeof SpiritTierSchema>;

/* -------------------------------------------------------------------------- */
/* Client -> Server                                                            */
/* -------------------------------------------------------------------------- */

export const ClientHelloSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  displayName: z.string().min(1).max(24),
  isBot: z.boolean().optional().default(false),
});
export type ClientHello = z.infer<typeof ClientHelloSchema>;

export const ClientCursorMoveSchema = z.object({
  position: Vec3Schema,
});
export type ClientCursorMove = z.infer<typeof ClientCursorMoveSchema>;

export const ClientDropBurstSchema = z.object({
  position: Vec3Schema,
  intensity: z.number().min(0).max(1).default(1),
});
export type ClientDropBurst = z.infer<typeof ClientDropBurstSchema>;

export const ClientExtractSchema = z.object({
  surfacePoint: Vec3Schema,
});
export type ClientExtract = z.infer<typeof ClientExtractSchema>;

export const ClientUpgradeSchema = z.object({
  path: z.union([z.literal('mass'), z.literal('complexity')]),
});
export type ClientUpgrade = z.infer<typeof ClientUpgradeSchema>;

/* -------------------------------------------------------------------------- */
/* Server -> Client                                                            */
/* -------------------------------------------------------------------------- */

export const ServerWelcomeSchema = z.object({
  playerId: z.string(),
  traceId: z.string(),
  roomId: z.string(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  tickHz: z.number().int().positive(),
});
export type ServerWelcome = z.infer<typeof ServerWelcomeSchema>;

export const PlayerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  isBot: z.boolean(),
  tier: SpiritTierSchema,
  position: Vec3Schema,
  essence: z.number().nonnegative(),
});
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;

export const RoomSnapshotSchema = z.object({
  serverTime: z.number().int().nonnegative(),
  totalDust: z.number().nonnegative(),
  planetRadius: z.number().nonnegative(),
  players: z.array(PlayerSnapshotSchema),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const ServerEventBurstSchema = z.object({
  playerId: z.string(),
  origin: Vec3Schema,
  intensity: z.number().min(0).max(1),
});
export type ServerEventBurst = z.infer<typeof ServerEventBurstSchema>;

export const ServerEventEssenceSchema = z.object({
  playerId: z.string(),
  amount: z.number(),
  newTotal: z.number().nonnegative(),
});
export type ServerEventEssence = z.infer<typeof ServerEventEssenceSchema>;

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
/* Event name constants (typed strings)                                        */
/* -------------------------------------------------------------------------- */

export const EVT = {
  client: {
    hello: 'client.hello',
    cursorMove: 'client.intent.cursorMove',
    dropBurst: 'client.intent.dropBurst',
    extract: 'client.intent.extract',
    upgrade: 'client.intent.upgrade',
  },
  server: {
    welcome: 'server.welcome',
    snapshot: 'server.snapshot.roomState',
    burst: 'server.event.burst',
    essence: 'server.event.essence',
    error: 'server.error',
  },
} as const;

export type ClientEventName = (typeof EVT.client)[keyof typeof EVT.client];
export type ServerEventName = (typeof EVT.server)[keyof typeof EVT.server];

export const ClientEventPayloads = {
  [EVT.client.hello]: ClientHelloSchema,
  [EVT.client.cursorMove]: ClientCursorMoveSchema,
  [EVT.client.dropBurst]: ClientDropBurstSchema,
  [EVT.client.extract]: ClientExtractSchema,
  [EVT.client.upgrade]: ClientUpgradeSchema,
} as const;
