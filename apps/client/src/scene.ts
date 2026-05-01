/**
 * Three.js view of White Exile.
 *
 * What's on screen:
 *   - Endless ash/snow dune terrain (shader displacement: height + chaos with radius from origin;
 *     terrain casts/receives shadows using custom depth/distance materials so shadow maps match displacement)
 *   - Moon-gold sun sky dome (`sky.ts`) — gradient + horizon haze + smothered sun disk
 *   - Local player core lit by a real shadow-casting torch flame (`flameLighting.ts`):
 *     hero `SpotLight` (one shadow map), fill `PointLight`, and a custom
 *     additive flame shader. Flicker drives both visual flame and cast light.
 *   - Other players: race-tinted core, plus a pooled `PointLight` per active
 *     player from a preallocated pool. Light radius scales the `PointLight`'s
 *     `distance` directly — bigger fuel/followers = wider illumination on
 *     the dunes. No fake halo spheres anywhere; what you see lit IS lit.
 *   - Stranded followers (cool tone) waiting in the fog
 *   - Owned followers trail their owner with a small core
 *   - Ruins (square pillars) and relics (octahedrons) — dusty ash-tinted materials so sun/hemi shade them like terrain
 *
 * Local movement is client-side prediction; the server clamps and rebroadcasts.
 *
 * Graphics quality tier is passed in via the constructor and changed live
 * via `setLightingTier`. Source of truth: the ESC menu (`options.ts`).
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  ASH_DUNE_DEFAULT_HEIGHT_SCALE,
  ASH_DUNE_FOLLOWER_CENTER_OFFSET,
  ASH_DUNE_OTHER_PLAYER_CENTER_OFFSET,
  ASH_DUNE_PLAYER_CENTER_OFFSET,
  RACE_PROFILES,
  ashDuneSurfaceWorldY,
  type FollowerSnapshot,
  type Race,
  type RelicSnapshot,
  type RoomSnapshot,
  type RuinSnapshot,
  type Vec3,
  type Zone,
  fogDensityForZone,
} from '@realtime-room/shared';
import { getLabelMode, setLabelMode as persistLabelMode } from './clientSettings.js';
import {
  applyAshDuneTerrainShader,
  createAshDuneShadowMaterials,
  getAshDuneTerrainUniforms,
  type AshDuneShadowMaterials,
} from './duneTerrainMaterial.js';
import {
  type FlameLighting,
  type FxTier,
  type OtherFlame,
  createFlameLighting,
} from './flameLighting.js';
import { type DeadSky, createDeadSky } from './sky.js';
import { makeTooltip, nextLabelMode, setTooltipText, type WorldLabelMode } from './tooltips.js';
import {
  labelFollower,
  labelGround,
  labelOtherPlayer,
  labelRelic,
  labelRuin,
  labelYou,
  type LabelProximity,
} from './worldLabels.js';

export interface SceneCallbacks {
  onMoveIntent: (position: Vec3) => void;
  onRescueIntent: () => void;
  onActivateRuinIntent: (ruinId: string) => void;
}

/** Client-only rendering tuning (persisted in `clientSettings.ts`). */
export interface SceneVisualSettings {
  /** Scales exponential distance fog density when fog is enabled. */
  readonly fogDensityMul: number;
  /** Scales hemisphere, sun, and ambient fill in `flameLighting.ts`. */
  readonly fillLightMul: number;
  /** `WebGLRenderer.toneMappingExposure`. */
  readonly toneMappingExposure: number;
  /** Multiplies sky dome `uHaze` from zone presets. */
  readonly skyHazeMul: number;
}

export const DEFAULT_SCENE_VISUAL: SceneVisualSettings = Object.freeze({
  fogDensityMul: 1,
  fillLightMul: 1,
  /** Lifted so lower ambient + stronger sun still lands in a playable range. */
  toneMappingExposure: 1.32,
  skyHazeMul: 1,
});

const MOVE_SPEED = 22;
const TMP = new THREE.Vector3();
const CAM_OFFSET_INIT = new THREE.Vector3(0, 8, 18);
const ORBIT_SENS = 0.003;
const ORBIT_MIN_PITCH = 0.08;
const ORBIT_MAX_PITCH = 1.35;
const ORBIT_DIST_MIN = 10;
const ORBIT_DIST_MAX = 52;

const RUIN_HEIGHT = 6;
const RUIN_RANGE = 6;

/** Dune-adjacent neutral so lit vs shaded reads on props, not neon stickers. */
const ASH_PROP_COOL = new THREE.Color(0x3c4450);
const ASH_PROP_WARM = new THREE.Color(0x403c38);

function applyAshCaravanCoreMaterial(mat: THREE.MeshStandardMaterial, raceLightHex: number): void {
  const tint = new THREE.Color(raceLightHex);
  mat.color.copy(ASH_PROP_COOL).lerp(tint, 0.24);
  mat.emissive.copy(tint).multiplyScalar(0.18);
  mat.emissiveIntensity = 0.038;
  mat.roughness = 0.91;
  mat.metalness = 0.05;
}

function applyAshFollowerMaterial(mat: THREE.MeshStandardMaterial, stranded: boolean): void {
  const tint = new THREE.Color(stranded ? 0x668fff : 0xffd6a8);
  const base = stranded ? ASH_PROP_COOL : ASH_PROP_WARM;
  mat.color.copy(base).lerp(tint, stranded ? 0.14 : 0.2);
  mat.emissive.copy(tint).multiplyScalar(0.14);
  mat.emissiveIntensity = 0.034;
  mat.roughness = 0.92;
  mat.metalness = 0.045;
}

function applyAshRuinMaterial(mat: THREE.MeshStandardMaterial, activated: boolean): void {
  if (activated) {
    mat.color.setHex(0x686055);
    mat.emissive.setHex(0x4a423c);
    mat.emissiveIntensity = 0.045;
  } else {
    mat.color.setHex(0x383e4a);
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  }
  mat.roughness = 0.88;
  mat.metalness = 0.06;
}

function applyAshRelicMaterial(mat: THREE.MeshStandardMaterial, claimed: boolean): void {
  mat.color.setHex(claimed ? 0x566068 : 0x6a7780);
  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;
  mat.metalness = 0.04;
  mat.roughness = 0.9;
  mat.opacity = claimed ? 0.3 : 1.0;
}

export class RoomScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock: THREE.Clock;
  private readonly ground: THREE.Mesh;
  private readonly groundMat: THREE.MeshStandardMaterial;
  private readonly groundShadowMats: AshDuneShadowMaterials;
  private readonly groundTip: CSS2DObject;
  private readonly lighting: FlameLighting;
  private readonly sky: DeadSky;
  private readonly markers = new Map<string, { core: THREE.Mesh; label: CSS2DObject }>();
  private readonly followerMeshes = new Map<string, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private readonly ruinMeshes = new Map<string, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private readonly relicMeshes = new Map<string, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private readonly localGroup = new THREE.Group();
  private readonly localCore: THREE.Mesh;
  private readonly localLabel: CSS2DObject;
  private readonly keys = new Set<string>();
  private readonly callbacks: SceneCallbacks;
  private playerId: string | null = null;
  private localRace: Race = 'emberfolk';
  private localPos = new THREE.Vector3(0, 2, 8);
  private localLightRadius = RACE_PROFILES.emberfolk.baseLightRadius;
  private moveAccum = 0;
  private readonly moveInterval = 1 / 20;
  private rafHandle = 0;
  private currentZone: Zone = 'safe';
  private fogEnabled = true;
  private fogDensityMul = DEFAULT_SCENE_VISUAL.fogDensityMul;
  private labelMode: WorldLabelMode = getLabelMode();
  /** Latest snapshot for label text when `labelMode` changes. */
  private lastSnap: RoomSnapshot | null = null;
  /** Matches `worldConfig.duneHeightScale` (shader + CPU surface sampling). */
  private duneHeightScale = ASH_DUNE_DEFAULT_HEIGHT_SCALE;
  /** Orbit yaw (rad) around world +Y through the player. */
  private camYaw = 0;
  /** Pitch (rad) above the horizontal xz plane through the player. */
  private camPitch = Math.atan2(CAM_OFFSET_INIT.y, Math.hypot(CAM_OFFSET_INIT.x, CAM_OFFSET_INIT.z));
  private orbitDistance = CAM_OFFSET_INIT.length();
  private readonly cameraOffset = new THREE.Vector3();
  private rmbLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  /** Latest ruins seen so the F key can target the closest one. */
  private knownRuins: RuinSnapshot[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: SceneCallbacks,
    initialTier: FxTier,
    fogEnabled = true,
    visual?: Partial<SceneVisualSettings>,
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.fogEnabled = fogEnabled;
    const v: SceneVisualSettings = { ...DEFAULT_SCENE_VISUAL, ...visual };
    this.fogDensityMul = v.fogDensityMul;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x231b26, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = v.toneMappingExposure;

    this.scene = new THREE.Scene();
    this.applyExpFogForCurrentZone();

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 14, 28);
    this.camera.lookAt(0, 0, 0);

    this.clock = new THREE.Clock();

    this.sky = createDeadSky(this.scene, { initialHazeMul: v.skyHazeMul });
    this.lighting = createFlameLighting(this.scene, this.renderer, initialTier);
    this.lighting.setFillLightMul(v.fillLightMul);
    // Stored convention: sky's `uSunDir` points TOWARD the sun, lighting's
    // `setSunDirection` takes the FROM-the-sun vector. They are inverses.
    // The sun sits low (~12° above horizon) and slightly to the player's
    // front-right of the default camera, so it's visible in the sky AND
    // the directional light grazes the dune crests for clear slope shading.
    const towardSun = new THREE.Vector3(0.55, 0.22, -0.8).normalize();
    this.sky.setSunDirection(towardSun);
    this.lighting.setSunDirection(towardSun.clone().negate());

    const groundGeom = new THREE.PlaneGeometry(3600, 3600, 320, 320);
    this.groundMat = new THREE.MeshStandardMaterial({
      // Cool grey ash base; dune shader layers frost grain + rim on top.
      color: 0x636a78,
      roughness: 0.9,
      metalness: 0.02,
      emissive: 0x0c0a12,
    });
    const duneUniforms = applyAshDuneTerrainShader(this.groundMat);
    this.groundShadowMats = createAshDuneShadowMaterials(duneUniforms);
    this.ground = new THREE.Mesh(groundGeom, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -2;
    this.ground.receiveShadow = true;
    this.ground.castShadow = true;
    this.ground.customDepthMaterial = this.groundShadowMats.depth;
    this.ground.customDistanceMaterial = this.groundShadowMats.distance;
    this.scene.add(this.ground);

    const coreGeom = new THREE.SphereGeometry(0.75, 28, 22);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.91, metalness: 0.05 });
    applyAshCaravanCoreMaterial(coreMat, RACE_PROFILES.emberfolk.lightColor);
    this.localCore = new THREE.Mesh(coreGeom, coreMat);
    this.localCore.castShadow = true;
    this.localCore.receiveShadow = true;
    this.localGroup.add(this.localCore);
    this.localLabel = makeTooltip('');
    this.localLabel.position.set(0, 1.05, 0);
    this.localCore.add(this.localLabel);
    this.localGroup.position.copy(this.localPos);
    this.scene.add(this.localGroup);
    this.lighting.setLocalAttachment(this.localGroup, this.localRace);

    this.labelRenderer = new CSS2DRenderer();
    const parent = this.canvas.parentElement ?? document.body;
    const lr = this.labelRenderer.domElement;
    lr.style.position = 'fixed';
    lr.style.inset = '0';
    lr.style.pointerEvents = 'none';
    lr.style.zIndex = '4';
    parent.appendChild(lr);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.syncLabelLayerVisibility();

    this.groundTip = makeTooltip(labelGround(this.labelMode));
    this.groundTip.position.set(0, 0.35, 0);
    this.ground.add(this.groundTip);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  setLocalPlayerId(id: string): void {
    this.playerId = id;
  }

  setLocalRace(race: Race): void {
    this.localRace = race;
    applyAshCaravanCoreMaterial(this.localCore.material as THREE.MeshStandardMaterial, RACE_PROFILES[race].lightColor);
    this.lighting.setRace(race);
  }

  setLightingTier(tier: FxTier): void {
    this.lighting.setTier(tier);
  }

  setFogEnabled(enabled: boolean): void {
    this.fogEnabled = enabled;
    this.applyExpFogForCurrentZone();
  }

  setFogDensityMul(mul: number): void {
    this.fogDensityMul = THREE.MathUtils.clamp(mul, 0, 2.5);
    this.applyExpFogForCurrentZone();
  }

  setFillLightMul(mul: number): void {
    this.lighting.setFillLightMul(mul);
  }

  setToneMappingExposure(exposure: number): void {
    this.renderer.toneMappingExposure = THREE.MathUtils.clamp(exposure, 0.35, 2.75);
  }

  setSkyHazeMul(mul: number): void {
    this.sky.setSkyHazeMultiplier(mul);
  }

  private expFogDensityForZone(zone: Zone): number {
    return fogDensityForZone(zone) * 0.52 * this.fogDensityMul;
  }

  private applyExpFogForCurrentZone(): void {
    if (this.fogEnabled) {
      this.scene.fog = new THREE.FogExp2(0x111522, this.expFogDensityForZone(this.currentZone));
    } else {
      this.scene.fog = null;
    }
  }

  setLabelMode(mode: WorldLabelMode): void {
    this.labelMode = mode;
    persistLabelMode(mode);
    this.syncLabelLayerVisibility();
    this.refreshLabelTexts();
  }

  getLabelMode(): WorldLabelMode {
    return this.labelMode;
  }

  private syncLabelLayerVisibility(): void {
    this.labelRenderer.domElement.style.display = this.labelMode === 'off' ? 'none' : 'block';
  }

  private labelProximity(x: number, y: number, z: number): LabelProximity {
    const dx = x - this.localPos.x;
    const dy = y - this.localPos.y;
    const dz = z - this.localPos.z;
    return { distSqToLocal: dx * dx + dy * dy + dz * dz, localLightRadius: this.localLightRadius };
  }

  private refreshLabelTexts(): void {
    const mode = this.labelMode;
    setTooltipText(this.groundTip, labelGround(mode));
    const snap = this.lastSnap;
    if (!snap) return;
    for (const p of snap.players) {
      if (p.id === this.playerId) {
        setTooltipText(this.localLabel, labelYou(p, mode));
      } else {
        const entry = this.markers.get(p.id);
        if (entry) setTooltipText(entry.label, labelOtherPlayer(p, mode));
      }
    }
    for (const f of snap.followers) {
      const entry = this.followerMeshes.get(f.id);
      if (entry) {
        const prox = this.labelProximity(f.position.x, f.position.y, f.position.z);
        setTooltipText(entry.label, labelFollower(f, mode, prox));
      }
    }
    for (const r of snap.ruins) {
      const entry = this.ruinMeshes.get(r.id);
      if (entry) {
        const prox = this.labelProximity(r.position.x, r.position.y, r.position.z);
        setTooltipText(entry.label, labelRuin(r, mode, prox));
      }
    }
    for (const r of snap.relics) {
      const entry = this.relicMeshes.get(r.id);
      if (entry) setTooltipText(entry.label, labelRelic(r, mode));
    }
  }

  /** Keep terrain mesh and analytic `surfaceYAt` in sync with the server `WorldConfig`. */
  setDuneHeightScale(scale: number): void {
    this.duneHeightScale = scale;
    const u = getAshDuneTerrainUniforms(this.groundMat);
    if (u) u.uDuneHeightScale.value = scale;
  }

  /** First snapshot after join: snap camera to server position. */
  syncLocalFromServer(pos: Vec3): void {
    this.localPos.set(pos.x, pos.y, pos.z);
    this.snapLocalYToDune();
    this.localGroup.position.copy(this.localPos);
  }

  applySnapshot(snap: RoomSnapshot): void {
    this.setDuneHeightScale(snap.worldConfig.duneHeightScale);
    this.knownRuins = snap.ruins;

    // Players: core mesh + PointLight; `lightRadius` from server is fuel×followers×zone
    // (see `computeSoloLightRadius`); flame intensity tracks radius without a bright floor.
    const seenPlayers = new Set<string>();
    const otherFlames: OtherFlame[] = [];
    for (const p of snap.players) {
      seenPlayers.add(p.id);
      if (p.id === this.playerId) {
        this.localLightRadius = p.lightRadius;
        this.lighting.setLocalRadius(p.lightRadius);
        if (p.zone !== this.currentZone) {
          this.currentZone = p.zone;
          this.applyExpFogForCurrentZone();
          this.renderer.setClearColor(zoneClearColor(p.zone), 1);
          this.groundMat.emissive.setHex(zoneGroundColor(p.zone));
          this.sky.setZoneTone(p.zone);
          this.lighting.setZoneIntensity(zoneIntensityScale(p.zone));
        }
        continue;
      }
      let entry = this.markers.get(p.id);
      const profile = RACE_PROFILES[p.race];
      if (!entry) {
        const coreMat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.91, metalness: 0.05 });
        applyAshCaravanCoreMaterial(coreMat, profile.lightColor);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), coreMat);
        core.castShadow = true;
        core.receiveShadow = true;
        const label = makeTooltip('');
        label.position.set(0, 0.88, 0);
        core.add(label);
        this.scene.add(core);
        entry = { core, label };
        this.markers.set(p.id, entry);
      } else {
        applyAshCaravanCoreMaterial(entry.core.material as THREE.MeshStandardMaterial, profile.lightColor);
      }
      entry.core.position.set(
        p.position.x,
        this.surfaceYAt(p.position.x, p.position.z) + ASH_DUNE_OTHER_PLAYER_CENTER_OFFSET,
        p.position.z,
      );
      otherFlames.push({
        id: p.id,
        position: entry.core.position,
        color: profile.lightColor,
        lightRadius: Math.max(0, p.lightRadius),
      });
    }
    this.lighting.setOtherFlames(otherFlames);
    for (const [id, entry] of this.markers) {
      if (seenPlayers.has(id)) continue;
      entry.core.remove(entry.label);
      this.scene.remove(entry.core);
      entry.core.geometry.dispose();
      (entry.core.material as THREE.Material).dispose();
      this.markers.delete(id);
    }

    this.applyFollowers(snap.followers);
    this.applyRuins(snap.ruins);
    this.applyRelics(snap.relics);
    this.lastSnap = snap;
    this.refreshLabelTexts();
  }

  private applyFollowers(followers: ReadonlyArray<FollowerSnapshot>): void {
    const seen = new Set<string>();
    for (const f of followers) {
      seen.add(f.id);
      let entry = this.followerMeshes.get(f.id);
      const stranded = f.ownerId === null;
      if (!entry) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.92, metalness: 0.045 });
        applyAshFollowerMaterial(mat, stranded);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const label = makeTooltip('');
        label.position.set(0, 0.52, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        this.followerMeshes.set(f.id, entry);
      } else {
        applyAshFollowerMaterial(entry.mesh.material as THREE.MeshStandardMaterial, stranded);
      }
      entry.mesh.position.set(
        f.position.x,
        this.surfaceYAt(f.position.x, f.position.z) + ASH_DUNE_FOLLOWER_CENTER_OFFSET,
        f.position.z,
      );
      entry.mesh.scale.setScalar(0.85 + f.morale * 0.6);
    }
    for (const [id, entry] of this.followerMeshes) {
      if (seen.has(id)) continue;
      entry.mesh.remove(entry.label);
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      this.followerMeshes.delete(id);
    }
  }

  private applyRuins(ruins: ReadonlyArray<RuinSnapshot>): void {
    const seen = new Set<string>();
    for (const r of ruins) {
      seen.add(r.id);
      let entry = this.ruinMeshes.get(r.id);
      if (!entry) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x404a66, roughness: 0.88, metalness: 0.06 });
        applyAshRuinMaterial(mat, r.activated);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, RUIN_HEIGHT, 2), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const label = makeTooltip('');
        label.position.set(0, RUIN_HEIGHT / 2 + 0.45, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        this.ruinMeshes.set(r.id, entry);
      } else {
        applyAshRuinMaterial(entry.mesh.material as THREE.MeshStandardMaterial, r.activated);
      }
      entry.mesh.position.set(r.position.x, r.position.y, r.position.z);
    }
    for (const [id, entry] of this.ruinMeshes) {
      if (seen.has(id)) continue;
      entry.mesh.remove(entry.label);
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      this.ruinMeshes.delete(id);
    }
  }

  private applyRelics(relics: ReadonlyArray<RelicSnapshot>): void {
    const seen = new Set<string>();
    for (const r of relics) {
      seen.add(r.id);
      let entry = this.relicMeshes.get(r.id);
      if (!entry) {
        const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: r.claimed ? 0.3 : 1.0 });
        applyAshRelicMaterial(mat, r.claimed);
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const label = makeTooltip('');
        label.position.set(0, 1.05, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        this.relicMeshes.set(r.id, entry);
      } else {
        applyAshRelicMaterial(entry.mesh.material as THREE.MeshStandardMaterial, r.claimed);
      }
      entry.mesh.position.set(r.position.x, r.position.y, r.position.z);
      entry.mesh.rotation.y += 0.02;
    }
    for (const [id, entry] of this.relicMeshes) {
      if (seen.has(id)) continue;
      entry.mesh.remove(entry.label);
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      this.relicMeshes.delete(id);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyR') {
      this.callbacks.onRescueIntent();
    }
    if (e.code === 'KeyF') {
      const target = this.findNearestRuin();
      if (target) this.callbacks.onActivateRuinIntent(target.id);
    }
    if (e.code === 'KeyT') {
      this.setLabelMode(nextLabelMode(this.labelMode));
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onCanvasClick = (): void => {
    if (document.pointerLockElement === this.canvas) return;
    void this.canvas.requestPointerLock();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 2) return;
    this.rmbLook = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onMouseUp = (): void => {
    this.rmbLook = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    const locked = document.pointerLockElement === this.canvas;
    let dx = 0;
    let dy = 0;
    if (locked) {
      dx = e.movementX;
      dy = e.movementY;
    } else if (this.rmbLook) {
      dx = e.clientX - this.lastPointerX;
      dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    } else {
      return;
    }
    if (dx === 0 && dy === 0) return;
    this.camYaw -= dx * ORBIT_SENS;
    this.camPitch += dy * ORBIT_SENS;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const next = this.orbitDistance + Math.sign(e.deltaY) * 1.8;
    this.orbitDistance = THREE.MathUtils.clamp(next, ORBIT_DIST_MIN, ORBIT_DIST_MAX);
  };

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
  };

  private dunePhaseSeconds(): number {
    return getAshDuneTerrainUniforms(this.groundMat)?.uTime.value ?? 0;
  }

  private surfaceYAt(x: number, z: number): number {
    return ashDuneSurfaceWorldY(x, z, this.dunePhaseSeconds(), { heightScale: this.duneHeightScale });
  }

  private snapLocalYToDune(): void {
    this.localPos.y =
      this.surfaceYAt(this.localPos.x, this.localPos.z) + ASH_DUNE_PLAYER_CENTER_OFFSET;
  }

  private findNearestRuin(): RuinSnapshot | null {
    let best: RuinSnapshot | null = null;
    let bestSq = RUIN_RANGE * RUIN_RANGE;
    for (const r of this.knownRuins) {
      const dx = r.position.x - this.localPos.x;
      const dy = r.position.y - this.localPos.y;
      const dz = r.position.z - this.localPos.z;
      const sq = dx * dx + dy * dy + dz * dz;
      if (sq < bestSq) {
        bestSq = sq;
        best = r;
      }
    }
    return best;
  }

  private loop = () => {
    this.rafHandle = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    const duneU = getAshDuneTerrainUniforms(this.groundMat);
    if (duneU) {
      duneU.uTime.value += dt;
    }
    const elapsed = this.clock.elapsedTime;
    this.sky.uniforms.uTime.value = elapsed;
    this.lighting.update(dt, elapsed);

    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    if (strafe !== 0 || forward !== 0) {
      const cosY = Math.cos(this.camYaw);
      const sinY = Math.sin(this.camYaw);
      // Horizontal axes match orbit camera xz (W walks into the view, away from camera).
      const wx = strafe * cosY - forward * sinY;
      const wz = -strafe * sinY - forward * cosY;
      const len = Math.hypot(wx, wz) || 1;
      this.localPos.x += (wx / len) * MOVE_SPEED * dt;
      this.localPos.z += (wz / len) * MOVE_SPEED * dt;
    }
    this.snapLocalYToDune();
    this.localGroup.position.copy(this.localPos);

    this.lighting.setLocalRadius(Math.max(1.0, this.localLightRadius));

    this.moveAccum += dt;
    while (this.moveAccum >= this.moveInterval) {
      this.moveAccum -= this.moveInterval;
      this.callbacks.onMoveIntent({
        x: this.localPos.x,
        y: this.localPos.y,
        z: this.localPos.z,
      });
    }

    const cosP = Math.cos(this.camPitch);
    this.cameraOffset.set(
      Math.sin(this.camYaw) * cosP * this.orbitDistance,
      Math.sin(this.camPitch) * this.orbitDistance,
      Math.cos(this.camYaw) * cosP * this.orbitDistance,
    );
    TMP.copy(this.localPos).add(this.cameraOffset);
    this.camera.position.lerp(TMP, 0.14);
    this.camera.lookAt(this.localPos);

    if (this.labelMode !== 'off' && this.lastSnap) {
      this.refreshLabelTexts();
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  start(): void {
    if (this.rafHandle) return;
    this.clock.start();
    this.loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    for (const entry of this.markers.values()) {
      entry.core.remove(entry.label);
      this.scene.remove(entry.core);
      entry.core.geometry.dispose();
      (entry.core.material as THREE.Material).dispose();
    }
    this.markers.clear();
    for (const e of this.followerMeshes.values()) {
      e.mesh.remove(e.label);
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    }
    this.followerMeshes.clear();
    for (const e of this.ruinMeshes.values()) {
      e.mesh.remove(e.label);
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    }
    this.ruinMeshes.clear();
    for (const e of this.relicMeshes.values()) {
      e.mesh.remove(e.label);
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    }
    this.relicMeshes.clear();
    this.ground.remove(this.groundTip);
    this.labelRenderer.domElement.remove();
    this.localCore.remove(this.localLabel);
    this.scene.remove(this.localGroup);
    this.localGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.localGroup.clear();
    this.ground.geometry.dispose();
    this.groundShadowMats.depth.dispose();
    this.groundShadowMats.distance.dispose();
    this.ground.customDepthMaterial = undefined;
    this.ground.customDistanceMaterial = undefined;
    this.groundMat.dispose();
    this.lighting.dispose();
    this.sky.dispose();
    this.renderer.dispose();
  }
}

function zoneIntensityScale(zone: Zone): number {
  switch (zone) {
    case 'safe':
      return 1;
    case 'grey':
      return 0.78;
    case 'deep':
      return 0.55;
    case 'dead':
      return 0.35;
  }
}

function zoneClearColor(zone: Zone): number {
  // Used as the WebGL clear color, only visible if the sky shader fails. We
  // match the sky's horizon tone so even in that fallback case we don't get
  // a pitch-black abyss.
  switch (zone) {
    case 'safe':
      return 0x231b26;
    case 'grey':
      return 0x1a141e;
    case 'deep':
      return 0x110d18;
    case 'dead':
      return 0x09060c;
  }
}

function zoneGroundColor(zone: Zone): number {
  // Emissive baseline added to the dune material so even fully shadowed
  // areas keep a tiny bit of detail. Kept very dim — the lighting carries
  // the look.
  switch (zone) {
    case 'safe':
      return 0x141018;
    case 'grey':
      return 0x100c14;
    case 'deep':
      return 0x0a070f;
    case 'dead':
      return 0x050308;
  }
}
