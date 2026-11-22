"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
};

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
  time: number,
  ampScale: number,
): [Vec, Vec] {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.max(12, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const wave = Math.sin(time * 0.45 + strand.phase) * strand.sway;
  const shift1 = (strand.offsetScale + wave * 0.045) * len * ampScale;
  const shift2 = (strand.offsetScale * 0.65 - wave * 0.035) * len * ampScale;
  return [
    { x: c1.x + nx * shift1, y: c1.y + ny * shift1 },
    { x: c2.x + nx * shift2, y: c2.y + ny * shift2 },
  ];
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
) {
  ctx.save();
  const R = baseR * (1 + ignitionPulse * 0.18 + 0.025 * Math.sin(time * 1.8));
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

  const fx = core.x - R * 0.22 + Math.cos(time * 0.72) * R * 0.13;
  const fy = core.y - R * 0.24 + Math.sin(time * 0.64) * R * 0.13;
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
  const revealProgressRef = useRef<number>(showcaseAll ? 1 : 0);
  const reduceMotionRef = useRef(false);
  const elapsedRef = useRef(0);
  const lastSnapSerialRef = useRef<number>(snap?.serial ?? 0);
  const lastTransferSerialRef = useRef<number>(transfer?.serial ?? 0);

  const stateRef = useRef({
    theme,
    nodes,
    links,
    energy,
    activeNodeIndex,
    hoveredIdx,
    paused,
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
      showcaseAll,
      layout,
      cascade,
      occupiedEdgeSet,
      occupiedNodeSet,
    };
  });

  useEffect(() => {
    if (snap && snap.serial !== lastSnapSerialRef.current) {
      lastSnapSerialRef.current = snap.serial;
      const outward = forwardSegmentsFromCore(layout, snap.index);
      if (outward.length > 0) {
        cometsRef.current.push({
          segments: outward,
          targetIdx: snap.index,
          progress: 0,
          duration: 0.85,
        });
      }
    }
  }, [snap, layout]);

  useEffect(() => {
    if (transfer && transfer.serial !== lastTransferSerialRef.current) {
      lastTransferSerialRef.current = transfer.serial;
      const segs = buildCometSegments(layout, transfer.fromSocket, transfer.toSocket);
      if (segs) {
        cometsRef.current.push({
          segments: segs,
          targetIdx: transfer.toSocket,
          progress: 0,
          duration: 1.05,
        });
      }
    }
  }, [transfer, layout]);

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
      const focusIdx = cur.hoveredIdx !== null ? cur.hoveredIdx : cur.activeNodeIndex;
      const focusEdges =
        focusIdx !== null && focusIdx !== undefined ? lyt.ancestorEdges.get(focusIdx) : undefined;
      const focusPeers =
        focusIdx !== null && focusIdx !== undefined ? lyt.adjacency.get(focusIdx) : undefined;

      // Advance or retract the progressive topological showcase wavefront
      const targetReveal = cur.showcaseAll ? 1 : 0;
      if (reduceMotionRef.current) {
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
      const ignitionPulse =
        cur.showcaseAll && reveal < 0.34 ? Math.sin(clamp(reveal / 0.34, 0, 1) * Math.PI) : 0;

      const breathe = 1 + 0.045 * Math.sin(time * 0.65) + 0.12 * cur.energy + ignitionPulse * 0.12;

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = isLight ? "#faf8f2" : "#070709";
      ctx.fillRect(0, 0, W, H);

      // Atmosphere glow matching GoldenNetwork
      const lightRadius = Math.max(S * 1.15, Math.max(W, H) * 0.72);
      if (isLight) {
        radialGlow(ctx, core, S * 0.58 * breathe, [
          [0, "rgba(255, 214, 88, 0.34)"],
          [0.42, "rgba(248, 192, 48, 0.14)"],
          [1, "rgba(250, 248, 242, 0)"],
        ]);
      } else {
        ctx.globalCompositeOperation = "lighter";
        radialGlow(ctx, core, S * 0.52 * breathe, [
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
        const grad = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, lightRadius);
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
      const sweepScale = Math.max(W * 0.54, H * 0.48);
      const baseSweep = isLight ? 0.42 : 0.34;
      const litSweep = isLight ? 0.62 : 0.52;
      const sweepStrength = baseSweep + (litSweep - baseSweep) * smoothstep(0, 0.45, reveal);
      for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
        strokeBatched(bIdx, sweepStrength, () => {
          for (const sw of strands.sweeps) {
            if (sw.bucket !== bIdx) continue;
            const swayA = Math.sin(time * 0.22 + sw.phase) * sw.sway;
            const swayB = Math.sin(time * 0.17 + sw.phase * 1.5) * sw.sway;
            const pinch = { x: core.x + sw.waistX * S, y: core.y + sw.waistY * S };
            const p0 = add(core, polar(sw.srcRadius * sweepScale, sw.srcAngle + 0.03 * swayB));
            const c1 = add(p0, polar(sw.srcRadius * sweepScale * 0.4, sw.srcAngle + Math.PI + 0.25));
            const c2 = add(pinch, polar(sweepScale * 0.22, sw.srcAngle + 0.04 * swayA));
            const p3 = add(core, polar(sw.dstRadius * sweepScale, sw.dstAngle + 0.05 * swayB));
            const d1 = add(pinch, polar(sweepScale * 0.24, sw.dstAngle - 0.06 * swayA));
            const d2 = add(p3, polar(sw.dstRadius * sweepScale * 0.38, sw.dstAngle + Math.PI));
            ctx.moveTo(p0.x, p0.y);
            ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, pinch.x, pinch.y);
            ctx.bezierCurveTo(d1.x, d1.y, d2.x, d2.y, p3.x, p3.y);
          }
        });
      }

      // 2. Branch edges + feathered outer tails
      const hasFocus = focusIdx !== null && focusIdx !== undefined;
      const ambientEdgeAlpha = hasFocus
        ? isLight
          ? 0.34
          : 0.26
        : isLight
          ? 0.56
          : 0.48;
      const activeEdgeAlpha = isLight ? 1.15 : 1.35;

      // Base ambient + live occupied paths (remains anchored beneath any expanding preview wave)
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

                  const tierBundle = strands.trunkStrands[edge.tier - 1]!;
                  for (const st of tierBundle) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(edge.p0, edge.c1, edge.c2, edge.p3, st, time, 1.0);
                    ctx.moveTo(edge.p0.x, edge.p0.y);
                    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, edge.p3.x, edge.p3.y);

                    const destNode = lyt.nodes[edge.toIndex];
                    if (destNode?.tailTip && Math.abs(st.offsetScale) < 0.08) {
                      const t0 = destNode.pos;
                      const t3 = destNode.tailTip;
                      const tc1 = add(
                        t0,
                        polar(Math.hypot(t3.x - t0.x, t3.y - t0.y) * 0.42, destNode.angle + st.offsetScale),
                      );
                      const tc2 = add(
                        t0,
                        polar(Math.hypot(t3.x - t0.x, t3.y - t0.y) * 0.78, destNode.angle - st.offsetScale),
                      );
                      ctx.bezierCurveTo(tc1.x, tc1.y, tc2.x, tc2.y, t3.x, t3.y);
                    }
                  }
                }
              },
              isActivePass ? 1.12 : 0.92,
            );
          }
        }
      }

      // Progressive golden cascade wave pass (grows progressively outward from Core -> Tier 1 -> Tier 2 -> Tier 3)
      const tipSparks: Vec[] = [];
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
                  const edgeFlow = smoothstep(t0, t1, reveal);
                  if (edgeFlow <= 0.005) continue;

                  const isAnimatingEdge = edgeFlow > 0.02 && edgeFlow < 0.985;
                  if (bIdx === 0 && isAnimatingEdge) {
                    tipSparks.push(bezier(edge.p0, edge.c1, edge.c2, edge.p3, edgeFlow));
                  }

                  const tierBundle = strands.trunkStrands[edge.tier - 1]!;
                  for (const st of tierBundle) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(edge.p0, edge.c1, edge.c2, edge.p3, st, time, 1.0);
                    if (edgeFlow >= 0.995) {
                      ctx.moveTo(edge.p0.x, edge.p0.y);
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, edge.p3.x, edge.p3.y);
                    } else {
                      const [sp0, sc1, sc2, sp3] = splitBezier(edge.p0, c1, c2, edge.p3, edgeFlow);
                      ctx.moveTo(sp0.x, sp0.y);
                      ctx.bezierCurveTo(sc1.x, sc1.y, sc2.x, sc2.y, sp3.x, sp3.y);
                    }

                    // Feathered outer leaf tails unfurl immediately after each branch node ignites
                    if (edgeFlow >= 0.96) {
                      const destNode = lyt.nodes[edge.toIndex];
                      if (destNode?.tailTip && Math.abs(st.offsetScale) < 0.08) {
                        const tailFlow = smoothstep(t1 - 0.02, Math.min(0.99, t1 + 0.13), reveal);
                        if (tailFlow > 0.01) {
                          const tail0 = destNode.pos;
                          const tail3 = destNode.tailTip;
                          const tc1 = add(
                            tail0,
                            polar(
                              Math.hypot(tail3.x - tail0.x, tail3.y - tail0.y) * 0.42,
                              destNode.angle + st.offsetScale,
                            ),
                          );
                          const tc2 = add(
                            tail0,
                            polar(
                              Math.hypot(tail3.x - tail0.x, tail3.y - tail0.y) * 0.78,
                              destNode.angle - st.offsetScale,
                            ),
                          );
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
        b.isLive ||
        b.fromIndex === focusIdx ||
        b.toIndex === focusIdx;

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
                for (const br of lyt.bridges) {
                  if (bridgeIsHighlighted(br) !== isHigh) continue;
                  const list = br.isLive ? strands.bridgeStrands.slice(0, 5) : strands.bridgeStrands.slice(0, 2);
                  for (const st of list) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(br.p0, br.c1, br.c2, br.p3, st, time, 0.85);
                    ctx.moveTo(br.p0.x, br.p0.y);
                    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, br.p3.x, br.p3.y);
                  }
                }
              },
              isHigh ? 1.12 : 0.8,
            );
          }
        }
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
                  const bridgeFlow = smoothstep(b0, b1, reveal);
                  if (bridgeFlow <= 0.005) continue;

                  if (bIdx === 0 && bridgeFlow > 0.02 && bridgeFlow < 0.985) {
                    tipSparks.push(bezier(br.p0, br.c1, br.c2, br.p3, bridgeFlow));
                  }

                  const list = strands.bridgeStrands.slice(0, br.isLive ? 5 : 3);
                  for (const st of list) {
                    if (st.bucket !== bIdx) continue;
                    const [c1, c2] = swayControlPoints(br.p0, br.c1, br.c2, br.p3, st, time, 0.85);
                    if (bridgeFlow >= 0.995) {
                      ctx.moveTo(br.p0.x, br.p0.y);
                      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, br.p3.x, br.p3.y);
                    } else {
                      const [sp0, sc1, sc2, sp3] = splitBezier(br.p0, c1, c2, br.p3, bridgeFlow);
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

      // 4. Twinkling Golden Micro-Dust & Flowing Energy Beads
      if (lyt.edges.length > 0) {
        ctx.fillStyle = isLight ? "rgb(212, 146, 16)" : "rgb(255, 214, 140)";
        for (const d of strands.dust) {
          const eIdx = d.edgeIdx % lyt.edges.length;
          const edge = lyt.edges[eIdx]!;
          const pt = bezier(edge.p0, edge.c1, edge.c2, edge.p3, d.t);
          const twinkle = 0.45 + 0.55 * Math.sin(time * 1.4 + d.phase);
          const [t0, t1] = cur.cascade.edgeTiming[eIdx] ?? [0, 0.25];
          const edgeFlow = isCascading ? smoothstep(t0, t1, reveal) : 0;
          const cascadeBoost = isCascading && d.t <= edgeFlow ? edgeFlow : 0;
          const activeBoost =
            cur.occupiedEdgeSet.has(eIdx) || cascadeBoost > 0.35
              ? Math.max(cur.occupiedEdgeSet.has(eIdx) ? 1.12 : 0.65, 0.65 + cascadeBoost * 0.48)
              : 0.65;
          ctx.globalAlpha = d.alpha * twinkle * activeBoost * (isLight ? 0.68 : 0.9);
          ctx.fillRect(pt.x + d.ox, pt.y + d.oy, d.size, d.size);
        }
      }

      ctx.fillStyle = isLight ? "rgb(198, 128, 10)" : "rgb(255, 244, 214)";
      const speedMul = 0.85 + cur.energy * 1.4;
      for (const bead of strands.beads) {
        const rawU = (bead.u + time * bead.speed * speedMul * bead.dir) % 1;
        const beadU = rawU < 0 ? rawU + 1 : rawU;
        let pos: Vec | null = null;
        let flowGate = 1;
        if (bead.kind === "bridge" && lyt.bridges.length > 0) {
          const liveBridges = lyt.bridges.filter((b) => b.isLive);
          const useAllBridges = reveal > 0.45;
          const pool = !useAllBridges && liveBridges.length > 0 && bead.idx % 2 === 0 ? liveBridges : lyt.bridges;
          const chosenIdx = bead.idx % pool.length;
          const br = pool[chosenIdx]!;
          if (isCascading && !br.isLive) {
            const origIdx = lyt.bridges.indexOf(br);
            const [b0, b1] = cur.cascade.bridgeTiming[origIdx] ?? [0.4, 0.7];
            flowGate = smoothstep(b0, b1, reveal);
          }
          pos = bezier(br.p0, br.c1, br.c2, br.p3, beadU);
        } else if (lyt.edges.length > 0) {
          const liveIdxList = Array.from(cur.occupiedEdgeSet);
          const useAllEdges = reveal > 0.25;
          const eIdx =
            !useAllEdges && liveIdxList.length > 0 && bead.idx % 3 !== 0
              ? liveIdxList[bead.idx % liveIdxList.length]!
              : bead.idx % lyt.edges.length;
          const edge = lyt.edges[eIdx]!;
          if (isCascading && !cur.occupiedEdgeSet.has(eIdx)) {
            const [t0, t1] = cur.cascade.edgeTiming[eIdx] ?? [0, 0.25];
            flowGate = smoothstep(t0, t1, reveal);
          }
          pos = bezier(edge.p0, edge.c1, edge.c2, edge.p3, beadU);
        }
        if (!pos || flowGate <= 0.05) continue;
        const baseBeadAlpha =
          bead.alpha * flowGate * (reveal > 0.5 ? (isLight ? 0.86 : 0.96) : isLight ? 0.78 : 0.92);
        ctx.globalAlpha = baseBeadAlpha;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, bead.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Snap & Transfer Comets gliding across the branching canopy / inter-node bridges
      if (cometsRef.current.length > 0) {
        const remaining: CometPulse[] = [];
        for (const comet of cometsRef.current) {
          comet.progress += dt > 0 ? dt / comet.duration : 0;
          if (comet.progress >= 1) continue;
          remaining.push(comet);
          const env = Math.sin(Math.PI * comet.progress);
          const head = pointOnPath(comet.segments, comet.progress);

          // Glowing comet head + short tail
          ctx.globalAlpha = env * 0.95;
          radialGlow(ctx, head, 18, [
            [0, isLight ? "rgba(198, 128, 10, 0.95)" : "rgba(255, 250, 232, 0.98)"],
            [0.35, "rgba(240, 181, 74, 0.55)"],
            [1, "rgba(240, 181, 74, 0)"],
          ]);
          for (let t = 1; t <= 4; t++) {
            const tu = clamp(comet.progress - t * 0.032, 0, 1);
            const tp = pointOnPath(comet.segments, tu);
            ctx.globalAlpha = env * (0.7 - t * 0.14);
            ctx.fillStyle = isLight ? "#c88d18" : "#fff7e0";
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, 2.8 - t * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        cometsRef.current = remaining;
      }

      // 6. Central Fluid Golden Singularity Orb (no Nexus logo) + expanding wavefront ring
      ctx.globalAlpha = 1;
      drawGoldenFluidCore(ctx, core, lyt.compact ? 15.5 : 19, time, cur.energy, ignitionPulse, isLight);
      if (cur.showcaseAll && reveal > 0.01 && reveal < 0.58) {
        const waveT = smoothstep(0.01, 0.58, reveal);
        const waveR = 18 + S * 0.62 * waveT;
        ctx.save();
        ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
        ctx.globalAlpha = (1 - waveT) * 0.48;
        ctx.beginPath();
        ctx.arc(core.x, core.y, waveR, 0, Math.PI * 2);
        ctx.lineWidth = 1.6 * (1 - waveT * 0.55);
        ctx.strokeStyle = isLight ? "rgba(202, 134, 14, 0.85)" : "rgba(255, 224, 136, 0.9)";
        ctx.stroke();
        ctx.restore();
      }

      // 7. Uncluttered 50 Node Jewels with smooth localized wavefront ignition ripples
      const goldHex = isLight ? "#b4780d" : "#f0b54a";
      const dormantInk = isLight ? "rgba(110, 92, 54, 0.55)" : "rgba(218, 198, 152, 0.52)";

      for (let i = 0; i < lyt.nodes.length; i++) {
        const bNode = lyt.nodes[i]!;
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
        const nodeLit = isCascading ? smoothstep(arrival - 0.035, arrival + 0.085, reveal) : 0;

        // Draw underlying occupied / open / dormant node until the golden preview wave overtakes it
        if (nodeLit < 0.98) {
          ctx.globalAlpha = 1 - nodeLit;
          if (isOcc) {
            const r = bNode.tier === 1 ? (lyt.compact ? 11 : 13) : lyt.compact ? 9.5 : 11;
            radialGlow(ctx, bNode.pos, r * (isHov || isAct ? 2.8 : 2.1), [
              [0, isLight ? "rgba(248, 192, 46, 0.34)" : "rgba(240, 181, 74, 0.36)"],
              [1, "rgba(0, 0, 0, 0)"],
            ]);

            if (isHov || isAct || isPeer) {
              ctx.beginPath();
              ctx.arc(bNode.pos.x, bNode.pos.y, r + 4.5, 0, Math.PI * 2);
              ctx.strokeStyle = isLight ? "rgba(180, 120, 13, 0.48)" : "rgba(255, 224, 152, 0.55)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(bNode.pos.x, bNode.pos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.94)" : "rgba(11, 11, 16, 0.92)";
            ctx.fill();
            ctx.lineWidth = isHov || isAct ? 1.7 : 1.35;
            ctx.strokeStyle = goldHex;
            ctx.stroke();

            if (meta.monogram) {
              ctx.fillStyle = isLight ? "#14151a" : "#f5f5f7";
              ctx.font = `600 ${bNode.tier === 1 ? 10 : 9}px var(--font-sans, sans-serif)`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(meta.monogram.slice(0, 2), bNode.pos.x, bNode.pos.y + 0.5);
            }
          } else if (isOpen) {
            const r = isHov || isAct ? 8.5 : 6.2;
            ctx.beginPath();
            ctx.arc(bNode.pos.x, bNode.pos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? "rgba(255, 252, 244, 0.92)" : "rgba(12, 12, 16, 0.86)";
            ctx.fill();
            ctx.lineWidth = isHov || isAct ? 1.45 : 1.1;
            ctx.strokeStyle = isHov || isPeer ? goldHex : isLight ? "rgba(180, 120, 13, 0.65)" : "rgba(240, 181, 74, 0.62)";
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(bNode.pos.x, bNode.pos.y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = goldHex;
            ctx.fill();
          } else {
            const r = isHov || isAct ? 6.5 : isPeer ? 4.8 : bNode.tier === 1 ? 4.2 : bNode.tier === 2 ? 3.5 : 2.9;
            if (emphasized) {
              ctx.beginPath();
              ctx.arc(bNode.pos.x, bNode.pos.y, r + 4, 0, Math.PI * 2);
              ctx.strokeStyle = isLight ? "rgba(180, 120, 13, 0.35)" : "rgba(240, 181, 74, 0.38)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(bNode.pos.x, bNode.pos.y, r, 0, Math.PI * 2);
            ctx.fillStyle =
              isHov || isAct
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
          const r = baseR * (0.58 + 0.42 * nodeLit) * bloom;

          ctx.globalAlpha = nodeLit;
          radialGlow(ctx, bNode.pos, r * (isHov || isAct || isPeer ? 3.8 : 2.6), [
            [0, isLight ? "rgba(248, 186, 36, 0.44)" : "rgba(255, 224, 130, 0.48)"],
            [1, "rgba(0, 0, 0, 0)"],
          ]);

          if (nodeLit < 0.99) {
            ctx.save();
            ctx.globalAlpha = (1 - nodeLit) * 0.78;
            ctx.beginPath();
            ctx.arc(bNode.pos.x, bNode.pos.y, baseR + 3 + nodeLit * 13, 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? "rgba(180, 118, 12, 0.85)" : "rgba(255, 232, 166, 0.9)";
            ctx.lineWidth = 1.15;
            ctx.stroke();
            ctx.restore();
          }

          if (isHov || isAct || isPeer) {
            ctx.beginPath();
            ctx.arc(bNode.pos.x, bNode.pos.y, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? "rgba(154, 105, 16, 0.55)" : "rgba(255, 232, 166, 0.65)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(bNode.pos.x, bNode.pos.y, r, 0, Math.PI * 2);
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
      const pt = layout.nodes[i]!.pos;
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const handlePointerMove = (e: MouseEvent<HTMLDivElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== hoveredIdx) {
      setHoveredIdx(hit);
      onHoverNode?.(hit);
    }
  };

  const handlePointerLeave = () => {
    if (hoveredIdx !== null) {
      setHoveredIdx(null);
      onHoverNode?.(null);
    }
  };

  const handleCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== null) {
      onSelectNode?.(hit);
    }
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
      onClick={handleCanvasClick}
      className={`relative h-full w-full select-none overflow-hidden ${
        hoveredIdx !== null ? "cursor-pointer" : "cursor-default"
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
