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
 * One source of truth lives here; `nprPost.ts` consumes it, `options.ts`
 * mutates it, and `localStorage` persists the last "custom" tweak.
 */
export type NprStyle = 'off' | 'toon' | 'moebius' | 'rembrandt' | 'painterly_toon' | 'custom';

export const NPR_STYLES: ReadonlyArray<NprStyle> = [
  'off',
  'toon',
  'moebius',
  'rembrandt',
  'painterly_toon',
  'custom',
];

export const NPR_STYLE_LABEL: Readonly<Record<NprStyle, string>> = Object.freeze({
  off: 'Off',
  toon: 'Toon',
  moebius: 'Moebius',
  rembrandt: 'Rembrandt',
  painterly_toon: 'Painterly Toon',
  custom: 'Custom',
});

/** Hatching cadence: more directions stack on top of each other for darker bands. */
export type HatchPattern = 'tonal' | 'crosshatch' | 'raster';

export const HATCH_PATTERNS: ReadonlyArray<HatchPattern> = ['tonal', 'crosshatch', 'raster'];

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

export const NPR_DEFAULTS: NprSettings = Object.freeze({
  enabled: false,
  style: 'off',

  outlineEnabled: true,
  outlineThicknessPx: 1.5,
  outlineColor: [0.0, 0.0, 0.0] as const,
  outlineDepthWeight: 25.0,
  outlineMinFeaturePx: 2.5,
  outlineNearThinRelax: 0.62,
  outlineNearDepthMax: 0.26,

  wiggleEnabled: true,
  wiggleFrequency: 0.08,
  wiggleAmplitudePx: 2.0,
  wiggleIrregularity: 0.0,

  celEnabled: false,
  celSteps: 4,
  celStepSmoothness: 0.22,
  celShadowTint: [0.55, 0.62, 0.85] as const,
  celShadowTintAmount: 0.0,
  celMinLight: 0.06,
  celMix: 1.0,

  hatchEnabled: true,
  hatchPattern: 'crosshatch',
  hatchModPx: 8.0,
  hatchLumaDark: 0.35,
  hatchLumaMid: 0.55,
  hatchLumaLight: 0.8,
  hatchCrossSteps: 6,
  tonalShadowLift: 0.55,
  rasterCellPx: 14.0,

  oilEnabled: false,
  oilRadiusPx: 3.0,
  oilIntensity: 0.8,
  oilLumaEdgeSuppress: 0.94,
  oilGeomEdgeSuppress: 0.45,
  oilDarkBoost: 0.18,
  oilMaxBlend: 1.65,
  oilDeltaClamp: 0.32,
  oilDeltaClampEdgeMul: 0.375,
  oilEdgeAttenLo: 0.03,
  oilEdgeAttenHi: 0.22,
  oilDeltaBandLo: 0.05,
  oilDeltaBandHi: 0.28,

  mistEnabled: false,
  mistIntensity: 0.6,
  mistDepthThreshold: 0.035,
  mistSpreadPx: 12.0,
  mistColor: [0.03, 0.025, 0.02] as const,
  mistTintStrength: 0.2,
  mistGlobal: 0.0,
  mistGeomEdgeScale: 0.38,
});

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

interface PartialNprBlob {
  [k: string]: unknown;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readColor3(value: unknown, fallback: readonly [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length === 3 && value.every(isFinitePositive)) {
    return [
      Math.max(0, Math.min(1, value[0] as number)),
      Math.max(0, Math.min(1, value[1] as number)),
      Math.max(0, Math.min(1, value[2] as number)),
    ];
  }
  return [fallback[0], fallback[1], fallback[2]];
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (!isFinitePositive(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function isNprStyle(value: unknown): value is NprStyle {
  return typeof value === 'string' && (NPR_STYLES as ReadonlyArray<string>).includes(value);
}

function isHatchPattern(value: unknown): value is HatchPattern {
  return typeof value === 'string' && (HATCH_PATTERNS as ReadonlyArray<string>).includes(value);
}

/**
 * Merge a partial NPR blob (e.g. from `localStorage` or a saved session baseline)
 * into a full `NprSettings` using the same clamps as `getNprSettings`.
 */
export function mergeNprFromPartialBlob(parsed: unknown): NprSettings {
  if (!parsed || typeof parsed !== 'object') {
    return { ...NPR_DEFAULTS };
  }
  const p = parsed as PartialNprBlob;
  const d = NPR_DEFAULTS;
  return {
    enabled: readBool(p.enabled, d.enabled),
    style: isNprStyle(p.style) ? p.style : d.style,

    outlineEnabled: readBool(p.outlineEnabled, d.outlineEnabled),
    outlineThicknessPx: readNumber(p.outlineThicknessPx, d.outlineThicknessPx, 0.25, 8),
    outlineColor: readColor3(p.outlineColor, d.outlineColor),
    outlineDepthWeight: readNumber(p.outlineDepthWeight, d.outlineDepthWeight, 0, 100),
    outlineMinFeaturePx: readNumber(p.outlineMinFeaturePx, d.outlineMinFeaturePx, 0, 16),
    outlineNearThinRelax: readNumber(p.outlineNearThinRelax, d.outlineNearThinRelax, 0, 1),
    outlineNearDepthMax: readNumber(p.outlineNearDepthMax, d.outlineNearDepthMax, 0.02, 0.6),

    wiggleEnabled: readBool(p.wiggleEnabled, d.wiggleEnabled),
    wiggleFrequency: readNumber(p.wiggleFrequency, d.wiggleFrequency, 0.001, 0.5),
    wiggleAmplitudePx: readNumber(p.wiggleAmplitudePx, d.wiggleAmplitudePx, 0, 8),
    wiggleIrregularity: readNumber(p.wiggleIrregularity, d.wiggleIrregularity, 0, 1),

    celEnabled: readBool(p.celEnabled, d.celEnabled),
    celSteps: readNumber(p.celSteps, d.celSteps, 2, 12),
    celStepSmoothness: readNumber(p.celStepSmoothness, d.celStepSmoothness, 0, 1),
    celShadowTint: readColor3(p.celShadowTint, d.celShadowTint),
    celShadowTintAmount: readNumber(p.celShadowTintAmount, d.celShadowTintAmount, 0, 1),
    celMinLight: readNumber(p.celMinLight, d.celMinLight, 0, 0.5),
    celMix: readNumber(p.celMix, d.celMix, 0, 1),

    hatchEnabled: readBool(p.hatchEnabled, d.hatchEnabled),
    hatchPattern: isHatchPattern(p.hatchPattern) ? p.hatchPattern : d.hatchPattern,
    hatchModPx: readNumber(p.hatchModPx, d.hatchModPx, 2, 32),
    hatchLumaDark: readNumber(p.hatchLumaDark, d.hatchLumaDark, 0, 1),
    hatchLumaMid: readNumber(p.hatchLumaMid, d.hatchLumaMid, 0, 1),
    hatchLumaLight: readNumber(p.hatchLumaLight, d.hatchLumaLight, 0, 1),
    hatchCrossSteps: Math.round(readNumber(p.hatchCrossSteps, d.hatchCrossSteps, 3, 16)),
    tonalShadowLift: readNumber(p.tonalShadowLift, d.tonalShadowLift, 0, 1),
    rasterCellPx: readNumber(p.rasterCellPx, d.rasterCellPx, 4, 64),
    oilEnabled: readBool(p.oilEnabled, d.oilEnabled),
    oilRadiusPx: readNumber(p.oilRadiusPx, d.oilRadiusPx, 1, 10),
    oilIntensity: readNumber(p.oilIntensity, d.oilIntensity, 0, 3),
    oilLumaEdgeSuppress: readNumber(p.oilLumaEdgeSuppress, d.oilLumaEdgeSuppress, 0, 1),
    oilGeomEdgeSuppress: readNumber(p.oilGeomEdgeSuppress, d.oilGeomEdgeSuppress, 0, 1),
    oilDarkBoost: readNumber(p.oilDarkBoost, d.oilDarkBoost, 0, 0.4),
    oilMaxBlend: readNumber(p.oilMaxBlend, d.oilMaxBlend, 0.25, 3),
    oilDeltaClamp: readNumber(p.oilDeltaClamp, d.oilDeltaClamp, 0.05, 0.7),
    oilDeltaClampEdgeMul: readNumber(p.oilDeltaClampEdgeMul, d.oilDeltaClampEdgeMul, 0.05, 1),
    ...(() => {
      let lo = readNumber(p.oilEdgeAttenLo, d.oilEdgeAttenLo, 0.001, 0.25);
      let hi = readNumber(p.oilEdgeAttenHi, d.oilEdgeAttenHi, 0.05, 0.6);
      if (lo > hi) [lo, hi] = [hi, lo];
      return { oilEdgeAttenLo: lo, oilEdgeAttenHi: hi };
    })(),
    ...(() => {
      let lo = readNumber(p.oilDeltaBandLo, d.oilDeltaBandLo, 0.02, 0.35);
      let hi = readNumber(p.oilDeltaBandHi, d.oilDeltaBandHi, 0.12, 0.55);
      if (lo > hi) [lo, hi] = [hi, lo];
      return { oilDeltaBandLo: lo, oilDeltaBandHi: hi };
    })(),

    mistEnabled: readBool(p.mistEnabled, d.mistEnabled),
    mistIntensity: readNumber(p.mistIntensity, d.mistIntensity, 0, 2),
    mistDepthThreshold: readNumber(p.mistDepthThreshold, d.mistDepthThreshold, 0.0005, 0.25),
    mistSpreadPx: readNumber(p.mistSpreadPx, d.mistSpreadPx, 0, 32),
    mistColor: readColor3(p.mistColor, d.mistColor),
    mistTintStrength: readNumber(p.mistTintStrength, d.mistTintStrength, 0, 1),
    mistGlobal: readNumber(p.mistGlobal, d.mistGlobal, 0, 1),
    mistGeomEdgeScale: readNumber(p.mistGeomEdgeScale, d.mistGeomEdgeScale, 0, 2),
  };
}

export function getNprSettings(): NprSettings {
  let parsed: PartialNprBlob | null = null;
  try {
    const raw = window.localStorage.getItem(KEY_NPR);
    if (raw) {
      const j = JSON.parse(raw) as unknown;
      if (j && typeof j === 'object') parsed = j as PartialNprBlob;
    }
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
