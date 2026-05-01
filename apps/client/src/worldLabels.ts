/**
 * CSS2D world label strings for `off` | `keywords` | `full`. Mode `off` returns empty
 * strings; the renderer layer is hidden in `scene.ts`.
 *
 * One pair (keywords, full) per entity kind drives every label. Add a new kind by
 * extending the small lookup tables — no parallel `labelXxxFull` / `labelXxxKeywords`
 * boilerplate. Lines are prefixed with Unicode shapes for quick visual scan; prose
 * still carries meaning. Keyboard hints (R / F) only appear when the player is close
 * enough; see {@link LabelProximity}.
 */
import {
  FOLLOWER_KIND_DEFS,
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

const RACE_GLYPH: Readonly<Record<Race, string>> = Object.freeze({
  emberfolk: '◉',
  ashborn: '◈',
  'lumen-kin': '⋄',
});

function followerKindGlyph(kind: FollowerKind): string {
  return FOLLOWER_KIND_DEFS[kind].glyph;
}

function moraleGlyph(morale: number): string {
  return morale < 0.42 ? '♡' : '♥';
}

function truncateName(name: string): string {
  return name.length <= NAME_MAX ? name : `${name.slice(0, NAME_MAX - 1)}…`;
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

function joinLines(lines: ReadonlyArray<string>): string {
  return lines.join('\n');
}

function withHint(body: string, line: string | null): string {
  if (!line || body.includes(line)) return body;
  return `${body}\n${line}`;
}

/**
 * Per-mode renderer for one entity kind. Each call returns the full label text
 * for one snapshot (or ground placeholder); `off` is handled centrally.
 */
type LabelRenderer<TIn> = {
  readonly keywords: (input: TIn) => string;
  readonly full: (input: TIn) => string;
};

const groundLabel: LabelRenderer<void> = {
  keywords: () =>
    joinLines([
      '≋ Walkable ash dunes',
      '▒ Farther from the center: heavier fog',
      '✦ Fuel drains faster unless you share light or use a ruin',
    ]),
  full: () =>
    joinLines([
      '≋ Ash dune terrain',
      'Walking surface of the exile world. The origin sits in gentler fog; walking outward pushes you into harsher zones and faster fuel drain unless you merge light with other caravans.',
    ]),
};

const youLabel: LabelRenderer<PlayerSnapshot> = {
  keywords: (p) =>
    joinLines([
      '◎ You',
      `${RACE_GLYPH[p.race]} Race: ${RACE_PROFILES[p.race].displayName}`,
      `⬡ Zone: ${ZONE_DISPLAY_LABEL[p.zone]}`,
      `✦ Light radius ~${Math.round(p.lightRadius)}`,
    ]),
  full: (p) =>
    joinLines([
      '◎ You (your caravan)',
      `${RACE_GLYPH[p.race]} Race: ${RACE_PROFILES[p.race].displayName}.`,
      `⬡ Zone: ${ZONE_DISPLAY_LABEL[p.zone]} — rings farther from the origin are darker, riskier, and burn fuel faster unless you shelter in merged light or an active ruin.`,
      `✦ Your light radius is about ${Math.round(p.lightRadius)} units: stranded followers and rescue checks use this bubble.`,
    ]),
};

interface PlayerRole {
  readonly sim: boolean;
  readonly bot: boolean;
}

function classifyPlayer(p: PlayerSnapshot): PlayerRole {
  const sim = p.id.startsWith('ghost-');
  return { sim, bot: p.isBot && !sim };
}

const otherPlayerLabel: LabelRenderer<PlayerSnapshot> = {
  keywords: (p) => {
    const { sim, bot } = classifyPlayer(p);
    const role = sim
      ? '👻 Simulated caravan (not a human)'
      : bot
        ? '🤖 Network bot'
        : '○ Human player';
    return joinLines([
      `◇ ${truncateName(p.name)}`,
      `${RACE_GLYPH[p.race]} Race: ${RACE_PROFILES[p.race].displayName}`,
      `✦ Light radius ~${Math.round(p.lightRadius)}`,
      role,
    ]);
  },
  full: (p) => {
    const { sim, bot } = classifyPlayer(p);
    const lines: string[] = [
      `◇ "${truncateName(p.name)}" — other player`,
      `${RACE_GLYPH[p.race]} Race: ${RACE_PROFILES[p.race].displayName}. Their light radius is about ${Math.round(p.lightRadius)}.`,
    ];
    if (sim) {
      lines.push(
        '👻 Simulated caravan: the server spawns these "ghost" players so the world feels populated when few humans are online. They are not a real person at a keyboard.',
      );
    } else if (bot) {
      lines.push(
        '🤖 Automated bot client: a test or filler process connected over the network, not a human player.',
      );
    }
    return joinLines(lines);
  },
};

interface FollowerInput {
  readonly f: FollowerSnapshot;
  readonly prox?: LabelProximity;
}

const followerLabel: LabelRenderer<FollowerInput> = {
  keywords: ({ f, prox }) => {
    const kindName = FOLLOWER_KIND_DEFS[f.kind].displayName;
    const pct = Math.round(f.morale * 100);
    if (f.ownerId === null) {
      const body = joinLines([
        `⚠ ${followerKindGlyph(f.kind)} ${kindName} · Stranded (no owner yet)`,
        `${moraleGlyph(f.morale)} Morale ${pct}%`,
      ]);
      return withHint(body, inRescueLight(prox) ? '▸ In your light: press R to rescue' : null);
    }
    return joinLines([
      `${followerKindGlyph(f.kind)} ${kindName} · With a caravan`,
      `${moraleGlyph(f.morale)} Morale ${pct}%`,
    ]);
  },
  full: ({ f, prox }) => {
    const kindName = FOLLOWER_KIND_DEFS[f.kind].displayName;
    if (f.ownerId === null) {
      const body = joinLines([
        `⚠ ${followerKindGlyph(f.kind)} ${kindName} follower (stranded)`,
        'No caravan owns them yet. Move your light bubble over them to recruit them into your caravan.',
      ]);
      return withHint(body, inRescueLight(prox) ? '▸ In your light: press R to rescue' : null);
    }
    const moraleLine =
      f.morale < 0.42
        ? 'Morale is low — they are panicking and may flee back into the fog if their owner stays dim too long.'
        : 'Morale is stable while their owner keeps fuel up.';
    return joinLines([
      `${followerKindGlyph(f.kind)} ${kindName} follower (with a caravan)`,
      'Already rescued: they trail the player who owns them. If that player\u2019s fuel collapses for long enough, morale drops and they can desert.',
      `${moraleGlyph(f.morale)} ${moraleLine}`,
    ]);
  },
};

interface RuinInput {
  readonly r: RuinSnapshot;
  readonly prox?: LabelProximity;
}

const ruinLabel: LabelRenderer<RuinInput> = {
  keywords: ({ r, prox }) => {
    const head = r.activated ? '✓ ⌂ Ruin · Already activated' : '⌂ Ruin · Not activated yet';
    const body = joinLines([head, `⊕ Stranded followers tied here: ${r.followerCharge}`]);
    return withHint(
      body,
      !r.activated && inRuinHintRange(prox) ? '▸ Close enough: press F to activate' : null,
    );
  },
  full: ({ r, prox }) => {
    if (r.activated) {
      return joinLines([
        '✓ ⌂ Ancient ruin (activated)',
        'This ruin has already been opened. Its follower charge was released into the world when it was activated from nearby.',
      ]);
    }
    const charge =
      r.followerCharge === 1
        ? '1 stranded follower is tied to it.'
        : `${r.followerCharge} stranded followers are tied to it.`;
    const body = joinLines([
      '⌂ Ancient ruin (inactive pillar)',
      `Standing near this pillar activates the ruin. ${charge} Activating also widens usable light in the immediate area.`,
    ]);
    return withHint(body, inRuinHintRange(prox) ? '▸ Close enough: press F to activate' : null);
  },
};

const relicLabel: LabelRenderer<RelicSnapshot> = {
  keywords: (r) =>
    joinLines([
      r.claimed ? '✓ ◆ Relic · Already claimed' : '◆ Relic · Available',
      `✦ Light radius bonus +${r.radiusBonus}`,
      '➤ Pass through with fuel to claim',
    ]),
  full: (r) =>
    r.claimed
      ? joinLines([
          '✓ ◆ Relic orb (claimed)',
          'Another caravan already claimed this relic. The light-radius bonus follows whoever holds the claim.',
        ])
      : joinLines([
          '◆ Relic orb (available)',
          `Move your caravan through it with enough fuel to pick it up. Claiming adds +${r.radiusBonus} to your solo light radius until the run ends or rules change it.`,
        ]),
};

function render<TIn>(renderer: LabelRenderer<TIn>, mode: WorldLabelMode, input: TIn): string {
  if (mode === 'off') return '';
  return mode === 'keywords' ? renderer.keywords(input) : renderer.full(input);
}

export function labelGround(mode: WorldLabelMode): string {
  return render(groundLabel, mode, undefined);
}

export function labelYou(p: PlayerSnapshot, mode: WorldLabelMode): string {
  return render(youLabel, mode, p);
}

export function labelOtherPlayer(p: PlayerSnapshot, mode: WorldLabelMode): string {
  return render(otherPlayerLabel, mode, p);
}

export function labelFollower(
  f: FollowerSnapshot,
  mode: WorldLabelMode,
  prox?: LabelProximity,
): string {
  return render(followerLabel, mode, { f, prox });
}

export function labelRuin(r: RuinSnapshot, mode: WorldLabelMode, prox?: LabelProximity): string {
  return render(ruinLabel, mode, { r, prox });
}

export function labelRelic(r: RelicSnapshot, mode: WorldLabelMode): string {
  return render(relicLabel, mode, r);
}
