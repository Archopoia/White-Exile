/**
 * Shared pure math (no I/O). Safe on server, client, and tooling.
 */

import {
  ASH_DUNE_DEFAULT_HEIGHT_SCALE,
  placementSurfaceY,
} from './ashDuneTerrain.js';

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

/**
 * Clamp inside the play sphere, then snap Y onto the ash-dune surface for the
 * canonical local-player placement offset (see `WORLD_PLACEMENT_OFFSET.player`).
 */
export function clampPlayerPosition<T extends { x: number; y: number; z: number }>(
  point: T,
  simulationTimeSec: number,
  duneHeightScale: number = ASH_DUNE_DEFAULT_HEIGHT_SCALE,
): { x: number; y: number; z: number } {
  const p = clampToPlayVolume(point);
  const y = placementSurfaceY('player', p.x, p.z, simulationTimeSec, {
    heightScale: duneHeightScale,
  });
  return { x: p.x, y, z: p.z };
}
