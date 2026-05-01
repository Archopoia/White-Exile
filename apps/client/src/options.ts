/**
 * ESC menu: player tunables (graphics, labels, display name) and a short
 * controls reference. No URL query parameters for tunables.
 */
import { FX_TIERS, LABEL_MODES, LABEL_MODE_LABEL } from './clientSettings.js';
import { type FxTier } from './flameLighting.js';
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
  onDisplayNameChange: (name: string) => void;
  /** Live client preview while dragging the dune scale slider. */
  onDuneHeightScalePreview: (scale: number) => void;
  /** Sent on slider release; server rebroadcasts authoritative `worldConfig`. */
  onDuneHeightScaleCommit: (scale: number) => void;
  initial: {
    readonly fxTier: FxTier;
    readonly labelMode: WorldLabelMode;
    readonly fogEnabled: boolean;
    readonly fogDensityMul: number;
    readonly fillLightMul: number;
    readonly toneExposure: number;
    readonly skyHazeMul: number;
    readonly displayName: string;
    readonly race: Race;
    readonly duneHeightScale: number;
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

type TabId = 'general' | 'graphics' | 'help';

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
    'align-items:center',
    'justify-content:center',
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

  panelGraphics.append(
    compactRow('Quality', fxKnob),
    compactRow('Labels', labelKnob),
    compactRow('Fog', fogWrap),
    compactRow('Fog ×', fogDensitySlider.row),
    compactRow('Fill', fillSlider.row),
    compactRow('Exposure', exposureSlider.row),
    compactRow('Sky', skyHazeSlider.row),
    compactRow('Dunes', duneKnob.row),
  );

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
