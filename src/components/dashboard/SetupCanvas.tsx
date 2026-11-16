"use client";

import { useEffect, useRef } from "react";
import { clamp, fitCanvas, lerp, seededHelpers, type Vec } from "@/lib/network/geometry";

export type SetupStagePhase = "singularity" | "exploding" | "modal";

type Rgb = readonly [number, number, number];

const TAU = Math.PI * 2;
const RAY_COUNT = 168;
const RAY_STEPS = 22;

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
  reachMul: number;
  layer: number;
};

type OrbitMote = {
  angle: number;
  speed: number;
  radius: number;
  tilt: number;
  size: number;
  alpha: number;
};

type BurstPhoton = {
  rayIdx: number;
  u: number;
  speed: number;
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
  const layerBatches: number[][] = DEPTH_LAYERS.map(() => []);

  for (let i = 0; i < RAY_COUNT; i++) {
    // Cover all 360deg with gentle 12-stream organic neural bundling
    const base = (i / RAY_COUNT) * TAU;
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
      reachMul: between(0.76, 1.18),
      layer,
    });
    layerBatches[layer]!.push(idx);
  }

  const motes: OrbitMote[] = Array.from({ length: 110 }, () => ({
    angle: rnd() * TAU,
    speed: between(0.14, 0.42) * (rnd() > 0.2 ? 1 : -1),
    radius: between(0.18, 1.05),
    tilt: between(0.32, 0.85),
    size: between(0.65, 1.65),
    alpha: between(0.28, 0.82),
  }));

  const photons: BurstPhoton[] = Array.from({ length: 300 }, (_, i) => ({
    rayIdx: i % rays.length,
    u: rnd(),
    speed: between(0.08, 0.21),
    size: between(0.55, 1.65),
    alpha: between(0.38, 0.92),
  }));

  return { rays, layerBatches, motes, photons };
}

export function SetupCanvas({
  phase,
  theme,
  impulseSerial = 0,
  onClickSingularity,
}: {
  phase: SetupStagePhase;
  theme: "dark" | "light";
  impulseSerial?: number;
  onClickSingularity?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const themeRef = useRef(theme);
  const impulseRef = useRef(impulseSerial);
  const clickCbRef = useRef(onClickSingularity);

  useEffect(() => {
    phaseRef.current = phase;
    themeRef.current = theme;
    impulseRef.current = impulseSerial;
    clickCbRef.current = onClickSingularity;
  }, [phase, theme, impulseSerial, onClickSingularity]);

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
    let burstLaunched = trackedPhase !== "singularity";
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
      const cy = height * 0.43;
      if (Math.hypot(x - cx, y - cy) <= Math.min(width, height) * 0.24) {
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
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      const stops = 16;
      for (let i = 0; i <= stops; i++) {
        const u = i / stops;
        const rn = (u * radius) / coreR;
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
    ): Vec => {
      const r = u * maxLen * burstFrac;
      const sway =
        ray.waveAmp *
        (Math.sin(u * 4.2 * ray.freqMul - waveTime * ray.freqMul + ray.phase) * 0.72 +
          Math.cos(u * 6.4 * ray.freqMul - waveTime * 1.15 - ray.phase) * 0.28) *
        Math.pow(u, 0.78);
      const theta = ray.angle + ray.bend * Math.pow(u, 1.15) + sway;

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
        trackedPhase = curPhase;
      }

      if (impulseRef.current !== lastImpulse) {
        lastImpulse = impulseRef.current;
        if (curPhase !== "singularity" && !reduceMotion) {
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
      const cy = height * lerp(0.43, 0.5, centerShift * centerShift * (3 - 2 * centerShift));

      const minDim = Math.min(width, height);
      const coreBaseR = clamp(minDim * 0.24, 96, 210);

      // Smooth hover pulse when cursor approaches the golden singularity
      let targetHover = 0;
      if (pointerActive && curPhase === "singularity") {
        const d = Math.hypot(pointerSmooth.x - cx, pointerSmooth.y - cy);
        targetHover = clamp(1 - d / (coreBaseR * 1.15), 0, 1);
      }
      hoverFocus = lerp(hoverFocus, targetHover, reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));

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

      // Anticipation compression (0..0.14s) followed by omnidirectional supernova detonation
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

      if (!reduceMotion) {
        const waveRate = curPhase === "singularity" ? 0.35 : 0.48 + 0.8 * Math.exp(-burstTime * 1.6);
        wavePhase += dt * waveRate;
      }

      // 1. Omnidirectional 360-degree flowing neural lines (burst outward once pressed)
      if (curPhase !== "singularity" && (burstTime > 0 || reduceMotion)) {
        const outerReach = diag * 0.82;
        const speedBoost = 1 + 2.4 * Math.exp(-burstTime * 1.5);

        ctx.globalCompositeOperation = blendOp;
        ctx.globalAlpha = 1;

        for (let layerIdx = 0; layerIdx < DEPTH_LAYERS.length; layerIdx++) {
          const layer = DEPTH_LAYERS[layerIdx]!;
          const batch = field.layerBatches[layerIdx]!;
          if (!batch.length) continue;

          const rgb = mixRgb(goldMid, goldCore, layer.hot + coreFlash * 0.2);
          const edgeRgb = mixRgb(goldDeep, goldBright, layer.hot * 0.5);
          const a = layer.alpha * alphaScale * (0.85 + 0.35 * coreFlash);

          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerReach);
          rg.addColorStop(0, `rgba(${rgb}, ${clamp(a * 1.9, 0, 1)})`);
          rg.addColorStop(0.28, `rgba(${rgb}, ${clamp(a * 1.15, 0, 1)})`);
          rg.addColorStop(0.68, `rgba(${edgeRgb}, ${clamp(a * 0.48, 0, 1)})`);
          rg.addColorStop(1, `rgba(${edgeRgb}, 0)`);

          ctx.beginPath();
          for (const rayIdx of batch) {
            const ray = field.rays[rayIdx]!;
            const tau = reduceMotion ? 4 : Math.max(0, burstTime - ray.stagger);
            if (tau <= 0) continue;
            // Underdamped burst expansion across all directions
            const expand = reduceMotion ? 1 : clamp(1 - Math.exp(-2.8 * tau) * Math.cos(1.8 * tau), 0, 1.03);
            const maxLen = outerReach * ray.reachMul;
            const pts: Vec[] = new Array(RAY_STEPS + 1);
            for (let k = 0; k <= RAY_STEPS; k++) {
              pts[k] = evaluateRayPoint(ray, sampleUs[k]!, cx, cy, maxLen, expand, wavePhase);
            }
            traceSmoothPolyline(ctx, pts);
          }

          ctx.lineWidth = layer.width * (isLight ? 1.08 : 0.96);
          ctx.strokeStyle = rg;
          ctx.stroke();
        }

        // Flowing golden photons along all 360deg rays
        for (const pt of field.photons) {
          const ray = field.rays[pt.rayIdx]!;
          const tau = reduceMotion ? 4 : Math.max(0, burstTime - ray.stagger);
          if (tau <= 0) continue;
          const expand = reduceMotion ? 1 : clamp(1 - Math.exp(-2.8 * tau) * Math.cos(1.8 * tau), 0, 1.03);
          if (!reduceMotion) {
            pt.u = (pt.u + pt.speed * speedBoost * dt) % 1;
          }
          const pos = evaluateRayPoint(ray, pt.u, cx, cy, outerReach * ray.reachMul, expand, wavePhase);
          const fade = Math.sin(pt.u * Math.PI);
          ctx.fillStyle = `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;
          ctx.globalAlpha = pt.alpha * fade * (isLight ? 0.85 : 1);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pt.size, 0, TAU);
          ctx.fill();
        }
      }

      // 2. Shockwave Rings expanding across viewport on explosion & setup actions
      ctx.globalCompositeOperation = blendOp;
      ctx.lineWidth = 1.25;
      for (let i = shockRings.length - 1; i >= 0; i--) {
        const ring = shockRings[i]!;
        if (!reduceMotion) ring.u += ring.speed * dt;
        if (ring.u >= 1) {
          shockRings.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - ring.u, 2.4);
        const fade = Math.pow(1 - ring.u, 2.1) * ring.strength;
        const c = ring.crimson ? mixRgb(goldBright, CRIMSON_ACCENT, clamp(ring.u * 1.4, 0, 1)) : `${goldBright[0]}, ${goldBright[1]}, ${goldBright[2]}`;
        ctx.strokeStyle = `rgba(${c}, ${0.42 * fade * alphaScale})`;
        ctx.beginPath();
        ctx.arc(cx, cy, diag * 0.72 * ease, 0, TAU);
        ctx.stroke();
      }

      // 3. The Golden Glowing Singularity Nucleus (16-stop Moffat PSF + Spiral Involutes + Orbital Motes)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
      ctx.globalAlpha = 1;

      const fieldScale = curPhase === "singularity" ? 1.12 + 0.14 * hoverFocus : 0.86;
      const wideR = coreBaseR * 1.9 * coreScale * fieldScale;
      const haloInner: Rgb = isLight ? [228, 168, 42] : [255, 226, 154];
      const haloMid: Rgb = isLight ? [204, 134, 14] : [242, 172, 56];
      const haloOuter: Rgb = isLight ? [174, 102, 6] : [188, 102, 20];

      ctx.save();
      ctx.scale(1.24, 0.92);
      ctx.fillStyle = createMoffat(
        wideR,
        wideR * 0.24,
        1.82,
        (isLight ? 0.3 : 0.28) + 0.12 * hoverFocus + 0.18 * coreFlash,
        haloInner,
        haloMid,
        haloOuter,
      );
      ctx.beginPath();
      ctx.arc(0, 0, wideR, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Logarithmic spiral plasma involutes inside/around the core
      const involutes = 44;
      const invReach = coreBaseR * 0.78 * coreScale;
      const invStr = isLight ? "184, 112, 10" : "255, 228, 162";
      const invGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, invReach);
      invGrad.addColorStop(0, `rgba(${invStr}, ${0.32 + 0.16 * hoverFocus + 0.2 * coreFlash})`);
      invGrad.addColorStop(0.5, `rgba(${invStr}, ${0.12 + 0.08 * hoverFocus})`);
      invGrad.addColorStop(1, `rgba(${invStr}, 0)`);

      ctx.beginPath();
      for (let i = 0; i < involutes; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const theta = (i / involutes) * TAU + time * 0.12 * dir;
        const curl = dir * (0.48 + 0.15 * hoverFocus);
        const r1 = invReach * 0.34;
        const r2 = invReach * (0.68 + 0.25 * Math.sin(i * 1.9 + time * 0.45));
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
          Math.cos(theta + curl * 0.35) * r1,
          Math.sin(theta + curl * 0.35) * r1 * 0.85,
          Math.cos(theta + curl * 0.78) * r2 * 0.9,
          Math.sin(theta + curl * 0.78) * r2 * 0.78,
          Math.cos(theta + curl) * r2,
          Math.sin(theta + curl) * r2 * 0.88,
        );
      }
      ctx.lineWidth = isLight ? 0.75 : 0.62;
      ctx.strokeStyle = invGrad;
      ctx.stroke();

      // Anamorphic golden caustic lens flare across waist
      ctx.save();
      ctx.scale(2.4, 0.24);
      const anaR = coreBaseR * 0.92 * coreScale;
      ctx.fillStyle = createMoffat(
        anaR,
        anaR * 0.24,
        2.15,
        (isLight ? 0.36 : 0.34) + 0.16 * hoverFocus + 0.22 * coreFlash,
        isLight ? [196, 124, 12] : [255, 244, 210],
        isLight ? [218, 152, 28] : [248, 192, 86],
        haloOuter,
      );
      ctx.beginPath();
      ctx.arc(0, 0, anaR, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Incandescent golden nucleus heart
      const heartR = coreBaseR * 0.62 * coreScale;
      ctx.fillStyle = createMoffat(
        heartR,
        heartR * 0.22,
        2.35,
        clamp((isLight ? 0.72 : 0.78) + 0.15 * hoverFocus + 0.2 * coreFlash, 0, 1),
        isLight ? [156, 88, 6] : [255, 251, 236],
        isLight ? [198, 128, 16] : [255, 216, 122],
        isLight ? [228, 168, 42] : [236, 156, 42],
      );
      ctx.beginPath();
      ctx.arc(0, 0, heartR, 0, TAU);
      ctx.fill();

      // Orbital golden dust motes around the suspended singularity before explosion
      if (curPhase === "singularity") {
        for (const m of field.motes) {
          const theta = m.angle + time * m.speed;
          const orbR = coreBaseR * (0.45 + m.radius * (1.25 - 0.15 * hoverFocus));
          const mx = Math.cos(theta) * orbR;
          const my = Math.sin(theta) * orbR * m.tilt;
          ctx.fillStyle = `rgb(${goldCore[0]}, ${goldCore[1]}, ${goldCore[2]})`;
          ctx.globalAlpha = m.alpha * (0.7 + 0.3 * hoverFocus);
          ctx.beginPath();
          ctx.arc(mx, my, m.size, 0, TAU);
          ctx.fill();
        }
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
