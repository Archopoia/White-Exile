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
  NPR_DEFAULTS,
  NPR_STYLES,
  NPR_STYLE_LABEL,
  type HatchPattern,
  type NprSettings,
  type NprStyle,
} from './nprSettings.js';
import {
  buildRoomOptionsSnapshotFromInitial,
  cloneNprSettings,
  CODE_DEFAULT_DISPLAY_NAME,
  CODE_DEFAULT_DUNE_HEIGHT_SCALE,
  CODE_DEFAULT_FILL_LIGHT_MUL,
  CODE_DEFAULT_FOG_DENSITY_MUL,
  CODE_DEFAULT_FOG_ENABLED,
  CODE_DEFAULT_FX_TIER,
  CODE_DEFAULT_LABEL_MODE,
  CODE_DEFAULT_SKY_HAZE_MUL,
  CODE_DEFAULT_TONE_EXPOSURE,
  CODE_DEFAULT_TORCH_REACH_MUL,
  type RoomOptionsSnapshot,
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

function makeDetails(summary: string, body: HTMLElement): HTMLElement {
  const det = document.createElement('details');
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
): NprPanelHandle {
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

  const rebuildBody = (): void => {
    if (nprRevertRefreshers.length > nprHeaderRevertCount) {
      nprRevertRefreshers.splice(nprHeaderRevertCount);
    }
    body.innerHTML = '';
    const s = current;

    const outlineBody = document.createElement('div');
    outlineBody.append(
      rowRegNpr('On', makeBoolToggle('Outline enabled', s.outlineEnabled, (v) => patch({ outlineEnabled: v })), {
        dirty: () => current.outlineEnabled !== NPR_DEFAULTS.outlineEnabled,
        revert: () => patch({ outlineEnabled: NPR_DEFAULTS.outlineEnabled }),
      }),
      rowRegNpr(
        'Width',
        makeFloatSlider(
          0.25,
          4,
          0.05,
          s.outlineThicknessPx,
          2,
          (v) => {
            current = { ...current, outlineThicknessPx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.outlineThicknessPx !== NPR_DEFAULTS.outlineThicknessPx,
          revert: () => patch({ outlineThicknessPx: NPR_DEFAULTS.outlineThicknessPx }),
        },
      ),
      rowRegNpr(
        'Depth ×',
        makeFloatSlider(
          0,
          60,
          0.5,
          s.outlineDepthWeight,
          1,
          (v) => {
            current = { ...current, outlineDepthWeight: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.outlineDepthWeight !== NPR_DEFAULTS.outlineDepthWeight,
          revert: () => patch({ outlineDepthWeight: NPR_DEFAULTS.outlineDepthWeight }),
        },
      ),
      rowRegNpr(
        'Thin',
        makeFloatSlider(
          0,
          8,
          0.25,
          s.outlineMinFeaturePx,
          2,
          (v) => {
            current = { ...current, outlineMinFeaturePx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.outlineMinFeaturePx !== NPR_DEFAULTS.outlineMinFeaturePx,
          revert: () => patch({ outlineMinFeaturePx: NPR_DEFAULTS.outlineMinFeaturePx }),
        },
      ),
      rowRegNpr(
        'Color',
        makeColorPicker(
          s.outlineColor,
          (c) => {
            current = { ...current, outlineColor: c, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ),
        {
          dirty: () =>
            current.outlineColor[0] !== NPR_DEFAULTS.outlineColor[0] ||
            current.outlineColor[1] !== NPR_DEFAULTS.outlineColor[1] ||
            current.outlineColor[2] !== NPR_DEFAULTS.outlineColor[2],
          revert: () =>
            patch({
              outlineColor: [NPR_DEFAULTS.outlineColor[0], NPR_DEFAULTS.outlineColor[1], NPR_DEFAULTS.outlineColor[2]],
            }),
        },
      ),
    );

    const celBody = document.createElement('div');
    celBody.append(
      rowRegNpr('On', makeBoolToggle('Cel enabled', s.celEnabled, (v) => patch({ celEnabled: v })), {
        dirty: () => current.celEnabled !== NPR_DEFAULTS.celEnabled,
        revert: () => patch({ celEnabled: NPR_DEFAULTS.celEnabled }),
      }),
      rowRegNpr(
        'Steps',
        makeFloatSlider(
          2,
          12,
          1,
          s.celSteps,
          0,
          (v) => {
            current = { ...current, celSteps: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        { dirty: () => current.celSteps !== NPR_DEFAULTS.celSteps, revert: () => patch({ celSteps: NPR_DEFAULTS.celSteps }) },
      ),
      rowRegNpr(
        'Edge',
        makeFloatSlider(
          0,
          0.5,
          0.01,
          s.celStepSmoothness,
          2,
          (v) => {
            current = { ...current, celStepSmoothness: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.celStepSmoothness !== NPR_DEFAULTS.celStepSmoothness,
          revert: () => patch({ celStepSmoothness: NPR_DEFAULTS.celStepSmoothness }),
        },
      ),
      rowRegNpr(
        'Floor',
        makeFloatSlider(
          0,
          0.4,
          0.01,
          s.celMinLight,
          2,
          (v) => {
            current = { ...current, celMinLight: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        { dirty: () => current.celMinLight !== NPR_DEFAULTS.celMinLight, revert: () => patch({ celMinLight: NPR_DEFAULTS.celMinLight }) },
      ),
      rowRegNpr(
        'Mix',
        makeFloatSlider(
          0,
          1,
          0.05,
          s.celMix,
          2,
          (v) => {
            current = { ...current, celMix: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        { dirty: () => current.celMix !== NPR_DEFAULTS.celMix, revert: () => patch({ celMix: NPR_DEFAULTS.celMix }) },
      ),
      rowRegNpr(
        'Tint ×',
        makeFloatSlider(
          0,
          1,
          0.05,
          s.celShadowTintAmount,
          2,
          (v) => {
            current = { ...current, celShadowTintAmount: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.celShadowTintAmount !== NPR_DEFAULTS.celShadowTintAmount,
          revert: () => patch({ celShadowTintAmount: NPR_DEFAULTS.celShadowTintAmount }),
        },
      ),
      rowRegNpr(
        'Tint',
        makeColorPicker(
          s.celShadowTint,
          (c) => {
            current = { ...current, celShadowTint: c, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ),
        {
          dirty: () =>
            current.celShadowTint[0] !== NPR_DEFAULTS.celShadowTint[0] ||
            current.celShadowTint[1] !== NPR_DEFAULTS.celShadowTint[1] ||
            current.celShadowTint[2] !== NPR_DEFAULTS.celShadowTint[2],
          revert: () =>
            patch({
              celShadowTint: [
                NPR_DEFAULTS.celShadowTint[0],
                NPR_DEFAULTS.celShadowTint[1],
                NPR_DEFAULTS.celShadowTint[2],
              ],
            }),
        },
      ),
    );

    const hatchBody = document.createElement('div');
    const hatchPatternKnob = makeDiscreteKnob<HatchPattern>(
      HATCH_PATTERNS,
      HATCH_PATTERN_LABEL,
      s.hatchPattern,
      (next) => {
        current = { ...current, hatchPattern: next, style: 'custom' };
        stylePicker.value = 'custom';
        hooks.emitLive(current);
      },
      () => hooks.emitCommit(current),
    );
    hatchBody.append(
      rowRegNpr('On', makeBoolToggle('Hatch enabled', s.hatchEnabled, (v) => patch({ hatchEnabled: v })), {
        dirty: () => current.hatchEnabled !== NPR_DEFAULTS.hatchEnabled,
        revert: () => patch({ hatchEnabled: NPR_DEFAULTS.hatchEnabled }),
      }),
      rowRegNpr('Style', hatchPatternKnob.el, {
        dirty: () => current.hatchPattern !== NPR_DEFAULTS.hatchPattern,
        revert: () => patch({ hatchPattern: NPR_DEFAULTS.hatchPattern }),
      }),
      rowRegNpr(
        'Step',
        makeFloatSlider(
          2,
          24,
          0.5,
          s.hatchModPx,
          1,
          (v) => {
            current = { ...current, hatchModPx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        { dirty: () => current.hatchModPx !== NPR_DEFAULTS.hatchModPx, revert: () => patch({ hatchModPx: NPR_DEFAULTS.hatchModPx }) },
      ),
      rowRegNpr(
        'Dark',
        makeFloatSlider(
          0,
          1,
          0.01,
          s.hatchLumaDark,
          2,
          (v) => {
            current = { ...current, hatchLumaDark: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.hatchLumaDark !== NPR_DEFAULTS.hatchLumaDark,
          revert: () => patch({ hatchLumaDark: NPR_DEFAULTS.hatchLumaDark }),
        },
      ),
      rowRegNpr(
        'Mid',
        makeFloatSlider(
          0,
          1,
          0.01,
          s.hatchLumaMid,
          2,
          (v) => {
            current = { ...current, hatchLumaMid: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.hatchLumaMid !== NPR_DEFAULTS.hatchLumaMid,
          revert: () => patch({ hatchLumaMid: NPR_DEFAULTS.hatchLumaMid }),
        },
      ),
      rowRegNpr(
        'Light',
        makeFloatSlider(
          0,
          1,
          0.01,
          s.hatchLumaLight,
          2,
          (v) => {
            current = { ...current, hatchLumaLight: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.hatchLumaLight !== NPR_DEFAULTS.hatchLumaLight,
          revert: () => patch({ hatchLumaLight: NPR_DEFAULTS.hatchLumaLight }),
        },
      ),
      rowRegNpr(
        'Lift',
        makeFloatSlider(
          0,
          1,
          0.05,
          s.tonalShadowLift,
          2,
          (v) => {
            current = { ...current, tonalShadowLift: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.tonalShadowLift !== NPR_DEFAULTS.tonalShadowLift,
          revert: () => patch({ tonalShadowLift: NPR_DEFAULTS.tonalShadowLift }),
        },
      ),
      rowRegNpr(
        'Cell',
        makeFloatSlider(
          4,
          32,
          1,
          s.rasterCellPx,
          0,
          (v) => {
            current = { ...current, rasterCellPx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.rasterCellPx !== NPR_DEFAULTS.rasterCellPx,
          revert: () => patch({ rasterCellPx: NPR_DEFAULTS.rasterCellPx }),
        },
      ),
    );

    const oilBody = document.createElement('div');
    const oilEdgeBody = document.createElement('div');
    oilEdgeBody.append(
      rowRegNpr(
        'Luma pull',
        makeFloatSlider(
          0,
          1,
          0.02,
          s.oilLumaEdgeSuppress,
          2,
          (v) => {
            current = { ...current, oilLumaEdgeSuppress: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilLumaEdgeSuppress !== NPR_DEFAULTS.oilLumaEdgeSuppress,
          revert: () => patch({ oilLumaEdgeSuppress: NPR_DEFAULTS.oilLumaEdgeSuppress }),
        },
      ),
      rowRegNpr(
        'Geom pull',
        makeFloatSlider(
          0,
          1,
          0.02,
          s.oilGeomEdgeSuppress,
          2,
          (v) => {
            current = { ...current, oilGeomEdgeSuppress: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilGeomEdgeSuppress !== NPR_DEFAULTS.oilGeomEdgeSuppress,
          revert: () => patch({ oilGeomEdgeSuppress: NPR_DEFAULTS.oilGeomEdgeSuppress }),
        },
      ),
      rowRegNpr(
        'Dark+',
        makeFloatSlider(
          0,
          0.4,
          0.01,
          s.oilDarkBoost,
          2,
          (v) => {
            current = { ...current, oilDarkBoost: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilDarkBoost !== NPR_DEFAULTS.oilDarkBoost,
          revert: () => patch({ oilDarkBoost: NPR_DEFAULTS.oilDarkBoost }),
        },
      ),
      rowRegNpr(
        'Max blend',
        makeFloatSlider(
          0.25,
          3,
          0.05,
          s.oilMaxBlend,
          2,
          (v) => {
            current = { ...current, oilMaxBlend: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilMaxBlend !== NPR_DEFAULTS.oilMaxBlend,
          revert: () => patch({ oilMaxBlend: NPR_DEFAULTS.oilMaxBlend }),
        },
      ),
      rowRegNpr(
        'Delta cap',
        makeFloatSlider(
          0.05,
          0.7,
          0.01,
          s.oilDeltaClamp,
          2,
          (v) => {
            current = { ...current, oilDeltaClamp: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilDeltaClamp !== NPR_DEFAULTS.oilDeltaClamp,
          revert: () => patch({ oilDeltaClamp: NPR_DEFAULTS.oilDeltaClamp }),
        },
      ),
      rowRegNpr(
        'Edge d x',
        makeFloatSlider(
          0.05,
          1,
          0.025,
          s.oilDeltaClampEdgeMul,
          3,
          (v) => {
            current = { ...current, oilDeltaClampEdgeMul: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilDeltaClampEdgeMul !== NPR_DEFAULTS.oilDeltaClampEdgeMul,
          revert: () => patch({ oilDeltaClampEdgeMul: NPR_DEFAULTS.oilDeltaClampEdgeMul }),
        },
      ),
      rowRegNpr(
        'Atten lo',
        makeFloatSlider(
          0.001,
          0.25,
          0.005,
          s.oilEdgeAttenLo,
          3,
          (v) => {
            current = { ...current, oilEdgeAttenLo: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilEdgeAttenLo !== NPR_DEFAULTS.oilEdgeAttenLo,
          revert: () => patch({ oilEdgeAttenLo: NPR_DEFAULTS.oilEdgeAttenLo }),
        },
      ),
      rowRegNpr(
        'Atten hi',
        makeFloatSlider(
          0.05,
          0.6,
          0.01,
          s.oilEdgeAttenHi,
          2,
          (v) => {
            current = { ...current, oilEdgeAttenHi: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilEdgeAttenHi !== NPR_DEFAULTS.oilEdgeAttenHi,
          revert: () => patch({ oilEdgeAttenHi: NPR_DEFAULTS.oilEdgeAttenHi }),
        },
      ),
      rowRegNpr(
        'Cap lo',
        makeFloatSlider(
          0.02,
          0.35,
          0.01,
          s.oilDeltaBandLo,
          2,
          (v) => {
            current = { ...current, oilDeltaBandLo: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilDeltaBandLo !== NPR_DEFAULTS.oilDeltaBandLo,
          revert: () => patch({ oilDeltaBandLo: NPR_DEFAULTS.oilDeltaBandLo }),
        },
      ),
      rowRegNpr(
        'Cap hi',
        makeFloatSlider(
          0.12,
          0.55,
          0.01,
          s.oilDeltaBandHi,
          2,
          (v) => {
            current = { ...current, oilDeltaBandHi: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilDeltaBandHi !== NPR_DEFAULTS.oilDeltaBandHi,
          revert: () => patch({ oilDeltaBandHi: NPR_DEFAULTS.oilDeltaBandHi }),
        },
      ),
    );
    oilBody.append(
      rowRegNpr('On', makeBoolToggle('Oil enabled', s.oilEnabled, (v) => patch({ oilEnabled: v })), {
        dirty: () => current.oilEnabled !== NPR_DEFAULTS.oilEnabled,
        revert: () => patch({ oilEnabled: NPR_DEFAULTS.oilEnabled }),
      }),
      rowRegNpr(
        'Radius',
        makeFloatSlider(
          1,
          8,
          0.25,
          s.oilRadiusPx,
          2,
          (v) => {
            current = { ...current, oilRadiusPx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilRadiusPx !== NPR_DEFAULTS.oilRadiusPx,
          revert: () => patch({ oilRadiusPx: NPR_DEFAULTS.oilRadiusPx }),
        },
      ),
      rowRegNpr(
        'Amount',
        makeFloatSlider(
          0,
          3,
          0.05,
          s.oilIntensity,
          2,
          (v) => {
            current = { ...current, oilIntensity: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.oilIntensity !== NPR_DEFAULTS.oilIntensity,
          revert: () => patch({ oilIntensity: NPR_DEFAULTS.oilIntensity }),
        },
      ),
      makeDetails('Oil - edge / anti-halo', oilEdgeBody),
    );

    const mistBody = document.createElement('div');
    mistBody.append(
      rowRegNpr('On', makeBoolToggle('Mist enabled', s.mistEnabled, (v) => patch({ mistEnabled: v })), {
        dirty: () => current.mistEnabled !== NPR_DEFAULTS.mistEnabled,
        revert: () => patch({ mistEnabled: NPR_DEFAULTS.mistEnabled }),
      }),
      rowRegNpr(
        'Amount',
        makeFloatSlider(
          0,
          2,
          0.05,
          s.mistIntensity,
          2,
          (v) => {
            current = { ...current, mistIntensity: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.mistIntensity !== NPR_DEFAULTS.mistIntensity,
          revert: () => patch({ mistIntensity: NPR_DEFAULTS.mistIntensity }),
        },
      ),
      rowRegNpr(
        'Edge',
        makeFloatSlider(
          0.001,
          0.25,
          0.001,
          s.mistDepthThreshold,
          3,
          (v) => {
            current = { ...current, mistDepthThreshold: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.mistDepthThreshold !== NPR_DEFAULTS.mistDepthThreshold,
          revert: () => patch({ mistDepthThreshold: NPR_DEFAULTS.mistDepthThreshold }),
        },
      ),
      rowRegNpr(
        'Spread',
        makeFloatSlider(
          0,
          32,
          0.5,
          s.mistSpreadPx,
          1,
          (v) => {
            current = { ...current, mistSpreadPx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.mistSpreadPx !== NPR_DEFAULTS.mistSpreadPx,
          revert: () => patch({ mistSpreadPx: NPR_DEFAULTS.mistSpreadPx }),
        },
      ),
      rowRegNpr(
        'Tint ×',
        makeFloatSlider(
          0,
          1,
          0.05,
          s.mistTintStrength,
          2,
          (v) => {
            current = { ...current, mistTintStrength: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.mistTintStrength !== NPR_DEFAULTS.mistTintStrength,
          revert: () => patch({ mistTintStrength: NPR_DEFAULTS.mistTintStrength }),
        },
      ),
      rowRegNpr(
        'Color',
        makeColorPicker(
          s.mistColor,
          (c) => {
            current = { ...current, mistColor: c, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ),
        {
          dirty: () =>
            current.mistColor[0] !== NPR_DEFAULTS.mistColor[0] ||
            current.mistColor[1] !== NPR_DEFAULTS.mistColor[1] ||
            current.mistColor[2] !== NPR_DEFAULTS.mistColor[2],
          revert: () =>
            patch({
              mistColor: [NPR_DEFAULTS.mistColor[0], NPR_DEFAULTS.mistColor[1], NPR_DEFAULTS.mistColor[2]],
            }),
        },
      ),
      rowRegNpr(
        'Geom',
        makeFloatSlider(
          0,
          2,
          0.05,
          s.mistGeomEdgeScale,
          2,
          (v) => {
            current = { ...current, mistGeomEdgeScale: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.mistGeomEdgeScale !== NPR_DEFAULTS.mistGeomEdgeScale,
          revert: () => patch({ mistGeomEdgeScale: NPR_DEFAULTS.mistGeomEdgeScale }),
        },
      ),
    );

    const wiggleBody = document.createElement('div');
    wiggleBody.append(
      rowRegNpr('On', makeBoolToggle('Wiggle enabled', s.wiggleEnabled, (v) => patch({ wiggleEnabled: v })), {
        dirty: () => current.wiggleEnabled !== NPR_DEFAULTS.wiggleEnabled,
        revert: () => patch({ wiggleEnabled: NPR_DEFAULTS.wiggleEnabled }),
      }),
      rowRegNpr(
        'Freq',
        makeFloatSlider(
          0.001,
          0.3,
          0.001,
          s.wiggleFrequency,
          3,
          (v) => {
            current = { ...current, wiggleFrequency: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.wiggleFrequency !== NPR_DEFAULTS.wiggleFrequency,
          revert: () => patch({ wiggleFrequency: NPR_DEFAULTS.wiggleFrequency }),
        },
      ),
      rowRegNpr(
        'Amp',
        makeFloatSlider(
          0,
          6,
          0.1,
          s.wiggleAmplitudePx,
          2,
          (v) => {
            current = { ...current, wiggleAmplitudePx: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.wiggleAmplitudePx !== NPR_DEFAULTS.wiggleAmplitudePx,
          revert: () => patch({ wiggleAmplitudePx: NPR_DEFAULTS.wiggleAmplitudePx }),
        },
      ),
      rowRegNpr(
        'Noise',
        makeFloatSlider(
          0,
          1,
          0.05,
          s.wiggleIrregularity,
          2,
          (v) => {
            current = { ...current, wiggleIrregularity: v, style: 'custom' };
            stylePicker.value = 'custom';
            hooks.emitLive(current);
          },
          () => hooks.emitCommit(current),
        ).row,
        {
          dirty: () => current.wiggleIrregularity !== NPR_DEFAULTS.wiggleIrregularity,
          revert: () => patch({ wiggleIrregularity: NPR_DEFAULTS.wiggleIrregularity }),
        },
      ),
    );

    body.append(
      makeDetails('Outline (Toon / Moebius)', outlineBody),
      makeDetails('Cel — stepped shadows', celBody),
      makeDetails('Hatching (Moebius)', hatchBody),
      makeDetails('Oil (Rembrandt)', oilBody),
      makeDetails('Mist (Rembrandt)', mistBody),
      makeDetails('Hand-drawn wiggle', wiggleBody),
    );
  };

  stylePicker.addEventListener('change', () => {
    const next = stylePicker.value as NprStyle;
    current = applyPreset(current, next);
    rebuildBody();
    hooks.emitCommit(current);
  });

  root.append(
    rowRegNpr('NPR', enableWrap, {
      dirty: () => current.enabled !== NPR_DEFAULTS.enabled,
      revert: () => {
        current = { ...current, enabled: NPR_DEFAULTS.enabled };
        enableInput.checked = current.enabled;
        hooks.emitCommit(current);
      },
    }),
    rowRegNpr('Style', stylePicker, {
      dirty: () => current.style !== NPR_DEFAULTS.style || current.enabled !== NPR_DEFAULTS.enabled,
      revert: () => {
        current = cloneNprSettings(NPR_DEFAULTS);
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

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.style.cssText =
    'padding:4px 10px;border-radius:6px;border:1px solid rgba(120,140,220,0.4);background:transparent;color:#e8eaff;font-size:11px;cursor:pointer';
  closeBtn.addEventListener('click', () => {
    root.style.display = 'none';
  });

  header.append(title, closeBtn);

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
      dirty: () => live.displayName !== CODE_DEFAULT_DISPLAY_NAME,
      revert: () => {
        live.displayName = CODE_DEFAULT_DISPLAY_NAME;
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

  const fxKnob = makeDiscreteKnob(FX_TIERS, FX_KNOB_LABEL, live.fxTier, (next) => {
    live.fxTier = next;
    cb.onFxTierChange(next);
  }, recordHistory);
  const labelKnob = makeDiscreteKnob(LABEL_MODES, LABEL_MODE_LABEL, live.labelMode, (next) => {
    live.labelMode = next;
    cb.onLabelModeChange(next);
  }, recordHistory);

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

  const fogWrap = document.createElement('div');
  fogWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  const fogCheck = document.createElement('input');
  fogCheck.type = 'checkbox';
  fogCheck.checked = live.fogEnabled;
  fogCheck.setAttribute('aria-label', 'Distance fog on');
  fogCheck.title = 'Exponential zone fog';
  fogCheck.style.cssText = 'width:16px;height:16px;accent-color:#5b7cff;cursor:pointer;flex-shrink:0';
  fogWrap.appendChild(fogCheck);

  const fogDensitySlider = makeFloatSlider(
    0,
    2.5,
    0.05,
    live.fogDensityMul,
    2,
    (v) => {
      live.fogDensityMul = v;
      cb.onFogDensityMulChange(v);
      refreshRevertIndicators();
    },
    recordHistory,
  );
  fogDensitySlider.input.disabled = !live.fogEnabled;
  fogCheck.addEventListener('change', () => {
    live.fogEnabled = fogCheck.checked;
    cb.onFogChange(live.fogEnabled);
    fogDensitySlider.input.disabled = !live.fogEnabled;
    recordHistory();
    refreshRevertIndicators();
  });

  const fillSlider = makeFloatSlider(
    0.15,
    2.75,
    0.05,
    live.fillLightMul,
    2,
    (v) => {
      live.fillLightMul = v;
      cb.onFillLightMulChange(v);
      refreshRevertIndicators();
    },
    recordHistory,
  );
  const exposureSlider = makeFloatSlider(
    0.35,
    2.75,
    0.05,
    live.toneExposure,
    2,
    (v) => {
      live.toneExposure = v;
      cb.onToneExposureChange(v);
      refreshRevertIndicators();
    },
    recordHistory,
  );
  const skyHazeSlider = makeFloatSlider(
    0,
    1.5,
    0.05,
    live.skyHazeMul,
    2,
    (v) => {
      live.skyHazeMul = v;
      cb.onSkyHazeMulChange(v);
      refreshRevertIndicators();
    },
    recordHistory,
  );
  const torchReachSlider = makeFloatSlider(
    0.25,
    80,
    0.05,
    live.torchReachMul,
    2,
    (v) => {
      live.torchReachMul = v;
      cb.onTorchReachMulChange(v);
      refreshRevertIndicators();
    },
    recordHistory,
  );

  panelGraphics.append(
    rowReg('Quality', fxKnob.el, {
      dirty: () => live.fxTier !== CODE_DEFAULT_FX_TIER,
      revert: () => {
        live.fxTier = CODE_DEFAULT_FX_TIER;
        fxKnob.setValueSilent(CODE_DEFAULT_FX_TIER);
        cb.onFxTierChange(live.fxTier);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Labels', labelKnob.el, {
      dirty: () => live.labelMode !== CODE_DEFAULT_LABEL_MODE,
      revert: () => {
        live.labelMode = CODE_DEFAULT_LABEL_MODE;
        labelKnob.setValueSilent(CODE_DEFAULT_LABEL_MODE);
        cb.onLabelModeChange(live.labelMode);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Fog', fogWrap, {
      dirty: () => live.fogEnabled !== CODE_DEFAULT_FOG_ENABLED,
      revert: () => {
        live.fogEnabled = CODE_DEFAULT_FOG_ENABLED;
        fogCheck.checked = live.fogEnabled;
        cb.onFogChange(live.fogEnabled);
        fogDensitySlider.input.disabled = !live.fogEnabled;
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Fog ×', fogDensitySlider.row, {
      dirty: () => live.fogDensityMul !== CODE_DEFAULT_FOG_DENSITY_MUL,
      revert: () => {
        live.fogDensityMul = CODE_DEFAULT_FOG_DENSITY_MUL;
        fogDensitySlider.setValueSilent(live.fogDensityMul);
        cb.onFogDensityMulChange(live.fogDensityMul);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Fill', fillSlider.row, {
      dirty: () => live.fillLightMul !== CODE_DEFAULT_FILL_LIGHT_MUL,
      revert: () => {
        live.fillLightMul = CODE_DEFAULT_FILL_LIGHT_MUL;
        fillSlider.setValueSilent(live.fillLightMul);
        cb.onFillLightMulChange(live.fillLightMul);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Exposure', exposureSlider.row, {
      dirty: () => live.toneExposure !== CODE_DEFAULT_TONE_EXPOSURE,
      revert: () => {
        live.toneExposure = CODE_DEFAULT_TONE_EXPOSURE;
        exposureSlider.setValueSilent(live.toneExposure);
        cb.onToneExposureChange(live.toneExposure);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Sky', skyHazeSlider.row, {
      dirty: () => live.skyHazeMul !== CODE_DEFAULT_SKY_HAZE_MUL,
      revert: () => {
        live.skyHazeMul = CODE_DEFAULT_SKY_HAZE_MUL;
        skyHazeSlider.setValueSilent(live.skyHazeMul);
        cb.onSkyHazeMulChange(live.skyHazeMul);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Torches ×', torchReachSlider.row, {
      dirty: () => live.torchReachMul !== CODE_DEFAULT_TORCH_REACH_MUL,
      revert: () => {
        live.torchReachMul = CODE_DEFAULT_TORCH_REACH_MUL;
        torchReachSlider.setValueSilent(live.torchReachMul);
        cb.onTorchReachMulChange(live.torchReachMul);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
    rowReg('Dunes', duneKnob.row, {
      dirty: () => live.duneHeightScale !== CODE_DEFAULT_DUNE_HEIGHT_SCALE,
      revert: () => {
        live.duneHeightScale = CODE_DEFAULT_DUNE_HEIGHT_SCALE;
        duneKnob.sync(live.duneHeightScale);
        cb.onDuneHeightScalePreview(live.duneHeightScale);
        cb.onDuneHeightScaleCommit(live.duneHeightScale);
        recordHistory();
        refreshRevertIndicators();
      },
    }),
  );

  nprPanelHandle = buildNprPanel(live.npr, {
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
  });
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
      fxKnob.setValueSilent(live.fxTier);
      labelKnob.setValueSilent(live.labelMode);
      fogCheck.checked = live.fogEnabled;
      fogDensitySlider.setValueSilent(live.fogDensityMul);
      fogDensitySlider.input.disabled = !live.fogEnabled;
      fillSlider.setValueSilent(live.fillLightMul);
      exposureSlider.setValueSilent(live.toneExposure);
      skyHazeSlider.setValueSilent(live.skyHazeMul);
      torchReachSlider.setValueSilent(live.torchReachMul);
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
