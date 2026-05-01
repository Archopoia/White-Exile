import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { DEFAULT_WORLD_CONFIG, RACE_PROFILES } from '@realtime-room/shared';
import {
  newSimQueues,
  tickWorld,
  type SimPlayer,
  type SimWorld,
} from './sim.js';
import { generateInitialWorld } from './spawn.js';

const silent = pino({ level: 'silent' });

function makeWorld(): SimWorld {
  const initial = generateInitialWorld(7, DEFAULT_WORLD_CONFIG);
  const followers = new Map(initial.followers.map((f) => [f.id, f]));
  const ruins = new Map(initial.ruins.map((r) => [r.id, r]));
  const relics = new Map(initial.relics.map((r) => [r.id, r]));
  return {
    players: new Map(),
    followers,
    ruins,
    relics,
    config: { ...DEFAULT_WORLD_CONFIG },
  };
}

function addPlayer(world: SimWorld, p: Partial<SimPlayer> & { id: string }): SimPlayer {
  const player: SimPlayer = {
    id: p.id,
    name: p.name ?? p.id,
    isBot: p.isBot ?? false,
    race: p.race ?? 'emberfolk',
    position: p.position ?? { x: 0, y: 0, z: 0 },
    fuel: p.fuel ?? 0.9,
    relicBonus: p.relicBonus ?? 0,
    followers: p.followers ?? [],
  };
  world.players.set(p.id, player);
  return player;
}

describe('tickWorld - caravan formation', () => {
  it('clusters two close emberfolk into one caravan', () => {
    const world = makeWorld();
    addPlayer(world, { id: 'a', position: { x: 0, y: 0, z: 0 } });
    addPlayer(world, { id: 'b', position: { x: 4, y: 0, z: 0 } });
    const result = tickWorld(world, newSimQueues(), 0.1, silent);
    expect(result.caravans.length).toBe(1);
    expect(result.caravans[0]?.memberIds.sort()).toEqual(['a', 'b']);
  });

  it('keeps far players in separate singleton caravans', () => {
    const world = makeWorld();
    addPlayer(world, { id: 'a', position: { x: 0, y: 0, z: 0 } });
    addPlayer(world, { id: 'b', position: { x: 200, y: 0, z: 0 } });
    const result = tickWorld(world, newSimQueues(), 0.1, silent);
    expect(result.caravans.length).toBe(2);
  });
});

describe('tickWorld - rescue intent', () => {
  it('attaches a stranded follower inside the player light', () => {
    const world = makeWorld();
    addPlayer(world, { id: 'me', position: { x: 0, y: 0, z: 0 } });
    const f = [...world.followers.values()][0]!;
    f.position = { x: 1, y: 0, z: 0 };
    f.ownerId = null;
    const queues = newSimQueues();
    queues.rescues.push({ playerId: 'me' });
    const result = tickWorld(world, queues, 0.1, silent);
    expect(result.rescuesGranted).toBe(1);
    expect(world.followers.get(f.id)?.ownerId).toBe('me');
    const me = world.players.get('me')!;
    expect(me.followers.length).toBe(1);
  });

  it('does not rescue followers outside light radius', () => {
    const world = makeWorld();
    addPlayer(world, { id: 'me', position: { x: 0, y: 0, z: 0 }, fuel: 1 });
    const f = [...world.followers.values()][0]!;
    f.position = { x: 200, y: 0, z: 0 };
    f.ownerId = null;
    const queues = newSimQueues();
    queues.rescues.push({ playerId: 'me' });
    const result = tickWorld(world, queues, 0.1, silent);
    expect(result.rescuesGranted).toBe(0);
  });
});

describe('tickWorld - combat absorption', () => {
  it('a much stronger caravan steals followers from a weaker one over time', () => {
    const world = makeWorld();
    const strong = addPlayer(world, {
      id: 'strong',
      position: { x: 0, y: 0, z: 0 },
      relicBonus: 30,
      fuel: 1,
    });
    const weak = addPlayer(world, {
      id: 'weak',
      position: { x: 6, y: 0, z: 0 },
      fuel: 1,
    });
    weak.followers.push({
      id: 'fake-follower',
      kind: 'wanderer',
      position: { x: 6, y: 0, z: 0 },
      morale: 1,
    });
    world.followers.set('fake-follower', {
      id: 'fake-follower',
      kind: 'wanderer',
      position: { x: 6, y: 0, z: 0 },
      ownerId: 'weak',
      morale: 1,
    });
    let absorbed = 0;
    let safety = 0;
    while (absorbed === 0 && safety++ < 200) {
      const r = tickWorld(world, newSimQueues(), 0.5, silent);
      absorbed += r.combatAbsorptions;
    }
    expect(absorbed).toBeGreaterThan(0);
    expect(strong.followers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('tickWorld - relic claim', () => {
  it('grants relicBonus when the player walks through an unclaimed relic', () => {
    const world = makeWorld();
    const relic = [...world.relics.values()][0]!;
    addPlayer(world, { id: 'me', position: relic.position, fuel: 1 });
    const me = world.players.get('me')!;
    expect(me.relicBonus).toBe(0);
    tickWorld(world, newSimQueues(), 0.1, silent);
    expect(me.relicBonus).toBeCloseTo(relic.radiusBonus, 5);
    expect(world.relics.get(relic.id)?.claimed).toBe(true);
  });
});

describe('race profiles round trip', () => {
  it('every race exposes a valid profile', () => {
    expect(RACE_PROFILES.emberfolk.baseLightRadius).toBeGreaterThan(0);
    expect(RACE_PROFILES.ashborn.fuelDecayMul).toBeGreaterThan(0);
    expect(RACE_PROFILES['lumen-kin'].lightColor).toBeGreaterThan(0);
  });
});
