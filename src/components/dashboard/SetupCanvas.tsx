"use client";

import { memo, useEffect, useRef } from "react";
import { clamp, lerp, observeCanvasActivity, seededHelpers, type Vec } from "@/lib/network/geometry";
import { computeCoreCenter } from "./stage-layout";

export type SetupStagePhase = "singularity" | "exploding" | "modal" | "finale";

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const BASE_RAY_COUNT = 168;
const EXTRA_RAY_COUNT = 290;
const RAY_STEPS = 22;

const FINALE_FILL_END = 1.00;
const FINALE_COLLAPSE_START = 1.32;
const FINALE_COLLAPSE_END = 1.92;
const FINALE_EXPLODE_AT = 2.72;
const FINALE_COMPLETE_AT = 2.88;

const CONSTELLATION_DARK_WHITE: Rgb = [255, 255, 255];
const CONSTELLATION_LIGHT_INK: Rgb = [17, 17, 19];

const GOLD_CORE: Rgb = [255, 250, 232];
const GOLD_BRIGHT: Rgb = [255, 224, 156];
const GOLD_MID: Rgb = [246, 182, 74];
const GOLD_DEEP: Rgb = [212, 128, 34];

const GOLD_LIGHT_SPECULAR: Rgb = [142, 78, 4];
const GOLD_LIGHT_BRIGHT: Rgb = [184, 112, 10];
const GOLD_LIGHT_MID: Rgb = [212, 144, 22];
const GOLD_LIGHT_DEEP: Rgb = [232, 174, 52];

const CRIMSON_ACCENT: Rgb = [252, 64, 56];

const DEPTH_LAYERS = [
  { width: 3.1, alpha: 0.048, hot: 0.08 },
  { width: 1.55, alpha: 0.135, hot: 0.34 },
  { width: 0.85, alpha: 0.3, hot: 0.68 },
  { width: 0.42, alpha: 0.62, hot: 0.96 },
] as const;

type RayFilament = {
  angle: number;
  bend: number;
  waveAmp: number;
  freqMul: number;
  phase: number;
  stagger: number;
  staggerFinale: number;
  reachMul: number;
  twistDir: number;
  layer: number;
  isExtra: boolean;
};

type SynapseArc = {
  rayA: number;
  rayB: number;
  u: number;
  stagger: number;
  curve: number;
};

type BurstPhoton = {
  rayIdx: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

type BlastSpark = {
  angle: number;
  speedMul: number;
  lengthMul: number;
  size: number;
  alpha: number;
};

type ShockRing = {
  u: number;
  speed: number;
  strength: number;
  crimson: boolean;
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

/** Fits canvas up to 3x native DPR so high-density star points and constellation lines stay razor-sharp. */
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

/** Seeds prominent floating white constellations in outer sky, clear of singularity & lower prompt negative space. */
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

  // Reserve extra excursion margin so floating drift never enters the singularity halo or lower prompt band
  const maxDrift = 22;
  const clearR = coreBaseR * 1.58 + maxDrift;
  const promptTop = cy + coreBaseR * 0.30 - maxDrift;
  const promptHalfW = Math.min(width * 0.39, 370) + maxDrift;

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

  if (lateralSpace >= 105) {
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
    const groupCx =
      usedIndices.reduce((sum, idx) => sum + candidates[idx]!.x, 0) / usedIndices.length;
    const groupCy =
      usedIndices.reduce((sum, idx) => sum + candidates[idx]!.y, 0) / usedIndices.length;

    const localToGroup = new Map<number, number>();
    const groupStars: ConstellationStar[] = [];

    for (let uIdx = 0; uIdx < usedIndices.length; uIdx++) {
      const localIdx = usedIndices[uIdx]!;
      const pt = candidates[localIdx]!;
      const isAnchor = uIdx === 0 || (uIdx === 2 && rnd() < 0.65);
      localToGroup.set(localIdx, groupStars.length);
      placedStarPositions.push({ x: pt.x, y: pt.y });
      groupStars.push({
        rx: pt.x - groupCx,
        ry: pt.y - groupCy,
        radius: isAnchor ? between(3.1, 4.35) : between(2.05, 3.0),
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
      alpha: between(0.42, 0.62),
      phase: rnd() * TAU,
    }));

    groups.push({
      cx: groupCx,
      cy: groupCy,
      driftAmpX: between(8, 17),
      driftAmpY: between(6, 14),
      driftFreqX: between(0.16, 0.28),
      driftFreqY: between(0.14, 0.25),
      driftPhase: rnd() * TAU,
      rotAmp: between(0.025, 0.055),
      rotFreq: between(0.12, 0.22),
      rotPhase: rnd() * TAU,
      stars: groupStars,
      edges: groupEdges,
    });
  }

  const targetAmbient = clamp(Math.round((width * height) / 28000), 26, 62);
  const ambientStars: AmbientStar[] = [];
  let attempts = 0;
  while (ambientStars.length < targetAmbient && attempts < targetAmbient * 10) {
    attempts++;
    const x = between(pad * 0.6, width - pad * 0.6);
    const y = between(pad * 0.6, height - pad * 0.6);
    if (isPointInConstellationExclusion(x, y, cx, cy, clearR, promptTop, promptHalfW)) continue;
    if (placedStarPositions.some((s) => Math.hypot(x - s.x, y - s.y) < 20)) continue;
    if (ambientStars.some((s) => Math.hypot(x - s.x, y - s.y) < 22)) continue;
    const bright = rnd() < 0.28;
    ambientStars.push({
      x,
      y,
      driftAmpX: between(5, 13),
      driftAmpY: between(4, 11),
      driftFreqX: between(0.18, 0.34),
      driftFreqY: between(0.15, 0.3),
      driftPhase: rnd() * TAU,
      radius: bright ? between(1.8, 2.55) : between(1.05, 1.75),
      alpha: bright ? between(0.72, 0.94) : between(0.44, 0.72),
      twinkleSpeed: between(1.4, 3.1),
      twinkleRatio: between(1.5, 2.4),
      phase: rnd() * TAU,
      hasFlare: bright,
    });
  }

  return { groups, ambientStars };
}

function drawCrispStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  rgb: string,
  withFlare: boolean,
  isAnchor: boolean,
) {
  const haloR = radius * (isAnchor ? 4.8 : withFlare ? 3.8 : 2.8);
  const haloAlpha = alpha * (isAnchor ? 0.42 : 0.28);
  const g = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  g.addColorStop(0, `rgba(${rgb}, ${haloAlpha})`);
  g.addColorStop(0.45, `rgba(${rgb}, ${haloAlpha * 0.32})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, TAU);
  ctx.fill();

  if (withFlare) {
    const spikeLen = radius * (isAnchor ? 4.4 : 3.1);
    const spikeAlpha = alpha * (isAnchor ? 0.78 : 0.56);
    const hg = ctx.createLinearGradient(x - spikeLen, y, x + spikeLen, y);
    hg.addColorStop(0, `rgba(${rgb}, 0)`);
    hg.addColorStop(0.5, `rgba(${rgb}, ${spikeAlpha})`);
    hg.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.strokeStyle = hg;
    ctx.lineWidth = isAnchor ? 1.1 : 0.85;
    ctx.beginPath();
    ctx.moveTo(x - spikeLen, y);
    ctx.lineTo(x + spikeLen, y);
    ctx.stroke();

    const vg = ctx.createLinearGradient(x, y - spikeLen, x, y + spikeLen);
    vg.addColorStop(0, `rgba(${rgb}, 0)`);
    vg.addColorStop(0.5, `rgba(${rgb}, ${spikeAlpha})`);
    vg.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.strokeStyle = vg;
    ctx.beginPath();
    ctx.moveTo(x, y - spikeLen);
    ctx.lineTo(x, y + spikeLen);
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function twinkleWave(time: number, speed: number, ratio: number, phase: number, reduceMotion: boolean) {
  if (reduceMotion) return 1;
  const w1 = 0.5 + 0.5 * Math.sin(time * speed + phase);
  const w2 = 0.5 + 0.5 * Math.sin(time * speed * ratio + phase * 1.63);
  return 0.34 + 0.66 * Math.pow(w1 * 0.65 + w2 * 0.35, 1.35);
}

function renderConstellations(
  ctx: CanvasRenderingContext2D,
  field: ConstellationField,
  time: number,
  fade: number,
  isLight: boolean,
  reduceMotion: boolean,
) {
  if (fade <= 0.005 || (field.groups.length === 0 && field.ambientStars.length === 0)) return;

  const baseRgb = isLight ? CONSTELLATION_LIGHT_INK : CONSTELLATION_DARK_WHITE;
  const rgb = `${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}`;

  ctx.save();
  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";

  for (const star of field.ambientStars) {
    const dx = reduceMotion ? 0 : Math.sin(time * star.driftFreqX + star.driftPhase) * star.driftAmpX;
    const dy = reduceMotion ? 0 : Math.cos(time * star.driftFreqY + star.driftPhase * 1.3) * star.driftAmpY;
    const tw = twinkleWave(time, star.twinkleSpeed, star.twinkleRatio, star.phase, reduceMotion);
    const a = clamp(star.alpha * tw * fade * (isLight ? 0.85 : 1), 0, 1);
    if (a <= 0.01) continue;
    const r = star.radius * (0.85 + 0.3 * tw);
    drawCrispStar(ctx, star.x + dx, star.y + dy, r, a, rgb, star.hasFlare, false);
  }

  for (const group of field.groups) {
    const gdx = reduceMotion ? 0 : Math.sin(time * group.driftFreqX + group.driftPhase) * group.driftAmpX;
    const gdy = reduceMotion ? 0 : Math.cos(time * group.driftFreqY + group.driftPhase * 1.25) * group.driftAmpY;
    const rot = reduceMotion ? 0 : Math.sin(time * group.rotFreq + group.rotPhase) * group.rotAmp;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const cx = group.cx + gdx;
    const cy = group.cy + gdy;

    const livePts = group.stars.map((s) => {
      const tw = twinkleWave(time, s.twinkleSpeed, s.twinkleRatio, s.phase, reduceMotion);
      return {
        x: cx + s.rx * cosR - s.ry * sinR,
        y: cy + s.rx * sinR + s.ry * cosR,
        radius: s.radius * (0.88 + 0.24 * tw),
        alpha: clamp(s.alpha * tw * fade * (isLight ? 0.88 : 1), 0, 1),
        isAnchor: s.isAnchor,
      };
    });

    ctx.lineWidth = isLight ? 1.15 : 1.25;
    for (const edge of group.edges) {
      const pA = livePts[edge.a]!;
      const pB = livePts[edge.b]!;
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const trimA = pA.radius + 3.2;
      const trimB = pB.radius + 3.2;
      if (trimA + trimB >= dist) continue;
      const linePulse = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(time * 0.9 + edge.phase);
      const a = clamp(edge.alpha * linePulse * fade * (isLight ? 0.75 : 1), 0, 1);
      if (a <= 0.008) continue;

      ctx.strokeStyle = `rgba(${rgb}, ${a})`;
      ctx.beginPath();
      ctx.moveTo(pA.x + ux * trimA, pA.y + uy * trimA);
      ctx.lineTo(pB.x - ux * trimB, pB.y - uy * trimB);
      ctx.stroke();
    }

    for (const pt of livePts) {
      if (pt.alpha <= 0.01) continue;
      drawCrispStar(ctx, pt.x, pt.y, pt.radius, pt.alpha, rgb, true, pt.isAnchor);
    }
  }

  ctx.restore();
}

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
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

function createBurstField() {
  const { rnd, gauss, between } = seededHelpers(20261117);

  const rays: RayFilament[] = [];
  const baseLayerBatches: number[][] = DEPTH_LAYERS.map(() => []);
  const extraLayerBatches: number[][] = DEPTH_LAYERS.map(() => []);

  for (let i = 0; i < BASE_RAY_COUNT; i++) {
    const base = (i / BASE_RAY_COUNT) * TAU;
    const bundlePull = Math.sin(base * 12) * 0.045;
    const layer = i % 11 === 0 ? 0 : i % 4 === 0 ? 1 : i % 2 === 0 ? 2 : 3;
    const idx = rays.length;
    rays.push({
      angle: base + bundlePull + gauss() * 0.025,
      bend: gauss() * 0.28,
      waveAmp: between(0.022, 0.068) * (i % 2 === 0 ? 1 : -1),
      freqMul: between(0.86, 1.16),
      phase: rnd() * TAU,
      stagger: between(0, 0.22),
      staggerFinale: 0,
      reachMul: between(0.76, 1.18),
      twistDir: i % 2 === 0 ? 1 : -1,
      layer,
      isExtra: false,
    });
    baseLayerBatches[layer]!.push(idx);
  }

  for (let i = 0; i < EXTRA_RAY_COUNT; i++) {
    const base = ((i + 0.5) / EXTRA_RAY_COUNT) * TAU;
    const bundlePull = Math.sin(base * 16 + 0.8) * 0.055;
    const layer = i % 9 === 0 ? 0 : i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3;
    const idx = rays.length;
    rays.push({
      angle: base + bundlePull + gauss() * 0.036,
      bend: gauss() * 0.36,
      waveAmp: between(0.024, 0.082) * (i % 2 === 0 ? -1 : 1),
      freqMul: between(0.84, 1.24),
      phase: rnd() * TAU,
      stagger: 0,
      staggerFinale: between(0.02, 0.56),
      reachMul: between(0.88, 1.26),
      twistDir: i % 2 === 0 ? 1 : -1,
      layer,
      isExtra: true,
    });
    extraLayerBatches[layer]!.push(idx);
  }

  const totalRays = rays.length;
  const synapses: SynapseArc[] = Array.from({ length: 150 }, (_, i) => {
    const rayA = Math.floor(rnd() * totalRays);
    const stepOffset = (Math.floor(between(1, 5)) * (i % 2 === 0 ? 1 : -1) + totalRays) % totalRays;
    return {
      rayA,
      rayB: (rayA + stepOffset) % totalRays,
      u: between(0.16, 0.92),
      stagger: between(0.12, 0.76),
      curve: between(-0.18, 0.18),
    };
  });

  const photons: BurstPhoton[] = Array.from({ length: 420 }, (_, i) => ({
    rayIdx: i < 200 ? i % BASE_RAY_COUNT : BASE_RAY_COUNT + ((i - 200) % EXTRA_RAY_COUNT),
    u: rnd(),
    speed: between(0.09, 0.24),
    size: between(0.55, 1.7),
    alpha: between(0.38, 0.94),
  }));

  const blastSparks: BlastSpark[] = Array.from({ length: 220 }, () => ({
    angle: rnd() * TAU,
    speedMul: between(0.45, 1.32),
    lengthMul: between(0.06, 0.18),
    size: between(0.8, 2.3),
    alpha: between(0.55, 1.0),
  }));

  return { rays, baseLayerBatches, extraLayerBatches, synapses, photons, blastSparks };
}

export const SetupCanvas = memo(function SetupCanvas({
  phase,
  theme,
  impulseSerial = 0,
  onClickSingularity,
  onFinaleComplete,
  onCoreLayout,
}: {
  phase: SetupStagePhase;
  theme: "dark" | "light";
  impulseSerial?: number;
  onClickSingularity?: () => void;
  onFinaleComplete?: () => void;
  onCoreLayout?: (y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const themeRef = useRef(theme);
  const impulseRef = useRef(impulseSerial);
  const clickCbRef = useRef(onClickSingularity);
  const finaleCbRef = useRef(onFinaleComplete);
  const coreLayoutCbRef = useRef(onCoreLayout);

  useEffect(() => {
    phaseRef.current = phase;
    themeRef.current = theme;
    impulseRef.current = impulseSerial;
    clickCbRef.current = onClickSingularity;
    finaleCbRef.current = onFinaleComplete;
    coreLayoutCbRef.current = onCoreLayout;
  }, [phase, theme, impulseSerial, onClickSingularity, onFinaleComplete, onCoreLayout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createBurstField();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sampleUs = Array.from({ length: RAY_STEPS + 1 }, (_, k) => k / RAY_STEPS);
    const scratchXs = new Float64Array(RAY_STEPS + 1);
    const scratchYs = new Float64Array(RAY_STEPS + 1);

    let width = 1;
    let height = 1;
    let diag = 1;
    let constellations: ConstellationField = { groups: [], ambientStars: [] };
    let frame = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let smoothTime = 0;
    let wavePhase = 0;
    let elementActive = true;

    let trackedPhase: SetupStagePhase = phaseRef.current;
    let explodeStartTime = trackedPhase === "singularity" ? -1 : -10;
    let finaleAge = 0;
    let burstLaunched = trackedPhase !== "singularity";
    let finaleBoomLaunched = false;
    let finaleDispatched = false;
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

    const createMoffat = (
      radius: number,
      coreR: number,
      beta: number,
      peakAlpha: number,
      inner: Rgb,
      mid: Rgb,
      outer: Rgb,
    ) => {
      const safeRadius = Math.max(0.5, radius);
      const safeCoreR = Math.max(0.25, coreR);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, safeRadius);
      const stops = 16;
      for (let i = 0; i <= stops; i++) {
        const u = i / stops;
        const rn = (u * safeRadius) / safeCoreR;
        const moffat = Math.pow(1 + rn * rn, -beta);
        const edgeWindow = 1 - u * u * (3 - 2 * u);
        const a = clamp(peakAlpha * moffat * edgeWindow, 0, 1);
        const rgb = u < 0.35 ? mixRgb(inner, mid, u / 0.35) : mixRgb(mid, outer, (u - 0.35) / 0.65);
        g.addColorStop(u, `rgba(${rgb}, ${a})`);
      }
      return g;
    };

    const writeRayPoint = (
      ray: RayFilament,
      u: number,
      cx: number,
      cy: number,
      maxLen: number,
      burstFrac: number,
      waveTime: number,
      implode: number,
      outIdx: number,
    ) => {
      const uShape = implode > 0 ? Math.pow(u, 1 + 1.15 * implode) : u;
      const r = uShape * maxLen * burstFrac;
      const sway =
        ray.waveAmp *
        (Math.sin(u * 4.2 * ray.freqMul - waveTime * ray.freqMul + ray.phase) * 0.72 +
          Math.cos(u * 6.4 * ray.freqMul - waveTime * 1.15 - ray.phase) * 0.28) *
        Math.pow(u, 0.78);
      const vortex = implode * ray.twistDir * (0.28 + 0.65 * (1 - u)) * 0.9;
      const theta = ray.angle + ray.bend * Math.pow(u, 1.15) + sway + vortex;

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

    const draw = (time: number, dt: number, wallDt = dt) => {
      const curPhase = phaseRef.current;
      const isLight = themeRef.current === "light";

      if (curPhase !== trackedPhase) {
        if (trackedPhase === "singularity" && curPhase !== "singularity") {
          explodeStartTime = time;
          burstLaunched = false;
        }
        if (curPhase === "finale") {
          finaleAge = 0;
          shockRings.length = 0;
          finaleBoomLaunched = false;
          finaleDispatched = false;
        }
        trackedPhase = curPhase;
      } else if (curPhase === "finale") {
        finaleAge += wallDt;
      }

      if (impulseRef.current !== lastImpulse) {
        lastImpulse = impulseRef.current;
        if (curPhase !== "singularity" && curPhase !== "finale" && !reduceMotion) {
          shockRings.push({ u: 0.01, speed: 0.85, strength: 0.7, crimson: true });
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
      const explodeAge = curPhase === "singularity" ? 0 : Math.max(0, time - explodeStartTime);

      const minDim = Math.min(width, height);
      const coreBaseR = clamp(minDim * 0.14, 58, 118);

      let targetHover = 0;
      if (pointerActive && curPhase === "singularity") {
        const d = Math.hypot(pointerSmooth.x - cx, pointerSmooth.y - cy);
        targetHover = clamp(1 - d / (coreBaseR * 1.25), 0, 1);
      }
      hoverFocus = lerp(hoverFocus, targetHover, reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));

      // Finale choreography phases: fill screen -> brief expanded hold -> collapse to point -> hold pinched point -> explode
      const isFinale = curPhase === "finale";
      const fillU = isFinale ? clamp(finaleAge / FINALE_FILL_END, 0, 1) : 0;
      const fillEase = 1 - Math.pow(1 - fillU, 2.1);
      const collapseU =
        isFinale && finaleAge > FINALE_COLLAPSE_START
          ? clamp((finaleAge - FINALE_COLLAPSE_START) / (FINALE_COLLAPSE_END - FINALE_COLLAPSE_START), 0, 1)
          : 0;
      const implode = Math.pow(collapseU, 1.45);
      const compressHoldU =
        isFinale && finaleAge > FINALE_COLLAPSE_END
          ? clamp((finaleAge - FINALE_COLLAPSE_END) / (FINALE_EXPLODE_AT - FINALE_COLLAPSE_END), 0, 1)
          : 0;
      const raysCollapsed = isFinale && finaleAge >= FINALE_COLLAPSE_END;
      const isCollapsedHold =
        isFinale && finaleAge >= FINALE_COLLAPSE_END && finaleAge < FINALE_EXPLODE_AT;
      const isBlasting = isFinale && finaleAge >= FINALE_EXPLODE_AT;
      const blastU = isBlasting
        ? clamp((finaleAge - FINALE_EXPLODE_AT) / 0.44, 0, 1)
        : 0;
      const blastEase = blastU > 0 ? 1 - Math.pow(2, -9 * blastU) : 0;

      if (isBlasting && !reduceMotion && !finaleBoomLaunched) {
        finaleBoomLaunched = true;
        shockRings.push({ u: 0.01, speed: 2.35, strength: 1.55, crimson: false });
        shockRings.push({ u: 0.0, speed: 1.75, strength: 1.15, crimson: false });
      }

      if (isFinale && !finaleDispatched && !reduceMotion && finaleAge >= FINALE_COMPLETE_AT) {
        finaleDispatched = true;
        finaleCbRef.current?.();
      }

      // Background
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (isLight) {
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * 0.75);
        bgGrad.addColorStop(0, "#fdfcfa");
        bgGrad.addColorStop(0.55, "#f7f6f2");
        bgGrad.addColorStop(1, "#efede7");
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = "#000000";
      }
      ctx.fillRect(0, 0, width, height);

      // 0. Delicate background constellations in outer sky during "singularity", fading gently on early "exploding"
      const constellationFade =
        curPhase === "singularity"
          ? 1
          : curPhase === "exploding" && !reduceMotion
            ? Math.pow(clamp(1 - explodeAge / 0.56, 0, 1), 1.65)
            : 0;
      if (constellationFade > 0.005) {
        renderConstellations(ctx, constellations, time, constellationFade, isLight, reduceMotion);
      }

      const goldCore = isLight ? GOLD_LIGHT_SPECULAR : GOLD_CORE;
      const goldBright = isLight ? GOLD_LIGHT_BRIGHT : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.55 : 1.0;

      // Substage energy parameters — dual-harmonic living pulse during initial "singularity"
      const singPulse =
        curPhase === "singularity" && !reduceMotion
          ? 0.64 * Math.sin(time * 1.48) + 0.36 * Math.sin(time * 2.72 + 0.85)
          : 0;
      const singRipple =
        curPhase === "singularity" && !reduceMotion
          ? 0.6 * Math.sin(time * 1.48 + 0.35) + 0.4 * Math.cos(time * 2.96 - 0.45)
          : 0;

      let coreScale =
        curPhase === "singularity"
          ? 1 + 0.14 * singPulse + 0.15 * hoverFocus
          : 1 + 0.045 * Math.sin(time * 0.85) + 0.14 * hoverFocus;
      let coreFlash = 0;
      let burstTime = 0;

      if (curPhase !== "singularity") {
        if (explodeAge < 0.14 && !reduceMotion) {
          const p = explodeAge / 0.14;
          coreScale = lerp(1, 0.68, Math.sin(p * Math.PI * 0.5));
          coreFlash = p * 0.6;
        } else {
          burstTime = reduceMotion ? 6 : Math.max(0, explodeAge - 0.14);
          if (!burstLaunched && !reduceMotion) {
            burstLaunched = true;
            shockRings.push({ u: 0.01, speed: 1.05, strength: 1.0, crimson: false });
            shockRings.push({ u: 0.0, speed: 0.78, strength: 0.68, crimson: false });
          }
          const settle = Math.exp(-burstTime * 2.1);
          coreFlash = settle * 1.1;
          coreScale = 1 + 0.035 * Math.sin(time * 0.7) + 0.22 * settle;
        }
      }

      if (isFinale) {
        if (!raysCollapsed) {
          const holdU =
            finaleAge > FINALE_FILL_END && finaleAge < FINALE_COLLAPSE_START
              ? (finaleAge - FINALE_FILL_END) / (FINALE_COLLAPSE_START - FINALE_FILL_END)
              : 0;
          const holdBreath = holdU > 0 ? 0.045 * Math.sin(holdU * Math.PI) : 0;
          const expandedScale = lerp(1.0, 1.34, fillEase) + holdBreath;
          const expandedFlash = lerp(0.18, 1.15, fillEase) + holdBreath;
          coreScale = lerp(expandedScale, 0.085, implode);
          coreFlash = lerp(Math.max(coreFlash, expandedFlash), 1.55, implode);
        } else if (isCollapsedHold) {
          const charge = compressHoldU > 0.78 ? Math.pow((compressHoldU - 0.78) / 0.22, 2) : 0;
          const tensionPulse = 0.008 * Math.sin(compressHoldU * Math.PI * 3) * (1 - charge);
          coreScale = 0.085 + tensionPulse - charge * 0.012;
          coreFlash = 1.55 + charge * 0.65;
        } else {
          coreScale = 0.09 + blastEase * 2.55;
          coreFlash = 2.4 * (1 - blastU * 0.45);
        }
      }

      if (!reduceMotion) {
        const waveRate =
          curPhase === "singularity"
            ? 0.35
            : isFinale
              ? 0.75 + fillEase * 1.45 + implode * 1.8
              : 0.48 + 0.8 * Math.exp(-burstTime * 1.6);
        wavePhase += dt * waveRate;
      }

      // Finale saturation veil under dense neural web as the screen fills
      if (isFinale && !raysCollapsed) {
        const veilAlpha = clamp(Math.pow(fillEase, 1.6) * 0.38 * (1 - implode), 0, 0.42);
        if (veilAlpha > 0.005) {
          ctx.globalCompositeOperation = blendOp;
          const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * lerp(0.55, 1.05, fillEase));
          vg.addColorStop(0, `rgba(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}, ${veilAlpha * 1.1})`);
          vg.addColorStop(0.55, `rgba(${goldMid[0]}, ${goldMid[1]}, ${goldMid[2]}, ${veilAlpha * 0.72})`);
          vg.addColorStop(1, `rgba(${goldDeep[0]}, ${goldDeep[1]}, ${goldDeep[2]}, ${veilAlpha * 0.32})`);
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, width, height);
        }
      }

      // 1. Omnidirectional flowing neural lines + finale overgrowth & collapse
      if (curPhase !== "singularity" && !raysCollapsed && (burstTime > 0 || reduceMotion)) {
        const outerReach = diag * lerp(0.82, 1.24, fillEase) * (1 - implode);
        const speedBoost = 1 + 2.4 * Math.exp(-burstTime * 1.5) + fillEase * 2.1 + implode * 2.6;
        const widthBoost = 1 + fillEase * 0.82 - implode * 0.45;
        const edgeStopAlpha = lerp(0, 0.78, Math.pow(fillEase, 1.35)) * (1 - implode);

        ctx.globalCompositeOperation = blendOp;
        ctx.globalAlpha = 1;

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const baseBatch = field.baseLayerBatches[layerIdx]!;
          const extraBatch = isFinale ? field.extraLayerBatches[layerIdx]! : [];
          if (!baseBatch.length && !extraBatch.length) continue;

          const rgb = mixRgb(goldMid, goldCore, layer.hot + coreFlash * 0.25);
          const edgeRgb = mixRgb(goldDeep, goldBright, layer.hot * 0.5 + fillEase * 0.35);
          const a = layer.alpha * alphaScale * (0.85 + 0.35 * coreFlash + 0.9 * fillEase);

          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, outerReach));
          rg.addColorStop(0, `rgba(${rgb}, ${clamp(a * 1.9, 0, 1)})`);
          rg.addColorStop(0.28, `rgba(${rgb}, ${clamp(a * 1.2, 0, 1)})`);
          rg.addColorStop(0.68, `rgba(${edgeRgb}, ${clamp(a * (0.48 + 0.55 * fillEase), 0, 1)})`);
          rg.addColorStop(1, `rgba(${edgeRgb}, ${clamp(a * edgeStopAlpha, 0, 1)})`);

          ctx.beginPath();

          for (const rayIdx of baseBatch) {
            const ray = field.rays[rayIdx]!;
            const tau = reduceMotion ? 4 : Math.max(0, burstTime - ray.stagger);
            if (tau <= 0) continue;
            const expand = reduceMotion
              ? 1
              : clamp(1 - Math.exp(-2.8 * tau) * Math.cos(1.8 * tau), 0, 1.03);
            const maxLen = outerReach * ray.reachMul;
            for (let k = 0; k <= RAY_STEPS; k++) {
              writeRayPoint(
                ray,
                sampleUs[k]!,
                cx,
                cy,
                maxLen,
                expand,
                wavePhase,
                implode,
                k,
              );
            }
            traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, RAY_STEPS + 1);
          }

          if (isFinale && extraBatch.length > 0) {
            for (const rayIdx of extraBatch) {
              const ray = field.rays[rayIdx]!;
              const tau = reduceMotion ? 4 : Math.max(0, finaleAge - ray.staggerFinale);
              if (tau <= 0) continue;
              const grow = reduceMotion ? 1 : clamp(1 - Math.exp(-3.4 * tau), 0, 1.04);
              const maxLen = outerReach * ray.reachMul;
              for (let k = 0; k <= RAY_STEPS; k++) {
                writeRayPoint(
                  ray,
                  sampleUs[k]!,
                  cx,
                  cy,
                  maxLen,
                  grow,
                  wavePhase,
                  implode,
                  k,
                );
              }
              traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, RAY_STEPS + 1);
            }
          }

          ctx.lineWidth = layer.width * (isLight ? 1.08 : 0.96) * widthBoost;
          ctx.strokeStyle = rg;
          ctx.stroke();
        }

        // Branching cross-web synapses during Finale fill & inward collapse
        if (isFinale && outerReach > 2 && fillEase > 0.08) {
          ctx.beginPath();
          for (const syn of field.synapses) {
            const synAge = Math.max(0, finaleAge - syn.stagger);
            if (synAge <= 0) continue;
            const rA = field.rays[syn.rayA]!;
            const rB = field.rays[syn.rayB]!;
            const tauA = rA.isExtra ? Math.max(0, finaleAge - rA.staggerFinale) : burstTime;
            const tauB = rB.isExtra ? Math.max(0, finaleAge - rB.staggerFinale) : burstTime;
            if (tauA <= 0 || tauB <= 0) continue;
            const growA = rA.isExtra ? clamp(1 - Math.exp(-3.4 * tauA), 0, 1.04) : 1;
            const growB = rB.isExtra ? clamp(1 - Math.exp(-3.4 * tauB), 0, 1.04) : 1;
            writeRayPoint(
              rA,
              syn.u,
              cx,
              cy,
              outerReach * rA.reachMul,
              growA,
              wavePhase,
              implode,
              0,
            );
            writeRayPoint(
              rB,
              syn.u,
              cx,
              cy,
              outerReach * rB.reachMul,
              growB,
              wavePhase,
              implode,
              1,
            );
            const pAx = scratchXs[0]!;
            const pAy = scratchYs[0]!;
            const pBx = scratchXs[1]!;
            const pBy = scratchYs[1]!;
            const midX = (pAx + pBx) * 0.5 + (pBy - pAy) * syn.curve;
            const midY = (pAy + pBy) * 0.5 - (pBx - pAx) * syn.curve;
            ctx.moveTo(pAx, pAy);
            ctx.quadraticCurveTo(midX, midY, pBx, pBy);
          }
          ctx.lineWidth = lerp(0.55, 1.1, fillEase);
          ctx.strokeStyle = `rgba(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}, ${clamp(0.45 * fillEase * (1 - implode * 0.5) * alphaScale, 0, 0.9)})`;
          ctx.stroke();
        }

        // Flowing golden photons along active rays
        for (const pt of field.photons) {
          const ray = field.rays[pt.rayIdx]!;
          if (ray.isExtra && !isFinale) continue;
          const tau = reduceMotion
            ? 4
            : ray.isExtra
              ? Math.max(0, finaleAge - ray.staggerFinale)
              : Math.max(0, burstTime - ray.stagger);
          if (tau <= 0) continue;
          const expand = reduceMotion
            ? 1
            : ray.isExtra
              ? clamp(1 - Math.exp(-3.4 * tau), 0, 1.04)
              : clamp(1 - Math.exp(-2.8 * tau) * Math.cos(1.8 * tau), 0, 1.03);
          if (!reduceMotion) {
            if (collapseU > 0) {
              // Photons whip rapidly backward toward the center during collapse
              pt.u = (pt.u - dt * (0.45 + implode * 1.8) + 1) % 1;
            } else {
              pt.u = (pt.u + pt.speed * speedBoost * dt) % 1;
            }
          }
          writeRayPoint(
            ray,
            pt.u,
            cx,
            cy,
            outerReach * ray.reachMul,
            expand,
            wavePhase,
            implode,
            0,
          );
          const fade = Math.sin(pt.u * Math.PI);
          ctx.fillStyle = `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;
          ctx.globalAlpha = pt.alpha * fade * (isLight ? 0.85 : 1) * (1 + fillEase * 0.35);
          ctx.beginPath();
          ctx.arc(scratchXs[0]!, scratchYs[0]!, pt.size * (1 + fillEase * 0.45), 0, TAU);
          ctx.fill();
        }

        // Inward gravitational collapse ring focusing lines back into the singularity
        if (implode > 0.01) {
          ctx.globalCompositeOperation = blendOp;
          ctx.globalAlpha = 1;
          ctx.lineWidth = lerp(1.1, 2.4, implode);
          ctx.strokeStyle = `rgba(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]}, ${clamp(0.75 * Math.sin(collapseU * Math.PI) * alphaScale, 0, 1)})`;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, diag * 0.68 * (1 - implode)), 0, TAU);
          ctx.stroke();
        }
      }

      // 2. Terminal Supernova Explosion & Nova Wash (Substage 3: after point hold -> regular dashboard)
      if (isBlasting) {
        ctx.globalCompositeOperation = blendOp;
        ctx.globalAlpha = 1;

        // High-velocity golden debris / ray streaks tearing outward
        for (const spark of field.blastSparks) {
          const travel = blastEase * diag * 0.96 * spark.speedMul;
          const tail = Math.max(0, travel - spark.lengthMul * diag * (1 - blastU * 0.5));
          const cos = Math.cos(spark.angle);
          const sin = Math.sin(spark.angle);
          ctx.strokeStyle = `rgba(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]}, ${clamp(spark.alpha * (1 - blastU * 0.35) * alphaScale, 0, 1)})`;
          ctx.lineWidth = spark.size;
          ctx.beginPath();
          ctx.moveTo(cx + cos * tail, cy + sin * tail);
          ctx.lineTo(cx + cos * travel, cy + sin * travel);
          ctx.stroke();
        }

        // Expanding golden blast wave racing out from the exact dashboard core
        const novaR = Math.max(8, diag * 0.72 * blastEase);
        const novaAlpha = clamp(Math.pow(blastEase, 0.72) * 0.62, 0, 0.65);
        ctx.globalCompositeOperation = blendOp;
        const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, novaR);
        if (isLight) {
          ng.addColorStop(0, `rgba(255, 250, 236, ${novaAlpha})`);
          ng.addColorStop(0.42, `rgba(232, 178, 72, ${novaAlpha * 0.72})`);
          ng.addColorStop(0.82, `rgba(204, 134, 14, ${novaAlpha * 0.25})`);
          ng.addColorStop(1, "rgba(247, 246, 242, 0)");
        } else {
          ng.addColorStop(0, `rgba(255, 252, 242, ${novaAlpha})`);
          ng.addColorStop(0.4, `rgba(255, 224, 150, ${novaAlpha * 0.78})`);
          ng.addColorStop(0.82, `rgba(232, 160, 52, ${novaAlpha * 0.26})`);
          ng.addColorStop(1, "rgba(0, 0, 0, 0)");
        }
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(cx, cy, novaR, 0, TAU);
        ctx.fill();
      }

      // 3. Shockwave Rings expanding across viewport
      ctx.globalCompositeOperation = blendOp;
      ctx.lineWidth = isBlasting ? 2.1 : 1.25;
      for (let i = shockRings.length - 1; i >= 0; i--) {
        const ring = shockRings[i]!;
        if (!reduceMotion) ring.u += ring.speed * dt;
        if (ring.u >= 1) {
          shockRings.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - ring.u, 2.4);
        const fade = Math.pow(1 - ring.u, 2.0) * ring.strength;
        const c = ring.crimson
          ? mixRgb(goldBright, CRIMSON_ACCENT, clamp(ring.u * 1.4, 0, 1))
          : `${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}`;
        ctx.strokeStyle = `rgba(${c}, ${clamp(0.46 * fade * alphaScale, 0, 1)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, diag * 0.85 * ease, 0, TAU);
        ctx.stroke();
      }

      // 4. Center Singularity Core (same golden Moffat orb at start, without outer halo)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = 1;

      const haloOuter: Rgb = isLight ? [174, 102, 6] : [188, 102, 20];
      const haloMid: Rgb = isLight ? [204, 134, 14] : [242, 172, 56];
      const haloInner: Rgb = isLight ? [228, 168, 42] : [255, 226, 154];

      // Omit outer atmospheric halo at start ("singularity"), focus tightly while pinched, flare upon blast
      const glowHaloIn =
        curPhase === "singularity"
          ? 0
          : isFinale
            ? isCollapsedHold
              ? lerp(0.1, 0.26, Math.pow(compressHoldU, 3))
              : isBlasting
                ? 1
                : clamp(1 - implode * 0.9, 0.1, 1)
            : clamp(explodeAge / 0.28, 0, 1);
      if (glowHaloIn > 0.01) {
        const haloR = Math.max(2, coreBaseR * (1.28 + 0.35 * coreFlash) * coreScale);
        ctx.fillStyle = createMoffat(
          haloR,
          haloR * 0.22,
          1.85,
          clamp(((isLight ? 0.36 : 0.42) + 0.25 * coreFlash) * glowHaloIn, 0, 1),
          haloInner,
          haloMid,
          haloOuter,
        );
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, TAU);
        ctx.fill();
      }

      const orbRadiusMul =
        curPhase === "singularity"
          ? 0.365 + 0.068 * singPulse + 0.055 * hoverFocus
          : 0.34 + 0.05 * hoverFocus + 0.15 * coreFlash;
      const orbR = Math.max(3, coreBaseR * orbRadiusMul * coreScale);
      const orbCoreRatio = curPhase === "singularity" ? 0.295 + 0.055 * singPulse : 0.28;
      const orbBeta = curPhase === "singularity" ? 2.2 - 0.48 * singRipple : 2.35;
      const orbPeakAlpha =
        curPhase === "singularity"
          ? clamp((isLight ? 0.79 : 0.84) + 0.15 * singRipple + 0.12 * hoverFocus, 0, 1)
          : clamp((isLight ? 0.88 : 0.96) + 0.1 * hoverFocus + 0.15 * coreFlash, 0, 1);

      ctx.fillStyle = createMoffat(
        orbR,
        orbR * orbCoreRatio,
        orbBeta,
        orbPeakAlpha,
        isLight ? [156, 88, 6] : [255, 252, 238],
        isLight ? [198, 128, 16] : [255, 218, 124],
        isLight ? [228, 168, 42] : [236, 158, 44],
      );
      ctx.beginPath();
      ctx.arc(0, 0, orbR, 0, TAU);
      ctx.fill();

      ctx.restore();
    };

    const resize = () => {
      const fitted = fitHighResCanvas(canvas, ctx);
      width = fitted.width;
      height = fitted.height;
      diag = Math.hypot(width, height);
      constellations = createConstellationField(width, height);
      coreLayoutCbRef.current?.(computeCoreCenter(width, height).y);
      if (reduceMotion) draw(6, 0);
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
