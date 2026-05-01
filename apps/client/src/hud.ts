/**
 * DOM HUD: connection state, room note, headcount, race + light/fuel/zone.
 */
import { ZONE_DISPLAY_LABEL, type Race, type Zone } from '@realtime-room/shared';

export interface HudState {
  status: 'connecting' | 'connected' | 'disconnected';
  players: number;
  displayName: string;
  roomNote: string;
  tick: number;
  race: Race;
  lightRadius: number;
  fuel: number;
  followerCount: number;
  zone: Zone;
  caravanSize: number;
}

const cache = {
  status: document.getElementById('hud-status') as HTMLElement | null,
  statusDot: document.getElementById('hud-status-dot') as HTMLElement | null,
  players: document.getElementById('hud-players') as HTMLElement | null,
  name: document.getElementById('hud-display-name') as HTMLElement | null,
  roomNote: document.getElementById('hud-room-note') as HTMLElement | null,
  tick: document.getElementById('hud-tick') as HTMLElement | null,
  race: document.getElementById('hud-race') as HTMLElement | null,
  light: document.getElementById('hud-light') as HTMLElement | null,
  fuelBar: document.getElementById('hud-fuel-bar') as HTMLElement | null,
  fuelText: document.getElementById('hud-fuel-text') as HTMLElement | null,
  followers: document.getElementById('hud-followers') as HTMLElement | null,
  zone: document.getElementById('hud-zone') as HTMLElement | null,
  caravan: document.getElementById('hud-caravan') as HTMLElement | null,
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
  if (cache.race) cache.race.textContent = state.race;
  if (cache.light) cache.light.textContent = state.lightRadius.toFixed(1);
  if (cache.fuelBar) {
    const pct = Math.max(0, Math.min(100, state.fuel * 100));
    cache.fuelBar.style.width = `${pct}%`;
    cache.fuelBar.style.background =
      state.fuel < 0.2 ? '#ff5e5e' : state.fuel < 0.5 ? '#ffc36a' : '#6cf6a3';
  }
  if (cache.fuelText) cache.fuelText.textContent = `${Math.round(state.fuel * 100)}%`;
  if (cache.followers) cache.followers.textContent = String(state.followerCount);
  if (cache.zone) cache.zone.textContent = ZONE_DISPLAY_LABEL[state.zone];
  if (cache.caravan) cache.caravan.textContent = String(state.caravanSize);
}
