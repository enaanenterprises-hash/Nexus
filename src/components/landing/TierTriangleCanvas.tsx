"use client";

import { useEffect, useRef } from "react";
import { fitCanvas, lerp, observeCanvasActivity, seededHelpers, type Vec } from "@/lib/network/geometry";
import type { EcosystemLayer } from "./WorkspaceVisuals";

/** Normalized vertex positions shared by the canvas and the HTML lenses layered above it. */
export const TRIANGLE_VERTICES: Readonly<Record<EcosystemLayer, Vec>> = {
  network: { x: 0.5, y: 0.21 },
  command: { x: 0.16, y: 0.78 },
  nodes: { x: 0.84, y: 0.78 },
};

/** Radius of the lens circles in CSS px; filaments emerge exactly at this ring. */
export const TRIANGLE_NODE_RADIUS = 28;

type Rgb = readonly [number, number, number];

const GOLD: Rgb = [244, 194, 108];
const GOLD_HOT: Rgb = [255, 238, 200];
const SILVER: Rgb = [204, 210, 224];
const SILVER_HOT: Rgb = [250, 251, 255];

const EDGES: ReadonlyArray<readonly [EcosystemLayer, EcosystemLayer]> = [
  ["network", "command"],
  ["command", "nodes"],
  ["nodes", "network"],
];

const FILAMENTS_PER_EDGE = 13;
const SAMPLES = 44;
const POINTER_REACH = 72;
const PULSES_PER_HOP = 6;
const PULSE_TRAIL = 0.18;

type Filament = {
  fan: number;
  p1: number;
  p2: number;
  k1: number;
  k2: number;
  w1: number;
  w2: number;
  amp: number;
  width: number;
  alpha: number;
  pts: Float32Array;
};

type Pulse = {
  edge: number;
  fil: number;
  start: number;
  dur: number;
  forward: boolean;
  to: EcosystemLayer;
};

type Mote = { edge: number; fil: number; u: number; speed: number };

const toneOf = (layer: EcosystemLayer): Rgb => (layer === "network" ? GOLD : SILVER);
const hotOf = (layer: EcosystemLayer): Rgb => (layer === "network" ? GOLD_HOT : SILVER_HOT);

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}

const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function buildFilaments(): Filament[][] {
  const { rnd, between } = seededHelpers(52817);
  return EDGES.map(() =>
    Array.from({ length: FILAMENTS_PER_EDGE }, (_, i) => {
      const fan = (i / (FILAMENTS_PER_EDGE - 1)) * 2 - 1;
      const core = Math.abs(fan) < 0.2;
      return {
        fan: fan + (rnd() - 0.5) * 0.08,
        p1: rnd() * Math.PI * 2,
        p2: rnd() * Math.PI * 2,
        k1: between(0.7, 1.5),
        k2: between(1.8, 2.9),
        w1: between(0.42, 0.8),
        w2: between(0.65, 1.15),
        // Outer strands sway more freely; the core stays composed.
        amp: between(1.6, 3.8) * (0.55 + 0.45 * Math.abs(fan)),
        width: core ? between(0.9, 1.15) : between(0.45, 0.75),
        alpha: core ? 0.3 : between(0.1, 0.2) * (1 - 0.35 * Math.abs(fan)),
        pts: new Float32Array((SAMPLES + 1) * 2),
      };
    }),
  );
}

function pointAt(pts: Float32Array, u: number): Vec {
  const f = Math.max(0, Math.min(1, u)) * SAMPLES;
  const i = Math.min(SAMPLES - 1, Math.floor(f));
  const t = f - i;
  return {
    x: lerp(pts[i * 2]!, pts[(i + 1) * 2]!, t),
    y: lerp(pts[i * 2 + 1]!, pts[(i + 1) * 2 + 1]!, t),
  };
}

function strokeSmooth(ctx: CanvasRenderingContext2D, pts: Float32Array) {
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 1; i < SAMPLES; i++) {
    const x = pts[i * 2]!;
    const y = pts[i * 2 + 1]!;
    ctx.quadraticCurveTo(x, y, (x + pts[(i + 1) * 2]!) * 0.5, (y + pts[(i + 1) * 2 + 1]!) * 0.5);
  }
  ctx.lineTo(pts[SAMPLES * 2]!, pts[SAMPLES * 2 + 1]!);
  ctx.stroke();
}

function edgeIndexFor(a: EcosystemLayer, b: EcosystemLayer): number {
  return EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Living triangular filament field: three silk bundles bind Network, Command, and Nodes.
 * Strands sway on slow travelling waves; each hop sends light along the active edge,
 * which ripples into the receiving lens on arrival.
 */
export function TierTriangleCanvas({
  hopFrom,
  hopTo,
  hopSerial,
  className,
}: {
  hopFrom: EcosystemLayer;
  hopTo: EcosystemLayer;
  hopSerial: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hopRef = useRef({ from: hopFrom, to: hopTo, serial: hopSerial });
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    hopRef.current = { from: hopFrom, to: hopTo, serial: hopSerial };
    redrawRef.current?.();
  }, [hopFrom, hopTo, hopSerial]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const filaments = buildFilaments();
    const { rnd } = seededHelpers(9031);
    const motes: Mote[] = EDGES.flatMap((_, edge) =>
      Array.from({ length: 3 }, () => ({
        edge,
        fil: Math.floor(rnd() * FILAMENTS_PER_EDGE),
        u: rnd(),
        speed: 0.045 + rnd() * 0.05,
      })),
    );
    const pulses: Pulse[] = [];
    const activity = EDGES.map(() => 0.14);
    const impact: Record<EcosystemLayer, number> = { network: 0, command: 0, nodes: 0 };
    const pointer = { x: 0, y: 0, sx: 0, sy: 0, presence: 0, inside: false };

    let width = 1;
    let height = 1;
    let time = 0;
    let frame = 0;
    let last = 0;
    let running = true;
    let lastSerial = -1;

    const vertex = (layer: EcosystemLayer): Vec => ({
      x: TRIANGLE_VERTICES[layer].x * width,
      y: TRIANGLE_VERTICES[layer].y * height,
    });

    const activeEdge = () => edgeIndexFor(hopRef.current.from, hopRef.current.to);

    const syncHop = () => {
      const hop = hopRef.current;
      if (hop.serial === lastSerial) return;
      lastSerial = hop.serial;
      const edge = edgeIndexFor(hop.from, hop.to);
      if (edge < 0 || reduceMotion) return;
      const forward = EDGES[edge]![0] === hop.from;
      const spread = [6, 3, 9, 1, 11, 5, 7];
      for (let i = 0; i < PULSES_PER_HOP; i++) {
        pulses.push({
          edge,
          fil: (spread[i]! + Math.floor(rnd() * 2)) % FILAMENTS_PER_EDGE,
          start: time + i * 0.12 + rnd() * 0.1,
          dur: 1.35 + rnd() * 0.4,
          forward,
          to: hop.to,
        });
      }
    };

    const layout = () => {
      const R = TRIANGLE_NODE_RADIUS;
      const net = vertex("network");
      const cmd = vertex("command");
      const nod = vertex("nodes");
      const cx = (net.x + cmd.x + nod.x) / 3;
      const cy = (net.y + cmd.y + nod.y) / 3;
      const reach2 = POINTER_REACH * POINTER_REACH;

      EDGES.forEach(([a, b], e) => {
        const A = vertex(a);
        const B = vertex(b);
        const len = Math.max(1, Math.hypot(B.x - A.x, B.y - A.y));
        const dx = (B.x - A.x) / len;
        const dy = (B.y - A.y) / len;
        let nx = -dy;
        let ny = dx;
        if (((A.x + B.x) / 2 - cx) * nx + ((A.y + B.y) / 2 - cy) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const bow = len * 0.05;
        const spread = 11 + activity[e]! * 5;
        const wind = 0.78 + 0.22 * Math.sin(time * 0.23 + e * 2.1);

        for (const f of filaments[e]!) {
          const th = f.fan * 0.6;
          const cos = Math.cos(th) * R;
          const sin = Math.sin(th) * R;
          const sx = A.x + dx * cos + nx * sin;
          const sy = A.y + dy * cos + ny * sin;
          const ex = B.x - dx * cos + nx * sin;
          const ey = B.y - dy * cos + ny * sin;

          for (let i = 0; i <= SAMPLES; i++) {
            const s = i / SAMPLES;
            const bell = Math.sin(Math.PI * s);
            const sway =
              0.64 * Math.sin(Math.PI * 2 * f.k1 * s - f.w1 * time + f.p1) +
              0.36 * Math.sin(Math.PI * 2 * f.k2 * s + f.w2 * time * 0.8 + f.p2);
            const off = bow * bell + f.fan * spread * Math.pow(bell, 0.75) + Math.pow(bell, 1.15) * f.amp * wind * sway;
            let x = lerp(sx, ex, s) + nx * off;
            let y = lerp(sy, ey, s) + ny * off;

            if (pointer.presence > 0.01) {
              const px = x - pointer.sx;
              const py = y - pointer.sy;
              const d2 = px * px + py * py;
              if (d2 < reach2) {
                const d = Math.sqrt(d2) || 1;
                const fall = (1 - d / POINTER_REACH) ** 2;
                const push = fall * bell * pointer.presence * 9;
                x += (px / d) * push;
                y += (py / d) * push;
              }
            }
            f.pts[i * 2] = x;
            f.pts[i * 2 + 1] = y;
          }
        }
      });
    };

    const draw = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      EDGES.forEach(([a, b], e) => {
        const A = vertex(a);
        const B = vertex(b);
        const ca = toneOf(a);
        const cb = toneOf(b);
        const act = activity[e]!;
        const mul = 0.6 + 1.25 * act;

        for (const f of filaments[e]!) {
          const al = Math.min(0.85, f.alpha * mul);
          const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
          g.addColorStop(0, rgba(ca, al * 0.3));
          g.addColorStop(0.16, rgba(ca, al));
          g.addColorStop(0.84, rgba(cb, al));
          g.addColorStop(1, rgba(cb, al * 0.3));
          ctx.strokeStyle = g;
          ctx.lineWidth = f.width;
          strokeSmooth(ctx, f.pts);

          // Soft bloom on the busy edge's core strands only.
          if (act > 0.3 && Math.abs(f.fan) < 0.35) {
            ctx.strokeStyle = rgba(mixRgb(ca, cb, 0.5), 0.07 * act);
            ctx.lineWidth = f.width * 4;
            strokeSmooth(ctx, f.pts);
          }
        }
      });

      // Idle motes drifting slowly along strands keep the field alive between hops.
      for (const m of motes) {
        const [a, b] = EDGES[m.edge]!;
        const p = pointAt(filaments[m.edge]![m.fil]!.pts, m.u);
        const alpha = Math.sin(Math.PI * m.u) * (0.22 + 0.25 * activity[m.edge]!);
        const c = mixRgb(hotOf(a), hotOf(b), m.u);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 4);
        g.addColorStop(0, rgba(c, alpha));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }

      // Travelling light: a comet head with a tapering trail along its strand.
      for (const p of pulses) {
        const k = (time - p.start) / p.dur;
        if (k < 0 || k >= 1) continue;
        const [a, b] = EDGES[p.edge]!;
        const pts = filaments[p.edge]![p.fil]!.pts;
        const head = easeInOutSine(k);
        const fade = Math.pow(Math.sin(Math.PI * k), 0.45);
        const uHead = p.forward ? head : 1 - head;
        const uTail = p.forward ? head - PULSE_TRAIL : 1 - head + PULSE_TRAIL;
        const color = mixRgb(hotOf(a), hotOf(b), uHead);
        const tail = pointAt(pts, uTail);
        const tip = pointAt(pts, uHead);

        const trail = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
        trail.addColorStop(0, rgba(color, 0));
        trail.addColorStop(1, rgba(color, 0.85 * fade));
        ctx.strokeStyle = trail;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let j = 0; j <= 10; j++) {
          const q = pointAt(pts, lerp(uTail, uHead, j / 10));
          if (j === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();

        const halo = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 11);
        halo.addColorStop(0, rgba(color, 0.5 * fade));
        halo.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(tip.x - 11, tip.y - 11, 22, 22);
        ctx.fillStyle = rgba(color, 0.95 * fade);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Arrival: a soft bloom and a single expanding ripple around the receiving lens.
      for (const layer of Object.keys(impact) as EcosystemLayer[]) {
        const imp = impact[layer];
        if (imp < 0.01) continue;
        const v = vertex(layer);
        const tone = hotOf(layer);
        const R = TRIANGLE_NODE_RADIUS;
        const bloom = ctx.createRadialGradient(v.x, v.y, R * 0.8, v.x, v.y, R * 2.4);
        bloom.addColorStop(0, rgba(tone, 0.2 * imp));
        bloom.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = bloom;
        ctx.fillRect(v.x - R * 2.4, v.y - R * 2.4, R * 4.8, R * 4.8);
        ctx.strokeStyle = rgba(tone, 0.42 * imp * imp);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(v.x, v.y, R + 3 + (1 - imp) * 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const renderStatic = () => {
      const edge = activeEdge();
      activity.forEach((_, i) => {
        activity[i] = i === edge ? 1 : 0.14;
      });
      layout();
      draw();
    };

    const tick = (now: number) => {
      if (!running) {
        frame = 0;
        last = 0;
        return;
      }
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;

      syncHop();

      const edge = activeEdge();
      const settle = 1 - Math.exp(-dt * 2.2);
      activity.forEach((v, i) => {
        activity[i] = v + ((i === edge ? 1 : 0.14) - v) * settle;
      });

      const follow = 1 - Math.exp(-dt * 7);
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      pointer.presence += ((pointer.inside ? 1 : 0) - pointer.presence) * (1 - Math.exp(-dt * 4));

      for (const layer of Object.keys(impact) as EcosystemLayer[]) {
        impact[layer] = Math.max(0, impact[layer] - dt * 1.1);
      }
      for (const m of motes) {
        m.u += m.speed * dt;
        if (m.u > 1) {
          m.u -= 1;
          m.fil = Math.floor(rnd() * FILAMENTS_PER_EDGE);
        }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]!;
        if (time - p.start >= p.dur) {
          impact[p.to] = 1;
          pulses.splice(i, 1);
        }
      }

      layout();
      draw();
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const dims = fitCanvas(canvas, ctx);
      width = dims.width;
      height = dims.height;
      if (reduceMotion) renderStatic();
      else {
        layout();
        draw();
      }
    };

    const target = canvas.parentElement ?? canvas;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      if (!pointer.inside) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
      }
      pointer.inside = true;
    };
    const onLeave = () => {
      pointer.inside = false;
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerleave", onLeave);

    redrawRef.current = () => {
      if (reduceMotion) renderStatic();
    };

    const stopActivity = observeCanvasActivity(canvas, (isActive) => {
      running = isActive && !reduceMotion;
      if (running && frame === 0) {
        last = 0;
        frame = requestAnimationFrame(tick);
      } else if (!running && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      }
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => {
      cancelAnimationFrame(frame);
      stopActivity();
      ro.disconnect();
      redrawRef.current = null;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={`pointer-events-none block h-full w-full ${className ?? ""}`} aria-hidden="true" />;
}
