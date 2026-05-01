/**
 * Shared pure math (no I/O). Safe on server, client, and tooling.
 */

/** Clamp a value to a closed range. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Squared euclidean distance in 3D. */
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

/** Clamp a 3D point to a sphere of radius PLAY_VOLUME_RADIUS around the origin. */
export function clampToPlayVolume<T extends { x: number; y: number; z: number }>(
  point: T,
): { x: number; y: number; z: number } {
  const lenSq = point.x * point.x + point.y * point.y + point.z * point.z;
  if (lenSq <= PLAY_VOLUME_RADIUS * PLAY_VOLUME_RADIUS) {
    return { x: point.x, y: point.y, z: point.z };
  }
  const len = Math.sqrt(lenSq);
  const k = PLAY_VOLUME_RADIUS / len;
  return { x: point.x * k, y: point.y * k, z: point.z * k };
}
