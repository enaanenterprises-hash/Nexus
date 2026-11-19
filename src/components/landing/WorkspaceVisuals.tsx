"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

/**
 * Ground-up atmospheric Obsidian Observatory backdrop for the unified workflows stage:
 * hair-fine astronomical meridian arcs + a live golden signal meridian feeding 3 smooth
 * architectural conduits directly toward the active layer selector.
 */
export function EcosystemField({ activeLayer }: { activeLayer: EcosystemLayer }) {
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
        smoothIdx += (targetIdxRef.current - smoothIdx) * (1 - Math.exp(-dt * 5.2));
      } else {
        smoothIdx = targetIdxRef.current;
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const topOriginY = 0;
      const arcCenterY = height * 1.18;
      const maxR = Math.max(width * 0.72, height * 1.15);

      // 1. Hair-fine concentric observatory meridian arcs (quiet architectural scale)
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const r = maxR * (0.48 + i * 0.16);
        ctx.beginPath();
        ctx.arc(cx, arcCenterY, r, Math.PI * 1.14, Math.PI * 1.86);
        ctx.strokeStyle = i === 1 ? "rgba(240, 181, 74, 0.055)" : "rgba(255, 255, 255, 0.032)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Subtle coordinate tick notches along the golden reference arc
      const tickR = maxR * 0.64;
      for (let k = -6; k <= 6; k++) {
        const angle = -Math.PI / 2 + k * 0.085;
        const x1 = cx + Math.cos(angle) * (tickR - 3);
        const y1 = arcCenterY + Math.sin(angle) * (tickR - 3);
        const x2 = cx + Math.cos(angle) * (tickR + 3);
        const y2 = arcCenterY + Math.sin(angle) * (tickR + 3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = k === 0 ? "rgba(240, 181, 74, 0.24)" : "rgba(255, 255, 255, 0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 2. Central descending spine & 3 architectural conduits guiding eye flow into the 3-tab rail
      const splitY = Math.min(130, height * 0.22);
      const targetY = Math.min(340, height * 0.56);
      const spanX = Math.min(width * 0.34, 460);
      const branches = [cx - spanX, cx, cx + spanX];

      // Incoming vertical spine descending seamlessly from the Lightfall transition above
      const spineGrad = ctx.createLinearGradient(cx, topOriginY, cx, splitY);
      spineGrad.addColorStop(0, "rgba(240, 181, 74, 0)");
      spineGrad.addColorStop(0.55, "rgba(240, 181, 74, 0.32)");
      spineGrad.addColorStop(1, "rgba(240, 181, 74, 0.58)");
      ctx.beginPath();
      ctx.moveTo(cx, topOriginY);
      ctx.lineTo(cx, splitY);
      ctx.strokeStyle = spineGrad;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Three sweeping optical conduits branching cleanly to Neural Network / Command / Nodes
      branches.forEach((bx, idx) => {
        const proximity = Math.max(0, 1 - Math.abs(smoothIdx - idx));
        const cp1x = cx + (bx - cx) * 0.24;
        const cp1y = splitY + (targetY - splitY) * 0.45;
        const cp2x = bx - (bx - cx) * 0.14;
        const cp2y = targetY - (targetY - splitY) * 0.25;

        const bGrad = ctx.createLinearGradient(cx, splitY, bx, targetY);
        if (proximity > 0.05) {
          bGrad.addColorStop(0, `rgba(240, 181, 74, ${(0.12 + 0.44 * proximity).toFixed(3)})`);
          bGrad.addColorStop(0.65, `rgba(240, 181, 74, ${(0.08 + 0.26 * proximity).toFixed(3)})`);
          bGrad.addColorStop(1, "rgba(240, 181, 74, 0)");
        } else {
          bGrad.addColorStop(0, "rgba(255, 255, 255, 0.06)");
          bGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        }

        ctx.beginPath();
        ctx.moveTo(cx, splitY);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, targetY);
        ctx.strokeStyle = bGrad;
        ctx.lineWidth = 0.9 + proximity * 0.55;
        ctx.stroke();

        // Travelling golden optical packet gliding down the active conduit
        if (proximity > 0.2 && !reduceMotion) {
          const u = (clock * 0.36 + idx * 0.17) % 1;
          const inv = 1 - u;
          const px =
            inv * inv * inv * cx +
            3 * inv * inv * u * cp1x +
            3 * inv * u * u * cp2x +
            u * u * u * bx;
          const py =
            inv * inv * inv * splitY +
            3 * inv * inv * u * cp1y +
            3 * inv * u * u * cp2y +
            u * u * u * targetY;
          const fade = Math.sin(Math.PI * u) * proximity;
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
          glow.addColorStop(0, `rgba(255, 245, 214, ${(0.85 * fade).toFixed(3)})`);
          glow.addColorStop(0.35, `rgba(240, 181, 74, ${(0.42 * fade).toFixed(3)})`);
          glow.addColorStop(1, "rgba(240, 181, 74, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Pinpoint golden junction jewel where the vertical spine splits into the 3 ecosystem layers
      const hubGlow = ctx.createRadialGradient(cx, splitY, 0, cx, splitY, 22);
      hubGlow.addColorStop(0, "rgba(255, 246, 220, 0.92)");
      hubGlow.addColorStop(0.24, "rgba(240, 181, 74, 0.38)");
      hubGlow.addColorStop(1, "rgba(240, 181, 74, 0)");
      ctx.fillStyle = hubGlow;
      ctx.beginPath();
      ctx.arc(cx, splitY, 22, 0, Math.PI * 2);
      ctx.fill();

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

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-x-0 top-0 h-[560px] w-full"
      aria-hidden="true"
    />
  );
}

const BRIDGE_EVENTS: Record<EcosystemLayer, string> = {
  network: "nexus:intent",
  command: "command:focus-changed",
  nodes: "studio:take-routed",
};

/**
 * Ground-up interactive SVG shared-ecosystem schematic showing Neural Network, Command, and Nodes
 * wired together through one bidirectional nexusBus. Clicking any node switches the main stage.
 */
export function EcosystemBridgeVisual({
  activeLayer,
  onSelect,
}: {
  activeLayer: EcosystemLayer;
  onSelect: (layer: EcosystemLayer) => void;
}) {
  const eventTopic = BRIDGE_EVENTS[activeLayer];
  const nodes: Array<{ id: EcosystemLayer; label: string; sub: string; cx: number }> = [
    { id: "network", label: "Neural Network", sub: "Assistant", cx: 74 },
    { id: "command", label: "Command", sub: "Dashboard", cx: 220 },
    { id: "nodes", label: "Nodes", sub: "Extensions", cx: 366 },
  ];

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-white/[0.09] bg-[#09090d]/90 p-4">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="font-medium text-[#d1d1d6]">Shared signal bus</span>
        <span className="font-mono text-[11px] text-[#9d9da6]">{eventTopic}</span>
      </div>

      <svg
        viewBox="0 0 440 116"
        className="mt-1.5 block h-auto w-full overflow-visible"
        role="group"
        aria-label="Interactive Nexus shared ecosystem diagram"
      >
        <defs>
          <linearGradient id="eco-bridge-gold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f0b54a" stopOpacity="0.22" />
            <stop offset="50%" stopColor="#ffd99a" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#f0b54a" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Upper arched direct bus link (Neural Network <-> Nodes) */}
        <path
          d="M 74 48 C 146 6, 294 6, 366 48"
          fill="none"
          stroke={activeLayer !== "command" ? "url(#eco-bridge-gold)" : "rgba(255,255,255,0.14)"}
          strokeWidth={activeLayer !== "command" ? 1.35 : 1}
          strokeDasharray="4 4"
        />

        {/* Direct horizontal bus lines (Network <-> Command <-> Nodes) */}
        <line
          x1="100"
          y1="48"
          x2="194"
          y2="48"
          stroke={activeLayer === "network" || activeLayer === "command" ? "#f0b54a" : "rgba(255,255,255,0.16)"}
          strokeOpacity={activeLayer === "network" || activeLayer === "command" ? 0.72 : 1}
          strokeWidth="1.25"
        />
        <line
          x1="246"
          y1="48"
          x2="340"
          y2="48"
          stroke={activeLayer === "command" || activeLayer === "nodes" ? "#f0b54a" : "rgba(255,255,255,0.16)"}
          strokeOpacity={activeLayer === "command" || activeLayer === "nodes" ? 0.72 : 1}
          strokeWidth="1.25"
        />

        {/* Animated travelling signal beads along the shared bus */}
        <circle r="2.6" fill="#fff7e2">
          <animateMotion dur="2.8s" repeatCount="indefinite" path="M 74 48 L 220 48 L 366 48" />
        </circle>
        <circle r="2.2" fill="#f0b54a">
          <animateMotion dur="3.6s" repeatCount="indefinite" path="M 366 48 C 294 6, 146 6, 74 48" />
        </circle>

        {/* Three Interactive Architectural Layer Nodes */}
        {nodes.map((node) => {
          const isSelected = activeLayer === node.id;
          return (
            <g
              key={node.id}
              onClick={() => onSelect(node.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${node.label}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(node.id);
                }
              }}
            >
              {isSelected ? (
                <circle
                  cx={node.cx}
                  cy="48"
                  r="24"
                  fill="none"
                  stroke="#f0b54a"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                  strokeDasharray="14 18"
                  className="neural-reticle-orbit"
                />
              ) : null}
              <circle
                cx={node.cx}
                cy="48"
                r="18"
                fill={isSelected ? "#17171c" : "#0e0e12"}
                stroke={isSelected ? "#f0b54a" : "rgba(255,255,255,0.18)"}
                strokeWidth={isSelected ? 1.5 : 1}
              />
              <circle
                cx={node.cx}
                cy="48"
                r="4"
                fill={isSelected ? "#f0b54a" : "rgba(245,245,247,0.45)"}
              />
              <text
                x={node.cx}
                y="88"
                textAnchor="middle"
                fill={isSelected ? "#f5f5f7" : "#a1a1a6"}
                fontSize="11.5"
                fontWeight={isSelected ? 600 : 500}
              >
                {node.label}
              </text>
              <text
                x={node.cx}
                y="104"
                textAnchor="middle"
                fill={isSelected ? "#d1d1d6" : "#7c7c85"}
                fontSize="10"
              >
                {node.sub}
              </text>
            </g>
          );
        })}
      </svg>
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
      style={{ background: isLight ? "#ffffff" : "#070709" }}
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
            : "linear-gradient(0deg, rgba(7,7,9,0.94) 0%, rgba(7,7,9,0.58) 18%, rgba(7,7,9,0) 40%)",
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
