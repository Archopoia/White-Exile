/**
 * White Exile world simulation tick.
 *
 * Authoritative loop:
 *   1. step fuel for every player (decay alone, recover when sheltered)
 *   2. recompute solo light radius from race/followers/relic bonuses
 *   3. cluster players into caravans by light overlap
 *   4. move attached followers toward their owner
 *   5. resolve combat absorption (stronger caravan absorbs lone bot followers)
 *   6. handle rescue intents queued since last tick
 *   7. handle ruin activations queued since last tick
 *
 * The result is a per-player and per-entity dictionary the network layer
 * snapshots and broadcasts. Pure functions where possible so the test suite
 * exercises the math without spinning up sockets.
 */
import {
  classifyZone,
  computeSoloLightRadius,
  distanceSquared3,
  RACE_PROFILES,
  stepFuel,
  type CaravanSnapshot,
  type FollowerKind,
  type FollowerSnapshot,
  type Race,
  type RelicSnapshot,
  type RuinSnapshot,
  type Vec3,
  type WorldConfig,
  type Zone,
} from '@realtime-room/shared';
import type { Logger } from 'pino';
import { buildCaravans, type ClusterMember } from './caravans.js';

export interface SimPlayer {
  id: string;
  name: string;
  isBot: boolean;
  race: Race;
  position: Vec3;
  /** Per-player followers physically attached. */
  followers: Array<{ id: string; kind: FollowerKind; position: Vec3; morale: number }>;
  /** 0..1. */
  fuel: number;
  /** Sum of `radiusBonus` from relics this player has claimed. */
  relicBonus: number;
}

export interface SimDerivedPlayer {
  id: string;
  lightRadius: number;
  caravanId: string;
  zone: Zone;
}

export interface SimWorld {
  players: Map<string, SimPlayer>;
  followers: Map<string, FollowerSnapshot>;
  ruins: Map<string, RuinSnapshot>;
  relics: Map<string, RelicSnapshot>;
  config: WorldConfig;
}

export interface SimQueues {
  rescues: Array<{ playerId: string; followerId?: string }>;
  ruinActivations: Array<{ playerId: string; ruinId: string }>;
}

export interface SimResult {
  derived: Map<string, SimDerivedPlayer>;
  caravans: CaravanSnapshot[];
  combatAbsorptions: number;
  rescuesGranted: number;
  ruinsActivated: number;
}

const FOLLOW_LERP = 4.0;
const RESCUE_RANGE_SCALE = 1.0;
const RUIN_RANGE = 6;

export function newSimQueues(): SimQueues {
  return { rescues: [], ruinActivations: [] };
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared3(a.x, a.y, a.z, b.x, b.y, b.z));
}

export function tickWorld(
  world: SimWorld,
  queues: SimQueues,
  dt: number,
  logger: Logger,
): SimResult {
  const derived = new Map<string, SimDerivedPlayer>();
  const clusterMembers: ClusterMember[] = [];

  const playerArr = [...world.players.values()];

  // Pass 1: solo light radius (without caravan combine yet).
  const tempSolo = new Map<string, number>();
  for (const p of playerArr) {
    const distOrigin = Math.sqrt(p.position.x ** 2 + p.position.y ** 2 + p.position.z ** 2);
    const solo = computeSoloLightRadius({
      race: p.race,
      followers: p.followers,
      relicBonus: p.relicBonus,
      fuel: p.fuel,
      distanceFromOrigin: distOrigin,
    });
    tempSolo.set(p.id, solo);
  }

  // Pass 2: build caravans.
  for (const p of playerArr) {
    clusterMembers.push({
      playerId: p.id,
      race: p.race,
      position: p.position,
      soloRadius: tempSolo.get(p.id) ?? 0,
      followerCount: p.followers.length,
    });
  }
  const { caravanByPlayer, caravans } = buildCaravans(clusterMembers);

  // Pass 3: claim relics intersected by player while they have fuel.
  for (const p of playerArr) {
    if (p.fuel < 0.05) continue;
    for (const relic of world.relics.values()) {
      if (relic.claimed) continue;
      const dist = distance(p.position, relic.position);
      if (dist <= 4) {
        relic.claimed = true;
        relic.claimedBy = p.id;
        p.relicBonus += relic.radiusBonus;
        logger.info(
          { evt: 'relic.claimed', playerId: p.id, relicId: relic.id, bonus: relic.radiusBonus },
          'relic claimed',
        );
      }
    }
  }

  // Pass 4: step fuel, classify zone, finalise derived state.
  for (const p of playerArr) {
    const distOrigin = Math.sqrt(p.position.x ** 2 + p.position.y ** 2 + p.position.z ** 2);
    const cid = caravanByPlayer.get(p.id) ?? `c-${p.id}`;
    const caravan = caravans.find((c) => c.id === cid);
    const inRuin = isInsideAnyActiveRuin(p.position, world.ruins);
    const sheltered = caravan ? caravan.lightRadius : 0;
    p.fuel = stepFuel({
      fuel: p.fuel,
      race: p.race,
      dt,
      shelteredBy: caravan && caravan.memberIds.length > 1 ? sheltered : 0,
      inRuin,
    });
    const distFromOriginAfter = distOrigin;
    const zone = classifyZone(distFromOriginAfter);
    derived.set(p.id, {
      id: p.id,
      lightRadius: tempSolo.get(p.id) ?? 0,
      caravanId: cid,
      zone,
    });
  }

  // Pass 5: move attached followers toward their owners + panic if dim.
  for (const f of world.followers.values()) {
    if (!f.ownerId) continue;
    const owner = world.players.get(f.ownerId);
    if (!owner) {
      f.ownerId = null;
      continue;
    }
    const target = jitterAround(owner.position, owner.id, f.id, world);
    f.position = lerp3(f.position, target, Math.min(1, dt * FOLLOW_LERP));
    if (owner.fuel < 0.15) f.morale = Math.max(0, f.morale - dt * 0.3);
    else f.morale = Math.min(1, f.morale + dt * 0.05);
    if (f.morale < 0.05) {
      logger.info(
        { evt: 'follower.lost', playerId: owner.id, followerId: f.id },
        'follower fled',
      );
      f.ownerId = null;
    }
  }

  // Pass 6: rescue intents - attach the nearest stranded follower inside light.
  let rescuesGranted = 0;
  for (const intent of queues.rescues) {
    const player = world.players.get(intent.playerId);
    if (!player) continue;
    const playerLight = tempSolo.get(player.id) ?? 0;
    let target: FollowerSnapshot | undefined;
    if (intent.followerId) {
      target = world.followers.get(intent.followerId);
      if (!target || target.ownerId !== null) continue;
    } else {
      let bestSq = Infinity;
      for (const f of world.followers.values()) {
        if (f.ownerId !== null) continue;
        const sq = distanceSquared3(
          player.position.x,
          player.position.y,
          player.position.z,
          f.position.x,
          f.position.y,
          f.position.z,
        );
        if (sq < bestSq) {
          bestSq = sq;
          target = f;
        }
      }
    }
    if (!target) continue;
    const dist = distance(player.position, target.position);
    if (dist > playerLight * RESCUE_RANGE_SCALE) continue;
    target.ownerId = player.id;
    target.morale = Math.min(1, target.morale + 0.2);
    player.followers.push({
      id: target.id,
      kind: target.kind,
      position: target.position,
      morale: target.morale,
    });
    rescuesGranted++;
    logger.info(
      {
        evt: 'follower.rescued',
        playerId: player.id,
        followerId: target.id,
        kind: target.kind,
        followerCount: player.followers.length,
      },
      'follower rescued',
    );
  }
  queues.rescues.length = 0;

  // Pass 7: ruin activations - flip ruin and spill its follower charge.
  let ruinsActivated = 0;
  for (const intent of queues.ruinActivations) {
    const player = world.players.get(intent.playerId);
    const ruin = world.ruins.get(intent.ruinId);
    if (!player || !ruin || ruin.activated) continue;
    if (distance(player.position, ruin.position) > RUIN_RANGE) continue;
    ruin.activated = true;
    ruinsActivated++;
    for (let i = 0; i < ruin.followerCharge; i++) {
      const id = `f-ruin-${ruin.id}-${i}`;
      world.followers.set(id, {
        id,
        kind: i % 4 === 0 ? 'lantern-bearer' : 'wanderer',
        position: {
          x: ruin.position.x + (Math.random() - 0.5) * 6,
          y: ruin.position.y,
          z: ruin.position.z + (Math.random() - 0.5) * 6,
        },
        ownerId: null,
        morale: 0.65,
      });
    }
    logger.info(
      {
        evt: 'ruin.activated',
        playerId: player.id,
        ruinId: ruin.id,
        spawned: ruin.followerCharge,
      },
      'ruin activated',
    );
  }
  queues.ruinActivations.length = 0;

  // Pass 8: combat absorption. Iterate player pairs (regardless of caravan
  // assignment) - if light fields overlap and one is significantly brighter,
  // followers drift toward the stronger light. Same-caravan merge is a feature,
  // not protection from a much-brighter neighbour.
  let combatAbsorptions = 0;
  for (let i = 0; i < playerArr.length; i++) {
    for (let j = i + 1; j < playerArr.length; j++) {
      const pa = playerArr[i]!;
      const pb = playerArr[j]!;
      const ra = tempSolo.get(pa.id) ?? 0;
      const rb = tempSolo.get(pb.id) ?? 0;
      const dist = distance(pa.position, pb.position);
      if (dist > ra + rb) continue;
      const ratio = Math.max(ra, rb) / Math.max(1, Math.min(ra, rb));
      if (ratio < 1.25) continue;
      const stronger = ra >= rb ? pa : pb;
      const weaker = stronger === pa ? pb : pa;
      const drainBase = 0.04 * dt * Math.min(2, ratio);
      weaker.fuel = Math.max(0, weaker.fuel - drainBase);
      if (weaker.followers.length === 0) continue;
      const stealChance = Math.min(1, dt * 0.6 * Math.min(2, ratio));
      if (Math.random() >= stealChance) continue;
      const stolen = weaker.followers.shift();
      if (!stolen) continue;
      stronger.followers.push(stolen);
      const fSnap = world.followers.get(stolen.id);
      if (fSnap) fSnap.ownerId = stronger.id;
      combatAbsorptions++;
      logger.info(
        {
          evt: 'combat.absorbed',
          winnerId: stronger.id,
          loserId: weaker.id,
          followerId: stolen.id,
          winnerLight: Math.max(ra, rb),
          loserLight: Math.min(ra, rb),
        },
        'follower absorbed by stronger light',
      );
    }
  }

  // Reflect race-aware caravan radius into derived (overrides solo).
  for (const cv of caravans) {
    for (const id of cv.memberIds) {
      const d = derived.get(id);
      if (d) d.lightRadius = cv.memberIds.length > 1 ? cv.lightRadius : d.lightRadius;
    }
  }

  return { derived, caravans, combatAbsorptions, rescuesGranted, ruinsActivated };
}

function jitterAround(center: Vec3, ownerId: string, followerId: string, world: SimWorld): Vec3 {
  void world;
  let h = 2166136261;
  for (const ch of ownerId) h = (h ^ ch.charCodeAt(0)) * 16777619;
  for (const ch of followerId) h = (h ^ ch.charCodeAt(0)) * 16777619;
  const ang = (h >>> 0) / 4294967296 * Math.PI * 2;
  const r = 1.6 + (((h >>> 8) & 0xff) / 255) * 1.4;
  return {
    x: center.x + Math.cos(ang) * r,
    y: center.y,
    z: center.z + Math.sin(ang) * r,
  };
}

function isInsideAnyActiveRuin(pos: Vec3, ruins: Map<string, RuinSnapshot>): boolean {
  for (const r of ruins.values()) {
    if (!r.activated) continue;
    if (distance(pos, r.position) <= RUIN_RANGE) return true;
  }
  return false;
}

/** Diagnostic dump for periodic info logs (every ~10s). */
export function summarize(world: SimWorld, caravans: ReadonlyArray<CaravanSnapshot>): {
  players: number;
  caravans: number;
  attachedFollowers: number;
  strandedFollowers: number;
  activatedRuins: number;
  claimedRelics: number;
  raceMix: Record<Race, number>;
} {
  let attached = 0;
  let stranded = 0;
  for (const f of world.followers.values()) {
    if (f.ownerId) attached++;
    else stranded++;
  }
  let activatedRuins = 0;
  for (const r of world.ruins.values()) if (r.activated) activatedRuins++;
  let claimedRelics = 0;
  for (const r of world.relics.values()) if (r.claimed) claimedRelics++;
  const raceMix: Record<Race, number> = { emberfolk: 0, ashborn: 0, 'lumen-kin': 0 };
  for (const p of world.players.values()) raceMix[p.race]++;
  void RACE_PROFILES;
  return {
    players: world.players.size,
    caravans: caravans.length,
    attachedFollowers: attached,
    strandedFollowers: stranded,
    activatedRuins,
    claimedRelics,
    raceMix,
  };
}
