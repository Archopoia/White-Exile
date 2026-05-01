/**
 * Authoritative room state.
 *
 * Owns:
 *   - totalDust (accumulated by all drops/passive)
 *   - per-player essence + position + tier
 *   - planet radius (derived from totalDust on each snapshot)
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

export class Room {
  readonly id: string;
  totalDust = 0;
  private readonly players = new Map<string, PlayerState>();
  private lastTickMs = Date.now();

  constructor(id: string) {
    this.id = id;
  }

  size(): number {
    return this.players.size;
  }

  get(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  list(): PlayerState[] {
    return [...this.players.values()];
  }

  addPlayer(p: Omit<PlayerState, 'totalDustContributed' | 'lastBurstMs' | 'lastExtractMs'>): PlayerState {
    const state: PlayerState = {
      ...p,
      totalDustContributed: 0,
      lastBurstMs: 0,
      lastExtractMs: 0,
    };
    this.players.set(p.id, state);
    return state;
  }

  removePlayer(playerId: string): boolean {
    return this.players.delete(playerId);
  }

  setPosition(playerId: string, position: Vec3): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;
    p.position = clampToPlayVolume(position);
    return true;
  }

  applyBurst(playerId: string, intensity: number, now: number = Date.now()): BurstResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: 'unknown_player', dustAdded: 0 };
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
    if (!p) return { ok: false, reason: 'unknown_player', essenceGained: 0, newEssence: 0 };
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
      const dust = config.passive.dustPerTick;
      this.totalDust += dust;
      p.totalDustContributed += dust;
      p.essence += config.passive.essencePerSec * dt;
    }
    return dt;
  }

  snapshot(now: number = Date.now()): RoomSnapshot {
    return {
      serverTime: now,
      totalDust: this.totalDust,
      planetRadius: planetRadiusFromTotalDust(this.totalDust),
      players: this.list().map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        tier: p.tier,
        position: p.position,
        essence: p.essence,
      })),
    };
  }
}
