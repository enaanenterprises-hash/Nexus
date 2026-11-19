"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ArrowUp, Lock, Plus } from "lucide-react";
import { NeuralThreadsWebGL } from "@/components/dashboard/NeuralThreadsWebGL";
import { computeStageLayout } from "@/components/dashboard/stage-layout";
import { fitCanvas, observeCanvasActivity, type Vec } from "@/lib/network/geometry";
import { NexusMark } from "./NexusLogo";

export type EcosystemLayer = "network" | "command" | "nodes";

const LAYER_INDEX: Record<EcosystemLayer, number> = {
  network: 0,
  command: 1,
  nodes: 2,
};

type FilamentArm = {
  /** Base polar angle in radians (0 = right, -PI/2 = straight up, -PI = left). */
  angle: number;
  /** Slight organic S-curve bend across the arm length. */
  curve: number;
  /** Normalized reach radius multiplier relative to stage scale. */
  reach: number;
  /** Number of interwoven silk strands in this bundle. */
  strands: number;
  /** Normalized position along arm (0..1) where the hourglass waist pinches tightest. */
  waistT: number;
  /** Maximum swell width before waist pinch (px multiplier). */
  swell: number;
  /** Maximum fan flare width after waist pinch (px multiplier). */
  flare: number;
  /** Optional linked ecosystem layer index (0 = network, 1 = command, 2 = nodes). */
  layerIdx: number | null;
};

const SIGNAL_ARMS: FilamentArm[] = [
  // Sweeping left lateral silk wing
  { angle: -Math.PI + 0.16, curve: -0.14, reach: 1.08, strands: 22, waistT: 0.56, swell: 28, flare: 52, layerIdx: null },
  // Upper-left braided stream — Neural Network
  { angle: -Math.PI * 0.72, curve: -0.06, reach: 1.06, strands: 24, waistT: 0.55, swell: 32, flare: 62, layerIdx: 0 },
  // Vertical center braided stream — Command
  { angle: -Math.PI * 0.5, curve: 0.0, reach: 1.02, strands: 24, waistT: 0.56, swell: 30, flare: 54, layerIdx: 1 },
  // Upper-right braided stream — Nodes
  { angle: -Math.PI * 0.28, curve: 0.06, reach: 1.06, strands: 24, waistT: 0.55, swell: 32, flare: 62, layerIdx: 2 },
  // Sweeping right lateral silk wing
  { angle: -0.16, curve: 0.14, reach: 1.08, strands: 22, waistT: 0.56, swell: 28, flare: 52, layerIdx: null },
];

function deterministicHash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Braided golden filament signal-bus sculpture inspired by luminous optical silk bundles:
 * five interwoven golden streams emerging from a radiant pearl-white core on pitch black,
 * pinching cleanly through hourglass waists and fanning into gossamer threads.
 */
export function EcosystemBridgeVisual({
  activeLayer,
  onSelect,
}: {
  activeLayer: EcosystemLayer;
  onSelect: (layer: EcosystemLayer) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetIdxRef = useRef<number>(LAYER_INDEX[activeLayer]);

  useEffect(() => {
    targetIdxRef.current = LAYER_INDEX[activeLayer];
  }, [activeLayer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let smoothIdx = targetIdxRef.current;
    let active = true;

    const draw = (dt: number) => {
      if (!reduceMotion) {
        clock += dt;
        smoothIdx += (targetIdxRef.current - smoothIdx) * (1 - Math.exp(-dt * 5.0));
      } else {
        smoothIdx = targetIdxRef.current;
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#111216";
      ctx.fillRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.87;
      const rx = width * 0.54;
      const ry = height * 0.92;
      const samples = 26;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // 1. Braided golden silk filament bundles
      SIGNAL_ARMS.forEach((arm, armIdx) => {
        const proximity =
          arm.layerIdx === null ? 0.25 : Math.max(0, 1 - Math.abs(smoothIdx - arm.layerIdx));
        const boost = 0.64 + proximity * 0.52;

        const dirX = Math.cos(arm.angle);
        const dirY = Math.sin(arm.angle);
        const perpX = -dirY;
        const perpY = dirX;

        for (let s = 0; s < arm.strands; s++) {
          const seed = armIdx * 97 + s * 13 + 1;
          const u = arm.strands > 1 ? (s / (arm.strands - 1)) * 2 - 1 : 0;
          const phase = deterministicHash(seed) * Math.PI * 2;
          const freq = 1.65 + deterministicHash(seed + 3) * 1.15;
          const strandScale = 0.72 + deterministicHash(seed + 7) * 0.56;
          const isHotCore = Math.abs(u) < 0.36;

          ctx.beginPath();
          for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            // Radial progression scaled cleanly to container aspect ratio
            const distX = dirX * t * rx * arm.reach;
            const distY = dirY * t * ry * arm.reach;
            // Subtle graceful S-curve sweep
            const bend = Math.sin(t * Math.PI) * arm.curve * Math.min(rx, ry) * 0.55;

            // Hourglass lotus envelope: tight at core -> organic swell -> crisp focal waist pinch -> gossamer fan
            let env: number;
            if (t < arm.waistT) {
              const p = t / arm.waistT;
              const petal = Math.sin(p * Math.PI);
              env = 2.0 + arm.swell * Math.pow(petal, 0.85) * (1 - 0.1 * p);
            } else {
              const q = (t - arm.waistT) / (1 - arm.waistT);
              env = 2.2 + arm.flare * Math.pow(q, 1.32);
            }

            // Helical intertwining weave so fibers genuinely cross & shimmer at the waist
            const twist = Math.sin(t * Math.PI * freq + phase + clock * (0.45 + 0.14 * proximity));
            const lateral =
              (u * 0.76 + twist * 0.42 * (0.4 + 0.6 * (1 - Math.abs(u)))) * env * strandScale;

            const px = cx + distX + perpX * (bend + lateral);
            const py = cy + distY + perpY * (bend + lateral);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }

          const alpha = (isHotCore ? 0.29 : 0.15) * boost * (0.72 + 0.28 * (1 - Math.abs(u)));
          ctx.strokeStyle = isHotCore
            ? `rgba(255, 244, 212, ${alpha.toFixed(3)})`
            : `rgba(240, 186, 84, ${alpha.toFixed(3)})`;
          ctx.lineWidth = isHotCore ? 0.95 : 0.65;
          ctx.stroke();
        }

        // Subtle luminous focal bloom right at each waist neck
        const wx = cx + dirX * arm.waistT * rx * arm.reach + perpX * (Math.sin(arm.waistT * Math.PI) * arm.curve * Math.min(rx, ry) * 0.55);
        const wy = cy + dirY * arm.waistT * ry * arm.reach + perpY * (Math.sin(arm.waistT * Math.PI) * arm.curve * Math.min(rx, ry) * 0.55);
        const waistR = 16 + proximity * 14;
        const waistGlow = ctx.createRadialGradient(wx, wy, 0, wx, wy, waistR);
        waistGlow.addColorStop(0, `rgba(255, 246, 218, ${(0.22 * boost).toFixed(3)})`);
        waistGlow.addColorStop(0.45, `rgba(240, 181, 74, ${(0.1 * boost).toFixed(3)})`);
        waistGlow.addColorStop(1, "rgba(240, 181, 74, 0)");
        ctx.fillStyle = waistGlow;
        ctx.beginPath();
        ctx.arc(wx, wy, waistR, 0, Math.PI * 2);
        ctx.fill();

        // Travelling luminous signal sparks along the active arm
        if (arm.layerIdx !== null && proximity > 0.25 && !reduceMotion) {
          for (let m = 0; m < 2; m++) {
            const mt = (clock * 0.34 + m * 0.5 + armIdx * 0.19) % 1;
            const bend = Math.sin(mt * Math.PI) * arm.curve * Math.min(rx, ry) * 0.55;
            const sx = cx + dirX * mt * rx * arm.reach + perpX * bend;
            const sy = cy + dirY * mt * ry * arm.reach + perpY * bend;
            const fade = Math.sin(mt * Math.PI) * proximity;
            const spark = ctx.createRadialGradient(sx, sy, 0, sx, sy, 9);
            spark.addColorStop(0, `rgba(255, 250, 232, ${(0.9 * fade).toFixed(3)})`);
            spark.addColorStop(0.4, `rgba(240, 181, 74, ${(0.35 * fade).toFixed(3)})`);
            spark.addColorStop(1, "rgba(240, 181, 74, 0)");
            ctx.fillStyle = spark;
            ctx.beginPath();
            ctx.arc(sx, sy, 9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // 2. Fine starlight dust motes drifting delicately around the golden silk
      for (let d = 0; d < 28; d++) {
        const a = -Math.PI + 0.1 + deterministicHash(d * 19 + 5) * (Math.PI - 0.2);
        const rBase = 0.22 + deterministicHash(d * 31 + 11) * 0.72;
        const drift = reduceMotion ? 0 : Math.sin(clock * 0.7 + d) * 0.02;
        const dx = cx + Math.cos(a) * (rBase + drift) * rx * 0.96;
        const dy = cy + Math.sin(a) * (rBase + drift) * ry * 0.92;
        const twinkle = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(clock * 1.4 + d * 2.1));
        ctx.fillStyle = `rgba(255, 242, 206, ${(0.42 * twinkle).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dx, dy, 0.75 + deterministicHash(d * 7) * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Radiant Pearl-White / Burnished-Gold Singularity Core at bottom center
      const coreOuter = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width * 0.24, 96));
      coreOuter.addColorStop(0, "rgba(255, 253, 246, 0.98)");
      coreOuter.addColorStop(0.16, "rgba(255, 244, 212, 0.82)");
      coreOuter.addColorStop(0.42, "rgba(240, 181, 74, 0.32)");
      coreOuter.addColorStop(1, "rgba(240, 181, 74, 0)");
      ctx.fillStyle = coreOuter;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(width * 0.24, 96), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Clean horizon mask below core & subtle edge feathering into deep charcoal #111216
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      const baseMask = ctx.createLinearGradient(0, cy + 1, 0, height);
      baseMask.addColorStop(0, "rgba(17, 18, 22, 0.78)");
      baseMask.addColorStop(0.35, "rgba(17, 18, 22, 1)");
      ctx.fillStyle = baseMask;
      ctx.fillRect(0, cy + 1, width, height - cy);

      const leftFade = ctx.createLinearGradient(0, 0, width * 0.12, 0);
      leftFade.addColorStop(0, "rgba(17, 18, 22, 1)");
      leftFade.addColorStop(1, "rgba(17, 18, 22, 0)");
      ctx.fillStyle = leftFade;
      ctx.fillRect(0, 0, width * 0.12, height);

      const rightFade = ctx.createLinearGradient(width * 0.88, 0, width, 0);
      rightFade.addColorStop(0, "rgba(17, 18, 22, 0)");
      rightFade.addColorStop(1, "rgba(17, 18, 22, 1)");
      ctx.fillStyle = rightFade;
      ctx.fillRect(width * 0.88, 0, width * 0.12, height);

      const topFade = ctx.createLinearGradient(0, 0, 0, height * 0.16);
      topFade.addColorStop(0, "rgba(17, 18, 22, 0.92)");
      topFade.addColorStop(1, "rgba(17, 18, 22, 0)");
      ctx.fillStyle = topFade;
      ctx.fillRect(0, 0, width, height * 0.16);
      ctx.restore();
    };

    const resize = () => {
      const dims = fitCanvas(canvas, ctx);
      width = dims.width;
      height = dims.height;
      draw(0);
    };

    const tick = (now: number) => {
      if (!active || reduceMotion) {
        raf = 0;
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      draw(dt);
      raf = requestAnimationFrame(tick);
    };

    const stopVis = observeCanvasActivity(canvas, (isActive) => {
      active = isActive;
      if (isActive && !reduceMotion && raf === 0) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!isActive && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    if (!reduceMotion && active && raf === 0) raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      stopVis();
      ro.disconnect();
    };
  }, []);

  function handleCanvasClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const rx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    if (rx < 0.36) onSelect("network");
    else if (rx > 0.64) onSelect("nodes");
    else onSelect("command");
  }

  return (
    <div
      onClick={handleCanvasClick}
      className="relative h-[210px] w-full cursor-pointer overflow-hidden bg-[#111216] sm:h-[246px]"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

type PreviewPrompt = {
  id: string;
  label: string;
  prompt: string;
  response: string;
  pulseSockets: number[];
  sourceLabel: string;
};

const NETWORK_PROMPTS: PreviewPrompt[] = [
  {
    id: "brief",
    label: "Brief my morning",
    prompt: "Brief my morning and check open reviews",
    response:
      "You have Q4 Architecture Review from Elena Vance, a 14:00 Deep Work block, and PR #48 merged cleanly. Focus Guard is ready on socket 3.",
    pulseSockets: [1, 2],
    sourceLabel: "Daily Brief → Core",
  },
  {
    id: "studio",
    label: "Route Studio take",
    prompt: "Route my latest Studio take to Daily Brief",
    response:
      "Routed “Q4 Product Note — Take 3” across the capability-scoped bus to Daily Brief with summary notes attached. Ephemeral context stays private.",
    pulseSockets: [0, 1],
    sourceLabel: "Studio → Daily Brief",
  },
  {
    id: "focus",
    label: "Start deep work",
    prompt: "Start a 25-minute deep work session",
    response:
      "Deep work timer started in Command (25:00), calendar status updated, and non-urgent inbox notifications muted until 14:25.",
    pulseSockets: [2, 1],
    sourceLabel: "Core → Command",
  },
];

const PREVIEW_SOCKETS = [
  { status: "occupied" as const, monogram: "St", name: "Studio", target: 1.0 },
  { status: "occupied" as const, monogram: "DB", name: "Daily Brief", target: 1.0 },
  { status: "open" as const, monogram: "", name: "Focus Guard", target: 0.56 },
  { status: "locked" as const, monogram: "", name: "Pro socket", target: 0.24 },
  { status: "locked" as const, monogram: "", name: "Pro socket", target: 0.24 },
] as const;

/**
 * Authentic, interactive preview of the real `/dashboard` Network page:
 * runs the live WebGL2 <NeuralThreadsWebGL /> Singularity Canopy paired sub-pixel with
 * precision optical node reticles, flat 2D Nexus rotor, socket rail, and working voice prompt bar.
 */
export function NeuralNetworkPreview({ theme }: { theme: "dark" | "light" }) {
  const isLight = theme === "light";
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 1120, height: 610 });
  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [brainState, setBrainState] = useState<"idle" | "thinking" | "responding">("idle");
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] = useState<{
    prompt: string;
    response: string;
    sourceLabel: string;
  } | null>(null);
  const [armPulse, setArmPulse] = useState<{ indices: number[]; serial: number } | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize((prev) =>
          Math.round(prev.width) === Math.round(rect.width) &&
          Math.round(prev.height) === Math.round(rect.height)
            ? prev
            : { width: rect.width, height: rect.height },
        );
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const layout = useMemo(() => {
    // Frame the Singularity Core and basal wings gracefully above the conversational voice stage
    const base = computeStageLayout(size.width, size.height, PREVIEW_SOCKETS.length);
    const isNarrow = size.width < 520;
    const coreY = isNarrow
      ? Math.max(162, Math.min(size.height * 0.37, size.height - 335))
      : Math.max(185, Math.min(size.height * 0.47, size.height - 268));
    const dy = coreY - base.core.y;
    return {
      ...base,
      core: { x: base.core.x, y: coreY },
      sockets: base.sockets.map((pt) => ({
        x: pt.x,
        y: Math.max(52, pt.y + dy * 0.85),
      })),
    };
  }, [size.width, size.height]);

  const coreUV = useMemo<Vec>(
    () => ({
      x: layout.core.x / Math.max(layout.width, 1),
      y: 1 - layout.core.y / Math.max(layout.height, 1),
    }),
    [layout.core.x, layout.core.y, layout.width, layout.height],
  );

  const socketsUV = useMemo<Vec[]>(
    () =>
      layout.sockets.map((pt) => ({
        x: pt.x / Math.max(layout.width, 1),
        y: 1 - pt.y / Math.max(layout.height, 1),
      })),
    [layout.sockets, layout.width, layout.height],
  );

  const socketTargets = useMemo(() => PREVIEW_SOCKETS.map((s) => s.target), []);
  const energy = brainState === "thinking" ? 1.0 : brainState === "responding" ? 0.68 : 0.2;

  function triggerPrompt(item: { prompt: string; response: string; pulseSockets: number[]; sourceLabel: string }) {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setBrainState("thinking");
    setActiveIdx(item.pulseSockets[0] ?? null);
    setArmPulse((prev) => ({ indices: item.pulseSockets, serial: (prev?.serial ?? 0) + 1 }));
    setConversation({ prompt: item.prompt, response: "", sourceLabel: item.sourceLabel });

    const t1 = window.setTimeout(() => {
      setBrainState("responding");
      setConversation({ prompt: item.prompt, response: item.response, sourceLabel: item.sourceLabel });
      setArmPulse((prev) => ({ indices: item.pulseSockets, serial: (prev?.serial ?? 0) + 1 }));
    }, 460);

    const t2 = window.setTimeout(() => {
      setBrainState("idle");
    }, 1850);

    timersRef.current.push(t1, t2);
  }

  function handleNodeClick(idx: number) {
    const sock = PREVIEW_SOCKETS[idx];
    if (!sock) return;
    if (idx === 0) {
      triggerPrompt(NETWORK_PROMPTS[1]!);
    } else if (idx === 1) {
      triggerPrompt(NETWORK_PROMPTS[0]!);
    } else if (idx === 2) {
      triggerPrompt(NETWORK_PROMPTS[2]!);
    } else {
      setActiveIdx(idx);
      setArmPulse((prev) => ({ indices: [idx], serial: (prev?.serial ?? 0) + 1 }));
      setConversation({
        prompt: `Inspect ${sock.name}`,
        response: "Pro sockets unlock 3 additional isolated orbital nodes for custom SDK v1 workflows.",
        sourceLabel: "Socket Topology",
      });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    triggerPrompt({
      prompt: text,
      response:
        "Connected your request across Studio, Daily Brief, and Command. Context stays ephemeral in your session and clears automatically when you leave.",
      pulseSockets: [0, 1],
      sourceLabel: "Nexus Core",
    });
  }

  return (
    <div
      ref={stageRef}
      className="relative h-[585px] w-full overflow-hidden sm:h-[590px]"
      style={{ background: isLight ? "#ffffff" : "#121318" }}
    >
      {/* Live WebGL2 Singularity Canopy — exact same engine as the real /dashboard Network view */}
      <NeuralThreadsWebGL
        theme={theme}
        coreUV={coreUV}
        socketsUV={socketsUV}
        socketTargets={socketTargets}
        activeOrHoveredSocket={hoveredIdx >= 0 ? hoveredIdx : activeIdx ?? -1}
        energy={energy}
        armPulse={armPulse}
        skipIntro
      />

      {/* Subtle bottom scrim keeping the conversational prompt crystal clear */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isLight
            ? "linear-gradient(0deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 18%, rgba(255,255,255,0) 40%)"
            : "linear-gradient(0deg, rgba(18,19,24,0.94) 0%, rgba(18,19,24,0.56) 18%, rgba(18,19,24,0) 40%)",
        }}
      />

      {/* Authentic top-left flat 2D Nexus rotor button from /dashboard */}
      <div className="pointer-events-none absolute top-4 left-4 z-20 flex items-center gap-2.5 sm:top-5 sm:left-5">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md ${
            isLight
              ? "border-[#0e0f12]/[0.1] bg-white/80 shadow-xs"
              : "border-white/[0.1] bg-[#121216]/75"
          }`}
          aria-hidden="true"
        >
          <NexusMark className="h-[18px] w-[18px]" />
        </span>
      </div>

      {/* Authentic right-edge vertical minimal socket rail pill from /dashboard */}
      <div
        className={`pointer-events-none absolute top-1/2 right-3.5 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-full border px-1.5 py-2.5 backdrop-blur-md sm:flex ${
          isLight
            ? "border-[#0e0f12]/[0.1] bg-white/80"
            : "border-white/[0.1] bg-[#121216]/75"
        }`}
        aria-hidden="true"
      >
        {PREVIEW_SOCKETS.map((s, idx) => (
          <span
            key={s.name + idx}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              s.status === "occupied"
                ? isLight
                  ? "bg-[#0e0f12]"
                  : "bg-[#f5f5f7]"
                : s.status === "open"
                  ? isLight
                    ? "bg-[#0e0f12]/45"
                    : "bg-white/45"
                  : isLight
                    ? "bg-[#0e0f12]/18"
                    : "bg-white/18"
            }`}
          />
        ))}
      </div>

      {/* 5 Precision Concentric Optical Node Reticles synced sub-pixel to WebGL socket waists */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {layout.sockets.map((pt, idx) => {
          const sock = PREVIEW_SOCKETS[idx]!;
          const isOccupied = sock.status === "occupied";
          const isOpen = sock.status === "open";
          const isHovered = hoveredIdx === idx;
          const isActive = activeIdx === idx;
          const goldColor = isLight ? "#c88d18" : "#f0b54a";

          return (
            <button
              key={idx}
              type="button"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx((c) => (c === idx ? -1 : c))}
              onClick={() => handleNodeClick(idx)}
              aria-label={`Trigger ${sock.name} node in preview`}
              className="pointer-events-auto absolute top-0 left-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/75"
              style={{ transform: `translate3d(${pt.x - 22}px, ${pt.y - 22}px, 0)` }}
            >
              <svg viewBox="0 0 44 44" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                <circle
                  cx="22"
                  cy="22"
                  r={isOccupied ? 14 : isOpen ? 12 : 11}
                  fill={
                    isLight
                      ? isOccupied
                        ? "rgba(255,255,255,0.92)"
                        : "rgba(255,255,255,0.84)"
                      : isOccupied
                        ? "rgba(10,10,14,0.84)"
                        : "rgba(10,10,14,0.72)"
                  }
                />
                <circle
                  cx="22"
                  cy="22"
                  r={isOccupied ? 14 : isOpen ? 12 : 11}
                  fill="none"
                  stroke={isOccupied || isOpen ? goldColor : isLight ? "#6b6e78" : "#9d9da6"}
                  strokeOpacity={isOccupied ? (isHovered || isActive ? 1 : 0.8) : isOpen ? 0.56 : 0.3}
                  strokeWidth={isOccupied ? (isHovered || isActive ? 1.55 : 1.2) : 1.05}
                  strokeDasharray={isOpen ? "3 3" : undefined}
                />
                {isOccupied || isHovered || isActive ? (
                  <g stroke={goldColor} strokeWidth="1" strokeLinecap="round" strokeOpacity={isHovered || isActive ? 0.85 : 0.4}>
                    <line x1="22" y1="3.5" x2="22" y2="5.8" />
                    <line x1="22" y1="38.2" x2="22" y2="40.5" />
                    <line x1="3.5" y1="22" x2="5.8" y2="22" />
                    <line x1="38.2" y1="22" x2="40.5" y2="22" />
                  </g>
                ) : null}
              </svg>

              <span
                className={`relative z-10 flex items-center justify-center text-[10.5px] font-semibold ${
                  isOccupied
                    ? isLight
                      ? "text-[#0e0f12]"
                      : "text-[#f5f5f7]"
                    : isOpen
                      ? isLight
                        ? "text-[#3a3d46]"
                        : "text-[#d1d1d6]"
                      : isLight
                        ? "text-[#686a73]"
                        : "text-[#8e8e95]"
                }`}
              >
                {isOccupied ? (
                  sock.monogram
                ) : isOpen ? (
                  <Plus className="size-3" strokeWidth={1.85} aria-hidden="true" />
                ) : (
                  <Lock className="size-2.5" strokeWidth={1.85} aria-hidden="true" />
                )}
              </span>

              {isOccupied || isHovered || isActive ? (
                <span
                  className={`pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap backdrop-blur-md transition-all ${
                    isLight
                      ? "border-[#0e0f12]/[0.1] bg-white/88 text-[#0e0f12] shadow-xs"
                      : "border-white/[0.13] bg-[#101014]/82 text-[#f5f5f7]"
                  }`}
                >
                  {isOccupied ? (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isLight ? "bg-[#0e0f12]" : "bg-[#f5f5f7]"}`}
                      aria-hidden="true"
                    />
                  ) : null}
                  {sock.name}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Bottom Conversational Assistant Voice Stage (mirrors /dashboard NexusVoice + NexusInput) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center px-4 text-center sm:bottom-6">
        <div className="pointer-events-auto flex w-full max-w-[580px] flex-col items-center gap-3">
          {!conversation ? (
            <div className="flex flex-col items-center gap-1">
              <p
                className={`font-editorial text-[clamp(1.7rem,2.8vw,2.35rem)] leading-[1.1] font-normal tracking-[-0.025em] ${
                  isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]"
                }`}
              >
                Hello, Elena
              </p>
              <p className={`text-[12.5px] ${isLight ? "text-[#52545e]" : "text-[#9d9da6]"}`}>
                Click a node or ask Nexus
              </p>
            </div>
          ) : (
            <div className="lp-stage-panel flex flex-col items-center gap-1">
              <p className={`text-[12px] ${isLight ? "text-[#636570]" : "text-[#8e8e95]"}`}>
                {conversation.sourceLabel} · {conversation.prompt}
              </p>
              <p
                className={`font-editorial max-w-[52ch] text-[clamp(1.05rem,1.5vw,1.25rem)] leading-[1.38] ${
                  isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]"
                }`}
              >
                {conversation.response || "Routing across your active sockets…"}
              </p>
            </div>
          )}

          {/* Status indicator */}
          <div className="inline-flex items-center gap-2 text-[11.5px] font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                brainState === "idle"
                  ? isLight
                    ? "bg-[#0e0f12]/70"
                    : "bg-white/75"
                  : isLight
                    ? "animate-pulse bg-[#0e0f12]"
                    : "animate-pulse bg-white"
              }`}
              aria-hidden="true"
            />
            <span className={isLight ? "text-[#52545e]" : "text-[#a1a1a6]"}>
              Nexus · {brainState === "thinking" ? "Thinking" : brainState === "responding" ? "Responding" : "Ready"}
            </span>
          </div>

          {/* Interactive quick-ask prompt pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {NETWORK_PROMPTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => triggerPrompt(item)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer sm:px-3 sm:text-[11.5px] ${
                  isLight
                    ? "border-[#0e0f12]/[0.12] bg-white/85 text-[#22242c] hover:border-[#0e0f12]/35 hover:bg-white"
                    : "border-white/[0.13] bg-[#121217]/75 text-[#d1d1d6] hover:border-white/35 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Interactive frosted Ask Nexus prompt bar */}
          <form
            onSubmit={handleSubmit}
            className={`flex h-12 w-full items-center gap-2 rounded-full border pr-1.5 pl-4 backdrop-blur-xl transition-colors ${
              isLight
                ? "border-[#0e0f12]/[0.12] bg-white/88 shadow-[0_14px_34px_-12px_rgba(14,15,18,0.16)] focus-within:border-[#0e0f12]/40"
                : "border-white/[0.14] bg-[#111116]/82 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.7)] focus-within:border-white/40"
            }`}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Nexus anything…"
              aria-label="Try asking Nexus in the interactive preview"
              className={`min-w-0 flex-1 bg-transparent text-[14px] outline-none ${
                isLight
                  ? "text-[#0e0f12] placeholder:text-[#686a73]"
                  : "text-[#f5f5f7] placeholder:text-[#8e8e95]"
              }`}
            />
            <button
              type="submit"
              aria-label="Send preview message"
              className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
                isLight
                  ? "bg-[#0e0f12] text-white hover:bg-[#23252c]"
                  : "bg-white/[0.16] text-[#f5f5f7] hover:bg-[#f5f5f7] hover:text-[#09090b]"
              }`}
            >
              <ArrowUp className="size-4" strokeWidth={1.85} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
