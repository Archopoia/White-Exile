import * as THREE from 'three';
import { ASH_DUNE_DEFAULT_HEIGHT_SCALE } from '@realtime-room/shared';

/** Uniform handles attached in `applyAshDuneTerrainShader`; updated each frame from the scene. */
export interface AshDuneTerrainUniforms {
  readonly uTime: THREE.IUniform<number>;
  readonly uWindDir: THREE.IUniform<THREE.Vector2>;
  readonly uDuneHeightScale: THREE.IUniform<number>;
}

/** Depth + distance materials so shadow maps match vertex-displaced dunes. */
export interface AshDuneShadowMaterials {
  readonly depth: THREE.MeshDepthMaterial;
  readonly distance: THREE.MeshDistanceMaterial;
}

const DUNE_USERDATA_KEY = 'ashDuneTerrain';

function isAshDuneUserData(v: unknown): v is { uniforms: AshDuneTerrainUniforms } {
  if (v === null || typeof v !== 'object') return false;
  if (!('uniforms' in v)) return false;
  const u = (v as { uniforms: unknown }).uniforms;
  if (typeof u !== 'object' || u === null) return false;
  const bag = u as { uTime?: unknown; uDuneHeightScale?: unknown };
  return typeof bag.uTime === 'object' && bag.uTime !== null && typeof bag.uDuneHeightScale === 'object' && bag.uDuneHeightScale !== null;
}

/**
 * Shared GLSL: uniforms + elevation (must match shadow depth/distance passes).
 */
const ASH_DUNE_VERTEX_LIB = /* glsl */ `
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uDuneHeightScale;

      float duneHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float duneNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = duneHash(i);
        float b = duneHash(i + vec2(1.0, 0.0));
        float c = duneHash(i + vec2(0.0, 1.0));
        float d = duneHash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float duneFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 6; i++) {
          v += a * duneNoise(p);
          p = m * p;
          a *= 0.5;
        }
        return v;
      }

      float duneMound(float t, float sharp) {
        t = clamp(t, 0.0, 1.0);
        float rise = 1.0 - cos(t * 3.14159265 * sharp);
        float fall = 1.0 - cos((1.0 - t) * 3.14159265 * (2.1 - sharp * 0.35));
        return mix(rise * 0.55, fall * 0.45, step(0.52, t)) * 0.5;
      }

      float ashDuneElevation(vec2 xz, float t) {
        float r = length(xz);
        float depth = smoothstep(0.0, 420.0, r);
        depth = pow(depth, 1.15);

        float calmCore = 1.0 - smoothstep(0.0, 48.0, r);

        vec2 wdir = normalize(uWindDir);
        vec2 across = vec2(-wdir.y, wdir.x);

        float warpAmp = mix(0.6, 10.0, depth) * (1.0 - calmCore * 0.88);
        vec2 warp = vec2(duneFbm(xz * 0.00045 + 3.7), duneFbm(xz * 0.00042 + 9.1)) * warpAmp;
        vec2 p = xz + warp;

        float along = dot(wdir, p);
        float cross = dot(across, p);

        float waveLen = mix(340.0, 220.0, depth);
        float u = fract(along / waveLen);
        float cellPhase = t * mix(0.022, 0.055, depth);
        float mound = duneMound(u, mix(0.88, 1.28, depth));

        float secondary = sin(along * (6.2831853 / waveLen) * 2.17 + cross * 0.0022 + cellPhase * 1.9);
        secondary += sin(cross * 0.0065 + along * 0.0012 + t * 0.035) * mix(0.08, 0.28, depth);

        float transverse = sin(cross * (0.0038 + depth * 0.006) + duneFbm(p * 0.0009) * 2.8);
        transverse *= mix(0.1, 0.38, depth);

        float amp = mix(2.8, 48.0, depth);
        amp *= mix(1.0, 0.62, calmCore);

        float h = mound * amp;
        h += secondary * mix(0.04, 0.35, depth) * amp * 0.028;
        h += transverse * mix(0.08, 0.55, depth);
        h += (duneFbm(vec2(p.x * 0.0035 + t * 0.012, p.y * 0.0035)) - 0.5) * mix(0.06, 0.45, depth);

        float chop = duneFbm(p * 0.008 + vec2(t * 0.014, -t * 0.011));
        h += chop * (0.35 * depth * depth);

        return h * uDuneHeightScale;
      }
    `;

function attachDuneVertexDisplacement(
  shader: { vertexShader: string; uniforms: { [key: string]: THREE.IUniform } },
  uniforms: AshDuneTerrainUniforms,
  mode: 'standard' | 'shadow',
): void {
  Object.assign(shader.uniforms, {
    uTime: uniforms.uTime,
    uWindDir: uniforms.uWindDir,
    uDuneHeightScale: uniforms.uDuneHeightScale,
  });

  if (mode === 'standard') {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      varying vec2 vAshDuneWorldXZ;
      varying float vAshFlatness;
      #include <common>`,
    );
  }

  shader.vertexShader = ASH_DUNE_VERTEX_LIB + shader.vertexShader;

  const beginPatch =
    mode === 'standard'
      ? `
      #include <begin_vertex>
      vec4 duneWorld4 = modelMatrix * vec4(position, 1.0);
      vec2 duneXZ = duneWorld4.xz;
      vAshDuneWorldXZ = duneXZ;
      vAshFlatness = 0.48;
      float duneH = ashDuneElevation(duneXZ, uTime);
      transformed += normal * duneH;
      `
      : `
      #include <begin_vertex>
      vec4 duneWorld4 = modelMatrix * vec4(position, 1.0);
      vec2 duneXZ = duneWorld4.xz;
      float duneH = ashDuneElevation(duneXZ, uTime);
      transformed += normal * duneH;
      `;

  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', beginPatch);

  if (mode === 'standard') {
    shader.vertexShader = shader.vertexShader.replace(
      'vViewPosition = - mvPosition.xyz;',
      `
      vViewPosition = - mvPosition.xyz;
      #ifndef FLAT_SHADED
      {
        vec2 xzN = (modelMatrix * vec4(position, 1.0)).xz;
        const float eN = 5.0;
        float dhdx = (ashDuneElevation(xzN + vec2(eN, 0.0), uTime) - ashDuneElevation(xzN - vec2(eN, 0.0), uTime)) / (2.0 * eN);
        float dhdz = (ashDuneElevation(xzN + vec2(0.0, eN), uTime) - ashDuneElevation(xzN - vec2(0.0, eN), uTime)) / (2.0 * eN);
        float slope = abs(dhdx) + abs(dhdz);
        vAshFlatness = 1.0 / (1.0 + slope * 0.82);
        vec3 nWorld = normalize(vec3(-dhdx, 1.0, -dhdz));
        vec3 objectNormalDune = normalize(transpose(mat3(modelMatrix)) * nWorld);
        vNormal = normalize(normalMatrix * objectNormalDune);
      }
      #endif
      `,
    );
  }
}

/**
 * `MeshDepthMaterial` / `MeshDistanceMaterial` with the same vertex displacement as the
 * dunes mesh so directional sun and point-flame shadows occlude along crests, not the flat plane.
 */
export function createAshDuneShadowMaterials(uniforms: AshDuneTerrainUniforms): AshDuneShadowMaterials {
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  depth.onBeforeCompile = (shader) => {
    attachDuneVertexDisplacement(shader, uniforms, 'shadow');
  };

  const distance = new THREE.MeshDistanceMaterial();
  distance.onBeforeCompile = (shader) => {
    attachDuneVertexDisplacement(shader, uniforms, 'shadow');
  };

  return { depth, distance };
}

/**
 * Injects vertex displacement for endless ash/snow dunes.
 * Height grows and warps with distance from world origin (aligned with server zone rings).
 * Slow time term reads as drifting aeolian relief, not ocean swells.
 *
 * Normals are recomputed after displacement (Three's default `vNormal` is pre-displacement).
 * Fragment: procedural snow/ash grain (2-octave value noise + slope mask), roughness breakup,
 * view rim — no texture fetches.
 */
export function applyAshDuneTerrainShader(material: THREE.MeshStandardMaterial): AshDuneTerrainUniforms {
  const existing = material.userData[DUNE_USERDATA_KEY];
  if (isAshDuneUserData(existing)) {
    return existing.uniforms;
  }

  const uniforms: AshDuneTerrainUniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.91, 0.42).normalize() },
    uDuneHeightScale: { value: ASH_DUNE_DEFAULT_HEIGHT_SCALE },
  };

  material.onBeforeCompile = (shader) => {
    attachDuneVertexDisplacement(shader, uniforms, 'standard');

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      varying vec2 vAshDuneWorldXZ;
      varying float vAshFlatness;

      /** Cheap 2D value noise (2 octaves max in callers) — keep fragment cost low. */
      float ashHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float ashNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = ashHash(i);
        float b = ashHash(i + vec2(1.0, 0.0));
        float c = ashHash(i + vec2(0.0, 1.0));
        float d = ashHash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float ashGrain(vec2 xz) {
        return ashNoise(xz * 0.042) * 0.55 + ashNoise(xz * 0.13 + vec2(11.0, 3.0)) * 0.35;
      }

      #include <common>`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      {
        float g = ashGrain(vAshDuneWorldXZ) + ashNoise(vAshDuneWorldXZ * 0.0066) * 0.15;
        roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * g) + g * 0.035, 0.04, 1.0);
      }
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      {
        vec2 xz = vAshDuneWorldXZ;
        float grain = ashGrain(xz) + ashNoise(xz * 0.0092) * 0.2;
        float streak = smoothstep(0.22, 0.88, ashNoise(xz * 0.0028 + vec2(1.7, 8.3)));
        vec3 base = diffuseColor.rgb;
        vec3 ashCool = base * vec3(0.8, 0.82, 0.92);
        vec3 frost = vec3(0.86, 0.88, 0.95);
        float snowCover = clamp(
          mix(0.12, 0.72, vAshFlatness) * (0.48 + 0.52 * grain) * (0.62 + 0.38 * streak),
          0.0,
          1.0
        );
        diffuseColor.rgb = mix(base, mix(ashCool, frost, snowCover), 0.9);
        vec3 vn = normalize(normal);
        vec3 vdir = normalize(vViewPosition);
        float ndv = saturate(abs(dot(vn, vdir)));
        float rim = pow(1.0 - ndv, 2.35) * (0.055 + 0.095 * grain);
        diffuseColor.rgb += rim * vec3(0.3, 0.34, 0.42);
      }
      `,
    );
  };

  material.userData[DUNE_USERDATA_KEY] = { uniforms };
  return uniforms;
}

export function getAshDuneTerrainUniforms(material: THREE.MeshStandardMaterial): AshDuneTerrainUniforms | null {
  const raw = material.userData[DUNE_USERDATA_KEY];
  return isAshDuneUserData(raw) ? raw.uniforms : null;
}
