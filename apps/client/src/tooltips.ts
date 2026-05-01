/**
 * World-space HTML billboards (CSS2D). **T** cycles label mode: off → keywords → full.
 * Initial mode is loaded from `localStorage` via `clientSettings.getLabelMode()`.
 */
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/** `off` hides overlays; `keywords` is compact scan lines; `full` is explanatory paragraphs. */
export type WorldLabelMode = 'off' | 'keywords' | 'full';

const ORDER: readonly WorldLabelMode[] = ['off', 'keywords', 'full'];

export function nextLabelMode(current: WorldLabelMode): WorldLabelMode {
  const i = ORDER.indexOf(current);
  return ORDER[(i + 1) % ORDER.length]!;
}

export function makeTooltip(text: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = 'scene-tooltip';
  el.textContent = text;
  const obj = new CSS2DObject(el);
  // CSS2DRenderer uses translate(-100*cx%, -100*cy%) before screen placement; (0.5, 1) pulls the box up so its
  // bottom edge sits on the anchor (see three.js CSS2DObject `center` + renderer).
  obj.center.set(0.5, 1);
  return obj;
}

export function setTooltipText(obj: CSS2DObject, text: string): void {
  const el = obj.element;
  if (el.textContent !== text) el.textContent = text;
}
