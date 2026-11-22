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

  const cometsRef = useRef<CometPulse[]>([]);
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
    layout,
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
      layout,
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

      const breathe = 1 + 0.045 * Math.sin(time * 0.65) + 0.12 * cur.energy;

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
      for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
        strokeBatched(bIdx, isLight ? 0.42 : 0.34, () => {
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

      // 2. Branch edges + feathered outer tails (split cleanly into ambient vs highlighted passes)
      const hasFocus = focusIdx !== null && focusIdx !== undefined;
      const ambientEdgeAlpha = hasFocus ? (isLight ? 0.34 : 0.26) : isLight ? 0.56 : 0.48;
      const activeEdgeAlpha = isLight ? 1.15 : 1.35;

      for (const isActivePass of [false, true]) {
        for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
          strokeBatched(
            bIdx,
            isActivePass ? activeEdgeAlpha : ambientEdgeAlpha,
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

                  // Soft outward atmospheric continuation curling beyond leaf nodes
                  if (st.bucket === bIdx) {
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
              }
            },
            isActivePass ? 1.12 : 0.92,
          );
        }
      }

      // 3. Inter-Node Bridges (latent branch mesh vs live capability links + hover focus)
      const bridgeIsHighlighted = (b: SynapseBridge) =>
        b.isLive ||
        b.fromIndex === focusIdx ||
        b.toIndex === focusIdx;

      for (const isHigh of [false, true]) {
        for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
          strokeBatched(
            bIdx,
            isHigh ? (isLight ? 1.25 : 1.45) : hasFocus ? 0.14 : isLight ? 0.24 : 0.2,
            () => {
              for (const br of lyt.bridges) {
                if (bridgeIsHighlighted(br) !== isHigh) continue;
                const list = br.isLive ? strands.bridgeStrands : strands.bridgeStrands.slice(0, 2);
                for (const st of list) {
                  if (st.bucket !== bIdx) continue;
                  const [c1, c2] = swayControlPoints(br.p0, br.c1, br.c2, br.p3, st, time, 0.85);
                  ctx.moveTo(br.p0.x, br.p0.y);
                  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, br.p3.x, br.p3.y);
                }
              }
            },
            isHigh ? 1.15 : 0.8,
          );
        }
      }

      // 4. Twinkling Golden Micro-Dust & Flowing Energy Beads
      if (lyt.edges.length > 0) {
        ctx.fillStyle = isLight ? "rgb(212, 146, 16)" : "rgb(255, 214, 140)";
        for (const d of strands.dust) {
          const edge = lyt.edges[d.edgeIdx % lyt.edges.length]!;
          const pt = bezier(edge.p0, edge.c1, edge.c2, edge.p3, d.t);
          const twinkle = 0.45 + 0.55 * Math.sin(time * 1.4 + d.phase);
          const activeBoost = cur.occupiedEdgeSet.has(d.edgeIdx % lyt.edges.length) ? 1.1 : 0.65;
          ctx.globalAlpha = d.alpha * twinkle * activeBoost * (isLight ? 0.62 : 0.85);
          ctx.fillRect(pt.x + d.ox, pt.y + d.oy, d.size, d.size);
        }
      }

      ctx.fillStyle = isLight ? "rgb(198, 128, 10)" : "rgb(255, 244, 214)";
      const speedMul = 0.85 + cur.energy * 1.4;
      for (const bead of strands.beads) {
        const rawU = (bead.u + time * bead.speed * speedMul * bead.dir) % 1;
        const beadU = rawU < 0 ? rawU + 1 : rawU;
        let pos: Vec | null = null;
        if (bead.kind === "bridge" && lyt.bridges.length > 0) {
          const liveBridges = lyt.bridges.filter((b) => b.isLive);
          const pool = liveBridges.length > 0 && bead.idx % 2 === 0 ? liveBridges : lyt.bridges;
          const br = pool[bead.idx % pool.length]!;
          pos = bezier(br.p0, br.c1, br.c2, br.p3, beadU);
        } else if (lyt.edges.length > 0) {
          const liveIdxList = Array.from(cur.occupiedEdgeSet);
          const eIdx =
            liveIdxList.length > 0 && bead.idx % 3 !== 0
              ? liveIdxList[bead.idx % liveIdxList.length]!
              : bead.idx % lyt.edges.length;
          const edge = lyt.edges[eIdx]!;
          pos = bezier(edge.p0, edge.c1, edge.c2, edge.p3, beadU);
        }
        if (!pos) continue;
        ctx.globalAlpha = bead.alpha * (isLight ? 0.78 : 0.92);
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

      // 6. Central Singularity Core Jewel
      ctx.globalAlpha = 1;
      if (isLight) {
        radialGlow(ctx, core, S * 0.13 * breathe, [
          [0, "rgba(255, 253, 242, 0.98)"],
          [0.24, "rgba(255, 214, 86, 0.72)"],
          [0.58, "rgba(242, 178, 30, 0.25)"],
          [1, "rgba(255, 255, 255, 0)"],
        ]);
      } else {
        radialGlow(ctx, core, S * 0.1 * breathe, [
          [0, "rgba(255, 252, 240, 1)"],
          [0.2, "rgba(255, 228, 165, 0.75)"],
          [0.52, "rgba(250, 176, 70, 0.2)"],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      // Core emblem disk
      ctx.globalCompositeOperation = "source-over";
      const coreR = lyt.compact ? 12 : 14;
      ctx.beginPath();
      ctx.arc(core.x, core.y, coreR, 0, Math.PI * 2);
      ctx.fillStyle = isLight ? "rgba(255, 253, 246, 0.96)" : "rgba(10, 10, 14, 0.92)";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = isLight ? "rgba(192, 128, 12, 0.85)" : "rgba(240, 181, 74, 0.9)";
      ctx.stroke();

      // Tiny inner specular Nexus triad mark centered in Core
      ctx.save();
      ctx.translate(core.x, core.y);
      ctx.scale(lyt.compact ? 0.13 : 0.15, lyt.compact ? 0.13 : 0.15);
      ctx.fillStyle = isLight ? "#b4780d" : "#f0b54a";
      for (let p = 0; p < 3; p++) {
        ctx.save();
        ctx.rotate((p * Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.moveTo(8.5, -44.5);
        ctx.lineTo(35.5, -29);
        ctx.lineTo(35.5, 0);
        ctx.lineTo(8.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // 7. Uncluttered 50 Node Jewels (live monogram disks, hollow open rings, serene branch pinpoints)
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
          // Dormant / Pro branch node: sleek small jewel pinpoint (expands smoothly on hover/peer focus)
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
      ctx.globalAlpha = 1;
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let active = !paused;

    const resize = () => {
      fitCanvas(canvas, ctx);
      drawFrameRef.current(ctx, elapsed, 0);
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
      elapsed += dt;
      drawFrameRef.current(ctx, elapsed, dt);
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

  // Redraw immediately when reduced-motion is set and layout/theme/hover changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    fitCanvas(canvas, ctx);
    drawFrameRef.current(ctx, 0, 0);
  }, [layout, theme, hoveredIdx, activeNodeIndex, nodes]);

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

  // Accessible keyboard targets only for occupied live nodes + first open free slot (never 50 stacked controls)
  const firstOpenIdx = nodes.findIndex((n) => n.status === "open");
  const keyboardIndices: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]?.status === "occupied" || i === firstOpenIdx) {
      keyboardIndices.push(i);
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
                meta.status === "occupied"
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

      {/* Single Floating Liquid Glass Inspection Pill (appears cleanly on hover/focus without overlapping crown peers) */}
      {hoveredNode && hoveredMeta ? (
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
