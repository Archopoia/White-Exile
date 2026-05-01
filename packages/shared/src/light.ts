/**
 * Pure light & zone math. Authoritative on the server, replicated on the client
 * for prediction, and reused by bots when picking targets.
 *
 * No I/O. No randomness (seeded RNG lives in the consumer).
 */
import { distanceSquared3 } from './math.js';
import type { FollowerKind, Race } from './world.js';
import { RACE_PROFILES, ZONE_BANDS, type Zone } from './world.js';

/** Per-follower contribution to the caravan's effective light radius. */
const FOLLOWER_RADIUS_GAIN: Readonly<Record<FollowerKind, number>> = Object.freeze({
  wanderer: 0.6,
  'lantern-bearer': 1.6,
  beast: 0.25,
});

/** Diminishing-returns curve. tuned so 10 followers ≈ +6 radius, not +6×N. */
function withDiminishingReturns(sum: number): number {
  if (sum <= 0) return 0;
  return 6 * (1 - Math.exp(-sum / 6));
}

export interface LightInputs {
  race: Race;
  /** Followers physically attached to this player. */
  followers: ReadonlyArray<{ kind: FollowerKind }>;
  /** Sum of `radiusBonus` from relics already claimed by this player. */
  relicBonus: number;
  /** Current fuel in [0, 1]; effective radius scales linearly with fuel. */
  fuel: number;
  /** Distance from world origin; deep zones may amplify per-race. */
  distanceFromOrigin: number;
}

/** Effective light radius for a single player at this moment. */
export function computeSoloLightRadius(inputs: LightInputs): number {
  const profile = RACE_PROFILES[inputs.race];
  let followerSum = 0;
  for (const f of inputs.followers) {
    followerSum += FOLLOWER_RADIUS_GAIN[f.kind] ?? 0;
  }
  const followerBonus = withDiminishingReturns(followerSum);
  const fuelMul = Math.min(1, Math.max(0, inputs.fuel));
  const zone = classifyZone(inputs.distanceFromOrigin);
  const zoneMul = zone === 'deep' || zone === 'dead' ? profile.deepZoneBonus : 1;
  return (profile.baseLightRadius + followerBonus + inputs.relicBonus) * zoneMul * fuelMul;
}

export interface CaravanLightInput {
  playerId: string;
  race: Race;
  position: { x: number; y: number; z: number };
  soloRadius: number;
}

/**
 * Combine multiple players' light fields. Same race = full additive overlap;
 * different race = `crossRaceEfficiency` penalty applied to the *cross-race*
 * portion only. Final radius is the largest individual radius **plus** an
 * efficiency-scaled bonus from the rest of the cluster.
 */
export function combineCaravanRadius(members: ReadonlyArray<CaravanLightInput>): number {
  if (members.length === 0) return 0;
  if (members.length === 1) return members[0]!.soloRadius;
  const sorted = [...members].sort((a, b) => b.soloRadius - a.soloRadius);
  const lead = sorted[0]!;
  let bonus = 0;
  for (let i = 1; i < sorted.length; i++) {
    const m = sorted[i]!;
    const sameRace = m.race === lead.race;
    const efficiency = sameRace
      ? 1
      : Math.min(
          RACE_PROFILES[m.race].crossRaceEfficiency,
          RACE_PROFILES[lead.race].crossRaceEfficiency,
        );
    bonus += m.soloRadius * 0.45 * efficiency;
  }
  return lead.soloRadius + bonus;
}

/** True iff two players' light fields overlap (cluster trigger). */
export function lightFieldsOverlap(
  a: { x: number; y: number; z: number; radius: number },
  b: { x: number; y: number; z: number; radius: number },
): boolean {
  const sum = a.radius + b.radius;
  return distanceSquared3(a.x, a.y, a.z, b.x, b.y, b.z) <= sum * sum;
}

/** Classify a position by distance band. Pure; safe in client. */
export function classifyZone(distanceFromOrigin: number): Zone {
  for (const band of ZONE_BANDS) {
    if (distanceFromOrigin <= band.maxRadius) return band.zone;
  }
  return 'dead';
}

/** Per-zone fog density from the band table. */
export function fogDensityForZone(zone: Zone): number {
  for (const band of ZONE_BANDS) {
    if (band.zone === zone) return band.fogDensity;
  }
  return 0.05;
}

export interface FuelStepInput {
  /** Current fuel in [0, 1]. */
  fuel: number;
  race: Race;
  /** Seconds elapsed since last step. */
  dt: number;
  /** Sum of overlapping caravan radius coverage (>0 = inside shared light). */
  shelteredBy: number;
  /** True if standing inside an activated ruin's halo. */
  inRuin: boolean;
}

/**
 * One fuel tick. Solo & far from light = strong drain; sheltered = recovery.
 * Bounded to [0, 1] so the client can render a percentage gauge directly.
 */
export function stepFuel(input: FuelStepInput): number {
  const profile = RACE_PROFILES[input.race];
  const drainPerSec = 0.025 * profile.fuelDecayMul;
  const shelterRecoveryPerSec = input.shelteredBy > 0 ? 0.02 + Math.min(0.08, input.shelteredBy / 200) : 0;
  const ruinRecoveryPerSec = input.inRuin ? 0.05 : 0;
  const next = input.fuel - drainPerSec * input.dt + (shelterRecoveryPerSec + ruinRecoveryPerSec) * input.dt;
  if (next < 0) return 0;
  if (next > 1) return 1;
  return next;
}
