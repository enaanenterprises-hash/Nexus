"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  clamp,
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

export type StageTransfer = {
  fromSocket: number;
  toSocket: number;
  label: string;
  serial: number;
};

export type StageSignal = {
  brain: NexusBrainState;
  sockets: SocketVisual[];
  theme?: "dark" | "light";
  socketLabels?: Array<{ monogram: string; name: string; status: string }>;
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
  /** Explicit node call / transfer trigger. */
  transfer?: StageTransfer | null;
  /** Currently opened or called socket index (0..4), if any. */
  activeSocket?: number | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
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
  stagger: number;
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
  stagger: number;
};

type Particle = { path: number; u: number; speed: number; size: number; alpha: number };
type Dust = { path: number; t: number; offset: Vec; size: number; alpha: number; phase: number };
type Spark = { angle: number; radius: number; t: number; speed: number; crimson: boolean };

const BUCKETS = [
  { count: 78, width: 0.52, rgb: [255, 208, 122] as const, alpha: 0.28 },
  { count: 56, width: 0.85, rgb: [246, 178, 68] as const, alpha: 0.18 },
  { count: 28, width: 1.35, rgb: [232, 150, 48] as const, alpha: 0.1 },
  { count: 34, width: 0.38, rgb: [255, 238, 194] as const, alpha: 0.44 },
  { count: 12, width: 2.8, rgb: [204, 116, 28] as const, alpha: 0.035 },
] as const;

const CRIMSON_EDGE: readonly [number, number, number] = [248, 54, 48];
const CRIMSON_HOT: readonly [number, number, number] = [255, 112, 92];

const WIRES_PER_SOCKET = 32;
const SOCKET_LEVEL: Record<SocketVisual, number> = { occupied: 1, open: 0.42, locked: 0.15 };
const BRAIN_ENERGY: Record<NexusBrainState, number> = { idle: 0.12, thinking: 1, responding: 0.72 };
const INTRO_SECONDS = 2.35;

const mixRgb = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
) => {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
};

const scaleFromCore = (pt: Vec, core: Vec, k: number): Vec => ({
  x: core.x + (pt.x - core.x) * k,
  y: core.y + (pt.y - core.y) * k,
});

function springReach(intro: number, stagger: number): number {
  const delayed = clamp((intro - stagger * 0.22) / (1 - stagger * 0.22), 0, 1);
  if (delayed <= 0) return 0.002;
  const cubic = 1 - Math.pow(1 - delayed, 3.3);
  const settle = Math.sin(delayed * Math.PI) * 0.035 * (1 - delayed);
  return clamp(cubic + settle, 0.002, 1);
}

function createField(socketCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261114);

  const ambient: Ambient[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const high = rnd() < 0.52;
      // Keep bottom-center negative space open while sweeping rays to the screen edges
      const lift = between(0.1, 0.78);
      ambient.push({
        bucket: bucketIndex,
        waist: { x: gauss() * 0.0055, y: gauss() * 0.0075 },
        sourceAngle: high ? -(Math.PI - lift) : Math.PI - lift * 0.82,
        sourceRadius: between(1.05, 1.92),
        sourceBend: gauss() * 0.38,
        arrivalAngle: (high ? 1 : -1) * between(0.1, 0.56),
        arrivalPull: between(0.2, 0.44),
        targetAngle: (rnd() < 0.52 ? -1 : 0.82) * between(0.08, 0.78),
        targetRadius: between(1.05, 1.92),
        departPull: between(0.2, 0.42),
        endBend: gauss() * 0.38,
        phase: rnd() * Math.PI * 2,
        stagger: rnd(),
      });
    }
  });

  const wires: Wire[] = [];
  for (let socket = 0; socket < socketCount; socket++) {
    for (let i = 0; i < WIRES_PER_SOCKET; i++) {
      wires.push({
        socket,
        bucket: i % 4,
        bendOut: gauss() * 0.46,
        bendIn: gauss() * 0.42,
        reach: between(0.3, 0.56),
        jitter: { x: gauss() * 0.011, y: gauss() * 0.011 },
        tailAngle: gauss() * 0.68,
        tailRadius: between(0.32, 0.82),
        phase: rnd() * Math.PI * 2,
        stagger: between(0.05, 0.65),
      });
    }
  }

  const pathCount = ambient.length + wires.length;
  const particles: Particle[] = Array.from({ length: 380 }, () => ({
    path: Math.floor(rnd() * pathCount),
    u: rnd(),
    speed: between(0.018, 0.052),
    size: between(0.5, 1.6),
    alpha: between(0.4, 0.98),
  }));

  const dust: Dust[] = Array.from({ length: 1450 }, () => ({
    path: Math.floor(rnd() * ambient.length),
    t: rnd(),
    offset: { x: gauss() * 0.032, y: gauss() * 0.032 },
    size: between(0.45, 1.4),
    alpha: between(0.28, 0.88),
    phase: rnd() * Math.PI * 2,
  }));

  return { ambient, wires, particles, dust };
}

function ambientPath(f: Ambient, L: StageLayout, time: number, intro: number): Vec[][] {
  const S = L.scale;
  const reach = springReach(intro, f.stagger);
  const swayA = Math.sin(time * 0.34 + f.phase);
  const swayB = Math.cos(time * 0.27 + f.phase * 1.3);
  const pinch = scaleFromCore(
    { x: L.core.x + f.waist.x * S, y: L.core.y + f.waist.y * S },
    L.core,
    reach,
  );
  const p0 = add(L.core, polar(f.sourceRadius * S * reach, f.sourceAngle + 0.045 * swayA));
  const c1 = add(p0, polar(f.sourceRadius * S * reach * 0.4, f.sourceAngle + Math.PI + f.sourceBend + 0.03 * swayB));
  const c2 = sub(pinch, polar(f.arrivalPull * S * reach, f.arrivalAngle + 0.06 * swayA));
  const target = f.targetAngle + 0.048 * swayB;
  const d1 = add(pinch, polar(f.departPull * S * reach, target * 0.6));
  const p3 = add(L.core, polar(f.targetRadius * S * reach, target));
  const d2 = sub(p3, polar(f.targetRadius * S * reach * 0.5, target + f.endBend - 0.03 * swayA));
  return [
    [p0, c1, c2, pinch],
    [pinch, d1, d2, p3],
  ];
}

function wirePath(w: Wire, L: StageLayout, time: number, intro: number): Vec[][] {
  const angle = L.socketAngles[w.socket]!;
  const socket = L.sockets[w.socket]!;
  const R = L.radius;
  const reach = springReach(intro, w.stagger * 0.7);
  const tailReach = springReach(intro, clamp(w.stagger + 0.2, 0, 1));
  const sway = Math.sin(time * 0.48 + w.phase);
  const harmonic = Math.cos(time * 0.31 + w.phase * 0.8);

  const endFull = { x: socket.x + w.jitter.x * R, y: socket.y + w.jitter.y * R };
  const end = scaleFromCore(endFull, L.core, reach);
  const c1 = add(L.core, polar(R * w.reach * reach, angle + w.bendOut + 0.065 * sway));
  const c2 = sub(end, polar(R * 0.35 * reach, angle + w.bendIn + 0.04 * harmonic));

  const tailAngle = angle + w.tailAngle + 0.075 * sway;
  const tipFull = add(socket, polar(R * w.tailRadius, tailAngle));
  const tip = scaleFromCore(tipFull, end, tailReach);
  const t1 = add(end, polar(R * 0.16 * tailReach, angle + 0.03 * harmonic));
  const t2 = sub(tip, polar(R * 0.14 * tailReach, tailAngle));

  return [
    [L.core, c1, c2, end],
    [end, t1, t2, tip],
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
    const socketCallHeat = signalRef.current.sockets.map(() => 0);
    const pulses: Array<{ socket: number; t: number; crimson: boolean }> = [];
    const ripples: Array<{ r: number; crimson: boolean }> = [];
    const sparks: Spark[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let energy = BRAIN_ENERGY[signalRef.current.brain];
    let edgeRedHeat = 0;
    let rippleClock = 0;
    let singularityShockwave = 0;
    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const triggerNodeCall = (targetSocket: number, crimson = true) => {
      edgeRedHeat = Math.max(edgeRedHeat, 1);
      if (targetSocket >= 0 && targetSocket < socketCount) {
        socketCallHeat[targetSocket] = 1;
        if (!reduceMotion) pulses.push({ socket: targetSocket, t: 0, crimson });
      } else {
        // Call all occupied nodes when Nexus queries the network
        signalRef.current.sockets.forEach((s, idx) => {
          if (s === "occupied") {
            socketCallHeat[idx] = 1;
            if (!reduceMotion) pulses.push({ socket: idx, t: idx * -0.12, crimson });
          }
        });
      }
      if (!reduceMotion) ripples.push({ r: 0, crimson });
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const { width, height, core, radius: R, scale: S } = layout;

      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const ease = 1 - Math.pow(1 - intro, 3);
      const follow = reduceMotion ? 1 : Math.min(1, dt * 3.2);

      // Detect brain transitions into thinking/responding -> ignite node call red edges
      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") {
          triggerNodeCall(activeSocket ?? -1, true);
        }
        lastBrain = brain;
      }

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        triggerNodeCall(snap.index, true);
      }

      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        const target = transfer.toSocket >= 0 ? transfer.toSocket : transfer.fromSocket;
        triggerNodeCall(target, true);
      }

      const isCallingNetwork =
        brain === "thinking" ||
        brain === "responding" ||
        (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0);

      const targetEdgeHeat = isCallingNetwork ? 1 : 0;
      edgeRedHeat = lerp(
        edgeRedHeat,
        targetEdgeHeat,
        reduceMotion ? 1 : dt * (targetEdgeHeat > edgeRedHeat ? 4.2 : 1.1),
      );

      energy = lerp(energy, BRAIN_ENERGY[brain], reduceMotion ? 1 : Math.min(1, dt * 2.8));

      sockets.forEach((s, i) => {
        levels[i] = lerp(levels[i] ?? 0, SOCKET_LEVEL[s], follow);
        const socketActive =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && s === "occupied");
        const targetSocketHeat = socketActive ? 1 : 0;
        socketCallHeat[i] = lerp(
          socketCallHeat[i] ?? 0,
          targetSocketHeat,
          reduceMotion ? 1 : dt * (targetSocketHeat > (socketCallHeat[i] ?? 0) ? 4.5 : 1.2),
        );
      });

      const thinking = brain === "thinking";
      const beat = thinking ? 0.5 + 0.5 * Math.sin(time * 7) : 0;
      const breathe = 1 + 0.055 * Math.sin(time * (0.65 + energy * 1.4)) + 0.1 * energy + 0.06 * beat;
      const lightRadius = S * 1.28 * (0.2 + 0.8 * ease) * (1 + 0.14 * energy);

      // 1. Pure Black Void (or Alabaster in Light Mode)
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#f7f7f8" : "#000000";
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = isLight ? "source-over" : "lighter";
      ctx.globalAlpha = Math.min(1, intro * 2.2);

      // 2. Core ambient golden aura (with subtle outer crimson rim when calling nodes)
      radialGlow(ctx, core, S * 0.58 * breathe * (0.25 + 0.75 * ease), [
        [0, isLight ? `rgba(218, 148, 22, ${0.22 + 0.08 * energy})` : `rgba(255, 192, 92, ${0.14 + 0.06 * energy})`],
        [
          0.45,
          edgeRedHeat > 0.02
            ? `rgba(${mixRgb([204, 116, 36], CRIMSON_EDGE, edgeRedHeat * 0.55)}, ${0.06 + 0.04 * edgeRedHeat})`
            : isLight
              ? "rgba(184, 118, 14, 0.08)"
              : "rgba(204, 116, 36, 0.05)",
        ],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      const ambient = field.ambient.map((f) => ambientPath(f, layout, time, intro));
      const wires = field.wires.map((w) => wirePath(w, layout, time, intro));

      // 3. Sweeping Lateral Filaments: Gold core & body, Crimson-Red trailing outer edges when calling nodes
      const gradientFor = (rgb: readonly [number, number, number], a: number) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, lightRadius);
        const baseColor = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
        const midEdgeColor = mixRgb(rgb, CRIMSON_HOT, edgeRedHeat * 0.78);
        const outerEdgeColor = mixRgb(rgb, CRIMSON_EDGE, edgeRedHeat * 0.96);
        const alphaMul = isLight ? 1.55 : 1;
        const effA = a * alphaMul;

        // Inner and middle network ALWAYS remain pure gold
        g.addColorStop(0, `rgba(${baseColor}, ${Math.min(1, effA * 2.5)})`);
        g.addColorStop(0.24, `rgba(${baseColor}, ${Math.min(1, effA * 1.3)})`);
        g.addColorStop(0.46, `rgba(${baseColor}, ${effA * 0.62})`);
        // Trailing outer edges shift to crimson red when calling nodes
        g.addColorStop(0.68, `rgba(${midEdgeColor}, ${effA * (0.36 + 0.38 * edgeRedHeat)})`);
        g.addColorStop(0.88, `rgba(${outerEdgeColor}, ${effA * (0.14 + 0.34 * edgeRedHeat)})`);
        g.addColorStop(1, `rgba(${outerEdgeColor}, 0)`);
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
        ctx.lineWidth = bucket.width * (isLight ? 1.15 : 1);
        ctx.strokeStyle = gradientFor(bucket.rgb, bucket.alpha * (0.65 + 0.45 * energy));
        ctx.stroke();
      });

      // 4. The 5 Crown Node Bundles: Gold trunks from core, Crimson-Red trailing plumes & node glow when called
      for (let socket = 0; socket < socketCount; socket++) {
        const level = levels[socket] ?? 0;
        const sHeat = Math.max(socketCallHeat[socket] ?? 0, edgeRedHeat * (sockets[socket] === "occupied" ? 0.85 : 0.3));
        const at = scaleFromCore(layout.sockets[socket]!, core, springReach(intro, 0.18));

        for (const bucketIndex of [0, 1, 2, 3]) {
          const bucket = BUCKETS[bucketIndex]!;
          const alpha = Math.min(1, bucket.alpha * 5.2 * level * (1 + 0.35 * energy + 0.45 * sHeat));

          // Segment 0: Core -> Socket trunk (remains rich Gold, warming slightly near the called socket)
          ctx.beginPath();
          field.wires.forEach((w, i) => {
            if (w.socket !== socket || w.bucket !== bucketIndex) return;
            const seg0 = wires[i]![0]!;
            ctx.moveTo(seg0[0]!.x, seg0[0]!.y);
            ctx.bezierCurveTo(seg0[1]!.x, seg0[1]!.y, seg0[2]!.x, seg0[2]!.y, seg0[3]!.x, seg0[3]!.y);
          });
          ctx.lineWidth = bucket.width * (0.92 + level * 0.62);
          if (sHeat > 0.02) {
            const trunkGrad = ctx.createLinearGradient(core.x, core.y, at.x, at.y);
            const goldStr = `${bucket.rgb[0]}, ${bucket.rgb[1]}, ${bucket.rgb[2]}`;
            const tipStr = mixRgb(bucket.rgb, CRIMSON_HOT, sHeat * 0.75);
            trunkGrad.addColorStop(0, `rgba(${goldStr}, ${alpha})`);
            trunkGrad.addColorStop(0.68, `rgba(${goldStr}, ${alpha})`);
            trunkGrad.addColorStop(1, `rgba(${tipStr}, ${Math.min(1, alpha * 1.15)})`);
            ctx.strokeStyle = trunkGrad;
          } else {
            ctx.strokeStyle = `rgba(${bucket.rgb[0]}, ${bucket.rgb[1]}, ${bucket.rgb[2]}, ${alpha})`;
          }
          ctx.stroke();

          // Segment 1: Socket -> Trailing fan tips (turns vivid Crimson-Red when calling nodes!)
          ctx.beginPath();
          field.wires.forEach((w, i) => {
            if (w.socket !== socket || w.bucket !== bucketIndex) return;
            const seg1 = wires[i]![1]!;
            ctx.moveTo(seg1[0]!.x, seg1[0]!.y);
            ctx.bezierCurveTo(seg1[1]!.x, seg1[1]!.y, seg1[2]!.x, seg1[2]!.y, seg1[3]!.x, seg1[3]!.y);
          });
          ctx.lineWidth = bucket.width * (0.85 + level * 0.55 + sHeat * 0.25);
          const fanColor = mixRgb(bucket.rgb, CRIMSON_EDGE, sHeat * 0.95);
          ctx.strokeStyle = `rgba(${fanColor}, ${Math.min(1, alpha * (1 + 0.35 * sHeat))})`;
          ctx.stroke();
        }

        // Node focal pinch glow (Gold at rest, Crimson-Gold flare when called)
        const nodeGlowColor = mixRgb([255, 214, 140], CRIMSON_EDGE, sHeat * 0.9);
        const nodeCoreColor = mixRgb([255, 248, 224], CRIMSON_HOT, sHeat * 0.65);
        radialGlow(ctx, at, R * (0.18 + 0.14 * level + 0.12 * sHeat), [
          [0, `rgba(${nodeCoreColor}, ${(0.42 + 0.45 * sHeat) * level})`],
          [0.35, `rgba(${nodeGlowColor}, ${(0.28 + 0.38 * sHeat) * level})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      // 5. Singularity wake-up shockwave & Speaking/Thinking ripples
      if (!reduceMotion && intro > 0.08 && singularityShockwave === 0) {
        singularityShockwave = 0.01;
        ripples.push({ r: 0.01, crimson: false });
      }

      if (!reduceMotion) {
        if (brain === "responding") {
          rippleClock -= dt;
          if (rippleClock <= 0) {
            ripples.push({ r: 0, crimson: true });
            rippleClock = 0.82;
          }
        } else {
          rippleClock = 0;
        }
        if (thinking && Math.random() < dt * 45) {
          sparks.push({
            angle: Math.random() * Math.PI * 2,
            radius: R * (0.75 + Math.random() * 0.65),
            t: 0,
            speed: 1.25 + Math.random(),
            crimson: Math.random() < 0.65,
          });
        }
      }

      ctx.lineWidth = 1.1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]!;
        rp.r += dt * 0.52;
        if (rp.r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = (1 - rp.r) * (1 - rp.r);
        const rippleRgb = rp.crimson ? mixRgb([255, 214, 150], CRIMSON_EDGE, Math.min(1, rp.r * 1.4)) : "255, 214, 150";
        ctx.strokeStyle = `rgba(${rippleRgb}, ${0.32 * fade})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.1 + rp.r * 1.35), 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.t += dt * s.speed;
        if (s.t >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const k = 1 - s.t * s.t;
        const p = add(core, polar(s.radius * k, s.angle + s.t * 0.6));
        ctx.fillStyle = s.crimson && k > 0.35 ? "rgb(255, 92, 76)" : "rgb(255, 236, 200)";
        ctx.globalAlpha = Math.sin(s.t * Math.PI) * 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = ease;

      // 6. The Singularity Core: Always brilliant white-hot Gold
      const singularityScale = intro < 0.25 ? 0.45 + intro * 2.2 : 1;
      radialGlow(ctx, core, S * 0.08 * breathe * singularityScale, [
        [0, "rgba(255, 253, 244, 1)"],
        [0.22, `rgba(255, 230, 168, ${0.72 + 0.24 * energy})`],
        [0.52, "rgba(250, 176, 70, 0.24)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // 7. Travelling Node Call Pulses along the wire bundles
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i]!;
        pulse.t += dt / 0.85;
        if (pulse.t < 0) continue;
        if (pulse.t >= 1.45) {
          pulses.splice(i, 1);
          continue;
        }
        const travel = Math.min(1, pulse.t);
        const lead = field.wires.findIndex((w) => w.socket === pulse.socket);
        if (lead < 0) continue;
        const pos = pointOnPath(wires[lead]!, travel * 0.78);
        const fade = pulse.t > 1 ? 1 - (pulse.t - 1) / 0.45 : 1;
        const pulseOuterRgb = pulse.crimson ? mixRgb([255, 200, 110], CRIMSON_EDGE, Math.min(1, travel * 1.25)) : "255, 200, 110";
        radialGlow(ctx, pos, R * 0.18, [
          [0, `rgba(255, 248, 228, ${0.96 * fade})`],
          [0.32, `rgba(${pulseOuterRgb}, ${0.48 * fade})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
        if (pulse.t > 0.7) {
          const sockPos = scaleFromCore(layout.sockets[pulse.socket]!, core, springReach(intro, 0.18));
          radialGlow(ctx, sockPos, R * 0.48 * fade, [
            [0, `rgba(${pulse.crimson ? "255, 76, 62" : "255, 220, 150"}, ${0.46 * fade})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }
      }

      // 8. Shimmering Stipple Dust & Flowing Photons (Gold in body, Crimson at trailing edges during node calls)
      const falloff = (p: Vec) => Math.max(0, 1 - Math.hypot(p.x - core.x, p.y - core.y) / lightRadius);

      for (const d of field.dust) {
        const base = pointOnPath(ambient[d.path]!.slice(1), d.t);
        const p = { x: base.x + d.offset.x * S * ease, y: base.y + d.offset.y * S * ease };
        const twinkle = 0.5 + 0.5 * Math.sin(time * 1.5 + d.phase);
        const distRatio = clamp(Math.hypot(p.x - core.x, p.y - core.y) / (lightRadius * 0.78), 0, 1);
        const isEdgeCrimson = edgeRedHeat > 0.05 && distRatio > 0.58;
        ctx.fillStyle = isEdgeCrimson
          ? `rgb(${mixRgb([255, 214, 140], CRIMSON_HOT, (distRatio - 0.58) * 2.4 * edgeRedHeat)})`
          : "rgb(255, 214, 140)";
        ctx.globalAlpha = ease * d.alpha * twinkle * Math.min(1, falloff(p) * 1.65);
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      const speedUp = 1 + 2.2 * energy;
      for (const p of field.particles) {
        const isWire = p.path >= ambient.length;
        const wireIndex = p.path - ambient.length;
        const sockIdx = isWire ? field.wires[wireIndex]!.socket : -1;
        const level = isWire ? (levels[sockIdx] ?? 0) : 1;
        if (!reduceMotion) p.u = (p.u + p.speed * dt * speedUp * (isWire ? 0.65 + level : 1)) % 1;
        const path = isWire ? wires[wireIndex]! : ambient[p.path]!;
        const pos = pointOnPath(path, p.u);
        const glow = isWire ? Math.max(0, level - 0.1) : Math.min(1, falloff(pos) * 1.75);

        const sHeat = isWire ? Math.max(socketCallHeat[sockIdx] ?? 0, edgeRedHeat * 0.8) : edgeRedHeat;
        const atTrailingEdge = isWire ? p.u > 0.52 : p.u < 0.22 || p.u > 0.78;
        ctx.fillStyle =
          sHeat > 0.05 && atTrailingEdge
            ? `rgb(${mixRgb([255, 240, 205], CRIMSON_HOT, sHeat)})`
            : "rgb(255, 240, 205)";

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
