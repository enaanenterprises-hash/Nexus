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
const INTRO_SECONDS = 2.4;
const SOCKET_U = 0.34;
const SPINE_SAMPLES = 64;
const FILAMENTS_PER_ARM = 40;
const HORIZON_STRANDS = 76;

const GOLD_SPECULAR: Rgb = [255, 251, 236];
const GOLD_BRIGHT: Rgb = [255, 224, 154];
const GOLD_MID: Rgb = [244, 180, 72];
const GOLD_DEEP: Rgb = [198, 122, 32];

const GOLD_LIGHT_SPEC: Rgb = [164, 98, 8];
const GOLD_LIGHT_MID: Rgb = [192, 122, 16];
const GOLD_LIGHT_DEEP: Rgb = [138, 80, 6];

// Crimson red strictly for the outer trailing endpoints of the flowing golden waves when a node activates
const CRIMSON_WARM: Rgb = [255, 92, 70];
const CRIMSON_ENDPOINT: Rgb = [248, 44, 42];
const CRIMSON_DEEP: Rgb = [188, 18, 28];

const SOCKET_TARGET_LEVEL: Record<SocketVisual, number> = {
  occupied: 1.0,
  open: 0.48,
  locked: 0.24,
};

const BRAIN_TARGET_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.14,
  thinking: 1.0,
  responding: 0.72,
};

const DEPTH_LAYERS = [
  { width: 1.75, alpha: 0.065, hot: 0.0 },
  { width: 0.95, alpha: 0.16, hot: 0.35 },
  { width: 0.58, alpha: 0.3, hot: 0.72 },
  { width: 0.36, alpha: 0.48, hot: 1.0 },
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
  /** Signed laminar coordinate across [-1, 1]. */
  xi: number;
  /** Coherent laminar phase so neighboring lines undulate together like liquid silk. */
  coherentPhase: number;
  /** Gentle outer fan expansion factor. */
  flareSpread: number;
  /** Singularity wake-up stagger in [0, 1]. */
  stagger: number;
};

type HorizonFilament = {
  layer: number;
  chirality: -1 | 1;
  xi: number;
  waistOffset: number;
  leftAngle: number;
  rightAngle: number;
  leftReach: number;
  rightReach: number;
  curvature: number;
  coherentPhase: number;
  stagger: number;
};

type TravellingOrb = {
  arm: number;
  filamentIdx: number;
  u: number;
  speed: number;
  radius: number;
  alpha: number;
};

type SolitonWave = {
  arm: number;
  u: number;
  speed: number;
  intensity: number;
  crimson: boolean;
};

/* ============================================================================
   PROCEDURAL LAMINAR FIELD GENERATOR
   ============================================================================ */

function createNeuralField(armCount: number) {
  const { rnd, between } = seededHelpers(20261117);

  const armFilaments: ArmFilament[] = [];
  const armLayerBatches: number[][][] = Array.from({ length: armCount }, () =>
    DEPTH_LAYERS.map(() => [] as number[]),
  );

  for (let arm = 0; arm < armCount; arm++) {
    const armPhaseOffset = arm * 1.25;
    for (let i = 0; i < FILAMENTS_PER_ARM; i++) {
      // Uniformly stratified laminar coordinates [-1, 1] — no random clumping or harsh crossovers
      const xi = ((i + 0.5) / FILAMENTS_PER_ARM) * 2 - 1;
      const distFromCenter = Math.abs(xi);
      const layer =
        distFromCenter < 0.22
          ? 3
          : distFromCenter < 0.52
            ? 2
            : distFromCenter < 0.8
              ? 1
              : 0;
      const idx = armFilaments.length;
      armFilaments.push({
        arm,
        layer,
        xi,
        // Coherent phase varies smoothly with xi so all strands move as a unified fluid wave
        coherentPhase: armPhaseOffset + xi * 1.15 + 0.25 * Math.sin(xi * Math.PI),
        flareSpread: 0.72 + 0.48 * distFromCenter,
        stagger: clamp(distFromCenter * 0.32 + arm * 0.03, 0, 0.55),
      });
      armLayerBatches[arm]![layer]!.push(idx);
    }
  }

  // Coherent horizon wave sheets sweeping into the left and right corners
  const horizonFilaments: HorizonFilament[] = [];
  const horizonLayerBatches: number[][] = DEPTH_LAYERS.map(() => [] as number[]);

  for (let i = 0; i < HORIZON_STRANDS; i++) {
    const xi = ((i + 0.5) / HORIZON_STRANDS) * 2 - 1;
    const distFromCenter = Math.abs(xi);
    const layer =
      distFromCenter < 0.2
        ? 3
        : distFromCenter < 0.5
          ? 2
          : distFromCenter < 0.8
            ? 1
            : 0;
    const chirality: -1 | 1 = i % 2 === 0 ? 1 : -1;
    // Smooth laminar fan of angles that sweeps into the corners while keeping bottom-center negative space clear
    const lift = xi * 0.46;
    const idx = horizonFilaments.length;
    horizonFilaments.push({
      layer,
      chirality,
      xi,
      waistOffset: xi * 0.014,
      leftAngle: Math.PI - (lift + 0.08 * chirality),
      rightAngle: lift - 0.08 * chirality,
      leftReach: 0.98 + 0.32 * (1 - distFromCenter * 0.4),
      rightReach: 0.98 + 0.32 * (1 - distFromCenter * 0.4),
      curvature: xi * 0.16,
      coherentPhase: xi * 1.35 + (chirality > 0 ? 0 : 0.7),
      stagger: clamp(distFromCenter * 0.4 + 0.08, 0.05, 0.6),
    });
    horizonLayerBatches[layer]!.push(idx);
  }

  // Travelling micro-orbs gliding smoothly along the golden waves
  const microOrbs: TravellingOrb[] = Array.from({ length: 95 }, (_, i) => {
    const filamentIdx = (i * 7) % armFilaments.length;
    const f = armFilaments[filamentIdx]!;
    return {
      arm: f.arm,
      filamentIdx,
      u: (i / 95 + rnd() * 0.08) % 1,
      speed: between(0.045, 0.095),
      radius: between(1.1, 2.3),
      alpha: between(0.55, 0.95),
    };
  });

  return {
    armFilaments,
    armLayerBatches,
    horizonFilaments,
    horizonLayerBatches,
    microOrbs,
  };
}

/* ============================================================================
   LAMINAR FLUID MATHEMATICS & 3D ORB RENDERING
   ============================================================================ */

function singularityUnfurl(intro: number, stagger: number): number {
  const u = clamp((intro - stagger * 0.24) / (1 - stagger * 0.24), 0, 1);
  if (u <= 0) return 0.001;
  // Smooth quintic-like ease-out with zero harsh snap
  const inv = 1 - u;
  return clamp(1 - inv * inv * inv * (1 + 0.35 * u), 0.001, 1);
}

/**
 * Samples a C2-continuous spine frame from `core` (u = 0), through `socket` (u = SOCKET_U),
 * and out past the viewport corner (`cornerTip`, u = 1), with gentle, natural fluid undulation.
 */
function sampleArmSpine(
  arm: ArmGeometry,
  L: StageLayout,
  time: number,
  intro: number,
  pointerOffset: Vec,
): SpineFrame {
  const { core, radius: R } = L;
  const unfurlInner = singularityUnfurl(intro, 0.05);
  const unfurlOuter = singularityUnfurl(intro, 0.18);

  // Slow, meditative Euler-like wave motion
  const slowSway = Math.sin(time * 0.28 + arm.index * 1.2);
  const deepBreath = Math.cos(time * 0.21 + arm.index * 1.7);

  const perpAngle = arm.coreAngle + Math.PI * 0.5;
  const socketSway = polar(R * 0.016 * slowSway, perpAngle);

  const rawSocket = add(arm.socket, {
    x: socketSway.x + pointerOffset.x * 0.12,
    y: socketSway.y + pointerOffset.y * 0.12,
  });

  const socketPt: Vec = {
    x: lerp(core.x, rawSocket.x, unfurlInner),
    y: lerp(core.y, rawSocket.y, unfurlInner),
  };

  const tangentAngle =
    Math.atan2(arm.socketTangent.y, arm.socketTangent.x) + 0.024 * deepBreath;
  const T_sock = { x: Math.cos(tangentAngle), y: Math.sin(tangentAngle) };

  const innerDist = Math.hypot(socketPt.x - core.x, socketPt.y - core.y);
  const c1 = add(
    core,
    polar(innerDist * 0.45, arm.coreAngle + 0.032 * slowSway),
  );
  const c2: Vec = {
    x: socketPt.x - T_sock.x * innerDist * 0.38,
    y: socketPt.y - T_sock.y * innerDist * 0.38,
  };

  const rawTip = add(
    arm.cornerTip,
    polar(R * 0.12 * deepBreath, arm.cornerAngle + Math.PI * 0.5),
  );
  const tipPt: Vec = {
    x: lerp(socketPt.x, rawTip.x, unfurlOuter),
    y: lerp(socketPt.y, rawTip.y, unfurlOuter),
  };

  const outerDist = Math.hypot(tipPt.x - socketPt.x, tipPt.y - socketPt.y);
  // Collinear tangent across socketPt guarantees C1/C2 smoothness with zero kink
  const d1: Vec = {
    x: socketPt.x + T_sock.x * outerDist * 0.34,
    y: socketPt.y + T_sock.y * outerDist * 0.34,
  };
  const d2 = add(
    socketPt,
    polar(
      outerDist * 0.68,
      lerp(tangentAngle, arm.cornerAngle, 0.64) - 0.028 * slowSway,
    ),
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

  return { pts, normals, tangents, socketPt, tipPt };
}

/**
 * Evaluates a filament point using low-wavenumber coherent laminar ribbon math.
 * Neighboring strands share a smooth phase gradient so the entire bundle undulates
 * like liquid gold silk in slow motion rather than harsh high-frequency ripples.
 */
function evaluateArmFilamentPoint(
  f: ArmFilament,
  spine: SpineFrame,
  u: number,
  R: number,
  time: number,
  armLevel: number,
  callHeat: number,
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

  // Smooth laminar waist radius that hugs the node orb
  const waistRadius = R * lerp(0.026, 0.012, armLevel);

  let envelope = 0;
  if (u <= SOCKET_U) {
    const s = u / SOCKET_U; // 0 .. 1 from core orb to node orb
    // Smooth sine-squared spindle lens that converges gently into the node orb
    const spindle = Math.sin(Math.PI * s);
    const bellyWidth = R * (0.105 + 0.018 * (1 - armLevel));
    envelope = bellyWidth * spindle + waistRadius * Math.sin(s * Math.PI * 0.5);
  } else {
    const s = (u - SOCKET_U) / (1 - SOCKET_U); // 0 .. 1 from node orb out past the screen corners
    // Smooth, un-harsh laminar fan that sweeps all the way into the viewport corners
    const smoothS = s * s * (3 - 2 * s); // Hermite smoothstep for C1 zero-derivative start at the orb
    const linearS = Math.pow(s, 1.28);
    const flare = (smoothS * 0.35 + linearS * 0.65) * R * 1.38 * f.flareSpread;
    envelope = waistRadius + flare;
  }

  // Long-wavelength, low-frequency coherent ribbon wave (no harsh wiggles)
  const omega = 0.52 + 0.38 * callHeat;
  const wavePrimary = Math.sin(u * 2.35 * Math.PI - time * omega + f.coherentPhase);
  const waveSecondary = Math.cos(u * 1.15 * Math.PI - time * omega * 0.68 + f.coherentPhase * 0.7);
  // Wave amplitude is zero at the core and node orb so the orbs stay anchored, swelling gently in the outer plume
  const pinchDamping = Math.min(1, Math.abs(u - SOCKET_U) / 0.12);
  const waveAmp =
    R *
    0.024 *
    Math.pow(u, 1.15) *
    pinchDamping *
    (1 + 0.25 * callHeat);

  const offset = f.xi * envelope + (wavePrimary * 0.72 + waveSecondary * 0.28) * waveAmp;

  return {
    x: cx + nx * offset,
    y: cy + ny * offset,
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
): [Vec, Vec, Vec, Vec, Vec, Vec, Vec] {
  const { core, scale: S, radius: R } = L;
  const reach = singularityUnfurl(intro, h.stagger);
  const swayA = Math.sin(time * 0.26 + h.coherentPhase);
  const swayB = Math.cos(time * 0.19 + h.coherentPhase * 0.8);

  const waist: Vec = {
    x: core.x,
    y: core.y + h.waistOffset * R * reach,
  };

  const lAngle = h.leftAngle + 0.028 * swayA;
  const rAngle = h.rightAngle + 0.028 * swayB;

  const lDist = h.leftReach * S * reach;
  const rDist = h.rightReach * S * reach;

  const pLeft = add(core, polar(lDist, lAngle));
  const pRight = add(core, polar(rDist, rAngle));

  const bridgeAngle = (rAngle + (lAngle - Math.PI)) * 0.5 + 0.02 * swayA;
  const pull = Math.min(lDist, rDist) * 0.36;
  const tVec = { x: Math.cos(bridgeAngle) * pull, y: Math.sin(bridgeAngle) * pull };

  const cLeft1 = add(pLeft, polar(lDist * 0.38, lAngle + Math.PI + h.curvature));
  const cLeft2 = { x: waist.x - tVec.x, y: waist.y - tVec.y };

  const cRight1 = { x: waist.x + tVec.x, y: waist.y + tVec.y };
  const cRight2 = add(pRight, polar(rDist * 0.38, rAngle + Math.PI - h.curvature));

  return [pLeft, cLeft1, cLeft2, waist, cRight1, cRight2, pRight];
}

/**
 * Renders a sculpted 3D spherical Orb (rather than a washed-out radial fog blob):
 * - Tight inverse-square atmospheric meniscus
 * - Spherical 3D body with off-axis specular highlight and warm rim light
 * - Precision orbital ring
 */
function drawSculptedOrb(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  orbRadius: number,
  options: {
    coreRgb: Rgb;
    midRgb: Rgb;
    rimRgb: Rgb;
    alpha: number;
    ringRadius?: number;
    ringAlpha?: number;
    dashedRing?: boolean;
    phase?: number;
    isLight?: boolean;
  },
) {
  const {
    coreRgb,
    midRgb,
    rimRgb,
    alpha,
    ringRadius,
    ringAlpha = 0,
    dashedRing = false,
    phase = 0,
    isLight = false,
  } = options;
  if (alpha <= 0.01 || orbRadius <= 0.5) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = clamp(alpha, 0, 1);

  // 1. Tight, mathematically bounded meniscus aura (only 2.1x orbRadius, not a screen-filling fog)
  const auraR = orbRadius * 2.15;
  const aura = ctx.createRadialGradient(
    center.x,
    center.y,
    orbRadius * 0.6,
    center.x,
    center.y,
    auraR,
  );
  aura.addColorStop(0, `rgba(${midRgb.join(", ")}, ${isLight ? 0.28 : 0.38})`);
  aura.addColorStop(0.55, `rgba(${rimRgb.join(", ")}, ${isLight ? 0.08 : 0.11})`);
  aura.addColorStop(1, `rgba(${rimRgb.join(", ")}, 0)`);
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(center.x, center.y, auraR, 0, TAU);
  ctx.fill();

  // 2. Precision orbital ring around the orb
  if (ringRadius && ringAlpha > 0.01) {
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(phase);
    ctx.beginPath();
    if (dashedRing) ctx.setLineDash([3, 3.5]);
    ctx.arc(0, 0, ringRadius, 0, TAU);
    ctx.strokeStyle = `rgba(${midRgb.join(", ")}, ${ringAlpha})`;
    ctx.lineWidth = 1.05;
    ctx.stroke();
    ctx.restore();
  }

  // 3. 3D Spherical Orb Body with off-center specular highlight
  const specX = center.x - orbRadius * 0.28;
  const specY = center.y - orbRadius * 0.28;
  const sphereGrad = ctx.createRadialGradient(
    specX,
    specY,
    orbRadius * 0.08,
    center.x,
    center.y,
    orbRadius,
  );
  sphereGrad.addColorStop(0, `rgba(${coreRgb.join(", ")}, 1)`);
  sphereGrad.addColorStop(0.45, `rgba(${midRgb.join(", ")}, 0.96)`);
  sphereGrad.addColorStop(0.85, `rgba(${rimRgb.join(", ")}, 0.92)`);
  sphereGrad.addColorStop(1, `rgba(${coreRgb.join(", ")}, 0.98)`);

  ctx.fillStyle = sphereGrad;
  ctx.beginPath();
  ctx.arc(center.x, center.y, orbRadius, 0, TAU);
  ctx.fill();

  // 4. Crisp spherical rim border
  ctx.strokeStyle = `rgba(${coreRgb.join(", ")}, ${isLight ? 0.65 : 0.78})`;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.arc(center.x, center.y, orbRadius, 0, TAU);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a minimal, clean architectural node indicator badge next to each Node Orb
 * so the user can always see which node is at each arm.
 */
function drawNodeIndicator(
  ctx: CanvasRenderingContext2D,
  orbPt: Vec,
  corePt: Vec,
  orbRadius: number,
  labelInfo: { monogram: string; name: string; status: string },
  armIndex: number,
  level: number,
  callHeat: number,
  hovered: boolean,
  introEase: number,
  isLight: boolean,
): { x: number; y: number; w: number; h: number } {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  const isLive = labelInfo.status === "connected";
  const isOpen = labelInfo.status === "open";
  const displayText = isLive
    ? labelInfo.name
    : isOpen
      ? `0${armIndex + 1} · Open`
      : `0${armIndex + 1} · Pro`;

  ctx.font = `${isLive ? 600 : 500} 10.5px Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const textMetrics = ctx.measureText(displayText);
  const dotSpace = isLive ? 12 : 0;
  const padX = 8.5;
  const pillW = Math.ceil(textMetrics.width + padX * 2 + dotSpace);
  const pillH = 21;

  // Position the indicator badge cleanly below or beside the orb away from the core
  const dx = orbPt.x - corePt.x;
  const pillX =
    Math.abs(dx) < 40
      ? orbPt.x - pillW * 0.5
      : dx < 0
        ? orbPt.x - orbRadius - pillW - 9
        : orbPt.x + orbRadius + 9;
  const pillY =
    Math.abs(dx) < 40
      ? orbPt.y - orbRadius - pillH - 9
      : orbPt.y - pillH * 0.5;

  const baseOpacity = isLive
    ? 0.92
    : isOpen
      ? 0.68
      : 0.46;
  const alpha = clamp((baseOpacity + (hovered ? 0.25 : 0) + callHeat * 0.2) * introEase, 0, 1);
  ctx.globalAlpha = alpha;

  // Delicate connector tick from orb rim to indicator pill
  ctx.beginPath();
  if (Math.abs(dx) < 40) {
    ctx.moveTo(orbPt.x, orbPt.y - orbRadius - 2);
    ctx.lineTo(orbPt.x, pillY + pillH);
  } else if (dx < 0) {
    ctx.moveTo(orbPt.x - orbRadius - 2, orbPt.y);
    ctx.lineTo(pillX + pillW, orbPt.y);
  } else {
    ctx.moveTo(orbPt.x + orbRadius + 2, orbPt.y);
    ctx.lineTo(pillX, orbPt.y);
  }
  const tickColor =
    callHeat > 0.1
      ? mixRgb(GOLD_MID, CRIMSON_ENDPOINT, callHeat * 0.85)
      : isLight
        ? "82, 82, 91"
        : "244, 180, 72";
  ctx.strokeStyle = `rgba(${tickColor}, ${isLive ? 0.55 : 0.28})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pill capsule background
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 999);
  ctx.fillStyle = isLight
    ? isLive
      ? "rgba(255, 255, 255, 0.94)"
      : "rgba(247, 247, 248, 0.85)"
    : isLive
      ? "rgba(10, 9, 7, 0.86)"
      : "rgba(8, 8, 10, 0.72)";
  ctx.fill();

  const borderColor =
    callHeat > 0.1
      ? `rgba(${mixRgb(GOLD_MID, CRIMSON_ENDPOINT, callHeat * 0.9)}, ${0.55 + 0.3 * callHeat})`
      : isLive
        ? isLight
          ? "rgba(184, 120, 16, 0.45)"
          : "rgba(244, 180, 72, 0.48)"
        : isLight
          ? "rgba(9, 9, 11, 0.14)"
          : "rgba(255, 255, 255, 0.14)";
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Status micro-orb inside the indicator pill for connected nodes
  let textStartX = pillX + padX;
  if (isLive) {
    const dotX = pillX + padX + 3;
    const dotY = pillY + pillH * 0.5;
    const dotRgb = callHeat > 0.1 ? mixRgb(GOLD_BRIGHT, CRIMSON_ENDPOINT, callHeat * 0.9) : "244, 180, 72";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2.7, 0, TAU);
    ctx.fillStyle = `rgb(${dotRgb})`;
    ctx.fill();
    textStartX += dotSpace;
  }

  // Node name / label text
  ctx.fillStyle = isLight
    ? isLive
      ? "#09090b"
      : "#52525b"
    : isLive
      ? "#f5f5f7"
      : "#a1a1a6";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(displayText, textStartX, pillY + pillH * 0.5 + 0.5);

  ctx.restore();
  return { x: pillX, y: pillY, w: pillW, h: pillH };
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

    const armLevels = signalRef.current.sockets.map((s) => SOCKET_TARGET_LEVEL[s]);
    const armCallHeat = signalRef.current.sockets.map(() => 0);
    const solitons: SolitonWave[] = [];
    const hitBoxes: Array<{ orb: Vec; orbR: number; pill: { x: number; y: number; w: number; h: number } }> = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    let energy = BRAIN_TARGET_ENERGY[signalRef.current.brain];
    let globalCallHeat = 0;
    let hoveredSocket = -1;

    const pointerTarget: Vec = { x: 0, y: 0 };
    const pointerSmooth: Vec = { x: 0, y: 0 };
    let pointerClient: Vec | null = null;

    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const findHitSocket = (pt: Vec): number => {
      for (let i = 0; i < hitBoxes.length; i++) {
        const hb = hitBoxes[i];
        if (!hb) continue;
        if (Math.hypot(pt.x - hb.orb.x, pt.y - hb.orb.y) <= hb.orbR + 10) return i;
        if (
          pt.x >= hb.pill.x - 4 &&
          pt.x <= hb.pill.x + hb.pill.w + 4 &&
          pt.y >= hb.pill.y - 4 &&
          pt.y <= hb.pill.y + hb.pill.h + 4
        ) {
          return i;
        }
      }
      return -1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerClient = { x, y };
      pointerTarget.x = ((x / rect.width) - 0.5) * 22;
      pointerTarget.y = ((y / rect.height) - 0.48) * 22;
      hoveredSocket = findHitSocket(pointerClient);
      canvas.style.cursor = hoveredSocket >= 0 && onSelectRef.current ? "pointer" : "default";
    };

    const onPointerLeave = () => {
      pointerClient = null;
      hoveredSocket = -1;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
      canvas.style.cursor = "default";
    };

    const onClick = (e: MouseEvent) => {
      if (!onSelectRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const hit = findHitSocket({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (hit >= 0) {
        launchNodeCall(hit, true);
        onSelectRef.current(hit);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    const launchNodeCall = (targetSocket: number, crimson: boolean) => {
      if (crimson) globalCallHeat = Math.max(globalCallHeat, 1);
      if (targetSocket >= 0 && targetSocket < socketCount) {
        if (crimson) armCallHeat[targetSocket] = 1;
        if (!reduceMotion) {
          solitons.push({
            arm: targetSocket,
            u: 0,
            speed: 0.72,
            intensity: 1,
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
                speed: 0.68,
                intensity: 1,
                crimson,
              });
            }
          }
        });
      }
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, socketLabels, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const L = layout;
      const { width, height, core, radius: R, scale: S } = L;

      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const introEase = 1 - Math.pow(1 - intro, 3);

      // Smooth pointer parallax
      const pFollow = reduceMotion ? 1 : 1 - Math.exp(-dt * 3.8);
      pointerSmooth.x = lerp(pointerSmooth.x, pointerTarget.x, pFollow);
      pointerSmooth.y = lerp(pointerSmooth.y, pointerTarget.y, pFollow);

      // Node activation detection
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

      const isCallingAnyNode =
        brain === "thinking" ||
        brain === "responding" ||
        (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0);

      const targetGlobalCall = isCallingAnyNode ? 1 : 0;
      globalCallHeat = lerp(
        globalCallHeat,
        targetGlobalCall,
        reduceMotion ? 1 : 1 - Math.exp(-dt * (targetGlobalCall > globalCallHeat ? 4.2 : 1.4)),
      );

      energy = lerp(
        energy,
        BRAIN_TARGET_ENERGY[brain],
        reduceMotion ? 1 : 1 - Math.exp(-dt * 2.6),
      );

      sockets.forEach((s, i) => {
        const hoverBoost = hoveredSocket === i ? 0.18 : 0;
        const targetLevel = clamp(SOCKET_TARGET_LEVEL[s] + hoverBoost, 0, 1.15);
        armLevels[i] = lerp(
          armLevels[i] ?? targetLevel,
          targetLevel,
          reduceMotion ? 1 : 1 - Math.exp(-dt * 3.2),
        );

        const armIsCalled =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && s === "occupied");
        const targetArmHeat = armIsCalled ? 1 : globalCallHeat * (s === "occupied" ? 0.85 : 0.4);
        armCallHeat[i] = lerp(
          armCallHeat[i] ?? 0,
          targetArmHeat,
          reduceMotion ? 1 : 1 - Math.exp(-dt * (targetArmHeat > (armCallHeat[i] ?? 0) ? 4.5 : 1.35)),
        );
      });

      for (let i = solitons.length - 1; i >= 0; i--) {
        const sol = solitons[i]!;
        if (!reduceMotion) sol.u += sol.speed * dt;
        if (sol.u >= 1.15) solitons.splice(i, 1);
      }

      const goldSpec = isLight ? GOLD_LIGHT_SPEC : GOLD_SPECULAR;
      const goldBright = isLight ? GOLD_LIGHT_MID : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.45 : 1.0;

      const breathe = 1 + 0.035 * Math.sin(time * (0.55 + energy * 0.8));

      // ——— 1. Pure Background (No blurry glow blobs) ———
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#f7f7f8" : "#000000";
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = Math.min(1, intro * 2.2);

      // ——— 2. Pre-sample C2 Spine Frames for the 5 Functional Node Arms ———
      const spines = L.arms.map((arm) =>
        sampleArmSpine(arm, L, time, intro, pointerSmooth),
      );

      // ——— 3. Flowing Golden Horizon Waves (Golden Body -> Crimson Red at Endpoints When Node Activates) ———
      const fieldRadius = S * 1.24 * (0.2 + 0.8 * introEase);
      const horizonCurves = field.horizonFilaments.map((h) =>
        evaluateHorizonCurve(h, L, time, intro),
      );

      field.horizonLayerBatches.forEach((indices, layerIdx) => {
        if (!indices.length) return;
        const layer = DEPTH_LAYERS[layerIdx]!;
        const baseGold = mixRgbTuple(goldMid, goldBright, layer.hot);
        const goldColor = `${baseGold[0]}, ${baseGold[1]}, ${baseGold[2]}`;
        // Endpoints of the flowing golden waves shift to crimson red when a node activates
        const endpointWarm = mixRgb(baseGold, CRIMSON_WARM, globalCallHeat * 0.88);
        const endpointCrimson = mixRgb(goldDeep, CRIMSON_ENDPOINT, globalCallHeat * 0.98);
        const a = layer.alpha * 0.56 * alphaScale * (0.78 + 0.32 * energy);

        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, fieldRadius);
        // 0.00 -> 0.62: Pure flowing golden wave lines
        g.addColorStop(0, `rgba(${goldColor}, ${Math.min(1, a * 2.1)})`);
        g.addColorStop(0.32, `rgba(${goldColor}, ${Math.min(1, a * 1.15)})`);
        g.addColorStop(0.62, `rgba(${goldColor}, ${a * 0.58})`);
        // 0.74 -> 1.00: The outer trailing endpoints of the wave lines turn crimson red on node activation
        g.addColorStop(0.76, `rgba(${endpointWarm}, ${a * (0.36 + 0.42 * globalCallHeat)})`);
        g.addColorStop(0.92, `rgba(${endpointCrimson}, ${a * (0.22 + 0.45 * globalCallHeat)})`);
        g.addColorStop(1, `rgba(${endpointCrimson}, 0)`);

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

      // Lower-lateral corner spines
      L.horizonWings.forEach((wing: HorizonWingGeometry) => {
        const reach = singularityUnfurl(intro, 0.22);
        const c1 = { x: lerp(core.x, wing.c1.x, reach), y: lerp(core.y, wing.c1.y, reach) };
        const c2 = { x: lerp(core.x, wing.c2.x, reach), y: lerp(core.y, wing.c2.y, reach) };
        const tip = { x: lerp(core.x, wing.tip.x, reach), y: lerp(core.y, wing.tip.y, reach) };
        const wg = ctx.createLinearGradient(core.x, core.y, tip.x, tip.y);
        const goldStr = `${goldMid[0]}, ${goldMid[1]}, ${goldMid[2]}`;
        const endStr = mixRgb(goldDeep, CRIMSON_ENDPOINT, globalCallHeat * 0.96);
        wg.addColorStop(0, `rgba(${goldStr}, ${0.2 * alphaScale})`);
        wg.addColorStop(0.62, `rgba(${goldStr}, ${0.09 * alphaScale})`);
        wg.addColorStop(0.86, `rgba(${endStr}, ${(0.05 + 0.12 * globalCallHeat) * alphaScale})`);
        wg.addColorStop(1, `rgba(${endStr}, 0)`);
        ctx.beginPath();
        ctx.moveTo(core.x, core.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tip.x, tip.y);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = wg;
        ctx.stroke();
      });

      // ——— 4. The 5 Functional Node Arms (Laminar Golden Waves Turning Crimson at Their Outer Endpoints) ———
      const CURVE_STEPS = 26;
      const sampleUs = Array.from({ length: CURVE_STEPS + 1 }, (_, k) => k / CURVE_STEPS);

      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const spine = spines[armIdx]!;
        const level = armLevels[armIdx] ?? 0.24;
        const heat = armCallHeat[armIdx] ?? 0;

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const batch = field.armLayerBatches[armIdx]![layerIdx]!;
          if (!batch.length) continue;

          const baseGold = mixRgbTuple(goldMid, goldSpec, layer.hot);
          const goldStr = `${baseGold[0]}, ${baseGold[1]}, ${baseGold[2]}`;
          // Strictly the outer trailing endpoints of the golden wave lines turn crimson red when activated
          const transitionCrimson = mixRgb(baseGold, CRIMSON_WARM, heat * 0.9);
          const endpointCrimson = mixRgb(goldDeep, CRIMSON_ENDPOINT, heat * 0.98);
          const tipCrimson = mixRgb(goldDeep, CRIMSON_DEEP, heat * 1.0);

          const baseAlpha =
            layer.alpha *
            alphaScale *
            (0.32 + 0.9 * level) *
            (1 + 0.24 * energy + 0.32 * heat);

          const armGrad = ctx.createLinearGradient(
            core.x,
            core.y,
            spine.tipPt.x,
            spine.tipPt.y,
          );
          // 0.00 -> 0.58: Pure flowing golden neural wave lines from core through node orb and mid-arm
          armGrad.addColorStop(0, `rgba(${goldStr}, ${Math.min(1, baseAlpha * 1.9)})`);
          armGrad.addColorStop(0.34, `rgba(${goldStr}, ${Math.min(1, baseAlpha * 1.55)})`);
          armGrad.addColorStop(0.58, `rgba(${goldStr}, ${Math.min(1, baseAlpha * 1.05)})`);
          // 0.70 -> 1.00: At the endpoints of the flowing golden waves, the lines themselves turn crimson red!
          armGrad.addColorStop(0.72, `rgba(${transitionCrimson}, ${Math.min(1, baseAlpha * (0.78 + 0.45 * heat))})`);
          armGrad.addColorStop(0.88, `rgba(${endpointCrimson}, ${Math.min(1, baseAlpha * (0.48 + 0.52 * heat))})`);
          armGrad.addColorStop(1, `rgba(${tipCrimson}, 0)`);

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
              );
            }
            traceSmoothPolyline(ctx, pts);
          }

          ctx.lineWidth = layer.width * (0.88 + 0.38 * level) * (isLight ? 1.15 : 1);
          ctx.strokeStyle = armGrad;
          ctx.stroke();
        }
      }

      // ——— 5. Travelling Micro-Orbs Along the Flowing Golden Waves ———
      const flowSpeedMul = 1 + 1.45 * energy;
      for (const mo of field.microOrbs) {
        const level = armLevels[mo.arm] ?? 0.24;
        const heat = armCallHeat[mo.arm] ?? 0;
        const f = field.armFilaments[mo.filamentIdx]!;
        const spine = spines[mo.arm]!;

        if (!reduceMotion) {
          mo.u = (mo.u + mo.speed * dt * flowSpeedMul * (0.55 + 0.65 * level)) % 1;
        }

        const uEff = mo.u * singularityUnfurl(intro, f.stagger);
        const pos = evaluateArmFilamentPoint(f, spine, uEff, R, time, level, heat);
        const edgeFade = Math.sin(mo.u * Math.PI);
        // Micro-orbs are golden along the body and turn crimson red as they reach the outer wave endpoints (u > 0.68)
        const isAtEndpoint = heat > 0.05 && mo.u > 0.68;
        const orbColor = isAtEndpoint
          ? mixRgb(goldSpec, CRIMSON_ENDPOINT, clamp((mo.u - 0.68) * 3.1 * heat, 0, 1))
          : `${goldSpec[0]}, ${goldSpec[1]}, ${goldSpec[2]}`;

        ctx.fillStyle = `rgb(${orbColor})`;
        ctx.globalAlpha = introEase * mo.alpha * edgeFade * (0.28 + 0.78 * level);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, mo.radius, 0, TAU);
        ctx.fill();
      }

      // Travelling Soliton Orbs when a node is called
      for (const sol of solitons) {
        if (sol.u < 0 || sol.u > 1.05) continue;
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
        const fade = Math.sin(clamp(sol.u / 1.05, 0, 1) * Math.PI) * sol.intensity;
        const endpointMix = sol.crimson ? clamp((sol.u - 0.6) * 2.5, 0, 1) : 0;
        drawSculptedOrb(ctx, pos, 4.2, {
          coreRgb: goldSpec,
          midRgb: mixRgbTuple(goldBright, CRIMSON_WARM, endpointMix),
          rimRgb: mixRgbTuple(goldDeep, CRIMSON_ENDPOINT, endpointMix),
          alpha: fade * introEase,
          isLight,
        });
      }

      // ——— 6. Sculpted 3D Node Orbs & Node Identification Badges at Each of the 5 Sockets ———
      hitBoxes.length = 0;
      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const spine = spines[armIdx]!;
        const state = sockets[armIdx] ?? "locked";
        const level = armLevels[armIdx] ?? 0.24;
        const heat = armCallHeat[armIdx] ?? 0;
        const isHovered = hoveredSocket === armIdx;
        const sockPt = spine.socketPt;

        const baseOrbR =
          state === "occupied"
            ? 7.2
            : state === "open"
              ? 5.6
              : 4.5;
        const orbR = baseOrbR * (1 + 0.12 * heat + (isHovered ? 0.14 : 0)) * breathe;

        const orbMid = mixRgbTuple(goldBright, CRIMSON_WARM, heat * 0.65);
        const orbRim = mixRgbTuple(goldDeep, CRIMSON_ENDPOINT, heat * 0.85);

        drawSculptedOrb(ctx, sockPt, orbR, {
          coreRgb: goldSpec,
          midRgb: orbMid,
          rimRgb: orbRim,
          alpha: introEase * (state === "occupied" ? 0.98 : state === "open" ? 0.78 : 0.52),
          ringRadius: orbR + 4.8 + 2.2 * heat,
          ringAlpha: state === "occupied" ? 0.55 + 0.35 * heat : state === "open" ? 0.42 : 0.22,
          dashedRing: state !== "occupied",
          phase: time * (0.4 + 0.8 * heat) + armIdx,
          isLight,
        });

        const labelInfo = socketLabels?.[armIdx] ?? {
          monogram: `0${armIdx + 1}`,
          name: state === "open" ? "Open" : "Pro",
          status: state === "occupied" ? "connected" : state,
        };

        const pillBox = drawNodeIndicator(
          ctx,
          sockPt,
          core,
          orbR + 5,
          labelInfo,
          armIdx,
          level,
          heat,
          isHovered,
          introEase,
          isLight,
        );

        hitBoxes.push({ orb: sockPt, orbR: orbR + 6, pill: pillBox });
      }

      // ——— 7. Central Singularity Orb (Sculpted 3D Golden Sphere in the Middle of the Screen) ———
      const coreScale = intro < 0.25 ? 0.45 + intro * 2.2 : 1;
      const coreOrbRadius = clamp(R * 0.068, 12, 18) * breathe * coreScale;

      drawSculptedOrb(ctx, core, coreOrbRadius, {
        coreRgb: GOLD_SPECULAR,
        midRgb: goldBright,
        rimRgb: goldDeep,
        alpha: 1,
        ringRadius: coreOrbRadius + 6.5,
        ringAlpha: 0.48 + 0.25 * energy,
        phase: -time * 0.35,
        isLight,
      });
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
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
