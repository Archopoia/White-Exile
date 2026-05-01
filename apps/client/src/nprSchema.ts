/**
 * Declarative NPR field registry.
 *
 * Single source of truth for every tunable in {@link NprSettings}. One entry
 * here drives:
 *
 *   - parse / clamp from `localStorage` blobs (`nprSettings.ts`)
 *   - deep clone, equality, and snap-to-default-within-eps (`roomOptionsDefaults.ts`)
 *   - GLSL uniform binding in the post pipeline (`nprPost.ts`)
 *   - per-row UI generation, including dirty / revert (`options.ts`)
 *
 * Adding a new tunable = one new entry here, one new shader uniform line,
 * one new row in `options.ts`. Nothing else has to be touched.
 *
 * `NPR_STYLES` / `HATCH_PATTERNS` live here (not in `nprSettings.ts`) so this
 * module never imports `nprSettings` — avoids a circular init where
 * `NPR_FIELDS` referenced `NPR_STYLES` before `nprSettings` finished loading.
 */

/** NPR preset selector — serialized as the `style` field. */
export const NPR_STYLES = [
  'off',
  'toon',
  'moebius',
  'rembrandt',
  'painterly_toon',
  'custom',
] as const;
export type NprStyle = (typeof NPR_STYLES)[number];

/** Hatching pattern variants (shader maps these to discrete ints). */
export const HATCH_PATTERNS = ['tonal', 'crosshatch', 'raster'] as const;
export type HatchPattern = (typeof HATCH_PATTERNS)[number];

/* ─────────────── kind tags ─────────────── */

export interface BoolField {
  readonly kind: 'bool';
  readonly default: boolean;
}

export interface FloatField {
  readonly kind: 'float';
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

export interface IntField {
  readonly kind: 'int';
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

export interface Color3Field {
  readonly kind: 'color3';
  readonly default: readonly [number, number, number];
}

export interface EnumField<T extends string> {
  readonly kind: 'enum';
  readonly default: T;
  readonly values: ReadonlyArray<T>;
}

export type NprFieldDef =
  | BoolField
  | FloatField
  | IntField
  | Color3Field
  | EnumField<string>;

/**
 * Strongly-typed field map. The `key` of each entry is a value-type marker
 * so consumers can unify around a single map without losing type inference.
 *
 * NOTE: paired bands (e.g. `oilEdgeAttenLo` / `oilEdgeAttenHi`) are stored
 * here as plain floats; the lo<=hi swap is enforced once in `mergeNprFromPartialBlob`
 * (kept there because it's the only place we accept untrusted blobs).
 */
export const NPR_FIELDS = Object.freeze({
  enabled:               { kind: 'bool',  default: false } satisfies BoolField,
  style:                 { kind: 'enum',  default: 'off', values: NPR_STYLES } as EnumField<NprStyle>,

  outlineEnabled:        { kind: 'bool',  default: true  } satisfies BoolField,
  outlineThicknessPx:    { kind: 'float', default: 1.5,  min: 0.25, max: 8 } satisfies FloatField,
  outlineColor:          { kind: 'color3', default: [0, 0, 0] as const } satisfies Color3Field,
  outlineDepthWeight:    { kind: 'float', default: 25,   min: 0, max: 100 } satisfies FloatField,
  outlineMinFeaturePx:   { kind: 'float', default: 2.5,  min: 0, max: 16 } satisfies FloatField,
  outlineNearThinRelax:  { kind: 'float', default: 0.62, min: 0, max: 1 } satisfies FloatField,
  outlineNearDepthMax:   { kind: 'float', default: 0.26, min: 0.02, max: 0.6 } satisfies FloatField,

  wiggleEnabled:         { kind: 'bool',  default: true  } satisfies BoolField,
  wiggleFrequency:       { kind: 'float', default: 0.08, min: 0.001, max: 0.5 } satisfies FloatField,
  wiggleAmplitudePx:     { kind: 'float', default: 2,    min: 0, max: 8 } satisfies FloatField,
  wiggleIrregularity:    { kind: 'float', default: 0,    min: 0, max: 1 } satisfies FloatField,

  celEnabled:            { kind: 'bool',  default: false } satisfies BoolField,
  celSteps:              { kind: 'int',   default: 4,    min: 2, max: 12 } satisfies IntField,
  celStepSmoothness:     { kind: 'float', default: 0.22, min: 0, max: 1 } satisfies FloatField,
  celShadowTint:         { kind: 'color3', default: [0.55, 0.62, 0.85] as const } satisfies Color3Field,
  celShadowTintAmount:   { kind: 'float', default: 0,    min: 0, max: 1 } satisfies FloatField,
  celMinLight:           { kind: 'float', default: 0.06, min: 0, max: 0.5 } satisfies FloatField,
  celMix:                { kind: 'float', default: 1,    min: 0, max: 1 } satisfies FloatField,

  /** Screen-space feather for Three cast-shadow boundaries (luma Sobel on prepass, like cel edge width). */
  castShadowEdgeFade:    { kind: 'float', default: 0,    min: 0, max: 1 } satisfies FloatField,
  /** Wider = softer shadow silhouette (maps to smoothstep range on luma gradient). */
  castShadowEdgeSoftness: { kind: 'float', default: 0.32, min: 0.02, max: 1 } satisfies FloatField,

  hatchEnabled:          { kind: 'bool',  default: true  } satisfies BoolField,
  hatchPattern:          { kind: 'enum',  default: 'crosshatch', values: HATCH_PATTERNS } as EnumField<HatchPattern>,
  hatchModPx:            { kind: 'float', default: 8,    min: 2, max: 32 } satisfies FloatField,
  hatchLumaDark:         { kind: 'float', default: 0.35, min: 0, max: 1 } satisfies FloatField,
  hatchLumaMid:          { kind: 'float', default: 0.55, min: 0, max: 1 } satisfies FloatField,
  hatchLumaLight:        { kind: 'float', default: 0.8,  min: 0, max: 1 } satisfies FloatField,
  hatchCrossSteps:       { kind: 'int',   default: 6,    min: 3, max: 16 } satisfies IntField,
  tonalShadowLift:       { kind: 'float', default: 0.55, min: 0, max: 1 } satisfies FloatField,
  rasterCellPx:          { kind: 'float', default: 14,   min: 4, max: 64 } satisfies FloatField,

  oilEnabled:            { kind: 'bool',  default: false } satisfies BoolField,
  oilRadiusPx:           { kind: 'float', default: 3,    min: 1, max: 10 } satisfies FloatField,
  oilIntensity:          { kind: 'float', default: 0.8,  min: 0, max: 3 } satisfies FloatField,
  oilLumaEdgeSuppress:   { kind: 'float', default: 0.94, min: 0, max: 1 } satisfies FloatField,
  oilGeomEdgeSuppress:   { kind: 'float', default: 0.45, min: 0, max: 1 } satisfies FloatField,
  oilDarkBoost:          { kind: 'float', default: 0.18, min: 0, max: 0.4 } satisfies FloatField,
  oilMaxBlend:           { kind: 'float', default: 1.65, min: 0.25, max: 3 } satisfies FloatField,
  oilDeltaClamp:         { kind: 'float', default: 0.32, min: 0.05, max: 0.7 } satisfies FloatField,
  oilDeltaClampEdgeMul:  { kind: 'float', default: 0.375, min: 0.05, max: 1 } satisfies FloatField,
  oilEdgeAttenLo:        { kind: 'float', default: 0.03, min: 0.001, max: 0.25 } satisfies FloatField,
  oilEdgeAttenHi:        { kind: 'float', default: 0.22, min: 0.05, max: 0.6 } satisfies FloatField,
  oilDeltaBandLo:        { kind: 'float', default: 0.05, min: 0.02, max: 0.35 } satisfies FloatField,
  oilDeltaBandHi:        { kind: 'float', default: 0.28, min: 0.12, max: 0.55 } satisfies FloatField,

  mistEnabled:           { kind: 'bool',  default: false } satisfies BoolField,
  mistIntensity:         { kind: 'float', default: 0.6,  min: 0, max: 2 } satisfies FloatField,
  mistDepthThreshold:    { kind: 'float', default: 0.035, min: 0.0005, max: 0.25 } satisfies FloatField,
  mistSpreadPx:          { kind: 'float', default: 12,   min: 0, max: 32 } satisfies FloatField,
  mistColor:             { kind: 'color3', default: [0.03, 0.025, 0.02] as const } satisfies Color3Field,
  mistTintStrength:      { kind: 'float', default: 0.2,  min: 0, max: 1 } satisfies FloatField,
  mistGlobal:            { kind: 'float', default: 0,    min: 0, max: 1 } satisfies FloatField,
  mistGeomEdgeScale:     { kind: 'float', default: 0.38, min: 0, max: 2 } satisfies FloatField,
});

export type NprFieldKey = keyof typeof NPR_FIELDS;
export const NPR_FIELD_KEYS: ReadonlyArray<NprFieldKey> = Object.freeze(
  Object.keys(NPR_FIELDS) as NprFieldKey[],
);

/* ─────────────── kind-narrowed key helpers (used by `options.ts` row builders) ─────────────── */

type FieldKindOf<K extends NprFieldKey> = (typeof NPR_FIELDS)[K]['kind'];
export type NprBoolKey = { [K in NprFieldKey]: FieldKindOf<K> extends 'bool' ? K : never }[NprFieldKey];
export type NprFloatKey = {
  [K in NprFieldKey]: FieldKindOf<K> extends 'float' | 'int' ? K : never;
}[NprFieldKey];
export type NprColorKey = {
  [K in NprFieldKey]: FieldKindOf<K> extends 'color3' ? K : never;
}[NprFieldKey];

/* ─────────────── shared parsers ─────────────── */

export function clampFloat(value: unknown, def: FloatField | IntField): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return def.default;
  const v = Math.max(def.min, Math.min(def.max, value));
  return def.kind === 'int' ? Math.round(v) : v;
}

export function readBool(value: unknown, def: BoolField): boolean {
  return typeof value === 'boolean' ? value : def.default;
}

export function readColor3(
  value: unknown,
  def: Color3Field,
): [number, number, number] {
  const fb = def.default;
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return [
      Math.max(0, Math.min(1, value[0] as number)),
      Math.max(0, Math.min(1, value[1] as number)),
      Math.max(0, Math.min(1, value[2] as number)),
    ];
  }
  return [fb[0], fb[1], fb[2]];
}

export function readEnum<T extends string>(value: unknown, def: EnumField<T>): T {
  if (typeof value !== 'string') return def.default;
  return (def.values as ReadonlyArray<string>).includes(value) ? (value as T) : def.default;
}
