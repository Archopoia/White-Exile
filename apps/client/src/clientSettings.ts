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
const KEY_FOG_MUL = 'rtRoom.fogMul';
const KEY_FILL_MUL = 'rtRoom.fillMul';
const KEY_TONE_EXPOSURE = 'rtRoom.toneExposure';
const KEY_SKY_HAZE_MUL = 'rtRoom.skyHazeMul';
const KEY_TORCH_REACH_MUL = 'rtRoom.torchReachMul';

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

function isFxTier(value: unknown): value is FxTier {
  return value === 'low' || value === 'med' || value === 'high';
}

function isLabelMode(value: unknown): value is WorldLabelMode {
  return value === 'off' || value === 'keywords' || value === 'full';
}

export function getFxTier(): FxTier {
  const raw = readLs(KEY_FX);
  return isFxTier(raw) ? raw : 'med';
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
  return 'full';
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
export function getFogDensityMul(): number {
  return Math.max(0, Math.min(2.5, readFloat(KEY_FOG_MUL, 1)));
}

export function setFogDensityMul(mul: number): void {
  const v = Math.max(0, Math.min(2.5, mul));
  writeLs(KEY_FOG_MUL, String(v));
}

/** Scales hemisphere + sun + ambient skylight. Default 1. */
export function getFillLightMul(): number {
  return Math.max(0.15, Math.min(2.75, readFloat(KEY_FILL_MUL, 1)));
}

export function setFillLightMul(mul: number): void {
  const v = Math.max(0.15, Math.min(2.75, mul));
  writeLs(KEY_FILL_MUL, String(v));
}

/** ACES tone-mapping exposure. Default aligned with `DEFAULT_SCENE_VISUAL`. */
export function getToneMappingExposure(): number {
  return Math.max(0.35, Math.min(2.75, readFloat(KEY_TONE_EXPOSURE, 1.32)));
}

export function setToneMappingExposure(exposure: number): void {
  const v = Math.max(0.35, Math.min(2.75, exposure));
  writeLs(KEY_TONE_EXPOSURE, String(v));
}

/** Multiplies sky dome haze vs zone presets. Default 1. */
export function getSkyHazeMul(): number {
  return Math.max(0, Math.min(1.5, readFloat(KEY_SKY_HAZE_MUL, 1)));
}

export function setSkyHazeMul(mul: number): void {
  const v = Math.max(0, Math.min(1.5, mul));
  writeLs(KEY_SKY_HAZE_MUL, String(v));
}

/**
 * Multiplies PointLight `distance` for every caravan torch (you + pooled players).
 * 1 = authored server radius mapping; raise for longer view without changing sim.
 */
export function getTorchReachMul(): number {
  return Math.max(0.1, Math.min(80, readFloat(KEY_TORCH_REACH_MUL, 1)));
}

export function setTorchReachMul(mul: number): void {
  const v = Math.max(0.1, Math.min(80, mul));
  writeLs(KEY_TORCH_REACH_MUL, String(v));
}

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
  const adjectives = ['ash', 'cold', 'lit', 'lone', 'bold', 'still', 'bright', 'old'];
  const nouns = ['ember', 'pyre', 'lamp', 'wick', 'spark', 'beacon', 'dust', 'kin'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)] ?? 'ash';
  const n = nouns[Math.floor(Math.random() * nouns.length)] ?? 'ember';
  return `${a}-${n}`;
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
