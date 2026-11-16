"use client";

import { useEffect, useRef } from "react";
import { clamp, fitCanvas, lerp, seededHelpers, type Vec } from "@/lib/network/geometry";

export type SetupStagePhase = "singularity" | "exploding" | "modal" | "finale";

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const BASE_RAY_COUNT = 168;
const EXTRA_RAY_COUNT = 290;
const RAY_STEPS = 22;

const FINALE_FILL_END = 1.45;
const FINALE_EXPLODE_AT = 2.08;
const FINALE_COMPLETE_AT = 2.46;

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

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
}

function traceSmoothPolyline(ctx: CanvasRenderingContext2D, pts: Vec[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
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
      staggerFinale: between(0.02, 0.82),
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
      stagger: between(0.18, 1.05),
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

export function SetupCanvas({
  phase,
  theme,
  impulseSerial = 0,
  onClickSingularity,
  onFinaleComplete,
}: {
  phase: SetupStagePhase;
  theme: "dark" | "light";
  impulseSerial?: number;
  onClickSingularity?: () => void;
  onFinaleComplete?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const themeRef = useRef(theme);
  const impulseRef = useRef(impulseSerial);
  const clickCbRef = useRef(onClickSingularity);
  const finaleCbRef = useRef(onFinaleComplete);

  useEffect(() => {
    phaseRef.current = phase;
    themeRef.current = theme;
    impulseRef.current = impulseSerial;
    clickCbRef.current = onClickSingularity;
    finaleCbRef.current = onFinaleComplete;
  }, [phase, theme, impulseSerial, onClickSingularity, onFinaleComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createBurstField();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sampleUs = Array.from({ length: RAY_STEPS + 1 }, (_, k) => k / RAY_STEPS);

    let width = 1;
    let height = 1;
    let diag = 1;
    let frame = 0;
    let start = 0;
    let last = 0;
    let smoothDt = 1 / 60;
    let smoothTime = 0;
    let wavePhase = 0;

    let trackedPhase: SetupStagePhase = phaseRef.current;
    let explodeStartTime = trackedPhase === "singularity" ? -1 : -10;
    let finaleStartTime = trackedPhase === "finale" ? 0 : -1;
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
      const cx = width * 0.5;
      const cy = height * 0.45;
      if (Math.hypot(x - cx, y - cy) <= Math.min(width, height) * 0.22) {
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

    const evaluateRayPoint = (
      ray: RayFilament,
      u: number,
      cx: number,
      cy: number,
      maxLen: number,
      burstFrac: number,
      waveTime: number,
      implode: number,
    ): Vec => {
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

      return { x: px, y: py };
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

      const cx = width * 0.5;
      const explodeAge = curPhase === "singularity" ? 0 : Math.max(0, time - explodeStartTime);
      const centerShift = curPhase === "singularity" ? 0 : clamp(explodeAge / 0.9, 0, 1);
      const cy = height * lerp(0.45, 0.5, centerShift * centerShift * (3 - 2 * centerShift));

      const minDim = Math.min(width, height);
      const coreBaseR = clamp(minDim * 0.14, 58, 118);

      let targetHover = 0;
      if (pointerActive && curPhase === "singularity") {
        const d = Math.hypot(pointerSmooth.x - cx, pointerSmooth.y - cy);
        targetHover = clamp(1 - d / (coreBaseR * 1.25), 0, 1);
      }
      hoverFocus = lerp(hoverFocus, targetHover, reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));

      // Finale choreography phases
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

      const goldCore = isLight ? GOLD_LIGHT_SPECULAR : GOLD_CORE;
      const goldBright = isLight ? GOLD_LIGHT_BRIGHT : GOLD_BRIGHT;
      const goldMid = isLight ? GOLD_LIGHT_MID : GOLD_MID;
      const goldDeep = isLight ? GOLD_LIGHT_DEEP : GOLD_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaScale = isLight ? 1.55 : 1.0;

      // Substage energy parameters
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
            const pts: Vec[] = new Array(RAY_STEPS + 1);
            for (let k = 0; k <= RAY_STEPS; k++) {
              pts[k] = evaluateRayPoint(
                ray,
                sampleUs[k]!,
                cx,
                cy,
                maxLen,
                expand,
                wavePhase,
                implode,
              );
            }
            traceSmoothPolyline(ctx, pts);
          }

          if (isFinale && extraBatch.length > 0) {
            for (const rayIdx of extraBatch) {
              const ray = field.rays[rayIdx]!;
              const tau = reduceMotion ? 4 : Math.max(0, finaleAge - ray.staggerFinale);
              if (tau <= 0) continue;
              const grow = reduceMotion ? 1 : clamp(1 - Math.exp(-3.4 * tau), 0, 1.04);
              const maxLen = outerReach * ray.reachMul;
              const pts: Vec[] = new Array(RAY_STEPS + 1);
              for (let k = 0; k <= RAY_STEPS; k++) {
                pts[k] = evaluateRayPoint(
                  ray,
                  sampleUs[k]!,
                  cx,
                  cy,
                  maxLen,
                  grow,
                  wavePhase,
                  implode,
                );
              }
              traceSmoothPolyline(ctx, pts);
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
            const pA = evaluateRayPoint(
              rA,
              syn.u,
              cx,
              cy,
              outerReach * rA.reachMul,
              growA,
              wavePhase,
              implode,
            );
            const pB = evaluateRayPoint(
              rB,
              syn.u,
              cx,
              cy,
              outerReach * rB.reachMul,
              growB,
              wavePhase,
              implode,
            );
            const midX = (pA.x + pB.x) * 0.5 + (pB.y - pA.y) * syn.curve;
            const midY = (pA.y + pB.y) * 0.5 - (pB.x - pA.x) * syn.curve;
            ctx.moveTo(pA.x, pA.y);
            ctx.quadraticCurveTo(midX, midY, pB.x, pB.y);
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
          const pos = evaluateRayPoint(
            ray,
            pt.u,
            cx,
            cy,
            outerReach * ray.reachMul,
            expand,
            wavePhase,
            implode,
          );
          const fade = Math.sin(pt.u * Math.PI);
          ctx.fillStyle = `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;
          ctx.globalAlpha = pt.alpha * fade * (isLight ? 0.85 : 1) * (1 + fillEase * 0.35);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pt.size * (1 + fillEase * 0.45), 0, TAU);
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

      // 2. Terminal Supernova Explosion & Nova Wash (Substage 3: after collapse -> regular dashboard)
      if (isFinale && raysCollapsed) {
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

        // Expanding golden-white blast front washing across the whole viewport
        const novaR = Math.max(8, diag * 1.18 * blastEase);
        const novaAlpha = clamp(Math.pow(blastEase, 0.72) * 0.94, 0, 0.96);
        ctx.globalCompositeOperation = "source-over";
        const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, novaR);
        if (isLight) {
          ng.addColorStop(0, `rgba(255, 252, 244, ${novaAlpha})`);
          ng.addColorStop(0.5, `rgba(250, 232, 188, ${novaAlpha * 0.92})`);
          ng.addColorStop(0.84, `rgba(228, 174, 68, ${novaAlpha * 0.55})`);
          ng.addColorStop(1, "rgba(247, 246, 242, 0)");
        } else {
          ng.addColorStop(0, `rgba(255, 252, 242, ${novaAlpha})`);
          ng.addColorStop(0.45, `rgba(255, 224, 150, ${novaAlpha * 0.92})`);
          ng.addColorStop(0.8, `rgba(232, 160, 52, ${novaAlpha * 0.52})`);
          ng.addColorStop(1, "rgba(0, 0, 0, 0)");
        }
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(cx, cy, novaR, 0, TAU);
        ctx.fill();
      }

      // 3. Shockwave Rings expanding across viewport
      ctx.globalCompositeOperation = blendOp;
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

      // 4. Center Singularity Dot (ZERO glow halo at start; sharp solid golden point)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 1;

      if (curPhase === "singularity") {
        // Pure crisp dot with no outer glow or bloom
        ctx.globalCompositeOperation = "source-over";
        const dotR =
          clamp(minDim * 0.017, 9, 14) *
          (1 + 0.02 * Math.sin(time * 1.1) + 0.14 * hoverFocus);
        const aaEdge = Math.max(0.84, (dotR - 1.25) / dotR);
        const solidDot = ctx.createRadialGradient(-dotR * 0.18, -dotR * 0.18, 0, 0, 0, dotR);
        if (isLight) {
          solidDot.addColorStop(0, "#d48d1a");
          solidDot.addColorStop(aaEdge, "#a86606");
          solidDot.addColorStop(1, "rgba(168, 102, 6, 0)");
        } else {
          solidDot.addColorStop(0, "#ffe49e");
          solidDot.addColorStop(aaEdge, "#f0b446");
          solidDot.addColorStop(1, "rgba(240, 180, 70, 0)");
        }
        ctx.fillStyle = solidDot;
        ctx.beginPath();
        ctx.arc(0, 0, dotR, 0, TAU);
        ctx.fill();
      } else {
        // Active glow only once ignited into neural lines (smoothly fades in over 0.25s)
        const glowIn = isFinale ? 1 : clamp(explodeAge / 0.25, 0, 1);
        ctx.globalCompositeOperation = blendOp;

        const haloOuter: Rgb = isLight ? [174, 102, 6] : [188, 102, 20];
        const haloMid: Rgb = isLight ? [204, 134, 14] : [242, 172, 56];
        const haloInner: Rgb = isLight ? [228, 168, 42] : [255, 226, 154];

        const haloR = Math.max(2, coreBaseR * (1.28 + 0.35 * coreFlash) * coreScale);
        if (glowIn > 0.01) {
          ctx.fillStyle = createMoffat(
            haloR,
            haloR * 0.22,
            1.85,
            clamp(((isLight ? 0.36 : 0.42) + 0.25 * coreFlash) * glowIn, 0, 1),
            haloInner,
            haloMid,
            haloOuter,
          );
          ctx.beginPath();
          ctx.arc(0, 0, haloR, 0, TAU);
          ctx.fill();
        }

        const orbR = Math.max(3, coreBaseR * (0.34 + 0.15 * coreFlash) * coreScale);
        ctx.fillStyle = createMoffat(
          orbR,
          orbR * 0.28,
          2.35,
          clamp((isLight ? 0.88 : 0.96) + 0.15 * coreFlash, 0, 1),
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
      const fitted = fitCanvas(canvas, ctx);
      width = fitted.width;
      height = fitted.height;
      diag = Math.hypot(width, height);
      if (reduceMotion) draw(6, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const rawDt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
      last = now;
      smoothDt = lerp(smoothDt, rawDt, 0.16);
      smoothTime += smoothDt;
      draw(smoothTime, smoothDt);
      frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
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
}
