/**
 * CSS2D world label strings for `off` | `keywords` | `full`. Mode `off` returns empty
 * strings; the renderer layer is hidden in `scene.ts`.
 */
import {
  FOLLOWER_KIND_DISPLAY,
  RACE_PROFILES,
  ZONE_DISPLAY_LABEL,
  type FollowerKind,
  type FollowerSnapshot,
  type PlayerSnapshot,
  type Race,
  type RelicSnapshot,
  type RuinSnapshot,
  type Zone,
} from '@realtime-room/shared';
import type { WorldLabelMode } from './tooltips.js';

const NAME_MAX = 22;

function truncateName(name: string): string {
  if (name.length <= NAME_MAX) return name;
  return `${name.slice(0, NAME_MAX - 1)}…`;
}

function raceCode(race: Race): string {
  if (race === 'emberfolk') return 'Em';
  if (race === 'ashborn') return 'As';
  return 'Lu';
}

function zoneKeyword(zone: Zone): string {
  const z = ZONE_DISPLAY_LABEL[zone];
  return z.split(/\s+/)[0] ?? z;
}

function followerKindLetter(kind: FollowerKind): string {
  if (kind === 'lantern-bearer') return 'L';
  if (kind === 'beast') return 'B';
  return 'W';
}

function labelGroundFull(): string {
  return [
    'Ash dune terrain',
    'Walking surface of the exile world. The origin sits in gentler fog; walking outward pushes you into harsher zones and faster fuel drain unless you merge light with other caravans.',
  ].join('\n');
}

function labelYouFull(p: PlayerSnapshot): string {
  const race = RACE_PROFILES[p.race].displayName;
  const zone = ZONE_DISPLAY_LABEL[p.zone];
  const r = Math.round(p.lightRadius);
  return [
    'You (your caravan)',
    `Race: ${race}.`,
    `Zone: ${zone} — rings farther from the origin are darker, riskier, and burn fuel faster unless you shelter in merged light or an active ruin.`,
    `Your light radius is about ${r} units: stranded followers and rescue checks use this bubble.`,
    'Actions — R: rescue a stranded follower while they are inside your light. F: activate the ruin you are closest to. T: cycle world labels (off → keywords → full). Esc: session / room note panel.',
  ].join('\n');
}

function labelYouKeywords(p: PlayerSnapshot): string {
  const r = Math.round(p.lightRadius);
  return [
    `U · Race ${raceCode(p.race)} · Zone ${zoneKeyword(p.zone)} · Light ~${r}`,
    'Act · R rescue · F activate ruin · T cycle labels · Esc menu',
  ].join('\n');
}

function labelOtherPlayerFull(p: PlayerSnapshot): string {
  const name = truncateName(p.name);
  const race = RACE_PROFILES[p.race].displayName;
  const r = Math.round(p.lightRadius);
  const sim = p.id.startsWith('ghost-');
  const bot = p.isBot && !sim;
  const lines: string[] = [`“${name}” — other player`, `Race: ${race}. Their light radius is about ${r}.`];
  if (sim) {
    lines.push(
      'Simulated caravan: the server spawns these “ghost” players so the world feels populated when few humans are online. They are not a real person at a keyboard.',
    );
  } else if (bot) {
    lines.push(
      'Automated bot client: a test or filler process connected over the network, not a human player.',
    );
  }
  return lines.join('\n');
}

function labelOtherPlayerKeywords(p: PlayerSnapshot): string {
  const name = truncateName(p.name);
  const r = Math.round(p.lightRadius);
  const sim = p.id.startsWith('ghost-');
  const bot = p.isBot && !sim;
  const kind = sim ? 'Sim' : bot ? 'Bot' : 'Player';
  return `P ${name} · Race ${raceCode(p.race)} · Light ~${r} · Kind ${kind}`;
}

function labelFollowerFull(f: FollowerSnapshot): string {
  const kind = FOLLOWER_KIND_DISPLAY[f.kind];
  const moraleLine =
    f.morale < 0.42
      ? 'Morale is low — they are panicking and may flee back into the fog if their owner stays dim too long.'
      : 'Morale is stable while their owner keeps fuel up.';
  if (f.ownerId === null) {
    return [
      `${kind} follower (stranded)`,
      'No caravan owns them yet. Move your light bubble over them, then press R to rescue and attach them to your caravan.',
    ].join('\n');
  }
  return [
    `${kind} follower (kin)`,
    'Already rescued: they trail the player who owns them. If that player’s fuel collapses for long enough, morale drops and they can desert.',
    moraleLine,
  ].join('\n');
}

function labelFollowerKeywords(f: FollowerSnapshot): string {
  const letter = followerKindLetter(f.kind);
  const pct = Math.round(f.morale * 100);
  if (f.ownerId === null) {
    return `Follower ${letter} · Stray · R rescue · Morale ${pct}%`;
  }
  return `Follower ${letter} · Kin · Morale ${pct}%`;
}

function labelRuinFull(r: RuinSnapshot): string {
  if (r.activated) {
    return [
      'Ancient ruin (activated)',
      'This ruin has already been opened. Its follower charge was released into the world when someone pressed F while standing near it.',
    ].join('\n');
  }
  const charge =
    r.followerCharge === 1
      ? '1 stranded follower is tied to it.'
      : `${r.followerCharge} stranded followers are tied to it.`;
  return [
    'Ancient ruin (inactive pillar)',
    `Standing near this pillar and pressing F activates the ruin. ${charge} Activating also widens usable light in the immediate area.`,
  ].join('\n');
}

function labelRuinKeywords(r: RuinSnapshot): string {
  const state = r.activated ? 'On' : 'Off';
  return `Ruin · State ${state} · F activate · Charge ${r.followerCharge}`;
}

function labelRelicFull(r: RelicSnapshot): string {
  const bonus = r.radiusBonus;
  if (r.claimed) {
    return [
      'Relic orb (claimed)',
      'Another caravan already claimed this relic. The light-radius bonus follows whoever holds the claim.',
    ].join('\n');
  }
  return [
    'Relic orb (available)',
    `Move your caravan through it with enough fuel to pick it up. Claiming adds +${bonus} to your solo light radius until the run ends or rules change it.`,
    'There is no separate key — proximity and fuel gate the claim.',
  ].join('\n');
}

function labelRelicKeywords(r: RelicSnapshot): string {
  const st = r.claimed ? 'Claimed' : 'Open';
  return `Relic · ${st} · +${r.radiusBonus} radius · Walk / fuel to claim`;
}

export function labelGround(mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return 'Ground · Ash dunes · Farther out = heavier fog & faster fuel drain';
  return labelGroundFull();
}

export function labelYou(p: PlayerSnapshot, mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelYouKeywords(p);
  return labelYouFull(p);
}

export function labelOtherPlayer(p: PlayerSnapshot, mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelOtherPlayerKeywords(p);
  return labelOtherPlayerFull(p);
}

export function labelFollower(f: FollowerSnapshot, mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelFollowerKeywords(f);
  return labelFollowerFull(f);
}

export function labelRuin(r: RuinSnapshot, mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelRuinKeywords(r);
  return labelRuinFull(r);
}

export function labelRelic(r: RelicSnapshot, mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelRelicKeywords(r);
  return labelRelicFull(r);
}
