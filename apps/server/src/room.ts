/**
 * Authoritative room state for White Exile.
 *
 * Owns: players, followers, ruins, relics, room settings, tick counter, sim
 * world, and queued client intents (rescue / activate ruin) to be processed
 * on the next tick.
 *
 * Soft disconnect: hidden from snapshots but retained for resume until the
 * grace window expires. Broadcasting lives in net.ts.
 */
import {
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_WORLD_CONFIG,
  RACE_PROFILES,
  RoomSettingsSchema,
  classifyZone,
  clampPlayerPosition,
  type CaravanSnapshot,
  type FollowerKind,
  type FollowerSnapshot,
  type Race,
  type RelicSnapshot,
  type RoomSettings,
  type RoomSnapshot,
  type RuinSnapshot,
  type Vec3,
  type WorldConfig,
} from '@realtime-room/shared';
import type { Logger } from 'pino';
import { GhostManager, type GhostHostRoom } from './world/ghosts.js';
import { generateInitialWorld } from './world/spawn.js';
import {
  newSimQueues,
  summarize,
  tickWorld,
  type SimDerivedPlayer,
  type SimPlayer,
  type SimQueues,
  type SimWorld,
} from './world/sim.js';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  race: Race;
  position: Vec3;
  fuel: number;
  followers: Array<{ id: string; kind: FollowerKind; position: Vec3; morale: number }>;
  relicBonus: number;
  disconnected: boolean;
  disconnectedAt: number;
}

export interface RoomData {
  id: string;
  seed: number;
  settings: RoomSettings;
  players: PlayerState[];
  followers: FollowerSnapshot[];
  ruins: RuinSnapshot[];
  relics: RelicSnapshot[];
}

export interface RoomTickStats {
  caravans: number;
  combatAbsorptions: number;
  rescuesGranted: number;
  ruinsActivated: number;
}

export interface RoomLoggers {
  /** Default logger for sim-level events. */
  log: Logger;
}

export class Room {
  readonly id: string;
  readonly seed: number;
  private readonly players = new Map<string, PlayerState>();
  private settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  private worldConfig: WorldConfig = { ...DEFAULT_WORLD_CONFIG };
  private tickCount = 0;
  private lastTickMs = Date.now();
  private readonly followers = new Map<string, FollowerSnapshot>();
  private readonly ruins = new Map<string, RuinSnapshot>();
  private readonly relics = new Map<string, RelicSnapshot>();
  private readonly queues: SimQueues = newSimQueues();
  private derivedByPlayer = new Map<string, SimDerivedPlayer>();
  private caravansCache: CaravanSnapshot[] = [];
  private readonly ghosts: GhostManager | null;
  private readonly logger: Logger;
  private readonly ghostIds = new Set<string>();
  private readonly ghostHost: GhostHostRoom;
  /** Monotonic sim clock for ash-dune height (seconds). */
  private simulationTimeSec = 0;

  constructor(id: string, opts: { seed?: number; logger: Logger; ghosts?: GhostManager | null }) {
    this.id = id;
    this.seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
    this.logger = opts.logger;
    this.ghosts = opts.ghosts ?? null;
    this.ghostHost = {
      addGhost: ({ id: ghostId, name, race, position }) => {
        const state: PlayerState = {
          id: ghostId,
          name,
          isBot: true,
          race,
          position: clampPlayerPosition(position, this.simulationTimeSec, this.worldConfig.duneHeightScale),
          fuel: 0.85,
          followers: [],
          relicBonus: 0,
          disconnected: false,
          disconnectedAt: 0,
        };
        this.players.set(ghostId, state);
        this.ghostIds.add(ghostId);
      },
      removeGhost: (ghostId) => {
        this.ghostIds.delete(ghostId);
        for (const f of this.followers.values()) {
          if (f.ownerId === ghostId) f.ownerId = null;
        }
        this.players.delete(ghostId);
      },
      moveGhost: (ghostId, position) => {
        const pl = this.players.get(ghostId);
        if (pl) {
          pl.position = clampPlayerPosition(position, this.simulationTimeSec, this.worldConfig.duneHeightScale);
        }
      },
      hasGhost: (ghostId) => this.ghostIds.has(ghostId),
      realPlayerCount: () => {
        let n = 0;
        for (const pl of this.players.values()) {
          if (pl.disconnected) continue;
          if (pl.isBot) continue;
          n++;
        }
        return n;
      },
    };
    const initial = generateInitialWorld(this.seed, this.worldConfig);
    for (const f of initial.followers) this.followers.set(f.id, f);
    for (const r of initial.ruins) this.ruins.set(r.id, r);
    for (const r of initial.relics) this.relics.set(r.id, r);
    this.logger.info(
      {
        evt: 'world.generated',
        seed: this.seed,
        followers: this.followers.size,
        ruins: this.ruins.size,
        relics: this.relics.size,
      },
      'world generated',
    );
  }

  getSettings(): RoomSettings {
    return { ...this.settings };
  }

  getWorldConfig(): WorldConfig {
    return { ...this.worldConfig };
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

  addPlayer(p: {
    id: string;
    name: string;
    isBot: boolean;
    race: Race;
    position: Vec3;
  }): PlayerState {
    const state: PlayerState = {
      ...p,
      position: clampPlayerPosition(p.position, this.simulationTimeSec, this.worldConfig.duneHeightScale),
      fuel: 0.9,
      followers: [],
      relicBonus: 0,
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
        for (const f of this.followers.values()) {
          if (f.ownerId === pl.id) f.ownerId = null;
        }
        this.players.delete(pl.id);
        dropped.push(pl.id);
      }
    }
    return dropped;
  }

  removePlayer(playerId: string): boolean {
    for (const f of this.followers.values()) {
      if (f.ownerId === playerId) f.ownerId = null;
    }
    return this.players.delete(playerId);
  }

  setPosition(playerId: string, position: Vec3): boolean {
    const pl = this.players.get(playerId);
    if (!pl || pl.disconnected) return false;
    pl.position = clampPlayerPosition(position, this.simulationTimeSec, this.worldConfig.duneHeightScale);
    return true;
  }

  enqueueRescue(playerId: string, followerId?: string): void {
    const pl = this.players.get(playerId);
    if (!pl || pl.disconnected) return;
    this.queues.rescues.push(followerId ? { playerId, followerId } : { playerId });
  }

  enqueueRuinActivation(playerId: string, ruinId: string): void {
    const pl = this.players.get(playerId);
    if (!pl || pl.disconnected) return;
    this.queues.ruinActivations.push({ playerId, ruinId });
  }

  /** Run one simulation tick and update derived state. Called by net.ts. */
  tick(now: number = Date.now()): RoomTickStats {
    const dt = Math.min(0.5, Math.max(0.001, (now - this.lastTickMs) / 1000));
    this.lastTickMs = now;
    this.tickCount++;
    const simT = this.simulationTimeSec;

    if (this.ghosts) this.ghosts.ensureSpawned(this.ghostHost);
    const sim = this.toSimWorld();
    if (this.ghosts) this.ghosts.step(this.ghostHost, sim, this.queues, dt);
    const result = tickWorld(sim, this.queues, dt, this.logger, simT);
    this.applySimToRoom(sim);
    this.derivedByPlayer = result.derived;
    this.caravansCache = result.caravans;
    this.simulationTimeSec += dt;
    return {
      caravans: result.caravans.length,
      combatAbsorptions: result.combatAbsorptions,
      rescuesGranted: result.rescuesGranted,
      ruinsActivated: result.ruinsActivated,
    };
  }

  /** Compose a full snapshot for broadcast. */
  snapshot(now: number = Date.now()): RoomSnapshot {
    const players = [];
    for (const pl of this.players.values()) {
      if (pl.disconnected) continue;
      const derived = this.derivedByPlayer.get(pl.id);
      const lightRadius =
        derived?.lightRadius ?? RACE_PROFILES[pl.race].baseLightRadius;
      const distOrigin = Math.hypot(pl.position.x, pl.position.y, pl.position.z);
      players.push({
        id: pl.id,
        name: pl.name,
        isBot: pl.isBot,
        position: pl.position,
        race: pl.race,
        lightRadius,
        fuel: pl.fuel,
        followerCount: pl.followers.length,
        caravanId: derived?.caravanId ?? `c-${pl.id}`,
        zone: derived?.zone ?? classifyZone(distOrigin),
      });
    }
    return {
      serverTime: now,
      tick: this.tickCount,
      settings: { ...this.settings },
      worldConfig: { ...this.worldConfig },
      players,
      followers: [...this.followers.values()],
      ruins: [...this.ruins.values()],
      relics: [...this.relics.values()],
      caravans: this.caravansCache,
    };
  }

  diagnostics(): {
    players: number;
    caravans: number;
    attachedFollowers: number;
    strandedFollowers: number;
    activatedRuins: number;
    claimedRelics: number;
    raceMix: Record<Race, number>;
  } {
    return summarize(this.toSimWorld(), this.caravansCache);
  }

  serialize(): RoomData {
    return {
      id: this.id,
      seed: this.seed,
      settings: { ...this.settings },
      players: this.list(),
      followers: [...this.followers.values()],
      ruins: [...this.ruins.values()],
      relics: [...this.relics.values()],
    };
  }

  static restore(data: RoomData, opts: { logger: Logger; ghosts?: GhostManager | null }): Room {
    const room = new Room(data.id, { seed: data.seed, logger: opts.logger, ghosts: opts.ghosts });
    room.settings = RoomSettingsSchema.parse(data.settings ?? DEFAULT_ROOM_SETTINGS);
    if (Array.isArray(data.followers) && data.followers.length > 0) {
      room.followers.clear();
      for (const f of data.followers) room.followers.set(f.id, f);
    }
    if (Array.isArray(data.ruins) && data.ruins.length > 0) {
      room.ruins.clear();
      for (const r of data.ruins) room.ruins.set(r.id, r);
    }
    if (Array.isArray(data.relics) && data.relics.length > 0) {
      room.relics.clear();
      for (const r of data.relics) room.relics.set(r.id, r);
    }
    const now = Date.now();
    for (const raw of data.players ?? []) {
      if (!raw?.id) continue;
      const pl: PlayerState = {
        id: raw.id,
        name: typeof raw.name === 'string' ? raw.name : raw.id,
        isBot: !!raw.isBot,
        race: raw.race ?? 'emberfolk',
        position: clampPlayerPosition(
          raw.position ?? { x: 0, y: 0, z: 0 },
          0,
          DEFAULT_WORLD_CONFIG.duneHeightScale,
        ),
        fuel: typeof raw.fuel === 'number' ? raw.fuel : 0.85,
        followers: Array.isArray(raw.followers) ? [...raw.followers] : [],
        relicBonus: typeof raw.relicBonus === 'number' ? raw.relicBonus : 0,
        disconnected: true,
        disconnectedAt: now,
      };
      room.players.set(pl.id, pl);
    }
    return room;
  }

  private toSimWorld(): SimWorld {
    const players = new Map<string, SimPlayer>();
    for (const pl of this.players.values()) {
      if (pl.disconnected) continue;
      players.set(pl.id, {
        id: pl.id,
        name: pl.name,
        isBot: pl.isBot,
        race: pl.race,
        position: pl.position,
        followers: pl.followers,
        fuel: pl.fuel,
        relicBonus: pl.relicBonus,
      });
    }
    return {
      players,
      followers: this.followers,
      ruins: this.ruins,
      relics: this.relics,
      config: this.worldConfig,
    };
  }

  private applySimToRoom(sim: SimWorld): void {
    for (const sp of sim.players.values()) {
      const pl = this.players.get(sp.id);
      if (!pl) continue;
      pl.position = sp.position;
      pl.fuel = sp.fuel;
      pl.relicBonus = sp.relicBonus;
      pl.followers = sp.followers;
    }
    // Mirror morale + position back to follower snapshots from owner-attached arrays.
    for (const pl of this.players.values()) {
      for (const f of pl.followers) {
        const fSnap = this.followers.get(f.id);
        if (fSnap) {
          fSnap.position = f.position;
          fSnap.morale = f.morale;
          fSnap.ownerId = pl.id;
        }
      }
    }
  }
}
