"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  bezier,
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
  /** Source socket index (0..4), or -1 for the Central Core / Command trunk. */
  fromSocket: number;
  /** Target socket index (0..4), or -1 for the Central Core. */
  toSocket: number;
  /** Human-readable product/payload label shown on the travelling comet HUD. */
  label: string;
  /** Monotonic serial so each new transfer spawns a fresh comet stream. */
  serial: number;
};

export type StageSignal = {
  brain: NexusBrainState;
  sockets: SocketVisual[];
  /** Short display names/monograms for each socket arm on the canvas. */
  socketLabels?: Array<{ monogram: string; name: string; status: string }>;
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
  /** Optional explicit node-to-node product transfer animation trigger. */
  transfer?: StageTransfer | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
};

type BasinFilament = {
  bucket: number;
  isOuterVoid: boolean;
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
  sway: number;
};

type ArmFilament = {
  socket: number;
  bucket: number;
  waistJitter: Vec;
  elbowSpread: number;
  elbowLift: number;
  nodeJitter: Vec;
  featherSpread: number;
  featherCurl: number;
  featherReach: number;
  phase: number;
  sway: number;
};

type FlowParticle = {
  kind: "basin" | "arm";
  socket: number;
  pathIndex: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

type GalaxyDust = {
  kind: "basin" | "arm" | "void";
  socket: number;
  pathIndex: number;
  t: number;
  offset: Vec;
  size: number;
  alpha: number;
  phase: number;
};

type ActiveTransitionWave = {
  socket: number;
  mode: "ignite" | "extinguish";
  t: number;
};

type ActiveProductTransfer = {
  fromSocket: number;
  toSocket: number;
  label: string;
  t: number;
  coreRippled: boolean;
};

type Spark = { angle: number; radius: number; t: number; speed: number };

/**
 * Multi-bucket Laniakea palette:
 *   0 — Fine bright golden-amber streams
 *   1 — Medium warm supercluster gold
 *   2 — Wide soft amber atmospheric ribbons
 *   3 — Incandescent white-gold core hairs
 *   4 — Deep bronze-gold basin haze
 */
const BUCKETS = [
  { count: 68, width: 0.54, color: "255, 214, 136", alpha: 0.28 },
  { count: 50, width: 0.92, color: "246, 178, 68", alpha: 0.18 },
  { count: 30, width: 1.6, color: "228, 146, 42", alpha: 0.095 },
  { count: 40, width: 0.38, color: "255, 245, 214", alpha: 0.46 },
  { count: 14, width: 3.2, color: "198, 114, 28", alpha: 0.038 },
] as const;

const FILAMENTS_PER_ARM = 64;
const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.18,
  thinking: 1,
  responding: 0.72,
};
const INTRO_SECONDS = 2.2;

const AUTO_PRODUCTS = [
  "Daily Brief → Focus Guard",
  "Command → Daily Brief",
  "Focus Guard → Command",
  "Daily Brief → Core",
];

function createLaniakeaField(socketCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261114);

  // 1. Central Great Attractor Basin & Outer Void Filaments sweeping off-screen
  const basin: BasinFilament[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const isOuterVoid = rnd() < 0.22;
      const lane = rnd();
      // Distribute streams symmetrically across upper/lower left & right horizons
      // while leaving a calm cosmic corridor below center for voice typography
      const sourceAngle =
        lane < 0.34
          ? between(-2.85, -1.75) // upper-left cosmic inflow
          : lane < 0.68
            ? between(2.35, 3.05) // lower-left horizon tributary (balances Arm 4)
            : between(-1.35, -0.35); // upper-right stream
      const targetAngle =
        lane < 0.34
          ? between(-0.45, 0.55)
          : lane < 0.68
            ? between(0.25, 0.85)
            : between(2.45, 3.08);
      basin.push({
        bucket: bucketIndex,
        isOuterVoid,
        waist: { x: gauss() * 0.007, y: gauss() * 0.007 },
        sourceAngle,
        sourceRadius: between(0.95, 1.85),
        sourceBend: gauss() * 0.46,
        arrivalAngle: sourceAngle + Math.PI + gauss() * 0.28,
        arrivalPull: between(0.18, 0.42),
        targetAngle,
        targetRadius: between(0.95, 1.85),
        departPull: between(0.2, 0.44),
        endBend: gauss() * 0.44,
        phase: rnd() * Math.PI * 2,
        sway: between(0.75, 1.45),
      });
    }
  });

  // 2. Sweeping Laniakea Tributary Arms extending off the edges of the screen
  const arms: ArmFilament[] = [];
  for (let socket = 0; socket < socketCount; socket++) {
    for (let i = 0; i < FILAMENTS_PER_ARM; i++) {
      const u = (i / (FILAMENTS_PER_ARM - 1)) * 2 - 1; // -1 .. +1 across the feather fan
      arms.push({
        socket,
        bucket: i % 4,
        waistJitter: { x: gauss() * 0.005, y: gauss() * 0.005 },
        elbowSpread: u * 0.24 + gauss() * 0.07,
        elbowLift: gauss() * 0.1,
        nodeJitter: { x: gauss() * 0.012, y: gauss() * 0.012 },
        featherSpread: u * 0.72 + gauss() * 0.12,
        featherCurl: u * 0.44 + gauss() * 0.16,
        featherReach: between(1.15, 2.05) * (1 - Math.abs(u) * 0.14),
        phase: rnd() * Math.PI * 2,
        sway: between(0.7, 1.4),
      });
    }
  }

  // 3. Streaming Luminous Particles (520 flowing smoothly across edges)
  const particles: FlowParticle[] = [
    ...Array.from({ length: 160 }, () => ({
      kind: "basin" as const,
      socket: -1,
      pathIndex: Math.floor(rnd() * basin.length),
      u: rnd(),
      speed: between(0.016, 0.046),
      size: between(0.5, 1.75),
      alpha: between(0.35, 0.92),
    })),
    ...Array.from({ length: 360 }, (_, i) => {
      const armIdx = Math.floor(rnd() * arms.length);
      return {
        kind: "arm" as const,
        socket: arms[armIdx]?.socket ?? i % socketCount,
        pathIndex: armIdx,
        u: rnd(),
        speed: between(0.022, 0.062),
        size: between(0.5, 1.9),
        alpha: between(0.45, 0.98),
      };
    }),
  ];

  // 4. Galaxy-Cluster Stipple Dust (3,200 points clinging to filaments)
  const dust: GalaxyDust[] = [
    ...Array.from({ length: 1200 }, () => {
      const idx = Math.floor(rnd() * basin.length);
      const isVoid = basin[idx]?.isOuterVoid ?? false;
      return {
        kind: isVoid ? ("void" as const) : ("basin" as const),
        socket: -1,
        pathIndex: idx,
        t: Math.pow(rnd(), 0.78),
        offset: { x: gauss() * 0.028, y: gauss() * 0.028 },
        size: between(0.45, 1.45),
        alpha: between(0.28, 0.9),
        phase: rnd() * Math.PI * 2,
      };
    }),
    ...Array.from({ length: 2000 }, () => {
      const idx = Math.floor(rnd() * arms.length);
      return {
        kind: "arm" as const,
        socket: arms[idx]?.socket ?? 0,
        pathIndex: idx,
        t: Math.pow(rnd(), 0.76),
        offset: { x: gauss() * 0.02, y: gauss() * 0.02 },
        size: between(0.45, 1.55),
        alpha: between(0.32, 0.95),
        phase: rnd() * Math.PI * 2,
      };
    }),
  ];

  return { basin, arms, particles, dust };
}

function buildBasinPath(f: BasinFilament, L: StageLayout, time: number): Vec[][] {
  const S = L.scale;
  const swayA = Math.sin(time * 0.28 + f.phase) * f.sway;
  const swayB = Math.cos(time * 0.19 + f.phase * 1.37) * f.sway;
  const pinch = { x: L.core.x + f.waist.x * S, y: L.core.y + f.waist.y * S };
  const p0 = add(L.core, polar(f.sourceRadius * S, f.sourceAngle + 0.035 * swayA));
  const c1 = add(p0, polar(f.sourceRadius * S * 0.42, f.sourceAngle + Math.PI + f.sourceBend + 0.025 * swayB));
  const c2 = sub(pinch, polar(f.arrivalPull * S, f.arrivalAngle + 0.04 * swayA));
  const target = f.targetAngle + 0.045 * swayB;
  const d1 = add(pinch, polar(f.departPull * S, target * 0.65 + 0.03 * swayA));
  const p3 = add(L.core, polar(f.targetRadius * S, target));
  const d2 = sub(p3, polar(f.targetRadius * S * 0.45, target + f.endBend + 0.03 * swayA));
  return [
    [p0, c1, c2, pinch],
    [pinch, d1, d2, p3],
  ];
}

/**
 * Builds a continuous 2-segment Laniakea Supercluster arm filament:
 *   Segment 0 (Main Spine): Core Great Attractor -> Sweeping Elbow -> Socket Attractor
 *   Segment 1 (Watershed Feather): G1-tangent-continuous plume sweeping off the screen edge
 */
function buildArmPath(w: ArmFilament, L: StageLayout, time: number): Vec[][] {
  const socket = L.sockets[w.socket]!;
  const elbow = L.socketElbows[w.socket]!;
  const baseFanAngle = L.socketAngles[w.socket]!;
  const R = L.radius;
  const S = L.scale;
  const swayA = Math.sin(time * 0.34 + w.phase) * w.sway;
  const swayB = Math.cos(time * 0.22 + w.phase * 1.37) * w.sway;

  const start = {
    x: L.core.x + w.waistJitter.x * R,
    y: L.core.y + w.waistJitter.y * R,
  };
  const nodeAt = {
    x: socket.x + w.nodeJitter.x * R,
    y: socket.y + w.nodeJitter.y * R,
  };

  const spineAngle = Math.atan2(nodeAt.y - start.y, nodeAt.x - start.x);
  const perpAngle = spineAngle + Math.PI / 2;

  const c1 = add(
    elbow,
    add(
      polar(R * (w.elbowSpread + 0.03 * swayA), perpAngle),
      polar(R * (w.elbowLift + 0.025 * swayB), spineAngle),
    ),
  );
  const c2 = sub(
    nodeAt,
    polar(R * 0.28, spineAngle - w.elbowSpread * 0.48 + 0.035 * swayA),
  );

  // Collinear incoming tangent at nodeAt prevents any sharp kink at the socket
  const incomingAngle = Math.atan2(nodeAt.y - c2.y, nodeAt.x - c2.x);
  const featherAngle = baseFanAngle + w.featherSpread + 0.05 * swayB;
  const tipReach = S * w.featherReach;
  const tip = add(nodeAt, polar(tipReach, featherAngle + w.featherCurl * 0.42 + 0.03 * swayA));
  const f1 = add(nodeAt, polar(tipReach * 0.28, incomingAngle));
  const f2 = sub(tip, polar(tipReach * 0.38, featherAngle + w.featherCurl - 0.03 * swayB));

  return [
    [start, c1, c2, nodeAt],
    [nodeAt, f1, f2, tip],
  ];
}

/** Exact centreline spine for a socket arm (used by travelling product comets). */
function buildArmCenterSpine(socketIdx: number, L: StageLayout): [Vec, Vec, Vec, Vec] {
  const start = L.core;
  const elbow = L.socketElbows[socketIdx] ?? L.core;
  const end = L.sockets[socketIdx] ?? L.core;
  const spineAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const c1 = elbow;
  const c2 = sub(end, polar(L.radius * 0.26, spineAngle));
  return [start, c1, c2, end];
}

/** Smooth continuation of an arm spine past its socket and off the viewport edge. */
function buildArmOuterSpine(socketIdx: number, L: StageLayout, time: number): [Vec, Vec, Vec, Vec] {
  const [, , c2, end] = buildArmCenterSpine(socketIdx, L);
  const incomingAngle = Math.atan2(end.y - c2.y, end.x - c2.x);
  const fanAngle = L.socketAngles[socketIdx] ?? incomingAngle;
  const sway = Math.sin(time * 0.26 + socketIdx * 1.4);
  const reach = L.scale * 1.4;
  const tip = add(end, polar(reach, fanAngle + 0.03 * sway));
  const f1 = add(end, polar(reach * 0.26, incomingAngle));
  const f2 = sub(tip, polar(reach * 0.35, fanAngle - 0.02 * sway));
  return [end, f1, f2, tip];
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

    const field = createLaniakeaField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Continuous illumination level per arm: 1.0 = blazing connected, 0.0 = dark disconnected
    const armLevels: number[] = signalRef.current.sockets.map((s) => (s === "occupied" ? 1 : 0));
    const prevStates: SocketVisual[] = [...signalRef.current.sockets];
    const transitionWaves: ActiveTransitionWave[] = [];
    const transfers: ActiveProductTransfer[] = [];
    const ripples: number[] = [0.2];
    const sparks: Spark[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let energy = BRAIN_ENERGY[signalRef.current.brain];
    let rippleClock = 0;
    let autoTransferClock = 1.6;
    let autoProductIdx = 0;
    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const spawnTransfer = (fromSocket: number, toSocket: number, label: string) => {
      if (reduceMotion) return;
      transfers.push({
        fromSocket,
        toSocket,
        label,
        t: 0,
        coreRippled: false,
      });
    };

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer } = signalRef.current;
      const { width, height, core, spineJunction, radius: R, scale: S } = layout;
      const intro = reduceMotion ? 1 : Math.min(1, time / INTRO_SECONDS);
      const ease = 1 - Math.pow(1 - intro, 3);
      const follow = reduceMotion ? 1 : Math.min(1, dt * 2.8);

      energy = lerp(energy, BRAIN_ENERGY[brain], reduceMotion ? 1 : Math.min(1, dt * 2.5));

      // Detect socket connect / disconnect transitions to fire Laniakea arm waves
      sockets.forEach((state, i) => {
        const prev = prevStates[i];
        if (prev !== state) {
          prevStates[i] = state;
          if (!reduceMotion) {
            if (state === "occupied") {
              transitionWaves.push({ socket: i, mode: "ignite", t: 0 });
              ripples.push(0);
            } else if (prev === "occupied") {
              transitionWaves.push({ socket: i, mode: "extinguish", t: 0 });
            }
          }
        }
        const targetLevel = state === "occupied" ? 1 : 0;
        armLevels[i] = lerp(armLevels[i] ?? targetLevel, targetLevel, follow);
      });

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        if (!reduceMotion) {
          transitionWaves.push({ socket: snap.index, mode: "ignite", t: 0 });
          spawnTransfer(-1, snap.index, "Node connected");
        }
      }

      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        spawnTransfer(transfer.fromSocket, transfer.toSocket, transfer.label);
      }

      // Periodic autonomous product transfers between currently connected arms so the supercluster feels alive
      if (!reduceMotion) {
        const occupiedIndices = sockets
          .map((s, idx) => (s === "occupied" ? idx : -1))
          .filter((idx) => idx >= 0);

        autoTransferClock -= dt;
        if (autoTransferClock <= 0) {
          autoTransferClock = 4.6;
          if (occupiedIndices.length >= 2) {
            const fromPick = occupiedIndices[autoProductIdx % occupiedIndices.length]!;
            const toPick = occupiedIndices[(autoProductIdx + 1) % occupiedIndices.length]!;
            const labels = signalRef.current.socketLabels;
            const fromName = labels?.[fromPick]?.name;
            const toName = labels?.[toPick]?.name;
            const label =
              fromName && toName
                ? `${fromName} → ${toName}`
                : AUTO_PRODUCTS[autoProductIdx % AUTO_PRODUCTS.length]!;
            autoProductIdx++;
            spawnTransfer(fromPick, toPick, label);
          } else if (occupiedIndices.length === 1) {
            const only = occupiedIndices[0]!;
            const onlyName = signalRef.current.socketLabels?.[only]?.name;
            const label = onlyName
              ? `Command → ${onlyName}`
              : AUTO_PRODUCTS[autoProductIdx % AUTO_PRODUCTS.length]!;
            autoProductIdx++;
            spawnTransfer(-1, only, label);
          }
        }
      }

      const thinking = brain === "thinking";
      const beat = thinking ? 0.5 + 0.5 * Math.sin(time * 6.5) : 0;
      const breathe = 1 + 0.045 * Math.sin(time * (0.55 + energy * 1.2)) + 0.08 * energy + 0.05 * beat;
      const edgeRadius = Math.hypot(width, height) * 0.74 * (0.65 + 0.35 * ease) * (1 + 0.08 * energy);

      // 1. Deep Cosmic Background
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#010205";
      ctx.fillRect(0, 0, width, height);

      // Subtle symmetrical deep-space indigo vignette in outer void
      radialGlow(ctx, { x: width * 0.16, y: height * 0.16 }, S * 0.65, [
        [0, "rgba(26, 42, 78, 0.14)"],
        [0.6, "rgba(10, 16, 32, 0.05)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
      radialGlow(ctx, { x: width * 0.84, y: height * 0.16 }, S * 0.65, [
        [0, "rgba(22, 36, 68, 0.12)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = ease;

      // 2. Warm Amber-Gold Laniakea Basin Envelope (expands into connected arms, retracts from dark arms)
      radialGlow(ctx, core, S * 0.52 * breathe, [
        [0, `rgba(255, 198, 92, ${0.2 + 0.06 * energy})`],
        [0.34, "rgba(212, 132, 34, 0.09)"],
        [0.72, "rgba(128, 72, 14, 0.028)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      radialGlow(ctx, spineJunction, R * 0.72 * breathe, [
        [0, "rgba(255, 204, 108, 0.12)"],
        [0.5, "rgba(196, 118, 28, 0.04)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      for (let s = 0; s < socketCount; s++) {
        const level = armLevels[s] ?? 0;
        const at = layout.sockets[s]!;
        const elbow = layout.socketElbows[s]!;
        if (level > 0.02) {
          // Connected arm: warm golden-amber Laniakea nebula lobe
          radialGlow(ctx, elbow, R * 0.58 * level, [
            [0, `rgba(238, 162, 52, ${0.1 * level})`],
            [0.6, `rgba(175, 98, 22, ${0.032 * level})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
          radialGlow(ctx, at, R * (0.4 + 0.18 * level), [
            [0, `rgba(255, 224, 152, ${0.26 * level})`],
            [0.4, `rgba(232, 152, 44, ${0.08 * level})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        } else {
          // Disconnected arm: cold, dim void trace
          radialGlow(ctx, at, R * 0.24, [
            [0, "rgba(110, 138, 182, 0.04)"],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }
      }

      const basinPaths = field.basin.map((f) => buildBasinPath(f, layout, time));
      const armPaths = field.arms.map((w) => buildArmPath(w, layout, time));

      const gradientFor = (color: string, a: number) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeRadius);
        g.addColorStop(0, `rgba(${color}, ${Math.min(1, a * 2.2)})`);
        g.addColorStop(0.28, `rgba(${color}, ${Math.min(1, a * 1.2)})`);
        g.addColorStop(0.68, `rgba(${color}, ${a * 0.42})`);
        g.addColorStop(1, `rgba(${color}, ${a * 0.04})`);
        return g;
      };

      const armGradientFor = (color: string, a: number, centerBright = 1.15) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, edgeRadius);
        g.addColorStop(0, `rgba(${color}, ${Math.min(1, a * centerBright)})`);
        g.addColorStop(0.32, `rgba(${color}, ${Math.min(1, a)})`);
        g.addColorStop(0.72, `rgba(${color}, ${a * 0.48})`);
        g.addColorStop(1, `rgba(${color}, ${a * 0.06})`);
        return g;
      };

      // 3. Draw Outer Void Ghost Filaments (cool slate-silver cosmic web off to edges)
      ctx.beginPath();
      field.basin.forEach((f, i) => {
        if (!f.isOuterVoid) return;
        const [inc, out] = basinPaths[i]!;
        ctx.moveTo(inc![0]!.x, inc![0]!.y);
        for (const [, b, c, d] of [inc!, out!]) {
          ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
        }
      });
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = armGradientFor("138, 164, 208", 0.12, 0.85);
      ctx.stroke();

      // 4. Draw Central Great Attractor Golden Basin Filaments
      BUCKETS.forEach((bucket, bucketIndex) => {
        ctx.beginPath();
        field.basin.forEach((f, i) => {
          if (f.isOuterVoid || f.bucket !== bucketIndex) return;
          const [inc, out] = basinPaths[i]!;
          ctx.moveTo(inc![0]!.x, inc![0]!.y);
          for (const [, b, c, d] of [inc!, out!]) {
            ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
          }
        });
        ctx.lineWidth = bucket.width;
        ctx.strokeStyle = gradientFor(bucket.color, bucket.alpha * (0.64 + 0.36 * energy));
        ctx.stroke();
      });

      // 5. Draw the 5 Laniakea Supercluster Arms (Sweeping past viewport edges with radial tapering)
      for (let s = 0; s < socketCount; s++) {
        const level = armLevels[s] ?? 0;
        const visualState = sockets[s] ?? "locked";
        const dormantAlpha = visualState === "open" ? 0.14 : 0.065;

        // 5a. If arm is dark or mid-transition, render its cool dormant cosmic skeleton out to screen edges
        if (level < 0.96) {
          const darkStrength = (1 - level) * dormantAlpha;
          ctx.beginPath();
          field.arms.forEach((w, i) => {
            if (w.socket !== s || w.bucket > 1) return;
            const segments = armPaths[i]!;
            ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
            for (const [, b, c, d] of segments) {
              ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
            }
          });
          ctx.lineWidth = 0.55;
          ctx.strokeStyle = armGradientFor("132, 156, 198", darkStrength, 0.9);
          ctx.stroke();
        }

        // 5b. Connected golden Laniakea arm + feathery watershed filaments streaming off screen edges
        if (level > 0.01) {
          for (const bucketIndex of [0, 1, 2, 3]) {
            const bucket = BUCKETS[bucketIndex]!;
            ctx.beginPath();
            field.arms.forEach((w, i) => {
              if (w.socket !== s || w.bucket !== bucketIndex) return;
              const segments = armPaths[i]!;
              ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
              for (const [, b, c, d] of segments) {
                ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
              }
            });
            ctx.lineWidth = bucket.width * (0.85 + level * 0.68);
            const alpha = Math.min(1, bucket.alpha * 3.8 * level * (1 + 0.25 * energy));
            ctx.strokeStyle = armGradientFor(bucket.color, alpha, 1.25);
            ctx.stroke();
          }

          // Blazing incandescent white-gold spine flowing through the socket and tapering off-screen
          const [p0, c1, c2, p3] = buildArmCenterSpine(s, layout);
          const [, f1, f2, tip] = buildArmOuterSpine(s, layout, time);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
          ctx.bezierCurveTo(f1.x, f1.y, f2.x, f2.y, tip.x, tip.y);
          ctx.lineWidth = 1.95 * level;
          ctx.strokeStyle = armGradientFor("255, 246, 218", 0.7 * level, 1.1);
          ctx.stroke();
        }

        // 5c. Socket Attractor Locus Star
        const at = layout.sockets[s]!;
        if (level > 0.05) {
          radialGlow(ctx, at, R * 0.088 * (0.7 + 0.3 * level), [
            [0, `rgba(255, 253, 245, ${0.98 * level})`],
            [0.28, `rgba(255, 222, 152, ${0.72 * level})`],
            [0.65, `rgba(240, 172, 58, ${0.22 * level})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        } else {
          // Dark node locus: faint pinpoint ring in the void
          ctx.beginPath();
          ctx.arc(at.x, at.y, 3, 0, Math.PI * 2);
          ctx.strokeStyle =
            visualState === "open" ? "rgba(165, 188, 225, 0.42)" : "rgba(120, 138, 168, 0.22)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 6. Connect Ignition & Disconnect Extinction Waves Sweeping Along Arms
      for (let i = transitionWaves.length - 1; i >= 0; i--) {
        const wave = transitionWaves[i]!;
        wave.t += dt / 1.05;
        if (wave.t >= 1.35) {
          transitionWaves.splice(i, 1);
          continue;
        }
        const leadIdx = field.arms.findIndex((w) => w.socket === wave.socket);
        if (leadIdx < 0) continue;
        const u = clamp(wave.mode === "ignite" ? wave.t : 1 - wave.t, 0, 0.999);
        const pos = pointOnPath(armPaths[leadIdx]!, u);
        const fade = wave.t > 1 ? 1 - (wave.t - 1) / 0.35 : 1;

        radialGlow(ctx, pos, R * 0.24, [
          [
            0,
            wave.mode === "ignite"
              ? `rgba(255, 252, 238, ${0.96 * fade})`
              : `rgba(160, 190, 235, ${0.65 * fade})`,
          ],
          [
            0.35,
            wave.mode === "ignite"
              ? `rgba(255, 204, 108, ${0.42 * fade})`
              : `rgba(95, 125, 175, ${0.22 * fade})`,
          ],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      // 7. Speaking Ripples & Thinking Sparks around the Great Attractor Core
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
        if (thinking && Math.random() < dt * 42) {
          sparks.push({
            angle: Math.random() * Math.PI * 2,
            radius: R * (0.65 + Math.random() * 0.55),
            t: 0,
            speed: 1.2 + Math.random(),
          });
        }
      }

      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (!reduceMotion) ripples[i]! += dt * 0.52;
        const r = ripples[i]!;
        if (r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 220, 155, ${0.28 * (1 - r) * (1 - r)})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.1 + r * 0.95), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgb(255, 238, 204)";
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
        ctx.arc(p.x, p.y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = ease;

      // 8. Blazing Great Attractor Core Nucleus
      radialGlow(ctx, core, R * 0.24 * breathe, [
        [0, "rgba(255, 254, 246, 1)"],
        [0.18, `rgba(255, 232, 175, ${0.82 + 0.16 * energy})`],
        [0.48, "rgba(250, 182, 72, 0.28)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // 9. Galaxy-Cluster Stipple Dust (Warm Gold in Connected Arms, Faint Cool Slate in Dark Arms)
      const falloff = (p: Vec) =>
        clamp(1 - Math.hypot(p.x - core.x, p.y - core.y) / (edgeRadius * 1.05), 0.06, 1);

      for (const d of field.dust) {
        let base: Vec;
        let armLvl = 1;
        if (d.kind === "arm") {
          armLvl = armLevels[d.socket] ?? 0;
          base = pointOnPath(armPaths[d.pathIndex]!, d.t);
        } else {
          base = pointOnPath(basinPaths[d.pathIndex]!, d.t);
        }

        const p = { x: base.x + d.offset.x * S * 0.45, y: base.y + d.offset.y * S * 0.45 };
        const twinkle = 0.45 + 0.55 * Math.sin(time * 1.5 + d.phase);
        const edgeFade = falloff(p);

        if (d.kind === "void" || (d.kind === "arm" && armLvl < 0.15)) {
          ctx.fillStyle = "rgb(142, 168, 212)";
          ctx.globalAlpha = ease * d.alpha * twinkle * 0.16 * edgeFade;
        } else {
          ctx.fillStyle = "rgb(255, 224, 158)";
          const weight = d.kind === "arm" ? armLvl * Math.min(1, edgeFade * 1.35) : Math.min(1, edgeFade * 1.5);
          ctx.globalAlpha = ease * d.alpha * twinkle * weight;
        }
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      // 10. Streaming Golden Particles Flowing Continuously Off-Screen
      const speedUp = 1 + 1.8 * energy;
      ctx.fillStyle = "rgb(255, 244, 214)";
      for (const p of field.particles) {
        const isArm = p.kind === "arm";
        const level = isArm ? (armLevels[p.socket] ?? 0) : 0.85;
        if (isArm && level < 0.06) continue;

        if (!reduceMotion) {
          p.u = (p.u + p.speed * dt * speedUp * (isArm ? 0.6 + level * 0.8 : 1)) % 1;
        }
        const path = isArm ? armPaths[p.pathIndex]! : basinPaths[p.pathIndex]!;
        const pos = pointOnPath(path, p.u);
        const glow = isArm
          ? level * Math.min(1, falloff(pos) * 1.45)
          : Math.min(1, falloff(pos) * 1.65);
        ctx.globalAlpha = ease * p.alpha * glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 11. Node-to-Node Fluid Golden Transfer Pulses
      for (let i = transfers.length - 1; i >= 0; i--) {
        const tr = transfers[i]!;
        tr.t += dt / 2.25;
        if (tr.t >= 1.2) {
          transfers.splice(i, 1);
          continue;
        }

        const hasInboundLeg = tr.fromSocket >= 0 && tr.fromSocket < socketCount;
        const hasOutboundLeg = tr.toSocket >= 0 && tr.toSocket < socketCount;

        const pointAtProgress = (progress: number): Vec => {
          const u = clamp(progress, 0, 1);
          if (hasInboundLeg && hasOutboundLeg) {
            if (u < 0.5) {
              const [a, b, c, d] = buildArmCenterSpine(tr.fromSocket, layout);
              return bezier(d, c, b, a, u * 2);
            }
            const [a, b, c, d] = buildArmCenterSpine(tr.toSocket, layout);
            return bezier(a, b, c, d, (u - 0.5) * 2);
          }
          if (hasOutboundLeg) {
            const [a, b, c, d] = buildArmCenterSpine(tr.toSocket, layout);
            return bezier(a, b, c, d, u);
          }
          if (hasInboundLeg) {
            const [a, b, c, d] = buildArmCenterSpine(tr.fromSocket, layout);
            return bezier(d, c, b, a, u);
          }
          return core;
        };

        if (tr.t >= 0.5 && !tr.coreRippled) {
          tr.coreRippled = true;
          ripples.push(0);
        }

        const fade = tr.t > 1 ? 1 - (tr.t - 1) / 0.2 : 1;
        const head = pointAtProgress(Math.min(1, tr.t));

        // Fluid 22-segment tapered golden wake
        for (let tail = 22; tail >= 1; tail--) {
          const tailU = Math.max(0, Math.min(1, tr.t) - tail * 0.011);
          const pt = pointAtProgress(tailU);
          const tailFactor = Math.pow(1 - tail / 23, 1.5) * fade;
          ctx.fillStyle = `rgba(255, 224, 152, ${0.42 * tailFactor})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 0.9 + 2.9 * tailFactor, 0, Math.PI * 2);
          ctx.fill();
        }

        // Soft multi-layered light pulse head
        radialGlow(ctx, head, R * 0.2, [
          [0, `rgba(255, 255, 248, ${0.98 * fade})`],
          [0.24, `rgba(255, 224, 148, ${0.68 * fade})`],
          [0.62, `rgba(240, 172, 58, ${0.22 * fade})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);

        // Arrival burst at destination node
        if (tr.t > 0.88 && hasOutboundLeg) {
          const dest = layout.sockets[tr.toSocket]!;
          radialGlow(ctx, dest, R * 0.34 * fade, [
            [0, `rgba(255, 244, 205, ${0.6 * fade})`],
            [0.45, `rgba(240, 181, 74, ${0.2 * fade})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }

        // Minimal, borderless floating soft-gold label gliding cleanly above the pulse
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = fade * 0.88;
        ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        const labelX = clamp(head.x, 76, width - 76);
        const labelY = clamp(head.y - 18, 22, height - 22);
        const tw = ctx.measureText(tr.label).width;

        // Soft dark backdrop halo (no hard border box)
        const halo = ctx.createRadialGradient(
          labelX,
          labelY - 3,
          2,
          labelX,
          labelY - 3,
          tw * 0.68 + 16,
        );
        halo.addColorStop(0, "rgba(1, 2, 5, 0.82)");
        halo.addColorStop(1, "rgba(1, 2, 5, 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(labelX - tw, labelY - 22, tw * 2, 34);

        ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "rgba(253, 236, 200, 0.94)";
        ctx.fillText(tr.label, labelX, labelY);
        ctx.restore();
        ctx.globalCompositeOperation = "lighter";
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
