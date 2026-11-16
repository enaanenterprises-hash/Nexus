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

const SHEAF_STEPS = 12;
const GEODESIC_STEPS = 14;
const VORTEX_STEPS = 12;
const TENDRIL_STEPS = 10;

// Opening arc ("exploding": Frames 2 -> 3 -> 4 -> 5 -> 6, firing onExplosionComplete at ~2.25s)
const OPEN_CONSTELLATION_FADE_END = 0.34;
const OPEN_RING_END = 0.36;
const OPEN_VORTEX_START = 0.16;
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
  { width: 4.4, alpha: 0.058, hot: 0.08 },
  { width: 2.1, alpha: 0.15, hot: 0.35 },
  { width: 1.05, alpha: 0.32, hot: 0.68 },
  { width: 0.48, alpha: 0.58, hot: 0.96 },
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
  reachMul: number;
  layer: number;
};

type BlastPlume = {
  angle: number;
  distFrac: number;
  lenFrac: number;
  widthFrac: number;
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

type SilkWaveStrand = {
  kind: "wave" | "arch" | "diag";
  band: -1 | 1;
  baseCoord: number;
  eta: number;
  skew: number;
  waveFreq: number;
  phase: number;
  layer: number;
};

type SilkNode = {
  u: number;
  v: number;
  band: -1 | 1;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
  kind: "anchor" | "star" | "dot";
};

type SilkPhoton = {
  strandIdx: number;
  t: number;
  speed: number;
  size: number;
  alpha: number;
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

/** Fits canvas up to 2x native DPR so fine gold constellations, filaments, and flares stay sharp and fast. */
function fitHighResCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  // Frame 2 curved plasma tendrils peeling smoothly off the golden orbital ring
  const orbitalTendrils: OrbitalTendril[] = Array.from({ length: 12 }, (_, i) => ({
    angle: (i / 12) * TAU + between(-0.14, 0.14),
    curl: (i % 2 === 0 ? 1 : -1) * between(0.9, 1.65),
    reachMul: between(1.9, 3.5),
    layer: i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3,
    phase: rnd() * TAU,
  }));

  // Frame 3 differential-foliation (eta in [-1, 1]) 3D logarithmic spiral accretion vortex
  // 5 sweeping galactic arms x 12 laminar streamlines wrapping tangentially from the orbital torus
  const vortexArms = 5;
  const streamsPerArm = 12;
  const vortexStreams: VortexStream[] = [];
  const vortexLayerBatches: number[][] = DEPTH_LAYERS.map(() => []);

  for (let a = 0; a < vortexArms; a++) {
    const armBase = (a / vortexArms) * TAU + 0.28;
    for (let s = 0; s < streamsPerArm; s++) {
      const eta = (2 * s) / (streamsPerArm - 1) - 1;
      const absEta = Math.abs(eta);
      const layer = absEta <= 0.22 ? 3 : absEta <= 0.56 ? 2 : absEta <= 0.84 ? 1 : 0;
      const idx = vortexStreams.length;
      vortexStreams.push({
        armIdx: a,
        armBase,
        eta,
        reachMul: lerp(1.18, 0.78, absEta * 0.65) * between(0.95, 1.05),
        layer,
        phase: a * 1.35 + eta * 1.2,
      });
      vortexLayerBatches[layer]!.push(idx);
    }
  }

  const vortexBeads: VortexBead[] = Array.from({ length: 76 }, (_, i) => ({
    streamIdx: i % vortexStreams.length,
    u: rnd(),
    speed: between(0.24, 0.5),
    size: i % 8 === 0 ? between(2.7, 3.8) : i % 3 === 0 ? between(1.6, 2.5) : between(0.95, 1.55),
    alpha: between(0.64, 1.0),
    kind: i % 8 === 0 ? "anchor" : i % 3 === 0 ? "star" : "dot",
  }));

  // Frame 4 curved radial plasma sheaves (18 laminar jet clusters x 5 streamlines) + soft directional plasma plumes
  const sheafRays: SheafFilament[] = [];
  const sheafBatches: number[][] = DEPTH_LAYERS.map(() => []);

  const clusterCount = 18;
  const strandsPerCluster = 5;
  for (let c = 0; c < clusterCount; c++) {
    const baseAngle = (c / clusterCount) * TAU + Math.sin(c * 2.1) * 0.045;
    const clusterBend = gauss() * 0.24 + (c % 2 === 0 ? 0.07 : -0.07);
    const horizontalBias = Math.pow(Math.abs(Math.cos(baseAngle)), 1.5);
    const clusterReach = between(0.76, 1.12) * (1 + 0.16 * horizontalBias);
    const clusterPhase = rnd() * TAU;

    for (let s = 0; s < strandsPerCluster; s++) {
      const eta = (2 * s) / (strandsPerCluster - 1) - 1;
      const absEta = Math.abs(eta);
      const layer = absEta <= 0.1 ? 3 : absEta <= 0.55 ? 2 : c % 3 === 0 ? 0 : 1;
      const idx = sheafRays.length;
      sheafRays.push({
        angle: baseAngle,
        bend: clusterBend + eta * 0.055,
        fanOffset: eta * 0.135,
        waveAmp: between(0.018, 0.044) * (c % 2 === 0 ? 1 : -1),
        freqMul: between(0.9, 1.12),
        phase: clusterPhase + eta * 0.85,
        reachMul: clusterReach * (1 - absEta * 0.12),
        layer,
      });
      sheafBatches[layer]!.push(idx);
    }
  }

  // Soft misty glowing radial plasma plumes (8 sleek horizontal & diagonal jets, fast DPR=2 fill rate)
  const blastPlumes: BlastPlume[] = [];
  const plumeAngles = [0, Math.PI, 0.42, Math.PI - 0.42, -0.42, -Math.PI + 0.42, Math.PI * 0.5, -Math.PI * 0.5];
  for (let i = 0; i < plumeAngles.length; i++) {
    const a = plumeAngles[i]!;
    const isHorizontal = i < 2;
    blastPlumes.push({
      angle: a + gauss() * 0.05,
      distFrac: isHorizontal ? 0.24 : 0.2,
      lenFrac: isHorizontal ? between(0.28, 0.42) : between(0.18, 0.28),
      widthFrac: isHorizontal ? between(0.055, 0.085) : between(0.045, 0.075),
      alpha: isHorizontal ? 0.34 : 0.22,
    });
  }

  // Luminous pinpoint stardust motes & sparkles (zero straight stick needles!)
  const stardustSparks: StardustSpark[] = Array.from({ length: 84 }, (_, i) => {
    const tier: 0 | 1 | 2 = i % 6 === 0 ? 2 : i % 2 === 0 ? 1 : 0;
    return {
      angle: (i / 84) * TAU + gauss() * 0.045,
      curve: gauss() * 0.16,
      speedMul: between(0.42, 1.25),
      lengthMul: 0,
      size: tier === 2 ? between(1.8, 2.6) : tier === 1 ? between(1.1, 1.7) : between(0.7, 1.15),
      alpha: tier === 2 ? between(0.84, 1.0) : tier === 1 ? between(0.6, 0.86) : between(0.4, 0.68),
      tier,
      hasHead: true,
    };
  });

  // Frames 5 -> 6 -> 7: Multi-strand 3D Caustic Silk Wave Ribbons + Crossing Geodesic Arches
  // 8 sweeping wave ribbons x 5 laminar strands (40 strands) + 10 crossing geodesic arch ribbons x 2 strands (20) + 6 diagonal weaves = 66 strands
  const silkStrands: SilkWaveStrand[] = [];
  const silkLayerBatches: number[][] = DEPTH_LAYERS.map(() => []);

  const waveRibbonSpecs: Array<{ band: -1 | 1; base: number; freq: number; phase: number }> = [
    { band: -1, base: -0.22, freq: 1.45, phase: 0.2 },
    { band: -1, base: -0.44, freq: 1.8, phase: 1.35 },
    { band: -1, base: -0.68, freq: 1.3, phase: 2.5 },
    { band: -1, base: -0.9, freq: 1.6, phase: 3.4 },
    { band: 1, base: 0.22, freq: 1.5, phase: 0.85 },
    { band: 1, base: 0.44, freq: 1.75, phase: 2.1 },
    { band: 1, base: 0.68, freq: 1.35, phase: 3.15 },
    { band: 1, base: 0.9, freq: 1.65, phase: 4.1 },
  ];

  for (let wIdx = 0; wIdx < waveRibbonSpecs.length; wIdx++) {
    const spec = waveRibbonSpecs[wIdx]!;
    const strandsInRibbon = 5;
    for (let s = 0; s < strandsInRibbon; s++) {
      const eta = (2 * s) / (strandsInRibbon - 1) - 1;
      const absEta = Math.abs(eta);
      const layer = absEta <= 0.1 ? 3 : absEta <= 0.55 ? 2 : wIdx % 2 === 0 ? 1 : 0;
      const idx = silkStrands.length;
      silkStrands.push({
        kind: "wave",
        band: spec.band,
        baseCoord: spec.base,
        eta,
        skew: 0,
        waveFreq: spec.freq,
        phase: spec.phase,
        layer,
      });
      silkLayerBatches[layer]!.push(idx);
    }
  }

  // Sweeping geodesic arch ribbons crossing diagonally across the upper/lower waves
  for (let a = 0; a < 10; a++) {
    const uBase = lerp(-0.88, 0.88, a / 9);
    for (let s = 0; s < 2; s++) {
      const eta = s === 0 ? -0.45 : 0.45;
      const layer = s === 0 ? 2 : a % 3 === 0 ? 0 : 1;
      const idx = silkStrands.length;
      silkStrands.push({
        kind: "arch",
        band: a % 2 === 0 ? -1 : 1,
        baseCoord: uBase,
        eta,
        skew: (a % 2 === 0 ? 1 : -1) * 0.36,
        waveFreq: 1.4,
        phase: a * 0.62,
        layer,
      });
      silkLayerBatches[layer]!.push(idx);
    }
  }

  for (let d = 0; d < 6; d++) {
    const offset = lerp(-0.66, 0.66, d / 5);
    const layer = d % 2 === 0 ? 1 : 2;
    const idx = silkStrands.length;
    silkStrands.push({
      kind: "diag",
      band: d % 2 === 0 ? -1 : 1,
      baseCoord: offset,
      eta: 0,
      skew: d % 2 === 0 ? 0.58 : -0.58,
      waveFreq: 1.3,
      phase: d * 0.9,
      layer,
    });
    silkLayerBatches[layer]!.push(idx);
  }

  // Luminous 4-point star junctions placed cleanly along the glowing wave ridges & crossings (Frames 5-7)
  const silkNodes: SilkNode[] = [];
  const nodeUs = [-0.82, -0.54, -0.26, 0.04, 0.32, 0.6, 0.84];
  for (let i = 0; i < nodeUs.length; i++) {
    for (let wIdx = 0; wIdx < waveRibbonSpecs.length; wIdx++) {
      if ((i + wIdx) % 2 === 1 && wIdx % 3 !== 0) continue;
      const spec = waveRibbonSpecs[wIdx]!;
      const isMajor = (i + wIdx) % 3 === 0 && Math.abs(spec.base) <= 0.72;
      const isStar = !isMajor && (i + wIdx) % 2 === 0;
      silkNodes.push({
        u: nodeUs[i]! + (wIdx % 2 === 0 ? 0.04 : -0.04),
        v: spec.base,
        band: spec.band,
        size: isMajor ? between(2.7, 3.8) : isStar ? between(1.6, 2.35) : between(1.1, 1.6),
        alpha: isMajor ? between(0.86, 1.0) : between(0.55, 0.85),
        twinkleSpeed: between(1.25, 2.5),
        phase: rnd() * TAU,
        kind: isMajor ? "anchor" : isStar ? "star" : "dot",
      });
    }
  }

  const silkPhotons: SilkPhoton[] = Array.from({ length: 64 }, (_, i) => ({
    strandIdx: i % silkStrands.length,
    t: between(-1.2, 1.2),
    speed: between(0.14, 0.32) * (i % 2 === 0 ? 1 : -1),
    size: between(1.0, 1.85),
    alpha: between(0.5, 0.95),
  }));

  return {
    orbitalTendrils,
    vortexStreams,
    vortexLayerBatches,
    vortexBeads,
    sheafRays,
    sheafBatches,
    blastPlumes,
    stardustSparks,
    silkStrands,
    silkLayerBatches,
    silkNodes,
    silkPhotons,
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

    let cachedLightBg: { cx: number; cy: number; diag: number; grad: CanvasGradient } | null = null;
    let cachedWebGrads: { width: number; theme: SetupThemeMode; grads: CanvasGradient[] } | null = null;
    const radialTierFracs = [0.26, 0.48, 0.72, 0.98, 1.28] as const;
    let cachedRadialTiers: {
      cx: number;
      cy: number;
      diag: number;
      theme: SetupThemeMode;
      softBuckets: Array<CanvasGradient[] | undefined>;
      hardBuckets: Array<CanvasGradient[] | undefined>;
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
      const isLight = mode === "light";
      const grads = DEPTH_LAYERS.map((layer) => {
        const col = isLight
          ? mixRgb(p.goldMid, p.goldBright, layer.hot * 0.75)
          : mixRgb(p.goldMid, p.goldCore, layer.hot);
        const edgeCol = mixRgb(p.goldDeep, p.goldBright, layer.hot * 0.55);
        const lg = ctx.createLinearGradient(0, 0, Math.max(1, width), 0);
        lg.addColorStop(0, `rgba(${edgeCol}, 0.28)`);
        lg.addColorStop(0.22, `rgba(${col}, 0.96)`);
        lg.addColorStop(0.5, `rgba(${col}, 0.88)`);
        lg.addColorStop(0.78, `rgba(${col}, 0.96)`);
        lg.addColorStop(1, `rgba(${edgeCol}, 0.28)`);
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
      softStart: boolean,
    ): CanvasGradient[] => {
      if (
        !cachedRadialTiers ||
        cachedRadialTiers.theme !== mode ||
        Math.abs(cachedRadialTiers.cx - cx) >= 0.5 ||
        Math.abs(cachedRadialTiers.cy - cy) >= 0.5 ||
        Math.abs(cachedRadialTiers.diag - diag) >= 0.5
      ) {
        cachedRadialTiers = {
          cx,
          cy,
          diag,
          theme: mode,
          softBuckets: new Array(radialTierFracs.length),
          hardBuckets: new Array(radialTierFracs.length),
        };
      }

      const normSpan = span / Math.max(1, diag);
      let bIdx = radialTierFracs.length - 1;
      for (let i = 0; i < radialTierFracs.length; i++) {
        if (normSpan <= radialTierFracs[i]! * 1.05) {
          bIdx = i;
          break;
        }
      }

      const bucketStore = softStart ? cachedRadialTiers.softBuckets : cachedRadialTiers.hardBuckets;
      let grads = bucketStore[bIdx];
      if (!grads) {
        const isLight = mode === "light";
        const bucketSpan = Math.max(8, diag * radialTierFracs[bIdx]!);
        grads = DEPTH_LAYERS.map((layer) => {
          const coreRgb = isLight ? rgbStr(p.goldBright) : rgbStr(p.goldCore);
          const innerRgb = isLight
            ? mixRgb(p.goldMid, p.goldBright, clamp(layer.hot * 0.7 + 0.15 * boost, 0, 1))
            : mixRgb(p.goldMid, p.goldCore, clamp(layer.hot + 0.16 * boost, 0, 1));
          const outerRgb = mixRgb(p.goldDeep, p.goldBright, clamp(layer.hot * 0.5 + 0.18 * boost, 0, 1));
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, bucketSpan);
          if (softStart) {
            rg.addColorStop(0, `rgba(${coreRgb}, 0.25)`);
            rg.addColorStop(0.14, `rgba(${coreRgb}, 0.96)`);
          } else {
            rg.addColorStop(0, `rgba(${coreRgb}, 1)`);
          }
          rg.addColorStop(0.32, `rgba(${innerRgb}, 0.85)`);
          rg.addColorStop(0.7, `rgba(${outerRgb}, 0.36)`);
          rg.addColorStop(1, `rgba(${outerRgb}, 0)`);
          return rg;
        });
        bucketStore[bIdx] = grads;
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
    let openDispatched = trackedPhase !== "exploding";
    let finaleAge = trackedPhase === "finale-blast" ? FINALE_EXPLODE_AT : 0;
    let finaleCollapsedDispatched = trackedPhase === "finale-blast";
    let finaleExplodeDispatched = trackedPhase === "finale-blast";
    let finaleCompleteDispatched = false;
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

      let edgeCountA = 0;
      let edgeCountB = 0;

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

    /** Frame 2 orbital plasma ring + outer crescent arc & curved tendrils around igniting singularity. */
    const renderOrbitalIgnitionRing = (
      cx: number,
      cy: number,
      ringR: number,
      intensity: number,
      spin: number,
      tendrilGrowth: number,
      isLight: boolean,
      p: ThemePalette,
      atlas: SetupSpriteAtlas,
    ) => {
      if (intensity <= 0.01 || ringR < 2) return;
      const cStr = rgbStr(isLight ? p.goldBright : p.goldCore);
      const bStr = rgbStr(p.goldBright);
      const mStr = rgbStr(p.goldMid);
      const scaleA = p.alphaScale;

      ctx.globalAlpha = 1;

      // Soft warm torus aura
      ctx.lineWidth = lerp(2.2, 4.4, intensity);
      ctx.strokeStyle = `rgba(${mStr}, ${clamp(0.32 * intensity * scaleA, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, TAU);
      ctx.stroke();

      // Razor-crisp molten photon ring
      ctx.lineWidth = lerp(1.0, 1.85, intensity);
      ctx.strokeStyle = `rgba(${cStr}, ${clamp(0.92 * intensity * scaleA, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, TAU);
      ctx.stroke();

      // Outer thin orbital crescent arc + counter-arc + orbiting 4-point star bead (Frame 2 only)
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
            ctx.lineWidth = layer.width * 0.85;
            ctx.strokeStyle = `rgba(${mixRgb(p.goldMid, isLight ? p.goldBright : p.goldCore, layer.hot)}, ${clamp(layer.alpha * intensity * tendrilGrowth * scaleA * 1.45, 0, 1)})`;
            ctx.stroke();
          }
        }
      }

      const beadX = cx + Math.cos(spin + arcSpan) * arcR;
      const beadY = cy + Math.sin(spin + arcSpan) * arcR;
      stampSprite(ctx, atlas.goldAnchorFlareSprite, beadX, beadY, 2.2 * intensity * 14.5, clamp(0.92 * intensity, 0, 1));
      ctx.globalAlpha = 1;
    };

    const tmpX = { value: 0 };
    const tmpY = { value: 0 };

    /** Evaluates a 3D foreshortened tangential point on the Frame 3 differential-foliation logarithmic spiral vortex. */
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
      // Taper inward smoothly right from r = 0 so arms spiral organically from the core instead of butting into a hard hoop
      const r = lerp(ringR * 0.15, span, Math.pow(u, 1.04));
      const logSpiral = Math.log(1 + u * 5.6) * 2.25;
      const spread = stream.eta * lerp(0.46, 0.24, Math.pow(u, 0.72));
      const wave = 0.048 * Math.sin(u * 4.4 - waveTime * 2.1 + stream.phase) * Math.pow(u, 0.6);
      const theta = stream.armBase + spinTheta + direction * logSpiral + spread + wave;

      const lx = Math.cos(theta) * r;
      const ly = Math.sin(theta) * r;

      // Subtle 3D tilted orbital disk inclination (matches storyboard Frame 3)
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

    /** Frame 3 differential-foliation 3D logarithmic spiral accretion vortex + arm-hugging mist + orbiting star beads. */
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

      // Warm accretion eye glow + spiral-arm mist placed strictly along the 5 active spiral arms (zero gap blobs!)
      stampSprite(ctx, atlas.coreHaloSprite, cx, cy, Math.max(24, ringR * 5.2), clamp(0.54 * vortexAlpha, 0, 0.78));
      for (let a = 0; a < 5; a++) {
        const sStream = field.vortexStreams[a * 12 + 6]!;
        for (const uMist of [0.22, 0.42]) {
          projectVortexPoint(sStream, uMist, ringR, maxSpan, spinTheta, direction, waveTime, cx, cy, tmpX, tmpY);
          const mistSize = clamp(maxSpan * (uMist === 0.22 ? 0.28 : 0.34), 32, 160);
          stampSprite(ctx, atlas.dustMistSprite, tmpX.value, tmpY.value, mistSize, clamp(0.22 * vortexAlpha, 0, 0.36));
        }
      }

      const layerGrads = getRadialLayerGrads(cx, cy, maxSpan * 1.05, mode, p, 0.25, true);

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
        ctx.globalAlpha = clamp(layer.alpha * vortexAlpha * p.alphaScale * 1.45, 0, 1);
        ctx.lineWidth = layer.width * 0.95;
        ctx.strokeStyle = layerGrads[layerIdx]!;
        ctx.stroke();
      }

      // Prominent orbiting 4-point gold star beads & luminous photons along spiral curves
      for (const bead of field.vortexBeads) {
        const stream = field.vortexStreams[bead.streamIdx]!;
        const u = (bead.u + waveTime * bead.speed * 0.34 * direction + 1) % 1;
        projectVortexPoint(stream, u, ringR, maxSpan, spinTheta, direction, waveTime, cx, cy, tmpX, tmpY);
        const fade = Math.sin(u * Math.PI) * vortexAlpha;
        if (fade <= 0.02) continue;
        const a = clamp(bead.alpha * fade, 0, 1);
        if (bead.kind === "anchor") {
          stampSprite(ctx, atlas.goldAnchorFlareSprite, tmpX.value, tmpY.value, bead.size * 15.2, a);
        } else if (bead.kind === "star") {
          stampSprite(ctx, atlas.goldStarSprite, tmpX.value, tmpY.value, bead.size * 11.8, a);
        } else {
          stampSprite(ctx, atlas.sparkDotSprite, tmpX.value, tmpY.value, bead.size * 8.4, a);
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    /** Evaluates one organic curved radial plasma sheaf point for Frame 4 starburst. */
    const writeSheafPoint = (
      ray: SheafFilament,
      u: number,
      cx: number,
      cy: number,
      maxLen: number,
      waveTime: number,
      outIdx: number,
    ) => {
      const r = u * maxLen;
      const sway =
        ray.waveAmp *
        (Math.sin(u * 4.4 * ray.freqMul - waveTime * ray.freqMul + ray.phase) * 0.72 +
          Math.cos(u * 6.2 * ray.freqMul - waveTime * 1.12 - ray.phase) * 0.28) *
        Math.pow(u, 0.78);
      const fan = ray.fanOffset * Math.pow(u, 0.78);
      const theta = ray.angle + ray.bend * Math.pow(u, 1.24) + fan + sway;

      let px = cx + Math.cos(theta) * r;
      let py = cy + Math.sin(theta) * r;

      if (pointerPresence > 0.005 && u > 0.04) {
        const dx = px - pointerSmooth.x;
        const dy = py - pointerSmooth.y;
        const distSq = dx * dx + dy * dy;
        const sigma = Math.min(width, height) * 0.16;
        const twoSigmaSq = 2 * sigma * sigma;
        if (distSq < twoSigmaSq * 3.2) {
          const k = pointerPresence * Math.exp(-distSq / twoSigmaSq) * (1 - Math.exp(-u * 8));
          const dist = Math.sqrt(distSq) + 28;
          const part = 8.5 * k;
          px += (dx / dist) * part;
          py += (dy / dist) * part;
        }
      }

      scratchXs[outIdx] = px;
      scratchYs[outIdx] = py;
    };

    /**
     * Frame 4 organic curved radial starburst plumes, curved plasma sheaves,
     * and luminous stardust particle motes (zero compass circles or needle sticks).
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
      const isLight = mode === "light";

      ctx.save();
      ctx.globalCompositeOperation = p.blendOp;

      // Compact warm central nova wash via pre-baked sprite (keeps DPR=2 fill rate fast!)
      const novaSize = Math.max(48, Math.min(reach * 0.92, Math.max(width, height) * 0.72));
      stampSprite(
        ctx,
        atlas.dustMistSprite,
        cx,
        cy,
        novaSize,
        clamp(burstEnv * (isLight ? 0.24 : isTerminal ? 0.46 : 0.4), 0, 0.58),
      );

      // Elongated soft glowing plasma plumes along major horizontal & diagonal burst jets
      for (const plume of field.blastPlumes) {
        const px = cx + Math.cos(plume.angle) * reach * plume.distFrac;
        const py = cy + Math.sin(plume.angle) * reach * plume.distFrac;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(plume.angle);
        ctx.scale(reach * plume.lenFrac, reach * plume.widthFrac);
        ctx.globalAlpha = clamp(plume.alpha * burstEnv * (isLight ? 0.5 : 0.95), 0, 0.52);
        ctx.drawImage(atlas.dustMistSprite, -0.5, -0.5, 1, 1);
        ctx.restore();
      }

      // Batched curved radial plasma sheaves across 4 DEPTH_LAYERS
      const layerGrads = getRadialLayerGrads(cx, cy, reach * 1.15, mode, p, 0.9, false);
      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const layer = DEPTH_LAYERS[layerIdx]!;
        const batch = field.sheafBatches[layerIdx]!;
        if (!batch.length) continue;

        ctx.beginPath();
        for (const rIdx of batch) {
          const ray = field.sheafRays[rIdx]!;
          const maxLen = reach * ray.reachMul;
          for (let k = 0; k <= SHEAF_STEPS; k++) {
            writeSheafPoint(ray, k / SHEAF_STEPS, cx, cy, maxLen, waveTime, k);
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, SHEAF_STEPS + 1);
        }

        ctx.globalAlpha = clamp(layer.alpha * burstEnv * p.alphaScale * (isLight ? 1.05 : 1.55), 0, 1);
        ctx.lineWidth = layer.width * (isLight ? 0.85 : 1.0 + burstEnv * 0.35);
        ctx.strokeStyle = layerGrads[layerIdx]!;
        ctx.stroke();
      }

      // Luminous pinpoint stardust motes & sparkles bursting radially outward (no stick needles!)
      const pRaw = clamp(starburstU / (isTerminal ? 0.68 : 0.62), 0, 1);
      const pEase = 1 - Math.pow(2, -8 * pRaw);
      const moteFade = clamp(burstEnv * (1 - pRaw * 0.25), 0, 1);

      for (const spark of field.stardustSparks) {
        const travel = pEase * diag * 0.96 * spark.speedMul;
        const thHead = spark.angle + spark.curve * pEase;
        const hx = cx + Math.cos(thHead) * travel;
        const hy = cy + Math.sin(thHead) * travel;
        if (spark.tier === 2) {
          stampSprite(ctx, atlas.goldStarSprite, hx, hy, spark.size * 9.8, clamp(spark.alpha * moteFade, 0, 1));
        } else {
          stampSprite(ctx, atlas.sparkDotSprite, hx, hy, spark.size * 7.6, clamp(spark.alpha * moteFade, 0, 1));
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    };

    /** Evaluates a 3D perspective point on the multi-strand caustic silk lattice (Frames 5 -> 6 -> 7). */
    const evaluateSilkLatticePoint = (
      u: number,
      v: number,
      eta: number,
      parting: number,
      swirlPull: number,
      waveTime: number,
      cx: number,
      cy: number,
      outX: { value: number },
      outY: { value: number },
    ) => {
      const minDim = Math.min(width, height);
      // Pinch silk ribbon thickness gently at periodic focal junctions so additive strands bloom naturally
      const pinch = 0.22 + 0.78 * Math.abs(Math.sin(u * Math.PI * 1.45 + v * 1.2));
      const ribbonThickness = eta * height * 0.036 * pinch;

      const x0 = u * width * 0.78 + v * width * 0.11;
      const y0 = v * height * 0.62 + Math.sin(u * 1.35 + v * 0.6) * height * 0.075 + ribbonThickness;
      const wave =
        Math.sin(u * 2.2 - waveTime * 0.42 + v * 1.85 + eta * 0.55) * height * 0.048 +
        Math.cos(v * 2.6 + waveTime * 0.34 - u * 1.4) * width * 0.022;
      const z =
        minDim * (0.24 * (u * u + v * v - 0.55) + 0.14 * Math.sin(u * 2.0 + v * 1.65 + waveTime * 0.32));

      const camDist = diag * 1.25;
      const persp = camDist / Math.max(camDist * 0.48, camDist + z);

      let px = cx + x0 * persp;
      let py = cy + (y0 + wave) * persp;

      // Clean parting around center modal zone (Frames 6 -> 7)
      if (parting > 0.002) {
        const distNorm = Math.hypot(u * 0.62, v * 1.05);
        const partMask = Math.exp(-distNorm * distNorm * 1.28);
        const vDir = Math.tanh(v * 3.4);
        py += vDir * parting * height * 0.33 * partMask;
        px += u * parting * width * 0.08 * partMask;
      }

      if (pointerPresence > 0.005 && swirlPull < 0.35) {
        const dx = px - pointerSmooth.x;
        const dy = py - pointerSmooth.y;
        const distSq = dx * dx + dy * dy;
        const sigma = minDim * 0.17;
        const k = pointerPresence * Math.exp(-distSq / (2 * sigma * sigma));
        if (k > 0.002) {
          const dist = Math.sqrt(distSq) + 28;
          px += (dx / dist) * 12 * k;
          py += (dy / dist) * 12 * k;
        }
      }

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

      if (swirlPull > 0.004) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) - swirlPull * (1.5 + 3.0 * (1 - clamp(dist / diag, 0, 1)));
        const rCollapsed = dist * Math.pow(1 - swirlPull, 1.2);
        px = cx + Math.cos(angle) * rCollapsed;
        py = cy + Math.sin(angle) * rCollapsed;
      }

      outX.value = px;
      outY.value = py;
    };

    /** Evaluates (u, v) on one SilkWaveStrand at sweep parameter t in [-1.62, 1.62]. */
    const strandUvAt = (strand: SilkWaveStrand, t: number): readonly [number, number] => {
      if (strand.kind === "wave") {
        const u = t;
        const v = strand.baseCoord + Math.sin(t * strand.waveFreq + strand.phase) * 0.11;
        return [u, v];
      }
      if (strand.kind === "arch") {
        const u = strand.baseCoord + t * strand.skew + Math.sin(t * 1.2 + strand.phase) * 0.08;
        const v = t * 0.88;
        return [u, v];
      }
      const u = t;
      const v = strand.baseCoord + t * strand.skew;
      return [u, v];
    };

    /** Frames 5 -> 6..7 Glowing multi-strand 3D caustic silk ribbons, crossing arches, flowing photons & 4-point star junctions. */
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
        const batch = field.silkLayerBatches[layerIdx]!;
        if (!batch.length) continue;

        ctx.beginPath();
        for (const sIdx of batch) {
          const strand = field.silkStrands[sIdx]!;
          for (let k = 0; k <= GEODESIC_STEPS; k++) {
            const t = lerp(-1.62, 1.62, k / GEODESIC_STEPS);
            const [u, v] = strandUvAt(strand, t);
            evaluateSilkLatticePoint(u, v, strand.eta, parting, swirlPull, waveTime, cx, cy, tmpX, tmpY);
            scratchXs[k] = tmpX.value;
            scratchYs[k] = tmpY.value;
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, GEODESIC_STEPS + 1);
        }

        ctx.globalAlpha = clamp(layer.alpha * alpha * p.alphaScale * (isLight ? 1.25 : 1.78), 0, 1);
        ctx.lineWidth = layer.width * (isLight ? 1.05 : 1.02);
        ctx.strokeStyle = webGrads[layerIdx]!;
        ctx.stroke();
      }

      // Luminous photons gliding along the caustic silk ribbons
      for (const pt of field.silkPhotons) {
        const strand = field.silkStrands[pt.strandIdx]!;
        const t = ((((pt.t + waveTime * pt.speed) + 1.4) % 2.8) + 2.8) % 2.8 - 1.4;
        const [u, v] = strandUvAt(strand, t);
        evaluateSilkLatticePoint(u, v, strand.eta, parting, swirlPull, waveTime, cx, cy, tmpX, tmpY);
        const fade = clamp(1 - Math.abs(t) / 1.4, 0, 1) * alpha * (1 - swirlPull * 0.25);
        if (fade <= 0.02) continue;
        stampSprite(ctx, atlas.sparkDotSprite, tmpX.value, tmpY.value, pt.size * 7.6, clamp(pt.alpha * fade, 0, 1));
      }

      // Luminous 4-point star junctions + soft misty golden glow along the wave ridges (Frames 5-7)
      for (const node of field.silkNodes) {
        evaluateSilkLatticePoint(node.u, node.v, 0, parting, swirlPull, waveTime, cx, cy, tmpX, tmpY);
        const tw = twinkleWave(waveTime, node.twinkleSpeed, 1.75, node.phase, reduceMotion);
        const edgeWindow = clamp(1 - Math.abs(node.u) * 0.38, 0.25, 1);
        const starAlpha = clamp(node.alpha * tw * alpha * edgeWindow * (1 - swirlPull * 0.25), 0, 1);
        if (starAlpha <= 0.02) continue;
        const size = node.size * (0.9 + 0.22 * tw);
        if (node.kind === "anchor") {
          stampSprite(ctx, atlas.dustMistSprite, tmpX.value, tmpY.value, size * 24, starAlpha * 0.28);
          stampSprite(ctx, atlas.goldAnchorFlareSprite, tmpX.value, tmpY.value, size * 15.2, starAlpha);
        } else if (node.kind === "star") {
          stampSprite(ctx, atlas.goldStarSprite, tmpX.value, tmpY.value, size * 11.8, starAlpha);
        } else {
          stampSprite(ctx, atlas.sparkDotSprite, tmpX.value, tmpY.value, size * 8.4, starAlpha);
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
          openDispatched = false;
        }
        if (curPhase === "finale") {
          finaleAge = 0;
          shockRings.length = 0;
          finaleCollapsedDispatched = false;
          finaleExplodeDispatched = false;
          finaleCompleteDispatched = false;
        } else if (curPhase === "finale-blast" && prevPhase !== "finale") {
          finaleAge = FINALE_EXPLODE_AT;
          shockRings.length = 0;
          finaleCollapsedDispatched = true;
          finaleExplodeDispatched = true;
          finaleCompleteDispatched = false;
        } else if (curPhase === "finale-blast" && prevPhase === "finale") {
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

      // Opening completion trigger (~2.25s, skipped under reduced motion)
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
      const finaleOverlayFade = isFinaleBlasting ? Math.pow(clamp(1 - blastProgress, 0, 1), 1.55) : 0;

      if (curPhase === "finale" && !reduceMotion && !finaleCollapsedDispatched && finaleAge >= FINALE_COLLAPSE_END) {
        finaleCollapsedDispatched = true;
        finaleCollapsedCbRef.current?.();
      }

      if (curPhase === "finale" && !reduceMotion && !finaleExplodeDispatched && finaleAge >= FINALE_EXPLODE_AT) {
        finaleExplodeDispatched = true;
        finaleExplodeCbRef.current?.();
      }

      if (isFinaleTimeline && !finaleCompleteDispatched && !reduceMotion && finaleAge >= FINALE_COMPLETE_AT) {
        finaleCompleteDispatched = true;
        finaleCbRef.current?.();
      }

      // 0. Background: transparent clearRect during "finale-blast" so <NeuralStage> underneath shines cleanly
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

      // 1. Opening Frames 2 -> 3 (Orbital plasma ring fades smoothly as tangential 3D spiral vortex builds; gone before blast!)
      if (curPhase === "exploding" && !reduceMotion && openAge < OPEN_BLAST_AT + 0.22) {
        const ringBuild = clamp(openAge / OPEN_RING_END, 0, 1);
        const preBlastRingFade = clamp(1 - (openAge - 0.32) / 0.28, 0, 1);
        const postBlastVortexFade = openAge > OPEN_BLAST_AT ? clamp(1 - (openAge - OPEN_BLAST_AT) / 0.22, 0, 1) : 1;
        const vortexU = clamp((openAge - OPEN_VORTEX_START) / (OPEN_BLAST_AT - OPEN_VORTEX_START), 0, 1);
        const vortexEase = 1 - Math.pow(1 - vortexU, 1.85);
        const ringR = coreBaseR * lerp(0.16, 0.32, ringBuild) * (1 - 0.35 * clamp((openAge - 0.55) / 0.35, 0, 1));

        ctx.save();
        ctx.globalCompositeOperation = p.blendOp;
        renderVortexSwirl(
          cx,
          cy,
          ringR,
          lerp(0.08, 1.08, vortexEase),
          clamp(vortexU * 1.35, 0, 1) * postBlastVortexFade,
          vortexSpin,
          1,
          wavePhase,
          mode,
          p,
          atlas,
        );
        if (preBlastRingFade > 0.01) {
          renderOrbitalIgnitionRing(
            cx,
            cy,
            ringR,
            clamp(ringBuild * 1.1, 0, 1) * preBlastRingFade,
            vortexSpin * 1.35,
            clamp(openAge / 0.28, 0, 1) * preBlastRingFade,
            isLight,
            p,
            atlas,
          );
        }
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

      // 3. Frames 5 -> 6..7 3D Multi-Strand Caustic Silk Lattice
      //    Active from opening blast settle through Setup Modal & Finale full-web fill + vortex collapse
      let silkAlpha = 0;
      let silkParting = 1;
      let silkSwirlPull = 0;

      if (isOpeningPostBlast) {
        if (curPhase === "exploding" && !reduceMotion) {
          const webIn = clamp((openAge - OPEN_BLAST_AT) / 0.55, 0, 1);
          const partU = clamp((openAge - OPEN_WEB_SETTLE_AT) / (OPEN_COMPLETE_AT - OPEN_WEB_SETTLE_AT), 0, 1);
          silkAlpha = Math.pow(webIn, 0.85) * lerp(1.18, 0.82, partU);
          silkParting = partU * partU * (3 - 2 * partU);
        } else {
          silkAlpha = 0.82;
          silkParting = 1;
        }
      } else if (isFinaleTimeline && !raysCollapsed) {
        silkAlpha = lerp(0.82, 1.32, fillEase) * (1 - Math.pow(collapseU, 2.2));
        silkParting = lerp(1.0, 0.0, clamp(fillEase * 1.25, 0, 1));
        silkSwirlPull = implode * 0.96;
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

      // 4. Finale Frame-3 Gravitational Vortex Implosion (1.22 -> 1.88s only; 0.00 -> 1.22s stays pure Frame-5 cosmic web!)
      if (isFinaleTimeline && !raysCollapsed && collapseU > 0.015) {
        const vortexFadeIn = Math.sin(collapseU * Math.PI);
        const vortexR = coreBaseR * lerp(0.38, 0.1, implode);
        renderVortexSwirl(
          cx,
          cy,
          vortexR,
          1 - implode * 0.94,
          clamp(vortexFadeIn * 1.35, 0, 1),
          vortexSpin,
          -1,
          wavePhase,
          mode,
          p,
          atlas,
        );
      }

      // 5. Modal Impulse Shockwave Ripples
      if (shockRings.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = p.blendOp;
        ctx.lineWidth = 1.15;
        for (let i = shockRings.length - 1; i >= 0; i--) {
          const ring = shockRings[i]!;
          if (!reduceMotion) ring.u += ring.speed * dt;
          if (ring.u >= 1) {
            shockRings.splice(i, 1);
            continue;
          }
          const ease = 1 - Math.pow(1 - ring.u, 2.4);
          const fade = Math.pow(1 - ring.u, 2.0) * ring.strength;
          if (fade <= 0.006) continue;
          const c = ring.crimson
            ? mixRgb(p.goldBright, p.crimson, clamp(ring.u * 1.4, 0, 1))
            : rgbStr(p.goldBright);
          ctx.strokeStyle = `rgba(${c}, ${clamp(0.38 * fade * p.alphaScale, 0, 1)})`;
          ctx.beginPath();
          ctx.arc(cx, cy, diag * 0.85 * ease, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. Central Singularity Core + Horizontal Anamorphic Optical Streak
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
          coreScale = lerp(expandedScale, 0.22, implode);
          coreFlash = lerp(expandedFlash, 1.45, implode);
          flareSpan = lerp(coreBaseR * 2.2, coreBaseR * 0.75, implode);
          flareThickness = lerp(1.4, 1.45, implode);
          flareAlpha = lerp(0.65, 0.95, implode);
        } else if (isCollapsedHold) {
          // 1.88 -> 2.56s: Pure background + ONE taut compacted pulsing pinpoint core + razor horizontal micro-glint (NO hollow ring!)
          const charge = compressHoldU > 0.56 ? Math.pow((compressHoldU - 0.56) / 0.44, 1.75) : 0;
          const pulse = 0.065 * Math.sin(time * (14 + 22 * charge));
          coreScale = 0.38 + pulse - charge * 0.08;
          coreFlash = 1.25 + charge * 0.95;
          flareSpan = coreBaseR * (1.1 + 1.35 * charge + 0.18 * Math.sin(time * 16));
          flareThickness = 1.0 + 0.65 * charge;
          flareAlpha = 0.9 + 0.1 * charge;
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

      // Outer optical corona halo (STRICTLY 0 during Frame 1 "singularity")
      const glowHaloIn =
        curPhase === "singularity"
          ? 0
          : isFinaleTimeline
            ? isCollapsedHold
              ? lerp(0.18, 0.42, Math.pow(compressHoldU, 2.2))
              : isFinaleBlasting
                ? finaleOverlayFade
                : clamp(1 - implode * 0.82, 0.18, 1)
            : clamp(openAge / 0.3, 0.06, 1);

      if (glowHaloIn > 0.01 && coreAlpha > 0.005) {
        const haloR = Math.max(4, coreBaseR * (1.16 + 0.32 * coreFlash) * coreScale);
        const haloAlpha = clamp(((isLight ? 0.3 : 0.42) + 0.26 * coreFlash) * glowHaloIn * coreAlpha, 0, 1);
        stampSprite(ctx, atlas.coreHaloSprite, 0, 0, haloR * 2.0813, haloAlpha);
      }

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

      if (coreAlpha > 0.005) {
        const orbRadiusMul =
          curPhase === "singularity"
            ? 0.31 + 0.055 * singPulse + 0.045 * hoverFocus
            : 0.32 + 0.05 * hoverFocus + 0.14 * coreFlash;
        const orbR = Math.max(3, coreBaseR * orbRadiusMul * coreScale);
        const orbAlpha =
          curPhase === "singularity"
            ? clamp((isLight ? 0.82 : 0.94) + 0.06 * singRipple + 0.06 * hoverFocus, 0, 1)
            : clamp(((isLight ? 0.88 : 0.98) + 0.1 * hoverFocus + 0.15 * coreFlash) * coreAlpha, 0, 1);

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
