"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  bezier,
  clamp,
  fitCanvas,
  lerp,
  pointOnPath,
  polar,
  radialGlow,
  seededHelpers,
  sub,
  type Vec,
} from "@/lib/network/geometry";
import { computeStageLayout, type StageLayout } from "./stage-layout";

export type SocketVisual = "occupied" | "open" | "locked";

export type StageTransfer = {
  /** Source socket index (0..4), or -1 for the Central Core / Command trunk. */
  fromSocket: number;
  /** Target socket index (0..4), or -1 for the Central Core. */
  toSocket: number;
  /** Short payload label for the transfer. */
  label: string;
  /** Monotonic serial so each new transfer spawns a fresh transfer orb. */
  serial: number;
};

export type StageSignal = {
  brain: NexusBrainState;
  sockets: SocketVisual[];
  theme?: "dark" | "light";
  /** Short display names/monograms for each socket arm on the canvas. */
  socketLabels?: Array<{ monogram: string; name: string; status: string }>;
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
  /** Explicit node-to-node transfer animation trigger. */
  transfer?: StageTransfer | null;
  /** Currently opened or called socket index (0..4), if any. */
  activeSocket?: number | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
};

type Rgb = readonly [number, number, number];

type BasinFilament = {
  bucket: number;
  waist: Vec;
  sourceAngle: number;
  sourceRadius: number;
  sourceBend: number;
  arrivalAngle: number;
  arrivalPull: number;
  targetAngle: number;
  targetRadius: number;
  departPull: number;
  endBend: number;
  phase: number;
  sway: number;
  stagger: number;
};

type ArmFilament = {
  socket: number;
  bucket: number;
  waistJitter: Vec;
  elbowSpread: number;
  elbowLift: number;
  nodeJitter: Vec;
  featherSpread: number;
  featherCurl: number;
  featherReach: number;
  phase: number;
  sway: number;
  stagger: number;
};

type FlowParticle = {
  kind: "basin" | "arm";
  socket: number;
  pathIndex: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

type GalaxyDust = {
  kind: "basin" | "arm";
  socket: number;
  pathIndex: number;
  t: number;
  offset: Vec;
  size: number;
  alpha: number;
  phase: number;
};

type TransferOrb = {
  fromSocket: number;
  toSocket: number;
  /** Progress along the transfer route (0..1 reaches the destination node; 1..1.55 passes all the way through the node to the outer flowing tips). */
  t: number;
  /** Whether the orb passes all the way through the destination node out to the corner tips (true) or melts completely into the destination node (false, with a subtle transmitted wisp). */
  passThrough: boolean;
  coreRippled: boolean;
  nodeReached: boolean;
};

/**
 * Multi-bucket golden filament palette:
 *   0 — Fine bright golden-amber streams
 *   1 — Medium warm supercluster gold
 *   2 — Wide soft amber atmospheric ribbons
 *   3 — Incandescent white-gold core hairs
 *   4 — Deep bronze-gold basin haze
 */
const BUCKETS = [
  { count: 68, width: 0.54, rgb: [255, 214, 136] as const, alpha: 0.28 },
  { count: 50, width: 0.92, rgb: [246, 178, 68] as const, alpha: 0.18 },
  { count: 30, width: 1.6, rgb: [228, 146, 42] as const, alpha: 0.095 },
  { count: 40, width: 0.38, rgb: [255, 245, 214] as const, alpha: 0.46 },
  { count: 14, width: 3.0, rgb: [198, 114, 28] as const, alpha: 0.038 },
] as const;

// Crimson red strictly for the flowing neural network lines' outer trailing edges & endpoints when a node activates
const CRIMSON_WARM: Rgb = [255, 92, 68];
const CRIMSON_EDGE: Rgb = [248, 42, 40];
const CRIMSON_DEEP: Rgb = [186, 16, 26];

const FILAMENTS_PER_ARM = 64;
const SOCKET_REST_LEVEL: Record<SocketVisual, number> = {
  occupied: 1.0,
  open: 0.42,
  locked: 0.18,
};
const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.16,
  thinking: 1,
  responding: 0.72,
};
const INTRO_SECONDS = 2.35;

const mixRgb = (a: Rgb, b: Rgb, t: number): string => {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
};

const scaleFromCore = (pt: Vec, core: Vec, k: number): Vec => ({
  x: core.x + (pt.x - core.x) * k,
  y: core.y + (pt.y - core.y) * k,
});

function singularitySpring(intro: number, stagger: number): number {
  const u = clamp((intro - stagger * 0.22) / (1 - stagger * 0.22), 0, 1);
  if (u <= 0) return 0.001;
  const inv = 1 - u;
  return clamp(1 - inv * inv * inv * (1 + 0.3 * u), 0.001, 1);
}

function createFlowingField(socketCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261114);

  // 1. Central Basin Flowing Filaments sweeping through the singularity waist out to the screen edges
  const basin: BasinFilament[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const lane = rnd();
      // Distribute streams symmetrically across upper/lower left & right corners
      // while leaving a calm negative-space corridor below center for voice typography
      const sourceAngle =
        lane < 0.36
          ? between(-2.88, -1.82) // upper-left inflow
          : lane < 0.72
            ? between(2.52, 3.08) // lower-left horizon wing
            : between(-1.32, -0.32); // upper-right stream
      const targetAngle =
        lane < 0.36
          ? between(-0.48, 0.42)
          : lane < 0.72
            ? between(0.08, 0.56)
            : between(2.54, 3.08);
      basin.push({
        bucket: bucketIndex,
        waist: { x: gauss() * 0.0065, y: gauss() * 0.0065 },
        sourceAngle,
        sourceRadius: between(0.98, 1.88),
        sourceBend: gauss() * 0.42,
        arrivalAngle: sourceAngle + Math.PI + gauss() * 0.24,
        arrivalPull: between(0.18, 0.42),
        targetAngle,
        targetRadius: between(0.98, 1.88),
        departPull: between(0.2, 0.44),
        endBend: gauss() * 0.42,
        phase: rnd() * Math.PI * 2,
        sway: between(0.7, 1.35),
        stagger: between(0.05, 0.55),
      });
    }
  });

  // 2. Sweeping Node Arm Flowing Filaments extending past the corners and edges of the screen
  const arms: ArmFilament[] = [];
  for (let socket = 0; socket < socketCount; socket++) {
    for (let i = 0; i < FILAMENTS_PER_ARM; i++) {
      const u = (i / (FILAMENTS_PER_ARM - 1)) * 2 - 1; // -1 .. +1 across the feather fan
      arms.push({
        socket,
        bucket: i % 4,
        waistJitter: { x: gauss() * 0.0045, y: gauss() * 0.0045 },
        elbowSpread: u * 0.22 + gauss() * 0.055,
        elbowLift: gauss() * 0.08,
        nodeJitter: { x: gauss() * 0.01, y: gauss() * 0.01 },
        featherSpread: u * 0.68 + gauss() * 0.1,
        featherCurl: u * 0.4 + gauss() * 0.14,
        featherReach: between(1.2, 2.1) * (1 - Math.abs(u) * 0.12),
        phase: u * 0.9 + rnd() * Math.PI * 2,
        sway: between(0.68, 1.3),
        stagger: clamp(Math.abs(u) * 0.35 + rnd() * 0.2, 0.04, 0.58),
      });
    }
  }

  // 3. Streaming Luminous Particles flowing along the Bezier filaments
  const particles: FlowParticle[] = [
    ...Array.from({ length: 150 }, () => ({
      kind: "basin" as const,
      socket: -1,
      pathIndex: Math.floor(rnd() * basin.length),
      u: rnd(),
      speed: between(0.016, 0.044),
      size: between(0.5, 1.65),
      alpha: between(0.35, 0.9),
    })),
    ...Array.from({ length: 340 }, (_, i) => {
      const armIdx = Math.floor(rnd() * arms.length);
      return {
        kind: "arm" as const,
        socket: arms[armIdx]?.socket ?? i % socketCount,
        pathIndex: armIdx,
        u: rnd(),
        speed: between(0.02, 0.056),
        size: between(0.5, 1.8),
        alpha: between(0.45, 0.96),
      };
    }),
  ];

  // 4. Fine Golden Stipple Dust clinging to the flowing filaments
  const dust: GalaxyDust[] = [
    ...Array.from({ length: 900 }, () => {
      const idx = Math.floor(rnd() * basin.length);
      return {
        kind: "basin" as const,
        socket: -1,
        pathIndex: idx,
        t: Math.pow(rnd(), 0.78),
        offset: { x: gauss() * 0.026, y: gauss() * 0.026 },
        size: between(0.45, 1.4),
        alpha: between(0.26, 0.86),
        phase: rnd() * Math.PI * 2,
      };
    }),
    ...Array.from({ length: 1600 }, () => {
      const idx = Math.floor(rnd() * arms.length);
      return {
        kind: "arm" as const,
        socket: arms[idx]?.socket ?? 0,
        pathIndex: idx,
        t: Math.pow(rnd(), 0.76),
        offset: { x: gauss() * 0.018, y: gauss() * 0.018 },
        size: between(0.45, 1.5),
        alpha: between(0.3, 0.92),
        phase: rnd() * Math.PI * 2,
      };
    }),
  ];

  return { basin, arms, particles, dust };
}

function buildBasinPath(f: BasinFilament, L: StageLayout, time: number, intro: number): Vec[][] {
  const S = L.scale;
  const reach = singularitySpring(intro, f.stagger);
  const swayA = Math.sin(time * 0.25 + f.phase) * f.sway;
  const swayB = Math.cos(time * 0.18 + f.phase * 1.37) * f.sway;

  const pinch = scaleFromCore(
    { x: L.core.x + f.waist.x * S, y: L.core.y + f.waist.y * S },
    L.core,
    reach,
  );
  const p0 = add(L.core, polar(f.sourceRadius * S * reach, f.sourceAngle + 0.032 * swayA));
  const c1 = add(p0, polar(f.sourceRadius * S * reach * 0.42, f.sourceAngle + Math.PI + f.sourceBend + 0.022 * swayB));
  const c2 = sub(pinch, polar(f.arrivalPull * S * reach, f.arrivalAngle + 0.036 * swayA));
  const target = f.targetAngle + 0.04 * swayB;
  const d1 = add(pinch, polar(f.departPull * S * reach, target * 0.65 + 0.028 * swayA));
  const p3 = add(L.core, polar(f.targetRadius * S * reach, target));
  const d2 = sub(p3, polar(f.targetRadius * S * reach * 0.45, target + f.endBend + 0.028 * swayA));
  return [
    [p0, c1, c2, pinch],
    [pinch, d1, d2, p3],
  ];
}

/**
 * Builds a continuous 2-segment G1-smooth flowing Bezier filament for a node arm:
 *   Segment 0 (Inner Spine): Singularity Core -> Sweeping Elbow -> Node Pinch
 *   Segment 1 (Outer Plume): Collinear G1 continuation sweeping past the corners of the screen
 */
function buildArmPath(w: ArmFilament, L: StageLayout, time: number, intro: number): Vec[][] {
  const socket = L.sockets[w.socket]!;
  const elbow = L.socketElbows[w.socket]!;
  const baseFanAngle = L.socketAngles[w.socket]!;
  const R = L.radius;
  const S = L.scale;

  const innerReach = singularitySpring(intro, w.stagger * 0.65);
  const outerReach = singularitySpring(intro, clamp(w.stagger + 0.16, 0, 1));

  const swayA = Math.sin(time * 0.3 + w.phase) * w.sway;
  const swayB = Math.cos(time * 0.2 + w.phase * 1.37) * w.sway;

  const start = scaleFromCore(
    {
      x: L.core.x + w.waistJitter.x * R,
      y: L.core.y + w.waistJitter.y * R,
    },
    L.core,
    innerReach,
  );
  const nodeAt = scaleFromCore(
    {
      x: socket.x + w.nodeJitter.x * R,
      y: socket.y + w.nodeJitter.y * R,
    },
    L.core,
    innerReach,
  );

  const spineAngle = Math.atan2(nodeAt.y - start.y, nodeAt.x - start.x);
  const perpAngle = spineAngle + Math.PI / 2;

  const elbowScaled = scaleFromCore(elbow, L.core, innerReach);
  const c1 = add(
    elbowScaled,
    add(
      polar(R * (w.elbowSpread + 0.026 * swayA) * innerReach, perpAngle),
      polar(R * (w.elbowLift + 0.02 * swayB) * innerReach, spineAngle),
    ),
  );
  const c2 = sub(
    nodeAt,
    polar(R * 0.28 * innerReach, spineAngle - w.elbowSpread * 0.48 + 0.03 * swayA),
  );

  // Collinear incoming tangent at nodeAt prevents any sharp kink at the node
  const incomingAngle = Math.atan2(nodeAt.y - c2.y, nodeAt.x - c2.x);
  const featherAngle = baseFanAngle + w.featherSpread + 0.045 * swayB;
  const tipReach = S * w.featherReach * outerReach;
  const tip = add(nodeAt, polar(tipReach, featherAngle + w.featherCurl * 0.42 + 0.028 * swayA));
  const f1 = add(nodeAt, polar(tipReach * 0.28, incomingAngle));
  const f2 = sub(tip, polar(tipReach * 0.38, featherAngle + w.featherCurl - 0.028 * swayB));

  return [
    [start, c1, c2, nodeAt],
    [nodeAt, f1, f2, tip],
  ];
}

/** Exact centreline spine from core to a node socket (used by travelling transfer orbs). */
function buildArmCenterSpine(socketIdx: number, L: StageLayout, intro: number): [Vec, Vec, Vec, Vec] {
  const reach = singularitySpring(intro, 0.08);
  const start = L.core;
  const elbow = scaleFromCore(L.socketElbows[socketIdx] ?? L.core, L.core, reach);
  const end = scaleFromCore(L.sockets[socketIdx] ?? L.core, L.core, reach);
  const spineAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const c1 = elbow;
  const c2 = sub(end, polar(L.radius * 0.26 * reach, spineAngle));
  return [start, c1, c2, end];
}

/** Smooth continuation of an arm spine past its node socket and off the viewport corner. */
function buildArmOuterSpine(socketIdx: number, L: StageLayout, time: number, intro: number): [Vec, Vec, Vec, Vec] {
  const [, , c2, end] = buildArmCenterSpine(socketIdx, L, intro);
  const outerReach = singularitySpring(intro, 0.2);
  const incomingAngle = Math.atan2(end.y - c2.y, end.x - c2.x);
  const fanAngle = L.socketAngles[socketIdx] ?? incomingAngle;
  const sway = Math.sin(time * 0.24 + socketIdx * 1.4);
  const reach = L.scale * 1.35 * outerReach;
  const tip = add(end, polar(reach, fanAngle + 0.028 * sway));
  const f1 = add(end, polar(reach * 0.26, incomingAngle));
  const f2 = sub(tip, polar(reach * 0.35, fanAngle - 0.02 * sway));
  return [end, f1, f2, tip];
}

/**
 * Draws a crisp, luminous golden Transfer Orb (never red) that travels along the arm spine
 * during a file/data transfer and either melts into the destination node or passes all the way through it.
 */
function drawTransferOrb(
  ctx: CanvasRenderingContext2D,
  pos: Vec,
  tangent: Vec,
  radius: number,
  alpha: number,
  stretch: number,
) {
  if (alpha <= 0.01 || radius <= 0.4) return;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.atan2(tangent.y, tangent.x));
  ctx.scale(1 + stretch * 0.9, Math.max(0.55, 1 - stretch * 0.28));

  // Tight golden-white orb aura
  const auraR = radius * 2.4;
  const aura = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, auraR);
  aura.addColorStop(0, `rgba(255, 252, 238, ${0.95 * alpha})`);
  aura.addColorStop(0.4, `rgba(255, 220, 142, ${0.62 * alpha})`);
  aura.addColorStop(0.75, `rgba(244, 178, 66, ${0.22 * alpha})`);
  aura.addColorStop(1, "rgba(244, 178, 66, 0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, auraR, 0, Math.PI * 2);
  ctx.fill();

  // Crisp 3D spherical golden-white core
  const body = ctx.createRadialGradient(-radius * 0.25, -radius * 0.25, radius * 0.1, 0, 0, radius);
  body.addColorStop(0, `rgba(255, 255, 250, ${alpha})`);
  body.addColorStop(0.55, `rgba(255, 234, 176, ${0.98 * alpha})`);
  body.addColorStop(1, `rgba(246, 184, 72, ${0.92 * alpha})`);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a subtle, minimal node identification label right beside each node pinch point
 * so you can tell which node is which without covering the converging filaments.
 */
function drawMinimalNodeLabel(
  ctx: CanvasRenderingContext2D,
  nodePt: Vec,
  corePt: Vec,
  labelInfo: { monogram: string; name: string; status: string },
  armIndex: number,
  hovered: boolean,
  introEase: number,
  isLight: boolean,
): { x: number; y: number; w: number; h: number } {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  const isLive = labelInfo.status === "connected";
  const isOpen = labelInfo.status === "open";
  const text = isLive
    ? labelInfo.name
    : isOpen
      ? `0${armIndex + 1} · Open`
      : `0${armIndex + 1} · Pro`;

  ctx.font = `${isLive ? 600 : 500} 10.5px Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const tw = Math.ceil(ctx.measureText(text).width);
  const dotOffset = isLive ? 10 : 0;
  const padX = 8;
  const w = tw + padX * 2 + dotOffset;
  const h = 20;

  const dx = nodePt.x - corePt.x;
  const x =
    Math.abs(dx) < 35
      ? nodePt.x - w * 0.5
      : dx < 0
        ? nodePt.x - w - 14
        : nodePt.x + 14;
  const y =
    Math.abs(dx) < 35
      ? nodePt.y - h - 16
      : nodePt.y - h * 0.5;

  const baseAlpha = isLive ? 0.88 : isOpen ? 0.58 : 0.38;
  ctx.globalAlpha = clamp((baseAlpha + (hovered ? 0.25 : 0)) * introEase, 0, 1);

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 999);
  ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.88)" : "rgba(6, 6, 8, 0.76)";
  ctx.fill();
  ctx.strokeStyle = isLive
    ? isLight
      ? "rgba(184, 120, 16, 0.42)"
      : "rgba(246, 182, 74, 0.42)"
    : isLight
      ? "rgba(9, 9, 11, 0.12)"
      : "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  let tx = x + padX;
  if (isLive) {
    ctx.beginPath();
    ctx.arc(x + padX + 2.5, y + h * 0.5, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = "#f6b244";
    ctx.fill();
    tx += dotOffset;
  }

  ctx.fillStyle = isLight
    ? isLive
      ? "#09090b"
      : "#52525b"
    : isLive
      ? "#f5f5f7"
      : "#a1a1a6";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, tx, y + h * 0.5 + 0.5);

  ctx.restore();
  return { x, y, w, h };
}

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

    const field = createFlowingField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const armLevels: number[] = signalRef.current.sockets.map((s) => SOCKET_REST_LEVEL[s]);
    // Per-arm crimson line heat (turns the outer flowing lines crimson red when a node is sent/activated)
    const armLineRedHeat: number[] = signalRef.current.sockets.map(() => 0);
    // Per-node absorption glow when a transfer orb melts into or passes through a node
    const nodeMeltAbsorption: number[] = signalRef.current.sockets.map(() => 0);
    const transferOrbs: TransferOrb[] = [];
    const ripples: number[] = [];
    const hitBoxes: Array<{ nodePt: Vec; labelBox: { x: number; y: number; w: number; h: number } }> = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    let energy = BRAIN_ENERGY[signalRef.current.brain];
    let globalLineRedHeat = 0;
    let autoTransferClock = 3.6;
    let autoTransferCounter = 0;
    let hoveredSocket = -1;
    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const spawnTransferOrb = (fromSocket: number, toSocket: number, activateCrimsonLines: boolean) => {
      if (reduceMotion) return;
      autoTransferCounter++;
      const passThrough = autoTransferCounter % 2 === 0 || activateCrimsonLines;
      transferOrbs.push({
        fromSocket,
        toSocket,
        t: 0,
        passThrough,
        coreRippled: false,
        nodeReached: false,
      });
      if (activateCrimsonLines) {
        globalLineRedHeat = Math.max(globalLineRedHeat, 1);
        if (toSocket >= 0 && toSocket < socketCount) {
          armLineRedHeat[toSocket] = 1;
        }
        if (fromSocket >= 0 && fromSocket < socketCount) {
          armLineRedHeat[fromSocket] = Math.max(armLineRedHeat[fromSocket] ?? 0, 0.85);
        }
      }
    };

    const findHitSocket = (pt: Vec): number => {
      for (let i = 0; i < hitBoxes.length; i++) {
        const hb = hitBoxes[i];
        if (!hb) continue;
        if (Math.hypot(pt.x - hb.nodePt.x, pt.y - hb.nodePt.y) <= 22) return i;
        if (
          pt.x >= hb.labelBox.x - 4 &&
          pt.x <= hb.labelBox.x + hb.labelBox.w + 4 &&
          pt.y >= hb.labelBox.y - 4 &&
          pt.y <= hb.labelBox.y + hb.labelBox.h + 4
        ) {
          return i;
        }
      }
      return -1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      hoveredSocket = findHitSocket({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      canvas.style.cursor = hoveredSocket >= 0 && onSelectRef.current ? "pointer" : "default";
    };

    const onPointerLeave = () => {
      hoveredSocket = -1;
      canvas.style.cursor = "default";
    };

    const onClick = (e: MouseEvent) => {
      if (!onSelectRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const hit = findHitSocket({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (hit >= 0) {
        spawnTransferOrb(-1, hit, true);
        onSelectRef.current(hit);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, socketLabels, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const { width, height, core, radius: R, scale: S } = layout;

      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const ease = 1 - Math.pow(1 - intro, 3);
      const follow = reduceMotion ? 1 : Math.min(1, dt * 2.8);

      energy = lerp(energy, BRAIN_ENERGY[brain], reduceMotion ? 1 : Math.min(1, dt * 2.5));

      // When Nexus thinks/responds or a node is opened/sent, launch transfer orbs & turn outer flowing lines crimson red
      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") {
          globalLineRedHeat = 1;
          sockets.forEach((s, idx) => {
            if (s === "occupied") {
              armLineRedHeat[idx] = 1;
              spawnTransferOrb(-1, idx, true);
            }
          });
        }
        lastBrain = brain;
      }

      if ((activeSocket ?? null) !== lastActiveSocket) {
        if (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0) {
          spawnTransferOrb(-1, activeSocket, true);
        }
        lastActiveSocket = activeSocket ?? null;
      }

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        spawnTransferOrb(-1, snap.index, true);
      }

      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        spawnTransferOrb(transfer.fromSocket, transfer.toSocket, true);
      }

      // Periodic autonomous file/context transfer orbs gliding between connected nodes
      if (!reduceMotion && intro >= 1) {
        const occupiedIndices = sockets
          .map((s, idx) => (s === "occupied" ? idx : -1))
          .filter((idx) => idx >= 0);

        autoTransferClock -= dt;
        if (autoTransferClock <= 0) {
          autoTransferClock = 4.2;
          if (occupiedIndices.length >= 2) {
            const fromPick = occupiedIndices[autoTransferCounter % occupiedIndices.length]!;
            const toPick = occupiedIndices[(autoTransferCounter + 1) % occupiedIndices.length]!;
            spawnTransferOrb(fromPick, toPick, true);
          } else if (occupiedIndices.length === 1) {
            spawnTransferOrb(-1, occupiedIndices[0]!, true);
          }
        }
      }

      const isSendingNode =
        brain === "thinking" ||
        brain === "responding" ||
        (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0);

      const targetGlobalRed = isSendingNode ? 1 : 0;
      globalLineRedHeat = lerp(
        globalLineRedHeat,
        targetGlobalRed,
        reduceMotion ? 1 : 1 - Math.exp(-dt * (targetGlobalRed > globalLineRedHeat ? 4.5 : 1.15)),
      );

      sockets.forEach((state, i) => {
        const hoverBoost = hoveredSocket === i ? 0.16 : 0;
        const meltBoost = (nodeMeltAbsorption[i] ?? 0) * 0.35;
        const targetLevel = clamp(SOCKET_REST_LEVEL[state] + hoverBoost + meltBoost, 0, 1.3);
        armLevels[i] = lerp(armLevels[i] ?? targetLevel, targetLevel, follow);

        nodeMeltAbsorption[i] = (nodeMeltAbsorption[i] ?? 0) * Math.exp(-dt * 2.2);

        const armActive =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && state === "occupied");
        const targetArmRed = armActive ? 1 : globalLineRedHeat * (state === "occupied" ? 0.85 : 0.35);
        armLineRedHeat[i] = lerp(
          armLineRedHeat[i] ?? 0,
          targetArmRed,
          reduceMotion ? 1 : 1 - Math.exp(-dt * (targetArmRed > (armLineRedHeat[i] ?? 0) ? 4.8 : 1.1)),
        );
      });

      const thinking = brain === "thinking";
      const beat = thinking ? 0.5 + 0.5 * Math.sin(time * 6.5) : 0;
      const breathe = 1 + 0.04 * Math.sin(time * (0.55 + energy)) + 0.07 * energy + 0.04 * beat;
      const edgeRadius = Math.hypot(width, height) * 0.74 * (0.25 + 0.75 * ease) * (1 + 0.08 * energy);

      // 1. Pure Pitch-Black Background (or Alabaster in Light Mode)
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#f7f7f8" : "#000000";
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
      ctx.globalAlpha = ease;

      // 2. Subtle Golden Core Warmth
      radialGlow(ctx, core, S * 0.42 * breathe * ease, [
        [0, isLight ? `rgba(212, 142, 22, ${0.18 + 0.05 * energy})` : `rgba(255, 198, 92, ${0.14 + 0.05 * energy})`],
        [0.42, isLight ? "rgba(184, 116, 16, 0.05)" : "rgba(212, 132, 34, 0.05)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      const basinPaths = field.basin.map((f) => buildBasinPath(f, layout, time, intro));
      const armPaths = field.arms.map((w) => buildArmPath(w, layout, time, intro));

      // 3. Flowing Central Basin Bezier Lines:
      // Pure Gold through the core & body, turning Crimson Red at the outer trailing edges when a node is sent!
      const basinGradientFor = (rgb: Rgb, a: number) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeRadius);
        const goldColor = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
        const warmEdge = mixRgb(rgb, CRIMSON_WARM, globalLineRedHeat * 0.85);
        const crimsonEdge = mixRgb(rgb, CRIMSON_EDGE, globalLineRedHeat * 0.98);
        const effA = a * (isLight ? 1.45 : 1);

        g.addColorStop(0, `rgba(${goldColor}, ${Math.min(1, effA * 2.2)})`);
        g.addColorStop(0.28, `rgba(${goldColor}, ${Math.min(1, effA * 1.2)})`);
        g.addColorStop(0.56, `rgba(${goldColor}, ${effA * 0.52})`);
        // Outer trailing edges of the flowing lines turn crimson red when a node activates
        g.addColorStop(0.74, `rgba(${warmEdge}, ${effA * (0.34 + 0.38 * globalLineRedHeat)})`);
        g.addColorStop(0.92, `rgba(${crimsonEdge}, ${effA * (0.16 + 0.36 * globalLineRedHeat)})`);
        g.addColorStop(1, `rgba(${crimsonEdge}, 0)`);
        return g;
      };

      BUCKETS.forEach((bucket, bucketIndex) => {
        ctx.beginPath();
        field.basin.forEach((f, i) => {
          if (f.bucket !== bucketIndex) return;
          const [inc, out] = basinPaths[i]!;
          ctx.moveTo(inc![0]!.x, inc![0]!.y);
          for (const [, b, c, d] of [inc!, out!]) {
            ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
          }
        });
        ctx.lineWidth = bucket.width * (isLight ? 1.15 : 1);
        ctx.strokeStyle = basinGradientFor(bucket.rgb, bucket.alpha * (0.64 + 0.36 * energy));
        ctx.stroke();
      });

      // 4. The 5 Functional Node Arms (Mathematically Designed Flowing Bezier Filaments):
      // Pure Gold from Core through Node Pinch, turning Crimson Red along the outer trailing wave endpoints when sent!
      const armStrokeGradient = (rgb: Rgb, a: number, redHeat: number, centerBright = 1.2) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeRadius);
        const goldColor = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
        const transitionRed = mixRgb(rgb, CRIMSON_WARM, redHeat * 0.88);
        const endpointRed = mixRgb(rgb, CRIMSON_EDGE, redHeat * 0.98);
        const tipRed = mixRgb(rgb, CRIMSON_DEEP, redHeat * 1.0);
        const effA = a * (isLight ? 1.4 : 1);

        // Core to Node Pinch & Mid-Arm remain 100% pure flowing Gold
        g.addColorStop(0, `rgba(${goldColor}, ${Math.min(1, effA * centerBright)})`);
        g.addColorStop(0.32, `rgba(${goldColor}, ${Math.min(1, effA)})`);
        g.addColorStop(0.54, `rgba(${goldColor}, ${effA * 0.68})`);
        // Outer trailing wave lines & endpoints turn Crimson Red when the node is activated/sent
        g.addColorStop(0.7, `rgba(${transitionRed}, ${Math.min(1, effA * (0.48 + 0.42 * redHeat))})`);
        g.addColorStop(0.88, `rgba(${endpointRed}, ${Math.min(1, effA * (0.26 + 0.48 * redHeat))})`);
        g.addColorStop(1, `rgba(${tipRed}, 0)`);
        return g;
      };

      hitBoxes.length = 0;
      for (let s = 0; s < socketCount; s++) {
        const level = armLevels[s] ?? 0.2;
        const redHeat = armLineRedHeat[s] ?? 0;
        const melt = nodeMeltAbsorption[s] ?? 0;
        const state = sockets[s] ?? "locked";

        for (const bucketIndex of [0, 1, 2, 3]) {
          const bucket = BUCKETS[bucketIndex]!;
          ctx.beginPath();
          field.arms.forEach((w, i) => {
            if (w.socket !== s || w.bucket !== bucketIndex) return;
            const segments = armPaths[i]!;
            ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
            for (const [, b, c, d] of segments) {
              ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
            }
          });
          ctx.lineWidth = bucket.width * (0.85 + level * 0.65 + melt * 0.25) * (isLight ? 1.12 : 1);
          const alpha = Math.min(1, bucket.alpha * 3.6 * level * (1 + 0.25 * energy + 0.3 * melt));
          ctx.strokeStyle = armStrokeGradient(bucket.rgb, alpha, redHeat, 1.25);
          ctx.stroke();
        }

        // Incandescent centerline spine flowing through the node pinch and tapering off the corner
        const [p0, c1, c2, nodePt] = buildArmCenterSpine(s, layout, intro);
        const [, f1, f2, tip] = buildArmOuterSpine(s, layout, time, intro);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, nodePt.x, nodePt.y);
        ctx.bezierCurveTo(f1.x, f1.y, f2.x, f2.y, tip.x, tip.y);
        ctx.lineWidth = (1.6 * level + 0.8 * melt) * (isLight ? 1.15 : 1);
        ctx.strokeStyle = armStrokeGradient([255, 246, 218], 0.62 * level, redHeat, 1.1);
        ctx.stroke();

        // Natural golden filament convergence star at the node pinch (plus absorption wave when a transfer orb melts in)
        radialGlow(ctx, nodePt, R * (0.08 + 0.05 * level + 0.14 * melt), [
          [0, `rgba(255, 253, 244, ${Math.min(1, (0.88 + 0.4 * melt) * level)})`],
          [0.32, `rgba(255, 222, 152, ${(0.55 + 0.35 * melt) * level})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);

        // Small, understated node identification pill next to each node
        const labelInfo = socketLabels?.[s] ?? {
          monogram: `0${s + 1}`,
          name: state === "open" ? "Open" : "Pro",
          status: state === "occupied" ? "connected" : state,
        };
        const labelBox = drawMinimalNodeLabel(
          ctx,
          nodePt,
          core,
          labelInfo,
          s,
          hoveredSocket === s,
          ease,
          isLight,
        );
        hitBoxes.push({ nodePt, labelBox });
      }

      // 5. Singularity Core Star
      radialGlow(ctx, core, S * 0.082 * breathe * (0.35 + 0.65 * ease), [
        [0, "rgba(255, 253, 244, 1)"],
        [0.2, `rgba(255, 228, 165, ${0.72 + 0.22 * energy})`],
        [0.52, "rgba(250, 176, 70, 0.22)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // 6. Core Ripples
      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i]! += dt * 0.52;
        const r = ripples[i]!;
        if (r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 224, 162, ${0.28 * (1 - r) * (1 - r)})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.1 + r * 1.15), 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7. Stipple Dust & Flowing Particles (Gold along the body, Crimson Red at outer trailing endpoints when sent)
      const falloff = (p: Vec) => Math.max(0, 1 - Math.hypot(p.x - core.x, p.y - core.y) / edgeRadius);

      for (const d of field.dust) {
        const segs =
          d.kind === "arm"
            ? armPaths[d.pathIndex]!
            : basinPaths[d.pathIndex]!.slice(1);
        const base = pointOnPath(segs, d.t);
        const p = { x: base.x + d.offset.x * S * ease, y: base.y + d.offset.y * S * ease };
        const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + d.phase);
        const armMod = d.kind === "arm" ? 0.2 + 0.8 * (armLevels[d.socket] ?? 0) : 1;
        const redHeat = d.kind === "arm" ? (armLineRedHeat[d.socket] ?? 0) : globalLineRedHeat;
        const distRatio = clamp(Math.hypot(p.x - core.x, p.y - core.y) / (edgeRadius * 0.82), 0, 1);

        ctx.fillStyle =
          redHeat > 0.05 && distRatio > 0.62
            ? `rgb(${mixRgb([255, 220, 148], CRIMSON_EDGE, (distRatio - 0.62) * 2.6 * redHeat)})`
            : "rgb(255, 220, 148)";
        ctx.globalAlpha = ease * d.alpha * twinkle * armMod * Math.min(1, falloff(p) * 1.5);
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      const speedUp = 1 + 1.8 * energy;
      for (const p of field.particles) {
        const isArm = p.kind === "arm";
        const level = isArm ? (armLevels[p.socket] ?? 0.2) : 1;
        const redHeat = isArm ? (armLineRedHeat[p.socket] ?? 0) : globalLineRedHeat;
        if (!reduceMotion) {
          p.u = (p.u + p.speed * dt * speedUp * (isArm ? 0.5 + 0.7 * level : 1)) % 1;
        }
        const path = isArm ? armPaths[p.pathIndex]! : basinPaths[p.pathIndex]!;
        const pos = pointOnPath(path, p.u);
        const glow = isArm
          ? (0.2 + 0.8 * level) * Math.min(1, falloff(pos) * 1.45)
          : Math.min(1, falloff(pos) * 1.65);

        const atEndpoint = isArm ? p.u > 0.65 : p.u < 0.2 || p.u > 0.8;
        ctx.fillStyle =
          redHeat > 0.05 && atEndpoint
            ? `rgb(${mixRgb([255, 244, 212], CRIMSON_EDGE, redHeat)})`
            : "rgb(255, 244, 212)";
        ctx.globalAlpha = ease * p.alpha * glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 8. File / Context Transfer Orbs Travelling Between Nodes:
      // The orbs travel along the arm spine, melt into the destination node upon arrival,
      // and/or pass all the way through the node out along the flowing golden filaments!
      for (let i = transferOrbs.length - 1; i >= 0; i--) {
        const orb = transferOrbs[i]!;
        orb.t += dt / 1.95;
        const maxT = orb.passThrough ? 1.55 : 1.18;
        if (orb.t >= maxT) {
          transferOrbs.splice(i, 1);
          continue;
        }

        const hasInbound = orb.fromSocket >= 0 && orb.fromSocket < socketCount;
        const hasOutbound = orb.toSocket >= 0 && orb.toSocket < socketCount;

        // Evaluate position along:
        //   u in [0, 1]: Source Node -> Core -> Destination Node
        //   u in (1, 1.55]: Passing all the way through the Destination Node out along its outer flowing spine!
        const evaluateTransferPoint = (u: number): Vec => {
          if (u <= 1) {
            const clamped = clamp(u, 0, 1);
            if (hasInbound && hasOutbound) {
              if (clamped < 0.5) {
                const [a, b, c, d] = buildArmCenterSpine(orb.fromSocket, layout, intro);
                return bezier(d, c, b, a, clamped * 2);
              }
              const [a, b, c, d] = buildArmCenterSpine(orb.toSocket, layout, intro);
              return bezier(a, b, c, d, (clamped - 0.5) * 2);
            }
            if (hasOutbound) {
              const [a, b, c, d] = buildArmCenterSpine(orb.toSocket, layout, intro);
              return bezier(a, b, c, d, clamped);
            }
            if (hasInbound) {
              const [a, b, c, d] = buildArmCenterSpine(orb.fromSocket, layout, intro);
              return bezier(d, c, b, a, clamped);
            }
            return core;
          }
          // u > 1: Passing all the way through the destination node out along the outer flowing filaments
          if (hasOutbound) {
            const [a, b, c, d] = buildArmOuterSpine(orb.toSocket, layout, time, intro);
            const outerU = clamp((u - 1) / 0.55, 0, 1);
            return bezier(a, b, c, d, outerU);
          }
          return core;
        };

        if (orb.t >= 0.5 && !orb.coreRippled && hasInbound && hasOutbound) {
          orb.coreRippled = true;
          ripples.push(0);
        }

        // As the orb arrives at the destination node (t ≈ 1.0), it melts its energy into the node!
        if (orb.t >= 0.94 && !orb.nodeReached) {
          orb.nodeReached = true;
          if (hasOutbound) {
            nodeMeltAbsorption[orb.toSocket] = 1;
            armLineRedHeat[orb.toSocket] = 1;
          }
        }

        const head = evaluateTransferPoint(orb.t);
        const prev = evaluateTransferPoint(Math.max(0, orb.t - 0.02));
        const tangent = { x: head.x - prev.x || 1, y: head.y - prev.y };

        // Compute melting compression & radius as the orb enters/passes through the node pinch (t ≈ 1.0)
        const distFromNode = Math.abs(orb.t - 1.0);
        const pinchStretch = Math.exp(-(distFromNode * distFromNode) / 0.012);

        let orbAlpha = 1;
        let orbRadius = 5.4;
        if (!orb.passThrough && orb.t > 0.88) {
          // Melting smoothly into the destination node
          const meltProgress = clamp((orb.t - 0.88) / 0.3, 0, 1);
          orbAlpha = 1 - meltProgress * meltProgress;
          orbRadius = 5.4 * (1 - 0.65 * meltProgress);
        } else if (orb.passThrough && orb.t > 1.0) {
          // Passing all the way through the node and tapering into the outer flowing waves
          const passProgress = clamp((orb.t - 1.0) / 0.55, 0, 1);
          orbAlpha = 1 - Math.pow(passProgress, 1.5);
          orbRadius = 5.0 * (1 - 0.45 * passProgress);
        }

        // Fluid trail of micro-orbs behind the main Transfer Orb
        for (let tail = 14; tail >= 1; tail--) {
          const tailT = Math.max(0, orb.t - tail * 0.012);
          const pt = evaluateTransferPoint(tailT);
          const tailFactor = Math.pow(1 - tail / 15, 1.6) * orbAlpha;
          ctx.fillStyle = `rgba(255, 232, 168, ${0.48 * tailFactor})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 0.8 + 2.4 * tailFactor, 0, Math.PI * 2);
          ctx.fill();
        }

        drawTransferOrb(ctx, head, tangent, orbRadius, orbAlpha * ease, pinchStretch);
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
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
