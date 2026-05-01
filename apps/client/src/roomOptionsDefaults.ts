/**
 * Code defaults for the ESC session menu: scene visual tuning, client
 * tunables, NPR bundle, and snapshot helpers (undo / revert-to-default).
 */
import { DEFAULT_WORLD_CONFIG } from '@realtime-room/shared';

import type { FxTier } from './flameLighting.js';
import type { SceneVisualSettings } from './scene.js';
import { mergeNprFromPartialBlob, NPR_DEFAULTS, type NprSettings } from './nprSettings.js';
import { NPR_FIELDS, NPR_FIELD_KEYS } from './nprSchema.js';
import type { WorldLabelMode } from './tooltips.js';

/** Snapshot keys backed by a clamped float scalar (LS + slider + revert). */
export type SceneFloatKey =
  | 'fogDensityMul'
  | 'fillLightMul'
  | 'toneExposure'
  | 'skyHazeMul'
  | 'torchReachMul';

/**
 * One source of truth for every plain numeric scene tunable: storage key,
 * default, persistence clamp, ESC-menu slider config, and display label.
 *
 * Adding a new scalar = one entry here + one field on {@link RoomOptionsSnapshot}
 * + one callback on `RoomOptionsCallbacks` + one wiring line in `main.ts`.
 *
 * `clientSettings.ts` derives its `localStorage` get/set pairs from this list,
 * `options.ts` builds slider rows from it, and {@link DEFAULT_SCENE_VISUAL}
 * pulls its values from `default` here.
 */
export interface SceneFloatFieldDef {
  readonly key: SceneFloatKey;
  /** localStorage key, e.g. `'rtRoom.fogMul'`. */
  readonly lsKey: string;
  /** Code default applied when no LS value exists. */
  readonly default: number;
  /** Persistence clamp (matches `defineFloatScalar`). */
  readonly clamp: { readonly min: number; readonly max: number };
  /** ESC-menu slider config (may be tighter than `clamp` for usability). */
  readonly slider: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly decimals: number;
  };
  /** Short ESC-menu row label. */
  readonly label: string;
}

export const SCENE_FLOAT_FIELDS: ReadonlyArray<SceneFloatFieldDef> = Object.freeze([
  {
    key: 'fogDensityMul',
    lsKey: 'rtRoom.fogMul',
    default: 1,
    clamp: { min: 0, max: 2.5 },
    slider: { min: 0, max: 2.5, step: 0.05, decimals: 2 },
    label: 'Fog ×',
  },
  {
    key: 'fillLightMul',
    lsKey: 'rtRoom.fillMul',
    default: 1,
    clamp: { min: 0.15, max: 2.75 },
    slider: { min: 0.15, max: 2.75, step: 0.05, decimals: 2 },
    label: 'Fill',
  },
  {
    key: 'toneExposure',
    lsKey: 'rtRoom.toneExposure',
    default: 1.32,
    clamp: { min: 0.35, max: 2.75 },
    slider: { min: 0.35, max: 2.75, step: 0.05, decimals: 2 },
    label: 'Exposure',
  },
  {
    key: 'skyHazeMul',
    lsKey: 'rtRoom.skyHazeMul',
    default: 1,
    clamp: { min: 0, max: 1.5 },
    slider: { min: 0, max: 1.5, step: 0.05, decimals: 2 },
    label: 'Sky',
  },
  {
    key: 'torchReachMul',
    lsKey: 'rtRoom.torchReachMul',
    default: 1,
    // Persistence allows down to 0.1 even though the slider only exposes 0.25
    // upward — leftover historic values still load instead of being clipped on read.
    clamp: { min: 0.1, max: 80 },
    slider: { min: 0.25, max: 80, step: 0.05, decimals: 2 },
    label: 'Torches ×',
  },
]);

const SCENE_FLOAT_BY_KEY: Readonly<Record<SceneFloatKey, SceneFloatFieldDef>> = Object.freeze(
  SCENE_FLOAT_FIELDS.reduce<Record<SceneFloatKey, SceneFloatFieldDef>>(
    (acc, f) => {
      acc[f.key] = f;
      return acc;
    },
    {} as Record<SceneFloatKey, SceneFloatFieldDef>,
  ),
);

export function sceneFloatField(key: SceneFloatKey): SceneFloatFieldDef {
  return SCENE_FLOAT_BY_KEY[key];
}

/** Matches prior `scene.ts` `DEFAULT_SCENE_VISUAL` (single source). */
export const DEFAULT_SCENE_VISUAL: SceneVisualSettings = {
  fogDensityMul: SCENE_FLOAT_BY_KEY.fogDensityMul.default,
  fillLightMul: SCENE_FLOAT_BY_KEY.fillLightMul.default,
  toneMappingExposure: SCENE_FLOAT_BY_KEY.toneExposure.default,
  skyHazeMul: SCENE_FLOAT_BY_KEY.skyHazeMul.default,
  torchReachMul: SCENE_FLOAT_BY_KEY.torchReachMul.default,
};

export const CODE_DEFAULT_FX_TIER: FxTier = 'med';

export const CODE_DEFAULT_LABEL_MODE: WorldLabelMode = 'full';

/** When no display name is stored, HUD + menu use this. */
export const CODE_DEFAULT_DISPLAY_NAME = 'guest';

/** Matches `getFogEnabled` default (absence of `rtRoom.fog` !== '0'). */
export const CODE_DEFAULT_FOG_ENABLED = true;

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

/** Deep clone, with per-field shape awareness (color3 tuples need a fresh array). */
export function cloneNprSettings(s: NprSettings): NprSettings {
  const out: Record<string, unknown> = { ...(s as unknown as Record<string, unknown>) };
  for (const k of NPR_FIELD_KEYS) {
    if (NPR_FIELDS[k].kind === 'color3') {
      const t = s[k] as readonly [number, number, number];
      out[k] = [t[0], t[1], t[2]];
    }
  }
  return out as unknown as NprSettings;
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
  const o = cloneNprSettings(s) as unknown as Record<string, unknown>;
  for (const k of NPR_FIELD_KEYS) {
    const f = NPR_FIELDS[k];
    if (f.kind === 'float' || f.kind === 'int') {
      const ov = o[k] as number;
      const dv = d[k] as number;
      if (Math.abs(ov - dv) <= eps) o[k] = dv;
    } else if (f.kind === 'color3') {
      const oa = o[k] as readonly [number, number, number];
      const da = d[k] as readonly [number, number, number];
      o[k] = [
        Math.abs(oa[0] - da[0]) <= eps ? da[0] : oa[0],
        Math.abs(oa[1] - da[1]) <= eps ? da[1] : oa[1],
        Math.abs(oa[2] - da[2]) <= eps ? da[2] : oa[2],
      ];
    }
  }
  return o as unknown as NprSettings;
}

export function nprSettingsEqual(a: NprSettings, b: NprSettings, eps = 1e-4): boolean {
  for (const k of NPR_FIELD_KEYS) {
    const f = NPR_FIELDS[k];
    if (f.kind === 'bool' || f.kind === 'enum') {
      if (a[k] !== b[k]) return false;
    } else if (f.kind === 'float' || f.kind === 'int') {
      if (!numClose(a[k] as number, b[k] as number, eps)) return false;
    } else {
      if (
        !tuple3Close(
          a[k] as readonly [number, number, number],
          b[k] as readonly [number, number, number],
          eps,
        )
      )
        return false;
    }
  }
  return true;
}

export function roomOptionsSnapshotEqual(a: RoomOptionsSnapshot, b: RoomOptionsSnapshot, eps = 1e-4): boolean {
  if (
    a.displayName !== b.displayName ||
    a.fxTier !== b.fxTier ||
    a.labelMode !== b.labelMode ||
    a.fogEnabled !== b.fogEnabled
  ) {
    return false;
  }
  for (const f of SCENE_FLOAT_FIELDS) {
    if (!numClose(a[f.key], b[f.key], eps)) return false;
  }
  if (!numClose(a.duneHeightScale, b.duneHeightScale, eps)) return false;
  return nprSettingsEqual(a.npr, b.npr, eps);
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
  const snap: RoomOptionsSnapshot = {
    displayName: CODE_DEFAULT_DISPLAY_NAME,
    fxTier: CODE_DEFAULT_FX_TIER,
    labelMode: CODE_DEFAULT_LABEL_MODE,
    fogEnabled: CODE_DEFAULT_FOG_ENABLED,
    fogDensityMul: 0,
    fillLightMul: 0,
    toneExposure: 0,
    skyHazeMul: 0,
    torchReachMul: 0,
    duneHeightScale: CODE_DEFAULT_DUNE_HEIGHT_SCALE,
    npr: cloneNprSettings(NPR_DEFAULTS),
  };
  for (const f of SCENE_FLOAT_FIELDS) snap[f.key] = f.default;
  return snap;
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
  const out: RoomOptionsSnapshot = {
    ...code,
    displayName: typeof o.displayName === 'string' ? o.displayName.slice(0, 64) : code.displayName,
    fxTier: isFxTierValue(o.fxTier) ? o.fxTier : code.fxTier,
    labelMode: isLabelModeValue(o.labelMode) ? o.labelMode : code.labelMode,
    fogEnabled: typeof o.fogEnabled === 'boolean' ? o.fogEnabled : code.fogEnabled,
    duneHeightScale: readFiniteScalar(o.duneHeightScale, code.duneHeightScale),
    npr: cloneNprSettings(mergeNprFromPartialBlob(o.npr)),
  };
  for (const f of SCENE_FLOAT_FIELDS) {
    out[f.key] = readFiniteScalar(o[f.key], code[f.key]);
  }
  return out;
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
