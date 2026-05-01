/**
 * Bot behavior registry.
 *
 * A behavior is a tiny stateful brain: given dt and a context (last snapshot,
 * rng), it produces the bot's intended position and whether to burst this
 * tick. Behaviors are plain TypeScript so they're easy to read in logs and
 * extend without modifying the runner.
 */
import type { RoomSnapshot, Vec3 } from '@tutelary/shared';
import type { Rng } from './rng.js';

export interface BehaviorContext {
  rng: Rng;
  botId: number;
  snapshot: RoomSnapshot | null;
  elapsed: number;
}

export interface BehaviorTick {
  position: Vec3;
  burst: boolean;
}

export interface Behavior {
  readonly name: string;
  tick(dt: number, ctx: BehaviorContext): BehaviorTick;
}

const PLAY_RADIUS = 18;

function spherePoint(rng: Rng, radius: number): Vec3 {
  const u = rng() * 2 - 1;
  const theta = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return {
    x: radius * r * Math.cos(theta),
    y: radius * u,
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

class WandererBehavior implements Behavior {
  readonly name = 'wanderer';
  private current: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };
  private target: Vec3 = this.current;
  private timeToRetarget = 0;

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    this.timeToRetarget -= dt;
    if (this.timeToRetarget <= 0) {
      this.target = spherePoint(ctx.rng, PLAY_RADIUS);
      this.timeToRetarget = 1.5 + ctx.rng() * 2.5;
    }
    this.current = lerpVec3(this.current, this.target, Math.min(1, dt * 2.4));
    return { position: this.current, burst: ctx.rng() < dt * 0.4 };
  }
}

class OrbiterBehavior implements Behavior {
  readonly name = 'orbiter';
  private readonly axis: Vec3;
  private readonly radius: number;
  private readonly speed: number;
  private phase: number;

  constructor(rng: Rng) {
    this.radius = PLAY_RADIUS * (0.6 + rng() * 0.4);
    this.speed = 0.4 + rng() * 0.8;
    this.phase = rng() * Math.PI * 2;
    const tilt = rng() * Math.PI;
    this.axis = { x: Math.cos(tilt), y: Math.sin(tilt), z: 0 };
  }

  tick(dt: number, _ctx: BehaviorContext): BehaviorTick {
    this.phase += dt * this.speed;
    const cos = Math.cos(this.phase);
    const sin = Math.sin(this.phase);
    return {
      position: {
        x: this.radius * cos * this.axis.x + this.radius * sin * this.axis.y,
        y: this.radius * cos * this.axis.y - this.radius * sin * this.axis.x,
        z: this.radius * Math.sin(this.phase * 0.4),
      },
      burst: false,
    };
  }
}

class ClickerBehavior implements Behavior {
  readonly name = 'clicker';
  private cooldown = 0;
  private current: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };
  private desired: Vec3 = { x: PLAY_RADIUS, y: 0, z: 0 };

  tick(dt: number, ctx: BehaviorContext): BehaviorTick {
    this.cooldown -= dt;
    let burst = false;
    if (this.cooldown <= 0) {
      this.desired = spherePoint(ctx.rng, PLAY_RADIUS);
      this.cooldown = 0.25 + ctx.rng() * 0.4;
      burst = true;
    }
    this.current = lerpVec3(this.current, this.desired, Math.min(1, dt * 10));
    return { position: this.current, burst };
  }
}

class AfkBehavior implements Behavior {
  readonly name = 'afk';
  private readonly anchor: Vec3;

  constructor(rng: Rng) {
    this.anchor = spherePoint(rng, PLAY_RADIUS);
  }

  tick(_dt: number, _ctx: BehaviorContext): BehaviorTick {
    return { position: this.anchor, burst: false };
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
    if (!target) target = spherePoint(ctx.rng, PLAY_RADIUS);
    this.current = lerpVec3(this.current, target, Math.min(1, dt * 2.8));
    return { position: this.current, burst: ctx.rng() < dt * 0.6 };
  }
}

export type BehaviorName = 'wanderer' | 'orbiter' | 'clicker' | 'afk' | 'chaser';

export const ALL_BEHAVIORS: BehaviorName[] = ['wanderer', 'orbiter', 'clicker', 'afk', 'chaser'];

export function createBehavior(name: BehaviorName, rng: Rng): Behavior {
  switch (name) {
    case 'orbiter':
      return new OrbiterBehavior(rng);
    case 'clicker':
      return new ClickerBehavior();
    case 'afk':
      return new AfkBehavior(rng);
    case 'chaser':
      return new ChaserBehavior();
    case 'wanderer':
    default:
      return new WandererBehavior();
  }
}
