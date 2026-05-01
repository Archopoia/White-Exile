/**
 * Single source of truth for player-facing tunables.
 *
 * Backed by `localStorage` so the choice survives reloads. The ESC menu
 * (`options.ts`) is the only UI for changing these — there are deliberately
 * no URL query params for tunables; if you find one, delete it.
 *
 * Identity-style values that aren't tunables (resume token, last-known
 * server-assigned race) are tracked alongside but aren't presented as
 * settings. Torch reach (`rtRoom.torchReachMul`) scales all player flame
 * PointLight distances on the client only.
 */
import { DEFAULT_RACE, RACES, isRace, type Race } from '@realtime-room/shared';

import type { FxTier } from './flameLighting.js';
import {
  CODE_DEFAULT_DISPLAY_NAME,
  CODE_DEFAULT_FX_TIER,
  CODE_DEFAULT_LABEL_MODE,
  SCENE_FLOAT_FIELDS,
  sceneFloatField,
  type SceneFloatKey,
} from './roomOptionsDefaults.js';
import type { WorldLabelMode } from './tooltips.js';

export const FX_TIERS: ReadonlyArray<FxTier> = ['low', 'med', 'high'];
export const LABEL_MODES: ReadonlyArray<WorldLabelMode> = ['off', 'keywords', 'full'];

const KEY_FX = 'rtRoom.fx';
const KEY_LABELS = 'rtRoomLabelsMode';
const KEY_LABELS_LEGACY = 'rtRoomLabels';
const KEY_RACE = 'rtRoom.race';
const KEY_NAME = 'rtRoom.displayName';
const KEY_TOKEN = 'rtRoom.resumeToken';
const KEY_FOG = 'rtRoom.fog';

function readLs(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage may be denied */
  }
}

function readFloat(key: string, fallback: number): number {
  const raw = readLs(key);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build a clamped float scalar backed by `localStorage` from a manifest entry.
 * Returns the matching `get` / `set` pair so the public API stays stable while
 * the body collapses to a single line per scalar (driven by
 * {@link SCENE_FLOAT_FIELDS}).
 */
function defineFloatScalarFromManifest(key: SceneFloatKey): {
  get: () => number;
  set: (v: number) => void;
} {
  const f = sceneFloatField(key);
  const clamp = (v: number): number => Math.max(f.clamp.min, Math.min(f.clamp.max, v));
  return {
    get: () => clamp(readFloat(f.lsKey, f.default)),
    set: (v) => {
      writeLs(f.lsKey, String(clamp(v)));
    },
  };
}

/** Lookup table built from the shared manifest. */
const SCENE_FLOAT_SCALARS: Readonly<
  Record<SceneFloatKey, { get: () => number; set: (v: number) => void }>
> = Object.freeze(
  SCENE_FLOAT_FIELDS.reduce<
    Record<SceneFloatKey, { get: () => number; set: (v: number) => void }>
  >(
    (acc, f) => {
      acc[f.key] = defineFloatScalarFromManifest(f.key);
      return acc;
    },
    {} as Record<SceneFloatKey, { get: () => number; set: (v: number) => void }>,
  ),
);

function isFxTier(value: unknown): value is FxTier {
  return value === 'low' || value === 'med' || value === 'high';
}

function isLabelMode(value: unknown): value is WorldLabelMode {
  return value === 'off' || value === 'keywords' || value === 'full';
}

export function getFxTier(): FxTier {
  const raw = readLs(KEY_FX);
  return isFxTier(raw) ? raw : CODE_DEFAULT_FX_TIER;
}

export function setFxTier(tier: FxTier): void {
  writeLs(KEY_FX, tier);
}

export function getLabelMode(): WorldLabelMode {
  const raw = readLs(KEY_LABELS);
  if (isLabelMode(raw)) return raw;
  const legacy = readLs(KEY_LABELS_LEGACY);
  if (legacy === '0') return 'off';
  if (legacy === '1') return 'full';
  return CODE_DEFAULT_LABEL_MODE;
}

export function setLabelMode(mode: WorldLabelMode): void {
  writeLs(KEY_LABELS, mode);
}

/** Exponential distance fog on the dunes (client-only visual). Default on. */
export function getFogEnabled(): boolean {
  return readLs(KEY_FOG) !== '0';
}

export function setFogEnabled(enabled: boolean): void {
  writeLs(KEY_FOG, enabled ? '1' : '0');
}

/** Multiplier on client exponential fog density (0 = none, 2.5 = very thick). Default 1. */
export const getFogDensityMul = SCENE_FLOAT_SCALARS.fogDensityMul.get;
export const setFogDensityMul = SCENE_FLOAT_SCALARS.fogDensityMul.set;

/** Scales hemisphere + sun + ambient skylight. Default 1. */
export const getFillLightMul = SCENE_FLOAT_SCALARS.fillLightMul.get;
export const setFillLightMul = SCENE_FLOAT_SCALARS.fillLightMul.set;

/** ACES tone-mapping exposure. Default aligned with `DEFAULT_SCENE_VISUAL`. */
export const getToneMappingExposure = SCENE_FLOAT_SCALARS.toneExposure.get;
export const setToneMappingExposure = SCENE_FLOAT_SCALARS.toneExposure.set;

/** Multiplies sky dome haze vs zone presets. Default 1. */
export const getSkyHazeMul = SCENE_FLOAT_SCALARS.skyHazeMul.get;
export const setSkyHazeMul = SCENE_FLOAT_SCALARS.skyHazeMul.set;

/**
 * Multiplies PointLight `distance` for every caravan torch (you + pooled players).
 * 1 = authored server radius mapping; raise for longer view without changing sim.
 */
export const getTorchReachMul = SCENE_FLOAT_SCALARS.torchReachMul.get;
export const setTorchReachMul = SCENE_FLOAT_SCALARS.torchReachMul.set;

export function getRace(): Race {
  const raw = readLs(KEY_RACE);
  if (raw && isRace(raw)) return raw;
  const idx = Math.floor(Math.random() * RACES.length);
  return RACES[idx] ?? DEFAULT_RACE;
}

export function setRace(race: Race): void {
  writeLs(KEY_RACE, race);
}

export function getDisplayName(): string {
  const raw = readLs(KEY_NAME);
  if (raw && raw.trim().length > 0) return raw.slice(0, 24);
  return CODE_DEFAULT_DISPLAY_NAME;
}

export function setDisplayName(name: string): void {
  const trimmed = name.trim().slice(0, 24);
  if (trimmed.length > 0) writeLs(KEY_NAME, trimmed);
}

export function getResumeToken(): string | undefined {
  const t = readLs(KEY_TOKEN);
  return t && t.length > 0 ? t : undefined;
}

export function setResumeToken(token: string): void {
  writeLs(KEY_TOKEN, token);
}

export const FX_TIER_LABEL: Readonly<Record<FxTier, string>> = Object.freeze({
  low: 'Low — no shadows (fastest)',
  med: 'Medium — torch + sun shadows',
  high: 'High — all flame shadows',
});

export const LABEL_MODE_LABEL: Readonly<Record<WorldLabelMode, string>> = Object.freeze({
  off: 'Off',
  keywords: 'Keywords',
  full: 'Full',
});
