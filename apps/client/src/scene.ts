/**
 * Three.js view of White Exile.
 *
 * What's on screen:
 *   - Endless dune-coloured ground plane with fog tinted to current zone
 *   - Local player (race-tinted core) + glowing light sphere whose radius
 *     mirrors authoritative server radius
 *   - Other players (orange race-tinted spheres) with their own light haloes
 *   - Stranded followers (cool tone) waiting in the fog
 *   - Owned followers trail their owner with a small core
 *   - Ruins (square pillars) and relics (octahedrons) with halo when active
 *
 * Local movement is client-side prediction; the server clamps and rebroadcasts.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  RACE_PROFILES,
  type FollowerKind,
  type FollowerSnapshot,
  type PlayerSnapshot,
  type Race,
  type RelicSnapshot,
  type RoomSnapshot,
  type RuinSnapshot,
  type Vec3,
  type Zone,
  fogDensityForZone,
} from '@realtime-room/shared';
import { makeTooltip, persistLabelsEnabled, readLabelsEnabled, setTooltipText } from './tooltips.js';

export interface SceneCallbacks {
  onMoveIntent: (position: Vec3) => void;
  onRescueIntent: () => void;
  onActivateRuinIntent: (ruinId: string) => void;
}

const MOVE_SPEED = 22;
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

const RUIN_HEIGHT = 6;
const RUIN_RANGE = 6;

const ZONE_LETTER: Record<Zone, string> = {
  safe: 'S',
  grey: 'G',
  deep: 'D',
  dead: 'X',
};

function abbrRace(r: Race): string {
  if (r === 'emberfolk') return 'Em';
  if (r === 'ashborn') return 'As';
  return 'Lu';
}

function abbrFollowerKind(k: FollowerKind): string {
  if (k === 'lantern-bearer') return 'L';
  if (k === 'beast') return 'B';
  return 'W';
}

function tipOtherPlayer(p: PlayerSnapshot): string {
  const short = p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name;
  const sim = p.id.startsWith('ghost-') ? '·sim' : '';
  const bot = p.isBot && !sim ? '·bot' : '';
  return `${short}${sim}${bot} · ${abbrRace(p.race)} · ☀${Math.round(p.lightRadius)}`;
}

function tipYou(p: PlayerSnapshot): string {
  return `You · ${abbrRace(p.race)} · ☀${Math.round(p.lightRadius)} · ${ZONE_LETTER[p.zone]}`;
}

function tipFollower(f: FollowerSnapshot): string {
  const k = abbrFollowerKind(f.kind);
  return f.ownerId === null ? `${k} stray` : `${k} kin`;
}

function tipRuin(r: RuinSnapshot): string {
  return r.activated ? 'Ruin·on' : 'Ruin';
}

function tipRelic(r: RelicSnapshot): string {
  return r.claimed ? 'Relic·✓' : 'Relic';
}

export class RoomScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock: THREE.Clock;
  private readonly ground: THREE.Mesh;
  private readonly groundTip: CSS2DObject;
  private readonly markers = new Map<
    string,
    { core: THREE.Mesh; halo: THREE.Mesh; label: CSS2DObject }
  >();
  private readonly followerMeshes = new Map<string, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private readonly ruinMeshes = new Map<string, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private readonly relicMeshes = new Map<string, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private readonly localGroup = new THREE.Group();
  private readonly localCore: THREE.Mesh;
  private readonly localHalo: THREE.Mesh;
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
  private labelsVisible = readLabelsEnabled();
  /** Latest ruins seen so the F key can target the closest one. */
  private knownRuins: RuinSnapshot[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x07080d, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x111522, fogDensityForZone('safe'));

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 14, 28);
    this.camera.lookAt(0, 0, 0);

    this.clock = new THREE.Clock();
    this.scene.add(new THREE.AmbientLight(0x303a55, 0.45));
    const dir = new THREE.DirectionalLight(0x93a4c8, 0.4);
    dir.position.set(20, 60, 30);
    this.scene.add(dir);

    const groundGeom = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1c2032,
      roughness: 0.95,
      metalness: 0.05,
      emissive: 0x0a0d18,
    });
    this.ground = new THREE.Mesh(groundGeom, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -2;
    this.scene.add(this.ground);

    const grid = new THREE.GridHelper(2400, 60, 0x39475e, 0x1a2233);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -1.99;
    this.scene.add(grid);

    const coreGeom = new THREE.SphereGeometry(0.75, 22, 18);
    const coreMat = new THREE.MeshStandardMaterial({
      color: RACE_PROFILES.emberfolk.lightColor,
      emissive: RACE_PROFILES.emberfolk.lightColor,
      emissiveIntensity: 1.2,
      metalness: 0.1,
      roughness: 0.4,
    });
    this.localCore = new THREE.Mesh(coreGeom, coreMat);
    const haloGeom = new THREE.SphereGeometry(1, 24, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: RACE_PROFILES.emberfolk.lightColor,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    this.localHalo = new THREE.Mesh(haloGeom, haloMat);
    this.localGroup.add(this.localCore);
    this.localGroup.add(this.localHalo);
    this.localLabel = makeTooltip('You');
    this.localLabel.position.set(0, 1.05, 0);
    this.localCore.add(this.localLabel);
    this.localGroup.position.copy(this.localPos);
    this.scene.add(this.localGroup);

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

    this.groundTip = makeTooltip('dune');
    this.groundTip.position.set(0, 0.35, 0);
    this.ground.add(this.groundTip);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  setLocalPlayerId(id: string): void {
    this.playerId = id;
  }

  setLocalRace(race: Race): void {
    this.localRace = race;
    const color = new THREE.Color(RACE_PROFILES[race].lightColor);
    (this.localCore.material as THREE.MeshStandardMaterial).color.copy(color);
    (this.localCore.material as THREE.MeshStandardMaterial).emissive.copy(color);
    (this.localHalo.material as THREE.MeshBasicMaterial).color.copy(color);
  }

  setLabelsVisible(on: boolean): void {
    this.labelsVisible = on;
    persistLabelsEnabled(on);
    this.syncLabelLayerVisibility();
  }

  getLabelsVisible(): boolean {
    return this.labelsVisible;
  }

  private syncLabelLayerVisibility(): void {
    this.labelRenderer.domElement.style.display = this.labelsVisible ? 'block' : 'none';
  }

  /** First snapshot after join: snap camera to server position. */
  syncLocalFromServer(pos: Vec3): void {
    this.localPos.set(pos.x, pos.y, pos.z);
    this.localGroup.position.copy(this.localPos);
  }

  applySnapshot(snap: RoomSnapshot): void {
    this.knownRuins = snap.ruins;

    // Players + their light haloes.
    const seenPlayers = new Set<string>();
    for (const p of snap.players) {
      seenPlayers.add(p.id);
      if (p.id === this.playerId) {
        this.localLightRadius = p.lightRadius;
        this.currentZone = p.zone;
        setTooltipText(this.localLabel, tipYou(p));
        this.scene.fog = new THREE.FogExp2(0x111522, fogDensityForZone(p.zone));
        this.renderer.setClearColor(zoneClearColor(p.zone), 1);
        (this.ground.material as THREE.MeshStandardMaterial).emissive.setHex(
          zoneGroundColor(p.zone),
        );
        continue;
      }
      let entry = this.markers.get(p.id);
      const profile = RACE_PROFILES[p.race];
      if (!entry) {
        const coreMat = new THREE.MeshStandardMaterial({
          color: profile.lightColor,
          emissive: profile.lightColor,
          emissiveIntensity: 0.9,
          metalness: 0.1,
          roughness: 0.45,
        });
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), coreMat);
        const haloMat = new THREE.MeshBasicMaterial({
          color: profile.lightColor,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
        });
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), haloMat);
        const label = makeTooltip('');
        label.position.set(0, 0.88, 0);
        core.add(label);
        this.scene.add(core);
        this.scene.add(halo);
        entry = { core, halo, label };
        this.markers.set(p.id, entry);
      } else {
        const coreMat = entry.core.material as THREE.MeshStandardMaterial;
        coreMat.color.setHex(profile.lightColor);
        coreMat.emissive.setHex(profile.lightColor);
        const haloMat = entry.halo.material as THREE.MeshBasicMaterial;
        haloMat.color.setHex(profile.lightColor);
      }
      setTooltipText(entry.label, tipOtherPlayer(p));
      entry.core.position.set(p.position.x, p.position.y, p.position.z);
      entry.halo.position.copy(entry.core.position);
      const r = Math.max(1, p.lightRadius);
      entry.halo.scale.setScalar(r);
    }
    for (const [id, entry] of this.markers) {
      if (seenPlayers.has(id)) continue;
      entry.core.remove(entry.label);
      this.scene.remove(entry.core);
      this.scene.remove(entry.halo);
      entry.core.geometry.dispose();
      (entry.core.material as THREE.Material).dispose();
      entry.halo.geometry.dispose();
      (entry.halo.material as THREE.Material).dispose();
      this.markers.delete(id);
    }

    this.applyFollowers(snap.followers);
    this.applyRuins(snap.ruins);
    this.applyRelics(snap.relics);
  }

  private applyFollowers(followers: ReadonlyArray<FollowerSnapshot>): void {
    const seen = new Set<string>();
    for (const f of followers) {
      seen.add(f.id);
      let entry = this.followerMeshes.get(f.id);
      const stranded = f.ownerId === null;
      const color = stranded ? 0x668fff : 0xffd6a8;
      if (!entry) {
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: stranded ? 0.7 : 1.0,
          metalness: 0.1,
          roughness: 0.55,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat);
        const label = makeTooltip('');
        label.position.set(0, 0.52, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        this.followerMeshes.set(f.id, entry);
      } else {
        const mat = entry.mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(color);
        mat.emissive.setHex(color);
        mat.emissiveIntensity = stranded ? 0.7 : 1.0;
      }
      setTooltipText(entry.label, tipFollower(f));
      entry.mesh.position.set(f.position.x, f.position.y, f.position.z);
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
        const mat = new THREE.MeshStandardMaterial({
          color: 0x404a66,
          emissive: r.activated ? 0xffce6f : 0x202736,
          emissiveIntensity: r.activated ? 1.4 : 0.4,
          metalness: 0.4,
          roughness: 0.5,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, RUIN_HEIGHT, 2), mat);
        const label = makeTooltip('');
        label.position.set(0, RUIN_HEIGHT / 2 + 0.45, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        this.ruinMeshes.set(r.id, entry);
      } else {
        const mat = entry.mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(r.activated ? 0xffce6f : 0x202736);
        mat.emissiveIntensity = r.activated ? 1.4 : 0.4;
      }
      setTooltipText(entry.label, tipRuin(r));
      entry.mesh.position.set(r.position.x, r.position.y + RUIN_HEIGHT / 2 - 2, r.position.z);
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
        const mat = new THREE.MeshStandardMaterial({
          color: 0xb6f0ff,
          emissive: 0xb6f0ff,
          emissiveIntensity: r.claimed ? 0.2 : 1.6,
          metalness: 0.3,
          roughness: 0.2,
          transparent: true,
          opacity: r.claimed ? 0.3 : 1.0,
        });
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), mat);
        const label = makeTooltip('');
        label.position.set(0, 1.05, 0);
        mesh.add(label);
        this.scene.add(mesh);
        entry = { mesh, label };
        this.relicMeshes.set(r.id, entry);
      } else {
        const mat = entry.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = r.claimed ? 0.2 : 1.6;
        mat.opacity = r.claimed ? 0.3 : 1.0;
      }
      setTooltipText(entry.label, tipRelic(r));
      entry.mesh.position.set(r.position.x, r.position.y + 1, r.position.z);
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
      this.setLabelsVisible(!this.labelsVisible);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
  };

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

    const ax = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const az = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0);
    const ay =
      (this.keys.has('Space') ? 1 : 0) -
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1 : 0);
    if (ax !== 0 || ay !== 0 || az !== 0) {
      const len = Math.hypot(ax, ay, az) || 1;
      this.localPos.x += (ax / len) * MOVE_SPEED * dt;
      this.localPos.y += (ay / len) * MOVE_SPEED * dt;
      this.localPos.z += (az / len) * MOVE_SPEED * dt;
      this.localGroup.position.copy(this.localPos);
    }

    this.localHalo.scale.setScalar(Math.max(1.0, this.localLightRadius));

    this.moveAccum += dt;
    while (this.moveAccum >= this.moveInterval) {
      this.moveAccum -= this.moveInterval;
      this.callbacks.onMoveIntent({
        x: this.localPos.x,
        y: this.localPos.y,
        z: this.localPos.z,
      });
    }

    TMP.copy(this.localPos);
    TMP2.set(0, 8, 18);
    this.camera.position.lerp(TMP.add(TMP2), 0.08);
    this.camera.lookAt(this.localPos);

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
    for (const entry of this.markers.values()) {
      entry.core.remove(entry.label);
      this.scene.remove(entry.core);
      this.scene.remove(entry.halo);
      entry.core.geometry.dispose();
      (entry.core.material as THREE.Material).dispose();
      entry.halo.geometry.dispose();
      (entry.halo.material as THREE.Material).dispose();
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
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}

function zoneClearColor(zone: Zone): number {
  switch (zone) {
    case 'safe':
      return 0x0c1018;
    case 'grey':
      return 0x080a12;
    case 'deep':
      return 0x05060a;
    case 'dead':
      return 0x020205;
  }
}

function zoneGroundColor(zone: Zone): number {
  switch (zone) {
    case 'safe':
      return 0x0a0e18;
    case 'grey':
      return 0x080b14;
    case 'deep':
      return 0x05070d;
    case 'dead':
      return 0x020308;
  }
}
