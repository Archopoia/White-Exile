/**
 * Socket.io glue for the authoritative room.
 *
 * Each connection:
 *   1. Awaits a ClientHello with matching protocol version.
 *   2. Receives a ServerWelcome with traceId + tickHz.
 *   3. Streams cursor / burst / extract intents.
 * Every inbound payload is parsed with Zod from packages/shared. Bad payloads
 * are logged and rejected; we never trust the client for economy values.
 */
import { randomUUID } from 'node:crypto';
import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import {
  ClientCursorMoveSchema,
  ClientDropBurstSchema,
  ClientExtractSchema,
  ClientHelloSchema,
  EVT,
  PROTOCOL_VERSION,
  type RoomSnapshot,
  type ServerError,
  type ServerEventBurst,
  type ServerEventEssence,
  type ServerWelcome,
} from '@tutelary/shared';
import { config } from './config.js';
import { childLogger, logger } from './logger.js';
import { TokenBucket } from './rateLimiter.js';
import { Room } from './room.js';

export const ROOM_ID = 'default';

export function attachSocketServer(
  httpServer: HttpServer,
  initialRoom?: Room,
): { io: IOServer; room: Room } {
  const io = new IOServer(httpServer, {
    cors: { origin: config.corsOrigin },
    serveClient: false,
  });
  const room = initialRoom ?? new Room(ROOM_ID);

  scheduleTickLoop(io, room);
  schedulePruneLoop(room);

  io.on('connection', (socket) => handleConnection(socket, room, io));
  return { io, room };
}

function handleConnection(socket: Socket, room: Room, io: IOServer): void {
  const traceId = randomUUID();
  const log = childLogger({ connId: socket.id, traceId, roomId: room.id });
  // High-volume with many bots; use LOG_LEVEL=debug to see every connect.
  log.debug({ evt: 'socket.connected' }, 'socket connected');

  const limits = {
    cursor: new TokenBucket({ ratePerSec: 48, burst: 96 }),
    burst: new TokenBucket({ ratePerSec: config.bursts.perSec, burst: config.bursts.perSec }),
    extract: new TokenBucket({ ratePerSec: 8, burst: 8 }),
    other: new TokenBucket({
      ratePerSec: config.rateLimitMessagesPerSec,
      burst: config.rateLimitBurst,
    }),
  };

  let playerId: string | null = null;

  function reject(code: ServerError['code'], message: string, evt: string): void {
    log.warn({ evt, code }, message);
    const err: ServerError = { code, message };
    socket.emit(EVT.server.error, err);
  }

  socket.on(EVT.client.hello, (raw: unknown) => {
    if (!limits.other.take()) return reject('rate_limit', 'too many handshakes', 'hello.rate_limit');
    const parsed = ClientHelloSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad hello', 'hello.invalid');
    }
    if (parsed.data.protocolVersion !== PROTOCOL_VERSION) {
      return reject('protocol_mismatch', 'protocol mismatch', 'hello.protocol_mismatch');
    }

    // Try to reattach by resumeToken before allocating a new player.
    let resumed = false;
    if (parsed.data.resumeToken) {
      const existing = room.tryReattach(parsed.data.resumeToken);
      if (existing) {
        playerId = existing.id;
        existing.name = parsed.data.displayName;
        existing.isBot = parsed.data.isBot ?? existing.isBot;
        resumed = true;
      }
    }

    if (!playerId) {
      playerId = randomUUID();
      room.addPlayer({
        id: playerId,
        name: parsed.data.displayName,
        isBot: parsed.data.isBot ?? false,
        tier: 'dust',
        position: { x: 0, y: 0, z: 0 },
        essence: 0,
      });
    }

    const player = room.get(playerId);
    const joinPayload = {
      evt: resumed ? 'player.resumed' : 'player.joined',
      playerId,
      name: player?.name,
      isBot: player?.isBot,
      resumed,
    } as const;
    const joinMsg = resumed ? 'player resumed' : 'player joined';
    if (player?.isBot) log.debug(joinPayload, joinMsg);
    else log.info(joinPayload, joinMsg);
    const welcome: ServerWelcome = {
      playerId,
      traceId,
      roomId: room.id,
      protocolVersion: PROTOCOL_VERSION,
      tickHz: config.tickHz,
      resumeToken: playerId,
      resumed,
    };
    socket.emit(EVT.server.welcome, welcome);
    socket.emit(EVT.server.snapshot, room.snapshot());
  });

  socket.on(EVT.client.cursorMove, (raw: unknown) => {
    if (!playerId) return;
    if (!limits.cursor.take()) return;
    const parsed = ClientCursorMoveSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad cursorMove', 'cursorMove.invalid');
    }
    room.setPosition(playerId, parsed.data.position);
  });

  socket.on(EVT.client.dropBurst, (raw: unknown) => {
    if (!playerId) {
      log.warn({ evt: 'intent.dropBurst.ignored', reason: 'before_hello' }, 'burst before hello');
      return;
    }
    if (!limits.burst.take()) {
      return reject('rate_limit', 'burst rate exceeded', 'dropBurst.rate_limit');
    }
    const parsed = ClientDropBurstSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad dropBurst', 'dropBurst.invalid');
    }
    const result = room.applyBurst(playerId, parsed.data.intensity ?? 1);
    if (!result.ok) {
      const deniedPayload = {
        evt: 'intent.dropBurst.denied',
        playerId,
        reason: result.reason ?? 'unknown',
        intensity: parsed.data.intensity,
      };
      if (room.get(playerId)?.isBot) log.debug(deniedPayload, 'burst denied');
      else log.info(deniedPayload, 'burst denied');
      return;
    }
    const evt: ServerEventBurst = {
      playerId,
      origin: parsed.data.position,
      intensity: parsed.data.intensity ?? 1,
    };
    io.to(ROOM_ID).emit(EVT.server.burst, evt);
    const burstPayload = {
      evt: 'intent.dropBurst',
      playerId,
      dustAdded: result.dustAdded,
      intensity: parsed.data.intensity ?? 1,
      origin: parsed.data.position,
    };
    if (room.get(playerId)?.isBot) log.debug(burstPayload, 'burst accepted');
    else log.info(burstPayload, 'burst accepted');
  });

  socket.on(EVT.client.extract, (raw: unknown) => {
    if (!playerId) {
      log.warn({ evt: 'intent.extract.ignored', reason: 'before_hello' }, 'extract before hello');
      return;
    }
    if (!limits.extract.take()) {
      return reject('rate_limit', 'extract rate exceeded', 'extract.rate_limit');
    }
    const parsed = ClientExtractSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad extract', 'extract.invalid');
    }
    const result = room.applyExtract(playerId);
    if (!result.ok) {
      const extDenied = {
        evt: 'intent.extract.denied',
        playerId,
        reason: result.reason ?? 'unknown',
        surfacePoint: parsed.data.surfacePoint,
      };
      if (room.get(playerId)?.isBot) log.debug(extDenied, 'extract denied');
      else log.info(extDenied, 'extract denied');
      return;
    }
    const evt: ServerEventEssence = {
      playerId,
      amount: result.essenceGained,
      newTotal: result.newEssence,
    };
    socket.emit(EVT.server.essence, evt);
    const extOk = {
      evt: 'intent.extract',
      playerId,
      essenceGained: result.essenceGained,
      newTotal: result.newEssence,
      surfacePoint: parsed.data.surfacePoint,
    };
    if (room.get(playerId)?.isBot) log.debug(extOk, 'extract accepted');
    else log.info(extOk, 'extract accepted');
  });

  socket.on('disconnect', (reason) => {
    if (playerId) {
      // Soft-disconnect: keep the record so refresh / HMR / server-restart
      // can resume via `resumeToken`. `pruneDisconnected` finalizes.
      const marked = room.markDisconnected(playerId);
      const discPayload = { evt: 'player.disconnected', playerId, reason, marked };
      if (room.get(playerId)?.isBot) log.debug(discPayload, 'player disconnected');
      else log.info(discPayload, 'player disconnected');
    } else {
      log.debug({ evt: 'socket.disconnected', reason }, 'socket disconnected');
    }
  });

  void io;
  void socket.join(ROOM_ID);
}

function scheduleTickLoop(io: IOServer, room: Room): void {
  const intervalMs = Math.max(20, Math.floor(1000 / config.tickHz));
  let tickCount = 0;
  setInterval(() => {
    room.tick();
    const snap: RoomSnapshot = room.snapshot();
    io.to(ROOM_ID).emit(EVT.server.snapshot, snap);
    tickCount++;
    if (tickCount % (config.tickHz * 10) === 0) {
      logger.info(
        {
          evt: 'room.tick',
          roomId: room.id,
          players: room.size(),
          totalDust: snap.totalDust.toFixed(2),
          planetRadius: snap.planetRadius.toFixed(2),
        },
        'periodic tick',
      );
    }
  }, intervalMs);
  logger.info({ evt: 'room.loop_started', tickHz: config.tickHz, intervalMs }, 'tick loop started');
}

function schedulePruneLoop(room: Room): void {
  const { pruneIntervalMs, botGraceMs, humanGraceMs } = config.devPersistence;
  setInterval(() => {
    const dropped = room.pruneDisconnected({ botGraceMs, humanGraceMs });
    if (dropped.length > 0) {
      logger.info(
        { evt: 'room.pruned', roomId: room.id, dropped: dropped.length, ids: dropped },
        'pruned soft-disconnected players',
      );
    }
  }, pruneIntervalMs);
}
