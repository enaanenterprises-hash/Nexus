"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Plus } from "lucide-react";
import type { NexusBrainState } from "@/lib/extensions";
import type { Vec } from "@/lib/network/geometry";
import { NeuralThreadsWebGL } from "./NeuralThreadsWebGL";
import { computeStageLayout } from "./stage-layout";

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
  /** Skip opening bloom delay and continue the singularity explosion straight into node unfurl. */
  fromSetupExplosion?: boolean;
};

const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.16,
  responding: 0.68,
  thinking: 1.0,
};

/**
 * Nexus Network Stage:
 * Unified Singularity Canopy rendered in WebGL2 (5 S-curved braided orbital arms +
 * whispered basal horizon cradle + compact pearl-gold Singularity Core) paired sub-pixel
 * with precision concentric optical node reticles.
 */
export const NeuralStage = memo(function NeuralStage({
  signal,
  onSelectSocket,
  className = "",
}: {
  signal: StageSignal;
  onSelectSocket?: (socketIndex: number) => void;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 1280, height: 800 });
  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);
  const [nodesRevealed, setNodesRevealed] = useState<boolean>(Boolean(signal.fromSetupExplosion));

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

    const observer = new ResizeObserver(update);
    observer.observe(el);
    const frame = window.requestAnimationFrame(update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Bloom concentric node reticles smoothly as the unfurling braided arms arrive at each socket waist
  useEffect(() => {
    if (nodesRevealed) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const delayMs = reduced ? 0 : 420;
    const timer = window.setTimeout(() => setNodesRevealed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [nodesRevealed]);

  const socketCount = signal.sockets.length;
  const theme = signal.theme ?? "dark";
  const isLight = theme === "light";
  const energy = BRAIN_ENERGY[signal.brain];

  const layout = useMemo(
    () => computeStageLayout(size.width, size.height, socketCount),
    [size.width, size.height, socketCount],
  );

  // Exact WebGL UV coordinates (bottom-up Y) synced sub-pixel with DOM optical reticles
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

  const socketTargets = useMemo(
    () =>
      signal.sockets.map((status) =>
        status === "occupied" ? 1.0 : status === "open" ? 0.52 : 0.24,
      ),
    [signal.sockets],
  );

  const activeOrHoveredSocket =
    hoveredIdx >= 0 ? hoveredIdx : typeof signal.activeSocket === "number" ? signal.activeSocket : -1;

  // Derive combined arm surge signal from snap & transfer events
  const armPulse = useMemo(() => {
    const snapSerial = signal.snap?.serial ?? 0;
    const transferSerial = signal.transfer?.serial ?? 0;
    if (snapSerial === 0 && transferSerial === 0) return null;
    const indices: number[] = [];
    if (signal.transfer) {
      if (signal.transfer.fromSocket >= 0) indices.push(signal.transfer.fromSocket);
      if (signal.transfer.toSocket >= 0) indices.push(signal.transfer.toSocket);
    }
    if (signal.snap && signal.snap.index >= 0 && !indices.includes(signal.snap.index)) {
      indices.push(signal.snap.index);
    }
    return {
      indices,
      serial: snapSerial * 1000 + transferSerial,
    };
  }, [signal.snap, signal.transfer]);

  const labels = signal.socketLabels ?? [];

  return (
    <div
      ref={stageRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: isLight ? "#ffffff" : "#070709" }}
    >
      {/* Unified WebGL2 Singularity Canopy — 5 S-curved braided arms, whispered horizon cradle & pearl-gold core */}
      <NeuralThreadsWebGL
        theme={theme}
        coreUV={coreUV}
        socketsUV={socketsUV}
        socketTargets={socketTargets}
        activeOrHoveredSocket={activeOrHoveredSocket}
        energy={energy}
        armPulse={armPulse}
        paused={signal.paused}
        skipIntro={signal.fromSetupExplosion}
      />

      {/* Precision Concentric Optical Node Reticles & Accessible 44px Anchors */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {layout.sockets.map((pt, idx) => {
          const status = signal.sockets[idx] ?? "locked";
          const meta = labels[idx];
          const name = meta?.name ?? (status === "open" ? "Add node" : "Pro socket");
          const monogram = meta?.monogram ?? "";
          const isOccupied = status === "occupied";
          const isOpen = status === "open";
          const isActive = signal.activeSocket === idx;
          const isHovered = hoveredIdx === idx;
          const centeredDist = Math.abs((idx / Math.max(socketCount - 1, 1) - 0.5) * 2);
          const staggerMs = Math.round(centeredDist * 140);

          return (
            <button
              key={idx}
              type="button"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx((cur) => (cur === idx ? -1 : cur))}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx((cur) => (cur === idx ? -1 : cur))}
              onClick={() => onSelectSocket?.(idx)}
              aria-label={
                isOccupied
                  ? `Open ${name} node`
                  : isOpen
                    ? `Snap a node into free socket ${idx + 1}`
                    : `Locked Pro socket ${idx + 1}`
              }
              className={`neural-node-anchor group pointer-events-auto absolute top-0 left-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--land-gold)] ${
                isOccupied
                  ? "neural-node-anchor--live"
                  : isOpen
                    ? "neural-node-anchor--open"
                    : "neural-node-anchor--locked"
              } ${isActive ? "neural-node-anchor--active" : ""}`}
              style={{
                transform: `translate3d(${pt.x - 22}px, ${pt.y - 22}px, 0)`,
                opacity: nodesRevealed ? 1 : 0,
                transitionDelay: nodesRevealed ? `${staggerMs}ms` : "0ms",
              }}
            >
              <span
                className="relative flex h-full w-full items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  transform: nodesRevealed ? "scale(1)" : "scale(0.84)",
                  transitionDelay: nodesRevealed ? `${staggerMs}ms` : "0ms",
                }}
              >
                {/* Concentric Optical Instrument Reticle */}
                <svg
                  viewBox="0 0 44 44"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  aria-hidden="true"
                >
                  {/* Frosted matte optical well so monograms & glyphs sit with crystal clarity on the waist pinch */}
                  <circle
                    cx="22"
                    cy="22"
                    r={isOccupied ? 14 : isOpen ? 12 : 11}
                    fill={
                      isLight
                        ? isOccupied
                          ? "rgba(255, 255, 255, 0.92)"
                          : "rgba(255, 255, 255, 0.84)"
                        : isOccupied
                          ? "rgba(10, 10, 14, 0.84)"
                          : "rgba(10, 10, 14, 0.72)"
                    }
                  />

                  {/* Subtle inner specular rim for occupied nodes */}
                  {isOccupied ? (
                    <circle
                      cx="22"
                      cy="22"
                      r="11.5"
                      fill="none"
                      stroke={isLight ? "rgba(200, 141, 24, 0.2)" : "rgba(255, 232, 175, 0.16)"}
                      strokeWidth="0.75"
                    />
                  ) : null}

                  {/* Primary focal ring */}
                  <circle
                    cx="22"
                    cy="22"
                    r={isOccupied ? 14 : isOpen ? 12 : 11}
                    fill="none"
                    stroke={isOccupied || isOpen ? "var(--land-gold)" : "currentColor"}
                    strokeOpacity={
                      isOccupied
                        ? isHovered || isActive
                          ? 1
                          : 0.78
                        : isOpen
                          ? isHovered
                            ? 0.88
                            : 0.48
                          : isHovered
                            ? 0.56
                            : 0.28
                    }
                    strokeWidth={isOccupied ? (isHovered || isActive ? 1.55 : 1.2) : 1.05}
                    strokeDasharray={isOccupied ? undefined : isOpen ? "3 3" : undefined}
                    style={{ transition: "stroke-opacity 220ms ease, stroke-width 220ms ease" }}
                  />

                  {/* Precision cardinal compass ticks on live & hovered nodes */}
                  {isOccupied || isHovered || isActive ? (
                    <g
                      stroke="var(--land-gold)"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeOpacity={isHovered || isActive ? 0.85 : 0.4}
                      style={{ transition: "stroke-opacity 220ms ease" }}
                    >
                      <line x1="22" y1="3.5" x2="22" y2="5.8" />
                      <line x1="22" y1="38.2" x2="22" y2="40.5" />
                      <line x1="3.5" y1="22" x2="5.8" y2="22" />
                      <line x1="38.2" y1="22" x2="40.5" y2="22" />
                    </g>
                  ) : null}

                  {/* Whisper-thin slow-orbiting outer arc on hover or active focus */}
                  {isHovered || isActive ? (
                    <circle
                      cx="22"
                      cy="22"
                      r={isOccupied ? 19.5 : 17}
                      fill="none"
                      stroke="var(--land-gold)"
                      strokeOpacity="0.55"
                      strokeWidth="0.9"
                      strokeDasharray="16 24 6 34"
                      strokeLinecap="round"
                      className="neural-reticle-orbit"
                    />
                  ) : null}
                </svg>

                {/* Crisp centered monogram or glyph */}
                <span className="neural-node-glyph relative z-10 pointer-events-none flex items-center justify-center">
                  {isOccupied ? (
                    <span className="text-[10.5px] font-semibold tracking-[0.02em]">{monogram}</span>
                  ) : isOpen ? (
                    <Plus className="size-3" strokeWidth={1.85} aria-hidden />
                  ) : (
                    <Lock className="size-2.5" strokeWidth={1.85} aria-hidden />
                  )}
                </span>
              </span>

              {/* Architectural Liquid Glass caption directly above the reticle */}
              <span className="neural-node-tag pointer-events-none">
                {isOccupied ? (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--land-gold)]"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="neural-node-tag-name">{name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
