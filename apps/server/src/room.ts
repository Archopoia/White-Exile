/**
 * Authoritative room state.
 *
 * Owns:
 *   - totalDust (accumulated by all drops/passive)
 *   - per-player essence + position + tier
 *   - planet radius (derived from totalDust on each snapshot)
 *
 * Disconnects are *soft*: a player flagged `disconnected` is hidden from
 * snapshots but kept around for a grace window so a refresh / HMR / server
 * restart can re-attach the same record. `pruneDisconnected` finalizes the
 * removal once the grace expires.
 *
 * Methods are pure operations on internal state; broadcasting is handled by
 * the Socket.io glue in net.ts so this file stays unit-testable.
 */
import {
  type RoomSnapshot,
  type SpiritTier,
  type Vec3,
  clampToPlayVolume,
  planetRadiusFromTotalDust,
} from '@tutelary/shared';
import { config } from './config.js';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  tier: SpiritTier;
  position: Vec3;
  essence: number;
  totalDustContributed: number;
  lastBurstMs: number;
  lastExtractMs: number;
  /** True while the socket is gone but we're still holding the record open. */
  disconnected: boolean;
  disconnectedAt: number;
}

export interface BurstResult {
  ok: boolean;
  reason?: 'cooldown' | 'unknown_player';
  dustAdded: number;
}

export interface ExtractResult {
  ok: boolean;
  reason?: 'cooldown' | 'unknown_player' | 'miss';
  essenceGained: number;
  newEssence: number;
}

/** Minimal JSON shape used by the dev persistence file. */
export interface RoomData {
  id: string;
  totalDust: number;
  players: PlayerState[];
}

export class Room {
  readonly id: string;
  totalDust = 0;
  private readonly players = new Map<string, PlayerState>();
  private lastTickMs = Date.now();

  constructor(id: string) {
    this.id = id;
  }

  size(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.disconnected) n++;
    return n;
  }

  /** Total record count, including soft-disconnected players awaiting GC. */
  totalRecords(): number {
    return this.players.size;
  }

  get(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  list(): PlayerState[] {
    return [...this.players.values()];
  }

  addPlayer(
    p: Omit<
      PlayerState,
      'totalDustContributed' | 'lastBurstMs' | 'lastExtractMs' | 'disconnected' | 'disconnectedAt'
    >,
  ): PlayerState {
    const state: PlayerState = {
      ...p,
      totalDustContributed: 0,
      lastBurstMs: 0,
      lastExtractMs: 0,
      disconnected: false,
      disconnectedAt: 0,
    };
    this.players.set(p.id, state);
    return state;
  }

  /**
   * Mark a player as disconnected without dropping their record. Snapshots
   * will hide them; `pruneDisconnected` will finalize the removal once the
   * grace window expires.
   */
  markDisconnected(playerId: string, now: number = Date.now()): boolean {
    const p = this.players.get(playerId);
    if (!p || p.disconnected) return false;
    p.disconnected = true;
    p.disconnectedAt = now;
    return true;
  }

  /**
   * Try to re-attach a previously-known player by id. Returns the player on
   * success (and clears the disconnect flag), or `undefined` if no record
   * exists. Works for both already-connected and soft-disconnected records.
   */
  tryReattach(playerId: string): PlayerState | undefined {
    const p = this.players.get(playerId);
    if (!p) return undefined;
    p.disconnected = false;
    p.disconnectedAt = 0;
    return p;
  }

  /** Drop disconnected records older than their grace window. */
  pruneDisconnected(opts: {
    now?: number;
    botGraceMs: number;
    humanGraceMs: number;
  }): string[] {
    const now = opts.now ?? Date.now();
    const dropped: string[] = [];
    for (const p of this.players.values()) {
      if (!p.disconnected) continue;
      const grace = p.isBot ? opts.botGraceMs : opts.humanGraceMs;
      if (now - p.disconnectedAt >= grace) {
        this.players.delete(p.id);
        dropped.push(p.id);
      }
    }
    return dropped;
  }

  /** Hard remove (used by tests; net.ts prefers `markDisconnected`). */
  removePlayer(playerId: string): boolean {
    return this.players.delete(playerId);
  }

  setPosition(playerId: string, position: Vec3): boolean {
    const p = this.players.get(playerId);
    if (!p || p.disconnected) return false;
    p.position = clampToPlayVolume(position);
    return true;
  }

  applyBurst(playerId: string, intensity: number, now: number = Date.now()): BurstResult {
    const p = this.players.get(playerId);
    if (!p || p.disconnected) return { ok: false, reason: 'unknown_player', dustAdded: 0 };
    if (now - p.lastBurstMs < config.bursts.cooldownMs) {
      return { ok: false, reason: 'cooldown', dustAdded: 0 };
    }
    p.lastBurstMs = now;
    const clampedIntensity = Math.min(1, Math.max(0, intensity));
    const dustAdded = config.bursts.dustPerBurst * (0.5 + 0.5 * clampedIntensity);
    this.totalDust += dustAdded;
    p.totalDustContributed += dustAdded;
    return { ok: true, dustAdded };
  }

  applyExtract(playerId: string, now: number = Date.now(), rng: () => number = Math.random): ExtractResult {
    const p = this.players.get(playerId);
    if (!p || p.disconnected) {
      return { ok: false, reason: 'unknown_player', essenceGained: 0, newEssence: 0 };
    }
    if (now - p.lastExtractMs < config.extract.cooldownMs) {
      return { ok: false, reason: 'cooldown', essenceGained: 0, newEssence: p.essence };
    }
    p.lastExtractMs = now;
    const min = config.extract.rewardMin;
    const max = config.extract.rewardMax;
    const reward = min + rng() * (max - min);
    p.essence += reward;
    return { ok: true, essenceGained: reward, newEssence: p.essence };
  }

  /**
   * Per-tick passive simulation: small dust drip per active player, slow
   * essence drip by elapsed real time. Returns the elapsed seconds for any
   * caller that wants to batch derived effects.
   */
  tick(now: number = Date.now()): number {
    const dt = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;
    if (dt <= 0) return 0;

    for (const p of this.players.values()) {
      if (p.disconnected) continue;
      const dust = config.passive.dustPerTick;
      this.totalDust += dust;
      p.totalDustContributed += dust;
      p.essence += config.passive.essencePerSec * dt;
    }
    return dt;
  }

  snapshot(now: number = Date.now()): RoomSnapshot {
    const visible: PlayerState[] = [];
    for (const p of this.players.values()) if (!p.disconnected) visible.push(p);
    return {
      serverTime: now,
      totalDust: this.totalDust,
      planetRadius: planetRadiusFromTotalDust(this.totalDust),
      players: visible.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        tier: p.tier,
        position: p.position,
        essence: p.essence,
      })),
    };
  }

  /** Plain JSON for the dev persistence file. Disconnected records are kept. */
  serialize(): RoomData {
    return {
      id: this.id,
      totalDust: this.totalDust,
      players: this.list(),
    };
  }

  /** Rehydrate a room from persisted JSON. Marks every player disconnected so
   *  they only become visible once they reconnect with their resumeToken. */
  static restore(data: RoomData, now: number = Date.now()): Room {
    const room = new Room(data.id);
    room.totalDust = Number.isFinite(data.totalDust) ? Math.max(0, data.totalDust) : 0;
    for (const raw of data.players ?? []) {
      const p: PlayerState = {
        id: raw.id,
        name: raw.name,
        isBot: !!raw.isBot,
        tier: raw.tier,
        position: raw.position,
        essence: Math.max(0, raw.essence ?? 0),
        totalDustContributed: Math.max(0, raw.totalDustContributed ?? 0),
        lastBurstMs: 0,
        lastExtractMs: 0,
        disconnected: true,
        disconnectedAt: now,
      };
      room.players.set(p.id, p);
    }
    return room;
  }
}
