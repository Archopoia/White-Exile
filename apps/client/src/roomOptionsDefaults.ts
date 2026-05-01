/**
 * Code defaults for the ESC session menu: scene visual tuning, client
 * tunables, NPR bundle, and snapshot helpers (undo / revert-to-default).
 */
import { DEFAULT_WORLD_CONFIG } from '@realtime-room/shared';

import type { FxTier } from './flameLighting.js';
import type { SceneVisualSettings } from './scene.js';
import { mergeNprFromPartialBlob, NPR_DEFAULTS, type NprSettings } from './nprSettings.js';
import type { WorldLabelMode } from './tooltips.js';

/** Matches prior `scene.ts` `DEFAULT_SCENE_VISUAL` (single source). */
export const DEFAULT_SCENE_VISUAL: SceneVisualSettings = {
  fogDensityMul: 1,
  fillLightMul: 1,
  toneMappingExposure: 1.32,
  skyHazeMul: 1,
  torchReachMul: 1,
};

export const CODE_DEFAULT_FX_TIER: FxTier = 'med';

export const CODE_DEFAULT_LABEL_MODE: WorldLabelMode = 'full';

/** When no display name is stored, HUD + menu use this. */
export const CODE_DEFAULT_DISPLAY_NAME = 'guest';

/** Matches `getFogEnabled` default (absence of `rtRoom.fog` !== '0'). */
export const CODE_DEFAULT_FOG_ENABLED = true;

export const CODE_DEFAULT_FOG_DENSITY_MUL = DEFAULT_SCENE_VISUAL.fogDensityMul;
export const CODE_DEFAULT_FILL_LIGHT_MUL = DEFAULT_SCENE_VISUAL.fillLightMul;
export const CODE_DEFAULT_TONE_EXPOSURE = DEFAULT_SCENE_VISUAL.toneMappingExposure;
export const CODE_DEFAULT_SKY_HAZE_MUL = DEFAULT_SCENE_VISUAL.skyHazeMul;
export const CODE_DEFAULT_TORCH_REACH_MUL = DEFAULT_SCENE_VISUAL.torchReachMul;

export const CODE_DEFAULT_DUNE_HEIGHT_SCALE = DEFAULT_WORLD_CONFIG.duneHeightScale;

/** Mutable working copy for the ESC menu + undo stack. */
export interface RoomOptionsSnapshot {
  displayName: string;
  fxTier: FxTier;
  labelMode: WorldLabelMode;
  fogEnabled: boolean;
  fogDensityMul: number;
  fillLightMul: number;
  toneExposure: number;
  skyHazeMul: number;
  torchReachMul: number;
  duneHeightScale: number;
  npr: NprSettings;
}

export function cloneNprSettings(s: NprSettings): NprSettings {
  return {
    ...s,
    outlineColor: [s.outlineColor[0], s.outlineColor[1], s.outlineColor[2]],
    celShadowTint: [s.celShadowTint[0], s.celShadowTint[1], s.celShadowTint[2]],
    mistColor: [s.mistColor[0], s.mistColor[1], s.mistColor[2]],
  };
}

function tuple3Close(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  eps: number,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= eps &&
    Math.abs(a[1] - b[1]) <= eps &&
    Math.abs(a[2] - b[2]) <= eps
  );
}

function numClose(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

/** UI + LS normalization: treat as unchanged vs code default within this band. */
export const OPTION_FLOAT_EPS = 1e-4;

export function optionFloatDiffers(a: number, b: number, eps = OPTION_FLOAT_EPS): boolean {
  return Math.abs(a - b) > eps;
}

export function optionRgbDiffers(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  eps = OPTION_FLOAT_EPS,
): boolean {
  return optionFloatDiffers(a[0], b[0], eps) || optionFloatDiffers(a[1], b[1], eps) || optionFloatDiffers(a[2], b[2], eps);
}

/**
 * Snap near-code-default numerics to exact `NPR_DEFAULTS` literals so localStorage
 * matches the repo baseline (removes float noise / stale partial saves vs revert UI).
 */
export function snapNprNearCodeDefaults(s: NprSettings, eps = OPTION_FLOAT_EPS): NprSettings {
  const d = NPR_DEFAULTS;
  const o = cloneNprSettings(s);
  const keys = Object.keys(d) as (keyof NprSettings)[];
  for (const k of keys) {
    const ov = o[k];
    const dv = d[k];
    if (typeof ov === 'number' && typeof dv === 'number') {
      if (Math.abs(ov - dv) <= eps) {
        (o as unknown as Record<string, unknown>)[k as string] = dv;
      }
      continue;
    }
    if (Array.isArray(ov) && Array.isArray(dv) && ov.length === 3 && dv.length === 3) {
      const oa = ov as readonly [number, number, number];
      const da = dv as readonly [number, number, number];
      const nx = Math.abs(oa[0] - da[0]) <= eps ? da[0] : oa[0];
      const ny = Math.abs(oa[1] - da[1]) <= eps ? da[1] : oa[1];
      const nz = Math.abs(oa[2] - da[2]) <= eps ? da[2] : oa[2];
      (o as unknown as Record<string, unknown>)[k as string] = [nx, ny, nz];
    }
  }
  return o;
}

export function nprSettingsEqual(a: NprSettings, b: NprSettings, eps = 1e-4): boolean {
  const keys = Object.keys(NPR_DEFAULTS) as (keyof NprSettings)[];
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'boolean' && typeof vb === 'boolean' && va === vb) continue;
    if (typeof va === 'string' && typeof vb === 'string' && va === vb) continue;
    if (typeof va === 'number' && typeof vb === 'number' && numClose(va, vb, eps)) continue;
    if (Array.isArray(va) && Array.isArray(vb) && va.length === 3 && vb.length === 3) {
      if (!tuple3Close(va as readonly [number, number, number], vb as readonly [number, number, number], eps))
        return false;
      continue;
    }
    return false;
  }
  return true;
}

export function roomOptionsSnapshotEqual(a: RoomOptionsSnapshot, b: RoomOptionsSnapshot, eps = 1e-4): boolean {
  return (
    a.displayName === b.displayName &&
    a.fxTier === b.fxTier &&
    a.labelMode === b.labelMode &&
    a.fogEnabled === b.fogEnabled &&
    numClose(a.fogDensityMul, b.fogDensityMul, eps) &&
    numClose(a.fillLightMul, b.fillLightMul, eps) &&
    numClose(a.toneExposure, b.toneExposure, eps) &&
    numClose(a.skyHazeMul, b.skyHazeMul, eps) &&
    numClose(a.torchReachMul, b.torchReachMul, eps) &&
    numClose(a.duneHeightScale, b.duneHeightScale, eps) &&
    nprSettingsEqual(a.npr, b.npr, eps)
  );
}

export function buildRoomOptionsSnapshotFromInitial(init: {
  displayName: string;
  fxTier: FxTier;
  labelMode: WorldLabelMode;
  fogEnabled: boolean;
  fogDensityMul: number;
  fillLightMul: number;
  toneExposure: number;
  skyHazeMul: number;
  torchReachMul: number;
  duneHeightScale: number;
  nprSettings: NprSettings;
}): RoomOptionsSnapshot {
  return {
    displayName: init.displayName,
    fxTier: init.fxTier,
    labelMode: init.labelMode,
    fogEnabled: init.fogEnabled,
    fogDensityMul: init.fogDensityMul,
    fillLightMul: init.fillLightMul,
    toneExposure: init.toneExposure,
    skyHazeMul: init.skyHazeMul,
    torchReachMul: init.torchReachMul,
    duneHeightScale: init.duneHeightScale,
    npr: cloneNprSettings(init.nprSettings),
  };
}

/** User-saved ESC revert baseline (browser storage; not repo defaults). */
export const USER_REVERT_BASELINE_LS_KEY = 'rtRoom.revertBaseline';

function isFxTierValue(value: unknown): value is FxTier {
  return value === 'low' || value === 'med' || value === 'high';
}

function isLabelModeValue(value: unknown): value is WorldLabelMode {
  return value === 'off' || value === 'keywords' || value === 'full';
}

/** Ship / repo defaults as a full snapshot (used when no user baseline exists). */
export function buildCodeDefaultRoomOptionsSnapshot(): RoomOptionsSnapshot {
  return {
    displayName: CODE_DEFAULT_DISPLAY_NAME,
    fxTier: CODE_DEFAULT_FX_TIER,
    labelMode: CODE_DEFAULT_LABEL_MODE,
    fogEnabled: CODE_DEFAULT_FOG_ENABLED,
    fogDensityMul: CODE_DEFAULT_FOG_DENSITY_MUL,
    fillLightMul: CODE_DEFAULT_FILL_LIGHT_MUL,
    toneExposure: CODE_DEFAULT_TONE_EXPOSURE,
    skyHazeMul: CODE_DEFAULT_SKY_HAZE_MUL,
    torchReachMul: CODE_DEFAULT_TORCH_REACH_MUL,
    duneHeightScale: CODE_DEFAULT_DUNE_HEIGHT_SCALE,
    npr: cloneNprSettings(NPR_DEFAULTS),
  };
}

function readFiniteScalar(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Parse a JSON-persisted session baseline. Unknown fields fall back to ship defaults.
 */
export function parseRoomOptionsSnapshotFromUnknown(value: unknown): RoomOptionsSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const code = buildCodeDefaultRoomOptionsSnapshot();
  const npr = cloneNprSettings(mergeNprFromPartialBlob(o.npr));
  return {
    displayName: typeof o.displayName === 'string' ? o.displayName.slice(0, 64) : code.displayName,
    fxTier: isFxTierValue(o.fxTier) ? o.fxTier : code.fxTier,
    labelMode: isLabelModeValue(o.labelMode) ? o.labelMode : code.labelMode,
    fogEnabled: typeof o.fogEnabled === 'boolean' ? o.fogEnabled : code.fogEnabled,
    fogDensityMul: readFiniteScalar(o.fogDensityMul, code.fogDensityMul),
    fillLightMul: readFiniteScalar(o.fillLightMul, code.fillLightMul),
    toneExposure: readFiniteScalar(o.toneExposure, code.toneExposure),
    skyHazeMul: readFiniteScalar(o.skyHazeMul, code.skyHazeMul),
    torchReachMul: readFiniteScalar(o.torchReachMul, code.torchReachMul),
    duneHeightScale: readFiniteScalar(o.duneHeightScale, code.duneHeightScale),
    npr,
  };
}

export function loadUserRevertBaseline(): RoomOptionsSnapshot | null {
  try {
    const raw = window.localStorage.getItem(USER_REVERT_BASELINE_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    return parseRoomOptionsSnapshotFromUnknown(j);
  } catch {
    return null;
  }
}

export function saveUserRevertBaseline(s: RoomOptionsSnapshot): void {
  try {
    window.localStorage.setItem(USER_REVERT_BASELINE_LS_KEY, JSON.stringify(s));
  } catch {
    /* storage may be denied */
  }
}
