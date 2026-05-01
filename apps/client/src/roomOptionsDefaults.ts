/**
 * Code defaults for the ESC session menu: scene visual tuning, client
 * tunables, NPR bundle, and snapshot helpers (undo / revert-to-default).
 */
import { DEFAULT_WORLD_CONFIG } from '@realtime-room/shared';

import type { FxTier } from './flameLighting.js';
import type { SceneVisualSettings } from './scene.js';
import { NPR_DEFAULTS, type NprSettings } from './nprSettings.js';
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
