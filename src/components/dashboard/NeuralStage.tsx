"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  bezier,
  clamp,
  fitCanvas,
  lerp,
  polar,
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
const SPINE_SAMPLES = 72;
const FILAMENTS_PER_ARM = 76;
const HORIZON_STRANDS = 124;

const GOLD_CORE: Rgb = [255, 250, 232];
const GOLD_BRIGHT: Rgb = [255, 224, 156];
const GOLD_MID: Rgb = [246, 182, 74];
const GOLD_DEEP: Rgb = [212, 128, 34];
const DORMANT_BRONZE: Rgb = [118, 84, 38];

// Light-mode 24k burnished gold palette: high-chroma champagne -> sovereign 24k gold -> deep imperial bronze-gold
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

/**
 * Connected ('occupied') nodes blaze at 1.0.
 * Disconnected ('open' / 'locked') nodes drop to a dim dark-bronze level (0.14 / 0.08)
 * so they clearly read as DARK/OFF while preserving the mathematical arm geometry.
 */
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

/** Four optical depth layers per arm: wide atmospheric bloom -> medium silk -> crisp filament -> specular core hair. */
const DEPTH_LAYERS = [
  { width: 2.8, alpha: 0.075, hot: 0.0 },
  { width: 1.25, alpha: 0.19, hot: 0.35 },
  { width: 0.72, alpha: 0.34, hot: 0.7 },
  { width: 0.44, alpha: 0.56, hot: 1.0 },
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
  tangents: Vec[];
  socketPt: Vec;
  tipPt: Vec;
};

type PointerField = {
  pos: Vec;
  vel: Vec;
  parallax: Vec;
  presence: number;
};

type ArmFilament = {
  arm: number;
  layer: number;
  /** Signed transverse coordinate in [-1, 1] at the spindle belly. */
  xi: number;
  /** Optical crossover factor: +1 stays on same side through waist, -0.82 crosses through caustic focus. */
  crossover: number;
  /** Outer corner plume fan multiplier. */
  flareSpread: number;
  /** Coherent biharmonic wave phase & frequency modifiers. */
  phase: number;
  freqMul: number;
  /** Singularity wake-up stagger in [0, 1]. */
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
  alpha: number;
};

type HorizonPhoton = {
  strandIdx: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

/**
 * Travelling crimson information wave along an arm's flowing lines (replaces orbs).
 */
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
      // Stratified laminar distribution across [-1, 1] with an inner core + wide outer harmonic sheath
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
        // Coherent phase across xi with gentle variation so lines flow as a lush, unified wave
        phase: arm * 1.25 + xi * 1.35 + gauss() * 0.2,
        freqMul: between(0.94, 1.08),
        stagger: clamp(Math.abs(xi) * 0.26 + rnd() * 0.14, 0, 0.52),
      });
      armLayerBatches[arm]![layer]!.push(idx);
    }
  }

  // Continuous cross-core horizon filaments that sweep into the 4 corners while leaving bottom-center open
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
      leftAngle: Math.PI - leftLift * chirality,
      rightAngle: rightLift * chirality,
      leftReach: between(1.02, 1.48),
      rightReach: between(1.02, 1.48),
      curvature: stratified * 0.24,
      phase: stratified * 1.35 + rnd() * 0.4,
      stagger: clamp(Math.abs(stratified) * 0.34 + 0.06, 0.04, 0.56),
    });
    horizonLayerBatches[layer]!.push(idx);
  }

  // Lush harmonic bridges between adjacent connected node sockets
  const bridges: SynapticBridge[] = [];
  for (let a = 0; a < armCount - 1; a++) {
    for (let k = 0; k < 9; k++) {
      bridges.push({
        fromArm: a,
        toArm: a + 1,
        archLift: between(-0.14, 0.08) + (k - 4) * 0.028,
        phase: k * 0.65 + a,
      });
    }
  }

  // Photons flowing along the 5 functional node arms
  const armPhotons: FlowPhoton[] = Array.from({ length: 380 }, (_, i) => {
    const filamentIdx = i % armFilaments.length;
    const f = armFilaments[filamentIdx]!;
    return {
      arm: f.arm,
      filamentIdx,
      u: rnd(),
      speed: between(0.055, 0.13),
      size: between(0.6, 1.75),
      alpha: between(0.48, 0.98),
    };
  });

  // Photons gliding along the horizon corner wings
  const horizonPhotons: HorizonPhoton[] = Array.from({ length: 130 }, () => ({
    strandIdx: Math.floor(rnd() * horizonFilaments.length),
    u: rnd(),
    speed: between(0.038, 0.085),
    size: between(0.5, 1.4),
    alpha: between(0.35, 0.82),
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
   CONTINUOUS C2 DIFFERENTIAL GEOMETRY & VENTURI-CAUSTIC ENVELOPE MATH
   ============================================================================ */

/**
 * Second-order underdamped spring pop from the singularity (r = 0 -> 1)
 * that begins only AFTER the "Waking up Nexus…" silence completes.
 */
function singularityUnfurl(intro: number, stagger: number): number {
  const u = clamp((intro - stagger * 0.22) / (1 - stagger * 0.22), 0, 1);
  if (u <= 0) return 0.001;
  // Softly damped harmonic spring combined with C2 quintic smootherstep for ultra-smooth expansion
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

/**
 * Samples a C2-continuous spine frame from `core` (u = 0), through `socket` (u = SOCKET_U),
 * and out past the viewport corner (`cornerTip`, u = 1), with living harmonic sway.
 */
function sampleArmSpine(
  arm: ArmGeometry,
  L: StageLayout,
  time: number,
  intro: number,
  pointer: PointerField,
): SpineFrame {
  const { core, radius: R } = L;
  const unfurlInner = singularityUnfurl(intro, 0.04);
  const unfurlOuter = singularityUnfurl(intro, 0.18);

  const slowWave = Math.sin(time * 0.34 + arm.index * 1.45);
  const deepWave = Math.cos(time * 0.22 + arm.index * 2.1);

  const perpAngle = arm.coreAngle + Math.PI * 0.5;
  const socketSway = polar(R * 0.02 * slowWave, perpAngle);

  // Local magnetic attraction/parting & velocity brush drag on the arm socket when cursor flows over it
  let localPullX = 0;
  let localPullY = 0;
  if (pointer.presence > 0.005) {
    const dx = arm.socket.x - pointer.pos.x;
    const dy = arm.socket.y - pointer.pos.y;
    const distSq = dx * dx + dy * dy;
    const sigma = R * 0.52;
    const k = pointer.presence * Math.exp(-distSq / (2 * sigma * sigma));
    localPullX = pointer.vel.x * 0.28 * k - (dx / (Math.sqrt(distSq) + 40)) * R * 0.035 * k;
    localPullY = pointer.vel.y * 0.28 * k - (dy / (Math.sqrt(distSq) + 40)) * R * 0.035 * k;
  }

  const rawSocket = add(arm.socket, {
    x: socketSway.x + pointer.parallax.x * 0.15 + localPullX,
    y: socketSway.y + pointer.parallax.y * 0.15 + localPullY,
  });

  const socketPt: Vec = {
    x: lerp(core.x, rawSocket.x, unfurlInner),
    y: lerp(core.y, rawSocket.y, unfurlInner),
  };

  const tangentAngle =
    Math.atan2(arm.socketTangent.y, arm.socketTangent.x) + 0.028 * deepWave;
  const T_sock = { x: Math.cos(tangentAngle), y: Math.sin(tangentAngle) };

  const innerDist = Math.hypot(socketPt.x - core.x, socketPt.y - core.y);
  const c1 = add(
    core,
    polar(innerDist * 0.46, arm.coreAngle + 0.04 * slowWave),
  );
  const c2: Vec = {
    x: socketPt.x - T_sock.x * innerDist * 0.38,
    y: socketPt.y - T_sock.y * innerDist * 0.38,
  };

  const rawTip = add(
    arm.cornerTip,
    polar(R * 0.12 * deepWave, arm.cornerAngle + Math.PI * 0.5),
  );
  const tipPt: Vec = {
    x: lerp(socketPt.x, rawTip.x, unfurlOuter),
    y: lerp(socketPt.y, rawTip.y, unfurlOuter),
  };

  const outerDist = Math.hypot(tipPt.x - socketPt.x, tipPt.y - socketPt.y);
  // d1 is collinear with c2 -> socketPt so the spine is 100% kink-free at the socket
  const d1: Vec = {
    x: socketPt.x + T_sock.x * outerDist * 0.32,
    y: socketPt.y + T_sock.y * outerDist * 0.32,
  };
  const d2 = add(
    socketPt,
    polar(
      outerDist * 0.68,
      lerp(tangentAngle, arm.cornerAngle, 0.65) - 0.03 * slowWave,
    ),
  );

  const socketIdx = Math.round((SPINE_SAMPLES - 1) * SOCKET_U);
  const pts: Vec[] = new Array(SPINE_SAMPLES);

  for (let i = 0; i <= socketIdx; i++) {
    const t = i / socketIdx;
    pts[i] = bezier(core, c1, c2, socketPt, t);
  }
  const outerCount = SPINE_SAMPLES - 1 - socketIdx;
  for (let i = 1; i <= outerCount; i++) {
    const t = i / outerCount;
    pts[socketIdx + i] = bezier(socketPt, d1, d2, tipPt, t);
  }

  const tangents: Vec[] = new Array(SPINE_SAMPLES);
  const normals: Vec[] = new Array(SPINE_SAMPLES);
  for (let i = 0; i < SPINE_SAMPLES; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(SPINE_SAMPLES - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    tangents[i] = { x: tx, y: ty };
    normals[i] = { x: -ty, y: tx };
  }

  return { pts, normals, tangents, socketPt, tipPt };
}

/**
 * Evaluates a filament's exact 2D position along its parent arm spine at parameter u in [0, 1],
 * combining the Venturi-Caustic waist envelope, optical braid crossover, and smooth travelling waves.
 */
function evaluateArmFilamentPoint(
  f: ArmFilament,
  spine: SpineFrame,
  u: number,
  R: number,
  time: number,
  armLevel: number,
  callHeat: number,
  solitonBoost: number,
  pointer: PointerField,
): Vec {
  const idxFloat = clamp(u, 0, 1) * (SPINE_SAMPLES - 1);
  const i0 = Math.min(SPINE_SAMPLES - 2, Math.floor(idxFloat));
  const frac = idxFloat - i0;

  const p0 = spine.pts[i0]!;
  const p1 = spine.pts[i0 + 1]!;
  const n0 = spine.normals[i0]!;
  const n1 = spine.normals[i0 + 1]!;

  const cx = lerp(p0.x, p1.x, frac);
  const cy = lerp(p0.y, p1.y, frac);
  const nx = lerp(n0.x, n1.x, frac);
  const ny = lerp(n0.y, n1.y, frac);

  // Fuller, sculptural caustic waist at the node socket so the nodes have rich volume and presence
  const waistRadius = R * lerp(0.064, 0.038, armLevel) * (1 - 0.16 * callHeat);

  let envelope = 0;
  let braidSign = f.xi;

  if (u <= SOCKET_U) {
    const s = u / SOCKET_U; // 0 .. 1 from core to socket
    // Lush, wide cathedral-lens spindle belly between the core and the node waist
    const spindleBell = Math.sin(Math.PI * Math.pow(s, 0.84));
    const bellyWidth = R * (0.24 + 0.035 * (1 - armLevel));
    const crossoverBlend = lerp(1, f.crossover, 0.5 - 0.5 * Math.cos(Math.PI * s));
    braidSign = f.xi * crossoverBlend;
    envelope = bellyWidth * spindleBell + waistRadius * Math.sin(s * Math.PI * 0.5);
  } else {
    const s = (u - SOCKET_U) / (1 - SOCKET_U); // 0 .. 1 from socket out past the viewport corner
    braidSign = f.xi * f.crossover;
    // Vast, sweeping trumpet fan that fills the upper and corner quadrants of the stage
    const smoothStart = s * s * (3 - 2 * s);
    const powerFlare = Math.pow(s, 1.24);
    const flare = (smoothStart * 0.28 + powerFlare * 0.72) * R * 2.55 * f.flareSpread;
    envelope = waistRadius + flare;
  }

  // Ultra-smooth, liquid-silk travelling biharmonic wave along the filament
  const waveSpeed = (0.72 + 0.75 * callHeat) * f.freqMul;
  const wave1 = Math.sin(u * 5.6 * f.freqMul - time * waveSpeed + f.phase);
  const wave2 = Math.cos(u * 9.2 * f.freqMul - time * waveSpeed * 1.38 - f.phase * 1.15);
  const waveAmp =
    R *
    (0.012 + 0.052 * Math.pow(u, 1.15)) *
    (1 + 0.32 * callHeat + 0.45 * solitonBoost);

  const offset = braidSign * envelope + (wave1 * 0.74 + wave2 * 0.26) * waveAmp;

  let px = cx + nx * offset;
  let py = cy + ny * offset;

  // Fluid-magnetic cursor interaction: filaments part around the cursor, comb along its velocity vector,
  // and ripple with harmonic wake waves as the mouse flows over them
  if (pointer.presence > 0.005 && u > 0.02) {
    const dx = px - pointer.pos.x;
    const dy = py - pointer.pos.y;
    const distSq = dx * dx + dy * dy;
    const sigma = R * 0.38;
    const twoSigmaSq = 2 * sigma * sigma;

    if (distSq < twoSigmaSq * 3.2) {
      const k = pointer.presence * Math.exp(-distSq / twoSigmaSq);
      const corePin = smoothstep(0.02, 0.12, u);
      const elasticity = 0.58 + 0.55 * Math.abs(f.xi);
      const dist = Math.sqrt(distSq) + 22;

      // 1) Soft magnetic parting away from cursor center + strand-specific vortex swirl
      const partMag = R * 0.095 * k * corePin * elasticity;
      const partX = (dx / dist) * partMag;
      const partY = (dy / dist) * partMag;

      // 2) Viscous brush drag along the cursor's velocity vector
      const dragX = pointer.vel.x * 0.45 * k * corePin * elasticity;
      const dragY = pointer.vel.y * 0.45 * k * corePin * elasticity;

      // 3) Local harmonic wake ripple along the filament normal
      const wakeRipple =
        Math.sin(dist * 0.065 - time * 3.8 + f.phase) *
        R *
        0.028 *
        k *
        corePin *
        (0.5 + 0.015 * Math.hypot(pointer.vel.x, pointer.vel.y));

      px += partX + dragX + nx * wakeRipple;
      py += partY + dragY + ny * wakeRipple;
    }
  }

  return {
    x: px,
    y: py,
  };
}

function traceSmoothPolyline(ctx: CanvasRenderingContext2D, pts: Vec[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

function evaluateHorizonCurve(
  h: HorizonFilament,
  L: StageLayout,
  time: number,
  intro: number,
  wingBoost: number,
  pointer: PointerField,
): [Vec, Vec, Vec, Vec, Vec, Vec, Vec] {
  const { core, scale: S, radius: R } = L;
  const reach = singularityUnfurl(intro, h.stagger);
  const swayA = Math.sin(time * 0.28 + h.phase);
  const swayB = Math.cos(time * 0.21 + h.phase * 1.3);

  const waist: Vec = {
    x: core.x,
    y: core.y + h.waistOffset * R * reach,
  };

  const lAngle = h.leftAngle + 0.034 * swayA * (1 + 0.35 * wingBoost);
  const rAngle = h.rightAngle + 0.034 * swayB * (1 + 0.35 * wingBoost);

  const lDist = h.leftReach * S * reach;
  const rDist = h.rightReach * S * reach;

  const pLeft = add(core, polar(lDist, lAngle));
  const pRight = add(core, polar(rDist, rAngle));

  const bridgeAngle = (rAngle + (lAngle - Math.PI)) * 0.5 + 0.025 * swayA;
  const pull = Math.min(lDist, rDist) * 0.34;
  const tVec = { x: Math.cos(bridgeAngle) * pull, y: Math.sin(bridgeAngle) * pull };

  const deflectPoint = (pt: Vec): Vec => {
    if (pointer.presence <= 0.005) return pt;
    const dx = pt.x - pointer.pos.x;
    const dy = pt.y - pointer.pos.y;
    const distSq = dx * dx + dy * dy;
    const sigma = R * 0.48;
    const k = pointer.presence * Math.exp(-distSq / (2 * sigma * sigma));
    if (k < 0.002) return pt;
    const dist = Math.sqrt(distSq) + 30;
    return {
      x: pt.x + (dx / dist) * R * 0.08 * k + pointer.vel.x * 0.38 * k,
      y: pt.y + (dy / dist) * R * 0.08 * k + pointer.vel.y * 0.38 * k,
    };
  };

  const cLeft1 = deflectPoint(add(pLeft, polar(lDist * 0.38, lAngle + Math.PI + h.curvature)));
  const cLeft2 = deflectPoint({ x: waist.x - tVec.x, y: waist.y - tVec.y });

  const cRight1 = deflectPoint({ x: waist.x + tVec.x, y: waist.y + tVec.y });
  const cRight2 = deflectPoint(add(pRight, polar(rDist * 0.38, rAngle + Math.PI - h.curvature)));

  return [pLeft, cLeft1, cLeft2, waist, cRight1, cRight2, pRight];
}

function pointOnHorizonCurve(
  curve: [Vec, Vec, Vec, Vec, Vec, Vec, Vec],
  u: number,
): Vec {
  if (u <= 0.5) {
    return bezier(curve[0], curve[1], curve[2], curve[3], u * 2);
  }
  return bezier(curve[3], curve[4], curve[5], curve[6], (u - 0.5) * 2);
}

/**
 * Mathematically engineered Optical Singularity Core using:
 * 1) A 16-stop analytical Moffat Point-Spread Function (PSF):
 *      I(r) = (1 + (r / r_0)^2)^(-beta)
 *    which is C^infinity smooth (eliminating Mach-band rings from 3-stop gradients)
 *    paired with a continuous Planckian blackbody color-temperature shift.
 * 2) An anisotropic elliptical caustic lens (aligned with the filament waist) so the
 *    luminance emerges organically from the converging strands rather than sitting
 *    on top like a round sticker.
 * 3) 36 logarithmic-spiral caustic micro-involutes woven into the core waist.
 */
function renderOpticalSingularityCore(
  ctx: CanvasRenderingContext2D,
  core: Vec,
  R: number,
  S: number,
  time: number,
  energy: number,
  introEase: number,
  globalCallHeat: number,
  isLight: boolean,
) {
  if (introEase <= 0.005) return;

  const breathe = 1 + 0.032 * Math.sin(time * 0.65) + 0.05 * energy;

  // Helper to build a 16-stop Moffat PSF gradient with zero Mach banding
  const createMoffatGradient = (
    radius: number,
    coreScaleR: number,
    beta: number,
    peakAlpha: number,
    innerRgb: Rgb,
    midRgb: Rgb,
    outerRgb: Rgb,
  ) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    const stops = 16;
    for (let i = 0; i <= stops; i++) {
      const u = i / stops; // 0 .. 1
      const rNorm = (u * radius) / coreScaleR;
      // Analytical Moffat PSF: I(r) = (1 + r^2)^(-beta)
      const moffat = Math.pow(1 + rNorm * rNorm, -beta);
      // Smooth window at u = 1 so the outer boundary is 100% imperceptible
      const windowFade = 1 - u * u * (3 - 2 * u);
      const a = clamp(peakAlpha * moffat * windowFade, 0, 1);

      // Continuous Planckian-like spectral shift from inner -> mid -> outer
      const rgb =
        u < 0.35
          ? mixRgb(innerRgb, midRgb, u / 0.35)
          : mixRgb(midRgb, outerRgb, (u - 0.35) / 0.65);
      g.addColorStop(u, `rgba(${rgb}, ${a})`);
    }
    return g;
  };

  ctx.save();
  ctx.translate(core.x, core.y);
  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";

  // 1. Wide Anisotropic Elliptical Atmospheric Caustic Field (hugs the filament waist)
  ctx.save();
  ctx.scale(1.38, 0.82);
  const fieldR = S * 0.36 * breathe * introEase;
  const fieldInner: Rgb = isLight ? [226, 166, 38] : [255, 224, 152];
  const fieldMid: Rgb = isLight ? [208, 138, 18] : [242, 174, 62];
  const fieldOuter: Rgb = isLight
    ? [184, 112, 10]
    : globalCallHeat > 0.05
      ? mixRgbTuple([198, 116, 28], [238, 48, 42], globalCallHeat * 0.35)
      : [198, 116, 28];

  ctx.fillStyle = createMoffatGradient(
    fieldR,
    fieldR * 0.24,
    1.85,
    (isLight ? 0.26 : 0.22) * (1 + 0.18 * energy) * introEase,
    fieldInner,
    fieldMid,
    fieldOuter,
  );
  ctx.beginPath();
  ctx.arc(0, 0, fieldR, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 2. Logarithmic-Spiral Caustic Micro-Involutes Woven Into the Core Waist
  const involuteCount = 36;
  const involuteReach = R * 0.22 * breathe * introEase;
  const invColor = isLight ? "184, 112, 10" : "255, 228, 162";
  const invGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, involuteReach);
  invGrad.addColorStop(0, `rgba(${invColor}, ${(isLight ? 0.28 : 0.22) * introEase})`);
  invGrad.addColorStop(0.45, `rgba(${invColor}, ${(isLight ? 0.11 : 0.08) * introEase})`);
  invGrad.addColorStop(1, `rgba(${invColor}, 0)`);

  ctx.beginPath();
  for (let i = 0; i < involuteCount; i++) {
    const baseTheta = (i / involuteCount) * TAU + time * 0.08 * (i % 2 === 0 ? 1 : -1);
    const curl = (i % 2 === 0 ? 1 : -1) * 0.42;
    const r1 = involuteReach * 0.35;
    const r2 = involuteReach * (0.72 + 0.24 * Math.sin(i * 1.7 + time * 0.4));
    const c1x = Math.cos(baseTheta + curl * 0.4) * r1 * 1.25;
    const c1y = Math.sin(baseTheta + curl * 0.4) * r1 * 0.82;
    const c2x = Math.cos(baseTheta + curl * 0.8) * r2 * 0.85;
    const c2y = Math.sin(baseTheta + curl * 0.8) * r2 * 0.68;
    const ex = Math.cos(baseTheta + curl) * r2 * 1.15;
    const ey = Math.sin(baseTheta + curl) * r2 * 0.78;
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
  }
  ctx.lineWidth = isLight ? 0.65 : 0.5;
  ctx.strokeStyle = invGrad;
  ctx.stroke();

  // 3. Subtle Anamorphic Horizontal Caustic Whisper (cinema optical lens waist)
  ctx.save();
  ctx.scale(2.65, 0.22);
  const anamorphicR = R * 0.28 * breathe * introEase;
  const anaInner: Rgb = isLight ? [196, 124, 12] : [255, 242, 206];
  const anaMid: Rgb = isLight ? [218, 152, 28] : [248, 192, 86];
  ctx.fillStyle = createMoffatGradient(
    anamorphicR,
    anamorphicR * 0.22,
    2.2,
    (isLight ? 0.32 : 0.28) * (1 + 0.22 * energy) * introEase,
    anaInner,
    anaMid,
    fieldOuter,
  );
  ctx.beginPath();
  ctx.arc(0, 0, anamorphicR, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 4. Inner Moffat Caustic Core (Soft, Silk-Blended Singularity Heart — No Hard White Sticker)
  ctx.save();
  ctx.scale(1.18, 0.9);
  const heartR = R * 0.19 * breathe * introEase;
  const heartInner: Rgb = isLight ? [156, 88, 6] : [255, 248, 228];
  const heartMid: Rgb = isLight ? [198, 128, 16] : [252, 212, 124];
  const heartOuter: Rgb = isLight ? [228, 168, 42] : [236, 162, 52];

  ctx.fillStyle = createMoffatGradient(
    heartR,
    heartR * 0.2,
    2.45,
    (isLight ? 0.62 : 0.56) * (1 + 0.16 * energy) * introEase,
    heartInner,
    heartMid,
    heartOuter,
  );
  ctx.beginPath();
  ctx.arc(0, 0, heartR, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/* ============================================================================
   COMPONENT
   ============================================================================ */

export function NeuralStage({
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
  const socketCount = signal.sockets.length;

  useEffect(() => {
    signalRef.current = signal;
    onSelectRef.current = onSelectSocket;
    redrawRef.current?.();
  }, [signal, onSelectSocket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createNeuralField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const armLevels: number[] = signalRef.current.sockets.map((s) => SOCKET_TARGET_LEVEL[s]);
    // Per-arm trailing-edge crimson intensity (connected nodes transition toward crimson near the outer edges)
    const armTrailingEdgeHeat: number[] = signalRef.current.sockets.map((s) =>
      s === "occupied" ? 0.65 : 0,
    );
    const prevStates: SocketVisual[] = [...signalRef.current.sockets];
    const solitons: SolitonWave[] = [];
    const ripples: CoreRipple[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    let energy = BRAIN_TARGET_ENERGY[signalRef.current.brain];
    let globalCallHeat = 0;
    let autoTransferClock = 3.8;
    let autoTransferIdx = 0;
    let rippleClock = 0;
    let wakeShockFired = false;

    const pointerTarget: Vec = { x: 0, y: 0 };
    const pointerSmooth: Vec = { x: 0, y: 0 };
    const pointerPosSmooth: Vec = { x: -9999, y: -9999 };
    const pointerVelSmooth: Vec = { x: 0, y: 0 };
    let pointerPresence = 0;
    let pointerClient: Vec | null = null;

    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let smoothTime = 0;

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
      pointerTarget.x = ((x / rect.width) - 0.5) * 28;
      pointerTarget.y = ((y / rect.height) - 0.5) * 28;
    };

    const onPointerLeave = () => {
      pointerClient = null;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };

    const onClick = (e: MouseEvent) => {
      if (!onSelectRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const clickPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      for (let i = 0; i < layout.sockets.length; i++) {
        const sock = layout.sockets[i]!;
        if (Math.hypot(clickPt.x - sock.x, clickPt.y - sock.y) <= 28) {
          launchInformationWave(-1, i);
          onSelectRef.current(i);
          return;
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    /**
     * Spawns a flowing crimson wave along the lines between `fromSocket` and `toSocket`
     * (no orbs — the flowing lines themselves turn crimson red where the information travels).
     */
    const launchInformationWave = (fromSocket: number, toSocket: number) => {
      globalCallHeat = Math.max(globalCallHeat, 1);
      if (fromSocket >= 0 && fromSocket < socketCount) {
        armTrailingEdgeHeat[fromSocket] = 1;
        if (!reduceMotion) {
          solitons.push({
            arm: fromSocket,
            u: 0.72,
            speed: 0.65,
            direction: -1,
            intensity: 1,
          });
        }
      }
      if (toSocket >= 0 && toSocket < socketCount) {
        armTrailingEdgeHeat[toSocket] = 1;
        if (!reduceMotion) {
          solitons.push({
            arm: toSocket,
            u: fromSocket >= 0 ? -0.35 : 0,
            speed: 0.68,
            direction: 1,
            intensity: 1,
          });
        }
      } else if (toSocket < 0 && fromSocket < 0) {
        signalRef.current.sockets.forEach((s, idx) => {
          if (s === "occupied") {
            armTrailingEdgeHeat[idx] = 1;
            if (!reduceMotion) {
              solitons.push({
                arm: idx,
                u: idx * -0.08,
                speed: 0.68,
                direction: 1,
                intensity: 1,
              });
            }
          }
        });
      }
      if (!reduceMotion) {
        ripples.push({ u: 0, crimson: true, strength: 0.85 });
      }
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const L = layout;
      const { width, height, core, radius: R, scale: S } = L;

      // ——— 1. Pure Pitch-Black Background (or Warm Gallery Alabaster in Light Mode) ———
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

      // ——— 2. Phase I Opening Silence (t < 1.60s): Only "Waking up Nexus…" is on screen ———
      if (!reduceMotion && time < WAKE_SILENCE_SECONDS) {
        return;
      }

      const activeTime = reduceMotion ? 10 : Math.max(0, time - WAKE_SILENCE_SECONDS);
      const intro = reduceMotion ? 1 : Math.min(1, activeTime / INTRO_SPRING_SECONDS);
      const introEase = 1 - Math.pow(1 - intro, 3);

      // Smooth pointer parallax, position, and velocity wake field
      const pFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5);
      pointerSmooth.x = lerp(pointerSmooth.x, pointerTarget.x, pFollow);
      pointerSmooth.y = lerp(pointerSmooth.y, pointerTarget.y, pFollow);

      const posFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 14);
      if (pointerClient) {
        const instVx = clamp(pointerClient.x - pointerPosSmooth.x, -90, 90);
        const instVy = clamp(pointerClient.y - pointerPosSmooth.y, -90, 90);
        pointerPosSmooth.x = lerp(pointerPosSmooth.x, pointerClient.x, posFollow);
        pointerPosSmooth.y = lerp(pointerPosSmooth.y, pointerClient.y, posFollow);
        pointerVelSmooth.x = lerp(pointerVelSmooth.x, instVx, 1 - Math.exp(-dt * 10));
        pointerVelSmooth.y = lerp(pointerVelSmooth.y, instVy, 1 - Math.exp(-dt * 10));
        pointerPresence = lerp(pointerPresence, 1, 1 - Math.exp(-dt * 8));
      } else {
        pointerVelSmooth.x *= Math.exp(-dt * 6);
        pointerVelSmooth.y *= Math.exp(-dt * 6);
        pointerPresence = lerp(pointerPresence, 0, 1 - Math.exp(-dt * 3.5));
      }

      const pointerField: PointerField = {
        pos: pointerPosSmooth,
        vel: pointerVelSmooth,
        parallax: pointerSmooth,
        presence: pointerPresence,
      };

      // Detect state transitions that call nodes or send information between nodes
      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") {
          launchInformationWave(-1, activeSocket ?? -1);
        }
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

      // Periodic information waves flowing between connected nodes
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

      const targetGlobalCall = isCallingAnyNode ? 1 : 0;
      globalCallHeat = lerp(
        globalCallHeat,
        targetGlobalCall,
        reduceMotion ? 1 : 1 - Math.exp(-dt * (targetGlobalCall > globalCallHeat ? 4.8 : 1.4)),
      );

      energy = lerp(
        energy,
        BRAIN_TARGET_ENERGY[brain],
        reduceMotion ? 1 : 1 - Math.exp(-dt * 3.0),
      );

      // Update per-arm levels (1.0 when connected, dark ~0.10 when disconnected) & trailing-edge crimson heat
      sockets.forEach((s, i) => {
        const prev = prevStates[i];
        if (prev !== s) {
          prevStates[i] = s;
          if (s === "occupied") {
            armTrailingEdgeHeat[i] = 1.0;
            launchInformationWave(-1, i);
          }
        }

        let hoverBoost = 0;
        if (pointerClient && L.sockets[i]) {
          const d = Math.hypot(pointerClient.x - L.sockets[i]!.x, pointerClient.y - L.sockets[i]!.y);
          hoverBoost = clamp(1 - d / (R * 0.45), 0, 1) * (s === "occupied" ? 0.16 : 0.08);
        }
        const targetLevel = clamp(SOCKET_TARGET_LEVEL[s] + hoverBoost, 0, 1.15);
        armLevels[i] = lerp(
          armLevels[i] ?? targetLevel,
          targetLevel,
          reduceMotion ? 1 : 1 - Math.exp(-dt * 3.5),
        );

        const armIsCalled =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && s === "occupied");
        // Connected arms maintain a crimson transition near their outer trailing edges (0.65),
        // surging to 1.0 when newly connected or actively transferring information
        const targetEdgeCrimson =
          s === "occupied" ? (armIsCalled ? 1.0 : Math.max(0.65, globalCallHeat * 0.9)) : 0;
        armTrailingEdgeHeat[i] = lerp(
          armTrailingEdgeHeat[i] ?? 0,
          targetEdgeCrimson,
          reduceMotion ? 1 : 1 - Math.exp(-dt * (targetEdgeCrimson > (armTrailingEdgeHeat[i] ?? 0) ? 5.0 : 1.4)),
        );
      });

      // Advance crimson information waves along the arms
      for (let i = solitons.length - 1; i >= 0; i--) {
        const sol = solitons[i]!;
        if (!reduceMotion) sol.u += sol.speed * sol.direction * dt;
        if (sol.direction > 0 && sol.u >= 1.2) solitons.splice(i, 1);
        else if (sol.direction < 0 && sol.u <= -0.15) solitons.splice(i, 1);
      }

      // Opening singularity shockwave when popping to life
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
      ctx.globalAlpha = Math.min(1, intro * 2.4);

      // ——— 3. Deep Atmospheric Singularity Under-Field ———
      const fieldRadius = S * 1.25 * (0.18 + 0.82 * introEase) * (1 + 0.1 * energy);

      // ——— 4. Pre-sample C2 Spine Frames for the 5 Functional Node Arms ———
      const spines = L.arms.map((arm) =>
        sampleArmSpine(arm, L, activeTime, intro, pointerField),
      );

      // ——— 5. Continuous Corner-Sweeping Horizon Wings (Gold Body -> Crimson Near Outer Edges) ———
      const horizonCurves = field.horizonFilaments.map((h) =>
        evaluateHorizonCurve(h, L, activeTime, intro, globalCallHeat, pointerField),
      );

      const anyConnected = sockets.some((s) => s === "occupied");
      const horizonEdgeRed = Math.max(anyConnected ? 0.55 : 0, globalCallHeat);

      field.horizonLayerBatches.forEach((indices, layerIdx) => {
        if (!indices.length) return;
        const layer = DEPTH_LAYERS[layerIdx]!;
        const baseRgb = mixRgbTuple(goldMid, goldBright, layer.hot);
        const coreColor = `${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}`;
        const midTrailColor = mixRgb(baseRgb, crimsonHot, horizonEdgeRed * 0.78);
        const outerTrailColor = mixRgb(goldDeep, crimsonPure, horizonEdgeRed * 0.96);
        const a = layer.alpha * (isLight ? 0.68 : 0.52) * alphaScale * (0.75 + 0.35 * energy);

        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, fieldRadius);
        g.addColorStop(0, `rgba(${coreColor}, ${Math.min(1, a * 2.1)})`);
        g.addColorStop(0.28, `rgba(${coreColor}, ${Math.min(1, a * 1.15)})`);
        g.addColorStop(0.56, `rgba(${coreColor}, ${a * 0.56})`);
        // Near the outer edges, the flowing lines transition toward crimson red
        g.addColorStop(0.74, `rgba(${midTrailColor}, ${a * (0.34 + 0.34 * horizonEdgeRed)})`);
        g.addColorStop(0.9, `rgba(${outerTrailColor}, ${a * (0.18 + 0.3 * horizonEdgeRed)})`);
        g.addColorStop(1, `rgba(${outerTrailColor}, 0)`);

        ctx.beginPath();
        for (const idx of indices) {
          const c = horizonCurves[idx]!;
          ctx.moveTo(c[0].x, c[0].y);
          ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
          ctx.bezierCurveTo(c[4].x, c[4].y, c[5].x, c[5].y, c[6].x, c[6].y);
        }
        ctx.lineWidth = layer.width * (isLight ? 0.98 : 0.85);
        ctx.strokeStyle = g;
        ctx.stroke();
      });

      // Lower-lateral horizon corner spines
      L.horizonWings.forEach((wing: HorizonWingGeometry) => {
        const reach = singularityUnfurl(intro, 0.22);
        const c1 = { x: lerp(core.x, wing.c1.x, reach), y: lerp(core.y, wing.c1.y, reach) };
        const c2 = { x: lerp(core.x, wing.c2.x, reach), y: lerp(core.y, wing.c2.y, reach) };
        const tip = { x: lerp(core.x, wing.tip.x, reach), y: lerp(core.y, wing.tip.y, reach) };
        const wg = ctx.createLinearGradient(core.x, core.y, tip.x, tip.y);
        const goldStr = `${goldMid[0]}, ${goldMid[1]}, ${goldMid[2]}`;
        const edgeStr = mixRgb(goldDeep, crimsonPure, horizonEdgeRed * 0.92);
        wg.addColorStop(0, `rgba(${goldStr}, ${0.22 * alphaScale})`);
        wg.addColorStop(0.55, `rgba(${goldStr}, ${0.09 * alphaScale})`);
        wg.addColorStop(0.82, `rgba(${edgeStr}, ${(0.05 + 0.09 * horizonEdgeRed) * alphaScale})`);
        wg.addColorStop(1, `rgba(${edgeStr}, 0)`);
        ctx.beginPath();
        ctx.moveTo(core.x, core.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tip.x, tip.y);
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = wg;
        ctx.stroke();
      });

      // ——— 6. Subtle Inter-Node Harmonic Bridges between Adjacent Connected Sockets ———
      for (const b of field.bridges) {
        const lvlA = armLevels[b.fromArm] ?? 0;
        const lvlB = armLevels[b.toArm] ?? 0;
        const bridgeStrength = Math.min(lvlA, lvlB);
        if (bridgeStrength < 0.45) continue;

        const pA = spines[b.fromArm]!.socketPt;
        const pB = spines[b.toArm]!.socketPt;
        const mid: Vec = { x: (pA.x + pB.x) * 0.5, y: (pA.y + pB.y) * 0.5 };
        const dirFromCore = Math.atan2(mid.y - core.y, mid.x - core.x);
        const sway = Math.sin(activeTime * 0.5 + b.phase) * R * 0.022;
        const ctrl = add(mid, polar(R * b.archLift + sway, dirFromCore));

        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, pB.x, pB.y);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = `rgba(${goldBright.join(", ")}, ${0.09 * bridgeStrength * alphaScale * introEase})`;
        ctx.stroke();
      }

      // ——— 7. The 5 Primary Functional Node Arms (Continuous C2 Venturi-Caustic Flowing Wave Bundles) ———
      // - Zero artificial radialGlow circles at the nodes!
      // - Connected nodes are lit up in rich molten gold, transitioning near the outer edges to crimson red.
      // - Disconnected nodes go dark (muted dim bronze in dark mode, subtle warm platinum in light mode).
      // - When sending information between nodes, a crimson wave flows directly along the lines!
      const CURVE_STEPS = 28;
      const sampleUs = Array.from({ length: CURVE_STEPS + 1 }, (_, k) => k / CURVE_STEPS);

      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const spine = spines[armIdx]!;
        const level = armLevels[armIdx] ?? 0.1;
        const edgeRed = armTrailingEdgeHeat[armIdx] ?? 0;
        const isConnected = level > 0.35;

        // Check active crimson information wave position along this arm
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
              Math.exp(-(distFromSocket * distFromSocket) / 0.035) * sol.intensity,
            );
          }
        }

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const batch = field.armLayerBatches[armIdx]![layerIdx]!;
          if (!batch.length) continue;

          // Connected arms use full molten 24k gold; disconnected arms use dormant bronze (dark) or warm platinum (light)
          const activeGold = mixRgbTuple(goldMid, goldCore, layer.hot);
          const dormantColor = isLight ? DORMANT_LIGHT_PLATINUM : DORMANT_BRONZE;
          const baseRgb = isConnected
            ? activeGold
            : mixRgbTuple(dormantColor, activeGold, clamp((level - 0.08) * 1.5, 0, 1));
          const baseRgbStr = `${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}`;

          const baseAlpha =
            layer.alpha *
            alphaScale *
            (isConnected ? 0.36 + 1.04 * level : level * (isLight ? 0.85 : 0.65)) *
            (1 + 0.25 * energy + 0.38 * waveStrength);

          const armGrad = ctx.createLinearGradient(
            core.x,
            core.y,
            spine.tipPt.x,
            spine.tipPt.y,
          );

          // Sample multi-stop gradient along u in [0, 1]:
          //   - Core through node waist and mid-arm (0.0 -> 0.62): Pure Gold (unless an active crimson info wave is passing through u!)
          //   - Near the outer trailing edges (0.68 -> 1.0): Transitions toward Crimson Red on connected arms!
          const stops = [0, 0.16, 0.34, 0.5, 0.64, 0.76, 0.88, 1.0];
          for (const u of stops) {
            let infoWaveRed = 0;
            if (waveCenterU >= 0 && waveStrength > 0.01) {
              const d = (u - waveCenterU) / 0.14;
              infoWaveRed = Math.exp(-0.5 * d * d) * waveStrength;
            }

            const trailingEdgeRed = smoothstep(0.64, 0.9, u) * edgeRed;
            const redMix = clamp(Math.max(infoWaveRed * 0.96, trailingEdgeRed), 0, 1);

            const targetCrimson = u > 0.82 ? crimsonPure : crimsonHot;
            const stopColor =
              redMix > 0.02
                ? mixRgb(baseRgb, targetCrimson, redMix)
                : baseRgbStr;

            // Natural brightness profile along the arm
            const uProfile =
              u === 0
                ? 1.85
                : u <= 0.36
                  ? 1.38
                  : u <= 0.64
                    ? 0.96
                    : u <= 0.88
                      ? 0.5 + 0.36 * redMix
                      : 0;
            const waveBoost = 1 + 0.55 * infoWaveRed;
            const stopAlpha = clamp(baseAlpha * uProfile * waveBoost, 0, 1);

            if (u === 1.0) {
              armGrad.addColorStop(1.0, `rgba(${mixRgb(goldDeep, crimsonDeep, edgeRed)}, 0)`);
            } else {
              armGrad.addColorStop(u, `rgba(${stopColor}, ${stopAlpha})`);
            }
          }

          ctx.beginPath();
          for (const fIdx of batch) {
            const f = field.armFilaments[fIdx]!;
            const fReach = Math.min(1, singularityUnfurl(intro, f.stagger));
            const pts: Vec[] = new Array(CURVE_STEPS + 1);
            for (let k = 0; k <= CURVE_STEPS; k++) {
              const u = sampleUs[k]! * fReach;
              pts[k] = evaluateArmFilamentPoint(
                f,
                spine,
                u,
                R,
                activeTime,
                level,
                edgeRed * 0.5 + waveStrength * 0.5,
                armSolitonBoost,
                pointerField,
              );
            }
            traceSmoothPolyline(ctx, pts);
          }

          ctx.lineWidth = layer.width * (0.85 + 0.45 * level + 0.2 * waveStrength) * (isLight ? 1.18 : 1);
          ctx.strokeStyle = armGrad;
          ctx.stroke();

          // In Light Mode, add a fine sunlit 24k champagne-gold lustre thread along the inner core strands of connected arms
          if (isLight && isConnected && layerIdx === 3) {
            const lustreGrad = ctx.createLinearGradient(core.x, core.y, spine.tipPt.x, spine.tipPt.y);
            lustreGrad.addColorStop(0, "rgba(255, 226, 138, 0.85)");
            lustreGrad.addColorStop(0.34, "rgba(244, 192, 72, 0.72)");
            lustreGrad.addColorStop(0.64, "rgba(232, 168, 42, 0.35)");
            lustreGrad.addColorStop(1, "rgba(232, 168, 42, 0)");
            ctx.lineWidth = 0.32;
            ctx.strokeStyle = lustreGrad;
            ctx.stroke();
          }
        }
      }

      // ——— 8. Expanding Harmonic Ripples from the Singularity Core ———
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

      // ——— 9. Flowing Photons Along the Connected Node Arms & Horizon Wings ———
      const flowSpeedMul = 1 + 1.85 * energy;
      for (const pt of field.armPhotons) {
        const level = armLevels[pt.arm] ?? 0.1;
        if (level < 0.25) continue; // Keep disconnected arms dark
        const edgeRed = armTrailingEdgeHeat[pt.arm] ?? 0;
        const f = field.armFilaments[pt.filamentIdx]!;
        const spine = spines[pt.arm]!;

        const distFromWaist = Math.abs(pt.u - SOCKET_U);
        const venturiBoost = 1 + 0.65 * Math.exp(-(distFromWaist * distFromWaist) / 0.025);

        if (!reduceMotion) {
          pt.u = (pt.u + pt.speed * dt * flowSpeedMul * venturiBoost * (0.45 + 0.75 * level)) % 1;
        }

        const uEff = pt.u * Math.min(1, singularityUnfurl(intro, f.stagger));
        const pos = evaluateArmFilamentPoint(
          f,
          spine,
          uEff,
          R,
          activeTime,
          level,
          edgeRed * 0.4,
          0,
          pointerField,
        );

        const edgeFade = Math.sin(pt.u * Math.PI);
        const isCrimsonTail = edgeRed > 0.05 && pt.u > 0.66;
        const photonBase = isLight ? GOLD_LIGHT_BRIGHT : goldCore;
        ctx.fillStyle = isCrimsonTail
          ? `rgb(${mixRgb(photonBase, crimsonPure, clamp((pt.u - 0.66) * 2.8 * edgeRed, 0, 1))})`
          : `rgb(${photonBase[0]}, ${photonBase[1]}, ${photonBase[2]})`;

        ctx.globalAlpha = introEase * pt.alpha * edgeFade * level;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pt.size, 0, TAU);
        ctx.fill();
      }

      for (const hp of field.horizonPhotons) {
        if (!reduceMotion) {
          hp.u = (hp.u + hp.speed * dt * flowSpeedMul) % 1;
        }
        const curve = horizonCurves[hp.strandIdx]!;
        const pos = pointOnHorizonCurve(curve, hp.u);
        const edgeDist = Math.abs(hp.u - 0.5) * 2;
        const edgeFade = Math.sin(hp.u * Math.PI);
        const hPhotonBase = isLight ? GOLD_LIGHT_MID : goldBright;
        ctx.fillStyle =
          horizonEdgeRed > 0.05 && edgeDist > 0.64
            ? `rgb(${mixRgb(hPhotonBase, crimsonPure, (edgeDist - 0.64) * 2.6 * horizonEdgeRed)})`
            : `rgb(${hPhotonBase[0]}, ${hPhotonBase[1]}, ${hPhotonBase[2]})`;
        ctx.globalAlpha = introEase * hp.alpha * edgeFade;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, hp.size, 0, TAU);
        ctx.fill();
      }

      // ——— 10. Mathematically Engineered Moffat PSF & Anisotropic Caustic Singularity Core ———
      renderOpticalSingularityCore(
        ctx,
        core,
        R,
        S,
        activeTime,
        energy,
        introEase,
        globalCallHeat,
        isLight,
      );
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      layout = computeStageLayout(width, height, socketCount);
      if (reduceMotion) draw(8, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const rawDt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      // Exponentially smoothed delta-time for silky, jitter-free 60-120fps animation
      smoothDt = lerp(smoothDt, rawDt, 0.22);
      smoothTime += smoothDt;
      if (!signalRef.current.paused) draw(smoothTime, smoothDt);
      frame = requestAnimationFrame(loop);
    };

    redrawRef.current = reduceMotion ? () => draw(8, 0) : null;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
