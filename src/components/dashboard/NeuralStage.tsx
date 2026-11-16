"use client";

import { useEffect, useRef } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import {
  add,
  clamp,
  fitCanvas,
  lerp,
  polar,
  radialGlow,
  type Vec,
} from "@/lib/network/geometry";
import {
  computeStageLayout,
  type ArmGeometry,
  type StageLayout,
} from "./stage-layout";

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
  /** Explicit node-to-node information transfer trigger. */
  transfer?: StageTransfer | null;
  /** Currently opened or called socket index (0..4), if any. */
  activeSocket?: number | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
};

/* ============================================================================
   MATHEMATICAL CONSTANTS, TIMING & SPECTRAL PALETTE
   ============================================================================ */

type Rgb = readonly [number, number, number];

/**
 * Phase I (0.00s -> 1.60s): Screen is 100% pitch black (#000000) with ZERO neural
 * network present while "Waking up Nexus…" is displayed.
 * Phase II (1.60s+): Singularity pops and springs outward via 2nd-order ODE.
 */
const WAKE_SILENCE_SECONDS = 1.6;
const SPRING_ZETA = 0.74;
const SPRING_OMEGA_N = 4.8;
const SPRING_OMEGA_D = SPRING_OMEGA_N * Math.sqrt(1 - SPRING_ZETA * SPRING_ZETA);

const STRANDS_PER_ARM = 36;
const HORIZON_RIBBON_STRANDS = 24;

const GOLD_SPECULAR: Rgb = [255, 246, 218];
const GOLD_PRIMARY: Rgb = [250, 194, 88];
const GOLD_AMBER: Rgb = [232, 152, 46];
const GOLD_DEEP: Rgb = [196, 114, 28];

const GOLD_LIGHT_SPEC: Rgb = [156, 92, 8];
const GOLD_LIGHT_PRI: Rgb = [188, 118, 14];
const GOLD_LIGHT_AMB: Rgb = [142, 82, 6];

const CRIMSON_CORAL: Rgb = [255, 102, 74];
const CRIMSON_PURE: Rgb = [248, 42, 40];
const CRIMSON_DEEP: Rgb = [184, 18, 28];

/**
 * Disconnected nodes ('open' or 'locked') drop to near-zero luminance so they
 * read as genuinely DARK. Only connected ('occupied') nodes light up (1.0).
 */
const TARGET_CONNECTION_LEVEL: Record<SocketVisual, number> = {
  occupied: 1.0,
  open: 0.032,
  locked: 0.016,
};

const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.14,
  thinking: 1.0,
  responding: 0.72,
};

const STRATIFIED_WEIGHTS = [
  { width: 0.45, alpha: 0.34, colorMix: 1.0 }, // Inner specular core strands (|eta| <= 0.28)
  { width: 0.72, alpha: 0.22, colorMix: 0.55 }, // Mid flowing primary strands (0.28 < |eta| <= 0.68)
  { width: 1.05, alpha: 0.12, colorMix: 0.0 }, // Outer silk envelope strands (|eta| > 0.68)
] as const;

const mixRgb = (a: Rgb, b: Rgb, t: number): string => {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
};

const mixRgbTuple = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(a[0], b[0], k)),
    Math.round(lerp(a[1], b[1], k)),
    Math.round(lerp(a[2], b[2], k)),
  ];
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ============================================================================
   DETERMINISTIC MATHEMATICAL FOLIATION STRUCTURES
   ============================================================================ */

type FoliationStrand = {
  arm: number;
  weightTier: 0 | 1 | 2;
  /** Deterministic normalized laminar coordinate in [-1, +1]. */
  eta: number;
  /** Stagger delay (seconds) for the singularity spring-to-life pop. */
  staggerDelay: number;
};

type HorizonStrand = {
  weightTier: 0 | 1 | 2;
  eta: number;
  staggerDelay: number;
};

/**
 * Represents an information/file transfer wave propagating along the flowing lines
 * from `fromSocket` (or Core = -1) to `toSocket`, turning the active segment of the
 * flowing lines crimson red.
 */
type InfoFlowWave = {
  fromSocket: number;
  toSocket: number;
  /** Progress s in [0, 1] along the full transfer trajectory. */
  s: number;
  speed: number;
};

/**
 * Represents a snap-in connection ignition wave sweeping from Core (u = 0) to
 * the outer trailing edges (u = 1), flaring the trailing edges crimson red.
 */
type ConnectIgniteWave = {
  socket: number;
  u: number;
};

function createDeterministicFoliation(socketCount: number) {
  const armStrands: FoliationStrand[] = [];
  const armTierBatches: number[][][] = Array.from({ length: socketCount }, () => [
    [],
    [],
    [],
  ]);

  for (let arm = 0; arm < socketCount; arm++) {
    for (let i = 0; i < STRANDS_PER_ARM; i++) {
      const eta = (2 * i) / (STRANDS_PER_ARM - 1) - 1; // Strictly ordered in [-1, +1]
      const absEta = Math.abs(eta);
      const weightTier: 0 | 1 | 2 =
        absEta <= 0.28 ? 0 : absEta <= 0.68 ? 1 : 2;
      const staggerDelay = absEta * 0.16 + Math.abs(arm - 2) * 0.035;
      const idx = armStrands.length;
      armStrands.push({ arm, weightTier, eta, staggerDelay });
      armTierBatches[arm]![weightTier]!.push(idx);
    }
  }

  const horizonStrands: HorizonStrand[] = [];
  const horizonTierBatches: number[][] = [[], [], []];
  for (let i = 0; i < HORIZON_RIBBON_RIBBON_COUNT; i++) {
    const eta = (2 * i) / (HORIZON_RIBBON_RIBBON_COUNT - 1) - 1;
    const absEta = Math.abs(eta);
    const weightTier: 0 | 1 | 2 =
      absEta <= 0.28 ? 0 : absEta <= 0.68 ? 1 : 2;
    const staggerDelay = 0.06 + absEta * 0.18;
    const idx = horizonStrands.length;
    horizonStrands.push({ weightTier, eta, staggerDelay });
    horizonTierBatches[weightTier]!.push(idx);
  }

  return { armStrands, armTierBatches, horizonStrands, horizonTierBatches };
}

const HORIZON_RIBBON_RIBBON_COUNT = HORIZON_RIBBON_STRANDS;

/* ============================================================================
   SECOND-ORDER SPRING ODE & G1/C2 STREAMLINE GEOMETRY
   ============================================================================ */

/**
 * Exact analytical solution to the 2nd-order underdamped harmonic oscillator:
 *   r'' + 2 * zeta * omega_n * r' + omega_n^2 * (r - 1) = 0
 * Produces a physical pop and spring-to-life expansion from the singularity (r = 0).
 */
function evaluateSingularitySpring(activeTime: number, staggerDelay: number): number {
  const tau = activeTime - staggerDelay;
  if (tau <= 0) return 0;
  const decay = Math.exp(-SPRING_ZETA * SPRING_OMEGA_N * tau);
  const sinTerm = (SPRING_ZETA / Math.sqrt(1 - SPRING_ZETA * SPRING_ZETA)) * Math.sin(SPRING_OMEGA_D * tau);
  const cosTerm = Math.cos(SPRING_OMEGA_D * tau);
  return Math.max(0, 1 - decay * (cosTerm + sinTerm));
}

const scaleFromOrigin = (pt: Vec, origin: Vec, factor: number): Vec => ({
  x: origin.x + (pt.x - origin.x) * factor,
  y: origin.y + (pt.y - origin.y) * factor,
});

/**
 * Evaluates the exact G1-collinear 2-segment cubic Bezier streamline for strand `s`
 * on arm `armGeom`:
 *   Segment 0 (Inner Spindle): Core -> Node Waist (compresses to 3.0px laminar waist)
 *   Segment 1 (Outer Plume):   Node Waist -> Safe Corner Boundary (collinear tangent)
 */
function evaluateArmStreamline(
  s: FoliationStrand,
  armGeom: ArmGeometry,
  L: StageLayout,
  time: number,
  springReach: number,
): [
  [Vec, Vec, Vec, Vec],
  [Vec, Vec, Vec, Vec],
] {
  const { core, leftSafeX, rightSafeX } = L;
  const { eta } = s;
  const absEta = Math.abs(eta);

  // Coherent laminar wave phase: varies smoothly with eta so strands never cross chaotically
  const omega = 0.44;
  const phase = armGeom.index * 1.15 + eta * 1.1;
  const waveA = Math.sin(omega * time + phase);
  const waveB = Math.cos(omega * 0.78 * time - phase * 0.85);

  const coreNormal = {
    x: -Math.sin(armGeom.coreAngle),
    y: Math.cos(armGeom.coreAngle),
  };

  // 1. Core Origin (tight 1.8px singularity waist)
  const wCore = 1.8 * springReach;
  const p0: Vec = {
    x: core.x + eta * wCore * coreNormal.x,
    y: core.y + eta * wCore * coreNormal.y,
  };

  // 2. Node Waist Locus (tight 3.0px laminar waist at Socket_a)
  const socketUnfurled = scaleFromOrigin(armGeom.socket, core, springReach);
  const wWaist = 3.0 * Math.min(1, springReach);
  const swayWaist = 2.2 * Math.sin(omega * 0.65 * time + armGeom.index) * Math.min(1, springReach);
  const waistPt: Vec = {
    x: socketUnfurled.x + (eta * wWaist + swayWaist) * armGeom.waistNormal.x,
    y: socketUnfurled.y + (eta * wWaist + swayWaist) * armGeom.waistNormal.y,
  };

  // 3. Inner Spindle Controls (symmetric lens swell between Core and Node Waist)
  const spanIn = armGeom.innerSpan * springReach;
  const bellySpreadAngle = armGeom.coreAngle + eta * 0.165 + 0.024 * waveA;
  const c1 = add(core, polar(spanIn * 0.42, bellySpreadAngle));

  const convergeAngle = armGeom.waistAngle - eta * 0.075 + 0.018 * waveB;
  const c2: Vec = {
    x: waistPt.x - Math.cos(convergeAngle) * spanIn * 0.34,
    y: waistPt.y - Math.sin(convergeAngle) * spanIn * 0.34,
  };

  // 4. Outer Plume Controls (100% collinear tangent vector leaving waistPt)
  const inDx = waistPt.x - c2.x;
  const inDy = waistPt.y - c2.y;
  const inLen = Math.hypot(inDx, inDy) || 1;
  const tInX = inDx / inLen;
  const tInY = inDy / inLen;

  const spanOut = armGeom.outerSpan * springReach * (1 - 0.06 * eta * eta);
  const f1: Vec = {
    x: waistPt.x + tInX * spanOut * 0.3,
    y: waistPt.y + tInY * spanOut * 0.3,
  };

  // Smooth laminar fan angle toward the corners
  const fanDelta = eta * (0.24 + 0.04 * absEta) + 0.032 * waveA;
  const fanAngle = armGeom.outerAngle + fanDelta;

  const rawF2 = add(waistPt, polar(spanOut * 0.66, fanAngle - eta * 0.05));
  const rawTip = add(waistPt, polar(spanOut, fanAngle));

  // Strictly enforce left-sidebar and right-rail negative-space boundaries
  const f2: Vec = {
    x: clamp(rawF2.x, leftSafeX + 8, rightSafeX - 8),
    y: rawF2.y,
  };
  const tip: Vec = {
    x: clamp(rawTip.x, leftSafeX + 4, rightSafeX - 4),
    y: rawTip.y,
  };

  return [
    [p0, c1, c2, waistPt],
    [waistPt, f1, f2, tip],
  ];
}

/**
 * Evaluates a clean, laminar cross-core horizon ribbon strand that sweeps gently
 * into the left and right mid-upper space while staying strictly inside
 * [leftSafeX + 20, rightSafeX - 20] so it never touches the left sidebar or right rail.
 */
function evaluateHorizonStreamline(
  h: HorizonStrand,
  L: StageLayout,
  time: number,
  springReach: number,
): [
  [Vec, Vec, Vec, Vec],
  [Vec, Vec, Vec, Vec],
] {
  const { core, leftSafeX, rightSafeX, radius: R } = L;
  const { eta } = h;
  const waveA = Math.sin(time * 0.36 + eta * 1.2);
  const waveB = Math.cos(time * 0.28 - eta * 1.1);

  const waist: Vec = {
    x: core.x,
    y: core.y + eta * 2.4 * Math.min(1, springReach),
  };

  const maxLeftSpan = Math.max(80, (core.x - (leftSafeX + 26)) * 0.94) * springReach;
  const maxRightSpan = Math.max(80, (rightSafeX - 26 - core.x) * 0.94) * springReach;

  // Gentle upward-arching wing angles (-162..-132 deg left, -18..-48 deg right)
  const leftAngle = -Math.PI + 0.36 + eta * 0.22 + 0.025 * waveA;
  const rightAngle = -0.36 - eta * 0.22 + 0.025 * waveB;

  const pLeft: Vec = {
    x: clamp(core.x + Math.cos(leftAngle) * maxLeftSpan, leftSafeX + 24, core.x),
    y: core.y + Math.sin(leftAngle) * maxLeftSpan,
  };
  const pRight: Vec = {
    x: clamp(core.x + Math.cos(rightAngle) * maxRightSpan, core.x, rightSafeX - 24),
    y: core.y + Math.sin(rightAngle) * maxRightSpan,
  };

  const bridgeTilt = eta * 0.14 + 0.02 * waveA;
  const pull = Math.min(maxLeftSpan, maxRightSpan, R * 1.1) * 0.36;
  const tX = Math.cos(bridgeTilt) * pull;
  const tY = Math.sin(bridgeTilt) * pull;

  const cLeft1 = add(pLeft, polar(maxLeftSpan * 0.36, leftAngle + Math.PI - eta * 0.12));
  const cLeft2: Vec = { x: waist.x - tX, y: waist.y - tY };

  const cRight1: Vec = { x: waist.x + tX, y: waist.y + tY };
  const cRight2 = add(pRight, polar(maxRightSpan * 0.36, rightAngle + Math.PI + eta * 0.12));

  return [
    [pLeft, cLeft1, cLeft2, waist],
    [waist, cRight1, cRight2, pRight],
  ];
}

/* ============================================================================
   COMPONENT
   ============================================================================ */

export function NeuralStage({
  signal,
  onSelectSocket,
  className = "",
}: {
  signal: StageSignal;
  onSelectSocket?: (socketIndex: number) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signalRef = useRef(signal);
  const onSelectRef = useRef(onSelectSocket);
  const redrawRef = useRef<(() => void) | null>(null);
  const socketCount = signal.sockets.length;

  useEffect(() => {
    signalRef.current = signal;
    onSelectRef.current = onSelectSocket;
    redrawRef.current?.();
  }, [signal, onSelectSocket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createDeterministicFoliation(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Continuous connection illumination per arm (1.0 when connected, ~0.02 dark when disconnected)
    const connectionLevels: number[] = signalRef.current.sockets.map(
      (s) => TARGET_CONNECTION_LEVEL[s],
    );
    // Trailing-edge crimson intensity per arm (flares when a node is connected)
    const edgeCrimsonLevels: number[] = signalRef.current.sockets.map((s) =>
      s === "occupied" ? 0.65 : 0,
    );
    const prevSocketStates: SocketVisual[] = [...signalRef.current.sockets];

    const infoWaves: InfoFlowWave[] = [];
    const igniteWaves: ConnectIgniteWave[] = [];

    let lastSnapSerial = signalRef.current.snap?.serial ?? 0;
    let lastTransferSerial = signalRef.current.transfer?.serial ?? 0;
    let lastBrain: NexusBrainState = signalRef.current.brain;
    let lastActiveSocket: number | null = signalRef.current.activeSocket ?? null;

    let energy = BRAIN_ENERGY[signalRef.current.brain];
    let autoFlowClock = 4.2;
    let autoFlowCounter = 0;
    let layout = computeStageLayout(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;

    const spawnInfoWave = (fromSocket: number, toSocket: number, speed = 0.56) => {
      if (reduceMotion) return;
      infoWaves.push({
        fromSocket,
        toSocket,
        s: 0,
        speed,
      });
    };

    const onClick = (e: MouseEvent) => {
      if (!onSelectRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const clickPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      for (let i = 0; i < layout.sockets.length; i++) {
        const sock = layout.sockets[i]!;
        if (Math.hypot(clickPt.x - sock.x, clickPt.y - sock.y) <= 26) {
          spawnInfoWave(-1, i, 0.68);
          edgeCrimsonLevels[i] = 1.0;
          onSelectRef.current(i);
          return;
        }
      }
    };

    canvas.addEventListener("click", onClick);

    const draw = (time: number, dt: number) => {
      const { brain, sockets, snap, transfer, activeSocket, theme } = signalRef.current;
      const isLight = (theme ?? "dark") === "light";
      const L = layout;
      const { width, height, core, radius: R } = L;

      // ——— 1. Pure Background ———
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = isLight ? "#f7f7f8" : "#000000";
      ctx.fillRect(0, 0, width, height);

      // ——— 2. Phase I Opening Silence (t < 1.60s): Neural network is NOT present at all ———
      if (!reduceMotion && time < WAKE_SILENCE_SECONDS) {
        return;
      }

      const activeTime = reduceMotion ? 10 : Math.max(0, time - WAKE_SILENCE_SECONDS);
      const coreSpring = reduceMotion ? 1 : evaluateSingularitySpring(activeTime, 0);
      const masterAlpha = reduceMotion ? 1 : clamp(activeTime / 0.32, 0, 1);

      energy = lerp(
        energy,
        BRAIN_ENERGY[brain],
        reduceMotion ? 1 : 1 - Math.exp(-dt * 2.8),
      );

      // Detect node connect / disconnect transitions
      sockets.forEach((state, i) => {
        const prev = prevSocketStates[i];
        if (prev !== state) {
          prevSocketStates[i] = state;
          if (state === "occupied") {
            edgeCrimsonLevels[i] = 1.0;
            if (!reduceMotion) igniteWaves.push({ socket: i, u: 0 });
          }
        }

        const targetLevel = TARGET_CONNECTION_LEVEL[state];
        const rate = targetLevel > (connectionLevels[i] ?? 0) ? 3.2 : 3.8;
        connectionLevels[i] = lerp(
          connectionLevels[i] ?? targetLevel,
          targetLevel,
          reduceMotion ? 1 : 1 - Math.exp(-dt * rate),
        );

        // Connected arms maintain a subtle crimson transition near their outer trailing edges (0.58),
        // flaring to 1.0 when newly connected or called
        const isArmCalled =
          activeSocket === i || ((brain === "thinking" || brain === "responding") && state === "occupied");
        const targetCrimsonEdge =
          state === "occupied" ? (isArmCalled ? 1.0 : 0.62) : 0;
        edgeCrimsonLevels[i] = lerp(
          edgeCrimsonLevels[i] ?? 0,
          targetCrimsonEdge,
          reduceMotion ? 1 : 1 - Math.exp(-dt * (targetCrimsonEdge > (edgeCrimsonLevels[i] ?? 0) ? 4.5 : 1.4)),
        );
      });

      // Spawn crimson information waves along the lines when Nexus thinks/responds or routes between nodes
      if (brain !== lastBrain) {
        if (brain === "thinking" || brain === "responding") {
          sockets.forEach((s, idx) => {
            if (s === "occupied") {
              edgeCrimsonLevels[idx] = 1.0;
              spawnInfoWave(-1, idx, 0.64);
            }
          });
        }
        lastBrain = brain;
      }

      if ((activeSocket ?? null) !== lastActiveSocket) {
        if (activeSocket !== null && activeSocket !== undefined && activeSocket >= 0) {
          edgeCrimsonLevels[activeSocket] = 1.0;
          spawnInfoWave(-1, activeSocket, 0.68);
        }
        lastActiveSocket = activeSocket ?? null;
      }

      if (snap && snap.serial !== lastSnapSerial) {
        lastSnapSerial = snap.serial;
        edgeCrimsonLevels[snap.index] = 1.0;
        if (!reduceMotion) igniteWaves.push({ socket: snap.index, u: 0 });
      }

      if (transfer && transfer.serial !== lastTransferSerial) {
        lastTransferSerial = transfer.serial;
        spawnInfoWave(transfer.fromSocket, transfer.toSocket, 0.58);
      }

      // Periodic information flow between connected nodes so you see crimson data waves flowing through the lines
      if (!reduceMotion && activeTime > 2.2) {
        const occupied = sockets
          .map((s, idx) => (s === "occupied" ? idx : -1))
          .filter((idx) => idx >= 0);
        autoFlowClock -= dt;
        if (autoFlowClock <= 0) {
          autoFlowClock = 5.0;
          if (occupied.length >= 2) {
            const fromIdx = occupied[autoFlowCounter % occupied.length]!;
            const toIdx = occupied[(autoFlowCounter + 1) % occupied.length]!;
            autoFlowCounter++;
            spawnInfoWave(fromIdx, toIdx, 0.52);
          } else if (occupied.length === 1) {
            autoFlowCounter++;
            spawnInfoWave(-1, occupied[0]!, 0.54);
          }
        }
      }

      // Advance active waves
      for (let i = infoWaves.length - 1; i >= 0; i--) {
        const w = infoWaves[i]!;
        if (!reduceMotion) w.s += w.speed * dt;
        if (w.s >= 1.15) infoWaves.splice(i, 1);
      }
      for (let i = igniteWaves.length - 1; i >= 0; i--) {
        const iw = igniteWaves[i]!;
        if (!reduceMotion) iw.u += dt * 0.92;
        if (iw.u >= 1.2) igniteWaves.splice(i, 1);
      }

      const goldSpec = isLight ? GOLD_LIGHT_SPEC : GOLD_SPECULAR;
      const goldPri = isLight ? GOLD_LIGHT_PRI : GOLD_PRIMARY;
      const goldAmb = isLight ? GOLD_LIGHT_AMB : GOLD_AMBER;
      const goldDeep = isLight ? GOLD_LIGHT_AMB : GOLD_DEEP;
      const blendOp: GlobalCompositeOperation = isLight ? "source-over" : "lighter";
      const alphaMul = (isLight ? 1.4 : 1.0) * masterAlpha;

      ctx.globalCompositeOperation = blendOp;
      ctx.globalAlpha = masterAlpha;

      // ——— 3. Clean Laminar Horizon Ribbon (Strictly Inside Left & Right Safe Corridors) ———
      const horizonPaths = field.horizonStrands.map((h) => {
        const reach = reduceMotion ? 1 : evaluateSingularitySpring(activeTime, h.staggerDelay);
        return evaluateHorizonStreamline(h, L, time, reach);
      });

      const horizonSpan = Math.max(120, (L.rightSafeX - L.leftSafeX) * 0.48);
      field.horizonTierBatches.forEach((batch, tierIdx) => {
        if (!batch.length) return;
        const tier = STRATIFIED_WEIGHTS[tierIdx]!;
        const baseGold = mixRgbTuple(goldAmb, goldSpec, tier.colorMix);
        const goldStr = `${baseGold[0]}, ${baseGold[1]}, ${baseGold[2]}`;
        const edgeCrimsonStr = mixRgb(baseGold, CRIMSON_PURE, 0.72);
        const a = tier.alpha * 0.48 * alphaMul * (0.8 + 0.25 * energy);

        const hg = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, horizonSpan);
        hg.addColorStop(0, `rgba(${goldStr}, ${Math.min(1, a * 2.1)})`);
        hg.addColorStop(0.35, `rgba(${goldStr}, ${a * 0.95})`);
        hg.addColorStop(0.68, `rgba(${goldStr}, ${a * 0.42})`);
        hg.addColorStop(0.88, `rgba(${edgeCrimsonStr}, ${a * 0.22})`);
        hg.addColorStop(1, `rgba(${edgeCrimsonStr}, 0)`);

        ctx.beginPath();
        for (const idx of batch) {
          const [leftSeg, rightSeg] = horizonPaths[idx]!;
          ctx.moveTo(leftSeg[0].x, leftSeg[0].y);
          ctx.bezierCurveTo(leftSeg[1].x, leftSeg[1].y, leftSeg[2].x, leftSeg[2].y, leftSeg[3].x, leftSeg[3].y);
          ctx.bezierCurveTo(rightSeg[1].x, rightSeg[1].y, rightSeg[2].x, rightSeg[2].y, rightSeg[3].x, rightSeg[3].y);
        }
        ctx.lineWidth = tier.width * (isLight ? 1.12 : 1);
        ctx.strokeStyle = hg;
        ctx.stroke();
      });

      // ——— 4. The 5 Node Arms (Deterministic Foliation, Dark When Disconnected, Crimson Edges & Information Waves) ———
      const armStreamlines = field.armStrands.map((s) => {
        const reach = reduceMotion ? 1 : evaluateSingularitySpring(activeTime, s.staggerDelay);
        return evaluateArmStreamline(s, L.arms[s.arm]!, L, time, reach);
      });

      for (let armIdx = 0; armIdx < socketCount; armIdx++) {
        const armGeom = L.arms[armIdx]!;
        const connLevel = connectionLevels[armIdx] ?? 0.02;
        const edgeRed = edgeCrimsonLevels[armIdx] ?? 0;

        // Check if an ignition wave is currently sweeping along this arm
        let igniteFront = 1.0;
        for (const iw of igniteWaves) {
          if (iw.socket === armIdx) {
            igniteFront = Math.min(igniteFront, clamp(iw.u, 0.05, 1));
          }
        }

        // Check if an information transfer wave is currently flowing along this arm:
        //   - Inbound leg (fromSocket === armIdx): wave center moves from u = 0.65 -> u = 0.00 (into Core)
        //   - Outbound leg (toSocket === armIdx):  wave center moves from u = 0.00 -> u = 1.00 (Core -> Node -> Trailing Edge)
        let activeWaveU = -1;
        let activeWaveStrength = 0;
        for (const wave of infoWaves) {
          if (wave.fromSocket === armIdx && wave.s <= 0.42) {
            const legP = wave.s / 0.42; // 0 .. 1
            activeWaveU = lerp(0.58, 0.0, legP);
            activeWaveStrength = Math.max(activeWaveStrength, Math.sin(legP * Math.PI));
          } else if (wave.toSocket === armIdx) {
            const startS = wave.fromSocket >= 0 ? 0.36 : 0.0;
            if (wave.s >= startS) {
              const legP = clamp((wave.s - startS) / (1 - startS), 0, 1);
              activeWaveU = legP;
              activeWaveStrength = Math.max(activeWaveStrength, Math.sin(clamp(legP * 1.05, 0, 1) * Math.PI));
            }
          }
        }

        const tip = scaleFromOrigin(armGeom.tipCenter, core, Math.min(1, coreSpring));

        for (let tierIdx = 0; tierIdx < STRATIFIED_WEIGHTS.length; tierIdx++) {
          const tier = STRATIFIED_WEIGHTS[tierIdx]!;
          const batch = field.armTierBatches[armIdx]![tierIdx]!;
          if (!batch.length) continue;

          const baseGold = mixRgbTuple(goldAmb, goldSpec, tier.colorMix);
          const goldStr = `${baseGold[0]}, ${baseGold[1]}, ${baseGold[2]}`;
          const coralEdgeStr = mixRgb(baseGold, CRIMSON_CORAL, edgeRed * 0.9);
          const crimsonEdgeStr = mixRgb(goldDeep, CRIMSON_PURE, edgeRed * 0.98);
          const deepCrimsonStr = mixRgb(goldDeep, CRIMSON_DEEP, edgeRed * 1.0);

          // Base opacity scales directly with connLevel:
          // - Connected (connLevel = 1.0): full luminous golden brilliance
          // - Disconnected (connLevel ≈ 0.02): genuinely dark shadow
          const effectiveLevel = Math.max(connLevel, activeWaveStrength * 0.85);
          const a =
            tier.alpha *
            alphaMul *
            effectiveLevel *
            (1 + 0.22 * energy + 0.35 * activeWaveStrength);

          const armGrad = ctx.createLinearGradient(core.x, core.y, tip.x, tip.y);

          // Sample 9 stops along u in [0, 1] so both:
          //   (a) the travelling crimson information wave R_wave(u, t), AND
          //   (b) the crimson transition near the outer trailing edges (u > 0.68)
          // are rendered directly in the flowing lines themselves!
          const stops = [0, 0.14, 0.28, 0.38, 0.5, 0.64, 0.76, 0.9, 1.0];
          for (const u of stops) {
            if (u > igniteFront + 0.08) {
              armGrad.addColorStop(u, "rgba(0, 0, 0, 0)");
              continue;
            }

            // 1) Information-transfer crimson wavepacket along the lines
            let waveRed = 0;
            if (activeWaveU >= 0 && activeWaveStrength > 0.01) {
              const d = (u - activeWaveU) / 0.14;
              waveRed = Math.exp(-0.5 * d * d) * activeWaveStrength;
            }

            // 2) Connected node outer trailing edge transition toward crimson red (u in [0.68, 1.0])
            const trailingEdgeFactor = smoothstep(0.66, 0.92, u) * edgeRed;

            const totalRedMix = clamp(Math.max(waveRed * 0.98, trailingEdgeFactor), 0, 1);

            let stopRgb = goldStr;
            if (totalRedMix > 0.02) {
              if (u > 0.84 && trailingEdgeFactor > waveRed) {
                stopRgb = mixRgb(baseGold, CRIMSON_PURE, totalRedMix);
              } else if (waveRed > trailingEdgeFactor) {
                stopRgb = mixRgb(baseGold, CRIMSON_PURE, waveRed * 0.95);
              } else {
                stopRgb = coralEdgeStr;
              }
            }

            // Radial envelope along the arm: bright at core and node waist (u ≈ 0.34), tapering smoothly at u = 1
            const waistFocus = 1 + 0.45 * Math.exp(-Math.pow((u - 0.35) / 0.1, 2));
            const edgeTaper = u < 0.72 ? 1 : 1 - smoothstep(0.72, 1.0, u);
            const waveBoost = 1 + 0.65 * waveRed;
            const stopAlpha = clamp(a * waistFocus * edgeTaper * waveBoost, 0, 1);

            if (u === 1.0) {
              armGrad.addColorStop(1.0, `rgba(${deepCrimsonStr}, 0)`);
            } else {
              armGrad.addColorStop(u, `rgba(${stopRgb}, ${stopAlpha})`);
            }
          }

          ctx.beginPath();
          for (const sIdx of batch) {
            const [segIn, segOut] = armStreamlines[sIdx]!;
            ctx.moveTo(segIn[0].x, segIn[0].y);
            ctx.bezierCurveTo(segIn[1].x, segIn[1].y, segIn[2].x, segIn[2].y, segIn[3].x, segIn[3].y);
            ctx.bezierCurveTo(segOut[1].x, segOut[1].y, segOut[2].x, segOut[2].y, segOut[3].x, segOut[3].y);
          }

          ctx.lineWidth = tier.width * (0.85 + 0.3 * effectiveLevel + 0.2 * activeWaveStrength) * (isLight ? 1.12 : 1);
          ctx.strokeStyle = armGrad;
          ctx.stroke();
        }
      }

      // ——— 5. Singularity Core Focal Point (Formed Where All Lines Converge) ———
      const breathe = 1 + 0.04 * Math.sin(time * (0.55 + energy));
      const coreGlowR = R * 0.18 * breathe * Math.min(1, coreSpring);
      radialGlow(ctx, core, coreGlowR, [
        [0, `rgba(${goldSpec.join(", ")}, ${0.95 * masterAlpha})`],
        [0.28, `rgba(${goldPri.join(", ")}, ${(0.58 + 0.2 * energy) * masterAlpha})`],
        [0.65, `rgba(${goldAmb.join(", ")}, ${0.14 * masterAlpha})`],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
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
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
    };
  }, [socketCount]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden />;
}
