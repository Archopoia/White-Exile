/**
 * Client bootstrap: Three.js scene, Socket.io, HUD, optional room options (ESC).
 * HMR: dispose + reconnect; resume token keeps the same player record.
 */
import { DEFAULT_RACE, RACES, isRace, type Race } from '@realtime-room/shared';
import { debugLogger } from './debug.js';
import { updateHud, type HudState } from './hud.js';
import { NetClient } from './net.js';
import { createRoomOptionsOverlay, type RoomOptionsOverlay } from './options.js';
import { RoomScene } from './scene.js';

const STORAGE_NAME = 'rtRoom.displayName';
const STORAGE_TOKEN = 'rtRoom.resumeToken';
const STORAGE_RACE = 'rtRoom.race';

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
  const adjectives = ['ash', 'cold', 'lit', 'lone', 'bold', 'still', 'bright', 'old'];
  const nouns = ['ember', 'pyre', 'lamp', 'wick', 'spark', 'beacon', 'dust', 'kin'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)] ?? 'ash';
  const n = nouns[Math.floor(Math.random() * nouns.length)] ?? 'ember';
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

function pickRace(): Race {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('race');
    if (fromUrl && isRace(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_RACE);
    if (stored && isRace(stored)) return stored;
  } catch {
    /* ignore */
  }
  const idx = Math.floor(Math.random() * RACES.length);
  return RACES[idx] ?? DEFAULT_RACE;
}

function persistRace(race: Race): void {
  try {
    window.localStorage.setItem(STORAGE_RACE, race);
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
  scene: RoomScene;
  net: NetClient;
  options: RoomOptionsOverlay;
  dispose: () => void;
}

function boot(): RunningClient {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('canvas#scene not found');

  const displayName = makeDisplayName();
  persistDisplayName(displayName);
  const race = pickRace();
  persistRace(race);

  const hud: HudState = {
    status: 'connecting',
    players: 0,
    displayName,
    roomNote: '',
    tick: 0,
    race,
    lightRadius: 0,
    fuel: 1,
    followerCount: 0,
    zone: 'safe',
    caravanSize: 1,
  };
  updateHud(hud);

  let localPlayerId: string | null = null;
  let appliedServerPos = false;

  let net: NetClient | null = null;
  const scene = new RoomScene(canvas, {
    onMoveIntent: (position) => net?.sendMove(position),
    onRescueIntent: () => net?.sendRescue(),
    onActivateRuinIntent: (ruinId) => net?.sendActivateRuin(ruinId),
  });
  scene.setLocalRace(race);

  const options = createRoomOptionsOverlay((roomNote) => {
    net?.sendRoomSettingsPatch({ roomNote });
  });

  canvas.addEventListener('click', () => canvas.focus());

  net = new NetClient(
    {
      url: resolveServerUrl(),
      displayName,
      race,
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
        scene.setLocalRace(welcome.race);
        hud.race = welcome.race;
        persistRace(welcome.race);
        writeResumeToken(welcome.resumeToken);
        debugLogger.info('welcome.applied', {
          playerId: welcome.playerId,
          traceId: welcome.traceId,
          resumed: welcome.resumed,
          race: welcome.race,
        });
      },
      onSnapshot: (snap) => {
        scene.applySnapshot(snap);
        hud.players = snap.players.length;
        hud.roomNote = snap.settings.roomNote;
        hud.tick = snap.tick;
        options.syncRoomNoteFromServer(snap.settings.roomNote);
        const me = localPlayerId
          ? snap.players.find((p) => p.id === localPlayerId)
          : snap.players.find((p) => p.name === displayName);
        if (me) {
          hud.lightRadius = me.lightRadius;
          hud.fuel = me.fuel;
          hud.followerCount = me.followerCount;
          hud.zone = me.zone;
          hud.race = me.race;
          const myCaravan = snap.caravans.find((c) => c.id === me.caravanId);
          hud.caravanSize = myCaravan?.memberIds.length ?? 1;
          if (!appliedServerPos) {
            scene.syncLocalFromServer(me.position);
            appliedServerPos = true;
          }
        }
        updateHud(hud);
      },
      onError: (err) => {
        debugLogger.warn('server.error', { ...err });
      },
    },
  );

  scene.start();
  debugLogger.info('client.boot', {
    name: displayName,
    race,
    hasResumeToken: !!readResumeToken(),
  });

  const liveNet = net;
  return {
    scene,
    net: liveNet,
    options,
    dispose: () => {
      try {
        scene.dispose();
      } catch (e) {
        debugLogger.warn('dispose.scene_failed', { err: String(e) });
      }
      try {
        options.dispose();
      } catch (e) {
        debugLogger.warn('dispose.options_failed', { err: String(e) });
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    debugLogger.debug('hmr.dispose', {});
    running.dispose();
  });
  import.meta.hot.accept(() => {
    debugLogger.debug('hmr.accepted', {});
  });
}
