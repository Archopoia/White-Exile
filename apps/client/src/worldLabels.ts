/**
 * CSS2D world label strings for `off` | `keywords` | `full`. Mode `off` returns empty
 * strings; the renderer layer is hidden in `scene.ts`.
 *
 * Keyboard hints (R / F) are only appended when the player is close enough; see
 * {@link LabelProximity}. Session (**Esc**) holds the full control list.
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

/** Matches ruin activation range used for F targeting in `scene.ts`. */
export const RUIN_LABEL_HINT_RADIUS = 6;

export interface LabelProximity {
  distSqToLocal: number;
  localLightRadius: number;
}

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

function inRescueLight(prox: LabelProximity | undefined): boolean {
  if (!prox) return false;
  const r = prox.localLightRadius;
  return prox.distSqToLocal <= r * r;
}

function inRuinHintRange(prox: LabelProximity | undefined): boolean {
  if (!prox) return false;
  const r = RUIN_LABEL_HINT_RADIUS;
  return prox.distSqToLocal <= r * r;
}

function appendIfMissing(base: string, line: string): string {
  if (base.includes(line)) return base;
  return `${base}\n${line}`;
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
  ].join('\n');
}

function labelYouKeywords(p: PlayerSnapshot): string {
  const r = Math.round(p.lightRadius);
  return `U · Race ${raceCode(p.race)} · Zone ${zoneKeyword(p.zone)} · Light ~${r}`;
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

function labelFollowerFull(f: FollowerSnapshot, prox?: LabelProximity): string {
  const kind = FOLLOWER_KIND_DISPLAY[f.kind];
  const moraleLine =
    f.morale < 0.42
      ? 'Morale is low — they are panicking and may flee back into the fog if their owner stays dim too long.'
      : 'Morale is stable while their owner keeps fuel up.';
  if (f.ownerId === null) {
    let body = [
      `${kind} follower (stranded)`,
      'No caravan owns them yet. Move your light bubble over them to recruit them into your caravan.',
    ].join('\n');
    if (inRescueLight(prox)) body = appendIfMissing(body, 'R — rescue');
    return body;
  }
  return [
    `${kind} follower (kin)`,
    'Already rescued: they trail the player who owns them. If that player’s fuel collapses for long enough, morale drops and they can desert.',
    moraleLine,
  ].join('\n');
}

function labelFollowerKeywords(f: FollowerSnapshot, prox?: LabelProximity): string {
  const letter = followerKindLetter(f.kind);
  const pct = Math.round(f.morale * 100);
  if (f.ownerId === null) {
    let line = `Follower ${letter} · Stray · Morale ${pct}%`;
    if (inRescueLight(prox)) line = appendIfMissing(line, 'R — rescue');
    return line;
  }
  return `Follower ${letter} · Kin · Morale ${pct}%`;
}

function labelRuinFull(r: RuinSnapshot, prox?: LabelProximity): string {
  if (r.activated) {
    return [
      'Ancient ruin (activated)',
      'This ruin has already been opened. Its follower charge was released into the world when it was activated from nearby.',
    ].join('\n');
  }
  const charge =
    r.followerCharge === 1
      ? '1 stranded follower is tied to it.'
      : `${r.followerCharge} stranded followers are tied to it.`;
  let body = [
    'Ancient ruin (inactive pillar)',
    `Standing near this pillar activates the ruin. ${charge} Activating also widens usable light in the immediate area.`,
  ].join('\n');
  if (inRuinHintRange(prox)) body = appendIfMissing(body, 'F — activate');
  return body;
}

function labelRuinKeywords(r: RuinSnapshot, prox?: LabelProximity): string {
  const state = r.activated ? 'On' : 'Off';
  let line = `Ruin · State ${state} · Charge ${r.followerCharge}`;
  if (!r.activated && inRuinHintRange(prox)) line = appendIfMissing(line, 'F — activate');
  return line;
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

export function labelFollower(f: FollowerSnapshot, mode: WorldLabelMode, prox?: LabelProximity): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelFollowerKeywords(f, prox);
  return labelFollowerFull(f, prox);
}

export function labelRuin(r: RuinSnapshot, mode: WorldLabelMode, prox?: LabelProximity): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelRuinKeywords(r, prox);
  return labelRuinFull(r, prox);
}

export function labelRelic(r: RelicSnapshot, mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') return labelRelicKeywords(r);
  return labelRelicFull(r);
}
