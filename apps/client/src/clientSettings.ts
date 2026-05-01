/**
 * Single source of truth for player-facing tunables.
 *
 * Backed by `localStorage` so the choice survives reloads. The ESC menu
 * (`options.ts`) is the only UI for changing these — there are deliberately
 * no URL query params for tunables; if you find one, delete it.
 *
 * Identity-style values that aren't tunables (resume token, last-known
 * server-assigned race) are tracked alongside but aren't presented as
 * settings.
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
