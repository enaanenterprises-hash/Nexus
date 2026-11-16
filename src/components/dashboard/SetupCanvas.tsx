"use client";

import { memo, useEffect, useRef } from "react";
import { bezier, clamp, lerp, observeCanvasActivity, seededHelpers, type Vec } from "@/lib/network/geometry";
import { computeCoreCenter, computeStageLayout, type StageLayout } from "./stage-layout";

export type SetupStagePhase = "singularity" | "exploding" | "modal" | "finale";

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const BASE_RAY_COUNT = 132;
const EXTRA_RAY_COUNT = 220;
const RAY_STEPS = 22;
const SILK_STEPS = 20;
const VORTEX_STEPS = 16;
const MORPH_ARM_STRANDS = 11;
const MORPH_ARM_STEPS = 18;

// Opening arc (clicking "Press Singularity to Continue" -> Frames 2..6 into Setup modal)
const OPEN_VORTEX_AT = 0.20;
const OPEN_BLAST_AT = 0.92;
const OPEN_WEB_SETTLE_AT = 1.48;
const OPEN_COMPLETE_AT = 2.24;

// Finale arc (clicking "Enter Nexus" -> web bloom -> Frame 3/2 vortex implosion -> pinched hold -> Frame 4 blast -> 5-arm morph)
const FINALE_FILL_END = 0.88;
const FINALE_COLLAPSE_START = 1.12;
const FINALE_COLLAPSE_END = 1.84;
const FINALE_EXPLODE_AT = 2.48;
const FINALE_MORPH_START = 2.64;
const FINALE_COMPLETE_AT = 3.54;

const GOLD_CORE: Rgb = [255, 250, 232];
const GOLD_BRIGHT: Rgb = [255, 224, 156];
const GOLD_MID: Rgb = [246, 182, 74];
const GOLD_DEEP: Rgb = [212, 128, 34];
const GOLD_DUST: Rgb = [176, 114, 36];

const GOLD_LIGHT_SPECULAR: Rgb = [142, 78, 4];
const GOLD_LIGHT_BRIGHT: Rgb = [184, 112, 10];
const GOLD_LIGHT_MID: Rgb = [212, 144, 22];
const GOLD_LIGHT_DEEP: Rgb = [232, 174, 52];
const GOLD_LIGHT_DUST: Rgb = [196, 142, 62];

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

type BlastShaft = {
  angle: number;
  lengthMul: number;
  width: number;
  alpha: number;
  hot: number;
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

type NebulaDustPuff = {
  nx: number;
  ny: number;
  rxFrac: number;
  ryFrac: number;
  rot: number;
  alpha: number;
  driftPhase: number;
  driftSpeed: number;
};

type VortexStream = {
  baseAngle: number;
  armIdx: number;
  radialBias: number;
  curlFactor: number;
  waveAmp: number;
  phase: number;
  layer: number;
  reachMul: number;
};

type VortexBead = {
  streamIdx: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
  hasFlare: boolean;
};

type SilkRibbon = {
  band: -1 | 1;
  anchorNormY: number;
  archAmp: number;
  archFreq: number;
  phase: number;
  tilt: number;
  waveSpeed: number;
  layer: number;
  alpha: number;
};

type SilkJunction = {
  ribbonIdx: number;
  u: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
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

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
}

function rgbStr(c: Rgb): string {
  return `${c[0]}, ${c[1]}, ${c[2]}`;
}

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

/** Fits canvas up to 3x native DPR so fine gold constellations, filaments, and flares stay crisp. */
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

  // Reserve extra excursion margin so drift and horizontal flare stay clear of central core and lower prompt zone
  const maxDrift = 22;
  const clearR = coreBaseR * 1.68 + maxDrift;
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
        radius: isAnchor ? between(3.0, 4.1) : between(1.95, 2.85),
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
      driftAmpX: between(8, 16),
      driftAmpY: between(6, 13),
      driftFreqX: between(0.16, 0.28),
      driftFreqY: between(0.14, 0.25),
      driftPhase: rnd() * TAU,
      rotAmp: between(0.025, 0.05),
      rotFreq: between(0.12, 0.22),
      rotPhase: rnd() * TAU,
      stars: groupStars,
      edges: groupEdges,
    });
  }

  const targetAmbient = clamp(Math.round((width * height) / 26000), 30, 68);
  const ambientStars: AmbientStar[] = [];
  let attempts = 0;
  while (ambientStars.length < targetAmbient && attempts < targetAmbient * 10) {
    attempts++;
    const x = between(pad * 0.55, width - pad * 0.55);
    const y = between(pad * 0.55, height - pad * 0.55);
    if (isPointInConstellationExclusion(x, y, cx, cy, clearR, promptTop, promptHalfW)) continue;
    if (placedStarPositions.some((s) => Math.hypot(x - s.x, y - s.y) < 18)) continue;
    if (ambientStars.some((s) => Math.hypot(x - s.x, y - s.y) < 20)) continue;
    const bright = rnd() < 0.3;
    ambientStars.push({
      x,
      y,
      driftAmpX: between(5, 12),
      driftAmpY: between(4, 10),
      driftFreqX: between(0.18, 0.34),
      driftFreqY: between(0.15, 0.3),
      driftPhase: rnd() * TAU,
      radius: bright ? between(1.65, 2.4) : between(0.95, 1.65),
      alpha: bright ? between(0.74, 0.96) : between(0.42, 0.72),
      twinkleSpeed: between(1.4, 3.1),
      twinkleRatio: between(1.5, 2.4),
      phase: rnd() * TAU,
      hasFlare: bright,
    });
  }

  return { groups, ambientStars };
}

/** Draws a molten gold pinpoint star with warm bloom, 4-point diffraction spikes, and a radiant white-gold core. */
function drawGoldStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  goldCore: Rgb,
  goldBright: Rgb,
  goldMid: Rgb,
  withFlare: boolean,
  isAnchor: boolean,
) {
  const coreStr = rgbStr(goldCore);
  const brightStr = rgbStr(goldBright);
  const midStr = rgbStr(goldMid);

  const haloR = radius * (isAnchor ? 5.4 : withFlare ? 4.2 : 3.0);
  const haloAlpha = alpha * (isAnchor ? 0.5 : 0.34);
  const g = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  g.addColorStop(0, `rgba(${brightStr}, ${haloAlpha})`);
  g.addColorStop(0.42, `rgba(${midStr}, ${haloAlpha * 0.42})`);
  g.addColorStop(1, `rgba(${midStr}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, TAU);
  ctx.fill();

  if (withFlare) {
    const spikeLen = radius * (isAnchor ? 5.2 : 3.5);
    const spikeAlpha = alpha * (isAnchor ? 0.85 : 0.62);
    const hg = ctx.createLinearGradient(x - spikeLen, y, x + spikeLen, y);
    hg.addColorStop(0, `rgba(${brightStr}, 0)`);
    hg.addColorStop(0.32, `rgba(${midStr}, ${spikeAlpha * 0.42})`);
    hg.addColorStop(0.5, `rgba(${coreStr}, ${spikeAlpha})`);
    hg.addColorStop(0.68, `rgba(${midStr}, ${spikeAlpha * 0.42})`);
    hg.addColorStop(1, `rgba(${brightStr}, 0)`);
    ctx.strokeStyle = hg;
    ctx.lineWidth = isAnchor ? 1.15 : 0.85;
    ctx.beginPath();
    ctx.moveTo(x - spikeLen, y);
    ctx.lineTo(x + spikeLen, y);
    ctx.stroke();

    const vg = ctx.createLinearGradient(x, y - spikeLen, x, y + spikeLen);
    vg.addColorStop(0, `rgba(${brightStr}, 0)`);
    vg.addColorStop(0.32, `rgba(${midStr}, ${spikeAlpha * 0.42})`);
    vg.addColorStop(0.5, `rgba(${coreStr}, ${spikeAlpha})`);
    vg.addColorStop(0.68, `rgba(${midStr}, ${spikeAlpha * 0.42})`);
    vg.addColorStop(1, `rgba(${brightStr}, 0)`);
    ctx.strokeStyle = vg;
    ctx.beginPath();
    ctx.moveTo(x, y - spikeLen);
    ctx.lineTo(x, y + spikeLen);
    ctx.stroke();
  }

  const starFill = ctx.createRadialGradient(x, y, 0, x, y, radius);
  starFill.addColorStop(0, `rgba(${coreStr}, ${alpha})`);
  starFill.addColorStop(0.55, `rgba(${brightStr}, ${alpha * 0.94})`);
  starFill.addColorStop(1, `rgba(${midStr}, ${alpha * 0.72})`);
  ctx.fillStyle = starFill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function twinkleWave(time: number, speed: number, ratio: number, phase: number, reduceMotion: boolean) {
  if (reduceMotion) return 1;
  const w1 = 0.5 + 0.5 * Math.sin(time * speed + phase);
  const w2 = 0.5 + 0.5 * Math.sin(time * speed * ratio + phase * 1.63);
  return 0.36 + 0.64 * Math.pow(w1 * 0.65 + w2 * 0.35, 1.35);
}

function renderGoldConstellations(
  ctx: CanvasRenderingContext2D,
  field: ConstellationField,
  time: number,
  fade: number,
  isLight: boolean,
  reduceMotion: boolean,
) {
  if (fade <= 0.005 || (field.groups.length === 0 && field.ambientStars.length === 0)) return;

  const goldCore = isLight ? GOLD_LIGHT_SPECULAR : GOLD_CORE;
  const goldBright = isLight ? GOLD_LIGHT_BRIGHT : GOLD_BRIGHT;
  const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
  const lineStr = rgbStr(goldBright);
  const glowLineStr = rgbStr(goldMid);
  const lightLift = isLight ? 1.05 : 1.0;

  ctx.save();
  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";

  for (const star of field.ambientStars) {
    const dx = reduceMotion ? 0 : Math.sin(time * star.driftFreqX + star.driftPhase) * star.driftAmpX;
    const dy = reduceMotion ? 0 : Math.cos(time * star.driftFreqY + star.driftPhase * 1.3) * star.driftAmpY;
    const tw = twinkleWave(time, star.twinkleSpeed, star.twinkleRatio, star.phase, reduceMotion);
    const a = clamp(star.alpha * tw * fade * lightLift, 0, 1);
    if (a <= 0.01) continue;
    const r = star.radius * (0.86 + 0.28 * tw);
    drawGoldStar(ctx, star.x + dx, star.y + dy, r, a, goldCore, goldBright, goldMid, star.hasFlare, false);
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
        alpha: clamp(s.alpha * tw * fade * lightLift, 0, 1),
        isAnchor: s.isAnchor,
      };
    });

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
      const a = clamp(edge.alpha * linePulse * fade * (isLight ? 0.82 : 1), 0, 1);
      if (a <= 0.008) continue;

      const x0 = pA.x + ux * trimA;
      const y0 = pA.y + uy * trimA;
      const x1 = pB.x - ux * trimB;
      const y1 = pB.y - uy * trimB;

      // Soft golden aura under-stroke so asterism lines glow warmly in gold
      ctx.lineWidth = isLight ? 2.1 : 2.5;
      ctx.strokeStyle = `rgba(${glowLineStr}, ${a * 0.28})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Crisp primary gold filament line
      ctx.lineWidth = isLight ? 1.1 : 1.2;
      ctx.strokeStyle = `rgba(${lineStr}, ${a})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    for (const pt of livePts) {
      if (pt.alpha <= 0.01) continue;
      drawGoldStar(ctx, pt.x, pt.y, pt.radius, pt.alpha, goldCore, goldBright, goldMid, true, pt.isAnchor);
    }
  }

  ctx.restore();
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

/** Crisp cinema horizontal anamorphic lens flare streak used in Frame 1, Frame 4 starburst, and singularity compression. */
function drawAnamorphicFlare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfLen: number,
  thickness: number,
  alpha: number,
  goldCore: Rgb,
  goldBright: Rgb,
  goldMid: Rgb,
  verticalStrength = 0,
) {
  if (alpha <= 0.008 || halfLen < 4) return;
  const cStr = rgbStr(goldCore);
  const bStr = rgbStr(goldBright);
  const mStr = rgbStr(goldMid);

  // Outer warm golden beam
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(halfLen, Math.max(0.8, thickness * 3.1));
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  bg.addColorStop(0, `rgba(${bStr}, ${clamp(alpha * 0.52, 0, 1)})`);
  bg.addColorStop(0.28, `rgba(${mStr}, ${clamp(alpha * 0.24, 0, 1)})`);
  bg.addColorStop(0.68, `rgba(${mStr}, ${clamp(alpha * 0.065, 0, 1)})`);
  bg.addColorStop(1, `rgba(${mStr}, 0)`);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Razor-sharp white-gold axial filament
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(halfLen * 0.9, Math.max(0.45, thickness * 0.62));
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  cg.addColorStop(0, `rgba(${cStr}, ${clamp(alpha, 0, 1)})`);
  cg.addColorStop(0.22, `rgba(${bStr}, ${clamp(alpha * 0.72, 0, 1)})`);
  cg.addColorStop(0.6, `rgba(${mStr}, ${clamp(alpha * 0.16, 0, 1)})`);
  cg.addColorStop(1, `rgba(${mStr}, 0)`);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (verticalStrength > 0.01) {
    const vLen = halfLen * 0.42 * verticalStrength;
    const vg = ctx.createLinearGradient(x, y - vLen, x, y + vLen);
    vg.addColorStop(0, `rgba(${mStr}, 0)`);
    vg.addColorStop(0.35, `rgba(${bStr}, ${clamp(alpha * 0.42 * verticalStrength, 0, 1)})`);
    vg.addColorStop(0.5, `rgba(${cStr}, ${clamp(alpha * 0.85 * verticalStrength, 0, 1)})`);
    vg.addColorStop(0.65, `rgba(${bStr}, ${clamp(alpha * 0.42 * verticalStrength, 0, 1)})`);
    vg.addColorStop(1, `rgba(${mStr}, 0)`);
    ctx.strokeStyle = vg;
    ctx.lineWidth = Math.max(0.8, thickness * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y - vLen);
    ctx.lineTo(x, y + vLen);
    ctx.stroke();
  }
}

/** Frame 2 orbital plasma ring + crescent shock arc around the igniting or pinched singularity. */
function drawOrbitalIgnitionRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ringR: number,
  intensity: number,
  spin: number,
  goldCore: Rgb,
  goldBright: Rgb,
  goldMid: Rgb,
  alphaScale: number,
) {
  if (intensity <= 0.01 || ringR < 2) return;
  const cStr = rgbStr(goldCore);
  const bStr = rgbStr(goldBright);
  const mStr = rgbStr(goldMid);

  // Soft outer plasma ring glow
  ctx.lineWidth = lerp(2.2, 4.6, intensity);
  ctx.strokeStyle = `rgba(${mStr}, ${clamp(0.32 * intensity * alphaScale, 0, 1)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, TAU);
  ctx.stroke();

  // Sharp molten white-gold orbital torus
  ctx.lineWidth = lerp(1.0, 1.9, intensity);
  ctx.strokeStyle = `rgba(${cStr}, ${clamp(0.92 * intensity * alphaScale, 0, 1)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, TAU);
  ctx.stroke();

  // Counter-rotating outer thin orbital arc + bright bead
  const arcR = ringR * 2.15;
  const arcSpan = Math.PI * 0.92;
  ctx.lineWidth = 0.95;
  ctx.strokeStyle = `rgba(${bStr}, ${clamp(0.46 * intensity * alphaScale, 0, 1)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, arcR, spin, spin + arcSpan);
  ctx.stroke();

  const beadX = cx + Math.cos(spin + arcSpan) * arcR;
  const beadY = cy + Math.sin(spin + arcSpan) * arcR;
  drawGoldStar(ctx, beadX, beadY, 2.2 * intensity, clamp(0.9 * intensity, 0, 1), goldCore, goldBright, goldMid, true, false);
}

function createBurstField() {
  const { rnd, gauss, between } = seededHelpers(20261117);

  const dustPuffs: NebulaDustPuff[] = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * TAU + between(-0.18, 0.18);
    const dist = between(0.28, 0.56);
    return {
      nx: 0.5 + Math.cos(angle) * dist,
      ny: 0.5 + Math.sin(angle) * dist * 0.82,
      rxFrac: between(0.16, 0.34),
      ryFrac: between(0.06, 0.14),
      rot: angle + Math.PI * 0.5 + between(-0.4, 0.4),
      alpha: between(0.022, 0.055),
      driftPhase: rnd() * TAU,
      driftSpeed: between(0.14, 0.28),
    };
  });

  const vortexStreams: VortexStream[] = Array.from({ length: 44 }, (_, i) => {
    const armIdx = i % 4;
    const armBase = (armIdx / 4) * TAU;
    return {
      baseAngle: armBase + gauss() * 0.38,
      armIdx,
      radialBias: between(0.18, 0.92),
      curlFactor: between(1.85, 3.2),
      waveAmp: between(0.05, 0.16) * (i % 2 === 0 ? 1 : -1),
      phase: rnd() * TAU,
      layer: i % 5 === 0 ? 0 : i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3,
      reachMul: between(0.68, 1.18),
    };
  });

  const vortexBeads: VortexBead[] = Array.from({ length: 72 }, (_, i) => ({
    streamIdx: i % vortexStreams.length,
    u: rnd(),
    speed: between(0.18, 0.46),
    size: i % 5 === 0 ? between(1.9, 2.8) : between(0.8, 1.6),
    alpha: between(0.55, 0.98),
    hasFlare: i % 5 === 0,
  }));

  const silkRibbons: SilkRibbon[] = Array.from({ length: 28 }, (_, i) => {
    const band: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const normIdx = Math.floor(i / 2) / 14;
    return {
      band,
      anchorNormY: 0.1 + normIdx * 0.34,
      archAmp: between(0.06, 0.22) * (i % 3 === 0 ? -1 : 1),
      archFreq: between(1.25, 2.45),
      phase: rnd() * TAU,
      tilt: between(-0.18, 0.18),
      waveSpeed: between(0.32, 0.62),
      layer: i % 6 === 0 ? 0 : i % 3 === 0 ? 1 : i % 2 === 0 ? 2 : 3,
      alpha: between(0.24, 0.62),
    };
  });

  const silkJunctions: SilkJunction[] = Array.from({ length: 42 }, (_, i) => ({
    ribbonIdx: i % silkRibbons.length,
    u: between(0.08, 0.92),
    size: i % 4 === 0 ? between(2.1, 3.1) : between(1.1, 1.85),
    alpha: i % 4 === 0 ? between(0.75, 0.98) : between(0.45, 0.78),
    twinkleSpeed: between(1.2, 2.5),
    phase: rnd() * TAU,
  }));

  const blastShafts: BlastShaft[] = Array.from({ length: 64 }, (_, i) => {
    const base = (i / 64) * TAU + gauss() * 0.032;
    const isMajor = i % 4 === 0;
    return {
      angle: base,
      lengthMul: isMajor ? between(0.68, 1.05) : between(0.36, 0.78),
      width: isMajor ? between(1.8, 3.6) : between(0.7, 1.5),
      alpha: isMajor ? between(0.42, 0.78) : between(0.18, 0.44),
      hot: isMajor ? between(0.65, 1.0) : between(0.2, 0.65),
    };
  });

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
  const synapses: SynapseArc[] = Array.from({ length: 140 }, (_, i) => {
    const rayA = Math.floor(rnd() * totalRays);
    const stepOffset = (Math.floor(between(1, 5)) * (i % 2 === 0 ? 1 : -1) + totalRays) % totalRays;
    return {
      rayA,
      rayB: (rayA + stepOffset) % totalRays,
      u: between(0.16, 0.92),
      stagger: between(0.08, 0.65),
      curve: between(-0.18, 0.18),
    };
  });

  const photons: BurstPhoton[] = Array.from({ length: 340 }, (_, i) => ({
    rayIdx: i < 160 ? i % BASE_RAY_COUNT : BASE_RAY_COUNT + ((i - 160) % EXTRA_RAY_COUNT),
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

  return {
    dustPuffs,
    vortexStreams,
    vortexBeads,
    silkRibbons,
    silkJunctions,
    blastShafts,
    rays,
    baseLayerBatches,
    extraLayerBatches,
    synapses,
    photons,
    blastSparks,
  };
}

export const SetupCanvas = memo(function SetupCanvas({
  phase,
  theme,
  impulseSerial = 0,
  onClickSingularity,
  onExplosionComplete,
  onFinaleComplete,
  onCoreLayout,
}: {
  phase: SetupStagePhase;
  theme: "dark" | "light";
  impulseSerial?: number;
  onClickSingularity?: () => void;
  onExplosionComplete?: () => void;
  onFinaleComplete?: () => void;
  onCoreLayout?: (y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const themeRef = useRef(theme);
  const impulseRef = useRef(impulseSerial);
  const clickCbRef = useRef(onClickSingularity);
  const explosionCbRef = useRef(onExplosionComplete);
  const finaleCbRef = useRef(onFinaleComplete);
  const coreLayoutCbRef = useRef(onCoreLayout);

  useEffect(() => {
    phaseRef.current = phase;
    themeRef.current = theme;
    impulseRef.current = impulseSerial;
    clickCbRef.current = onClickSingularity;
    explosionCbRef.current = onExplosionComplete;
    finaleCbRef.current = onFinaleComplete;
    coreLayoutCbRef.current = onCoreLayout;
  }, [phase, theme, impulseSerial, onClickSingularity, onExplosionComplete, onFinaleComplete, onCoreLayout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createBurstField();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sampleUs = Array.from({ length: RAY_STEPS + 1 }, (_, k) => k / RAY_STEPS);
    const scratchXs = new Float64Array(Math.max(RAY_STEPS, SILK_STEPS, VORTEX_STEPS, MORPH_ARM_STEPS) + 1);
    const scratchYs = new Float64Array(Math.max(RAY_STEPS, SILK_STEPS, VORTEX_STEPS, MORPH_ARM_STEPS) + 1);

    let width = 1;
    let height = 1;
    let diag = 1;
    let dashLayout: StageLayout = computeStageLayout(1, 1, 5);
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
    let finaleAge = 0;
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

    const evaluateSilkRibbonPoint = (
      rib: SilkRibbon,
      u: number,
      parting: number,
      swirlPull: number,
      waveTime: number,
      cx: number,
      cy: number,
    ): Vec => {
      const xBase = lerp(-width * 0.06, width * 1.06, u);
      const centerDip = Math.exp(-Math.pow((u - 0.5) / 0.34, 2));
      const fullWebY =
        cy +
        rib.band * height * (rib.anchorNormY * 0.72) * (1 - 0.38 * centerDip) +
        (u - 0.5) * height * rib.tilt;
      const partedY =
        rib.band < 0
          ? lerp(height * 0.04, cy - height * 0.16, rib.anchorNormY * 2.2) - centerDip * height * 0.06
          : lerp(cy + height * 0.16, height * 0.96, rib.anchorNormY * 2.2) + centerDip * height * 0.06;
      const wave =
        Math.sin(u * rib.archFreq * Math.PI - waveTime * rib.waveSpeed + rib.phase) *
        height *
        rib.archAmp;

      let px = xBase;
      let py = lerp(fullWebY, partedY, parting) + wave * (1 - swirlPull * 0.45);

      if (pointerPresence > 0.005 && swirlPull < 0.35) {
        const dx = px - pointerSmooth.x;
        const dy = py - pointerSmooth.y;
        const distSq = dx * dx + dy * dy;
        const sigma = Math.min(width, height) * 0.16;
        const k = pointerPresence * Math.exp(-distSq / (2 * sigma * sigma));
        if (k > 0.002) {
          const dist = Math.sqrt(distSq) + 28;
          px += (dx / dist) * 10 * k;
          py += (dy / dist) * 10 * k;
        }
      }

      if (swirlPull > 0.005) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) + swirlPull * (1.2 + 2.6 * (1 - clamp(dist / diag, 0, 1)));
        const rCollapsed = dist * (1 - swirlPull);
        px = cx + Math.cos(angle) * rCollapsed;
        py = cy + Math.sin(angle) * rCollapsed;
      }

      return { x: px, y: py };
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
      const vortex = implode * ray.twistDir * (0.34 + 0.78 * (1 - u)) * 1.05;
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

    /** Renders Frame 3 logarithmic spiral accretion vortex & orbiting gold star-beads. */
    const renderVortexSwirl = (
      cx: number,
      cy: number,
      ringR: number,
      vortexExpand: number,
      vortexAlpha: number,
      spinTheta: number,
      direction: 1 | -1,
      waveTime: number,
      goldCore: Rgb,
      goldBright: Rgb,
      goldMid: Rgb,
      goldDeep: Rgb,
      blendOp: GlobalCompositeOperation,
      alphaScale: number,
    ) => {
      if (vortexAlpha <= 0.008 || vortexExpand <= 0.008) return;
      const maxSpan = diag * (0.14 + 0.52 * vortexExpand);
      const mStr = rgbStr(goldMid);
      const dStr = rgbStr(goldDeep);

      ctx.save();
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = 1;

      // Soft outer spiral nebula halo clouds swirling around the accretion eye
      for (let i = 0; i < 6; i++) {
        const theta = spinTheta + (i / 6) * TAU;
        const dist = ringR * 1.45 + maxSpan * 0.28 * vortexExpand;
        const px = cx + Math.cos(theta) * dist;
        const py = cy + Math.sin(theta) * dist * 0.88;
        const puffR = clamp(maxSpan * 0.38, 28, 190);
        const pg = ctx.createRadialGradient(px, py, 0, px, py, puffR);
        pg.addColorStop(0, `rgba(${mStr}, ${clamp(0.11 * vortexAlpha * alphaScale, 0, 1)})`);
        pg.addColorStop(0.55, `rgba(${dStr}, ${clamp(0.045 * vortexAlpha * alphaScale, 0, 1)})`);
        pg.addColorStop(1, `rgba(${dStr}, 0)`);
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px, py, puffR, 0, TAU);
        ctx.fill();
      }

      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const layer = DEPTH_LAYERS[layerIdx]!;
        const col = mixRgb(goldMid, goldCore, layer.hot);
        const edgeCol = mixRgb(goldDeep, goldBright, layer.hot * 0.55);
        const a = clamp(layer.alpha * vortexAlpha * alphaScale * 1.38, 0, 1);

        const rg = ctx.createRadialGradient(cx, cy, ringR * 0.7, cx, cy, maxSpan * 1.05);
        rg.addColorStop(0, `rgba(${rgbStr(goldCore)}, ${clamp(a * 1.45, 0, 1)})`);
        rg.addColorStop(0.32, `rgba(${col}, ${clamp(a * 1.15, 0, 1)})`);
        rg.addColorStop(0.74, `rgba(${edgeCol}, ${clamp(a * 0.56, 0, 1)})`);
        rg.addColorStop(1, `rgba(${edgeCol}, 0)`);

        ctx.beginPath();
        for (const stream of field.vortexStreams) {
          if (stream.layer !== layerIdx) continue;
          const span = maxSpan * stream.reachMul;
          for (let k = 0; k <= VORTEX_STEPS; k++) {
            const u = k / VORTEX_STEPS;
            const r = lerp(ringR * 0.88, span, Math.pow(u, 0.82) * stream.radialBias + u * (1 - stream.radialBias));
            const swirl =
              direction * (stream.curlFactor * Math.pow(u, 0.76)) +
              stream.waveAmp * Math.sin(u * 5.2 - waveTime * 2.2 + stream.phase);
            const theta = stream.baseAngle + spinTheta + swirl;
            scratchXs[k] = cx + Math.cos(theta) * r;
            scratchYs[k] = cy + Math.sin(theta) * r;
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, VORTEX_STEPS + 1);
        }
        ctx.lineWidth = layer.width * 1.15;
        ctx.strokeStyle = rg;
        ctx.stroke();
      }

      // Luminous gold star beads orbiting along the spiral vortex arms
      for (const bead of field.vortexBeads) {
        const stream = field.vortexStreams[bead.streamIdx]!;
        const span = maxSpan * stream.reachMul;
        const u = (bead.u + waveTime * bead.speed * 0.32 * (direction > 0 ? 1 : -1) + 1) % 1;
        const r = lerp(ringR * 0.9, span, Math.pow(u, 0.82) * stream.radialBias + u * (1 - stream.radialBias));
        const swirl =
          direction * (stream.curlFactor * Math.pow(u, 0.76)) +
          stream.waveAmp * Math.sin(u * 5.2 - waveTime * 2.2 + stream.phase);
        const theta = stream.baseAngle + spinTheta + swirl;
        const bx = cx + Math.cos(theta) * r;
        const by = cy + Math.sin(theta) * r;
        const fade = Math.sin(u * Math.PI) * vortexAlpha;
        if (fade <= 0.02) continue;
        if (bead.hasFlare) {
          drawGoldStar(ctx, bx, by, bead.size, clamp(bead.alpha * fade, 0, 1), goldCore, goldBright, goldMid, true, false);
        } else {
          ctx.fillStyle = `rgba(${rgbStr(goldCore)}, ${clamp(bead.alpha * fade, 0, 1)})`;
          ctx.beginPath();
          ctx.arc(bx, by, bead.size, 0, TAU);
          ctx.fill();
        }
      }

      ctx.restore();
    };

    /** Renders Frame 5 interconnected cosmic silk ribbons & Frame 6-8 parted horizon waves + 4-point star junctions. */
    const renderCosmicSilkWeb = (
      cx: number,
      cy: number,
      alpha: number,
      parting: number,
      swirlPull: number,
      waveTime: number,
      goldCore: Rgb,
      goldBright: Rgb,
      goldMid: Rgb,
      goldDeep: Rgb,
      blendOp: GlobalCompositeOperation,
      alphaScale: number,
      isLight: boolean,
    ) => {
      if (alpha <= 0.008) return;
      ctx.save();
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = 1;

      for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
        const layer = DEPTH_LAYERS[layerIdx]!;
        const col = mixRgb(goldMid, goldCore, layer.hot);
        const edgeCol = mixRgb(goldDeep, goldBright, layer.hot * 0.55);
        const a = clamp(layer.alpha * alpha * alphaScale * 1.12, 0, 1);

        const lg = ctx.createLinearGradient(0, 0, width, 0);
        lg.addColorStop(0, `rgba(${edgeCol}, ${clamp(a * 0.35, 0, 1)})`);
        lg.addColorStop(0.26, `rgba(${col}, ${clamp(a * 0.96, 0, 1)})`);
        lg.addColorStop(0.5, `rgba(${col}, ${clamp(a * (parting > 0.5 ? 0.62 : 1.1), 0, 1)})`);
        lg.addColorStop(0.74, `rgba(${col}, ${clamp(a * 0.96, 0, 1)})`);
        lg.addColorStop(1, `rgba(${edgeCol}, ${clamp(a * 0.35, 0, 1)})`);

        ctx.beginPath();
        for (const rib of field.silkRibbons) {
          if (rib.layer !== layerIdx) continue;
          for (let k = 0; k <= SILK_STEPS; k++) {
            const u = k / SILK_STEPS;
            const pt = evaluateSilkRibbonPoint(rib, u, parting, swirlPull, waveTime, cx, cy);
            scratchXs[k] = pt.x;
            scratchYs[k] = pt.y;
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, SILK_STEPS + 1);
        }
        ctx.lineWidth = layer.width * (isLight ? 1.12 : 1.02);
        ctx.strokeStyle = lg;
        ctx.stroke();
      }

      // 4-point star junction nodes gleaming along the silk filaments (Frame 5-7)
      for (const jn of field.silkJunctions) {
        const rib = field.silkRibbons[jn.ribbonIdx]!;
        const pt = evaluateSilkRibbonPoint(rib, jn.u, parting, swirlPull, waveTime, cx, cy);
        const tw = twinkleWave(waveTime, jn.twinkleSpeed, 1.8, jn.phase, reduceMotion);
        const edgeWindow = Math.sin(jn.u * Math.PI);
        const starAlpha = clamp(jn.alpha * tw * alpha * edgeWindow * (1 - swirlPull * 0.25), 0, 1);
        if (starAlpha <= 0.02) continue;
        drawGoldStar(
          ctx,
          pt.x,
          pt.y,
          jn.size * (0.9 + 0.22 * tw),
          starAlpha,
          goldCore,
          goldBright,
          goldMid,
          true,
          jn.size > 2.2,
        );
      }

      ctx.restore();
    };

    /** Morphs the finale supernova directly into our 5-arm Laniakea Network & Horizon Wings matching NeuralStage.tsx. */
    const renderDashboardArmMorph = (
      L: StageLayout,
      morphU: number,
      waveTime: number,
      goldCore: Rgb,
      goldBright: Rgb,
      goldMid: Rgb,
      goldDeep: Rgb,
      blendOp: GlobalCompositeOperation,
      alphaScale: number,
      isLight: boolean,
    ) => {
      if (morphU <= 0.005) return;
      const { core, radius: R } = L;
      // Match NeuralStage's intro = 0.78..0.84 curve at handoff (approx 0.90 extension)
      const smooth = 1 - Math.pow(1 - morphU, 2.3);
      const innerReach = clamp(lerp(0.18, 0.94, smooth), 0.1, 1);
      const outerReach = clamp(lerp(0.08, 0.90, Math.pow(smooth, 1.08)), 0.05, 1);
      const waistPinch = clamp(Math.pow(smooth, 0.85), 0, 1);
      const strandVis = clamp(Math.pow(smooth, 0.62) * alphaScale, 0, 1.6);

      ctx.save();
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = 1;

      // Sweeping lower-lateral horizon wings matching NeuralStage
      for (const wing of L.horizonWings) {
        const c1 = { x: lerp(core.x, wing.c1.x, outerReach), y: lerp(core.y, wing.c1.y, outerReach) };
        const c2 = { x: lerp(core.x, wing.c2.x, outerReach), y: lerp(core.y, wing.c2.y, outerReach) };
        const tip = { x: lerp(core.x, wing.tip.x, outerReach), y: lerp(core.y, wing.tip.y, outerReach) };

        for (let s = -2; s <= 2; s++) {
          const offset = s * R * 0.032 * (1 - 0.35 * smooth);
          const nx = -Math.sin(wing.angle) * offset;
          const ny = Math.cos(wing.angle) * offset;
          const wg = ctx.createLinearGradient(core.x, core.y, tip.x + nx, tip.y + ny);
          wg.addColorStop(0, `rgba(${rgbStr(goldCore)}, ${clamp(0.28 * strandVis, 0, 1)})`);
          wg.addColorStop(0.45, `rgba(${rgbStr(goldMid)}, ${clamp(0.14 * strandVis, 0, 1)})`);
          wg.addColorStop(1, `rgba(${rgbStr(goldDeep)}, 0)`);
          ctx.beginPath();
          ctx.moveTo(core.x, core.y);
          ctx.bezierCurveTo(c1.x + nx * 0.45, c1.y + ny * 0.45, c2.x + nx * 0.85, c2.y + ny * 0.85, tip.x + nx, tip.y + ny);
          ctx.lineWidth = s === 0 ? (isLight ? 1.35 : 1.15) : 0.72;
          ctx.strokeStyle = wg;
          ctx.stroke();
        }
      }

      // 5 Venturi-caustic node arms unfurling straight out of the supernova
      for (const arm of L.arms) {
        const sock: Vec = {
          x: lerp(core.x, arm.socket.x, innerReach),
          y: lerp(core.y, arm.socket.y, innerReach),
        };
        const tip: Vec = {
          x: lerp(sock.x, arm.cornerTip.x, outerReach),
          y: lerp(sock.y, arm.cornerTip.y, outerReach),
        };
        const innerDist = Math.hypot(sock.x - core.x, sock.y - core.y);
        const outerDist = Math.hypot(tip.x - sock.x, tip.y - sock.y);
        const c1: Vec = {
          x: core.x + Math.cos(arm.coreAngle) * innerDist * 0.46,
          y: core.y + Math.sin(arm.coreAngle) * innerDist * 0.46,
        };
        const c2: Vec = {
          x: sock.x - arm.socketTangent.x * innerDist * 0.38,
          y: sock.y - arm.socketTangent.y * innerDist * 0.38,
        };
        const sockTanAngle = Math.atan2(arm.socketTangent.y, arm.socketTangent.x);
        const midOuterAngle = lerp(sockTanAngle, arm.cornerAngle, 0.65);
        const d1: Vec = {
          x: sock.x + arm.socketTangent.x * outerDist * 0.32,
          y: sock.y + arm.socketTangent.y * outerDist * 0.32,
        };
        const d2: Vec = {
          x: sock.x + Math.cos(midOuterAngle) * outerDist * 0.68,
          y: sock.y + Math.sin(midOuterAngle) * outerDist * 0.68,
        };

        const ag = ctx.createLinearGradient(core.x, core.y, tip.x, tip.y);
        ag.addColorStop(0, `rgba(${rgbStr(goldCore)}, ${clamp(0.46 * strandVis, 0, 1)})`);
        ag.addColorStop(0.34, `rgba(${rgbStr(goldBright)}, ${clamp(0.32 * strandVis, 0, 1)})`);
        ag.addColorStop(0.72, `rgba(${rgbStr(goldMid)}, ${clamp(0.14 * strandVis, 0, 1)})`);
        ag.addColorStop(1, `rgba(${rgbStr(goldDeep)}, 0)`);

        for (let s = 0; s < MORPH_ARM_STRANDS; s++) {
          const xi = (s / (MORPH_ARM_STRANDS - 1)) * 2 - 1;
          const isCenter = Math.abs(xi) < 0.25;
          ctx.beginPath();
          for (let k = 0; k <= MORPH_ARM_STEPS; k++) {
            const u = k / MORPH_ARM_STEPS;
            let pt: Vec;
            let tangentAngle: number;
            if (u <= 0.34) {
              const t = u / 0.34;
              pt = bezier(core, c1, c2, sock, t);
              tangentAngle = lerp(arm.coreAngle, Math.atan2(arm.socketTangent.y, arm.socketTangent.x), t);
            } else {
              const t = (u - 0.34) / 0.66;
              pt = bezier(sock, d1, d2, tip, t);
              tangentAngle = lerp(Math.atan2(arm.socketTangent.y, arm.socketTangent.x), arm.cornerAngle, t);
            }
            const nx = -Math.sin(tangentAngle);
            const ny = Math.cos(tangentAngle);
            const waist = R * 0.044;
            let env: number;
            if (u <= 0.34) {
              const sInner = u / 0.34;
              env = R * 0.2 * Math.sin(Math.PI * Math.pow(sInner, 0.85)) * waistPinch + waist * Math.sin(sInner * Math.PI * 0.5);
            } else {
              const sOuter = (u - 0.34) / 0.66;
              env = waist + Math.pow(sOuter, 1.2) * R * lerp(0.55, 2.15, waistPinch);
            }
            const wave = Math.sin(u * 4.8 - waveTime * 1.4 + s * 0.9) * R * 0.018 * u;
            const spread = xi * env + wave;
            scratchXs[k] = pt.x + nx * spread;
            scratchYs[k] = pt.y + ny * spread;
          }
          traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, MORPH_ARM_STEPS + 1);
          ctx.lineWidth = isCenter ? (isLight ? 1.25 : 1.05) : 0.62;
          ctx.strokeStyle = ag;
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    const draw = (time: number, dt: number, wallDt = dt) => {
      const curPhase = phaseRef.current;
      const isLight = themeRef.current === "light";

      if (curPhase !== trackedPhase) {
        if (trackedPhase === "singularity" && curPhase !== "singularity") {
          openAge = 0;
          openBlastFired = false;
          openDispatched = false;
        }
        if (curPhase === "finale") {
          finaleAge = 0;
          shockRings.length = 0;
          finaleBoomLaunched = false;
          finaleDispatched = false;
        }
        trackedPhase = curPhase;
      } else if (curPhase === "exploding" || curPhase === "modal") {
        openAge += wallDt;
      } else if (curPhase === "finale") {
        finaleAge += wallDt;
      }

      if (impulseRef.current !== lastImpulse) {
        lastImpulse = impulseRef.current;
        if (curPhase === "modal" && !reduceMotion) {
          shockRings.push({ u: 0.01, speed: 0.88, strength: 0.72, crimson: true });
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
        targetHover = clamp(1 - d / (coreBaseR * 1.4), 0, 1);
      }
      hoverFocus = lerp(hoverFocus, targetHover, reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));

      const goldCore = isLight ? GOLD_LIGHT_SPECULAR : GOLD_CORE;
      const goldBright = isLight ? GOLD_LIGHT_BRIGHT : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const dustColor = isLight ? GOLD_LIGHT_DUST : GOLD_DUST;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.55 : 1.0;

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

      // Finale choreography parameters
      const isFinale = curPhase === "finale";
      const fillU = isFinale ? clamp(finaleAge / FINALE_FILL_END, 0, 1) : 0;
      const fillEase = 1 - Math.pow(1 - fillU, 2.0);
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
      const blastAge = isBlasting ? finaleAge - FINALE_EXPLODE_AT : 0;
      const blastU = isBlasting ? clamp(blastAge / 0.65, 0, 1) : 0;
      const blastEase = blastU > 0 ? 1 - Math.pow(2, -8.5 * blastU) : 0;
      const morphU =
        isFinale && finaleAge >= FINALE_MORPH_START
          ? clamp((finaleAge - FINALE_MORPH_START) / (FINALE_COMPLETE_AT - FINALE_MORPH_START), 0, 1)
          : 0;

      if (isBlasting && !reduceMotion && !finaleBoomLaunched) {
        finaleBoomLaunched = true;
        shockRings.push({ u: 0.01, speed: 2.35, strength: 1.55, crimson: false });
        shockRings.push({ u: 0.0, speed: 1.75, strength: 1.15, crimson: false });
      }

      if (isFinale && !finaleDispatched && !reduceMotion && finaleAge >= FINALE_COMPLETE_AT) {
        finaleDispatched = true;
        finaleCbRef.current?.();
      }

      // 0. Deep Obsidian Canvas (or Gallery Alabaster Gradient in Light Mode — matched to NeuralStage.tsx)
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

      // Subtle atmospheric golden nebula dust clouds (Frames 1-3 outer depth)
      const dustVisibility =
        curPhase === "singularity"
          ? 1
          : curPhase === "modal"
            ? 0.65
            : isFinale
              ? clamp(1 - implode, 0.15, 1)
              : 0.9;
      if (dustVisibility > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = blendOp;
        const dStr = rgbStr(dustColor);
        for (const puff of field.dustPuffs) {
          const dx = reduceMotion ? 0 : Math.sin(time * puff.driftSpeed + puff.driftPhase) * 18;
          const dy = reduceMotion ? 0 : Math.cos(time * puff.driftSpeed * 0.8 + puff.driftPhase) * 14;
          const px = puff.nx * width + dx;
          const py = puff.ny * height + dy;
          const rx = puff.rxFrac * minDim;
          const ry = puff.ryFrac * minDim;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(puff.rot);
          ctx.scale(rx, ry);
          const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
          const a = clamp(puff.alpha * dustVisibility * (isLight ? 0.6 : 1), 0, 0.2);
          dg.addColorStop(0, `rgba(${dStr}, ${a})`);
          dg.addColorStop(0.55, `rgba(${dStr}, ${a * 0.42})`);
          dg.addColorStop(1, `rgba(${dStr}, 0)`);
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      // Gold constellations in outer sky during "singularity", dissolving gracefully on ignition
      const constellationFade =
        curPhase === "singularity"
          ? 1
          : curPhase === "exploding" && !reduceMotion
            ? Math.pow(clamp(1 - openAge / 0.42, 0, 1), 1.55)
            : 0;
      if (constellationFade > 0.005) {
        renderGoldConstellations(ctx, constellations, time, constellationFade, isLight, reduceMotion);
      }

      // Wave & Vortex integrators
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
              : isFinale
                ? 0.72 + fillEase * 1.45 + implode * 2.1
                : 0.48 + 0.85 * Math.exp(-burstTime * 1.4);
        wavePhase += dt * waveRate;

        const spinRate = isOpeningPreBlast
          ? 1.4 + Math.pow(openAge / OPEN_BLAST_AT, 1.4) * 5.2
          : isFinale && collapseU > 0
            ? 1.6 + implode * 7.2
            : 0.55;
        vortexSpin += dt * spinRate;
      }

      // Ambient pulse during singularity
      const singPulse =
        curPhase === "singularity" && !reduceMotion
          ? 0.64 * Math.sin(time * 1.48) + 0.36 * Math.sin(time * 2.72 + 0.85)
          : 0;
      const singRipple =
        curPhase === "singularity" && !reduceMotion
          ? 0.6 * Math.sin(time * 1.48 + 0.35) + 0.4 * Math.cos(time * 2.96 - 0.45)
          : 0;

      // 1. Opening Frames 2 -> 3 (Orbital ring ignition & swirling golden accretion vortex)
      if (curPhase === "exploding" && !reduceMotion && openAge < OPEN_BLAST_AT + 0.38) {
        const ringBuild = clamp(openAge / 0.24, 0, 1);
        const postBlastFade = openAge > OPEN_BLAST_AT ? clamp(1 - (openAge - OPEN_BLAST_AT) / 0.34, 0, 1) : 1;
        const vortexU = clamp((openAge - OPEN_VORTEX_AT) / (OPEN_BLAST_AT - OPEN_VORTEX_AT), 0, 1);
        const vortexEase = 1 - Math.pow(1 - vortexU, 1.85);
        const ringR = coreBaseR * lerp(0.16, 0.36, ringBuild) * (1 - 0.14 * clamp((openAge - 0.76) / 0.16, 0, 1));

        ctx.save();
        ctx.globalCompositeOperation = blendOp;
        renderVortexSwirl(
          cx,
          cy,
          ringR,
          lerp(0.08, 1.08, vortexEase),
          clamp(vortexU * 1.35, 0, 1) * postBlastFade,
          vortexSpin,
          1,
          wavePhase,
          goldCore,
          goldBright,
          goldMid,
          goldDeep,
          blendOp,
          alphaScale,
        );
        drawOrbitalIgnitionRing(
          ctx,
          cx,
          cy,
          ringR,
          clamp(ringBuild, 0, 1) * postBlastFade,
          vortexSpin * 1.35,
          goldCore,
          goldBright,
          goldMid,
          alphaScale,
        );
        ctx.restore();
      }

      // 2. Radial Explosion Starburst (Opening blast at OPEN_BLAST_AT AND Finale blast at FINALE_EXPLODE_AT)
      const openingBurstAge = curPhase === "exploding" && !reduceMotion ? openAge - OPEN_BLAST_AT : -1;
      const isOpeningBurst = openingBurstAge >= 0 && openingBurstAge < 1.15;
      const starburstU = isBlasting
        ? blastAge
        : isOpeningBurst
          ? openingBurstAge
          : -1;

      if (starburstU >= 0) {
        const isTerminal = isBlasting;
        const duration = isTerminal ? 0.92 : 0.82;
        const burstEnv = clamp(starburstU / 0.1, 0, 1) * Math.pow(clamp(1 - starburstU / duration, 0, 1), 1.35);
        const reach = (isTerminal ? blastEase : 1 - Math.pow(2, -7.5 * clamp(starburstU / 0.65, 0, 1))) * diag * 0.98;

        if (burstEnv > 0.008) {
          ctx.save();
          ctx.globalCompositeOperation = blendOp;
          ctx.globalAlpha = 1;

          // Radiant Frame 4 starburst light shafts
          for (const shaft of field.blastShafts) {
            const sx = cx + Math.cos(shaft.angle) * reach * shaft.lengthMul;
            const sy = cy + Math.sin(shaft.angle) * reach * shaft.lengthMul;
            const sg = ctx.createLinearGradient(cx, cy, sx, sy);
            const shaftCol = mixRgb(goldBright, goldCore, shaft.hot);
            const a0 = clamp(shaft.alpha * burstEnv * alphaScale, 0, 1);
            sg.addColorStop(0, `rgba(${rgbStr(goldCore)}, ${a0})`);
            sg.addColorStop(0.28, `rgba(${shaftCol}, ${a0 * 0.78})`);
            sg.addColorStop(0.7, `rgba(${rgbStr(goldMid)}, ${a0 * 0.24})`);
            sg.addColorStop(1, `rgba(${rgbStr(goldDeep)}, 0)`);
            ctx.lineWidth = shaft.width * (1 + burstEnv * 0.45);
            ctx.strokeStyle = sg;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(sx, sy);
            ctx.stroke();
          }

          // High-velocity blast sparks tearing outward
          for (const spark of field.blastSparks) {
            const p = clamp(starburstU / (isTerminal ? 0.52 : 0.62), 0, 1);
            const pEase = 1 - Math.pow(2, -8 * p);
            const travel = pEase * diag * 0.98 * spark.speedMul;
            const tail = Math.max(0, travel - spark.lengthMul * diag * (1 - p * 0.45));
            const cos = Math.cos(spark.angle);
            const sin = Math.sin(spark.angle);
            ctx.strokeStyle = `rgba(${rgbStr(goldCore)}, ${clamp(spark.alpha * (1 - p * 0.42) * alphaScale, 0, 1)})`;
            ctx.lineWidth = spark.size;
            ctx.beginPath();
            ctx.moveTo(cx + cos * tail, cy + sin * tail);
            ctx.lineTo(cx + cos * travel, cy + sin * travel);
            ctx.stroke();
          }

          // Expanding golden supernova wash (stronger on Frame 4 peak, fading cleanly for 5-arm reveal)
          const novaR = Math.max(12, reach * 0.78);
          const novaAlpha = clamp(burstEnv * (isTerminal ? 0.48 : 0.36), 0, 0.55);
          const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, novaR);
          if (isLight) {
            ng.addColorStop(0, `rgba(255, 250, 236, ${novaAlpha})`);
            ng.addColorStop(0.4, `rgba(232, 178, 72, ${novaAlpha * 0.65})`);
            ng.addColorStop(1, "rgba(247, 246, 242, 0)");
          } else {
            ng.addColorStop(0, `rgba(255, 252, 242, ${novaAlpha})`);
            ng.addColorStop(0.38, `rgba(255, 224, 150, ${novaAlpha * 0.72})`);
            ng.addColorStop(0.8, `rgba(212, 128, 34, ${novaAlpha * 0.22})`);
            ng.addColorStop(1, "rgba(0, 0, 0, 0)");
          }
          ctx.fillStyle = ng;
          ctx.beginPath();
          ctx.arc(cx, cy, novaR, 0, TAU);
          ctx.fill();

          ctx.restore();
        }
      }

      // 3. Frames 5 -> 6..8 Interconnected Cosmic Silk Mesh & Parting Horizon Waves
      //    Active from opening blast settle through Setup Modal & into Finale bloom/implosion!
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
      } else if (isFinale && !raysCollapsed) {
        const bloomIn = fillEase;
        silkAlpha = lerp(0.58, 1.05, bloomIn) * (1 - Math.pow(collapseU, 2.2));
        silkParting = lerp(1.0, 0.0, clamp(fillEase * 1.25, 0, 1));
        silkSwirlPull = implode * 0.92;
      }

      if (silkAlpha > 0.01) {
        renderCosmicSilkWeb(
          cx,
          cy,
          silkAlpha,
          silkParting,
          silkSwirlPull,
          wavePhase,
          goldCore,
          goldBright,
          goldMid,
          goldDeep,
          blendOp,
          alphaScale,
          isLight,
        );
      }

      // 4. Radial Flowing Neural Filaments + Finale Collapse Vortex (Frame 3/2 in reverse)
      if (isFinale && !raysCollapsed) {
        // Surge of rays & cross-synapses during finale bloom and inward gravitational collapse
        const outerReach = diag * lerp(0.68, 1.22, fillEase) * (1 - implode);
        const speedBoost = 1 + fillEase * 2.1 + implode * 2.8;
        const widthBoost = 1 + fillEase * 0.72 - implode * 0.45;
        const edgeStopAlpha = lerp(0.15, 0.76, Math.pow(fillEase, 1.25)) * (1 - implode);

        ctx.globalCompositeOperation = blendOp;
        ctx.globalAlpha = 1;

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const baseBatch = field.baseLayerBatches[layerIdx]!;
          const extraBatch = field.extraLayerBatches[layerIdx]!;
          if (!baseBatch.length && !extraBatch.length) continue;

          const rgb = mixRgb(goldMid, goldCore, layer.hot + 0.25 * fillEase);
          const edgeRgb = mixRgb(goldDeep, goldBright, layer.hot * 0.5 + fillEase * 0.35);
          const a = layer.alpha * alphaScale * (0.45 + 0.95 * fillEase) * (1 - collapseU * 0.25);

          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, outerReach));
          rg.addColorStop(0, `rgba(${rgb}, ${clamp(a * 1.85, 0, 1)})`);
          rg.addColorStop(0.28, `rgba(${rgb}, ${clamp(a * 1.2, 0, 1)})`);
          rg.addColorStop(0.68, `rgba(${edgeRgb}, ${clamp(a * (0.48 + 0.55 * fillEase), 0, 1)})`);
          rg.addColorStop(1, `rgba(${edgeRgb}, ${clamp(a * edgeStopAlpha, 0, 1)})`);

          ctx.beginPath();
          for (const rayIdx of baseBatch) {
            const ray = field.rays[rayIdx]!;
            const maxLen = outerReach * ray.reachMul;
            for (let k = 0; k <= RAY_STEPS; k++) {
              writeRayPoint(ray, sampleUs[k]!, cx, cy, maxLen, fillEase, wavePhase, implode, k);
            }
            traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, RAY_STEPS + 1);
          }
          for (const rayIdx of extraBatch) {
            const ray = field.rays[rayIdx]!;
            const tau = Math.max(0, finaleAge - ray.staggerFinale);
            if (tau <= 0) continue;
            const grow = clamp(1 - Math.exp(-3.4 * tau), 0, 1.04);
            const maxLen = outerReach * ray.reachMul;
            for (let k = 0; k <= RAY_STEPS; k++) {
              writeRayPoint(ray, sampleUs[k]!, cx, cy, maxLen, grow, wavePhase, implode, k);
            }
            traceSmoothPolylineScratch(ctx, scratchXs, scratchYs, RAY_STEPS + 1);
          }
          ctx.lineWidth = layer.width * (isLight ? 1.08 : 0.96) * widthBoost;
          ctx.strokeStyle = rg;
          ctx.stroke();
        }

        // Cross-web synapses during bloom & collapse
        if (outerReach > 2 && fillEase > 0.12) {
          ctx.beginPath();
          for (const syn of field.synapses) {
            const synAge = Math.max(0, finaleAge - syn.stagger);
            if (synAge <= 0) continue;
            const rA = field.rays[syn.rayA]!;
            const rB = field.rays[syn.rayB]!;
            writeRayPoint(rA, syn.u, cx, cy, outerReach * rA.reachMul, 1, wavePhase, implode, 0);
            writeRayPoint(rB, syn.u, cx, cy, outerReach * rB.reachMul, 1, wavePhase, implode, 1);
            const pAx = scratchXs[0]!;
            const pAy = scratchYs[0]!;
            const pBx = scratchXs[1]!;
            const pBy = scratchYs[1]!;
            ctx.moveTo(pAx, pAy);
            ctx.quadraticCurveTo(
              (pAx + pBx) * 0.5 + (pBy - pAy) * syn.curve,
              (pAy + pBy) * 0.5 - (pBx - pAx) * syn.curve,
              pBx,
              pBy,
            );
          }
          ctx.lineWidth = lerp(0.55, 1.1, fillEase);
          ctx.strokeStyle = `rgba(${rgbStr(goldBright)}, ${clamp(0.42 * fillEase * (1 - implode * 0.45) * alphaScale, 0, 0.9)})`;
          ctx.stroke();
        }

        // Photons streaming rapidly inward on collapse
        for (const pt of field.photons) {
          const ray = field.rays[pt.rayIdx]!;
          const tau = ray.isExtra ? Math.max(0, finaleAge - ray.staggerFinale) : 2;
          if (tau <= 0) continue;
          const expand = ray.isExtra ? clamp(1 - Math.exp(-3.4 * tau), 0, 1.04) : 1;
          if (!reduceMotion) {
            pt.u = collapseU > 0 ? (pt.u - dt * (0.55 + implode * 2.1) + 1) % 1 : (pt.u + pt.speed * speedBoost * dt) % 1;
          }
          writeRayPoint(ray, pt.u, cx, cy, outerReach * ray.reachMul, expand, wavePhase, implode, 0);
          const fade = Math.sin(pt.u * Math.PI);
          ctx.fillStyle = `rgb(${rgbStr(goldCore)})`;
          ctx.globalAlpha = pt.alpha * fade * (isLight ? 0.85 : 1) * fillEase;
          ctx.beginPath();
          ctx.arc(scratchXs[0]!, scratchYs[0]!, pt.size * (1 + fillEase * 0.4), 0, TAU);
          ctx.fill();
        }

        // Swirling Frame 3->2 gravitational vortex funnel wrapping inward into the orbital ring
        if (collapseU > 0.02) {
          const vortexFadeIn = Math.sin(collapseU * Math.PI);
          const vortexR = coreBaseR * lerp(0.45, 0.16, implode);
          renderVortexSwirl(
            cx,
            cy,
            vortexR,
            1 - implode * 0.92,
            clamp(vortexFadeIn * 1.25, 0, 1),
            vortexSpin,
            -1,
            wavePhase,
            goldCore,
            goldBright,
            goldMid,
            goldDeep,
            blendOp,
            alphaScale,
          );
          drawOrbitalIgnitionRing(
            ctx,
            cx,
            cy,
            Math.max(4, coreBaseR * lerp(0.42, 0.16, implode)),
            clamp(implode * 1.15, 0, 1),
            vortexSpin,
            goldCore,
            goldBright,
            goldMid,
            alphaScale,
          );
        }
      }

      // 5. Finale Morph Directly Into Our Dashboard's 5-Arm Laniakea Network & Horizon Wings
      if (isBlasting && morphU > 0.005) {
        renderDashboardArmMorph(
          dashLayout,
          morphU,
          wavePhase,
          goldCore,
          goldBright,
          goldMid,
          goldDeep,
          blendOp,
          alphaScale,
          isLight,
        );
      }

      // 6. Expanding Shockwave Rings
      ctx.globalCompositeOperation = blendOp;
      ctx.lineWidth = isBlasting || isOpeningBurst ? 1.9 : 1.2;
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
          : rgbStr(goldBright);
        ctx.strokeStyle = `rgba(${c}, ${clamp(0.46 * fade * alphaScale, 0, 1)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, diag * 0.85 * ease, 0, TAU);
        ctx.stroke();
      }

      // 7. Central Singularity Core + Horizontal Anamorphic Optical Lens Flare
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = 1;

      const haloOuter: Rgb = isLight ? [174, 102, 6] : [188, 102, 20];
      const haloMid: Rgb = isLight ? [204, 134, 14] : [242, 172, 56];
      const haloInner: Rgb = isLight ? [228, 168, 42] : [255, 226, 154];

      let coreScale = 1 + 0.045 * Math.sin(time * 0.85) + 0.14 * hoverFocus;
      let coreFlash = 0;
      let flareSpan = width * 0.14;
      let flareThickness = 1.6;
      let flareAlpha = 0;
      let flareVertical = 0;

      if (curPhase === "singularity") {
        // Frame 1: Radiant pulsing pinpoint white-gold singularity + razor-crisp horizontal lens flare
        coreScale = 1 + 0.14 * singPulse + 0.15 * hoverFocus;
        flareSpan = Math.min(width * 0.34, coreBaseR * (2.65 + 0.45 * singPulse + 0.65 * hoverFocus));
        flareThickness = 1.35 + 0.3 * singRipple;
        flareAlpha = clamp((isLight ? 0.72 : 0.92) + 0.08 * singRipple + 0.08 * hoverFocus, 0, 1);
      } else if (curPhase === "exploding") {
        if (!reduceMotion && openAge < OPEN_BLAST_AT) {
          // Compressing & charging vortex eye
          const u = openAge / OPEN_BLAST_AT;
          const squeeze = Math.exp(-u * 2.5);
          coreScale = lerp(0.95, 0.56, Math.sin(clamp(u * 1.4, 0, 1) * Math.PI * 0.5));
          coreFlash = 0.4 + 0.85 * u;
          flareSpan = coreBaseR * (1.8 * squeeze + 2.4 * Math.pow(u, 3));
          flareThickness = 1.6 + 1.4 * Math.pow(u, 2.5);
          flareAlpha = 0.88;
        } else {
          // Detonation flash settling into calm modal horizon flare
          const bU = reduceMotion ? 2 : clamp(burstTime / 0.85, 0, 1);
          const settle = Math.exp(-burstTime * 2.2);
          coreScale = lerp(2.15, 0.78, 1 - settle);
          coreFlash = 1.9 * settle;
          flareSpan = lerp(width * 0.48, Math.min(width * 0.24, coreBaseR * 2.1), 1 - Math.exp(-burstTime * 2.6));
          flareThickness = lerp(3.4, 1.35, 1 - settle);
          flareAlpha = lerp(1.0, 0.48, 1 - settle);
          flareVertical = 0.85 * Math.pow(1 - bU, 1.4);
        }
      } else if (curPhase === "modal") {
        // Frame 6-8: Serene quiet glowing diamond-star focal point behind Setup dialog
        coreScale = 0.78 + 0.04 * Math.sin(time * 0.9);
        coreFlash = 0.08;
        flareSpan = Math.min(width * 0.22, coreBaseR * 1.9);
        flareThickness = 1.2;
        flareAlpha = isLight ? 0.42 : 0.48;
      } else if (isFinale) {
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
          // Compressed taut singularity hold before supernova detonation
          const charge = compressHoldU > 0.74 ? Math.pow((compressHoldU - 0.74) / 0.26, 2) : 0;
          const tensionPulse = 0.012 * Math.sin(compressHoldU * Math.PI * 3.5) * (1 - charge);
          coreScale = 0.125 + tensionPulse - charge * 0.025;
          coreFlash = 1.55 + charge * 0.75;
          flareSpan = coreBaseR * (1.25 + 1.15 * charge);
          flareThickness = 1.2 + 0.9 * charge;
          flareAlpha = 0.96;

          drawOrbitalIgnitionRing(
            ctx,
            0,
            0,
            Math.max(4, coreBaseR * (0.175 + 0.015 * tensionPulse)),
            0.78 + 0.22 * charge,
            time * 2.4,
            goldCore,
            goldBright,
            goldMid,
            alphaScale,
          );
        } else {
          // Supernova explosion morphing smoothly into NeuralStage's elliptical optical core!
          const mSmooth = 1 - Math.pow(1 - morphU, 1.8);
          coreScale = lerp(2.25, 0.84, mSmooth);
          coreFlash = lerp(2.4, 0.45, mSmooth);
          flareSpan = lerp(width * 0.5, dashLayout.radius * 0.78, mSmooth);
          flareThickness = lerp(4.0, 2.2, mSmooth);
          flareAlpha = lerp(1.0, 0.65, mSmooth);
          flareVertical = Math.max(0, 1 - morphU * 1.45);
        }
      }

      // Halo under-field (kept suppressed at Frame 1 singularity for a crisp dark contrast, active during explosions & morph)
      const glowHaloIn =
        curPhase === "singularity"
          ? 0.08 + 0.08 * hoverFocus
          : isFinale
            ? isCollapsedHold
              ? lerp(0.14, 0.34, Math.pow(compressHoldU, 2.6))
              : isBlasting
                ? lerp(1, 0.7, morphU)
                : clamp(1 - implode * 0.85, 0.14, 1)
            : clamp(openAge / 0.28, 0.1, 1);

      if (glowHaloIn > 0.01) {
        const haloR = Math.max(4, coreBaseR * (1.2 + 0.35 * coreFlash) * coreScale);
        ctx.fillStyle = createMoffat(
          haloR,
          haloR * 0.22,
          1.85,
          clamp(((isLight ? 0.32 : 0.38) + 0.26 * coreFlash) * glowHaloIn, 0, 1),
          haloInner,
          haloMid,
          haloOuter,
        );
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, TAU);
        ctx.fill();
      }

      // Draw crisp horizontal anamorphic lens flare centered at singularity
      drawAnamorphicFlare(
        ctx,
        0,
        0,
        flareSpan,
        flareThickness,
        flareAlpha * (isLight ? 0.85 : 1),
        goldCore,
        goldBright,
        goldMid,
        flareVertical,
      );

      // Pinpoint white-gold Moffat heart
      const orbRadiusMul =
        curPhase === "singularity"
          ? 0.31 + 0.055 * singPulse + 0.045 * hoverFocus
          : 0.32 + 0.05 * hoverFocus + 0.14 * coreFlash;
      const orbR = Math.max(3, coreBaseR * orbRadiusMul * coreScale);
      const orbCoreRatio = curPhase === "singularity" ? 0.26 + 0.04 * singPulse : 0.27;
      const orbBeta = curPhase === "singularity" ? 2.35 - 0.42 * singRipple : 2.35;
      const orbPeakAlpha =
        curPhase === "singularity"
          ? clamp((isLight ? 0.84 : 0.94) + 0.06 * singRipple + 0.06 * hoverFocus, 0, 1)
          : clamp((isLight ? 0.88 : 0.98) + 0.1 * hoverFocus + 0.15 * coreFlash, 0, 1);

      ctx.fillStyle = createMoffat(
        orbR,
        orbR * orbCoreRatio,
        orbBeta,
        orbPeakAlpha,
        isLight ? [156, 88, 6] : [255, 253, 242],
        isLight ? [198, 128, 16] : [255, 220, 128],
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
      dashLayout = computeStageLayout(width, height, 5);
      constellations = createConstellationField(width, height);
      coreLayoutCbRef.current?.(dashLayout.core.y);
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
