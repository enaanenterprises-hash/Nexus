"use client";

import { memo, useEffect, useRef } from "react";
import {
  clamp,
  fitCanvas,
  lerp,
  observeCanvasActivity,
  seededHelpers,
} from "@/lib/network/geometry";
import { computeCoreCenter } from "./stage-layout";

export type SetupStagePhase = "singularity" | "exploding" | "modal" | "finale";

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const BASE_RAY_COUNT = 128;
const EXTRA_RAY_COUNT = 200;
const RAY_STEPS = 16;

const FINALE_FILL_END = 1.40;
const FINALE_EXPLODE_AT = 2.02;
const FINALE_COMPLETE_AT = 2.18;

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
  { width: 3.0, alpha: 0.055, hot: 0.08 },
  { width: 1.55, alpha: 0.145, hot: 0.34 },
  { width: 0.85, alpha: 0.32, hot: 0.68 },
  { width: 0.45, alpha: 0.62, hot: 0.96 },
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
};

type BlastSpark = {
  angle: number;
  speedMul: number;
  lengthMul: number;
};

type ShockRing = {
  u: number;
  speed: number;
  strength: number;
  crimson: boolean;
};

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
}

function traceQuadScratch(
  ctx: CanvasRenderingContext2D,
  xs: Float64Array,
  ys: Float64Array,
  len: number,
) {
  if (len < 2) return;
  ctx.moveTo(xs[0]!, ys[0]!);
  for (let i = 1; i < len - 1; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    ctx.quadraticCurveTo(x, y, (x + xs[i + 1]!) * 0.5, (y + ys[i + 1]!) * 0.5);
  }
  ctx.lineTo(xs[len - 1]!, ys[len - 1]!);
}

/** Pre-bakes a 16-stop analytical Moffat PSF texture once so frames only blit with drawImage(). */
function bakeMoffatSprite(
  coreFrac: number,
  beta: number,
  peakAlpha: number,
  inner: Rgb,
  mid: Rgb,
  outer: Rgb,
): HTMLCanvasElement {
  const size = 192;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  if (!octx) return off;

  const r = size * 0.5;
  const coreR = r * coreFrac;
  const g = octx.createRadialGradient(r, r, 0, r, r, r);
  const stops = 16;
  for (let i = 0; i <= stops; i++) {
    const u = i / stops;
    const rn = (u * r) / coreR;
    const moffat = Math.pow(1 + rn * rn, -beta);
    const edgeWindow = 1 - u * u * (3 - 2 * u);
    const a = clamp(peakAlpha * moffat * edgeWindow, 0, 1);
    const rgb = u < 0.35 ? mixRgb(inner, mid, u / 0.35) : mixRgb(mid, outer, (u - 0.35) / 0.65);
    g.addColorStop(u, `rgba(${rgb}, ${a})`);
  }
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(r, r, r, 0, TAU);
  octx.fill();
  return off;
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
      staggerFinale: between(0.02, 0.82),
      reachMul: between(0.88, 1.26),
      twistDir: i % 2 === 0 ? 1 : -1,
      layer,
      isExtra: true,
    });
    extraLayerBatches[layer]!.push(idx);
  }

  const totalRays = rays.length;
  const synapses: SynapseArc[] = Array.from({ length: 110 }, (_, i) => {
    const rayA = Math.floor(rnd() * totalRays);
    const stepOffset = (Math.floor(between(1, 5)) * (i % 2 === 0 ? 1 : -1) + totalRays) % totalRays;
    return {
      rayA,
      rayB: (rayA + stepOffset) % totalRays,
      u: between(0.16, 0.92),
      stagger: between(0.18, 1.05),
      curve: between(-0.18, 0.18),
    };
  });

  const photons: BurstPhoton[] = Array.from({ length: 280 }, (_, i) => ({
    rayIdx: i < 140 ? i % BASE_RAY_COUNT : BASE_RAY_COUNT + ((i - 140) % EXTRA_RAY_COUNT),
    u: rnd(),
    speed: between(0.09, 0.24),
    size: between(0.6, 1.65),
  }));

  const blastSparks: BlastSpark[] = Array.from({ length: 160 }, () => ({
    angle: rnd() * TAU,
    speedMul: between(0.45, 1.32),
    lengthMul: between(0.06, 0.18),
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

    const haloDark = bakeMoffatSprite(0.22, 1.85, 0.48, [255, 226, 154], [242, 172, 56], [188, 102, 20]);
    const haloLight = bakeMoffatSprite(0.22, 1.85, 0.42, [228, 168, 42], [204, 134, 14], [174, 102, 6]);
    const orbDark = bakeMoffatSprite(0.28, 2.35, 0.98, [255, 252, 238], [255, 218, 124], [236, 158, 44]);
    const orbLight = bakeMoffatSprite(0.28, 2.35, 0.92, [156, 88, 6], [198, 128, 16], [228, 168, 42]);

    let width = 1;
    let height = 1;
    let diag = 1;
    let frame = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let smoothTime = 0;
    let wavePhase = 0;
    let elementActive = true;

    let trackedPhase: SetupStagePhase = phaseRef.current;
    let explodeStartTime = trackedPhase === "singularity" ? -1 : -10;
    let finaleStartTime = trackedPhase === "finale" ? 0 : -1;
    let burstLaunched = trackedPhase !== "singularity";
    let finaleBoomLaunched = false;
    let finaleDispatched = false;
    let lastImpulse = impulseRef.current;
    let hoverFocus = 0;

    const shockRings: ShockRing[] = [];
    const pointerPos = { x: -9999, y: -9999 };
    const pointerSmooth = { x: -9999, y: -9999 };
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

    const writeRayPoint = (
      ray: RayFilament,
      u: number,
      cx: number,
      cy: number,
      maxLen: number,
      burstFrac: number,
      waveTime: number,
      implode: number,
      hasPointer: boolean,
      invTwoSigmaSq: number,
      maxDistSq: number,
      idx: number,
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

      if (hasPointer && u > 0.04 && implode < 0.35) {
        const dx = px - pointerSmooth.x;
        const dy = py - pointerSmooth.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < maxDistSq) {
          const k = pointerPresence * Math.exp(-distSq * invTwoSigmaSq) * (1 - Math.exp(-u * 8));
          const dist = Math.sqrt(distSq) + 28;
          const part = 8.5 * k * (1 - implode);
          px += (dx / dist) * part;
          py += (dy / dist) * part;
        }
      }

      scratchXs[idx] = px;
      scratchYs[idx] = py;
    };

    const draw = (time: number, dt: number) => {
      const curPhase = phaseRef.current;
      const isLight = themeRef.current === "light";

      if (curPhase !== trackedPhase) {
        if (trackedPhase === "singularity" && curPhase !== "singularity") {
          explodeStartTime = time;
          burstLaunched = false;
        }
        if (curPhase === "finale") {
          finaleStartTime = time;
          finaleBoomLaunched = false;
          finaleDispatched = false;
        }
        trackedPhase = curPhase;
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

      const hasPointer = pointerPresence > 0.005;
      const sigma = minDim * 0.16;
      const invTwoSigmaSq = 1 / (2 * sigma * sigma);
      const maxDistSq = (1 / invTwoSigmaSq) * 3.2;

      let targetHover = 0;
      if (pointerActive && curPhase === "singularity") {
        const d = Math.hypot(pointerSmooth.x - cx, pointerSmooth.y - cy);
        targetHover = clamp(1 - d / (coreBaseR * 1.25), 0, 1);
      }
      hoverFocus = lerp(hoverFocus, targetHover, reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));

      const isFinale = curPhase === "finale";
      const finaleAge = isFinale && finaleStartTime >= 0 ? Math.max(0, time - finaleStartTime) : 0;
      const fillU = isFinale ? clamp(finaleAge / FINALE_FILL_END, 0, 1) : 0;
      const fillEase = 1 - Math.pow(1 - fillU, 1.9);
      const collapseU =
        isFinale && finaleAge > FINALE_FILL_END
          ? clamp((finaleAge - FINALE_FILL_END) / (FINALE_EXPLODE_AT - FINALE_FILL_END), 0, 1)
          : 0;
      const implode = Math.pow(collapseU, 2.35);
      const blastU =
        isFinale && finaleAge > FINALE_EXPLODE_AT
          ? clamp((finaleAge - FINALE_EXPLODE_AT) / 0.44, 0, 1)
          : 0;
      const blastEase = blastU > 0 ? 1 - Math.pow(2, -9 * blastU) : 0;
      const raysCollapsed = isFinale && finaleAge >= FINALE_EXPLODE_AT;

      if (isFinale && !reduceMotion && finaleAge >= FINALE_EXPLODE_AT && !finaleBoomLaunched) {
        finaleBoomLaunched = true;
        shockRings.push({ u: 0.01, speed: 2.35, strength: 1.55, crimson: false });
        shockRings.push({ u: 0.0, speed: 1.75, strength: 1.15, crimson: false });
      }

      if (isFinale && !finaleDispatched && !reduceMotion && finaleAge >= FINALE_COMPLETE_AT) {
        finaleDispatched = true;
        finaleCbRef.current?.();
      }

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

      const goldCore = isLight ? GOLD_LIGHT_SPECULAR : GOLD_CORE;
      const goldBright = isLight ? GOLD_LIGHT_BRIGHT : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.55 : 1.0;

      let coreScale = 1 + 0.045 * Math.sin(time * 0.85) + 0.14 * hoverFocus;
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
          const compressScale = 1 - implode * 0.76;
          coreScale = lerp(1.0, 1.38, fillEase) * compressScale;
          coreFlash = Math.max(coreFlash, lerp(0.18, 1.15, fillEase) + implode * 1.35);
        } else {
          coreScale = 0.25 + blastEase * 2.4;
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

      if (curPhase !== "singularity" && !raysCollapsed && (burstTime > 0 || reduceMotion)) {
        const outerReach = diag * lerp(0.82, 1.24, fillEase) * (1 - implode);
        const speedBoost = 1 + 2.4 * Math.exp(-burstTime * 1.5) + fillEase * 2.1 + implode * 2.6;
        const widthBoost = 1 + fillEase * 0.82 - implode * 0.45;
        const edgeStopAlpha = lerp(0, 0.78, Math.pow(fillEase, 1.35)) * (1 - implode);

        ctx.globalCompositeOperation = blendOp;

        const rgb = mixRgb(goldMid, goldCore, 0.55 + coreFlash * 0.25);
        const edgeRgb = mixRgb(goldDeep, goldBright, 0.35 + fillEase * 0.35);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, outerReach));
        rg.addColorStop(0, `rgba(${rgb}, 0.95)`);
        rg.addColorStop(0.28, `rgba(${rgb}, 0.62)`);
        rg.addColorStop(0.68, `rgba(${edgeRgb}, ${clamp(0.26 + 0.32 * fillEase, 0, 1)})`);
        rg.addColorStop(1, `rgba(${edgeRgb}, ${clamp(edgeStopAlpha * 0.65, 0, 1)})`);
        ctx.strokeStyle = rg;

        const fieldAlphaScale = alphaScale * (0.85 + 0.35 * coreFlash + 0.9 * fillEase);

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const baseBatch = field.baseLayerBatches[layerIdx]!;
          const extraBatch = isFinale ? field.extraLayerBatches[layerIdx]! : [];
          if (!baseBatch.length && !extraBatch.length) continue;

          ctx.globalAlpha = clamp(layer.alpha * fieldAlphaScale * 1.65, 0, 1);
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
                hasPointer,
                invTwoSigmaSq,
                maxDistSq,
                k,
              );
            }
            traceQuadScratch(ctx, scratchXs, scratchYs, RAY_STEPS + 1);
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
                  hasPointer,
                  invTwoSigmaSq,
                  maxDistSq,
                  k,
                );
              }
              traceQuadScratch(ctx, scratchXs, scratchYs, RAY_STEPS + 1);
            }
          }

          ctx.lineWidth = layer.width * (isLight ? 1.08 : 0.96) * widthBoost;
          ctx.stroke();
        }

        if (isFinale && outerReach > 2 && fillEase > 0.08) {
          ctx.globalAlpha = 1;
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
              hasPointer,
              invTwoSigmaSq,
              maxDistSq,
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
              hasPointer,
              invTwoSigmaSq,
              maxDistSq,
              1,
            );
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
          ctx.strokeStyle = `rgba(${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}, ${clamp(0.45 * fillEase * (1 - implode * 0.5) * alphaScale, 0, 0.9)})`;
          ctx.stroke();
        }

        // Batched photons (single fill pass instead of 280+ draw calls)
        ctx.fillStyle = `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;
        ctx.globalAlpha = clamp((isLight ? 0.72 : 0.84) * (1 + fillEase * 0.25), 0, 1);
        ctx.beginPath();
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
            if (collapseU > 0) pt.u = (pt.u - dt * (0.45 + implode * 1.8) + 1) % 1;
            else pt.u = (pt.u + pt.speed * speedBoost * dt) % 1;
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
            hasPointer,
            invTwoSigmaSq,
            maxDistSq,
            0,
          );
          const rad = pt.size * Math.sin(pt.u * Math.PI) * (1 + fillEase * 0.4);
          if (rad > 0.2) {
            const px = scratchXs[0]!;
            const py = scratchYs[0]!;
            ctx.moveTo(px + rad, py);
            ctx.arc(px, py, rad, 0, TAU);
          }
        }
        ctx.fill();

        if (implode > 0.01) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = lerp(1.1, 2.4, implode);
          ctx.strokeStyle = `rgba(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]}, ${clamp(0.75 * Math.sin(collapseU * Math.PI) * alphaScale, 0, 1)})`;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, diag * 0.68 * (1 - implode)), 0, TAU);
          ctx.stroke();
        }
      }

      if (isFinale && raysCollapsed) {
        ctx.globalCompositeOperation = blendOp;
        ctx.globalAlpha = clamp((1 - blastU * 0.35) * alphaScale * 0.85, 0, 1);
        ctx.strokeStyle = `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;
        ctx.lineWidth = 1.45;
        ctx.beginPath();
        for (const spark of field.blastSparks) {
          const travel = blastEase * diag * 0.96 * spark.speedMul;
          const tail = Math.max(0, travel - spark.lengthMul * diag * (1 - blastU * 0.5));
          const cos = Math.cos(spark.angle);
          const sin = Math.sin(spark.angle);
          ctx.moveTo(cx + cos * tail, cy + sin * tail);
          ctx.lineTo(cx + cos * travel, cy + sin * travel);
        }
        ctx.stroke();

        const novaR = Math.max(8, diag * 0.72 * blastEase);
        const novaAlpha = clamp(Math.pow(blastEase, 0.72) * 0.62, 0, 0.65);
        ctx.globalAlpha = 1;
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

      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = 1;
      ctx.lineWidth = raysCollapsed ? 2.1 : 1.25;
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

      // Blit pre-baked Moffat singularity orb (omitting outer halo at "singularity")
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = blendOp;

      const glowHaloIn =
        curPhase === "singularity" ? 0 : isFinale ? 1 : clamp(explodeAge / 0.28, 0, 1);
      if (glowHaloIn > 0.01) {
        const haloR = Math.max(2, coreBaseR * (1.28 + 0.35 * coreFlash) * coreScale);
        ctx.globalAlpha = clamp((0.88 + 0.2 * coreFlash) * glowHaloIn, 0, 1);
        ctx.drawImage(isLight ? haloLight : haloDark, -haloR, -haloR, haloR * 2, haloR * 2);
      }

      const orbR = Math.max(3, coreBaseR * (0.34 + 0.05 * hoverFocus + 0.15 * coreFlash) * coreScale);
      ctx.globalAlpha = clamp(0.94 + 0.06 * hoverFocus + 0.15 * coreFlash, 0, 1);
      ctx.drawImage(isLight ? orbLight : orbDark, -orbR, -orbR, orbR * 2, orbR * 2);

      ctx.restore();
    };

    const resize = () => {
      const fitted = fitCanvas(canvas, ctx);
      width = fitted.width;
      height = fitted.height;
      diag = Math.hypot(width, height);
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
      const rawDt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
      last = now;
      smoothDt = lerp(smoothDt, rawDt, 0.16);
      smoothTime += smoothDt;
      draw(smoothTime, smoothDt);
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
