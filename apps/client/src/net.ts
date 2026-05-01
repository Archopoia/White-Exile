/**
 * Socket transport: hello (race-aware), validated snapshots,
 * move + room settings + rescue + activate-ruin intents.
 */
import { io, type Socket } from 'socket.io-client';
import {
  EVT,
  PROTOCOL_VERSION,
  RoomSnapshotSchema,
  ServerErrorSchema,
  ServerWelcomeSchema,
  type ClientActivateRuin,
  type ClientHello,
  type ClientMove,
  type ClientRescueIntent,
  type ClientRoomSettingsPatch,
  type Race,
  type RoomSnapshot,
  type ServerError,
  type ServerWelcome,
  type Vec3,
} from '@realtime-room/shared';
import { debugLogger } from './debug.js';
import { inputLog } from './inputLog.js';

export interface NetClientOptions {
  url: string;
  displayName: string;
  race?: Race;
  isBot?: boolean;
  resumeToken?: string;
}

export interface NetClientCallbacks {
  onWelcome?: (welcome: ServerWelcome) => void;
  onSnapshot?: (snap: RoomSnapshot) => void;
  onError?: (err: ServerError) => void;
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
}

export class NetClient {
  private readonly socket: Socket;
  private readonly callbacks: NetClientCallbacks;
  private readonly displayName: string;
  private readonly isBot: boolean;
  private readonly race: Race | undefined;
  private resumeToken: string | undefined;
  private handshakeComplete = false;

  constructor(options: NetClientOptions, callbacks: NetClientCallbacks = {}) {
    this.callbacks = callbacks;
    this.displayName = options.displayName;
    this.isBot = options.isBot ?? false;
    this.race = options.race;
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
        ...(this.race ? { race: this.race } : {}),
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
        race: parsed.data.race,
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

    this.socket.on(EVT.server.error, (raw: unknown) => {
      const parsed = ServerErrorSchema.safeParse(raw);
      if (parsed.success) {
        debugLogger.warn('server.error', { ...parsed.data });
        this.callbacks.onError?.(parsed.data);
      }
    });
  }

  sendMove(position: Vec3): void {
    if (!this.socket.connected || !this.handshakeComplete) return;
    const msg: ClientMove = { position };
    this.socket.emit(EVT.client.move, msg);
  }

  sendRoomSettingsPatch(patch: ClientRoomSettingsPatch): void {
    if (!this.socket.connected || !this.handshakeComplete) {
      inputLog('client.intent.roomSettingsPatch.skipped', { reason: 'not_ready' });
      return;
    }
    this.socket.emit(EVT.client.roomSettingsPatch, patch);
  }

  sendRescue(followerId?: string): void {
    if (!this.socket.connected || !this.handshakeComplete) return;
    const msg: ClientRescueIntent = followerId ? { followerId } : {};
    this.socket.emit(EVT.client.rescue, msg);
  }

  sendActivateRuin(ruinId: string): void {
    if (!this.socket.connected || !this.handshakeComplete) return;
    const msg: ClientActivateRuin = { ruinId };
    this.socket.emit(EVT.client.activateRuin, msg);
  }

  dispose(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}
