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
  radialGlow,
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
const INTRO_SECONDS = 2.45;
const SOCKET_U = 0.34; // Parametric position of the node socket waist along each arm (0 = core, 1 = beyond screen corner)
const SPINE_SAMPLES = 56;
const FILAMENTS_PER_ARM = 44;
const HORIZON_STRANDS = 88;

const GOLD_CORE: Rgb = [255, 250, 232];
const GOLD_BRIGHT: Rgb = [255, 224, 156];
const GOLD_MID: Rgb = [246, 182, 74];
const GOLD_DEEP: Rgb = [212, 128, 34];

const GOLD_LIGHT_CORE: Rgb = [176, 108, 10];
const GOLD_LIGHT_MID: Rgb = [198, 128, 18];
const GOLD_LIGHT_DEEP: Rgb = [146, 86, 8];

const CRIMSON_HOT: Rgb = [255, 108, 86];
const CRIMSON_PURE: Rgb = [252, 54, 48];
const CRIMSON_DEEP: Rgb = [198, 22, 32];

const SOCKET_TARGET_LEVEL: Record<SocketVisual, number> = {
  occupied: 1.0,
  open: 0.46,
  locked: 0.22,
};

const BRAIN_TARGET_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.16,
  thinking: 1.0,
  responding: 0.76,
};

/** Four optical depth layers per arm: wide atmospheric bloom -> medium silk -> crisp filament -> specular core hair. */
const DEPTH_LAYERS = [
  { width: 2.4, alpha: 0.055, hot: 0.0 },
  { width: 1.05, alpha: 0.16, hot: 0.35 },
  { width: 0.62, alpha: 0.31, hot: 0.7 },
  { width: 0.38, alpha: 0.52, hot: 1.0 },
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

type ArmFilament = {
  arm: number;
  layer: number;
  /** Signed transverse coordinate in [-1, 1] at the spindle belly. */
  xi: number;
  /** Optical crossover factor: +1 stays on same side through waist, -1 crosses through caustic focus. */
  crossover: number;
  /** Outer corner plume fan multiplier. */
  flareSpread: number;
  /** Biharmonic wave phase & frequency modifiers. */
  phase: number;
  freqMul: number;
  /** Singularity wake-up stagger in [0, 1]. */
  stagger: number;
};

type HorizonFilament = {
  layer: number;
  /** -1 = sweeps from upper-left to lower-right; +1 = sweeps from lower-left to upper-right. */
  chirality: -1 | 1;
  /** Transverse waist offset at the singularity core. */
  waistOffset: number;
  /** Angular elevation on the left and right wings (avoids bottom-center negative space). */
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

type StarGrain = {
  arm: number;
  filamentIdx: number;
  u: number;
  normalJitter: number;
  size: number;
  alpha: number;
  phase: number;
};

type SolitonWave = {
  arm: number;
  u: number;
  speed: number;
  intensity: number;
  crimson: boolean;
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
    const r = (i * 0.61803398875 + rnd() * 0.25) % 1;
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
      // Stratified quasi-Gaussian distribution across [-1, 1] so every arm is balanced and silky
      const stratified = ((i + 0.5) / FILAMENTS_PER_ARM) * 2 - 1;
      const xi = clamp(stratified * 0.82 + gauss() * 0.18, -1.15, 1.15);
      const layer = pickLayer(i);
      const idx = armFilaments.length;
      armFilaments.push({
        arm,
        layer,
        xi,
        crossover: i % 3 === 0 ? -0.85 : 0.65,
        flareSpread: between(0.78, 1.32) * (0.65 + 0.55 * Math.abs(xi)),
        phase: rnd() * TAU,
        freqMul: between(0.85, 1.22),
        stagger: clamp(Math.abs(xi) * 0.35 + rnd() * 0.25, 0, 0.65),
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
    // Angles strictly within [-0.72, +0.42] rad of the horizontal axes so bottom-center negative space stays pure black
    const leftLift = between(-0.68, 0.36);
    const rightLift = between(-0.68, 0.36);
    const idx = horizonFilaments.length;
    horizonFilaments.push({
      layer,
      chirality,
      waistOffset: gauss() * 0.018,
      leftAngle: Math.PI - leftLift * chirality,
      rightAngle: rightLift * chirality,
      leftReach: between(0.92, 1.38),
      rightReach: between(0.92, 1.38),
      curvature: gauss() * 0.22,
      phase: rnd() * TAU,
      stagger: between(0.08, 0.72),
    });
    horizonLayerBatches[layer]!.push(idx);
  }

  // Delicate harmonic bridges between adjacent node sockets
  const bridges: SynapticBridge[] = [];
  for (let a = 0; a < armCount - 1; a++) {
    for (let k = 0; k < 5; k++) {
      bridges.push({
        fromArm: a,
        toArm: a + 1,
        archLift: between(-0.14, 0.08) + (k - 2) * 0.035,
        phase: rnd() * TAU,
      });
    }
  }

  // Photons flowing along the 5 functional node arms
  const armPhotons: FlowPhoton[] = Array.from({ length: 340 }, (_, i) => {
    const filamentIdx = i % armFilaments.length;
    const f = armFilaments[filamentIdx]!;
    return {
      arm: f.arm,
      filamentIdx,
      u: rnd(),
      speed: between(0.065, 0.16),
      size: between(0.55, 1.65),
      alpha: between(0.45, 1.0),
    };
  });

  // Photons gliding along the horizon corner wings
  const horizonPhotons: HorizonPhoton[] = Array.from({ length: 120 }, () => ({
    strandIdx: Math.floor(rnd() * horizonFilaments.length),
    u: rnd(),
    speed: between(0.04, 0.1),
    size: between(0.45, 1.3),
    alpha: between(0.32, 0.82),
  }));

  // Fine celestial gold stipple anchored along the filaments
  const grains: StarGrain[] = Array.from({ length: 1100 }, () => {
    const filamentIdx = Math.floor(rnd() * armFilaments.length);
    const f = armFilaments[filamentIdx]!;
    return {
      arm: f.arm,
      filamentIdx,
      u: Math.pow(rnd(), 0.82),
      normalJitter: gauss() * 14,
      size: between(0.45, 1.35),
      alpha: between(0.25, 0.88),
      phase: rnd() * TAU,
    };
  });

  return {
    armFilaments,
    armLayerBatches,
    horizonFilaments,
    horizonLayerBatches,
    bridges,
    armPhotons,
    horizonPhotons,
    grains,
  };
}

/* ============================================================================
   CONTINUOUS C2 DIFFERENTIAL GEOMETRY & ENVELOPE MATH
   ============================================================================ */

/**
 * Relativistic singularity spring curve:
 * At intro = 0, everything is collapsed to a single point at `core` (0.001).
 * Unfurls with smooth harmonic momentum to 1.0.
 */
function singularityUnfurl(intro: number, stagger: number): number {
  const u = clamp((intro - stagger * 0.24) / (1 - stagger * 0.24), 0, 1);
  if (u <= 0) return 0.001;
  const easeOut = 1 - Math.pow(1 - u, 3.4);
  const harmonicOver = Math.sin(u * Math.PI) * 0.028 * (1 - u);
  return clamp(easeOut + harmonicOver, 0.001, 1);
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
  pointerOffset: Vec,
): SpineFrame {
  const { core, radius: R } = L;
  const unfurlInner = singularityUnfurl(intro, 0.06);
  const unfurlOuter = singularityUnfurl(intro, 0.22);

  // Subtle organic breathing of the arm spine
  const slowWave = Math.sin(time * 0.36 + arm.index * 1.45);
  const deepWave = Math.cos(time * 0.24 + arm.index * 2.1);

  const perpAngle = arm.coreAngle + Math.PI * 0.5;
  const socketSway = polar(R * 0.022 * slowWave, perpAngle);

  const rawSocket = add(arm.socket, {
    x: socketSway.x + pointerOffset.x * 0.14,
    y: socketSway.y + pointerOffset.y * 0.14,
  });

  // Scale from singularity core during the opening animation
  const socketPt: Vec = {
    x: lerp(core.x, rawSocket.x, unfurlInner),
    y: lerp(core.y, rawSocket.y, unfurlInner),
  };

  // Ensure exact C1/C2 tangent continuity across the socket waist
  const tangentAngle =
    Math.atan2(arm.socketTangent.y, arm.socketTangent.x) + 0.032 * deepWave;
  const T_sock = { x: Math.cos(tangentAngle), y: Math.sin(tangentAngle) };

  const innerDist = Math.hypot(socketPt.x - core.x, socketPt.y - core.y);
  const c1 = add(
    core,
    polar(innerDist * 0.46, arm.coreAngle + 0.045 * slowWave),
  );
  const c2: Vec = {
    x: socketPt.x - T_sock.x * innerDist * 0.38,
    y: socketPt.y - T_sock.y * innerDist * 0.38,
  };

  const rawTip = add(
    arm.cornerTip,
    polar(R * 0.14 * deepWave, arm.cornerAngle + Math.PI * 0.5),
  );
  const tipPt: Vec = {
    x: lerp(socketPt.x, rawTip.x, unfurlOuter),
    y: lerp(socketPt.y, rawTip.y, unfurlOuter),
  };

  const outerDist = Math.hypot(tipPt.x - socketPt.x, tipPt.y - socketPt.y);
  // d1 is collinear with c2 -> socketPt so the spine is 100% kink-free at the socket!
  const d1: Vec = {
    x: socketPt.x + T_sock.x * outerDist * 0.32,
    y: socketPt.y + T_sock.y * outerDist * 0.32,
  };
  const d2 = add(
    socketPt,
    polar(
      outerDist * 0.68,
      lerp(tangentAngle, arm.cornerAngle, 0.65) - 0.035 * slowWave,
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
 * combining the Venturi-Caustic waist envelope, optical braid crossover, and travelling biharmonic waves.
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

  // Tightness of the caustic waist at the node socket (tightens when occupied & called)
  const waistRadius = R * lerp(0.032, 0.014, armLevel) * (1 - 0.25 * callHeat);

  let envelope = 0;
  let braidSign = f.xi;

  if (u <= SOCKET_U) {
    const s = u / SOCKET_U; // 0 .. 1 from core to socket
    // Smooth spindle belly between core and socket, pinching down to waistRadius at s = 1
    const spindleBell = Math.sin(Math.PI * Math.pow(s, 0.86));
    const bellyWidth = R * (0.125 + 0.025 * (1 - armLevel));
    // Smooth cosine braid transition so crossover strands focus through the socket without any kink
    const crossoverBlend = lerp(1, f.crossover, 0.5 - 0.5 * Math.cos(Math.PI * s));
    braidSign = f.xi * crossoverBlend;
    envelope = bellyWidth * spindleBell + waistRadius * Math.sin(s * Math.PI * 0.5);
  } else {
    const s = (u - SOCKET_U) / (1 - SOCKET_U); // 0 .. 1 from socket out past the viewport corner
    braidSign = f.xi * f.crossover;
    // Graceful trumpet flare that widens continuously all the way past the screen corners
    const flare = Math.pow(s, 1.32) * R * 1.48 * f.flareSpread;
    envelope = waistRadius + flare;
  }

  // Travelling biharmonic wave along the filament
  const waveSpeed = (1.15 + 1.45 * callHeat) * f.freqMul;
  const wave1 = Math.sin(u * 10.5 * f.freqMul - time * waveSpeed + f.phase);
  const wave2 = Math.cos(u * 17.0 * f.freqMul - time * waveSpeed * 1.55 - f.phase * 1.3);
  const waveAmp =
    R *
    (0.008 + 0.042 * Math.pow(u, 1.25)) *
    (1 + 0.45 * callHeat + 0.65 * solitonBoost);

  const offset = braidSign * envelope + (wave1 * 0.7 + wave2 * 0.3) * waveAmp;

  return {
    x: cx + nx * offset,
    y: cy + ny * offset,
  };
}

/**
 * Traces a smooth Catmull-Rom-like cubic path through sampled filament points onto `ctx`.
 */
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

/**
 * Computes the two cubic Bezier segments of a cross-core horizon filament
 * sweeping from the left screen corners through the singularity core to the right screen corners.
 */
function evaluateHorizonCurve(
  h: HorizonFilament,
  L: StageLayout,
  time: number,
  intro: number,
  wingBoost: number,
): [Vec, Vec, Vec, Vec, Vec, Vec, Vec] {
  const { core, scale: S, radius: R } = L;
  const reach = singularityUnfurl(intro, h.stagger);
  const swayA = Math.sin(time * 0.31 + h.phase);
  const swayB = Math.cos(time * 0.23 + h.phase * 1.4);

  const waist: Vec = {
    x: core.x,
    y: core.y + h.waistOffset * R * reach,
  };

  const lAngle = h.leftAngle + 0.04 * swayA * (1 + 0.4 * wingBoost);
  const rAngle = h.rightAngle + 0.04 * swayB * (1 + 0.4 * wingBoost);

  const lDist = h.leftReach * S * reach;
  const rDist = h.rightReach * S * reach;

  const pLeft = add(core, polar(lDist, lAngle));
  const pRight = add(core, polar(rDist, rAngle));

  // Shared tangent through the singularity waist so left -> core -> right is C1 smooth
  const bridgeAngle = (rAngle + (lAngle - Math.PI)) * 0.5 + 0.03 * swayA;
  const pull = Math.min(lDist, rDist) * 0.34;
  const tVec = { x: Math.cos(bridgeAngle) * pull, y: Math.sin(bridgeAngle) * pull };

  const cLeft1 = add(pLeft, polar(lDist * 0.38, lAngle + Math.PI + h.curvature));
  const cLeft2 = { x: waist.x - tVec.x, y: waist.y - tVec.y };

  const cRight1 = { x: waist.x + tVec.x, y: waist.y + tVec.y };
  const cRight2 = add(pRight, polar(rDist * 0.38, rAngle + Math.PI - h.curvature));

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

/* ============================================================================
   COMPONENT
   ============================================================================ */

export function NeuralStage({ signal, className = "" }: { signal: StageSignal; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signalRef = useRef(signal);
  const redrawRef = useRef<(() => void) | null>(null);
  const socketCount = signal.sockets.length;

  useEffect(() => {
    signalRef.current = signal;
    redrawRef.current?.();
  }, [signal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createNeuralField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const armLevels = signalRef.current.sockets.map((s) => SOCKET_TARGET_LEVEL[s]);
    const armCallHeat = signalRef.current.sockets.map(() => 0);
    const solitons: SolitonWave[] = [];
    const ripples: CoreRipple[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    let energy = BRAIN_TARGET_ENERGY[signalRef.current.brain];
    let globalCallHeat = 0;
    let idlePulseClock = 3.2;
    let rippleClock = 0;
    let wakeShockFired = false;

    const pointerTarget: Vec = { x: 0, y: 0 };
    const pointerSmooth: Vec = { x: 0, y: 0 };
    let pointerClient: Vec | null = null;

    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerClient = { x, y };
      pointerTarget.x = ((x / rect.width) - 0.5) * 28;
      pointerTarget.y = ((y / rect.height) - 0.4) * 28;
    };

    const onPointerLeave = () => {
      pointerClient = null;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    const launchNodeCall = (targetSocket: number, crimson: boolean) => {
      if (crimson) globalCallHeat = Math.max(globalCallHeat, 1);
      if (targetSocket >= 0 && targetSocket < socketCount) {
        if (crimson) armCallHeat[targetSocket] = 1;
        if (!reduceMotion) {
          solitons.push({
            arm: targetSocket,
            u: 0,
            speed: crimson ? 0.88 : 0.48,
            intensity: crimson ? 1 : 0.6,
            crimson,
          });
        }
      } else {
        signalRef.current.sockets.forEach((s, idx) => {
          if (s === "occupied") {
            if (crimson) armCallHeat[idx] = 1;
            if (!reduceMotion) {
              solitons.push({
                arm: idx,
                u: idx * -0.08,
                speed: 0.84,
                intensity: 1,
                crimson,
              });
            }
          }
        });
      }
      if (!reduceMotion) {
        ripples.push({ u: 0, crimson, strength: crimson ? 1 : 0.65 });
      }
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const L = layout;
      const { width, height, core, radius: R, scale: S } = L;

      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const introEase = 1 - Math.pow(1 - intro, 3);

      // Smooth pointer parallax
      const pFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5);
      pointerSmooth.x = lerp(pointerSmooth.x, pointerTarget.x, pFollow);
      pointerSmooth.y = lerp(pointerSmooth.y, pointerTarget.y, pFollow);

      // Detect state transitions that call nodes
      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") {
          launchNodeCall(activeSocket ?? -1, true);
        }
        lastBrain = brain;
      }

      if ((activeSocket ?? null) !== lastActiveSocket) {
        if (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0) {
          launchNodeCall(activeSocket, true);
        }
        lastActiveSocket = activeSocket ?? null;
      }

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        launchNodeCall(snap.index, true);
      }

      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        const target = transfer.toSocket >= 0 ? transfer.toSocket : transfer.fromSocket;
        launchNodeCall(target, true);
      }

      // Gentle meditative golden synaptic pulse while idle
      if (!reduceMotion && intro >= 1 && brain === "idle" && (activeSocket === null || activeSocket === undefined)) {
        idlePulseClock -= dt;
        if (idlePulseClock <= 0) {
          idlePulseClock = 4.4;
          const occupied = sockets.map((s, i) => (s === "occupied" ? i : -1)).filter((i) => i >= 0);
          if (occupied.length > 0) {
            const pick = occupied[Math.floor(time) % occupied.length]!;
            solitons.push({ arm: pick, u: 0, speed: 0.42, intensity: 0.55, crimson: false });
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
        reduceMotion ? 1 : 1 - Math.exp(-dt * (targetGlobalCall > globalCallHeat ? 5.0 : 1.6)),
      );

      energy = lerp(
        energy,
        BRAIN_TARGET_ENERGY[brain],
        reduceMotion ? 1 : 1 - Math.exp(-dt * 3.0),
      );

      // Update per-arm levels & node call heat (including subtle cursor proximity resonance)
      sockets.forEach((s, i) => {
        let hoverBoost = 0;
        if (pointerClient && L.sockets[i]) {
          const d = Math.hypot(pointerClient.x - L.sockets[i]!.x, pointerClient.y - L.sockets[i]!.y);
          hoverBoost = clamp(1 - d / (R * 0.55), 0, 1) * 0.22;
        }
        const targetLevel = clamp(SOCKET_TARGET_LEVEL[s] + hoverBoost, 0, 1.15);
        armLevels[i] = lerp(armLevels[i] ?? targetLevel, targetLevel, reduceMotion ? 1 : 1 - Math.exp(-dt * 3.5));

        const armIsCalled =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && s === "occupied");
        const targetArmHeat = armIsCalled ? 1 : globalCallHeat * (s === "occupied" ? 0.82 : 0.35);
        armCallHeat[i] = lerp(
          armCallHeat[i] ?? 0,
          targetArmHeat,
          reduceMotion ? 1 : 1 - Math.exp(-dt * (targetArmHeat > (armCallHeat[i] ?? 0) ? 5.5 : 1.5)),
        );
      });

      // Advance solitons
      for (let i = solitons.length - 1; i >= 0; i--) {
        const sol = solitons[i]!;
        if (!reduceMotion) sol.u += sol.speed * dt;
        if (sol.u >= 1.25) solitons.splice(i, 1);
      }

      // Opening singularity shockwave
      if (!reduceMotion && intro > 0.08 && !wakeShockFired) {
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

      const goldCore = isLight ? GOLD_LIGHT_CORE : GOLD_CORE;
      const goldBright = isLight ? GOLD_LIGHT_MID : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.45 : 1.0;

      const thinkingBeat = brain === "thinking" ? 0.5 + 0.5 * Math.sin(time * 6.5) : 0;
      const breathe = 1 + 0.045 * Math.sin(time * (0.6 + energy)) + 0.08 * energy + 0.04 * thinkingBeat;

      // ——— 1. Pure Pitch-Black Background (or Warm Alabaster in Light Mode) ———
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#f7f7f8" : "#000000";
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = Math.min(1, intro * 2.4);

      // ——— 2. Deep Atmospheric Singularity Halo ———
      const fieldRadius = S * 1.25 * (0.18 + 0.82 * introEase) * (1 + 0.1 * energy);
      radialGlow(ctx, core, S * 0.52 * breathe * (0.2 + 0.8 * introEase), [
        [0, `rgba(${mixRgb(goldBright, goldCore, 0.4)}, ${(isLight ? 0.2 : 0.13) + 0.05 * energy})`],
        [
          0.48,
          globalCallHeat > 0.02
            ? `rgba(${mixRgb(goldDeep, CRIMSON_PURE, globalCallHeat * 0.5)}, ${0.045 + 0.035 * globalCallHeat})`
            : `rgba(${goldDeep.join(", ")}, ${isLight ? 0.06 : 0.04})`,
        ],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // ——— 3. Pre-sample C2 Spine Frames for the 5 Functional Node Arms ———
      const spines = L.arms.map((arm) =>
        sampleArmSpine(arm, L, time, intro, pointerSmooth),
      );

      // ——— 4. Continuous Corner-Sweeping Horizon Wings (Gold Core -> Crimson Trailing Corners on Call) ———
      const horizonCurves = field.horizonFilaments.map((h) =>
        evaluateHorizonCurve(h, L, time, intro, globalCallHeat),
      );

      field.horizonLayerBatches.forEach((indices, layerIdx) => {
        if (!indices.length) return;
        const layer = DEPTH_LAYERS[layerIdx]!;
        const baseRgb = mixRgbTuple(goldMid, goldBright, layer.hot);
        const coreColor = `${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}`;
        const midTrailColor = mixRgb(baseRgb, CRIMSON_HOT, globalCallHeat * 0.78);
        const outerTrailColor = mixRgb(goldDeep, CRIMSON_PURE, globalCallHeat * 0.96);
        const a = layer.alpha * 0.58 * alphaScale * (0.75 + 0.35 * energy);

        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, fieldRadius);
        // Core and inner wings remain 100% pure gold
        g.addColorStop(0, `rgba(${coreColor}, ${Math.min(1, a * 2.2)})`);
        g.addColorStop(0.24, `rgba(${coreColor}, ${Math.min(1, a * 1.15)})`);
        g.addColorStop(0.46, `rgba(${coreColor}, ${a * 0.55})`);
        // Outer trailing edges sweeping into the corners turn crimson when calling a node
        g.addColorStop(0.68, `rgba(${midTrailColor}, ${a * (0.32 + 0.36 * globalCallHeat)})`);
        g.addColorStop(0.88, `rgba(${outerTrailColor}, ${a * (0.16 + 0.28 * globalCallHeat)})`);
        g.addColorStop(1, `rgba(${outerTrailColor}, 0)`);

        ctx.beginPath();
        for (const idx of indices) {
          const c = horizonCurves[idx]!;
          ctx.moveTo(c[0].x, c[0].y);
          ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
          ctx.bezierCurveTo(c[4].x, c[4].y, c[5].x, c[5].y, c[6].x, c[6].y);
        }
        ctx.lineWidth = layer.width * 0.85 * (isLight ? 1.12 : 1);
        ctx.strokeStyle = g;
        ctx.stroke();
      });

      // Also draw the two lower-lateral horizon corner spines for balanced 4-corner symmetry
      L.horizonWings.forEach((wing: HorizonWingGeometry) => {
        const reach = singularityUnfurl(intro, 0.25);
        const c1 = { x: lerp(core.x, wing.c1.x, reach), y: lerp(core.y, wing.c1.y, reach) };
        const c2 = { x: lerp(core.x, wing.c2.x, reach), y: lerp(core.y, wing.c2.y, reach) };
        const tip = { x: lerp(core.x, wing.tip.x, reach), y: lerp(core.y, wing.tip.y, reach) };
        const wg = ctx.createLinearGradient(core.x, core.y, tip.x, tip.y);
        const goldStr = `${goldMid[0]}, ${goldMid[1]}, ${goldMid[2]}`;
        const edgeStr = mixRgb(goldDeep, CRIMSON_PURE, globalCallHeat * 0.92);
        wg.addColorStop(0, `rgba(${goldStr}, ${0.22 * alphaScale})`);
        wg.addColorStop(0.45, `rgba(${goldStr}, ${0.09 * alphaScale})`);
        wg.addColorStop(0.8, `rgba(${edgeStr}, ${(0.04 + 0.08 * globalCallHeat) * alphaScale})`);
        wg.addColorStop(1, `rgba(${edgeStr}, 0)`);
        ctx.beginPath();
        ctx.moveTo(core.x, core.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tip.x, tip.y);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = wg;
        ctx.stroke();
      });

      // ——— 5. Subtle Inter-Node Harmonic Bridges between Adjacent Occupied Sockets ———
      for (const b of field.bridges) {
        const lvlA = armLevels[b.fromArm] ?? 0;
        const lvlB = armLevels[b.toArm] ?? 0;
        const bridgeStrength = Math.min(lvlA, lvlB);
        if (bridgeStrength < 0.25) continue;

        const pA = spines[b.fromArm]!.socketPt;
        const pB = spines[b.toArm]!.socketPt;
        const mid: Vec = { x: (pA.x + pB.x) * 0.5, y: (pA.y + pB.y) * 0.5 };
        const dirFromCore = Math.atan2(mid.y - core.y, mid.x - core.x);
        const sway = Math.sin(time * 0.5 + b.phase) * R * 0.025;
        const ctrl = add(mid, polar(R * b.archLift + sway, dirFromCore));

        const heat = Math.max(armCallHeat[b.fromArm] ?? 0, armCallHeat[b.toArm] ?? 0);
        const bridgeColor = mixRgb(goldMid, CRIMSON_HOT, heat * 0.65);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, pB.x, pB.y);
        ctx.lineWidth = 0.45;
        ctx.strokeStyle = `rgba(${bridgeColor}, ${0.075 * bridgeStrength * alphaScale * introEase})`;
        ctx.stroke();
      }

      // ——— 6. The 5 Primary Functional Node Arms (Continuous C2 Venturi-Caustic Bundles to Screen Corners) ———
      const CURVE_STEPS = 18;
      const sampleUs = Array.from({ length: CURVE_STEPS + 1 }, (_, k) => k / CURVE_STEPS);

      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const spine = spines[armIdx]!;
        const level = armLevels[armIdx] ?? 0.2;
        const heat = armCallHeat[armIdx] ?? 0;

        // Compute active soliton boost at the socket for this arm
        let armSolitonBoost = 0;
        for (const sol of solitons) {
          if (sol.arm === armIdx && sol.u >= 0) {
            const dist = Math.abs(sol.u - SOCKET_U);
            armSolitonBoost = Math.max(armSolitonBoost, Math.exp(-(dist * dist) / 0.04) * sol.intensity);
          }
        }

        // Gradient from Core (u = 0) -> Node Socket (u = 0.34) -> Viewport Corner (u = 1.0)
        // Keeps the core and trunk gold while turning the called node and trailing corner plume crimson red!
        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const batch = field.armLayerBatches[armIdx]![layerIdx]!;
          if (!batch.length) continue;

          const baseGold = mixRgbTuple(goldMid, goldCore, layer.hot);
          const goldRgbStr = `${baseGold[0]}, ${baseGold[1]}, ${baseGold[2]}`;
          const socketRgbStr = mixRgb(baseGold, CRIMSON_HOT, heat * 0.72);
          const midPlumeRgbStr = mixRgb(goldMid, CRIMSON_PURE, heat * 0.95);
          const tipPlumeRgbStr = mixRgb(goldDeep, CRIMSON_DEEP, heat * 0.98);

          const baseAlpha =
            layer.alpha *
            alphaScale *
            (0.28 + 0.95 * level) *
            (1 + 0.28 * energy + 0.42 * heat + 0.35 * armSolitonBoost);

          const armGrad = ctx.createLinearGradient(
            core.x,
            core.y,
            spine.tipPt.x,
            spine.tipPt.y,
          );
          // 0.00 -> 0.30: Singularity Core & Inner Spindle Trunk (ALWAYS Gold)
          armGrad.addColorStop(0, `rgba(${goldRgbStr}, ${Math.min(1, baseAlpha * 1.95)})`);
          armGrad.addColorStop(0.26, `rgba(${goldRgbStr}, ${Math.min(1, baseAlpha * 1.35)})`);
          // 0.34: Node Socket Caustic Pinch (Gold at rest, Incandescent Gold-Crimson when called)
          armGrad.addColorStop(0.36, `rgba(${socketRgbStr}, ${Math.min(1, baseAlpha * (1.55 + 0.4 * heat))})`);
          // 0.54 -> 1.00: Outer Plume Sweeping to Screen Corners (Gold at rest, Luminous Crimson Red when called)
          armGrad.addColorStop(0.56, `rgba(${midPlumeRgbStr}, ${Math.min(1, baseAlpha * (0.92 + 0.45 * heat))})`);
          armGrad.addColorStop(0.82, `rgba(${tipPlumeRgbStr}, ${baseAlpha * (0.42 + 0.38 * heat)})`);
          armGrad.addColorStop(1, `rgba(${tipPlumeRgbStr}, 0)`);

          ctx.beginPath();
          for (const fIdx of batch) {
            const f = field.armFilaments[fIdx]!;
            const fReach = singularityUnfurl(intro, f.stagger);
            const pts: Vec[] = new Array(CURVE_STEPS + 1);
            for (let k = 0; k <= CURVE_STEPS; k++) {
              const u = sampleUs[k]! * fReach;
              pts[k] = evaluateArmFilamentPoint(
                f,
                spine,
                u,
                R,
                time,
                level,
                heat,
                armSolitonBoost,
              );
            }
            traceSmoothPolyline(ctx, pts);
          }

          ctx.lineWidth = layer.width * (0.85 + 0.45 * level + 0.2 * heat) * (isLight ? 1.15 : 1);
          ctx.strokeStyle = armGrad;
          ctx.stroke();
        }

        // ——— 6b. Node Socket Caustic Lens & Architectural Ring ———
        const sockPt = spine.socketPt;
        const innerHaloRgb = mixRgb(goldCore, CRIMSON_HOT, heat * 0.7);
        const outerHaloRgb = mixRgb(goldMid, CRIMSON_PURE, heat * 0.92);
        const haloRadius = R * (0.16 + 0.14 * level + 0.14 * heat + 0.1 * armSolitonBoost);

        radialGlow(ctx, sockPt, haloRadius, [
          [0, `rgba(${innerHaloRgb}, ${Math.min(1, (0.48 + 0.45 * heat + 0.3 * armSolitonBoost) * level)})`],
          [0.32, `rgba(${outerHaloRgb}, ${(0.24 + 0.34 * heat) * level})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);

        // Crisp caustic star core at occupied or called sockets
        if (level > 0.35 || heat > 0.1) {
          const ringPulse = 1 + 0.08 * Math.sin(time * 2.2 + armIdx);
          ctx.beginPath();
          ctx.arc(sockPt.x, sockPt.y, (3.2 + 2.4 * heat) * ringPulse, 0, TAU);
          ctx.fillStyle = `rgba(${innerHaloRgb}, ${Math.min(1, 0.85 * level + 0.4 * heat)})`;
          ctx.fill();
        }
      }

      // ——— 7. Travelling Soliton Wavepackets Along the Arms ———
      for (const sol of solitons) {
        if (sol.u < 0 || sol.u > 1.15) continue;
        const spine = spines[sol.arm];
        if (!spine) continue;

        const uClamped = clamp(sol.u, 0, 1);
        const idxFloat = uClamped * (SPINE_SAMPLES - 1);
        const i0 = Math.min(SPINE_SAMPLES - 2, Math.floor(idxFloat));
        const frac = idxFloat - i0;
        const pos: Vec = {
          x: lerp(spine.pts[i0]!.x, spine.pts[i0 + 1]!.x, frac),
          y: lerp(spine.pts[i0]!.y, spine.pts[i0 + 1]!.y, frac),
        };

        const fade = Math.sin(clamp(sol.u / 1.15, 0, 1) * Math.PI) * sol.intensity;
        const isPastSocket = sol.u > SOCKET_U;
        const solColor = sol.crimson
          ? mixRgb(goldBright, CRIMSON_PURE, clamp((sol.u - 0.18) * 1.6, 0, 1))
          : `${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}`;

        radialGlow(ctx, pos, R * (isPastSocket ? 0.26 : 0.18), [
          [0, `rgba(255, 250, 236, ${0.92 * fade})`],
          [0.34, `rgba(${solColor}, ${0.52 * fade})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      // ——— 8. Expanding Harmonic Ripples from the Singularity Core ———
      ctx.lineWidth = 1.15;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]!;
        if (!reduceMotion) rp.u += dt * 0.46;
        if (rp.u >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = Math.pow(1 - rp.u, 2) * rp.strength;
        const rpColor = rp.crimson
          ? mixRgb(goldBright, CRIMSON_PURE, clamp(rp.u * 1.35, 0, 1))
          : `${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}`;
        ctx.strokeStyle = `rgba(${rpColor}, ${0.34 * fade * alphaScale})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.08 + rp.u * 1.65), 0, TAU);
        ctx.stroke();
      }

      // ——— 9. Shimmering Celestial Stipple & Flowing Photons ———
      for (const g of field.grains) {
        const spine = spines[g.arm]!;
        const level = armLevels[g.arm] ?? 0.2;
        const heat = armCallHeat[g.arm] ?? 0;
        const f = field.armFilaments[g.filamentIdx]!;
        const u = g.u * singularityUnfurl(intro, f.stagger);

        const idxFloat = clamp(u, 0, 1) * (SPINE_SAMPLES - 1);
        const i0 = Math.min(SPINE_SAMPLES - 2, Math.floor(idxFloat));
        const p = spine.pts[i0]!;
        const n = spine.normals[i0]!;

        const spread = (u <= SOCKET_U ? 0.35 : 0.45 + (u - SOCKET_U) * 1.8) * f.xi * R * 0.24;
        const gx = p.x + n.x * (spread + g.normalJitter);
        const gy = p.y + n.y * (spread + g.normalJitter);

        const twinkle = 0.45 + 0.55 * Math.sin(time * 1.6 + g.phase);
        const isTrailingCrimson = heat > 0.05 && u > SOCKET_U + 0.08;
        ctx.fillStyle = isTrailingCrimson
          ? `rgb(${mixRgb(goldBright, CRIMSON_HOT, clamp((u - SOCKET_U) * 1.8 * heat, 0, 1))})`
          : `rgb(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]})`;

        ctx.globalAlpha = introEase * g.alpha * twinkle * (0.25 + 0.75 * level) * (1 - 0.55 * Math.pow(u, 2));
        ctx.fillRect(gx, gy, g.size, g.size);
      }

      // Photons streaming along the 5 functional node arms
      const flowSpeedMul = 1 + 1.85 * energy;
      for (const pt of field.armPhotons) {
        const level = armLevels[pt.arm] ?? 0.2;
        const heat = armCallHeat[pt.arm] ?? 0;
        const f = field.armFilaments[pt.filamentIdx]!;
        const spine = spines[pt.arm]!;

        // Venturi acceleration: photons speed up as they pinch through the socket waist!
        const distFromWaist = Math.abs(pt.u - SOCKET_U);
        const venturiBoost = 1 + 0.65 * Math.exp(-(distFromWaist * distFromWaist) / 0.025);

        if (!reduceMotion) {
          pt.u = (pt.u + pt.speed * dt * flowSpeedMul * venturiBoost * (0.45 + 0.75 * level)) % 1;
        }

        const uEff = pt.u * singularityUnfurl(intro, f.stagger);
        const pos = evaluateArmFilamentPoint(f, spine, uEff, R, time, level, heat, 0);

        const edgeFade = Math.sin(pt.u * Math.PI);
        const isCrimsonTail = heat > 0.05 && pt.u > SOCKET_U + 0.05;
        ctx.fillStyle = isCrimsonTail
          ? `rgb(${mixRgb(goldCore, CRIMSON_HOT, clamp((pt.u - SOCKET_U) * 1.75 * heat, 0, 1))})`
          : `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;

        ctx.globalAlpha = introEase * pt.alpha * edgeFade * (0.22 + 0.85 * level);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pt.size * (1 + 0.25 * heat), 0, TAU);
        ctx.fill();
      }

      // Photons streaming along the horizon corner wings
      for (const hp of field.horizonPhotons) {
        if (!reduceMotion) {
          hp.u = (hp.u + hp.speed * dt * flowSpeedMul) % 1;
        }
        const curve = horizonCurves[hp.strandIdx]!;
        const pos = pointOnHorizonCurve(curve, hp.u);
        const edgeDist = Math.abs(hp.u - 0.5) * 2; // 0 at core, 1 at screen corners
        const edgeFade = Math.sin(hp.u * Math.PI);
        ctx.fillStyle =
          globalCallHeat > 0.05 && edgeDist > 0.45
            ? `rgb(${mixRgb(goldBright, CRIMSON_HOT, (edgeDist - 0.45) * 1.8 * globalCallHeat)})`
            : `rgb(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]})`;
        ctx.globalAlpha = introEase * hp.alpha * edgeFade;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, hp.size, 0, TAU);
        ctx.fill();
      }

      // ——— 10. The Singularity Nucleus (Always Pure White-Hot & Molten 24k Gold) ———
      ctx.globalAlpha = 1;
      const coreScale = intro < 0.28 ? 0.38 + intro * 2.2 : 1;
      const coreGlowR = S * 0.088 * breathe * coreScale;

      radialGlow(ctx, core, coreGlowR, [
        [0, isLight ? "rgba(255, 252, 240, 1)" : "rgba(255, 254, 246, 1)"],
        [0.18, `rgba(${goldBright.join(", ")}, ${0.84 + 0.14 * energy})`],
        [0.48, `rgba(${goldMid.join(", ")}, 0.28)`],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // Subtle optical diffraction cross-flare at the singularity nucleus
      const spikeLen = R * (0.34 + 0.12 * energy + 0.08 * thinkingBeat) * introEase;
      ctx.lineWidth = 1;
      for (const angle of [0, Math.PI * 0.5]) {
        const p0 = add(core, polar(spikeLen, angle + Math.PI));
        const p1 = add(core, polar(spikeLen, angle));
        const sg = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        sg.addColorStop(0, `rgba(${goldBright.join(", ")}, 0)`);
        sg.addColorStop(0.5, `rgba(${goldCore.join(", ")}, ${0.38 + 0.18 * energy})`);
        sg.addColorStop(1, `rgba(${goldBright.join(", ")}, 0)`);
        ctx.strokeStyle = sg;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      layout = computeStageLayout(width, height, socketCount);
      if (reduceMotion) draw(8, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!signalRef.current.paused) draw((now - start) / 1000, dt);
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
      redrawRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
