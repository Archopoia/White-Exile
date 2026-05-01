/**
 * Client bootstrap.
 *
 * Creates the Three.js scene, opens a Socket.io connection, and wires
 * snapshots into both the scene and the HUD. Game logic is server-driven;
 * the client mostly translates intents and renders state.
 *
 * Dev-mode HMR: the boot routine returns a `dispose()` and the module
 * registers `import.meta.hot.accept(...)` so saving any imported file
 * (scene / hud / net / etc.) swaps the running game without a full page
 * reload. Player identity persists via `localStorage.tutelary.resumeToken`,
 * so the server reattaches our existing record across HMR, full refresh,
 * and `tsx watch` server restarts.
 */
import { debugLogger } from './debug.js';
import { inputLog } from './inputLog.js';
import { updateHud, type HudState } from './hud.js';
import { NetClient } from './net.js';
import { TutelaryScene } from './scene.js';

const STORAGE_NAME = 'tutelary.displayName';
const STORAGE_TOKEN = 'tutelary.resumeToken';

function makeDisplayName(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('name');
    if (fromUrl) return fromUrl.slice(0, 24);
  } catch {
    /* ignore */
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_NAME);
    if (stored && stored.length > 0) return stored.slice(0, 24);
  } catch {
    /* ignore */
  }
  const adjectives = ['lit', 'soft', 'kind', 'wild', 'lone', 'odd', 'wee', 'cosmic'];
  const nouns = ['ember', 'mote', 'ghost', 'wisp', 'spark', 'dust', 'soul', 'star'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)] ?? 'lit';
  const n = nouns[Math.floor(Math.random() * nouns.length)] ?? 'mote';
  return `${a}-${n}`;
}

function readResumeToken(): string | undefined {
  try {
    const t = window.localStorage.getItem(STORAGE_TOKEN);
    return t && t.length > 0 ? t : undefined;
  } catch {
    return undefined;
  }
}

function writeResumeToken(token: string): void {
  try {
    window.localStorage.setItem(STORAGE_TOKEN, token);
  } catch {
    /* ignore */
  }
}

function persistDisplayName(name: string): void {
  try {
    window.localStorage.setItem(STORAGE_NAME, name);
  } catch {
    /* ignore */
  }
}

function resolveServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}

interface RunningClient {
  scene: TutelaryScene;
  net: NetClient;
  dispose: () => void;
}

function boot(): RunningClient {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('canvas#scene not found');

  const displayName = makeDisplayName();
  persistDisplayName(displayName);

  const hud: HudState = {
    status: 'connecting',
    essence: 0,
    totalDust: 0,
    planetRadius: 0,
    players: 0,
    displayName,
    tier: 'dust',
  };
  updateHud(hud);

  let localPlayerId: string | null = null;
  let appliedServerPos = false;

  let net: NetClient | null = null;
  const scene = new TutelaryScene(canvas, {
    onCursorMove: (target) => net?.sendCursor(target),
    onBurst: (target, intensity) => net?.sendBurst(target, intensity),
    onExtract: (point) => net?.sendExtract(point),
  });

  net = new NetClient(
    {
      url: resolveServerUrl(),
      displayName,
      ...(readResumeToken() ? { resumeToken: readResumeToken() as string } : {}),
    },
    {
      onConnectionChange: (state) => {
        hud.status = state;
        updateHud(hud);
        debugLogger.info('connection.change', { state });
      },
      onWelcome: (welcome) => {
        localPlayerId = welcome.playerId;
        appliedServerPos = false;
        scene.setLocalPlayerId(welcome.playerId);
        writeResumeToken(welcome.resumeToken);
        debugLogger.info('welcome.applied', {
          playerId: welcome.playerId,
          traceId: welcome.traceId,
          resumed: welcome.resumed,
        });
      },
      onSnapshot: (snap) => {
        scene.applySnapshot(snap);
        hud.totalDust = snap.totalDust;
        hud.planetRadius = snap.planetRadius;
        hud.players = snap.players.length;
        const me = localPlayerId
          ? snap.players.find((p) => p.id === localPlayerId)
          : snap.players.find((p) => p.name === displayName);
        if (me) {
          hud.essence = me.essence;
          hud.tier = me.tier;
          // First snapshot for our player after a resume: adopt server pos
          // so the spirit doesn't snap to the north pole.
          if (!appliedServerPos) {
            scene.setLocalSpiritFromWorld(me.position);
            appliedServerPos = true;
          }
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
  debugLogger.info('client.boot', { name: displayName, hasResumeToken: !!readResumeToken() });

  const liveNet = net;
  return {
    scene,
    net: liveNet,
    dispose: () => {
      try {
        scene.dispose();
      } catch (e) {
        debugLogger.warn('dispose.scene_failed', { err: String(e) });
      }
      try {
        liveNet.dispose();
      } catch (e) {
        debugLogger.warn('dispose.net_failed', { err: String(e) });
      }
    },
  };
}

const running = boot();

// ---------------------------------------------------------------------------
// Vite HMR: self-accept so editing scene / hud / net / etc. swaps the running
// game in place instead of triggering a full page reload. Server-side resume
// (via resumeToken) preserves world state across the brief reconnect.
// ---------------------------------------------------------------------------
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    debugLogger.debug('hmr.dispose', {});
    running.dispose();
  });
  import.meta.hot.accept(() => {
    // Vite re-runs this module after our dispose hook fires; nothing to do here.
    debugLogger.debug('hmr.accepted', {});
  });
}
