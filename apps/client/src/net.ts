/**
 * Socket transport for the client.
 *
 * Handles the hello handshake, snapshot decode, and emits typed callbacks.
 * The simulation/render loop (`scene.ts`) consumes these via `onSnapshot`,
 * `onWelcome`, `onError`. No game logic lives here.
 */
import { io, type Socket } from 'socket.io-client';
import {
  EVT,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  ServerEventBurstSchema,
  ServerEventEssenceSchema,
  ServerErrorSchema,
  ServerWelcomeSchema,
  type ClientCursorMove,
  type ClientDropBurst,
  type ClientExtract,
  type ClientHello,
  type RoomSnapshot,
  type ServerEventBurst,
  type ServerEventEssence,
  type ServerError,
  type ServerWelcome,
  type Vec3,
} from '@tutelary/shared';
import { debugLogger } from './debug.js';
import { inputLog } from './inputLog.js';

export interface NetClientOptions {
  url: string;
  displayName: string;
  isBot?: boolean;
  /**
   * Optional stable token from a prior session (typically read from
   * localStorage). Lets the server reattach our existing player record so a
   * refresh / HMR / server restart preserves essence and position.
   */
  resumeToken?: string;
}

export interface NetClientCallbacks {
  onWelcome?: (welcome: ServerWelcome) => void;
  onSnapshot?: (snap: RoomSnapshot) => void;
  onBurst?: (evt: ServerEventBurst) => void;
  onEssence?: (evt: ServerEventEssence) => void;
  onError?: (err: ServerError) => void;
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
}

export class NetClient {
  private readonly socket: Socket;
  private readonly callbacks: NetClientCallbacks;
  private readonly displayName: string;
  private readonly isBot: boolean;
  private resumeToken: string | undefined;
  /** True after `server.welcome` — intents before then are dropped client-side. */
  private handshakeComplete = false;

  constructor(options: NetClientOptions, callbacks: NetClientCallbacks = {}) {
    this.callbacks = callbacks;
    this.displayName = options.displayName;
    this.isBot = options.isBot ?? false;
    this.resumeToken = options.resumeToken;
    this.socket = io(options.url, { transports: ['websocket'], autoConnect: true });
    this.bind();
  }

  private bind(): void {
    this.callbacks.onConnectionChange?.('connecting');
    this.socket.on('connect', () => {
      debugLogger.debug('socket.connect', { id: this.socket.id });
      this.callbacks.onConnectionChange?.('connected');
      const hello: ClientHello = {
        protocolVersion: PROTOCOL_VERSION,
        displayName: this.displayName,
        isBot: this.isBot,
        ...(this.resumeToken ? { resumeToken: this.resumeToken } : {}),
      };
      this.socket.emit(EVT.client.hello, hello);
    });

    this.socket.on('disconnect', (reason) => {
      this.handshakeComplete = false;
      debugLogger.debug('socket.disconnect', { reason });
      this.callbacks.onConnectionChange?.('disconnected');
    });

    this.socket.on(EVT.server.welcome, (raw: unknown) => {
      const parsed = ServerWelcomeSchema.safeParse(raw);
      if (!parsed.success) {
        debugLogger.error('welcome.invalid', { issues: parsed.error.issues });
        return;
      }
      this.handshakeComplete = true;
      this.resumeToken = parsed.data.resumeToken;
      debugLogger.info('welcome', {
        traceId: parsed.data.traceId,
        playerId: parsed.data.playerId,
        resumed: parsed.data.resumed,
      });
      this.callbacks.onWelcome?.(parsed.data);
    });

    this.socket.on(EVT.server.snapshot, (raw: unknown) => {
      const parsed = RoomSnapshotSchema.safeParse(raw);
      if (!parsed.success) {
        debugLogger.error('snapshot.invalid', { issues: parsed.error.issues });
        return;
      }
      this.callbacks.onSnapshot?.(parsed.data);
    });

    this.socket.on(EVT.server.burst, (raw: unknown) => {
      const parsed = ServerEventBurstSchema.safeParse(raw);
      if (parsed.success) this.callbacks.onBurst?.(parsed.data);
    });

    this.socket.on(EVT.server.essence, (raw: unknown) => {
      const parsed = ServerEventEssenceSchema.safeParse(raw);
      if (parsed.success) this.callbacks.onEssence?.(parsed.data);
    });

    this.socket.on(EVT.server.error, (raw: unknown) => {
      const parsed = ServerErrorSchema.safeParse(raw);
      if (parsed.success) {
        debugLogger.warn('server.error', { ...parsed.data });
        this.callbacks.onError?.(parsed.data);
      }
    });
  }

  sendCursor(position: Vec3): void {
    if (!this.socket.connected || !this.handshakeComplete) return;
    const msg: ClientCursorMove = { position };
    this.socket.emit(EVT.client.cursorMove, msg);
  }

  sendBurst(position: Vec3, intensity = 1): void {
    if (!this.socket.connected) {
      inputLog('client.intent.dropBurst.skipped', { reason: 'socket_disconnected' });
      return;
    }
    if (!this.handshakeComplete) {
      inputLog('client.intent.dropBurst.skipped', { reason: 'awaiting_server_welcome' });
      return;
    }
    const msg: ClientDropBurst = { position, intensity };
    this.socket.emit(EVT.client.dropBurst, msg);
  }

  sendExtract(surfacePoint: Vec3): void {
    if (!this.socket.connected) {
      inputLog('client.intent.extract.skipped', { reason: 'socket_disconnected' });
      return;
    }
    if (!this.handshakeComplete) {
      inputLog('client.intent.extract.skipped', { reason: 'awaiting_server_welcome' });
      return;
    }
    const msg: ClientExtract = { surfacePoint };
    this.socket.emit(EVT.client.extract, msg);
  }

  dispose(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}
