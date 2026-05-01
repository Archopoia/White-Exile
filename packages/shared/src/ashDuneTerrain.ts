/**
 * Authoritative ash-dune height in world space (must stay in sync with the
 * client vertex shader in `apps/client/src/duneTerrainMaterial.ts`).
 *
 * World surface Y = {@link ASH_DUNE_GROUND_BASE_Y} + elevation.
 */

/** Matches `ground.position.y` on the client. */
export const ASH_DUNE_GROUND_BASE_Y = -2;

/** Default prevailing wind on the XZ plane (matches shader `uWindDir`). */
export const ASH_DUNE_DEFAULT_WIND_XZ = Object.freeze({ x: 0.91, z: 0.42 });

/** Sphere center offset above the dune surface for the local player core (radius 0.75). */
export const ASH_DUNE_PLAYER_CENTER_OFFSET = 0.75;

/** Other player cores (mesh radius ~0.55) — visual placement on clients. */
export const ASH_DUNE_OTHER_PLAYER_CENTER_OFFSET = 0.55;

/** Follower spheres (approximate mesh radius). */
export const ASH_DUNE_FOLLOWER_CENTER_OFFSET = 0.32;

/** Ruin column: server stores world Y of the box center (half of 6m column). */
export const ASH_DUNE_RUIN_CENTER_OFFSET = 3;

/** Relic octahedron resting above sand. */
export const ASH_DUNE_RELIC_CENTER_OFFSET = 0.55;

function fract(x: number): number {
  return x - Math.floor(x);
}

function duneHash(px: number, py: number): number {
  return fract(Math.sin(px * 127.1 + py * 311.7) * 43758.5453123);
}

function duneNoise(px: number, py: number): number {
  const i = Math.floor(px);
  const j = Math.floor(py);
  const f = px - i;
  const g = py - j;
  const a = duneHash(i, j);
  const b = duneHash(i + 1, j);
  const c = duneHash(i, j + 1);
  const d = duneHash(i + 1, j + 1);
  const u = f * f * (3.0 - 2.0 * f);
  const v = g * g * (3.0 - 2.0 * g);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function duneFbm(px: number, py: number): number {
  let v = 0;
  let a = 0.5;
  let x = px;
  let y = py;
  for (let i = 0; i < 6; i++) {
    v += a * duneNoise(x, y);
    const nx = 1.6 * x - 1.2 * y;
    const ny = 1.2 * x + 1.6 * y;
    x = nx;
    y = ny;
    a *= 0.5;
  }
  return v;
}

function duneMound(t: number, sharp: number): number {
  const tc = Math.min(1, Math.max(0, t));
  const rise = 1.0 - Math.cos(tc * Math.PI * sharp);
  const fall = 1.0 - Math.cos((1.0 - tc) * Math.PI * (2.1 - sharp * 0.35));
  const branch = tc >= 0.52 ? fall * 0.45 : rise * 0.55;
  return branch * 0.5;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function windDirNorm(w: { readonly x: number; readonly z: number }): { x: number; z: number } {
  const len = Math.hypot(w.x, w.z) || 1;
  return { x: w.x / len, z: w.z / len };
}

/**
 * Scalar dune elevation (same units as the shader — added on top of {@link ASH_DUNE_GROUND_BASE_Y}).
 */
export function ashDuneElevation(
  x: number,
  z: number,
  timeSeconds: number,
  wind: { readonly x: number; readonly z: number } = ASH_DUNE_DEFAULT_WIND_XZ,
): number {
  const r = Math.hypot(x, z);
  let depth = smoothstep(0, 420, r);
  depth = Math.pow(depth, 1.15);

  const calmCore = 1.0 - smoothstep(0, 48, r);

  const wdir = windDirNorm(wind);
  const acrossX = -wdir.z;
  const acrossZ = wdir.x;

  const warpAmp = (2.0 + (55.0 - 2.0) * depth) * (1.0 - calmCore * 0.85);
  const warpX = duneFbm(x * 0.0018 + 3.7, z * 0.0018 + 3.7) * warpAmp;
  const warpZ = duneFbm(x * 0.0016 + 9.1, z * 0.0016 + 9.1) * warpAmp;
  const px = x + warpX;
  const pz = z + warpZ;

  const along = wdir.x * px + wdir.z * pz;
  const cross = acrossX * px + acrossZ * pz;

  const waveLen = 140.0 + (38.0 - 140.0) * depth;
  const u = fract(along / waveLen);
  const cellPhase = timeSeconds * (0.045 + (0.11 - 0.045) * depth);
  const mound = duneMound(u, 1.05 + (1.85 - 1.05) * depth);

  let secondary = Math.sin(along * ((Math.PI * 2) / waveLen) * 2.17 + cross * 0.0061 + cellPhase * 1.9);
  secondary +=
    Math.sin(cross * 0.019 + along * 0.003 + timeSeconds * 0.05) * (0.12 + (0.55 - 0.12) * depth);

  let transverse = Math.sin(cross * (0.011 + depth * 0.018) + duneFbm(px * 0.003, pz * 0.003) * 6.2);
  transverse *= 0.15 + (0.95 - 0.15) * depth;

  let amp = 0.35 + (11.0 - 0.35) * depth;
  amp *= 1.0 + (0.35 - 1.0) * calmCore;

  let h = mound * amp;
  h += secondary * (0.08 + (1.25 - 0.08) * depth) * amp * 0.07;
  h += transverse * (0.2 + (2.4 - 0.2) * depth);
  h += (duneFbm(px * 0.012 + timeSeconds * 0.02, pz * 0.012) - 0.5) * (0.15 + (1.8 - 0.15) * depth);

  const chop = duneFbm(px * 0.028 + timeSeconds * 0.03, pz * 0.028 - timeSeconds * 0.021);
  h += chop * (2.2 * depth * depth);

  return h;
}

export function ashDuneSurfaceWorldY(
  x: number,
  z: number,
  timeSeconds: number,
  wind: { readonly x: number; readonly z: number } = ASH_DUNE_DEFAULT_WIND_XZ,
): number {
  return ASH_DUNE_GROUND_BASE_Y + ashDuneElevation(x, z, timeSeconds, wind);
}
