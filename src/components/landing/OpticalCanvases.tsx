"use client";

import { useEffect, useRef } from "react";
import {
  bezier,
  clamp,
  fitCanvas,
  lerp,
  observeCanvasActivity,
  radialGlow,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";
import type { EcosystemLayer } from "./WorkspaceVisuals";

const GOLD_HOT = "255, 246, 222";
const GOLD_BRIGHT = "255, 224, 152";
const GOLD_MID = "246, 184, 72";
const GOLD_DEEP = "218, 140, 38";

const SILVER_HOT = "255, 255, 255";
const SILVER_BRIGHT = "236, 240, 248";
const SILVER_MID = "188, 196, 214";
const SILVER_DEEP = "128, 138, 160";

type PointerTracker = {
  x: number;
  y: number;
  sx: number;
  sy: number;
  presence: number;
  inside: boolean;
};

function useOpticalLoop(
  drawFrame: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    dt: number,
    pointer: PointerTracker,
  ) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(drawFrame);

  useEffect(() => {
    drawRef.current = drawFrame;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer: PointerTracker = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, presence: 0, inside: false };
    let width = 1;
    let height = 1;
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let active = true;

    const resize = () => {
      const dims = fitCanvas(canvas, ctx);
      width = dims.width;
      height = dims.height;
      drawRef.current(ctx, width, height, elapsed, 0, pointer);
    };

    const tick = (now: number) => {
      if (!active || reduceMotion) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;

      const follow = 1 - Math.exp(-dt * 8);
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      pointer.presence += ((pointer.inside ? 1 : 0) - pointer.presence) * (1 - Math.exp(-dt * 4.5));

      drawRef.current(ctx, width, height, elapsed, dt, pointer);
      frame = requestAnimationFrame(tick);
    };

    const target = canvas.parentElement ?? canvas;
    const onMove = (e: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      pointer.y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      pointer.inside = true;
    };
    const onLeave = () => {
      pointer.inside = false;
    };

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerleave", onLeave);

    const stopVis = observeCanvasActivity(canvas, (isActive) => {
      active = isActive;
      if (isActive && !reduceMotion && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(tick);
      } else if (!isActive && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    if (!reduceMotion && active && frame === 0) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      stopVis();
      ro.disconnect();
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return canvasRef;
}

function drawSilkStrand(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  uNorm: number,
  swell: number,
  phase: number,
  freq: number,
  time: number,
  strokeStyle: string | CanvasGradient,
  lineWidth: number,
  pointerOffsetX: number,
  pointerOffsetY: number,
  pointerStrength: number,
) {
  const samples = 24;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const bx = lerp(x0, x1, t);
    const by = lerp(y0, y1, t);
    const bell = Math.sin(t * Math.PI);
    const env = 1.2 + swell * Math.pow(bell, 0.85);
    const wave = Math.sin(t * Math.PI * freq + phase + time * 0.72);
    const offset = (uNorm * 0.72 + wave * 0.42 * (0.4 + 0.6 * (1 - Math.abs(uNorm)))) * env;

    let px = bx + nx * offset;
    let py = by + ny * offset;

    if (pointerStrength > 0.005) {
      const dist = Math.hypot(px - pointerOffsetX, py - pointerOffsetY);
      const reach = 110;
      if (dist < reach) {
        const push = (1 - dist / reach) * bell * pointerStrength * 14;
        const ang = Math.atan2(py - pointerOffsetY, px - pointerOffsetX);
        px += Math.cos(ang) * push;
        py += Math.sin(ang) * push;
      }
    }

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
}

/**
 * 1. TierFlowStrip optical bridge:
 * 36 multi-bucket braided strands pinching at Network (24k Gold), Command (Platinum), and Nodes (Platinum).
 */
export function TierSilkCanvas({ activeLayer }: { activeLayer: EcosystemLayer }) {
  const layerRef = useRef<EcosystemLayer>(activeLayer);
  const surgeRef = useRef(0);
  const lastLayerRef = useRef<EcosystemLayer>(activeLayer);

  useEffect(() => {
    if (lastLayerRef.current !== activeLayer) {
      lastLayerRef.current = activeLayer;
      surgeRef.current = 1;
    }
    layerRef.current = activeLayer;
  }, [activeLayer]);

  const strandsRef = useRef(
    (() => {
      const { rnd, between } = seededHelpers(31089);
      return Array.from({ length: 18 }, (_, i) => ({
        uNorm: (i / 17) * 2 - 1,
        phase: rnd() * Math.PI * 2,
        freq: between(1.6, 2.8),
        width: i % 4 === 0 ? 0.95 : 0.56,
        alpha: i % 4 === 0 ? 0.42 : 0.19,
        speed: between(0.24, 0.42),
        offset: rnd(),
      }));
    })(),
  );

  const canvasRef = useOpticalLoop((ctx, w, h, time, dt, pointer) => {
    if (dt > 0 && surgeRef.current > 0) {
      surgeRef.current = Math.max(0, surgeRef.current - dt * 1.5);
    }

    const active = layerRef.current;
    const seg1Boost = active === "network" || active === "command" ? 1.15 : 0.65;
    const seg2Boost = active === "command" || active === "nodes" ? 1.15 : 0.65;
    const surgeBoost = 1 + surgeRef.current * 0.7;

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const y = Math.min(28, h * 0.5);
    const x1 = w * (1 / 6);
    const x2 = w * 0.5;
    const x3 = w * (5 / 6);
    const px = pointer.sx * w;
    const py = pointer.sy * h;
    const strands = strandsRef.current;

    // Subtle feathered ingress from left -> Network (24k Gold) & egress from Nodes -> right (Platinum)
    for (let i = 0; i < 8; i++) {
      const u = (i / 7) * 2 - 1;
      const spreadY = u * 16;
      const gLeft = ctx.createLinearGradient(0, y + spreadY, x1, y);
      gLeft.addColorStop(0, `rgba(${GOLD_DEEP}, 0)`);
      gLeft.addColorStop(1, `rgba(${GOLD_BRIGHT}, ${0.28 * (1 - Math.abs(u) * 0.4)})`);
      ctx.beginPath();
      ctx.moveTo(0, y + spreadY);
      ctx.quadraticCurveTo(x1 * 0.55, y + spreadY * 0.4, x1, y);
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = gLeft;
      ctx.stroke();

      const gRight = ctx.createLinearGradient(x3, y, w, y + spreadY);
      gRight.addColorStop(0, `rgba(${SILVER_BRIGHT}, ${0.26 * (1 - Math.abs(u) * 0.4)})`);
      gRight.addColorStop(1, `rgba(${SILVER_DEEP}, 0)`);
      ctx.beginPath();
      ctx.moveTo(x3, y);
      ctx.quadraticCurveTo(lerp(x3, w, 0.45), y + spreadY * 0.4, w, y + spreadY);
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = gRight;
      ctx.stroke();
    }

    // Span 1: Network (Gold) -> Command (Platinum-Silver)
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i]!;
      const g = ctx.createLinearGradient(x1, y, x2, y);
      const a = Math.min(0.82, s.alpha * seg1Boost * surgeBoost);
      g.addColorStop(0, `rgba(${GOLD_BRIGHT}, ${a})`);
      g.addColorStop(0.45, `rgba(${GOLD_MID}, ${a * 0.85})`);
      g.addColorStop(0.82, `rgba(${SILVER_BRIGHT}, ${a * 0.88})`);
      g.addColorStop(1, `rgba(${SILVER_HOT}, ${a})`);
      drawSilkStrand(ctx, x1, y, x2, y, s.uNorm, 15, s.phase, s.freq, time, g, s.width, px, py, pointer.presence);

      if (i % 4 === 0) {
        const u = (s.offset + time * s.speed) % 1;
        const sx = lerp(x1, x2, u);
        const sy = y + Math.sin(u * Math.PI) * s.uNorm * 8;
        const glowColor = u < 0.55 ? GOLD_HOT : SILVER_HOT;
        radialGlow(ctx, { x: sx, y: sy }, 7, [
          [0, `rgba(${glowColor}, ${Math.sin(u * Math.PI) * 0.85})`],
          [1, "rgba(0,0,0,0)"],
        ]);
      }
    }

    // Span 2: Command (Platinum) -> Nodes (Platinum) — ZERO Gold
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i]!;
      const g = ctx.createLinearGradient(x2, y, x3, y);
      const a = Math.min(0.82, s.alpha * seg2Boost * surgeBoost);
      g.addColorStop(0, `rgba(${SILVER_HOT}, ${a})`);
      g.addColorStop(0.5, `rgba(${SILVER_MID}, ${a * 0.82})`);
      g.addColorStop(1, `rgba(${SILVER_BRIGHT}, ${a})`);
      drawSilkStrand(
        ctx,
        x2,
        y,
        x3,
        y,
        s.uNorm,
        15,
        s.phase + 1.4,
        s.freq,
        time,
        g,
        s.width,
        px,
        py,
        pointer.presence,
      );

      if (i % 4 === 1) {
        const u = (s.offset + time * s.speed) % 1;
        const sx = lerp(x2, x3, u);
        const sy = y + Math.sin(u * Math.PI) * s.uNorm * 8;
        radialGlow(ctx, { x: sx, y: sy }, 7, [
          [0, `rgba(${SILVER_HOT}, ${Math.sin(u * Math.PI) * 0.82})`],
          [1, "rgba(0,0,0,0)"],
        ]);
      }
    }

    // Precision radial waist pinches
    radialGlow(ctx, { x: x1, y }, active === "network" ? 26 : 18, [
      [0, `rgba(${GOLD_HOT}, ${active === "network" ? 0.65 : 0.36})`],
      [0.4, `rgba(${GOLD_MID}, ${active === "network" ? 0.25 : 0.12})`],
      [1, "rgba(0,0,0,0)"],
    ]);
    radialGlow(ctx, { x: x2, y }, active === "command" ? 26 : 18, [
      [0, `rgba(${SILVER_HOT}, ${active === "command" ? 0.58 : 0.32})`],
      [0.45, `rgba(${SILVER_MID}, ${active === "command" ? 0.2 : 0.08})`],
      [1, "rgba(0,0,0,0)"],
    ]);
    radialGlow(ctx, { x: x3, y }, active === "nodes" ? 26 : 18, [
      [0, `rgba(${SILVER_HOT}, ${active === "nodes" ? 0.58 : 0.32})`],
      [0.45, `rgba(${SILVER_MID}, ${active === "nodes" ? 0.2 : 0.08})`],
      [1, "rgba(0,0,0,0)"],
    ]);
  });

  return <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden="true" />;
}

/**
 * 2. WorkflowsShowcase optical field:
 * 56 braided silk strands + dust + particles; 24k Gold top Neural canopy appears ONLY in "ai" mode,
 * dissolving smoothly to pure platinum-silver in "zero-ai" mode.
 */
export function WorkflowFieldCanvas({
  mode,
  splitRight,
}: {
  mode: "ai" | "zero-ai";
  splitRight: boolean;
}) {
  const modeRef = useRef(mode);
  const splitRef = useRef(splitRight);
  const smoothRef = useRef({
    aiMix: mode === "ai" ? 1 : 0,
    splitMix: splitRight ? 1 : 0,
  });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    splitRef.current = splitRight;
  }, [splitRight]);

  const dataRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(88412);
      const strands = Array.from({ length: 28 }, (_, i) => ({
        laneOffset: gauss() * 26,
        uNorm: (i / 27) * 2 - 1,
        phase: rnd() * Math.PI * 2,
        freq: between(1.8, 3.2),
        width: i % 5 === 0 ? 1.05 : i % 2 === 0 ? 0.65 : 0.45,
        alpha: i % 5 === 0 ? 0.36 : i % 2 === 0 ? 0.18 : 0.11,
        speed: between(0.14, 0.3),
        offset: rnd(),
      }));
      const neuralCanopy = Array.from({ length: 28 }, (_, i) => ({
        xOffset: ((i / 27) - 0.5) * 2,
        phase: rnd() * Math.PI * 2,
        width: i % 4 === 0 ? 0.95 : 0.55,
        alpha: i % 4 === 0 ? 0.42 : 0.2,
        speed: between(0.18, 0.36),
        offset: rnd(),
      }));
      const dust = Array.from({ length: 80 }, () => ({
        x: rnd(),
        y: 0.15 + rnd() * 0.7,
        size: between(0.7, 1.4),
        phase: rnd() * Math.PI * 2,
      }));
      return { strands, neuralCanopy, dust };
    })(),
  );

  const canvasRef = useOpticalLoop((ctx, w, h, time, dt, pointer) => {
    const rate = dt > 0 ? clamp(dt * 4.5, 0, 1) : 1;
    const s = smoothRef.current;
    s.aiMix = lerp(s.aiMix, modeRef.current === "ai" ? 1 : 0, rate);
    s.splitMix = lerp(s.splitMix, splitRef.current ? 1 : 0, rate);

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const isWide = w >= 860;
    const leftPt: Vec = isWide ? { x: w * 0.24, y: h * 0.5 } : { x: w * 0.5, y: h * 0.22 };
    const centerPt: Vec = { x: w * 0.5, y: h * 0.5 };
    const rightTopY = lerp(h * 0.5, h * 0.34, s.splitMix);
    const rightBotY = lerp(h * 0.5, h * 0.66, s.splitMix);
    const rightX = isWide ? w * 0.76 : w * 0.5;
    const px = pointer.sx * w;
    const py = pointer.sy * h;

    const { strands, neuralCanopy, dust } = dataRef.current;

    // 1. Ambient atmospheric wing filaments spanning outer canvas edges (pure platinum-silver)
    for (let i = 0; i < strands.length; i++) {
      const st = strands[i]!;
      const sway = Math.sin(time * 0.38 + st.phase) * 8;
      const p0: Vec = { x: 0, y: h * 0.5 + st.laneOffset * 2.1 + sway };
      const p1: Vec = isWide ? leftPt : centerPt;
      const gIn = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      gIn.addColorStop(0, `rgba(${SILVER_DEEP}, 0)`);
      gIn.addColorStop(0.6, `rgba(${SILVER_MID}, ${st.alpha * 0.55})`);
      gIn.addColorStop(1, `rgba(${SILVER_BRIGHT}, ${st.alpha * 0.95})`);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(
        lerp(p0.x, p1.x, 0.45),
        p0.y,
        lerp(p0.x, p1.x, 0.75),
        p1.y + st.laneOffset * 0.35,
        p1.x,
        p1.y,
      );
      ctx.lineWidth = st.width * 0.85;
      ctx.strokeStyle = gIn;
      ctx.stroke();

      // Left -> Center bundled optical stream (platinum-silver)
      if (isWide) {
        const gMid = ctx.createLinearGradient(leftPt.x, leftPt.y, centerPt.x, centerPt.y);
        gMid.addColorStop(0, `rgba(${SILVER_BRIGHT}, ${st.alpha})`);
        gMid.addColorStop(1, `rgba(${SILVER_HOT}, ${st.alpha * 1.15})`);
        drawSilkStrand(
          ctx,
          leftPt.x,
          leftPt.y,
          centerPt.x,
          centerPt.y,
          st.uNorm,
          20,
          st.phase,
          st.freq,
          time,
          gMid,
          st.width,
          px,
          py,
          pointer.presence,
        );

        // Center -> Right stream(s) (splits symmetrically when splitRight is active)
        const targetY = i % 2 === 0 ? rightTopY : rightBotY;
        const gOut = ctx.createLinearGradient(centerPt.x, centerPt.y, rightX, targetY);
        const startRgb = s.aiMix > 0.15 ? GOLD_BRIGHT : SILVER_HOT;
        gOut.addColorStop(0, `rgba(${startRgb}, ${st.alpha * (1 + s.aiMix * 0.2)})`);
        gOut.addColorStop(0.45, `rgba(${SILVER_BRIGHT}, ${st.alpha})`);
        gOut.addColorStop(1, `rgba(${SILVER_MID}, ${st.alpha * 0.85})`);
        drawSilkStrand(
          ctx,
          centerPt.x,
          centerPt.y,
          rightX,
          targetY,
          st.uNorm,
          20,
          st.phase + 2,
          st.freq,
          time,
          gOut,
          st.width,
          px,
          py,
          pointer.presence,
        );

        // Right -> edge dissipation
        const endPt: Vec = { x: w, y: targetY + st.laneOffset * 1.9 - sway };
        const gEdge = ctx.createLinearGradient(rightX, targetY, endPt.x, endPt.y);
        gEdge.addColorStop(0, `rgba(${SILVER_BRIGHT}, ${st.alpha * 0.78})`);
        gEdge.addColorStop(1, `rgba(${SILVER_DEEP}, 0)`);
        ctx.beginPath();
        ctx.moveTo(rightX, targetY);
        ctx.bezierCurveTo(
          lerp(rightX, endPt.x, 0.3),
          targetY + st.laneOffset * 0.3,
          lerp(rightX, endPt.x, 0.65),
          endPt.y,
          endPt.x,
          endPt.y,
        );
        ctx.lineWidth = st.width * 0.8;
        ctx.strokeStyle = gEdge;
        ctx.stroke();
      }

      if (i % 3 === 0) {
        const u = (st.offset + time * st.speed) % 1;
        const pos = isWide
          ? {
              x: lerp(leftPt.x, rightX, u),
              y: lerp(leftPt.y, u < 0.5 ? centerPt.y : i % 2 === 0 ? rightTopY : rightBotY, u) +
                Math.sin(u * Math.PI * 2) * st.uNorm * 10,
            }
          : { x: w * 0.5 + st.uNorm * 22, y: lerp(h * 0.16, h * 0.84, u) };
        const particleRgb = s.aiMix > 0.4 && u > 0.38 && u < 0.65 ? GOLD_HOT : SILVER_HOT;
        radialGlow(ctx, pos, 8, [
          [0, `rgba(${particleRgb}, ${Math.sin(u * Math.PI) * 0.85})`],
          [1, "rgba(0,0,0,0)"],
        ]);
      }
    }

    // 2. Descending 24k Golden Neural Network Canopy (ONLY rendered when aiMix > 0.01)
    if (s.aiMix > 0.01) {
      const topCenter: Vec = { x: w * 0.5, y: 0 };
      for (let i = 0; i < neuralCanopy.length; i++) {
        const nc = neuralCanopy[i]!;
        const xStart = topCenter.x + nc.xOffset * w * 0.24;
        const sway = Math.sin(time * 0.45 + nc.phase) * 9;
        const c1: Vec = { x: xStart + sway * 0.4, y: h * 0.18 };
        const c2: Vec = { x: centerPt.x + nc.xOffset * 18, y: h * 0.36 };
        const g = ctx.createLinearGradient(xStart, 0, centerPt.x, centerPt.y);
        g.addColorStop(0, `rgba(${GOLD_DEEP}, 0)`);
        g.addColorStop(0.45, `rgba(${GOLD_MID}, ${nc.alpha * s.aiMix})`);
        g.addColorStop(1, `rgba(${GOLD_HOT}, ${nc.alpha * 1.3 * s.aiMix})`);

        ctx.beginPath();
        ctx.moveTo(xStart, 0);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, centerPt.x, centerPt.y);
        ctx.lineWidth = nc.width;
        ctx.strokeStyle = g;
        ctx.stroke();

        if (i % 3 === 0) {
          const u = (nc.offset + time * nc.speed) % 1;
          const pos = bezier({ x: xStart, y: 0 }, c1, c2, centerPt, u);
          ctx.fillStyle = `rgba(${GOLD_HOT}, ${Math.sin(u * Math.PI) * 0.88 * s.aiMix})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      radialGlow(ctx, centerPt, 68 * s.aiMix, [
        [0, `rgba(${GOLD_HOT}, ${0.52 * s.aiMix})`],
        [0.35, `rgba(${GOLD_MID}, ${0.22 * s.aiMix})`],
        [1, "rgba(0,0,0,0)"],
      ]);
    } else {
      // Cool pearl-white hub glow in Zero-AI mode
      radialGlow(ctx, centerPt, 54, [
        [0, `rgba(${SILVER_HOT}, 0.38)`],
        [0.4, `rgba(${SILVER_MID}, 0.14)`],
        [1, "rgba(0,0,0,0)"],
      ]);
    }

    // 3. Drifting optical dust
    for (const d of dust) {
      const twinkle = 0.3 + 0.7 * Math.sin(time * 1.1 + d.phase);
      const isGoldenDust = s.aiMix > 0.25 && Math.abs(d.x - 0.5) < 0.16 && d.y < 0.56;
      ctx.fillStyle = isGoldenDust ? `rgb(${GOLD_BRIGHT})` : `rgb(${SILVER_BRIGHT})`;
      ctx.globalAlpha = twinkle * (isGoldenDust ? 0.42 * s.aiMix : 0.24);
      ctx.fillRect(d.x * w, d.y * h, d.size, d.size);
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden="true" />;
}

/**
 * 3. ArchitecturePrinciple 3-horizon optical cutaway:
 * - Upper Horizon (Network): 24k Gold canopy — dissolves completely when paused.
 * - Middle Horizon (Command): Blazing platinum-silver across 5 reticles — always alive.
 * - Lower Horizon (Nodes): Blazing platinum-silver nexusBus across 4 app portals — always alive.
 */
export function ArchitectureFieldCanvas({ aiEnabled }: { aiEnabled: boolean }) {
  const aiRef = useRef(aiEnabled);
  const aiMixRef = useRef(aiEnabled ? 1 : 0);

  useEffect(() => {
    aiRef.current = aiEnabled;
  }, [aiEnabled]);

  const geoRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(61209);
      const canopy = Array.from({ length: 48 }, (_, i) => ({
        fromLeft: i % 2 === 0,
        ySpread: gauss() * 0.08,
        lift: gauss() * 24,
        width: i % 5 === 0 ? 0.95 : i % 3 === 0 ? 0.68 : 0.45,
        alpha: i % 5 === 0 ? 0.44 : i % 3 === 0 ? 0.24 : 0.13,
        speed: between(0.14, 0.3),
        offset: rnd(),
        phase: rnd() * Math.PI * 2,
      }));
      const horizonStrands = Array.from({ length: 16 }, (_, i) => ({
        uNorm: (i / 15) * 2 - 1,
        phase: rnd() * Math.PI * 2,
        freq: between(1.6, 2.8),
        width: i % 4 === 0 ? 0.95 : 0.54,
        alpha: i % 4 === 0 ? 0.38 : 0.17,
        speed: between(0.16, 0.34),
        offset: rnd(),
      }));
      const dust = Array.from({ length: 90 }, () => ({
        x: rnd(),
        y: rnd(),
        size: between(0.65, 1.35),
        phase: rnd() * Math.PI * 2,
      }));
      return { canopy, horizonStrands, dust };
    })(),
  );

  const canvasRef = useOpticalLoop((ctx, w, h, time, dt, pointer) => {
    const rate = dt > 0 ? clamp(dt * 4.2, 0, 1) : 1;
    aiMixRef.current = lerp(aiMixRef.current, aiRef.current ? 1 : 0, rate);
    const aiMix = aiMixRef.current;

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const yNet = h * 0.2;
    const yCmd = h * 0.55;
    const yNod = h * 0.84;
    const px = pointer.sx * w;
    const py = pointer.sy * h;
    const { canopy, horizonStrands, dust } = geoRef.current;

    // ─── UPPER HORIZON: NETWORK (24k Gold ONLY — dissolves when paused) ───
    if (aiMix > 0.015) {
      const core: Vec = { x: w * 0.5, y: yNet };

      for (let i = 0; i < canopy.length; i++) {
        const s = canopy[i]!;
        const dir = s.fromLeft ? 1 : -1;
        const p0: Vec = { x: s.fromLeft ? w * 0.03 : w * 0.97, y: yNet + s.ySpread * h };
        const sway = Math.sin(time * 0.4 + s.phase) * 4;
        const c1: Vec = { x: lerp(p0.x, core.x, 0.42), y: p0.y + s.lift + sway };
        const c2: Vec = { x: core.x - dir * w * 0.12, y: core.y + s.lift * 0.35 - sway * 0.4 };

        const g = ctx.createLinearGradient(p0.x, p0.y, core.x, core.y);
        g.addColorStop(0, `rgba(${GOLD_DEEP}, 0)`);
        g.addColorStop(0.55, `rgba(${GOLD_MID}, ${s.alpha * aiMix})`);
        g.addColorStop(1, `rgba(${GOLD_HOT}, ${s.alpha * 1.45 * aiMix})`);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, core.x, core.y);
        ctx.lineWidth = s.width;
        ctx.strokeStyle = g;
        ctx.stroke();

        if (i % 3 === 0) {
          const u = (s.offset + time * s.speed) % 1;
          const pos = bezier(p0, c1, c2, core, u);
          ctx.fillStyle = `rgba(${GOLD_HOT}, ${Math.sin(u * Math.PI) * 0.85 * aiMix})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Vertical braided golden neural conduits descending from Network -> Command
      [0.26, 0.5, 0.74].forEach((xFrac, colIdx) => {
        const xTarget = w * xFrac;
        for (let k = 0; k < 6; k++) {
          const uNorm = (k / 5) * 2 - 1;
          const g = ctx.createLinearGradient(core.x, core.y, xTarget, yCmd);
          g.addColorStop(0, `rgba(${GOLD_HOT}, ${0.34 * aiMix})`);
          g.addColorStop(0.65, `rgba(${GOLD_MID}, ${0.26 * aiMix})`);
          g.addColorStop(1, `rgba(${SILVER_BRIGHT}, ${0.22 * aiMix})`);
          drawSilkStrand(
            ctx,
            core.x,
            core.y,
            xTarget,
            yCmd,
            uNorm,
            10,
            k * 0.9 + colIdx,
            2,
            time,
            g,
            k % 2 === 0 ? 0.8 : 0.48,
            px,
            py,
            pointer.presence,
          );
        }
      });

      const breathe = 1 + 0.05 * Math.sin(time * 0.8);
      radialGlow(ctx, core, 64 * breathe * aiMix, [
        [0, `rgba(${GOLD_HOT}, ${0.9 * aiMix})`],
        [0.24, `rgba(${GOLD_BRIGHT}, ${0.42 * aiMix})`],
        [0.58, `rgba(${GOLD_DEEP}, ${0.12 * aiMix})`],
        [1, "rgba(0,0,0,0)"],
      ]);
    } else {
      // Quiet dashed silver-gray ghost arc when Network is bypassed
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.moveTo(w * 0.08, yNet);
      ctx.quadraticCurveTo(w * 0.5, yNet - 14, w * 0.92, yNet);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${SILVER_DEEP}, 0.25)`;
      ctx.stroke();
      ctx.restore();
    }

    // ─── MIDDLE HORIZON: COMMAND (ALWAYS BLAZING PURE PLATINUM-SILVER) ───
    const cmdNodes = [0.16, 0.33, 0.5, 0.67, 0.84].map((f) => w * f);
    for (let seg = 0; seg < cmdNodes.length - 1; seg++) {
      const a = cmdNodes[seg]!;
      const b = cmdNodes[seg + 1]!;
      for (let i = 0; i < horizonStrands.length; i++) {
        const s = horizonStrands[i]!;
        const g = ctx.createLinearGradient(a, yCmd, b, yCmd);
        g.addColorStop(0, `rgba(${SILVER_HOT}, ${s.alpha})`);
        g.addColorStop(0.5, `rgba(${SILVER_MID}, ${s.alpha * 0.78})`);
        g.addColorStop(1, `rgba(${SILVER_HOT}, ${s.alpha})`);
        drawSilkStrand(
          ctx,
          a,
          yCmd,
          b,
          yCmd,
          s.uNorm,
          11,
          s.phase + seg,
          s.freq,
          time,
          g,
          s.width,
          px,
          py,
          pointer.presence,
        );
      }
      const u = (time * 0.36 + seg * 0.21) % 1;
      radialGlow(ctx, { x: lerp(a, b, u), y: yCmd }, 9, [
        [0, `rgba(${SILVER_HOT}, ${Math.sin(u * Math.PI) * 0.88})`],
        [1, "rgba(0,0,0,0)"],
      ]);
    }

    // Outer silver wings fading cleanly off Command horizon
    for (let k = -3; k <= 3; k++) {
      const off = k * 5.5;
      const gL = ctx.createLinearGradient(0, yCmd + off, cmdNodes[0]!, yCmd);
      gL.addColorStop(0, `rgba(${SILVER_DEEP}, 0)`);
      gL.addColorStop(1, `rgba(${SILVER_BRIGHT}, 0.3)`);
      ctx.beginPath();
      ctx.moveTo(0, yCmd + off);
      ctx.lineTo(cmdNodes[0]!, yCmd);
      ctx.lineWidth = k === 0 ? 0.9 : 0.5;
      ctx.strokeStyle = gL;
      ctx.stroke();

      const gR = ctx.createLinearGradient(cmdNodes[cmdNodes.length - 1]!, yCmd, w, yCmd + off);
      gR.addColorStop(0, `rgba(${SILVER_BRIGHT}, 0.3)`);
      gR.addColorStop(1, `rgba(${SILVER_DEEP}, 0)`);
      ctx.beginPath();
      ctx.moveTo(cmdNodes[cmdNodes.length - 1]!, yCmd);
      ctx.lineTo(w, yCmd + off);
      ctx.lineWidth = k === 0 ? 0.9 : 0.5;
      ctx.strokeStyle = gR;
      ctx.stroke();
    }

    cmdNodes.forEach((nx) => {
      radialGlow(ctx, { x: nx, y: yCmd }, 18, [
        [0, `rgba(${SILVER_HOT}, 0.72)`],
        [0.45, `rgba(${SILVER_MID}, 0.22)`],
        [1, "rgba(0,0,0,0)"],
      ]);
    });

    // ─── BRIDGE CONDUITS: COMMAND <-> NODES (ALWAYS ACTIVE PLATINUM-SILVER) ───
    [0.3, 0.5, 0.7].forEach((xFrac, idx) => {
      const bx = w * xFrac;
      for (let k = 0; k < 5; k++) {
        const uNorm = (k / 4) * 2 - 1;
        drawSilkStrand(
          ctx,
          bx,
          yCmd,
          bx,
          yNod,
          uNorm,
          7,
          k * 1.1 + idx,
          1.8,
          time,
          `rgba(${SILVER_BRIGHT}, ${k === 2 ? 0.34 : 0.16})`,
          k === 2 ? 0.85 : 0.48,
          px,
          py,
          pointer.presence,
        );
      }
      const u = (time * 0.44 + idx * 0.33) % 1;
      radialGlow(ctx, { x: bx, y: lerp(yCmd, yNod, u) }, 8, [
        [0, `rgba(${SILVER_HOT}, ${Math.sin(u * Math.PI) * 0.84})`],
        [1, "rgba(0,0,0,0)"],
      ]);
    });

    // ─── LOWER HORIZON: NODES / NEXUSBUS (ALWAYS BLAZING PURE PLATINUM-SILVER) ───
    const nodNodes = [0.15, 0.38, 0.62, 0.85].map((f) => w * f);
    for (let seg = 0; seg < nodNodes.length - 1; seg++) {
      const a = nodNodes[seg]!;
      const b = nodNodes[seg + 1]!;
      for (let i = 0; i < horizonStrands.length; i++) {
        const s = horizonStrands[i]!;
        const g = ctx.createLinearGradient(a, yNod, b, yNod);
        g.addColorStop(0, `rgba(${SILVER_HOT}, ${s.alpha})`);
        g.addColorStop(0.5, `rgba(${SILVER_MID}, ${s.alpha * 0.8})`);
        g.addColorStop(1, `rgba(${SILVER_HOT}, ${s.alpha})`);
        drawSilkStrand(
          ctx,
          a,
          yNod,
          b,
          yNod,
          s.uNorm,
          12,
          s.phase + seg * 1.3,
          s.freq,
          time,
          g,
          s.width,
          px,
          py,
          pointer.presence,
        );
      }
      const u = (time * 0.34 + seg * 0.29 + 0.5) % 1;
      radialGlow(ctx, { x: lerp(a, b, u), y: yNod }, 9, [
        [0, `rgba(${SILVER_HOT}, ${Math.sin(u * Math.PI) * 0.88})`],
        [1, "rgba(0,0,0,0)"],
      ]);
    }

    nodNodes.forEach((nx) => {
      radialGlow(ctx, { x: nx, y: yNod }, 20, [
        [0, `rgba(${SILVER_HOT}, 0.78)`],
        [0.45, `rgba(${SILVER_MID}, 0.24)`],
        [1, "rgba(0,0,0,0)"],
      ]);
    });

    // Subtle atmospheric dust across both chromatic worlds
    for (const d of dust) {
      const isUpper = d.y < 0.36;
      if (isUpper && aiMix < 0.05) continue;
      const twinkle = 0.35 + 0.65 * Math.sin(time * 1.2 + d.phase);
      ctx.fillStyle = isUpper ? `rgb(${GOLD_BRIGHT})` : `rgb(${SILVER_BRIGHT})`;
      ctx.globalAlpha = twinkle * (isUpper ? 0.34 * aiMix : 0.22);
      ctx.fillRect(d.x * w, d.y * h, d.size, d.size);
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden="true" />;
}

/**
 * 4. ClosingSingularityCanvas:
 * Grandiose 92-filament 24k Gold Neural Network horizon crowning #waitlist.
 */
export function ClosingSingularityCanvas() {
  const dataRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(20261121);
      const filaments = Array.from({ length: 92 }, (_, i) => ({
        fromLeft: i % 2 === 0,
        yStart: clamp(0.14 + rnd() * 0.74, 0.08, 0.9),
        waistY: gauss() * 5,
        bend: gauss() * 38,
        width: i % 7 === 0 ? 0.45 : i % 3 === 0 ? 0.78 : 1.15,
        alpha: i % 7 === 0 ? 0.44 : i % 3 === 0 ? 0.24 : 0.12,
        tier: i % 7 === 0 ? "hot" : i % 3 === 0 ? "bright" : "mid",
        phase: rnd() * Math.PI * 2,
        speed: between(0.09, 0.24),
        offset: rnd(),
      }));
      const dust = Array.from({ length: 180 }, () => ({
        x: rnd(),
        y: 0.1 + rnd() * 0.8,
        size: between(0.6, 1.35),
        phase: rnd() * Math.PI * 2,
      }));
      return { filaments, dust };
    })(),
  );

  const canvasRef = useOpticalLoop((ctx, w, h, time, _dt, pointer) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const core: Vec = { x: w * 0.5, y: h * 0.56 };
    const breathe = 1 + 0.045 * Math.sin(time * 0.65);
    const { filaments, dust } = dataRef.current;

    // Gentle vertical spine descending into core
    const spine = ctx.createLinearGradient(core.x, 0, core.x, core.y);
    spine.addColorStop(0, `rgba(${GOLD_MID}, 0)`);
    spine.addColorStop(1, `rgba(${GOLD_HOT}, 0.68)`);
    ctx.beginPath();
    ctx.moveTo(core.x, 0);
    ctx.lineTo(core.x, core.y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = spine;
    ctx.stroke();

    const ptrShift = pointer.presence * (pointer.sx - 0.5) * 28;

    for (let i = 0; i < filaments.length; i++) {
      const f = filaments[i]!;
      const dir = f.fromLeft ? 1 : -1;
      const sway = Math.sin(time * 0.34 + f.phase) * 4.5;
      const p0: Vec = { x: f.fromLeft ? 0 : w, y: h * f.yStart };
      const pinch: Vec = { x: core.x, y: core.y + f.waistY };
      const c1: Vec = { x: p0.x + dir * w * 0.24, y: p0.y + f.bend * 0.36 + sway + ptrShift * 0.35 };
      const c2: Vec = {
        x: core.x - dir * w * 0.15,
        y: pinch.y + f.bend * 0.16 - sway * 0.45 - ptrShift * 0.2,
      };

      const rgb = f.tier === "hot" ? GOLD_HOT : f.tier === "bright" ? GOLD_BRIGHT : GOLD_MID;
      const grad = ctx.createLinearGradient(p0.x, p0.y, pinch.x, pinch.y);
      grad.addColorStop(0, `rgba(${rgb}, 0)`);
      grad.addColorStop(0.42, `rgba(${rgb}, ${f.alpha * 0.55})`);
      grad.addColorStop(0.84, `rgba(${rgb}, ${Math.min(0.9, f.alpha * 1.2)})`);
      grad.addColorStop(1, `rgba(${GOLD_HOT}, ${Math.min(0.95, f.alpha * 1.4)})`);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, pinch.x, pinch.y);
      ctx.lineWidth = f.width;
      ctx.strokeStyle = grad;
      ctx.stroke();

      if (i % 3 === 0) {
        const u = (f.offset + time * f.speed) % 1;
        const pos = bezier(p0, c1, c2, pinch, u);
        ctx.fillStyle = `rgba(${GOLD_HOT}, ${Math.sin(u * Math.PI) * 0.78})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Jewel-like Singularity Core bounded cleanly inside vertical margins
    radialGlow(ctx, core, Math.min(w * 0.14, h * 0.42) * breathe, [
      [0, `rgba(${GOLD_HOT}, 0.96)`],
      [0.18, `rgba(${GOLD_BRIGHT}, 0.56)`],
      [0.45, `rgba(${GOLD_MID}, 0.18)`],
      [0.78, `rgba(${GOLD_DEEP}, 0.04)`],
      [1, "rgba(0,0,0,0)"],
    ]);

    for (const d of dust) {
      const edgeFade = Math.sin(d.x * Math.PI) * Math.sin(d.y * Math.PI);
      const twinkle = 0.35 + 0.65 * Math.sin(time * 1.2 + d.phase);
      ctx.fillStyle = `rgb(${GOLD_BRIGHT})`;
      ctx.globalAlpha = twinkle * edgeFade * 0.42;
      ctx.fillRect(d.x * w, d.y * h, d.size, d.size);
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden="true" />;
}

/**
 * 5. StudioWaveCanvas (for NodePlatformSection Studio preview):
 * 100% pure monochrome platinum-silver acoustic silk waveforms + sweeping white playhead (ZERO gold).
 */
export function StudioWaveCanvas({ playing }: { playing: boolean }) {
  const playingRef = useRef(playing);
  const headRef = useRef(0.58);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const tracksRef = useRef(
    (() => {
      const { rnd } = seededHelpers(9941);
      return [0.22, 0.5, 0.78].map((yFrac, idx) => ({
        yFrac,
        phase: rnd() * Math.PI * 2,
        ampScale: idx === 0 ? 18 : idx === 1 ? 15 : 13,
      }));
    })(),
  );

  const canvasRef = useOpticalLoop((ctx, w, h, time, dt) => {
    if (dt > 0 && playingRef.current) {
      headRef.current = (headRef.current + dt * 0.055) % 1;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);

    // Subtle dB horizontal hairlines
    tracksRef.current.forEach((tr) => {
      const cy = h * tr.yFrac;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.stroke();
    });

    ctx.globalCompositeOperation = "lighter";
    const headX = headRef.current * w;

    tracksRef.current.forEach((tr, tIdx) => {
      const cy = h * tr.yFrac;
      for (let harmonic = 0; harmonic < 3; harmonic++) {
        ctx.beginPath();
        const samples = 120;
        for (let i = 0; i <= samples; i++) {
          const u = i / samples;
          const x = u * w;
          const env = Math.sin(u * Math.PI);
          const wave =
            Math.sin(u * 28 + tr.phase + harmonic * 1.7 + (playingRef.current ? time * 1.4 : 0)) *
            Math.cos(u * 9 - tIdx * 0.9);
          const y = cy + wave * tr.ampScale * (0.45 + 0.55 * env) * (harmonic === 0 ? 1 : 0.58);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = harmonic === 0 ? 1.35 : 0.7;
        ctx.strokeStyle =
          harmonic === 0
            ? "rgba(245, 245, 247, 0.65)"
            : harmonic === 1
              ? "rgba(209, 213, 224, 0.28)"
              : "rgba(161, 168, 184, 0.16)";
        ctx.stroke();
      }
    });

    // Sweeping crisp chalk-white playhead
    const playGrad = ctx.createLinearGradient(headX, 0, headX, h);
    playGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    playGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.92)");
    playGrad.addColorStop(1, "rgba(255, 255, 255, 0.15)");
    ctx.beginPath();
    ctx.moveTo(headX, 6);
    ctx.lineTo(headX, h - 6);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = playGrad;
    ctx.stroke();

    radialGlow(ctx, { x: headX, y: h * 0.5 }, 16, [
      [0, "rgba(255, 255, 255, 0.42)"],
      [1, "rgba(0,0,0,0)"],
    ]);
  });

  return <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden="true" />;
}
