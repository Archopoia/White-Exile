/**
 * Procedural spawn for stranded followers, ruins, and relics.
 *
 * Seeded so the layout is identical across server restarts (the persistence
 * layer carries the seed forward); spawn caps live in `WorldConfig`.
 */
import {
  ZONE_BANDS,
  type FollowerKind,
  type FollowerSnapshot,
  type RelicSnapshot,
  type RuinSnapshot,
  type WorldConfig,
  type Zone,
} from '@realtime-room/shared';
import type { Rng } from './rng.js';

interface SpawnEntities {
  followers: FollowerSnapshot[];
  ruins: RuinSnapshot[];
  relics: RelicSnapshot[];
}

const FOLLOWER_KINDS_WEIGHTED: ReadonlyArray<{ kind: FollowerKind; weight: number }> = [
  { kind: 'wanderer', weight: 6 },
  { kind: 'lantern-bearer', weight: 2 },
  { kind: 'beast', weight: 1 },
];

function pickKind(rng: Rng): FollowerKind {
  const total = FOLLOWER_KINDS_WEIGHTED.reduce((acc, k) => acc + k.weight, 0);
  let pick = rng() * total;
  for (const entry of FOLLOWER_KINDS_WEIGHTED) {
    pick -= entry.weight;
    if (pick <= 0) return entry.kind;
  }
  return 'wanderer';
}

function pickPositionInZone(rng: Rng, zone: Zone): { x: number; y: number; z: number } {
  let inner = 0;
  let outer = ZONE_BANDS[ZONE_BANDS.length - 1]!.maxRadius;
  for (let i = 0; i < ZONE_BANDS.length; i++) {
    if (ZONE_BANDS[i]!.zone === zone) {
      inner = i === 0 ? 8 : ZONE_BANDS[i - 1]!.maxRadius;
      outer = Number.isFinite(ZONE_BANDS[i]!.maxRadius)
        ? ZONE_BANDS[i]!.maxRadius
        : ZONE_BANDS[i - 1]!.maxRadius * 1.4;
      break;
    }
  }
  const t = Math.sqrt(rng());
  const radius = inner + (outer - inner) * t;
  const theta = rng() * Math.PI * 2;
  return {
    x: Math.cos(theta) * radius,
    y: (rng() - 0.5) * 4,
    z: Math.sin(theta) * radius,
  };
}

/** Initial world layout. Followers cluster in grey/deep zones; relics in deep/dead. */
export function generateInitialWorld(seed: number, config: WorldConfig): SpawnEntities {
  const rng = (function makeRng() {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const followers: FollowerSnapshot[] = [];
  const followerZones: Zone[] = ['grey', 'grey', 'grey', 'deep', 'deep', 'dead'];
  for (let i = 0; i < config.followerCap; i++) {
    const zone = followerZones[i % followerZones.length]!;
    followers.push({
      id: `f-${seed.toString(16)}-${i}`,
      kind: pickKind(rng),
      position: pickPositionInZone(rng, zone),
      ownerId: null,
      morale: 0.55 + rng() * 0.3,
    });
  }

  const ruins: RuinSnapshot[] = [];
  const ruinZones: Zone[] = ['grey', 'deep', 'deep', 'dead'];
  for (let i = 0; i < config.ruinCap; i++) {
    const zone = ruinZones[i % ruinZones.length]!;
    ruins.push({
      id: `r-${seed.toString(16)}-${i}`,
      position: pickPositionInZone(rng, zone),
      followerCharge: 2 + Math.floor(rng() * 4),
      activated: false,
    });
  }

  const relics: RelicSnapshot[] = [];
  const relicZones: Zone[] = ['deep', 'dead'];
  for (let i = 0; i < config.relicCap; i++) {
    const zone = relicZones[i % relicZones.length]!;
    relics.push({
      id: `relic-${seed.toString(16)}-${i}`,
      position: pickPositionInZone(rng, zone),
      radiusBonus: 2 + rng() * 4,
      claimed: false,
      claimedBy: null,
    });
  }

  return { followers, ruins, relics };
}
