/**
 * Cluster players into caravans based on light-field overlap.
 *
 * Authoritative: a player is in a caravan iff their light overlaps any other
 * member transitively. Caravans are recomputed every tick - cheap because
 * player counts are small and we re-use squared-distance checks.
 */
import {
  combineCaravanRadius,
  lightFieldsOverlap,
  type CaravanLightInput,
  type CaravanSnapshot,
  type Race,
} from '@realtime-room/shared';

export interface ClusterMember extends CaravanLightInput {
  followerCount: number;
}

interface UnionFind {
  parent: number[];
  find(i: number): number;
  union(a: number, b: number): void;
}

function makeUnionFind(n: number): UnionFind {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  return { parent, find, union };
}

export interface CaravanAssignment {
  /** caravanId by playerId */
  caravanByPlayer: Map<string, string>;
  caravans: CaravanSnapshot[];
}

export function buildCaravans(members: ReadonlyArray<ClusterMember>): CaravanAssignment {
  const n = members.length;
  const caravanByPlayer = new Map<string, string>();
  if (n === 0) return { caravanByPlayer, caravans: [] };

  const uf = makeUnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = members[i]!;
      const b = members[j]!;
      if (
        lightFieldsOverlap(
          { x: a.position.x, y: a.position.y, z: a.position.z, radius: a.soloRadius },
          { x: b.position.x, y: b.position.y, z: b.position.z, radius: b.soloRadius },
        )
      ) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }

  const caravans: CaravanSnapshot[] = [];
  for (const indices of groups.values()) {
    const groupMembers = indices.map((i) => members[i]!);
    let leaderIdx = indices[0]!;
    for (const i of indices) {
      if (members[i]!.soloRadius > members[leaderIdx]!.soloRadius) leaderIdx = i;
    }
    const leaderId = members[leaderIdx]!.playerId;
    const caravanId = `c-${leaderId}`;
    const lightRadius = combineCaravanRadius(
      groupMembers.map((m) => ({
        playerId: m.playerId,
        race: m.race,
        position: m.position,
        soloRadius: m.soloRadius,
      })),
    );
    let followerCount = 0;
    for (const m of groupMembers) followerCount += m.followerCount;
    const memberIds = groupMembers.map((m) => m.playerId);
    for (const m of groupMembers) caravanByPlayer.set(m.playerId, caravanId);
    caravans.push({
      id: caravanId,
      leaderId,
      memberIds,
      lightRadius,
      followerCount,
    });
  }

  return { caravanByPlayer, caravans };
}

/** Convenience for single-player default caravan (when no clusters). */
export function singletonCaravan(
  playerId: string,
  race: Race,
  lightRadius: number,
  followerCount: number,
): CaravanSnapshot {
  void race;
  return {
    id: `c-${playerId}`,
    leaderId: playerId,
    memberIds: [playerId],
    lightRadius,
    followerCount,
  };
}
