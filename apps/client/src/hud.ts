/**
 * DOM HUD: connection state, room label, headcount.
 */
export interface HudState {
  status: 'connecting' | 'connected' | 'disconnected';
  players: number;
  displayName: string;
  roomNote: string;
  tick: number;
}

const cache = {
  status: document.getElementById('hud-status') as HTMLElement | null,
  statusDot: document.getElementById('hud-status-dot') as HTMLElement | null,
  players: document.getElementById('hud-players') as HTMLElement | null,
  name: document.getElementById('hud-display-name') as HTMLElement | null,
  roomNote: document.getElementById('hud-room-note') as HTMLElement | null,
  tick: document.getElementById('hud-tick') as HTMLElement | null,
};

export function updateHud(state: HudState): void {
  if (cache.status) cache.status.textContent = state.status;
  if (cache.statusDot) {
    cache.statusDot.classList.remove('connected', 'connecting', 'disconnected');
    cache.statusDot.classList.add(state.status);
  }
  if (cache.players) cache.players.textContent = String(state.players);
  if (cache.name) cache.name.textContent = state.displayName;
  if (cache.roomNote) cache.roomNote.textContent = state.roomNote || '—';
  if (cache.tick) cache.tick.textContent = String(state.tick);
}
