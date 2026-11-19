"use client";

import { useEffect, useRef } from "react";
import type { Vec } from "@/lib/network/geometry";

const MAX_SOCKETS = 5;
const STRANDS_PER_ARM = 9;
const HORIZON_STRANDS = 7;
const INTRO_DURATION = 1.85;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * Nexus Singularity Canopy — Bespoke WebGL2 Analytical Filament Engine.
 *
 * Recreates the silky sinusoidal wave-braiding, nested harmonic taper, 3D depth twist,
 * travelling optical pulses, and responsive strand hover inspired by <WebThreads />,
 * sculpted natively around Nexus's radial Singularity Core + 5 curved orbital node sockets:
 *   1) 5 C1-smooth S-curved braided orbital arms (7 nested filaments each) pinching cleanly
 *      at the Singularity Core and each Node Socket waist, then fanning softly into the sky.
 *   2) A whisper-quiet 6-strand basal horizon cradle grounding the Core laterally without
 *      ever crossing nodes above or the voice stage below.
 *   3) A compact, pearl-gold Singularity Core nucleus with perceptual filmic tone-mapping
 *      (zero whiteout blowout, zero muddy fog, razor-crisp pixel-normalized fibers in both
 *      Obsidian Dark and Gallery Light).
 */
const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uPhase;
uniform float uClock;
uniform float uEnergy;
uniform vec2 uCore;
uniform vec2 uSockets[${MAX_SOCKETS}];
uniform float uSocketLevel[${MAX_SOCKETS}];
uniform float uSocketFocus[${MAX_SOCKETS}];
uniform float uSocketSurge[${MAX_SOCKETS}];
uniform int uSocketCount;
uniform float uLight;
uniform vec3 uIntro;       // x = elapsed, y = active (0/1), z = corePulse
uniform vec4 uPointer;     // xy = smooth UV, z = presence (0..1), w = holdStrength (0..1)
uniform vec3 uCradleSurge; // x = startX, y = age (0..1), z = active (0/1)

out vec4 outColor;

const float PI = 3.14159265;
const float TAU = 6.28318530;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float easeOutCubic(float t) {
  float k = clamp(t, 0.0, 1.0);
  return 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
}

float easeInOutCubic(float t) {
  float k = clamp(t, 0.0, 1.0);
  return k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) * 0.5;
}

vec3 activePalette(float t, float isLight) {
  vec3 c0 = isLight > 0.5 ? vec3(0.75, 0.49, 0.04) : vec3(0.92, 0.70, 0.14); // 24k Nexus Gold
  vec3 c1 = isLight > 0.5 ? vec3(0.88, 0.62, 0.10) : vec3(0.98, 0.82, 0.40); // Sunlit Champagne
  vec3 c2 = isLight > 0.5 ? vec3(0.66, 0.40, 0.05) : vec3(0.96, 0.61, 0.28); // Warm Amber Silk
  float s = clamp(t, 0.0, 1.0) * 2.0;
  return s < 1.0 ? mix(c0, c1, s) : mix(c1, c2, s - 1.0);
}

void main() {
  vec2 p = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float pixel = 1.0 / max(uResolution.y, 1.0);
  vec2 pAspect = vec2(p.x * aspect, p.y);
  vec2 coreAspect = vec2(uCore.x * aspect, uCore.y);

  // ——— Fluid Silk Pointer Deflection (anchored strictly to 0 at Core and all 5 Socket waists) ———
  vec2 sAspect = pAspect;
  if (uPointer.z > 0.001) {
    vec2 ptrAspect = vec2(uPointer.x * aspect, uPointer.y);
    vec2 diff = pAspect - ptrAspect;
    float dPtrSq = dot(diff, diff);
    float reach = 0.028; // ~150px organic tactile influence radius
    float influence = exp(-dPtrSq / reach) * uPointer.z;

    // Pin optical waists so threads bow like silk between fixed jewelled anchors
    float pin = smoothstep(0.012, 0.075, length(pAspect - coreAspect));
    for (int i = 0; i < ${MAX_SOCKETS}; i++) {
      if (i >= uSocketCount) break;
      vec2 sockA = vec2(uSockets[i].x * aspect, uSockets[i].y);
      pin *= smoothstep(0.012, 0.055, length(pAspect - sockA));
    }

    // Gentle outward silk parting on hover; delicate tactile draw when pressed & held
    float pushSign = mix(-0.028, 0.022, uPointer.w);
    sAspect += diff * pushSign * influence * pin;
  }

  float isLight = uLight;
  vec3 darkAccum = vec3(0.0);
  float inkSum = 0.0;
  vec3 inkColorSum = vec3(0.0);

  vec3 dormantTint = isLight > 0.5 ? vec3(0.56, 0.54, 0.50) : vec3(0.58, 0.55, 0.49);
  vec3 specularTint = isLight > 0.5 ? vec3(0.95, 0.72, 0.18) : vec3(1.0, 0.96, 0.86);

  // Measure strongest hovered arm so non-hovered arms step back subtly (focus hierarchy)
  float maxArmFocus = 0.0;
  for (int i = 0; i < ${MAX_SOCKETS}; i++) {
    if (i >= uSocketCount) break;
    maxArmFocus = max(maxArmFocus, uSocketFocus[i]);
  }

  // ——— 1. Sweeping Basal Silk Wings (7 gossamer currents cradling the Singularity Core laterally) ———
  {
    vec2 relH = sAspect - coreAspect;
    float adx = abs(relH.x);
    float maxReach = aspect * 0.52;

    if (adx < maxReach + 0.05 && abs(relH.y) < 0.22) {
      // Smooth quintic lateral dissolution into deep obsidian / gallery paper
      float normX = clamp(adx / max(maxReach, 0.001), 0.0, 1.0);
      float xFade = 1.0 - smoothstep(0.32, 1.0, normX);
      xFade = xFade * xFade * smoothstep(0.0, 0.02, adx);

      // Graceful liquid-arch lateral sweep: rises softly from Core then glides gently outward
      float cradleCurve = 0.032 * sin(normX * PI * 0.85) - 0.018 * normX * normX;
      float cradleSlope = (0.032 * PI * 0.85 * cos(normX * PI * 0.85) - 0.036 * normX) / max(maxReach, 0.001);

      for (int k = 0; k < ${HORIZON_STRANDS}; k++) {
        float kf = float(k);
        float tier = (kf + 0.5) / float(${HORIZON_STRANDS});
        float strandIntro = uIntro.y > 0.5
          ? easeInOutCubic((uIntro.x - 0.20 - kf * 0.048) / 1.32)
          : 1.0;
        float sHead = maxReach * strandIntro;
        if (adx > sHead + 0.018) continue;

        float tipMask = 1.0 - smoothstep(sHead - 0.03, sHead + 0.008, adx);
        float amp = (0.24 + 0.82 * tier) * 0.072 * pow(normX, 0.92);
        float envSlope = (0.24 + 0.82 * tier) * 0.072 * 0.92 * pow(max(normX, 0.001), -0.08) / max(maxReach, 0.001);

        // Long, unhurried liquid wave frequency matching the sweeping silk canopy
        float freq = 4.6 + 0.42 * mod(kf, 3.0);
        float shimmer = sin(uClock * 0.52 + kf * 1.63) * 0.20;
        float ang = adx * freq - uPhase * (0.92 + 0.06 * kf) + kf * (TAU / float(${HORIZON_STRANDS})) + shimmer;
        float wave = sin(ang);

        float targetY = cradleCurve + amp * wave;
        float slope = cradleSlope + envSlope * wave + amp * cos(ang) * freq;
        float d = abs(relH.y - targetY) / sqrt(1.0 + slope * slope);

        float depth = 0.5 + 0.5 * cos(ang);
        float twist = smoothstep(0.0, 0.06, adx);
        float front = mix(1.0, 0.40 + 0.60 * depth, 0.55 * twist);
        float w = (isLight > 0.5 ? 0.98 : 0.86) * mix(1.08, 0.68, tier) * mix(1.0, 0.72 + 0.42 * depth, 0.45 * twist);

        float dp = d / max(pixel * w, 0.0001);
        float silkCore = exp(-dp * dp * 0.54);
        float sheath = 0.22 / (1.0 + dp * dp * 0.19);

        // Subtle ripple along horizon wings on canvas press
        float surgeBoost = 1.0;
        if (uCradleSurge.z > 0.5) {
          float wavePos = uCradleSurge.y * maxReach * 1.15;
          float dWave = adx - wavePos;
          float pulse = exp(-dWave * dWave / 0.0055) * sin(PI * clamp(uCradleSurge.y, 0.0, 1.0));
          surgeBoost += pulse * (0.38 + 2.5 * silkCore);
        }

        // Travelling quiet ambient shimmer
        float ambientPulse = pow(0.5 + 0.5 * sin(adx * 11.5 - uClock * 1.25 + kf * 1.35), 14.0);
        float quietDim = 1.0 - 0.24 * maxArmFocus;
        float tierAlpha = mix(1.0, 0.58, tier);
        float strength = (silkCore * 0.82 + sheath) * front * xFade * tipMask * quietDim * tierAlpha * (0.28 + 0.08 * uEnergy) * surgeBoost;
        strength *= 1.0 + 0.7 * ambientPulse * silkCore;

        vec3 tint = activePalette(tier * 0.88 + 0.08, isLight);
        tint = mix(tint, specularTint, 0.22 * silkCore);

        darkAccum += tint * strength;
        float inkVal = (silkCore * 0.76 + sheath * 0.34) * front * xFade * tipMask * quietDim * tierAlpha * (0.34 + 0.08 * uEnergy) * surgeBoost;
        inkColorSum += tint * inkVal;
        inkSum += inkVal;
      }
    }
  }

  // ——— 2. Five Sculpted Braided Orbital Arms (Core -> Socket Waist -> Expansive Silk Canopy Fan) ———
  for (int sIdx = 0; sIdx < ${MAX_SOCKETS}; sIdx++) {
    if (sIdx >= uSocketCount) break;

    vec2 sockAspect = vec2(uSockets[sIdx].x * aspect, uSockets[sIdx].y);
    vec2 axis = sockAspect - coreAspect;
    float segLen = max(length(axis), 0.001);
    vec2 dir = axis / segLen;
    vec2 perp = vec2(-dir.y, dir.x);

    vec2 rel = sAspect - coreAspect;
    float u = dot(rel, dir) / segLen; // 0 = Core, 1 = Node Socket waist, >1 = outer canopy
    float v = dot(rel, perp);

    float level = uSocketLevel[sIdx];
    float focus = uSocketFocus[sIdx];
    float liveMask = smoothstep(0.28, 0.88, level);
    float endU = mix(2.08, 2.46, liveMask);

    // Fast spatial rejection outside this arm's sweeping corridor
    if (u < -0.02 || u > endU + 0.06 || abs(v) > segLen * 0.82) continue;

    // Arm symmetry coordinate: -1.0 (far-left), -0.5, 0.0 (zenith), +0.5, +1.0 (far-right)
    float side = uSocketCount > 1
      ? (float(sIdx) / float(uSocketCount - 1) - 0.5) * 2.0
      : 0.0;

    // C1-smooth S-curved Laniakea spine: rises like a fountain plume (0..1),
    // lands dead-center on the Node Socket waist (u = 1.0), and sweeps gracefully outward across the sky
    float archAmp = side * segLen * 0.088;
    float spineV;
    float spineSlope;
    if (u <= 1.0) {
      float su = clamp(u, 0.0, 1.0);
      spineV = archAmp * sin(PI * su);
      spineSlope = archAmp * PI * cos(PI * su);
    } else {
      float du = u - 1.0;
      float decay = exp(-0.56 * du);
      spineV = archAmp * sin(PI * u) * decay;
      spineSlope = archAmp * decay * (PI * cos(PI * u) - 0.56 * sin(PI * u));
    }

    // Lush pinched silk envelope: 0 at Core (u=0), wide sweeping swell mid-arm so neighboring streams
    // feel like one unified canopy, razor pinch at Socket (u=1), and airy flowing ribbon fan beyond
    float env;
    float envSlope;
    if (u <= 1.0) {
      float su = clamp(u, 0.0, 1.0);
      env = segLen * 0.146 * sin(PI * su);
      envSlope = segLen * 0.146 * PI * cos(PI * su);
    } else {
      float du = u - 1.0;
      env = segLen * (0.142 * du + 0.072 * du * du);
      envSlope = segLen * (0.142 + 0.144 * du);
    }

    // Smooth entry from Core & gradual atmospheric dissolution into the upper sky (zero abrupt cut-off)
    float coreIn = smoothstep(-0.01, 0.04, u);
    float outerOut = 1.0 - smoothstep(1.02, endU, u);
    float armFade = coreIn * outerOut * outerOut;

    // Focus hierarchy: hovered arm steps forward while distant arms quiet gently
    float focusDim = mix(1.0, 0.72, maxArmFocus * (1.0 - focus));
    float armPresence = mix(0.28, 1.0, clamp(level, 0.0, 1.0)) * focusDim * (1.0 + 0.44 * focus);

    // Warm 24k gold vs refined dormant platinum-champagne palette blend
    float warmth = clamp(smoothstep(0.18, 0.76, level) + focus * 0.55, 0.0, 1.0);
    float armSurge = uSocketSurge[sIdx];
    float armDelay = abs(side) * 0.12;

    // 9 Nested Liquid-Silk Strands per Arm (inner core strands bright & poised, outer gossamer threads sweeping wide)
    for (int k = 0; k < ${STRANDS_PER_ARM}; k++) {
      float kf = float(k);
      float tier = (kf + 0.5) / float(${STRANDS_PER_ARM});

      // Choreographed intro unfurl from Core -> Socket -> Canopy with soft glowing lead bead
      float headU = endU + 0.1;
      float leadBead = 0.0;
      if (uIntro.y > 0.5) {
        float pIntro = clamp((uIntro.x - 0.08 - armDelay - kf * 0.042) / 1.32, 0.0, 1.0);
        if (pIntro <= 0.001) continue;
        headU = endU * easeInOutCubic(pIntro);
        if (u > headU + 0.04) continue;
        leadBead = sin(PI * pIntro);
      }
      float introClip = 1.0 - smoothstep(headU - 0.055, headU + 0.015, u);

      // Voluptuous, long-wavelength sinusoidal glide (silky ribbon flow instead of tight rope twist)
      float amp = 0.22 + 1.04 * tier;
      float freq = 3.55 + 0.28 * mod(kf, 3.0);
      float shimmer = sin(uClock * 0.58 + kf * 1.41 + float(sIdx) * 1.85) * 0.22;
      float phaseAngle = u * freq - uPhase * (1.05 + 0.06 * kf) + kf * (TAU / float(${STRANDS_PER_ARM})) + float(sIdx) * 1.18 + shimmer;
      float wave = sin(phaseAngle);

      float targetV = spineV + env * amp * wave;
      float dvdu = spineSlope + envSlope * amp * wave + env * amp * cos(phaseAngle) * freq;
      float slope = dvdu / segLen;
      float d = abs(v - targetV) / sqrt(1.0 + slope * slope);

      // Subtle 3D braid twist depth (front strands crisp & luminous, rear strands softly receding)
      float twistMask = smoothstep(0.0, 0.14, u) * smoothstep(0.0, 0.085, abs(u - 1.0));
      float zDepth = 0.5 + 0.5 * cos(phaseAngle);
      float front = mix(1.0, 0.36 + 0.64 * zDepth, 0.58 * twistMask);

      // Taper stroke width & opacity delicately from luminous inner filaments to gossamer outer silk hairs
      float tierFalloff = mix(1.08, 0.56, tier);
      float baseW = isLight > 0.5 ? 1.12 : 1.0;
      float w = baseW * mix(1.12, 0.68, tier) * mix(1.0, 0.70 + 0.45 * zDepth, 0.46 * twistMask) * (1.0 + 0.22 * focus);

      // Pixel-normalized fiber-optic profile (razor-sharp silk core + tight warm satin sheath)
      float dp = d / max(pixel * w, 0.0001);
      float silkCore = exp(-dp * dp * 0.52);
      float innerSheath = 0.24 / (1.0 + dp * dp * 0.18);
      float outerAura = 0.032 / (1.0 + dp * dp * 0.016);

      float g = (silkCore * 0.88 + innerSheath + outerAura * (0.25 + 0.75 * warmth)) * front * tierFalloff * armFade * introClip * armPresence;

      // Soft luminous lead bead during opening unfurl
      if (leadBead > 0.001) {
        float duHead = (u - headU) * segLen;
        float beadGlow = exp(-(duHead * duHead + d * d) / 0.00016) * leadBead * 1.05;
        g += beadGlow * armPresence * tierFalloff;
      }

      // Serene rhythmic travelling pulses gliding from Core -> Socket -> Canopy along active arms
      float pulseFreq = 6.4;
      float pulseSpeed = 1.38 + uEnergy * 1.65;
      float pulse = pow(0.5 + 0.5 * sin(u * pulseFreq - uClock * pulseSpeed + kf * 1.15 + float(sIdx) * 0.9), 16.0);
      g *= 1.0 + (0.28 + 1.95 * warmth) * (0.55 + 0.65 * uEnergy) * pulse * silkCore;

      // Dedicated luminous comet surge on click, snap, or inter-node signal transfer
      if (armSurge > 0.001 && armSurge < 0.999) {
        float cometU = armSurge * (endU * 0.92);
        float deltaU = u - cometU;
        float comet = deltaU < 0.0
          ? exp(deltaU / 0.24)
          : exp(-deltaU * deltaU / 0.007);
        comet *= sin(PI * armSurge);
        g *= 1.0 + comet * (0.45 + 3.2 * silkCore);
      }

      vec3 strandGold = activePalette(tier * 0.92 + 0.04, isLight);
      vec3 tint = mix(dormantTint, strandGold, warmth);
      tint = mix(tint, specularTint, (0.28 * warmth + 0.22 * focus) * silkCore);

      darkAccum += tint * g;

      // Crisp sculptural gold ink accumulation for Gallery Light (#ffffff)
      float inkStrength = (silkCore * 0.84 + innerSheath * 0.40) * front * tierFalloff * armFade * introClip * armPresence;
      if (armSurge > 0.001 && armSurge < 0.999) {
        float cometU = armSurge * (endU * 0.92);
        float deltaU = u - cometU;
        float comet = (deltaU < 0.0 ? exp(deltaU / 0.24) : exp(-deltaU * deltaU / 0.007)) * sin(PI * armSurge);
        inkStrength *= 1.0 + comet * 1.6 * silkCore;
      }
      inkColorSum += tint * inkStrength;
      inkSum += inkStrength;
    }

    // Refined optical jewel shimmer seated right at the Node Socket waist (u = 1)
    float introNode = uIntro.y > 0.5 ? easeOutCubic((uIntro.x - 0.46 - armDelay) / 0.45) : 1.0;
    float dSock = length(pAspect - sockAspect);
    float sockHalo = exp(-dSock * dSock / 0.00032) * (0.30 + 0.48 * warmth + 0.36 * focus) * introNode * focusDim;
    vec3 sockColor = mix(dormantTint, activePalette(0.45, isLight), warmth);
    darkAccum += sockColor * sockHalo;
    inkColorSum += sockColor * sockHalo * 0.45;
    inkSum += sockHalo * 0.45;
  }

  // ——— 3. Compact Sculpted Singularity Core Jewel (warm atmospheric cradle, zero murky pillar or whiteout) ———
  {
    float coreIntro = uIntro.y > 0.5 ? easeOutCubic(uIntro.x / 0.48) : 1.0;
    float rCore = length(pAspect - coreAspect);
    float breathe = 1.0 + 0.055 * sin(uClock * 1.12) + 0.16 * uEnergy + 0.22 * uIntro.z;

    if (isLight < 0.5) {
      float nucleus = exp(-rCore * rCore / (0.000048 * breathe)) * 2.1;
      float iris = exp(-rCore * rCore / (0.00062 * breathe)) * 0.72;
      float veil = exp(-rCore * rCore / (0.019 * breathe)) * (0.16 + 0.07 * uEnergy);

      darkAccum += vec3(1.0, 0.97, 0.90) * nucleus * coreIntro;
      darkAccum += vec3(0.96, 0.75, 0.24) * iris * coreIntro;
      darkAccum += vec3(0.88, 0.60, 0.14) * veil * coreIntro;
    } else {
      float nucleus = exp(-rCore * rCore / (0.000050 * breathe)) * 0.95;
      float iris = exp(-rCore * rCore / (0.00072 * breathe)) * 0.38;
      float veil = exp(-rCore * rCore / (0.020 * breathe)) * 0.11;
      vec3 sunGold = vec3(0.84, 0.58, 0.08);
      vec3 brightGold = vec3(0.96, 0.76, 0.22);
      inkColorSum += brightGold * (nucleus + iris) * coreIntro + sunGold * veil * coreIntro;
      inkSum += (nucleus * 0.85 + iris * 0.52 + veil * 0.32) * coreIntro;
    }
  }

  // Subtle anti-banding micro-grain
  float grain = (hash(gl_FragCoord.xy + fract(uClock) * 89.0) - 0.5) * (isLight > 0.5 ? 0.008 : 0.016);

  if (isLight < 0.5) {
    // Perceptual exponential filmic tone-mapping: preserves rich 24k gold saturation on every strand
    // and keeps individual braided filaments crisp & unmistakable even where strands converge
    vec3 mapped = 1.0 - exp(-darkAccum * 0.92);
    mapped = max(mapped * (1.0 + grain), 0.0);
    float alpha = clamp(max(mapped.r, max(mapped.g, mapped.b)) * 1.12, 0.0, 1.0);
    outColor = vec4(mapped, alpha);
  } else {
    vec3 hue = inkSum > 0.0001 ? inkColorSum / inkSum : vec3(0.78, 0.52, 0.06);
    float cover = clamp((1.0 - exp(-inkSum * 1.05)) * (1.0 + grain), 0.0, 0.94);
    outColor = vec4(hue * cover, cover);
  }
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

export interface NeuralThreadsWebGLProps {
  theme: "dark" | "light";
  /** Core center in WebGL UV coordinates (0..1, Y bottom-up). */
  coreUV: Vec;
  /** Up to 5 socket positions in WebGL UV coordinates (0..1, Y bottom-up). */
  socketsUV: Vec[];
  /** Target intensity for each socket (locked ~0.22, open ~0.48, live ~1.0). */
  socketTargets: number[];
  /** Currently hovered or active socket index from DOM reticles (-1 if none). */
  activeOrHoveredSocket: number;
  /** Brain activity energy (0..1). */
  energy: number;
  /** Trigger surge along specific socket arm(s). */
  armPulse: { indices: number[]; serial: number } | null;
  /** Notify parent when the user presses directly on the neural lines. */
  onLinePress?: () => void;
  paused?: boolean;
  skipIntro?: boolean;
}

type EngineSettings = {
  lightMode: boolean;
  coreUV: Vec;
  socketsUV: Vec[];
  socketTargets: number[];
  activeOrHoveredSocket: number;
  energy: number;
  speed: number;
  intro: boolean;
  paused: boolean;
};

function buildSettings(props: NeuralThreadsWebGLProps): EngineSettings {
  const e = clamp(props.energy, 0, 1);
  return {
    lightMode: props.theme === "light",
    coreUV: props.coreUV,
    socketsUV: props.socketsUV,
    socketTargets: props.socketTargets,
    activeOrHoveredSocket: props.activeOrHoveredSocket,
    energy: e,
    speed: 0.14 + e * 0.18,
    intro: !props.skipIntro,
    paused: Boolean(props.paused),
  };
}

/**
 * Bespoke WebGL2 Singularity Canopy engine recreated from <WebThreads /> inspiration
 * to fit Nexus's 5-node orbital architecture and Obsidian / Gallery Light design system.
 */
export function NeuralThreadsWebGL(props: NeuralThreadsWebGLProps) {
  const { armPulse, onLinePress } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const normalized = buildSettings(props);
  const settingsRef = useRef<EngineSettings>(normalized);
  const onLinePressRef = useRef(onLinePress);
  const armSurgeTriggerRef = useRef<((indices: number[]) => void) | null>(null);
  const lastPulseSerialRef = useRef<number>(armPulse?.serial ?? -1);

  useEffect(() => {
    settingsRef.current = normalized;
    onLinePressRef.current = onLinePress;
  });

  useEffect(() => {
    if (armPulse && armPulse.serial !== lastPulseSerialRef.current) {
      lastPulseSerialRef.current = armPulse.serial;
      armSurgeTriggerRef.current?.(armPulse.indices);
    }
  }, [armPulse]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full cursor-crosshair";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      canvas.remove();
      return undefined;
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      canvas.remove();
      return undefined;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      canvas.remove();
      return undefined;
    }

    const uniformNames = [
      "uResolution",
      "uPhase",
      "uClock",
      "uEnergy",
      "uCore",
      "uSockets",
      "uSocketLevel",
      "uSocketFocus",
      "uSocketSurge",
      "uSocketCount",
      "uLight",
      "uIntro",
      "uPointer",
      "uCradleSurge",
    ] as const;
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      u[name] = gl.getUniformLocation(program, name);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const socketPosData = new Float32Array(MAX_SOCKETS * 2);
    const socketLevelData = new Float32Array(MAX_SOCKETS);
    const socketFocusData = new Float32Array(MAX_SOCKETS);
    const socketSurgeData = new Float32Array(MAX_SOCKETS);
    const socketSurgeAges = Array<number>(MAX_SOCKETS).fill(-1);

    const state = {
      width: 1,
      height: 1,
      phase: 0,
      clock: 0,
      last: 0,
      raf: 0,
      visible: true,
      introAt: -1,
      corePulse: 0,
      pointer: [0.5, 0.5] as [number, number],
      smoothPointer: [0.5, 0.5] as [number, number],
      inside: false,
      held: false,
      holdStrength: 0,
      presence: 0,
      cradleSurgeAge: -1,
      cradleSurgeX: 0.5,
      quiet: 0,
      seenTheme: null as boolean | null,
    };

    const reduceMotion = () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(container.clientWidth * ratio));
      const height = Math.max(1, Math.round(container.clientHeight * ratio));
      if (width === state.width && height === state.height) return;
      state.width = width;
      state.height = height;
      canvas.width = width;
      canvas.height = height;
    };

    /** Finds the arm closest to a pointer position in aspect-corrected UV coordinates. */
    const nearestArmIndex = (s: EngineSettings, uvX: number, uvY: number, maxPerpDist: number): number => {
      const aspect = state.width / Math.max(state.height, 1);
      const px = uvX * aspect;
      const py = uvY;
      const cx = s.coreUV.x * aspect;
      const cy = s.coreUV.y;
      let bestIdx = -1;
      let bestDist = maxPerpDist;

      for (let i = 0; i < Math.min(s.socketsUV.length, MAX_SOCKETS); i++) {
        const pt = s.socketsUV[i]!;
        const ax = pt.x * aspect - cx;
        const ay = pt.y - cy;
        const segLen = Math.hypot(ax, ay);
        if (segLen < 0.001) continue;
        const dx = ax / segLen;
        const dy = ay / segLen;
        const rx = px - cx;
        const ry = py - cy;
        const projU = (rx * dx + ry * dy) / segLen;
        if (projU < 0.04 || projU > 1.85) continue;
        const perpDist = Math.abs(-rx * dy + ry * dx);
        if (perpDist < bestDist) {
          bestDist = perpDist;
          bestIdx = i;
        }
      }
      return bestIdx;
    };

    const render = (reduced: boolean) => {
      const s = settingsRef.current;
      const introClock = state.introAt < 0 ? 0 : state.clock - state.introAt;
      const introRunning = s.intro && !reduced && introClock < INTRO_DURATION;

      gl.viewport(0, 0, state.width, state.height);
      gl.uniform2f(u.uResolution, state.width, state.height);
      gl.uniform1f(u.uPhase, state.phase);
      gl.uniform1f(u.uClock, reduced ? 0 : state.clock);
      gl.uniform1f(u.uEnergy, s.energy);
      gl.uniform2f(u.uCore, s.coreUV.x, s.coreUV.y);

      const sCount = Math.min(s.socketsUV.length, MAX_SOCKETS);
      socketPosData.fill(0);
      for (let i = 0; i < sCount; i++) {
        const pt = s.socketsUV[i]!;
        socketPosData[i * 2] = pt.x;
        socketPosData[i * 2 + 1] = pt.y;
      }
      gl.uniform2fv(u.uSockets, socketPosData);
      gl.uniform1fv(u.uSocketLevel, socketLevelData);
      gl.uniform1fv(u.uSocketFocus, socketFocusData);
      gl.uniform1fv(u.uSocketSurge, socketSurgeData);
      gl.uniform1i(u.uSocketCount, sCount);

      gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
      gl.uniform3f(u.uIntro, introClock, introRunning ? 1 : 0, state.corePulse);
      gl.uniform4f(
        u.uPointer,
        state.smoothPointer[0],
        1 - state.smoothPointer[1],
        reduced ? 0 : state.presence,
        state.holdStrength,
      );
      gl.uniform3f(
        u.uCradleSurge,
        state.cradleSurgeX,
        state.cradleSurgeAge >= 0 ? state.cradleSurgeAge : 0,
        state.cradleSurgeAge >= 0 ? 1 : 0,
      );

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now: number) => {
      state.raf = requestAnimationFrame(tick);
      const s = settingsRef.current;
      if (!state.visible || document.hidden || s.paused) {
        state.last = now;
        return;
      }

      const dt = state.last ? Math.min((now - state.last) / 1000, 0.08) : 1 / 60;
      state.last = now;
      const reduced = reduceMotion();

      state.clock += dt;
      if (state.introAt < 0) state.introAt = state.clock;
      if (!reduced) state.phase += dt * s.speed;

      // Smooth pointer tracking & silk hold tension
      const ptrFollow = 1 - Math.exp(-dt * 8.5);
      state.smoothPointer[0] += (state.pointer[0] - state.smoothPointer[0]) * ptrFollow;
      state.smoothPointer[1] += (state.pointer[1] - state.smoothPointer[1]) * ptrFollow;
      state.presence += ((state.inside ? 1 : 0) - state.presence) * (1 - Math.exp(-dt * 4.2));
      state.holdStrength +=
        ((state.held && state.inside ? 1 : 0) - state.holdStrength) * (1 - Math.exp(-dt * 7.5));
      state.corePulse *= Math.exp(-dt * 3.4);

      if (state.cradleSurgeAge >= 0) {
        state.cradleSurgeAge += dt / 1.15;
        if (state.cradleSurgeAge >= 1) state.cradleSurgeAge = -1;
      }

      // Resolve hovered/active arm from either DOM reticle hover or direct pointer proximity to an arm
      let focusedArm = s.activeOrHoveredSocket;
      if (focusedArm < 0 && state.inside && !reduced) {
        focusedArm = nearestArmIndex(s, state.pointer[0], 1 - state.pointer[1], 0.115);
      }

      const levelLerp = 1 - Math.exp(-dt * 5.0);
      const focusLerp = 1 - Math.exp(-dt * 6.5);
      let armActive = false;

      for (let i = 0; i < MAX_SOCKETS; i++) {
        const goalLevel = s.socketTargets[i] ?? 0;
        if (Math.abs(goalLevel - socketLevelData[i]!) > 0.002) armActive = true;
        socketLevelData[i] += (goalLevel - socketLevelData[i]!) * (reduced ? 1 : levelLerp);

        const goalFocus = i === focusedArm ? 1 : 0;
        if (Math.abs(goalFocus - socketFocusData[i]!) > 0.002) armActive = true;
        socketFocusData[i] += (goalFocus - socketFocusData[i]!) * (reduced ? 1 : focusLerp);

        if (socketSurgeAges[i]! >= 0) {
          armActive = true;
          socketSurgeAges[i]! += dt / 1.2;
          if (socketSurgeAges[i]! >= 1) {
            socketSurgeAges[i] = -1;
            socketSurgeData[i] = 0;
          } else {
            socketSurgeData[i] = socketSurgeAges[i]!;
          }
        }
      }

      if (reduced && !armActive && state.seenTheme === s.lightMode) {
        state.quiet += 1;
        if (state.quiet > 3) return;
      } else {
        state.quiet = 0;
      }
      state.seenTheme = s.lightMode;

      resize();
      render(reduced);
    };

    armSurgeTriggerRef.current = (indices: number[]) => {
      if (reduceMotion()) return;
      for (const idx of indices) {
        if (idx >= 0 && idx < MAX_SOCKETS) {
          socketSurgeAges[idx] = 0;
        }
      }
      state.corePulse = 1;
      state.cradleSurgeAge = 0;
      state.cradleSurgeX = settingsRef.current.coreUV.x;
    };

    const localPoint = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
        y: (event.clientY - rect.top) / Math.max(rect.height, 1),
        inside:
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      };
    };

    const onMove = (event: PointerEvent) => {
      const pt = localPoint(event);
      state.inside = pt.inside;
      if (pt.inside) state.pointer = [pt.x, pt.y];
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || reduceMotion()) return;
      if (
        event.target instanceof Element &&
        event.target.closest('a, button, input, textarea, select, label, [role="button"]')
      ) {
        return;
      }
      const pt = localPoint(event);
      if (!pt.inside) return;

      state.held = true;
      state.pointer = [pt.x, pt.y];
      state.corePulse = 1;
      state.cradleSurgeAge = 0;
      state.cradleSurgeX = pt.x;

      const s = settingsRef.current;
      const hitArm = nearestArmIndex(s, pt.x, 1 - pt.y, 0.28);
      if (hitArm >= 0) {
        socketSurgeAges[hitArm] = 0;
      } else {
        // Gentle ripple through active arms when pressing near the Singularity Core
        for (let i = 0; i < Math.min(s.socketsUV.length, MAX_SOCKETS); i++) {
          if ((s.socketTargets[i] ?? 0) >= 0.45) {
            socketSurgeAges[i] = 0;
          }
        }
      }

      onLinePressRef.current?.();
    };

    const onUp = () => {
      state.held = false;
    };

    const onLeave = () => {
      state.inside = false;
      state.held = false;
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(
      (entries) => {
        state.visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 },
    );
    intersection.observe(container);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("webglcontextlost", onContextLost);

    resize();
    render(reduceMotion());
    state.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(state.raf);
      armSurgeTriggerRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      if (!gl.isContextLost()) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" />;
}
