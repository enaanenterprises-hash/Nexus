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

export type OpticalTheme = "dark" | "light";

type OpticalPalette = {
  isLight: boolean;
  composite: GlobalCompositeOperation;
  hair: string;
  mid: string;
  warm: string;
  deep: string;
  neutral: string;
  particle: string;
  dust: string;
  coreCenter: string;
  coreMid: string;
  coreOuter: string;
  fadeZero: string;
  alphaBoost: number;
};

function getPalette(theme: OpticalTheme): OpticalPalette {
  if (theme === "light") {
    return {
      isLight: true,
      composite: "source-over",
      hair: "146, 98, 14",
      mid: "184, 132, 28",
      warm: "208, 158, 48",
      deep: "168, 118, 22",
      neutral: "14, 15, 18",
      particle: "140, 90, 12",
      dust: "rgb(184, 134, 30)",
      coreCenter: "255, 252, 244",
      coreMid: "230, 186, 82",
      coreOuter: "204, 150, 38",
      fadeZero: "rgba(255, 255, 255, 0)",
      alphaBoost: 1.4,
    };
  }
  return {
    isLight: false,
    composite: "lighter",
    hair: "255, 236, 190",
    mid: "255, 206, 120",
    warm: "246, 176, 68",
    deep: "224, 138, 42",
    neutral: "255, 255, 255",
    particle: "255, 240, 205",
    dust: "rgb(255, 224, 160)",
    coreCenter: "255, 252, 240",
    coreMid: "255, 224, 158",
    coreOuter: "240, 181, 74",
    fadeZero: "rgba(0, 0, 0, 0)",
    alphaBoost: 1,
  };
}

function useOpticalCanvas(
  drawFrame: (ctx: CanvasRenderingContext2D, width: number, height: number, time: number, dt: number) => void,
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
      drawRef.current(ctx, width, height, elapsed, 0);
    };

    const loop = (now: number) => {
      if (!active || reduceMotion) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      drawRef.current(ctx, width, height, elapsed, dt);
      frame = requestAnimationFrame(loop);
    };

    const stopVisibility = observeCanvasActivity(canvas, (isActive) => {
      active = isActive;
      if (isActive && !reduceMotion && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(loop);
      } else if (!isActive && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion && active && frame === 0) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopVisibility();
      observer.disconnect();
    };
  }, []);

  return canvasRef;
}

/**
 * Band 1: Descending optical filament cascade connecting smoothly
 * into the top border of the workspace stage.
 */
export function CascadeFilament({
  activeLayer,
  theme = "dark",
  className = "",
}: {
  activeLayer: "command" | "studio" | "sockets";
  theme?: OpticalTheme;
  className?: string;
}) {
  const layerRef = useRef(activeLayer);
  const focusXRef = useRef(0.62);
  const themeRef = useRef(theme);

  useEffect(() => {
    layerRef.current = activeLayer;
  }, [activeLayer]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const strandsRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(91041);
      return Array.from({ length: 38 }, (_, i) => ({
        spreadTop: gauss() * 14,
        spreadBottom: gauss() * 175,
        pull: between(0.28, 0.72),
        width: i % 5 === 0 ? 0.5 : i % 3 === 0 ? 0.8 : 1.1,
        alpha: i % 5 === 0 ? 0.44 : i % 3 === 0 ? 0.24 : 0.13,
        tier: i % 5 === 0 ? ("hair" as const) : i % 3 === 0 ? ("mid" as const) : ("warm" as const),
        phase: rnd() * Math.PI * 2,
        speed: between(0.14, 0.34),
        particleOffset: rnd(),
      }));
    })(),
  );

  const canvasRef = useOpticalCanvas((ctx, w, h, time, dt) => {
    const pal = getPalette(themeRef.current);
    const targetFrac =
      layerRef.current === "command" ? 0.56 : layerRef.current === "studio" ? 0.68 : 0.78;
    focusXRef.current = lerp(focusXRef.current, targetFrac, dt > 0 ? clamp(dt * 4.5, 0, 1) : 1);

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.composite;

    const originX = w * 0.56;
    const pinchY = h * 0.4;
    const focusX = w * focusXRef.current;

    // Quiet pinpoint refraction star at the pinch — bounded strictly inside canvas height
    radialGlow(ctx, { x: originX, y: pinchY }, Math.min(w * 0.16, pinchY * 0.9), [
      [0, `rgba(${pal.coreCenter}, ${pal.isLight ? 0.88 : 0.48})`],
      [0.24, `rgba(${pal.coreMid}, ${pal.isLight ? 0.36 : 0.16})`],
      [0.6, `rgba(${pal.coreOuter}, ${pal.isLight ? 0.1 : 0.04})`],
      [1, pal.fadeZero],
    ]);

    // Central spine hair fading organically into pinch and down to stage border
    const spineGrad = ctx.createLinearGradient(originX, 0, originX, h);
    spineGrad.addColorStop(0, `rgba(${pal.warm}, 0)`);
    spineGrad.addColorStop(0.38, `rgba(${pal.hair}, ${pal.isLight ? 0.58 : 0.65})`);
    spineGrad.addColorStop(1, `rgba(${pal.neutral}, ${pal.isLight ? 0.12 : 0.16})`);
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = spineGrad;
    ctx.stroke();

    const strands = strandsRef.current;
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i]!;
      const color = pal[s.tier];
      const alpha = Math.min(0.85, s.alpha * pal.alphaBoost);
      const sway = Math.sin(time * 0.45 + s.phase) * 7;
      const p0: Vec = { x: originX + s.spreadTop * 0.25, y: 0 };
      const p1: Vec = { x: originX + s.spreadTop * 0.14, y: pinchY };
      const endX = clamp(focusX + s.spreadBottom + sway, w * 0.42, w * 0.96);
      const c1: Vec = { x: originX + (endX - originX) * 0.18, y: pinchY + (h - pinchY) * s.pull };
      const c2: Vec = { x: endX - (endX - originX) * 0.14, y: h * 0.76 };
      const p3: Vec = { x: endX, y: h };

      const grad = ctx.createLinearGradient(originX, 0, endX, h);
      grad.addColorStop(0, `rgba(${color}, 0)`);
      grad.addColorStop(0.24, `rgba(${color}, ${alpha * 0.52})`);
      grad.addColorStop(0.42, `rgba(${color}, ${Math.min(0.9, alpha * 1.1)})`);
      grad.addColorStop(0.84, `rgba(${color}, ${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${color}, 0)`);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
      ctx.lineWidth = s.width;
      ctx.strokeStyle = grad;
      ctx.stroke();

      if (i % 2 === 0) {
        const u = (s.particleOffset + time * s.speed) % 1;
        const pos = bezier(p1, c1, c2, p3, u);
        const fade = Math.sin(u * Math.PI);
        ctx.fillStyle = `rgba(${pal.particle}, ${fade * (pal.isLight ? 0.65 : 0.72)})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Delicate kiss along the active target on the workspace border
    radialGlow(ctx, { x: focusX, y: h - 3 }, 22, [
      [0, `rgba(${pal.coreMid}, ${pal.isLight ? 0.48 : 0.42})`],
      [0.45, `rgba(${pal.coreOuter}, ${pal.isLight ? 0.16 : 0.12})`],
      [1, pal.fadeZero],
    ]);
  });

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}

/**
 * Band 2: Quiet Equilibrium Core — three optical geometries (singularity core,
 * deterministic rule arc, modular orbital rings) that brighten softly when
 * hovering or focusing the adjacent principle rows.
 */
export function EquilibriumCore({
  activeIndex,
  theme = "dark",
  className = "",
}: {
  activeIndex: number | null;
  theme?: OpticalTheme;
  className?: string;
}) {
  const activeRef = useRef(activeIndex);
  const themeRef = useRef(theme);
  const weightsRef = useRef<[number, number, number]>([0.65, 0.55, 0.55]);

  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const geometryRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(44201);
      const coreThreads = Array.from({ length: 42 }, (_, i) => ({
        angle: (i / 42) * Math.PI * 2 + gauss() * 0.14,
        radius: between(0.42, 0.94),
        bend: gauss() * 0.55,
        width: i % 4 === 0 ? 0.55 : 0.8,
        alpha: i % 4 === 0 ? 0.36 : 0.19,
        phase: rnd() * Math.PI * 2,
      }));
      const ruleArcs = Array.from({ length: 18 }, (_, i) => ({
        lift: (i - 8.5) * 4.2 + gauss() * 2.5,
        width: i % 3 === 0 ? 0.55 : 0.85,
        alpha: i % 3 === 0 ? 0.4 : 0.17,
        offset: rnd(),
        speed: between(0.16, 0.32),
      }));
      const dust = Array.from({ length: 85 }, () => ({
        angle: rnd() * Math.PI * 2,
        r: between(0.12, 0.9),
        size: between(0.55, 1.3),
        phase: rnd() * Math.PI * 2,
      }));
      return { coreThreads, ruleArcs, dust };
    })(),
  );

  const canvasRef = useOpticalCanvas((ctx, w, h, time, dt) => {
    const pal = getPalette(themeRef.current);
    const idx = activeRef.current;
    const targets: [number, number, number] =
      idx === null ? [0.76, 0.6, 0.6] : [idx === 0 ? 1 : 0.3, idx === 1 ? 1 : 0.3, idx === 2 ? 1 : 0.3];
    const step = dt > 0 ? clamp(dt * 5.5, 0, 1) : 1;
    for (let k = 0; k < 3; k++) {
      weightsRef.current[k] = lerp(weightsRef.current[k]!, targets[k]!, step);
    }
    const [wCore, wRule, wOrbit] = weightsRef.current;

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.composite;

    const cx = w * 0.44;
    const cy = h * 0.5;
    const R = Math.min(w * 0.38, h * 0.42);
    const { coreThreads, ruleArcs, dust } = geometryRef.current;

    // 1. Modular orbital rings (Principle 3)
    const radii = [R * 0.52, R * 0.78, R * 1.0];
    radii.forEach((rad, ri) => {
      const tilt = 0.42 + ri * 0.08;
      const rot = -0.22 + ri * 0.18 + Math.sin(time * 0.22 + ri) * 0.03;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, rad, rad * tilt, 0, 0, Math.PI * 2);
      ctx.lineWidth = ri === 1 ? 0.95 : 0.65;
      ctx.strokeStyle = `rgba(${ri === 1 ? pal.hair : pal.mid}, ${(0.16 + ri * 0.05) * pal.alphaBoost * wOrbit})`;
      ctx.stroke();

      const orbitA = time * (0.34 - ri * 0.07) + ri * 2.1;
      const ox = Math.cos(orbitA) * rad;
      const oy = Math.sin(orbitA) * rad * tilt;
      ctx.fillStyle = `rgba(${pal.particle}, ${0.78 * wOrbit})`;
      ctx.beginPath();
      ctx.arc(ox, oy, 1.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 2. Deterministic rule bridge between two satellite nodes (Principle 2)
    const leftNode: Vec = { x: cx - R * 0.92, y: cy + R * 0.14 };
    const rightNode: Vec = { x: cx + R * 1.1, y: cy - R * 0.16 };
    for (let i = 0; i < ruleArcs.length; i++) {
      const a = ruleArcs[i]!;
      const sway = Math.sin(time * 0.35 + i) * 3;
      const c1: Vec = { x: lerp(leftNode.x, cx, 0.65), y: cy + a.lift + sway };
      const c2: Vec = { x: lerp(cx, rightNode.x, 0.35), y: cy - a.lift * 0.7 - sway };
      const g = ctx.createLinearGradient(leftNode.x, leftNode.y, rightNode.x, rightNode.y);
      g.addColorStop(0, `rgba(${pal.warm}, 0)`);
      g.addColorStop(0.25, `rgba(${pal.mid}, ${a.alpha * pal.alphaBoost * wRule})`);
      g.addColorStop(0.5, `rgba(${pal.hair}, ${Math.min(0.9, a.alpha * 1.35 * pal.alphaBoost * wRule)})`);
      g.addColorStop(0.75, `rgba(${pal.mid}, ${a.alpha * pal.alphaBoost * wRule})`);
      g.addColorStop(1, `rgba(${pal.warm}, 0)`);
      ctx.beginPath();
      ctx.moveTo(leftNode.x, leftNode.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, rightNode.x, rightNode.y);
      ctx.lineWidth = a.width;
      ctx.strokeStyle = g;
      ctx.stroke();

      if (i % 3 === 0) {
        const u = (a.offset + time * a.speed) % 1;
        const p = bezier(leftNode, c1, c2, rightNode, u);
        const fade = Math.sin(u * Math.PI);
        ctx.fillStyle = `rgba(${pal.particle}, ${fade * 0.82 * wRule})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Conversational singularity filaments (Principle 1)
    for (const t of coreThreads) {
      const a = t.angle + Math.sin(time * 0.28 + t.phase) * 0.04;
      const end: Vec = { x: cx + Math.cos(a) * R * t.radius, y: cy + Math.sin(a) * R * t.radius * 0.82 };
      const c1: Vec = {
        x: cx + Math.cos(a + t.bend * 0.45) * R * 0.28,
        y: cy + Math.sin(a + t.bend * 0.45) * R * 0.24,
      };
      const c2: Vec = {
        x: cx + Math.cos(a - t.bend * 0.3) * R * t.radius * 0.68,
        y: cy + Math.sin(a - t.bend * 0.3) * R * t.radius * 0.56,
      };
      const g = ctx.createLinearGradient(cx, cy, end.x, end.y);
      g.addColorStop(0, `rgba(${pal.hair}, ${Math.min(0.88, t.alpha * 1.45 * pal.alphaBoost * wCore)})`);
      g.addColorStop(0.55, `rgba(${pal.warm}, ${t.alpha * 0.72 * pal.alphaBoost * wCore})`);
      g.addColorStop(1, `rgba(${pal.warm}, 0)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
      ctx.lineWidth = t.width;
      ctx.strokeStyle = g;
      ctx.stroke();
    }

    // Center starlight pinch
    const breathe = 1 + 0.05 * Math.sin(time * 0.7);
    radialGlow(ctx, { x: cx, y: cy }, R * 0.5 * breathe, [
      [0, `rgba(${pal.coreCenter}, ${(pal.isLight ? 0.94 : 0.85) * wCore})`],
      [0.2, `rgba(${pal.coreMid}, ${(pal.isLight ? 0.52 : 0.42) * wCore})`],
      [0.54, `rgba(${pal.coreOuter}, ${(pal.isLight ? 0.16 : 0.12) * wCore})`],
      [1, pal.fadeZero],
    ]);

    // Fine drifting dust
    ctx.fillStyle = pal.dust;
    for (const d of dust) {
      const twinkle = 0.35 + 0.65 * Math.sin(time * 1.2 + d.phase);
      const px = cx + Math.cos(d.angle + time * 0.03) * R * d.r * 1.05;
      const py = cy + Math.sin(d.angle + time * 0.03) * R * d.r * 0.74;
      ctx.globalAlpha = twinkle * (pal.isLight ? 0.45 : 0.36);
      ctx.fillRect(px, py, d.size, d.size);
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}

/**
 * Band 3: Expanding Orbital Horizon — dynamically morphs its golden filament
 * topology as the visitor inspects the four roadmap stages.
 */
export function OrbitalHorizon({
  activeStep,
  theme = "dark",
  className = "",
}: {
  activeStep: "cockpit" | "automations" | "workspaces" | "sdk";
  theme?: OpticalTheme;
  className?: string;
}) {
  const stepRef = useRef(activeStep);
  const themeRef = useRef(theme);
  const morphRef = useRef({ cockpit: 1, automations: 0, workspaces: 0, sdk: 0 });

  useEffect(() => {
    stepRef.current = activeStep;
  }, [activeStep]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const fieldRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(77109);
      const incoming = Array.from({ length: 28 }, (_, i) => ({
        yFrac: 0.14 + (i / 27) * 0.72 + gauss() * 0.025,
        width: i % 4 === 0 ? 0.55 : 0.85,
        alpha: i % 4 === 0 ? 0.4 : 0.18,
        phase: rnd() * Math.PI * 2,
        speed: between(0.16, 0.34),
        offset: rnd(),
      }));
      const sdkRays = Array.from({ length: 24 }, (_, i) => ({
        angle: (i / 24) * Math.PI * 2,
        len: between(0.75, 1.12),
        phase: rnd() * Math.PI * 2,
        offset: rnd(),
      }));
      return { incoming, sdkRays };
    })(),
  );

  const canvasRef = useOpticalCanvas((ctx, w, h, time, dt) => {
    const pal = getPalette(themeRef.current);
    const s = stepRef.current;
    const rate = dt > 0 ? clamp(dt * 5, 0, 1) : 1;
    const m = morphRef.current;
    m.cockpit = lerp(m.cockpit, s === "cockpit" ? 1 : 0, rate);
    m.automations = lerp(m.automations, s === "automations" ? 1 : 0, rate);
    m.workspaces = lerp(m.workspaces, s === "workspaces" ? 1 : 0, rate);
    m.sdk = lerp(m.sdk, s === "sdk" ? 1 : 0, rate);

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.composite;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const R = Math.min(w * 0.35, h * 0.39);
    const { incoming, sdkRays } = fieldRef.current;

    // Mode 1: Cockpit — horizontal streams converging from left into central board focus
    if (m.cockpit > 0.02) {
      const core: Vec = { x: w * 0.64, y: cy };
      for (let i = 0; i < incoming.length; i++) {
        const line = incoming[i]!;
        const p0: Vec = { x: w * 0.04, y: h * line.yFrac };
        const sway = Math.sin(time * 0.4 + line.phase) * 4;
        const c1: Vec = { x: w * 0.28, y: h * line.yFrac + sway };
        const c2: Vec = { x: w * 0.44, y: cy + (p0.y - cy) * 0.22 };
        const g = ctx.createLinearGradient(p0.x, p0.y, core.x, core.y);
        g.addColorStop(0, `rgba(${pal.warm}, 0)`);
        g.addColorStop(0.55, `rgba(${pal.mid}, ${line.alpha * pal.alphaBoost * m.cockpit})`);
        g.addColorStop(1, `rgba(${pal.hair}, ${Math.min(0.88, line.alpha * 1.4 * pal.alphaBoost * m.cockpit)})`);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, core.x, core.y);
        ctx.lineWidth = line.width;
        ctx.strokeStyle = g;
        ctx.stroke();

        if (i % 2 === 0) {
          const outY = cy + (line.yFrac - 0.5) * h * 0.72;
          const pOut: Vec = { x: w * 0.96, y: outY };
          const oc1: Vec = { x: core.x + w * 0.12, y: cy + (outY - cy) * 0.25 };
          const oc2: Vec = { x: w * 0.84, y: outY };
          const og = ctx.createLinearGradient(core.x, core.y, pOut.x, pOut.y);
          og.addColorStop(0, `rgba(${pal.hair}, ${Math.min(0.82, line.alpha * 1.2 * pal.alphaBoost * m.cockpit)})`);
          og.addColorStop(1, `rgba(${pal.warm}, 0)`);
          ctx.beginPath();
          ctx.moveTo(core.x, core.y);
          ctx.bezierCurveTo(oc1.x, oc1.y, oc2.x, oc2.y, pOut.x, pOut.y);
          ctx.lineWidth = line.width * 0.85;
          ctx.strokeStyle = og;
          ctx.stroke();

          const u = (line.offset + time * line.speed) % 1;
          const pos = bezier(p0, c1, c2, core, u);
          ctx.fillStyle = `rgba(${pal.particle}, ${Math.sin(u * Math.PI) * 0.78 * m.cockpit})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      radialGlow(ctx, core, R * 0.54, [
        [0, `rgba(${pal.coreCenter}, ${(pal.isLight ? 0.96 : 0.88) * m.cockpit})`],
        [0.24, `rgba(${pal.coreMid}, ${(pal.isLight ? 0.48 : 0.38) * m.cockpit})`],
        [1, pal.fadeZero],
      ]);
    }

    // Mode 2: Automations — deterministic 4-node chain with rhythmic light relays
    if (m.automations > 0.02) {
      const nodes: Vec[] = [
        { x: w * 0.12, y: cy + R * 0.22 },
        { x: w * 0.37, y: cy - R * 0.28 },
        { x: w * 0.64, y: cy + R * 0.24 },
        { x: w * 0.89, y: cy - R * 0.14 },
      ];
      for (let seg = 0; seg < nodes.length - 1; seg++) {
        const a = nodes[seg]!;
        const b = nodes[seg + 1]!;
        for (let strand = -4; strand <= 4; strand++) {
          const offset = strand * 4.5;
          const c1: Vec = { x: lerp(a.x, b.x, 0.35), y: a.y + offset };
          const c2: Vec = { x: lerp(a.x, b.x, 0.65), y: b.y - offset };
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
          ctx.lineWidth = strand === 0 ? 1 : 0.5;
          ctx.strokeStyle = `rgba(${strand === 0 ? pal.hair : pal.mid}, ${(strand === 0 ? 0.52 : 0.19) * pal.alphaBoost * m.automations})`;
          ctx.stroke();
        }
        const u = (time * 0.42 - seg * 0.28 + 4) % 1;
        const c1: Vec = { x: lerp(a.x, b.x, 0.35), y: a.y };
        const c2: Vec = { x: lerp(a.x, b.x, 0.65), y: b.y };
        const pos = bezier(a, c1, c2, b, u);
        radialGlow(ctx, pos, 14, [
          [0, `rgba(${pal.particle}, ${0.86 * m.automations})`],
          [0.5, `rgba(${pal.coreMid}, ${0.35 * m.automations})`],
          [1, pal.fadeZero],
        ]);
      }
      nodes.forEach((n, ni) => {
        radialGlow(ctx, n, ni === 3 ? 20 : 26, [
          [0, `rgba(${pal.coreCenter}, ${(ni < 3 ? 0.94 : 0.72) * m.automations})`],
          [0.36, `rgba(${pal.coreMid}, ${0.36 * m.automations})`],
          [1, pal.fadeZero],
        ]);
        if (pal.isLight) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, ni === 3 ? 3.2 : 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${pal.hair}, ${0.85 * m.automations})`;
          ctx.fill();
        }
      });
    }

    // Mode 3: First-party sockets — core + 4 orbital stations (2 live, 2 planned)
    if (m.workspaces > 0.02) {
      const stations = [
        { angle: -2.4, r: R * 1.05, live: true },
        { angle: -0.75, r: R * 1.08, live: true },
        { angle: 0.65, r: R * 1.05, live: false },
        { angle: 2.35, r: R * 1.02, live: false },
      ];
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.08, R * 0.72, 0, 0, Math.PI * 2);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = `rgba(${pal.mid}, ${0.22 * pal.alphaBoost * m.workspaces})`;
      ctx.stroke();

      stations.forEach((st, idx) => {
        const a = st.angle + Math.sin(time * 0.25 + idx) * 0.04;
        const pos: Vec = { x: cx + Math.cos(a) * st.r, y: cy + Math.sin(a) * st.r * 0.68 };
        for (let k = -3; k <= 3; k++) {
          const bend = k * 8;
          const mid: Vec = {
            x: (cx + pos.x) * 0.5 - Math.sin(a) * bend,
            y: (cy + pos.y) * 0.5 + Math.cos(a) * bend * 0.6,
          };
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(mid.x, mid.y, pos.x, pos.y);
          ctx.lineWidth = k === 0 ? 0.9 : 0.45;
          const mult = st.live ? 1 : 0.45;
          ctx.strokeStyle = `rgba(${st.live ? pal.hair : pal.warm}, ${(k === 0 ? 0.48 : 0.18) * mult * pal.alphaBoost * m.workspaces})`;
          ctx.stroke();
        }
        if (st.live) {
          radialGlow(ctx, pos, 22, [
            [0, `rgba(${pal.coreCenter}, ${0.92 * m.workspaces})`],
            [0.36, `rgba(${pal.coreMid}, ${0.38 * m.workspaces})`],
            [1, pal.fadeZero],
          ]);
          if (pal.isLight) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${pal.hair}, ${0.9 * m.workspaces})`;
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = `rgba(${pal.mid}, ${0.65 * m.workspaces})`;
          ctx.stroke();
        }
      });

      radialGlow(ctx, { x: cx, y: cy }, R * 0.46, [
        [0, `rgba(${pal.coreCenter}, ${0.95 * m.workspaces})`],
        [0.26, `rgba(${pal.coreMid}, ${0.42 * m.workspaces})`],
        [1, pal.fadeZero],
      ]);
    }

    // Mode 4: Open SDK — radiating expansion ring opening into open constellation space
    if (m.sdk > 0.02) {
      const innerR = R * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = `rgba(${pal.hair}, ${0.42 * pal.alphaBoost * m.sdk})`;
      ctx.stroke();

      for (const ray of sdkRays) {
        const a = ray.angle + time * 0.04;
        const p0: Vec = { x: cx + Math.cos(a) * innerR, y: cy + Math.sin(a) * innerR };
        const p3: Vec = { x: cx + Math.cos(a) * R * 1.24 * ray.len, y: cy + Math.sin(a) * R * 0.9 * ray.len };
        const c1: Vec = {
          x: cx + Math.cos(a + 0.14) * R * 0.72,
          y: cy + Math.sin(a + 0.14) * R * 0.56,
        };
        const c2: Vec = {
          x: cx + Math.cos(a - 0.12) * R * 1.0,
          y: cy + Math.sin(a - 0.12) * R * 0.78,
        };
        const g = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
        g.addColorStop(0, `rgba(${pal.hair}, ${0.42 * pal.alphaBoost * m.sdk})`);
        g.addColorStop(0.55, `rgba(${pal.warm}, ${0.22 * pal.alphaBoost * m.sdk})`);
        g.addColorStop(1, `rgba(${pal.warm}, 0)`);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
        ctx.lineWidth = 0.72;
        ctx.strokeStyle = g;
        ctx.stroke();

        const u = (ray.offset + time * 0.22) % 1;
        const pos = bezier(p0, c1, c2, p3, u);
        ctx.fillStyle = `rgba(${pal.particle}, ${(1 - u) * 0.76 * m.sdk})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }

      radialGlow(ctx, { x: cx, y: cy }, R * 0.42, [
        [0, `rgba(${pal.coreCenter}, ${0.94 * m.sdk})`],
        [0.28, `rgba(${pal.coreMid}, ${0.38 * m.sdk})`],
        [1, pal.fadeZero],
      ]);
    }
  });

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}

/**
 * Band 4 top: Four-column convergence conduit bridging the central golden axis
 * down cleanly into the four Connector Atlas columns.
 */
export function AtlasConduit({
  theme = "dark",
  className = "",
}: {
  theme?: OpticalTheme;
  className?: string;
}) {
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const strandsRef = useRef(
    (() => {
      const { rnd, between } = seededHelpers(51923);
      return [0.125, 0.375, 0.625, 0.875].flatMap((colFrac, colIdx) =>
        Array.from({ length: 7 }, (_, j) => ({
          colFrac,
          colIdx,
          spread: (j - 3) * 8,
          live: j < 4,
          width: j === 3 ? 0.9 : 0.52,
          alpha: j < 4 ? 0.32 : 0.14,
          speed: between(0.14, 0.28),
          offset: rnd(),
          phase: rnd() * Math.PI * 2,
        })),
      );
    })(),
  );

  const canvasRef = useOpticalCanvas((ctx, w, h, time) => {
    const pal = getPalette(themeRef.current);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.composite;

    const origin: Vec = { x: w * 0.5, y: h * 0.32 };
    const strands = strandsRef.current;

    const stemGrad = ctx.createLinearGradient(origin.x, 0, origin.x, origin.y);
    stemGrad.addColorStop(0, `rgba(${pal.warm}, 0)`);
    stemGrad.addColorStop(1, `rgba(${pal.hair}, ${pal.isLight ? 0.62 : 0.55})`);
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, origin.y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = stemGrad;
    ctx.stroke();

    for (const s of strands) {
      const endX = w * s.colFrac + s.spread;
      const p3: Vec = { x: endX, y: h };
      const c1: Vec = { x: origin.x + (endX - origin.x) * 0.24, y: origin.y + (h - origin.y) * 0.36 };
      const c2: Vec = { x: endX - (endX - origin.x) * 0.14, y: origin.y + (h - origin.y) * 0.48 };

      const g = ctx.createLinearGradient(origin.x, origin.y, endX, h);
      g.addColorStop(0, `rgba(${s.live ? pal.hair : pal.warm}, ${Math.min(0.85, s.alpha * 1.2 * pal.alphaBoost)})`);
      g.addColorStop(0.55, `rgba(${s.live ? pal.mid : pal.deep}, ${s.alpha * 0.78 * pal.alphaBoost})`);
      g.addColorStop(1, `rgba(${pal.neutral}, ${pal.isLight ? 0.12 : 0.08})`);

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
      ctx.lineWidth = s.width;
      ctx.strokeStyle = g;
      ctx.stroke();

      if (s.live && Math.abs(s.spread) <= 8) {
        const u = (s.offset + time * s.speed) % 1;
        const pos = bezier(origin, c1, c2, p3, u);
        ctx.fillStyle = `rgba(${pal.particle}, ${Math.sin(u * Math.PI) * 0.75})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    radialGlow(ctx, origin, Math.min(26, origin.y * 0.92), [
      [0, `rgba(${pal.coreCenter}, ${pal.isLight ? 0.96 : 0.85})`],
      [0.28, `rgba(${pal.coreMid}, ${pal.isLight ? 0.42 : 0.28})`],
      [1, pal.fadeZero],
    ]);
    if (pal.isLight) {
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal.hair}, 0.85)`;
      ctx.fill();
    }
  });

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}

/**
 * Band 4 bottom: Architectural containment geometry illustrating ephemeral sessions,
 * AES-256-GCM vault boundary, and capability-gated socket channels.
 */
export function VaultGeometry({
  activeIndex,
  theme = "dark",
  className = "",
}: {
  activeIndex: number | null;
  theme?: OpticalTheme;
  className?: string;
}) {
  const activeRef = useRef(activeIndex);
  const themeRef = useRef(theme);
  const weightsRef = useRef<[number, number, number]>([0.65, 0.65, 0.65]);

  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const canvasRef = useOpticalCanvas((ctx, w, h, time, dt) => {
    const pal = getPalette(themeRef.current);
    const idx = activeRef.current;
    const targets: [number, number, number] =
      idx === null ? [0.7, 0.7, 0.7] : [idx === 0 ? 1 : 0.32, idx === 1 ? 1 : 0.32, idx === 2 ? 1 : 0.32];
    const step = dt > 0 ? clamp(dt * 5.5, 0, 1) : 1;
    for (let k = 0; k < 3; k++) {
      weightsRef.current[k] = lerp(weightsRef.current[k]!, targets[k]!, step);
    }
    const [wCore, wVault, wGates] = weightsRef.current;

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.composite;

    const cx = w * 0.42;
    const cy = h * 0.5;
    const R = Math.min(w * 0.3, h * 0.34);

    // Outer AES-256-GCM containment rings (segmented precision arcs)
    const segments = 6;
    const rot = time * 0.08;
    for (let i = 0; i < segments; i++) {
      const a0 = rot + (i / segments) * Math.PI * 2 + 0.09;
      const a1 = rot + ((i + 1) / segments) * Math.PI * 2 - 0.09;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(${pal.hair}, ${0.44 * pal.alphaBoost * wVault})`;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.78, -rot * 0.7 + a0, -rot * 0.7 + a1);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = `rgba(${pal.neutral}, ${(pal.isLight ? 0.24 : 0.18) * wVault})`;
      ctx.stroke();
    }

    // Capability-gated radial filaments stopping cleanly at discrete perimeter gates
    for (let g = 0; g < 8; g++) {
      const a = (g / 8) * Math.PI * 2 + 0.25;
      const allowed = g % 2 === 0;
      const outer: Vec = { x: cx + Math.cos(a) * R * 1.34, y: cy + Math.sin(a) * R * 1.16 };
      const rim: Vec = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
      const inner: Vec = { x: cx + Math.cos(a) * R * 0.32, y: cy + Math.sin(a) * R * 0.32 };

      const grad = ctx.createLinearGradient(outer.x, outer.y, rim.x, rim.y);
      grad.addColorStop(0, `rgba(${pal.warm}, 0)`);
      grad.addColorStop(1, `rgba(${allowed ? pal.hair : pal.warm}, ${(allowed ? 0.4 : 0.16) * pal.alphaBoost * wGates})`);
      ctx.beginPath();
      ctx.moveTo(outer.x, outer.y);
      ctx.lineTo(rim.x, rim.y);
      ctx.lineWidth = allowed ? 0.85 : 0.5;
      ctx.strokeStyle = grad;
      ctx.stroke();

      if (allowed) {
        ctx.beginPath();
        ctx.moveTo(rim.x, rim.y);
        ctx.lineTo(inner.x, inner.y);
        ctx.lineWidth = 0.65;
        ctx.strokeStyle = `rgba(${pal.mid}, ${0.34 * pal.alphaBoost * wGates})`;
        ctx.stroke();

        const u = (time * 0.28 + g * 0.23) % 1;
        const px = lerp(outer.x, inner.x, u);
        const py = lerp(outer.y, inner.y, u);
        ctx.fillStyle = `rgba(${pal.particle}, ${Math.sin(u * Math.PI) * 0.78 * wGates})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ephemeral pulsing core (softly rises and dissolves, never permanent)
    const ephem = 0.55 + 0.45 * Math.sin(time * 0.9);
    radialGlow(ctx, { x: cx, y: cy }, R * 0.54, [
      [0, `rgba(${pal.coreCenter}, ${(pal.isLight ? 0.92 : 0.78) * ephem * wCore})`],
      [0.26, `rgba(${pal.coreMid}, ${(pal.isLight ? 0.42 : 0.28) * ephem * wCore})`],
      [1, pal.fadeZero],
    ]);
    if (pal.isLight) {
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal.hair}, ${0.8 * ephem * wCore})`;
      ctx.fill();
    }
  });

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}

/**
 * Band 5: Panoramic horizon singularity crowning the Open Beta invitation —
 * bookends the hero's golden filament physics strictly ABOVE the text band so
 * contrast on the headline and waitlist form stays completely unobstructed.
 */
export function ClosingSingularity({
  theme = "dark",
  className = "",
}: {
  theme?: OpticalTheme;
  className?: string;
}) {
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const strandsRef = useRef(
    (() => {
      const { rnd, gauss, between } = seededHelpers(20261118);
      return Array.from({ length: 64 }, (_, i) => {
        const fromLeft = i % 2 === 0;
        return {
          fromLeft,
          yStartFrac: clamp(0.12 + rnd() * 0.74, 0.08, 0.88),
          waistOffset: gauss() * 7,
          bend: gauss() * 34,
          width: i % 6 === 0 ? 0.48 : i % 3 === 0 ? 0.78 : 1.1,
          alpha: i % 6 === 0 ? 0.42 : i % 3 === 0 ? 0.22 : 0.12,
          tier: i % 6 === 0 ? ("hair" as const) : i % 3 === 0 ? ("mid" as const) : ("warm" as const),
          phase: rnd() * Math.PI * 2,
          speed: between(0.08, 0.22),
          offset: rnd(),
        };
      });
    })(),
  );

  const canvasRef = useOpticalCanvas((ctx, w, h, time) => {
    const pal = getPalette(themeRef.current);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = pal.composite;

    const core: Vec = { x: w * 0.5, y: h * 0.52 };
    const breathe = 1 + 0.04 * Math.sin(time * 0.6);

    const topGrad = ctx.createLinearGradient(core.x, 0, core.x, core.y);
    topGrad.addColorStop(0, `rgba(${pal.neutral}, ${pal.isLight ? 0.08 : 0.12})`);
    topGrad.addColorStop(1, `rgba(${pal.hair}, ${pal.isLight ? 0.62 : 0.65})`);
    ctx.beginPath();
    ctx.moveTo(core.x, 0);
    ctx.lineTo(core.x, core.y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = topGrad;
    ctx.stroke();

    const strands = strandsRef.current;
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i]!;
      const color = pal[s.tier];
      const alpha = Math.min(0.85, s.alpha * pal.alphaBoost);
      const sway = Math.sin(time * 0.3 + s.phase) * 4;
      const p0: Vec = { x: s.fromLeft ? 0 : w, y: h * (0.18 + s.yStartFrac * 0.66) };
      const pinch: Vec = { x: core.x, y: core.y + s.waistOffset * 0.75 };
      const dir = s.fromLeft ? 1 : -1;
      const c1: Vec = { x: p0.x + dir * w * 0.22, y: p0.y + s.bend * 0.35 + sway };
      const c2: Vec = { x: core.x - dir * w * 0.14, y: pinch.y + s.bend * 0.18 - sway * 0.5 };

      const grad = ctx.createLinearGradient(p0.x, p0.y, pinch.x, pinch.y);
      grad.addColorStop(0, `rgba(${color}, 0)`);
      grad.addColorStop(0.45, `rgba(${color}, ${alpha * 0.52})`);
      grad.addColorStop(0.85, `rgba(${color}, ${Math.min(0.9, alpha * 1.15)})`);
      grad.addColorStop(1, `rgba(${pal.hair}, ${Math.min(0.92, alpha * 1.3)})`);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, pinch.x, pinch.y);
      ctx.lineWidth = s.width;
      ctx.strokeStyle = grad;
      ctx.stroke();

      if (i % 2 === 0) {
        const u = (s.offset + time * s.speed) % 1;
        const pos = bezier(p0, c1, c2, pinch, u);
        const fade = Math.sin(u * Math.PI);
        ctx.fillStyle = `rgba(${pal.particle}, ${fade * 0.72})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Crisp focal starlight pinch bounded strictly inside canvas vertical margins (zero edge clip)
    radialGlow(ctx, core, Math.min(w * 0.14, h * 0.44) * breathe, [
      [0, `rgba(${pal.coreCenter}, ${pal.isLight ? 0.98 : 0.96})`],
      [0.18, `rgba(${pal.coreMid}, ${pal.isLight ? 0.58 : 0.54})`],
      [0.44, `rgba(${pal.coreOuter}, ${pal.isLight ? 0.2 : 0.14})`],
      [0.76, `rgba(${pal.deep}, ${pal.isLight ? 0.05 : 0.03})`],
      [1, pal.fadeZero],
    ]);
  });

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}
