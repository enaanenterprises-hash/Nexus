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
  { count: 66, width: 0.52, color: "255, 212, 132", alpha: 0.28 },
  { count: 48, width: 0.88, color: "246, 178, 68", alpha: 0.18 },
  { count: 28, width: 1.55, color: "228, 146, 42", alpha: 0.1 },
  { count: 38, width: 0.36, color: "255, 244, 212", alpha: 0.48 },
  { count: 14, width: 3.1, color: "198, 114, 28", alpha: 0.04 },
] as const;

const FILAMENTS_PER_ARM = 52;
const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.18,
  thinking: 1,
  responding: 0.72,
};
const INTRO_SECONDS = 2.2;

const AUTO_PRODUCTS = [
  "command.purchase · $42.10",
  "nexus.context · focus sync",
  "studio.transcript · 8 cards",
  "research.source · highlight",
  "daily.brief · 3 tasks",
];

function createLaniakeaField(socketCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261114);

  // 1. Central Great Attractor Basin & Outer Void Filaments
  const basin: BasinFilament[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const isOuterVoid = rnd() < 0.24;
      const fromUpper = rnd() < 0.52;
      const lift = between(0.15, 1.15);
      basin.push({
        bucket: bucketIndex,
        isOuterVoid,
        waist: { x: gauss() * 0.008, y: gauss() * 0.009 },
        sourceAngle: fromUpper ? -(Math.PI - lift * 0.85) : Math.PI - lift * 0.75,
        sourceRadius: isOuterVoid ? between(0.85, 1.65) : between(0.48, 1.12),
        sourceBend: gauss() * 0.48,
        arrivalAngle: (fromUpper ? 1 : -1) * between(0.08, 0.58),
        arrivalPull: between(0.16, 0.4),
        targetAngle: between(-0.42, 1.25),
        targetRadius: isOuterVoid ? between(0.8, 1.55) : between(0.45, 1.05),
        departPull: between(0.18, 0.42),
        endBend: gauss() * 0.45,
        phase: rnd() * Math.PI * 2,
        sway: between(0.65, 1.35),
      });
    }
  });

  // 2. Sweeping Laniakea Tributary Arms (one bundle per Node Socket)
  const arms: ArmFilament[] = [];
  for (let socket = 0; socket < socketCount; socket++) {
    for (let i = 0; i < FILAMENTS_PER_ARM; i++) {
      const u = (i / (FILAMENTS_PER_ARM - 1)) * 2 - 1; // -1 .. +1 across the feather fan
      arms.push({
        socket,
        bucket: i % 4,
        waistJitter: { x: gauss() * 0.006, y: gauss() * 0.006 },
        elbowSpread: u * 0.22 + gauss() * 0.08,
        elbowLift: gauss() * 0.12,
        nodeJitter: { x: gauss() * 0.014, y: gauss() * 0.014 },
        featherSpread: u * 0.92 + gauss() * 0.14,
        featherCurl: u * 0.48 + gauss() * 0.18,
        featherReach: between(0.28, 0.74) * (1 - Math.abs(u) * 0.28),
        phase: rnd() * Math.PI * 2,
      });
    }
  }

  // 3. Streaming Luminous Particles (along basin and along each socket arm)
  const particles: FlowParticle[] = [
    ...Array.from({ length: 140 }, () => ({
      kind: "basin" as const,
      socket: -1,
      pathIndex: Math.floor(rnd() * basin.length),
      u: rnd(),
      speed: between(0.014, 0.042),
      size: between(0.45, 1.45),
      alpha: between(0.35, 0.92),
    })),
    ...Array.from({ length: 320 }, (_, i) => {
      const armIdx = Math.floor(rnd() * arms.length);
      return {
        kind: "arm" as const,
        socket: arms[armIdx]?.socket ?? i % socketCount,
        pathIndex: armIdx,
        u: rnd(),
        speed: between(0.024, 0.068),
        size: between(0.55, 1.75),
        alpha: between(0.45, 0.98),
      };
    }),
  ];

  // 4. Galaxy-Cluster Stipple Dust (3,000 points clinging to basin, arms, and outer void)
  const dust: GalaxyDust[] = [
    ...Array.from({ length: 1100 }, () => {
      const idx = Math.floor(rnd() * basin.length);
      const isVoid = basin[idx]?.isOuterVoid ?? false;
      return {
        kind: isVoid ? ("void" as const) : ("basin" as const),
        socket: -1,
        pathIndex: idx,
        t: Math.pow(rnd(), 0.78),
        offset: { x: gauss() * 0.032, y: gauss() * 0.032 },
        size: between(0.45, 1.45),
        alpha: between(0.28, 0.92),
        phase: rnd() * Math.PI * 2,
      };
    }),
    ...Array.from({ length: 1900 }, () => {
      const idx = Math.floor(rnd() * arms.length);
      return {
        kind: "arm" as const,
        socket: arms[idx]?.socket ?? 0,
        pathIndex: idx,
        t: Math.pow(rnd(), 0.82),
        offset: { x: gauss() * 0.024, y: gauss() * 0.024 },
        size: between(0.45, 1.55),
        alpha: between(0.32, 0.96),
        phase: rnd() * Math.PI * 2,
      };
    }),
  ];

  return { basin, arms, particles, dust };
}

function buildBasinPath(f: BasinFilament, L: StageLayout, time: number): Vec[][] {
  const S = L.scale;
  const sway = Math.sin(time * 0.22 + f.phase) * f.sway;
  const pinch = { x: L.core.x + f.waist.x * S, y: L.core.y + f.waist.y * S };
  const p0 = add(L.core, polar(f.sourceRadius * S, f.sourceAngle + 0.03 * sway));
  const c1 = add(p0, polar(f.sourceRadius * S * 0.38, f.sourceAngle + Math.PI + f.sourceBend));
  const c2 = sub(pinch, polar(f.arrivalPull * S, f.arrivalAngle + 0.04 * sway));
  const target = f.targetAngle + 0.04 * Math.sin(time * 0.18 + f.phase * 1.3);
  const d1 = add(pinch, polar(f.departPull * S, target * 0.45));
  const p3 = add(L.core, polar(f.targetRadius * S, target));
  const d2 = sub(p3, polar(f.targetRadius * S * 0.48, target + f.endBend));
  return [
    [p0, c1, c2, pinch],
    [pinch, d1, d2, p3],
  ];
}

/**
 * Builds a 2-segment Laniakea Supercluster arm filament:
 *   Segment 0 (Main Spine): Core Great Attractor -> Sweeping Elbow -> Socket Attractor
 *   Segment 1 (Watershed Feather): Socket Attractor -> Curling Feathery Tributary Tip
 */
function buildArmPath(w: ArmFilament, L: StageLayout, time: number): Vec[][] {
  const socket = L.sockets[w.socket]!;
  const elbow = L.socketElbows[w.socket]!;
  const baseFanAngle = L.socketAngles[w.socket]!;
  const R = L.radius;
  const sway = Math.sin(time * 0.28 + w.phase);

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
      polar(R * w.elbowSpread, perpAngle),
      polar(R * (w.elbowLift + 0.025 * sway), spineAngle),
    ),
  );
  const c2 = sub(
    nodeAt,
    polar(R * 0.28, spineAngle - w.elbowSpread * 0.55 + 0.03 * sway),
  );

  // Feathery watershed plume fanning out beyond the socket attractor
  const featherAngle = baseFanAngle + w.featherSpread + 0.04 * sway;
  const tipReach = R * w.featherReach;
  const tip = add(nodeAt, polar(tipReach, featherAngle + w.featherCurl * 0.45));
  const f1 = add(nodeAt, polar(tipReach * 0.38, spineAngle * 0.35 + featherAngle * 0.65));
  const f2 = sub(tip, polar(tipReach * 0.36, featherAngle + w.featherCurl));

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
          spawnTransfer(-1, snap.index, "nexus.wire · socket online");
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
            const label = AUTO_PRODUCTS[autoProductIdx % AUTO_PRODUCTS.length]!;
            autoProductIdx++;
            spawnTransfer(fromPick, toPick, label);
          } else if (occupiedIndices.length === 1) {
            const only = occupiedIndices[0]!;
            const label = AUTO_PRODUCTS[autoProductIdx % AUTO_PRODUCTS.length]!;
            autoProductIdx++;
            spawnTransfer(-1, only, label);
          }
        }
      }

      const thinking = brain === "thinking";
      const beat = thinking ? 0.5 + 0.5 * Math.sin(time * 6.5) : 0;
      const breathe = 1 + 0.045 * Math.sin(time * (0.55 + energy * 1.2)) + 0.08 * energy + 0.05 * beat;
      const lightRadius = S * 1.08 * (0.6 + 0.4 * ease) * (1 + 0.1 * energy);

      // 1. Deep Cosmic Background
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#010205";
      ctx.fillRect(0, 0, width, height);

      // Subtle deep-space indigo vignette in outer void (matches Laniakea outer cosmos)
      radialGlow(ctx, { x: width * 0.22, y: height * 0.18 }, S * 0.72, [
        [0, "rgba(26, 42, 78, 0.14)"],
        [0.6, "rgba(10, 16, 32, 0.05)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
      radialGlow(ctx, { x: width * 0.82, y: height * 0.74 }, S * 0.68, [
        [0, "rgba(22, 36, 68, 0.12)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = ease;

      // 2. Warm Amber-Gold Laniakea Basin Envelope (expands into connected arms, retracts from dark arms)
      radialGlow(ctx, core, S * 0.54 * breathe, [
        [0, `rgba(255, 192, 82, ${0.18 + 0.06 * energy})`],
        [0.32, "rgba(212, 132, 34, 0.09)"],
        [0.68, "rgba(128, 72, 14, 0.03)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      radialGlow(ctx, spineJunction, R * 0.92 * breathe, [
        [0, "rgba(255, 204, 108, 0.13)"],
        [0.48, "rgba(196, 118, 28, 0.045)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      for (let s = 0; s < socketCount; s++) {
        const level = armLevels[s] ?? 0;
        const at = layout.sockets[s]!;
        const elbow = layout.socketElbows[s]!;
        if (level > 0.02) {
          // Connected arm: warm golden-amber Laniakea nebula lobe
          radialGlow(ctx, elbow, R * 0.62 * level, [
            [0, `rgba(238, 162, 52, ${0.11 * level})`],
            [0.6, `rgba(175, 98, 22, ${0.035 * level})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
          radialGlow(ctx, at, R * (0.42 + 0.18 * level), [
            [0, `rgba(255, 222, 148, ${0.28 * level})`],
            [0.38, `rgba(232, 152, 44, ${0.09 * level})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        } else {
          // Disconnected arm: cold, dim void shadow with a faint slate-blue trace
          radialGlow(ctx, at, R * 0.28, [
            [0, "rgba(110, 138, 182, 0.045)"],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }
      }

      const basinPaths = field.basin.map((f) => buildBasinPath(f, layout, time));
      const armPaths = field.arms.map((w) => buildArmPath(w, layout, time));

      const gradientFor = (color: string, a: number) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, lightRadius);
        g.addColorStop(0, `rgba(${color}, ${Math.min(1, a * 2.5)})`);
        g.addColorStop(0.24, `rgba(${color}, ${a * 1.3})`);
        g.addColorStop(0.62, `rgba(${color}, ${a * 0.45})`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        return g;
      };

      // 3. Draw Outer Void Ghost Filaments (cool slate-silver like upper-left of Laniakea photo)
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
      ctx.strokeStyle = "rgba(138, 164, 208, 0.11)";
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
        ctx.strokeStyle = gradientFor(bucket.color, bucket.alpha * (0.68 + 0.38 * energy));
        ctx.stroke();
      });

      // 5. Draw the 5 Laniakea Supercluster Arms (Bright Golden when Connected, Dark Slate Skeleton when Disconnected)
      for (let s = 0; s < socketCount; s++) {
        const level = armLevels[s] ?? 0;
        const visualState = sockets[s] ?? "locked";
        const dormantAlpha = visualState === "open" ? 0.13 : 0.055;

        // 5a. If arm is dark or mid-transition, render its cool dormant cosmic skeleton
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
          ctx.strokeStyle = `rgba(132, 156, 198, ${darkStrength})`;
          ctx.stroke();
        }

        // 5b. Connected golden Laniakea arm + feathery watershed tips
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
            ctx.lineWidth = bucket.width * (0.85 + level * 0.72);
            const alpha = Math.min(1, bucket.alpha * 4.8 * level * (1 + 0.25 * energy));
            ctx.strokeStyle = `rgba(${bucket.color}, ${alpha})`;
            ctx.stroke();
          }

          // Blazing incandescent white-gold core spine along the centre of a connected arm
          const [p0, c1, c2, p3] = buildArmCenterSpine(s, layout);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
          ctx.lineWidth = 2.1 * level;
          ctx.strokeStyle = `rgba(255, 248, 224, ${0.72 * level})`;
          ctx.stroke();
        }

        // 5c. Socket Attractor Locus Star
        const at = layout.sockets[s]!;
        if (level > 0.05) {
          radialGlow(ctx, at, R * 0.095 * (0.7 + 0.3 * level), [
            [0, `rgba(255, 253, 245, ${0.98 * level})`],
            [0.28, `rgba(255, 222, 152, ${0.72 * level})`],
            [0.65, `rgba(240, 172, 58, ${0.22 * level})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        } else {
          // Dark node locus: faint pinpoint ring in the void
          ctx.beginPath();
          ctx.arc(at.x, at.y, 3.2, 0, Math.PI * 2);
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
        ctx.arc(core.x, core.y, R * (0.1 + r * 1.05), 0, Math.PI * 2);
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
      radialGlow(ctx, core, S * 0.088 * breathe, [
        [0, "rgba(255, 254, 246, 1)"],
        [0.18, `rgba(255, 232, 175, ${0.82 + 0.16 * energy})`],
        [0.46, "rgba(250, 182, 72, 0.28)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // 9. Galaxy-Cluster Stipple Dust (Warm Gold in Connected Arms, Faint Cool Slate in Dark Arms)
      const falloff = (p: Vec) =>
        Math.max(0, 1 - Math.hypot(p.x - core.x, p.y - core.y) / (lightRadius * 1.15));

      for (const d of field.dust) {
        let base: Vec;
        let armLvl = 1;
        if (d.kind === "arm") {
          armLvl = armLevels[d.socket] ?? 0;
          base = pointOnPath(armPaths[d.pathIndex]!, d.t);
        } else {
          base = pointOnPath(basinPaths[d.pathIndex]!, d.t);
        }

        const p = { x: base.x + d.offset.x * S, y: base.y + d.offset.y * S };
        const twinkle = 0.45 + 0.55 * Math.sin(time * 1.5 + d.phase);

        if (d.kind === "void" || (d.kind === "arm" && armLvl < 0.15)) {
          ctx.fillStyle = "rgb(142, 168, 212)";
          ctx.globalAlpha = ease * d.alpha * twinkle * 0.16;
        } else {
          ctx.fillStyle = "rgb(255, 224, 158)";
          const weight = d.kind === "arm" ? armLvl : Math.min(1, falloff(p) * 1.5);
          ctx.globalAlpha = ease * d.alpha * twinkle * weight;
        }
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      // 10. Streaming Golden Particles Along Connected Filaments
      const speedUp = 1 + 1.8 * energy;
      ctx.fillStyle = "rgb(255, 244, 214)";
      for (const p of field.particles) {
        const isArm = p.kind === "arm";
        const level = isArm ? (armLevels[p.socket] ?? 0) : 0.85;
        if (isArm && level < 0.06) continue;

        if (!reduceMotion) {
          p.u = (p.u + p.speed * dt * speedUp * (isArm ? 0.55 + level * 0.75 : 1)) % 1;
        }
        const path = isArm ? armPaths[p.pathIndex]! : basinPaths[p.pathIndex]!;
        const pos = pointOnPath(path, p.u);
        const glow = isArm ? level : Math.min(1, falloff(pos) * 1.65);
        ctx.globalAlpha = ease * p.alpha * glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 11. Node-to-Node Product Transfer Comets & Floating Telemetry Callouts
      for (let i = transfers.length - 1; i >= 0; i--) {
        const tr = transfers[i]!;
        tr.t += dt / 2.35;
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
              // Reverse from Socket -> Core
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

        // Glowing multi-segment comet tail
        for (let tail = 14; tail >= 1; tail--) {
          const tailU = Math.max(0, Math.min(1, tr.t) - tail * 0.014);
          const pt = pointAtProgress(tailU);
          const tailFactor = (1 - tail / 15) * fade;
          ctx.fillStyle = `rgba(255, 224, 152, ${0.55 * tailFactor})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.2 + 2.8 * tailFactor, 0, Math.PI * 2);
          ctx.fill();
        }

        // Blazing comet nucleus
        radialGlow(ctx, head, R * 0.16, [
          [0, `rgba(255, 255, 248, ${0.98 * fade})`],
          [0.28, `rgba(255, 220, 140, ${0.68 * fade})`],
          [0.65, `rgba(240, 172, 58, ${0.22 * fade})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);

        // Arrival burst at destination node
        if (tr.t > 0.88 && hasOutboundLeg) {
          const dest = layout.sockets[tr.toSocket]!;
          radialGlow(ctx, dest, R * 0.38 * fade, [
            [0, `rgba(255, 244, 205, ${0.65 * fade})`],
            [0.45, `rgba(240, 181, 74, ${0.22 * fade})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        }

        // Crisp Astronomical Telemetry Tag gliding beside the product comet
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = fade * 0.94;
        ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const textWidth = ctx.measureText(tr.label).width;
        const pillW = textWidth + 22;
        const pillH = 22;
        const pillX = clamp(head.x + 14, 12, width - pillW - 12);
        const pillY = clamp(head.y - 28, 16, height - pillH - 16);

        // Pinpoint leader line from comet head to pill
        ctx.strokeStyle = "rgba(240, 181, 74, 0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(head.x, head.y);
        ctx.lineTo(pillX + 6, pillY + pillH / 2);
        ctx.stroke();

        // Glassmorphic pill background
        ctx.fillStyle = "rgba(8, 6, 4, 0.88)";
        ctx.strokeStyle = "rgba(240, 181, 74, 0.72)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 11);
        ctx.fill();
        ctx.stroke();

        // Gold status dot + label
        ctx.fillStyle = "#f0b54a";
        ctx.beginPath();
        ctx.arc(pillX + 9, pillY + pillH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fff4dc";
        ctx.fillText(tr.label, pillX + 16, pillY + 14.5);
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
