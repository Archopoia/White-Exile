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

const ROOM_ID = 'default';

export function attachSocketServer(httpServer: HttpServer): { io: IOServer; room: Room } {
  const io = new IOServer(httpServer, {
    cors: { origin: config.corsOrigin },
    serveClient: false,
  });
  const room = new Room(ROOM_ID);

  scheduleTickLoop(io, room);

  io.on('connection', (socket) => handleConnection(socket, room, io));
  return { io, room };
}

function handleConnection(socket: Socket, room: Room, io: IOServer): void {
  const traceId = randomUUID();
  const log = childLogger({ connId: socket.id, traceId, roomId: room.id });
  log.info({ evt: 'socket.connected' }, 'socket connected');

  const limits = {
    cursor: new TokenBucket({ ratePerSec: 30, burst: 60 }),
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
    playerId = randomUUID();
    const player = room.addPlayer({
      id: playerId,
      name: parsed.data.displayName,
      isBot: parsed.data.isBot ?? false,
      tier: 'dust',
      position: { x: 0, y: 0, z: 0 },
      essence: 0,
    });
    log.info(
      { evt: 'player.joined', playerId, name: player.name, isBot: player.isBot },
      'player joined',
    );
    const welcome: ServerWelcome = {
      playerId,
      traceId,
      roomId: room.id,
      protocolVersion: PROTOCOL_VERSION,
      tickHz: config.tickHz,
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
    if (!playerId) return;
    if (!limits.burst.take()) {
      return reject('rate_limit', 'burst rate exceeded', 'dropBurst.rate_limit');
    }
    const parsed = ClientDropBurstSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad dropBurst', 'dropBurst.invalid');
    }
    const result = room.applyBurst(playerId, parsed.data.intensity ?? 1);
    if (!result.ok) return;
    const evt: ServerEventBurst = {
      playerId,
      origin: parsed.data.position,
      intensity: parsed.data.intensity ?? 1,
    };
    io.to(ROOM_ID).emit(EVT.server.burst, evt);
    log.debug(
      { evt: 'player.burst', playerId, dustAdded: result.dustAdded },
      'burst applied',
    );
  });

  socket.on(EVT.client.extract, (raw: unknown) => {
    if (!playerId) return;
    if (!limits.extract.take()) {
      return reject('rate_limit', 'extract rate exceeded', 'extract.rate_limit');
    }
    const parsed = ClientExtractSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad extract', 'extract.invalid');
    }
    const result = room.applyExtract(playerId);
    if (!result.ok) return;
    const evt: ServerEventEssence = {
      playerId,
      amount: result.essenceGained,
      newTotal: result.newEssence,
    };
    socket.emit(EVT.server.essence, evt);
  });

  socket.on('disconnect', (reason) => {
    if (playerId) {
      room.removePlayer(playerId);
      log.info({ evt: 'player.left', playerId, reason }, 'player left');
    } else {
      log.info({ evt: 'socket.disconnected', reason }, 'socket disconnected');
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
