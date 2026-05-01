/**
 * Authoritative room state.
 *
 * Soft disconnect: hidden from snapshots but retained for resume until the
 * grace window expires. Broadcasting lives in net.ts.
 */
import {
  DEFAULT_ROOM_SETTINGS,
  type RoomSettings,
  type RoomSnapshot,
  type Vec3,
  RoomSettingsSchema,
  clampToPlayVolume,
} from '@realtime-room/shared';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  position: Vec3;
  disconnected: boolean;
  disconnectedAt: number;
}

export interface RoomData {
  id: string;
  settings: RoomSettings;
  players: PlayerState[];
}

export class Room {
  readonly id: string;
  private readonly players = new Map<string, PlayerState>();
  private settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  private tickCount = 0;
  private lastTickMs = Date.now();

  constructor(id: string) {
    this.id = id;
  }

  getSettings(): RoomSettings {
    return { ...this.settings };
  }

  patchRoomSettings(patch: Partial<RoomSettings>): void {
    const merged = { ...this.settings, ...patch };
    if (merged.roomNote !== undefined) {
      merged.roomNote = merged.roomNote.slice(0, 200);
    }
    this.settings = RoomSettingsSchema.parse(merged);
  }

  size(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.disconnected) n++;
    return n;
  }

  totalRecords(): number {
    return this.players.size;
  }

  get(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  list(): PlayerState[] {
    return [...this.players.values()];
  }

  addPlayer(p: Omit<PlayerState, 'disconnected' | 'disconnectedAt'>): PlayerState {
    const state: PlayerState = {
      ...p,
      position: clampToPlayVolume(p.position),
      disconnected: false,
      disconnectedAt: 0,
    };
    this.players.set(p.id, state);
    return state;
  }

  markDisconnected(playerId: string, now: number = Date.now()): boolean {
    const pl = this.players.get(playerId);
    if (!pl || pl.disconnected) return false;
    pl.disconnected = true;
    pl.disconnectedAt = now;
    return true;
  }

  tryReattach(playerId: string): PlayerState | undefined {
    const pl = this.players.get(playerId);
    if (!pl) return undefined;
    pl.disconnected = false;
    pl.disconnectedAt = 0;
    return pl;
  }

  pruneDisconnected(opts: {
    now?: number;
    botGraceMs: number;
    humanGraceMs: number;
  }): string[] {
    const now = opts.now ?? Date.now();
    const dropped: string[] = [];
    for (const pl of this.players.values()) {
      if (!pl.disconnected) continue;
      const grace = pl.isBot ? opts.botGraceMs : opts.humanGraceMs;
      if (now - pl.disconnectedAt >= grace) {
        this.players.delete(pl.id);
        dropped.push(pl.id);
      }
    }
    return dropped;
  }

  removePlayer(playerId: string): boolean {
    return this.players.delete(playerId);
  }

  setPosition(playerId: string, position: Vec3): boolean {
    const pl = this.players.get(playerId);
    if (!pl || pl.disconnected) return false;
    pl.position = clampToPlayVolume(position);
    return true;
  }

  tick(now: number = Date.now()): number {
    const dt = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;
    this.tickCount++;
    return dt;
  }

  snapshot(now: number = Date.now()): RoomSnapshot {
    const visible: PlayerState[] = [];
    for (const pl of this.players.values()) if (!pl.disconnected) visible.push(pl);
    return {
      serverTime: now,
      tick: this.tickCount,
      settings: { ...this.settings },
      players: visible.map((pl) => ({
        id: pl.id,
        name: pl.name,
        isBot: pl.isBot,
        position: pl.position,
      })),
    };
  }

  serialize(): RoomData {
    return {
      id: this.id,
      settings: { ...this.settings },
      players: this.list(),
    };
  }

  static restore(data: RoomData): Room {
    const room = new Room(data.id);
    room.settings = RoomSettingsSchema.parse(data.settings ?? DEFAULT_ROOM_SETTINGS);
    const now = Date.now();
    for (const raw of data.players ?? []) {
      if (!raw?.id) continue;
      const pl: PlayerState = {
        id: raw.id,
        name: typeof raw.name === 'string' ? raw.name : raw.id,
        isBot: !!raw.isBot,
        position: clampToPlayVolume(raw.position ?? { x: 0, y: 0, z: 0 }),
        disconnected: true,
        disconnectedAt: now,
      };
      room.players.set(pl.id, pl);
    }
    return room;
  }
}
