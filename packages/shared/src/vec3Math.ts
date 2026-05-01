/**
 * Tiny vector helpers shared by the bot behaviors (`tools/bots`) and the
 * server-side ghost manager (`apps/server`). These avoid duplicating the same
 * "pick random ring point", "seek on XZ", "linear interpolate", and "nearest
 * entity with optional filter / radius" code in two packages.
 *
 * No I/O. The wire-schema for `Vec3` lives in `vec3.ts`.
 */
import type { Vec3 } from './vec3.js';

/** Stateless RNG signature accepted by every helper here (mulberry32, math.random, etc.). */
export type RngFn = () => number;

/** `a + (b - a) * t`, applied componentwise. */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Squared euclidean distance — caller decides whether to `Math.sqrt` it. */
export function vec3DistSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Random point on an XZ ring around the origin in [minRadius, maxRadius].
 * `yJitter` (optional) is the half-amplitude of an extra Y bias — bots use a
 * tiny 0.1 to keep movement visually loose; ghosts pin Y to 0.
 */
export function randomRingXZ(
  rng: RngFn,
  minRadius: number,
  maxRadius: number,
  yJitter = 0,
): Vec3 {
  const angle = rng() * Math.PI * 2;
  const r = minRadius + rng() * Math.max(0, maxRadius - minRadius);
  return {
    x: Math.cos(angle) * r,
    y: yJitter > 0 ? (rng() * 2 - 1) * yJitter : 0,
    z: Math.sin(angle) * r,
  };
}

/**
 * Step `from` toward `to` by `speed * dt` units on the XZ plane (Y forced to 0).
 * If already at the target, returns the input unchanged. Useful for ghosts that
 * have a fixed walk speed; bot behaviors typically prefer `lerpVec3` for the
 * eased "ramp up" feel.
 */
export function seekTowardXZ(from: Vec3, to: Vec3, speed: number, dt: number): Vec3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len <= 1e-6) return { x: from.x, y: 0, z: from.z };
  const k = (speed * dt) / len;
  return { x: from.x + dx * k, y: 0, z: from.z + dz * k };
}

/**
 * Generic spatial pick: nearest item to `origin` (squared-distance), filtered
 * by `accept` and optionally capped by `withinRadius`. Returns null when no
 * item satisfies both predicates.
 */
export function nearestBy<T extends { position: Vec3 }>(
  items: ReadonlyArray<T>,
  origin: Vec3,
  accept?: (item: T) => boolean,
  withinRadius?: number,
): T | null {
  let best: T | null = null;
  let bestSq = withinRadius !== undefined ? withinRadius * withinRadius : Infinity;
  for (const it of items) {
    if (accept && !accept(it)) continue;
    const sq = vec3DistSq(it.position, origin);
    if (sq < bestSq) {
      bestSq = sq;
      best = it;
    }
  }
  return best;
}
