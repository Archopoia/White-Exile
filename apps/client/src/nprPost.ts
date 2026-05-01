/**
 * NPR post-process pipeline (Three.js port of `tutelary_npr_composite.gdshader`).
 *
 * Two prepass render targets:
 *   - `rtScene`: the regular lit scene with an attached `DepthTexture` (gives
 *     us colour + linear depth in one render).
 *   - `rtNormal`: same scene with `scene.overrideMaterial = MeshNormalMaterial`,
 *     which writes view-space normals encoded as `n*0.5+0.5`. The dune
 *     displacement is intentionally not replicated here — depth Sobel still
 *     catches dune silhouettes; using the plain normal material keeps this
 *     port a single file.
 *
 * Then a fullscreen `ShaderMaterial` quad samples (tDiffuse, tDepth, tNormal)
 * and runs the same composite as the Godot shader: cel quantise → Kuwahara
 * oil → depth-edge mist → depth+normal Sobel ink → hatch.
 *
 * Sky dome and 2D label DOM are handled outside this pipeline:
 *   - The sky mesh is hidden during the normal prepass (we don't want a
 *     normal-encoded background, and we want it to *not* generate a Sobel
 *     edge against geometry).
 *   - CSS2D labels live on a separate DOM element so they ignore us.
 *
 * No EffectComposer dep on purpose; this is the only post pass we need.
 */
import * as THREE from 'three';

import type { NprSettings } from './nprSettings.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Composite shader. Mirrors the `tutelary_npr_composite.gdshader` ordering
 * with three deliberate simplifications:
 *   1. No HDR sky blend (we already use ACES tone-mapping in the renderer).
 *   2. No cel pattern texture / piecewise curve (a single quantize is enough
 *      for the "stepped shadows" the user asked for).
 *   3. No edge-dissolve (mist already covers the painterly blur use case).
 */
const FRAG = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uTime;
  uniform int uHasNormal;

  uniform int uOutlineEnabled;
  uniform float uOutlineThicknessPx;
  uniform vec3 uOutlineColor;
  uniform float uDepthGradientWeight;
  uniform float uOutlineMinFeaturePx;

  uniform int uWiggleEnabled;
  uniform float uWiggleFrequency;
  uniform float uWiggleAmplitudePx;
  uniform float uWiggleIrregularity;

  uniform int uCelEnabled;
  uniform float uCelSteps;
  uniform float uCelStepSmoothness;
  uniform vec3 uCelShadowTint;
  uniform float uCelShadowTintAmount;
  uniform float uCelMinLight;
  uniform float uCelMix;

  uniform int uHatchEnabled;
  // 0=tonal, 1=crosshatch, 2=raster
  uniform int uShadowPattern;
  uniform float uHatchModPx;
  uniform float uHatchLumaDark;
  uniform float uHatchLumaMid;
  uniform float uHatchLumaLight;
  uniform float uTonalShadowLift;
  uniform float uRasterCellPx;
  uniform float uHatchWiggleInHatch;

  uniform int uOilEnabled;
  uniform float uOilRadius;
  uniform float uOilIntensity;

  uniform int uMistEnabled;
  uniform float uMistIntensity;
  uniform float uMistDepthThreshold;
  uniform float uMistSpreadPx;
  uniform vec3 uMistColor;
  uniform float uMistTintStrength;
  uniform float uMistGlobal;
  uniform float uMistGeomEdgeScale;

  // ---- helpers ----
  // Note: Three prepends its own luminance(vec3) in the fragment prefix; do not redeclare it.

  float posterLum(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float perspectiveDepthToLinear01(float depth) {
    // Three.js DepthTexture stores hyperbolic 0..1 depth (glDepthRange [0,1]).
    // viewZ is negative; -viewZ/far gives 0 at near, ~1 at far.
    float ndcZ = depth * 2.0 - 1.0;
    float viewZ = (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * ndcZ - (uCameraFar + uCameraNear));
    return clamp(-viewZ / uCameraFar, 0.0, 1.0);
  }

  float sampleLinearDepth(vec2 uv) {
    return perspectiveDepthToLinear01(texture2D(tDepth, uv).r);
  }

  float quantizeBands(float term01, float steps, float smoothness) {
    float st = max(steps, 2.0);
    float lm = clamp(term01, 0.0, 1.0) * st;
    float b = floor(lm);
    float f = lm - b;
    float w = clamp(smoothness, 0.0, 1.0) * 0.48;
    f = smoothstep(0.5 - w, 0.5 + w, f);
    return (b + f) / st;
  }

  // 3x3 Sobel on linear-depth and (optionally) view-normal-luma.
  void sobelDepthNormal(
      vec2 baseUv, vec2 disp, vec2 thickUv,
      out float gradDepth, out float gradNormal, out float edgeScreen) {
    float d00 = sampleLinearDepth(baseUv + disp + thickUv * vec2(-1.0,  1.0));
    float d01 = sampleLinearDepth(baseUv + disp + thickUv * vec2(-1.0,  0.0));
    float d02 = sampleLinearDepth(baseUv + disp + thickUv * vec2(-1.0, -1.0));
    float d10 = sampleLinearDepth(baseUv + disp + thickUv * vec2( 0.0, -1.0));
    float d12 = sampleLinearDepth(baseUv + disp + thickUv * vec2( 0.0,  1.0));
    float d20 = sampleLinearDepth(baseUv + disp + thickUv * vec2( 1.0, -1.0));
    float d21 = sampleLinearDepth(baseUv + disp + thickUv * vec2( 1.0,  0.0));
    float d22 = sampleLinearDepth(baseUv + disp + thickUv * vec2( 1.0,  1.0));
    float gxD = -d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22;
    float gyD = -d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22;
    gradDepth = sqrt(gxD * gxD + gyD * gyD);

    float n00 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2(-1.0,  1.0)).rgb);
    float n01 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2(-1.0,  0.0)).rgb);
    float n02 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2(-1.0, -1.0)).rgb);
    float n10 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2( 0.0, -1.0)).rgb);
    float n12 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2( 0.0,  1.0)).rgb);
    float n20 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2( 1.0, -1.0)).rgb);
    float n21 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2( 1.0,  0.0)).rgb);
    float n22 = luminance(texture2D(tNormal, baseUv + disp + thickUv * vec2( 1.0,  1.0)).rgb);
    float gxN = -n00 - 2.0 * n01 - n02 + n20 + 2.0 * n21 + n22;
    float gyN = -n00 - 2.0 * n10 - n20 + n02 + 2.0 * n12 + n22;
    gradNormal = sqrt(gxN * gxN + gyN * gyN);

    float s00 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2(-1.0,  1.0)).rgb);
    float s01 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2(-1.0,  0.0)).rgb);
    float s02 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2(-1.0, -1.0)).rgb);
    float s10 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2( 0.0, -1.0)).rgb);
    float s12 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2( 0.0,  1.0)).rgb);
    float s20 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2( 1.0, -1.0)).rgb);
    float s21 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2( 1.0,  0.0)).rgb);
    float s22 = posterLum(texture2D(tDiffuse, baseUv + disp + thickUv * vec2( 1.0,  1.0)).rgb);
    float gxS = -s00 - 2.0 * s01 - s02 + s20 + 2.0 * s21 + s22;
    float gyS = -s00 - 2.0 * s10 - s20 + s02 + 2.0 * s12 + s22;
    edgeScreen = sqrt(gxS * gxS + gyS * gyS);
  }

  // 5-tap cross blur on linear depth - used by the thin-feature gate.
  float depthCrossBlur(vec2 uv, vec2 rUv) {
    float c = sampleLinearDepth(uv);
    c += sampleLinearDepth(uv + vec2(rUv.x, 0.0));
    c += sampleLinearDepth(uv - vec2(rUv.x, 0.0));
    c += sampleLinearDepth(uv + vec2(0.0, rUv.y));
    c += sampleLinearDepth(uv - vec2(0.0, rUv.y));
    return c * 0.2;
  }

  // Edge response shared by mist (and would-be edge-dissolve).
  // Same threshold curve as the Godot composite so settings transfer.
  float depthEdgeOneScale(vec2 uv, vec2 pxSz, float centreDepth, float thresh, float rad, float wgt) {
    float depthNorm = max(centreDepth, 0.02);
    vec2 stepv = pxSz * rad;
    float dL = sampleLinearDepth(uv + vec2(-stepv.x, 0.0));
    float dR = sampleLinearDepth(uv + vec2( stepv.x, 0.0));
    float dT = sampleLinearDepth(uv + vec2( 0.0, stepv.y));
    float dB = sampleLinearDepth(uv + vec2( 0.0,-stepv.y));
    float maxDiff = 0.0;
    maxDiff = max(maxDiff, abs(centreDepth - dL));
    maxDiff = max(maxDiff, abs(centreDepth - dR));
    maxDiff = max(maxDiff, abs(centreDepth - dT));
    maxDiff = max(maxDiff, abs(centreDepth - dB));
    float normDiff = maxDiff / depthNorm;
    float softness = 1.0 + rad * 0.15;
    float td = clamp(thresh, 0.0005, 0.25);
    float tNorm = (td - 0.0005) / max(0.25 - 0.0005, 1e-6);
    float lo = td * mix(0.06, 0.22, 1.0 - tNorm) * softness;
    float hi = td * mix(1.1, 3.2, tNorm) * softness;
    float e = smoothstep(lo, hi, normDiff);
    return clamp(e * wgt, 0.0, 1.0);
  }

  float depthEdgeStrength(vec2 uv, vec2 pxSz, float centreDepth, float thresh) {
    float e0 = depthEdgeOneScale(uv, pxSz, centreDepth, thresh,  2.0, 0.7);
    float e1 = depthEdgeOneScale(uv, pxSz, centreDepth, thresh, 12.0, 1.0);
    return clamp(max(e0, e1), 0.0, 1.0);
  }

  vec3 applyOil(vec2 uv, vec3 lit, vec2 pxSz, float geomEdge) {
    if (uOilEnabled == 0 || uOilIntensity < 0.0001) return lit;
    vec3 sCentre = texture2D(tDiffuse, uv).rgb;
    float rad = clamp(uOilRadius, 1.0, 10.0);
    float r2 = rad * rad + 0.5;
    vec2 ts = pxSz;
    vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
    vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
    float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;
    for (int x = -10; x <= 10; x++) {
      for (int y = -10; y <= 10; y++) {
        if (float(x * x + y * y) > r2) continue;
        vec3 c = texture2D(tDiffuse, uv + vec2(float(x), float(y)) * ts).rgb;
        if (x <= 0 && y <= 0) { m0 += c; s0 += c * c; n0 += 1.0; }
        if (x >= 0 && y <= 0) { m1 += c; s1 += c * c; n1 += 1.0; }
        if (x <= 0 && y >= 0) { m2 += c; s2 += c * c; n2 += 1.0; }
        if (x >= 0 && y >= 0) { m3 += c; s3 += c * c; n3 += 1.0; }
      }
    }
    float minVar = 1e10;
    vec3 kResult = lit;
    if (n0 > 0.0) { vec3 mu = m0 / n0; float v = dot(s0 / n0 - mu * mu, vec3(1.0)); if (v < minVar) { minVar = v; kResult = mu; } }
    if (n1 > 0.0) { vec3 mu = m1 / n1; float v = dot(s1 / n1 - mu * mu, vec3(1.0)); if (v < minVar) { minVar = v; kResult = mu; } }
    if (n2 > 0.0) { vec3 mu = m2 / n2; float v = dot(s2 / n2 - mu * mu, vec3(1.0)); if (v < minVar) { minVar = v; kResult = mu; } }
    if (n3 > 0.0) { vec3 mu = m3 / n3; float v = dot(s3 / n3 - mu * mu, vec3(1.0)); if (v < minVar) { minVar = v; kResult = mu; } }
    float lt = posterLum(lit);
    float darkBoost = 1.0 + 0.22 * (1.0 - smoothstep(0.0, 0.32, lt));
    float effI = clamp(uOilIntensity * darkBoost * (1.0 + 0.55 * geomEdge), 0.0, 4.0);
    return lit + (kResult - sCentre) * effI;
  }

  vec4 applyMist(vec2 uv, vec3 lit, vec2 pxSz, float geomEdge) {
    if (uMistEnabled == 0 || uMistIntensity < 0.0001) return vec4(lit, 0.0);
    float centreDepth = sampleLinearDepth(uv);
    float ed = depthEdgeStrength(uv, pxSz, centreDepth, uMistDepthThreshold);
    float td = clamp(uMistDepthThreshold, 0.0005, 0.25);
    float tNorm = (td - 0.0005) / max(0.25 - 0.0005, 1e-6);
    float edgePow = mix(0.42, 7.0, tNorm);
    float edgeStr = pow(clamp(max(ed, geomEdge), 0.0, 1.0), edgePow);
    float globalM = clamp(uMistGlobal, 0.0, 1.0);
    float effective = max(edgeStr, globalM);
    if (effective < 0.001) return vec4(lit, 0.0);

    vec3 sCentre = texture2D(tDiffuse, uv).rgb;
    float spread = uMistSpreadPx * effective;
    float centreW = mix(1.0, 0.05, effective);
    vec3 blurred = lit * centreW;
    float total = centreW;
    // 4 inner + 8 outer Poisson disc taps; each tap is the NPR-adjusted lit
    // colour shifted by the tap's screen delta so cel/oil work survives the blur.
    vec2 inner0 = vec2( 0.383,  0.924);
    vec2 inner1 = vec2( 0.924, -0.383);
    vec2 inner2 = vec2(-0.383, -0.924);
    vec2 inner3 = vec2(-0.924,  0.383);
    blurred += lit + texture2D(tDiffuse, uv + inner0 * spread * 0.4 * pxSz).rgb - sCentre;
    blurred += lit + texture2D(tDiffuse, uv + inner1 * spread * 0.4 * pxSz).rgb - sCentre;
    blurred += lit + texture2D(tDiffuse, uv + inner2 * spread * 0.4 * pxSz).rgb - sCentre;
    blurred += lit + texture2D(tDiffuse, uv + inner3 * spread * 0.4 * pxSz).rgb - sCentre;
    total += 4.0;
    vec2 o0 = vec2(-0.326, -0.406);
    vec2 o1 = vec2(-0.84,  -0.074);
    vec2 o2 = vec2(-0.696,  0.457);
    vec2 o3 = vec2( 0.962, -0.195);
    vec2 o4 = vec2( 0.519,  0.767);
    vec2 o5 = vec2( 0.185, -0.893);
    vec2 o6 = vec2(-0.321,  0.932);
    vec2 o7 = vec2( 0.857,  0.399);
    blurred += (lit + texture2D(tDiffuse, uv + o0 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o1 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o2 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o3 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o4 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o5 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o6 * spread * pxSz).rgb - sCentre) * 0.7;
    blurred += (lit + texture2D(tDiffuse, uv + o7 * spread * pxSz).rgb - sCentre) * 0.7;
    total += 5.6;
    blurred /= total;

    float mistAmt = clamp(effective * uMistIntensity, 0.0, 1.0);
    mistAmt *= (1.0 + mistAmt);
    mistAmt = clamp(mistAmt, 0.0, 1.0);
    vec3 result = mix(lit, blurred, mistAmt);
    float tintK = clamp(uMistTintStrength, 0.0, 1.0);
    result = mix(result, uMistColor, mistAmt * tintK);
    return vec4(result, mistAmt);
  }

  void main() {
    vec2 uv = vUv;
    vec2 pxSz = 1.0 / uResolution;
    vec4 sc = texture2D(tDiffuse, uv);

    vec2 thickUv = uOutlineThicknessPx * pxSz;
    float ir = clamp(uWiggleIrregularity, 0.0, 1.0);
    float nmul = mix(1.0, hash21(gl_FragCoord.xy), ir);
    vec2 displacement = vec2(
        sin(gl_FragCoord.y * uWiggleFrequency),
        cos(gl_FragCoord.x * uWiggleFrequency)
    ) * nmul * (uWiggleAmplitudePx * pxSz);
    if (uWiggleEnabled == 0) displacement = vec2(0.0);

    vec3 col = sc.rgb;

    // ---- Cel (toon banding) ----
    if (uCelEnabled == 1 && uCelMix > 0.0001) {
      float term = luminance(col);
      term = mix(uCelMinLight, 1.0, term);
      float celShade = quantizeBands(term, uCelSteps, uCelStepSmoothness);
      // Ratio scale: keeps overall exposure near the original while quantising.
      float celScale = celShade / max(luminance(col), 0.001);
      celScale = min(celScale, 4.0);
      vec3 lit = col * celScale;
      float shadowW = (1.0 - celShade) * uCelShadowTintAmount;
      lit = mix(lit, lit * uCelShadowTint, shadowW);
      col = mix(col, lit, clamp(uCelMix, 0.0, 1.0));
    }

    // ---- Sobel outline signal (fed to outline + mist + oil) ----
    float gradDepth = 0.0;
    float gradNormal = 0.0;
    float edgeScreen = 0.0;
    sobelDepthNormal(uv, displacement, thickUv, gradDepth, gradNormal, edgeScreen);
    if (uHasNormal == 0) gradNormal = edgeScreen;
    float outlineRaw = gradDepth * uDepthGradientWeight + gradNormal;

    // Hairline suppression: cross-blur depth before Sobel; if blurred edge << sharp edge,
    // we're sitting on a thin feature and we drop ink for it.
    float thinGate = 1.0;
    if (uOutlineMinFeaturePx > 0.001) {
      vec2 rUv = max(uOutlineMinFeaturePx, 0.35) * pxSz;
      vec2 disp = displacement;
      float dB00 = depthCrossBlur(uv + disp + thickUv * vec2(-1.0,  1.0), rUv);
      float dB01 = depthCrossBlur(uv + disp + thickUv * vec2(-1.0,  0.0), rUv);
      float dB02 = depthCrossBlur(uv + disp + thickUv * vec2(-1.0, -1.0), rUv);
      float dB10 = depthCrossBlur(uv + disp + thickUv * vec2( 0.0, -1.0), rUv);
      float dB12 = depthCrossBlur(uv + disp + thickUv * vec2( 0.0,  1.0), rUv);
      float dB20 = depthCrossBlur(uv + disp + thickUv * vec2( 1.0, -1.0), rUv);
      float dB21 = depthCrossBlur(uv + disp + thickUv * vec2( 1.0,  0.0), rUv);
      float dB22 = depthCrossBlur(uv + disp + thickUv * vec2( 1.0,  1.0), rUv);
      float gx = -dB00 - 2.0 * dB01 - dB02 + dB20 + 2.0 * dB21 + dB22;
      float gy = -dB00 - 2.0 * dB10 - dB20 + dB02 + 2.0 * dB12 + dB22;
      float outlineBlur = sqrt(gx * gx + gy * gy) * uDepthGradientWeight;
      float kf = clamp(uOutlineMinFeaturePx / 10.0, 0.0, 1.0);
      float lo = mix(0.05, 0.18, kf);
      float hi = mix(0.14, 0.42, kf);
      if (outlineRaw > 1e-4) {
        float rw = outlineBlur / max(outlineRaw, 1e-5);
        thinGate = smoothstep(lo, hi, rw);
      }
    }

    float geomEdge = clamp(outlineRaw * uMistGeomEdgeScale, 0.0, 1.0);

    // ---- Painterly: oil then mist (matches original ordering) ----
    col = applyOil(uv, col, pxSz, geomEdge);
    vec4 mistOut = applyMist(uv, col, pxSz, geomEdge);
    col = mistOut.rgb;
    float mistBlend = mistOut.a;

    float pixelLuma = luminance(col);

    // ---- Hatching (more directions stack as the band gets darker) ----
    float ot = max(uOutlineThicknessPx, 0.5);
    float scenelinDepth = sampleLinearDepth(uv);
    // Skip hatch on the sky / far plane.
    bool inGeom = scenelinDepth < 0.999;

    if (uHatchEnabled == 1 && uShadowPattern == 0 && inGeom) {
      // Tonal: just multiply by a darkening factor per band.
      float lift = clamp(uTonalShadowLift, 0.0, 1.0);
      float mDark = mix(0.15, 1.0, lift);
      float mMid  = mix(0.45, 1.0, lift);
      float mLight = mix(0.72, 1.0, lift);
      if (pixelLuma <= uHatchLumaDark) {
        col *= mDark;
      } else if (pixelLuma <= uHatchLumaMid) {
        col *= mMid;
      } else if (pixelLuma <= uHatchLumaLight) {
        col *= mLight;
      }
    } else if (uHatchEnabled == 1 && uShadowPattern == 1 && inGeom) {
      // Crosshatch:
      //   light -> 1 diagonal stripe family
      //   mid   -> 2 stripe families (vertical + diagonal)
      //   dark  -> 3 stripe families (horizontal + vertical + diagonal)
      float tlift = clamp(uTonalShadowLift, 0.0, 1.0);
      vec3 hatchInk = mix(uOutlineColor, col, tlift * 0.88);
      float mv = max(uHatchModPx, 2.0);
      float hw = clamp(uHatchWiggleInHatch, 0.0, 1.0);
      vec2 dH = displacement * hw;
      float invSx = 1.0 / max(pxSz.x, 1e-8);
      float invSy = 1.0 / max(pxSz.y, 1e-8);
      float py = (uv.y + dH.y) * invSy;
      float px = (uv.x + dH.x) * invSx;
      float pd = (uv.x + dH.x) * invSy + (uv.y + dH.y) * invSx;
      if (pixelLuma <= uHatchLumaDark) {
        float fy = mod(py, mv);
        float fx = mod(px, mv);
        float fd = mod(pd, mv);
        float wy = float(fy < ot);
        float wx = float(fx < ot);
        float wd = float(fd <= ot);
        float amt = clamp(wy * 1.0 + wx * 0.28 + wd * 0.28, 0.0, 1.0);
        col = mix(col, hatchInk, amt);
      } else if (pixelLuma <= uHatchLumaMid) {
        float fx = mod(px, mv);
        float fd = mod(pd, mv);
        float wx = float(fx < ot);
        float wd = float(fd <= ot);
        float amt = clamp(wx * 0.52 + wd * 0.52, 0.0, 1.0);
        col = mix(col, hatchInk, amt);
      } else if (pixelLuma <= uHatchLumaLight) {
        float fd = mod(pd, mv);
        float wd = float(fd <= ot);
        float amt = wd * 0.5;
        col = mix(col, hatchInk, amt);
      }
    } else if (uHatchEnabled == 1 && inGeom) {
      // Raster halftone dots; size tracks darkness.
      float tliftR = clamp(uTonalShadowLift, 0.0, 1.0);
      vec3 rasterInk = mix(uOutlineColor, col, tliftR * 0.88);
      float cell = max(uRasterCellPx, 2.0);
      vec2 g = (uv / pxSz) / cell;
      vec2 gv = fract(g) - vec2(0.5);
      float r = length(gv);
      float t = 1.0 - pixelLuma;
      float rad = mix(0.08, 0.42, t);
      if (pixelLuma <= uHatchLumaLight && r < rad) {
        col = mix(col, rasterInk, 0.4);
      }
    }

    // ---- Final ink (Sobel) ----
    float outline = clamp(outlineRaw, 0.0, 1.0) * float(uOutlineEnabled) * thinGate;
    if (uMistEnabled == 1) {
      // Soften ink where mist already smeared the edge - avoids sharp black redraw on top of smoke.
      outline *= mix(1.0, 1.0 - 0.92, clamp(mistBlend, 0.0, 1.0));
    }
    vec3 outc = mix(col, uOutlineColor, outline);

    gl_FragColor = vec4(outc, sc.a);
  }
`;

interface NprUniforms {
  readonly tDiffuse: THREE.IUniform<THREE.Texture | null>;
  readonly tDepth: THREE.IUniform<THREE.Texture | null>;
  readonly tNormal: THREE.IUniform<THREE.Texture | null>;
  readonly uResolution: THREE.IUniform<THREE.Vector2>;
  readonly uCameraNear: THREE.IUniform<number>;
  readonly uCameraFar: THREE.IUniform<number>;
  readonly uTime: THREE.IUniform<number>;
  readonly uHasNormal: THREE.IUniform<number>;
  readonly uOutlineEnabled: THREE.IUniform<number>;
  readonly uOutlineThicknessPx: THREE.IUniform<number>;
  readonly uOutlineColor: THREE.IUniform<THREE.Vector3>;
  readonly uDepthGradientWeight: THREE.IUniform<number>;
  readonly uOutlineMinFeaturePx: THREE.IUniform<number>;
  readonly uWiggleEnabled: THREE.IUniform<number>;
  readonly uWiggleFrequency: THREE.IUniform<number>;
  readonly uWiggleAmplitudePx: THREE.IUniform<number>;
  readonly uWiggleIrregularity: THREE.IUniform<number>;
  readonly uCelEnabled: THREE.IUniform<number>;
  readonly uCelSteps: THREE.IUniform<number>;
  readonly uCelStepSmoothness: THREE.IUniform<number>;
  readonly uCelShadowTint: THREE.IUniform<THREE.Vector3>;
  readonly uCelShadowTintAmount: THREE.IUniform<number>;
  readonly uCelMinLight: THREE.IUniform<number>;
  readonly uCelMix: THREE.IUniform<number>;
  readonly uHatchEnabled: THREE.IUniform<number>;
  readonly uShadowPattern: THREE.IUniform<number>;
  readonly uHatchModPx: THREE.IUniform<number>;
  readonly uHatchLumaDark: THREE.IUniform<number>;
  readonly uHatchLumaMid: THREE.IUniform<number>;
  readonly uHatchLumaLight: THREE.IUniform<number>;
  readonly uTonalShadowLift: THREE.IUniform<number>;
  readonly uRasterCellPx: THREE.IUniform<number>;
  readonly uHatchWiggleInHatch: THREE.IUniform<number>;
  readonly uOilEnabled: THREE.IUniform<number>;
  readonly uOilRadius: THREE.IUniform<number>;
  readonly uOilIntensity: THREE.IUniform<number>;
  readonly uMistEnabled: THREE.IUniform<number>;
  readonly uMistIntensity: THREE.IUniform<number>;
  readonly uMistDepthThreshold: THREE.IUniform<number>;
  readonly uMistSpreadPx: THREE.IUniform<number>;
  readonly uMistColor: THREE.IUniform<THREE.Vector3>;
  readonly uMistTintStrength: THREE.IUniform<number>;
  readonly uMistGlobal: THREE.IUniform<number>;
  readonly uMistGeomEdgeScale: THREE.IUniform<number>;
}

function shadowPatternIndex(p: NprSettings['hatchPattern']): number {
  if (p === 'tonal') return 0;
  if (p === 'crosshatch') return 1;
  return 2;
}

export interface NprPostHandle {
  setSize(width: number, height: number): void;
  setSettings(s: NprSettings): void;
  /** Renders `scene` with the chosen `camera` through the NPR composite. */
  render(scene: THREE.Scene, camera: THREE.Camera, hideDuringNormalPass: ReadonlyArray<THREE.Object3D>): void;
  dispose(): void;
}

export function createNprPost(renderer: THREE.WebGLRenderer, initial: NprSettings): NprPostHandle {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const dpr = renderer.getPixelRatio();
  const w = Math.max(2, Math.floor(size.x * dpr));
  const h = Math.max(2, Math.floor(size.y * dpr));

  const depthTex = new THREE.DepthTexture(w, h);
  depthTex.format = THREE.DepthFormat;
  depthTex.type = THREE.UnsignedIntType;

  const rtScene = new THREE.WebGLRenderTarget(w, h, {
    depthTexture: depthTex,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    stencilBuffer: false,
    samples: 0,
  });

  const rtNormal = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  });

  const normalMat = new THREE.MeshNormalMaterial();

  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms: NprUniforms = {
    tDiffuse: { value: rtScene.texture },
    tDepth: { value: rtScene.depthTexture },
    tNormal: { value: rtNormal.texture },
    uResolution: { value: new THREE.Vector2(w, h) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 4000 },
    uTime: { value: 0 },
    uHasNormal: { value: 1 },
    uOutlineEnabled: { value: 1 },
    uOutlineThicknessPx: { value: 1.5 },
    uOutlineColor: { value: new THREE.Vector3(0, 0, 0) },
    uDepthGradientWeight: { value: 25 },
    uOutlineMinFeaturePx: { value: 2.5 },
    uWiggleEnabled: { value: 1 },
    uWiggleFrequency: { value: 0.08 },
    uWiggleAmplitudePx: { value: 2 },
    uWiggleIrregularity: { value: 0 },
    uCelEnabled: { value: 0 },
    uCelSteps: { value: 4 },
    uCelStepSmoothness: { value: 0.22 },
    uCelShadowTint: { value: new THREE.Vector3(0.55, 0.62, 0.85) },
    uCelShadowTintAmount: { value: 0 },
    uCelMinLight: { value: 0.06 },
    uCelMix: { value: 1 },
    uHatchEnabled: { value: 1 },
    uShadowPattern: { value: 1 },
    uHatchModPx: { value: 8 },
    uHatchLumaDark: { value: 0.35 },
    uHatchLumaMid: { value: 0.55 },
    uHatchLumaLight: { value: 0.8 },
    uTonalShadowLift: { value: 0.55 },
    uRasterCellPx: { value: 14 },
    uHatchWiggleInHatch: { value: 1 },
    uOilEnabled: { value: 0 },
    uOilRadius: { value: 3 },
    uOilIntensity: { value: 0.8 },
    uMistEnabled: { value: 0 },
    uMistIntensity: { value: 0.6 },
    uMistDepthThreshold: { value: 0.035 },
    uMistSpreadPx: { value: 12 },
    uMistColor: { value: new THREE.Vector3(0.03, 0.025, 0.02) },
    uMistTintStrength: { value: 0.2 },
    uMistGlobal: { value: 0 },
    uMistGeomEdgeScale: { value: 0.38 },
  };

  const compositeMat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [k: string]: THREE.IUniform },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
  // Composite operates on already-tone-mapped values — don't double-apply.
  compositeMat.toneMapped = false;

  const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat);
  fsQuad.frustumCulled = false;
  fsScene.add(fsQuad);

  const applySettings = (s: NprSettings): void => {
    uniforms.uOutlineEnabled.value = s.outlineEnabled ? 1 : 0;
    uniforms.uOutlineThicknessPx.value = s.outlineThicknessPx;
    uniforms.uOutlineColor.value.set(s.outlineColor[0], s.outlineColor[1], s.outlineColor[2]);
    uniforms.uDepthGradientWeight.value = s.outlineDepthWeight;
    uniforms.uOutlineMinFeaturePx.value = s.outlineMinFeaturePx;

    uniforms.uWiggleEnabled.value = s.wiggleEnabled ? 1 : 0;
    uniforms.uWiggleFrequency.value = s.wiggleFrequency;
    uniforms.uWiggleAmplitudePx.value = s.wiggleAmplitudePx;
    uniforms.uWiggleIrregularity.value = s.wiggleIrregularity;

    uniforms.uCelEnabled.value = s.celEnabled ? 1 : 0;
    uniforms.uCelSteps.value = s.celSteps;
    uniforms.uCelStepSmoothness.value = s.celStepSmoothness;
    uniforms.uCelShadowTint.value.set(s.celShadowTint[0], s.celShadowTint[1], s.celShadowTint[2]);
    uniforms.uCelShadowTintAmount.value = s.celShadowTintAmount;
    uniforms.uCelMinLight.value = s.celMinLight;
    uniforms.uCelMix.value = s.celMix;

    uniforms.uHatchEnabled.value = s.hatchEnabled ? 1 : 0;
    uniforms.uShadowPattern.value = shadowPatternIndex(s.hatchPattern);
    uniforms.uHatchModPx.value = s.hatchModPx;
    uniforms.uHatchLumaDark.value = s.hatchLumaDark;
    uniforms.uHatchLumaMid.value = s.hatchLumaMid;
    uniforms.uHatchLumaLight.value = s.hatchLumaLight;
    uniforms.uTonalShadowLift.value = s.tonalShadowLift;
    uniforms.uRasterCellPx.value = s.rasterCellPx;

    uniforms.uOilEnabled.value = s.oilEnabled ? 1 : 0;
    uniforms.uOilRadius.value = s.oilRadiusPx;
    uniforms.uOilIntensity.value = s.oilIntensity;

    uniforms.uMistEnabled.value = s.mistEnabled ? 1 : 0;
    uniforms.uMistIntensity.value = s.mistIntensity;
    uniforms.uMistDepthThreshold.value = s.mistDepthThreshold;
    uniforms.uMistSpreadPx.value = s.mistSpreadPx;
    uniforms.uMistColor.value.set(s.mistColor[0], s.mistColor[1], s.mistColor[2]);
    uniforms.uMistTintStrength.value = s.mistTintStrength;
    uniforms.uMistGlobal.value = s.mistGlobal;
    uniforms.uMistGeomEdgeScale.value = s.mistGeomEdgeScale;
  };

  applySettings(initial);

  const setSize = (width: number, height: number): void => {
    const px = renderer.getPixelRatio();
    const ww = Math.max(2, Math.floor(width * px));
    const hh = Math.max(2, Math.floor(height * px));
    rtScene.setSize(ww, hh);
    rtNormal.setSize(ww, hh);
    uniforms.uResolution.value.set(ww, hh);
  };

  const render = (
    scene: THREE.Scene,
    camera: THREE.Camera,
    hideDuringNormalPass: ReadonlyArray<THREE.Object3D>,
  ): void => {
    if (camera instanceof THREE.PerspectiveCamera) {
      uniforms.uCameraNear.value = camera.near;
      uniforms.uCameraFar.value = camera.far;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;

    renderer.autoClear = true;
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);

    // Normal prepass: hide things we don't want feeding the normal Sobel
    // (the sky dome would generate huge edges against geometry).
    const prevVisible: boolean[] = hideDuringNormalPass.map((o) => o.visible);
    for (const o of hideDuringNormalPass) o.visible = false;
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(rtNormal);
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    for (let i = 0; i < hideDuringNormalPass.length; i++) {
      const o = hideDuringNormalPass[i];
      const prev = prevVisible[i];
      if (o !== undefined && prev !== undefined) o.visible = prev;
    }

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.render(fsScene, fsCam);
  };

  const dispose = (): void => {
    rtScene.dispose();
    rtNormal.dispose();
    depthTex.dispose();
    compositeMat.dispose();
    fsQuad.geometry.dispose();
    normalMat.dispose();
  };

  return {
    setSize,
    setSettings: applySettings,
    render,
    dispose,
  };
}
