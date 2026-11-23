"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ExtensionLink } from "@/lib/extensions";
import {
  add,
  bezier,
  clamp,
  fitCanvas,
  observeCanvasActivity,
  pointOnPath,
  polar,
  radialGlow,
  seededHelpers,
  sub,
  type Vec,
} from "@/lib/network/geometry";
import {
  computeBranchNetworkLayout,
  type BranchEdge,
  type BranchNetworkLayout,
  type SynapseBridge,
} from "./network-topology";

export type BranchNodeMeta = {
  slotId?: string;
  status: "occupied" | "open" | "locked";
  monogram: string;
  name: string;
  tierLabel?: string;
};

export interface BranchingNetworkCanvasProps {
  theme: "dark" | "light";
  nodes: BranchNodeMeta[];
  links: ExtensionLink[];
  energy: number;
  activeNodeIndex?: number | null;
  snap?: { index: number; serial: number } | null;
  transfer?: { fromSocket: number; toSocket: number; label: string; serial: number } | null;
  paused?: boolean;
  fromSetupExplosion?: boolean;
  mode?: "stage" | "embedded";
  bottomClearance?: number;
  showcaseAll?: boolean;
  onSelectNode?: (index: number) => void;
  onHoverNode?: (index: number | null) => void;
  className?: string;
}

type SweepStrand = {
  bucket: number;
  fromAbove: boolean;
  waistX: number;
  waistY: number;
  srcAngle: number;
  srcRadius: number;
  dstAngle: number;
  dstRadius: number;
  phase: number;
  sway: number;
};

type EdgeStrand = {
  bucket: number;
  offsetScale: number;
  phase: number;
  sway: number;
};

type DustSpec = {
  edgeIdx: number;
  t: number;
  ox: number;
  oy: number;
  size: number;
  alpha: number;
  phase: number;
};

type FlowBead = {
  kind: "edge" | "bridge";
  idx: number;
  u: number;
  speed: number;
  dir: 1 | -1;
  size: number;
  alpha: number;
};

type CometPulse = {
  segments: Vec[][];
  targetIdx: number;
  progress: number;
  duration: number;
  intensity?: number;
  bloomOnArrive?: boolean;
};

type ClickRipple = {
  x: number;
  y: number;
  progress: number;
  duration: number;
  maxRadius: number;
  strength: number;
  doubleRing?: boolean;
};

type WaveImpulse = {
  x: number;
  y: number;
  progress: number;
  duration: number;
  maxRadius: number;
  amplitude: number;
};

type FilamentDeflect = {
  dx: number;
  dy: number;
  glow: number;
};

/** Coherent traveling breeze field across the canopy so nearby silk fibers sway together like wind. */
function sampleWind(x: number, y: number, time: number): Vec {
  const primary = Math.sin(time * 0.62 - x * 0.0042 + y * 0.0022);
  const secondary = Math.sin(time * 1.08 - x * 0.0075 - y * 0.0032);
  const gust = 0.72 + 0.28 * Math.sin(time * 0.24 - x * 0.0018);
  return {
    x: (primary * 0.72 + secondary * 0.28) * gust,
    y: (Math.cos(time * 0.54 - x * 0.0036 + y * 0.0026) * 0.52 + secondary * 0.22) * gust,
  };
}

function projectOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 1 ? clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1) : 0;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distSq: (px - x) * (px - x) + (py - y) * (py - y), x, y };
}

function closestPointOnCurve(px: number, py: number, p0: Vec, c1: Vec, c2: Vec, p3: Vec) {
  const mid = bezier(p0, c1, c2, p3, 0.5);
  const a = projectOnSeg(px, py, p0.x, p0.y, mid.x, mid.y);
  const b = projectOnSeg(px, py, mid.x, mid.y, p3.x, p3.y);
  const best = a.distSq <= b.distSq ? a : b;
  return { dist: Math.sqrt(best.distSq), x: best.x, y: best.y };
}

/** 6-tier optical filament palette shared with Welcome page's GoldenNetwork engine. */
const DARK_BUCKETS = [
  { width: 0.52, color: "255, 206, 120", alpha: 0.34 },
  { width: 0.84, color: "246, 176, 68", alpha: 0.24 },
  { width: 1.25, color: "232, 150, 48", alpha: 0.14 },
  { width: 2.0, color: "214, 128, 36", alpha: 0.08 },
  { width: 0.36, color: "255, 236, 190", alpha: 0.48 },
  { width: 3.1, color: "204, 116, 28", alpha: 0.04 },
] as const;

const LIGHT_BUCKETS = [
  { width: 0.65, color: "218, 152, 20", alpha: 0.42 },
  { width: 1.0, color: "238, 178, 36", alpha: 0.32 },
  { width: 1.4, color: "198, 134, 14", alpha: 0.22 },
  { width: 2.2, color: "248, 196, 56", alpha: 0.14 },
  { width: 0.44, color: "178, 116, 10", alpha: 0.48 },
  { width: 3.2, color: "248, 208, 84", alpha: 0.1 },
] as const;

const SWEEP_COUNT = 34;

function createProceduralStrands() {
  const { rnd, gauss, between } = seededHelpers(20261124);

  const sweeps: SweepStrand[] = Array.from({ length: SWEEP_COUNT }, (_, i) => {
    const bucket = i % DARK_BUCKETS.length;
    const fromAbove = rnd() < 0.42;
    const srcBase = fromAbove ? -Math.PI * 0.5 + between(-0.95, 0.95) : Math.PI - between(0.08, 0.48);
    const dstBase = fromAbove ? between(-0.45, 0.42) : between(-0.22, 0.36);
    return {
      bucket,
      fromAbove,
      waistX: gauss() * 0.012,
      waistY: gauss() * 0.01,
      srcAngle: srcBase,
      srcRadius: between(0.45, 0.85),
      dstAngle: dstBase,
      dstRadius: between(0.45, 0.92),
      phase: rnd() * Math.PI * 2,
      sway: between(0.6, 1.35),
    };
  });

  const trunkStrands: EdgeStrand[][] = [
    Array.from({ length: 7 }, (_, i) => ({
      bucket: i % DARK_BUCKETS.length,
      offsetScale: ((i - 3) / 3) * 0.16 + gauss() * 0.03,
      phase: rnd() * Math.PI * 2,
      sway: between(0.65, 1.25),
    })),
    Array.from({ length: 5 }, (_, i) => ({
      bucket: i % DARK_BUCKETS.length,
      offsetScale: ((i - 2) / 2) * 0.15 + gauss() * 0.03,
      phase: rnd() * Math.PI * 2,
      sway: between(0.65, 1.25),
    })),
    Array.from({ length: 3 }, (_, i) => ({
      bucket: i % DARK_BUCKETS.length,
      offsetScale: (i - 1) * 0.14 + gauss() * 0.025,
      phase: rnd() * Math.PI * 2,
      sway: between(0.65, 1.25),
    })),
  ];

  const bridgeStrands: EdgeStrand[] = Array.from({ length: 5 }, (_, i) => ({
    bucket: i === 4 ? 4 : i % 4,
    offsetScale: ((i - 2) / 2) * 0.12 + gauss() * 0.02,
    phase: rnd() * Math.PI * 2,
    sway: between(0.7, 1.3),
  }));

  const dust: DustSpec[] = Array.from({ length: 280 }, (_, idx) => ({
    edgeIdx: idx,
    t: Math.pow(rnd(), 0.72),
    ox: gauss() * 14,
    oy: gauss() * 14,
    size: between(0.7, 1.6),
    alpha: between(0.32, 0.9),
    phase: rnd() * Math.PI * 2,
  }));

  const beads: FlowBead[] = Array.from({ length: 78 }, (_, idx) => ({
    kind: idx % 3 === 0 ? "bridge" : "edge",
    idx,
    u: rnd(),
    speed: between(0.09, 0.22),
    dir: rnd() < 0.7 ? 1 : -1,
    size: between(1.0, 2.0),
    alpha: between(0.5, 0.95),
  }));

  return { sweeps, trunkStrands, bridgeStrands, dust, beads };
}

const STRAND_DATA = createProceduralStrands();

function swayControlPoints(
  p0: Vec,
  c1: Vec,
  c2: Vec,
  p3: Vec,
  strand: EdgeStrand,
  wind: Vec,
  time: number,
  ampScale: number,
): [Vec, Vec] {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.max(12, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const windDot = wind.x * nx + wind.y * ny;
  const silkFlutter = Math.sin(time * 0.85 + strand.phase) * 0.028 * strand.sway;
  const windPush = windDot * 0.068 * strand.sway;
  const shift1 = (strand.offsetScale + windPush * 0.85 + silkFlutter) * len * ampScale;
  const shift2 = (strand.offsetScale * 0.65 + windPush * 1.15 - silkFlutter * 0.8) * len * ampScale;
  return [
    { x: c1.x + nx * shift1, y: c1.y + ny * shift1 },
    { x: c2.x + nx * shift2, y: c2.y + ny * shift2 },
  ];
}

function displaceCurvePoints(
  p0Base: Vec,
  c1Base: Vec,
  c2Base: Vec,
  p3Base: Vec,
  p0Live: Vec,
  p3Live: Vec,
  hoverDeflect: FilamentDeflect | undefined,
  impulses: readonly WaveImpulse[],
): { curve: [Vec, Vec, Vec, Vec]; rippleGlow: number } {
  const d0 = sub(p0Live, p0Base);
  const d3 = sub(p3Live, p3Base);
  let c1x = c1Base.x + d0.x * 0.72 + d3.x * 0.28;
  let c1y = c1Base.y + d0.y * 0.72 + d3.y * 0.28;
  let c2x = c2Base.x + d0.x * 0.28 + d3.x * 0.72;
  let c2y = c2Base.y + d0.y * 0.28 + d3.y * 0.72;

  if (hoverDeflect && (hoverDeflect.dx !== 0 || hoverDeflect.dy !== 0)) {
    c1x += hoverDeflect.dx;
    c1y += hoverDeflect.dy;
    c2x += hoverDeflect.dx;
    c2y += hoverDeflect.dy;
  }

  let rippleGlow = 0;
  if (impulses.length > 0) {
    const midX = (c1x + c2x) * 0.5;
    const midY = (c1y + c2y) * 0.5;
    let impX = 0;
    let impY = 0;
    for (const imp of impulses) {
      const waveR = imp.maxRadius * imp.progress;
      const rx = midX - imp.x;
      const ry = midY - imp.y;
      const rDist = Math.hypot(rx, ry);
      const band = 36;
      if (rDist > 1 && Math.abs(rDist - waveR) < band) {
        const env = Math.cos(((rDist - waveR) / band) * Math.PI * 0.5) * (1 - imp.progress);
        const push = imp.amplitude * env;
        impX += (rx / rDist) * push;
        impY += (ry / rDist) * push;
        rippleGlow = Math.max(rippleGlow, env * 0.9);
      }
    }
    c1x += impX;
    c1y += impY;
    c2x += impX;
    c2y += impY;
  }

  return {
    curve: [p0Live, { x: c1x, y: c1y }, { x: c2x, y: c2y }, p3Live],
    rippleGlow,
  };
}

function forwardSegmentsFromCore(layout: BranchNetworkLayout, nodeIndex: number): Vec[][] {
  const chain: Vec[][] = [];
  let cursor: number | null = nodeIndex;
  while (cursor !== null) {
    const edge: BranchEdge | undefined = layout.edges[cursor];
    if (!edge) break;
    chain.unshift([edge.p0, edge.c1, edge.c2, edge.p3]);
    cursor = edge.fromIndex === "core" ? null : edge.fromIndex;
  }
  return chain;
}

function buildCometSegments(
  layout: BranchNetworkLayout,
  fromIdx: number,
  toIdx: number,
): Vec[][] | null {
  const fromNode = layout.nodes[fromIdx];
  const toNode = toIdx >= 0 ? layout.nodes[toIdx] : null;
  if (!fromNode) return null;

  if (toNode) {
    const directBridge = layout.bridges.find(
      (b) =>
        (b.fromIndex === fromIdx && b.toIndex === toIdx) ||
        (b.fromIndex === toIdx && b.toIndex === fromIdx),
    );
    if (directBridge) {
      if (directBridge.fromIndex === fromIdx) {
        return [[directBridge.p0, directBridge.c1, directBridge.c2, directBridge.p3]];
      }
      return [[directBridge.p3, directBridge.c2, directBridge.c1, directBridge.p0]];
    }
  }

  // Fallback path: traverse back along ancestry to Core, then out along destination ancestry
  const traceToCore = (nodeIndex: number): Vec[][] => {
    const chain: Vec[][] = [];
    let cursor: number | null = nodeIndex;
    while (cursor !== null) {
      const edge: BranchEdge | undefined = layout.edges[cursor];
      if (!edge) break;
      chain.push([edge.p3, edge.c2, edge.c1, edge.p0]);
      cursor = edge.fromIndex === "core" ? null : edge.fromIndex;
    }
    return chain;
  };

  const segments = traceToCore(fromIdx);
  if (toNode) {
    segments.push(...forwardSegmentsFromCore(layout, toIdx));
  }
  return segments.length > 0 ? segments : null;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Subdivides a cubic Bézier over [0, u] using De Casteljau's algorithm; q3 is the exact wavefront tip. */
function splitBezier(
  p0: Vec,
  c1: Vec,
  c2: Vec,
  p3: Vec,
  u: number,
): [Vec, Vec, Vec, Vec] {
  const t = clamp(u, 0, 1);
  const lerp = (a: Vec, b: Vec): Vec => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const m0 = lerp(p0, c1);
  const m1 = lerp(c1, c2);
  const m2 = lerp(c2, p3);
  const n0 = lerp(m0, m1);
  const n1 = lerp(m1, m2);
  const q3 = lerp(n0, n1);
  return [p0, m0, n0, q3];
}

interface CascadeTimings {
  edgeTiming: Array<[number, number]>;
  nodeArrival: number[];
  bridgeTiming: Array<[number, number]>;
}

const TRUNK_STAGGER = [0.055, 0.025, 0.0, 0.025, 0.055] as const;

function computeCascadeTimings(layout: BranchNetworkLayout): CascadeTimings {
  const nodeCount = layout.nodes.length;
  const edgeTiming: Array<[number, number]> = Array.from({ length: layout.edges.length }, () => [0, 0.25]);
  const nodeArrival: number[] = Array(nodeCount).fill(0.5);

  for (let pass = 1; pass <= 3; pass++) {
    for (let eIdx = 0; eIdx < layout.edges.length; eIdx++) {
      const edge = layout.edges[eIdx]!;
      if (edge.tier !== pass) continue;
      if (edge.tier === 1) {
        const stagger = TRUNK_STAGGER[edge.branchIndex % TRUNK_STAGGER.length] ?? 0.03;
        const start = 0.03 + stagger;
        const end = start + 0.28;
        edgeTiming[eIdx] = [start, end];
        nodeArrival[edge.toIndex] = end;
      } else if (edge.tier === 2) {
        const parentArr =
          typeof edge.fromIndex === "number" ? (nodeArrival[edge.fromIndex] ?? 0.34) : 0.34;
        const sibOffset = (edge.toIndex % 3) * 0.018;
        const start = parentArr - 0.03 + sibOffset;
        const end = start + 0.25;
        edgeTiming[eIdx] = [start, end];
        nodeArrival[edge.toIndex] = end;
      } else {
        const parentArr =
          typeof edge.fromIndex === "number" ? (nodeArrival[edge.fromIndex] ?? 0.6) : 0.6;
        const forkOffset = (edge.toIndex % 2) * 0.028;
        const start = parentArr - 0.03 + forkOffset;
        const end = Math.min(0.92, start + 0.24);
        edgeTiming[eIdx] = [start, end];
        nodeArrival[edge.toIndex] = end;
      }
    }
  }

  const bridgeTiming: Array<[number, number]> = layout.bridges.map((br, idx) => {
    const aArr = nodeArrival[br.fromIndex] ?? 0.5;
    const bArr = nodeArrival[br.toIndex] ?? 0.5;
    const start = clamp(Math.max(aArr, bArr) - 0.03 + (idx % 3) * 0.015, 0.28, 0.85);
    const end = Math.min(0.995, start + 0.14);
    return [start, end];
  });

  return { edgeTiming, nodeArrival, bridgeTiming };
}

function traceFluidOrbPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  time: number,
  energy: number,
  phaseShift: number,
  ampMul: number,
) {
  const steps = 44;
  const pts: Vec[] = [];
  const amp1 = (0.044 + energy * 0.022) * ampMul;
  const amp2 = 0.028 * ampMul;
  const amp3 = 0.018 * ampMul;

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const wobble =
      amp1 * Math.sin(theta * 3 - time * 1.55 + phaseShift) +
      amp2 * Math.sin(theta * 5 + time * 2.25 - phaseShift * 0.7) +
      amp3 * Math.cos(theta * 2 - time * 0.92 + phaseShift * 1.3);
    const r = baseR * (1 + wobble);
    pts.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
  }

  const firstMid = {
    x: (pts[steps - 1]!.x + pts[0]!.x) * 0.5,
    y: (pts[steps - 1]!.y + pts[0]!.y) * 0.5,
  };
  ctx.beginPath();
  ctx.moveTo(firstMid.x, firstMid.y);
  for (let i = 0; i < steps; i++) {
    const cur = pts[i]!;
    const next = pts[(i + 1) % steps]!;
    ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) * 0.5, (cur.y + next.y) * 0.5);
  }
  ctx.closePath();
}

/**
 * Draws the central Singularity as a living, fluid golden orb (without any emblem/logo)
 * with harmonic organic contour morphing, swirling molten-gold internal currents, and rim filigree.
 */
function drawGoldenFluidCore(
  ctx: CanvasRenderingContext2D,
  core: Vec,
  baseR: number,
  time: number,
  energy: number,
  ignitionPulse: number,
  isLight: boolean,
  cursorOffset: Vec = { x: 0, y: 0 },
  coreScale = 1,
) {
  if (coreScale <= 0.02) return;
  ctx.save();
  const R = baseR * coreScale * (1 + ignitionPulse * 0.16 + 0.025 * Math.sin(time * 1.8));
  const breathe = 1 + 0.055 * Math.sin(time * 0.95) + energy * 0.14 + ignitionPulse * 0.28;

  // 1. Soft atmospheric halo behind the fluid golden sphere
  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
  radialGlow(ctx, core, R * 3.6 * breathe, [
    [0, isLight ? "rgba(255, 214, 82, 0.55)" : "rgba(255, 214, 110, 0.52)"],
    [0.36, isLight ? "rgba(240, 178, 34, 0.24)" : "rgba(240, 172, 48, 0.24)"],
    [1, "rgba(0, 0, 0, 0)"],
  ]);

  // Outer undulating molten aura membrane
  traceFluidOrbPath(ctx, core.x, core.y, R * 1.32, time * 0.85, energy, 1.4, 1.35);
  ctx.fillStyle = isLight ? "rgba(245, 186, 40, 0.14)" : "rgba(248, 186, 62, 0.16)";
  ctx.fill();

  // 2. Deep molten golden sphere body (source-over keeps dark/light tones rich and dimensional)
  ctx.globalCompositeOperation = "source-over";
  traceFluidOrbPath(ctx, core.x, core.y, R, time, energy, 0, 1);

  const fx = core.x - R * 0.22 + Math.cos(time * 0.72) * R * 0.13 + cursorOffset.x * R * 0.18;
  const fy = core.y - R * 0.24 + Math.sin(time * 0.64) * R * 0.13 + cursorOffset.y * R * 0.18;
  const bodyGrad = ctx.createRadialGradient(fx, fy, R * 0.06, core.x, core.y, R * 1.12);
  if (isLight) {
    bodyGrad.addColorStop(0, "#fffdf2");
    bodyGrad.addColorStop(0.28, "#ffe27a");
    bodyGrad.addColorStop(0.62, "#e09412");
    bodyGrad.addColorStop(0.88, "#a66206");
    bodyGrad.addColorStop(1, "#703e03");
  } else {
    bodyGrad.addColorStop(0, "#fff9e2");
    bodyGrad.addColorStop(0.25, "#ffd769");
    bodyGrad.addColorStop(0.58, "#e39519");
    bodyGrad.addColorStop(0.86, "#9a5707");
    bodyGrad.addColorStop(1, "#4e2804");
  }
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // 3. Swirling internal liquid currents, caustic ribbons, and orbiting golden particles
  ctx.save();
  ctx.clip();

  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
  const lobe1 = {
    x: core.x + Math.cos(time * 0.95) * R * 0.34,
    y: core.y + Math.sin(time * 1.15) * R * 0.28,
  };
  const lobe2 = {
    x: core.x + Math.cos(-time * 0.8 + 2.2) * R * 0.38,
    y: core.y + Math.sin(-time * 1.05 + 2.2) * R * 0.32,
  };
  radialGlow(ctx, lobe1, R * 0.76, [
    [0, isLight ? "rgba(255, 250, 224, 0.56)" : "rgba(255, 246, 206, 0.54)"],
    [1, "rgba(255, 200, 72, 0)"],
  ]);
  radialGlow(ctx, lobe2, R * 0.68, [
    [0, isLight ? "rgba(255, 226, 118, 0.42)" : "rgba(246, 178, 56, 0.44)"],
    [1, "rgba(240, 165, 36, 0)"],
  ]);

  // Counter-flowing internal golden caustic ribbons
  for (let b = 0; b < 3; b++) {
    const dir = b % 2 === 0 ? 1 : -1;
    const ang = time * (0.52 + b * 0.16) * dir + b * 1.05;
    const cAng = Math.cos(ang);
    const sAng = Math.sin(ang);
    const rot = (lx: number, ly: number): Vec => ({
      x: core.x + lx * cAng - ly * sAng,
      y: core.y + lx * sAng + ly * cAng,
    });
    const yShift = (b - 1) * R * 0.28;
    const p0 = rot(-R * 1.1, yShift);
    const c1 = rot(-R * 0.36, yShift + Math.sin(time * 1.6 + b * 1.9) * R * 0.44);
    const c2 = rot(R * 0.36, yShift - Math.cos(time * 1.45 + b * 1.3) * R * 0.44);
    const p3 = rot(R * 1.1, -yShift * 0.4);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
    ctx.lineWidth = b === 1 ? 1.55 : 0.95;
    ctx.strokeStyle =
      b === 1
        ? isLight
          ? "rgba(255, 252, 232, 0.62)"
          : "rgba(255, 250, 225, 0.72)"
        : isLight
          ? "rgba(255, 238, 170, 0.45)"
          : "rgba(255, 214, 120, 0.48)";
    ctx.stroke();
  }

  // Orbiting internal golden dust motes echoing the crystal orb's motion
  for (let m = 0; m < 12; m++) {
    const orbitR = R * (0.24 + ((m * 37) % 100) / 170);
    const theta = time * (0.85 + (m % 4) * 0.24) * (m % 2 === 0 ? 1 : -1) + m * 1.17;
    const tilt = 0.58 + (m % 3) * 0.14;
    const mx = core.x + Math.cos(theta) * orbitR;
    const my = core.y + Math.sin(theta) * orbitR * tilt;
    ctx.globalAlpha = 0.42 + 0.52 * Math.abs(Math.sin(time * 1.9 + m * 0.8));
    ctx.fillStyle = isLight ? "#fffceb" : "#fff7de";
    ctx.beginPath();
    ctx.arc(mx, my, m % 3 === 0 ? 1.25 : 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // 4. Shimmering golden rim + orbital filigree crescents
  ctx.globalCompositeOperation = "source-over";
  traceFluidOrbPath(ctx, core.x, core.y, R, time, energy, 0, 1);
  ctx.lineWidth = isLight ? 1.35 : 1.25;
  ctx.strokeStyle = isLight ? "rgba(146, 88, 6, 0.82)" : "rgba(255, 228, 152, 0.88)";
  ctx.stroke();

  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
  for (let c = 0; c < 2; c++) {
    const startA = time * (c === 0 ? 0.68 : -0.54) + c * Math.PI * 1.05;
    const arcR = R * (1.1 + c * 0.08);
    ctx.beginPath();
    ctx.arc(core.x, core.y, arcR, startA, startA + 0.92);
    ctx.lineWidth = c === 0 ? 1.15 : 0.85;
    ctx.lineCap = "round";
    ctx.strokeStyle = isLight ? "rgba(180, 118, 12, 0.52)" : "rgba(255, 232, 168, 0.58)";
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * High-DPI Procedural Branching Filament Engine modeled on Welcome page's GoldenNetwork:
 * 50-slot fractal branching trunks, capability-linked inter-node synapse bridges,
 * zero permanent text clutter, and a single floating Liquid Glass hover inspector.
 */
export function BranchingNetworkCanvas({
  theme,
  nodes,
  links,
  energy,
  activeNodeIndex = null,
  snap = null,
  transfer = null,
  paused = false,
  fromSetupExplosion = false,
  mode = "stage",
  bottomClearance,
  showcaseAll = false,
  onSelectNode,
  onHoverNode,
  className = "",
}: BranchingNetworkCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 1120,
    height: mode === "embedded" ? 420 : 800,
  });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [overCore, setOverCore] = useState(false);

  const layout = useMemo(
    () =>
      computeBranchNetworkLayout(size.width, size.height, nodes.length, links, {
        mode,
        bottomClearance,
      }),
    [size.width, size.height, nodes.length, links, mode, bottomClearance],
  );

  // Determine which nodes sit along the active path / bridges to any occupied node
  const { occupiedEdgeSet, occupiedNodeSet, bridgeChannelsByNode } = useMemo(() => {
    const edgeSet = new Set<number>();
    const nodeSet = new Set<number>();
    const peerMap = new Map<number, Array<{ peerIndex: number; channel: string; isLive: boolean }>>();

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]?.status === "occupied") {
        nodeSet.add(i);
        const anc = layout.ancestorEdges.get(i);
        if (anc) {
          for (const eIdx of anc) edgeSet.add(eIdx);
        }
      }
    }

    for (const bridge of layout.bridges) {
      if (bridge.isLive) {
        const listA = peerMap.get(bridge.fromIndex) ?? [];
        listA.push({ peerIndex: bridge.toIndex, channel: bridge.channel, isLive: true });
        peerMap.set(bridge.fromIndex, listA);

        const listB = peerMap.get(bridge.toIndex) ?? [];
        listB.push({ peerIndex: bridge.fromIndex, channel: bridge.channel, isLive: true });
        peerMap.set(bridge.toIndex, listB);
      }
    }

    return { occupiedEdgeSet: edgeSet, occupiedNodeSet: nodeSet, bridgeChannelsByNode: peerMap };
  }, [nodes, layout]);

  const cascade = useMemo(() => computeCascadeTimings(layout), [layout]);

  const cometsRef = useRef<CometPulse[]>([]);
  const ripplesRef = useRef<ClickRipple[]>([]);
  const impulsesRef = useRef<WaveImpulse[]>([]);
  const introProgressRef = useRef<number>(0);
  const revealProgressRef = useRef<number>(showcaseAll ? 1 : 0);
  const reduceMotionRef = useRef(false);
  const elapsedRef = useRef(0);
  const corePulseRef = useRef<number>(fromSetupExplosion ? 0.85 : 0);
  const prevPausedRef = useRef(paused);
  const lastSnapSerialRef = useRef<number>(snap?.serial ?? 0);
  const lastTransferSerialRef = useRef<number>(transfer?.serial ?? 0);
  const prevActiveNodeRef = useRef<number | null>(activeNodeIndex);
  const pressedNodeIdxRef = useRef<number | null>(null);
  const pointerTargetRef = useRef<Vec>({ x: 0, y: 0 });
  const pointerSmoothRef = useRef<Vec>({ x: 0, y: 0 });
  const ptrVelRef = useRef<Vec>({ x: 0, y: 0 });
  const pointerActiveRef = useRef(false);
  const pointerPresenceRef = useRef(0);
  const lastHoverSparkAtRef = useRef(0);
  const liveCoreRef = useRef<Vec>(layout.core);
  const liveNodesRef = useRef<Vec[]>([]);
  const edgeDeflectRef = useRef<FilamentDeflect[]>([]);
  const bridgeDeflectRef = useRef<FilamentDeflect[]>([]);
  const sweepDeflectRef = useRef<FilamentDeflect[]>([]);
  const nodeHoverRef = useRef<number[]>([]);
  const nodePressRef = useRef<number[]>([]);
  const nodeFlashRef = useRef<number[]>([]);

  const stateRef = useRef({
    theme,
    nodes,
    links,
    energy,
    activeNodeIndex,
    hoveredIdx,
    paused,
    fromSetupExplosion,
    showcaseAll,
    layout,
    cascade,
    occupiedEdgeSet,
    occupiedNodeSet,
  });

  useEffect(() => {
    stateRef.current = {
      theme,
      nodes,
      links,
      energy,
      activeNodeIndex,
      hoveredIdx,
      paused,
      fromSetupExplosion,
      showcaseAll,
      layout,
      cascade,
      occupiedEdgeSet,
      occupiedNodeSet,
    };
  });

  const enqueueComet = (pulse: CometPulse) => {
    if (reduceMotionRef.current) return;
    if (cometsRef.current.length >= 14) cometsRef.current.shift();
    cometsRef.current.push(pulse);
  };

  const enqueueRipple = (ripple: ClickRipple) => {
    if (reduceMotionRef.current) return;
    if (ripplesRef.current.length >= 8) ripplesRef.current.shift();
    ripplesRef.current.push(ripple);
  };

  const enqueueImpulse = (impulse: WaveImpulse) => {
    if (reduceMotionRef.current) return;
    if (impulsesRef.current.length >= 4) impulsesRef.current.shift();
    impulsesRef.current.push(impulse);
  };

  // Gentle welcome breath on Core when returning home from a full-screen surface
  useEffect(() => {
    if (!paused && prevPausedRef.current && !reduceMotionRef.current) {
      corePulseRef.current = Math.max(corePulseRef.current, 0.45);
    }
    prevPausedRef.current = paused;
  }, [paused]);

  // Snap activation: pulse Core, send bright comet outward, and ignite node bloom on arrival
  useEffect(() => {
    if (snap && snap.serial !== lastSnapSerialRef.current) {
      lastSnapSerialRef.current = snap.serial;
      if (!reduceMotionRef.current) {
        corePulseRef.current = Math.max(corePulseRef.current, 0.9);
        const outward = forwardSegmentsFromCore(layout, snap.index);
        if (outward.length > 0) {
          if (cometsRef.current.length >= 14) cometsRef.current.shift();
          cometsRef.current.push({
            segments: outward,
            targetIdx: snap.index,
            progress: 0,
            duration: 0.82,
            intensity: 1,
            bloomOnArrive: true,
          });
        }
      }
    }
  }, [snap, layout]);

  // Explicit node-to-node / Core transfer comet
  useEffect(() => {
    if (transfer && transfer.serial !== lastTransferSerialRef.current) {
      lastTransferSerialRef.current = transfer.serial;
      if (!reduceMotionRef.current) {
        const segs = buildCometSegments(layout, transfer.fromSocket, transfer.toSocket);
        if (segs) {
          if (cometsRef.current.length >= 14) cometsRef.current.shift();
          cometsRef.current.push({
            segments: segs,
            targetIdx: transfer.toSocket,
            progress: 0,
            duration: 1.0,
            intensity: 1,
            bloomOnArrive: transfer.toSocket >= 0,
          });
        }
      }
    }
  }, [transfer, layout]);

  // Node focus / activation flash + soft resonance ring
  useEffect(() => {
    if (activeNodeIndex !== null && activeNodeIndex !== prevActiveNodeRef.current) {
      nodeFlashRef.current[activeNodeIndex] = Math.max(nodeFlashRef.current[activeNodeIndex] ?? 0, 0.85);
      if (!reduceMotionRef.current) {
        const pt = liveNodesRef.current[activeNodeIndex] ?? layout.nodes[activeNodeIndex]?.pos;
        if (pt) {
          if (ripplesRef.current.length >= 8) ripplesRef.current.shift();
          ripplesRef.current.push({
            x: pt.x,
            y: pt.y,
            progress: 0,
            duration: 0.72,
            maxRadius: 42,
            strength: 0.65,
          });
        }
        const outward = forwardSegmentsFromCore(layout, activeNodeIndex);
        if (outward.length > 0) {
          if (cometsRef.current.length >= 14) cometsRef.current.shift();
          cometsRef.current.push({
            segments: outward,
            targetIdx: activeNodeIndex,
            progress: 0,
            duration: 0.72,
            intensity: 0.62,
          });
        }
      }
    }
    prevActiveNodeRef.current = activeNodeIndex;
  }, [activeNodeIndex, layout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize((prev) =>
          Math.round(prev.width) === Math.round(rect.width) &&
          Math.round(prev.height) === Math.round(rect.height)
            ? prev
            : { width: rect.width, height: rect.height },
        );
      }
    };
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    const frame = requestAnimationFrame(updateSize);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  // Main Canvas2D golden branching draw loop
  const drawFrameRef = useRef<(ctx: CanvasRenderingContext2D, time: number, dt: number) => void>(() => {});

  useEffect(() => {
    drawFrameRef.current = (ctx: CanvasRenderingContext2D, time: number, dt: number) => {
      const cur = stateRef.current;
      const lyt = cur.layout;
      const strands = STRAND_DATA;
      const isLight = cur.theme === "light";
      const buckets = isLight ? LIGHT_BUCKETS : DARK_BUCKETS;
      const { width: W, height: H, core, scale: S } = lyt;
      const reduceMotion = reduceMotionRef.current;
      const focusIdx = cur.hoveredIdx !== null ? cur.hoveredIdx : cur.activeNodeIndex;
      const focusEdges =
        focusIdx !== null && focusIdx !== undefined ? lyt.ancestorEdges.get(focusIdx) : undefined;
      const focusPeers =
        focusIdx !== null && focusIdx !== undefined ? lyt.adjacency.get(focusIdx) : undefined;

      // 0a. Advance first-open progressive canopy unfurl & "Preview All" cascade reveal
      const introDuration = cur.fromSetupExplosion ? 0.95 : 1.65;
      if (reduceMotion) {
        introProgressRef.current = 1;
      } else if (dt > 0 && introProgressRef.current < 1) {
        introProgressRef.current = Math.min(1, introProgressRef.current + dt / introDuration);
      }
      const intro = introProgressRef.current;
      const isIntroPlaying = intro < 0.996;

      const targetReveal = cur.showcaseAll ? 1 : 0;
      if (reduceMotion) {
        revealProgressRef.current = targetReveal;
      } else if (dt > 0) {
        if (targetReveal > revealProgressRef.current) {
          revealProgressRef.current = Math.min(1, revealProgressRef.current + dt / 2.5);
        } else if (targetReveal < revealProgressRef.current) {
          revealProgressRef.current = Math.max(0, revealProgressRef.current - dt / 0.75);
        }
      }
      const reveal = revealProgressRef.current;
      const isCascading = reveal > 0.002;
      const showcasePulse =
        cur.showcaseAll && reveal < 0.34 ? Math.sin(clamp(reveal / 0.34, 0, 1) * Math.PI) : 0;
      const introCorePulse =
        isIntroPlaying && intro < 0.45 ? Math.sin(clamp(intro / 0.45, 0, 1) * Math.PI) * 0.55 : 0;

      if (dt > 0 && corePulseRef.current > 0) {
        corePulseRef.current = Math.max(0, corePulseRef.current - dt * 1.45);
      }
      const ignitionPulse = Math.max(showcasePulse, introCorePulse, corePulseRef.current);

      // 0b. Smooth cursor tracking + velocity damping + radial click impulses + per-node spring filters
      const targetPresence = pointerActiveRef.current && !reduceMotion ? 1 : 0;
      const presenceRate = dt > 0 ? 1 - Math.exp(-dt * 8) : 1;
      pointerPresenceRef.current += (targetPresence - pointerPresenceRef.current) * presenceRate;
      const ptrPresence = pointerPresenceRef.current;

      if (pointerActiveRef.current) {
        const ptrRate = dt > 0 ? 1 - Math.exp(-dt * 14) : 1;
        pointerSmoothRef.current = {
          x: pointerSmoothRef.current.x + (pointerTargetRef.current.x - pointerSmoothRef.current.x) * ptrRate,
          y: pointerSmoothRef.current.y + (pointerTargetRef.current.y - pointerSmoothRef.current.y) * ptrRate,
        };
      }
      if (dt > 0) {
        const velDecay = Math.exp(-dt * 10);
        ptrVelRef.current.x *= velDecay;
        ptrVelRef.current.y *= velDecay;
      }
      const ptrSmooth = pointerSmoothRef.current;
      const ptrVel = ptrVelRef.current;

      if (impulsesRef.current.length > 0 && dt > 0) {
        const nextImpulses: WaveImpulse[] = [];
        for (const imp of impulsesRef.current) {
          imp.progress += dt / imp.duration;
          if (imp.progress < 1) nextImpulses.push(imp);
        }
        impulsesRef.current = nextImpulses;
      }
      const activeImpulses = reduceMotion ? [] : impulsesRef.current;

      if (ripplesRef.current.length > 0 && dt > 0) {
        const nextRipples: ClickRipple[] = [];
        for (const rp of ripplesRef.current) {
          rp.progress += dt / rp.duration;
          if (rp.progress < 1) nextRipples.push(rp);
        }
        ripplesRef.current = nextRipples;
      }

      const hoverArr = nodeHoverRef.current;
      const pressArr = nodePressRef.current;
      const flashArr = nodeFlashRef.current;
      const hoverLerp = dt > 0 ? 1 - Math.exp(-dt * 11) : 1;
      const pressLerp = dt > 0 ? 1 - Math.exp(-dt * 24) : 1;
      for (let i = 0; i < lyt.nodes.length; i++) {
        const targetHov =
          cur.hoveredIdx === i || cur.activeNodeIndex === i ? 1 : focusPeers?.has(i) ? 0.52 : 0;
        hoverArr[i] = (hoverArr[i] ?? 0) + (targetHov - (hoverArr[i] ?? 0)) * hoverLerp;

        const targetPress = pressedNodeIdxRef.current === i ? 1 : 0;
        pressArr[i] = (pressArr[i] ?? 0) + (targetPress - (pressArr[i] ?? 0)) * pressLerp;

        flashArr[i] = Math.max(0, (flashArr[i] ?? 0) - (dt > 0 ? dt * 1.55 : 0));
      }

      // 0c. Coherent canopy breeze (tiny natural branch-tip flex, no global cursor parallax or tree-wide jitter)
      const liveCore: Vec = core;
      const liveNodes: Vec[] = Array(lyt.nodes.length);

      if (reduceMotion) {
        for (let i = 0; i < lyt.nodes.length; i++) liveNodes[i] = lyt.nodes[i]!.pos;
      } else {
        const tierAmpScale = lyt.compact ? 0.72 : 1;
        for (let i = 0; i < lyt.nodes.length; i++) {
          const bNode = lyt.nodes[i]!;
          const wind = sampleWind(bNode.pos.x, bNode.pos.y, time);
          const tierAmp = (bNode.tier === 1 ? 0.45 : bNode.tier === 2 ? 1.05 : 1.85) * tierAmpScale;
          liveNodes[i] = {
            x: bNode.pos.x + wind.x * tierAmp,
            y: bNode.pos.y + wind.y * tierAmp * 0.78,
          };
        }
      }

      liveCoreRef.current = liveCore;
      liveNodesRef.current = liveNodes;

      // Update strictly local per-filament hover brush springs (radius 56px)
      const updateFilamentSpring = (
        arr: FilamentDeflect[],
        idx: number,
        hit: { dist: number; x: number; y: number } | null,
      ) => {
        let slot = arr[idx];
        if (!slot) {
          slot = { dx: 0, dy: 0, glow: 0 };
          arr[idx] = slot;
        }
        let targetDx = 0;
        let targetDy = 0;
        let targetGlow = 0;
        if (hit && hit.dist < 56 && ptrPresence > 0.02 && !reduceMotion) {
          const falloff = Math.pow(1 - hit.dist / 56, 1.6) * ptrPresence;
          const awayX = hit.dist > 0.5 ? (hit.x - ptrSmooth.x) / hit.dist : 0;
          const awayY = hit.dist > 0.5 ? (hit.y - ptrSmooth.y) / hit.dist : 0;
          let pushX = awayX * 6.5 * falloff + ptrVel.x * 0.45 * falloff;
          let pushY = awayY * 6.5 * falloff + ptrVel.y * 0.45 * falloff;
          const mag = Math.hypot(pushX, pushY);
          if (mag > 10.5) {
            pushX = (pushX / mag) * 10.5;
            pushY = (pushY / mag) * 10.5;
          }
          targetDx = pushX;
          targetDy = pushY;
          targetGlow = Math.min(1, falloff * 1.15);
        }
        const moveRate = dt > 0 ? 1 - Math.exp(-dt * (targetGlow > 0.01 ? 16 : 4.8)) : 1;
        const glowRate = dt > 0 ? 1 - Math.exp(-dt * (targetGlow > slot.glow ? 18 : 5.2)) : 1;
        slot.dx += (targetDx - slot.dx) * moveRate;
        slot.dy += (targetDy - slot.dy) * moveRate;
        slot.glow += (targetGlow - slot.glow) * glowRate;
      };

      const edgeDeflects = edgeDeflectRef.current;
      edgeDeflects.length = lyt.edges.length;
      for (let eIdx = 0; eIdx < lyt.edges.length; eIdx++) {
        const edge = lyt.edges[eIdx]!;
        const hit =
          ptrPresence > 0.02 && !reduceMotion
            ? closestPointOnCurve(
                ptrSmooth.x,
                ptrSmooth.y,
                edge.fromIndex === "core" ? liveCore : (liveNodes[edge.fromIndex] ?? edge.p0),
                edge.c1,
                edge.c2,
                liveNodes[edge.toIndex] ?? edge.p3,
              )
            : null;
        updateFilamentSpring(edgeDeflects, eIdx, hit);
      }

      const bridgeDeflects = bridgeDeflectRef.current;
      bridgeDeflects.length = lyt.bridges.length;
      for (let brIdx = 0; brIdx < lyt.bridges.length; brIdx++) {
        const br = lyt.bridges[brIdx]!;
        const hit =
          ptrPresence > 0.02 && !reduceMotion
            ? closestPointOnCurve(
                ptrSmooth.x,
                ptrSmooth.y,
                liveNodes[br.fromIndex] ?? br.p0,
                br.c1,
                br.c2,
                liveNodes[br.toIndex] ?? br.p3,
              )
            : null;
        updateFilamentSpring(bridgeDeflects, brIdx, hit);
      }

      const sweepScale = Math.max(W * 0.54, H * 0.48);
      const sweepDeflects = sweepDeflectRef.current;
      sweepDeflects.length = strands.sweeps.length;
      const sweepGeom = strands.sweeps.map((sw, swIdx) => {
        const w = reduceMotion ? { x: 0, y: 0 } : sampleWind(liveCore.x, liveCore.y, time);
        const breezePhase = w.x * 0.048 * sw.sway + Math.sin(time * 0.34 + sw.phase) * 0.022 * sw.sway;
        const pinch = { x: liveCore.x + sw.waistX * S, y: liveCore.y + sw.waistY * S };
        const p0 = add(liveCore, polar(sw.srcRadius * sweepScale, sw.srcAngle + breezePhase * 0.85));
        const c1 = add(p0, polar(sw.srcRadius * sweepScale * 0.4, sw.srcAngle + Math.PI + 0.25));
        const c2 = add(pinch, polar(sweepScale * 0.22, sw.srcAngle + breezePhase));
        const p3 = add(liveCore, polar(sw.dstRadius * sweepScale, sw.dstAngle + breezePhase * 1.1));
        const d1 = add(pinch, polar(sweepScale * 0.24, sw.dstAngle - breezePhase * 0.9));
        const d2 = add(p3, polar(sw.dstRadius * sweepScale * 0.38, sw.dstAngle + Math.PI));

        let hit: { dist: number; x: number; y: number } | null = null;
        if (ptrPresence > 0.02 && !reduceMotion) {
          const h1 = closestPointOnCurve(ptrSmooth.x, ptrSmooth.y, p0, c1, c2, pinch);
          const h2 = closestPointOnCurve(ptrSmooth.x, ptrSmooth.y, pinch, d1, d2, p3);
          hit = h1.dist <= h2.dist ? h1 : h2;
        }
        updateFilamentSpring(sweepDeflects, swIdx, hit);
        const def = sweepDeflects[swIdx]!;
        let rGlow = 0;
        let rxSum = 0;
        let rySum = 0;
        if (activeImpulses.length > 0) {
          const testX = (p0.x + p3.x) * 0.5;
          const testY = (p0.y + p3.y) * 0.5;
          for (const imp of activeImpulses) {
            const waveR = imp.maxRadius * imp.progress;
            const dx = testX - imp.x;
            const dy = testY - imp.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1 && Math.abs(dist - waveR) < 36) {
              const env = Math.cos(((dist - waveR) / 36) * Math.PI * 0.5) * (1 - imp.progress);
              rxSum += (dx / dist) * imp.amplitude * 0.7 * env;
              rySum += (dy / dist) * imp.amplitude * 0.7 * env;
              rGlow = Math.max(rGlow, env * 0.75);
            }
          }
        }
        return {
          bucket: sw.bucket,
          p0,
          c1: { x: c1.x + def.dx + rxSum, y: c1.y + def.dy + rySum },
          c2: { x: c2.x + def.dx * 0.7 + rxSum, y: c2.y + def.dy * 0.7 + rySum },
          pinch: { x: pinch.x + def.dx * 0.45, y: pinch.y + def.dy * 0.45 },
          d1: { x: d1.x + def.dx * 0.7 + rxSum, y: d1.y + def.dy * 0.7 + rySum },
          d2: { x: d2.x + def.dx + rxSum, y: d2.y + def.dy + rySum },
          p3,
          shimmer: Math.max(def.glow, rGlow),
        };
      });

      const edgeOutputs = lyt.edges.map((edge, eIdx) => {
        const p0L = edge.fromIndex === "core" ? liveCore : (liveNodes[edge.fromIndex] ?? edge.p0);
        const p3L = liveNodes[edge.toIndex] ?? edge.p3;
        const def = edgeDeflects[eIdx];
        const res = displaceCurvePoints(
          edge.p0,
          edge.c1,
          edge.c2,
          edge.p3,
          p0L,
          p3L,
          def,
          activeImpulses,
        );
        return {
          curve: res.curve,
          shimmer: Math.max(def?.glow ?? 0, res.rippleGlow),
        };
      });

      const bridgeOutputs = lyt.bridges.map((br, brIdx) => {
        const p0L = liveNodes[br.fromIndex] ?? br.p0;
        const p3L = liveNodes[br.toIndex] ?? br.p3;
        const def = bridgeDeflects[brIdx];
        const res = displaceCurvePoints(
          br.p0,
          br.c1,
          br.c2,
          br.p3,
          p0L,
          p3L,
          def,
          activeImpulses,
        );
        return {
          curve: res.curve,
          shimmer: Math.max(def?.glow ?? 0, res.rippleGlow),
        };
      });

      const liveTailTip = (destNode: (typeof lyt.nodes)[number]): Vec | null => {
        if (!destNode.tailTip) return null;
        const lPos = liveNodes[destNode.index] ?? destNode.pos;
        const dx = lPos.x - destNode.pos.x;
        const dy = lPos.y - destNode.pos.y;
        const edgeDef = edgeDeflects[destNode.index];
        let impX = 0;
        let impY = 0;
        if (activeImpulses.length > 0) {
          for (const imp of activeImpulses) {
            const waveR = imp.maxRadius * imp.progress;
            const ix = destNode.tailTip.x - imp.x;
            const iy = destNode.tailTip.y - imp.y;
            const iDist = Math.hypot(ix, iy);
            if (iDist > 1 && Math.abs(iDist - waveR) < 36) {
              const env = Math.cos(((iDist - waveR) / 36) * Math.PI * 0.5) * (1 - imp.progress);
              impX += (ix / iDist) * imp.amplitude * env;
              impY += (iy / iDist) * imp.amplitude * env;
            }
          }
        }
        if (reduceMotion) {
          return { x: destNode.tailTip.x + dx, y: destNode.tailTip.y + dy };
        }
        const wind = sampleWind(destNode.tailTip.x, destNode.tailTip.y, time);
        return {
          x: destNode.tailTip.x + dx * 1.1 + wind.x * 4.2 + (edgeDef?.dx ?? 0) * 0.55 + impX,
          y: destNode.tailTip.y + dy * 1.1 + wind.y * 3.4 + (edgeDef?.dy ?? 0) * 0.55 + impY,
        };
      };

      // Soft idle outward canopy breathing wave every ~6s
      const breathWavePos = reduceMotion ? -1 : (time * 0.165) % 1;
      const breathBoostFor = (arrival: number) => {
        if (breathWavePos < 0) return 0;
        const dist = Math.abs(arrival - breathWavePos);
        const wrapDist = Math.min(dist, 1 - dist);
        return wrapDist < 0.24 ? Math.exp(-Math.pow(wrapDist / 0.11, 2)) * 0.16 : 0;
      };

      const breathe = 1 + 0.045 * Math.sin(time * 0.65) + 0.12 * cur.energy + ignitionPulse * 0.12;

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = isLight ? "#faf8f2" : "#070709";
      ctx.fillRect(0, 0, W, H);

      // Atmosphere glow matching GoldenNetwork
      const lightRadius = Math.max(S * 1.15, Math.max(W, H) * 0.72);
      if (isLight) {
        radialGlow(ctx, liveCore, S * 0.58 * breathe, [
          [0, "rgba(255, 214, 88, 0.34)"],
          [0.42, "rgba(248, 192, 48, 0.14)"],
          [1, "rgba(250, 248, 242, 0)"],
        ]);
      } else {
        ctx.globalCompositeOperation = "lighter";
        radialGlow(ctx, liveCore, S * 0.52 * breathe, [
          [0, "rgba(255, 198, 92, 0.24)"],
          [0.4, "rgba(220, 138, 36, 0.09)"],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      const strokeBatched = (
        bucketIndex: number,
        alphaScale: number,
        drawPaths: () => void,
        widthMul = 1,
      ) => {
        const b = buckets[bucketIndex]!;
        const a = clamp(b.alpha * alphaScale, 0, 1);
        if (a <= 0.008) return;
        const grad = ctx.createRadialGradient(liveCore.x, liveCore.y, 0, liveCore.x, liveCore.y, lightRadius);
        if (isLight) {
          grad.addColorStop(0, `rgba(${b.color}, ${Math.min(0.88, a * 1.35)})`);
          grad.addColorStop(0.55, `rgba(${b.color}, ${a * 0.85})`);
          grad.addColorStop(1, `rgba(${b.color}, ${(a * 0.15).toFixed(3)})`);
        } else {
          grad.addColorStop(0, `rgba(${b.color}, ${Math.min(1, a * 1.7)})`);
          grad.addColorStop(0.52, `rgba(${b.color}, ${a * 0.9})`);
          grad.addColorStop(1, `rgba(${b.color}, ${(a * 0.14).toFixed(3)})`);
        }
        ctx.beginPath();
        drawPaths();
        ctx.lineWidth = b.width * widthMul;
        ctx.lineCap = "round";
        ctx.strokeStyle = grad;
        ctx.stroke();
      };

      // 1. GoldenNetwork basal & upward Core filigree sweeps (batched by 6 buckets)
      const sweepIntro = reduceMotion ? 1 : smoothstep(0.02, 0.58, intro);
      const baseSweep = isLight ? 0.42 : 0.34;
      const litSweep = isLight ? 0.62 : 0.52;
      const sweepStrength =
        (baseSweep + (litSweep - baseSweep) * smoothstep(0, 0.45, reveal)) * sweepIntro;
      for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
        strokeBatched(bIdx, sweepStrength, () => {
          for (const sg of sweepGeom) {
            if (sg.bucket !== bIdx) continue;
            ctx.moveTo(sg.p0.x, sg.p0.y);
            ctx.bezierCurveTo(sg.c1.x, sg.c1.y, sg.c2.x, sg.c2.y, sg.pinch.x, sg.pinch.y);
            ctx.bezierCurveTo(sg.d1.x, sg.d1.y, sg.d2.x, sg.d2.y, sg.p3.x, sg.p3.y);
          }
        });
      }

      // Subtle local shimmer on brushed/rippled sweeps only
      if (sweepIntro > 0.5 && sweepGeom.some((sg) => sg.shimmer > 0.04)) {
        strokeBatched(
          0,
          isLight ? 0.52 : 0.62,
          () => {
            for (const sg of sweepGeom) {
              if (sg.shimmer <= 0.04) continue;
              ctx.moveTo(sg.p0.x, sg.p0.y);
              ctx.bezierCurveTo(sg.c1.x, sg.c1.y, sg.c2.x, sg.c2.y, sg.pinch.x, sg.pinch.y);
              ctx.bezierCurveTo(sg.d1.x, sg.d1.y, sg.d2.x, sg.d2.y, sg.p3.x, sg.p3.y);
            }
          },
          1.28,
        );
      }

      // 2. Branch edges + feathered outer tails
      const hasFocus = focusIdx !== null && focusIdx !== undefined;
      const idleBreathGlobal = reduceMotion ? 0 : 0.045 * Math.sin(time * 0.95);
      const ambientEdgeAlpha =
        (hasFocus ? (isLight ? 0.34 : 0.26) : isLight ? 0.56 : 0.48) + idleBreathGlobal;
      const activeEdgeAlpha = isLight ? 1.15 : 1.35;

      const tipSparks: Vec[] = [];

      // Base ambient + live occupied paths (unfurled progressively on first open)
      if (reveal < 0.995) {
        const baseFade = 1 - reveal * 0.35;
        for (const isActivePass of [false, true]) {
          for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
            strokeBatched(
              bIdx,
              (isActivePass ? activeEdgeAlpha : ambientEdgeAlpha) * baseFade,
              () => {
                for (let eIdx = 0; eIdx < lyt.edges.length; eIdx++) {
                  const edge = lyt.edges[eIdx]!;
                  const isAnc = Boolean(focusEdges?.has(eIdx));
                  const isLivePath = cur.occupiedEdgeSet.has(eIdx);
                  const highlighted = isLivePath || isAnc;
                  if (highlighted !== isActivePass) continue;

                  const [t0, t1] = cur.cascade.edgeTiming[eIdx] ?? [0, 0.25];
                  const introFlow = isIntroPlaying ? smoothstep(t0, t1, intro) : 1;
                  if (introFlow <= 0.005) continue;

                  const [lp0, lc1, lc2, lp3] = edgeOutputs[eIdx]!.curve;
                  const wind = reduceMotion ? { x: 0, y: 0 } : sampleWind((lp0.x + lp3.x) * 0.5, (lp0.y + lp3.y) * 0.5, time);
                  if (isIntroPlaying && !isCascading && bIdx === 0 && introFlow > 0.02 && introFlow < 0.985) {
                    tipSparks.push(bezier(lp0, lc1, lc2, lp3, introFlow));
                  }

                  const tierBundle = strands.trunkStrands[edge.tier - 1]!;
                  for (const st of tierBundle) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(lp0, lc1, lc2, lp3, st, wind, time, 1.0);
                    if (introFlow >= 0.995) {
                      ctx.moveTo(lp0.x, lp0.y);
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, lp3.x, lp3.y);
                    } else {
                      const [sp0, sc1, sc2, sp3] = splitBezier(lp0, c1, c2, lp3, introFlow);
                      ctx.moveTo(sp0.x, sp0.y);
                      ctx.bezierCurveTo(sc1.x, sc1.y, sc2.x, sc2.y, sp3.x, sp3.y);
                    }

                    if (introFlow >= 0.96) {
                      const destNode = lyt.nodes[edge.toIndex];
                      const tail3 = destNode ? liveTailTip(destNode) : null;
                      if (destNode && tail3 && Math.abs(st.offsetScale) < 0.08) {
                        const tailFlow = isIntroPlaying
                          ? smoothstep(t1 - 0.02, Math.min(0.99, t1 + 0.13), intro)
                          : 1;
                        if (tailFlow > 0.01) {
                          const tail0 = lp3;
                          const tLen = Math.hypot(tail3.x - tail0.x, tail3.y - tail0.y);
                          const tc1 = add(tail0, polar(tLen * 0.42, destNode.angle + st.offsetScale));
                          const tc2 = add(tail0, polar(tLen * 0.78, destNode.angle - st.offsetScale));
                          if (tailFlow >= 0.995) {
                            ctx.bezierCurveTo(tc1.x, tc1.y, tc2.x, tc2.y, tail3.x, tail3.y);
                          } else {
                            const [tp0, tpc1, tpc2, tp3] = splitBezier(tail0, tc1, tc2, tail3, tailFlow);
                            ctx.moveTo(tp0.x, tp0.y);
                            ctx.bezierCurveTo(tpc1.x, tpc1.y, tpc2.x, tpc2.y, tp3.x, tp3.y);
                          }
                        }
                      }
                    }
                  }
                }
              },
              isActivePass ? 1.12 : 0.92,
            );
          }
        }
      }

      // Strictly local silk sheen pass ONLY on edges brushed by cursor (<56px) or touched by water-ripple crest
      if (!isIntroPlaying && edgeOutputs.some((eo) => eo.shimmer > 0.04)) {
        strokeBatched(
          0,
          isLight ? 0.62 : 0.76,
          () => {
            for (let eIdx = 0; eIdx < lyt.edges.length; eIdx++) {
              const out = edgeOutputs[eIdx]!;
              if (out.shimmer <= 0.04) continue;
              const edge = lyt.edges[eIdx]!;
              const [lp0, lc1, lc2, lp3] = out.curve;
              const wind = reduceMotion ? { x: 0, y: 0 } : sampleWind((lp0.x + lp3.x) * 0.5, (lp0.y + lp3.y) * 0.5, time);
              const st = strands.trunkStrands[edge.tier - 1]![0]!;
              const [c1, c2] = swayControlPoints(lp0, lc1, lc2, lp3, st, wind, time, 1.0);
              ctx.moveTo(lp0.x, lp0.y);
              ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, lp3.x, lp3.y);
            }
          },
          1.38,
        );
      }

      // Progressive golden cascade wave pass (Preview All illumination)
      if (isCascading) {
        const cascadePasses = hasFocus ? [false, true] : [true];
        for (const isFocusPass of cascadePasses) {
          const passAlpha = isFocusPass
            ? hasFocus
              ? isLight
                ? 1.32
                : 1.55
              : isLight
                ? 1.18
                : 1.36
            : isLight
              ? 0.74
              : 0.68;

          for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
            strokeBatched(
              bIdx,
              passAlpha,
              () => {
                for (let eIdx = 0; eIdx < lyt.edges.length; eIdx++) {
                  const edge = lyt.edges[eIdx]!;
                  const isAnc = Boolean(focusEdges?.has(eIdx));
                  const highlighted = !hasFocus || isAnc;
                  if (highlighted !== isFocusPass) continue;

                  const [t0, t1] = cur.cascade.edgeTiming[eIdx] ?? [0, 0.25];
                  const introFlow = isIntroPlaying ? smoothstep(t0, t1, intro) : 1;
                  const edgeFlow = Math.min(introFlow, smoothstep(t0, t1, reveal));
                  if (edgeFlow <= 0.005) continue;

                  const [lp0, lc1, lc2, lp3] = edgeOutputs[eIdx]!.curve;
                  const wind = reduceMotion ? { x: 0, y: 0 } : sampleWind((lp0.x + lp3.x) * 0.5, (lp0.y + lp3.y) * 0.5, time);
                  const isAnimatingEdge = edgeFlow > 0.02 && edgeFlow < 0.985;
                  if (bIdx === 0 && isAnimatingEdge) {
                    tipSparks.push(bezier(lp0, lc1, lc2, lp3, edgeFlow));
                  }

                  const tierBundle = strands.trunkStrands[edge.tier - 1]!;
                  for (const st of tierBundle) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(lp0, lc1, lc2, lp3, st, wind, time, 1.0);
                    if (edgeFlow >= 0.995) {
                      ctx.moveTo(lp0.x, lp0.y);
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, lp3.x, lp3.y);
                    } else {
                      const [sp0, sc1, sc2, sp3] = splitBezier(lp0, c1, c2, lp3, edgeFlow);
                      ctx.moveTo(sp0.x, sp0.y);
                      ctx.bezierCurveTo(sc1.x, sc1.y, sc2.x, sc2.y, sp3.x, sp3.y);
                    }

                    if (edgeFlow >= 0.96) {
                      const destNode = lyt.nodes[edge.toIndex];
                      const tail3 = destNode ? liveTailTip(destNode) : null;
                      if (destNode && tail3 && Math.abs(st.offsetScale) < 0.08) {
                        const effectiveT = isIntroPlaying ? Math.min(intro, reveal) : reveal;
                        const tailFlow = smoothstep(t1 - 0.02, Math.min(0.99, t1 + 0.13), effectiveT);
                        if (tailFlow > 0.01) {
                          const tail0 = lp3;
                          const tLen = Math.hypot(tail3.x - tail0.x, tail3.y - tail0.y);
                          const tc1 = add(tail0, polar(tLen * 0.42, destNode.angle + st.offsetScale));
                          const tc2 = add(tail0, polar(tLen * 0.78, destNode.angle - st.offsetScale));
                          if (tailFlow >= 0.995) {
                            ctx.bezierCurveTo(tc1.x, tc1.y, tc2.x, tc2.y, tail3.x, tail3.y);
                          } else {
                            const [tp0, tpc1, tpc2, tp3] = splitBezier(tail0, tc1, tc2, tail3, tailFlow);
                            ctx.moveTo(tp0.x, tp0.y);
                            ctx.bezierCurveTo(tpc1.x, tpc1.y, tpc2.x, tpc2.y, tp3.x, tp3.y);
                          }
                        }
                      }
                    }
                  }
                }
              },
              isFocusPass ? 1.15 : 0.96,
            );
          }
        }
      }

      // 3. Inter-Node Bridges (latent branch mesh vs live capability links + hover focus + cascade reveal)
      const bridgeIsHighlighted = (b: SynapseBridge) =>
        b.isLive || b.fromIndex === focusIdx || b.toIndex === focusIdx;

      if (reveal < 0.995) {
        const baseFade = 1 - reveal * 0.35;
        for (const isHigh of [false, true]) {
          const bridgeAlpha =
            (isHigh ? (isLight ? 1.25 : 1.45) : hasFocus ? 0.14 : isLight ? 0.24 : 0.2) * baseFade;

          for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
            strokeBatched(
              bIdx,
              bridgeAlpha,
              () => {
                for (let brIdx = 0; brIdx < lyt.bridges.length; brIdx++) {
                  const br = lyt.bridges[brIdx]!;
                  if (bridgeIsHighlighted(br) !== isHigh) continue;
                  const [b0, b1] = cur.cascade.bridgeTiming[brIdx] ?? [0.4, 0.7];
                  const introBridge = isIntroPlaying ? smoothstep(b0, b1, intro) : 1;
                  if (introBridge <= 0.005) continue;

                  const [bp0, bc1, bc2, bp3] = bridgeOutputs[brIdx]!.curve;
                  const wind = reduceMotion ? { x: 0, y: 0 } : sampleWind((bp0.x + bp3.x) * 0.5, (bp0.y + bp3.y) * 0.5, time);
                  const list = br.isLive ? strands.bridgeStrands.slice(0, 5) : strands.bridgeStrands.slice(0, 2);
                  for (const st of list) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(bp0, bc1, bc2, bp3, st, wind, time, 0.85);
                    if (introBridge >= 0.995) {
                      ctx.moveTo(bp0.x, bp0.y);
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, bp3.x, bp3.y);
                    } else {
                      const [sp0, sc1, sc2, sp3] = splitBezier(bp0, c1, c2, bp3, introBridge);
                      ctx.moveTo(sp0.x, sp0.y);
                      ctx.bezierCurveTo(sc1.x, sc1.y, sc2.x, sc2.y, sp3.x, sp3.y);
                    }
                  }
                }
              },
              isHigh ? 1.12 : 0.8,
            );
          }
        }
      }

      // Strictly local silk shimmer pass on brushed/rippled bridges
      if (!isIntroPlaying && bridgeOutputs.some((bo) => bo.shimmer > 0.04)) {
        strokeBatched(
          0,
          isLight ? 0.58 : 0.72,
          () => {
            for (let brIdx = 0; brIdx < lyt.bridges.length; brIdx++) {
              const out = bridgeOutputs[brIdx]!;
              if (out.shimmer <= 0.04) continue;
              const [bp0, bc1, bc2, bp3] = out.curve;
              const wind = reduceMotion ? { x: 0, y: 0 } : sampleWind((bp0.x + bp3.x) * 0.5, (bp0.y + bp3.y) * 0.5, time);
              const st = strands.bridgeStrands[0]!;
              const [c1, c2] = swayControlPoints(bp0, bc1, bc2, bp3, st, wind, time, 0.85);
              ctx.moveTo(bp0.x, bp0.y);
              ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, bp3.x, bp3.y);
            }
          },
          1.34,
        );
      }

      if (isCascading) {
        for (const isHigh of [false, true]) {
          const bridgeAlpha = isHigh
            ? isLight
              ? 1.28
              : 1.48
            : hasFocus
              ? isLight
                ? 0.62
                : 0.66
              : isLight
                ? 0.92
                : 1.05;

          for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
            strokeBatched(
              bIdx,
              bridgeAlpha,
              () => {
                for (let brIdx = 0; brIdx < lyt.bridges.length; brIdx++) {
                  const br = lyt.bridges[brIdx]!;
                  if (bridgeIsHighlighted(br) !== isHigh) continue;
                  const [b0, b1] = cur.cascade.bridgeTiming[brIdx] ?? [0.4, 0.7];
                  const introBridge = isIntroPlaying ? smoothstep(b0, b1, intro) : 1;
                  const bridgeFlow = Math.min(introBridge, smoothstep(b0, b1, reveal));
                  if (bridgeFlow <= 0.005) continue;

                  const [bp0, bc1, bc2, bp3] = bridgeOutputs[brIdx]!.curve;
                  const wind = reduceMotion ? { x: 0, y: 0 } : sampleWind((bp0.x + bp3.x) * 0.5, (bp0.y + bp3.y) * 0.5, time);
                  if (bIdx === 0 && bridgeFlow > 0.02 && bridgeFlow < 0.985) {
                    tipSparks.push(bezier(bp0, bc1, bc2, bp3, bridgeFlow));
                  }

                  const list = strands.bridgeStrands.slice(0, br.isLive ? 5 : 3);
                  for (const st of list) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(bp0, bc1, bc2, bp3, st, wind, time, 0.85);
                    if (bridgeFlow >= 0.995) {
                      ctx.moveTo(bp0.x, bp0.y);
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, bp3.x, bp3.y);
                    } else {
                      const [sp0, sc1, sc2, sp3] = splitBezier(bp0, c1, c2, bp3, bridgeFlow);
                      ctx.moveTo(sp0.x, sp0.y);
                      ctx.bezierCurveTo(sc1.x, sc1.y, sc2.x, sc2.y, sp3.x, sp3.y);
                    }
                  }
                }
              },
              1.12,
            );
          }
        }
      }

      // Glowing molten-gold leading sparks racing at the advancing wavefront along active branches & bridges
      if (tipSparks.length > 0) {
        ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
        for (const spark of tipSparks) {
          ctx.globalAlpha = 0.92;
          radialGlow(ctx, spark, 12, [
            [0, isLight ? "rgba(255, 248, 212, 0.95)" : "rgba(255, 250, 232, 0.98)"],
            [0.38, isLight ? "rgba(228, 162, 22, 0.55)" : "rgba(248, 194, 72, 0.55)"],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
          ctx.fillStyle = isLight ? "#c8820a" : "#fff9e2";
          ctx.beginPath();
          ctx.arc(spark.x, spark.y, 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Wind-drifting Golden Micro-Dust & Tapered Energy Streaks
      if (lyt.edges.length > 0) {
        ctx.fillStyle = isLight ? "rgb(212, 146, 16)" : "rgb(255, 214, 140)";
        for (const d of strands.dust) {
          const eIdx = d.edgeIdx % lyt.edges.length;
          const [t0, t1] = cur.cascade.edgeTiming[eIdx] ?? [0, 0.25];
          const introEdge = isIntroPlaying ? smoothstep(t0, t1, intro) : 1;
          if (introEdge < d.t) continue;
          const [lp0, lc1, lc2, lp3] = edgeOutputs[eIdx]!.curve;
          const pt = bezier(lp0, lc1, lc2, lp3, d.t);
          const twinkle = 0.45 + 0.55 * Math.sin(time * 1.4 + d.phase);
          const w = reduceMotion ? { x: 0, y: 0 } : sampleWind(pt.x, pt.y, time);
          const driftX = reduceMotion ? 0 : w.x * 4.4;
          const driftY = reduceMotion ? 0 : w.y * 3.8;
          const edgeFlow = isCascading ? smoothstep(t0, t1, reveal) : 0;
          const cascadeBoost = isCascading && d.t <= edgeFlow ? edgeFlow : 0;
          const activeBoost =
            cur.occupiedEdgeSet.has(eIdx) || cascadeBoost > 0.35
              ? Math.max(cur.occupiedEdgeSet.has(eIdx) ? 1.12 : 0.65, 0.65 + cascadeBoost * 0.48)
              : 0.65;
          ctx.globalAlpha = d.alpha * twinkle * activeBoost * (isLight ? 0.68 : 0.9);
          ctx.fillRect(pt.x + d.ox + driftX, pt.y + d.oy + driftY, d.size, d.size);
        }
      }

      ctx.strokeStyle = isLight ? "rgba(198, 128, 10, 0.72)" : "rgba(255, 236, 184, 0.78)";
      ctx.fillStyle = isLight ? "rgb(198, 128, 10)" : "rgb(255, 244, 214)";
      const speedMul = 0.88 + cur.energy * 1.4;
      for (const bead of strands.beads) {
        const rawU = (bead.u + time * bead.speed * speedMul * bead.dir) % 1;
        const beadU = rawU < 0 ? rawU + 1 : rawU;
        const tailU = clamp(beadU - 0.032 * bead.dir, 0, 1);
        let pos: Vec | null = null;
        let tailPos: Vec | null = null;
        let flowGate = 1;
        if (bead.kind === "bridge" && lyt.bridges.length > 0) {
          const liveBridges = lyt.bridges.filter((b) => b.isLive);
          const useAllBridges = reveal > 0.45;
          const pool = !useAllBridges && liveBridges.length > 0 && bead.idx % 2 === 0 ? liveBridges : lyt.bridges;
          const chosenIdx = bead.idx % pool.length;
          const br = pool[chosenIdx]!;
          const origIdx = lyt.bridges.indexOf(br);
          const [b0, b1] = cur.cascade.bridgeTiming[origIdx] ?? [0.4, 0.7];
          const introGate = isIntroPlaying ? smoothstep(b0, b1, intro) : 1;
          flowGate =
            isCascading && !br.isLive
              ? Math.min(introGate, smoothstep(b0, b1, reveal))
              : introGate;
          const [bp0, bc1, bc2, bp3] = bridgeOutputs[origIdx]!.curve;
          pos = bezier(bp0, bc1, bc2, bp3, beadU);
          tailPos = bezier(bp0, bc1, bc2, bp3, tailU);
        } else if (lyt.edges.length > 0) {
          const liveIdxList = Array.from(cur.occupiedEdgeSet);
          const useAllEdges = reveal > 0.25;
          const eIdx =
            !useAllEdges && liveIdxList.length > 0 && bead.idx % 3 !== 0
              ? liveIdxList[bead.idx % liveIdxList.length]!
              : bead.idx % lyt.edges.length;
          const [t0, t1] = cur.cascade.edgeTiming[eIdx] ?? [0, 0.25];
          const introGate = isIntroPlaying ? smoothstep(t0, t1, intro) : 1;
          flowGate =
            isCascading && !cur.occupiedEdgeSet.has(eIdx)
              ? Math.min(introGate, smoothstep(t0, t1, reveal))
              : introGate;
          const [lp0, lc1, lc2, lp3] = edgeOutputs[eIdx]!.curve;
          pos = bezier(lp0, lc1, lc2, lp3, beadU);
          tailPos = bezier(lp0, lc1, lc2, lp3, tailU);
        }
        if (!pos || flowGate <= 0.05) continue;
        const baseBeadAlpha =
          bead.alpha * flowGate * (reveal > 0.5 ? (isLight ? 0.86 : 0.96) : isLight ? 0.78 : 0.92);
        if (tailPos && !reduceMotion) {
          ctx.globalAlpha = baseBeadAlpha * 0.45;
          ctx.lineWidth = Math.max(0.75, bead.size * 0.75);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(tailPos.x, tailPos.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
        ctx.globalAlpha = baseBeadAlpha;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, bead.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Snap, Hover, Core Resonance & Transfer Comets gliding across branches
      if (cometsRef.current.length > 0) {
        const remaining: CometPulse[] = [];
        for (const comet of cometsRef.current) {
          comet.progress += dt > 0 ? dt / comet.duration : 0;
          if (comet.progress >= 1) {
            if (comet.bloomOnArrive && comet.targetIdx >= 0) {
              flashArr[comet.targetIdx] = 1.0;
              const arrPos = liveNodes[comet.targetIdx] ?? lyt.nodes[comet.targetIdx]?.pos;
              if (arrPos) {
                if (ripplesRef.current.length >= 8) ripplesRef.current.shift();
                ripplesRef.current.push({
                  x: arrPos.x,
                  y: arrPos.y,
                  progress: 0,
                  duration: 0.92,
                  maxRadius: 56,
                  strength: 1,
                  doubleRing: true,
                });
              }
            }
            continue;
          }
          remaining.push(comet);
          const inten = comet.intensity ?? 1;
          const env = Math.sin(Math.PI * comet.progress) * inten;
          const head = pointOnPath(comet.segments, comet.progress);

          ctx.globalAlpha = clamp(env * 0.95, 0, 1);
          radialGlow(ctx, head, 18 * (0.7 + 0.3 * inten), [
            [0, isLight ? "rgba(198, 128, 10, 0.95)" : "rgba(255, 250, 232, 0.98)"],
            [0.35, "rgba(240, 181, 74, 0.55)"],
            [1, "rgba(240, 181, 74, 0)"],
          ]);
          for (let t = 1; t <= 4; t++) {
            const tu = clamp(comet.progress - t * 0.032, 0, 1);
            const tp = pointOnPath(comet.segments, tu);
            ctx.globalAlpha = clamp(env * (0.7 - t * 0.14), 0, 1);
            ctx.fillStyle = isLight ? "#c88d18" : "#fff7e0";
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, (2.8 - t * 0.45) * (0.72 + 0.28 * inten), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        cometsRef.current = remaining;
      }

      // 6. Expanding Golden Water-Drop & Node Resonance Ripples
      if (ripplesRef.current.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
        for (const rp of ripplesRef.current) {
          const easeT = 1 - Math.pow(1 - clamp(rp.progress, 0, 1), 2.2);
          const fade = Math.pow(1 - clamp(rp.progress, 0, 1), 1.4) * rp.strength;
          if (fade <= 0.01) continue;
          const radius = 6 + rp.maxRadius * easeT;
          ctx.globalAlpha = fade * (isLight ? 0.58 : 0.72);
          ctx.lineWidth = Math.max(0.8, 1.55 * (1 - rp.progress * 0.6));
          ctx.strokeStyle = isLight ? "rgba(192, 124, 12, 0.85)" : "rgba(255, 224, 146, 0.9)";
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
          ctx.stroke();

          if (rp.doubleRing && rp.progress > 0.12) {
            const r2 = Math.max(4, radius * 0.68);
            ctx.globalAlpha = fade * (isLight ? 0.4 : 0.48);
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, r2, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 7. Central Fluid Golden Singularity Orb + opening & showcase wave rings
      ctx.globalAlpha = 1;
      const coreCursorDist = Math.hypot(ptrSmooth.x - liveCore.x, ptrSmooth.y - liveCore.y);
      const cursorOffset: Vec =
        ptrPresence > 0.01 && coreCursorDist < 85
          ? {
              x: clamp((ptrSmooth.x - liveCore.x) / 85, -1, 1) * ptrPresence * (1 - coreCursorDist / 85),
              y: clamp((ptrSmooth.y - liveCore.y) / 85, -1, 1) * ptrPresence * (1 - coreCursorDist / 85),
            }
          : { x: 0, y: 0 };
      const coreIntroScale = reduceMotion ? 1 : 0.55 + 0.45 * smoothstep(0, 0.34, intro);
      drawGoldenFluidCore(
        ctx,
        liveCore,
        lyt.compact ? 15.5 : 19,
        time,
        cur.energy,
        ignitionPulse,
        isLight,
        cursorOffset,
        coreIntroScale,
      );

      if (isIntroPlaying && intro > 0.02 && intro < 0.68 && !reduceMotion) {
        const wT = smoothstep(0.02, 0.68, intro);
        const wR = 16 + S * 0.48 * wT;
        ctx.save();
        ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
        ctx.globalAlpha = (1 - wT) * 0.42;
        ctx.beginPath();
        ctx.arc(liveCore.x, liveCore.y, wR, 0, Math.PI * 2);
        ctx.lineWidth = 1.35 * (1 - wT * 0.5);
        ctx.strokeStyle = isLight ? "rgba(202, 134, 14, 0.85)" : "rgba(255, 224, 136, 0.9)";
        ctx.stroke();
        ctx.restore();
      }

      if (cur.showcaseAll && reveal > 0.01 && reveal < 0.58) {
        const waveT = smoothstep(0.01, 0.58, reveal);
        const waveR = 18 + S * 0.62 * waveT;
        ctx.save();
        ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
        ctx.globalAlpha = (1 - waveT) * 0.48;
        ctx.beginPath();
        ctx.arc(liveCore.x, liveCore.y, waveR, 0, Math.PI * 2);
        ctx.lineWidth = 1.6 * (1 - waveT * 0.55);
        ctx.strokeStyle = isLight ? "rgba(202, 134, 14, 0.85)" : "rgba(255, 224, 136, 0.9)";
        ctx.stroke();
        ctx.restore();
      }

      // 8. Uncluttered 50 Node Jewels with smooth hover springs, press bounce & entrance bloom
      const goldHex = isLight ? "#b4780d" : "#f0b54a";
      const dormantInk = isLight ? "rgba(110, 92, 54, 0.55)" : "rgba(218, 198, 152, 0.52)";

      for (let i = 0; i < lyt.nodes.length; i++) {
        const bNode = lyt.nodes[i]!;
        const livePos = liveNodes[i] ?? bNode.pos;
        const meta = cur.nodes[i] ?? {
          status: "locked" as const,
          monogram: "",
          name: `Slot ${i + 1}`,
        };
        const isOcc = meta.status === "occupied";
        const isOpen = meta.status === "open";
        const isHov = cur.hoveredIdx === i;
        const isAct = cur.activeNodeIndex === i;
        const isPeer = Boolean(focusPeers?.has(i));
        const emphasized = isOcc || isHov || isAct || isPeer;

        const arrival = cur.cascade.nodeArrival[i] ?? 0.5;
        const nodeIntro = reduceMotion ? 1 : smoothstep(arrival - 0.045, arrival + 0.09, intro);
        if (nodeIntro <= 0.01) continue;

        const hoverSpring = hoverArr[i] ?? 0;
        const pressSpring = pressArr[i] ?? 0;
        const flash = flashArr[i] ?? 0;
        const idleBreath = breathBoostFor(arrival);
        const introElastic =
          0.42 + 0.58 * nodeIntro + (isIntroPlaying && nodeIntro < 0.99 ? 0.14 * Math.sin(nodeIntro * Math.PI) : 0);
        const tactileScale = introElastic * (1 - pressSpring * 0.12 + flash * 0.15 + hoverSpring * 0.14);

        const nodeLit = isCascading
          ? Math.min(nodeIntro, smoothstep(arrival - 0.035, arrival + 0.085, reveal))
          : 0;

        // Draw underlying occupied / open / dormant node
        if (nodeLit < 0.98) {
          ctx.globalAlpha = (1 - nodeLit) * nodeIntro;
          if (isOcc) {
            const baseR = bNode.tier === 1 ? (lyt.compact ? 11 : 13) : lyt.compact ? 9.5 : 11;
            const r = baseR * tactileScale;
            radialGlow(
              ctx,
              livePos,
              r * (2.1 + hoverSpring * 0.7 + flash * 0.9 + idleBreath * 1.4),
              [
                [0, isLight ? "rgba(248, 192, 46, 0.36)" : "rgba(240, 181, 74, 0.4)"],
                [1, "rgba(0, 0, 0, 0)"],
              ],
            );

            if (hoverSpring > 0.08 || isAct || isPeer) {
              ctx.beginPath();
              ctx.arc(livePos.x, livePos.y, r + 4.5, 0, Math.PI * 2);
              ctx.strokeStyle = isLight ? "rgba(180, 120, 13, 0.48)" : "rgba(255, 224, 152, 0.55)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            if (hoverSpring > 0.15 && !reduceMotion) {
              const arcStart = time * 1.15 + i * 0.6;
              ctx.beginPath();
              ctx.arc(livePos.x, livePos.y, r + 7.2, arcStart, arcStart + Math.PI * 0.7);
              ctx.strokeStyle = isLight ? "rgba(180, 120, 13, 0.42)" : "rgba(240, 181, 74, 0.52)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(livePos.x, livePos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.94)" : "rgba(11, 11, 16, 0.92)";
            ctx.fill();
            ctx.lineWidth = isHov || isAct ? 1.7 : 1.35 + flash * 0.5;
            ctx.strokeStyle = goldHex;
            ctx.stroke();

            if (meta.monogram) {
              ctx.fillStyle = isLight ? "#14151a" : "#f5f5f7";
              ctx.font = `600 ${bNode.tier === 1 ? 10 : 9}px var(--font-sans, sans-serif)`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(meta.monogram.slice(0, 2), livePos.x, livePos.y + 0.5);
            }
          } else if (isOpen) {
            const r = (6.2 + hoverSpring * 2.2) * tactileScale;
            if (hoverSpring > 0.08 || flash > 0.05) {
              radialGlow(ctx, livePos, r * (2.6 + flash), [
                [0, isLight ? "rgba(248, 192, 46, 0.24)" : "rgba(240, 181, 74, 0.28)"],
                [1, "rgba(0, 0, 0, 0)"],
              ]);
            }
            ctx.beginPath();
            ctx.arc(livePos.x, livePos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? "rgba(255, 252, 244, 0.92)" : "rgba(12, 12, 16, 0.86)";
            ctx.fill();
            ctx.lineWidth = isHov || isAct ? 1.45 : 1.1;
            ctx.strokeStyle =
              isHov || isPeer ? goldHex : isLight ? "rgba(180, 120, 13, 0.65)" : "rgba(240, 181, 74, 0.62)";
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(livePos.x, livePos.y, 1.8 * tactileScale, 0, Math.PI * 2);
            ctx.fillStyle = goldHex;
            ctx.fill();
          } else {
            const baseDormant = bNode.tier === 1 ? 4.2 : bNode.tier === 2 ? 3.5 : 2.9;
            const r = (baseDormant + hoverSpring * 2.3) * tactileScale;
            if (emphasized || flash > 0.05) {
              ctx.beginPath();
              ctx.arc(livePos.x, livePos.y, r + 4, 0, Math.PI * 2);
              ctx.strokeStyle = isLight ? "rgba(180, 120, 13, 0.35)" : "rgba(240, 181, 74, 0.38)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(livePos.x, livePos.y, r, 0, Math.PI * 2);
            ctx.fillStyle =
              isHov || isAct || flash > 0.35
                ? goldHex
                : isPeer
                  ? isLight
                    ? "rgba(210, 148, 22, 0.85)"
                    : "rgba(240, 181, 74, 0.85)"
                  : isLight
                    ? "rgba(255, 252, 244, 0.9)"
                    : "rgba(14, 14, 19, 0.88)";
            ctx.fill();
            ctx.lineWidth = isHov || isAct ? 1.4 : 1.05;
            ctx.strokeStyle = isHov || isPeer ? goldHex : dormantInk;
            ctx.stroke();
          }
        }

        // Illuminated golden preview dot + localized ignition ripple ring as the wave reaches this node
        if (nodeLit > 0.01) {
          const baseR =
            bNode.tier === 1
              ? isHov || isAct
                ? 7.8
                : 5.8
              : bNode.tier === 2
                ? isHov || isAct
                  ? 6.8
                  : 4.8
                : isHov || isAct
                  ? 6.0
                  : 3.9;
          const bloom = 1 + 0.32 * Math.sin(nodeLit * Math.PI);
          const r =
            baseR *
            (0.58 + 0.42 * nodeLit) *
            bloom *
            (1 - pressSpring * 0.12 + flash * 0.15 + hoverSpring * 0.1);

          ctx.globalAlpha = nodeLit;
          radialGlow(
            ctx,
            livePos,
            r * (2.6 + hoverSpring * 1.1 + flash * 1.0 + idleBreath * 1.8),
            [
              [0, isLight ? "rgba(248, 186, 36, 0.44)" : "rgba(255, 224, 130, 0.48)"],
              [1, "rgba(0, 0, 0, 0)"],
            ],
          );

          if (nodeLit < 0.99) {
            ctx.save();
            ctx.globalAlpha = (1 - nodeLit) * 0.78;
            ctx.beginPath();
            ctx.arc(livePos.x, livePos.y, baseR + 3 + nodeLit * 13, 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? "rgba(180, 118, 12, 0.85)" : "rgba(255, 232, 166, 0.9)";
            ctx.lineWidth = 1.15;
            ctx.stroke();
            ctx.restore();
          }

          if (isHov || isAct || isPeer) {
            ctx.beginPath();
            ctx.arc(livePos.x, livePos.y, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? "rgba(154, 105, 16, 0.55)" : "rgba(255, 232, 166, 0.65)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(livePos.x, livePos.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isLight
            ? isHov || isAct
              ? "#f5c23b"
              : "#e5a817"
            : isHov || isAct
              ? "#fff7e0"
              : "#ffe6a3";
          ctx.fill();
          ctx.lineWidth = isHov || isAct ? 1.6 : 1.15;
          ctx.strokeStyle = isLight ? "#9a6910" : "#f0b54a";
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduceMotionRef.current = reduceMotion;
    if (reduceMotion) introProgressRef.current = 1;
    let frame = 0;
    let last = 0;
    let active = !paused;

    const resize = () => {
      fitCanvas(canvas, ctx);
      drawFrameRef.current(ctx, elapsedRef.current, 0);
    };

    const tick = (now: number) => {
      if (!active || stateRef.current.paused || reduceMotion) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsedRef.current += dt;
      drawFrameRef.current(ctx, elapsedRef.current, dt);
      frame = requestAnimationFrame(tick);
    };

    const stopVis = observeCanvasActivity(canvas, (isVisible) => {
      active = isVisible && !stateRef.current.paused;
      if (active && !reduceMotion && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(tick);
      } else if (!active && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    if (!reduceMotion && active && frame === 0) {
      frame = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frame);
      stopVis();
      ro.disconnect();
    };
  }, [paused]);

  // Redraw immediately when reduced-motion is set and layout/theme/hover/preview changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reduceMotionRef.current = true;
      introProgressRef.current = 1;
      revealProgressRef.current = showcaseAll ? 1 : 0;
    }
    fitCanvas(canvas, ctx);
    drawFrameRef.current(ctx, elapsedRef.current, 0);
  }, [layout, theme, hoveredIdx, activeNodeIndex, nodes, showcaseAll]);

  const hitTest = (clientX: number, clientY: number): number | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let bestIdx: number | null = null;
    let bestDist = layout.compact ? 22 : 20;
    for (let i = 0; i < layout.nodes.length; i++) {
      const pt = liveNodesRef.current[i] ?? layout.nodes[i]!.pos;
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const isNearCore = (x: number, y: number): boolean => {
    const corePt = liveCoreRef.current ?? layout.core;
    return Math.hypot(corePt.x - x, corePt.y - y) <= (layout.compact ? 28 : 34);
  };

  const handlePointerMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!pointerActiveRef.current) {
        pointerSmoothRef.current = { x, y };
        pointerTargetRef.current = { x, y };
        ptrVelRef.current = { x: 0, y: 0 };
      } else {
        const dx = clamp((x - pointerTargetRef.current.x) * 1.6, -24, 24);
        const dy = clamp((y - pointerTargetRef.current.y) * 1.6, -24, 24);
        ptrVelRef.current = {
          x: clamp(ptrVelRef.current.x * 0.45 + dx * 0.65, -20, 20),
          y: clamp(ptrVelRef.current.y * 0.45 + dy * 0.65, -20, 20),
        };
        pointerTargetRef.current = { x, y };
      }
      pointerActiveRef.current = true;
      const hitCore = isNearCore(x, y);
      if (hitCore !== overCore) setOverCore(hitCore);
    }

    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== hoveredIdx) {
      setHoveredIdx(hit);
      onHoverNode?.(hit);
      if (hit !== null && !reduceMotionRef.current) {
        const nowMs = performance.now();
        if (nowMs - lastHoverSparkAtRef.current > 240) {
          lastHoverSparkAtRef.current = nowMs;
          const outward = forwardSegmentsFromCore(layout, hit);
          if (outward.length > 0) {
            enqueueComet({
              segments: outward,
              targetIdx: hit,
              progress: 0,
              duration: 0.68,
              intensity: 0.52,
            });
          }
        }
      }
    }
  };

  const handlePointerLeave = () => {
    pointerActiveRef.current = false;
    ptrVelRef.current = { x: 0, y: 0 };
    pressedNodeIdxRef.current = null;
    if (overCore) setOverCore(false);
    if (hoveredIdx !== null) {
      setHoveredIdx(null);
      onHoverNode?.(null);
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    pressedNodeIdxRef.current = hit;
    if (hit !== null) {
      nodePressRef.current[hit] = 1;
    }
  };

  const handlePointerUp = () => {
    pressedNodeIdxRef.current = null;
  };

  const handleCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTest(e.clientX, e.clientY);

    if (hit !== null) {
      const hitPt = liveNodesRef.current[hit] ?? layout.nodes[hit]!.pos;
      nodeFlashRef.current[hit] = 1.0;
      enqueueRipple({
        x: hitPt.x,
        y: hitPt.y,
        progress: 0,
        duration: 0.82,
        maxRadius: 52,
        strength: 0.95,
        doubleRing: nodes[hit]?.status === "occupied",
      });
      enqueueImpulse({
        x: hitPt.x,
        y: hitPt.y,
        progress: 0,
        duration: 0.68,
        maxRadius: 105,
        amplitude: 5.5,
      });
      const outward = forwardSegmentsFromCore(layout, hit);
      if (outward.length > 0) {
        enqueueComet({
          segments: outward,
          targetIdx: hit,
          progress: 0,
          duration: 0.72,
          intensity: 0.88,
        });
      }
      // Subtle fan out along up to 2 connected bridges on click
      const bridgesFromHit = layout.bridges.filter(
        (b) => (b.fromIndex === hit || b.toIndex === hit) && b.isLive,
      );
      for (const br of bridgesFromHit.slice(0, 2)) {
        const seg =
          br.fromIndex === hit
            ? [[br.p0, br.c1, br.c2, br.p3]]
            : [[br.p3, br.c2, br.c1, br.p0]];
        enqueueComet({
          segments: seg,
          targetIdx: br.fromIndex === hit ? br.toIndex : br.fromIndex,
          progress: 0,
          duration: 0.78,
          intensity: 0.64,
        });
      }
      onSelectNode?.(hit);
      return;
    }

    if (isNearCore(x, y)) {
      const corePt = liveCoreRef.current ?? layout.core;
      corePulseRef.current = 1.0;
      enqueueRipple({
        x: corePt.x,
        y: corePt.y,
        progress: 0,
        duration: 0.96,
        maxRadius: layout.compact ? 140 : 185,
        strength: 0.92,
        doubleRing: true,
      });
      enqueueImpulse({
        x: corePt.x,
        y: corePt.y,
        progress: 0,
        duration: 0.82,
        maxRadius: 155,
        amplitude: 6.0,
      });
      for (let t = 0; t < Math.min(5, layout.nodes.length); t++) {
        const seg = forwardSegmentsFromCore(layout, t);
        if (seg.length > 0) {
          enqueueComet({
            segments: seg,
            targetIdx: t,
            progress: 0,
            duration: 0.88,
            intensity: 0.65,
          });
        }
      }
      return;
    }

    // Empty space subtle water-drop ripple affecting strictly nearby filaments
    enqueueRipple({
      x,
      y,
      progress: 0,
      duration: 0.74,
      maxRadius: 84,
      strength: 0.64,
    });
    enqueueImpulse({
      x,
      y,
      progress: 0,
      duration: 0.72,
      maxRadius: 115,
      amplitude: 6.5,
    });
  };

  // Single floating Liquid Glass tooltip for whichever node is hovered
  const hoveredNode = hoveredIdx !== null ? layout.nodes[hoveredIdx] : null;
  const hoveredMeta = hoveredIdx !== null ? nodes[hoveredIdx] : null;
  const hoveredLivePeers = hoveredIdx !== null ? bridgeChannelsByNode.get(hoveredIdx) ?? [] : [];
  const hoveredMeshCount = hoveredIdx !== null ? layout.adjacency.get(hoveredIdx)?.size ?? 0 : 0;

  let tooltipDetail = "";
  if (hoveredMeta) {
    if (hoveredMeta.status === "occupied") {
      if (hoveredLivePeers.length > 0) {
        const names = hoveredLivePeers
          .slice(0, 2)
          .map((p) => nodes[p.peerIndex]?.name ?? "Node")
          .join(", ");
        tooltipDetail = `Linked · ${names}`;
      } else {
        tooltipDetail = hoveredMeta.tierLabel ?? "Wired to Core";
      }
    } else if (hoveredMeta.status === "open") {
      tooltipDetail = `Open free slot · ${hoveredMeshCount} branch links`;
    } else {
      tooltipDetail = `Branch slot · ${hoveredMeshCount} mesh links`;
    }
  }

  // Accessible keyboard targets strictly for live/first-open slots (or crown dots in showcase mode)
  const firstOpenIdx = nodes.findIndex((n) => n.status === "open");
  const keyboardIndices: number[] = [];
  if (showcaseAll) {
    for (let i = 0; i < Math.min(5, nodes.length); i++) {
      keyboardIndices.push(i);
    }
  } else {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]?.status === "occupied" || i === firstOpenIdx) {
        keyboardIndices.push(i);
      }
    }
  }

  const isLight = theme === "light";

  return (
    <div
      ref={containerRef}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleCanvasClick}
      className={`relative h-full w-full select-none overflow-hidden ${
        hoveredIdx !== null || overCore ? "cursor-pointer" : "cursor-default"
      } ${className}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />

      {/* Keyboard-accessible anchors strictly for live/first-open slots (no visual clutter) */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {keyboardIndices.map((idx) => {
          const bNode = layout.nodes[idx];
          const meta = nodes[idx];
          if (!bNode || !meta) return null;
          return (
            <button
              key={idx}
              type="button"
              onFocus={() => {
                setHoveredIdx(idx);
                onHoverNode?.(idx);
              }}
              onBlur={() => {
                setHoveredIdx((cur) => (cur === idx ? null : cur));
                onHoverNode?.(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode?.(idx);
              }}
              aria-label={
                showcaseAll
                  ? `Network node ${idx + 1}`
                  : meta.status === "occupied"
                    ? `${meta.name} node`
                    : `Open extension slot ${idx + 1}`
              }
              className="pointer-events-auto absolute top-0 left-0 h-8 w-8 rounded-full bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--land-gold)]"
              style={{
                transform: `translate3d(${bNode.pos.x - 16}px, ${bNode.pos.y - 16}px, 0)`,
              }}
            />
          );
        })}
      </div>

      {/* Single Floating Liquid Glass Inspection Pill (disabled in landing showcase mode so zero names appear) */}
      {!showcaseAll && hoveredNode && hoveredMeta ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none absolute z-30 flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-xl transition-opacity duration-150 ${
            isLight
              ? "border-[#0e0f12]/[0.12] bg-white/92 text-[#0e0f12] shadow-[0_8px_24px_-8px_rgba(14,15,18,0.16)]"
              : "border-white/[0.14] bg-[#101116]/90 text-[#f5f5f7] shadow-[0_10px_28px_-8px_rgba(0,0,0,0.75)]"
          }`}
          style={{
            left: `${clamp(
              hoveredNode.pos.x,
              hoveredNode.pos.x < layout.core.x - 16 ? 210 : 120,
              Math.max(220, layout.width - (hoveredNode.pos.x > layout.core.x + 16 ? 210 : 120)),
            )}px`,
            top: `${hoveredNode.pos.y > 76 ? hoveredNode.pos.y - 26 : hoveredNode.pos.y + 26}px`,
            transform: `translate(${
              hoveredNode.pos.x < layout.core.x - 16
                ? "-84%"
                : hoveredNode.pos.x > layout.core.x + 16
                  ? "-16%"
                  : "-50%"
            }, ${hoveredNode.pos.y > 76 ? "-100%" : "0"})`,
          }}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              hoveredMeta.status === "occupied"
                ? "bg-[#f0b54a]"
                : hoveredMeta.status === "open"
                  ? isLight
                    ? "bg-[#0e0f12]/55"
                    : "bg-white/60"
                  : isLight
                    ? "bg-[#0e0f12]/25"
                    : "bg-white/25"
            }`}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap text-[12px] font-medium">
            {hoveredMeta.status === "occupied" ? hoveredMeta.name : hoveredMeta.status === "open" ? "Open slot" : "Branch node"}
          </span>
          <span
            className={`whitespace-nowrap text-[11px] ${
              isLight ? "text-[#575b66]" : "text-[#9d9da6]"
            }`}
          >
            · {tooltipDetail}
          </span>
        </div>
      ) : null}
    </div>
  );
}
