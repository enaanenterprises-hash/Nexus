"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  fitCanvas,
  lerp,
  pointOnPath,
  polar,
  radialGlow,
  seededHelpers,
  sub,
  type Vec,
} from "@/lib/network/geometry";
import { computeStageLayout, type StageLayout } from "./stage-layout";

export type SocketVisual = "occupied" | "open" | "locked";

export type StageSignal = {
  brain: NexusBrainState;
  sockets: SocketVisual[];
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
};

type Ambient = {
  bucket: number;
  waist: Vec;
  sourceAngle: number;
  sourceRadius: number;
  sourceBend: number;
  arrivalAngle: number;
  arrivalPull: number;
  targetAngle: number;
  targetRadius: number;
  departPull: number;
  endBend: number;
  phase: number;
};

type Wire = {
  socket: number;
  bucket: number;
  bendOut: number;
  bendIn: number;
  reach: number;
  jitter: Vec;
  tailAngle: number;
  tailRadius: number;
  phase: number;
};

type Particle = { path: number; u: number; speed: number; size: number; alpha: number };
type Dust = { path: number; t: number; offset: Vec; size: number; alpha: number; phase: number };
type Spark = { angle: number; radius: number; t: number; speed: number };

const BUCKETS = [
  { count: 70, width: 0.5, color: "255, 206, 120", alpha: 0.26 },
  { count: 50, width: 0.8, color: "246, 176, 68", alpha: 0.16 },
  { count: 26, width: 1.3, color: "232, 150, 48", alpha: 0.09 },
  { count: 30, width: 0.35, color: "255, 236, 190", alpha: 0.4 },
  { count: 10, width: 3, color: "204, 116, 28", alpha: 0.03 },
] as const;

const WIRES_PER_SOCKET = 28;
const SOCKET_LEVEL: Record<SocketVisual, number> = { occupied: 1, open: 0.45, locked: 0.14 };
const BRAIN_ENERGY: Record<NexusBrainState, number> = { idle: 0, thinking: 1, responding: 0.65 };
const INTRO_SECONDS = 2;

function createField(socketCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261114);

  const ambient: Ambient[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const high = rnd() < 0.5;
      const lift = between(0.12, 0.85);
      ambient.push({
        bucket: bucketIndex,
        waist: { x: gauss() * 0.006, y: gauss() * 0.008 },
        sourceAngle: high ? -(Math.PI - lift) : Math.PI - lift,
        sourceRadius: between(0.9, 1.7),
        sourceBend: gauss() * 0.4,
        arrivalAngle: (high ? 1 : -1) * between(0.1, 0.6),
        arrivalPull: between(0.2, 0.45),
        targetAngle: (rnd() < 0.5 ? -1 : 1) * between(0.08, 0.8),
        targetRadius: between(0.9, 1.7),
        departPull: between(0.2, 0.42),
        endBend: gauss() * 0.4,
        phase: rnd() * Math.PI * 2,
      });
    }
  });

  const wires: Wire[] = [];
  for (let socket = 0; socket < socketCount; socket++) {
    for (let i = 0; i < WIRES_PER_SOCKET; i++) {
      wires.push({
        socket,
        bucket: i % 4,
        bendOut: gauss() * 0.5,
        bendIn: gauss() * 0.45,
        reach: between(0.3, 0.55),
        jitter: { x: gauss() * 0.012, y: gauss() * 0.012 },
        tailAngle: gauss() * 0.7,
        tailRadius: between(0.25, 0.7),
        phase: rnd() * Math.PI * 2,
      });
    }
  }

  const pathCount = ambient.length + wires.length;
  const particles: Particle[] = Array.from({ length: 300 }, () => ({
    path: Math.floor(rnd() * pathCount),
    u: rnd(),
    speed: between(0.012, 0.04),
    size: between(0.45, 1.5),
    alpha: between(0.35, 0.95),
  }));
  const dust: Dust[] = Array.from({ length: 1400 }, () => ({
    path: Math.floor(rnd() * ambient.length),
    t: rnd(),
    offset: { x: gauss() * 0.035, y: gauss() * 0.035 },
    size: between(0.5, 1.4),
    alpha: between(0.3, 0.9),
    phase: rnd() * Math.PI * 2,
  }));

  return { ambient, wires, particles, dust };
}

function ambientPath(f: Ambient, L: StageLayout, time: number): Vec[][] {
  const S = L.scale;
  const sway = Math.sin(time * 0.2 + f.phase);
  const pinch = { x: L.core.x + f.waist.x * S, y: L.core.y + f.waist.y * S };
  const p0 = add(L.core, polar(f.sourceRadius * S, f.sourceAngle + 0.03 * sway));
  const c1 = add(p0, polar(f.sourceRadius * S * 0.4, f.sourceAngle + Math.PI + f.sourceBend));
  const c2 = sub(pinch, polar(f.arrivalPull * S, f.arrivalAngle + 0.05 * sway));
  const target = f.targetAngle + 0.05 * Math.sin(time * 0.17 + f.phase * 1.3);
  const d1 = add(pinch, polar(f.departPull * S, target * 0.6));
  const p3 = add(L.core, polar(f.targetRadius * S, target));
  const d2 = sub(p3, polar(f.targetRadius * S * 0.5, target + f.endBend));
  return [[p0, c1, c2, pinch], [pinch, d1, d2, p3]];
}

function wirePath(w: Wire, L: StageLayout, time: number): Vec[][] {
  const angle = L.socketAngles[w.socket]!;
  const socket = L.sockets[w.socket]!;
  const R = L.radius;
  const sway = Math.sin(time * 0.3 + w.phase);
  const end = { x: socket.x + w.jitter.x * R, y: socket.y + w.jitter.y * R };
  const c1 = add(L.core, polar(R * w.reach, angle + w.bendOut + 0.05 * sway));
  const c2 = sub(end, polar(R * 0.35, angle + w.bendIn));
  const tailAngle = angle + w.tailAngle + 0.06 * sway;
  const tip = add(socket, polar(R * w.tailRadius, tailAngle));
  return [
    [L.core, c1, c2, end],
    [end, add(end, polar(R * 0.15, angle)), sub(tip, polar(R * 0.12, tailAngle)), tip],
  ];
}

export function NeuralStage({ signal, className = "" }: { signal: StageSignal; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signalRef = useRef(signal);
  const redrawRef = useRef<(() => void) | null>(null);
  const socketCount = signal.sockets.length;

  useEffect(() => {
    signalRef.current = signal;
    redrawRef.current?.();
  }, [signal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const levels = signalRef.current.sockets.map((s) => SOCKET_LEVEL[s]);
    const pulses: Array<{ socket: number; t: number }> = [];
    const ripples: number[] = [];
    const sparks: Spark[] = [];
    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let energy = 0;
    let rippleClock = 0;
    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap } = signalRef.current;
      const { width, height, core, radius: R, scale: S } = layout;
      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const ease = 1 - Math.pow(1 - intro, 3);
      const follow = reduceMotion ? 1 : Math.min(1, dt * 3);

      energy = lerp(energy, BRAIN_ENERGY[brain], reduceMotion ? 1 : Math.min(1, dt * 2.5));
      sockets.forEach((s, i) => {
        levels[i] = lerp(levels[i] ?? 0, SOCKET_LEVEL[s], follow);
      });
      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        if (!reduceMotion) pulses.push({ socket: snap.index, t: 0 });
      }

      const thinking = brain === "thinking";
      const beat = thinking ? 0.5 + 0.5 * Math.sin(time * 7) : 0;
      const breathe = 1 + 0.05 * Math.sin(time * (0.55 + energy * 1.4)) + 0.1 * energy + 0.06 * beat;
      const lightRadius = S * 1.05 * (0.55 + 0.45 * ease) * (1 + 0.12 * energy);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = ease;

      radialGlow(ctx, core, S * 0.55 * breathe, [
        [0, `rgba(255, 186, 84, ${0.12 + 0.06 * energy})`],
        [0.4, "rgba(200, 116, 36, 0.05)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      const ambient = field.ambient.map((f) => ambientPath(f, layout, time));
      const wires = field.wires.map((w) => wirePath(w, layout, time));

      const gradientFor = (color: string, a: number) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, lightRadius);
        g.addColorStop(0, `rgba(${color}, ${Math.min(1, a * 2.4)})`);
        g.addColorStop(0.22, `rgba(${color}, ${a * 1.2})`);
        g.addColorStop(0.6, `rgba(${color}, ${a * 0.45})`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        return g;
      };

      BUCKETS.forEach((bucket, bucketIndex) => {
        ctx.beginPath();
        field.ambient.forEach((f, i) => {
          if (f.bucket !== bucketIndex) return;
          const [inc, out] = ambient[i]!;
          ctx.moveTo(inc![0]!.x, inc![0]!.y);
          for (const [, b, c, d] of [inc!, out!]) ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
        });
        ctx.lineWidth = bucket.width;
        ctx.strokeStyle = gradientFor(bucket.color, bucket.alpha * (0.6 + 0.45 * energy));
        ctx.stroke();
      });

      for (let socket = 0; socket < socketCount; socket++) {
        const level = levels[socket] ?? 0;
        for (const bucketIndex of [0, 1, 2, 3]) {
          const bucket = BUCKETS[bucketIndex]!;
          ctx.beginPath();
          field.wires.forEach((w, i) => {
            if (w.socket !== socket || w.bucket !== bucketIndex) return;
            const segments = wires[i]!;
            ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
            for (const [, b, c, d] of segments) ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
          });
          ctx.lineWidth = bucket.width * (0.9 + level * 0.6);
          ctx.strokeStyle = `rgba(${bucket.color}, ${Math.min(1, bucket.alpha * 5 * level * (1 + 0.3 * energy))})`;
          ctx.stroke();
        }
        const at = layout.sockets[socket]!;
        radialGlow(ctx, at, R * (0.18 + 0.12 * level), [
          [0, `rgba(255, 214, 140, ${0.32 * level})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      if (!reduceMotion) {
        if (brain === "responding") {
          rippleClock -= dt;
          if (rippleClock <= 0) {
            ripples.push(0);
            rippleClock = 0.85;
          }
        } else {
          rippleClock = 0;
        }
        if (thinking && Math.random() < dt * 40) {
          sparks.push({ angle: Math.random() * Math.PI * 2, radius: R * (0.7 + Math.random() * 0.6), t: 0, speed: 1.2 + Math.random() });
        }
      }

      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i]! += dt * 0.55;
        const r = ripples[i]!;
        if (r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 214, 150, ${0.28 * (1 - r) * (1 - r)})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.12 + r * 1.1), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgb(255, 236, 200)";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.t += dt * s.speed;
        if (s.t >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const k = 1 - s.t * s.t;
        const p = add(core, polar(s.radius * k, s.angle + s.t * 0.6));
        ctx.globalAlpha = Math.sin(s.t * Math.PI) * 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = ease;

      radialGlow(ctx, core, S * 0.075 * breathe, [
        [0, "rgba(255, 252, 240, 1)"],
        [0.2, `rgba(255, 228, 165, ${0.65 + 0.25 * energy})`],
        [0.5, "rgba(250, 176, 70, 0.2)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i]!;
        pulse.t += dt / 0.9;
        if (pulse.t >= 1.4) {
          pulses.splice(i, 1);
          continue;
        }
        const travel = Math.min(1, pulse.t);
        const lead = field.wires.findIndex((w) => w.socket === pulse.socket);
        const pos = pointOnPath(wires[lead]!.slice(0, 1), travel);
        const fade = pulse.t > 1 ? 1 - (pulse.t - 1) / 0.4 : 1;
        radialGlow(ctx, pos, R * 0.16, [
          [0, `rgba(255, 248, 225, ${0.95 * fade})`],
          [0.3, `rgba(255, 200, 110, ${0.35 * fade})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
        if (pulse.t > 0.85) {
          radialGlow(ctx, layout.sockets[pulse.socket]!, R * 0.45 * fade, [
            [0, `rgba(255, 220, 150, ${0.4 * fade})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }
      }

      const falloff = (p: Vec) => Math.max(0, 1 - Math.hypot(p.x - core.x, p.y - core.y) / lightRadius);

      ctx.fillStyle = "rgb(255, 214, 140)";
      for (const d of field.dust) {
        const base = pointOnPath(ambient[d.path]!.slice(1), d.t);
        const p = { x: base.x + d.offset.x * S, y: base.y + d.offset.y * S };
        const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + d.phase);
        ctx.globalAlpha = ease * d.alpha * twinkle * Math.min(1, falloff(p) * 1.6);
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      const speedUp = 1 + 2.2 * energy;
      ctx.fillStyle = "rgb(255, 240, 205)";
      for (const p of field.particles) {
        const isWire = p.path >= ambient.length;
        const wireIndex = p.path - ambient.length;
        const level = isWire ? (levels[field.wires[wireIndex]!.socket] ?? 0) : 1;
        if (!reduceMotion) p.u = (p.u + p.speed * dt * speedUp * (isWire ? 0.6 + level : 1)) % 1;
        const path = isWire ? wires[wireIndex]! : ambient[p.path]!;
        const pos = pointOnPath(path, p.u);
        const glow = isWire ? Math.max(0, level - 0.12) : Math.min(1, falloff(pos) * 1.7);
        ctx.globalAlpha = ease * p.alpha * glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      layout = computeStageLayout(width, height, socketCount);
      if (reduceMotion) draw(8, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw((now - start) / 1000, dt);
      frame = requestAnimationFrame(loop);
    };

    redrawRef.current = reduceMotion ? () => draw(8, 0) : null;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      redrawRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
