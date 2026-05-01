/**
 * White Exile world simulation tick.
 *
 * Authoritative loop:
 *   1. snap every player to the dune surface (one pass, used by every later step)
 *   2. compute pre-fuel solo light radius (without caravan combine yet)
 *   3. cluster players into caravans by light overlap
 *   4. claim relics intersected by a fuelled player
 *   5. step fuel + finalise derived state (post-step solo light reuses the
 *      cached origin distance + zone, then post-claim relicBonus)
 *   6. move attached followers toward their owner + panic if dim (also resnaps Y)
 *   7. drain rescue / ruin-activation queues (intents from clients this tick)
 *   8. combat absorption between bright vs dim players (any pair, not just cross-caravan)
 *   9. apply caravan light radius to derived for multi-member groups
 *
 * Static entities (ruins / relics) are snapped once at world generation and at
 * `duneHeightScale` change, so the loop only resnaps the things that actually
 * move (players in pass 1, attached followers in pass 6).
 *
 * Result is a per-player + per-entity dictionary the network layer broadcasts.
 * Pure functions where possible so tests exercise math without sockets.
 */
import {
  classifyZone,
  computeSoloLightRadius,
  distanceSquared3,
  pickFollowerKind,
  placementSurfaceY,
  RACE_PROFILES,
  stepFuel,
  type AshDuneSampleOptions,
  type CaravanSnapshot,
  type FollowerKind,
  type FollowerSnapshot,
  type Race,
  type RelicSnapshot,
  type RuinSnapshot,
  type Vec3,
  type WorldConfig,
  type WorldPlacementKind,
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
const RUIN_RANGE = 6;
const RUIN_RANGE_SQ = RUIN_RANGE * RUIN_RANGE;
const RELIC_CLAIM_RANGE_SQ = 4 * 4;
/** XZ jitter (m) around an activated ruin when spilling its follower charge. */
const RUIN_SPAWN_JITTER = 6;

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

function distSq(a: Vec3, b: Vec3): number {
  return distanceSquared3(a.x, a.y, a.z, b.x, b.y, b.z);
}

/** Resnap an entity's Y to the live dune surface for its placement kind. */
function snapY(
  e: { position: Vec3 },
  kind: WorldPlacementKind,
  simT: number,
  opts: AshDuneSampleOptions,
): void {
  e.position.y = placementSurfaceY(kind, e.position.x, e.position.z, simT, opts);
}

interface SoloCache {
  /** Pre-fuel-step solo radius (used for caravan clustering + rescue range + combat). */
  preFuel: number;
  distFromOrigin: number;
  zone: Zone;
}

function buildSoloCache(p: SimPlayer): SoloCache {
  const distFromOrigin = Math.hypot(p.position.x, p.position.y, p.position.z);
  const preFuel = computeSoloLightRadius({
    race: p.race,
    followers: p.followers,
    relicBonus: p.relicBonus,
    fuel: p.fuel,
    distanceFromOrigin: distFromOrigin,
  });
  return { preFuel, distFromOrigin, zone: classifyZone(distFromOrigin) };
}

export function tickWorld(
  world: SimWorld,
  queues: SimQueues,
  dt: number,
  logger: Logger,
  simulationTimeSec: number,
): SimResult {
  const derived = new Map<string, SimDerivedPlayer>();
  const duneOpts: AshDuneSampleOptions = { heightScale: world.config.duneHeightScale };
  const playerArr = [...world.players.values()];

  // Pass 1: snap every player's Y to the live dune surface so all later
  // distance / overlap math uses consistent coordinates.
  for (const p of playerArr) snapY(p, 'player', simulationTimeSec, duneOpts);

  // Pass 2: pre-fuel solo light radius + zone (cached for the whole tick).
  const solo = new Map<string, SoloCache>();
  const clusterMembers: ClusterMember[] = new Array(playerArr.length);
  for (let i = 0; i < playerArr.length; i++) {
    const p = playerArr[i]!;
    const c = buildSoloCache(p);
    solo.set(p.id, c);
    clusterMembers[i] = {
      playerId: p.id,
      race: p.race,
      position: p.position,
      soloRadius: c.preFuel,
      followerCount: p.followers.length,
    };
  }

  const { caravanByPlayer, caravans } = buildCaravans(clusterMembers);
  const caravanById = new Map<string, CaravanSnapshot>();
  for (const c of caravans) caravanById.set(c.id, c);

  // Pass 3: claim relics intersected by a player while they have fuel.
  for (const p of playerArr) {
    if (p.fuel < 0.05) continue;
    for (const relic of world.relics.values()) {
      if (relic.claimed) continue;
      if (distSq(p.position, relic.position) > RELIC_CLAIM_RANGE_SQ) continue;
      relic.claimed = true;
      relic.claimedBy = p.id;
      p.relicBonus += relic.radiusBonus;
      logger.info(
        { evt: 'relic.claimed', playerId: p.id, relicId: relic.id, bonus: relic.radiusBonus },
        'relic claimed',
      );
    }
  }

  // Pass 4: step fuel + finalise derived state. Reuses the cached
  // `distFromOrigin` and `zone`; relic claims in pass 3 may have raised
  // `p.relicBonus`, so we recompute solo light here with the post-step fuel
  // and post-claim bonus.
  for (const p of playerArr) {
    const c = solo.get(p.id)!;
    const cid = caravanByPlayer.get(p.id) ?? `c-${p.id}`;
    const caravan = caravanById.get(cid);
    const inRuin = isInsideAnyActiveRuin(p.position, world.ruins);
    const sheltered = caravan && caravan.memberIds.length > 1 ? caravan.lightRadius : 0;
    p.fuel = stepFuel({ fuel: p.fuel, race: p.race, dt, shelteredBy: sheltered, inRuin });
    const post = computeSoloLightRadius({
      race: p.race,
      followers: p.followers,
      relicBonus: p.relicBonus,
      fuel: p.fuel,
      distanceFromOrigin: c.distFromOrigin,
    });
    derived.set(p.id, { id: p.id, lightRadius: post, caravanId: cid, zone: c.zone });
  }

  // Pass 5: move attached followers toward their owners + panic if dim.
  for (const f of world.followers.values()) {
    if (!f.ownerId) continue;
    const owner = world.players.get(f.ownerId);
    if (!owner) {
      f.ownerId = null;
      continue;
    }
    const target = jitterAround(owner.position, owner.id, f.id, simulationTimeSec, duneOpts);
    f.position = lerp3(f.position, target, Math.min(1, dt * FOLLOW_LERP));
    snapY(f, 'follower', simulationTimeSec, duneOpts);
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

  // Pass 6: rescue intents — attach the nearest stranded follower inside light.
  let rescuesGranted = 0;
  for (const intent of queues.rescues) {
    const player = world.players.get(intent.playerId);
    if (!player) continue;
    const playerLight = solo.get(player.id)?.preFuel ?? 0;
    let target: FollowerSnapshot | undefined;
    if (intent.followerId) {
      target = world.followers.get(intent.followerId);
      if (!target || target.ownerId !== null) continue;
    } else {
      let bestSq = Infinity;
      for (const f of world.followers.values()) {
        if (f.ownerId !== null) continue;
        const sq = distSq(player.position, f.position);
        if (sq < bestSq) {
          bestSq = sq;
          target = f;
        }
      }
    }
    if (!target) continue;
    if (distSq(player.position, target.position) > playerLight * playerLight) continue;
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

  // Pass 7: ruin activations — flip ruin and spill its follower charge.
  let ruinsActivated = 0;
  for (const intent of queues.ruinActivations) {
    const player = world.players.get(intent.playerId);
    const ruin = world.ruins.get(intent.ruinId);
    if (!player || !ruin || ruin.activated) continue;
    if (distSq(player.position, ruin.position) > RUIN_RANGE_SQ) continue;
    ruin.activated = true;
    ruinsActivated++;
    for (let i = 0; i < ruin.followerCharge; i++) {
      const id = `f-ruin-${ruin.id}-${i}`;
      const sx = ruin.position.x + (Math.random() - 0.5) * RUIN_SPAWN_JITTER;
      const sz = ruin.position.z + (Math.random() - 0.5) * RUIN_SPAWN_JITTER;
      world.followers.set(id, {
        id,
        kind: pickFollowerKind(Math.random),
        position: {
          x: sx,
          y: placementSurfaceY('follower', sx, sz, simulationTimeSec, duneOpts),
          z: sz,
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

  // Pass 8: combat absorption. Iterate every player pair (regardless of caravan
  // assignment) — if light fields overlap and one is significantly brighter,
  // followers drift toward the stronger light. Same-caravan merge is a feature,
  // not protection from a much-brighter neighbour.
  let combatAbsorptions = 0;
  for (let i = 0; i < playerArr.length; i++) {
    for (let j = i + 1; j < playerArr.length; j++) {
      const pa = playerArr[i]!;
      const pb = playerArr[j]!;
      const ra = solo.get(pa.id)?.preFuel ?? 0;
      const rb = solo.get(pb.id)?.preFuel ?? 0;
      const reach = ra + rb;
      if (distSq(pa.position, pb.position) > reach * reach) continue;
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

  // Pass 9: reflect race-aware caravan radius into derived (overrides solo).
  for (const cv of caravans) {
    if (cv.memberIds.length <= 1) continue;
    for (const id of cv.memberIds) {
      const d = derived.get(id);
      if (d) d.lightRadius = cv.lightRadius;
    }
  }

  return { derived, caravans, combatAbsorptions, rescuesGranted, ruinsActivated };
}

function jitterAround(
  center: Vec3,
  ownerId: string,
  followerId: string,
  simulationTimeSec: number,
  duneOpts: AshDuneSampleOptions,
): Vec3 {
  let h = 2166136261;
  for (const ch of ownerId) h = (h ^ ch.charCodeAt(0)) * 16777619;
  for (const ch of followerId) h = (h ^ ch.charCodeAt(0)) * 16777619;
  const ang = ((h >>> 0) / 4294967296) * Math.PI * 2;
  const r = 1.6 + (((h >>> 8) & 0xff) / 255) * 1.4;
  const tx = center.x + Math.cos(ang) * r;
  const tz = center.z + Math.sin(ang) * r;
  return {
    x: tx,
    y: placementSurfaceY('follower', tx, tz, simulationTimeSec, duneOpts),
    z: tz,
  };
}

function isInsideAnyActiveRuin(pos: Vec3, ruins: Map<string, RuinSnapshot>): boolean {
  for (const r of ruins.values()) {
    if (!r.activated) continue;
    if (distSq(pos, r.position) <= RUIN_RANGE_SQ) return true;
  }
  return false;
}

/** Diagnostic dump for periodic info logs (every ~10s). */
export function summarize(
  world: SimWorld,
  caravans: ReadonlyArray<CaravanSnapshot>,
): {
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
