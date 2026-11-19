"use client";

import { memo, useEffect, useRef } from "react";
import { Lock, Plus } from "lucide-react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  bezier,
  clamp,
  fitCanvas,
  lerp,
  observeCanvasActivity,
  polar,
  radialGlow,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";
import { computeStageLayout, type ArmGeometry, type StageLayout } from "./stage-layout";

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
  /** Skip opening bloom delay and continue the singularity explosion straight into node unfurl. */
  fromSetupExplosion?: boolean;
};

/* ============================================================================
   OPTICAL CONSTANTS & PURE MONOCHROME GOLD SPECTRAL PALETTES
   ============================================================================ */

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const SOCKET_U = 0.36; // Parametric position of each node waist along its ribbon spine (0 = core, 1 = periphery)
const SPINE_SAMPLES = 44;
const FILAMENTS_PER_ARM = 22; // Disciplined, uncrowded laminar silk ribbons (zero messy noise)
const HORIZON_STRANDS = 34;
const CURVE_STEPS = 24;
const SAMPLE_US = Array.from({ length: CURVE_STEPS + 1 }, (_, k) => k / CURVE_STEPS);

// Dark Mode: Molten 24k Observatory Gold + Cool Quiet Platinum for dormant arms
const DARK_GOLD_CORE: Rgb = [255, 248, 224];
const DARK_GOLD_BRIGHT: Rgb = [255, 220, 138];
const DARK_GOLD_MID: Rgb = [242, 182, 66];
const DARK_GOLD_DEEP: Rgb = [202, 132, 32];
const DARK_DORMANT: Rgb = [128, 122, 110];

// Light Mode: Radiant 24k Sunlit Atelier Gold on Pure Gallery Paper (#ffffff)
const LIGHT_GOLD_CORE: Rgb = [255, 232, 130];
const LIGHT_GOLD_BRIGHT: Rgb = [248, 194, 42];
const LIGHT_GOLD_MID: Rgb = [228, 166, 22];
const LIGHT_GOLD_DEEP: Rgb = [184, 122, 12];
const LIGHT_DORMANT: Rgb = [144, 142, 136];

const SOCKET_TARGET_LEVEL: Record<SocketVisual, number> = {
  occupied: 1.0,
  open: 0.24,
  locked: 0.14,
};

const BRAIN_TARGET_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.18,
  thinking: 1.0,
  responding: 0.72,
};

/** Three refined optical fiber tiers: soft atmospheric silk, primary sculpted strand, crisp specular core hair. */
const FIBER_TIERS = [
  { width: 2.2, alpha: 0.1, hot: 0.0 },
  { width: 1.05, alpha: 0.28, hot: 0.45 },
  { width: 0.52, alpha: 0.54, hot: 1.0 },
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

const easeOutCubic = (x: number): number => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

/* ============================================================================
   FIELD & PHYSICS STRUCTURES
   ============================================================================ */

type SpineFrame = {
  pts: Vec[];
  normals: Vec[];
  tangents: Vec[];
  socketPt: Vec;
  tipPt: Vec;
  /** Current parametric unfurl extent (0..1) of this arm during opening animation. */
  unfurl: number;
};

type ArmFilament = {
  arm: number;
  tier: number;
  /** Stratified laminar coordinate in [-1, 1] across the silk ribbon. */
  xi: number;
  /** Smooth optical braid twist factor through the node waist. */
  crossover: number;
  /** Gentle outer fan taper multiplier. */
  flareSpread: number;
  /** Tightly coupled spatial phase so strands breathe together like cohesive silk. */
  phase: number;
  /** Fine per-strand unfurl offset in [0, 0.14]. */
  stagger: number;
};

type HorizonFilament = {
  tier: number;
  side: -1 | 1;
  spreadAngle: number;
  reachMul: number;
  waistY: number;
  bend: number;
  phase: number;
  stagger: number;
};

type FlowPhoton = {
  arm: number;
  filamentIdx: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

type SignalWave = {
  arm: number;
  u: number;
  speed: number;
  direction: 1 | -1;
  intensity: number;
};

/** Tactile acoustic pluck + expanding liquid ripple created when pressing or releasing anywhere on the neural web. */
type PressImpulse = {
  x: number;
  y: number;
  age: number;
  duration: number;
  strength: number;
  /** -1 = release rebound pluck, +1 = initial touch press ripple */
  polarity: 1 | -1;
};

type CoreRipple = {
  u: number;
  strength: number;
};

type PointerPhysics = {
  pos: Vec;
  vel: Vec;
  presence: number;
  isDown: boolean;
  holdPos: Vec;
  holdStrength: number;
};

function createNeuralField(armCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261119);

  const pickTier = (i: number): number => {
    if (i % 5 === 0) return 0; // Atmospheric silk sheath
    if (i % 3 === 0) return 2; // Crisp specular core hair
    return 1; // Primary silk thread
  };

  const armFilaments: ArmFilament[] = [];
  const armTierBatches: number[][][] = Array.from({ length: armCount }, () =>
    FIBER_TIERS.map(() => [] as number[]),
  );

  for (let arm = 0; arm < armCount; arm++) {
    for (let i = 0; i < FILAMENTS_PER_ARM; i++) {
      const stratified = ((i + 0.5) / FILAMENTS_PER_ARM) * 2 - 1;
      const xi = clamp(stratified * 0.96 + gauss() * 0.04, -1.08, 1.08);
      const tier = pickTier(i);
      const idx = armFilaments.length;
      armFilaments.push({
        arm,
        tier,
        xi,
        // Gentle optical lens convergence: inner threads cross softly, outer silk glides parallel
        crossover: Math.abs(xi) < 0.45 ? -0.68 : 0.74,
        flareSpread: 0.84 + 0.42 * Math.abs(xi),
        phase: arm * 1.15 + xi * 0.65,
        stagger: Math.abs(xi) * 0.12,
      });
      armTierBatches[arm]![tier]!.push(idx);
    }
  }

  // Serene sweeping lateral wings framing the left and right horizon
  const horizonFilaments: HorizonFilament[] = [];
  const horizonTierBatches: number[][] = FIBER_TIERS.map(() => [] as number[]);

  for (let i = 0; i < HORIZON_STRANDS; i++) {
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const localIdx = Math.floor(i / 2);
    const localCount = HORIZON_STRANDS / 2;
    const stratified = ((localIdx + 0.5) / localCount) * 2 - 1;
    const tier = pickTier(i);
    const idx = horizonFilaments.length;
    horizonFilaments.push({
      tier,
      side,
      spreadAngle: stratified * 0.34,
      reachMul: between(0.84, 1.18),
      waistY: stratified * 0.022,
      bend: stratified * 0.16,
      phase: stratified * 0.9 + (side > 0 ? 1.2 : 0),
      stagger: Math.abs(stratified) * 0.18,
    });
    horizonTierBatches[tier]!.push(idx);
  }

  // Sparse, deliberate luminous photons gliding smoothly along active arms
  const armPhotons: FlowPhoton[] = Array.from({ length: armCount * 14 }, (_, i) => {
    const arm = i % armCount;
    const armStart = arm * FILAMENTS_PER_ARM;
    const filamentIdx = armStart + (Math.floor(i / armCount) * 3) % FILAMENTS_PER_ARM;
    return {
      arm,
      filamentIdx,
      u: rnd(),
      speed: between(0.045, 0.095),
      size: between(1.0, 2.0),
      alpha: between(0.45, 0.92),
    };
  });

  return {
    armFilaments,
    armTierBatches,
    horizonFilaments,
    horizonTierBatches,
    armPhotons,
  };
}

/** Smooth center-outward arm unfurl progression (0..1) so center arm leads and outer arms follow like blooming petals. */
function computeArmUnfurl(elapsed: number, armIndex: number, totalArms: number, fromExplosion: boolean): number {
  const centerIdx = (totalArms - 1) * 0.5;
  const distFromCenter = Math.abs(armIndex - centerIdx);
  const startDelay = fromExplosion ? distFromCenter * 0.06 : 0.18 + distFromCenter * 0.1;
  const duration = fromExplosion ? 1.15 : 1.48;
  const raw = clamp((elapsed - startDelay) / duration, 0, 1);
  // Smooth C2 quintic ease-out (zero mechanical overshoot or jarring snap)
  return 1 - Math.pow(1 - raw, 3.2);
}

/** Samples one C2-continuous ribbon spine from core (u = 0) through socket (u = SOCKET_U) to tip (u = 1). */
function sampleArmSpine(
  arm: ArmGeometry,
  L: StageLayout,
  time: number,
  unfurl: number,
  pointer: PointerPhysics,
): SpineFrame {
  const { core, radius: R } = L;

  // Serene low-frequency laminar breath (no nervous shivering)
  const breathA = Math.sin(time * 0.34 + arm.index * 1.18);
  const breathB = Math.cos(time * 0.22 + arm.index * 1.65);

  const perpAngle = arm.coreAngle + Math.PI * 0.5;
  const socketSway = polar(R * 0.014 * breathA, perpAngle);

  // Subtle viscous pointer yield on the arm waist
  let yieldX = 0;
  let yieldY = 0;
  if (pointer.presence > 0.004) {
    const dx = arm.socket.x - pointer.pos.x;
    const dy = arm.socket.y - pointer.pos.y;
    const distSq = dx * dx + dy * dy;
    const sigma = R * 0.62;
    const k = pointer.presence * Math.exp(-distSq / (2 * sigma * sigma));
    const dist = Math.sqrt(distSq) + 54;
    yieldX = (dx / dist) * R * 0.012 * k + pointer.vel.x * 0.03 * k;
    yieldY = (dy / dist) * R * 0.012 * k + pointer.vel.y * 0.03 * k;
  }

  const socketPt = add(arm.socket, {
    x: socketSway.x + yieldX,
    y: socketSway.y + yieldY,
  });

  const tangentAngle = Math.atan2(arm.socketTangent.y, arm.socketTangent.x) + 0.016 * breathB;
  const T_sock = { x: Math.cos(tangentAngle), y: Math.sin(tangentAngle) };

  const innerDist = Math.hypot(socketPt.x - core.x, socketPt.y - core.y);
  const c1 = add(core, polar(innerDist * 0.48, arm.coreAngle + 0.02 * breathA));
  const c2: Vec = {
    x: socketPt.x - T_sock.x * innerDist * 0.38,
    y: socketPt.y - T_sock.y * innerDist * 0.38,
  };

  const tipPt = add(arm.cornerTip, polar(R * 0.055 * breathB, arm.cornerAngle + Math.PI * 0.5));
  const outerDist = Math.hypot(tipPt.x - socketPt.x, tipPt.y - socketPt.y);

  // Collinear d1 preserves strict C1/C2 smoothness right through the node waist
  const d1: Vec = {
    x: socketPt.x + T_sock.x * outerDist * 0.3,
    y: socketPt.y + T_sock.y * outerDist * 0.3,
  };
  const d2 = add(
    socketPt,
    polar(outerDist * 0.64, lerp(tangentAngle, arm.cornerAngle, 0.62) - 0.024 * breathA),
  );

  const socketIdx = Math.round((SPINE_SAMPLES - 1) * SOCKET_U);
  const pts: Vec[] = new Array(SPINE_SAMPLES);

  for (let i = 0; i <= socketIdx; i++) {
    pts[i] = bezier(core, c1, c2, socketPt, i / socketIdx);
  }
  const outerCount = SPINE_SAMPLES - 1 - socketIdx;
  for (let i = 1; i <= outerCount; i++) {
    pts[socketIdx + i] = bezier(socketPt, d1, d2, tipPt, i / outerCount);
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

  return { pts, normals, tangents, socketPt, tipPt, unfurl };
}

/**
 * Computes exact 2D filament coordinate with:
 * - Venturi-Caustic ribbon envelope pinching gracefully into the node waist
 * - Meditative coherent laminar wave travel
 * - Viscous fluid mouse-over parting + silky wake
 * - Tactile mouse-press hold tension & damped harp-string acoustic ripple
 */
function evaluateFilamentPoint(
  f: ArmFilament,
  spine: SpineFrame,
  u: number,
  R: number,
  armPhase: number,
  armLevel: number,
  signalBoost: number,
  pointer: PointerPhysics,
  impulses: readonly PressImpulse[],
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

  const cx = lerp(p0.x, p1.x, frac);
  const cy = lerp(p0.y, p1.y, frac);
  const nx = lerp(n0.x, n1.x, frac);
  const ny = lerp(n0.y, n1.y, frac);

  // Tighter, crisper optical waist when live; softly relaxed when open/dormant
  const waistRadius = R * lerp(0.036, 0.022, armLevel);

  let envelope = 0;
  let braidSign = f.xi;

  if (u <= SOCKET_U) {
    const s = u / SOCKET_U;
    const bell = Math.sin(Math.PI * Math.pow(s, 0.88));
    const bellyWidth = R * (0.145 + 0.02 * (1 - armLevel));
    const crossoverBlend = lerp(1, f.crossover, 0.5 - 0.5 * Math.cos(Math.PI * s));
    braidSign = f.xi * crossoverBlend;
    envelope = bellyWidth * bell + waistRadius * Math.sin(s * Math.PI * 0.5);
  } else {
    const s = (u - SOCKET_U) / (1 - SOCKET_U);
    braidSign = f.xi * f.crossover;
    const flareCurve = Math.pow(s, 1.32);
    envelope = waistRadius + flareCurve * R * 1.48 * f.flareSpread;
  }

  // Coherent, unhurried silk undulation traveling softly outward
  const laminarWave = Math.sin(u * 3.1 - armPhase + f.phase);
  const subHarmonic = Math.cos(u * 1.9 - armPhase * 0.65 + f.phase * 0.5);
  const waveAmp = R * (0.008 + 0.028 * Math.pow(u, 1.15)) * (1 + 0.22 * signalBoost);

  const offset = braidSign * envelope + (laminarWave * 0.72 + subHarmonic * 0.28) * waveAmp;
  let px = cx + nx * offset;
  let py = cy + ny * offset;

  const corePin = smoothstep(0.015, 0.14, u);
  const elasticity = 0.65 + 0.35 * Math.abs(f.xi);

  // 1. Viscous Fluid Mouse-Over Parting & Tangential Silk Wake
  if (pointer.presence > 0.004 && corePin > 0) {
    const dx = px - pointer.pos.x;
    const dy = py - pointer.pos.y;
    const distSq = dx * dx + dy * dy;
    const sigma = R * 0.38;
    const invTwoSigSq = 1 / (2 * sigma * sigma);
    if (distSq < sigma * sigma * 6.5) {
      const k = pointer.presence * Math.exp(-distSq * invTwoSigSq) * corePin * elasticity;
      const dist = Math.sqrt(distSq) + 26;
      // Smooth parting around cursor + gentle silky wake trailing pointer movement
      const partMag = R * 0.036 * k;
      px += (dx / dist) * partMag + pointer.vel.x * 0.12 * k;
      py += (dy / dist) * partMag + pointer.vel.y * 0.12 * k;
    }
  }

  // 2. Tactile Hold Tension: pressing & holding draws nearby fibers gently toward your touch like silk harp strings
  if (pointer.holdStrength > 0.005 && corePin > 0) {
    const dx = pointer.holdPos.x - px;
    const dy = pointer.holdPos.y - py;
    const distSq = dx * dx + dy * dy;
    const holdSigma = R * 0.44;
    if (distSq < holdSigma * holdSigma * 6) {
      const k = pointer.holdStrength * Math.exp(-distSq / (2 * holdSigma * holdSigma)) * corePin * elasticity;
      px += dx * 0.14 * k;
      py += dy * 0.14 * k;
    }
  }

  // 3. Acoustic Press / Release Pluck Waves propagating naturally across the fibers
  if (impulses.length > 0 && corePin > 0) {
    for (let m = 0; m < impulses.length; m++) {
      const imp = impulses[m]!;
      const dx = px - imp.x;
      const dy = py - imp.y;
      const dist = Math.hypot(dx, dy);
      const waveRadius = imp.age * R * 1.45;
      const bandSigma = R * 0.24;
      const ringDiff = dist - waveRadius;
      const ringEnv = Math.exp(-(ringDiff * ringDiff) / (2 * bandSigma * bandSigma));
      if (ringEnv < 0.01) continue;

      const decay = Math.exp(-imp.age * 3.4) * (1 - imp.age / imp.duration);
      const osc = Math.sin(imp.age * 16 - dist * 0.042);
      const disp = R * 0.042 * imp.strength * decay * ringEnv * osc * corePin * elasticity * imp.polarity;
      const invD = 1 / (dist + 18);
      // Transverse normal pluck + radial ripple gives true stringed-silk feel
      px += (dx * invD * 0.55 + nx * 0.45) * disp;
      py += (dy * invD * 0.55 + ny * 0.45) * disp;
    }
  }

  outXs[outIdx] = px;
  outYs[outIdx] = py;
}

function traceSmoothPolyline(ctx: CanvasRenderingContext2D, xs: Float64Array, ys: Float64Array, len: number) {
  if (len < 2) return;
  ctx.moveTo(xs[0]!, ys[0]!);
  for (let i = 0; i < len - 1; i++) {
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i;
    const i2 = i + 1;
    const i3 = i + 2 < len ? i + 2 : len - 1;
    const p1x = xs[i1]!;
    const p1y = ys[i1]!;
    const p2x = xs[i2]!;
    const p2y = ys[i2]!;
    ctx.bezierCurveTo(
      p1x + (p2x - xs[i0]!) / 6,
      p1y + (p2y - ys[i0]!) / 6,
      p2x - (xs[i3]! - p1x) / 6,
      p2y - (ys[i3]! - p1y) / 6,
      p2x,
      p2y,
    );
  }
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
  const nodeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const signalRef = useRef(signal);
  const onSelectRef = useRef(onSelectSocket);
  const hoveredNodeRef = useRef<number>(-1);
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
    const scratchXs = new Float64Array(CURVE_STEPS + 1);
    const scratchYs = new Float64Array(CURVE_STEPS + 1);

    const armLevels: number[] = signalRef.current.sockets.map((s) => SOCKET_TARGET_LEVEL[s]);
    const armHoverHeat: number[] = new Array<number>(socketCount).fill(0);
    const armWavePhases: number[] = new Array<number>(socketCount).fill(0);
    const prevStates: SocketVisual[] = [...signalRef.current.sockets];
    const signals: SignalWave[] = [];
    const impulses: PressImpulse[] = [];
    const ripples: CoreRipple[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    const fromExplosion = Boolean(signalRef.current.fromSetupExplosion);
    let energy = fromExplosion ? 1.35 : BRAIN_TARGET_ENERGY[signalRef.current.brain];
    let autoPulseClock = 5.4;
    let autoPulseIdx = 0;

    if (fromExplosion && !reduceMotion) {
      ripples.push({ u: 0.12, strength: 1.0 });
    }

    const pointer: PointerPhysics = {
      pos: { x: -9999, y: -9999 },
      vel: { x: 0, y: 0 },
      presence: 0,
      isDown: false,
      holdPos: { x: -9999, y: -9999 },
      holdStrength: 0,
    };
    let pointerClient: Vec | null = null;

    let layout = computeStageLayout(1, 1, socketCount);
    let latestSocketPts: Vec[] = layout.sockets;
    let frame = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let elapsed = reduceMotion ? 10 : 0;
    let elementActive = true;

    const launchSignalWave = (fromSocket: number, toSocket: number, intensity = 1) => {
      if (reduceMotion) return;
      if (fromSocket >= 0 && fromSocket < socketCount) {
        signals.push({ arm: fromSocket, u: 0.78, speed: 0.56, direction: -1, intensity });
      }
      if (toSocket >= 0 && toSocket < socketCount) {
        signals.push({
          arm: toSocket,
          u: fromSocket >= 0 ? -0.22 : 0,
          speed: 0.58,
          direction: 1,
          intensity,
        });
      } else if (fromSocket < 0 && toSocket < 0) {
        signalRef.current.sockets.forEach((s, idx) => {
          if (s === "occupied") {
            signals.push({ arm: idx, u: -idx * 0.06, speed: 0.52, direction: 1, intensity: intensity * 0.85 });
          }
        });
      }
      ripples.push({ u: 0, strength: 0.65 * intensity });
    };

    const findNearestArm = (pt: Vec): number => {
      let bestArm = -1;
      let bestDist = Infinity;
      for (let i = 0; i < latestSocketPts.length; i++) {
        const sock = latestSocketPts[i]!;
        // Distance to segment core -> socket -> extended direction
        const dx = sock.x - layout.core.x;
        const dy = sock.y - layout.core.y;
        const lenSq = dx * dx + dy * dy || 1;
        const t = clamp(((pt.x - layout.core.x) * dx + (pt.y - layout.core.y) * dy) / lenSq, 0, 2.1);
        const projX = layout.core.x + dx * t;
        const projY = layout.core.y + dy * t;
        const d = Math.hypot(pt.x - projX, pt.y - projY);
        if (d < bestDist) {
          bestDist = d;
          bestArm = i;
        }
      }
      return bestDist < layout.radius * 0.55 ? bestArm : -1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!pointerClient) {
        pointer.pos.x = x;
        pointer.pos.y = y;
      }
      pointerClient = { x, y };
      if (pointer.isDown) {
        pointer.holdPos.x = x;
        pointer.holdPos.y = y;
      }
    };

    const onPointerLeave = () => {
      pointerClient = null;
      if (pointer.isDown) {
        pointer.isDown = false;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      pointer.isDown = true;
      pointer.holdPos.x = pt.x;
      pointer.holdPos.y = pt.y;
      pointerClient = pt;

      if (!reduceMotion) {
        impulses.push({
          x: pt.x,
          y: pt.y,
          age: 0,
          duration: 1.5,
          strength: 0.85,
          polarity: 1,
        });
        if (impulses.length > 6) impulses.shift();

        const nearArm = findNearestArm(pt);
        if (nearArm >= 0) {
          signals.push({ arm: nearArm, u: 0.04, speed: 0.5, direction: 1, intensity: 0.72 });
        } else {
          ripples.push({ u: 0, strength: 0.45 });
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointer.isDown) return;
      pointer.isDown = false;
      const rect = canvas.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!reduceMotion) {
        // Gentle silk harp rebound impulse on release
        impulses.push({
          x: pt.x,
          y: pt.y,
          age: 0,
          duration: 1.7,
          strength: 1.0,
          polarity: -1,
        });
        if (impulses.length > 6) impulses.shift();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    canvas.addEventListener("pointerdown", onPointerDown, { passive: true });

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const L = layout;
      const { width, height, core, radius: R, scale: S } = L;

      // ——— 1. Pure Atelier Canvas Background (Gallery Light #ffffff | Obsidian Observatory #070709) ———
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#ffffff" : "#070709";
      ctx.fillRect(0, 0, width, height);

      // Subtle warm atmospheric bloom anchored behind the singularity core (blends cleanly into solid ground)
      const coreBloom = reduceMotion ? 1 : easeOutCubic(Math.min(1, time / 0.65));
      if (isLight) {
        radialGlow(ctx, core, S * 0.58 * (0.4 + 0.6 * coreBloom), [
          [0, "rgba(255, 224, 118, 0.24)"],
          [0.36, "rgba(255, 212, 86, 0.09)"],
          [0.72, "rgba(255, 232, 160, 0.025)"],
          [1, "rgba(255, 255, 255, 0)"],
        ]);
      } else {
        radialGlow(ctx, core, S * 0.52 * (0.4 + 0.6 * coreBloom), [
          [0, "rgba(242, 182, 66, 0.14)"],
          [0.38, "rgba(202, 132, 32, 0.05)"],
          [1, "rgba(7, 7, 9, 0)"],
        ]);
      }

      // ——— 2. Smooth Damped Pointer & Hold Physics ———
      const posFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 9.5);
      if (pointerClient) {
        const prevX = pointer.pos.x;
        const prevY = pointer.pos.y;
        pointer.pos.x = lerp(prevX, pointerClient.x, posFollow);
        pointer.pos.y = lerp(prevY, pointerClient.y, posFollow);
        const invDt = dt > 0.001 ? 1 / dt : 60;
        const rawVx = clamp((pointer.pos.x - prevX) * invDt * 0.048, -22, 22);
        const rawVy = clamp((pointer.pos.y - prevY) * invDt * 0.048, -22, 22);
        const velFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 5.5);
        pointer.vel.x = lerp(pointer.vel.x, rawVx, velFollow);
        pointer.vel.y = lerp(pointer.vel.y, rawVy, velFollow);
        pointer.presence = lerp(pointer.presence, 1, 1 - Math.exp(-dt * 5.0));
      } else {
        const decay = Math.exp(-dt * 5.0);
        pointer.vel.x *= decay;
        pointer.vel.y *= decay;
        pointer.presence = lerp(pointer.presence, 0, 1 - Math.exp(-dt * 2.8));
      }
      pointer.holdStrength = lerp(
        pointer.holdStrength,
        pointer.isDown ? 1 : 0,
        reduceMotion ? 1 : 1 - Math.exp(-dt * (pointer.isDown ? 8.5 : 5.5)),
      );

      // Advance active press/release impulses
      for (let i = impulses.length - 1; i >= 0; i--) {
        const imp = impulses[i]!;
        imp.age += dt;
        if (imp.age >= imp.duration) impulses.splice(i, 1);
      }

      // ——— 3. State Signals, Snap Pulses & Serene Ambient Context Pulses ———
      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") {
          launchSignalWave(-1, activeSocket ?? -1, 1.0);
        }
        lastBrain = brain;
      }
      if ((activeSocket ?? null) !== lastActiveSocket) {
        if (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0) {
          launchSignalWave(-1, activeSocket, 0.9);
        }
        lastActiveSocket = activeSocket ?? null;
      }
      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        launchSignalWave(-1, snap.index, 1.15);
      }
      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        launchSignalWave(transfer.fromSocket, transfer.toSocket, 1.1);
      }

      if (!reduceMotion && time > 2.2 && brain === "idle") {
        autoPulseClock -= dt;
        if (autoPulseClock <= 0) {
          autoPulseClock = 6.2;
          const occupied = sockets.map((s, i) => (s === "occupied" ? i : -1)).filter((i) => i >= 0);
          if (occupied.length >= 2) {
            const from = occupied[autoPulseIdx % occupied.length]!;
            const to = occupied[(autoPulseIdx + 1) % occupied.length]!;
            autoPulseIdx++;
            launchSignalWave(from, to, 0.65);
          } else if (occupied.length === 1) {
            autoPulseIdx++;
            launchSignalWave(-1, occupied[0]!, 0.6);
          }
        }
      }

      energy = lerp(energy, BRAIN_TARGET_ENERGY[brain], reduceMotion ? 1 : 1 - Math.exp(-dt * 2.2));

      for (let i = 0; i < socketCount; i++) {
        const s = sockets[i]!;
        if (prevStates[i] !== s) {
          prevStates[i] = s;
          if (s === "occupied") launchSignalWave(-1, i, 1.05);
        }
        const isHovered = hoveredNodeRef.current === i;
        let pointerNear = 0;
        if (pointerClient && latestSocketPts[i]) {
          const d = Math.hypot(pointerClient.x - latestSocketPts[i]!.x, pointerClient.y - latestSocketPts[i]!.y);
          pointerNear = clamp(1 - d / (R * 0.42), 0, 1);
        }
        const hoverTarget = Math.max(isHovered ? 1 : 0, pointerNear * 0.65, activeSocket === i ? 0.9 : 0);
        armHoverHeat[i] = lerp(armHoverHeat[i] ?? 0, hoverTarget, reduceMotion ? 1 : 1 - Math.exp(-dt * 7.5));

        const targetLevel = clamp(SOCKET_TARGET_LEVEL[s] + (armHoverHeat[i] ?? 0) * 0.22, 0, 1.2);
        armLevels[i] = lerp(armLevels[i] ?? targetLevel, targetLevel, reduceMotion ? 1 : 1 - Math.exp(-dt * 3.6));

        if (!reduceMotion) {
          armWavePhases[i] = (armWavePhases[i] ?? 0) + dt * (0.38 + 0.14 * energy + 0.1 * (armHoverHeat[i] ?? 0));
        }
      }

      for (let i = signals.length - 1; i >= 0; i--) {
        const sig = signals[i]!;
        if (!reduceMotion) sig.u += sig.speed * sig.direction * dt;
        if ((sig.direction > 0 && sig.u >= 1.15) || (sig.direction < 0 && sig.u <= -0.15)) {
          signals.splice(i, 1);
        }
      }

      const goldCore = isLight ? LIGHT_GOLD_CORE : DARK_GOLD_CORE;
      const goldBright = isLight ? LIGHT_GOLD_BRIGHT : DARK_GOLD_BRIGHT;
      const goldMid = isLight ? LIGHT_GOLD_MID : DARK_GOLD_MID;
      const goldDeep = isLight ? LIGHT_GOLD_DEEP : DARK_GOLD_DEEP;
      const dormantRgb = isLight ? LIGHT_DORMANT : DARK_DORMANT;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.48 : 1.0;

      ctx.globalCompositeOperation = blendOp;

      // ——— 4. Sample C2 Ribbon Spines & Parametric Opening Unfurl ———
      const spines = L.arms.map((arm) => {
        const unfurl = reduceMotion ? 1 : computeArmUnfurl(time, arm.index, socketCount, fromExplosion);
        return sampleArmSpine(arm, L, time, unfurl, pointer);
      });
      latestSocketPts = spines.map((sp) => sp.socketPt);

      // Sync accessible HTML node overlays strictly via GPU transform (zero React state churn!)
      for (let i = 0; i < socketCount; i++) {
        const btn = nodeButtonRefs.current[i];
        if (!btn) continue;
        const sp = spines[i]!;
        const nodeBloom = smoothstep(SOCKET_U * 0.72, SOCKET_U + 0.18, sp.unfurl);
        btn.style.transform = `translate3d(${sp.socketPt.x.toFixed(1)}px, ${sp.socketPt.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.84 + 0.16 * nodeBloom).toFixed(3)})`;
        btn.style.opacity = nodeBloom.toFixed(3);
      }

      // ——— 5. Serene Twin Horizon Silk Wings ———
      const horizonUnfurl = reduceMotion ? 1 : easeOutCubic(clamp((time - 0.15) / 1.45, 0, 1));
      if (horizonUnfurl > 0.01) {
        field.horizonTierBatches.forEach((indices, tierIdx) => {
          const tier = FIBER_TIERS[tierIdx]!;
          const col = mixRgb(goldMid, goldBright, tier.hot);
          const a = tier.alpha * (isLight ? 0.52 : 0.36) * alphaScale * horizonUnfurl;
          const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, S * 0.84);
          g.addColorStop(0, `rgba(${col}, ${clamp(a * 1.4, 0, 0.88)})`);
          g.addColorStop(0.45, `rgba(${col}, ${clamp(a * 0.65, 0, 0.7)})`);
          g.addColorStop(1, `rgba(${col}, 0)`);

          ctx.beginPath();
          for (const idx of indices) {
            const h = field.horizonFilaments[idx]!;
            const reach = clamp((horizonUnfurl - h.stagger) / (1 - h.stagger), 0, 1);
            if (reach <= 0.01) continue;
            const sway = Math.sin(time * 0.28 + h.phase) * 0.025;
            const baseAngle = h.side < 0 ? Math.PI - 0.14 : 0.14;
            const angle = baseAngle + h.spreadAngle + sway;
            const dist = S * 0.76 * h.reachMul * easeOutCubic(reach);
            const p0: Vec = { x: core.x, y: core.y + h.waistY * R };
            const p3 = add(core, polar(dist, angle));
            let c1 = add(p0, polar(dist * 0.34, angle + h.bend));
            let c2 = add(p0, polar(dist * 0.7, angle - h.bend * 0.6));

            if (pointer.presence > 0.005) {
              const deflect = (pt: Vec): Vec => {
                const dx = pt.x - pointer.pos.x;
                const dy = pt.y - pointer.pos.y;
                const d2 = dx * dx + dy * dy;
                const sig = R * 0.42;
                const k = pointer.presence * Math.exp(-d2 / (2 * sig * sig));
                if (k < 0.003) return pt;
                const d = Math.sqrt(d2) + 30;
                return {
                  x: pt.x + (dx / d) * R * 0.026 * k + pointer.vel.x * 0.08 * k,
                  y: pt.y + (dy / d) * R * 0.026 * k + pointer.vel.y * 0.08 * k,
                };
              };
              c1 = deflect(c1);
              c2 = deflect(c2);
            }

            ctx.moveTo(p0.x, p0.y);
            ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
          }
          ctx.lineWidth = tier.width * (isLight ? 0.92 : 0.85);
          ctx.strokeStyle = g;
          ctx.stroke();
        });
      }

      // ——— 6. Gossamer Inter-Node Synaptic Chords (ONLY between adjacent live occupied nodes) ———
      for (let i = 0; i < socketCount - 1; i++) {
        if (sockets[i] !== "occupied" || sockets[i + 1] !== "occupied") continue;
        const spA = spines[i]!;
        const spB = spines[i + 1]!;
        const bloom = Math.min(
          smoothstep(SOCKET_U, SOCKET_U + 0.22, spA.unfurl),
          smoothstep(SOCKET_U, SOCKET_U + 0.22, spB.unfurl),
        );
        if (bloom <= 0.02) continue;

        const mid: Vec = { x: (spA.socketPt.x + spB.socketPt.x) * 0.5, y: (spA.socketPt.y + spB.socketPt.y) * 0.5 };
        const dirFromCore = Math.atan2(mid.y - core.y, mid.x - core.x);
        for (let k = -1; k <= 1; k++) {
          const sway = Math.sin(time * 0.36 + i * 1.4 + k * 0.7) * R * 0.014;
          const ctrl = add(mid, polar(R * (0.04 + k * 0.025) + sway, dirFromCore));
          ctx.beginPath();
          ctx.moveTo(spA.socketPt.x, spA.socketPt.y);
          ctx.quadraticCurveTo(ctrl.x, ctrl.y, spB.socketPt.x, spB.socketPt.y);
          ctx.lineWidth = k === 0 ? 0.75 : 0.45;
          ctx.strokeStyle = `rgba(${goldBright.join(", ")}, ${(k === 0 ? 0.22 : 0.1) * bloom * alphaScale})`;
          ctx.stroke();
        }
      }

      // ——— 7. The 5 Sculpted Laminar Node Ribbons ———
      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const spine = spines[armIdx]!;
        if (spine.unfurl <= 0.008) continue;

        const level = armLevels[armIdx] ?? 0.2;
        const hover = armHoverHeat[armIdx] ?? 0;
        const isLive = sockets[armIdx] === "occupied";
        const armPhase = reduceMotion ? 3.2 : (armWavePhases[armIdx] ?? 0);

        // Evaluate active travelling luminous signal pulse along this arm
        let sigCenter = -1;
        let sigStrength = 0;
        for (const sig of signals) {
          if (sig.arm === armIdx && sig.u >= -0.05 && sig.u <= 1.05) {
            sigCenter = sig.u;
            sigStrength = Math.max(sigStrength, Math.sin(clamp(sig.u, 0, 1) * Math.PI) * sig.intensity);
          }
        }

        // Check if mouse is hovering along this ribbon for gentle local sheen
        let pointerWarmth = hover * 0.35;
        if (pointer.presence > 0.01) {
          const midPt = spine.pts[Math.floor(SPINE_SAMPLES * 0.28)]!;
          const d = Math.hypot(pointer.pos.x - midPt.x, pointer.pos.y - midPt.y);
          pointerWarmth = Math.max(pointerWarmth, clamp(1 - d / (R * 0.55), 0, 1) * pointer.presence * 0.4);
        }

        const reachEnd = spine.unfurl;
        const tipSampleIdx = Math.min(SPINE_SAMPLES - 1, Math.max(1, Math.round(reachEnd * (SPINE_SAMPLES - 1))));
        const currentTip = spine.pts[tipSampleIdx]!;

        for (let tierIdx = 0; tierIdx < FIBER_TIERS.length; tierIdx++) {
          const tier = FIBER_TIERS[tierIdx]!;
          const batch = field.armTierBatches[armIdx]![tierIdx]!;
          if (!batch.length) continue;

          const activeRgb = mixRgbTuple(goldMid, goldCore, tier.hot);
          const baseRgb = isLive
            ? activeRgb
            : mixRgbTuple(dormantRgb, activeRgb, clamp(hover * 0.72 + sigStrength * 0.5, 0, 1));
          const colStr = `${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}`;
          const highlightStr = `${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]}`;

          const baseAlpha =
            tier.alpha *
            alphaScale *
            (isLive ? 0.58 + 0.52 * level : 0.26 + 0.42 * hover) *
            (1 + 0.18 * energy + 0.26 * pointerWarmth);

          const grad = ctx.createLinearGradient(core.x, core.y, currentTip.x, currentTip.y);
          grad.addColorStop(0, `rgba(${colStr}, ${clamp(baseAlpha * 1.45, 0, 0.96)})`);
          grad.addColorStop(0.32, `rgba(${colStr}, ${clamp(baseAlpha * 1.15, 0, 0.92)})`);
          if (sigCenter > 0.06 && sigCenter < 0.92 && sigStrength > 0.04) {
            grad.addColorStop(
              clamp(sigCenter, 0.08, 0.9),
              `rgba(${highlightStr}, ${clamp(baseAlpha * (1.4 + 0.8 * sigStrength), 0, 1)})`,
            );
          }
          grad.addColorStop(0.68, `rgba(${colStr}, ${clamp(baseAlpha * 0.42, 0, 0.72)})`);
          grad.addColorStop(1, `rgba(${goldDeep.join(", ")}, 0)`);

          ctx.beginPath();
          for (const fIdx of batch) {
            const f = field.armFilaments[fIdx]!;
            const fReach = clamp((reachEnd - f.stagger * 0.5) / (1 - f.stagger * 0.5), 0, 1);
            if (fReach <= 0.01) continue;

            for (let k = 0; k <= CURVE_STEPS; k++) {
              evaluateFilamentPoint(
                f,
                spine,
                SAMPLE_US[k]! * fReach,
                R,
                armPhase,
                level,
                sigStrength,
                pointer,
                impulses,
                scratchXs,
                scratchYs,
                k,
              );
            }
            traceSmoothPolyline(ctx, scratchXs, scratchYs, CURVE_STEPS + 1);
          }

          ctx.lineWidth = tier.width * (isLive ? 1.05 + 0.14 * hover : 0.84 + 0.18 * hover);
          ctx.strokeStyle = grad;
          ctx.stroke();
        }
      }

      // ——— 8. Expanding Subtle Caustic Ripples (Core + Mouse-Press Touch Waves) ———
      ctx.globalCompositeOperation = blendOp;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]!;
        if (!reduceMotion) rp.u += dt * 0.44;
        if (rp.u >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = Math.pow(1 - rp.u, 2.2) * rp.strength;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.06 + rp.u * 1.45), 0, TAU);
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = `rgba(${goldBright.join(", ")}, ${clamp(0.28 * fade * alphaScale, 0, 0.7)})`;
        ctx.stroke();
      }

      // Subtle tactile press-point ripple & hold aura on canvas
      for (const imp of impulses) {
        const p = clamp(imp.age / imp.duration, 0, 1);
        const fade = Math.pow(1 - p, 2.1) * imp.strength;
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, 10 + easeOutCubic(p) * R * 0.46, 0, TAU);
        ctx.lineWidth = imp.polarity < 0 ? 1.1 : 0.85;
        ctx.strokeStyle = `rgba(${goldBright.join(", ")}, ${clamp(0.32 * fade * alphaScale, 0, 0.65)})`;
        ctx.stroke();
      }

      if (pointer.holdStrength > 0.02) {
        radialGlow(ctx, pointer.holdPos, 38 * pointer.holdStrength, [
          [0, `rgba(${goldBright.join(", ")}, ${0.24 * pointer.holdStrength})`],
          [0.55, `rgba(${goldMid.join(", ")}, ${0.08 * pointer.holdStrength})`],
          [1, isLight ? "rgba(255, 255, 255, 0)" : "rgba(7, 7, 9, 0)"],
        ]);
      }

      // ——— 9. Serene Venturi Light Pulses Along Occupied Arms ———
      const speedMul = 1 + 0.7 * energy;
      for (const pt of field.armPhotons) {
        if (sockets[pt.arm] !== "occupied") continue;
        const spine = spines[pt.arm]!;
        if (spine.unfurl < 0.25) continue;

        const distFromWaist = Math.abs(pt.u - SOCKET_U);
        const venturi = 1 + 0.55 * Math.exp(-(distFromWaist * distFromWaist) / 0.02);
        if (!reduceMotion) {
          pt.u = (pt.u + pt.speed * dt * speedMul * venturi) % 1;
        }
        if (pt.u > spine.unfurl) continue;

        const f = field.armFilaments[pt.filamentIdx]!;
        evaluateFilamentPoint(
          f,
          spine,
          pt.u,
          R,
          reduceMotion ? 3.2 : (armWavePhases[pt.arm] ?? 0),
          armLevels[pt.arm] ?? 1,
          0,
          pointer,
          impulses,
          scratchXs,
          scratchYs,
          0,
        );
        const edgeFade = Math.sin((pt.u / Math.max(0.01, spine.unfurl)) * Math.PI);
        const pAlpha = clamp(pt.alpha * edgeFade * (isLight ? 0.78 : 0.85), 0, 1);
        if (pAlpha < 0.02) continue;

        const px = scratchXs[0]!;
        const py = scratchYs[0]!;
        ctx.fillStyle = `rgba(${(isLight ? goldDeep : goldCore).join(", ")}, ${pAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, pt.size, 0, TAU);
        ctx.fill();
      }

      // ——— 10. Precision Node Reticles (Apparent Yet Subtle — Drawn Cleanly at Each Optical Waist) ———
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < socketCount; i++) {
        const sp = spines[i]!;
        const nodeBloom = smoothstep(SOCKET_U * 0.72, SOCKET_U + 0.16, sp.unfurl);
        if (nodeBloom <= 0.01) continue;

        const s = sockets[i]!;
        const hover = armHoverHeat[i] ?? 0;
        const isActive = activeSocket === i;
        const pt = sp.socketPt;
        const scale = (0.76 + 0.24 * nodeBloom) * (1 + 0.14 * hover + (isActive ? 0.08 : 0));

        if (s === "occupied") {
          // Soft ambient halo beneath live node reticle
          radialGlow(ctx, pt, 34 * scale, [
            [0, `rgba(${goldBright.join(", ")}, ${(isLight ? 0.26 : 0.22) * nodeBloom * (1 + 0.45 * hover)})`],
            [0.55, `rgba(${goldMid.join(", ")}, ${(isLight ? 0.09 : 0.07) * nodeBloom})`],
            [1, isLight ? "rgba(255, 255, 255, 0)" : "rgba(7, 7, 9, 0)"],
          ]);

          // Subtle rotating outer orbital arc (Apple precision instrument feel)
          const rot = time * 0.22 + i * 1.25;
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.arc(0, 0, 21.5 * scale, -0.75, 1.35);
          ctx.lineWidth = 1.0;
          ctx.strokeStyle = `rgba(${(isLight ? goldDeep : goldBright).join(", ")}, ${(0.34 + 0.42 * hover) * nodeBloom})`;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, 21.5 * scale, Math.PI - 0.55, Math.PI + 1.05);
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = `rgba(${(isLight ? goldMid : goldMid).join(", ")}, ${(0.22 + 0.3 * hover) * nodeBloom})`;
          ctx.stroke();
          ctx.restore();

          // Matte translucent disc + crisp gold hairline ring
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 14.5 * scale, 0, TAU);
          ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.9)" : "rgba(14, 14, 18, 0.86)";
          ctx.fill();
          ctx.lineWidth = isActive ? 1.75 : 1.3;
          ctx.strokeStyle = `rgba(${(isLight ? goldDeep : goldBright).join(", ")}, ${(0.72 + 0.28 * hover) * nodeBloom})`;
          ctx.stroke();
        } else if (s === "open") {
          ctx.save();
          ctx.setLineDash([3.5, 3.5]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 12.5 * scale, 0, TAU);
          ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.74)" : "rgba(14, 14, 18, 0.65)";
          ctx.fill();
          ctx.lineWidth = 1.1;
          ctx.strokeStyle =
            hover > 0.1
              ? `rgba(${(isLight ? goldDeep : goldBright).join(", ")}, ${(0.45 + 0.45 * hover) * nodeBloom})`
              : isLight
                ? `rgba(14, 15, 18, ${0.26 * nodeBloom})`
                : `rgba(255, 255, 255, ${0.24 * nodeBloom})`;
          ctx.stroke();
          ctx.restore();
        } else {
          // Locked Pro socket: quiet subtle architectural dot-ring
          ctx.save();
          ctx.setLineDash([2, 3.5]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 10.5 * scale, 0, TAU);
          ctx.fillStyle = isLight ? "rgba(247, 246, 242, 0.72)" : "rgba(14, 14, 18, 0.52)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = isLight
            ? `rgba(14, 15, 18, ${(0.18 + 0.22 * hover) * nodeBloom})`
            : `rgba(255, 255, 255, ${(0.14 + 0.22 * hover) * nodeBloom})`;
          ctx.stroke();
          ctx.restore();
        }
      }

      // ——— 11. Serene Optical Singularity Nucleus ———
      const breathe = 1 + 0.035 * Math.sin(time * 0.7) + 0.06 * energy;
      ctx.globalCompositeOperation = blendOp;
      radialGlow(ctx, core, R * 0.22 * breathe * coreBloom, [
        [0, `rgba(${(isLight ? LIGHT_GOLD_CORE : DARK_GOLD_CORE).join(", ")}, ${isLight ? 0.96 : 0.95})`],
        [0.2, `rgba(${goldBright.join(", ")}, ${isLight ? 0.64 : 0.56})`],
        [0.52, `rgba(${goldMid.join(", ")}, ${isLight ? 0.2 : 0.16})`],
        [1, isLight ? "rgba(255, 255, 255, 0)" : "rgba(7, 7, 9, 0)"],
      ]);

      // Whisper-fine horizontal optical caustic glint at core
      ctx.save();
      ctx.translate(core.x, core.y);
      ctx.scale(2.8, 0.22);
      radialGlow(ctx, { x: 0, y: 0 }, R * 0.15 * breathe * coreBloom, [
        [0, `rgba(${(isLight ? LIGHT_GOLD_BRIGHT : DARK_GOLD_CORE).join(", ")}, ${isLight ? 0.45 : 0.34})`],
        [0.5, `rgba(${goldMid.join(", ")}, ${isLight ? 0.12 : 0.08})`],
        [1, isLight ? "rgba(255, 255, 255, 0)" : "rgba(7, 7, 9, 0)"],
      ]);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      layout = computeStageLayout(width, height, socketCount);
      latestSocketPts = layout.sockets;
      draw(elapsed, 0);
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
      smoothDt = lerp(smoothDt, rawDt, 0.18);
      elapsed += smoothDt;
      draw(elapsed, smoothDt);
      frame = requestAnimationFrame(loop);
    };

    const syncLoop = () => {
      const shouldRun = !reduceMotion && elementActive && !signalRef.current.paused;
      if (shouldRun && frame === 0) {
        last = 0;
        smoothDt = 1 / 60;
        frame = requestAnimationFrame(loop);
      } else if (!shouldRun && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    };

    syncLoopRef.current = syncLoop;
    redrawRef.current = reduceMotion ? () => draw(10, 0) : null;
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
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      redrawRef.current = null;
      syncLoopRef.current = null;
    };
  }, [socketCount]);

  const labels = signal.socketLabels ?? [];

  return (
    <div className={`relative h-full w-full ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" aria-hidden />

      {/* Accessible Interactive Node Anchors — positioned in real time at each ribbon's optical waist */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {signal.sockets.map((status, idx) => {
          const meta = labels[idx];
          const name = meta?.name ?? (status === "open" ? "Open socket" : "Pro socket");
          const monogram = meta?.monogram ?? "";
          const isOccupied = status === "occupied";
          const isOpen = status === "open";
          const isActive = signal.activeSocket === idx;

          return (
            <button
              key={idx}
              ref={(el) => {
                nodeButtonRefs.current[idx] = el;
              }}
              type="button"
              onMouseEnter={() => {
                hoveredNodeRef.current = idx;
              }}
              onMouseLeave={() => {
                if (hoveredNodeRef.current === idx) hoveredNodeRef.current = -1;
              }}
              onFocus={() => {
                hoveredNodeRef.current = idx;
              }}
              onBlur={() => {
                if (hoveredNodeRef.current === idx) hoveredNodeRef.current = -1;
              }}
              onClick={() => onSelectRef.current?.(idx)}
              aria-label={
                isOccupied
                  ? `Open ${name} node`
                  : isOpen
                    ? `Snap a node into free socket ${idx + 1}`
                    : `Locked Pro socket ${idx + 1}`
              }
              className={`neural-node-anchor group pointer-events-auto absolute top-0 left-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--land-gold)] ${
                isOccupied
                  ? "neural-node-anchor--live"
                  : isOpen
                    ? "neural-node-anchor--open"
                    : "neural-node-anchor--locked"
              } ${isActive ? "neural-node-anchor--active" : ""}`}
              style={{ opacity: 0 }}
            >
              {/* Crisp centered glyph/monogram seated directly inside the canvas reticle */}
              <span className="neural-node-glyph pointer-events-none flex items-center justify-center">
                {isOccupied ? (
                  <span className="text-[10px] font-semibold tracking-[0.02em]">{monogram}</span>
                ) : isOpen ? (
                  <Plus className="size-3" strokeWidth={1.85} aria-hidden />
                ) : (
                  <Lock className="size-2.5" strokeWidth={1.85} aria-hidden />
                )}
              </span>

              {/* Subtle floating architectural caption directly above the node */}
              <span className="neural-node-tag pointer-events-none">
                <span className="neural-node-tag-name">{name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
