/**
 * ESC menu: player tunables (graphics, labels, display name) and a short
 * controls reference. No URL query parameters for tunables.
 */
import { FX_TIERS, LABEL_MODES, LABEL_MODE_LABEL } from './clientSettings.js';
import { type FxTier } from './flameLighting.js';
import {
  applyPreset,
  HATCH_PATTERNS,
  HATCH_PATTERN_LABEL,
  NPR_STYLES,
  NPR_STYLE_LABEL,
  type HatchPattern,
  type NprSettings,
  type NprStyle,
} from './nprSettings.js';
import {
  NPR_FIELDS,
  type NprBoolKey,
  type NprColorKey,
  type NprFloatKey,
} from './nprSchema.js';
import {
  buildCodeDefaultRoomOptionsSnapshot,
  buildRoomOptionsSnapshotFromInitial,
  cloneNprSettings,
  loadUserRevertBaseline,
  optionFloatDiffers,
  optionRgbDiffers,
  saveUserRevertBaseline,
  sceneFloatField,
  type RoomOptionsSnapshot,
  type SceneFloatKey,
  roomOptionsSnapshotEqual,
} from './roomOptionsDefaults.js';
import { type WorldLabelMode } from './tooltips.js';

import type { Race } from '@realtime-room/shared';

const FX_KNOB_LABEL: Readonly<Record<FxTier, string>> = Object.freeze({
  low: 'Low',
  med: 'Med',
  high: 'High',
});

const MAX_UNDO = 80;

export interface RoomOptionsCallbacks {
  onFxTierChange: (tier: FxTier) => void;
  onLabelModeChange: (mode: WorldLabelMode) => void;
  onFogChange: (enabled: boolean) => void;
  onFogDensityMulChange: (mul: number) => void;
  onFillLightMulChange: (mul: number) => void;
  onToneExposureChange: (exposure: number) => void;
  onSkyHazeMulChange: (mul: number) => void;
  onTorchReachMulChange: (mul: number) => void;
  onDisplayNameChange: (name: string) => void;
  /** Live client preview while dragging the dune scale slider. */
  onDuneHeightScalePreview: (scale: number) => void;
  /** Sent on slider release; server rebroadcasts authoritative `worldConfig`. */
  onDuneHeightScaleCommit: (scale: number) => void;
  /** Whole NPR settings bundle changed (preset switch or knob tweak). */
  onNprSettingsChange: (settings: NprSettings) => void;
  initial: {
    readonly fxTier: FxTier;
    readonly labelMode: WorldLabelMode;
    readonly fogEnabled: boolean;
    readonly fogDensityMul: number;
    readonly fillLightMul: number;
    readonly toneExposure: number;
    readonly skyHazeMul: number;
    /** Client-only multiplier on all player torch PointLight distances. */
    readonly torchReachMul: number;
    readonly displayName: string;
    readonly race: Race;
    readonly duneHeightScale: number;
    readonly nprSettings: NprSettings;
  };
}

export interface RoomOptionsOverlay {
  setOpen(open: boolean): void;
  syncDuneHeightScale(scale: number): void;
  dispose(): void;
}

const RACE_LABEL: Readonly<Record<Race, string>> = Object.freeze({
  emberfolk: 'Emberfolk',
  ashborn: 'Ashborn',
  'lumen-kin': 'Lumen Kin',
});

type TabId = 'general' | 'graphics' | 'npr' | 'help';

function cloneRoomOptionsSnapshot(s: RoomOptionsSnapshot): RoomOptionsSnapshot {
  return { ...s, npr: cloneNprSettings(s.npr) };
}

function settingRow(
  label: string,
  control: HTMLElement,
  revertRegistry: Array<() => void>,
  opts?: { dirty?: () => boolean; revert?: () => void },
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;align-items:center;gap:8px;margin-bottom:10px;min-height:28px;position:relative;isolation:isolate';
  if (opts?.dirty !== undefined && opts.revert !== undefined) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '↺';
    btn.setAttribute('aria-label', `Reset ${label} to code default`);
    btn.title = 'Reset to code default';
    btn.style.cssText =
      'flex:0 0 22px;width:22px;height:22px;padding:0;border-radius:4px;border:1px solid rgba(120,140,220,0.35);background:rgba(20,24,40,0.9);color:#b8c4ff;font-size:12px;line-height:1;cursor:pointer;visibility:hidden;position:relative;z-index:2';
    btn.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        opts.revert!();
      },
      true,
    );
    revertRegistry.push(() => {
      btn.style.visibility = opts.dirty!() ? 'visible' : 'hidden';
    });
    row.append(btn);
  } else {
    const sp = document.createElement('div');
    sp.style.cssText = 'flex:0 0 22px;width:22px';
    row.append(sp);
  }
  const lab = document.createElement('label');
  lab.textContent = label;
  lab.style.cssText = 'flex:0 0 64px;font-size:12px;opacity:0.82';
  control.style.flex = '1 1 auto';
  control.style.minWidth = '0';
  row.append(lab, control);
  return row;
}

function makeDiscreteKnob<T extends string>(
  values: ReadonlyArray<T>,
  valueLabels: Readonly<Record<T, string>>,
  value: T,
  onChange: (next: T) => void,
  onCommit?: () => void,
): { el: HTMLElement; setValueSilent: (next: T) => void } {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(values.length - 1);
  range.step = '1';
  const idx = Math.max(0, values.indexOf(value));
  range.value = String(idx);
  range.setAttribute('aria-valuetext', valueLabels[value]);
  range.style.cssText = [
    'flex:1',
    'min-width:64px',
    'height:4px',
    'accent-color:#5b7cff',
    'cursor:pointer',
  ].join(';');

  const badge = document.createElement('span');
  badge.textContent = valueLabels[value];
  badge.style.cssText = 'flex:0 0 76px;text-align:right;font-size:12px;opacity:0.92';

  const applyIndex = (i: number): void => {
    const v = values[i];
    if (v === undefined) return;
    badge.textContent = valueLabels[v];
    range.setAttribute('aria-valuetext', valueLabels[v]);
    onChange(v);
  };

  range.addEventListener('input', () => {
    applyIndex(Number(range.value));
  });
  range.addEventListener('change', () => {
    onCommit?.();
  });

  wrap.append(range, badge);
  return {
    el: wrap,
    setValueSilent: (next: T): void => {
      const i = Math.max(0, values.indexOf(next));
      range.value = String(i);
      const v = values[i];
      if (v === undefined) return;
      badge.textContent = valueLabels[v];
      range.setAttribute('aria-valuetext', valueLabels[v]);
    },
  };
}

const DUNE_SLIDER_MIN = 0.1;
const DUNE_SLIDER_MAX = 20;
const DUNE_SLIDER_STEP = 0.1;

function clampDuneSliderDisplay(v: number): number {
  const stepped =
    Math.round((v - DUNE_SLIDER_MIN) / DUNE_SLIDER_STEP) * DUNE_SLIDER_STEP + DUNE_SLIDER_MIN;
  return Math.min(DUNE_SLIDER_MAX, Math.max(DUNE_SLIDER_MIN, Number(stepped.toFixed(5))));
}

function makeDuneScaleKnob(
  value: number,
  onPreview: (scale: number) => void,
  onCommit: (scale: number) => void,
  onReleaseHistory?: () => void,
): { row: HTMLElement; sync: (scale: number) => void; input: HTMLInputElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(DUNE_SLIDER_MIN);
  range.max = String(DUNE_SLIDER_MAX);
  range.step = String(DUNE_SLIDER_STEP);
  range.value = String(clampDuneSliderDisplay(value));
  range.setAttribute('aria-valuemin', String(DUNE_SLIDER_MIN));
  range.setAttribute('aria-valuemax', String(DUNE_SLIDER_MAX));
  range.setAttribute('aria-label', 'Dune height scale');
  range.style.cssText = [
    'flex:1',
    'min-width:64px',
    'height:4px',
    'accent-color:#5b7cff',
    'cursor:pointer',
  ].join(';');

  const badge = document.createElement('span');
  badge.style.cssText = 'flex:0 0 44px;text-align:right;font-size:12px;opacity:0.92';

  const readScale = (): number => clampDuneSliderDisplay(Number(range.value));

  const setBadge = (s: number): void => {
    badge.textContent = s.toFixed(1);
    range.setAttribute('aria-valuetext', s.toFixed(1));
  };

  setBadge(readScale());

  range.addEventListener('input', () => {
    const s = readScale();
    setBadge(s);
    onPreview(s);
  });
  range.addEventListener('change', () => {
    const s = readScale();
    setBadge(s);
    onCommit(s);
    onReleaseHistory?.();
  });

  wrap.append(range, badge);

  return {
    row: wrap,
    sync: (scale: number): void => {
      if (document.activeElement === range) return;
      const s = clampDuneSliderDisplay(scale);
      range.value = String(s);
      setBadge(s);
    },
    input: range,
  };
}

function makeFloatSlider(
  min: number,
  max: number,
  step: number,
  value: number,
  decimals: number,
  onLive: (v: number) => void,
  onCommit?: () => void,
): { row: HTMLElement; input: HTMLInputElement; setValueSilent: (v: number) => void } {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  const clamped = Math.max(min, Math.min(max, value));
  range.value = String(clamped);
  range.style.cssText = [
    'flex:1',
    'min-width:64px',
    'height:4px',
    'accent-color:#5b7cff',
    'cursor:pointer',
  ].join(';');

  const badge = document.createElement('span');
  badge.style.cssText = 'flex:0 0 40px;text-align:right;font-size:12px;opacity:0.92';

  const fmt = (x: number): string => x.toFixed(decimals);
  const read = (): number => {
    const n = Number(range.value);
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  };

  const apply = (): void => {
    const v = read();
    badge.textContent = fmt(v);
    range.setAttribute('aria-valuetext', fmt(v));
    onLive(v);
  };

  badge.textContent = fmt(read());
  range.addEventListener('input', apply);
  range.addEventListener('change', () => {
    onCommit?.();
  });
  wrap.append(range, badge);
  return {
    row: wrap,
    input: range,
    setValueSilent: (v: number): void => {
      const c = Math.max(min, Math.min(max, v));
      range.value = String(c);
      badge.textContent = fmt(c);
      range.setAttribute('aria-valuetext', fmt(c));
    },
  };
}

function makeBoolToggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = value;
  cb.setAttribute('aria-label', label);
  cb.style.cssText = 'width:14px;height:14px;accent-color:#5b7cff;cursor:pointer;flex-shrink:0';
  cb.addEventListener('change', () => onChange(cb.checked));
  wrap.appendChild(cb);
  return wrap;
}

function colorToHexString(c: readonly [number, number, number]): string {
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hexStringToColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || m[1] === undefined) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function makeColorPicker(
  value: readonly [number, number, number],
  onLive: (c: [number, number, number]) => void,
  onCommit?: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = colorToHexString(value);
  input.style.cssText = 'width:36px;height:22px;border:1px solid rgba(120,140,220,0.35);background:transparent;cursor:pointer;padding:0';
  input.addEventListener('input', () => onLive(hexStringToColor(input.value)));
  input.addEventListener('change', () => onCommit?.());
  wrap.appendChild(input);
  return wrap;
}

function makeDetails(summary: string, body: HTMLElement, sectionId: string): HTMLElement {
  const det = document.createElement('details');
  det.dataset.nprSection = sectionId;
  det.style.cssText = 'margin-bottom:6px;border:1px solid rgba(120,140,220,0.18);border-radius:6px;background:rgba(20,24,36,0.6)';
  const sm = document.createElement('summary');
  sm.textContent = summary;
  sm.style.cssText = 'cursor:pointer;padding:5px 8px;font-size:11px;font-weight:600;opacity:0.92';
  det.appendChild(sm);
  const inner = document.createElement('div');
  inner.style.cssText = 'padding:6px 8px';
  inner.appendChild(body);
  det.appendChild(inner);
  return det;
}

interface NprPanelHandle {
  el: HTMLElement;
  sync: (s: NprSettings) => void;
  refreshReverts: () => void;
}

/**
 * NPR tab: preset + per-field controls. `emitLive` / `emitCommit` distinguish
 * slider drag vs release for undo history.
 */
function buildNprPanel(
  initial: NprSettings,
  hooks: { emitLive: (next: NprSettings) => void; emitCommit: (next: NprSettings) => void },
  revertBaselineRef: { snap: RoomOptionsSnapshot },
): NprPanelHandle {
  const br = (): NprSettings => revertBaselineRef.snap.npr;
  const nprRevertRefreshers: Array<() => void> = [];
  const rowRegNpr = (
    label: string,
    control: HTMLElement,
    opts?: { dirty?: () => boolean; revert?: () => void },
  ): HTMLElement => settingRow(label, control, nprRevertRefreshers, opts);

  const root = document.createElement('div');
  root.setAttribute('role', 'tabpanel');
  root.id = 'session-tab-npr';
  root.style.display = 'none';

  let current: NprSettings = cloneNprSettings(initial);

  const stylePicker = document.createElement('select');
  stylePicker.setAttribute('aria-label', 'NPR style');
  stylePicker.style.cssText =
    'flex:1;min-width:0;padding:4px 6px;background:#0c0e18;color:#e8eaff;border:1px solid rgba(120,140,220,0.35);border-radius:6px;font:12px system-ui,sans-serif;cursor:pointer';
  for (const s of NPR_STYLES) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = NPR_STYLE_LABEL[s];
    stylePicker.appendChild(o);
  }
  stylePicker.value = current.style;

  const enableWrap = makeBoolToggle('NPR enabled', current.enabled, (v) => {
    current = { ...current, enabled: v };
    rebuildBody();
    hooks.emitCommit(current);
  });

  const enableInput = enableWrap.querySelector('input');
  if (!enableInput) throw new Error('NPR enable checkbox missing');

  const body = document.createElement('div');

  const patch = (delta: Partial<NprSettings>): void => {
    current = { ...current, ...delta, style: 'custom' };
    stylePicker.value = 'custom';
    rebuildBody();
    hooks.emitCommit(current);
  };

  const nprHeaderRevertCount = 2;

  /**
   * Per-row helper closures. They read `current` / `br()` / `patch` from the
   * enclosing scope so a row is one declarative line. UI ranges are passed
   * inline because they're intentionally tighter than the data-validation
   * clamps in `nprSchema.ts` (e.g. `oilRadiusPx`: schema 1..10, UI 1..8).
   */
  const nprFloat = <K extends NprFloatKey>(
    label: string,
    key: K,
    min: number,
    max: number,
    step: number,
    decimals: number,
  ): HTMLElement => {
    const isInt = NPR_FIELDS[key].kind === 'int';
    return rowRegNpr(
      label,
      makeFloatSlider(
        min,
        max,
        step,
        current[key] as number,
        decimals,
        (v) => {
          const rv = isInt ? Math.round(v) : v;
          current = { ...current, [key]: rv, style: 'custom' } as NprSettings;
          stylePicker.value = 'custom';
          hooks.emitLive(current);
        },
        () => hooks.emitCommit(current),
      ).row,
      {
        dirty: () => optionFloatDiffers(current[key] as number, br()[key] as number),
        revert: () => patch({ [key]: br()[key] } as Partial<NprSettings>),
      },
    );
  };

  const nprBool = <K extends NprBoolKey>(label: string, ariaLabel: string, key: K): HTMLElement =>
    rowRegNpr(
      label,
      makeBoolToggle(ariaLabel, current[key], (v) => patch({ [key]: v } as Partial<NprSettings>)),
      {
        dirty: () => current[key] !== br()[key],
        revert: () => patch({ [key]: br()[key] } as Partial<NprSettings>),
      },
    );

  const nprColor = <K extends NprColorKey>(label: string, key: K): HTMLElement =>
    rowRegNpr(
      label,
      makeColorPicker(
        current[key],
        (c) => {
          current = { ...current, [key]: c, style: 'custom' } as NprSettings;
          stylePicker.value = 'custom';
          hooks.emitLive(current);
        },
        () => hooks.emitCommit(current),
      ),
      {
        dirty: () => optionRgbDiffers(current[key], br()[key]),
        revert: () => {
          const c = br()[key];
          patch({ [key]: [c[0], c[1], c[2]] } as Partial<NprSettings>);
        },
      },
    );

  const rebuildBody = (): void => {
    if (nprRevertRefreshers.length > nprHeaderRevertCount) {
      nprRevertRefreshers.splice(nprHeaderRevertCount);
    }
    const openSections = new Set<string>();
    for (const el of body.querySelectorAll<HTMLDetailsElement>('details[data-npr-section]')) {
      const id = el.dataset.nprSection;
      if (id && el.open) openSections.add(id);
    }
    body.innerHTML = '';

    const outlineBody = document.createElement('div');
    outlineBody.append(
      nprBool('On', 'Outline enabled', 'outlineEnabled'),
      nprFloat('Width', 'outlineThicknessPx', 0.25, 4, 0.05, 2),
      nprFloat('Depth ×', 'outlineDepthWeight', 0, 60, 0.5, 1),
      nprFloat('Thin', 'outlineMinFeaturePx', 0, 8, 0.25, 2),
      nprFloat('Near relax', 'outlineNearThinRelax', 0, 1, 0.02, 2),
      nprFloat('Near depth', 'outlineNearDepthMax', 0.04, 0.55, 0.01, 2),
      nprColor('Color', 'outlineColor'),
    );

    const celBody = document.createElement('div');
    celBody.append(
      nprBool('On', 'Cel enabled', 'celEnabled'),
      nprFloat('Steps', 'celSteps', 2, 12, 1, 0),
      nprFloat('Edge', 'celStepSmoothness', 0, 0.5, 0.01, 2),
      nprFloat('Floor', 'celMinLight', 0, 0.4, 0.01, 2),
      nprFloat('Mix', 'celMix', 0, 1, 0.05, 2),
      nprFloat('Tint ×', 'celShadowTintAmount', 0, 1, 0.05, 2),
      nprColor('Tint', 'celShadowTint'),
      nprFloat('Shadow fade', 'castShadowEdgeFade', 0, 1, 0.05, 2),
      nprFloat('Shadow edge', 'castShadowEdgeSoftness', 0.02, 1, 0.02, 2),
    );

    const hatchBody = document.createElement('div');
    const hatchPatternKnob = makeDiscreteKnob<HatchPattern>(
      HATCH_PATTERNS,
      HATCH_PATTERN_LABEL,
      current.hatchPattern,
      (next) => {
        current = { ...current, hatchPattern: next, style: 'custom' };
        stylePicker.value = 'custom';
        hooks.emitLive(current);
      },
      () => hooks.emitCommit(current),
    );
    hatchBody.append(
      nprBool('On', 'Hatch enabled', 'hatchEnabled'),
      rowRegNpr('Style', hatchPatternKnob.el, {
        dirty: () => current.hatchPattern !== br().hatchPattern,
        revert: () => patch({ hatchPattern: br().hatchPattern }),
      }),
      nprFloat('Step', 'hatchModPx', 2, 24, 0.5, 1),
      nprFloat('Cross steps', 'hatchCrossSteps', 3, 16, 1, 0),
      nprFloat('Dark', 'hatchLumaDark', 0, 1, 0.01, 2),
      nprFloat('Mid', 'hatchLumaMid', 0, 1, 0.01, 2),
      nprFloat('Light', 'hatchLumaLight', 0, 1, 0.01, 2),
      nprFloat('Lift', 'tonalShadowLift', 0, 1, 0.05, 2),
      nprFloat('Cell', 'rasterCellPx', 4, 32, 1, 0),
    );

    const oilEdgeBody = document.createElement('div');
    oilEdgeBody.append(
      nprFloat('Luma pull', 'oilLumaEdgeSuppress', 0, 1, 0.02, 2),
      nprFloat('Geom pull', 'oilGeomEdgeSuppress', 0, 1, 0.02, 2),
      nprFloat('Dark+', 'oilDarkBoost', 0, 0.4, 0.01, 2),
      nprFloat('Max blend', 'oilMaxBlend', 0.25, 3, 0.05, 2),
      nprFloat('Delta cap', 'oilDeltaClamp', 0.05, 0.7, 0.01, 2),
      nprFloat('Edge d x', 'oilDeltaClampEdgeMul', 0.05, 1, 0.025, 3),
      nprFloat('Atten lo', 'oilEdgeAttenLo', 0.001, 0.25, 0.005, 3),
      nprFloat('Atten hi', 'oilEdgeAttenHi', 0.05, 0.6, 0.01, 2),
      nprFloat('Cap lo', 'oilDeltaBandLo', 0.02, 0.35, 0.01, 2),
      nprFloat('Cap hi', 'oilDeltaBandHi', 0.12, 0.55, 0.01, 2),
    );
    const oilBody = document.createElement('div');
    oilBody.append(
      nprBool('On', 'Oil enabled', 'oilEnabled'),
      nprFloat('Radius', 'oilRadiusPx', 1, 8, 0.25, 2),
      nprFloat('Amount', 'oilIntensity', 0, 3, 0.05, 2),
      makeDetails('Oil - edge / anti-halo', oilEdgeBody, 'npr-oil-edge'),
    );

    const mistBody = document.createElement('div');
    mistBody.append(
      nprBool('On', 'Mist enabled', 'mistEnabled'),
      nprFloat('Amount', 'mistIntensity', 0, 2, 0.05, 2),
      nprFloat('Edge', 'mistDepthThreshold', 0.001, 0.25, 0.001, 3),
      nprFloat('Spread', 'mistSpreadPx', 0, 32, 0.5, 1),
      nprFloat('Tint ×', 'mistTintStrength', 0, 1, 0.05, 2),
      nprColor('Color', 'mistColor'),
      nprFloat('Geom', 'mistGeomEdgeScale', 0, 2, 0.05, 2),
    );

    const wiggleBody = document.createElement('div');
    wiggleBody.append(
      nprBool('On', 'Wiggle enabled', 'wiggleEnabled'),
      nprFloat('Freq', 'wiggleFrequency', 0.001, 0.3, 0.001, 3),
      nprFloat('Amp', 'wiggleAmplitudePx', 0, 6, 0.1, 2),
      nprFloat('Noise', 'wiggleIrregularity', 0, 1, 0.05, 2),
    );

    body.append(
      makeDetails('Outline (Toon / Moebius)', outlineBody, 'npr-outline'),
      makeDetails('Cel — stepped shadows', celBody, 'npr-cel'),
      makeDetails('Hatching (Moebius)', hatchBody, 'npr-hatch'),
      makeDetails('Oil (Rembrandt)', oilBody, 'npr-oil'),
      makeDetails('Mist (Rembrandt)', mistBody, 'npr-mist'),
      makeDetails('Hand-drawn wiggle', wiggleBody, 'npr-wiggle'),
    );
    for (const el of body.querySelectorAll<HTMLDetailsElement>('details[data-npr-section]')) {
      const id = el.dataset.nprSection;
      if (id && openSections.has(id)) el.open = true;
    }
  };

  stylePicker.addEventListener('change', () => {
    const next = stylePicker.value as NprStyle;
    current = applyPreset(current, next);
    rebuildBody();
    hooks.emitCommit(current);
  });

  root.append(
    rowRegNpr('NPR', enableWrap, {
      dirty: () => current.enabled !== br().enabled,
      revert: () => {
        current = { ...current, enabled: br().enabled };
        enableInput.checked = current.enabled;
        hooks.emitCommit(current);
      },
    }),
    rowRegNpr('Style', stylePicker, {
      dirty: () => current.style !== br().style || current.enabled !== br().enabled,
      revert: () => {
        current = cloneNprSettings(br());
        stylePicker.value = current.style;
        enableInput.checked = current.enabled;
        hooks.emitCommit(current);
        rebuildBody();
      },
    }),
    body,
  );
  rebuildBody();

  const sync = (s: NprSettings): void => {
    current = cloneNprSettings(s);
    stylePicker.value = current.style;
    enableInput.checked = current.enabled;
    rebuildBody();
  };

  const refreshReverts = (): void => {
    for (const fn of nprRevertRefreshers) fn();
  };

  return { el: root, sync, refreshReverts };
}

export function createRoomOptionsOverlay(cb: RoomOptionsCallbacks): RoomOptionsOverlay {
  const revertRefreshers: Array<() => void> = [];
  let nprPanelHandle: NprPanelHandle | null = null;
  const refreshRevertIndicators = (): void => {
    for (const fn of revertRefreshers) fn();
    nprPanelHandle?.refreshReverts();
  };

  const rowReg = (
    label: string,
    control: HTMLElement,
    opts?: { dirty?: () => boolean; revert?: () => void },
  ): HTMLElement => settingRow(label, control, revertRefreshers, opts);

  const revertBaselineRef: { snap: RoomOptionsSnapshot } = {
    snap: loadUserRevertBaseline() ?? buildCodeDefaultRoomOptionsSnapshot(),
  };
  const rb = (): RoomOptionsSnapshot => revertBaselineRef.snap;

  let live: RoomOptionsSnapshot = buildRoomOptionsSnapshotFromInitial({
    displayName: cb.initial.displayName,
    fxTier: cb.initial.fxTier,
    labelMode: cb.initial.labelMode,
    fogEnabled: cb.initial.fogEnabled,
    fogDensityMul: cb.initial.fogDensityMul,
    fillLightMul: cb.initial.fillLightMul,
    toneExposure: cb.initial.toneExposure,
    skyHazeMul: cb.initial.skyHazeMul,
    torchReachMul: cb.initial.torchReachMul,
    duneHeightScale: cb.initial.duneHeightScale,
    nprSettings: cb.initial.nprSettings,
  });

  let applyingFromHistory = false;
  const undoStack: RoomOptionsSnapshot[] = [cloneRoomOptionsSnapshot(live)];
  let undoPtr = 0;

  const captureSnapshot = (): RoomOptionsSnapshot => cloneRoomOptionsSnapshot(live);

  const recordHistory = (): void => {
    if (applyingFromHistory) return;
    const snap = captureSnapshot();
    if (undoStack.length > 0 && roomOptionsSnapshotEqual(snap, undoStack[undoPtr] ?? snap)) return;
    undoStack.splice(undoPtr + 1);
    undoStack.push(snap);
    undoPtr = undoStack.length - 1;
    if (undoStack.length > MAX_UNDO) {
      const drop = undoStack.length - MAX_UNDO;
      undoStack.splice(0, drop);
      undoPtr -= drop;
    }
    refreshRevertIndicators();
  };

  const pushToScene = (s: RoomOptionsSnapshot): void => {
    cb.onDisplayNameChange(s.displayName);
    cb.onFxTierChange(s.fxTier);
    cb.onLabelModeChange(s.labelMode);
    cb.onFogChange(s.fogEnabled);
    cb.onFogDensityMulChange(s.fogDensityMul);
    cb.onFillLightMulChange(s.fillLightMul);
    cb.onToneExposureChange(s.toneExposure);
    cb.onSkyHazeMulChange(s.skyHazeMul);
    cb.onTorchReachMulChange(s.torchReachMul);
    cb.onDuneHeightScalePreview(s.duneHeightScale);
    cb.onDuneHeightScaleCommit(s.duneHeightScale);
    cb.onNprSettingsChange(cloneNprSettings(s.npr));
  };

  const root = document.createElement('div');
  root.id = 'room-options';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Session');
  root.style.cssText = [
    'display:none',
    'position:fixed',
    'inset:0',
    'z-index:20',
    'box-sizing:border-box',
    'padding:16px',
    'align-items:flex-end',
    'justify-content:flex-start',
    'background:rgba(0,0,0,0.5)',
    'backdrop-filter:blur(3px)',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(92vw,340px)',
    'max-height:min(82vh,520px)',
    'overflow:hidden',
    'display:flex',
    'flex-direction:column',
    'padding:10px 12px 10px',
    'border-radius:10px',
    'background:rgba(12,14,24,0.96)',
    'border:1px solid rgba(120,140,220,0.32)',
    'color:#e8eaff',
    'font:12px/1.35 system-ui,sans-serif',
    'box-shadow:0 10px 32px rgba(0,0,0,0.42)',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px';

  const title = document.createElement('div');
  title.textContent = 'Session';
  title.style.cssText = 'font-weight:600;font-size:13px';

  const headerActions = document.createElement('div');
  headerActions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0';

  const saveBaselineBtn = document.createElement('button');
  saveBaselineBtn.type = 'button';
  saveBaselineBtn.textContent = 'Save';
  saveBaselineBtn.title =
    'Remember current values as the revert baseline for this browser (does not change repo defaults)';
  saveBaselineBtn.style.cssText =
    'padding:4px 10px;border-radius:6px;border:1px solid rgba(100,200,140,0.45);background:rgba(30,52,40,0.5);color:#c8f0d8;font-size:11px;cursor:pointer';
  saveBaselineBtn.addEventListener('click', () => {
    revertBaselineRef.snap = cloneRoomOptionsSnapshot(live);
    saveUserRevertBaseline(revertBaselineRef.snap);
    refreshRevertIndicators();
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.style.cssText =
    'padding:4px 10px;border-radius:6px;border:1px solid rgba(120,140,220,0.4);background:transparent;color:#e8eaff;font-size:11px;cursor:pointer';
  closeBtn.addEventListener('click', () => {
    root.style.display = 'none';
  });

  headerActions.append(saveBaselineBtn, closeBtn);
  header.append(title, headerActions);

  const tabList = document.createElement('div');
  tabList.setAttribute('role', 'tablist');
  tabList.style.cssText = 'display:flex;gap:2px;margin-bottom:8px';

  const tabPanels = document.createElement('div');
  tabPanels.style.cssText = 'flex:1;overflow:auto;min-height:0;padding:2px 0 4px';

  const tabs: { id: TabId; button: HTMLButtonElement; panel: HTMLElement }[] = [];

  const panelGeneral = document.createElement('div');
  panelGeneral.setAttribute('role', 'tabpanel');
  panelGeneral.id = 'session-tab-general';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 24;
  nameInput.value = live.displayName;
  nameInput.autocomplete = 'username';
  nameInput.style.cssText =
    'width:100%;box-sizing:border-box;padding:5px 8px;background:#0c0e18;color:#e8eaff;border:1px solid rgba(120,140,220,0.35);border-radius:6px;font:12px system-ui,sans-serif';
  nameInput.addEventListener('input', () => {
    live.displayName = nameInput.value;
    cb.onDisplayNameChange(live.displayName);
    refreshRevertIndicators();
  });
  nameInput.addEventListener('change', () => {
    recordHistory();
  });

  const raceBadge = document.createElement('div');
  raceBadge.textContent = RACE_LABEL[cb.initial.race];
  raceBadge.style.cssText =
    'padding:5px 8px;background:#0c0e18;color:#e8eaff;border:1px solid rgba(120,140,220,0.22);border-radius:6px;font:12px system-ui,sans-serif;opacity:0.88';

  panelGeneral.append(
    rowReg('Name', nameInput, {
      dirty: () => live.displayName !== rb().displayName,
      revert: () => {
        live.displayName = rb().displayName;
        nameInput.value = live.displayName;
        cb.onDisplayNameChange(live.displayName);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Race', raceBadge),
  );

  const panelGraphics = document.createElement('div');
  panelGraphics.setAttribute('role', 'tabpanel');
  panelGraphics.id = 'session-tab-graphics';
  panelGraphics.style.display = 'none';

  /** Numeric scalar fields on the snapshot driven by a {@link makeFloatSlider}. */
  type GfxFloatKey = SceneFloatKey;

  /** Discrete knob fields (string enum) — unified to share the same revert path. */
  type GfxKnobKey = 'fxTier' | 'labelMode';

  interface GfxFloatHandle {
    readonly row: HTMLElement;
    readonly setValueSilent: (v: number) => void;
    readonly input: HTMLInputElement;
  }

  const gfxFloatSyncs: Array<(snap: RoomOptionsSnapshot) => void> = [];
  const gfxKnobSyncs: Array<(snap: RoomOptionsSnapshot) => void> = [];

  /**
   * One graphics float row, fully driven by the {@link sceneFloatField} manifest
   * (label + slider min/max/step/decimals come from there). Creates the slider,
   * registers a revert button + dirty indicator, and records its
   * `setValueSilent` for {@link applySnapshot}. Caller still owns `apply`
   * because callbacks live in `RoomOptionsCallbacks`.
   */
  const gfxFloat = (key: GfxFloatKey, apply: (v: number) => void): GfxFloatHandle => {
    const f = sceneFloatField(key);
    const slider = makeFloatSlider(
      f.slider.min,
      f.slider.max,
      f.slider.step,
      live[key],
      f.slider.decimals,
      (v) => {
        live[key] = v;
        apply(v);
        refreshRevertIndicators();
      },
      recordHistory,
    );
    gfxFloatSyncs.push((snap) => slider.setValueSilent(snap[key]));
    const row = rowReg(f.label, slider.row, {
      dirty: () => optionFloatDiffers(live[key], rb()[key]),
      revert: () => {
        const v = rb()[key];
        live[key] = v;
        slider.setValueSilent(v);
        apply(v);
        recordHistory();
        refreshRevertIndicators();
      },
    });
    return { row, setValueSilent: slider.setValueSilent, input: slider.input };
  };

  /** Generic knob row helper for `fxTier` / `labelMode`. */
  const gfxKnob = <T extends string>(
    key: GfxKnobKey,
    label: string,
    values: ReadonlyArray<T>,
    valueLabels: Readonly<Record<T, string>>,
    apply: (v: T) => void,
  ): { row: HTMLElement; setValueSilent: (v: T) => void } => {
    const knob = makeDiscreteKnob(values, valueLabels, live[key] as T, (next) => {
      (live[key] as T) = next;
      apply(next);
    }, recordHistory);
    gfxKnobSyncs.push((snap) => knob.setValueSilent(snap[key] as T));
    const row = rowReg(label, knob.el, {
      dirty: () => live[key] !== rb()[key],
      revert: () => {
        const v = rb()[key] as T;
        (live[key] as T) = v;
        knob.setValueSilent(v);
        apply(v);
        recordHistory();
        refreshRevertIndicators();
      },
    });
    return { row, setValueSilent: knob.setValueSilent };
  };

  const fxKnob = gfxKnob('fxTier', 'Quality', FX_TIERS, FX_KNOB_LABEL, cb.onFxTierChange);
  const labelKnob = gfxKnob('labelMode', 'Labels', LABEL_MODES, LABEL_MODE_LABEL, cb.onLabelModeChange);

  const duneKnob = makeDuneScaleKnob(
    live.duneHeightScale,
    (scale) => {
      live.duneHeightScale = scale;
      cb.onDuneHeightScalePreview(scale);
      refreshRevertIndicators();
    },
    (scale) => {
      live.duneHeightScale = scale;
      cb.onDuneHeightScaleCommit(scale);
    },
    recordHistory,
  );

  // Fog enable + dependent density slider keep their own glue (the slider's
  // `disabled` state mirrors the toggle).
  const fogWrap = document.createElement('div');
  fogWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  const fogCheck = document.createElement('input');
  fogCheck.type = 'checkbox';
  fogCheck.checked = live.fogEnabled;
  fogCheck.setAttribute('aria-label', 'Distance fog on');
  fogCheck.title = 'Exponential zone fog';
  fogCheck.style.cssText = 'width:16px;height:16px;accent-color:#5b7cff;cursor:pointer;flex-shrink:0';
  fogWrap.appendChild(fogCheck);

  const fogDensityRow = gfxFloat('fogDensityMul', cb.onFogDensityMulChange);
  fogDensityRow.input.disabled = !live.fogEnabled;
  fogCheck.addEventListener('change', () => {
    live.fogEnabled = fogCheck.checked;
    cb.onFogChange(live.fogEnabled);
    fogDensityRow.input.disabled = !live.fogEnabled;
    recordHistory();
    refreshRevertIndicators();
  });

  const fillRow = gfxFloat('fillLightMul', cb.onFillLightMulChange);
  const exposureRow = gfxFloat('toneExposure', cb.onToneExposureChange);
  const skyHazeRow = gfxFloat('skyHazeMul', cb.onSkyHazeMulChange);
  const torchReachRow = gfxFloat('torchReachMul', cb.onTorchReachMulChange);

  panelGraphics.append(
    fxKnob.row,
    labelKnob.row,
    rowReg('Fog', fogWrap, {
      dirty: () => live.fogEnabled !== rb().fogEnabled,
      revert: () => {
        live.fogEnabled = rb().fogEnabled;
        fogCheck.checked = live.fogEnabled;
        cb.onFogChange(live.fogEnabled);
        fogDensityRow.input.disabled = !live.fogEnabled;
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    fogDensityRow.row,
    fillRow.row,
    exposureRow.row,
    skyHazeRow.row,
    torchReachRow.row,
    rowReg('Dunes', duneKnob.row, {
      dirty: () => optionFloatDiffers(live.duneHeightScale, rb().duneHeightScale),
      revert: () => {
        live.duneHeightScale = rb().duneHeightScale;
        duneKnob.sync(live.duneHeightScale);
        cb.onDuneHeightScalePreview(live.duneHeightScale);
        cb.onDuneHeightScaleCommit(live.duneHeightScale);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
  );

  nprPanelHandle = buildNprPanel(
    live.npr,
    {
      emitLive: (next) => {
        live.npr = cloneNprSettings(next);
        cb.onNprSettingsChange(live.npr);
        refreshRevertIndicators();
      },
      emitCommit: (next) => {
        live.npr = cloneNprSettings(next);
        cb.onNprSettingsChange(live.npr);
        if (!applyingFromHistory) recordHistory();
        refreshRevertIndicators();
      },
    },
    revertBaselineRef,
  );
  const nprPanel = nprPanelHandle;

  const panelHelp = document.createElement('div');
  panelHelp.setAttribute('role', 'tabpanel');
  panelHelp.id = 'session-tab-help';
  panelHelp.style.display = 'none';

  const helpUl = document.createElement('ul');
  helpUl.style.cssText = 'margin:0;padding-left:1.15em;font-size:11px;line-height:1.45;opacity:0.88';
  const lines = [
    'Click view — look (Esc frees cursor)',
    'RMB drag — orbit · Wheel — zoom',
    'WASD — move',
    'R — rescue · F — ruin · T — labels',
    'Ctrl+Z / Ctrl+Y — undo / redo option changes',
    'Save — sets per-row revert baseline (this browser only)',
  ];
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    helpUl.appendChild(li);
  }
  panelHelp.appendChild(helpUl);

  const applySnapshot = (snap: RoomOptionsSnapshot): void => {
    applyingFromHistory = true;
    try {
      live = cloneRoomOptionsSnapshot(snap);
      nameInput.value = live.displayName;
      for (const sync of gfxKnobSyncs) sync(live);
      for (const sync of gfxFloatSyncs) sync(live);
      fogCheck.checked = live.fogEnabled;
      fogDensityRow.input.disabled = !live.fogEnabled;
      duneKnob.sync(live.duneHeightScale);
      nprPanel.sync(live.npr);
      pushToScene(live);
    } finally {
      applyingFromHistory = false;
    }
    refreshRevertIndicators();
  };

  const undo = (): void => {
    if (undoPtr <= 0) return;
    undoPtr -= 1;
    const snap = undoStack[undoPtr];
    if (snap) applySnapshot(snap);
  };

  const redo = (): void => {
    if (undoPtr >= undoStack.length - 1) return;
    undoPtr += 1;
    const snap = undoStack[undoPtr];
    if (snap) applySnapshot(snap);
  };

  const setTab = (id: TabId): void => {
    const livePreviewTab = id === 'graphics' || id === 'npr';
    root.style.background = livePreviewTab ? 'transparent' : 'rgba(0,0,0,0.5)';
    root.style.backdropFilter = livePreviewTab ? 'none' : 'blur(3px)';

    for (const t of tabs) {
      const on = t.id === id;
      t.button.setAttribute('aria-selected', on ? 'true' : 'false');
      t.button.tabIndex = on ? 0 : -1;
      t.button.style.cssText = on
        ? 'flex:1;padding:6px 8px;border-radius:6px 6px 0 0;border:1px solid rgba(120,140,220,0.35);border-bottom:none;background:rgba(30,34,52,0.95);color:#e8eaff;font-size:11px;font-weight:600;cursor:pointer'
        : 'flex:1;padding:6px 8px;border-radius:6px 6px 0 0;border:1px solid transparent;background:transparent;color:#a8b0d0;font-size:11px;cursor:pointer';
      t.panel.style.display = on ? 'block' : 'none';
      t.panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    const focusEl =
      id === 'general'
        ? nameInput
        : id === 'graphics'
          ? panelGraphics.querySelector('input[type="range"]')
          : tabList.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
    if (focusEl instanceof HTMLElement) setTimeout(() => focusEl.focus(), 0);
    refreshRevertIndicators();
  };

  const mkTab = (id: TabId, label: string, panel: HTMLElement): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    button.id = `session-tabbtn-${id}`;
    panel.setAttribute('aria-labelledby', button.id);
    button.textContent = label;
    button.addEventListener('click', () => setTab(id));
    tabs.push({ id, button, panel });
    tabList.appendChild(button);
    tabPanels.appendChild(panel);
  };

  mkTab('general', 'General', panelGeneral);
  mkTab('graphics', 'Graphics', panelGraphics);
  mkTab('npr', 'NPR', nprPanel.el);
  mkTab('help', 'Help', panelHelp);

  panel.append(header, tabList, tabPanels);
  root.append(panel);
  document.body.append(root);

  setTab('general');
  refreshRevertIndicators();

  root.addEventListener('click', (e) => {
    if (e.target === root) root.style.display = 'none';
  });

  const onWindowKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault();
      const isOpen = root.style.display === 'flex';
      if (isOpen) {
        root.style.display = 'none';
      } else {
        root.style.display = 'flex';
        setTab('general');
      }
      return;
    }
    if (root.style.display !== 'flex') return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      undo();
      return;
    }
    if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      redo();
    }
  };
  /** Capture so Ctrl+Z/Y reach us before browser / `<details>` defaults. */
  window.addEventListener('keydown', onWindowKey, true);

  return {
    setOpen(open: boolean): void {
      root.style.display = open ? 'flex' : 'none';
      if (open) setTab('general');
    },
    syncDuneHeightScale(scale: number): void {
      live.duneHeightScale = scale;
      duneKnob.sync(scale);
      refreshRevertIndicators();
    },
    dispose(): void {
      window.removeEventListener('keydown', onWindowKey, true);
      root.remove();
    },
  };
}
