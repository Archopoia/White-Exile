/**
 * World-space HTML billboards (CSS2D). **T** cycles label mode: off → keywords → full.
 * Initial mode may be read from the page URL / `localStorage` (see `readLabelMode`).
 */
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/** `off` hides overlays; `keywords` is compact scan lines; `full` is explanatory paragraphs. */
export type WorldLabelMode = 'off' | 'keywords' | 'full';

const ORDER: readonly WorldLabelMode[] = ['off', 'keywords', 'full'];

export function nextLabelMode(current: WorldLabelMode): WorldLabelMode {
  const i = ORDER.indexOf(current);
  return ORDER[(i + 1) % ORDER.length]!;
}

function parseLabelQuery(raw: string | null): WorldLabelMode | undefined {
  if (raw === null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'none' || v === 'hide') return 'off';
  if (v === '1' || v === 'true' || v === 'on' || v === 'full' || v === 'long') return 'full';
  if (v === '2' || v === 'keywords' || v === 'short' || v === 'kw') return 'keywords';
  return undefined;
}

/** Initial mode from `?labels=` then `rtRoomLabelsMode`, then legacy `rtRoomLabels`. Default `full`. */
export function readLabelMode(): WorldLabelMode {
  try {
    const fromUrl = parseLabelQuery(new URLSearchParams(window.location.search).get('labels'));
    if (fromUrl !== undefined) return fromUrl;
    const stored = parseLabelQuery(window.localStorage.getItem('rtRoomLabelsMode'));
    if (stored !== undefined) return stored;
    const leg = window.localStorage.getItem('rtRoomLabels');
    if (leg === '0') return 'off';
    if (leg === '1') return 'full';
  } catch {
    /* ignore */
  }
  return 'full';
}

export function persistLabelMode(mode: WorldLabelMode): void {
  try {
    window.localStorage.setItem('rtRoomLabelsMode', mode);
  } catch {
    /* ignore */
  }
}

export function makeTooltip(text: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = 'scene-tooltip';
  el.textContent = text;
  return new CSS2DObject(el);
}

export function setTooltipText(obj: CSS2DObject, text: string): void {
  const el = obj.element;
  if (el.textContent !== text) el.textContent = text;
}
