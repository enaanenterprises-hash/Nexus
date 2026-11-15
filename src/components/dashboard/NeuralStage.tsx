"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  bezier,
  clamp,
  fitCanvas,
  lerp,
  polar,
  radialGlow,
  seededHelpers,
  sub,
  type Vec,
} from "@/lib/network/geometry";
import { computeStageLayout, type StageLayout } from "./stage-layout";

export type SocketVisual = "occupied" | "open" | "locked";

export type StageTransfer = {
  /** Source socket index (0..4), or -1 for the core (Command). */
  fromSocket: number;
  /** Target socket index (0..4), or -1 for the core. */
  toSocket: number;
  /** Short label that rides alongside the travelling packet. */
  label: string;
  /** Monotonic serial so each new transfer spawns a fresh packet. */
  serial: number;
};

export type StageSignal = {
  brain: NexusBrainState;
  sockets: SocketVisual[];
  /** Display names for each socket, used for automatic transfer labels. */
  socketLabels?: Array<{ monogram: string; name: string; status: string }>;
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
  /** Explicit node-to-node transfer trigger. */
  transfer?: StageTransfer | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
};

/* ——— Palette ——— */

type Rgb = readonly [number, number, number];
const GOLD: Rgb = [255, 196, 104];
const GOLD_HOT: Rgb = [255, 240, 206];
const VOID: Rgb = [104, 140, 212];
const VOID_HOT: Rgb = [184, 206, 252];

const mix = (a: Rgb, b: Rgb, t: number) =>
  `${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(lerp(a[2], b[2], t))}`;

/* ——— Tuning ——— */

const TAU = Math.PI * 2;
const INTRO_SECONDS = 2.2;
const SPINE_SAMPLES = 84;
const SOCKET_U = 0.42;
const TRIBUTARIES_PER_ARM = 84;
const FAN_PER_ARM = 36;
const CORE_STREAMS = 72;
const TRANSFER_SECONDS = 2.9;
const AUTO_TRANSFER_SECONDS = 6.5;
const ENV_SCALE = 0.25;

const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.15,
  thinking: 1,
  responding: 0.65,
};

/** Fine bright hairs, medium strands, wide haze. Additive blending builds the glow. */
const STRANDS = [
  { width: 0.45, alpha: 0.5, hot: true },
  { width: 0.85, alpha: 0.24, hot: false },
  { width: 2.1, alpha: 0.065, hot: false },
] as const;

/** Decorative superclusters in the outer void, like the blue structures around Laniakea. */
const PHANTOMS = [
  { x: 0.08, y: 0.14, lines: 38, reach: 1.2 },
  { x: 0.92, y: 0.1, lines: 32, reach: 1.05 },
  { x: 0.04, y: 0.64, lines: 28, reach: 0.95 },
] as const;

/* ——— Field types ——— */

type Spine = { pts: Vec[]; tan: Vec[]; sockIdx: number };
type Curve = [Vec, Vec, Vec, Vec];

type Tributary = {
  arm: number;
  m: number;
  side: number;
  spread: number;
  back: number;
  curl: number;
  runIn: number;
  jitter: number;
  strand: number;
  phase: number;
};

/** A stream converging radially on a point. owner: arm index, -1 core, -2-k phantom k. */
type Radial = { owner: number; angle: number; len: number; curl: number; strand: number; phase: number };

type Dust = { owner: number; source: "trib" | "radial"; idx: number; t: number; off: Vec; size: number; alpha: number; phase: number };
type Particle = { arm: number; trib: number; u: number; speed: number; size: number; alpha: number };
type CoreParticle = { radial: number; u: number; speed: number; size: number; alpha: number };
type Star = { x: number; y: number; size: number; alpha: number; phase: number };

type Transfer = { from: number; to: number; label: string; t: number; departed: boolean; crossed: boolean; arrived: boolean };
type Wave = { arm: number; mode: "ignite" | "extinguish"; t: number };
type Ring = { arm: number; t: number; cool: boolean };
type Spark = { angle: number; radius: number; t: number; speed: number };

function createField(armCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261115);
  const pickStrand = () => {
    const r = rnd();
    return r < 0.5 ? 0 : r < 0.85 ? 1 : 2;
  };

  const tributaries: Tributary[] = [];
  for (let arm = 0; arm < armCount; arm++) {
    for (let i = 0; i < TRIBUTARIES_PER_ARM; i++) {
      const m = 0.04 + Math.pow(rnd(), 0.85) * 0.94;
      tributaries.push({
        arm,
        m,
        side: rnd() < 0.5 ? -1 : 1,
        spread: between(0.08, 0.78) * (0.55 + m * 1.5),
        back: between(0.2, 0.85) * (0.6 + m * 0.9),
        curl: gauss() * 0.7,
        runIn: between(0.04, 0.3),
        jitter: between(0.002, 0.024),
        strand: pickStrand(),
        phase: rnd() * TAU,
      });
    }
  }

  const radials: Radial[] = [];
  for (let arm = 0; arm < armCount; arm++) {
    for (let i = 0; i < FAN_PER_ARM; i++) {
      radials.push({ owner: arm, angle: between(-2.7, 2.7), len: between(0.16, 0.6), curl: gauss() * 0.9, strand: pickStrand(), phase: rnd() * TAU });
    }
  }
  for (let i = 0; i < CORE_STREAMS; i++) {
    radials.push({ owner: -1, angle: rnd() * TAU, len: between(0.2, 0.72), curl: gauss() * 0.8, strand: pickStrand(), phase: rnd() * TAU });
  }
  PHANTOMS.forEach((p, k) => {
    for (let i = 0; i < p.lines; i++) {
      radials.push({ owner: -2 - k, angle: rnd() * TAU, len: between(0.22, 1) * p.reach, curl: gauss() * 1.1, strand: rnd() < 0.6 ? 0 : 1, phase: rnd() * TAU });
    }
  });

  // Batches: tributaries by arm / region (inner = core→socket, outer = beyond) / strand.
  const tribBatches: number[][][][] = Array.from({ length: armCount }, () =>
    [0, 1].map(() => STRANDS.map(() => [] as number[])),
  );
  tributaries.forEach((t, i) => tribBatches[t.arm]![t.m < SOCKET_U ? 0 : 1]![t.strand]!.push(i));

  const radialBatches = new Map<number, number[][]>();
  radials.forEach((r, i) => {
    if (!radialBatches.has(r.owner)) radialBatches.set(r.owner, STRANDS.map(() => []));
    radialBatches.get(r.owner)![r.strand]!.push(i);
  });

  // Stipple clustered along the streams, sorted by owner so colors change rarely.
  const armRadials = radials.map((r, i) => (r.owner >= 0 ? i : -1)).filter((i) => i >= 0);
  const phantomRadials = radials.map((r, i) => (r.owner <= -2 ? i : -1)).filter((i) => i >= 0);
  const dust: Dust[] = [];
  for (let i = 0; i < 2600; i++) {
    const roll = rnd();
    const near = rnd() < 0.62;
    const t = near ? 1 - Math.pow(rnd(), 2) * 0.55 : rnd();
    const base = { t, off: { x: gauss() * 0.03, y: gauss() * 0.03 }, size: between(0.45, 1.5), alpha: between(0.3, 1), phase: rnd() * TAU };
    if (roll < 0.68) {
      const idx = Math.floor(rnd() * tributaries.length);
      dust.push({ ...base, owner: tributaries[idx]!.arm, source: "trib", idx });
    } else if (roll < 0.88) {
      const idx = armRadials[Math.floor(rnd() * armRadials.length)]!;
      dust.push({ ...base, owner: radials[idx]!.owner, source: "radial", idx });
    } else {
      const idx = phantomRadials[Math.floor(rnd() * phantomRadials.length)]!;
      dust.push({ ...base, owner: -2, source: "radial", idx });
    }
  }
  dust.sort((a, b) => a.owner - b.owner);

  const particles: Particle[] = Array.from({ length: 480 }, () => {
    const trib = Math.floor(rnd() * tributaries.length);
    return { arm: tributaries[trib]!.arm, trib, u: rnd() * 1.4, speed: between(0.08, 0.2), size: between(0.5, 1.6), alpha: between(0.45, 1) };
  }).sort((a, b) => a.arm - b.arm);

  const coreRadials = radials.map((r, i) => (r.owner === -1 ? i : -1)).filter((i) => i >= 0);
  const coreParticles: CoreParticle[] = Array.from({ length: 90 }, () => ({
    radial: coreRadials[Math.floor(rnd() * coreRadials.length)]!,
    u: rnd(),
    speed: between(0.12, 0.3),
    size: between(0.5, 1.4),
    alpha: between(0.4, 0.95),
  }));

  const stars: Star[] = Array.from({ length: 620 }, () => ({
    x: rnd(),
    y: rnd(),
    size: rnd() < 0.92 ? between(0.35, 0.9) : between(1, 1.6),
    alpha: between(0.12, 0.65),
    phase: rnd() * TAU,
  }));

  return { tributaries, radials, tribBatches, radialBatches, dust, particles, coreParticles, stars };
}

/* ——— Geometry ——— */

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Sampled trunk for one arm: core → socket, then on past the socket and off the screen. */
function buildSpine(arm: number, L: StageLayout, time: number): Spine {
  const { core, radius: R } = L;
  const socket = L.sockets[arm]!;
  const elbow = L.socketElbows[arm]!;
  const fan = L.socketAngles[arm]!;
  const swayA = Math.sin(time * 0.19 + arm * 1.7);
  const swayB = Math.cos(time * 0.15 + arm * 2.3);
  const dir = Math.atan2(socket.y - core.y, socket.x - core.x);
  const c1 = add(elbow, polar(R * 0.06 * swayA, dir + Math.PI / 2));
  const c2 = sub(socket, polar(R * 0.3, dir + 0.1 * swayB));
  const inbound = Math.atan2(socket.y - c2.y, socket.x - c2.x);
  const reach = L.scale * 1.3;
  const tip = add(socket, polar(reach, fan + 0.05 * swayB));
  const f1 = add(socket, polar(reach * 0.28, inbound));
  const f2 = sub(tip, polar(reach * 0.42, fan - 0.06 * swayA));

  const sockIdx = Math.round((SPINE_SAMPLES - 1) * SOCKET_U);
  const pts: Vec[] = [];
  for (let i = 0; i <= sockIdx; i++) pts.push(bezier(core, c1, c2, socket, i / sockIdx));
  const outer = SPINE_SAMPLES - 1 - sockIdx;
  for (let i = 1; i <= outer; i++) pts.push(bezier(socket, f1, f2, tip, i / outer));

  const tan = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  });
  return { pts, tan, sockIdx };
}

function spineAt(sp: Spine, u: number): { p: Vec; t: Vec } {
  const f = clamp(u, 0, 1) * (sp.pts.length - 1);
  const i = Math.min(sp.pts.length - 2, Math.floor(f));
  const k = f - i;
  const a = sp.pts[i]!;
  const b = sp.pts[i + 1]!;
  return { p: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, t: sp.tan[i]! };
}

/** A tributary sweeping in from the side and merging tangentially into the trunk. */
function tributaryCurve(tr: Tributary, sp: Spine, R: number, time: number): Curve {
  const { p, t: T } = spineAt(sp, tr.m);
  const N = { x: -T.y, y: T.x };
  const sway = Math.sin(time * 0.31 + tr.phase);
  const off = tr.side * tr.jitter * R;
  const M = { x: p.x + N.x * off, y: p.y + N.y * off };
  const lat = tr.side * (tr.spread + 0.035 * sway) * R;
  const lon = tr.back * R;
  const S = { x: M.x + T.x * lon + N.x * lat, y: M.y + T.y * lon + N.y * lat };
  const c1 = {
    x: S.x - N.x * lat * (0.5 - 0.12 * tr.curl) + T.x * lon * 0.12 * tr.curl,
    y: S.y - N.y * lat * (0.5 - 0.12 * tr.curl) + T.y * lon * 0.12 * tr.curl,
  };
  const c2 = { x: M.x + T.x * lon * 0.5, y: M.y + T.y * lon * 0.5 };
  return [S, c1, c2, M];
}

/** A stream converging on `center`, curling as it arrives (the dandelion look of each attractor). */
function radialCurve(r: Radial, center: Vec, dirOut: number, R: number, time: number): Curve {
  const sway = Math.sin(time * 0.26 + r.phase);
  const a = dirOut + r.angle + 0.05 * sway;
  const len = r.len * R;
  const S = add(center, polar(len, a));
  const c1 = add(S, polar(len * 0.42, a + Math.PI + r.curl * 0.55));
  const c2 = add(center, polar(len * 0.3, a + r.curl * 0.35));
  return [S, c1, c2, center];
}

const ease3 = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/* ——— Component ——— */

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

    const env = document.createElement("canvas");
    const envCtx = env.getContext("2d");
    const shade = document.createElement("canvas");
    const shadeCtx = shade.getContext("2d");

    const field = createField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const armLevels: number[] = signalRef.current.sockets.map((s) => (s === "occupied" ? 1 : 0));
    const surge: number[] = signalRef.current.sockets.map(() => 0);
    const prevStates: SocketVisual[] = [...signalRef.current.sockets];
    const transfers: Transfer[] = [];
    const waves: Wave[] = [];
    const rings: Ring[] = [];
    const ripples: number[] = [];
    const sparks: Spark[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let energy = BRAIN_ENERGY[signalRef.current.brain];
    let rippleClock = 0;
    let autoClock = 3.2;
    let autoIdx = 0;
    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const spawnTransfer = (from: number, to: number, label: string) => {
      if (reduceMotion || from === to) return;
      transfers.push({ from, to, label, t: 0, departed: false, crossed: false, arrived: false });
    };

    const envelopeOutline = (L: StageLayout, time: number, breathe: number, grow: number) => {
      const { core, radius: R } = L;
      const base = R * 0.48 * breathe * grow;
      const lobes = L.sockets.map((s, a) => ({
        angle: Math.atan2(s.y - core.y, s.x - core.x),
        reach: (Math.hypot(s.x - core.x, s.y - core.y) + R * 0.34) * (armLevels[a] ?? 0) * grow,
      }));
      const pts: Vec[] = [];
      for (let k = 0; k < 96; k++) {
        const theta = (k / 96) * TAU;
        let acc = Math.pow(base, 4);
        for (const lobe of lobes) {
          if (lobe.reach < 1) continue;
          const d = angleDiff(theta, lobe.angle);
          acc += Math.pow(lobe.reach * Math.exp(-(d * d) / 0.72), 4);
        }
        const wobble = 1 + 0.028 * Math.sin(3 * theta + time * 0.33) + 0.016 * Math.sin(5 * theta - time * 0.27);
        pts.push(add(core, polar(Math.pow(acc, 0.25) * wobble, theta)));
      }
      return pts;
    };

    const traceClosed = (c: CanvasRenderingContext2D, pts: Vec[]) => {
      const mid = (a: Vec, b: Vec) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const first = mid(pts[pts.length - 1]!, pts[0]!);
      c.beginPath();
      c.moveTo(first.x, first.y);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const m = mid(p, pts[(i + 1) % pts.length]!);
        c.quadraticCurveTo(p.x, p.y, m.x, m.y);
      }
      c.closePath();
    };

    const drawSpikes = (at: Vec, len: number, rgb: string, a: number) => {
      if (a <= 0.01 || len <= 1) return;
      ctx.lineWidth = 1;
      for (const angle of [0, Math.PI / 2]) {
        const p0 = add(at, polar(len, angle + Math.PI));
        const p1 = add(at, polar(len, angle));
        const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        g.addColorStop(0, `rgba(${rgb}, 0)`);
        g.addColorStop(0.5, `rgba(${rgb}, ${a})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, socketLabels } = signalRef.current;
      const L = layout;
      const { width, height, core, radius: R } = L;
      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const ease = 1 - Math.pow(1 - intro, 3);
      const follow = reduceMotion ? 1 : 1 - Math.exp(-dt * 2.1);
      energy = lerp(energy, BRAIN_ENERGY[brain], reduceMotion ? 1 : 1 - Math.exp(-dt * 2.5));

      // ——— State changes: connect / disconnect, snaps, explicit transfers ———
      sockets.forEach((state, i) => {
        const prev = prevStates[i];
        if (prev !== state) {
          prevStates[i] = state;
          if (!reduceMotion) {
            if (state === "occupied") {
              waves.push({ arm: i, mode: "ignite", t: 0 });
              rings.push({ arm: -1, t: 0, cool: false });
            } else if (prev === "occupied") {
              waves.push({ arm: i, mode: "extinguish", t: 0 });
              rings.push({ arm: i, t: 0, cool: true });
            }
          }
        }
        armLevels[i] = lerp(armLevels[i] ?? 0, state === "occupied" ? 1 : 0, follow);
        surge[i] = (surge[i] ?? 0) * Math.exp(-dt * 1.5);
      });

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        spawnTransfer(-1, snap.index, socketLabels?.[snap.index]?.name ? `${socketLabels[snap.index]!.name} connected` : "Node connected");
      }
      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        spawnTransfer(transfer.fromSocket, transfer.toSocket, transfer.label);
      }

      if (!reduceMotion) {
        autoClock -= dt;
        if (autoClock <= 0) {
          autoClock = AUTO_TRANSFER_SECONDS;
          const live = sockets.map((s, i) => (s === "occupied" ? i : -1)).filter((i) => i >= 0);
          if (live.length >= 2) {
            const from = live[autoIdx % live.length]!;
            const to = live[(autoIdx + 1) % live.length]!;
            const a = socketLabels?.[from]?.name ?? "Node";
            const b = socketLabels?.[to]?.name ?? "Node";
            spawnTransfer(from, to, `${a} → ${b}`);
          } else if (live.length === 1) {
            const to = live[0]!;
            spawnTransfer(-1, to, `Command → ${socketLabels?.[to]?.name ?? "Node"}`);
          }
          autoIdx++;
        }
      }

      const thinking = brain === "thinking";
      const beat = thinking ? 0.5 + 0.5 * Math.sin(time * 6.2) : 0;
      const breathe = 1 + 0.035 * Math.sin(time * (0.5 + energy)) + 0.05 * energy + 0.04 * beat;
      const edgeR = Math.hypot(width, height) * 0.72;
      const speedMul = 1 + 1.7 * energy;

      const spines = L.sockets.map((_, a) => buildSpine(a, L, time));
      const tribCurves = field.tributaries.map((tr) => tributaryCurve(tr, spines[tr.arm]!, R, time));
      const phantomCenter = (k: number): Vec => {
        const p = PHANTOMS[k]!;
        return { x: width * p.x + Math.sin(time * 0.05 + k * 2) * 10, y: height * p.y + Math.cos(time * 0.04 + k) * 8 };
      };
      const radialCurves = field.radials.map((r) => {
        if (r.owner >= 0) return radialCurve(r, L.sockets[r.owner]!, L.socketAngles[r.owner]!, R, time);
        if (r.owner === -1) return radialCurve(r, core, 0, R, time);
        return radialCurve(r, phantomCenter(-2 - r.owner), 0, R, time);
      });

      // ——— 1. Deep space ———
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const bg = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeR * 1.1);
      bg.addColorStop(0, "#0b1430");
      bg.addColorStop(0.42, "#070d20");
      bg.addColorStop(1, "#02040a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "lighter";
      PHANTOMS.forEach((_, k) => {
        radialGlow(ctx, phantomCenter(k), R * 0.9, [
          [0, "rgba(70, 104, 178, 0.1)"],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      });

      ctx.fillStyle = "rgb(206, 220, 255)";
      for (const s of field.stars) {
        ctx.globalAlpha = s.alpha * (0.6 + 0.4 * Math.sin(time * 0.9 + s.phase)) * (0.4 + 0.6 * ease);
        ctx.fillRect(s.x * width, s.y * height, s.size, s.size);
      }
      ctx.globalAlpha = ease;

      // ——— 2. Outer-void superclusters (decorative, cool blue) ———
      PHANTOMS.forEach((_, k) => {
        const batches = field.radialBatches.get(-2 - k);
        if (!batches) return;
        const c = phantomCenter(k);
        batches.forEach((idxs, strand) => {
          if (!idxs.length) return;
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.25);
          const a = STRANDS[strand]!.alpha * 0.32;
          g.addColorStop(0, `rgba(${VOID_HOT.join(", ")}, ${a * 1.4})`);
          g.addColorStop(0.5, `rgba(${VOID.join(", ")}, ${a * 0.6})`);
          g.addColorStop(1, `rgba(${VOID.join(", ")}, 0)`);
          ctx.beginPath();
          for (const i of idxs) {
            const [p0, p1, p2, p3] = radialCurves[i]!;
            ctx.moveTo(p0.x, p0.y);
            ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          }
          ctx.lineWidth = STRANDS[strand]!.width;
          ctx.strokeStyle = g;
          ctx.stroke();
        });
        radialGlow(ctx, c, R * 0.08, [
          [0, "rgba(200, 220, 255, 0.5)"],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      });

      // ——— 3. The Laniakea basin: a soft golden envelope that grows to take in connected nodes ———
      if (envCtx && shadeCtx) {
        const outline = envelopeOutline(L, time, breathe, 0.55 + 0.45 * ease);
        let maxR = 1;
        for (const p of outline) maxR = Math.max(maxR, Math.hypot(p.x - core.x, p.y - core.y));

        shadeCtx.setTransform(1, 0, 0, 1, 0, 0);
        shadeCtx.clearRect(0, 0, shade.width, shade.height);
        shadeCtx.setTransform(ENV_SCALE, 0, 0, ENV_SCALE, 0, 0);
        shadeCtx.filter = "blur(16px)";
        traceClosed(shadeCtx, outline.map((p) => add(core, { x: (p.x - core.x) * 1.16, y: (p.y - core.y) * 1.16 })));
        shadeCtx.fillStyle = "rgba(0, 1, 4, 0.62)";
        shadeCtx.fill();
        shadeCtx.filter = "none";

        envCtx.setTransform(1, 0, 0, 1, 0, 0);
        envCtx.clearRect(0, 0, env.width, env.height);
        envCtx.setTransform(ENV_SCALE, 0, 0, ENV_SCALE, 0, 0);
        envCtx.filter = "blur(7px)";
        traceClosed(envCtx, outline);
        const fill = envCtx.createRadialGradient(core.x, core.y, 0, core.x, core.y, maxR);
        fill.addColorStop(0, `rgba(255, 206, 122, ${0.36 + 0.08 * energy})`);
        fill.addColorStop(0.45, "rgba(234, 162, 62, 0.24)");
        fill.addColorStop(1, "rgba(196, 124, 36, 0.17)");
        envCtx.fillStyle = fill;
        envCtx.fill();
        envCtx.filter = "none";

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = ease;
        ctx.drawImage(shade, 0, 0, width, height);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(env, 0, 0, width, height);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = ease;

      // ——— 4. Streams converging on the core (always online) ———
      const coreBatches = field.radialBatches.get(-1);
      coreBatches?.forEach((idxs, strand) => {
        const s = STRANDS[strand]!;
        const a = s.alpha * (0.85 + 0.35 * energy);
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, R * 0.8);
        const rgb = mix(GOLD, GOLD_HOT, s.hot ? 1 : 0);
        g.addColorStop(0, `rgba(${rgb}, ${Math.min(1, a * 1.6)})`);
        g.addColorStop(0.55, `rgba(${rgb}, ${a * 0.6})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.beginPath();
        for (const i of idxs) {
          const [p0, p1, p2, p3] = radialCurves[i]!;
          ctx.moveTo(p0.x, p0.y);
          ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        }
        ctx.lineWidth = s.width;
        ctx.strokeStyle = g;
        ctx.stroke();
      });

      // ——— 5. The five arms: gold and bright when connected, cool and dark when not ———
      const armLook = (a: number) => {
        const lvl = armLevels[a] ?? 0;
        const state = sockets[a] ?? "locked";
        const dormant = state === "open" ? 0.44 : 0.28;
        return {
          lvl,
          inten: lerp(dormant, 1.12, lvl) * (1 + 0.75 * (surge[a] ?? 0)) * (0.92 + 0.2 * energy),
          innerK: lerp(0.1, 1, lvl),
          outerK: lerp(0.6, 1, lvl),
          rgb: mix(VOID, GOLD, lvl),
          hot: mix(VOID_HOT, GOLD_HOT, lvl),
        };
      };

      for (let a = 0; a < socketCount; a++) {
        const look = armLook(a);
        const sp = spines[a]!;
        const socket = L.sockets[a]!;

        // 5a. Tributaries merging into the trunk.
        field.tribBatches[a]!.forEach((byStrand, region) => {
          const regionK = region === 0 ? look.innerK : look.outerK;
          byStrand.forEach((idxs, strand) => {
            if (!idxs.length) return;
            const s = STRANDS[strand]!;
            const alpha = s.alpha * look.inten * regionK;
            if (alpha < 0.004) return;
            const rgb = s.hot ? look.hot : look.rgb;
            const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeR);
            g.addColorStop(0, `rgba(${rgb}, ${Math.min(1, alpha * 1.5)})`);
            g.addColorStop(0.3, `rgba(${rgb}, ${Math.min(1, alpha)})`);
            g.addColorStop(0.68, `rgba(${rgb}, ${alpha * 0.5})`);
            g.addColorStop(1, `rgba(${rgb}, ${alpha * 0.08})`);
            ctx.beginPath();
            for (const i of idxs) {
              const tr = field.tributaries[i]!;
              const [p0, p1, p2, p3] = tribCurves[i]!;
              ctx.moveTo(p0.x, p0.y);
              ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
              // Run along the trunk toward the core so the trunk thickens as streams join.
              const off = tr.side * tr.jitter * R;
              for (let j = 1; j <= 6; j++) {
                const k = j / 6;
                const { p, t } = spineAt(sp, tr.m - tr.runIn * k);
                const o = off * (1 - 0.8 * k);
                ctx.lineTo(p.x - t.y * o, p.y + t.x * o);
              }
            }
            ctx.lineWidth = s.width * (0.9 + 0.35 * look.lvl);
            ctx.strokeStyle = g;
            ctx.stroke();
          });
        });

        // 5b. The attractor fan around the node itself.
        field.radialBatches.get(a)?.forEach((idxs, strand) => {
          if (!idxs.length) return;
          const s = STRANDS[strand]!;
          const alpha = s.alpha * look.inten * 0.85;
          const rgb = s.hot ? look.hot : look.rgb;
          const g = ctx.createRadialGradient(socket.x, socket.y, 0, socket.x, socket.y, R * 0.65);
          g.addColorStop(0, `rgba(${rgb}, ${Math.min(1, alpha * 1.6)})`);
          g.addColorStop(0.5, `rgba(${rgb}, ${alpha * 0.55})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.beginPath();
          for (const i of idxs) {
            const [p0, p1, p2, p3] = radialCurves[i]!;
            ctx.moveTo(p0.x, p0.y);
            ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          }
          ctx.lineWidth = s.width;
          ctx.strokeStyle = g;
          ctx.stroke();
        });

        // 5c. The trunk: haze, body, then a white-hot core line.
        const passes = [
          { w: 8, a: 0.04 },
          { w: 2.8, a: 0.18 },
          { w: 1.1, a: 0.62 },
        ];
        for (const [regionStart, regionEnd, k] of [
          [0, sp.sockIdx, look.innerK],
          [sp.sockIdx, sp.pts.length - 1, look.outerK],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(sp.pts[regionStart]!.x, sp.pts[regionStart]!.y);
          for (let i = regionStart + 1; i <= regionEnd; i++) ctx.lineTo(sp.pts[i]!.x, sp.pts[i]!.y);
          for (const [pi, pass] of passes.entries()) {
            const alpha = pass.a * look.inten * k * (pi === 2 ? lerp(0.45, 1, look.lvl) : 1);
            const rgb = pi === 2 ? look.hot : look.rgb;
            const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeR);
            g.addColorStop(0, `rgba(${rgb}, ${Math.min(1, alpha * 1.4)})`);
            g.addColorStop(0.35, `rgba(${rgb}, ${Math.min(1, alpha)})`);
            g.addColorStop(1, `rgba(${rgb}, ${alpha * 0.05})`);
            ctx.lineWidth = pass.w * (0.75 + 0.35 * look.lvl);
            ctx.strokeStyle = g;
            ctx.stroke();
          }
        }
      }

      // ——— 6. Stipple along the streams ———
      let dustOwner = Number.NaN;
      let dustLook = armLook(0);
      for (const d of field.dust) {
        if (d.owner !== dustOwner) {
          dustOwner = d.owner;
          if (d.owner >= 0) {
            dustLook = armLook(d.owner);
            ctx.fillStyle = `rgb(${dustLook.hot})`;
          } else {
            ctx.fillStyle = `rgb(${VOID_HOT.join(", ")})`;
          }
        }
        const curve = d.source === "trib" ? tribCurves[d.idx]! : radialCurves[d.idx]!;
        const base = bezier(curve[0], curve[1], curve[2], curve[3], d.t);
        const p = { x: base.x + d.off.x * R, y: base.y + d.off.y * R };
        const twinkle = 0.45 + 0.55 * Math.sin(time * 1.3 + d.phase);
        const edge = clamp(1 - Math.hypot(p.x - core.x, p.y - core.y) / edgeR, 0.08, 1);
        const strength = d.owner >= 0 ? lerp(0.32, 1, dustLook.lvl) * Math.min(1.4, dustLook.inten) * edge : 0.38;
        ctx.globalAlpha = ease * d.alpha * twinkle * strength;
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      // ——— 7. Matter flowing in along the tributaries, down the trunk, into the core ———
      let particleArm = -1;
      let particleLook = armLook(0);
      for (const pt of field.particles) {
        if (pt.arm !== particleArm) {
          particleArm = pt.arm;
          particleLook = armLook(pt.arm);
          ctx.fillStyle = `rgb(${particleLook.hot})`;
        }
        const tr = field.tributaries[pt.trib]!;
        if (!reduceMotion) pt.u += pt.speed * dt * speedMul * lerp(0.35, 1, particleLook.lvl);
        let pos: Vec;
        let regionK: number;
        if (pt.u < 1) {
          const c = tribCurves[pt.trib]!;
          pos = bezier(c[0], c[1], c[2], c[3], pt.u);
          regionK = tr.m < SOCKET_U ? particleLook.innerK : particleLook.outerK;
        } else {
          const su = tr.m - (pt.u - 1) * 0.8;
          if (su <= 0) {
            pt.u = 0;
            continue;
          }
          pos = spineAt(spines[pt.arm]!, su).p;
          regionK = su < SOCKET_U ? particleLook.innerK : particleLook.outerK;
        }
        const fadeIn = Math.min(1, pt.u * 5);
        ctx.globalAlpha = ease * pt.alpha * fadeIn * regionK * lerp(0.3, 1, particleLook.lvl);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pt.size, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = `rgb(${GOLD_HOT.join(", ")})`;
      for (const cp of field.coreParticles) {
        if (!reduceMotion) cp.u = (cp.u + cp.speed * dt * speedMul) % 1;
        const c = radialCurves[cp.radial]!;
        const pos = bezier(c[0], c[1], c[2], c[3], cp.u);
        ctx.globalAlpha = ease * cp.alpha * Math.sin(cp.u * Math.PI);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, cp.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = ease;

      // ——— 8. Connect / disconnect fronts ———
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]!;
        w.t += dt / 1.4;
        if (w.t >= 1.25) {
          waves.splice(i, 1);
          continue;
        }
        const e = ease3(Math.min(1, w.t));
        const u = w.mode === "ignite" ? lerp(0, 0.82, e) : lerp(0.82, 0, e);
        const pos = spineAt(spines[w.arm]!, u).p;
        const fade = w.t > 1 ? 1 - (w.t - 1) / 0.25 : Math.min(1, w.t * 6);
        const hotStop = w.mode === "ignite" ? `rgba(255, 250, 232, ${0.95 * fade})` : `rgba(176, 202, 255, ${0.6 * fade})`;
        const midStop = w.mode === "ignite" ? `rgba(255, 196, 96, ${0.38 * fade})` : `rgba(90, 120, 190, ${0.2 * fade})`;
        radialGlow(ctx, pos, R * 0.26, [
          [0, hotStop],
          [0.3, midStop],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
        if (w.mode === "ignite" && w.t > 0.5 && w.t - dt / 1.4 <= 0.5) rings.push({ arm: w.arm, t: 0, cool: false });
      }

      // ——— 9. Brain: speaking ripples and thinking sparks ———
      if (!reduceMotion) {
        if (brain === "responding") {
          rippleClock -= dt;
          if (rippleClock <= 0) {
            ripples.push(0);
            rippleClock = 0.95;
          }
        } else rippleClock = 0;
        if (thinking && Math.random() < dt * 40) {
          sparks.push({ angle: Math.random() * TAU, radius: R * (0.55 + Math.random() * 0.6), t: 0, speed: 1.1 + Math.random() });
        }
      }

      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (!reduceMotion) ripples[i]! += dt * 0.5;
        const r = ripples[i]!;
        if (r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 224, 166, ${0.22 * (1 - r) * (1 - r)})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.12 + r * 0.8), 0, TAU);
        ctx.stroke();
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]!;
        if (!reduceMotion) ring.t += dt / 1.5;
        if (ring.t >= 1) {
          rings.splice(i, 1);
          continue;
        }
        const at = ring.arm >= 0 ? L.sockets[ring.arm]! : core;
        const k = 1 - ring.t;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = ring.cool ? `rgba(170, 196, 250, ${0.5 * k * k})` : `rgba(255, 226, 168, ${0.6 * k * k})`;
        ctx.beginPath();
        ctx.arc(at.x, at.y, R * (0.04 + ease3(ring.t) * 0.42), 0, TAU);
        ctx.stroke();
      }

      ctx.fillStyle = "rgb(255, 240, 210)";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.t += dt * s.speed;
        if (s.t >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const p = add(core, polar(s.radius * (1 - s.t * s.t), s.angle + s.t * 0.6));
        ctx.globalAlpha = Math.sin(s.t * Math.PI) * 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = ease;

      // ——— 10. Node stars and the Great Attractor ———
      for (let a = 0; a < socketCount; a++) {
        const look = armLook(a);
        const at = L.sockets[a]!;
        const sg = 1 + 0.4 * (surge[a] ?? 0);
        if (look.lvl > 0.02) {
          radialGlow(ctx, at, R * 0.17 * (0.6 + 0.4 * look.lvl) * sg, [
            [0, `rgba(255, 251, 238, ${0.95 * look.lvl})`],
            [0.18, `rgba(255, 220, 150, ${0.5 * look.lvl})`],
            [0.55, `rgba(240, 168, 64, ${0.12 * look.lvl})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
          drawSpikes(at, R * 0.2 * look.lvl * sg, "255, 236, 196", 0.28 * look.lvl);
        }
        if (look.lvl < 0.98) {
          const k = (1 - look.lvl) * (sockets[a] === "open" ? 1 : 0.6);
          radialGlow(ctx, at, R * 0.11, [
            [0, `rgba(190, 212, 255, ${0.55 * k})`],
            [0.3, `rgba(110, 146, 220, ${0.16 * k})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }
      }

      const coreR = R * 0.32 * breathe;
      radialGlow(ctx, core, coreR, [
        [0, "rgba(255, 254, 248, 1)"],
        [0.1, `rgba(255, 240, 204, ${0.88 + 0.1 * energy})`],
        [0.3, "rgba(250, 190, 92, 0.3)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
      drawSpikes(core, R * (0.42 + 0.1 * beat), "255, 240, 210", 0.32 + 0.15 * energy);

      // ——— 11. Products travelling between nodes ———
      for (let i = transfers.length - 1; i >= 0; i--) {
        const tr = transfers[i]!;
        if (!reduceMotion) tr.t += dt / TRANSFER_SECONDS;
        const hasFrom = tr.from >= 0 && tr.from < socketCount;
        const hasTo = tr.to >= 0 && tr.to < socketCount;
        if ((!hasFrom && !hasTo) || tr.t >= 1.2) {
          transfers.splice(i, 1);
          continue;
        }

        const route: Vec[] = [];
        if (hasFrom) {
          const sp = spines[tr.from]!;
          for (let k = sp.sockIdx; k >= 0; k--) route.push(sp.pts[k]!);
        } else route.push(core);
        if (hasTo) {
          const sp = spines[tr.to]!;
          for (let k = 1; k <= sp.sockIdx; k++) route.push(sp.pts[k]!);
        }
        const routeAt = (u: number): Vec => {
          const f = clamp(u, 0, 1) * (route.length - 1);
          const k = Math.min(route.length - 2, Math.floor(f));
          const a = route[k]!;
          const b = route[k + 1] ?? a;
          return { x: lerp(a.x, b.x, f - k), y: lerp(a.y, b.y, f - k) };
        };

        const p = Math.min(1, tr.t);
        const e = ease3(p);
        const coreU = hasFrom ? (hasTo ? 0.5 : 1) : 0;

        if (!tr.departed) {
          tr.departed = true;
          if (hasFrom) {
            surge[tr.from] = Math.max(surge[tr.from] ?? 0, 0.7);
            rings.push({ arm: tr.from, t: 0, cool: false });
          } else rings.push({ arm: -1, t: 0, cool: false });
        }
        if (!tr.crossed && e >= coreU && hasFrom && hasTo) {
          tr.crossed = true;
          ripples.push(0.05);
        }
        if (!tr.arrived && p >= 1) {
          tr.arrived = true;
          if (hasTo) {
            surge[tr.to] = 1;
            rings.push({ arm: tr.to, t: 0, cool: false });
          }
        }

        const fade = tr.t > 1 ? 1 - (tr.t - 1) / 0.2 : 1;
        if (p < 1) {
          // Tapered light trail.
          const TRAIL = 40;
          let prev = routeAt(e);
          for (let j = 1; j <= TRAIL; j++) {
            const next = routeAt(e - j * 0.0042);
            const k = 1 - j / TRAIL;
            ctx.strokeStyle = `rgba(255, 228, 168, ${0.85 * Math.pow(k, 1.6) * fade})`;
            ctx.lineWidth = 0.4 + 3 * k;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(next.x, next.y);
            ctx.stroke();
            prev = next;
          }
          const head = routeAt(e);
          radialGlow(ctx, head, R * 0.2, [
            [0, `rgba(255, 255, 250, ${fade})`],
            [0.16, `rgba(255, 230, 170, ${0.7 * fade})`],
            [0.5, `rgba(240, 170, 70, ${0.16 * fade})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
          drawSpikes(head, R * 0.1, "255, 246, 224", 0.45 * fade);

          // Label, fading in and out with the journey.
          const labelA = clamp(Math.min((p - 0.06) / 0.12, (0.94 - p) / 0.12), 0, 1) * fade;
          if (labelA > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = labelA * ease;
            ctx.font = '500 11.5px Manrope, -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = "center";
            const lx = clamp(head.x, 90, width - 90);
            const ly = clamp(head.y - 20, 24, height - 24);
            const tw = ctx.measureText(tr.label).width;
            const halo = ctx.createRadialGradient(lx, ly - 4, 2, lx, ly - 4, tw * 0.7 + 18);
            halo.addColorStop(0, "rgba(2, 4, 10, 0.8)");
            halo.addColorStop(1, "rgba(2, 4, 10, 0)");
            ctx.fillStyle = halo;
            ctx.fillRect(lx - tw, ly - 24, tw * 2, 36);
            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.shadowBlur = 8;
            ctx.fillStyle = "rgba(255, 238, 206, 0.95)";
            ctx.fillText(tr.label, lx, ly);
            ctx.restore();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = ease;
          }
        }
      }
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      layout = computeStageLayout(width, height, socketCount);
      env.width = shade.width = Math.max(1, Math.round(width * ENV_SCALE));
      env.height = shade.height = Math.max(1, Math.round(height * ENV_SCALE));
      if (reduceMotion) draw(8, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!signalRef.current.paused) draw((now - start) / 1000, dt);
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
