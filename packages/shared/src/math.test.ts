import { describe, expect, it } from 'vitest';
import {
  ASH_DUNE_PLAYER_CENTER_OFFSET,
  ashDuneSurfaceWorldY,
} from './ashDuneTerrain.js';
import {
  clamp,
  clampPlayerPosition,
  clampToPlayVolume,
  distanceSquared3,
  PLAY_VOLUME_RADIUS,
} from './math.js';

describe('clamp', () => {
  it('clamps to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('distanceSquared3', () => {
  it('returns zero for identical points', () => {
    expect(distanceSquared3(1, 2, 3, 1, 2, 3)).toBe(0);
  });

  it('matches manual calculation', () => {
    expect(distanceSquared3(0, 0, 0, 3, 4, 0)).toBe(25);
  });
});

describe('clampToPlayVolume', () => {
  it('passes through points inside the volume', () => {
    const p = { x: 10, y: 20, z: -5 };
    expect(clampToPlayVolume(p)).toEqual(p);
  });

  it('projects far points back to the surface', () => {
    const far = { x: 5000, y: 0, z: 0 };
    const clamped = clampToPlayVolume(far);
    const len = Math.hypot(clamped.x, clamped.y, clamped.z);
    expect(len).toBeCloseTo(PLAY_VOLUME_RADIUS, 3);
  });
});

describe('clampPlayerPosition', () => {
  const t = 0;

  it('snaps Y to the dune surface and stays inside the play sphere', () => {
    const p = clampPlayerPosition({ x: 5000, y: 99, z: 0 }, t);
    const vol = clampToPlayVolume({ x: 5000, y: 99, z: 0 });
    const wantY = ashDuneSurfaceWorldY(vol.x, vol.z, t) + ASH_DUNE_PLAYER_CENTER_OFFSET;
    expect(p.y).toBeCloseTo(wantY, 5);
    expect(Math.hypot(p.x, p.y, p.z)).toBeLessThanOrEqual(PLAY_VOLUME_RADIUS + 1e-6);
  });

  it('leaves in-volume horizontal coordinates and sets dune Y', () => {
    const p = clampPlayerPosition({ x: 3, y: 0, z: 4 }, t);
    expect(p.x).toBe(3);
    expect(p.z).toBe(4);
    expect(p.y).toBeCloseTo(ashDuneSurfaceWorldY(3, 4, t) + ASH_DUNE_PLAYER_CENTER_OFFSET, 5);
  });
});
