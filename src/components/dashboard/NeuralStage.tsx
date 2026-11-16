"use client";

import { memo, useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  clamp,
  fitCanvas,
  lerp,
  observeCanvasActivity,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";
import {
  computeStageLayout,
  type ArmGeometry,
  type HorizonWingGeometry,
  type StageLayout,
} from "./stage-layout";

export type SocketVisual = "occupied" | "open" | "locked";

export type StageTransfer = {
  fromSocket: number;
  toSocket: number;
  label: string;
  serial: number;
};

export type StageSignal = {
  brain: NexusBrainState;
  sockets: SocketVisual[];
  theme?: "dark" | "light";
  socketLabels?: Array<{ monogram: string; name: string; status: string }>;
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
  /** Explicit node call / transfer trigger. */
  transfer?: StageTransfer | null;
  /** Currently opened or called socket index (0..4), if any. */
  activeSocket?: number | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
  /** Skip opening silence and continue the singularity explosion straight into node expansion. */
  fromSetupExplosion?: boolean;
};

/* ============================================================================
   MATHEMATICAL CONSTANTS & SPECTRAL PALETTE
   ============================================================================ */

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
/** Phase I (0..1.6s): "Waking up Nexus…" on pure black before the neural network pops to life. */
const WAKE_SILENCE_SECONDS = 1.6;
const INTRO_SPRING_SECONDS = 2.4;
const SOCKET_U = 0.33; // Parametric position of the node socket waist along each arm (0 = core, 1 = beyond screen corner)
const SPINE_SAMPLES = 48;
const FILAMENTS_PER_ARM = 50;
const HORIZON_STRANDS = 72;
const CURVE_STEPS = 20;
const SAMPLE_US = Array.from({ length: CURVE_STEPS + 1 }, (_, k) => k / CURVE_STEPS);
const GRAD_STOPS = [0, 0.16, 0.34, 0.5, 0.64, 0.76, 0.88, 1.0] as const;

const GOLD_CORE: Rgb = [255, 250, 232];
const GOLD_BRIGHT: Rgb = [255, 224, 156];
const GOLD_MID: Rgb = [246, 182, 74];
const GOLD_DEEP: Rgb = [212, 128, 34];
const DORMANT_BRONZE: Rgb = [118, 84, 38];

const GOLD_LIGHT_SPECULAR: Rgb = [142, 78, 4];
const GOLD_LIGHT_BRIGHT: Rgb = [184, 112, 10];
const GOLD_LIGHT_MID: Rgb = [212, 144, 22];
const GOLD_LIGHT_DEEP: Rgb = [232, 174, 52];
const DORMANT_LIGHT_PLATINUM: Rgb = [158, 150, 138];

const CRIMSON_HOT: Rgb = [255, 104, 82];
const CRIMSON_PURE: Rgb = [252, 48, 44];
const CRIMSON_DEEP: Rgb = [196, 20, 30];

const CRIMSON_LIGHT_HOT: Rgb = [228, 68, 36];
const CRIMSON_LIGHT_PURE: Rgb = [204, 22, 28];
const CRIMSON_LIGHT_DEEP: Rgb = [154, 12, 20];

const SOCKET_TARGET_LEVEL: Record<SocketVisual, number> = {
  occupied: 1.0,
  open: 0.14,
  locked: 0.08,
};

const BRAIN_TARGET_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.16,
  thinking: 1.0,
  responding: 0.76,
};

const DEPTH_LAYERS = [
  { width: 2.8, alpha: 0.085, hot: 0.0 },
  { width: 1.25, alpha: 0.21, hot: 0.35 },
  { width: 0.72, alpha: 0.36, hot: 0.7 },
  { width: 0.44, alpha: 0.58, hot: 1.0 },
] as const;

const mixRgb = (a: Rgb, b: Rgb, t: number): string => {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
};

const mixRgbTuple = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(a[0], b[0], k)),
    Math.round(lerp(a[1], b[1], k)),
    Math.round(lerp(a[2], b[2], k)),
  ];
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ============================================================================
   PARAMETRIC FIELD STRUCTURES
   ============================================================================ */

type SpineFrame = {
  pts: Vec[];
  normals: Vec[];
  socketPt: Vec;
  tipPt: Vec;
};

type HorizonCurvePoints = [Vec, Vec, Vec, Vec, Vec, Vec, Vec];

type PointerField = {
  pos: Vec;
  vel: Vec;
  parallax: Vec;
  presence: number;
};

type ArmFilament = {
  arm: number;
  layer: number;
  xi: number;
  crossover: number;
  flareSpread: number;
  phase: number;
  freqMul: number;
  stagger: number;
};

type HorizonFilament = {
  layer: number;
  chirality: -1 | 1;
  waistOffset: number;
  leftAngle: number;
  rightAngle: number;
  leftReach: number;
  rightReach: number;
  curvature: number;
  phase: number;
  stagger: number;
};

type SynapticBridge = {
  fromArm: number;
  toArm: number;
  archLift: number;
  phase: number;
};

type FlowPhoton = {
  arm: number;
  filamentIdx: number;
  u: number;
  speed: number;
  size: number;
};

type HorizonPhoton = {
  strandIdx: number;
  u: number;
  speed: number;
  size: number;
};

type SolitonWave = {
  arm: number;
  u: number;
  speed: number;
  direction: 1 | -1;
  intensity: number;
};

type CoreRipple = {
  u: number;
  crimson: boolean;
  strength: number;
};

/* ============================================================================
   PROCEDURAL FIELD GENERATOR
   ============================================================================ */

function createNeuralField(armCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261116);

  const pickLayer = (i: number): number => {
    const r = (i * 0.61803398875 + rnd() * 0.22) % 1;
    if (r < 0.14) return 0;
    if (r < 0.44) return 1;
    if (r < 0.78) return 2;
    return 3;
  };

  const armFilaments: ArmFilament[] = [];
  const armLayerBatches: number[][][] = Array.from({ length: armCount }, () =>
    DEPTH_LAYERS.map(() => [] as number[]),
  );

  for (let arm = 0; arm < armCount; arm++) {
    for (let i = 0; i < FILAMENTS_PER_ARM; i++) {
      const stratified = ((i + 0.5) / FILAMENTS_PER_ARM) * 2 - 1;
      const isOuterSheath = i % 4 === 0;
      const xi = clamp(
        stratified * (isOuterSheath ? 1.32 : 0.94) + gauss() * 0.08,
        -1.45,
        1.45,
      );
      const layer = pickLayer(i);
      const idx = armFilaments.length;
      armFilaments.push({
        arm,
        layer,
        xi,
        crossover: i % 3 === 0 ? -0.86 : i % 3 === 1 ? 0.72 : -0.42,
        flareSpread: (0.88 + 0.68 * Math.abs(xi)) * between(0.9, 1.18),
        phase: arm * 1.25 + xi * 1.35 + gauss() * 0.2,
        freqMul: between(0.94, 1.08),
        stagger: clamp(Math.abs(xi) * 0.26 + rnd() * 0.14, 0, 0.52),
      });
      armLayerBatches[arm]![layer]!.push(idx);
    }
  }

  const horizonFilaments: HorizonFilament[] = [];
  const horizonLayerBatches: number[][] = DEPTH_LAYERS.map(() => [] as number[]);

  for (let i = 0; i < HORIZON_STRANDS; i++) {
    const layer = pickLayer(i);
    const chirality: -1 | 1 = i % 2 === 0 ? 1 : -1;
    const stratified = ((i + 0.5) / HORIZON_STRANDS) * 2 - 1;
    const leftLift = stratified * 0.64 + gauss() * 0.06;
    const rightLift = stratified * 0.64 + gauss() * 0.06;
    const idx = horizonFilaments.length;
    horizonFilaments.push({
      layer,
      chirality,
      waistOffset: stratified * 0.028,
      leftAngle: Math.PI + leftLift * chirality,
      rightAngle: rightLift * chirality,
      leftReach: between(1.02, 1.48),
      rightReach: between(1.02, 1.48),
      curvature: stratified * 0.24,
      phase: stratified * 1.35 + rnd() * 0.4,
      stagger: clamp(Math.abs(stratified) * 0.34 + 0.06, 0.04, 0.56),
    });
    horizonLayerBatches[layer]!.push(idx);
  }

  const bridges: SynapticBridge[] = [];
  for (let a = 0; a < armCount - 1; a++) {
    for (let k = 0; k < 7; k++) {
      bridges.push({
        fromArm: a,
        toArm: a + 1,
        archLift: between(-0.14, 0.08) + (k - 3) * 0.032,
        phase: k * 0.65 + a,
      });
    }
  }

  const armPhotons: FlowPhoton[] = Array.from({ length: 220 }, (_, i) => {
    const filamentIdx = i % armFilaments.length;
    const f = armFilaments[filamentIdx]!;
    return {
      arm: f.arm,
      filamentIdx,
      u: rnd(),
      speed: between(0.055, 0.13),
      size: between(0.7, 1.65),
    };
  });

  const horizonPhotons: HorizonPhoton[] = Array.from({ length: 80 }, () => ({
    strandIdx: Math.floor(rnd() * horizonFilaments.length),
    u: rnd(),
    speed: between(0.038, 0.085),
    size: between(0.6, 1.4),
  }));

  return {
    armFilaments,
    armLayerBatches,
    horizonFilaments,
    horizonLayerBatches,
    bridges,
    armPhotons,
    horizonPhotons,
  };
}

/* ============================================================================
   ZERO-ALLOCATION DIFFERENTIAL GEOMETRY & PRE-BAKED CORE SPRITE
   ============================================================================ */

function singularityUnfurl(intro: number, stagger: number): number {
  const u = clamp((intro - stagger * 0.22) / (1 - stagger * 0.22), 0, 1);
  if (u <= 0) return 0.001;
  const zeta = 0.8;
  const omegaN = 3.9;
  const omegaD = omegaN * Math.sqrt(1 - zeta * zeta);
  const tau = u * 1.9;
  const decay = Math.exp(-zeta * omegaN * tau);
  const spring =
    1 -
    decay *
      (Math.cos(omegaD * tau) +
        (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * tau));
  const quintic = u * u * u * (u * (u * 6 - 15) + 10);
  return clamp(lerp(quintic, spring, 0.65), 0.001, 1.03);
}

function createEmptySpines(count: number): SpineFrame[] {
  return Array.from({ length: count }, () => ({
    pts: Array.from({ length: SPINE_SAMPLES }, () => ({ x: 0, y: 0 })),
    normals: Array.from({ length: SPINE_SAMPLES }, () => ({ x: 0, y: -1 })),
    socketPt: { x: 0, y: 0 },
    tipPt: { x: 0, y: 0 },
  }));
}

function updateArmSpine(
  out: SpineFrame,
  arm: ArmGeometry,
  L: StageLayout,
  time: number,
  intro: number,
  pointer: PointerField,
) {
  const { core, radius: R } = L;
  const unfurlInner = singularityUnfurl(intro, 0.04);
  const unfurlOuter = singularityUnfurl(intro, 0.18);

  const slowWave = Math.sin(time * 0.28 + arm.index * 1.45);
  const deepWave = Math.cos(time * 0.18 + arm.index * 2.1);

  const perpAngle = arm.coreAngle + Math.PI * 0.5;
  const swayMag = R * 0.014 * slowWave;
  const socketSwayX = Math.cos(perpAngle) * swayMag;
  const socketSwayY = Math.sin(perpAngle) * swayMag;

  let localPullX = 0;
  let localPullY = 0;
  if (pointer.presence > 0.005) {
    const dx = arm.socket.x - pointer.pos.x;
    const dy = arm.socket.y - pointer.pos.y;
    const distSq = dx * dx + dy * dy;
    const sigma = R * 0.56;
    const k = pointer.presence * Math.exp(-distSq / (2 * sigma * sigma));
    const dist = Math.sqrt(distSq) + 48;
    localPullX = pointer.vel.x * 0.035 * k - (dx / dist) * R * 0.008 * k;
    localPullY = pointer.vel.y * 0.035 * k - (dy / dist) * R * 0.008 * k;
  }

  const rawSockX = arm.socket.x + socketSwayX + pointer.parallax.x * 0.08 + localPullX;
  const rawSockY = arm.socket.y + socketSwayY + pointer.parallax.y * 0.08 + localPullY;

  const sockX = lerp(core.x, rawSockX, unfurlInner);
  const sockY = lerp(core.y, rawSockY, unfurlInner);
  out.socketPt.x = sockX;
  out.socketPt.y = sockY;

  const tangentAngle =
    Math.atan2(arm.socketTangent.y, arm.socketTangent.x) + 0.018 * deepWave;
  const tsX = Math.cos(tangentAngle);
  const tsY = Math.sin(tangentAngle);

  const innerDist = Math.hypot(sockX - core.x, sockY - core.y);
  const c1a = arm.coreAngle + 0.025 * slowWave;
  const c1x = core.x + Math.cos(c1a) * innerDist * 0.46;
  const c1y = core.y + Math.sin(c1a) * innerDist * 0.46;
  const c2x = sockX - tsX * innerDist * 0.38;
  const c2y = sockY - tsY * innerDist * 0.38;

  const tipPerp = arm.cornerAngle + Math.PI * 0.5;
  const tipOff = R * 0.075 * deepWave;
  const rawTipX = arm.cornerTip.x + Math.cos(tipPerp) * tipOff;
  const rawTipY = arm.cornerTip.y + Math.sin(tipPerp) * tipOff;
  const tipX = lerp(sockX, rawTipX, unfurlOuter);
  const tipY = lerp(sockY, rawTipY, unfurlOuter);
  out.tipPt.x = tipX;
  out.tipPt.y = tipY;

  const outerDist = Math.hypot(tipX - sockX, tipY - sockY);
  const d1x = sockX + tsX * outerDist * 0.32;
  const d1y = sockY + tsY * outerDist * 0.32;
  const d2a = lerp(tangentAngle, arm.cornerAngle, 0.65) - 0.03 * slowWave;
  const d2x = sockX + Math.cos(d2a) * outerDist * 0.68;
  const d2y = sockY + Math.sin(d2a) * outerDist * 0.68;

  const socketIdx = Math.round((SPINE_SAMPLES - 1) * SOCKET_U);
  const pts = out.pts;

  for (let i = 0; i <= socketIdx; i++) {
    const t = i / socketIdx;
    const m = 1 - t;
    const a = m * m * m;
    const b = 3 * m * m * t;
    const c = 3 * m * t * t;
    const d = t * t * t;
    pts[i]!.x = a * core.x + b * c1x + c * c2x + d * sockX;
    pts[i]!.y = a * core.y + b * c1y + c * c2y + d * sockY;
  }

  const outerCount = SPINE_SAMPLES - 1 - socketIdx;
  for (let i = 1; i <= outerCount; i++) {
    const t = i / outerCount;
    const m = 1 - t;
    const a = m * m * m;
    const b = 3 * m * m * t;
    const c = 3 * m * t * t;
    const d = t * t * t;
    pts[socketIdx + i]!.x = a * sockX + b * d1x + c * d2x + d * tipX;
    pts[socketIdx + i]!.y = a * sockY + b * d1y + c * d2y + d * tipY;
  }

  const normals = out.normals;
  for (let i = 0; i < SPINE_SAMPLES; i++) {
    const prev = pts[i > 0 ? i - 1 : 0]!;
    const next = pts[i < SPINE_SAMPLES - 1 ? i + 1 : SPINE_SAMPLES - 1]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    normals[i]!.x = -dy / len;
    normals[i]!.y = dx / len;
  }
}

function writeArmFilamentPoint(
  f: ArmFilament,
  spine: SpineFrame,
  u: number,
  R: number,
  armPhase: number,
  armLevel: number,
  callHeat: number,
  solitonBoost: number,
  hasPointer: boolean,
  pointerX: number,
  pointerY: number,
  pointerPresence: number,
  pointerVelX: number,
  pointerVelY: number,
  invTwoSigmaSq: number,
  maxDistSq: number,
  outXs: Float64Array,
  outYs: Float64Array,
  outIdx: number,
) {
  const idxFloat = clamp(u, 0, 1) * (SPINE_SAMPLES - 1);
  const i0 = Math.min(SPINE_SAMPLES - 2, Math.floor(idxFloat));
  const frac = idxFloat - i0;

  const p0 = spine.pts[i0]!;
  const p1 = spine.pts[i0 + 1]!;
  const n0 = spine.normals[i0]!;
  const n1 = spine.normals[i0 + 1]!;

  const cx = p0.x + (p1.x - p0.x) * frac;
  const cy = p0.y + (p1.y - p0.y) * frac;
  const nx = n0.x + (n1.x - n0.x) * frac;
  const ny = n0.y + (n1.y - n0.y) * frac;

  const waistRadius = R * (0.064 - 0.026 * armLevel) * (1 - 0.07 * callHeat);

  let envelope: number;
  let braidSign: number;

  if (u <= SOCKET_U) {
    const s = u / SOCKET_U;
    const spindleBell = Math.sin(Math.PI * Math.pow(s, 0.84));
    const bellyWidth = R * (0.24 + 0.035 * (1 - armLevel));
    const crossoverBlend = lerp(1, f.crossover, 0.5 - 0.5 * Math.cos(Math.PI * s));
    braidSign = f.xi * crossoverBlend;
    envelope = bellyWidth * spindleBell + waistRadius * Math.sin(s * Math.PI * 0.5);
  } else {
    const s = (u - SOCKET_U) / (1 - SOCKET_U);
    braidSign = f.xi * f.crossover;
    const smoothStart = s * s * (3 - 2 * s);
    const powerFlare = Math.pow(s, 1.24);
    envelope = waistRadius + (smoothStart * 0.28 + powerFlare * 0.72) * R * 2.55 * f.flareSpread;
  }

  const uWave = u * f.freqMul;
  const phase = armPhase * f.freqMul;
  const wave1 = Math.sin(uWave * 4.6 - phase + f.phase);
  const wave2 = Math.cos(uWave * 6.8 - phase * 1.18 - f.phase * 0.9);
  const waveAmp =
    R *
    (0.011 + 0.042 * u * Math.sqrt(Math.max(0.0001, u))) *
    (1 + 0.16 * callHeat + 0.14 * solitonBoost);

  const offset = braidSign * envelope + (wave1 * 0.76 + wave2 * 0.24) * waveAmp;
  let px = cx + nx * offset;
  let py = cy + ny * offset;

  if (hasPointer && u > 0.02) {
    const dx = px - pointerX;
    const dy = py - pointerY;
    const distSq = dx * dx + dy * dy;
    if (distSq < maxDistSq) {
      const k = pointerPresence * Math.exp(-distSq * invTwoSigmaSq);
      const corePin = smoothstep(0.02, 0.14, u);
      const elasticity = 0.65 + 0.4 * Math.abs(f.xi);
      const dist = Math.sqrt(distSq) + 28;
      const partMag = R * 0.022 * k * corePin * elasticity;
      px += (dx / dist) * partMag + pointerVelX * 0.09 * k * corePin * elasticity;
      py += (dy / dist) * partMag + pointerVelY * 0.09 * k * corePin * elasticity;
    }
  }

  outXs[outIdx] = px;
  outYs[outIdx] = py;
}

function traceQuadScratch(
  ctx: CanvasRenderingContext2D,
  xs: Float64Array,
  ys: Float64Array,
  len: number,
) {
  if (len < 2) return;
  ctx.moveTo(xs[0]!, ys[0]!);
  for (let i = 1; i < len - 1; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    ctx.quadraticCurveTo(x, y, (x + xs[i + 1]!) * 0.5, (y + ys[i + 1]!) * 0.5);
  }
  ctx.lineTo(xs[len - 1]!, ys[len - 1]!);
}

function updateHorizonCurve(
  out: HorizonCurvePoints,
  h: HorizonFilament,
  L: StageLayout,
  time: number,
  intro: number,
  wingBoost: number,
  pointer: PointerField,
) {
  const { core, scale: S, radius: R } = L;
  const reach = singularityUnfurl(intro, h.stagger);
  const swayA = Math.sin(time * 0.28 + h.phase);
  const swayB = Math.cos(time * 0.21 + h.phase * 1.3);

  out[3].x = core.x;
  out[3].y = core.y + h.waistOffset * R * reach;

  const lAngle = h.leftAngle + 0.028 * swayA * (1 + 0.2 * wingBoost);
  const rAngle = h.rightAngle + 0.028 * swayB * (1 + 0.2 * wingBoost);
  const lDist = h.leftReach * S * reach;
  const rDist = h.rightReach * S * reach;

  const pLeftX = core.x + Math.cos(lAngle) * lDist;
  const pLeftY = core.y + Math.sin(lAngle) * lDist;
  const pRightX = core.x + Math.cos(rAngle) * rDist;
  const pRightY = core.y + Math.sin(rAngle) * rDist;

  out[0].x = pLeftX;
  out[0].y = pLeftY;
  out[6].x = pRightX;
  out[6].y = pRightY;

  const bridgeAngle = (rAngle + (lAngle - Math.PI)) * 0.5 + 0.018 * swayA;
  const pull = Math.min(lDist, rDist) * 0.34;
  const tX = Math.cos(bridgeAngle) * pull;
  const tY = Math.sin(bridgeAngle) * pull;

  const lCtrlAngle = lAngle + Math.PI + h.curvature;
  const rCtrlAngle = rAngle + Math.PI - h.curvature;

  out[1].x = pLeftX + Math.cos(lCtrlAngle) * lDist * 0.38;
  out[1].y = pLeftY + Math.sin(lCtrlAngle) * lDist * 0.38;
  out[2].x = out[3].x - tX;
  out[2].y = out[3].y - tY;
  out[4].x = out[3].x + tX;
  out[4].y = out[3].y + tY;
  out[5].x = pRightX + Math.cos(rCtrlAngle) * rDist * 0.38;
  out[5].y = pRightY + Math.sin(rCtrlAngle) * rDist * 0.38;

  if (pointer.presence > 0.005) {
    const sigma = R * 0.52;
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    for (const idx of [1, 2, 4, 5] as const) {
      const pt = out[idx];
      const dx = pt.x - pointer.pos.x;
      const dy = pt.y - pointer.pos.y;
      const distSq = dx * dx + dy * dy;
      const k = pointer.presence * Math.exp(-distSq * invTwoSigmaSq);
      if (k > 0.003) {
        const dist = Math.sqrt(distSq) + 36;
        pt.x += (dx / dist) * R * 0.018 * k + pointer.vel.x * 0.07 * k;
        pt.y += (dy / dist) * R * 0.018 * k + pointer.vel.y * 0.07 * k;
      }
    }
  }
}

function evalHorizonPointInto(
  curve: HorizonCurvePoints,
  u: number,
  out: Vec,
) {
  const half = u <= 0.5;
  const t = half ? u * 2 : (u - 0.5) * 2;
  const p0 = half ? curve[0] : curve[3];
  const p1 = half ? curve[1] : curve[4];
  const p2 = half ? curve[2] : curve[5];
  const p3 = half ? curve[3] : curve[6];
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
}

/** Pre-bakes the complex 4-layer optical Moffat singularity sprite once per theme. */
function buildCoreSprite(isLight: boolean): HTMLCanvasElement {
  const size = 280;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  if (!octx) return off;

  const createMoffat = (
    radius: number,
    coreScaleR: number,
    beta: number,
    peakAlpha: number,
    innerRgb: Rgb,
    midRgb: Rgb,
    outerRgb: Rgb,
  ) => {
    const g = octx.createRadialGradient(0, 0, 0, 0, 0, radius);
    const stops = 16;
    for (let i = 0; i <= stops; i++) {
      const u = i / stops;
      const rNorm = (u * radius) / coreScaleR;
      const moffat = Math.pow(1 + rNorm * rNorm, -beta);
      const windowFade = 1 - u * u * (3 - 2 * u);
      const a = clamp(peakAlpha * moffat * windowFade, 0, 1);
      const rgb = u < 0.35 ? mixRgb(innerRgb, midRgb, u / 0.35) : mixRgb(midRgb, outerRgb, (u - 0.35) / 0.65);
      g.addColorStop(u, `rgba(${rgb}, ${a})`);
    }
    return g;
  };

  const baseR = 95;
  octx.save();
  octx.translate(size * 0.5, size * 0.5);
  octx.globalCompositeOperation = isLight ? "source-over" : "lighter";

  // 1. Wide elliptical halo
  octx.save();
  octx.scale(1.38, 0.82);
  const fieldR = baseR * 0.96;
  const fieldOuter: Rgb = isLight ? [184, 112, 10] : [198, 116, 28];
  octx.fillStyle = createMoffat(
    fieldR,
    fieldR * 0.24,
    1.85,
    isLight ? 0.26 : 0.24,
    isLight ? [226, 166, 38] : [255, 224, 152],
    isLight ? [208, 138, 18] : [242, 174, 62],
    fieldOuter,
  );
  octx.beginPath();
  octx.arc(0, 0, fieldR, 0, TAU);
  octx.fill();
  octx.restore();

  // 2. Micro-involutes
  const involuteReach = baseR * 0.65;
  const invColor = isLight ? "184, 112, 10" : "255, 228, 162";
  const invGrad = octx.createRadialGradient(0, 0, 0, 0, 0, involuteReach);
  invGrad.addColorStop(0, `rgba(${invColor}, ${isLight ? 0.28 : 0.22})`);
  invGrad.addColorStop(0.45, `rgba(${invColor}, ${isLight ? 0.11 : 0.08})`);
  invGrad.addColorStop(1, `rgba(${invColor}, 0)`);
  octx.beginPath();
  for (let i = 0; i < 32; i++) {
    const baseTheta = (i / 32) * TAU;
    const curl = (i % 2 === 0 ? 1 : -1) * 0.42;
    const r1 = involuteReach * 0.35;
    const r2 = involuteReach * (0.72 + 0.22 * Math.sin(i * 1.7));
    octx.moveTo(0, 0);
    octx.bezierCurveTo(
      Math.cos(baseTheta + curl * 0.4) * r1 * 1.25,
      Math.sin(baseTheta + curl * 0.4) * r1 * 0.82,
      Math.cos(baseTheta + curl * 0.8) * r2 * 0.85,
      Math.sin(baseTheta + curl * 0.8) * r2 * 0.68,
      Math.cos(baseTheta + curl) * r2 * 1.15,
      Math.sin(baseTheta + curl) * r2 * 0.78,
    );
  }
  octx.lineWidth = isLight ? 0.85 : 0.7;
  octx.strokeStyle = invGrad;
  octx.stroke();

  // 3. Anamorphic horizontal whisper
  octx.save();
  octx.scale(2.65, 0.22);
  const anamorphicR = baseR * 0.52;
  octx.fillStyle = createMoffat(
    anamorphicR,
    anamorphicR * 0.22,
    2.2,
    isLight ? 0.32 : 0.28,
    isLight ? [196, 124, 12] : [255, 242, 206],
    isLight ? [218, 152, 28] : [248, 192, 86],
    fieldOuter,
  );
  octx.beginPath();
  octx.arc(0, 0, anamorphicR, 0, TAU);
  octx.fill();
  octx.restore();

  // 4. Inner Moffat caustic heart
  octx.save();
  octx.scale(1.18, 0.9);
  const heartR = baseR * 0.45;
  octx.fillStyle = createMoffat(
    heartR,
    heartR * 0.2,
    2.45,
    isLight ? 0.65 : 0.58,
    isLight ? [156, 88, 6] : [255, 248, 228],
    isLight ? [198, 128, 16] : [252, 212, 124],
    isLight ? [228, 168, 42] : [236, 162, 52],
  );
  octx.beginPath();
  octx.arc(0, 0, heartR, 0, TAU);
  octx.fill();
  octx.restore();

  octx.restore();
  return off;
}

/* ============================================================================
   COMPONENT
   ============================================================================ */

export const NeuralStage = memo(function NeuralStage({
  signal,
  onSelectSocket,
  className = "",
}: {
  signal: StageSignal;
  onSelectSocket?: (socketIndex: number) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signalRef = useRef(signal);
  const onSelectRef = useRef(onSelectSocket);
  const redrawRef = useRef<(() => void) | null>(null);
  const syncLoopRef = useRef<(() => void) | null>(null);
  const socketCount = signal.sockets.length;

  useEffect(() => {
    signalRef.current = signal;
    onSelectRef.current = onSelectSocket;
    redrawRef.current?.();
    syncLoopRef.current?.();
  }, [signal, onSelectSocket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createNeuralField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const darkCoreSprite = buildCoreSprite(false);
    const lightCoreSprite = buildCoreSprite(true);

    const spines = createEmptySpines(socketCount);
    const horizonCurves: HorizonCurvePoints[] = Array.from(
      { length: field.horizonFilaments.length },
      () => [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    );
    const scratchXs = new Float64Array(CURVE_STEPS + 1);
    const scratchYs = new Float64Array(CURVE_STEPS + 1);
    const tmpPos: Vec = { x: 0, y: 0 };

    const armLevels: number[] = signalRef.current.sockets.map((s) => SOCKET_TARGET_LEVEL[s]);
    const armTrailingEdgeHeat: number[] = signalRef.current.sockets.map((s) =>
      s === "occupied" ? 0.65 : 0,
    );
    const armTrailingImpulse: number[] = new Array<number>(socketCount).fill(0);
    const armWaveHeat: number[] = new Array<number>(socketCount).fill(0);
    const armWavePhases: number[] = new Array<number>(socketCount).fill(0);
    const prevStates: SocketVisual[] = [...signalRef.current.sockets];
    const solitons: SolitonWave[] = [];
    const ripples: CoreRipple[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    const fromExplosion = Boolean(signalRef.current.fromSetupExplosion);
    let energy = fromExplosion ? 1.45 : BRAIN_TARGET_ENERGY[signalRef.current.brain];
    let globalCallHeat = 0;
    let globalCallImpulse = 0;
    let autoTransferClock = 3.8;
    let autoTransferIdx = 0;
    let rippleClock = 0;
    let wakeShockFired = fromExplosion;

    if (fromExplosion && !reduceMotion) {
      ripples.push({ u: 0.14, crimson: false, strength: 1.35 });
      ripples.push({ u: 0.03, crimson: false, strength: 0.95 });
    }

    const pointerTarget: Vec = { x: 0, y: 0 };
    const pointerSmooth: Vec = { x: 0, y: 0 };
    const pointerPosSmooth: Vec = { x: -9999, y: -9999 };
    const pointerVelSmooth: Vec = { x: 0, y: 0 };
    let pointerPresence = 0;
    let pointerClient: Vec | null = null;

    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let smoothTime = 0;
    let elementActive = true;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!pointerClient) {
        pointerPosSmooth.x = x;
        pointerPosSmooth.y = y;
      }
      pointerClient = { x, y };
      pointerTarget.x = (x / rect.width - 0.5) * 10;
      pointerTarget.y = (y / rect.height - 0.5) * 10;
    };

    const onPointerLeave = () => {
      pointerClient = null;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };

    const onClick = (e: MouseEvent) => {
      if (!onSelectRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      for (let i = 0; i < layout.sockets.length; i++) {
        const sock = layout.sockets[i]!;
        if (Math.hypot(clickX - sock.x, clickY - sock.y) <= 28) {
          launchInformationWave(-1, i);
          onSelectRef.current(i);
          return;
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    const launchInformationWave = (fromSocket: number, toSocket: number) => {
      globalCallImpulse = 1;
      if (fromSocket >= 0 && fromSocket < socketCount) {
        armTrailingImpulse[fromSocket] = 1;
        if (!reduceMotion) {
          solitons.push({ arm: fromSocket, u: 0.72, speed: 0.55, direction: -1, intensity: 1 });
        }
      }
      if (toSocket >= 0 && toSocket < socketCount) {
        armTrailingImpulse[toSocket] = 1;
        if (!reduceMotion) {
          solitons.push({
            arm: toSocket,
            u: fromSocket >= 0 ? -0.35 : 0,
            speed: 0.58,
            direction: 1,
            intensity: 1,
          });
        }
      } else if (toSocket < 0 && fromSocket < 0) {
        signalRef.current.sockets.forEach((s, idx) => {
          if (s === "occupied") {
            armTrailingImpulse[idx] = 1;
            if (!reduceMotion) {
              solitons.push({ arm: idx, u: idx * -0.08, speed: 0.58, direction: 1, intensity: 1 });
            }
          }
        });
      }
      if (!reduceMotion) ripples.push({ u: 0, crimson: true, strength: 0.85 });
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const L = layout;
      const { width, height, core, radius: R, scale: S } = L;

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (isLight) {
        const bgGrad = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, Math.hypot(width, height) * 0.75);
        bgGrad.addColorStop(0, "#fdfcfa");
        bgGrad.addColorStop(0.55, "#f7f6f2");
        bgGrad.addColorStop(1, "#efede7");
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = "#000000";
      }
      ctx.fillRect(0, 0, width, height);

      if (!reduceMotion && !fromExplosion && time < WAKE_SILENCE_SECONDS) {
        return;
      }

      const activeTime = reduceMotion
        ? 10
        : fromExplosion
          ? time
          : Math.max(0, time - WAKE_SILENCE_SECONDS);
      const intro = reduceMotion
        ? 1
        : fromExplosion
          ? Math.min(1, 0.07 + activeTime / INTRO_SPRING_SECONDS)
          : Math.min(1, activeTime / INTRO_SPRING_SECONDS);
      const introEase = 1 - Math.pow(1 - intro, 3);
      const coreIntro = fromExplosion ? clamp(0.45 + introEase * 0.55, 0.45, 1) : introEase;

      const pFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 3.5);
      pointerSmooth.x = lerp(pointerSmooth.x, pointerTarget.x, pFollow);
      pointerSmooth.y = lerp(pointerSmooth.y, pointerTarget.y, pFollow);

      const posFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 8.5);
      if (pointerClient) {
        const prevPx = pointerPosSmooth.x;
        const prevPy = pointerPosSmooth.y;
        pointerPosSmooth.x = lerp(prevPx, pointerClient.x, posFollow);
        pointerPosSmooth.y = lerp(prevPy, pointerClient.y, posFollow);

        const invDt = dt > 0.001 ? 1 / dt : 60;
        const smoothVx = clamp((pointerPosSmooth.x - prevPx) * invDt * 0.055, -24, 24);
        const smoothVy = clamp((pointerPosSmooth.y - prevPy) * invDt * 0.055, -24, 24);
        const velFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 5.0);
        pointerVelSmooth.x = lerp(pointerVelSmooth.x, smoothVx, velFollow);
        pointerVelSmooth.y = lerp(pointerVelSmooth.y, smoothVy, velFollow);
        pointerPresence = lerp(pointerPresence, 1, 1 - Math.exp(-dt * 4.5));
      } else {
        const decay = Math.exp(-dt * 4.5);
        pointerVelSmooth.x *= decay;
        pointerVelSmooth.y *= decay;
        pointerPresence = lerp(pointerPresence, 0, 1 - Math.exp(-dt * 2.4));
      }

      const pointerField: PointerField = {
        pos: pointerPosSmooth,
        vel: pointerVelSmooth,
        parallax: pointerSmooth,
        presence: pointerPresence,
      };
      const hasPointer = pointerPresence > 0.005;
      const sigma = R * 0.46;
      const invTwoSigmaSq = 1 / (2 * sigma * sigma);
      const maxDistSq = (1 / invTwoSigmaSq) * 3.4;

      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") launchInformationWave(-1, activeSocket ?? -1);
        lastBrain = brain;
      }

      if ((activeSocket ?? null) !== lastActiveSocket) {
        if (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0) {
          launchInformationWave(-1, activeSocket);
        }
        lastActiveSocket = activeSocket ?? null;
      }

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        launchInformationWave(-1, snap.index);
      }

      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        launchInformationWave(transfer.fromSocket, transfer.toSocket);
      }

      if (!reduceMotion && intro >= 1 && brain === "idle") {
        autoTransferClock -= dt;
        if (autoTransferClock <= 0) {
          autoTransferClock = 4.6;
          const occupied = sockets.map((s, i) => (s === "occupied" ? i : -1)).filter((i) => i >= 0);
          if (occupied.length >= 2) {
            const from = occupied[autoTransferIdx % occupied.length]!;
            const to = occupied[(autoTransferIdx + 1) % occupied.length]!;
            autoTransferIdx++;
            launchInformationWave(from, to);
          } else if (occupied.length === 1) {
            autoTransferIdx++;
            launchInformationWave(-1, occupied[0]!);
          }
        }
      }

      const isCallingAnyNode =
        brain === "thinking" ||
        brain === "responding" ||
        (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0);

      globalCallImpulse *= Math.exp(-dt * 0.72);
      const targetGlobalCall = Math.max(isCallingAnyNode ? 1 : 0, globalCallImpulse);
      globalCallHeat = lerp(
        globalCallHeat,
        targetGlobalCall,
        reduceMotion ? 1 : 1 - Math.exp(-dt * (targetGlobalCall > globalCallHeat ? 3.2 : 1.15)),
      );

      energy = lerp(energy, BRAIN_TARGET_ENERGY[brain], reduceMotion ? 1 : 1 - Math.exp(-dt * 2.0));

      sockets.forEach((s, i) => {
        const prev = prevStates[i];
        if (prev !== s) {
          prevStates[i] = s;
          if (s === "occupied") {
            armTrailingImpulse[i] = 1.0;
            launchInformationWave(-1, i);
          }
        }

        let hoverBoost = 0;
        if (pointerClient && L.sockets[i]) {
          const d = Math.hypot(pointerClient.x - L.sockets[i]!.x, pointerClient.y - L.sockets[i]!.y);
          hoverBoost = clamp(1 - d / (R * 0.45), 0, 1) * (s === "occupied" ? 0.12 : 0.06);
        }
        const targetLevel = clamp(SOCKET_TARGET_LEVEL[s] + hoverBoost, 0, 1.15);
        armLevels[i] = lerp(armLevels[i] ?? targetLevel, targetLevel, reduceMotion ? 1 : 1 - Math.exp(-dt * 3.0));

        const armIsCalled =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && s === "occupied");
        armTrailingImpulse[i] = (armTrailingImpulse[i] ?? 0) * Math.exp(-dt * 0.72);
        const targetEdgeCrimson =
          s === "occupied" ? (armIsCalled ? 1.0 : Math.max(0.65, globalCallHeat * 0.85, armTrailingImpulse[i]!)) : 0;
        armTrailingEdgeHeat[i] = lerp(
          armTrailingEdgeHeat[i] ?? 0,
          targetEdgeCrimson,
          reduceMotion ? 1 : 1 - Math.exp(-dt * (targetEdgeCrimson > (armTrailingEdgeHeat[i] ?? 0) ? 3.4 : 1.2)),
        );

        if (!reduceMotion) {
          armWavePhases[i] =
            (armWavePhases[i] ?? 0) +
            dt * (0.52 + 0.24 * (armTrailingEdgeHeat[i] ?? 0) + 0.18 * energy);
        }
      });

      for (let i = solitons.length - 1; i >= 0; i--) {
        const sol = solitons[i]!;
        if (!reduceMotion) sol.u += sol.speed * sol.direction * dt;
        if (sol.direction > 0 && sol.u >= 1.2) solitons.splice(i, 1);
        else if (sol.direction < 0 && sol.u <= -0.15) solitons.splice(i, 1);
      }

      if (!reduceMotion && intro > 0.04 && !wakeShockFired) {
        wakeShockFired = true;
        ripples.push({ u: 0.01, crimson: false, strength: 0.95 });
      }

      if (!reduceMotion && brain === "responding") {
        rippleClock -= dt;
        if (rippleClock <= 0) {
          rippleClock = 0.88;
          ripples.push({ u: 0, crimson: true, strength: 0.85 });
        }
      } else {
        rippleClock = 0;
      }

      const goldCore = isLight ? GOLD_LIGHT_SPECULAR : GOLD_CORE;
      const goldBright = isLight ? GOLD_LIGHT_BRIGHT : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const crimsonHot = isLight ? CRIMSON_LIGHT_HOT : CRIMSON_HOT;
      const crimsonPure = isLight ? CRIMSON_LIGHT_PURE : CRIMSON_PURE;
      const crimsonDeep = isLight ? CRIMSON_LIGHT_DEEP : CRIMSON_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.65 : 1.0;

      ctx.globalCompositeOperation = blendOp;
      const baseGlobalAlpha = fromExplosion ? 1 : Math.min(1, intro * 2.4);

      const fieldRadius = S * 1.25 * (0.18 + 0.82 * introEase) * (1 + 0.1 * energy);

      // Update pre-allocated SpineFrames in place (zero per-frame heap churn)
      for (let armIdx = 0; armIdx < L.arms.length; armIdx++) {
        updateArmSpine(spines[armIdx]!, L.arms[armIdx]!, L, activeTime, intro, pointerField);
      }

      const anyConnected = sockets.some((s) => s === "occupied");
      const horizonEdgeRed = Math.max(anyConnected ? 0.55 : 0, globalCallHeat);

      for (let i = 0; i < field.horizonFilaments.length; i++) {
        updateHorizonCurve(
          horizonCurves[i]!,
          field.horizonFilaments[i]!,
          L,
          activeTime,
          intro,
          globalCallHeat,
          pointerField,
        );
      }

      // Build ONE shared normalized horizon radial gradient and modulate alpha per depth layer
      const hBaseRgb = mixRgbTuple(goldMid, goldBright, 0.55);
      const hCoreColor = `${hBaseRgb[0]}, ${hBaseRgb[1]}, ${hBaseRgb[2]}`;
      const hMidTrailColor = mixRgb(hBaseRgb, crimsonHot, horizonEdgeRed * 0.78);
      const hOuterTrailColor = mixRgb(goldDeep, crimsonPure, horizonEdgeRed * 0.96);
      const hg = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, fieldRadius);
      hg.addColorStop(0, `rgba(${hCoreColor}, 0.95)`);
      hg.addColorStop(0.28, `rgba(${hCoreColor}, 0.56)`);
      hg.addColorStop(0.56, `rgba(${hCoreColor}, 0.28)`);
      hg.addColorStop(0.74, `rgba(${hMidTrailColor}, ${0.18 + 0.18 * horizonEdgeRed})`);
      hg.addColorStop(0.9, `rgba(${hOuterTrailColor}, ${0.09 + 0.15 * horizonEdgeRed})`);
      hg.addColorStop(1, `rgba(${hOuterTrailColor}, 0)`);
      ctx.strokeStyle = hg;

      const horizonAlphaScale = (isLight ? 0.68 : 0.52) * alphaScale * (0.75 + 0.35 * energy);
      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const indices = field.horizonLayerBatches[layerIdx]!;
        if (!indices.length) continue;
        const layer = DEPTH_LAYERS[layerIdx]!;
        ctx.globalAlpha = baseGlobalAlpha * clamp(layer.alpha * horizonAlphaScale * 2.0, 0, 1);
        ctx.beginPath();
        for (const idx of indices) {
          const c = horizonCurves[idx]!;
          ctx.moveTo(c[0].x, c[0].y);
          ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
          ctx.bezierCurveTo(c[4].x, c[4].y, c[5].x, c[5].y, c[6].x, c[6].y);
        }
        ctx.lineWidth = layer.width * (isLight ? 0.98 : 0.85);
        ctx.stroke();
      }

      ctx.globalAlpha = baseGlobalAlpha;
      L.horizonWings.forEach((wing: HorizonWingGeometry) => {
        const reach = singularityUnfurl(intro, 0.22);
        const c1x = lerp(core.x, wing.c1.x, reach);
        const c1y = lerp(core.y, wing.c1.y, reach);
        const c2x = lerp(core.x, wing.c2.x, reach);
        const c2y = lerp(core.y, wing.c2.y, reach);
        const tipX = lerp(core.x, wing.tip.x, reach);
        const tipY = lerp(core.y, wing.tip.y, reach);
        const wg = ctx.createLinearGradient(core.x, core.y, tipX, tipY);
        const goldStr = `${goldMid[0]}, ${goldMid[1]}, ${goldMid[2]}`;
        const edgeStr = mixRgb(goldDeep, crimsonPure, horizonEdgeRed * 0.92);
        wg.addColorStop(0, `rgba(${goldStr}, ${0.22 * alphaScale})`);
        wg.addColorStop(0.55, `rgba(${goldStr}, ${0.09 * alphaScale})`);
        wg.addColorStop(0.82, `rgba(${edgeStr}, ${(0.05 + 0.09 * horizonEdgeRed) * alphaScale})`);
        wg.addColorStop(1, `rgba(${edgeStr}, 0)`);
        ctx.beginPath();
        ctx.moveTo(core.x, core.y);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = wg;
        ctx.stroke();
      });

      // Harmonic bridges batched per frame
      ctx.beginPath();
      let hasBridges = false;
      for (const b of field.bridges) {
        const lvlA = armLevels[b.fromArm] ?? 0;
        const lvlB = armLevels[b.toArm] ?? 0;
        const bridgeStrength = Math.min(lvlA, lvlB);
        if (bridgeStrength < 0.45) continue;
        hasBridges = true;
        const pA = spines[b.fromArm]!.socketPt;
        const pB = spines[b.toArm]!.socketPt;
        const midX = (pA.x + pB.x) * 0.5;
        const midY = (pA.y + pB.y) * 0.5;
        const dirFromCore = Math.atan2(midY - core.y, midX - core.x);
        const sway = Math.sin(activeTime * 0.5 + b.phase) * R * 0.022;
        const lift = R * b.archLift + sway;
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(
          midX + Math.cos(dirFromCore) * lift,
          midY + Math.sin(dirFromCore) * lift,
          pB.x,
          pB.y,
        );
      }
      if (hasBridges) {
        ctx.lineWidth = 0.55;
        ctx.strokeStyle = `rgba(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}, ${0.1 * alphaScale * introEase})`;
        ctx.stroke();
      }

      // Functional Node Arms (1 shared normalized gradient per arm, alpha modulated per depth layer)
      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const spine = spines[armIdx]!;
        const level = armLevels[armIdx] ?? 0.1;
        const edgeRed = armTrailingEdgeHeat[armIdx] ?? 0;
        const armPhase = reduceMotion ? 4 : (armWavePhases[armIdx] ?? 0);
        const isConnected = level > 0.35;

        let waveCenterU = -1;
        let waveStrength = 0;
        let armSolitonBoost = 0;
        for (const sol of solitons) {
          if (sol.arm === armIdx && sol.u >= 0 && sol.u <= 1.05) {
            waveCenterU = sol.u;
            waveStrength = Math.max(waveStrength, Math.sin(clamp(sol.u, 0, 1) * Math.PI) * sol.intensity);
            const distFromSocket = Math.abs(sol.u - SOCKET_U);
            armSolitonBoost = Math.max(
              armSolitonBoost,
              Math.exp(-(distFromSocket * distFromSocket) / 0.085) * sol.intensity,
            );
          }
        }

        const targetArmWaveHeat = clamp(edgeRed * 0.45 + waveStrength * 0.55, 0, 1);
        armWaveHeat[armIdx] = lerp(
          armWaveHeat[armIdx] ?? targetArmWaveHeat,
          targetArmWaveHeat,
          reduceMotion ? 1 : 1 - Math.exp(-dt * 2.8),
        );
        const smoothWaveHeat = armWaveHeat[armIdx]!;

        const activeGold = mixRgbTuple(goldMid, goldCore, 0.55);
        const dormantColor = isLight ? DORMANT_LIGHT_PLATINUM : DORMANT_BRONZE;
        const baseRgb = isConnected
          ? activeGold
          : mixRgbTuple(dormantColor, activeGold, clamp((level - 0.08) * 1.5, 0, 1));
        const baseRgbStr = `${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}`;

        const armGrad = ctx.createLinearGradient(core.x, core.y, spine.tipPt.x, spine.tipPt.y);
        for (const u of GRAD_STOPS) {
          let infoWaveRed = 0;
          if (waveCenterU >= 0 && waveStrength > 0.01) {
            const d = (u - waveCenterU) / 0.14;
            infoWaveRed = Math.exp(-0.5 * d * d) * waveStrength;
          }
          const trailingEdgeRed = smoothstep(0.64, 0.9, u) * edgeRed;
          const redMix = clamp(Math.max(infoWaveRed * 0.96, trailingEdgeRed), 0, 1);
          const stopColor =
            redMix > 0.02 ? mixRgb(baseRgb, u > 0.82 ? crimsonPure : crimsonHot, redMix) : baseRgbStr;
          const uProfile =
            u === 0 ? 1.0 : u <= 0.36 ? 0.86 : u <= 0.64 ? 0.58 : u <= 0.88 ? 0.32 + 0.22 * redMix : 0;
          const stopAlpha = clamp(uProfile * (1 + 0.35 * infoWaveRed), 0, 1);
          if (u === 1.0) {
            armGrad.addColorStop(1.0, `rgba(${mixRgb(goldDeep, crimsonDeep, edgeRed)}, 0)`);
          } else {
            armGrad.addColorStop(u, `rgba(${stopColor}, ${stopAlpha})`);
          }
        }
        ctx.strokeStyle = armGrad;

        const armAlphaFactor =
          alphaScale *
          (isConnected ? 0.38 + 1.05 * level : level * (isLight ? 0.88 : 0.68)) *
          (1 + 0.2 * energy + 0.32 * waveStrength);

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const batch = field.armLayerBatches[armIdx]![layerIdx]!;
          if (!batch.length) continue;

          ctx.globalAlpha = baseGlobalAlpha * clamp(layer.alpha * armAlphaFactor * 1.45, 0, 1);
          ctx.beginPath();
          for (const fIdx of batch) {
            const f = field.armFilaments[fIdx]!;
            const fReach = Math.min(1, singularityUnfurl(intro, f.stagger));
            for (let k = 0; k <= CURVE_STEPS; k++) {
              writeArmFilamentPoint(
                f,
                spine,
                SAMPLE_US[k]! * fReach,
                R,
                armPhase,
                level,
                smoothWaveHeat,
                armSolitonBoost,
                hasPointer,
                pointerPosSmooth.x,
                pointerPosSmooth.y,
                pointerPresence,
                pointerVelSmooth.x,
                pointerVelSmooth.y,
                invTwoSigmaSq,
                maxDistSq,
                scratchXs,
                scratchYs,
                k,
              );
            }
            traceQuadScratch(ctx, scratchXs, scratchYs, CURVE_STEPS + 1);
          }
          ctx.lineWidth = layer.width * (0.85 + 0.45 * level + 0.14 * waveStrength) * (isLight ? 1.18 : 1);
          ctx.stroke();

          if (isLight && isConnected && layerIdx === 3) {
            ctx.save();
            ctx.globalAlpha = baseGlobalAlpha * 0.26 * introEase;
            ctx.lineWidth = 0.55;
            ctx.strokeStyle = `rgba(218, 154, 34, 0.9)`;
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Expanding harmonic ripples
      ctx.globalAlpha = baseGlobalAlpha;
      ctx.lineWidth = 1.1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]!;
        if (!reduceMotion) rp.u += dt * 0.46;
        if (rp.u >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = Math.pow(1 - rp.u, 2) * rp.strength;
        const rpColor = rp.crimson
          ? mixRgb(goldBright, crimsonPure, clamp(rp.u * 1.35, 0, 1))
          : `${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}`;
        ctx.strokeStyle = `rgba(${rpColor}, ${0.3 * fade * alphaScale})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.08 + rp.u * 1.55), 0, TAU);
        ctx.stroke();
      }

      // Batched photon drawing (~3 fill calls instead of 300+ individual fills per frame)
      const flowSpeedMul = 1 + 0.9 * energy;
      const photonGold = isLight ? GOLD_LIGHT_BRIGHT : goldCore;

      ctx.fillStyle = `rgb(${photonGold[0]}, ${photonGold[1]}, ${photonGold[2]})`;
      ctx.globalAlpha = introEase * 0.78;
      ctx.beginPath();
      for (const pt of field.armPhotons) {
        const level = armLevels[pt.arm] ?? 0.1;
        if (level < 0.25) continue;
        const f = field.armFilaments[pt.filamentIdx]!;
        const spine = spines[pt.arm]!;
        const distFromWaist = Math.abs(pt.u - SOCKET_U);
        const venturiBoost = 1 + 0.5 * Math.exp(-(distFromWaist * distFromWaist) / 0.025);
        if (!reduceMotion) {
          pt.u = (pt.u + pt.speed * dt * flowSpeedMul * venturiBoost * (0.45 + 0.75 * level)) % 1;
        }
        const uEff = pt.u * Math.min(1, singularityUnfurl(intro, f.stagger));
        writeArmFilamentPoint(
          f,
          spine,
          uEff,
          R,
          reduceMotion ? 4 : (armWavePhases[pt.arm] ?? 0),
          level,
          armWaveHeat[pt.arm] ?? 0,
          0,
          hasPointer,
          pointerPosSmooth.x,
          pointerPosSmooth.y,
          pointerPresence,
          pointerVelSmooth.x,
          pointerVelSmooth.y,
          invTwoSigmaSq,
          maxDistSq,
          scratchXs,
          scratchYs,
          0,
        );
        const px = scratchXs[0]!;
        const py = scratchYs[0]!;
        const rad = pt.size * Math.sin(pt.u * Math.PI);
        if (rad > 0.2) {
          ctx.moveTo(px + rad, py);
          ctx.arc(px, py, rad, 0, TAU);
        }
      }
      ctx.fill();

      const hPhotonBase = isLight ? GOLD_LIGHT_MID : goldBright;
      ctx.fillStyle = `rgb(${hPhotonBase[0]}, ${hPhotonBase[1]}, ${hPhotonBase[2]})`;
      ctx.globalAlpha = introEase * 0.58;
      ctx.beginPath();
      for (const hp of field.horizonPhotons) {
        if (!reduceMotion) hp.u = (hp.u + hp.speed * dt * flowSpeedMul) % 1;
        evalHorizonPointInto(horizonCurves[hp.strandIdx]!, hp.u, tmpPos);
        const rad = hp.size * Math.sin(hp.u * Math.PI);
        if (rad > 0.18) {
          ctx.moveTo(tmpPos.x + rad, tmpPos.y);
          ctx.arc(tmpPos.x, tmpPos.y, rad, 0, TAU);
        }
      }
      ctx.fill();

      // Blit pre-rendered Singularity Core sprite (replaces 68 gradient stops + 36 beziers/frame)
      if (coreIntro > 0.005) {
        const sprite = isLight ? lightCoreSprite : darkCoreSprite;
        const breathe = 1 + 0.032 * Math.sin(activeTime * 0.65) + 0.05 * energy;
        const drawExtent = Math.max(S * 0.72, R * 0.92) * breathe * coreIntro;
        ctx.save();
        ctx.translate(core.x, core.y);
        ctx.globalCompositeOperation = blendOp;
        ctx.globalAlpha = clamp(coreIntro * (1 + 0.14 * energy), 0, 1);
        ctx.drawImage(sprite, -drawExtent * 0.5, -drawExtent * 0.5, drawExtent, drawExtent);
        ctx.restore();
      }
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      layout = computeStageLayout(width, height, socketCount);
      if (reduceMotion) draw(8, 0);
    };

    const loop = (now: number) => {
      if (!elementActive || signalRef.current.paused || reduceMotion) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const rawDt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
      last = now;
      smoothDt = lerp(smoothDt, rawDt, 0.16);
      smoothTime += smoothDt;
      draw(smoothTime, smoothDt);
      frame = requestAnimationFrame(loop);
    };

    const syncLoop = () => {
      const shouldRun = !reduceMotion && elementActive && !signalRef.current.paused;
      if (shouldRun && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(loop);
      } else if (!shouldRun && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    };

    syncLoopRef.current = syncLoop;
    redrawRef.current = reduceMotion ? () => draw(8, 0) : null;

    const stopVisibility = observeCanvasActivity(canvas, (active) => {
      elementActive = active;
      syncLoop();
    });
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    syncLoop();

    return () => {
      cancelAnimationFrame(frame);
      stopVisibility();
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
      syncLoopRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
});
