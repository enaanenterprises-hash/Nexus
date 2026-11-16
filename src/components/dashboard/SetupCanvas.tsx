"use client";

import { memo, useEffect, useRef } from "react";
import { clamp, lerp, observeCanvasActivity, seededHelpers, type Vec } from "@/lib/network/geometry";
import { computeCoreCenter } from "./stage-layout";
import {
  buildSpriteAtlas,
  getThemePalette,
  mixRgb,
  rgbStr,
  stampAnamorphicFlare,
  stampSprite,
  type SetupSpriteAtlas,
  type SetupThemeMode,
  type ThemePalette,
} from "./setup-sprites";

export type SetupStagePhase = "singularity" | "exploding" | "modal" | "finale" | "finale-blast";

const TAU = Math.PI * 2;

const SHEAF_STEPS = 20;
const GEODESIC_STEPS = 22;
const VORTEX_STEPS = 18;
const TENDRIL_STEPS = 12;

// Opening arc ("exploding": Frames 2 -> 3 -> 4 -> 5 -> 6, firing onExplosionComplete at ~2.25s)
const OPEN_CONSTELLATION_FADE_END = 0.34;
const OPEN_RING_END = 0.36;
const OPEN_VORTEX_START = 0.18;
const OPEN_BLAST_AT = 0.94;
const OPEN_WEB_SETTLE_AT = 1.42;
const OPEN_COMPLETE_AT = 2.25;

// Finale arc ("finale" -> "finale-blast": fill -> brief hold -> vortex collapse -> taut hold -> transparent blast overlay)
const FINALE_FILL_END = 0.9;
const FINALE_COLLAPSE_START = 1.22;
const FINALE_COLLAPSE_END = 1.88;
const FINALE_EXPLODE_AT = 2.56;
const FINALE_BLAST_DURATION = 1.12;
const FINALE_COMPLETE_AT = FINALE_EXPLODE_AT + FINALE_BLAST_DURATION; // 3.68s

const DEPTH_LAYERS = [
  { width: 3.0, alpha: 0.052, hot: 0.08 },
  { width: 1.5, alpha: 0.14, hot: 0.35 },
  { width: 0.85, alpha: 0.3, hot: 0.68 },
  { width: 0.44, alpha: 0.6, hot: 0.96 },
] as const;

type OrbitalTendril = {
  angle: number;
  curl: number;
  reachMul: number;
  layer: number;
  phase: number;
};

type VortexStream = {
  armIdx: number;
  armBase: number;
  eta: number;
  reachMul: number;
  layer: number;
  phase: number;
};

type VortexBead = {
  streamIdx: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
  kind: "anchor" | "star" | "dot";
};

type SheafFilament = {
  angle: number;
  bend: number;
  fanOffset: number;
  waveAmp: number;
  freqMul: number;
  phase: number;
  staggerFinale: number;
  reachMul: number;
  twistDir: number;
  layer: number;
  isExtra: boolean;
};

type SheafPhoton = {
  rayIdx: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

type StardustSpark = {
  angle: number;
  curve: number;
  speedMul: number;
  lengthMul: number;
  size: number;
  alpha: number;
  tier: 0 | 1 | 2;
  hasHead: boolean;
};

type ShockRing = {
  u: number;
  speed: number;
  strength: number;
  crimson: boolean;
};

type GeodesicCurve = {
  kind: "u" | "v" | "diag";
  fixedCoord: number;
  skew: number;
  layer: number;
  phase: number;
};

type GeodesicNode = {
  u: number;
  v: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
  kind: "anchor" | "star" | "dot";
};

type ConstellationStar = {
  rx: number;
  ry: number;
  radius: number;
  alpha: number;
  twinkleSpeed: number;
  twinkleRatio: number;
  phase: number;
  isAnchor: boolean;
};

type ConstellationEdge = {
  a: number;
  b: number;
  alpha: number;
  phase: number;
};

type ConstellationGroup = {
  cx: number;
  cy: number;
  driftAmpX: number;
  driftAmpY: number;
  driftFreqX: number;
  driftFreqY: number;
  driftPhase: number;
  rotAmp: number;
  rotFreq: number;
  rotPhase: number;
  stars: ConstellationStar[];
  edges: ConstellationEdge[];
};

type AmbientStar = {
  x: number;
  y: number;
  driftAmpX: number;
  driftAmpY: number;
  driftFreqX: number;
  driftFreqY: number;
  driftPhase: number;
  radius: number;
  alpha: number;
  twinkleSpeed: number;
  twinkleRatio: number;
  phase: number;
  hasFlare: boolean;
};

type ConstellationField = {
  groups: ConstellationGroup[];
  ambientStars: AmbientStar[];
};

type AsterismTemplate = {
  points: ReadonlyArray<readonly [number, number]>;
  edges: ReadonlyArray<readonly [number, number]>;
};

const ASTERISM_TEMPLATES: readonly AsterismTemplate[] = [
  {
    points: [
      [-1.0, 0.25],
      [-0.45, -0.32],
      [0.12, -0.42],
      [0.68, -0.15],
      [1.05, 0.35],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    points: [
      [-0.55, -0.45],
      [0.18, -0.72],
      [0.52, -0.05],
      [-0.12, 0.32],
      [0.98, 0.62],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [2, 4],
    ],
  },
  {
    points: [
      [-0.85, 0.35],
      [-0.22, 0.02],
      [0.42, -0.28],
      [0.98, -0.48],
      [0.05, 0.72],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 4],
    ],
  },
  {
    points: [
      [-0.65, -0.22],
      [0.32, -0.64],
      [0.64, 0.18],
      [-0.98, 0.56],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 0],
      [0, 3],
    ],
  },
  {
    points: [
      [-0.95, -0.18],
      [-0.36, 0.38],
      [0.18, -0.28],
      [0.74, 0.32],
      [1.08, -0.16],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
];

function isPointInConstellationExclusion(
  x: number,
  y: number,
  cx: number,
  cy: number,
  clearR: number,
  promptTop: number,
  promptHalfW: number,
): boolean {
  if (Math.hypot(x - cx, y - cy) < clearR) return true;
  return y >= promptTop && Math.abs(x - cx) < promptHalfW;
}

function segmentIntersectsConstellationExclusion(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  clearR: number,
  promptTop: number,
  promptHalfW: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const tClosest = lenSq > 1e-6 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / lenSq, 0, 1) : 0;
  if (Math.hypot(ax + tClosest * dx - cx, ay + tClosest * dy - cy) < clearR) {
    return true;
  }

  const minX = cx - promptHalfW;
  const maxX = cx + promptHalfW;
  let tMinX = 0;
  let tMaxX = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax <= minX || ax >= maxX) return false;
  } else {
    const tx1 = (minX - ax) / dx;
    const tx2 = (maxX - ax) / dx;
    tMinX = Math.min(tx1, tx2);
    tMaxX = Math.max(tx1, tx2);
  }

  let tMinY = 0;
  let tMaxY = 1;
  if (Math.abs(dy) < 1e-9) {
    if (ay < promptTop) return false;
  } else {
    const ty = (promptTop - ay) / dy;
    if (dy > 0) {
      tMinY = ty;
    } else {
      tMaxY = ty;
    }
  }

  const tEnter = Math.max(0, tMinX, tMinY);
  const tExit = Math.min(1, tMaxX, tMaxY);
  if (tEnter > tExit) return false;
  const tMid = (tEnter + tExit) * 0.5;
  const mx = ax + tMid * dx;
  const my = ay + tMid * dy;
  return my >= promptTop && Math.abs(mx - cx) < promptHalfW;
}

/** Fits canvas up to 3x native DPR so fine gold constellations, filaments, and flares stay razor crisp. */
function fitHighResCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function twinkleWave(time: number, speed: number, ratio: number, phase: number, reduceMotion: boolean) {
  if (reduceMotion) return 1;
  const w1 = 0.5 + 0.5 * Math.sin(time * speed + phase);
  const w2 = 0.5 + 0.5 * Math.sin(time * speed * ratio + phase * 1.63);
  return 0.36 + 0.64 * Math.pow(w1 * 0.65 + w2 * 0.35, 1.35);
}

/** Seeds prominent floating gold constellations in outer sky, clear of singularity & lower prompt negative space. */
function createConstellationField(width: number, height: number): ConstellationField {
  if (width < 40 || height < 40) {
    return { groups: [], ambientStars: [] };
  }

  const { rnd, between } = seededHelpers(20261129);
  const core = computeCoreCenter(width, height);
  const cx = core.x;
  const cy = core.y;
  const minDim = Math.min(width, height);
  const coreBaseR = clamp(minDim * 0.14, 58, 118);

  // Reserve extra excursion margin so drift and rotation stay strictly outside center and lower prompt negative space
  const maxDrift = 24;
  const clearR = coreBaseR * 1.72 + maxDrift;
  const promptTop = cy + coreBaseR * 0.3 - maxDrift;
  const promptHalfW = Math.min(width * 0.4, 385) + maxDrift;

  const pad = clamp(minDim * 0.055, 28, 52);
  const span = clamp(Math.min(width * 0.115, height * 0.145), 58, 122);
  const lateralSpace = cx - promptHalfW - pad;

  const upperSkyBottom = Math.max(pad + span, cy - clearR - span * 0.32);
  const upperHighY = lerp(pad, upperSkyBottom, 0.34);
  const upperLowY = lerp(pad, upperSkyBottom, 0.72);

  const anchors: Vec[] = [
    { x: lerp(pad + span * 0.5, cx - clearR * 0.72, 0.38), y: upperLowY },
    { x: lerp(pad + span * 0.5, cx, 0.58), y: upperHighY },
    { x: lerp(cx, width - pad - span * 0.5, 0.42), y: upperHighY * 1.06 },
    { x: lerp(cx + clearR * 0.72, width - pad - span * 0.5, 0.62), y: upperLowY * 0.94 },
  ];

  if (width >= 600) {
    anchors.push(
      { x: pad + (cx - pad) * 0.18, y: Math.min(cy - clearR * 0.42, upperSkyBottom + span * 0.75) },
      { x: width - pad - (width - pad - cx) * 0.18, y: Math.min(cy - clearR * 0.42, upperSkyBottom + span * 0.72) },
    );
  }

  if (lateralSpace >= 100) {
    anchors.push(
      { x: pad + lateralSpace * 0.46, y: lerp(cy + 22, height - pad, 0.54) },
      { x: width - pad - lateralSpace * 0.46, y: lerp(cy + 22, height - pad, 0.52) },
    );
  }

  const placedStarPositions: Vec[] = [];
  const groups: ConstellationGroup[] = [];
  const minCrossStarSep = Math.max(28, span * 0.36);

  const isInsideSafeCanvas = (x: number, y: number) =>
    x >= pad && x <= width - pad && y >= pad && y <= height - pad;

  for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
    const anchor = anchors[aIdx]!;
    const tpl =
      ASTERISM_TEMPLATES[(aIdx + Math.floor(rnd() * ASTERISM_TEMPLATES.length)) % ASTERISM_TEMPLATES.length]!;
    const rot = rnd() * TAU;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const localScale = span * between(0.86, 1.15);
    const offsetX = between(-span * 0.16, span * 0.16);
    const offsetY = between(-span * 0.14, span * 0.14);

    const candidates = tpl.points.map(([lx, ly]) => {
      const jx = lx + between(-0.1, 0.1);
      const jy = ly + between(-0.1, 0.1);
      const x = anchor.x + offsetX + (jx * cosR - jy * sinR) * localScale;
      const y = anchor.y + offsetY + (jx * sinR + jy * cosR) * localScale;
      const valid =
        isInsideSafeCanvas(x, y) &&
        !isPointInConstellationExclusion(x, y, cx, cy, clearR, promptTop, promptHalfW) &&
        placedStarPositions.every((s) => Math.hypot(x - s.x, y - s.y) >= minCrossStarSep);
      return { x, y, valid };
    });

    const validEdges: Array<[number, number]> = [];
    for (const [ia, ib] of tpl.edges) {
      const pA = candidates[ia]!;
      const pB = candidates[ib]!;
      if (!pA.valid || !pB.valid) continue;
      if (
        segmentIntersectsConstellationExclusion(
          pA.x,
          pA.y,
          pB.x,
          pB.y,
          cx,
          cy,
          clearR,
          promptTop,
          promptHalfW,
        )
      ) {
        continue;
      }
      validEdges.push([ia, ib]);
    }

    if (validEdges.length < 2) continue;

    const usedIndices = Array.from(new Set(validEdges.flat()));
    const groupCx = usedIndices.reduce((sum, idx) => sum + candidates[idx]!.x, 0) / usedIndices.length;
    const groupCy = usedIndices.reduce((sum, idx) => sum + candidates[idx]!.y, 0) / usedIndices.length;

    const localToGroup = new Map<number, number>();
    const groupStars: ConstellationStar[] = [];

    for (let uIdx = 0; uIdx < usedIndices.length; uIdx++) {
      const localIdx = usedIndices[uIdx]!;
      const pt = candidates[localIdx]!;
      const isAnchor = uIdx === 0 || (uIdx === 2 && rnd() < 0.68);
      localToGroup.set(localIdx, groupStars.length);
      placedStarPositions.push({ x: pt.x, y: pt.y });
      groupStars.push({
        rx: pt.x - groupCx,
        ry: pt.y - groupCy,
        radius: isAnchor ? between(3.1, 4.2) : between(2.0, 2.9),
        alpha: isAnchor ? between(0.92, 1.0) : between(0.76, 0.94),
        twinkleSpeed: between(1.35, 2.75),
        twinkleRatio: between(1.55, 2.35),
        phase: rnd() * TAU,
        isAnchor,
      });
    }

    const groupEdges: ConstellationEdge[] = validEdges.map(([ia, ib]) => ({
      a: localToGroup.get(ia)!,
      b: localToGroup.get(ib)!,
      alpha: between(0.46, 0.68),
      phase: rnd() * TAU,
    }));

    groups.push({
      cx: groupCx,
      cy: groupCy,
      driftAmpX: between(5.5, 10.0),
      driftAmpY: between(4.5, 9.0),
      driftFreqX: between(0.16, 0.28),
      driftFreqY: between(0.14, 0.25),
      driftPhase: rnd() * TAU,
      rotAmp: between(0.015, 0.032),
      rotFreq: between(0.12, 0.22),
      rotPhase: rnd() * TAU,
      stars: groupStars,
      edges: groupEdges,
    });
  }

  const targetAmbient = clamp(Math.round((width * height) / 25000), 32, 72);
  const ambientStars: AmbientStar[] = [];
  let attempts = 0;
  while (ambientStars.length < targetAmbient && attempts < targetAmbient * 10) {
    attempts++;
    const x = between(pad * 0.55, width - pad * 0.55);
    const y = between(pad * 0.55, height - pad * 0.55);
    if (isPointInConstellationExclusion(x, y, cx, cy, clearR, promptTop, promptHalfW)) continue;
    if (placedStarPositions.some((s) => Math.hypot(x - s.x, y - s.y) < 18)) continue;
    if (ambientStars.some((s) => Math.hypot(x - s.x, y - s.y) < 20)) continue;
    const bright = rnd() < 0.34;
    ambientStars.push({
      x,
      y,
      driftAmpX: between(4, 10),
      driftAmpY: between(4, 9),
      driftFreqX: between(0.18, 0.34),
      driftFreqY: between(0.15, 0.3),
      driftPhase: rnd() * TAU,
      radius: bright ? between(1.65, 2.4) : between(0.95, 1.65),
      alpha: bright ? between(0.74, 0.96) : between(0.44, 0.74),
      twinkleSpeed: between(1.4, 3.1),
      twinkleRatio: between(1.5, 2.4),
      phase: rnd() * TAU,
      hasFlare: bright,
    });
  }

  return { groups, ambientStars };
}

function createProceduralField() {
  const { rnd, gauss, between } = seededHelpers(20261117);

  // Frame 2 curved plasma tendrils peeling off the golden orbital ring
  const orbitalTendrils: OrbitalTendril[] = Array.from({ length: 12 }, (_, i) => ({
    angle: (i / 12) * TAU + between(-0.14, 0.14),
    curl: (i % 2 === 0 ? 1 : -1) * between(0.85, 1.55),
    reachMul: between(1.8, 3.4),
    layer: i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3,
    phase: rnd() * TAU,
  }));

  // Frame 3 differential-foliation (eta in [-1, 1]) 3D logarithmic spiral accretion vortex
  const vortexArms = 4;
  const streamsPerArm = 14;
  const vortexStreams: VortexStream[] = [];
  const vortexLayerBatches: number[][] = DEPTH_LAYERS.map(() => []);

  for (let a = 0; a < vortexArms; a++) {
    const armBase = (a / vortexArms) * TAU + 0.35;
    for (let s = 0; s < streamsPerArm; s++) {
      const eta = (2 * s) / (streamsPerArm - 1) - 1;
      const absEta = Math.abs(eta);
      const layer = absEta <= 0.22 ? 3 : absEta <= 0.56 ? 2 : absEta <= 0.82 ? 1 : 0;
      const idx = vortexStreams.length;
      vortexStreams.push({
        armIdx: a,
        armBase,
        eta,
        reachMul: lerp(1.16, 0.76, absEta * 0.7) * between(0.94, 1.06),
        layer,
        phase: a * 1.45 + eta * 1.25,
      });
      vortexLayerBatches[layer]!.push(idx);
    }
  }

  const vortexBeads: VortexBead[] = Array.from({ length: 68 }, (_, i) => ({
    streamIdx: i % vortexStreams.length,
    u: rnd(),
    speed: between(0.22, 0.48),
    size: i % 9 === 0 ? between(2.4, 3.3) : i % 3 === 0 ? between(1.4, 2.2) : between(0.85, 1.45),
    alpha: between(0.58, 0.98),
    kind: i % 9 === 0 ? "anchor" : i % 3 === 0 ? "star" : "dot",
  }));

  // Frame 4 curved radial plasma sheaves (18 laminar jet clusters x 5 streamlines + 50 outer wisps)
  const sheafRays: SheafFilament[] = [];
  const baseSheafBatches: number[][] = DEPTH_LAYERS.map(() => []);
  const extraSheafBatches: number[][] = DEPTH_LAYERS.map(() => []);

  const clusterCount = 18;
  const strandsPerCluster = 5;
  for (let c = 0; c < clusterCount; c++) {
    const baseAngle = (c / clusterCount) * TAU + Math.sin(c * 2.1) * 0.04;
    const clusterBend = gauss() * 0.28 + (c % 2 === 0 ? 0.08 : -0.08);
    const clusterReach = between(0.82, 1.18) * (1 + 0.14 * Math.abs(Math.cos(baseAngle)));
    const clusterPhase = rnd() * TAU;

    for (let s = 0; s < strandsPerCluster; s++) {
      const eta = (2 * s) / (strandsPerCluster - 1) - 1;
      const absEta = Math.abs(eta);
      const layer = absEta <= 0.1 ? 3 : absEta <= 0.55 ? 2 : c % 3 === 0 ? 0 : 1;
      const idx = sheafRays.length;
      sheafRays.push({
        angle: baseAngle,
        bend: clusterBend + eta * 0.06,
        fanOffset: eta * 0.115,
        waveAmp: between(0.018, 0.046) * (c % 2 === 0 ? 1 : -1),
        freqMul: between(0.9, 1.12),
        phase: clusterPhase + eta * 0.9,
        staggerFinale: 0,
        reachMul: clusterReach * (1 - absEta * 0.12),
        twistDir: c % 2 === 0 ? 1 : -1,
        layer,
        isExtra: false,
      });
      baseSheafBatches[layer]!.push(idx);
    }
  }

  for (let i = 0; i < 50; i++) {
    const baseAngle = ((i + 0.5) / 50) * TAU + gauss() * 0.04;
    const layer = i % 7 === 0 ? 0 : i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3;
    const idx = sheafRays.length;
    sheafRays.push({
      angle: baseAngle,
      bend: gauss() * 0.34,
      fanOffset: gauss() * 0.05,
      waveAmp: between(0.024, 0.068) * (i % 2 === 0 ? -1 : 1),
      freqMul: between(0.86, 1.18),
      phase: rnd() * TAU,
      staggerFinale: between(0.02, 0.54),
      reachMul: between(0.86, 1.24),
      twistDir: i % 2 === 0 ? 1 : -1,
      layer,
      isExtra: true,
    });
    extraSheafBatches[layer]!.push(idx);
  }

  const stardustSparks: StardustSpark[] = Array.from({ length: 135 }, (_, i) => {
    const tier: 0 | 1 | 2 = i % 6 === 0 ? 2 : i % 2 === 0 ? 1 : 0;
    return {
      angle: (i / 135) * TAU + gauss() * 0.038,
      curve: gauss() * 0.14,
      speedMul: between(0.48, 1.32),
      lengthMul: between(0.055, 0.165),
      size: tier === 2 ? between(1.6, 2.2) : tier === 1 ? between(1.0, 1.5) : between(0.65, 1.0),
      alpha: tier === 2 ? between(0.8, 1.0) : tier === 1 ? between(0.55, 0.82) : between(0.35, 0.62),
      tier,
      hasHead: tier === 2 || i % 3 === 0,
    };
  });

  const photons: SheafPhoton[] = Array.from({ length: 160 }, (_, i) => ({
    rayIdx: i % sheafRays.length,
    u: rnd(),
    speed: between(0.11, 0.26),
    size: between(0.95, 1.85),
    alpha: between(0.45, 0.95),
  }));

  // Frames 5 -> 6 -> 7: 3D Perspective Geodesic Cosmic Silk Lattice
  const geodesicCurves: GeodesicCurve[] = [];
  const geodesicLayerBatches: number[][] = DEPTH_LAYERS.map(() => []);
  const uVals: number[] = [];
  const vVals: number[] = [];

  const uRibbonCount = 16;
  for (let j = 0; j < uRibbonCount; j++) {
    const t = j / (uRibbonCount - 1);
    const vRaw = lerp(-0.94, 0.94, t);
    // Keep slight central split so parting opens symmetrically into upper/lower cosmic canopies
    const vCoord = vRaw >= 0 ? Math.max(0.08, vRaw) : Math.min(-0.08, vRaw);
    vVals.push(vCoord);
    const layer = j % 5 === 0 ? 0 : j % 3 === 0 ? 1 : j % 2 === 0 ? 2 : 3;
    const idx = geodesicCurves.length;
    geodesicCurves.push({
      kind: "u",
      fixedCoord: vCoord,
      skew: 0,
      layer,
      phase: j * 0.48,
    });
    geodesicLayerBatches[layer]!.push(idx);
  }

  const vRibbonCount = 16;
  for (let i = 0; i < vRibbonCount; i++) {
    const t = i / (vRibbonCount - 1);
    const uCoord = lerp(-0.96, 0.96, t);
    uVals.push(uCoord);
    const layer = i % 6 === 0 ? 0 : i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3;
    const idx = geodesicCurves.length;
    geodesicCurves.push({
      kind: "v",
      fixedCoord: uCoord,
      skew: (i % 2 === 0 ? 1 : -1) * 0.34,
      layer,
      phase: i * 0.53 + 1.2,
    });
    geodesicLayerBatches[layer]!.push(idx);
  }

  for (let k = 0; k < 8; k++) {
    const offset = lerp(-0.72, 0.72, k / 7);
    const layer = k % 3 === 0 ? 1 : 2;
    const idx = geodesicCurves.length;
    geodesicCurves.push({
      kind: "diag",
      fixedCoord: offset,
      skew: k % 2 === 0 ? 0.82 : -0.82,
      layer,
      phase: k * 0.77,
    });
    geodesicLayerBatches[layer]!.push(idx);
  }

  // Real lattice intersection nodes where U and V arches actually cross
  const geodesicNodes: GeodesicNode[] = [];
  for (let i = 0; i < uVals.length; i += 2) {
    for (let j = 0; j < vVals.length; j += 2) {
      if ((i + j) % 4 === 2) continue;
      const u = uVals[i]!;
      const v = vVals[j]!;
      const isAnchor = (i + j) % 4 === 0 && Math.abs(v) > 0.16 && Math.abs(u) < 0.82;
      const isStar = !isAnchor && (i + j) % 2 === 0;
      geodesicNodes.push({
        u,
        v,
        size: isAnchor ? between(2.3, 3.2) : isStar ? between(1.4, 2.1) : between(1.0, 1.5),
        alpha: isAnchor ? between(0.82, 0.98) : between(0.48, 0.8),
        twinkleSpeed: between(1.2, 2.4),
        phase: rnd() * TAU,
        kind: isAnchor ? "anchor" : isStar ? "star" : "dot",
      });
    }
  }

  return {
    orbitalTendrils,
    vortexStreams,
    vortexLayerBatches,
    vortexBeads,
    sheafRays,
    baseSheafBatches,
    extraSheafBatches,
    stardustSparks,
    photons,
    geodesicCurves,
    geodesicLayerBatches,
    geodesicNodes,
  };
}

function traceSmoothPolylineScratch(
  ctx: CanvasRenderingContext2D,
  xs: Float64Array,
  ys: Float64Array,
  len: number,
) {
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

export const SetupCanvas = memo(function SetupCanvas({
  phase,
  theme,
  impulseSerial = 0,
  onClickSingularity,
  onExplosionComplete,
  onFinaleCollapsed,
  onFinaleExplode,
  onFinaleComplete,
  onCoreLayout,
}: {
  phase: SetupStagePhase;
  theme: "dark" | "light";
  impulseSerial?: number;
  onClickSingularity?: () => void;
  onExplosionComplete?: () => void;
  onFinaleCollapsed?: () => void;
  onFinaleExplode?: () => void;
  onFinaleComplete?: () => void;
  onCoreLayout?: (y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const themeRef = useRef(theme);
  const impulseRef = useRef(impulseSerial);
  const clickCbRef = useRef(onClickSingularity);
  const explosionCbRef = useRef(onExplosionComplete);
  const finaleCollapsedCbRef = useRef(onFinaleCollapsed);
  const finaleExplodeCbRef = useRef(onFinaleExplode);
  const finaleCbRef = useRef(onFinaleComplete);
  const coreLayoutCbRef = useRef(onCoreLayout);
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    themeRef.current = theme;
    impulseRef.current = impulseSerial;
    clickCbRef.current = onClickSingularity;
    explosionCbRef.current = onExplosionComplete;
    finaleCollapsedCbRef.current = onFinaleCollapsed;
    finaleExplodeCbRef.current = onFinaleExplode;
    finaleCbRef.current = onFinaleComplete;
    coreLayoutCbRef.current = onCoreLayout;
    redrawRef.current?.();
  }, [
    phase,
    theme,
    impulseSerial,
    onClickSingularity,
    onExplosionComplete,
    onFinaleCollapsed,
    onFinaleExplode,
    onFinaleComplete,
    onCoreLayout,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createProceduralField();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const maxScratchLen = Math.max(SHEAF_STEPS, GEODESIC_STEPS, VORTEX_STEPS, TENDRIL_STEPS) + 2;
    const scratchXs = new Float64Array(maxScratchLen);
    const scratchYs = new Float64Array(maxScratchLen);

    // Pre-allocated scratch buffers for constellation stars & edges (zero per-frame array allocations)
    const starXs = new Float64Array(16);
    const starYs = new Float64Array(16);
    const starRs = new Float64Array(16);
    const maxEdgeSlots = 64;
    const edgeCoordsA = new Float64Array(maxEdgeSlots * 4);
    const edgeCoordsB = new Float64Array(maxEdgeSlots * 4);

    const atlases: Partial<Record<SetupThemeMode, SetupSpriteAtlas>> = {};
    const getAtlas = (mode: SetupThemeMode): SetupSpriteAtlas => {
      let atlas = atlases[mode];
      if (!atlas) {
        atlas = buildSpriteAtlas(mode);
        atlases[mode] = atlas;
      }
      return atlas;
    };

    // Cached gradients (recreated only on resize / theme change — zero per-frame loop allocations)
    let cachedLightBg: { cx: number; cy: number; diag: number; grad: CanvasGradient } | null = null;
    let cachedWebGrads: { width: number; theme: SetupThemeMode; grads: CanvasGradient[] } | null = null;
    const radialTierFracs = [0.26, 0.48, 0.72, 0.98, 1.28] as const;
    let cachedRadialTiers: {
      cx: number;
      cy: number;
      diag: number;
      theme: SetupThemeMode;
      buckets: Array<CanvasGradient[] | undefined>;
    } | null = null;

    const getLightBgGrad = (cx: number, cy: number, diag: number): CanvasGradient => {
      if (
        cachedLightBg &&
        Math.abs(cachedLightBg.cx - cx) < 0.5 &&
        Math.abs(cachedLightBg.cy - cy) < 0.5 &&
        Math.abs(cachedLightBg.diag - diag) < 0.5
      ) {
        return cachedLightBg.grad;
      }
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, diag * 0.75));
      grad.addColorStop(0, "#fdfcfa");
      grad.addColorStop(0.55, "#f7f6f2");
      grad.addColorStop(1, "#efede7");
      cachedLightBg = { cx, cy, diag, grad };
      return grad;
    };

    const getWebLayerGrads = (mode: SetupThemeMode, p: ThemePalette): CanvasGradient[] => {
      if (cachedWebGrads && cachedWebGrads.theme === mode && Math.abs(cachedWebGrads.width - width) < 0.5) {
        return cachedWebGrads.grads;
      }
      const grads = DEPTH_LAYERS.map((layer) => {
        const col = mixRgb(p.goldMid, p.goldCore, layer.hot);
        const edgeCol = mixRgb(p.goldDeep, p.goldBright, layer.hot * 0.55);
        const lg = ctx.createLinearGradient(0, 0, Math.max(1, width), 0);
        lg.addColorStop(0, `rgba(${edgeCol}, 0.34)`);
        lg.addColorStop(0.24, `rgba(${col}, 0.96)`);
        lg.addColorStop(0.5, `rgba(${col}, 0.84)`);
        lg.addColorStop(0.76, `rgba(${col}, 0.96)`);
        lg.addColorStop(1, `rgba(${edgeCol}, 0.34)`);
        return lg;
      });
      cachedWebGrads = { width, theme: mode, grads };
      return grads;
    };

    const getRadialLayerGrads = (
      cx: number,
      cy: number,
      span: number,
      mode: SetupThemeMode,
      p: ThemePalette,
      boost: number,
    ): CanvasGradient[] => {
      if (
        !cachedRadialTiers ||
        cachedRadialTiers.theme !== mode ||
        Math.abs(cachedRadialTiers.cx - cx) >= 0.5 ||
        Math.abs(cachedRadialTiers.cy - cy) >= 0.5 ||
        Math.abs(cachedRadialTiers.diag - diag) >= 0.5
      ) {
        cachedRadialTiers = { cx, cy, diag, theme: mode, buckets: new Array(radialTierFracs.length) };
      }

      const normSpan = span / Math.max(1, diag);
      let bIdx = radialTierFracs.length - 1;
      for (let i = 0; i < radialTierFracs.length; i++) {
        if (normSpan <= radialTierFracs[i]! * 1.05) {
          bIdx = i;
          break;
        }
      }

      let grads = cachedRadialTiers.buckets[bIdx];
      if (!grads) {
        const bucketSpan = Math.max(8, diag * radialTierFracs[bIdx]!);
        grads = DEPTH_LAYERS.map((layer) => {
          const innerRgb = mixRgb(p.goldMid, p.goldCore, clamp(layer.hot + 0.16 * boost, 0, 1));
          const outerRgb = mixRgb(p.goldDeep, p.goldBright, clamp(layer.hot * 0.55 + 0.2 * boost, 0, 1));
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, bucketSpan);
          rg.addColorStop(0, `rgba(${rgbStr(p.goldCore)}, 1)`);
          rg.addColorStop(0.26, `rgba(${innerRgb}, 0.88)`);
          rg.addColorStop(0.7, `rgba(${outerRgb}, 0.42)`);
          rg.addColorStop(1, `rgba(${outerRgb}, 0)`);
          return rg;
        });
        cachedRadialTiers.buckets[bIdx] = grads;
      }
      return grads;
    };

    let width = 1;
    let height = 1;
    let diag = 1;
    let constellations: ConstellationField = { groups: [], ambientStars: [] };
    let frame = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let smoothTime = 0;
    let wavePhase = 0;
    let vortexSpin = 0;
    let elementActive = true;

    let trackedPhase: SetupStagePhase = phaseRef.current;
    let openAge = trackedPhase === "modal" ? 5 : 0;
    let openBlastFired = trackedPhase !== "singularity" && trackedPhase !== "exploding";
    let openDispatched = trackedPhase !== "exploding";
    let finaleAge = trackedPhase === "finale-blast" ? FINALE_EXPLODE_AT : 0;
    let finaleCollapsedDispatched = trackedPhase === "finale-blast";
    let finaleExplodeDispatched = trackedPhase === "finale-blast";
    let finaleCompleteDispatched = false;
    let finaleBoomLaunched = false;
    let lastImpulse = impulseRef.current;
    let hoverFocus = 0;

    const shockRings: ShockRing[] = [];
    const pointerPos: Vec = { x: -9999, y: -9999 };
    const pointerSmooth: Vec = { x: -9999, y: -9999 };
    let pointerActive = false;
    let pointerPresence = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!pointerActive) {
        pointerSmooth.x = x;
        pointerSmooth.y = y;
      }
      pointerActive = true;
      pointerPos.x = x;
      pointerPos.y = y;
    };

    const onPointerLeave = () => {
      pointerActive = false;
    };

    const onClick = (e: MouseEvent) => {
      if (phaseRef.current !== "singularity" || !clickCbRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const core = computeCoreCenter(width, height);
      if (Math.hypot(x - core.x, y - core.y) <= Math.min(width, height) * 0.22) {
        clickCbRef.current();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    /** Renders outer-sky gold constellations with batched strokes and pre-baked sprites (0 gradient allocs). */
    const renderGoldConstellations = (
      time: number,
      fade: number,
      isLight: boolean,
      p: ThemePalette,
      atlas: SetupSpriteAtlas,
    ) => {
      if (fade <= 0.005 || (constellations.groups.length === 0 && constellations.ambientStars.length === 0)) return;

      const lineStr = rgbStr(p.goldBright);
      const glowLineStr = rgbStr(p.goldMid);
      const lightLift = isLight ? 1.06 : 1.0;

      ctx.save();
      ctx.globalCompositeOperation = p.blendOp;
      ctx.lineCap = "round";

      // Ambient drifting gold dust & subtle 4-point starlets
      for (const star of constellations.ambientStars) {
        const dx = reduceMotion ? 0 : Math.sin(time * star.driftFreqX + star.driftPhase) * star.driftAmpX;
        const dy = reduceMotion ? 0 : Math.cos(time * star.driftFreqY + star.driftPhase * 1.3) * star.driftAmpY;
        const tw = twinkleWave(time, star.twinkleSpeed, star.twinkleRatio, star.phase, reduceMotion);
        const a = clamp(star.alpha * tw * fade * lightLift, 0, 1);
        if (a <= 0.01) continue;
        const r = star.radius * (0.86 + 0.26 * tw);
        if (star.hasFlare) {
          stampSprite(ctx, atlas.goldStarSprite, star.x + dx, star.y + dy, r * 11.2, a);
        } else {
          stampSprite(ctx, atlas.sparkDotSprite, star.x + dx, star.y + dy, r * 8.2, a);
        }
      }

      // Asterism groups: batch edges across all groups into 2 clean passes + stamp sprite stars
      let edgeCountA = 0;
      let edgeCountB = 0;

      // Pass 1: compute live points & render asterism lines first, then stamp crisp star sprites on top
      // To avoid extra passes over groups, first collect edges into flat scratch buffers, then stamp stars
      for (let gIdx = 0; gIdx < constellations.groups.length; gIdx++) {
        const group = constellations.groups[gIdx]!;
        const gdx = reduceMotion ? 0 : Math.sin(time * group.driftFreqX + group.driftPhase) * group.driftAmpX;
        const gdy = reduceMotion ? 0 : Math.cos(time * group.driftFreqY + group.driftPhase * 1.25) * group.driftAmpY;
        const rot = reduceMotion ? 0 : Math.sin(time * group.rotFreq + group.rotPhase) * group.rotAmp;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const gcx = group.cx + gdx;
        const gcy = group.cy + gdy;

        const nStars = Math.min(group.stars.length, starXs.length);
        for (let sIdx = 0; sIdx < nStars; sIdx++) {
          const s = group.stars[sIdx]!;
          const tw = twinkleWave(time, s.twinkleSpeed, s.twinkleRatio, s.phase, reduceMotion);
          starXs[sIdx] = gcx + s.rx * cosR - s.ry * sinR;
          starYs[sIdx] = gcy + s.rx * sinR + s.ry * cosR;
          starRs[sIdx] = s.radius * (0.88 + 0.24 * tw);
        }

        for (let eIdx = 0; eIdx < group.edges.length; eIdx++) {
          const edge = group.edges[eIdx]!;
          const ax = starXs[edge.a]!;
          const ay = starYs[edge.a]!;
          const bx = starXs[edge.b]!;
          const by = starYs[edge.b]!;
          const dx = bx - ax;
          const dy = by - ay;
          const dist = Math.hypot(dx, dy);
          if (dist < 10) continue;
          const trimA = starRs[edge.a]! + 3.4;
          const trimB = starRs[edge.b]! + 3.4;
          if (trimA + trimB >= dist) continue;
          const ux = dx / dist;
          const uy = dy / dist;
          const x0 = ax + ux * trimA;
          const y0 = ay + uy * trimA;
          const x1 = bx - ux * trimB;
          const y1 = by - uy * trimB;

          const linePulse = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(time * 0.9 + edge.phase);
          if (linePulse >= 0.78 && edgeCountA < maxEdgeSlots) {
            const o = edgeCountA * 4;
            edgeCoordsA[o] = x0;
            edgeCoordsA[o + 1] = y0;
            edgeCoordsA[o + 2] = x1;
            edgeCoordsA[o + 3] = y1;
            edgeCountA++;
          } else if (edgeCountB < maxEdgeSlots) {
            const o = edgeCountB * 4;
            edgeCoordsB[o] = x0;
            edgeCoordsB[o + 1] = y0;
            edgeCoordsB[o + 2] = x1;
            edgeCoordsB[o + 3] = y1;
            edgeCountB++;
          }
        }
      }

      // Batched asterism glow aura pass (1 stroke)
      if (edgeCountA + edgeCountB > 0) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        for (let i = 0; i < edgeCountA; i++) {
          const o = i * 4;
          ctx.moveTo(edgeCoordsA[o]!, edgeCoordsA[o + 1]!);
          ctx.lineTo(edgeCoordsA[o + 2]!, edgeCoordsA[o + 3]!);
        }
        for (let i = 0; i < edgeCountB; i++) {
          const o = i * 4;
          ctx.moveTo(edgeCoordsB[o]!, edgeCoordsB[o + 1]!);
          ctx.lineTo(edgeCoordsB[o + 2]!, edgeCoordsB[o + 3]!);
        }
        ctx.lineWidth = isLight ? 2.1 : 2.5;
        ctx.strokeStyle = `rgba(${glowLineStr}, ${clamp(0.16 * fade * (isLight ? 0.82 : 1), 0, 1)})`;
        ctx.stroke();

        // Crisp primary gold filament lines (2 shimmer buckets)
        if (edgeCountA > 0) {
          ctx.beginPath();
          for (let i = 0; i < edgeCountA; i++) {
            const o = i * 4;
            ctx.moveTo(edgeCoordsA[o]!, edgeCoordsA[o + 1]!);
            ctx.lineTo(edgeCoordsA[o + 2]!, edgeCoordsA[o + 3]!);
          }
          ctx.lineWidth = isLight ? 1.05 : 1.18;
          ctx.strokeStyle = `rgba(${lineStr}, ${clamp(0.56 * fade * (isLight ? 0.85 : 1), 0, 1)})`;
          ctx.stroke();
        }
        if (edgeCountB > 0) {
          ctx.beginPath();
          for (let i = 0; i < edgeCountB; i++) {
            const o = i * 4;
            ctx.moveTo(edgeCoordsB[o]!, edgeCoordsB[o + 1]!);
            ctx.lineTo(edgeCoordsB[o + 2]!, edgeCoordsB[o + 3]!);
          }
          ctx.lineWidth = isLight ? 1.0 : 1.1;
          ctx.strokeStyle = `rgba(${lineStr}, ${clamp(0.4 * fade * (isLight ? 0.82 : 1), 0, 1)})`;
          ctx.stroke();
        }
      }

      // Stamp constellation pinpoint stars & 4-point anchor flares
      for (let gIdx = 0; gIdx < constellations.groups.length; gIdx++) {
        const group = constellations.groups[gIdx]!;
        const gdx = reduceMotion ? 0 : Math.sin(time * group.driftFreqX + group.driftPhase) * group.driftAmpX;
        const gdy = reduceMotion ? 0 : Math.cos(time * group.driftFreqY + group.driftPhase * 1.25) * group.driftAmpY;
        const rot = reduceMotion ? 0 : Math.sin(time * group.rotFreq + group.rotPhase) * group.rotAmp;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const gcx = group.cx + gdx;
        const gcy = group.cy + gdy;

        for (let sIdx = 0; sIdx < group.stars.length; sIdx++) {
          const s = group.stars[sIdx]!;
          const tw = twinkleWave(time, s.twinkleSpeed, s.twinkleRatio, s.phase, reduceMotion);
          const a = clamp(s.alpha * tw * fade * lightLift, 0, 1);
          if (a <= 0.01) continue;
          const x = gcx + s.rx * cosR - s.ry * sinR;
          const y = gcy + s.rx * sinR + s.ry * cosR;
          const r = s.radius * (0.88 + 0.24 * tw);
          if (s.isAnchor) {
            stampSprite(ctx, atlas.goldAnchorFlareSprite, x, y, r * 14.8, a);
          } else {
            stampSprite(ctx, atlas.goldStarSprite, x, y, r * 11.4, a);
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    /** Frame 2 orbital plasma ring + outer crescent arc & curved tendrils around igniting or compressed core. */
    const renderOrbitalIgnitionRing = (
      cx: number,
      cy: number,
      ringR: number,
      intensity: number,
      spin: number,
      tendrilGrowth: number,
      tremor: number,
      p: ThemePalette,
      atlas: SetupSpriteAtlas,
    ) => {
      if (intensity <= 0.01 || ringR < 2) return;
      const cStr = rgbStr(p.goldCore);
      const bStr = rgbStr(p.goldBright);
      const mStr = rgbStr(p.goldMid);
      const scaleA = p.alphaScale;

      ctx.globalAlpha = 1;

      // Soft outer plasma torus glow
      ctx.lineWidth = lerp(2.2, 4.4, intensity);
      ctx.strokeStyle = `rgba(${mStr}, ${clamp(0.32 * intensity * scaleA, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, TAU);
      ctx.stroke();

      // Razor-crisp molten golden orbital torus (subtle tremor when holding compressed charge)
      const jitterR = tremor > 0 ? ringR * (1 + tremor * Math.sin(spin * 9.5)) : ringR;
      ctx.lineWidth = lerp(1.0, 1.85, intensity);
      ctx.strokeStyle = `rgba(${cStr}, ${clamp(0.92 * intensity * scaleA, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, jitterR), 0, TAU);
      ctx.stroke();

      // Outer thin orbital crescent arc + counter-arc + orbiting 4-point star bead
      const arcR = ringR * 2.15;
      const arcSpan = Math.PI * 0.94;
      ctx.lineWidth = 0.95;
      ctx.strokeStyle = `rgba(${bStr}, ${clamp(0.48 * intensity * scaleA, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, arcR, spin, spin + arcSpan);
      ctx.stroke();

      const innerArcR = ringR * 1.54;
      ctx.lineWidth = 0.72;
      ctx.strokeStyle = `rgba(${mStr}, ${clamp(0.34 * intensity * scaleA, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, innerArcR, -spin * 0.8 + Math.PI * 0.4, -spin * 0.8 + Math.PI * 1.1);
      ctx.stroke();

      // Curved plasma tendrils peeling off the orbital ring (Frame 2)
      if (tendrilGrowth > 0.02) {
        for (let layerIdx = 1; layerIdx <= 3; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          ctx.beginPath();
          let hasAny = false;
          for (const td of field.orbitalTendrils) {
            if (td.layer !== layerIdx) continue;
            hasAny = true;
            const maxSpan = ringR * lerp(1.15, td.reachMul, tendrilGrowth);
            for (let k = 0; k <= TENDRIL_STEPS; k++) {
              const u = k / TENDRIL_STEPS;
              const r = lerp(ringR * 0.96, maxSpan, Math.pow(u, 0.85));
              const th = td.angle + spin * 0.35 + td.curl * Math.pow(u, 1.25) + 0.08 * Math.sin(u * 4 - spin + td.phase);
              scratchXs[k] = cx + Math.cos(th) * r;
              scratchYs[k] = cy + Math.sin(th) * r;
            }
            traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, TENDRIL_STEPS + 1);
          }
          if (hasAny) {
            ctx.lineWidth = layer.width * 0.95;
            ctx.strokeStyle = `rgba(${mixRgb(p.goldMid, p.goldCore, layer.hot)}, ${clamp(layer.alpha * intensity * tendrilGrowth * scaleA * 1.45, 0, 1)})`;
            ctx.stroke();
          }
        }
      }

      const beadX = cx + Math.cos(spin + arcSpan) * arcR;
      const beadY = cy + Math.sin(spin + arcSpan) * arcR;
      stampSprite(ctx, atlas.goldAnchorFlareSprite, beadX, beadY, 2.2 * intensity * 14.5, clamp(0.92 * intensity, 0, 1));
      ctx.globalAlpha = 1;
    };

    /** Evaluates a 3D foreshortened point on a differential-foliation logarithmic spiral accretion vortex. */
    const projectVortexPoint = (
      stream: VortexStream,
      u: number,
      ringR: number,
      maxSpan: number,
      spinTheta: number,
      direction: 1 | -1,
      waveTime: number,
      cx: number,
      cy: number,
      outX: { value: number },
      outY: { value: number },
    ) => {
      const span = maxSpan * stream.reachMul;
      const r = lerp(ringR * 0.9, span, Math.pow(u, 0.82));
      const logSpiral = Math.log(1 + u * 4.2) * 1.82;
      const spread = stream.eta * (0.06 + 0.32 * Math.pow(u, 0.85));
      const wave = 0.052 * Math.sin(u * 4.6 - waveTime * 2.1 + stream.phase) * Math.pow(u, 0.58);
      const theta = stream.armBase + spinTheta + direction * logSpiral + spread + wave;

      // Local orbital disk coordinates
      const lx = Math.cos(theta) * r;
      const ly = Math.sin(theta) * r;

      // Subtle 3D tilted orbital inclination (like Frame 3 foreshortening)
      const bankCos = 0.978;
      const bankSin = -0.208;
      const tiltCos = 0.79;
      const tiltSin = 0.613;

      const bx = lx * bankCos - ly * bankSin;
      const by = lx * bankSin + ly * bankCos;
      const pyFlat = by * tiltCos;
      const pz = by * tiltSin;
      const persp = diag / Math.max(diag * 0.55, diag + pz * 0.34);

      outX.value = cx + bx * persp;
      outY.value = cy + pyFlat * persp;
    };

    const tmpX = { value: 0 };
    const tmpY = { value: 0 };

    /** Frame 3 differential-foliation 3D logarithmic spiral accretion vortex & orbiting pre-baked star beads. */
    const renderVortexSwirl = (
      cx: number,
      cy: number,
      ringR: number,
      vortexExpand: number,
      vortexAlpha: number,
      spinTheta: number,
      direction: 1 | -1,
      waveTime: number,
      mode: SetupThemeMode,
      p: ThemePalette,
      atlas: SetupSpriteAtlas,
    ) => {
      if (vortexAlpha <= 0.008 || vortexExpand <= 0.008) return;
      const maxSpan = diag * (0.14 + 0.52 * vortexExpand);

      ctx.save();
      ctx.globalCompositeOperation = p.blendOp;

      // Soft spiral nebula mist stamped from pre-baked dustMistSprite (0 gradient allocations!)
      for (let i = 0; i < 8; i++) {
        const theta = spinTheta + (i / 8) * TAU;
        const dist = ringR * 1.45 + maxSpan * 0.28 * vortexExpand;
        const mx = cx + Math.cos(theta) * dist;
        const my = cy + Math.sin(theta) * dist * 0.82;
        const mistSize = clamp(maxSpan * 0.68, 48, 320);
        stampSprite(ctx, atlas.dustMistSprite, mx, my, mistSize, clamp(0.24 * vortexAlpha, 0, 0.45));
      }

      const layerGrads = getRadialLayerGrads(cx, cy, maxSpan * 1.05, mode, p, 0.25);

      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const layer = DEPTH_LAYERS[layerIdx]!;
        const batch = field.vortexLayerBatches[layerIdx]!;
        if (!batch.length) continue;

        ctx.beginPath();
        for (const sIdx of batch) {
          const stream = field.vortexStreams[sIdx]!;
          for (let k = 0; k <= VORTEX_STEPS; k++) {
            const u = k / VORTEX_STEPS;
            projectVortexPoint(stream, u, ringR, maxSpan, spinTheta, direction, waveTime, cx, cy, tmpX, tmpY);
            scratchXs[k] = tmpX.value;
            scratchYs[k] = tmpY.value;
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, VORTEX_STEPS + 1);
        }
        ctx.globalAlpha = clamp(layer.alpha * vortexAlpha * p.alphaScale * 1.55, 0, 1);
        ctx.lineWidth = layer.width * 1.15;
        ctx.strokeStyle = layerGrads[layerIdx]!;
        ctx.stroke();
      }

      // Orbiting 4-point gold star beads & luminous photons stamped from pre-baked sprites
      for (const bead of field.vortexBeads) {
        const stream = field.vortexStreams[bead.streamIdx]!;
        const u = (bead.u + waveTime * bead.speed * 0.34 * direction + 1) % 1;
        projectVortexPoint(stream, u, ringR, maxSpan, spinTheta, direction, waveTime, cx, cy, tmpX, tmpY);
        const fade = Math.sin(u * Math.PI) * vortexAlpha;
        if (fade <= 0.02) continue;
        const a = clamp(bead.alpha * fade, 0, 1);
        if (bead.kind === "anchor") {
          stampSprite(ctx, atlas.goldAnchorFlareSprite, tmpX.value, tmpY.value, bead.size * 14.5, a);
        } else if (bead.kind === "star") {
          stampSprite(ctx, atlas.goldStarSprite, tmpX.value, tmpY.value, bead.size * 11.2, a);
        } else {
          stampSprite(ctx, atlas.sparkDotSprite, tmpX.value, tmpY.value, bead.size * 8.2, a);
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    /** Evaluates one organic curved radial plasma sheaf point (replaces stiff straight blast shafts). */
    const writeSheafPoint = (
      ray: SheafFilament,
      u: number,
      cx: number,
      cy: number,
      maxLen: number,
      burstFrac: number,
      waveTime: number,
      implode: number,
      outIdx: number,
    ) => {
      const uShape = implode > 0 ? Math.pow(u, 1 + 1.12 * implode) : u;
      const r = uShape * maxLen * burstFrac;
      const sway =
        ray.waveAmp *
        (Math.sin(u * 4.4 * ray.freqMul - waveTime * ray.freqMul + ray.phase) * 0.72 +
          Math.cos(u * 6.2 * ray.freqMul - waveTime * 1.12 - ray.phase) * 0.28) *
        Math.pow(u, 0.78);
      const vortex = implode * ray.twistDir * (0.36 + 0.82 * (1 - u)) * 1.05;
      const fan = ray.fanOffset * Math.pow(u, 0.76) * (1 - 0.5 * implode);
      const theta = ray.angle + ray.bend * Math.pow(u, 1.24) + fan + sway + vortex;

      let px = cx + Math.cos(theta) * r;
      let py = cy + Math.sin(theta) * r;

      if (pointerPresence > 0.005 && u > 0.04 && implode < 0.35) {
        const dx = px - pointerSmooth.x;
        const dy = py - pointerSmooth.y;
        const distSq = dx * dx + dy * dy;
        const sigma = Math.min(width, height) * 0.16;
        const twoSigmaSq = 2 * sigma * sigma;
        if (distSq < twoSigmaSq * 3.2) {
          const k = pointerPresence * Math.exp(-distSq / twoSigmaSq) * (1 - Math.exp(-u * 8));
          const dist = Math.sqrt(distSq) + 28;
          const part = 8.5 * k * (1 - implode);
          px += (dx / dist) * part;
          py += (dy / dist) * part;
        }
      }

      scratchXs[outIdx] = px;
      scratchYs[outIdx] = py;
    };

    /**
     * Frame 4 organic curved radial starburst sheaves, concentric spherical shockwave mesh arcs,
     * fast stardust streaks, and soft nova bloom wash (used for both opening blast and transparent finale-blast).
     */
    const renderStarburstExplosion = (
      cx: number,
      cy: number,
      starburstU: number,
      burstEnv: number,
      reach: number,
      waveTime: number,
      mode: SetupThemeMode,
      p: ThemePalette,
      atlas: SetupSpriteAtlas,
      isTerminal: boolean,
    ) => {
      if (burstEnv <= 0.006 || reach < 2) return;

      ctx.save();
      ctx.globalCompositeOperation = p.blendOp;

      // Soft warm supernova mist wash via pre-baked sprite (0 per-frame radial gradients!)
      const novaSize = Math.max(48, reach * 1.56);
      stampSprite(ctx, atlas.dustMistSprite, cx, cy, novaSize, clamp(burstEnv * (isTerminal ? 0.56 : 0.44), 0, 0.72));

      // Batched curved radial plasma sheaves across 4 DEPTH_LAYERS (1 stroke per tier!)
      const layerGrads = getRadialLayerGrads(cx, cy, reach * 1.15, mode, p, 0.9);
      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const layer = DEPTH_LAYERS[layerIdx]!;
        const baseBatch = field.baseSheafBatches[layerIdx]!;
        const extraBatch = field.extraSheafBatches[layerIdx]!;
        if (!baseBatch.length && !extraBatch.length) continue;

        ctx.beginPath();
        for (const rIdx of baseBatch) {
          const ray = field.sheafRays[rIdx]!;
          const maxLen = reach * ray.reachMul;
          for (let k = 0; k <= SHEAF_STEPS; k++) {
            writeSheafPoint(ray, k / SHEAF_STEPS, cx, cy, maxLen, 1, waveTime, 0, k);
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, SHEAF_STEPS + 1);
        }
        for (const rIdx of extraBatch) {
          const ray = field.sheafRays[rIdx]!;
          const maxLen = reach * ray.reachMul * 0.94;
          for (let k = 0; k <= SHEAF_STEPS; k++) {
            writeSheafPoint(ray, k / SHEAF_STEPS, cx, cy, maxLen, 1, waveTime, 0, k);
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, SHEAF_STEPS + 1);
        }

        ctx.globalAlpha = clamp(layer.alpha * burstEnv * p.alphaScale * 1.85, 0, 1);
        ctx.lineWidth = layer.width * (1 + burstEnv * 0.45);
        ctx.strokeStyle = layerGrads[layerIdx]!;
        ctx.stroke();
      }

      // Concentric 3D-foreshortened spherical shock-mesh arcs (Frame 4 geometric detail, batched in 2 strokes)
      ctx.globalAlpha = 1;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          if (s % 2 !== pass) continue;
          const shellFrac = 0.16 + s * 0.14;
          const shellR = reach * shellFrac;
          if (shellR < 10) continue;
          const rotOffset = s * 0.42 + waveTime * (s % 2 === 0 ? 0.16 : -0.14);
          for (let seg = 0; seg < 4; seg++) {
            const a0 = rotOffset + (seg / 4) * TAU + 0.12;
            const a1 = a0 + 0.88;
            const steps = 8;
            for (let k = 0; k <= steps; k++) {
              const th = lerp(a0, a1, k / steps);
              const px = cx + Math.cos(th) * shellR;
              const py = cy + Math.sin(th) * shellR * 0.86;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
          }
        }
        ctx.lineWidth = pass === 0 ? 1.05 : 0.72;
        ctx.strokeStyle = `rgba(${rgbStr(p.goldBright)}, ${clamp((pass === 0 ? 0.3 : 0.2) * burstEnv * p.alphaScale, 0, 0.85)})`;
        ctx.stroke();
      }

      // Fast crisp stardust streaks batched into 3 width/alpha tiers + pre-baked spark heads
      const pRaw = clamp(starburstU / (isTerminal ? 0.68 : 0.62), 0, 1);
      const pEase = 1 - Math.pow(2, -8 * pRaw);
      const streakFade = clamp(burstEnv * (1 - pRaw * 0.35), 0, 1);
      const coreStr = rgbStr(p.goldCore);

      for (let tier = 0; tier < 3; tier++) {
        ctx.beginPath();
        for (const spark of field.stardustSparks) {
          if (spark.tier !== tier) continue;
          const travel = pEase * diag * 0.98 * spark.speedMul;
          const tail = Math.max(0, travel - spark.lengthMul * diag * (1 - pRaw * 0.45));
          const thHead = spark.angle + spark.curve * pEase;
          const thTail = spark.angle + spark.curve * (pEase * 0.65);
          ctx.moveTo(cx + Math.cos(thTail) * tail, cy + Math.sin(thTail) * tail);
          ctx.lineTo(cx + Math.cos(thHead) * travel, cy + Math.sin(thHead) * travel);
        }
        ctx.lineWidth = tier === 2 ? 1.85 : tier === 1 ? 1.2 : 0.78;
        ctx.strokeStyle = `rgba(${coreStr}, ${clamp((tier === 2 ? 0.88 : tier === 1 ? 0.62 : 0.38) * streakFade * p.alphaScale, 0, 1)})`;
        ctx.stroke();
      }

      for (const spark of field.stardustSparks) {
        if (!spark.hasHead) continue;
        const travel = pEase * diag * 0.98 * spark.speedMul;
        const thHead = spark.angle + spark.curve * pEase;
        const hx = cx + Math.cos(thHead) * travel;
        const hy = cy + Math.sin(thHead) * travel;
        stampSprite(ctx, atlas.sparkDotSprite, hx, hy, spark.size * 7.8, clamp(spark.alpha * streakFade, 0, 1));
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    /** Evaluates a 3D perspective point on the geodesic cosmic silk lattice (Frames 5 -> 6 -> 7). */
    const evaluateGeodesicPoint = (
      u: number,
      v: number,
      parting: number,
      swirlPull: number,
      waveTime: number,
      cx: number,
      cy: number,
      outX: { value: number },
      outY: { value: number },
    ) => {
      const minDim = Math.min(width, height);
      const x0 = u * width * 0.64 + v * width * 0.11;
      const y0 = v * height * 0.54 + Math.sin(u * 1.45 + v * 0.6) * height * 0.075;
      const wave =
        Math.sin(u * 2.4 - waveTime * 0.42 + v * 1.9) * height * 0.044 +
        Math.cos(v * 2.8 + waveTime * 0.34 - u * 1.5) * width * 0.022;
      const z =
        minDim * (0.28 * (u * u + v * v - 0.55) + 0.16 * Math.sin(u * 2.1 + v * 1.7 + waveTime * 0.32));

      const camDist = diag * 1.18;
      const persp = camDist / Math.max(camDist * 0.44, camDist + z);

      let px = cx + x0 * persp;
      let py = cy + (y0 + wave) * persp;

      // Clean parting around center modal zone (Frames 6 -> 7)
      if (parting > 0.002) {
        const distNorm = Math.hypot(u * 0.74, v * 1.12);
        const partMask = Math.exp(-distNorm * distNorm * 1.38);
        const vDir = Math.tanh(v * 3.4);
        py += vDir * parting * height * 0.33 * partMask;
        px += u * parting * width * 0.09 * partMask;
      }

      // Subtle cursor deflection on living silk lattice
      if (pointerPresence > 0.005 && swirlPull < 0.35) {
        const dx = px - pointerSmooth.x;
        const dy = py - pointerSmooth.y;
        const distSq = dx * dx + dy * dy;
        const sigma = minDim * 0.17;
        const k = pointerPresence * Math.exp(-distSq / (2 * sigma * sigma));
        if (k > 0.002) {
          const dist = Math.sqrt(distSq) + 28;
          px += (dx / dist) * 11 * k;
          py += (dy / dist) * 11 * k;
        }
      }

      // Harmonic impulse shock ripple across cosmic silk threads
      if (shockRings.length > 0 && swirlPull < 0.2) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy) + 1e-4;
        const ringFrac = dist / Math.max(1, diag * 0.85);
        for (let rIdx = 0; rIdx < shockRings.length; rIdx++) {
          const ring = shockRings[rIdx]!;
          const delta = (ringFrac - ring.u) / 0.12;
          const env = Math.exp(-delta * delta) * ring.strength * (1 - ring.u);
          if (env > 0.005) {
            const push = env * 14 * (1 - swirlPull);
            px += (dx / dist) * push;
            py += (dy / dist) * push;
          }
        }
      }

      // Gravitational vortex collapse during finale implosion
      if (swirlPull > 0.004) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) - swirlPull * (1.35 + 2.8 * (1 - clamp(dist / diag, 0, 1)));
        const rCollapsed = dist * Math.pow(1 - swirlPull, 1.16);
        px = cx + Math.cos(angle) * rCollapsed;
        py = cy + Math.sin(angle) * rCollapsed;
      }

      outX.value = px;
      outY.value = py;
    };

    /** Frames 5 -> 6..7 3D perspective geodesic cosmic silk lattice + real intersection 4-point star nodes. */
    const renderGeodesicSilkLattice = (
      cx: number,
      cy: number,
      alpha: number,
      parting: number,
      swirlPull: number,
      waveTime: number,
      mode: SetupThemeMode,
      p: ThemePalette,
      atlas: SetupSpriteAtlas,
      isLight: boolean,
    ) => {
      if (alpha <= 0.008) return;
      ctx.save();
      ctx.globalCompositeOperation = p.blendOp;

      const webGrads = getWebLayerGrads(mode, p);

      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const layer = DEPTH_LAYERS[layerIdx]!;
        const batch = field.geodesicLayerBatches[layerIdx]!;
        if (!batch.length) continue;

        ctx.beginPath();
        for (const cIdx of batch) {
          const curve = field.geodesicCurves[cIdx]!;
          for (let k = 0; k <= GEODESIC_STEPS; k++) {
            const t = lerp(-1.12, 1.12, k / GEODESIC_STEPS);
            let u = 0;
            let v = 0;
            if (curve.kind === "u") {
              u = t;
              v = curve.fixedCoord + Math.sin(t * 1.45 + curve.phase) * 0.08;
            } else if (curve.kind === "v") {
              u = curve.fixedCoord + t * curve.skew + Math.sin(t * 1.35 + curve.phase) * 0.06;
              v = t;
            } else {
              u = t;
              v = curve.fixedCoord + t * curve.skew;
            }
            evaluateGeodesicPoint(u, v, parting, swirlPull, waveTime, cx, cy, tmpX, tmpY);
            scratchXs[k] = tmpX.value;
            scratchYs[k] = tmpY.value;
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, GEODESIC_STEPS + 1);
        }

        ctx.globalAlpha = clamp(layer.alpha * alpha * p.alphaScale * 1.38, 0, 1);
        ctx.lineWidth = layer.width * (isLight ? 1.12 : 1.02);
        ctx.strokeStyle = webGrads[layerIdx]!;
        ctx.stroke();
      }

      // Luminous 4-point star junctions pinned cleanly at geodesic lattice intersections
      for (const node of field.geodesicNodes) {
        evaluateGeodesicPoint(node.u, node.v, parting, swirlPull, waveTime, cx, cy, tmpX, tmpY);
        const tw = twinkleWave(waveTime, node.twinkleSpeed, 1.75, node.phase, reduceMotion);
        const edgeWindow =
          clamp(1 - Math.abs(node.u) * 0.72, 0.15, 1) * clamp(1 - Math.abs(node.v) * 0.65, 0.15, 1);
        const starAlpha = clamp(node.alpha * tw * alpha * edgeWindow * (1 - swirlPull * 0.25), 0, 1);
        if (starAlpha <= 0.02) continue;
        const size = node.size * (0.9 + 0.22 * tw);
        if (node.kind === "anchor") {
          stampSprite(ctx, atlas.goldAnchorFlareSprite, tmpX.value, tmpY.value, size * 14.5, starAlpha);
        } else if (node.kind === "star") {
          stampSprite(ctx, atlas.goldStarSprite, tmpX.value, tmpY.value, size * 11.2, starAlpha);
        } else {
          stampSprite(ctx, atlas.sparkDotSprite, tmpX.value, tmpY.value, size * 8.2, starAlpha);
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    const draw = (time: number, dt: number, wallDt = dt) => {
      const curPhase = phaseRef.current;
      const prevPhase = trackedPhase;
      const mode: SetupThemeMode = themeRef.current;
      const isLight = mode === "light";
      const p = getThemePalette(mode);
      const atlas = getAtlas(mode);

      if (curPhase !== prevPhase) {
        if (prevPhase === "singularity" && curPhase !== "singularity") {
          openAge = 0;
          openBlastFired = false;
          openDispatched = false;
        }
        if (curPhase === "finale") {
          finaleAge = 0;
          shockRings.length = 0;
          finaleCollapsedDispatched = false;
          finaleExplodeDispatched = false;
          finaleCompleteDispatched = false;
          finaleBoomLaunched = false;
        } else if (curPhase === "finale-blast" && prevPhase !== "finale") {
          finaleAge = FINALE_EXPLODE_AT;
          shockRings.length = 0;
          finaleCollapsedDispatched = true;
          finaleExplodeDispatched = true;
          finaleCompleteDispatched = false;
          finaleBoomLaunched = false;
        } else if (curPhase === "finale-blast" && prevPhase === "finale") {
          // Seamless rAF continuation across finale -> finale-blast with zero clock reset
          finaleAge += wallDt;
        }
        trackedPhase = curPhase;
      } else if (curPhase === "exploding" || curPhase === "modal") {
        openAge += wallDt;
      } else if (curPhase === "finale" || curPhase === "finale-blast") {
        finaleAge += wallDt;
      }

      if (impulseRef.current !== lastImpulse) {
        lastImpulse = impulseRef.current;
        if (curPhase === "modal" && !reduceMotion) {
          shockRings.push({ u: 0.01, speed: 0.9, strength: 0.74, crimson: true });
        }
      }

      if (pointerActive) {
        pointerSmooth.x = lerp(pointerSmooth.x, pointerPos.x, reduceMotion ? 1 : 1 - Math.exp(-dt * 8));
        pointerSmooth.y = lerp(pointerSmooth.y, pointerPos.y, reduceMotion ? 1 : 1 - Math.exp(-dt * 8));
        pointerPresence = lerp(pointerPresence, 1, reduceMotion ? 1 : 1 - Math.exp(-dt * 4));
      } else {
        pointerPresence = lerp(pointerPresence, 0, reduceMotion ? 1 : 1 - Math.exp(-dt * 2.5));
      }

      const core = computeCoreCenter(width, height);
      const cx = core.x;
      const cy = core.y;
      const minDim = Math.min(width, height);
      const coreBaseR = clamp(minDim * 0.14, 58, 118);

      let targetHover = 0;
      if (pointerActive && curPhase === "singularity") {
        const d = Math.hypot(pointerSmooth.x - cx, pointerSmooth.y - cy);
        targetHover = clamp(1 - d / (coreBaseR * 1.45), 0, 1);
      }
      hoverFocus = lerp(hoverFocus, targetHover, reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));

      // Opening beat triggers (Frames 2 -> 3 -> 4 -> 5 -> 6)
      if (curPhase === "exploding" && !reduceMotion && !openBlastFired && openAge >= OPEN_BLAST_AT) {
        openBlastFired = true;
        shockRings.push({ u: 0.01, speed: 1.55, strength: 1.35, crimson: false });
        shockRings.push({ u: 0.0, speed: 1.05, strength: 0.85, crimson: false });
      }
      if (curPhase === "exploding" && !openDispatched && !reduceMotion && openAge >= OPEN_COMPLETE_AT) {
        openDispatched = true;
        explosionCbRef.current?.();
      }

      // Finale choreography parameters ("finale" -> "finale-blast")
      const isFinaleTimeline = curPhase === "finale" || curPhase === "finale-blast";
      const isTransparentBlast = curPhase === "finale-blast";

      const fillU = isFinaleTimeline ? clamp(finaleAge / FINALE_FILL_END, 0, 1) : 0;
      const fillEase = 1 - Math.pow(1 - fillU, 2.0);
      const collapseU =
        isFinaleTimeline && finaleAge > FINALE_COLLAPSE_START
          ? clamp((finaleAge - FINALE_COLLAPSE_START) / (FINALE_COLLAPSE_END - FINALE_COLLAPSE_START), 0, 1)
          : 0;
      const implode = Math.pow(collapseU, 1.45);
      const compressHoldU =
        isFinaleTimeline && finaleAge > FINALE_COLLAPSE_END
          ? clamp((finaleAge - FINALE_COLLAPSE_END) / (FINALE_EXPLODE_AT - FINALE_COLLAPSE_END), 0, 1)
          : 0;
      const raysCollapsed = isFinaleTimeline && finaleAge >= FINALE_COLLAPSE_END;
      const isCollapsedHold =
        isFinaleTimeline && finaleAge >= FINALE_COLLAPSE_END && finaleAge < FINALE_EXPLODE_AT;
      const isFinaleBlasting = isFinaleTimeline && finaleAge >= FINALE_EXPLODE_AT;
      const blastAge = isFinaleBlasting ? finaleAge - FINALE_EXPLODE_AT : 0;
      const blastProgress = isFinaleBlasting ? clamp(blastAge / FINALE_BLAST_DURATION, 0, 1) : 0;
      const blastReachEase = blastProgress > 0 ? 1 - Math.pow(2, -9.0 * clamp(blastAge / 0.65, 0, 1)) : 0;
      // Organic fade from full peak brilliance down to exact 0 alpha across ~1.12s so unmounting overlay is invisible
      const finaleOverlayFade = isFinaleBlasting
        ? Math.pow(clamp(1 - blastProgress, 0, 1), 1.55)
        : 0;

      if (curPhase === "finale" && !reduceMotion && !finaleCollapsedDispatched && finaleAge >= FINALE_COLLAPSE_END) {
        finaleCollapsedDispatched = true;
        finaleCollapsedCbRef.current?.();
      }

      if (curPhase === "finale" && !reduceMotion && !finaleExplodeDispatched && finaleAge >= FINALE_EXPLODE_AT) {
        finaleExplodeDispatched = true;
        finaleExplodeCbRef.current?.();
      }

      if (isFinaleBlasting && !reduceMotion && !finaleBoomLaunched) {
        finaleBoomLaunched = true;
        shockRings.push({ u: 0.01, speed: 2.25, strength: 1.5, crimson: false });
        shockRings.push({ u: 0.0, speed: 1.65, strength: 1.1, crimson: false });
      }

      if (isFinaleTimeline && !finaleCompleteDispatched && !reduceMotion && finaleAge >= FINALE_COMPLETE_AT) {
        finaleCompleteDispatched = true;
        finaleCbRef.current?.();
      }

      // 0. Background: transparent clearRect during "finale-blast" so <NeuralStage> underneath shines cleanly!
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (isTransparentBlast) {
        ctx.clearRect(0, 0, width, height);
        if (reduceMotion) return;
      } else {
        if (isLight) {
          ctx.fillStyle = getLightBgGrad(cx, cy, diag);
        } else {
          ctx.fillStyle = "#000000";
        }
        ctx.fillRect(0, 0, width, height);
      }

      // Gold constellations during "singularity", dissolving smoothly on ignition (0.00 -> 0.34s)
      const constellationFade =
        curPhase === "singularity"
          ? 1
          : curPhase === "exploding" && !reduceMotion
            ? Math.pow(clamp(1 - openAge / OPEN_CONSTELLATION_FADE_END, 0, 1), 1.55)
            : 0;
      if (constellationFade > 0.005) {
        renderGoldConstellations(time, constellationFade, isLight, p, atlas);
      }

      // Continuous monotonic wave & vortex integrators
      const burstTime =
        curPhase === "singularity"
          ? 0
          : reduceMotion
            ? 6
            : Math.max(0, openAge - OPEN_BLAST_AT);
      const isOpeningPreBlast = curPhase === "exploding" && !reduceMotion && openAge < OPEN_BLAST_AT;
      const isOpeningPostBlast =
        (curPhase === "exploding" && (reduceMotion || openAge >= OPEN_BLAST_AT)) || curPhase === "modal";

      if (!reduceMotion) {
        const waveRate =
          curPhase === "singularity"
            ? 0.35
            : isOpeningPreBlast
              ? 0.9 + (openAge / OPEN_BLAST_AT) * 2.2
              : isFinaleTimeline
                ? 0.72 + fillEase * 1.45 + implode * 2.1
                : 0.48 + 0.85 * Math.exp(-burstTime * 1.4);
        wavePhase += dt * waveRate;

        const spinRate = isOpeningPreBlast
          ? 1.4 + Math.pow(openAge / OPEN_BLAST_AT, 1.4) * 5.2
          : isFinaleTimeline && collapseU > 0
            ? 1.6 + implode * 7.2
            : 0.55;
        vortexSpin += dt * spinRate;
      }

      const singPulse =
        curPhase === "singularity" && !reduceMotion
          ? 0.64 * Math.sin(time * 1.48) + 0.36 * Math.sin(time * 2.72 + 0.85)
          : 0;
      const singRipple =
        curPhase === "singularity" && !reduceMotion
          ? 0.6 * Math.sin(time * 1.48 + 0.35) + 0.4 * Math.cos(time * 2.96 - 0.45)
          : 0;

      // 1. Opening Frames 2 -> 3 (Orbital plasma ring, crescent arc, tendrils & 3D logarithmic accretion vortex)
      if (curPhase === "exploding" && !reduceMotion && openAge < OPEN_BLAST_AT + 0.34) {
        const ringBuild = clamp(openAge / OPEN_RING_END, 0, 1);
        const postBlastFade = openAge > OPEN_BLAST_AT ? clamp(1 - (openAge - OPEN_BLAST_AT) / 0.32, 0, 1) : 1;
        const vortexU = clamp((openAge - OPEN_VORTEX_START) / (OPEN_BLAST_AT - OPEN_VORTEX_START), 0, 1);
        const vortexEase = 1 - Math.pow(1 - vortexU, 1.85);
        const ringR = coreBaseR * lerp(0.16, 0.36, ringBuild) * (1 - 0.14 * clamp((openAge - 0.76) / 0.16, 0, 1));

        ctx.save();
        ctx.globalCompositeOperation = p.blendOp;
        renderVortexSwirl(
          cx,
          cy,
          ringR,
          lerp(0.08, 1.08, vortexEase),
          clamp(vortexU * 1.35, 0, 1) * postBlastFade,
          vortexSpin,
          1,
          wavePhase,
          mode,
          p,
          atlas,
        );
        renderOrbitalIgnitionRing(
          cx,
          cy,
          ringR,
          clamp(ringBuild * 1.1, 0, 1) * postBlastFade,
          vortexSpin * 1.35,
          clamp(openAge / 0.3, 0, 1) * (1 - clamp((openAge - 0.35) / 0.4, 0, 1)),
          0,
          p,
          atlas,
        );
        ctx.restore();
      }

      // 2. Frame 4 Curved Radial Explosion Starburst (Opening blast at 0.94s AND Transparent Finale blast at 2.56s)
      const openingBurstAge = curPhase === "exploding" && !reduceMotion ? openAge - OPEN_BLAST_AT : -1;
      const isOpeningBurst = openingBurstAge >= 0 && openingBurstAge < 0.95;

      if (isFinaleBlasting && finaleOverlayFade > 0.005) {
        const reach = blastReachEase * diag * 0.98;
        renderStarburstExplosion(
          cx,
          cy,
          blastAge,
          finaleOverlayFade,
          reach,
          wavePhase,
          mode,
          p,
          atlas,
          true,
        );
      } else if (isOpeningBurst) {
        const burstDuration = 0.85;
        const burstEnv =
          clamp(openingBurstAge / 0.09, 0, 1) * Math.pow(clamp(1 - openingBurstAge / burstDuration, 0, 1), 1.35);
        const reach = (1 - Math.pow(2, -7.5 * clamp(openingBurstAge / 0.62, 0, 1))) * diag * 0.98;
        renderStarburstExplosion(
          cx,
          cy,
          openingBurstAge,
          burstEnv,
          reach,
          wavePhase,
          mode,
          p,
          atlas,
          false,
        );
      }

      // 3. Frames 5 -> 6..7 3D Perspective Geodesic Cosmic Silk Lattice
      let silkAlpha = 0;
      let silkParting = 1;
      let silkSwirlPull = 0;

      if (isOpeningPostBlast) {
        if (curPhase === "exploding" && !reduceMotion) {
          const webIn = clamp((openAge - OPEN_BLAST_AT) / 0.55, 0, 1);
          const partU = clamp((openAge - OPEN_WEB_SETTLE_AT) / (OPEN_COMPLETE_AT - OPEN_WEB_SETTLE_AT), 0, 1);
          silkAlpha = Math.pow(webIn, 0.85) * lerp(1.0, 0.58, partU);
          silkParting = partU * partU * (3 - 2 * partU);
        } else {
          silkAlpha = 0.58;
          silkParting = 1;
        }
      } else if (isFinaleTimeline && !raysCollapsed) {
        silkAlpha = lerp(0.58, 1.05, fillEase) * (1 - Math.pow(collapseU, 2.2));
        silkParting = lerp(1.0, 0.0, clamp(fillEase * 1.25, 0, 1));
        silkSwirlPull = implode * 0.94;
      }

      if (silkAlpha > 0.01) {
        renderGeodesicSilkLattice(
          cx,
          cy,
          silkAlpha,
          silkParting,
          silkSwirlPull,
          wavePhase,
          mode,
          p,
          atlas,
          isLight,
        );
      }

      // 4. Finale Surge & Frame-3 Gravitational Vortex Implosion (0.00 -> 1.88s)
      if (isFinaleTimeline && !raysCollapsed) {
        const outerReach = diag * lerp(0.66, 1.18, fillEase) * (1 - implode);
        const speedBoost = 1 + fillEase * 2.1 + implode * 2.8;
        const widthBoost = 1 + fillEase * 0.65 - implode * 0.42;

        if (outerReach > 3) {
          ctx.save();
          ctx.globalCompositeOperation = p.blendOp;
          const layerGrads = getRadialLayerGrads(cx, cy, Math.max(8, outerReach), mode, p, fillEase);

          for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
            const layer = DEPTH_LAYERS[layerIdx]!;
            const baseBatch = field.baseSheafBatches[layerIdx]!;
            const extraBatch = field.extraSheafBatches[layerIdx]!;
            if (!baseBatch.length && !extraBatch.length) continue;

            ctx.beginPath();
            for (const rayIdx of baseBatch) {
              const ray = field.sheafRays[rayIdx]!;
              const maxLen = outerReach * ray.reachMul;
              for (let k = 0; k <= SHEAF_STEPS; k++) {
                writeSheafPoint(ray, k / SHEAF_STEPS, cx, cy, maxLen, fillEase, wavePhase, implode, k);
              }
              traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, SHEAF_STEPS + 1);
            }
            for (const rayIdx of extraBatch) {
              const ray = field.sheafRays[rayIdx]!;
              const tau = Math.max(0, finaleAge - ray.staggerFinale);
              if (tau <= 0) continue;
              const grow = clamp(1 - Math.exp(-3.4 * tau), 0, 1.04);
              const maxLen = outerReach * ray.reachMul;
              for (let k = 0; k <= SHEAF_STEPS; k++) {
                writeSheafPoint(ray, k / SHEAF_STEPS, cx, cy, maxLen, grow, wavePhase, implode, k);
              }
              traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, SHEAF_STEPS + 1);
            }

            ctx.globalAlpha = clamp(layer.alpha * p.alphaScale * (0.45 + 0.95 * fillEase) * (1 - collapseU * 0.25), 0, 1);
            ctx.lineWidth = layer.width * (isLight ? 1.08 : 0.96) * widthBoost;
            ctx.strokeStyle = layerGrads[layerIdx]!;
            ctx.stroke();
          }

          // Flowing photons streaming outward on fill, then whipping rapidly inward on collapse
          for (const pt of field.photons) {
            const ray = field.sheafRays[pt.rayIdx]!;
            const tau = ray.isExtra ? Math.max(0, finaleAge - ray.staggerFinale) : 2;
            if (tau <= 0) continue;
            const expand = ray.isExtra ? clamp(1 - Math.exp(-3.4 * tau), 0, 1.04) : 1;
            if (!reduceMotion) {
              pt.u = collapseU > 0 ? (pt.u - dt * (0.55 + implode * 2.15) + 1) % 1 : (pt.u + pt.speed * speedBoost * dt) % 1;
            }
            writeSheafPoint(ray, pt.u, cx, cy, outerReach * ray.reachMul, expand, wavePhase, implode, 0);
            const fade = Math.sin(pt.u * Math.PI);
            stampSprite(
              ctx,
              atlas.sparkDotSprite,
              scratchXs[0]!,
              scratchYs[0]!,
              pt.size * (1 + fillEase * 0.38) * 7.8,
              clamp(pt.alpha * fade * fillEase * (isLight ? 0.85 : 1), 0, 1),
            );
          }

          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Swirling Frame-3 gravitational vortex funnel wrapping inward into the orbital eye
        if (collapseU > 0.02) {
          const vortexFadeIn = Math.sin(collapseU * Math.PI);
          const vortexR = coreBaseR * lerp(0.45, 0.16, implode);
          renderVortexSwirl(
            cx,
            cy,
            vortexR,
            1 - implode * 0.94,
            clamp(vortexFadeIn * 1.25, 0, 1),
            vortexSpin,
            -1,
            wavePhase,
            mode,
            p,
            atlas,
          );
          ctx.save();
          ctx.globalCompositeOperation = p.blendOp;
          renderOrbitalIgnitionRing(
            cx,
            cy,
            Math.max(4, coreBaseR * lerp(0.42, 0.165, implode)),
            clamp(lerp(0.18, 0.78, implode), 0, 1),
            vortexSpin,
            0,
            0,
            p,
            atlas,
          );
          ctx.restore();
        }
      }

      // 5. Expanding Shockwave Rings
      ctx.save();
      ctx.globalCompositeOperation = p.blendOp;
      ctx.lineWidth = isFinaleBlasting || isOpeningBurst ? 1.85 : 1.2;
      for (let i = shockRings.length - 1; i >= 0; i--) {
        const ring = shockRings[i]!;
        if (!reduceMotion) ring.u += ring.speed * dt;
        if (ring.u >= 1) {
          shockRings.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - ring.u, 2.4);
        const blastFade = isFinaleBlasting ? finaleOverlayFade : 1;
        const fade = Math.pow(1 - ring.u, 2.0) * ring.strength * blastFade;
        if (fade <= 0.006) continue;
        const c = ring.crimson
          ? mixRgb(p.goldBright, p.crimson, clamp(ring.u * 1.4, 0, 1))
          : rgbStr(p.goldBright);
        ctx.strokeStyle = `rgba(${c}, ${clamp(0.46 * fade * p.alphaScale, 0, 1)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, diag * 0.85 * ease, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      // 6. Central Singularity Core + Horizontal Anamorphic Optical Streak (Zero gradient allocs!)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = p.blendOp;

      let coreScale = 1 + 0.045 * Math.sin(time * 0.85) + 0.14 * hoverFocus;
      let coreFlash = 0;
      let coreAlpha = 1;
      let flareSpan = width * 0.14;
      let flareThickness = 1.5;
      let flareAlpha = 0;
      let flareVertical = 0;

      if (curPhase === "singularity") {
        // Frame 1: Radiant pulsing pinpoint white-gold singularity + razor-crisp horizontal lens flare (NO static halo ring)
        coreScale = 1 + 0.14 * singPulse + 0.16 * hoverFocus;
        flareSpan = Math.min(width * 0.34, coreBaseR * (2.65 + 0.45 * singPulse + 0.72 * hoverFocus));
        flareThickness = 1.3 + 0.28 * singRipple + 0.25 * hoverFocus;
        flareAlpha = clamp((isLight ? 0.74 : 0.92) + 0.08 * singRipple + 0.08 * hoverFocus, 0, 1);
      } else if (curPhase === "exploding") {
        if (!reduceMotion && openAge < OPEN_BLAST_AT) {
          const u = openAge / OPEN_BLAST_AT;
          const squeeze = Math.exp(-u * 2.5);
          coreScale = lerp(0.95, 0.56, Math.sin(clamp(u * 1.4, 0, 1) * Math.PI * 0.5));
          coreFlash = 0.42 + 0.85 * u;
          flareSpan = coreBaseR * (1.8 * squeeze + 2.4 * Math.pow(u, 3));
          flareThickness = 1.6 + 1.4 * Math.pow(u, 2.5);
          flareAlpha = 0.9;
        } else {
          const bU = reduceMotion ? 2 : clamp(burstTime / 0.85, 0, 1);
          const settle = Math.exp(-burstTime * 2.2);
          coreScale = lerp(2.15, 0.78, 1 - settle);
          coreFlash = 1.9 * settle;
          flareSpan = lerp(width * 0.48, Math.min(width * 0.24, coreBaseR * 2.1), 1 - Math.exp(-burstTime * 2.6));
          flareThickness = lerp(3.4, 1.3, 1 - settle);
          flareAlpha = lerp(1.0, 0.46, 1 - settle);
          flareVertical = 0.85 * Math.pow(1 - bU, 1.4);
        }
      } else if (curPhase === "modal") {
        coreScale = 0.78 + 0.04 * Math.sin(time * 0.9);
        coreFlash = 0.08;
        flareSpan = Math.min(width * 0.22, coreBaseR * 1.9);
        flareThickness = 1.18;
        flareAlpha = isLight ? 0.42 : 0.48;
      } else if (isFinaleTimeline) {
        if (!raysCollapsed) {
          const holdU =
            finaleAge > FINALE_FILL_END && finaleAge < FINALE_COLLAPSE_START
              ? (finaleAge - FINALE_FILL_END) / (FINALE_COLLAPSE_START - FINALE_FILL_END)
              : 0;
          const holdBreath = holdU > 0 ? 0.04 * Math.sin(holdU * Math.PI) : 0;
          const expandedScale = lerp(0.86, 1.32, fillEase) + holdBreath;
          const expandedFlash = lerp(0.15, 1.1, fillEase) + holdBreath;
          coreScale = lerp(expandedScale, 0.14, implode);
          coreFlash = lerp(expandedFlash, 1.55, implode);
          flareSpan = lerp(coreBaseR * 2.2, coreBaseR * 0.95, implode);
          flareThickness = lerp(1.4, 1.8, implode);
          flareAlpha = lerp(0.65, 0.95, implode);
        } else if (isCollapsedHold) {
          // 1.88 -> 2.56s: Pure background + ONE taut compacted golden core + trembling photon ring + razor micro-glint
          const charge = compressHoldU > 0.65 ? Math.pow((compressHoldU - 0.65) / 0.35, 1.85) : 0;
          const tremor = (0.014 + 0.028 * charge) * Math.sin(time * (18 + 26 * charge));
          coreScale = 0.135 + tremor * 0.5 - charge * 0.025;
          coreFlash = 1.45 + charge * 0.95;
          flareSpan = coreBaseR * (0.95 + 1.35 * charge);
          flareThickness = 1.05 + 0.85 * charge;
          flareAlpha = 0.92 + 0.08 * charge;

          renderOrbitalIgnitionRing(
            0,
            0,
            Math.max(4, coreBaseR * (0.165 - 0.018 * charge)),
            0.78 + 0.22 * charge,
            time * (2.6 + 3.8 * charge),
            0,
            0.024 + 0.036 * charge,
            p,
            atlas,
          );
        } else {
          // 2.56 -> 3.68s ("finale-blast"): Blazing supernova flash fading organically to 0 over 1.12s
          coreScale = lerp(2.2, 1.25, blastProgress);
          coreFlash = 2.1 * finaleOverlayFade;
          coreAlpha = finaleOverlayFade;
          flareSpan = lerp(width * 0.54, width * 0.28, blastProgress);
          flareThickness = lerp(4.0, 1.4, blastProgress);
          flareAlpha = finaleOverlayFade;
          flareVertical = Math.max(0, 1 - blastProgress * 1.35);
        }
      }

      // Outer optical corona halo (STRICTLY 0 during Frame 1 "singularity" so orb has no static halo ring!)
      const glowHaloIn =
        curPhase === "singularity"
          ? 0
          : isFinaleTimeline
            ? isCollapsedHold
              ? lerp(0.1, 0.34, Math.pow(compressHoldU, 2.4))
              : isFinaleBlasting
                ? finaleOverlayFade
                : clamp(1 - implode * 0.88, 0.14, 1)
            : clamp(openAge / 0.3, 0.06, 1);

      if (glowHaloIn > 0.01 && coreAlpha > 0.005) {
        const haloR = Math.max(4, coreBaseR * (1.18 + 0.34 * coreFlash) * coreScale);
        const haloAlpha = clamp(((isLight ? 0.32 : 0.42) + 0.28 * coreFlash) * glowHaloIn * coreAlpha, 0, 1);
        stampSprite(ctx, atlas.coreHaloSprite, 0, 0, haloR * 2.0813, haloAlpha);
      }

      // Razor-crisp horizontal optical anamorphic streak
      if (flareAlpha > 0.005 && coreAlpha > 0.005) {
        stampAnamorphicFlare(
          ctx,
          atlas,
          0,
          0,
          flareSpan,
          flareThickness,
          flareAlpha * coreAlpha * (isLight ? 0.86 : 1),
          flareVertical,
        );
      }

      // Living white-gold Moffat singularity heart
      if (coreAlpha > 0.005) {
        const orbRadiusMul =
          curPhase === "singularity"
            ? 0.31 + 0.055 * singPulse + 0.045 * hoverFocus
            : 0.32 + 0.05 * hoverFocus + 0.14 * coreFlash;
        const orbR = Math.max(3, coreBaseR * orbRadiusMul * coreScale);
        const orbAlpha =
          curPhase === "singularity"
            ? clamp((isLight ? 0.82 : 0.94) + 0.06 * singRipple + 0.06 * hoverFocus, 0, 1)
            : clamp(((isLight ? 0.86 : 0.98) + 0.1 * hoverFocus + 0.15 * coreFlash) * coreAlpha, 0, 1);

        stampSprite(ctx, atlas.coreMoffatSprite, 0, 0, orbR * 2.0813, orbAlpha);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    const resize = () => {
      const fitted = fitHighResCanvas(canvas, ctx);
      width = fitted.width;
      height = fitted.height;
      diag = Math.hypot(width, height);
      constellations = createConstellationField(width, height);
      coreLayoutCbRef.current?.(computeCoreCenter(width, height).y);
      if (reduceMotion) draw(6, 0, 0);
    };

    const loop = (now: number) => {
      if (!elementActive || reduceMotion) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const wallDt = Math.min(0.25, Math.max(0.001, (now - last) / 1000));
      const rawDt = Math.min(0.033, wallDt);
      last = now;
      smoothDt = lerp(smoothDt, rawDt, 0.16);
      smoothTime += smoothDt;
      draw(smoothTime, smoothDt, wallDt);
      frame = requestAnimationFrame(loop);
    };

    redrawRef.current = reduceMotion ? () => draw(6, 0, 0) : null;

    const stopVisibility = observeCanvasActivity(canvas, (active) => {
      elementActive = active;
      if (active && !reduceMotion && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(loop);
      } else if (!active && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion && elementActive && frame === 0) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopVisibility();
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
      cachedLightBg = null;
      cachedWebGrads = null;
      cachedRadialTiers = null;
      atlases.dark = undefined;
      atlases.light = undefined;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full ${phase === "singularity" ? "cursor-pointer" : ""}`}
      aria-hidden
    />
  );
});
