"use client";

import { useEffect, useRef } from "react";

type Vec = { x: number; y: number };

type Filament = {
  bucket: number;
  waist: Vec;
  sourceAngle: number;
  sourceRadius: number;
  arrivalAngle: number;
  arrivalPull: number;
  sourceBend: number;
  targetAngle: number;
  targetRadius: number;
  departAngle: number;
  departPull: number;
  endAngle: number;
  viaNode: boolean;
  hubJitter: Vec;
  hubAngle: number;
  tailAngle: number;
  tailRadius: number;
  tailEnd: number;
  phase: number;
  sway: number;
};

type Particle = { filament: number; u: number; speed: number; size: number; alpha: number };
type Dust = { filament: number; t: number; offset: Vec; size: number; alpha: number; phase: number };
type Layout = { width: number; height: number; core: Vec; node: Vec; scale: number };

/** Faint wide haze strands through fine bright hairs; additive blending builds the glow. */
const BUCKETS = [
  { count: 110, width: 0.5, color: "255, 206, 120", alpha: 0.3 },
  { count: 80, width: 0.8, color: "246, 176, 68", alpha: 0.2 },
  { count: 46, width: 1.2, color: "232, 150, 48", alpha: 0.12 },
  { count: 24, width: 2, color: "214, 128, 36", alpha: 0.06 },
  { count: 46, width: 0.35, color: "255, 236, 190", alpha: 0.45 },
  { count: 12, width: 3.4, color: "204, 116, 28", alpha: 0.03 },
] as const;

const PARTICLE_COUNT = 420;
const DUST_COUNT = 1500;
const INTRO_SECONDS = 2.6;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const polar = (r: number, angle: number): Vec => ({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function bezier(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function createField() {
  const rnd = mulberry32(20261113);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  const filaments: Filament[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const fromAbove = rnd() < 0.5;
      const lift = fromAbove ? between(0.3, 1.05) : between(0.08, 0.75);
      const sourceAngle = fromAbove ? -(Math.PI - lift) : Math.PI - lift;
      const arrivalAngle = (fromAbove ? lift : -lift) * 0.55 + gauss() * 0.1;

      const lane = rnd();
      const targetAngle =
        lane < 0.38 ? between(-1.0, -0.32) : lane < 0.74 ? between(0.28, 0.92) : between(-0.28, 0.28);
      const viaNode = lane >= 0.74 && bucketIndex !== 3 && bucketIndex !== 5 && rnd() < 0.6;

      filaments.push({
        bucket: bucketIndex,
        waist: { x: gauss() * 0.006, y: gauss() * (rnd() < 0.1 ? 0.028 : 0.008) },
        sourceAngle,
        sourceRadius: between(0.9, 1.8),
        arrivalAngle,
        arrivalPull: between(0.25, 0.5),
        sourceBend: gauss() * 1.1,
        targetAngle,
        targetRadius: between(0.7, 1.6),
        departAngle: clamp(targetAngle * between(1.1, 1.4), -1.2, 1.1),
        departPull: between(0.22, 0.45),
        endAngle: -targetAngle * between(0.05, 0.6) + gauss() * 0.25,
        viaNode,
        hubJitter: { x: gauss() * 0.006, y: gauss() * 0.01 },
        hubAngle: 0.1 + gauss() * 0.25,
        tailAngle: gauss() * 1.1,
        tailRadius: between(0.3, 0.85),
        tailEnd: gauss() * 0.4,
        phase: rnd() * Math.PI * 2,
        sway: between(0.6, 1.4),
      });
    }
  });

  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
    filament: Math.floor(rnd() * filaments.length),
    u: rnd(),
    speed: between(0.01, 0.045),
    size: between(0.45, 1.6),
    alpha: between(0.35, 0.95),
  }));

  const dust: Dust[] = Array.from({ length: DUST_COUNT }, () => ({
    filament: Math.floor(rnd() * filaments.length),
    t: Math.pow(rnd(), 0.8),
    offset: { x: gauss() * 0.045, y: gauss() * 0.045 },
    size: between(0.4, 1.3),
    alpha: between(0.2, 0.8),
    phase: rnd() * Math.PI * 2,
  }));

  return { filaments, particles, dust };
}

function computeLayout(width: number, height: number): Layout {
  if (width < 760) {
    return {
      width,
      height,
      core: { x: width * 0.4, y: height * 0.4 },
      node: { x: width * 0.84, y: height * 0.455 },
      scale: Math.max(width * 1.05, height * 0.5),
    };
  }
  return {
    width,
    height,
    core: { x: width * 0.46, y: height * 0.44 },
    node: { x: width * 0.72, y: height * 0.515 },
    scale: Math.max(width * 0.5, height * 0.85),
  };
}

/** Incoming and outgoing bezier segments for one filament at `time` seconds. */
function segmentsFor(f: Filament, layout: Layout, time: number): Vec[][] {
  const { core, node, scale: S } = layout;
  const swayA = Math.sin(time * 0.21 + f.phase) * f.sway;
  const swayB = Math.sin(time * 0.16 + f.phase * 1.7) * f.sway;

  const pinch = { x: core.x + f.waist.x * S, y: core.y + f.waist.y * S };
  const sourceAngle = f.sourceAngle + 0.03 * swayB;
  const p0 = add(core, polar(f.sourceRadius * S, sourceAngle));
  const c1 = add(p0, polar(f.sourceRadius * S * 0.42, sourceAngle + Math.PI + f.sourceBend));
  const c2 = sub(pinch, polar(f.arrivalPull * S, f.arrivalAngle + 0.04 * swayA));
  const incoming = [p0, c1, c2, pinch];

  const departAngle = f.departAngle + 0.05 * swayA;
  const d1 = add(pinch, polar(f.departPull * S, departAngle));

  if (!f.viaNode) {
    const targetAngle = f.targetAngle + 0.06 * swayB;
    const p3 = add(core, polar(f.targetRadius * S, targetAngle));
    const d2 = sub(p3, polar(f.targetRadius * S * 0.55, f.endAngle + 0.08 * swayA));
    return [incoming, [pinch, d1, d2, p3]];
  }

  const span = Math.hypot(node.x - core.x, node.y - core.y);
  const hubAngle = f.hubAngle + 0.04 * swayB;
  const hub = { x: node.x + f.hubJitter.x * S, y: node.y + f.hubJitter.y * S };
  const d2 = sub(hub, polar(span * 0.42, hubAngle));
  const tailAngle = hubAngle + f.tailAngle + 0.06 * swayA;
  const e1 = add(hub, polar(span * 0.38, hubAngle));
  const p4 = add(node, polar(f.tailRadius * S, tailAngle));
  const e2 = sub(p4, polar(f.tailRadius * S * 0.45, tailAngle * 0.4 + f.tailEnd));
  return [incoming, [pinch, d1, d2, hub], [hub, e1, e2, p4]];
}

function pointOnPath(segments: Vec[][], u: number): Vec {
  const scaled = clamp(u, 0, 0.9999) * segments.length;
  const index = Math.floor(scaled);
  const [a, b, c, d] = segments[index]!;
  return bezier(a!, b!, c!, d!, scaled - index);
}

function radialGlow(ctx: CanvasRenderingContext2D, at: Vec, radius: number, stops: Array<[number, string]>) {
  const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
}

export function GoldenNetwork({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createField();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let layout = computeLayout(1, 1);
    let frame = 0;
    let start = 0;
    let last = 0;

    const draw = (time: number, dt: number) => {
      const { width, height, core, node, scale: S } = layout;
      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const ease = 1 - Math.pow(1 - intro, 3);
      const breathe = 1 + 0.05 * Math.sin(time * 0.55);
      const lightCenter = { x: core.x + S * 0.2, y: core.y + S * 0.03 };
      const lightRadius = S * 1.3 * (0.55 + 0.45 * ease);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = ease;

      radialGlow(ctx, lightCenter, S * 0.75 * breathe, [
        [0, "rgba(255, 186, 84, 0.14)"],
        [0.35, "rgba(200, 116, 36, 0.06)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
      radialGlow(ctx, core, S * 0.28 * breathe, [
        [0, "rgba(255, 210, 130, 0.3)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
      radialGlow(ctx, node, S * 0.22, [
        [0, "rgba(255, 206, 120, 0.2)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      const paths = field.filaments.map((f) => segmentsFor(f, layout, time));

      const strokeBucket = (bucketIndex: number, part: "incoming" | "outgoing", strength: number) => {
        const bucket = BUCKETS[bucketIndex]!;
        const a = bucket.alpha * strength;
        const gradient = ctx.createRadialGradient(
          lightCenter.x, lightCenter.y, 0,
          lightCenter.x, lightCenter.y, lightRadius,
        );
        gradient.addColorStop(0, `rgba(${bucket.color}, ${Math.min(1, a * 2.4)})`);
        gradient.addColorStop(0.2, `rgba(${bucket.color}, ${a * 1.3})`);
        gradient.addColorStop(0.55, `rgba(${bucket.color}, ${a * 0.55})`);
        gradient.addColorStop(1, `rgba(${bucket.color}, 0)`);

        ctx.beginPath();
        field.filaments.forEach((f, i) => {
          if (f.bucket !== bucketIndex) return;
          const all = paths[i]!;
          const segments = part === "incoming" ? all.slice(0, 1) : all.slice(1);
          ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
          for (const [, b, c, d] of segments) ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
        });
        ctx.lineWidth = bucket.width;
        ctx.strokeStyle = gradient;
        ctx.stroke();
      };

      BUCKETS.forEach((_, bucketIndex) => {
        strokeBucket(bucketIndex, "incoming", 0.42);
        strokeBucket(bucketIndex, "outgoing", 1);
      });

      radialGlow(ctx, core, S * 0.09 * breathe, [
        [0, "rgba(255, 252, 240, 1)"],
        [0.18, "rgba(255, 228, 165, 0.7)"],
        [0.5, "rgba(250, 176, 70, 0.18)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
      radialGlow(ctx, node, S * 0.05, [
        [0, "rgba(255, 248, 225, 0.9)"],
        [0.3, "rgba(255, 206, 120, 0.35)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      const falloff = (p: Vec) =>
        Math.max(0, 1 - Math.hypot(p.x - lightCenter.x, p.y - lightCenter.y) / lightRadius);

      ctx.fillStyle = "rgb(255, 214, 140)";
      for (const d of field.dust) {
        const outgoing = paths[d.filament]!.slice(1);
        const base = pointOnPath(outgoing, d.t);
        const p = { x: base.x + d.offset.x * S, y: base.y + d.offset.y * S };
        const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + d.phase);
        ctx.globalAlpha = ease * d.alpha * twinkle * falloff(p);
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      ctx.fillStyle = "rgb(255, 240, 205)";
      for (const p of field.particles) {
        if (!reduceMotion) p.u = (p.u + p.speed * dt) % 1;
        const pos = pointOnPath(paths[p.filament]!, p.u);
        ctx.globalAlpha = ease * p.alpha * Math.min(1, falloff(pos) * 1.6);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = computeLayout(rect.width, rect.height);
      if (reduceMotion) draw(0, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw((now - start) / 1000, dt);
      frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
