/**
 * Internal simulation ghosts.
 *
 * These are not external Socket.io bots: they are pure server-side fake
 * players inserted into the live `Room.players` map so the world feels alive
 * even with zero real clients. They wander between zones, occasionally
 * rescue the follower nearest to them, and disappear when real players
 * reach a configurable headcount (so they never block real cluster
 * gameplay).
 */
import {
  RACES,
  type Race,
  type Vec3,
} from '@realtime-room/shared';
import type { Logger } from 'pino';
import { mulberry32, type Rng } from './rng.js';
import type { SimQueues, SimWorld } from './sim.js';

interface Ghost {
  id: string;
  rng: Rng;
  target: Vec3;
  retargetIn: number;
  rescueCooldown: number;
}

export interface GhostHostRoom {
  /** Adds (or restores) a ghost player record on the room. */
  addGhost(p: { id: string; name: string; race: Race; position: Vec3 }): void;
  /** Removes a ghost record (not a real bot). */
  removeGhost(id: string): void;
  /** Direct mutator for ghost movement; bypasses real-player velocity rules. */
  moveGhost(id: string, position: Vec3): void;
  /** Set of currently registered ghost ids the manager owns. */
  hasGhost(id: string): boolean;
  /** Real (non-bot) player count, used to decide whether to keep ghosts alive. */
  realPlayerCount(): number;
}

export interface GhostManagerOptions {
  count: number;
  seed: number;
  /** Real-player threshold above which ghosts are despawned. */
  realPlayerCap: number;
  logger: Logger;
}

export class GhostManager {
  private readonly opts: GhostManagerOptions;
  private readonly ghosts = new Map<string, Ghost>();
  private spawnedFlag = false;

  constructor(options: GhostManagerOptions) {
    this.opts = options;
  }

  /** Initial spawn (idempotent). Real player cap is enforced in step(). */
  ensureSpawned(host: GhostHostRoom): void {
    if (this.spawnedFlag) return;
    this.spawnedFlag = true;
    const baseRng = mulberry32(this.opts.seed);
    for (let i = 0; i < this.opts.count; i++) {
      const id = `ghost-${i.toString().padStart(2, '0')}`;
      const race = RACES[Math.floor(baseRng() * RACES.length)] as Race;
      const angle = baseRng() * Math.PI * 2;
      const radius = 60 + baseRng() * 200;
      const position: Vec3 = {
        x: Math.cos(angle) * radius,
        y: 0,
        z: Math.sin(angle) * radius,
      };
      host.addGhost({ id, name: `GHOST_${id.slice(-2)}`, race, position });
      this.ghosts.set(id, {
        id,
        rng: mulberry32(this.opts.seed + i * 7919 + 17),
        target: this.pickTarget(baseRng),
        retargetIn: 1 + baseRng() * 3,
        rescueCooldown: 2 + baseRng() * 4,
      });
    }
    this.opts.logger.info(
      { evt: 'ghosts.spawned', count: this.ghosts.size },
      'spawned internal ghost caravans',
    );
  }

  /** Move ghosts every tick + occasionally queue a rescue intent. */
  step(host: GhostHostRoom, sim: SimWorld, queues: SimQueues, dt: number): void {
    if (host.realPlayerCount() >= this.opts.realPlayerCap) {
      this.despawnAll(host);
      return;
    }
    if (!this.spawnedFlag) this.ensureSpawned(host);

    for (const g of this.ghosts.values()) {
      const player = sim.players.get(g.id);
      if (!player) continue;

      g.retargetIn -= dt;
      if (g.retargetIn <= 0) {
        g.target = this.pickTarget(g.rng);
        g.retargetIn = 2 + g.rng() * 4;
      }

      const dx = g.target.x - player.position.x;
      const dy = g.target.y - player.position.y;
      const dz = g.target.z - player.position.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const speed = 8;
      const next: Vec3 = {
        x: player.position.x + (dx / len) * speed * dt,
        y: player.position.y + (dy / len) * speed * dt,
        z: player.position.z + (dz / len) * speed * dt,
      };
      player.position = next;
      host.moveGhost(g.id, next);

      g.rescueCooldown -= dt;
      if (g.rescueCooldown <= 0) {
        g.rescueCooldown = 4 + g.rng() * 6;
        queues.rescues.push({ playerId: g.id });
      }

      if (player.fuel < 0.2 && g.rng() < 0.05) {
        g.target = { x: 0, y: 0, z: 0 };
        g.retargetIn = 4;
      }
    }
  }

  private pickTarget(rng: Rng): Vec3 {
    const angle = rng() * Math.PI * 2;
    const radius = 30 + rng() * 320;
    return { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius };
  }

  private despawnAll(host: GhostHostRoom): void {
    if (this.ghosts.size === 0) return;
    for (const id of this.ghosts.keys()) host.removeGhost(id);
    this.opts.logger.info({ evt: 'ghosts.despawned' }, 'real-player cap reached, despawned ghosts');
    this.ghosts.clear();
    this.spawnedFlag = false;
  }
}
