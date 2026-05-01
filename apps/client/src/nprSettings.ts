/**
 * NPR (non-photoreal) post-process tunables.
 *
 * Ported from the Godot `tutelary.rendering_npr_stack` addon (Sobel ink,
 * cel banding, Kuwahara oil, depth-edge mist, hatching). The composite is a
 * single fullscreen pass that reads the lit colour, a linear depth target,
 * and a view-space normal target, then layers the effects below in this
 * order: cel quantise → Kuwahara oil → edge mist → depth+normal Sobel
 * outline → hatching → final tint.
 *
 * One source of truth lives in `nprSchema.ts` (per-field default + clamp);
 * `nprPost.ts` consumes the settings shape, `options.ts` mutates it, and
 * `localStorage` persists the last "custom" tweak.
 */
import {
  NPR_FIELDS,
  NPR_FIELD_KEYS,
  clampFloat,
  readBool,
  readColor3,
  readEnum,
  type Color3Field,
  type HatchPattern,
  type NprStyle,
} from './nprSchema.js';

export type { HatchPattern, NprStyle } from './nprSchema.js';
export { HATCH_PATTERNS, NPR_STYLES } from './nprSchema.js';

export const NPR_STYLE_LABEL: Readonly<Record<NprStyle, string>> = Object.freeze({
  off: 'Off',
  toon: 'Toon',
  moebius: 'Moebius',
  rembrandt: 'Rembrandt',
  painterly_toon: 'Painterly Toon',
  custom: 'Custom',
});

/** Hatching cadence: more directions stack on top of each other for darker bands. */
export const HATCH_PATTERN_LABEL: Readonly<Record<HatchPattern, string>> = Object.freeze({
  tonal: 'Tonal',
  crosshatch: 'Crosshatch',
  raster: 'Raster',
});

export interface NprSettings {
  /** Master switch. When false the post pipeline is bypassed (regular Three.js render). */
  enabled: boolean;
  /** Selected preset; 'custom' = last user-edited values. */
  style: NprStyle;

  outlineEnabled: boolean;
  outlineThicknessPx: number;
  /** Linear-RGB tuple [0..1]^3 (matches Godot `Color`). */
  outlineColor: readonly [number, number, number];
  outlineDepthWeight: number;
  outlineMinFeaturePx: number;
  /**
   * When thin-feature suppression is on, blend the gate toward 1 for pixels
   * with low linear depth (near camera) so close silhouettes are not erased.
   */
  outlineNearThinRelax: number;
  /** Linear depth (0=near ..1=far) below which near relax ramps in. */
  outlineNearDepthMax: number;

  wiggleEnabled: boolean;
  wiggleFrequency: number;
  wiggleAmplitudePx: number;
  wiggleIrregularity: number;

  celEnabled: boolean;
  celSteps: number;
  celStepSmoothness: number;
  celShadowTint: readonly [number, number, number];
  celShadowTintAmount: number;
  celMinLight: number;
  celMix: number;
  /** 0 = off. Feathers real-time cast shadow edges in screen space (prepass luma Sobel). */
  castShadowEdgeFade: number;
  /** Shadow-edge ramp width; higher = gentler fade (pairs with {@link castShadowEdgeFade}). */
  castShadowEdgeSoftness: number;

  hatchEnabled: boolean;
  hatchPattern: HatchPattern;
  hatchModPx: number;
  hatchLumaDark: number;
  hatchLumaMid: number;
  hatchLumaLight: number;
  /**
   * Crosshatch only: how many discrete luma steps from `hatchLumaLight` down to
   * `hatchLumaDark`. Lightest bin: diagonal stripes only, no dots; deeper bins add
   * halftone dots and stack the classic horizontal / vertical / diagonal stripe families.
   */
  hatchCrossSteps: number;
  /** 0 = pure dark ink, 1 = preserve underlying colour through hatch lines. */
  tonalShadowLift: number;
  rasterCellPx: number;
  oilEnabled: boolean;
  oilRadiusPx: number;
  oilIntensity: number;
  /**
   * Oil (Kuwahara) edge / anti-halo — all 0..1 scalars unless noted. Tweak when
   * fire rims or specs still ring after changing radius or amount.
   */
  /** How strongly screen luma edges reduce oil (0 = ignore, 1 = strong). */
  oilLumaEdgeSuppress: number;
  /** How strongly depth/normal edge signal reduces oil. */
  oilGeomEdgeSuppress: number;
  /** Extra smear in dark areas: darkBoost = 1 + this * (1 - smoothstep on luma). */
  oilDarkBoost: number;
  /** Upper cap on the oil blend factor after attenuations. */
  oilMaxBlend: number;
  /** Max |Kuwahara mean − centre| in RGB before renormalize (flat areas). */
  oilDeltaClamp: number;
  /** At full luma-edge, delta cap is multiplied by this (tighter = less chroma ring). */
  oilDeltaClampEdgeMul: number;
  /** Smoothstep band on the 0..1 luma-edge signal for luma attenuation (ordered in getNprSettings). */
  oilEdgeAttenLo: number;
  oilEdgeAttenHi: number;
  /** Smoothstep band on luma-edge for tightening delta cap toward edge mul. */
  oilDeltaBandLo: number;
  oilDeltaBandHi: number;

  mistEnabled: boolean;
  mistIntensity: number;
  mistDepthThreshold: number;
  mistSpreadPx: number;
  mistColor: readonly [number, number, number];
  mistTintStrength: number;
  mistGlobal: number;
  /** Reuses the depth+normal Sobel signal so misty edges align with hatch/ink instead of luma alone. */
  mistGeomEdgeScale: number;
}

/**
 * Code defaults derived from {@link NPR_FIELDS}. Don't edit per-field defaults
 * here — change them in `nprSchema.ts` so parsing / cloning / equality stay in
 * sync automatically.
 */
function buildNprDefaults(): NprSettings {
  const out: Record<string, unknown> = {};
  for (const k of NPR_FIELD_KEYS) {
    const f = NPR_FIELDS[k];
    if (f.kind === 'color3') {
      out[k] = [f.default[0], f.default[1], f.default[2]];
    } else {
      out[k] = f.default;
    }
  }
  return out as unknown as NprSettings;
}

export const NPR_DEFAULTS: NprSettings = Object.freeze(buildNprDefaults());

/**
 * Style presets — each mirrors the behaviour you described:
 *   - toon: dark ink borders + a few flat cel bands; no painterly blur.
 *   - moebius: clean dark line-art with crosshatch (more directions = darker shadow).
 *   - rembrandt: Kuwahara oil smear + soft depth-edge mist; gentle banding only.
 *   - painterly_toon: cel + oil + crosshatch — combines the three approaches.
 *
 * Presets are applied on top of `NPR_DEFAULTS`; absent keys keep their default.
 * 'custom' is whatever the user left in localStorage.
 */
export const NPR_PRESETS: Readonly<Record<Exclude<NprStyle, 'off' | 'custom'>, Partial<NprSettings>>> = Object.freeze({
  toon: {
    outlineEnabled: true,
    outlineThicknessPx: 1.6,
    outlineColor: [0.04, 0.03, 0.05],
    outlineDepthWeight: 22,
    outlineMinFeaturePx: 1.5,
    wiggleEnabled: false,
    celEnabled: true,
    celSteps: 4,
    celStepSmoothness: 0.18,
    celMinLight: 0.1,
    celMix: 1.0,
    hatchEnabled: false,
    oilEnabled: false,
    mistEnabled: false,
  },
  moebius: {
    outlineEnabled: true,
    outlineThicknessPx: 1.2,
    outlineColor: [0.03, 0.025, 0.04],
    outlineDepthWeight: 28,
    outlineMinFeaturePx: 2.5,
    wiggleEnabled: true,
    wiggleFrequency: 0.06,
    wiggleAmplitudePx: 1.4,
    wiggleIrregularity: 0.35,
    celEnabled: true,
    celSteps: 5,
    celStepSmoothness: 0.05,
    celMix: 0.85,
    hatchEnabled: true,
    hatchPattern: 'crosshatch',
    hatchModPx: 7.5,
    hatchLumaDark: 0.32,
    hatchLumaMid: 0.5,
    hatchLumaLight: 0.72,
    hatchCrossSteps: 8,
    tonalShadowLift: 0.4,
    oilEnabled: false,
    mistEnabled: false,
  },
  rembrandt: {
    outlineEnabled: true,
    outlineThicknessPx: 0.8,
    outlineColor: [0.16, 0.07, 0.03],
    outlineDepthWeight: 6,
    outlineMinFeaturePx: 4.5,
    wiggleEnabled: true,
    wiggleIrregularity: 0.55,
    celEnabled: true,
    celSteps: 6,
    celStepSmoothness: 0.28,
    celShadowTintAmount: 0.18,
    celMix: 0.55,
    hatchEnabled: false,
    oilEnabled: true,
    oilRadiusPx: 4.0,
    oilIntensity: 1.1,
    mistEnabled: true,
    mistIntensity: 0.7,
    mistDepthThreshold: 0.04,
    mistSpreadPx: 10.0,
    mistTintStrength: 0.15,
    mistGeomEdgeScale: 0.45,
  },
  painterly_toon: {
    outlineEnabled: true,
    outlineThicknessPx: 1.2,
    outlineColor: [0.04, 0.03, 0.05],
    outlineDepthWeight: 22,
    outlineMinFeaturePx: 2.5,
    wiggleEnabled: true,
    wiggleAmplitudePx: 1.4,
    celEnabled: true,
    celSteps: 5,
    celMix: 0.9,
    hatchEnabled: true,
    hatchPattern: 'crosshatch',
    hatchLumaDark: 0.32,
    hatchLumaMid: 0.52,
    hatchLumaLight: 0.78,
    oilEnabled: true,
    oilRadiusPx: 2.5,
    oilIntensity: 0.6,
    mistEnabled: true,
    mistIntensity: 0.4,
    mistTintStrength: 0.1,
  },
});

export function applyPreset(base: NprSettings, style: NprStyle): NprSettings {
  if (style === 'off') {
    return { ...base, enabled: false, style: 'off' };
  }
  if (style === 'custom') {
    return { ...base, enabled: true, style: 'custom' };
  }
  const p = NPR_PRESETS[style];
  return { ...NPR_DEFAULTS, ...p, enabled: true, style };
}

const KEY_NPR = 'rtRoom.npr';

/**
 * Pairs that are read independently but logically share an ordering invariant
 * (low <= high). Swapped after parsing rather than re-derived in the schema —
 * the GLSL composite gracefully handles either order, but the UI is friendlier
 * when stored values stay sorted.
 */
const ORDERED_PAIRS: ReadonlyArray<readonly [keyof NprSettings, keyof NprSettings]> = [
  ['oilEdgeAttenLo', 'oilEdgeAttenHi'],
  ['oilDeltaBandLo', 'oilDeltaBandHi'],
];

/**
 * Merge a partial NPR blob (e.g. from `localStorage` or a saved session baseline)
 * into a full `NprSettings` using the per-field clamps from `nprSchema.ts`.
 */
export function mergeNprFromPartialBlob(parsed: unknown): NprSettings {
  const out: Record<string, unknown> = {};
  const p = (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null);
  for (const k of NPR_FIELD_KEYS) {
    const f = NPR_FIELDS[k];
    const raw = p ? p[k] : undefined;
    switch (f.kind) {
      case 'bool':
        out[k] = readBool(raw, f);
        break;
      case 'float':
      case 'int':
        out[k] = clampFloat(raw, f);
        break;
      case 'color3':
        out[k] = readColor3(raw, f as Color3Field);
        break;
      case 'enum':
        out[k] = readEnum(raw, f);
        break;
    }
  }
  for (const [loK, hiK] of ORDERED_PAIRS) {
    const lo = out[loK as string] as number;
    const hi = out[hiK as string] as number;
    if (lo > hi) {
      out[loK as string] = hi;
      out[hiK as string] = lo;
    }
  }
  return out as unknown as NprSettings;
}

export function getNprSettings(): NprSettings {
  let parsed: unknown = null;
  try {
    const raw = window.localStorage.getItem(KEY_NPR);
    if (raw) parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = null;
  }
  return mergeNprFromPartialBlob(parsed);
}

export function saveNprSettings(s: NprSettings): void {
  try {
    window.localStorage.setItem(KEY_NPR, JSON.stringify(s));
  } catch {
    /* storage may be denied */
  }
}
