/**
 * Procedural spawn for stranded followers, ruins, and relics.
 *
 * Seeded so the layout is identical across server restarts (the persistence
 * layer carries the seed forward); spawn caps live in `WorldConfig`.
 */
import {
  pickFollowerKind,
  placementSurfaceY,
  ZONE_BANDS,
  type FollowerSnapshot,
  type RelicSnapshot,
  type RuinSnapshot,
  type WorldConfig,
  type WorldPlacementKind,
  type Zone,
} from '@realtime-room/shared';
import type { Rng } from './rng.js';

interface SpawnEntities {
  followers: FollowerSnapshot[];
  ruins: RuinSnapshot[];
  relics: RelicSnapshot[];
}

function pickPositionInZone(
  rng: Rng,
  zone: Zone,
  placement: WorldPlacementKind,
  config: WorldConfig,
): { x: number; y: number; z: number } {
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
  const x = Math.cos(theta) * radius;
  const z = Math.sin(theta) * radius;
  return { x, y: placementSurfaceY(placement, x, z, 0, { heightScale: config.duneHeightScale }), z };
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
      kind: pickFollowerKind(rng),
      position: pickPositionInZone(rng, zone, 'follower', config),
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
      position: pickPositionInZone(rng, zone, 'ruin', config),
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
      position: pickPositionInZone(rng, zone, 'relic', config),
      radiusBonus: 2 + rng() * 4,
      claimed: false,
      claimedBy: null,
    });
  }

  return { followers, ruins, relics };
}
