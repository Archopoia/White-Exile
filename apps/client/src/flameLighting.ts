/**
 * Flame lighting + flame mesh system.
 *
 * Real lights with shadows:
 *   - HemisphereLight + low-intensity DirectionalLight (the dead sun) provide
 *     the foggy "moonlight" baseline. The sun casts shadows on med/high so
 *     ruins, players, and followers throw long ambient shadows on the dunes.
 *   - Each player owns a "flame" — a custom additive shader on crossed quads
 *     plus a PointLight at the player position. The PointLight casts shadows
 *     (cube map) on med/high so the player and nearby objects throw radial
 *     shadows in the torch light.
 *   - All flame lights are pre-pooled. Tier change toggles `castShadow` and
 *     resizes shadow maps in place — no shader recompiles, no allocations
 *     during play.
 *
 * Tier is set explicitly (no URL/localStorage reads here — that lives in the
 * ESC menu in `options.ts`). Use `setTier(tier)` to apply live.
 */
import * as THREE from 'three';

import type { Race } from '@realtime-room/shared';

export type FxTier = 'low' | 'med' | 'high';

export interface FlameTierConfig {
  readonly sunShadow: boolean;
  readonly sunShadowMapSize: number;
  readonly heroShadow: boolean;
  readonly heroShadowMapSize: number;
  readonly poolShadow: boolean;
  readonly poolShadowMapSize: number;
  readonly poolShadowCount: number;
  readonly hemisphereIntensity: number;
  readonly sunIntensity: number;
}

const TIER_CONFIG: Readonly<Record<FxTier, FlameTierConfig>> = Object.freeze({
  low: {
    sunShadow: false,
    sunShadowMapSize: 0,
    heroShadow: false,
    heroShadowMapSize: 0,
    poolShadow: false,
    poolShadowMapSize: 0,
    poolShadowCount: 0,
    // Hemisphere is the cheap fill; the sun is the directional that creates
    // slope shading on the dunes. We keep the sun clearly stronger than the
    // hemisphere so dune crests and lee sides actually read as different.
    hemisphereIntensity: 0.32,
    sunIntensity: 0.85,
  },
  med: {
    sunShadow: true,
    sunShadowMapSize: 1024,
    heroShadow: true,
    heroShadowMapSize: 256,
    poolShadow: false,
    poolShadowMapSize: 0,
    poolShadowCount: 0,
    hemisphereIntensity: 0.28,
    sunIntensity: 0.95,
  },
  high: {
    sunShadow: true,
    sunShadowMapSize: 2048,
    heroShadow: true,
    heroShadowMapSize: 512,
    poolShadow: true,
    poolShadowMapSize: 256,
    poolShadowCount: 3,
    hemisphereIntensity: 0.25,
    sunIntensity: 1.05,
  },
});

const POOL_SIZE = 8;
const SUN_SHADOW_RADIUS = 80;
const FLAME_HEIGHT = 1.6;

const RACE_FLAME_COLOR: Readonly<Record<Race, number>> = Object.freeze({
  emberfolk: 0xff8a3d,
  ashborn: 0x6cf0c2,
  'lumen-kin': 0xb3a1ff,
});

export interface OtherFlame {
  readonly id: string;
  readonly position: THREE.Vector3Like;
  readonly color: number;
  readonly lightRadius: number;
}

export interface FlameUniforms {
  readonly uTime: THREE.IUniform<number>;
  readonly uSeed: THREE.IUniform<number>;
  readonly uHotColor: THREE.IUniform<THREE.Color>;
  readonly uCoolColor: THREE.IUniform<THREE.Color>;
  readonly uHeight: THREE.IUniform<number>;
  readonly uIntensity: THREE.IUniform<number>;
}

export interface FlameMesh {
  readonly group: THREE.Group;
  readonly uniforms: FlameUniforms;
  setColor(color: number): void;
  dispose(): void;
}

const FLAME_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  uniform float uTime;
  uniform float uSeed;

  void main() {
    vUv = uv;
    vLocal = position;
    vec3 p = position;
    float t = uTime * 1.6 + uSeed;
    float wob = sin(t * 2.1 + p.y * 4.0) * 0.04 + cos(t * 1.4 + p.y * 5.5) * 0.03;
    p.x += wob * smoothstep(0.0, 1.0, p.y);
    p.z += wob * 0.6 * smoothstep(0.0, 1.0, p.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vLocal;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uHotColor;
  uniform vec3 uCoolColor;
  uniform float uHeight;
  uniform float uIntensity;

  float fHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float fNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = fHash(i);
    float b = fHash(i + vec2(1.0, 0.0));
    float c = fHash(i + vec2(0.0, 1.0));
    float d = fHash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fFbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      v += a * fNoise(p);
      p *= 2.05;
      a *= 0.55;
    }
    return v;
  }

  void main() {
    float y = clamp(vUv.y, 0.0, 1.0);
    vec2 uv = vec2(vUv.x, y);
    float t = uTime * 1.4 + uSeed;
    vec2 q = vec2(uv.x * 2.6, uv.y * 2.0 - t * 1.6);
    float n = fFbm(q + fFbm(q * 1.3) * 0.7);

    float bodyMask = smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.78, 1.0, y));
    float coreMask = smoothstep(0.0, 0.45, 1.0 - y) * (1.0 - smoothstep(0.0, 0.04, abs(uv.x - 0.5) * 2.0));
    float edgeFalloff = 1.0 - smoothstep(0.18, 0.5, abs(uv.x - 0.5));

    float alpha = bodyMask * edgeFalloff * smoothstep(0.32, 0.78, n);
    alpha += coreMask * 0.4;
    alpha *= uIntensity;

    vec3 col = mix(uCoolColor, uHotColor, smoothstep(0.35, 0.95, n) * (1.0 - y * 0.7));
    col += vec3(0.5, 0.35, 0.2) * coreMask;
    col *= mix(0.5, 1.6, n);

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

function createFlameMesh(color: number, height: number, seed: number): FlameMesh {
  const uniforms: FlameUniforms = {
    uTime: { value: 0 },
    uSeed: { value: seed },
    uHotColor: { value: new THREE.Color(0xfff1c2) },
    uCoolColor: { value: new THREE.Color(color) },
    uHeight: { value: height },
    uIntensity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [k: string]: THREE.IUniform },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });

  const w = height * 0.55;
  const planeGeom = new THREE.PlaneGeometry(w, height, 1, 1);
  planeGeom.translate(0, height * 0.5, 0);
  const a = new THREE.Mesh(planeGeom, mat);
  const b = new THREE.Mesh(planeGeom.clone(), mat);
  b.rotation.y = Math.PI * 0.5;

  const group = new THREE.Group();
  group.add(a);
  group.add(b);
  group.name = 'flame';

  return {
    group,
    uniforms,
    setColor(c: number): void {
      uniforms.uCoolColor.value.setHex(c);
    },
    dispose(): void {
      planeGeom.dispose();
      (b.geometry as THREE.BufferGeometry).dispose();
      mat.dispose();
    },
  };
}

interface PooledFlameLight {
  readonly light: THREE.PointLight;
  readonly mesh: FlameMesh;
  ownerId: string | null;
  baseIntensity: number;
}

export interface FlameLighting {
  setLocalAttachment(attachTo: THREE.Object3D, race: Race): void;
  setRace(race: Race): void;
  setLocalRadius(radius: number): void;
  setOtherFlames(list: ReadonlyArray<OtherFlame>): void;
  setZoneIntensity(scale: number): void;
  setSunDirection(dir: THREE.Vector3): void;
  setTier(tier: FxTier): void;
  update(dt: number, time: number): void;
  readonly tier: FxTier;
  dispose(): void;
}

function flickerNoise(time: number, seed: number): number {
  const a = Math.sin(time * 7.3 + seed) * 0.5 + 0.5;
  const b = Math.sin(time * 11.1 + seed * 1.7 + 1.3) * 0.5 + 0.5;
  const c = Math.sin(time * 23.7 + seed * 0.41) * 0.5 + 0.5;
  return 0.78 + a * 0.18 + b * 0.1 + c * 0.06;
}

export function createFlameLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  initialTier: FxTier,
): FlameLighting {
  let currentTier: FxTier = initialTier;
  let cfg = TIER_CONFIG[currentTier];

  // Shadow map type doesn't change per tier — only sizes & enable flags do.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  // Hemisphere fill: cool sky (slate blue), warmer ash ground.
  const hemi = new THREE.HemisphereLight(0x4a5878, 0x322628, cfg.hemisphereIntensity);
  scene.add(hemi);

  // Dead sun: warm desaturated red-orange — a dying star bleeding through
  // the fog. Wide ortho shadow camera tracks the player so we get long
  // shadows in the area visible through the fog without paying for a global
  // shadow.
  const sun = new THREE.DirectionalLight(0xc78a72, cfg.sunIntensity);
  sun.position.set(60, 120, -90);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  // Hero flame: PointLight at player center. Radial shadows = the player
  // throws shadows on the terrain in their own torch light.
  const heroFlame = createFlameMesh(RACE_FLAME_COLOR.emberfolk, FLAME_HEIGHT, 0);
  const heroLight = new THREE.PointLight(RACE_FLAME_COLOR.emberfolk, 3.6, 32, 1.7);
  heroLight.position.set(0, 1.1, 0);

  // Pool of other-player flames (visual + light). Pre-allocated so adding
  // and removing players never recompiles a forward shader.
  const flamePool: PooledFlameLight[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const m = createFlameMesh(0xffffff, FLAME_HEIGHT, i * 11.7 + 3.1);
    m.group.visible = false;
    scene.add(m.group);
    const pl = new THREE.PointLight(0xffffff, 0, 24, 1.7);
    pl.visible = false;
    scene.add(pl);
    flamePool.push({ light: pl, mesh: m, ownerId: null, baseIntensity: 1.6 });
  }

  let attachTarget: THREE.Object3D | null = null;
  let currentRace: Race = 'emberfolk';
  let localRadius = 14;
  let zoneScale = 1;
  let heroBaseIntensity = 3.6;
  // Sun travels from this direction toward the player. (-y because the sun
  // is up and shines down.) Stored separately so the shadow-camera tracking
  // in update() doesn't depend on the sun's mutating world position.
  const sunDir = new THREE.Vector3(0.4, -0.55, 0.7).normalize();

  function applyShadowSettings(): void {
    // Sun.
    sun.castShadow = cfg.sunShadow;
    if (cfg.sunShadow && cfg.sunShadowMapSize > 0) {
      sun.shadow.mapSize.set(cfg.sunShadowMapSize, cfg.sunShadowMapSize);
      sun.shadow.camera.left = -SUN_SHADOW_RADIUS;
      sun.shadow.camera.right = SUN_SHADOW_RADIUS;
      sun.shadow.camera.top = SUN_SHADOW_RADIUS;
      sun.shadow.camera.bottom = -SUN_SHADOW_RADIUS;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 400;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.05;
      sun.shadow.radius = 4;
      sun.shadow.camera.updateProjectionMatrix();
      // Force the shadow map to re-allocate at the new size.
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }

    // Hero point light.
    heroLight.castShadow = cfg.heroShadow;
    if (cfg.heroShadow && cfg.heroShadowMapSize > 0) {
      heroLight.shadow.mapSize.set(cfg.heroShadowMapSize, cfg.heroShadowMapSize);
      heroLight.shadow.bias = -0.005;
      heroLight.shadow.normalBias = 0.06;
      heroLight.shadow.radius = 3;
      heroLight.shadow.camera.near = 0.2;
      heroLight.shadow.camera.far = Math.max(20, localRadius * 2);
      heroLight.shadow.camera.updateProjectionMatrix();
      heroLight.shadow.map?.dispose();
      heroLight.shadow.map = null;
    }

    // Pool — first N cast, rest stay non-shadow.
    for (let i = 0; i < flamePool.length; i++) {
      const slot = flamePool[i];
      if (!slot) continue;
      const enable = cfg.poolShadow && i < cfg.poolShadowCount;
      slot.light.castShadow = enable;
      if (enable && cfg.poolShadowMapSize > 0) {
        slot.light.shadow.mapSize.set(cfg.poolShadowMapSize, cfg.poolShadowMapSize);
        slot.light.shadow.bias = -0.005;
        slot.light.shadow.normalBias = 0.06;
        slot.light.shadow.radius = 2;
        slot.light.shadow.camera.near = 0.2;
        slot.light.shadow.camera.far = slot.light.distance;
        slot.light.shadow.camera.updateProjectionMatrix();
        slot.light.shadow.map?.dispose();
        slot.light.shadow.map = null;
      }
    }
  }

  applyShadowSettings();

  function setLocalAttachment(target: THREE.Object3D, race: Race): void {
    if (attachTarget && attachTarget !== target) {
      attachTarget.remove(heroFlame.group);
      attachTarget.remove(heroLight);
    }
    attachTarget = target;
    target.add(heroFlame.group);
    heroFlame.group.position.set(0, 0.6, 0);
    target.add(heroLight);
    setRace(race);
  }

  function setRace(race: Race): void {
    currentRace = race;
    const c = RACE_FLAME_COLOR[race];
    heroFlame.setColor(c);
    heroLight.color.setHex(c);
  }

  function setLocalRadius(radius: number): void {
    localRadius = Math.max(4, radius);
    // PointLight `distance` is the hard cutoff for forward decay — making it
    // proportional to lightRadius means more fuel/followers literally lights
    // a wider patch of dune. Intensity scales mildly so a small flame still
    // reads as a flame and a big one feels powerful, without blowing out.
    heroLight.distance = Math.max(8, localRadius * 2.2);
    heroBaseIntensity = 2.6 + localRadius * 0.08;
    if (heroLight.castShadow) {
      heroLight.shadow.camera.far = heroLight.distance;
      heroLight.shadow.camera.updateProjectionMatrix();
    }
  }

  function setOtherFlames(list: ReadonlyArray<OtherFlame>): void {
    const limited = list.slice(0, flamePool.length);
    for (let i = 0; i < limited.length; i++) {
      const o = limited[i];
      if (!o) continue;
      const slot = flamePool[i];
      if (!slot) continue;
      slot.ownerId = o.id;
      slot.light.color.setHex(o.color);
      // Same scaling rule as the hero: wider radius = wider illuminated area.
      slot.light.distance = Math.max(8, o.lightRadius * 2.0);
      slot.light.position.set(o.position.x, o.position.y + 1.1, o.position.z);
      slot.light.visible = true;
      slot.mesh.setColor(o.color);
      slot.mesh.group.position.set(o.position.x, o.position.y + 0.55, o.position.z);
      slot.mesh.group.visible = true;
      slot.baseIntensity = 1.6 + o.lightRadius * 0.06;
      if (slot.light.castShadow) {
        slot.light.shadow.camera.far = slot.light.distance;
        slot.light.shadow.camera.updateProjectionMatrix();
      }
    }
    for (let i = limited.length; i < flamePool.length; i++) {
      const slot = flamePool[i];
      if (!slot) continue;
      slot.ownerId = null;
      slot.light.visible = false;
      slot.light.intensity = 0;
      slot.mesh.group.visible = false;
    }
  }

  function setZoneIntensity(scale: number): void {
    zoneScale = THREE.MathUtils.clamp(scale, 0.4, 1.4);
    hemi.intensity = cfg.hemisphereIntensity * zoneScale;
    sun.intensity = cfg.sunIntensity * zoneScale;
  }

  function setSunDirection(dir: THREE.Vector3): void {
    sunDir.copy(dir).normalize();
  }

  function setTier(tier: FxTier): void {
    if (tier === currentTier) return;
    currentTier = tier;
    cfg = TIER_CONFIG[tier];
    hemi.intensity = cfg.hemisphereIntensity * zoneScale;
    sun.intensity = cfg.sunIntensity * zoneScale;
    applyShadowSettings();
  }

  const tmpV = new THREE.Vector3();

  function update(dt: number, time: number): void {
    void dt;
    heroFlame.uniforms.uTime.value = time;
    const heroFlick = flickerNoise(time, 0);
    heroFlame.uniforms.uIntensity.value = heroFlick;
    heroLight.intensity = heroBaseIntensity * heroFlick;

    if (attachTarget) {
      attachTarget.getWorldPosition(tmpV);
      // Center the sun (and its ortho shadow camera) on the player. The sun
      // sits 200 units back along its stored direction so a 80-unit ortho box
      // covers the visible play area regardless of where the player walks.
      sun.position.set(
        tmpV.x - sunDir.x * 200,
        tmpV.y - sunDir.y * 200,
        tmpV.z - sunDir.z * 200,
      );
      sun.target.position.set(tmpV.x, tmpV.y, tmpV.z);
      sun.target.updateMatrixWorld();
    }

    for (let i = 0; i < flamePool.length; i++) {
      const slot = flamePool[i];
      if (!slot || !slot.light.visible) continue;
      const flick = flickerNoise(time, (i + 1) * 5.7);
      slot.light.intensity = slot.baseIntensity * flick;
      slot.mesh.uniforms.uTime.value = time;
      slot.mesh.uniforms.uIntensity.value = flick;
    }
    void currentRace;
  }

  function dispose(): void {
    scene.remove(hemi);
    scene.remove(sun);
    scene.remove(sun.target);
    if (attachTarget) {
      attachTarget.remove(heroFlame.group);
      attachTarget.remove(heroLight);
    }
    heroFlame.dispose();
    sun.shadow.map?.dispose();
    heroLight.shadow.map?.dispose();
    for (const slot of flamePool) {
      slot.light.shadow.map?.dispose();
      scene.remove(slot.light);
      scene.remove(slot.mesh.group);
      slot.mesh.dispose();
    }
  }

  return {
    setLocalAttachment,
    setRace,
    setLocalRadius,
    setOtherFlames,
    setZoneIntensity,
    setSunDirection,
    setTier,
    update,
    get tier(): FxTier {
      return currentTier;
    },
    dispose,
  };
}
