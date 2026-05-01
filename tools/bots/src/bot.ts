/**
 * Socket.io bot: hello (race-aware), then move + rescue + ruin-activation
 * intents at tickHz. Tracks server-issued playerId so behaviors can read
 * the bot's current authoritative state out of snapshots.
 */
import { io, type Socket } from 'socket.io-client';
import {
  EVT,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  ServerWelcomeSchema,
  type ClientActivateRuin,
  type ClientHello,
  type ClientMove,
  type ClientRescueIntent,
  type Race,
  type RoomSnapshot,
} from '@realtime-room/shared';
import type { Logger } from 'pino';
import type { Behavior, BehaviorContext } from './behaviors.js';
import type { Rng } from './rng.js';

export interface BotOptions {
  url: string;
  botId: number;
  name: string;
  race: Race;
  behavior: Behavior;
  rng: Rng;
  tickHz: number;
  logger: Logger;
  resumeToken?: string;
}

export class Bot {
  private readonly socket: Socket;
  private readonly opts: BotOptions;
  private snapshot: RoomSnapshot | null = null;
  private elapsed = 0;
  private timer: NodeJS.Timeout | null = null;
  private connected = false;
  private playerId: string | null = null;

  constructor(options: BotOptions) {
    this.opts = options;
    this.socket = io(options.url, { transports: ['websocket'], autoConnect: true });
    this.bind();
  }

  private bind(): void {
    const { logger } = this.opts;
    this.socket.on('connect', () => {
      this.connected = true;
      logger.info(
        { evt: 'bot.connected', botId: this.opts.botId, name: this.opts.name, race: this.opts.race },
        'bot connected',
      );
      const hello: ClientHello = {
        protocolVersion: PROTOCOL_VERSION,
        displayName: this.opts.name,
        isBot: true,
        race: this.opts.race,
        ...(this.opts.resumeToken ? { resumeToken: this.opts.resumeToken } : {}),
      };
      this.socket.emit(EVT.client.hello, hello);
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      logger.warn({ evt: 'bot.disconnected', botId: this.opts.botId, reason });
    });
    this.socket.on(EVT.server.welcome, (raw: unknown) => {
      const parsed = ServerWelcomeSchema.safeParse(raw);
      if (parsed.success) {
        this.playerId = parsed.data.playerId;
        logger.debug(
          { evt: 'bot.welcome', botId: this.opts.botId, playerId: this.playerId },
          'bot welcome',
        );
      }
    });
    this.socket.on(EVT.server.snapshot, (raw: unknown) => {
      const parsed = RoomSnapshotSchema.safeParse(raw);
      if (parsed.success) this.snapshot = parsed.data;
    });
    this.socket.on(EVT.server.error, (raw: unknown) => {
      logger.warn({ evt: 'bot.serverError', botId: this.opts.botId, error: raw });
    });
  }

  start(): void {
    if (this.timer) return;
    const intervalMs = Math.max(16, Math.floor(1000 / this.opts.tickHz));
    this.timer = setInterval(() => this.tickOnce(intervalMs / 1000), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket.disconnect();
  }

  private tickOnce(dt: number): void {
    if (!this.connected) return;
    this.elapsed += dt;
    const ctx: BehaviorContext = {
      rng: this.opts.rng,
      botId: this.opts.botId,
      selfPlayerId: this.playerId,
      snapshot: this.snapshot,
      elapsed: this.elapsed,
    };
    const out = this.opts.behavior.tick(dt, ctx);
    const move: ClientMove = { position: out.position };
    this.socket.emit(EVT.client.move, move);
    if (out.rescueFollowerId) {
      const rescue: ClientRescueIntent = { followerId: out.rescueFollowerId };
      this.socket.emit(EVT.client.rescue, rescue);
    }
    if (out.activateRuinId) {
      const activate: ClientActivateRuin = { ruinId: out.activateRuinId };
      this.socket.emit(EVT.client.activateRuin, activate);
    }
  }
}
