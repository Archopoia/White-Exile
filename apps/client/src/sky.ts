/**
 * Night sky dome with a smothered moon-gold sun disk.
 *
 * A large back-faced sphere rendered before everything else (renderOrder = -1)
 * with a custom shader. The sun reads as pale lunar gold — a faint disk
 * smeared by a horizon haze
 * band; height-based gradient gives the "thick foggy atmosphere with smothered
 * sun" look the pitch calls for. No real atmospheric scattering — it would
 * look wrong (too bright) and cost too much for what the scene needs.
 *
 * Tuning knobs are exposed as uniforms; `setZoneTone` shifts colors so deeper
 * zones read more oppressive without rebuilding the material.
 */
import * as THREE from 'three';

import type { Zone } from '@realtime-room/shared';

const SKY_RADIUS = 3000;

export interface DeadSkyUniforms {
  readonly uTime: THREE.IUniform<number>;
  readonly uSunDir: THREE.IUniform<THREE.Vector3>;
  readonly uSunColor: THREE.IUniform<THREE.Color>;
  readonly uZenith: THREE.IUniform<THREE.Color>;
  readonly uHorizon: THREE.IUniform<THREE.Color>;
  readonly uGround: THREE.IUniform<THREE.Color>;
  /** 0 = clear-ish, 1 = thick foggy haze blanketing the sun. */
  readonly uHaze: THREE.IUniform<number>;
}

export interface DeadSky {
  readonly mesh: THREE.Mesh;
  readonly uniforms: DeadSkyUniforms;
  setZoneTone(zone: Zone): void;
  /** Multiplies zone haze (0 = clear disk, ~1.5 = heavier veil). Clamped to keep `uHaze` in [0,1]. */
  setSkyHazeMultiplier(mul: number): void;
  /** Sun direction is FROM the sun TOWARD the world (a light direction). */
  setSunDirection(dir: THREE.Vector3): void;
  dispose(): void;
}

interface ZoneTone {
  readonly zenith: number;
  readonly horizon: number;
  readonly ground: number;
  readonly sun: number;
  readonly haze: number;
}

/** Sky-disk + tint: pale warm gold (lunar), not ember-red. */
const ZONE_TONES: Readonly<Record<Zone, ZoneTone>> = Object.freeze({
  safe: {
    zenith: 0x141a2c,
    horizon: 0x4a3744,
    ground: 0x231d28,
    sun: 0xf2e6c8,
    haze: 0.5,
  },
  grey: {
    zenith: 0x0d1120,
    horizon: 0x3a2a34,
    ground: 0x1c1720,
    sun: 0xd8caa8,
    haze: 0.65,
  },
  deep: {
    zenith: 0x070a14,
    horizon: 0x281c26,
    ground: 0x12101a,
    sun: 0xb0a080,
    haze: 0.8,
  },
  dead: {
    zenith: 0x03040c,
    horizon: 0x18101e,
    ground: 0x0a070d,
    sun: 0x7d7058,
    haze: 0.95,
  },
});

const VERT = /* glsl */ `
  varying vec3 vDir;

  void main() {
    // The sphere is centered on (and follows) the camera. World-space
    // direction from the camera to the vertex IS the view ray we want.
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;

  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform float uHaze;

  float skyHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = skyHash(i);
    float b = skyHash(i + vec2(1.0, 0.0));
    float c = skyHash(i + vec2(0.0, 1.0));
    float d = skyHash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float skyFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * skyNoise(p);
      p *= 1.9;
      a *= 0.55;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    // Bias horizon band visually (more haze sitting low).
    float horizonBand = smoothstep(-0.05, 0.18, h);
    float zenithBand = smoothstep(0.15, 0.9, h);

    vec3 col = mix(uHorizon, uZenith, zenithBand);
    col = mix(uGround, col, horizonBand);

    // Drifting low-frequency cloud band along horizon (only in upper hemisphere).
    vec2 cloudUV = vec2(atan(d.x, d.z) * 1.4, max(h, 0.0) * 6.0);
    float cloud = skyFbm(cloudUV * 0.6 + vec2(uTime * 0.012, uTime * 0.004));
    float cloudMask = smoothstep(0.02, 0.55, max(h, 0.0)) * (1.0 - smoothstep(0.4, 1.0, h));
    col = mix(col, uHorizon * 1.15, cloud * cloudMask * 0.45 * uHaze);

    // Sun: tiny disk + wide soft halo, attenuated by haze so the sun never reads sharp.
    float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
    float disk = smoothstep(0.997, 0.9995, sunDot);
    float halo = pow(sunDot, mix(80.0, 24.0, uHaze));
    float wideHalo = pow(sunDot, mix(8.0, 3.0, uHaze));
    // Keep disk/halo readable in deep haze; palette is lunar gold, not ember-hot.
    float hazeAtten = mix(1.0, 0.26, uHaze);
    col += uSunColor * disk * 0.9 * hazeAtten;
    col += uSunColor * halo * 0.55 * hazeAtten;
    col += uSunColor * wideHalo * 0.18 * hazeAtten;

    // Subtle vertical gradient noise so the dome doesn't read as a flat clearcoat.
    float grain = (skyNoise(d.xy * 380.0 + uTime * 0.05) - 0.5) * 0.012;
    col += grain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createDeadSky(
  scene: THREE.Scene,
  opts?: { readonly initialHazeMul?: number },
): DeadSky {
  let lastZone: Zone = 'safe';
  let skyHazeMul = THREE.MathUtils.clamp(opts?.initialHazeMul ?? 1, 0, 1.5);
  const tone = ZONE_TONES.safe;
  const uniforms: DeadSkyUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.35, 0.18, -0.92).normalize() },
    uSunColor: { value: new THREE.Color(tone.sun) },
    uZenith: { value: new THREE.Color(tone.zenith) },
    uHorizon: { value: new THREE.Color(tone.horizon) },
    uGround: { value: new THREE.Color(tone.ground) },
    uHaze: { value: Math.min(1, tone.haze * skyHazeMul) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [k: string]: THREE.IUniform },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });

  const geom = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  // Render before everything else; depth is disabled so it never fights with
  // world geometry. The sphere also tracks the camera every frame (see the
  // `onBeforeRender` hook below) so it can never be left behind as the
  // player walks far from the world origin.
  mesh.renderOrder = -1;
  mesh.name = 'dead-sky';
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  scene.add(mesh);

  function setZoneTone(zone: Zone): void {
    lastZone = zone;
    const t = ZONE_TONES[zone];
    uniforms.uZenith.value.setHex(t.zenith);
    uniforms.uHorizon.value.setHex(t.horizon);
    uniforms.uGround.value.setHex(t.ground);
    uniforms.uSunColor.value.setHex(t.sun);
    uniforms.uHaze.value = Math.min(1, t.haze * skyHazeMul);
  }

  function setSkyHazeMultiplier(mul: number): void {
    skyHazeMul = THREE.MathUtils.clamp(mul, 0, 1.5);
    const t = ZONE_TONES[lastZone];
    uniforms.uHaze.value = Math.min(1, t.haze * skyHazeMul);
  }

  function setSunDirection(dir: THREE.Vector3): void {
    uniforms.uSunDir.value.copy(dir).normalize();
  }

  function dispose(): void {
    scene.remove(mesh);
    geom.dispose();
    mat.dispose();
  }

  return { mesh, uniforms, setZoneTone, setSkyHazeMultiplier, setSunDirection, dispose };
}
