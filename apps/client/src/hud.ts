/**
 * Tiny vanilla-DOM HUD. The 3D scene owns the canvas; this module owns
 * pure data-binding for status text and counters. No game logic here.
 */
export interface HudState {
  status: 'connecting' | 'connected' | 'disconnected';
  essence: number;
  totalDust: number;
  planetRadius: number;
  players: number;
  displayName: string;
  tier: string;
}

const cache = {
  status: document.getElementById('hud-status') as HTMLElement | null,
  statusDot: document.getElementById('hud-status-dot') as HTMLElement | null,
  essence: document.getElementById('hud-essence') as HTMLElement | null,
  totalDust: document.getElementById('hud-total-dust') as HTMLElement | null,
  radius: document.getElementById('hud-radius') as HTMLElement | null,
  players: document.getElementById('hud-players') as HTMLElement | null,
  name: document.getElementById('hud-display-name') as HTMLElement | null,
  tier: document.getElementById('hud-tier') as HTMLElement | null,
};

export function updateHud(state: HudState): void {
  if (cache.status) cache.status.textContent = state.status;
  if (cache.statusDot) {
    cache.statusDot.classList.remove('connected', 'connecting', 'disconnected');
    cache.statusDot.classList.add(state.status);
  }
  if (cache.essence) cache.essence.textContent = state.essence.toFixed(1);
  if (cache.totalDust) cache.totalDust.textContent = state.totalDust.toFixed(1);
  if (cache.radius) cache.radius.textContent = state.planetRadius.toFixed(2);
  if (cache.players) cache.players.textContent = String(state.players);
  if (cache.name) cache.name.textContent = state.displayName;
  if (cache.tier) cache.tier.textContent = state.tier;
}
