/**
 * Socket.io: hello (race-aware), move/rescue/activate-ruin intents,
 * room settings patches, tick snapshots.
 */
import { randomUUID } from 'node:crypto';
import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { z } from 'zod';
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

  /**
   * Generic intent binder: requires a known player, charges the limiter, runs
   * the schema, and forwards the parsed payload to `handle`. Silent or
   * `ServerError`-emitting depending on the failure (rate-limit floods stay
   * silent on `client.move`; everything else gets a typed reject).
   */
  function bindIntent<S extends z.ZodTypeAny>(
    evt: string,
    schema: S,
    limiter: TokenBucket,
    spec: {
      readonly tagOnReject: boolean;
      readonly rateLimitMessage?: string;
    },
    handle: (data: z.infer<S>, pid: string) => void,
  ): void {
    socket.on(evt, (raw: unknown) => {
      if (!playerId) return;
      if (!limiter.take()) {
        if (spec.tagOnReject) {
          reject('rate_limit', spec.rateLimitMessage ?? `${evt} rate exceeded`, `${evt}.rate_limit`);
        }
        return;
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return reject('invalid_payload', `bad ${evt}`, `${evt}.invalid`);
      }
      handle(parsed.data, playerId);
    });
  }

  bindIntent(
    EVT.client.move,
    ClientMoveSchema,
    limits.move,
    { tagOnReject: false },
    (data, pid) => room.setPosition(pid, data.position),
  );

  bindIntent(
    EVT.client.roomSettingsPatch,
    ClientRoomSettingsPatchSchema,
    limits.roomSettings,
    { tagOnReject: true, rateLimitMessage: 'room settings rate exceeded' },
    (data, pid) => {
      room.patchRoomSettings(data);
      log.info({ evt: 'config.updated', playerId: pid, keys: Object.keys(data) }, 'room settings updated');
      io.to(ROOM_ID).emit(EVT.server.snapshot, room.snapshot());
    },
  );

  bindIntent(
    EVT.client.rescue,
    ClientRescueIntentSchema,
    limits.rescue,
    { tagOnReject: true, rateLimitMessage: 'rescue rate exceeded' },
    (data, pid) => room.enqueueRescue(pid, data.followerId),
  );

  bindIntent(
    EVT.client.activateRuin,
    ClientActivateRuinSchema,
    limits.rescue,
    { tagOnReject: true, rateLimitMessage: 'activation rate exceeded' },
    (data, pid) => room.enqueueRuinActivation(pid, data.ruinId),
  );

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
