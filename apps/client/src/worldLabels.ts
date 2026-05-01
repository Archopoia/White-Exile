/**
 * CSS2D world label strings for `off` | `keywords` | `full`. Mode `off` returns empty
 * strings; the renderer layer is hidden in `scene.ts`.
 *
 * Lines are prefixed with Unicode shapes / a few emoji (race, role, ruin, relic) for
 * quick visual scan; prose still carries meaning. Session (**Esc**) holds controls.
 *
 * Keyboard hints (R / F) are only appended when the player is close enough; see
 * {@link LabelProximity}.
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
} from '@realtime-room/shared';
import type { WorldLabelMode } from './tooltips.js';

/** Matches ruin activation range used for F targeting in `scene.ts`. */
export const RUIN_LABEL_HINT_RADIUS = 6;

export interface LabelProximity {
  distSqToLocal: number;
  localLightRadius: number;
}

const NAME_MAX = 22;

/** Line-leading shapes / emoji for scan memory; text stays the source of truth. */
function raceGlyph(race: Race): string {
  if (race === 'emberfolk') return '◉';
  if (race === 'ashborn') return '◈';
  return '⋄';
}

function followerKindGlyph(kind: FollowerKind): string {
  if (kind === 'wanderer') return '∿';
  if (kind === 'lantern-bearer') return '✧';
  return '▶';
}

function moraleGlyph(morale: number): string {
  return morale < 0.42 ? '♡' : '♥';
}

function truncateName(name: string): string {
  if (name.length <= NAME_MAX) return name;
  return `${name.slice(0, NAME_MAX - 1)}…`;
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
    '≋ Ash dune terrain',
    'Walking surface of the exile world. The origin sits in gentler fog; walking outward pushes you into harsher zones and faster fuel drain unless you merge light with other caravans.',
  ].join('\n');
}

function labelYouFull(p: PlayerSnapshot): string {
  const race = RACE_PROFILES[p.race].displayName;
  const zone = ZONE_DISPLAY_LABEL[p.zone];
  const r = Math.round(p.lightRadius);
  return [
    '◎ You (your caravan)',
    `${raceGlyph(p.race)} Race: ${race}.`,
    `⬡ Zone: ${zone} — rings farther from the origin are darker, riskier, and burn fuel faster unless you shelter in merged light or an active ruin.`,
    `✦ Your light radius is about ${r} units: stranded followers and rescue checks use this bubble.`,
  ].join('\n');
}

function labelYouKeywords(p: PlayerSnapshot): string {
  const race = RACE_PROFILES[p.race].displayName;
  const zone = ZONE_DISPLAY_LABEL[p.zone];
  const r = Math.round(p.lightRadius);
  return [
    '◎ You',
    `${raceGlyph(p.race)} Race: ${race}`,
    `⬡ Zone: ${zone}`,
    `✦ Light radius ~${r}`,
  ].join('\n');
}

function labelOtherPlayerFull(p: PlayerSnapshot): string {
  const name = truncateName(p.name);
  const race = RACE_PROFILES[p.race].displayName;
  const r = Math.round(p.lightRadius);
  const sim = p.id.startsWith('ghost-');
  const bot = p.isBot && !sim;
  const lines: string[] = [
    `◇ “${name}” — other player`,
    `${raceGlyph(p.race)} Race: ${race}. Their light radius is about ${r}.`,
  ];
  if (sim) {
    lines.push(
      '👻 Simulated caravan: the server spawns these “ghost” players so the world feels populated when few humans are online. They are not a real person at a keyboard.',
    );
  } else if (bot) {
    lines.push(
      '🤖 Automated bot client: a test or filler process connected over the network, not a human player.',
    );
  }
  return lines.join('\n');
}

function labelOtherPlayerKeywords(p: PlayerSnapshot): string {
  const name = truncateName(p.name);
  const race = RACE_PROFILES[p.race].displayName;
  const r = Math.round(p.lightRadius);
  const sim = p.id.startsWith('ghost-');
  const bot = p.isBot && !sim;
  const role = sim ? '👻 Simulated caravan (not a human)' : bot ? '🤖 Network bot' : '○ Human player';
  return [
    `◇ ${name}`,
    `${raceGlyph(p.race)} Race: ${race}`,
    `✦ Light radius ~${r}`,
    role,
  ].join('\n');
}

function labelFollowerFull(f: FollowerSnapshot, prox?: LabelProximity): string {
  const kind = FOLLOWER_KIND_DISPLAY[f.kind];
  const moraleLine =
    f.morale < 0.42
      ? 'Morale is low — they are panicking and may flee back into the fog if their owner stays dim too long.'
      : 'Morale is stable while their owner keeps fuel up.';
  if (f.ownerId === null) {
    let body = [
      `⚠ ${followerKindGlyph(f.kind)} ${kind} follower (stranded)`,
      'No caravan owns them yet. Move your light bubble over them to recruit them into your caravan.',
    ].join('\n');
    if (inRescueLight(prox)) body = appendIfMissing(body, '▸ In your light: press R to rescue');
    return body;
  }
  return [
    `${followerKindGlyph(f.kind)} ${kind} follower (with a caravan)`,
    'Already rescued: they trail the player who owns them. If that player’s fuel collapses for long enough, morale drops and they can desert.',
    `${moraleGlyph(f.morale)} ${moraleLine}`,
  ].join('\n');
}

function labelFollowerKeywords(f: FollowerSnapshot, prox?: LabelProximity): string {
  const kind = FOLLOWER_KIND_DISPLAY[f.kind];
  const pct = Math.round(f.morale * 100);
  if (f.ownerId === null) {
    let body = [
      `⚠ ${followerKindGlyph(f.kind)} ${kind} · Stranded (no owner yet)`,
      `${moraleGlyph(f.morale)} Morale ${pct}%`,
    ].join('\n');
    if (inRescueLight(prox)) body = appendIfMissing(body, '▸ In your light: press R to rescue');
    return body;
  }
  return [
    `${followerKindGlyph(f.kind)} ${kind} · With a caravan`,
    `${moraleGlyph(f.morale)} Morale ${pct}%`,
  ].join('\n');
}

function labelRuinFull(r: RuinSnapshot, prox?: LabelProximity): string {
  if (r.activated) {
    return [
      '✓ ⌂ Ancient ruin (activated)',
      'This ruin has already been opened. Its follower charge was released into the world when it was activated from nearby.',
    ].join('\n');
  }
  const charge =
    r.followerCharge === 1
      ? '1 stranded follower is tied to it.'
      : `${r.followerCharge} stranded followers are tied to it.`;
  let body = [
    '⌂ Ancient ruin (inactive pillar)',
    `Standing near this pillar activates the ruin. ${charge} Activating also widens usable light in the immediate area.`,
  ].join('\n');
  if (inRuinHintRange(prox)) body = appendIfMissing(body, '▸ Close enough: press F to activate');
  return body;
}

function labelRuinKeywords(r: RuinSnapshot, prox?: LabelProximity): string {
  const head = r.activated ? '✓ ⌂ Ruin · Already activated' : '⌂ Ruin · Not activated yet';
  let body = [head, `⊕ Stranded followers tied here: ${r.followerCharge}`].join('\n');
  if (!r.activated && inRuinHintRange(prox)) body = appendIfMissing(body, '▸ Close enough: press F to activate');
  return body;
}

function labelRelicFull(r: RelicSnapshot): string {
  const bonus = r.radiusBonus;
  if (r.claimed) {
    return [
      '✓ ◆ Relic orb (claimed)',
      'Another caravan already claimed this relic. The light-radius bonus follows whoever holds the claim.',
    ].join('\n');
  }
  return [
    '◆ Relic orb (available)',
    `Move your caravan through it with enough fuel to pick it up. Claiming adds +${bonus} to your solo light radius until the run ends or rules change it.`,
  ].join('\n');
}

function labelRelicKeywords(r: RelicSnapshot): string {
  const head = r.claimed ? '✓ ◆ Relic · Already claimed' : '◆ Relic · Available';
  return [head, `✦ Light radius bonus +${r.radiusBonus}`, '➤ Pass through with fuel to claim'].join('\n');
}

export function labelGround(mode: WorldLabelMode): string {
  if (mode === 'off') return '';
  if (mode === 'keywords') {
    return [
      '≋ Walkable ash dunes',
      '▒ Farther from the center: heavier fog',
      '✦ Fuel drains faster unless you share light or use a ruin',
    ].join('\n');
  }
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
