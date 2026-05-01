/**
 * World-space HTML billboards (CSS2D). Default on; `?labels=0`, `localStorage.rtRoomLabels`, or **T** toggles.
 */
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export function readLabelsEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('labels');
    if (q === '0' || q === 'false') return false;
    if (q === '1' || q === 'true') return true;
    const s = window.localStorage.getItem('rtRoomLabels');
    if (s === '0') return false;
    if (s === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function persistLabelsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem('rtRoomLabels', on ? '1' : '0');
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
