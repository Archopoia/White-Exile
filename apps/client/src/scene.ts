/**
 * Three.js scene for Tutelary.
 *
 * A real WebGL scene with:
 *   - A lit, emissive planet mesh whose radius scales from server snapshots.
 *   - A starfield + atmosphere shell for depth.
 *   - World-space dust particles spawned on local + remote bursts.
 *   - Per-player spirit markers driven by snapshot positions.
 *
 * Input:
 *   - Mouse hover -> projects to a sphere around the planet, sent as cursor.
 *   - Click in space -> burst at the projected target.
 *   - Click on the planet (raycast hit) -> extract.
 */
import * as THREE from 'three';
import {
  type RoomSnapshot,
  type ServerEventBurst,
  type Vec3,
  planetRadiusFromTotalDust,
} from '@tutelary/shared';
import { debugLogger } from './debug.js';

interface SpiritMarker {
  group: THREE.Group;
  core: THREE.Mesh;
}

const PLAY_SPHERE_RADIUS = 18;
const MAX_DUST_PARTICLES = 4096;

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

  private readonly dustGeometry: THREE.BufferGeometry;
  private readonly dustMaterial: THREE.PointsMaterial;
  private readonly dustPositions: Float32Array;
  private readonly dustVelocities: Float32Array;
  private readonly dustLife: Float32Array;
  private readonly dust: THREE.Points;
  private dustHead = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private hoverTarget = new THREE.Vector3(PLAY_SPHERE_RADIUS, 0, 0);

  private currentRadius = planetRadiusFromTotalDust(0);
  private playerId: string | null = null;
  private readonly callbacks: SceneCallbacks;
  private rafHandle = 0;
  private cursorAccumulator = 0;
  private readonly cursorSendInterval = 1 / 15;
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
    this.scene.fog = new THREE.FogExp2(0x02030a, 0.005);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 6, 28);
    this.camera.lookAt(0, 0, 0);

    this.clock = new THREE.Clock();

    this.scene.add(new THREE.AmbientLight(0x7080ff, 0.25));
    const sun = new THREE.DirectionalLight(0xfff2c0, 1.1);
    sun.position.set(8, 12, 6);
    this.scene.add(sun);
    const rim = new THREE.PointLight(0x6890ff, 1.5, 80, 1.6);
    rim.position.set(-12, -4, 8);
    this.scene.add(rim);

    this.planet = TutelaryScene.makePlanet(this.currentRadius);
    this.scene.add(this.planet);

    this.atmosphere = TutelaryScene.makeAtmosphere(this.currentRadius);
    this.scene.add(this.atmosphere);

    this.starfield = TutelaryScene.makeStarfield();
    this.scene.add(this.starfield);

    this.localSpirit = TutelaryScene.makeSpiritMarker(0xfff2b0, 1.2);
    this.scene.add(this.localSpirit);

    this.dustGeometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(MAX_DUST_PARTICLES * 3);
    this.dustVelocities = new Float32Array(MAX_DUST_PARTICLES * 3);
    this.dustLife = new Float32Array(MAX_DUST_PARTICLES);
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustMaterial = new THREE.PointsMaterial({
      size: 0.18,
      sizeAttenuation: true,
      color: 0xffd9a3,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.scene.add(this.dust);

    this.bindInput();
    window.addEventListener('resize', this.handleResize);
  }

  private static makePlanet(radius: number): THREE.Mesh {
    const geom = new THREE.IcosahedronGeometry(1, 4);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4868,
      emissive: 0x182040,
      emissiveIntensity: 0.45,
      roughness: 0.55,
      metalness: 0.05,
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
      color: 0x6c8cff,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.setScalar(radius * 1.2);
    return mesh;
  }

  private static makeStarfield(): THREE.Points {
    const COUNT = 1200;
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
      new THREE.SphereGeometry(0.9 * scale, 16, 16),
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

  private bindInput(): void {
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('click', this.handleClick);
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.updateHoverTarget();
    this.localSpirit.position.copy(this.hoverTarget);
  };

  private handleClick = (): void => {
    this.updateHoverTarget();
    const target: Vec3 = {
      x: this.hoverTarget.x,
      y: this.hoverTarget.y,
      z: this.hoverTarget.z,
    };
    const planetHit = this.raycastPlanet();
    if (planetHit) {
      this.callbacks.onExtract({ x: planetHit.x, y: planetHit.y, z: planetHit.z });
      this.spawnDustBurst(planetHit, 0.7);
      debugLogger.debug('input.extract', { surface: planetHit.toArray() });
    } else {
      this.callbacks.onBurst(target, 1);
      this.spawnDustBurst(this.hoverTarget, 1);
      debugLogger.debug('input.burst', { target });
    }
  };

  private updateHoverTarget(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Project onto a play sphere centered on the planet so spirits orbit
    // in a stable shell, regardless of mesh scale.
    const dir = this.raycaster.ray.direction.clone().normalize();
    const origin = this.raycaster.ray.origin.clone();
    const a = dir.dot(dir);
    const b = 2 * origin.dot(dir);
    const c = origin.dot(origin) - PLAY_SPHERE_RADIUS * PLAY_SPHERE_RADIUS;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return;
    const t = (-b + Math.sqrt(discriminant)) / (2 * a);
    this.hoverTarget.copy(origin).add(dir.multiplyScalar(t));
  }

  private raycastPlanet(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.planet, false);
    const first = hits[0];
    return first ? first.point.clone() : null;
  }

  private spawnDustBurst(at: THREE.Vector3, intensity: number): void {
    const count = Math.floor(20 + 40 * intensity);
    for (let i = 0; i < count; i++) {
      const idx = this.dustHead;
      this.dustHead = (this.dustHead + 1) % MAX_DUST_PARTICLES;
      this.dustPositions[idx * 3 + 0] = at.x;
      this.dustPositions[idx * 3 + 1] = at.y;
      this.dustPositions[idx * 3 + 2] = at.z;
      const dirToPlanet = new THREE.Vector3(-at.x, -at.y, -at.z).normalize();
      const jitter = new THREE.Vector3(
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

  applyServerBurst(evt: ServerEventBurst): void {
    if (evt.playerId === this.playerId) return;
    const v = new THREE.Vector3(evt.origin.x, evt.origin.y, evt.origin.z);
    this.spawnDustBurst(v, evt.intensity);
  }

  applySnapshot(snap: RoomSnapshot): void {
    this.currentRadius = THREE.MathUtils.lerp(this.currentRadius, snap.planetRadius, 0.3);
    this.planet.scale.setScalar(this.currentRadius);
    this.atmosphere.scale.setScalar(this.currentRadius * 1.18);

    const seen = new Set<string>();
    for (const player of snap.players) {
      seen.add(player.id);
      let marker = this.spirits.get(player.id);
      if (!marker) {
        const color = player.id === this.playerId ? 0xfff2b0 : tierColor(player.tier, player.isBot);
        const group = TutelaryScene.makeSpiritMarker(color, player.id === this.playerId ? 1.2 : 1);
        const core = group.children[0] as THREE.Mesh;
        marker = { group, core };
        if (player.id !== this.playerId) this.scene.add(group);
        this.spirits.set(player.id, marker);
      }
      if (player.id === this.playerId) {
        // local spirit position is driven by hover for responsiveness
        continue;
      }
      marker.group.position.set(player.position.x, player.position.y, player.position.z);
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
    const wobble = this.preferReducedMotion ? 0 : 0.1;
    this.planet.rotation.y += dt * 0.05;
    this.atmosphere.rotation.y -= dt * 0.02;
    this.starfield.rotation.y += dt * 0.005;

    this.cursorAccumulator += dt;
    if (this.cursorAccumulator >= this.cursorSendInterval) {
      this.cursorAccumulator = 0;
      this.callbacks.onCursorMove({
        x: this.hoverTarget.x,
        y: this.hoverTarget.y,
        z: this.hoverTarget.z,
      });
    }

    // Hot loop: dust particle integration. Float32Array reads are guaranteed
    // numbers within bounds, but noUncheckedIndexedAccess flags them — the
    // cast helpers below keep this efficient without scattering `!`s.
    const positions = this.dustPositions;
    const velocities = this.dustVelocities;
    const lives = this.dustLife;
    let alive = 0;
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
      alive++;
    }
    const positionAttr = this.dustGeometry.attributes['position'];
    if (positionAttr) positionAttr.needsUpdate = true;

    this.localSpirit.scale.setScalar(1 + wobble * Math.sin(this.clock.elapsedTime * 6));
    void alive;
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
