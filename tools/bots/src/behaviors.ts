/**
 * Pluggable bot brains.
 *
 * Each tick returns the next intended position **and** any optional intents
 * (rescue, activate ruin) to be sent up. The bot wrapper handles transport.
 *
 * Most behaviors are "lerp toward a goal" with a different goal source and
 * cadence; they share {@link makeSeek}. Adding a new lerp-style brain is one
 * entry in {@link SEEK_SPECS}. Parametric brains (e.g. orbits) implement
 * {@link Behavior} directly.
 */
import {
  lerpVec3,
  nearestBy,
  randomRingXZ,
  vec3DistSq,
  type FollowerSnapshot,
  type RoomSnapshot,
  type RuinSnapshot,
  type Vec3,
} from '@realtime-room/shared';
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

/**
 * Soft sphere distribution with mild Y jitter so wandering bots don't pile up
 * on the ground plane. Pure aesthetic, not a physics need.
 */
function spherePoint(rng: Rng, radius: number): Vec3 {
  const p = randomRingXZ(rng, radius, radius);
  return { x: p.x, y: (rng() * 2 - 1) * radius * 0.1, z: p.z };
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
  return ctx.snapshot
    ? nearestBy(ctx.snapshot.followers, origin, (f) => f.ownerId === null, withinRadius)
    : null;
}

function nearestUnactivatedRuin(
  ctx: BehaviorContext,
  origin: Vec3,
  withinRadius?: number,
): RuinSnapshot | null {
  return ctx.snapshot
    ? nearestBy(ctx.snapshot.ruins, origin, (r) => !r.activated, withinRadius)
    : null;
}

function wanderingFallback(ctx: BehaviorContext, min = 50, span = 220): Vec3 {
  return spherePoint(ctx.rng, min + ctx.rng() * span);
}

/**
 * Per-behavior recipe for the shared lerp-toward-goal loop.
 *   - `lerpRate`        — exponential approach speed (`min(1, dt * lerpRate)`).
 *   - `retargetEvery`   — seconds between goal repicks; omit to retarget every tick.
 *   - `initial`         — starting position (default origin).
 *   - `pickGoal`        — chooses the next goal (snapshot-aware, RNG-aware).
 *   - `intent`          — optional per-tick intent (rescue / activate-ruin) with
 *                         its own cooldown (sec).
 */
interface SeekSpec {
  readonly name: BehaviorName;
  readonly lerpRate: number;
  readonly retargetEvery?: (rng: Rng) => number;
  readonly initial?: (rng: Rng) => Vec3;
  readonly pickGoal: (ctx: BehaviorContext, current: Vec3) => Vec3;
  readonly intent?: {
    readonly cooldown: number;
    readonly emit: (ctx: BehaviorContext, current: Vec3) => Partial<BehaviorTick> | null;
  };
}

function makeSeek(spec: SeekSpec, rng: Rng): Behavior {
  let current: Vec3 = spec.initial ? spec.initial(rng) : { x: 0, y: 0, z: 0 };
  let target: Vec3 = current;
  let retargetIn = 0;
  let intentCooldown = 0;
  return {
    name: spec.name,
    tick(dt: number, ctx: BehaviorContext): BehaviorTick {
      retargetIn -= dt;
      intentCooldown -= dt;
      if (retargetIn <= 0) {
        target = spec.pickGoal(ctx, current);
        retargetIn = spec.retargetEvery ? spec.retargetEvery(ctx.rng) : 0;
      }
      current = lerpVec3(current, target, Math.min(1, dt * spec.lerpRate));
      const out: BehaviorTick = { position: current };
      if (spec.intent && intentCooldown <= 0) {
        const extra = spec.intent.emit(ctx, current);
        if (extra) {
          if (extra.rescueFollowerId !== undefined) out.rescueFollowerId = extra.rescueFollowerId;
          if (extra.activateRuinId !== undefined) out.activateRuinId = extra.activateRuinId;
          intentCooldown = spec.intent.cooldown;
        }
      }
      return out;
    },
  };
}

/** Single source of truth for every lerp-style brain. */
const SEEK_SPECS: Readonly<Record<SeekBehaviorName, SeekSpec>> = Object.freeze({
  wanderer: {
    name: 'wanderer',
    lerpRate: 2.4,
    retargetEvery: (rng) => 1.5 + rng() * 2.5,
    initial: () => ({ x: PLAY_RADIUS, y: 0, z: 0 }),
    pickGoal: (ctx) => spherePoint(ctx.rng, 60 + ctx.rng() * 220),
  },
  drifter: {
    name: 'drifter',
    lerpRate: 10,
    retargetEvery: (rng) => 0.25 + rng() * 0.4,
    initial: () => ({ x: PLAY_RADIUS, y: 0, z: 0 }),
    pickGoal: (ctx) => wanderingFallback(ctx),
  },
  afk: {
    name: 'afk',
    lerpRate: 0,
    initial: (rng) => spherePoint(rng, 30 + rng() * 60),
    pickGoal: (_ctx, current) => current,
  },
  chaser: {
    name: 'chaser',
    lerpRate: 2.8,
    initial: () => ({ x: PLAY_RADIUS, y: 0, z: 0 }),
    pickGoal: (ctx, current) => {
      const snap = ctx.snapshot;
      if (snap && snap.players.length > 1) {
        const other = nearestBy(
          snap.players,
          current,
          (p) => p.id !== ctx.selfPlayerId && vec3DistSq(p.position, current) > 0.01,
        );
        if (other) return other.position;
      }
      return wanderingFallback(ctx);
    },
  },
  rescuer: {
    name: 'rescuer',
    lerpRate: 2.0,
    initial: () => ({ x: 40, y: 0, z: 0 }),
    pickGoal: (ctx, current) => {
      const me = self(ctx);
      const target = nearestStrandedFollower(ctx, me?.position ?? current);
      return target ? target.position : spherePoint(ctx.rng, 40 + ctx.rng() * 120);
    },
    intent: {
      cooldown: 1.0,
      emit: (ctx) => {
        const me = self(ctx);
        if (!me) return null;
        const target = nearestStrandedFollower(ctx, me.position);
        if (!target) return null;
        const myLight =
          ctx.snapshot?.players.find((p) => p.id === ctx.selfPlayerId)?.lightRadius ?? 0;
        if (vec3DistSq(me.position, target.position) > myLight * myLight) return null;
        return { rescueFollowerId: target.id };
      },
    },
  },
  'caravan-seeker': {
    name: 'caravan-seeker',
    lerpRate: 1.6,
    initial: () => ({ x: 0, y: 0, z: 0 }),
    pickGoal: (ctx) => {
      const snap = ctx.snapshot;
      if (snap && snap.caravans.length > 0) {
        let largest = snap.caravans[0]!;
        for (const c of snap.caravans) if (c.lightRadius > largest.lightRadius) largest = c;
        const leader = snap.players.find((p) => p.id === largest.leaderId);
        if (leader) return leader.position;
      }
      return spherePoint(ctx.rng, 80);
    },
  },
  'deep-diver': {
    name: 'deep-diver',
    lerpRate: 1.4,
    retargetEvery: (rng) => 4 + rng() * 3,
    initial: () => ({ x: 0, y: 0, z: 0 }),
    pickGoal: (ctx, current) => {
      const me = self(ctx);
      const ruin = nearestUnactivatedRuin(ctx, me?.position ?? current, 600);
      if (ruin) return ruin.position;
      const angle = ctx.rng() * Math.PI * 2;
      const r = 220 + ctx.rng() * 240;
      return { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
    },
    intent: {
      cooldown: 2.0,
      emit: (ctx) => {
        const me = self(ctx);
        if (!me) return null;
        const ruin = nearestUnactivatedRuin(ctx, me.position, 6);
        return ruin ? { activateRuinId: ruin.id } : null;
      },
    },
  },
});

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

type SeekBehaviorName =
  | 'wanderer'
  | 'drifter'
  | 'afk'
  | 'chaser'
  | 'rescuer'
  | 'caravan-seeker'
  | 'deep-diver';

export type BehaviorName = SeekBehaviorName | 'orbiter';

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
  if (name === 'orbiter') return new OrbiterBehavior(rng);
  return makeSeek(SEEK_SPECS[name], rng);
}
