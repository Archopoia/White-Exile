/**
 * Pluggable bot brains.
 *
 * Each tick returns the next intended position **and** any optional intents
 * (rescue, activate ruin) to be sent up. The bot wrapper handles transport.
 */
import type { FollowerSnapshot, RoomSnapshot, RuinSnapshot, Vec3 } from '@realtime-room/shared';
import type { Rng } from './rng.js';

export interface BehaviorContext {
  rng: Rng;
  botId: number;
  selfPlayerId: string | null;
  snapshot: RoomSnapshot | null;
  elapsed: number;
}

export interface BehaviorTick {
  position: Vec3;
  rescueFollowerId?: string | null;
  activateRuinId?: string | null;
}

export interface Behavior {
  readonly name: string;
  tick(dt: number, ctx: BehaviorContext): BehaviorTick;
}

const PLAY_RADIUS = 320;

function spherePoint(rng: Rng, radius: number): Vec3 {
  const u = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  return {
    x: radius * r * Math.cos(theta),
    y: radius * u * 0.1,
    z: radius * r * Math.sin(theta),
  };
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function self(ctx: BehaviorContext): { position: Vec3 } | null {
  if (!ctx.snapshot || !ctx.selfPlayerId) return null;
  const me = ctx.snapshot.players.find((p) => p.id === ctx.selfPlayerId);
  return me ? { position: me.position } : null;
}

function nearestStrandedFollower(
  ctx: BehaviorContext,
  origin: Vec3,
  withinRadius?: number,
): FollowerSnapshot | null {
  if (!ctx.snapshot) return null;
  let best: FollowerSnapshot | null = null;
  let bestSq = withinRadius ? withinRadius * withinRadius : Infinity;
  for (const f of ctx.snapshot.followers) {
    if (f.ownerId !== null) continue;
    const dx = f.position.x - origin.x;
    const dy = f.position.y - origin.y;
    const dz = f.position.z - origin.z;
    const sq = dx * dx + dy * dy + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      best = f;
    }
  }
  return best;
}

function nearestUnactivatedRuin(
  ctx: BehaviorContext,
  origin: Vec3,
  withinRadius?: number,
): RuinSnapshot | null {
  if (!ctx.snapshot) return null;
  let best: RuinSnapshot | null = null;
  let bestSq = withinRadius ? withinRadius * withinRadius : Infinity;
  for (const r of ctx.snapshot.ruins) {
    if (r.activated) continue;
    const dx = r.position.x - origin.x;
    const dy = r.position.y - origin.y;
    const dz = r.position.z - origin.z;
    const sq = dx * dx + dy * dy + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      best = r;
    }
  }
  return best;
}

class WandererBehavior implements Behavior {
  readonly name = 'wanderer';
  private current: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };
  private target: Vec3 = this.current;
  private timeToRetarget = 0;

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    this.timeToRetarget -= dt;
    if (this.timeToRetarget <= 0) {
      this.target = spherePoint(ctx.rng, 60 + ctx.rng() * 220);
      this.timeToRetarget = 1.5 + ctx.rng() * 2.5;
    }
    this.current = lerpVec3(this.current, this.target, Math.min(1, dt * 2.4));
    return { position: this.current };
  }
}

class OrbiterBehavior implements Behavior {
  readonly name = 'orbiter';
  private readonly axis: Vec3;
  private readonly radius: number;
  private readonly speed: number;
  private phase: number;

  constructor(rng: Rng) {
    this.radius = 80 + rng() * 180;
    this.speed = 0.4 + rng() * 0.8;
    this.phase = rng() * Math.PI * 2;
    const tilt = rng() * Math.PI;
    this.axis = { x: Math.cos(tilt), y: Math.sin(tilt), z: 0 };
  }

  tick(dt: number): BehaviorTick {
    this.phase += dt * this.speed;
    const cos = Math.cos(this.phase);
    const sin = Math.sin(this.phase);
    return {
      position: {
        x: this.radius * cos * this.axis.x + this.radius * sin * this.axis.y,
        y: this.radius * cos * this.axis.y - this.radius * sin * this.axis.x,
        z: this.radius * Math.sin(this.phase * 0.4),
      },
    };
  }
}

class DrifterBehavior implements Behavior {
  readonly name = 'drifter';
  private cooldown = 0;
  private current: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };
  private desired: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.desired = spherePoint(ctx.rng, 50 + ctx.rng() * 220);
      this.cooldown = 0.25 + ctx.rng() * 0.4;
    }
    this.current = lerpVec3(this.current, this.desired, Math.min(1, dt * 10));
    return { position: this.current };
  }
}

class AfkBehavior implements Behavior {
  readonly name = 'afk';
  private readonly anchor: Vec3;

  constructor(rng: Rng) {
    this.anchor = spherePoint(rng, 30 + rng() * 60);
  }

  tick(): BehaviorTick {
    return { position: this.anchor };
  }
}

class ChaserBehavior implements Behavior {
  readonly name = 'chaser';
  private current: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    let target: Vec3 | null = null;
    const snap = ctx.snapshot;
    if (snap && snap.players.length > 1) {
      let best: Vec3 | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const p of snap.players) {
        if (p.id === ctx.selfPlayerId) continue;
        const dx = p.position.x - this.current.x;
        const dy = p.position.y - this.current.y;
        const dz = p.position.z - this.current.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d > 0.01 && d < bestDist) {
          bestDist = d;
          best = p.position;
        }
      }
      target = best;
    }
    if (!target) target = spherePoint(ctx.rng, 50 + ctx.rng() * 220);
    this.current = lerpVec3(this.current, target, Math.min(1, dt * 2.8));
    return { position: this.current };
  }
}

/** Walks toward stranded followers and emits a rescue intent when in range. */
class RescuerBehavior implements Behavior {
  readonly name = 'rescuer';
  private current: Vec3 = { x: 40, y: 0, z: 0 };
  private rescueCooldown = 0;

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    this.rescueCooldown -= dt;
    const me = self(ctx);
    const origin = me?.position ?? this.current;
    const target = nearestStrandedFollower(ctx, origin);
    let goal: Vec3;
    if (target) {
      goal = target.position;
    } else {
      goal = spherePoint(ctx.rng, 40 + ctx.rng() * 120);
    }
    this.current = lerpVec3(this.current, goal, Math.min(1, dt * 2.0));
    const out: BehaviorTick = { position: this.current };
    if (target && me && this.rescueCooldown <= 0) {
      const dx = me.position.x - target.position.x;
      const dy = me.position.y - target.position.y;
      const dz = me.position.z - target.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const myLight = ctx.snapshot?.players.find((p) => p.id === ctx.selfPlayerId)?.lightRadius ?? 0;
      if (dist <= myLight) {
        out.rescueFollowerId = target.id;
        this.rescueCooldown = 1.0;
      }
    }
    return out;
  }
}

/** Walks toward the largest visible caravan to merge light fields. */
class CaravanSeekerBehavior implements Behavior {
  readonly name = 'caravan-seeker';
  private current: Vec3 = { x: 0, y: 0, z: 0 };

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    let goal: Vec3 = spherePoint(ctx.rng, 80);
    const snap = ctx.snapshot;
    if (snap && snap.caravans.length > 0) {
      let largest = snap.caravans[0]!;
      for (const c of snap.caravans) {
        if (c.lightRadius > largest.lightRadius) largest = c;
      }
      const leader = snap.players.find((p) => p.id === largest.leaderId);
      if (leader) goal = leader.position;
    }
    this.current = lerpVec3(this.current, goal, Math.min(1, dt * 1.6));
    return { position: this.current };
  }
}

/** Pushes deeper into the world; activates ruins it lands near. */
class DeepDiverBehavior implements Behavior {
  readonly name = 'deep-diver';
  private current: Vec3 = { x: 0, y: 0, z: 0 };
  private target: Vec3 = { x: 0, y: 0, z: 0 };
  private retargetIn = 0;
  private activateCooldown = 0;

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    this.retargetIn -= dt;
    this.activateCooldown -= dt;
    const me = self(ctx);
    const origin = me?.position ?? this.current;
    if (this.retargetIn <= 0) {
      const ruin = nearestUnactivatedRuin(ctx, origin, 600);
      if (ruin) {
        this.target = ruin.position;
      } else {
        const angle = ctx.rng() * Math.PI * 2;
        const r = 220 + ctx.rng() * 240;
        this.target = { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
      }
      this.retargetIn = 4 + ctx.rng() * 3;
    }
    this.current = lerpVec3(this.current, this.target, Math.min(1, dt * 1.4));
    const out: BehaviorTick = { position: this.current };
    if (me && this.activateCooldown <= 0) {
      const ruin = nearestUnactivatedRuin(ctx, me.position, 6);
      if (ruin) {
        out.activateRuinId = ruin.id;
        this.activateCooldown = 2;
      }
    }
    return out;
  }
}

export type BehaviorName =
  | 'wanderer'
  | 'orbiter'
  | 'drifter'
  | 'afk'
  | 'chaser'
  | 'rescuer'
  | 'caravan-seeker'
  | 'deep-diver';

export const ALL_BEHAVIORS: BehaviorName[] = [
  'wanderer',
  'orbiter',
  'drifter',
  'afk',
  'chaser',
  'rescuer',
  'caravan-seeker',
  'deep-diver',
];

export function createBehavior(name: BehaviorName, rng: Rng): Behavior {
  switch (name) {
    case 'orbiter':
      return new OrbiterBehavior(rng);
    case 'drifter':
      return new DrifterBehavior();
    case 'afk':
      return new AfkBehavior(rng);
    case 'chaser':
      return new ChaserBehavior();
    case 'rescuer':
      return new RescuerBehavior();
    case 'caravan-seeker':
      return new CaravanSeekerBehavior();
    case 'deep-diver':
      return new DeepDiverBehavior();
    case 'wanderer':
    default:
      return new WandererBehavior();
  }
}
