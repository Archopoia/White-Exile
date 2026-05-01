import { describe, expect, it } from 'vitest';
import {
  classifyZone,
  combineCaravanRadius,
  computeSoloLightRadius,
  fogDensityForZone,
  lightFieldsOverlap,
  RACE_PROFILES,
  stepFuel,
  ZONE_BANDS,
} from './index.js';

describe('classifyZone', () => {
  it('returns the band whose maxRadius covers the distance', () => {
    expect(classifyZone(0)).toBe('safe');
    expect(classifyZone(ZONE_BANDS[0]!.maxRadius - 1)).toBe('safe');
    expect(classifyZone(ZONE_BANDS[1]!.maxRadius - 1)).toBe('grey');
    expect(classifyZone(ZONE_BANDS[2]!.maxRadius - 1)).toBe('deep');
    expect(classifyZone(99999)).toBe('dead');
  });

  it('fog density grows with depth', () => {
    expect(fogDensityForZone('safe')).toBeLessThan(fogDensityForZone('grey'));
    expect(fogDensityForZone('grey')).toBeLessThan(fogDensityForZone('deep'));
    expect(fogDensityForZone('deep')).toBeLessThan(fogDensityForZone('dead'));
  });
});

describe('computeSoloLightRadius', () => {
  it('starts at the race base radius for an empty solo state', () => {
    const r = computeSoloLightRadius({
      race: 'emberfolk',
      followers: [],
      relicBonus: 0,
      fuel: 1,
      distanceFromOrigin: 0,
    });
    expect(r).toBeCloseTo(RACE_PROFILES.emberfolk.baseLightRadius, 5);
  });

  it('grows with followers but with diminishing returns', () => {
    const oneLantern = computeSoloLightRadius({
      race: 'emberfolk',
      followers: [{ kind: 'lantern-bearer' }],
      relicBonus: 0,
      fuel: 1,
      distanceFromOrigin: 0,
    });
    const tenLanterns = computeSoloLightRadius({
      race: 'emberfolk',
      followers: Array(10).fill({ kind: 'lantern-bearer' as const }),
      relicBonus: 0,
      fuel: 1,
      distanceFromOrigin: 0,
    });
    expect(oneLantern).toBeGreaterThan(RACE_PROFILES.emberfolk.baseLightRadius);
    expect(tenLanterns).toBeGreaterThan(oneLantern);
    expect(tenLanterns - oneLantern).toBeLessThan(oneLantern * 4);
  });

  it('low fuel dampens light radius', () => {
    const dim = computeSoloLightRadius({
      race: 'emberfolk',
      followers: [],
      relicBonus: 0,
      fuel: 0.05,
      distanceFromOrigin: 0,
    });
    const lit = computeSoloLightRadius({
      race: 'emberfolk',
      followers: [],
      relicBonus: 0,
      fuel: 1,
      distanceFromOrigin: 0,
    });
    expect(dim).toBeLessThan(lit);
  });

  it('ashborn gets a deep-zone bonus', () => {
    const safe = computeSoloLightRadius({
      race: 'ashborn',
      followers: [],
      relicBonus: 0,
      fuel: 1,
      distanceFromOrigin: 0,
    });
    const deep = computeSoloLightRadius({
      race: 'ashborn',
      followers: [],
      relicBonus: 0,
      fuel: 1,
      distanceFromOrigin: 400,
    });
    expect(deep).toBeGreaterThan(safe);
  });
});

describe('combineCaravanRadius', () => {
  it('returns 0 for no members', () => {
    expect(combineCaravanRadius([])).toBe(0);
  });

  it('returns the solo radius for a single member', () => {
    expect(
      combineCaravanRadius([
        { playerId: 'p1', race: 'emberfolk', position: { x: 0, y: 0, z: 0 }, soloRadius: 12 },
      ]),
    ).toBe(12);
  });

  it('same race adds more than cross-race partial efficiency', () => {
    const same = combineCaravanRadius([
      { playerId: 'a', race: 'emberfolk', position: { x: 0, y: 0, z: 0 }, soloRadius: 14 },
      { playerId: 'b', race: 'emberfolk', position: { x: 1, y: 0, z: 0 }, soloRadius: 14 },
    ]);
    const cross = combineCaravanRadius([
      { playerId: 'a', race: 'emberfolk', position: { x: 0, y: 0, z: 0 }, soloRadius: 14 },
      { playerId: 'b', race: 'lumen-kin', position: { x: 1, y: 0, z: 0 }, soloRadius: 14 },
    ]);
    expect(same).toBeGreaterThan(cross);
  });
});

describe('lightFieldsOverlap', () => {
  it('detects overlap when sum of radii covers distance', () => {
    expect(
      lightFieldsOverlap(
        { x: 0, y: 0, z: 0, radius: 5 },
        { x: 8, y: 0, z: 0, radius: 5 },
      ),
    ).toBe(true);
  });
  it('rejects when farther than sum of radii', () => {
    expect(
      lightFieldsOverlap(
        { x: 0, y: 0, z: 0, radius: 1 },
        { x: 100, y: 0, z: 0, radius: 1 },
      ),
    ).toBe(false);
  });
});

describe('stepFuel', () => {
  it('drains fuel when alone and unsheltered', () => {
    const next = stepFuel({
      fuel: 1,
      race: 'emberfolk',
      dt: 1,
      shelteredBy: 0,
      inRuin: false,
    });
    expect(next).toBeLessThan(1);
  });

  it('regenerates when sheltered by a caravan', () => {
    const next = stepFuel({
      fuel: 0.5,
      race: 'emberfolk',
      dt: 1,
      shelteredBy: 60,
      inRuin: false,
    });
    expect(next).toBeGreaterThan(0.5);
  });

  it('clamps to [0, 1]', () => {
    expect(stepFuel({ fuel: 0, race: 'emberfolk', dt: 1, shelteredBy: 0, inRuin: false })).toBe(0);
    expect(
      stepFuel({ fuel: 1, race: 'emberfolk', dt: 100, shelteredBy: 200, inRuin: true }),
    ).toBe(1);
  });
});
