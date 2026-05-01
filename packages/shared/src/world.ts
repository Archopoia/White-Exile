/**
 * White Exile world types.
 *
 * Concepts (see PITCH.md):
 *  - Light = unified survival resource (radius around a caravan).
 *  - Followers = physical NPC units rescued from fog.
 *  - Caravans = clusters of players whose light fields overlap.
 *  - Zones = concentric rings around the origin; deeper = darker, richer.
 *  - Relics / Ruins = world structures that boost light or amplify it.
 *
 * All shapes are wire-safe (Vec3 only; pure data) so they roundtrip through Zod.
 */
import { z } from 'zod';
import { Vec3Schema } from './vec3.js';

/* -------------------------------------------------------------------------- */
/* Race                                                                       */
/* -------------------------------------------------------------------------- */

export const RACES = ['emberfolk', 'ashborn', 'lumen-kin'] as const;
export const RaceSchema = z.enum(RACES);
export type Race = z.infer<typeof RaceSchema>;
export const DEFAULT_RACE: Race = 'emberfolk';

/** Moon-gold caravan torch — sun-family, slightly warmer than client directional `0xe4d6b8`. */
export const TORCH_MOON_GOLD_HEX = 0xe8d2ae as const;

export function isRace(value: unknown): value is Race {
  return typeof value === 'string' && (RACES as readonly string[]).includes(value);
}

/** Per-race tuning. Pure data so it can be sent to the client and shared with bots. */
export interface RaceProfile {
  readonly id: Race;
  readonly displayName: string;
  /** RGB hex (0xRRGGBB) used for the player's light sphere and follower trails. */
  readonly lightColor: number;
  /** Base light radius before followers/relics. */
  readonly baseLightRadius: number;
  /** Multiplier on per-tick fuel decay: <1 lasts longer. */
  readonly fuelDecayMul: number;
  /** Bonus to deep-zone effective light (e.g. ashborn = 1.2). */
  readonly deepZoneBonus: number;
  /** Light-sharing efficiency vs. a different race (1.0 = full, 0.7 = partial). */
  readonly crossRaceEfficiency: number;
}

export const RACE_PROFILES: Readonly<Record<Race, RaceProfile>> = Object.freeze({
  emberfolk: {
    id: 'emberfolk',
    displayName: 'Emberfolk',
    lightColor: TORCH_MOON_GOLD_HEX,
    baseLightRadius: 14,
    fuelDecayMul: 0.85,
    deepZoneBonus: 1.0,
    crossRaceEfficiency: 0.75,
  },
  ashborn: {
    id: 'ashborn',
    displayName: 'Ashborn',
    // Teal shifted toward moon-gold so torch matches sun family while staying cool-leaning.
    lightColor: 0x9be4b6,
    baseLightRadius: 11,
    fuelDecayMul: 1.0,
    deepZoneBonus: 1.25,
    crossRaceEfficiency: 0.7,
  },
  'lumen-kin': {
    id: 'lumen-kin',
    displayName: 'Lumen Kin',
    // Violet shifted toward moon-gold for the same sun-family read on sand.
    lightColor: 0xc9b2dc,
    baseLightRadius: 18,
    fuelDecayMul: 1.2,
    deepZoneBonus: 0.85,
    crossRaceEfficiency: 0.7,
  },
});

/* -------------------------------------------------------------------------- */
/* Zones                                                                      */
/* -------------------------------------------------------------------------- */

export const ZONES = ['safe', 'grey', 'deep', 'dead'] as const;
export const ZoneSchema = z.enum(ZONES);
export type Zone = z.infer<typeof ZoneSchema>;

/** Full zone names for HUD and in-world labels (keep in sync with design language). */
export const ZONE_DISPLAY_LABEL: Readonly<Record<Zone, string>> = {
  safe: 'Safe Ashlands',
  grey: 'Grey Dunes',
  deep: 'Deep Ash',
  dead: 'Dead Zone',
} as const;

/**
 * Distance bands from world origin. Tuned so the safe zone fits the spawn
 * volume comfortably and dead zones live well past the play radius edge.
 */
export const ZONE_BANDS: ReadonlyArray<{ zone: Zone; maxRadius: number; fogDensity: number }> = [
  { zone: 'safe', maxRadius: 90, fogDensity: 0.012 },
  { zone: 'grey', maxRadius: 220, fogDensity: 0.022 },
  { zone: 'deep', maxRadius: 480, fogDensity: 0.04 },
  { zone: 'dead', maxRadius: Infinity, fogDensity: 0.07 },
];

/* -------------------------------------------------------------------------- */
/* Followers                                                                  */
/* -------------------------------------------------------------------------- */

export const FOLLOWER_KINDS = ['wanderer', 'lantern-bearer', 'beast'] as const;
export const FollowerKindSchema = z.enum(FOLLOWER_KINDS);
export type FollowerKind = z.infer<typeof FollowerKindSchema>;

/**
 * Single source of truth for everything a follower kind contributes:
 *   - `displayName`   — UI / tooltips.
 *   - `glyph`         — leading shape used in CSS2D world labels.
 *   - `lightGain`     — caravan light radius bonus per attached follower (server sim).
 *   - `spawnWeight`   — seeded RNG pick weight in `generateInitialWorld`.
 * Adding a new follower kind = one entry here, plus the literal in `FOLLOWER_KINDS`.
 */
export interface FollowerKindDef {
  readonly id: FollowerKind;
  readonly displayName: string;
  readonly glyph: string;
  readonly lightGain: number;
  readonly spawnWeight: number;
}

export const FOLLOWER_KIND_DEFS: Readonly<Record<FollowerKind, FollowerKindDef>> = Object.freeze({
  wanderer: { id: 'wanderer', displayName: 'Wanderer', glyph: '∿', lightGain: 0.6, spawnWeight: 6 },
  'lantern-bearer': {
    id: 'lantern-bearer',
    displayName: 'Lantern bearer',
    glyph: '✧',
    lightGain: 1.6,
    spawnWeight: 2,
  },
  beast: { id: 'beast', displayName: 'Beast', glyph: '▶', lightGain: 0.25, spawnWeight: 1 },
});

/**
 * Cached spawn-weight total + decreasing-prefix list. Reused by spawn (seeded RNG)
 * and ruin activation (Math.random) so the kind distribution stays in lockstep.
 */
const FOLLOWER_SPAWN_TOTAL_WEIGHT = FOLLOWER_KINDS.reduce(
  (acc, k) => acc + FOLLOWER_KIND_DEFS[k].spawnWeight,
  0,
);

/** Weighted pick over `FOLLOWER_KIND_DEFS[*].spawnWeight`. `rng` returns [0, 1). */
export function pickFollowerKind(rng: () => number): FollowerKind {
  let pick = rng() * FOLLOWER_SPAWN_TOTAL_WEIGHT;
  for (const k of FOLLOWER_KINDS) {
    pick -= FOLLOWER_KIND_DEFS[k].spawnWeight;
    if (pick <= 0) return k;
  }
  return FOLLOWER_KINDS[0]!;
}

/** Wire shape for a single follower, free or attached. */
export const FollowerSnapshotSchema = z.object({
  id: z.string(),
  kind: FollowerKindSchema,
  position: Vec3Schema,
  /** Owning player id; null = stranded waiting to be rescued. */
  ownerId: z.string().nullable(),
  /** 0..1; <0.4 means panicking and may flee outside light. */
  morale: z.number().min(0).max(1),
});
export type FollowerSnapshot = z.infer<typeof FollowerSnapshotSchema>;

/* -------------------------------------------------------------------------- */
/* Ruins & relics                                                             */
/* -------------------------------------------------------------------------- */

export const RuinSnapshotSchema = z.object({
  id: z.string(),
  position: Vec3Schema,
  /** Number of stranded followers tied to this ruin (released on activation). */
  followerCharge: z.number().int().nonnegative(),
  /** True once any caravan has activated it. */
  activated: z.boolean(),
});
export type RuinSnapshot = z.infer<typeof RuinSnapshotSchema>;

export const RelicSnapshotSchema = z.object({
  id: z.string(),
  position: Vec3Schema,
  /** Static radius bonus granted to whoever passes through with sufficient fuel. */
  radiusBonus: z.number().nonnegative(),
  /** True once any caravan has claimed it. */
  claimed: z.boolean(),
  claimedBy: z.string().nullable(),
});
export type RelicSnapshot = z.infer<typeof RelicSnapshotSchema>;

/* -------------------------------------------------------------------------- */
/* Caravans                                                                   */
/* -------------------------------------------------------------------------- */

export const CaravanSnapshotSchema = z.object({
  id: z.string(),
  /** Player who anchors the cluster (highest light radius, broken on splits). */
  leaderId: z.string(),
  memberIds: z.array(z.string()).min(1),
  /** Sum of effective light from all members + relics, after race penalties. */
  lightRadius: z.number().nonnegative(),
  followerCount: z.number().int().nonnegative(),
});
export type CaravanSnapshot = z.infer<typeof CaravanSnapshotSchema>;

/* -------------------------------------------------------------------------- */
/* World config (broadcast)                                                   */
/* -------------------------------------------------------------------------- */

export const WorldConfigSchema = z.object({
  fogBaseDensity: z.number().nonnegative(),
  spawnRadius: z.number().positive(),
  followerCap: z.number().int().positive(),
  ruinCap: z.number().int().nonnegative(),
  relicCap: z.number().int().nonnegative(),
  /**
   * Multiplies procedural dune displacement everywhere (visual + authoritative Y).
   * Typical range 1–3; default matches authored relief (wavelength + amplitude), not extra high-frequency gain.
   */
  duneHeightScale: z.number().positive().max(20).default(1.45),
});
export type WorldConfig = z.infer<typeof WorldConfigSchema>;

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  fogBaseDensity: 0.018,
  spawnRadius: 600,
  followerCap: 64,
  ruinCap: 12,
  relicCap: 6,
  duneHeightScale: 1.45,
};
