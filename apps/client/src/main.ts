/**
 * Client bootstrap.
 *
 * Creates the Three.js scene, opens a Socket.io connection, and wires
 * snapshots into both the scene and the HUD. Game logic is server-driven;
 * the client mostly translates intents and renders state.
 */
import { debugLogger } from './debug.js';
import { inputLog } from './inputLog.js';
import { updateHud, type HudState } from './hud.js';
import { NetClient } from './net.js';
import { TutelaryScene } from './scene.js';

function makeDisplayName(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('name');
    if (fromUrl) return fromUrl.slice(0, 24);
  } catch {
    /* ignore */
  }
  const adjectives = ['lit', 'soft', 'kind', 'wild', 'lone', 'odd', 'wee', 'cosmic'];
  const nouns = ['ember', 'mote', 'ghost', 'wisp', 'spark', 'dust', 'soul', 'star'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)] ?? 'lit';
  const n = nouns[Math.floor(Math.random() * nouns.length)] ?? 'mote';
  return `${a}-${n}`;
}

function resolveServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#scene not found');

const hud: HudState = {
  status: 'connecting',
  essence: 0,
  totalDust: 0,
  planetRadius: 0,
  players: 0,
  displayName: makeDisplayName(),
  tier: 'dust',
};
updateHud(hud);

const scene = new TutelaryScene(canvas, {
  onCursorMove: (target) => net.sendCursor(target),
  onBurst: (target, intensity) => net.sendBurst(target, intensity),
  onExtract: (point) => net.sendExtract(point),
});

const net = new NetClient(
  { url: resolveServerUrl(), displayName: hud.displayName },
  {
    onConnectionChange: (state) => {
      hud.status = state;
      updateHud(hud);
      debugLogger.info('connection.change', { state });
    },
    onWelcome: (welcome) => {
      scene.setLocalPlayerId(welcome.playerId);
      debugLogger.info('welcome.applied', { playerId: welcome.playerId, traceId: welcome.traceId });
    },
    onSnapshot: (snap) => {
      scene.applySnapshot(snap);
      hud.totalDust = snap.totalDust;
      hud.planetRadius = snap.planetRadius;
      hud.players = snap.players.length;
      const local = snap.players.find((p) => p.name === hud.displayName);
      if (local) {
        hud.essence = local.essence;
        hud.tier = local.tier;
      }
      updateHud(hud);
    },
    onBurst: (evt) => scene.applyServerBurst(evt),
    onEssence: (evt) => {
      hud.essence = evt.newTotal;
      updateHud(hud);
    },
    onError: (err) => {
      inputLog('server.error', { code: err.code, message: err.message });
      debugLogger.warn('server.error', { ...err });
    },
  },
);

scene.start();
debugLogger.info('client.boot', { name: hud.displayName });
