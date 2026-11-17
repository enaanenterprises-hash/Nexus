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
const FINALE_COLLAPSE_START = 1.50;
const FINALE_COLLAPSE_END = 2.05;
const FINALE_EXPLODE_AT = 2.65;
const FINALE_COMPLETE_AT = 2.83;

const CONSTELLATION_DARK_LINE: Rgb = [240, 198, 122];
const CONSTELLATION_DARK_HALO: Rgb = [232, 148, 36];
const CONSTELLATION_DARK_STAR: Rgb = [255, 240, 202];
const CONSTELLATION_LIGHT_INK: Rgb = [17, 17, 19];
const CONSTELLATION_LIGHT_GOLD: Rgb = [164, 98, 12];

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

type CuratedAsterism = {
  rx: number;
  ry: number;
  scaleMul: number;
  rot: number;
  points: ReadonlyArray<readonly [number, number]>;
  edges: ReadonlyArray<readonly [number, number]>;
  anchorIndex: number;
  minWidth?: number;
};

const CURATED_ASTERISMS: readonly CuratedAsterism[] = [
  // Top-left Y-fork branching upward right
  {
    rx: 0.19,
    ry: 0.22,
    scaleMul: 1.05,
    rot: 0,
    anchorIndex: 1,
    points: [
      [-0.28, -0.78],
      [-0.14, 0.08],
      [0.42, -0.82],
      [-0.58, 0.56],
      [0.45, 0.58],
    ],
    edges: [
      [0, 1],
      [2, 1],
      [1, 3],
      [1, 4],
    ],
  },
  // Upper-left chevron bridge
  {
    rx: 0.365,
    ry: 0.165,
    scaleMul: 0.88,
    rot: 0,
    anchorIndex: 1,
    points: [
      [-0.78, 0.05],
      [0.08, -0.28],
      [0.54, 0.48],
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
  },
  // Left-mid sweeping C-arch
  {
    rx: 0.102,
    ry: 0.46,
    scaleMul: 1.05,
    rot: 0,
    anchorIndex: 3,
    minWidth: 620,
    points: [
      [0.34, -0.82],
      [-0.36, -0.45],
      [-0.24, 0.18],
      [0.24, 0.86],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  // Bottom-left signature diamond-kite with diagonal stem
  {
    rx: 0.125,
    ry: 0.785,
    scaleMul: 1.08,
    rot: 0,
    anchorIndex: 2,
    points: [
      [-0.08, -0.42],
      [0.36, 0.08],
      [-0.16, 0.58],
      [-0.64, 0.08],
      [0.72, -0.74],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
    ],
  },
  // Upper-right luminous closed triangle
  {
    rx: 0.695,
    ry: 0.16,
    scaleMul: 0.92,
    rot: 0,
    anchorIndex: 1,
    points: [
      [0.34, -0.68],
      [-0.46, 0.48],
      [0.52, 0.44],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
  },
  // Far upper-right asymmetric dart wedge
  {
    rx: 0.835,
    ry: 0.23,
    scaleMul: 0.88,
    rot: 0,
    anchorIndex: 0,
    minWidth: 620,
    points: [
      [-0.18, -0.68],
      [0.54, 0.08],
      [-0.48, 0.22],
      [-0.16, 0.82],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 3],
    ],
  },
  // Far-right tall zigzag
  {
    rx: 0.892,
    ry: 0.475,
    scaleMul: 1.06,
    rot: 0,
    anchorIndex: 4,
    minWidth: 620,
    points: [
      [-0.02, -0.92],
      [0.34, -0.58],
      [-0.24, -0.22],
      [0.34, 0.24],
      [-0.26, 0.86],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  // Bottom-right wide dipper cradle
  {
    rx: 0.865,
    ry: 0.785,
    scaleMul: 0.96,
    rot: 0,
    anchorIndex: 1,
    points: [
      [-0.58, -0.62],
      [0.06, 0.22],
      [0.44, 0.42],
      [0.92, 0.16],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
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

function hash2D(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise2D(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return sum / norm;
}

/** Synthesizes the fine burnt-gold lacy filamentary nebula sky once per resize/theme. */
function buildNebulaCanvas(
  width: number,
  height: number,
  isLight: boolean,
): HTMLCanvasElement | null {
  if (typeof document === "undefined" || width < 32 || height < 32) return null;
  const nw = clamp(Math.round(width * 0.5), 260, 720);
  const nh = clamp(Math.round(height * 0.5), 160, 450);
  const off = document.createElement("canvas");
  off.width = nw;
  off.height = nh;
  const octx = off.getContext("2d");
  if (!octx) return null;

  const img = octx.createImageData(nw, nh);
  const data = img.data;
  const aspect = width / Math.max(1, height);
  const scaleX = 3.8 * aspect;
  const scaleY = 3.8;

  for (let py = 0; py < nh; py++) {
    const ny = py / nh;
    const y = ny * scaleY;
    for (let px = 0; px < nw; px++) {
      const nx = px / nw;
      const x = nx * scaleX;

      const w1x = fbm(x * 0.92 + 3.7, y * 0.92 - 1.9, 3);
      const w1y = fbm(x * 0.92 - 2.4, y * 0.92 + 4.8, 3);
      const wx = fbm(x * 1.85 + w1x * 1.65 + 6.1, y * 1.85 + w1y * 1.65 - 2.7, 4);
      const wy = fbm(x * 1.85 - w1y * 1.55 - 3.3, y * 1.85 + w1x * 1.55 + 5.2, 4);

      const n1 = fbm(x * 1.75 + wx * 1.45, y * 1.75 + wy * 1.45, 5);
      const n2 = fbm(x * 4.4 - wy * 1.15 + 2.1, y * 4.4 + wx * 1.15 - 1.4, 4);
      const n3 = fbm(x * 0.85 + w1x * 0.9, y * 0.85 + w1y * 0.9, 3);

      // Sharp filamentary ridges + sparse smoky wisps matching dark obsidian cosmos
      const ridgeA = Math.pow(clamp(1 - Math.abs(n1 * 2 - 1), 0, 1), 6.8);
      const ridgeB = Math.pow(clamp(1 - Math.abs(n2 * 2 - 1), 0, 1), 9.2);
      const mist = Math.pow(clamp((n3 - 0.34) * 1.65, 0, 1), 2.8);

      // Asymmetric cosmic currents: bright top-left knot sweeping diagonally, delicate right canyon, calm center
      const diagTendril = Math.exp(-Math.pow((nx * 0.92 - ny * 1.04 + 0.06) * 2.15, 2));
      const topLeftKnot = Math.exp(-((nx - 0.085) * (nx - 0.085) * 18 + (ny - 0.21) * (ny - 0.21) * 12));
      const bottomLeftHint = Math.exp(-((nx - 0.11) * (nx - 0.11) * 14 + (ny - 0.82) * (ny - 0.82) * 10));
      const rightCanyon = Math.exp(-((nx - 0.91) * (nx - 0.91) * 11 + (ny - 0.48) * (ny - 0.48) * 4.2));
      const rightMidKnot = Math.exp(-((nx - 0.94) * (nx - 0.94) * 24 + (ny - 0.34) * (ny - 0.34) * 14));

      const centerDist = Math.hypot((nx - 0.5) * 0.9, (ny - 0.6) * 1.18);
      const centerCalm = clamp((centerDist - 0.18) / 0.34, 0.08, 1);

      const envelope = clamp(
        (0.14 + 0.56 * diagTendril + 0.95 * topLeftKnot + 0.44 * bottomLeftHint + 0.72 * rightCanyon + 0.68 * rightMidKnot) *
          centerCalm,
        0,
        1.28,
      );

      const filament = ridgeA * 0.72 + ridgeB * 0.78 + mist * 0.12;
      const intensity = clamp(Math.pow(clamp(envelope * filament * 0.94, 0, 1), 1.24), 0, 1);
      if (intensity <= 0.015) continue;

      const idx = (py * nw + px) * 4;
      if (isLight) {
        data[idx] = 164;
        data[idx + 1] = 96;
        data[idx + 2] = 14;
        data[idx + 3] = Math.round(clamp(intensity * 46, 0, 48));
      } else {
        const coreHot = Math.pow(intensity, 2.3);
        data[idx] = Math.round(clamp(lerp(72, 252, Math.pow(intensity, 0.7)) + 12 * coreHot, 0, 255));
        data[idx + 1] = Math.round(clamp(lerp(16, 118, Math.pow(intensity, 1.15)) + 86 * coreHot, 0, 232));
        data[idx + 2] = Math.round(clamp(lerp(0, 14, Math.pow(intensity, 1.55)) + 88 * coreHot, 0, 176));
        data[idx + 3] = Math.round(clamp(intensity * 184, 0, 192));
      }
    }
  }

  octx.putImageData(img, 0, 0);
  return off;
}

function buildStarGlowSprite(rgb: Rgb): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const size = 48;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const half = size * 0.5;
  const col = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  const g = octx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, `rgba(${col}, 1)`);
  g.addColorStop(0.28, `rgba(${col}, 0.56)`);
  g.addColorStop(0.65, `rgba(${col}, 0.14)`);
  g.addColorStop(1, `rgba(${col}, 0)`);
  octx.fillStyle = g;
  octx.fillRect(0, 0, size, size);
  return off;
}

/** Seeds prominent golden constellations + dense deep-space dust clear of singularity & lower prompt band. */
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

  const maxDrift = 14;
  const clearR = coreBaseR * 1.48 + maxDrift;
  const promptTop = cy + coreBaseR * 0.26 - maxDrift;
  const promptHalfW = Math.min(width * 0.35, 330) + maxDrift;

  const pad = clamp(minDim * 0.042, 20, 44);
  const span = clamp(Math.min(width * 0.105, height * 0.135), 54, 114);

  const groups: ConstellationGroup[] = [];
  const placedStarPositions: Vec[] = [];

  const isInsideSafeCanvas = (x: number, y: number) =>
    x >= pad && x <= width - pad && y >= pad && y <= height - pad;

  for (const tpl of CURATED_ASTERISMS) {
    if (tpl.minWidth && width < tpl.minWidth) continue;
    const anchorX = tpl.rx * width;
    const anchorY = tpl.ry * height;
    const rot = tpl.rot + between(-0.04, 0.04);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const localScale = span * tpl.scaleMul;

    const candidates = tpl.points.map(([lx, ly]) => {
      const x = anchorX + (lx * cosR - ly * sinR) * localScale;
      const y = anchorY + (lx * sinR + ly * cosR) * localScale;
      const valid =
        isInsideSafeCanvas(x, y) &&
        !isPointInConstellationExclusion(x, y, cx, cy, clearR, promptTop, promptHalfW);
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

    for (const localIdx of usedIndices) {
      const pt = candidates[localIdx]!;
      const isAnchor = localIdx === tpl.anchorIndex;
      localToGroup.set(localIdx, groupStars.length);
      placedStarPositions.push({ x: pt.x, y: pt.y });
      groupStars.push({
        rx: pt.x - groupCx,
        ry: pt.y - groupCy,
        radius: isAnchor ? between(2.8, 3.6) : between(1.65, 2.35),
        alpha: isAnchor ? between(0.95, 1.0) : between(0.82, 0.96),
        twinkleSpeed: between(1.25, 2.4),
        twinkleRatio: between(1.45, 2.2),
        phase: rnd() * TAU,
        isAnchor,
      });
    }

    const groupEdges: ConstellationEdge[] = validEdges.map(([ia, ib]) => ({
      a: localToGroup.get(ia)!,
      b: localToGroup.get(ib)!,
      alpha: between(0.56, 0.78),
      phase: rnd() * TAU,
    }));

    groups.push({
      cx: groupCx,
      cy: groupCy,
      driftAmpX: between(3.5, 7.5),
      driftAmpY: between(2.5, 6.0),
      driftFreqX: between(0.12, 0.22),
      driftFreqY: between(0.11, 0.2),
      driftPhase: rnd() * TAU,
      rotAmp: between(0.01, 0.024),
      rotFreq: between(0.09, 0.16),
      rotPhase: rnd() * TAU,
      stars: groupStars,
      edges: groupEdges,
    });
  }

  const targetAmbient = clamp(Math.round((width * height) / 3100), 165, 360);
  const ambientStars: AmbientStar[] = [];
  let attempts = 0;
  while (ambientStars.length < targetAmbient && attempts < targetAmbient * 6) {
    attempts++;
    const x = between(8, width - 8);
    const y = between(8, height - 8);
    // Keep immediate core pinhole clear; keep prompt text clean of bright flare stars
    if (Math.hypot(x - cx, y - cy) < coreBaseR * 0.72) continue;
    const inPromptBand =
      y >= promptTop - 10 && y <= promptTop + 68 && Math.abs(x - cx) < promptHalfW;
    if (inPromptBand) continue;
    if (placedStarPositions.some((s) => Math.hypot(x - s.x, y - s.y) < 12)) continue;
    const roll = rnd();
    const bright = roll < 0.048;
    const med = roll >= 0.048 && roll < 0.31;
    ambientStars.push({
      x,
      y,
      driftAmpX: between(1.2, 4.5),
      driftAmpY: between(1.2, 4.2),
      driftFreqX: between(0.14, 0.28),
      driftFreqY: between(0.12, 0.25),
      driftPhase: rnd() * TAU,
      radius: bright ? between(1.35, 1.95) : med ? between(0.85, 1.3) : between(0.4, 0.8),
      alpha: bright ? between(0.82, 0.98) : med ? between(0.55, 0.84) : between(0.35, 0.68),
      twinkleSpeed: between(1.2, 3.0),
      twinkleRatio: between(1.4, 2.3),
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
  coreRgb: string,
  haloSprite: HTMLCanvasElement | null,
  withFlare: boolean,
  isAnchor: boolean,
) {
  const haloR = radius * (isAnchor ? 7.2 : withFlare ? 4.8 : 2.8);
  const haloAlpha = clamp(alpha * (isAnchor ? 0.76 : withFlare ? 0.48 : 0.3), 0, 1);
  if (haloSprite && haloAlpha > 0.01) {
    ctx.globalAlpha = haloAlpha;
    ctx.drawImage(haloSprite, x - haloR, y - haloR, haloR * 2, haloR * 2);
  }
  ctx.globalAlpha = 1;

  if (withFlare) {
    const spikeLen = radius * (isAnchor ? 6.4 : 4.1);
    const spikeAlpha = alpha * (isAnchor ? 0.92 : 0.68);
    ctx.strokeStyle = `rgba(${coreRgb}, ${spikeAlpha * 0.72})`;
    ctx.lineWidth = isAnchor ? 0.9 : 0.65;
    ctx.beginPath();
    ctx.moveTo(x - spikeLen, y);
    ctx.lineTo(x + spikeLen, y);
    ctx.moveTo(x, y - spikeLen);
    ctx.lineTo(x, y + spikeLen);
    ctx.stroke();

    if (isAnchor) {
      const diagLen = spikeLen * 0.44;
      ctx.strokeStyle = `rgba(${coreRgb}, ${spikeAlpha * 0.42})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - diagLen, y - diagLen);
      ctx.lineTo(x + diagLen, y + diagLen);
      ctx.moveTo(x + diagLen, y - diagLen);
      ctx.lineTo(x - diagLen, y + diagLen);
      ctx.stroke();
    }
  }

  ctx.fillStyle = `rgba(${coreRgb}, ${alpha})`;
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
  haloSprite: HTMLCanvasElement | null,
  time: number,
  fade: number,
  isLight: boolean,
  reduceMotion: boolean,
) {
  if (fade <= 0.005 || (field.groups.length === 0 && field.ambientStars.length === 0)) return;

  const lineRgb = isLight ? CONSTELLATION_LIGHT_GOLD : CONSTELLATION_DARK_LINE;
  const starRgb = isLight ? CONSTELLATION_LIGHT_INK : CONSTELLATION_DARK_STAR;
  const lineRgbStr = `${lineRgb[0]}, ${lineRgb[1]}, ${lineRgb[2]}`;
  const starRgbStr = `${starRgb[0]}, ${starRgb[1]}, ${starRgb[2]}`;

  ctx.save();
  ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";

  for (const star of field.ambientStars) {
    const dx = reduceMotion ? 0 : Math.sin(time * star.driftFreqX + star.driftPhase) * star.driftAmpX;
    const dy = reduceMotion ? 0 : Math.cos(time * star.driftFreqY + star.driftPhase * 1.3) * star.driftAmpY;
    const tw = twinkleWave(time, star.twinkleSpeed, star.twinkleRatio, star.phase, reduceMotion);
    const a = clamp(star.alpha * tw * fade * (isLight ? 0.65 : 1), 0, 1);
    if (a <= 0.01) continue;
    const r = star.radius * (0.88 + 0.24 * tw);
    if (star.hasFlare) {
      drawCrispStar(ctx, star.x + dx, star.y + dy, r, a, starRgbStr, haloSprite, true, false);
    } else {
      ctx.fillStyle = `rgba(${star.radius > 1.1 ? starRgbStr : lineRgbStr}, ${a})`;
      ctx.beginPath();
      ctx.arc(star.x + dx, star.y + dy, r, 0, TAU);
      ctx.fill();
    }
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

    ctx.lineWidth = isLight ? 1.1 : 1.15;
    for (const edge of group.edges) {
      const pA = livePts[edge.a]!;
      const pB = livePts[edge.b]!;
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      const trimA = pA.radius + 2.8;
      const trimB = pB.radius + 2.8;
      if (trimA + trimB >= dist) continue;
      const linePulse = reduceMotion ? 1 : 0.82 + 0.18 * Math.sin(time * 0.85 + edge.phase);
      const a = clamp(edge.alpha * linePulse * fade * (isLight ? 0.65 : 1), 0, 1);
      if (a <= 0.008) continue;

      ctx.strokeStyle = `rgba(${lineRgbStr}, ${a})`;
      ctx.beginPath();
      ctx.moveTo(pA.x + ux * trimA, pA.y + uy * trimA);
      ctx.lineTo(pB.x - ux * trimB, pB.y - uy * trimB);
      ctx.stroke();
    }

    for (const pt of livePts) {
      if (pt.alpha <= 0.01) continue;
      drawCrispStar(ctx, pt.x, pt.y, pt.radius, pt.alpha, starRgbStr, haloSprite, true, pt.isAnchor);
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
    let nebulaDark: HTMLCanvasElement | null = null;
    let nebulaLight: HTMLCanvasElement | null = null;
    const starGlowDark = buildStarGlowSprite(CONSTELLATION_DARK_HALO);
    const starGlowLight = buildStarGlowSprite(CONSTELLATION_LIGHT_GOLD);
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

      // 0. Golden cosmic nebula clouds + gold-lit constellations during "singularity", fading smoothly on early "exploding"
      const constellationFade =
        curPhase === "singularity"
          ? 1
          : curPhase === "exploding" && !reduceMotion
            ? Math.pow(clamp(1 - explodeAge / 0.56, 0, 1), 1.65)
            : 0;
      if (constellationFade > 0.005) {
        if (isLight && !nebulaLight && width >= 32) nebulaLight = buildNebulaCanvas(width, height, true);
        if (!isLight && !nebulaDark && width >= 32) nebulaDark = buildNebulaCanvas(width, height, false);
        const activeNebula = isLight ? nebulaLight : nebulaDark;
        if (activeNebula) {
          ctx.save();
          ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
          ctx.globalAlpha = constellationFade * (0.94 + 0.06 * Math.sin(time * 0.45));
          ctx.drawImage(activeNebula, 0, 0, width, height);
          ctx.restore();
        }
        renderConstellations(
          ctx,
          constellations,
          isLight ? starGlowLight : starGlowDark,
          time,
          constellationFade,
          isLight,
          reduceMotion,
        );
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
          coreScale = lerp(expandedScale, 0.21, implode);
          coreFlash = lerp(Math.max(coreFlash, expandedFlash), 1.55, implode);
        } else if (isCollapsedHold) {
          const charge = compressHoldU > 0.78 ? Math.pow((compressHoldU - 0.78) / 0.22, 2) : 0;
          const tensionPulse = 0.016 * Math.sin(compressHoldU * Math.PI * 3) * (1 - charge);
          coreScale = 0.21 + tensionPulse - charge * 0.032;
          coreFlash = 1.55 + charge * 0.65;
        } else {
          coreScale = 0.21 + blastEase * 2.45;
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

      // Finale saturation veil under dense neural web as the screen fills edge-to-edge
      if (isFinale && !raysCollapsed) {
        const veilAlpha = clamp(Math.pow(fillEase, 1.4) * 0.56 * (1 - implode), 0, 0.62);
        if (veilAlpha > 0.005) {
          ctx.globalCompositeOperation = blendOp;
          const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * lerp(0.55, 1.18, fillEase));
          vg.addColorStop(0, `rgba(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}, ${clamp(veilAlpha * 1.12, 0, 0.85)})`);
          vg.addColorStop(0.55, `rgba(${goldMid[0]}, ${goldMid[1]}, ${goldMid[2]}, ${clamp(veilAlpha * 0.82, 0, 0.72)})`);
          vg.addColorStop(1, `rgba(${goldDeep[0]}, ${goldDeep[1]}, ${goldDeep[2]}, ${clamp(veilAlpha * 0.54, 0, 0.54)})`);
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, width, height);
        }
      }

      // 1. Omnidirectional flowing neural lines + finale overgrowth & collapse
      if (curPhase !== "singularity" && !raysCollapsed && (burstTime > 0 || reduceMotion)) {
        const outerReach = diag * lerp(0.82, 1.28, fillEase) * (1 - implode);
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

      if (curPhase === "singularity") {
        // Organic molten-amber corona & softly feathered event horizon matching the concept singularity
        const singOrbR = Math.max(14, coreBaseR * (0.31 + 0.03 * singPulse + 0.055 * hoverFocus) * coreScale);
        ctx.fillStyle = createMoffat(
          singOrbR * 1.55,
          singOrbR * 0.24,
          1.95,
          clamp((isLight ? 0.62 : 0.76) + 0.1 * singRipple + 0.12 * hoverFocus, 0, 1),
          isLight ? [198, 128, 16] : [255, 224, 148],
          isLight ? [224, 158, 34] : [238, 152, 42],
          isLight ? [238, 186, 78] : [176, 84, 12],
        );
        ctx.beginPath();
        ctx.arc(0, 0, singOrbR * 1.55, 0, TAU);
        ctx.fill();

        const ringRadius = clamp(coreBaseR * 0.072, 4.6, 8.2) * (0.94 + 0.07 * singPulse + 0.08 * hoverFocus);
        const horizonR = ringRadius * 0.48;
        const ringG = ctx.createRadialGradient(0, 0, horizonR * 0.45, 0, 0, ringRadius * 1.9);
        ringG.addColorStop(0, "rgba(0, 0, 0, 0)");
        ringG.addColorStop(0.28, isLight ? "rgba(186, 110, 12, 0.92)" : "rgba(255, 214, 126, 0.94)");
        ringG.addColorStop(0.5, isLight ? "rgba(218, 148, 28, 0.66)" : "rgba(240, 156, 44, 0.72)");
        ringG.addColorStop(1, "rgba(240, 156, 44, 0)");
        ctx.fillStyle = ringG;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius * 1.9, 0, TAU);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
        const pupilG = ctx.createRadialGradient(0, 0, 0, 0, 0, horizonR * 1.25);
        pupilG.addColorStop(0, isLight ? "rgba(26, 20, 12, 0.98)" : "rgba(6, 4, 2, 0.98)");
        pupilG.addColorStop(0.66, isLight ? "rgba(26, 20, 12, 0.88)" : "rgba(8, 5, 2, 0.88)");
        pupilG.addColorStop(1, "rgba(6, 4, 2, 0)");
        ctx.fillStyle = pupilG;
        ctx.beginPath();
        ctx.arc(0, 0, horizonR * 1.25, 0, TAU);
        ctx.fill();
      } else {
        const orbRadiusMul = 0.34 + 0.05 * hoverFocus + 0.15 * coreFlash;
        const orbR = Math.max(3, coreBaseR * orbRadiusMul * coreScale);
        const orbCoreRatio = 0.28;
        const orbBeta = 2.35;
        const orbPeakAlpha = clamp((isLight ? 0.88 : 0.96) + 0.1 * hoverFocus + 0.15 * coreFlash, 0, 1);

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
      }

      ctx.restore();
    };

    const resize = () => {
      const fitted = fitHighResCanvas(canvas, ctx);
      width = fitted.width;
      height = fitted.height;
      diag = Math.hypot(width, height);
      constellations = createConstellationField(width, height);
      nebulaDark = themeRef.current === "light" ? null : buildNebulaCanvas(width, height, false);
      nebulaLight = themeRef.current === "light" ? buildNebulaCanvas(width, height, true) : null;
      coreLayoutCbRef.current?.(computeCoreCenter(width, height).y);
      if (reduceMotion) draw(6, 0);
      else draw(smoothTime, 0, 0);
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
