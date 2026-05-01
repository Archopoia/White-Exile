/**
 * Client bootstrap: Three.js scene, Socket.io, HUD, ESC menu.
 * HMR: dispose + reconnect; resume token keeps the same player record.
 *
 * All player-facing tunables live in `clientSettings.ts` and are surfaced
 * via the ESC menu in `options.ts`. There are intentionally no URL query
 * parameters for tunables — if you find any, delete them.
 */
import {
  getDisplayName,
  getLabelMode,
  getFxTier,
  getRace,
  getResumeToken,
  setDisplayName,
  setFxTier,
  setLabelMode,
  setRace,
  setResumeToken,
} from './clientSettings.js';
import { DEFAULT_WORLD_CONFIG } from '@realtime-room/shared';
import { debugLogger } from './debug.js';
import { type FxTier } from './flameLighting.js';
import { updateHud, type HudState } from './hud.js';
import { NetClient } from './net.js';
import { createRoomOptionsOverlay, type RoomOptionsOverlay } from './options.js';
import { RoomScene } from './scene.js';
import { type WorldLabelMode } from './tooltips.js';

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

  const displayName = getDisplayName();
  setDisplayName(displayName);
  const race = getRace();
  setRace(race);
  const fxTier = getFxTier();
  const labelMode = getLabelMode();

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
  const scene = new RoomScene(
    canvas,
    {
      onMoveIntent: (position) => net?.sendMove(position),
      onRescueIntent: () => net?.sendRescue(),
      onActivateRuinIntent: (ruinId) => net?.sendActivateRuin(ruinId),
    },
    fxTier,
  );
  scene.setLocalRace(race);
  scene.setLabelMode(labelMode);

  const options = createRoomOptionsOverlay({
    onFxTierChange: (tier: FxTier) => {
      setFxTier(tier);
      scene.setLightingTier(tier);
    },
    onLabelModeChange: (mode: WorldLabelMode) => {
      setLabelMode(mode);
      scene.setLabelMode(mode);
    },
    onDisplayNameChange: (name: string) => {
      setDisplayName(name);
    },
    onDuneHeightScalePreview: (scale: number) => {
      scene.setDuneHeightScale(scale);
    },
    onDuneHeightScaleCommit: (scale: number) => {
      scene.setDuneHeightScale(scale);
      net?.sendRoomSettingsPatch({ duneHeightScale: scale });
    },
    initial: {
      fxTier,
      labelMode,
      displayName,
      race,
      duneHeightScale: DEFAULT_WORLD_CONFIG.duneHeightScale,
    },
  });

  canvas.addEventListener('click', () => canvas.focus());

  net = new NetClient(
    {
      url: resolveServerUrl(),
      displayName,
      race,
      ...(getResumeToken() ? { resumeToken: getResumeToken() as string } : {}),
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
        scene.setDuneHeightScale(welcome.worldConfig.duneHeightScale);
        options.syncDuneHeightScale(welcome.worldConfig.duneHeightScale);
        scene.setLocalRace(welcome.race);
        hud.race = welcome.race;
        setRace(welcome.race);
        setResumeToken(welcome.resumeToken);
        debugLogger.info('welcome.applied', {
          playerId: welcome.playerId,
          traceId: welcome.traceId,
          resumed: welcome.resumed,
          race: welcome.race,
        });
      },
      onSnapshot: (snap) => {
        scene.applySnapshot(snap);
        options.syncDuneHeightScale(snap.worldConfig.duneHeightScale);
        hud.players = snap.players.length;
        hud.roomNote = snap.settings.roomNote;
        hud.tick = snap.tick;
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
    fxTier,
    hasResumeToken: !!getResumeToken(),
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
