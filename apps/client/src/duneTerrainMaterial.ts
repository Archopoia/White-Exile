import * as THREE from 'three';

/** Uniform handles attached in `applyAshDuneTerrainShader`; updated each frame from the scene. */
export interface AshDuneTerrainUniforms {
  readonly uTime: THREE.IUniform<number>;
  readonly uWindDir: THREE.IUniform<THREE.Vector2>;
}

const DUNE_USERDATA_KEY = 'ashDuneTerrain';

function isAshDuneUserData(v: unknown): v is { uniforms: AshDuneTerrainUniforms } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'uniforms' in v &&
    typeof (v as { uniforms: unknown }).uniforms === 'object' &&
    (v as { uniforms: { uTime?: unknown } }).uniforms !== null &&
    typeof (v as { uniforms: { uTime?: unknown } }).uniforms?.uTime === 'object'
  );
}

/**
 * Injects vertex displacement for endless ash/snow dunes.
 * Height grows and warps with distance from world origin (aligned with server zone rings).
 * Slow time term reads as drifting aeolian relief, not ocean swells.
 *
 * Normals are recomputed after displacement (Three's default `vNormal` is pre-displacement).
 */
export function applyAshDuneTerrainShader(material: THREE.MeshStandardMaterial): AshDuneTerrainUniforms {
  const existing = material.userData[DUNE_USERDATA_KEY];
  if (isAshDuneUserData(existing)) {
    return existing.uniforms;
  }

  const uniforms: AshDuneTerrainUniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.91, 0.42).normalize() },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: uniforms.uTime,
      uWindDir: uniforms.uWindDir,
    });

    shader.vertexShader =
      `
      uniform float uTime;
      uniform vec2 uWindDir;

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

      /** Cosine-mound cross-section (0..1 period) — stoss/lee asymmetric via exponent. */
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

        float warpAmp = mix(2.0, 55.0, depth) * (1.0 - calmCore * 0.85);
        vec2 warp = vec2(duneFbm(xz * 0.0018 + 3.7), duneFbm(xz * 0.0016 + 9.1)) * warpAmp;
        vec2 p = xz + warp;

        float along = dot(wdir, p);
        float cross = dot(across, p);

        float waveLen = mix(140.0, 38.0, depth);
        float u = fract(along / waveLen);
        float cellPhase = t * mix(0.045, 0.11, depth);
        float mound = duneMound(u, mix(1.05, 1.85, depth));

        float secondary = sin(along * (6.2831853 / waveLen) * 2.17 + cross * 0.0061 + cellPhase * 1.9);
        secondary += sin(cross * 0.019 + along * 0.003 + t * 0.05) * mix(0.12, 0.55, depth);

        float transverse = sin(cross * (0.011 + depth * 0.018) + duneFbm(p * 0.003) * 6.2);
        transverse *= mix(0.15, 0.95, depth);

        float amp = mix(0.35, 11.0, depth);
        amp *= mix(1.0, 0.35, calmCore);

        float h = mound * amp;
        h += secondary * mix(0.08, 1.25, depth) * amp * 0.07;
        h += transverse * mix(0.2, 2.4, depth);
        h += (duneFbm(p * 0.012 + t * 0.02) - 0.5) * mix(0.15, 1.8, depth);

        float chop = duneFbm(p * 0.028 + vec2(t * 0.03, -t * 0.021));
        h += chop * mix(0.0, 2.2, depth * depth);

        return h;
      }
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 duneWorld4 = modelMatrix * vec4(position, 1.0);
      vec2 duneXZ = duneWorld4.xz;
      float duneH = ashDuneElevation(duneXZ, uTime);
      transformed += normal * duneH;
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      'vViewPosition = - mvPosition.xyz;',
      `
      vViewPosition = - mvPosition.xyz;
      #ifndef FLAT_SHADED
      {
        vec2 xzN = (modelMatrix * vec4(position, 1.0)).xz;
        const float eN = 2.5;
        float dhdx = (ashDuneElevation(xzN + vec2(eN, 0.0), uTime) - ashDuneElevation(xzN - vec2(eN, 0.0), uTime)) / (2.0 * eN);
        float dhdz = (ashDuneElevation(xzN + vec2(0.0, eN), uTime) - ashDuneElevation(xzN - vec2(0.0, eN), uTime)) / (2.0 * eN);
        vec3 nWorld = normalize(vec3(-dhdx, 1.0, -dhdz));
        vec3 objectNormalDune = normalize(transpose(mat3(modelMatrix)) * nWorld);
        vNormal = normalize(normalMatrix * objectNormalDune);
      }
      #endif
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
