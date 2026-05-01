/**
 * Shared pure math.
 *
 * No imports of network or runtime code; safe to use on server, client, and
 * bots. Tested in math.test.ts.
 */

/**
 * Planet radius derived from the room's accumulated dust.
 *
 * Per PITCH.md: radius scales as totalDust ^ 0.6, smoothed and clamped so the
 * planet is visible from the first dust speck and does not overflow the scene
 * before art polish.
 */
export const RADIUS_BASE = 0.5;
export const RADIUS_SCALE = 0.25;
export const RADIUS_EXPONENT = 0.6;
export const RADIUS_MAX = 200;

export function planetRadiusFromTotalDust(totalDust: number): number {
  if (!Number.isFinite(totalDust) || totalDust <= 0) return RADIUS_BASE;
  const grown = RADIUS_BASE + RADIUS_SCALE * totalDust ** RADIUS_EXPONENT;
  return Math.min(grown, RADIUS_MAX);
}

/** Clamp a value to a closed range. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Squared euclidean distance in 3D. Avoids sqrt where only ordering matters. */
export function distanceSquared3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

export const PLAY_VOLUME_RADIUS = 1024;

/** Clamp a 3D point to the playable cosmic volume around the planet. */
export function clampToPlayVolume<T extends { x: number; y: number; z: number }>(
  point: T,
): { x: number; y: number; z: number } {
  const lenSq =
    point.x * point.x + point.y * point.y + point.z * point.z;
  if (lenSq <= PLAY_VOLUME_RADIUS * PLAY_VOLUME_RADIUS) {
    return { x: point.x, y: point.y, z: point.z };
  }
  const len = Math.sqrt(lenSq);
  const k = PLAY_VOLUME_RADIUS / len;
  return { x: point.x * k, y: point.y * k, z: point.z * k };
}
