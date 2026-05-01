/**
 * Three.js scene for Tutelary - SMG-style surface walker.
 *
 * Gameplay model:
 *   - Each spirit walks on the surface of a shared "sphere of dust" planet,
 *     anchored radially with a small offset (third-person camera trails
 *     behind, oriented to local up).
 *   - WASD drives the local spirit: W/S walk forward/back along great
 *     circles, A/D turn left/right around the local vertical.
 *   - Click or Space spawns a burst at the spirit's current position.
 *   - E (or click that hits the planet) requests an extract.
 *   - Every spirit, local or remote, continuously emits a slow visual dust
 *     trail toward the planet center (the "passive drop" from the pitch).
 *
 * Wire side-effects: only `onCursorMove`, `onBurst`, and `onExtract`
 * callbacks fire - the server still owns `totalDust`, essence, and per-tick
 * snapshots that drive `applySnapshot()`.
 */
import * as THREE from 'three';
import {
  type RoomSnapshot,
  type ServerEventBurst,
  type Vec3,
  planetRadiusFromTotalDust,
} from '@tutelary/shared';
import { debugLogger } from './debug.js';
import { inputLog } from './inputLog.js';

interface SpiritMarker {
  group: THREE.Group;
  core: THREE.Mesh;
  /** Latest authoritative world position from snapshots. */
  readonly target: THREE.Vector3;
  /** Rendered position; exponential lerp toward `target` each frame (remotes only). */
  readonly visual: THREE.Vector3;
}

const MAX_DUST_PARTICLES = 6144;
/** Radial offset above the planet surface so spirits read as floating, not glued. */
const SPIRIT_HEIGHT = 1.45;
const MOVE_SPEED_RAD_PER_SEC = 1.1;
const TURN_SPEED_RAD_PER_SEC = 1.6;
const CAMERA_DISTANCE = 5;
const CAMERA_HEIGHT = 1.7;
const CAMERA_LOOK_HEIGHT = 0.4;
const CAMERA_LERP = 0.12;
const PASSIVE_DUST_PER_SPIRIT_PER_SEC = 6;
const DUST_COLOR = 0xffd9a3;
/** Higher = remote spirits (incl. bots) snap faster to network targets (~120ms time constant at 14). */
const REMOTE_SPIRIT_SMOOTHING_LAMBDA = 14;

const TMP_VEC3_A = new THREE.Vector3();
const TMP_VEC3_B = new THREE.Vector3();
const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);

export interface SceneCallbacks {
  onCursorMove: (target: Vec3) => void;
  onBurst: (target: Vec3, intensity: number) => void;
  onExtract: (surfacePoint: Vec3) => void;
}

export class TutelaryScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock: THREE.Clock;

  private readonly planet: THREE.Mesh;
  private readonly atmosphere: THREE.Mesh;
  private readonly starfield: THREE.Points;

  private readonly spirits = new Map<string, SpiritMarker>();
  private readonly localSpirit: THREE.Group;

  // Surface-frame state for the local spirit.
  private spiritPos = new THREE.Vector3(0, 1, 0); // unit vector on sphere
  private spiritFacing = new THREE.Vector3(0, 0, -1); // tangent forward
  private readonly worldPos = new THREE.Vector3();

  private readonly dustGeometry: THREE.BufferGeometry;
  private readonly dustMaterial: THREE.PointsMaterial;
  private readonly dustPositions: Float32Array;
  private readonly dustVelocities: Float32Array;
  private readonly dustLife: Float32Array;
  private readonly dust: THREE.Points;
  private dustHead = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly keys = new Set<string>();

  private currentRadius = planetRadiusFromTotalDust(0);
  private playerId: string | null = null;
  private readonly callbacks: SceneCallbacks;
  private rafHandle = 0;
  private cursorAccumulator = 0;
  private readonly cursorSendInterval = 1 / 15;
  private passiveDustAccumulator = 0;
  private readonly preferReducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x02030a, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02030a, 0.004);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 4, 8);
    this.camera.lookAt(0, 0, 0);

    this.clock = new THREE.Clock();

    this.scene.add(new THREE.AmbientLight(0x6878a0, 0.35));
    const sun = new THREE.DirectionalLight(0xfff2c0, 1.2);
    sun.position.set(8, 12, 6);
    this.scene.add(sun);
    const rim = new THREE.PointLight(0xffb070, 1.0, 80, 1.6);
    rim.position.set(-12, -4, 8);
    this.scene.add(rim);

    this.planet = TutelaryScene.makePlanet(this.currentRadius);
    this.scene.add(this.planet);

    this.atmosphere = TutelaryScene.makeAtmosphere(this.currentRadius);
    this.scene.add(this.atmosphere);

    this.starfield = TutelaryScene.makeStarfield();
    this.scene.add(this.starfield);

    this.localSpirit = TutelaryScene.makeSpiritMarker(0xfff2b0, 0.6);
    this.scene.add(this.localSpirit);

    this.dustGeometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(MAX_DUST_PARTICLES * 3);
    this.dustVelocities = new Float32Array(MAX_DUST_PARTICLES * 3);
    this.dustLife = new Float32Array(MAX_DUST_PARTICLES);
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustMaterial = new THREE.PointsMaterial({
      size: 0.24,
      sizeAttenuation: true,
      color: DUST_COLOR,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
    // Positions are rewritten every frame; default bounds stay near origin and
    // Three.js would frustum-cull the whole system while particles live on the planet.
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    this.bindInput();
    window.addEventListener('resize', this.handleResize);
  }

  private static makePlanet(radius: number): THREE.Mesh {
    // "Sphere of dust": same warm sandy color as the dust particles, with
    // flat shading + roughness so the icosphere reads as packed grain.
    const geom = new THREE.IcosahedronGeometry(1, 4);
    const mat = new THREE.MeshStandardMaterial({
      color: DUST_COLOR,
      emissive: 0x4a2e10,
      emissiveIntensity: 0.18,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.setScalar(radius);
    mesh.name = 'planet';
    return mesh;
  }

  private static makeAtmosphere(radius: number): THREE.Mesh {
    const geom = new THREE.SphereGeometry(1, 48, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc888,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.setScalar(radius * 1.35);
    return mesh;
  }

  private static makeStarfield(): THREE.Points {
    const COUNT = 1400;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 600 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb8c8ff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    return new THREE.Points(geom, mat);
  }

  private static makeSpiritMarker(color: number, scale = 1): THREE.Group {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.45 * scale, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.95 * scale, 16, 16),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(core);
    group.add(halo);
    return group;
  }

  private handlePointerDown = (): void => {
    this.canvas.focus();
  };

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('click', this.handleClick);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private handleClick = (): void => {
    const planetHit = this.raycastPlanet();
    if (planetHit) {
      inputLog('scene.pointer.click', { action: 'extract', hit: planetHit.toArray() });
      this.callbacks.onExtract({ x: planetHit.x, y: planetHit.y, z: planetHit.z });
      this.spawnDustBurst(planetHit, 0.7);
      debugLogger.debug('input.extract.click', { surface: planetHit.toArray() });
      return;
    }
    inputLog('scene.pointer.click', { action: 'burst' });
    this.emitBurstAtSpirit();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    this.keys.add(code);
    if (code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      inputLog('scene.keydown', { key: 'Space', action: 'burst' });
      this.emitBurstAtSpirit();
    } else if (code === 'KeyE') {
      event.preventDefault();
      if (event.repeat) return;
      inputLog('scene.keydown', { key: 'E', action: 'extract' });
      this.emitExtractAtFeet();
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private handleBlur = (): void => {
    this.keys.clear();
  };

  private emitBurstAtSpirit(): void {
    const pos = { x: this.worldPos.x, y: this.worldPos.y, z: this.worldPos.z };
    this.callbacks.onBurst(pos, 1);
    this.spawnDustBurst(this.worldPos, 1);
    inputLog('scene.vfx.burst_local', { pos });
    debugLogger.debug('input.burst', { pos });
  }

  private emitExtractAtFeet(): void {
    const surface = this.spiritPos.clone().multiplyScalar(this.currentRadius);
    this.callbacks.onExtract({ x: surface.x, y: surface.y, z: surface.z });
    this.spawnDustBurst(surface, 0.7);
    inputLog('scene.vfx.extract_local', { surface: surface.toArray() });
    debugLogger.debug('input.extract.key', { surface: surface.toArray() });
  }

  private raycastPlanet(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.planet, false);
    const first = hits[0];
    return first ? first.point.clone() : null;
  }

  private spawnDustBurst(at: THREE.Vector3, intensity: number): void {
    const count = Math.floor(32 + 56 * intensity);
    for (let i = 0; i < count; i++) {
      const idx = this.dustHead;
      this.dustHead = (this.dustHead + 1) % MAX_DUST_PARTICLES;
      this.dustPositions[idx * 3 + 0] = at.x;
      this.dustPositions[idx * 3 + 1] = at.y;
      this.dustPositions[idx * 3 + 2] = at.z;
      const dirToPlanet = TMP_VEC3_A.set(-at.x, -at.y, -at.z).normalize();
      const jitter = TMP_VEC3_B.set(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
      );
      const v = dirToPlanet.multiplyScalar(2 + Math.random() * 2).add(jitter);
      this.dustVelocities[idx * 3 + 0] = v.x;
      this.dustVelocities[idx * 3 + 1] = v.y;
      this.dustVelocities[idx * 3 + 2] = v.z;
      this.dustLife[idx] = 1.5 + Math.random() * 1.0;
    }
  }

  /**
   * Drop a single passive dust particle "below" the spirit, drifting toward
   * the planet center. Used for the continuous falling trail that every
   * spirit emits while idle.
   */
  private spawnPassiveDustBelow(at: THREE.Vector3): void {
    const idx = this.dustHead;
    this.dustHead = (this.dustHead + 1) % MAX_DUST_PARTICLES;
    const inward = TMP_VEC3_A.copy(at).normalize().multiplyScalar(-1);
    const jitterScale = 0.18;
    this.dustPositions[idx * 3 + 0] =
      at.x + inward.x * 0.05 + (Math.random() - 0.5) * jitterScale;
    this.dustPositions[idx * 3 + 1] =
      at.y + inward.y * 0.05 + (Math.random() - 0.5) * jitterScale;
    this.dustPositions[idx * 3 + 2] =
      at.z + inward.z * 0.05 + (Math.random() - 0.5) * jitterScale;
    const speed = 0.6 + Math.random() * 0.7;
    this.dustVelocities[idx * 3 + 0] = inward.x * speed;
    this.dustVelocities[idx * 3 + 1] = inward.y * speed;
    this.dustVelocities[idx * 3 + 2] = inward.z * speed;
    this.dustLife[idx] = 1.0 + Math.random() * 0.6;
  }

  applyServerBurst(evt: ServerEventBurst): void {
    if (evt.playerId === this.playerId) return;
    const v = TMP_VEC3_A.set(evt.origin.x, evt.origin.y, evt.origin.z).clone();
    this.spawnDustBurst(v, evt.intensity);
  }

  applySnapshot(snap: RoomSnapshot): void {
    this.currentRadius = THREE.MathUtils.lerp(this.currentRadius, snap.planetRadius, 0.3);
    this.planet.scale.setScalar(this.currentRadius);
    this.atmosphere.scale.setScalar(this.currentRadius * 1.35);

    const seen = new Set<string>();
    const surfaceR = this.currentRadius + SPIRIT_HEIGHT;
    for (const player of snap.players) {
      seen.add(player.id);
      let marker = this.spirits.get(player.id);
      if (!marker) {
        const isLocal = player.id === this.playerId;
        const color = isLocal ? 0xfff2b0 : tierColor(player.tier, player.isBot);
        const group = isLocal ? this.localSpirit : TutelaryScene.makeSpiritMarker(color, 0.5);
        const core = group.children[0] as THREE.Mesh;
        marker = {
          group,
          core,
          target: new THREE.Vector3(),
          visual: new THREE.Vector3(),
        };
        if (!isLocal) this.scene.add(group);
        this.spirits.set(player.id, marker);
      }
      if (player.id === this.playerId) {
        // Local sim is authoritative for our own marker - skip server pos.
        continue;
      }
      const dir = TMP_VEC3_A.set(player.position.x, player.position.y, player.position.z);
      if (dir.lengthSq() < 1e-6) {
        dir.set(0, 1, 0);
      } else {
        dir.normalize();
      }
      marker.target.copy(dir).multiplyScalar(surfaceR);
      // First snapshot: snap visual to target so new joiners don't slide in from origin.
      if (marker.visual.lengthSq() < 1e-12) {
        marker.visual.copy(marker.target);
        marker.group.position.copy(marker.visual);
      }
    }

    for (const [id, marker] of this.spirits) {
      if (!seen.has(id)) {
        if (id !== this.playerId) this.scene.remove(marker.group);
        this.spirits.delete(id);
      }
    }
  }

  setLocalPlayerId(id: string): void {
    this.playerId = id;
  }

  /**
   * Adopt a server-provided world position into the local surface-walk sim.
   * Called once on resume so the player doesn't snap back to the north pole
   * after a refresh. We project to a unit direction and pick a stable facing.
   */
  setLocalSpiritFromWorld(world: Vec3): void {
    const v = TMP_VEC3_A.set(world.x, world.y, world.z);
    if (v.lengthSq() < 1e-6) return;
    this.spiritPos.copy(v).normalize();
    // Re-derive facing tangent from current facing projected to new tangent plane.
    const up = TMP_VEC3_B.copy(this.spiritPos);
    this.spiritFacing.sub(up.clone().multiplyScalar(this.spiritFacing.dot(up)));
    if (this.spiritFacing.lengthSq() < 1e-6) {
      const ref = Math.abs(up.dot(WORLD_X)) < 0.9 ? WORLD_X : WORLD_Y;
      this.spiritFacing.crossVectors(ref, up).normalize();
    } else {
      this.spiritFacing.normalize();
    }
    const surfaceR = this.currentRadius + SPIRIT_HEIGHT;
    this.worldPos.copy(this.spiritPos).multiplyScalar(surfaceR);
    this.localSpirit.position.copy(this.worldPos);
  }

  start(): void {
    if (this.rafHandle) return;
    const loop = () => {
      this.rafHandle = requestAnimationFrame(loop);
      this.update(this.clock.getDelta());
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  private update(dt: number): void {
    // Prevent tab-restore frame jumps that would tunnel the spirit through
    // the planet or pin the camera at the world origin.
    const stepDt = Math.min(dt, 0.1);
    this.updateSurfaceMotion(stepDt);
    this.smoothRemoteSpirits(stepDt);
    this.updateCamera();
    this.maybeSendCursor(stepDt);
    this.spawnPassiveDust(stepDt);
    this.integrateDust(stepDt);

    this.planet.rotation.y += stepDt * 0.02;
    this.atmosphere.rotation.y -= stepDt * 0.01;
    this.starfield.rotation.y += stepDt * 0.003;

    if (!this.preferReducedMotion) {
      const wobble = 0.1 * Math.sin(this.clock.elapsedTime * 6);
      this.localSpirit.scale.setScalar(1 + wobble);
    }
  }

  /** Smooth other players between ~12 Hz snapshots so bots don't stair-step. */
  private smoothRemoteSpirits(dt: number): void {
    if (this.preferReducedMotion) {
      for (const [id, m] of this.spirits) {
        if (id === this.playerId) continue;
        m.visual.copy(m.target);
        m.group.position.copy(m.visual);
      }
      return;
    }
    const t = 1 - Math.exp(-REMOTE_SPIRIT_SMOOTHING_LAMBDA * dt);
    for (const [id, m] of this.spirits) {
      if (id === this.playerId) continue;
      m.visual.lerp(m.target, t);
      m.group.position.copy(m.visual);
    }
  }

  private updateSurfaceMotion(dt: number): void {
    const up = TMP_VEC3_A.copy(this.spiritPos).normalize();

    // Re-orthogonalize facing onto the tangent plane. If we've drifted
    // toward parallel with up, pick a stable fallback so the basis never
    // collapses.
    this.spiritFacing.sub(up.clone().multiplyScalar(this.spiritFacing.dot(up)));
    if (this.spiritFacing.lengthSq() < 1e-6) {
      const ref = Math.abs(up.dot(WORLD_X)) < 0.9 ? WORLD_X : WORLD_Y;
      this.spiritFacing.crossVectors(ref, up).normalize();
    } else {
      this.spiritFacing.normalize();
    }

    const turnLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const turnRight = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    if (turnLeft) this.spiritFacing.applyAxisAngle(up, TURN_SPEED_RAD_PER_SEC * dt);
    if (turnRight) this.spiritFacing.applyAxisAngle(up, -TURN_SPEED_RAD_PER_SEC * dt);

    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const back = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    let move = 0;
    if (forward) move += 1;
    if (back) move -= 1;
    if (move !== 0) {
      const moveAxis = TMP_VEC3_B.crossVectors(up, this.spiritFacing).normalize();
      const angle = MOVE_SPEED_RAD_PER_SEC * dt * move;
      // Walking forward rotates the position around (up x facing) by `angle`.
      this.spiritPos.applyAxisAngle(moveAxis, angle);
      this.spiritFacing.applyAxisAngle(moveAxis, angle);
      this.spiritPos.normalize();
    }

    const surfaceR = this.currentRadius + SPIRIT_HEIGHT;
    this.worldPos.copy(this.spiritPos).multiplyScalar(surfaceR);
    this.localSpirit.position.copy(this.worldPos);
  }

  private updateCamera(): void {
    const up = TMP_VEC3_A.copy(this.spiritPos).normalize();
    const back = TMP_VEC3_B.copy(this.spiritFacing).multiplyScalar(-CAMERA_DISTANCE);
    const camTarget = this.worldPos.clone().add(back).add(up.clone().multiplyScalar(CAMERA_HEIGHT));
    this.camera.position.lerp(camTarget, CAMERA_LERP);
    this.camera.up.copy(up);
    const lookAt = this.worldPos.clone().add(up.clone().multiplyScalar(CAMERA_LOOK_HEIGHT));
    this.camera.lookAt(lookAt);
  }

  private maybeSendCursor(dt: number): void {
    this.cursorAccumulator += dt;
    if (this.cursorAccumulator >= this.cursorSendInterval) {
      this.cursorAccumulator = 0;
      this.callbacks.onCursorMove({
        x: this.worldPos.x,
        y: this.worldPos.y,
        z: this.worldPos.z,
      });
    }
  }

  /**
   * Spawn passive dust below every spirit (local + remote) at a steady rate.
   * Uses a fractional accumulator so low-FPS frames still emit predictably.
   */
  private spawnPassiveDust(dt: number): void {
    const spiritsCount = this.spirits.size + (this.spirits.has(this.playerId ?? '') ? 0 : 1);
    if (spiritsCount === 0) return;
    this.passiveDustAccumulator += dt * spiritsCount * PASSIVE_DUST_PER_SPIRIT_PER_SEC;
    while (this.passiveDustAccumulator >= 1) {
      this.passiveDustAccumulator -= 1;
      const target = this.pickPassiveDustSpawnPoint();
      if (target) this.spawnPassiveDustBelow(target);
    }
  }

  private pickPassiveDustSpawnPoint(): THREE.Vector3 | null {
    // Build a flat list of every spirit's current world position, including
    // the local spirit (which doesn't necessarily have a snapshot entry yet).
    const positions: THREE.Vector3[] = [this.worldPos.clone()];
    for (const [id, marker] of this.spirits) {
      if (id === this.playerId) continue;
      positions.push(marker.group.position.clone());
    }
    if (positions.length === 0) return null;
    const idx = Math.floor(Math.random() * positions.length);
    return positions[idx] ?? null;
  }

  private integrateDust(dt: number): void {
    // Hot loop: dust particle integration. Float32Array reads are guaranteed
    // numbers within bounds, but noUncheckedIndexedAccess flags them - the
    // local casts below keep this efficient without scattering `!`s.
    const positions = this.dustPositions;
    const velocities = this.dustVelocities;
    const lives = this.dustLife;
    for (let i = 0; i < MAX_DUST_PARTICLES; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      const life = lives[i] as number;
      if (life <= 0) continue;
      const nextLife = life - dt;
      lives[i] = nextLife;
      if (nextLife <= 0) {
        positions[ix] = 0;
        positions[iy] = 0;
        positions[iz] = 0;
        continue;
      }
      const px = positions[ix] as number;
      const py = positions[iy] as number;
      const pz = positions[iz] as number;
      const r = Math.hypot(px, py, pz) + 0.0001;
      const pull = 6 / (r * r);
      const vx = (velocities[ix] as number) + (-px / r) * pull * dt;
      const vy = (velocities[iy] as number) + (-py / r) * pull * dt;
      const vz = (velocities[iz] as number) + (-pz / r) * pull * dt;
      velocities[ix] = vx;
      velocities[iy] = vy;
      velocities[iz] = vz;
      positions[ix] = px + vx * dt;
      positions[iy] = py + vy * dt;
      positions[iz] = pz + vz * dt;
    }
    const positionAttr = this.dustGeometry.attributes['position'];
    if (positionAttr) positionAttr.needsUpdate = true;
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('click', this.handleClick);
    this.renderer.dispose();
  }
}

function tierColor(tier: string, isBot: boolean): number {
  if (isBot) return 0x8aa0c8;
  switch (tier) {
    case 'water':
      return 0x70d0ff;
    case 'fire':
      return 0xff8a4c;
    case 'air':
      return 0xeaffff;
    case 'verdant':
      return 0x9bff9b;
    default:
      return 0xffd9a3;
  }
}
