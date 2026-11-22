import { add, clamp, polar, seededHelpers, sub, type Vec } from "@/lib/network/geometry";
import type { ExtensionLink } from "@/lib/extensions";
import { computeCoreCenter } from "./stage-layout";

export interface BranchNode {
  index: number;
  tier: 1 | 2 | 3;
  branchIndex: number;
  parentIndex: number | null;
  pos: Vec;
  angle: number;
  tangent: Vec;
  tailTip: Vec | null;
  children: number[];
}

export interface BranchEdge {
  fromIndex: number | "core";
  toIndex: number;
  tier: 1 | 2 | 3;
  branchIndex: number;
  p0: Vec;
  c1: Vec;
  c2: Vec;
  p3: Vec;
}

export interface SynapseBridge {
  fromIndex: number;
  toIndex: number;
  isLive: boolean;
  kind: "content" | "capability" | "latent";
  channel: string;
  p0: Vec;
  c1: Vec;
  c2: Vec;
  p3: Vec;
}

export interface BranchNetworkLayout {
  width: number;
  height: number;
  compact: boolean;
  core: Vec;
  scale: number;
  nodes: BranchNode[];
  edges: BranchEdge[];
  bridges: SynapseBridge[];
  adjacency: Map<number, Set<number>>;
  ancestorEdges: Map<number, Set<number>>;
}

export interface TopologyOptions {
  mode?: "stage" | "embedded";
  bottomClearance?: number;
}

const DEG = Math.PI / 180;
/** Five primary canopy trunks spanning lateral wings through zenith crown (canvas radians, -90deg is straight up). */
const TRUNK_ANGLES = [-162 * DEG, -125 * DEG, -90 * DEG, -55 * DEG, -18 * DEG] as const;
/** Maps the first 5 slot indices so slots 0..1 (Studio & Cinema) anchor upper-left & zenith trunks cleanly. */
const SLOT_TO_TRUNK = [1, 2, 0, 3, 4] as const;

function makeBranchBezier(
  from: Vec,
  to: Vec,
  fromAngle: number,
  toAngle: number,
  inflection: number,
): { p0: Vec; c1: Vec; c2: Vec; p3: Vec } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(12, Math.hypot(dx, dy));
  const c1Angle = fromAngle + inflection;
  const c2Angle = toAngle - inflection * 0.45;
  return {
    p0: from,
    c1: add(from, polar(dist * 0.44, c1Angle)),
    c2: sub(to, polar(dist * 0.36, c2Angle)),
    p3: to,
  };
}

function makeBridgeBezier(
  from: Vec,
  to: Vec,
  core: Vec,
  archDirection: 1 | -1,
  archScale: number,
): { p0: Vec; c1: Vec; c2: Vec; p3: Vec } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(12, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;
  // Normal vector pointing away from Core so inter-node arcs bow organically above the hub instead of crossing the nucleus
  let nx = -uy;
  let ny = ux;
  const midX = (from.x + to.x) * 0.5 - core.x;
  const midY = (from.y + to.y) * 0.5 - core.y;
  if (nx * midX + ny * midY < 0) {
    nx = -nx;
    ny = -ny;
  }
  const sag = clamp(dist * archScale, 12, 88) * archDirection;
  const c1: Vec = {
    x: from.x + dx * 0.28 + nx * sag,
    y: from.y + dy * 0.28 + ny * sag,
  };
  const c2: Vec = {
    x: from.x + dx * 0.72 + nx * sag,
    y: from.y + dy * 0.72 + ny * sag,
  };
  return { p0: from, c1, c2, p3: to };
}

function buildLatentBridgePairs(nodes: readonly BranchNode[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const tier1ByTrunk = new Map<number, BranchNode>();
  const tier2ByTrunk = new Map<number, BranchNode[]>();
  const tier3ByTrunk = new Map<number, BranchNode[]>();

  for (const node of nodes) {
    if (node.tier === 1) tier1ByTrunk.set(node.branchIndex, node);
    else if (node.tier === 2) {
      const list = tier2ByTrunk.get(node.branchIndex) ?? [];
      list.push(node);
      tier2ByTrunk.set(node.branchIndex, list);
    } else {
      const list = tier3ByTrunk.get(node.branchIndex) ?? [];
      list.push(node);
      tier3ByTrunk.set(node.branchIndex, list);
    }
  }

  for (const b of tier2ByTrunk.values()) b.sort((x, y) => x.angle - y.angle);
  for (const b of tier3ByTrunk.values()) b.sort((x, y) => x.angle - y.angle);

  // Adjacent Tier-1 trunk crown arcs
  for (let t = 0; t < 4; t++) {
    const a = tier1ByTrunk.get(t);
    const b = tier1ByTrunk.get(t + 1);
    if (a && b) pairs.push([a.index, b.index]);
  }

  // Adjacent Tier-2 sub-branches across trunk frontiers + sibling middle bridges
  for (let t = 0; t < 5; t++) {
    const cur = tier2ByTrunk.get(t) ?? [];
    const next = tier2ByTrunk.get(t + 1) ?? [];
    if (cur.length >= 2) {
      pairs.push([cur[0]!.index, cur[cur.length - 1]!.index]);
    }
    if (cur.length > 0 && next.length > 0) {
      pairs.push([cur[cur.length - 1]!.index, next[0]!.index]);
      if (cur.length >= 2 && next.length >= 2) {
        pairs.push([cur[cur.length - 2]!.index, next[1]!.index]);
      }
    }
  }

  // Outer Tier-3 cross-canopy filaments connecting neighboring crown leaves
  for (let t = 0; t < 5; t++) {
    const cur = tier3ByTrunk.get(t) ?? [];
    const next = tier3ByTrunk.get(t + 1) ?? [];
    if (cur.length > 0 && next.length > 0) {
      pairs.push([cur[cur.length - 1]!.index, next[0]!.index]);
    }
    for (let j = 1; j < cur.length; j += 2) {
      pairs.push([cur[j - 1]!.index, cur[j]!.index]);
    }
  }

  return pairs;
}

/**
 * Generates an uncluttered, collision-free multi-tier branching topology (scalable 50..100+ slots)
 * anchored to the Singularity Core, plus live capability bridges and cross-branch filaments.
 */
export function computeBranchNetworkLayout(
  width: number,
  height: number,
  slotCount: number,
  liveLinks: readonly ExtensionLink[],
  options: TopologyOptions = {},
): BranchNetworkLayout {
  const w = Math.max(240, width);
  const h = Math.max(200, height);
  const compact = w < 760;
  const mode = options.mode ?? "stage";
  const count = Math.max(1, slotCount);
  const { between } = seededHelpers(20261122);

  let core: Vec;
  if (mode === "stage") {
    core = computeCoreCenter(w, h);
  } else {
    const clearance = options.bottomClearance ?? clamp(h * 0.2, 34, 240);
    const defaultRatioY = clearance > 100 ? clamp((h - clearance) / h, 0.36, 0.62) : 0.78;
    const coreY = clamp(h - clearance, h * 0.34, Math.min(h * defaultRatioY, h - 26));
    core = { x: w * 0.5, y: coreY };
  }

  const sidePad = compact ? 24 : 52;
  const topPad = mode === "stage" ? (compact ? 40 : 52) : compact ? 24 : 32;
  const bottomLimit = Math.min(h - 20, core.y + (compact ? 16 : 26));
  const availTop = Math.max(96, core.y - topPad);
  const availHoriz = Math.max(110, Math.min(core.x, w - core.x) - sidePad);
  const rx = Math.min(availHoriz * 0.96, availTop * 1.58);
  const ry = availTop * 0.94;

  const nodes: BranchNode[] = [];
  const tier1Nodes: Array<BranchNode | undefined> = Array(5);
  const tier2List: BranchNode[] = [];

  for (let i = 0; i < count; i++) {
    if (i < 5) {
      const trunkIdx = SLOT_TO_TRUNK[i]!;
      const baseAngle = TRUNK_ANGLES[trunkIdx]!;
      const angle = baseAngle + between(-0.04, 0.04);
      const rFrac = (trunkIdx === 0 || trunkIdx === 4 ? 0.39 : 0.34) + between(-0.02, 0.02);
      const pos: Vec = {
        x: core.x + Math.cos(angle) * rx * rFrac,
        y: core.y + Math.sin(angle) * ry * rFrac,
      };
      const node: BranchNode = {
        index: i,
        tier: 1,
        branchIndex: trunkIdx,
        parentIndex: null,
        pos,
        angle,
        tangent: { x: Math.cos(angle), y: Math.sin(angle) },
        tailTip: null,
        children: [],
      };
      nodes.push(node);
      tier1Nodes[trunkIdx] = node;
    } else if (i < 20) {
      const subIdx = i - 5;
      const trunkIdx = Math.floor(subIdx / 3);
      const laneIdx = subIdx % 3; // 0, 1, 2 -> left, center, right
      const parent = tier1Nodes[trunkIdx] ?? nodes[0]!;
      const spreadDeg = (laneIdx - 1) * (trunkIdx === 0 || trunkIdx === 4 ? 17 : 20);
      const angle = parent.angle + spreadDeg * DEG + between(-0.045, 0.045);
      const rFrac =
        (laneIdx === 1 ? 0.68 : 0.64) +
        (trunkIdx === 2 ? -0.02 : 0.01) +
        between(-0.025, 0.025);
      const pos: Vec = {
        x: core.x + Math.cos(angle) * rx * rFrac,
        y: core.y + Math.sin(angle) * ry * rFrac,
      };
      const node: BranchNode = {
        index: i,
        tier: 2,
        branchIndex: parent.branchIndex,
        parentIndex: parent.index,
        pos,
        angle,
        tangent: { x: Math.cos(angle), y: Math.sin(angle) },
        tailTip: null,
        children: [],
      };
      parent.children.push(i);
      nodes.push(node);
      tier2List.push(node);
    } else {
      const leafIdx = i - 20;
      const tier2Parent = tier2List[Math.floor(leafIdx / 2) % tier2List.length] ?? nodes[nodes.length - 1]!;
      const forkCycle = leafIdx % 2 === 0 ? -1 : 1;
      const outerRing = Math.floor(leafIdx / (tier2List.length * 2));
      const forkAngle =
        tier2Parent.angle +
        forkCycle * (11.5 - Math.min(4, outerRing * 2.5)) * DEG +
        between(-0.04, 0.04);
      const rFrac = Math.min(1.06, 0.91 + outerRing * 0.08 + between(-0.035, 0.035));
      const pos: Vec = {
        x: core.x + Math.cos(forkAngle) * rx * rFrac,
        y: core.y + Math.sin(forkAngle) * ry * rFrac,
      };
      const node: BranchNode = {
        index: i,
        tier: 3,
        branchIndex: tier2Parent.branchIndex,
        parentIndex: tier2Parent.index,
        pos,
        angle: forkAngle,
        tangent: { x: Math.cos(forkAngle), y: Math.sin(forkAngle) },
        tailTip: null,
        children: [],
      };
      tier2Parent.children.push(i);
      nodes.push(node);
    }
  }

  // Clamp and iteratively relax spacing so 50+ nodes never collide on desktop or mobile
  const minDist = compact
    ? clamp(Math.min(rx, ry) * 0.09, 14, 21)
    : clamp(Math.min(rx, ry) * 0.105, 20, 32);
  const coreClearance = compact ? 36 : 48;

  for (let pass = 0; pass < 16; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < minDist) {
          const push = (minDist - d) * 0.52;
          const ux = d > 0.001 ? dx / d : Math.cos(i * 1.3);
          const uy = d > 0.001 ? dy / d : Math.sin(i * 1.3);
          const aWeight = a.tier < b.tier ? 0.25 : 0.5;
          const bWeight = 1 - aWeight;
          a.pos.x -= ux * push * aWeight;
          a.pos.y -= uy * push * aWeight;
          b.pos.x += ux * push * bWeight;
          b.pos.y += uy * push * bWeight;
        }
      }

      // Keep nodes comfortably outside the luminous Singularity Core disk and within safe canvas padding
      const cdx = a.pos.x - core.x;
      const cdy = a.pos.y - core.y;
      const cd = Math.hypot(cdx, cdy);
      if (cd < coreClearance && cd > 0.001) {
        const lift = (coreClearance - cd) / cd;
        a.pos.x += cdx * lift;
        a.pos.y += cdy * lift;
      }

      a.pos.x = clamp(a.pos.x, sidePad, w - sidePad);
      a.pos.y = clamp(a.pos.y, topPad, bottomLimit);
    }
  }

  // Recompute flowing tangents and delicate outward continuation tails on outer leaf nodes
  const tailReach = Math.min(rx, ry) * (compact ? 0.16 : 0.22);
  for (const node of nodes) {
    const parentPos = node.parentIndex !== null ? nodes[node.parentIndex]!.pos : core;
    const finalAngle = Math.atan2(node.pos.y - parentPos.y, node.pos.x - parentPos.x);
    node.angle = finalAngle;
    node.tangent = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
    if (node.tier === 3 || node.children.length === 0) {
      const sideSway = (node.branchIndex - 2) * 0.07;
      node.tailTip = add(node.pos, polar(tailReach, finalAngle + sideSway));
    }
  }

  // Construct C1-continuous branch Bezier edges from Core -> Tier 1 -> Tier 2 -> Tier 3
  const edges: BranchEdge[] = [];
  const ancestorEdges = new Map<number, Set<number>>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const fromPos = node.parentIndex !== null ? nodes[node.parentIndex]!.pos : core;
    const fromAngle =
      node.parentIndex !== null ? nodes[node.parentIndex]!.angle : TRUNK_ANGLES[node.branchIndex]!;
    const inflection = (node.branchIndex - 2) * 0.065;
    const seg = makeBranchBezier(fromPos, node.pos, fromAngle, node.angle, inflection);
    const edgeIdx = edges.length;
    edges.push({
      fromIndex: node.parentIndex ?? "core",
      toIndex: node.index,
      tier: node.tier,
      branchIndex: node.branchIndex,
      ...seg,
    });

    const anc = new Set<number>([edgeIdx]);
    if (node.parentIndex !== null) {
      const parentAnc = ancestorEdges.get(node.parentIndex);
      if (parentAnc) {
        for (const pe of parentAnc) anc.add(pe);
      }
    }
    ancestorEdges.set(node.index, anc);
  }

  // Construct live capability bridges + subtle latent cross-branch web filaments
  const bridges: SynapseBridge[] = [];
  const adjacency = new Map<number, Set<number>>();
  const seenPairs = new Set<string>();

  const registerBridge = (
    fromIdx: number,
    toIdx: number,
    isLive: boolean,
    kind: SynapseBridge["kind"],
    channel: string,
    archScale: number,
  ) => {
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= nodes.length || toIdx >= nodes.length || fromIdx === toIdx) {
      return;
    }
    const key = fromIdx < toIdx ? `${fromIdx}:${toIdx}` : `${toIdx}:${fromIdx}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);

    const a = nodes[fromIdx]!;
    const b = nodes[toIdx]!;
    const variedArchScale = archScale + ((fromIdx + toIdx) % 3) * 0.04;
    const curve = makeBridgeBezier(a.pos, b.pos, core, 1, variedArchScale);
    bridges.push({
      fromIndex: fromIdx,
      toIndex: toIdx,
      isLive,
      kind,
      channel,
      ...curve,
    });

    const setA = adjacency.get(fromIdx) ?? new Set<number>();
    setA.add(toIdx);
    adjacency.set(fromIdx, setA);

    const setB = adjacency.get(toIdx) ?? new Set<number>();
    setB.add(fromIdx);
    adjacency.set(toIdx, setB);
  };

  for (const link of liveLinks) {
    registerBridge(link.fromSlotIndex, link.toSlotIndex, true, link.kind, link.channel, 0.24);
  }

  for (const [aIdx, bIdx] of buildLatentBridgePairs(nodes)) {
    registerBridge(aIdx, bIdx, false, "latent", "branch-mesh", 0.16);
  }

  return {
    width: w,
    height: h,
    compact,
    core,
    scale: Math.hypot(rx, ry),
    nodes,
    edges,
    bridges,
    adjacency,
    ancestorEdges,
  };
}
