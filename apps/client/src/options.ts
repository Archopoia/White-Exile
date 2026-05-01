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
import { type WorldLabelMode } from './tooltips.js';

import type { Race } from '@realtime-room/shared';

const FX_KNOB_LABEL: Readonly<Record<FxTier, string>> = Object.freeze({
  low: 'Low',
  med: 'Med',
  high: 'High',
});

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

function compactRow(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;min-height:28px';
  const lab = document.createElement('label');
  lab.textContent = label;
  lab.style.cssText = 'flex:0 0 72px;font-size:12px;opacity:0.82';
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
): HTMLElement {
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

  wrap.append(range, badge);
  return wrap;
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
  onChange: (v: number) => void,
): { row: HTMLElement; input: HTMLInputElement } {
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
    onChange(v);
  };

  badge.textContent = fmt(read());
  range.addEventListener('input', apply);
  wrap.append(range, badge);
  return { row: wrap, input: range };
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

function makeColorPicker(value: readonly [number, number, number], onChange: (c: [number, number, number]) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = colorToHexString(value);
  input.style.cssText = 'width:36px;height:22px;border:1px solid rgba(120,140,220,0.35);background:transparent;cursor:pointer;padding:0';
  input.addEventListener('input', () => onChange(hexStringToColor(input.value)));
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

/**
 * Builds the NPR tab body. The body is rebuilt whenever the style preset
 * changes (so all knob values reflect the new preset values). Individual
 * knob edits flip the active style to 'custom' and emit the patched bundle.
 */
function buildNprPanel(
  initial: NprSettings,
  emit: (next: NprSettings) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('role', 'tabpanel');
  root.id = 'session-tab-npr';
  root.style.display = 'none';

  let current: NprSettings = initial;

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
    emit(current);
  });

  const body = document.createElement('div');

  const patch = (delta: Partial<NprSettings>): void => {
    current = { ...current, ...delta, style: 'custom' };
    stylePicker.value = 'custom';
    emit(current);
  };

  const rebuildBody = (): void => {
    body.innerHTML = '';
    const s = current;

    // --- Outline ---
    const outlineBody = document.createElement('div');
    outlineBody.append(
      compactRow('On', makeBoolToggle('Outline enabled', s.outlineEnabled, (v) => patch({ outlineEnabled: v }))),
      compactRow('Width', makeFloatSlider(0.25, 4, 0.05, s.outlineThicknessPx, 2, (v) => patch({ outlineThicknessPx: v })).row),
      compactRow('Depth ×', makeFloatSlider(0, 60, 0.5, s.outlineDepthWeight, 1, (v) => patch({ outlineDepthWeight: v })).row),
      compactRow('Thin', makeFloatSlider(0, 8, 0.25, s.outlineMinFeaturePx, 2, (v) => patch({ outlineMinFeaturePx: v })).row),
      compactRow('Color', makeColorPicker(s.outlineColor, (c) => patch({ outlineColor: c }))),
    );

    // --- Cel ---
    const celBody = document.createElement('div');
    celBody.append(
      compactRow('On', makeBoolToggle('Cel enabled', s.celEnabled, (v) => patch({ celEnabled: v }))),
      compactRow('Steps', makeFloatSlider(2, 12, 1, s.celSteps, 0, (v) => patch({ celSteps: v })).row),
      compactRow('Edge', makeFloatSlider(0, 0.5, 0.01, s.celStepSmoothness, 2, (v) => patch({ celStepSmoothness: v })).row),
      compactRow('Floor', makeFloatSlider(0, 0.4, 0.01, s.celMinLight, 2, (v) => patch({ celMinLight: v })).row),
      compactRow('Mix', makeFloatSlider(0, 1, 0.05, s.celMix, 2, (v) => patch({ celMix: v })).row),
      compactRow('Tint ×', makeFloatSlider(0, 1, 0.05, s.celShadowTintAmount, 2, (v) => patch({ celShadowTintAmount: v })).row),
      compactRow('Tint', makeColorPicker(s.celShadowTint, (c) => patch({ celShadowTint: c }))),
    );

    // --- Hatch ---
    const hatchBody = document.createElement('div');
    const hatchPattern = makeDiscreteKnob<HatchPattern>(
      HATCH_PATTERNS,
      HATCH_PATTERN_LABEL,
      s.hatchPattern,
      (next) => patch({ hatchPattern: next }),
    );
    hatchBody.append(
      compactRow('On', makeBoolToggle('Hatch enabled', s.hatchEnabled, (v) => patch({ hatchEnabled: v }))),
      compactRow('Style', hatchPattern),
      compactRow('Step', makeFloatSlider(2, 24, 0.5, s.hatchModPx, 1, (v) => patch({ hatchModPx: v })).row),
      compactRow('Dark', makeFloatSlider(0, 1, 0.01, s.hatchLumaDark, 2, (v) => patch({ hatchLumaDark: v })).row),
      compactRow('Mid', makeFloatSlider(0, 1, 0.01, s.hatchLumaMid, 2, (v) => patch({ hatchLumaMid: v })).row),
      compactRow('Light', makeFloatSlider(0, 1, 0.01, s.hatchLumaLight, 2, (v) => patch({ hatchLumaLight: v })).row),
      compactRow('Lift', makeFloatSlider(0, 1, 0.05, s.tonalShadowLift, 2, (v) => patch({ tonalShadowLift: v })).row),
      compactRow('Cell', makeFloatSlider(4, 32, 1, s.rasterCellPx, 0, (v) => patch({ rasterCellPx: v })).row),
    );

    // --- Oil (Rembrandt) ---
    const oilBody = document.createElement('div');
    oilBody.append(
      compactRow('On', makeBoolToggle('Oil enabled', s.oilEnabled, (v) => patch({ oilEnabled: v }))),
      compactRow('Radius', makeFloatSlider(1, 8, 0.25, s.oilRadiusPx, 2, (v) => patch({ oilRadiusPx: v })).row),
      compactRow('Amount', makeFloatSlider(0, 3, 0.05, s.oilIntensity, 2, (v) => patch({ oilIntensity: v })).row),
    );

    // --- Mist (Rembrandt) ---
    const mistBody = document.createElement('div');
    mistBody.append(
      compactRow('On', makeBoolToggle('Mist enabled', s.mistEnabled, (v) => patch({ mistEnabled: v }))),
      compactRow('Amount', makeFloatSlider(0, 2, 0.05, s.mistIntensity, 2, (v) => patch({ mistIntensity: v })).row),
      compactRow('Edge', makeFloatSlider(0.001, 0.25, 0.001, s.mistDepthThreshold, 3, (v) => patch({ mistDepthThreshold: v })).row),
      compactRow('Spread', makeFloatSlider(0, 32, 0.5, s.mistSpreadPx, 1, (v) => patch({ mistSpreadPx: v })).row),
      compactRow('Tint ×', makeFloatSlider(0, 1, 0.05, s.mistTintStrength, 2, (v) => patch({ mistTintStrength: v })).row),
      compactRow('Color', makeColorPicker(s.mistColor, (c) => patch({ mistColor: c }))),
      compactRow('Geom', makeFloatSlider(0, 2, 0.05, s.mistGeomEdgeScale, 2, (v) => patch({ mistGeomEdgeScale: v })).row),
    );

    // --- Wiggle ---
    const wiggleBody = document.createElement('div');
    wiggleBody.append(
      compactRow('On', makeBoolToggle('Wiggle enabled', s.wiggleEnabled, (v) => patch({ wiggleEnabled: v }))),
      compactRow('Freq', makeFloatSlider(0.001, 0.3, 0.001, s.wiggleFrequency, 3, (v) => patch({ wiggleFrequency: v })).row),
      compactRow('Amp', makeFloatSlider(0, 6, 0.1, s.wiggleAmplitudePx, 2, (v) => patch({ wiggleAmplitudePx: v })).row),
      compactRow('Noise', makeFloatSlider(0, 1, 0.05, s.wiggleIrregularity, 2, (v) => patch({ wiggleIrregularity: v })).row),
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
    emit(current);
  });

  root.append(
    compactRow('NPR', enableWrap),
    compactRow('Style', stylePicker),
    body,
  );
  rebuildBody();
  return root;
}

export function createRoomOptionsOverlay(cb: RoomOptionsCallbacks): RoomOptionsOverlay {
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

  // --- General ---
  const panelGeneral = document.createElement('div');
  panelGeneral.setAttribute('role', 'tabpanel');
  panelGeneral.id = 'session-tab-general';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 24;
  nameInput.value = cb.initial.displayName;
  nameInput.autocomplete = 'username';
  nameInput.style.cssText =
    'width:100%;box-sizing:border-box;padding:5px 8px;background:#0c0e18;color:#e8eaff;border:1px solid rgba(120,140,220,0.35);border-radius:6px;font:12px system-ui,sans-serif';
  nameInput.addEventListener('change', () => {
    cb.onDisplayNameChange(nameInput.value);
  });

  const raceBadge = document.createElement('div');
  raceBadge.textContent = RACE_LABEL[cb.initial.race];
  raceBadge.style.cssText =
    'padding:5px 8px;background:#0c0e18;color:#e8eaff;border:1px solid rgba(120,140,220,0.22);border-radius:6px;font:12px system-ui,sans-serif;opacity:0.88';

  panelGeneral.append(compactRow('Name', nameInput), compactRow('Race', raceBadge));

  // --- Graphics ---
  const panelGraphics = document.createElement('div');
  panelGraphics.setAttribute('role', 'tabpanel');
  panelGraphics.id = 'session-tab-graphics';
  panelGraphics.style.display = 'none';

  const fxKnob = makeDiscreteKnob(FX_TIERS, FX_KNOB_LABEL, cb.initial.fxTier, (next) => {
    cb.onFxTierChange(next);
  });
  const labelKnob = makeDiscreteKnob(LABEL_MODES, LABEL_MODE_LABEL, cb.initial.labelMode, (next) => {
    cb.onLabelModeChange(next);
  });

  const duneKnob = makeDuneScaleKnob(cb.initial.duneHeightScale, cb.onDuneHeightScalePreview, cb.onDuneHeightScaleCommit);

  const fogWrap = document.createElement('div');
  fogWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  const fogCheck = document.createElement('input');
  fogCheck.type = 'checkbox';
  fogCheck.checked = cb.initial.fogEnabled;
  fogCheck.setAttribute('aria-label', 'Distance fog on');
  fogCheck.title = 'Exponential zone fog';
  fogCheck.style.cssText = 'width:16px;height:16px;accent-color:#5b7cff;cursor:pointer;flex-shrink:0';
  fogWrap.appendChild(fogCheck);

  const fogDensitySlider = makeFloatSlider(0, 2.5, 0.05, cb.initial.fogDensityMul, 2, (v) => {
    cb.onFogDensityMulChange(v);
  });
  fogDensitySlider.input.disabled = !cb.initial.fogEnabled;
  fogCheck.addEventListener('change', () => {
    cb.onFogChange(fogCheck.checked);
    fogDensitySlider.input.disabled = !fogCheck.checked;
  });

  const fillSlider = makeFloatSlider(0.15, 2.75, 0.05, cb.initial.fillLightMul, 2, (v) => {
    cb.onFillLightMulChange(v);
  });
  const exposureSlider = makeFloatSlider(0.35, 2.75, 0.05, cb.initial.toneExposure, 2, (v) => {
    cb.onToneExposureChange(v);
  });
  const skyHazeSlider = makeFloatSlider(0, 1.5, 0.05, cb.initial.skyHazeMul, 2, (v) => {
    cb.onSkyHazeMulChange(v);
  });
  const torchReachSlider = makeFloatSlider(0.25, 80, 0.05, cb.initial.torchReachMul, 2, (v) => {
    cb.onTorchReachMulChange(v);
  });

  panelGraphics.append(
    compactRow('Quality', fxKnob),
    compactRow('Labels', labelKnob),
    compactRow('Fog', fogWrap),
    compactRow('Fog ×', fogDensitySlider.row),
    compactRow('Fill', fillSlider.row),
    compactRow('Exposure', exposureSlider.row),
    compactRow('Sky', skyHazeSlider.row),
    compactRow('Torches ×', torchReachSlider.row),
    compactRow('Dunes', duneKnob.row),
  );

  // --- NPR (toon / Moebius / Rembrandt) ---
  const panelNpr = buildNprPanel(cb.initial.nprSettings, (next) => cb.onNprSettingsChange(next));

  // --- Help ---
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
  ];
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    helpUl.appendChild(li);
  }
  panelHelp.appendChild(helpUl);

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
  mkTab('npr', 'NPR', panelNpr);
  mkTab('help', 'Help', panelHelp);

  panel.append(header, tabList, tabPanels);
  root.append(panel);
  document.body.append(root);

  setTab('general');

  root.addEventListener('click', (e) => {
    if (e.target === root) root.style.display = 'none';
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    const isOpen = root.style.display === 'flex';
    if (isOpen) {
      root.style.display = 'none';
    } else {
      root.style.display = 'flex';
      setTab('general');
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    setOpen(open: boolean): void {
      root.style.display = open ? 'flex' : 'none';
      if (open) setTab('general');
    },
    syncDuneHeightScale(scale: number): void {
      duneKnob.sync(scale);
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
