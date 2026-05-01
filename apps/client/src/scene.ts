/**
 * Minimal Three.js view: grid, ambient light, one sphere per player.
 * Local movement is client-side prediction; the server clamps and rebroadcasts.
 */
import * as THREE from 'three';
import { type RoomSnapshot, type Vec3 } from '@realtime-room/shared';

export interface SceneCallbacks {
  onMoveIntent: (position: Vec3) => void;
}

const MOVE_SPEED = 22;
const TMP = new THREE.Vector3();

export class RoomScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock: THREE.Clock;
  private readonly grid: THREE.GridHelper;
  private readonly markers = new Map<string, THREE.Mesh>();
  private readonly localGroup = new THREE.Group();
  private readonly keys = new Set<string>();
  private readonly callbacks: SceneCallbacks;
  private playerId: string | null = null;
  private localPos = new THREE.Vector3(0, 2, 8);
  private moveAccum = 0;
  private readonly moveInterval = 1 / 20;
  private rafHandle = 0;

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
    this.renderer.setClearColor(0x0a0c12, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0c12, 0.002);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 12, 28);
    this.camera.lookAt(0, 0, 0);

    this.clock = new THREE.Clock();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(8, 20, 10);
    this.scene.add(dir);

    this.grid = new THREE.GridHelper(200, 40, 0x334466, 0x1a2233);
    this.scene.add(this.grid);

    const coreGeom = new THREE.SphereGeometry(0.55, 20, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x5ee0ff,
      emissive: 0x113344,
      metalness: 0.2,
      roughness: 0.45,
    });
    const localMesh = new THREE.Mesh(coreGeom, coreMat);
    this.localGroup.add(localMesh);
    this.localGroup.position.copy(this.localPos);
    this.scene.add(this.localGroup);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  setLocalPlayerId(id: string): void {
    this.playerId = id;
  }

  /** First snapshot after join: snap camera to server position. */
  syncLocalFromServer(pos: Vec3): void {
    this.localPos.set(pos.x, pos.y, pos.z);
    this.localGroup.position.copy(this.localPos);
  }

  applySnapshot(snap: RoomSnapshot): void {
    const seen = new Set<string>();
    for (const p of snap.players) {
      seen.add(p.id);
      if (p.id === this.playerId) continue;
      let mesh = this.markers.get(p.id);
      if (!mesh) {
        const g = new THREE.SphereGeometry(0.45, 16, 12);
        const m = new THREE.MeshStandardMaterial({
          color: 0xffb070,
          emissive: 0x331100,
          metalness: 0.15,
          roughness: 0.5,
        });
        mesh = new THREE.Mesh(g, m);
        this.scene.add(mesh);
        this.markers.set(p.id, mesh);
      }
      mesh.position.set(p.position.x, p.position.y, p.position.z);
    }
    for (const [id, mesh] of this.markers) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.markers.delete(id);
      }
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
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
  };

  private loop = () => {
    this.rafHandle = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    const ax = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const az = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0);
    const ay = (this.keys.has('Space') ? 1 : 0) - (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1 : 0);
    if (ax !== 0 || ay !== 0 || az !== 0) {
      const len = Math.hypot(ax, ay, az) || 1;
      this.localPos.x += (ax / len) * MOVE_SPEED * dt;
      this.localPos.y += (ay / len) * MOVE_SPEED * dt;
      this.localPos.z += (az / len) * MOVE_SPEED * dt;
      this.localGroup.position.copy(this.localPos);
    }

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
    this.camera.position.lerp(TMP.add(new THREE.Vector3(0, 6, 14)), 0.08);
    this.camera.lookAt(this.localPos);

    this.renderer.render(this.scene, this.camera);
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
    for (const mesh of this.markers.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.markers.clear();
    this.scene.remove(this.localGroup);
    this.localGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.localGroup.clear();
    this.grid.geometry.dispose();
    const gm = this.grid.material;
    if (Array.isArray(gm)) for (const m of gm) m.dispose();
    else (gm as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
