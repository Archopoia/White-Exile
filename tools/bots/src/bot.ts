/**
 * Single bot client.
 *
 * Connects via socket.io-client (the same transport as humans), sends a
 * hello with `isBot: true`, then drives a behavior at a fixed tick. All log
 * lines carry `botId` and `name` so a multi-bot session is easy to grep.
 */
import { io, type Socket } from 'socket.io-client';
import {
  EVT,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  type ClientCursorMove,
  type ClientDropBurst,
  type ClientHello,
  type RoomSnapshot,
} from '@tutelary/shared';
import type { Logger } from 'pino';
import type { Behavior, BehaviorContext } from './behaviors.js';
import type { Rng } from './rng.js';

export interface BotOptions {
  url: string;
  botId: number;
  name: string;
  behavior: Behavior;
  rng: Rng;
  tickHz: number;
  logger: Logger;
  /**
   * Stable resume token. Lets the server re-attach this bot's record across
   * dev `tsx watch` restarts (combined with server-side dev persistence) so
   * the world doesn't briefly fill with ghost bots awaiting GC.
   */
  resumeToken?: string;
}

export class Bot {
  private readonly socket: Socket;
  private readonly opts: BotOptions;
  private snapshot: RoomSnapshot | null = null;
  private elapsed = 0;
  private timer: NodeJS.Timeout | null = null;
  private connected = false;

  constructor(options: BotOptions) {
    this.opts = options;
    this.socket = io(options.url, { transports: ['websocket'], autoConnect: true });
    this.bind();
  }

  private bind(): void {
    const { logger } = this.opts;
    this.socket.on('connect', () => {
      this.connected = true;
      logger.info({ evt: 'bot.connected', botId: this.opts.botId, name: this.opts.name });
      const hello: ClientHello = {
        protocolVersion: PROTOCOL_VERSION,
        displayName: this.opts.name,
        isBot: true,
        ...(this.opts.resumeToken ? { resumeToken: this.opts.resumeToken } : {}),
      };
      this.socket.emit(EVT.client.hello, hello);
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      logger.warn({ evt: 'bot.disconnected', botId: this.opts.botId, reason });
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
    // Cap at ~60 Hz so high `--tickHz` stays smooth without starving the event loop.
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
      snapshot: this.snapshot,
      elapsed: this.elapsed,
    };
    const out = this.opts.behavior.tick(dt, ctx);
    const cursorMsg: ClientCursorMove = { position: out.position };
    this.socket.emit(EVT.client.cursorMove, cursorMsg);
    if (out.burst) {
      const burstMsg: ClientDropBurst = { position: out.position, intensity: 1 };
      this.socket.emit(EVT.client.dropBurst, burstMsg);
    }
  }
}
