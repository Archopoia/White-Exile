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
  RACE_PROFILES,
  WORLD_PLACEMENT_OFFSET,
  ashDuneSurfaceWorldY,
  fogDensityForZone,
  nearestBy,
  placementSurfaceY,
  type FollowerSnapshot,
  type PlayerSnapshot,
  type Race,
  type RelicSnapshot,
  type RoomSnapshot,
  type RuinSnapshot,
  type Vec3,
  type Zone,
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
import { createNprPost, type NprPostHandle } from './nprPost.js';
import type { NprSettings } from './nprSettings.js';
import { type DeadSky, createDeadSky } from './sky.js';
import { DEFAULT_SCENE_VISUAL } from './roomOptionsDefaults.js';
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
  /** Multiplies all player torch PointLight reach (client-only). */
  readonly torchReachMul: number;
}

export { DEFAULT_SCENE_VISUAL };

const MOVE_SPEED = 22;
const TMP = new THREE.Vector3();
const CAM_OFFSET_INIT = new THREE.Vector3(0, 8, 18);
const ORBIT_SENS = 0.003;
const ORBIT_MIN_PITCH = 0.08;
const ORBIT_MAX_PITCH = 1.35;
const ORBIT_DIST_MIN = 10;
const ORBIT_DIST_MAX = 52;

const RUIN_HEIGHT = 6;
/** Matches server `RUIN_RANGE` in `sim.ts`; keep `RUIN_LABEL_HINT_RADIUS` in sync. */
const RUIN_RANGE = 6;

/**
 * Per-zone visual presets the renderer applies on zone change. One row per zone
 * keeps clear-color, ground emissive, and lighting fill scale together; adding
 * a new zone band = one row here + one entry in {@link ZONE_BANDS}.
 */
interface ZoneVisualPreset {
  /** WebGL clear color (only visible if the sky shader fails). */
  readonly clearColor: number;
  /** Ground material emissive baseline so fully shadowed terrain isn't pitch black. */
  readonly groundEmissive: number;
  /** Multiplier on hemisphere + sun (`flameLighting.setZoneIntensity`). */
  readonly lightingScale: number;
}

const ZONE_VISUAL: Readonly<Record<Zone, ZoneVisualPreset>> = Object.freeze({
  safe: { clearColor: 0x231b26, groundEmissive: 0x141018, lightingScale: 1.0 },
  grey: { clearColor: 0x1a141e, groundEmissive: 0x100c14, lightingScale: 0.78 },
  deep: { clearColor: 0x110d18, groundEmissive: 0x0a070f, lightingScale: 0.55 },
  dead: { clearColor: 0x09060c, groundEmissive: 0x050308, lightingScale: 0.35 },
});

/** Max CSS2D tooltips per category (others / followers / ruins / relics); nearest to local player win. */
const MAX_NEARBY_WORLD_LABELS = 5;

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

interface EntityPoolEntry {
  mesh: THREE.Mesh;
  label: CSS2DObject;
}

interface SceneSurfaceQuery {
  surfaceYAt(x: number, z: number): number;
}

/**
 * Per-entity-kind visual recipe used by {@link RoomScene.syncEntityPool}.
 * Adding a new kind is one record + a Map field + a single call site.
 *
 *   - `geometry` / `makeMaterial`: factory called when a new id appears.
 *   - `refreshMaterial`: called on every existing entity each tick.
 *   - `placeAt`: where the mesh sits this tick (in world coords).
 *   - `labelY`: local Y for the world-space CSS2D label.
 *   - `afterUpdate`: optional bookkeeping (e.g. relic spin).
 */
interface EntityVisual<S extends { id: string; position: Vec3 }> {
  readonly labelY: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  geometry(): THREE.BufferGeometry;
  makeMaterial(s: S): THREE.MeshStandardMaterial;
  refreshMaterial(mat: THREE.MeshStandardMaterial, s: S): void;
  placeAt(s: S, scene: SceneSurfaceQuery): Vec3;
  afterUpdate?: (mesh: THREE.Mesh, s: S) => void;
}

const OTHER_PLAYER_VISUAL: EntityVisual<PlayerSnapshot> = {
  labelY: 1.95,
  geometry: () => new THREE.SphereGeometry(0.55, 24, 18),
  makeMaterial: (p) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.91, metalness: 0.05 });
    applyAshCaravanCoreMaterial(mat, RACE_PROFILES[p.race].lightColor);
    return mat;
  },
  refreshMaterial: (mat, p) => applyAshCaravanCoreMaterial(mat, RACE_PROFILES[p.race].lightColor),
  placeAt: (p, scene) => ({
    x: p.position.x,
    y: scene.surfaceYAt(p.position.x, p.position.z) + WORLD_PLACEMENT_OFFSET.otherPlayer,
    z: p.position.z,
  }),
};

const FOLLOWER_VISUAL: EntityVisual<FollowerSnapshot> = {
  labelY: 1.2,
  geometry: () => new THREE.SphereGeometry(0.32, 12, 10),
  makeMaterial: (f) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.92, metalness: 0.045 });
    applyAshFollowerMaterial(mat, f.ownerId === null);
    return mat;
  },
  refreshMaterial: (mat, f) => applyAshFollowerMaterial(mat, f.ownerId === null),
  placeAt: (f, scene) => ({
    x: f.position.x,
    y: scene.surfaceYAt(f.position.x, f.position.z) + WORLD_PLACEMENT_OFFSET.follower,
    z: f.position.z,
  }),
  afterUpdate: (mesh, f) => mesh.scale.setScalar(0.85 + f.morale * 0.6),
};

const RUIN_VISUAL: EntityVisual<RuinSnapshot> = {
  labelY: RUIN_HEIGHT / 2 + 1.25,
  geometry: () => new THREE.BoxGeometry(2, RUIN_HEIGHT, 2),
  makeMaterial: (r) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x404a66, roughness: 0.88, metalness: 0.06 });
    applyAshRuinMaterial(mat, r.activated);
    return mat;
  },
  refreshMaterial: (mat, r) => applyAshRuinMaterial(mat, r.activated),
  placeAt: (r) => ({ x: r.position.x, y: r.position.y, z: r.position.z }),
};

const RELIC_VISUAL: EntityVisual<RelicSnapshot> = {
  labelY: 1.95,
  geometry: () => new THREE.OctahedronGeometry(0.9, 0),
  makeMaterial: (r) => {
    const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: r.claimed ? 0.3 : 1.0 });
    applyAshRelicMaterial(mat, r.claimed);
    return mat;
  },
  refreshMaterial: (mat, r) => applyAshRelicMaterial(mat, r.claimed),
  placeAt: (r) => ({ x: r.position.x, y: r.position.y, z: r.position.z }),
  afterUpdate: (mesh) => {
    mesh.rotation.y += 0.02;
  },
};

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
  private nprPost: NprPostHandle | null = null;
  private nprEnabled = false;
  private readonly markers = new Map<string, EntityPoolEntry>();
  private readonly followerMeshes = new Map<string, EntityPoolEntry>();
  private readonly ruinMeshes = new Map<string, EntityPoolEntry>();
  private readonly relicMeshes = new Map<string, EntityPoolEntry>();
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
  /** Mirrors lighting torch reach; thins exp fog slightly so distant torches read. */
  private torchReachMul = DEFAULT_SCENE_VISUAL.torchReachMul;
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
    nprInitial?: NprSettings,
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.fogEnabled = fogEnabled;
    const v: SceneVisualSettings = { ...DEFAULT_SCENE_VISUAL, ...visual };
    this.fogDensityMul = v.fogDensityMul;
    this.torchReachMul = v.torchReachMul;

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
    this.lighting.setTorchReachMul(v.torchReachMul);
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
    // No cast: the caravan ball would otherwise self-shadow the dunes in its own
    // point light — reads as a fuel-scaling dark disk underfoot (umbra shrinks as
    // torch `distance` grows). Sun + other props still cast normally.
    this.localCore.castShadow = false;
    this.localCore.receiveShadow = true;
    this.localGroup.add(this.localCore);
    this.localLabel = makeTooltip('');
    this.localLabel.position.set(0, 2.15, 0);
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
    this.groundTip.position.set(0, 0.95, 0);
    this.ground.add(this.groundTip);

    if (nprInitial) {
      this.nprPost = createNprPost(this.renderer, nprInitial);
      this.nprEnabled = nprInitial.enabled;
    }

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

  setNprSettings(s: NprSettings): void {
    if (!this.nprPost) {
      this.nprPost = createNprPost(this.renderer, s);
    } else {
      this.nprPost.setSettings(s);
    }
    this.nprEnabled = s.enabled;
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

  setTorchReachMul(mul: number): void {
    this.torchReachMul = mul;
    this.lighting.setTorchReachMul(mul);
    this.applyExpFogForCurrentZone();
  }

  setToneMappingExposure(exposure: number): void {
    this.renderer.toneMappingExposure = THREE.MathUtils.clamp(exposure, 0.35, 2.75);
  }

  setSkyHazeMul(mul: number): void {
    this.sky.setSkyHazeMultiplier(mul);
  }

  private expFogDensityForZone(zone: Zone): number {
    const reach = THREE.MathUtils.clamp(this.torchReachMul, 1, 80);
    const torchFogEase = 1 / Math.pow(reach, 0.28);
    return fogDensityForZone(zone) * 0.52 * this.fogDensityMul * torchFogEase;
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

  private distSqToLocal(worldX: number, worldY: number, worldZ: number): number {
    const dx = worldX - this.localPos.x;
    const dy = worldY - this.localPos.y;
    const dz = worldZ - this.localPos.z;
    return dx * dx + dy * dy + dz * dz;
  }

  private refreshLabelTexts(): void {
    const mode = this.labelMode;
    setTooltipText(this.groundTip, labelGround(mode));
    const snap = this.lastSnap;
    if (!snap) return;

    this.localLabel.visible = true;
    for (const p of snap.players) {
      if (p.id === this.playerId) {
        setTooltipText(this.localLabel, labelYou(p, mode));
        break;
      }
    }

    type LabelDescriptor<S extends { id: string; position: Vec3 }, M extends { label: CSS2DObject }> = {
      readonly items: ReadonlyArray<S>;
      readonly pool: Map<string, M>;
      /** Optional Y override (e.g. for entities whose stored Y is the dune projection). */
      readonly surfaceY?: (s: S) => number;
      readonly text: (s: S, prox: LabelProximity) => string;
    };

    const renderLabels = <S extends { id: string; position: Vec3 }, M extends { label: CSS2DObject }>(
      d: LabelDescriptor<S, M>,
    ): void => {
      const ordered = d.items
        .map((s) => {
          const y = d.surfaceY ? d.surfaceY(s) : s.position.y;
          return { s, distSq: this.distSqToLocal(s.position.x, y, s.position.z) };
        })
        .sort((a, b) => a.distSq - b.distSq);
      const show = new Set(ordered.slice(0, MAX_NEARBY_WORLD_LABELS).map((o) => o.s.id));
      for (const { s } of ordered) {
        const entry = d.pool.get(s.id);
        if (!entry) continue;
        const visible = show.has(s.id);
        entry.label.visible = visible;
        if (!visible) continue;
        const prox = this.labelProximity(s.position.x, s.position.y, s.position.z);
        setTooltipText(entry.label, d.text(s, prox));
      }
    };

    const otherPlayers = snap.players.filter((p) => p.id !== this.playerId);
    renderLabels({
      items: otherPlayers,
      pool: this.markers,
      surfaceY: (p) => this.surfaceYAt(p.position.x, p.position.z) + WORLD_PLACEMENT_OFFSET.otherPlayer,
      text: (p) => labelOtherPlayer(p, mode),
    });
    renderLabels({
      items: snap.followers,
      pool: this.followerMeshes,
      surfaceY: (f) => this.surfaceYAt(f.position.x, f.position.z) + WORLD_PLACEMENT_OFFSET.follower,
      text: (f, prox) => labelFollower(f, mode, prox),
    });
    renderLabels({
      items: snap.ruins,
      pool: this.ruinMeshes,
      text: (r, prox) => labelRuin(r, mode, prox),
    });
    renderLabels({
      items: snap.relics,
      pool: this.relicMeshes,
      text: (r) => labelRelic(r, mode),
    });
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
    const otherFlames: OtherFlame[] = [];
    const otherPlayers: PlayerSnapshot[] = [];
    for (const p of snap.players) {
      if (p.id === this.playerId) {
        this.localLightRadius = p.lightRadius;
        this.lighting.setLocalRadius(p.lightRadius);
        if (p.zone !== this.currentZone) {
          this.currentZone = p.zone;
          const preset = ZONE_VISUAL[p.zone];
          this.applyExpFogForCurrentZone();
          this.renderer.setClearColor(preset.clearColor, 1);
          this.groundMat.emissive.setHex(preset.groundEmissive);
          this.sky.setZoneTone(p.zone);
          this.lighting.setZoneIntensity(preset.lightingScale);
        }
        continue;
      }
      otherPlayers.push(p);
    }
    this.syncEntityPool(otherPlayers, this.markers, OTHER_PLAYER_VISUAL);
    for (const p of otherPlayers) {
      const entry = this.markers.get(p.id);
      if (!entry) continue;
      otherFlames.push({
        id: p.id,
        position: entry.mesh.position,
        color: RACE_PROFILES[p.race].lightColor,
        lightRadius: Math.max(0, p.lightRadius),
      });
    }
    this.lighting.setOtherFlames(otherFlames);

    this.syncEntityPool(snap.followers, this.followerMeshes, FOLLOWER_VISUAL);
    this.syncEntityPool(snap.ruins, this.ruinMeshes, RUIN_VISUAL);
    this.syncEntityPool(snap.relics, this.relicMeshes, RELIC_VISUAL);
    this.lastSnap = snap;
    this.refreshLabelTexts();
  }

  /**
   * One-helper-fits-all entity sync: spawn meshes for new ids, refresh
   * material + transform for existing ones, and dispose missing ones. Each
   * entity kind contributes its mesh factory + per-tick updater via a small
   * {@link EntityVisual} record (defined module-side, near the materials they
   * use). Adding a new entity = one new record + one call site.
   */
  private syncEntityPool<S extends { id: string; position: Vec3 }>(
    items: ReadonlyArray<S>,
    pool: Map<string, EntityPoolEntry>,
    visual: EntityVisual<S>,
  ): void {
    const seen = new Set<string>();
    for (const s of items) {
      seen.add(s.id);
      let entry = pool.get(s.id);
      if (!entry) {
        const mat = visual.makeMaterial(s);
        const mesh = new THREE.Mesh(visual.geometry(), mat);
        mesh.castShadow = visual.castShadow ?? true;
        mesh.receiveShadow = visual.receiveShadow ?? true;
        const label = makeTooltip('');
        label.position.set(0, visual.labelY, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        pool.set(s.id, entry);
      } else {
        visual.refreshMaterial(entry.mesh.material as THREE.MeshStandardMaterial, s);
      }
      const pos = visual.placeAt(s, this);
      entry.mesh.position.set(pos.x, pos.y, pos.z);
      visual.afterUpdate?.(entry.mesh, s);
    }
    for (const [id, entry] of pool) {
      if (seen.has(id)) continue;
      this.disposeEntityEntry(entry);
      pool.delete(id);
    }
  }

  /** Detach mesh + label from scene and free GPU resources for one pool entry. */
  private disposeEntityEntry(entry: EntityPoolEntry): void {
    entry.mesh.remove(entry.label);
    this.scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    (entry.mesh.material as THREE.Material).dispose();
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
    if (this.nprPost) this.nprPost.setSize(w, h);
  };

  private dunePhaseSeconds(): number {
    return getAshDuneTerrainUniforms(this.groundMat)?.uTime.value ?? 0;
  }

  surfaceYAt(x: number, z: number): number {
    return ashDuneSurfaceWorldY(x, z, this.dunePhaseSeconds(), {
      heightScale: this.duneHeightScale,
    });
  }

  private snapLocalYToDune(): void {
    this.localPos.y = placementSurfaceY(
      'player',
      this.localPos.x,
      this.localPos.z,
      this.dunePhaseSeconds(),
      { heightScale: this.duneHeightScale },
    );
  }

  private findNearestRuin(): RuinSnapshot | null {
    return nearestBy(
      this.knownRuins,
      { x: this.localPos.x, y: this.localPos.y, z: this.localPos.z },
      undefined,
      RUIN_RANGE,
    );
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

    if (this.nprEnabled && this.nprPost) {
      // Sky is hidden during the normal prepass to avoid sphere-vs-geometry edges.
      this.nprPost.render(this.scene, this.camera, [this.sky.mesh]);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
    for (const pool of [this.markers, this.followerMeshes, this.ruinMeshes, this.relicMeshes]) {
      for (const entry of pool.values()) this.disposeEntityEntry(entry);
      pool.clear();
    }
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
    if (this.nprPost) this.nprPost.dispose();
    this.renderer.dispose();
  }
}

