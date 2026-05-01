import { describe, expect, it } from 'vitest';
import {
  RADIUS_BASE,
  RADIUS_MAX,
  clamp,
  clampToPlayVolume,
  distanceSquared3,
  planetRadiusFromTotalDust,
} from './math.js';

describe('planetRadiusFromTotalDust', () => {
  it('returns the base radius for zero or negative dust', () => {
    expect(planetRadiusFromTotalDust(0)).toBe(RADIUS_BASE);
    expect(planetRadiusFromTotalDust(-5)).toBe(RADIUS_BASE);
  });

  it('grows monotonically with total dust', () => {
    const a = planetRadiusFromTotalDust(10);
    const b = planetRadiusFromTotalDust(100);
    const c = planetRadiusFromTotalDust(1_000);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('caps growth at RADIUS_MAX', () => {
    expect(planetRadiusFromTotalDust(1e18)).toBe(RADIUS_MAX);
  });

  it('handles non-finite input by returning the base', () => {
    expect(planetRadiusFromTotalDust(Number.NaN)).toBe(RADIUS_BASE);
    expect(planetRadiusFromTotalDust(Number.POSITIVE_INFINITY)).toBe(RADIUS_BASE);
  });
});

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
    expect(len).toBeCloseTo(1024, 3);
  });
});
