/**
 * Socket.io: hello (race-aware), move/rescue/activate-ruin intents,
 * room settings patches, tick snapshots.
 */
import { randomUUID } from 'node:crypto';
import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import {
  ClientActivateRuinSchema,
  ClientHelloSchema,
  ClientMoveSchema,
  ClientRescueIntentSchema,
  ClientRoomSettingsPatchSchema,
  DEFAULT_RACE,
  EVT,
  PROTOCOL_VERSION,
  isRace,
  type RoomSnapshot,
  type ServerError,
  type ServerWelcome,
} from '@realtime-room/shared';
import { config } from './config.js';
import { childLogger, logger } from './logger.js';
import { TokenBucket } from './rateLimiter.js';
import { Room } from './room.js';

export const ROOM_ID = 'default';

export function attachSocketServer(
  httpServer: HttpServer,
  initialRoom: Room,
): { io: IOServer; room: Room } {
  const io = new IOServer(httpServer, {
    cors: { origin: config.corsOrigin },
    serveClient: false,
  });

  scheduleTickLoop(io, initialRoom);
  schedulePruneLoop(initialRoom);

  io.on('connection', (socket) => handleConnection(socket, initialRoom, io));
  return { io, room: initialRoom };
}

function handleConnection(socket: Socket, room: Room, io: IOServer): void {
  const traceId = randomUUID();
  const log = childLogger({ connId: socket.id, traceId, roomId: room.id });
  log.debug({ evt: 'socket.connected' }, 'socket connected');

  const limits = {
    move: new TokenBucket({ ratePerSec: config.move.ratePerSec, burst: config.move.burst }),
    roomSettings: new TokenBucket({
      ratePerSec: config.roomSettingsPatch.ratePerSec,
      burst: config.roomSettingsPatch.burst,
    }),
    rescue: new TokenBucket({
      ratePerSec: config.rescue.ratePerSec,
      burst: config.rescue.burst,
    }),
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

    let resumed = false;
    const incomingRace = parsed.data.race && isRace(parsed.data.race) ? parsed.data.race : DEFAULT_RACE;
    if (parsed.data.resumeToken) {
      const existing = room.tryReattach(parsed.data.resumeToken);
      if (existing) {
        playerId = existing.id;
        existing.name = parsed.data.displayName;
        existing.isBot = parsed.data.isBot ?? existing.isBot;
        if (parsed.data.race && isRace(parsed.data.race)) existing.race = parsed.data.race;
        resumed = true;
      }
    }

    if (!playerId) {
      playerId = randomUUID();
      room.addPlayer({
        id: playerId,
        name: parsed.data.displayName,
        isBot: parsed.data.isBot ?? false,
        race: incomingRace,
        position: { x: 0, y: 2, z: 8 },
      });
    }

    const player = room.get(playerId);
    const joinPayload = {
      evt: resumed ? 'player.resumed' : 'player.joined',
      playerId,
      name: player?.name,
      isBot: player?.isBot,
      race: player?.race,
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
      race: player?.race ?? incomingRace,
      worldConfig: room.getWorldConfig(),
    };
    socket.emit(EVT.server.welcome, welcome);
    socket.emit(EVT.server.snapshot, room.snapshot());
  });

  socket.on(EVT.client.move, (raw: unknown) => {
    if (!playerId) return;
    if (!limits.move.take()) return;
    const parsed = ClientMoveSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad move', 'move.invalid');
    }
    room.setPosition(playerId, parsed.data.position);
  });

  socket.on(EVT.client.roomSettingsPatch, (raw: unknown) => {
    if (!playerId) return;
    if (!limits.roomSettings.take()) {
      return reject('rate_limit', 'room settings rate exceeded', 'roomSettingsPatch.rate_limit');
    }
    const parsed = ClientRoomSettingsPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad roomSettingsPatch', 'roomSettingsPatch.invalid');
    }
    room.patchRoomSettings(parsed.data);
    log.info(
      { evt: 'config.updated', playerId, keys: Object.keys(parsed.data) },
      'room settings updated',
    );
    io.to(ROOM_ID).emit(EVT.server.snapshot, room.snapshot());
  });

  socket.on(EVT.client.rescue, (raw: unknown) => {
    if (!playerId) return;
    if (!limits.rescue.take()) {
      return reject('rate_limit', 'rescue rate exceeded', 'rescue.rate_limit');
    }
    const parsed = ClientRescueIntentSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad rescue', 'rescue.invalid');
    }
    room.enqueueRescue(playerId, parsed.data.followerId);
  });

  socket.on(EVT.client.activateRuin, (raw: unknown) => {
    if (!playerId) return;
    if (!limits.rescue.take()) {
      return reject('rate_limit', 'activation rate exceeded', 'activateRuin.rate_limit');
    }
    const parsed = ClientActivateRuinSchema.safeParse(raw);
    if (!parsed.success) {
      return reject('invalid_payload', 'bad activate', 'activateRuin.invalid');
    }
    room.enqueueRuinActivation(playerId, parsed.data.ruinId);
  });

  socket.on('disconnect', (reason) => {
    if (playerId) {
      const marked = room.markDisconnected(playerId);
      const discPayload = { evt: 'player.disconnected', playerId, reason, marked };
      if (room.get(playerId)?.isBot) log.debug(discPayload, 'player disconnected');
      else log.info(discPayload, 'player disconnected');
    } else {
      log.debug({ evt: 'socket.disconnected', reason }, 'socket disconnected');
    }
  });

  void socket.join(ROOM_ID);
}

function scheduleTickLoop(io: IOServer, room: Room): void {
  const intervalMs = Math.max(20, Math.floor(1000 / config.tickHz));
  let tickCount = 0;
  setInterval(() => {
    const stats = room.tick();
    const snap: RoomSnapshot = room.snapshot();
    io.to(ROOM_ID).emit(EVT.server.snapshot, snap);
    tickCount++;
    if (
      stats.combatAbsorptions > 0 ||
      stats.rescuesGranted > 0 ||
      stats.ruinsActivated > 0
    ) {
      logger.debug(
        {
          evt: 'sim.tick_stats',
          tick: snap.tick,
          ...stats,
        },
        'sim tick stats',
      );
    }
    if (tickCount % (config.tickHz * 10) === 0) {
      const diag = room.diagnostics();
      logger.info(
        {
          evt: 'room.tick',
          roomId: room.id,
          tick: snap.tick,
          ...diag,
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
