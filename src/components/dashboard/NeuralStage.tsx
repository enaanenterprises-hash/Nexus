"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Plus } from "lucide-react";
import type { NexusBrainState } from "@/lib/extensions";
import type { Vec } from "@/lib/network/geometry";
import { NeuralThreadsWebGL } from "./NeuralThreadsWebGL";
import { computeStageLayout } from "./stage-layout";
import { VolumetricCoreGlow } from "./VolumetricCoreGlow";

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
 * Combines the volumetric core aura (adapted from <LightPillar />), flowing WebGL2 braided neural threads
 * & 5 orbital socket conduits (adapted from <WebThreads />), and precision concentric optical node reticles.
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
  const [pressPulseCount, setPressPulseCount] = useState<number>(0);

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

  const socketCount = signal.sockets.length;
  const theme = signal.theme ?? "dark";
  const isLight = theme === "light";
  const energy = BRAIN_ENERGY[signal.brain];

  const layout = useMemo(
    () => computeStageLayout(size.width, size.height, socketCount),
    [size.width, size.height, socketCount],
  );

  // Exact WebGL UV coordinates (bottom-up Y) synced sub-pixel with the DOM node buttons
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
      signal.sockets.map((status, idx) => {
        const base = status === "occupied" ? 1.0 : status === "open" ? 0.36 : 0.16;
        const hovered = hoveredIdx === idx ? 0.42 : 0;
        const active = signal.activeSocket === idx ? 0.35 : 0;
        return Math.min(1.45, base + hovered + active);
      }),
    [signal.sockets, hoveredIdx, signal.activeSocket],
  );

  // Derive combined arm surge signal from snap & transfer events without effect setState
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

  const volumetricPulseSerial =
    pressPulseCount + (signal.snap?.serial ?? 0) + (signal.transfer?.serial ?? 0);

  const handleLinePress = useCallback(() => {
    setPressPulseCount((c) => c + 1);
  }, []);

  const labels = signal.socketLabels ?? [];

  return (
    <div
      ref={stageRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: isLight ? "#ffffff" : "#070709" }}
    >
      {/* Layer 1: Volumetric Golden Core Aura (adapted from <LightPillar />) */}
      <VolumetricCoreGlow
        theme={theme}
        coreYNorm={coreUV.y}
        energy={energy}
        pulseSerial={volumetricPulseSerial}
        paused={signal.paused}
        skipIntro={signal.fromSetupExplosion}
      />

      {/* Layer 2: Flowing WebGL2 Braided Neural Threads & 5 Orbital Node Conduits (adapted from <WebThreads />) */}
      <NeuralThreadsWebGL
        theme={theme}
        coreUV={coreUV}
        socketsUV={socketsUV}
        socketTargets={socketTargets}
        energy={energy}
        armPulse={armPulse}
        onLinePress={handleLinePress}
        paused={signal.paused}
        skipIntro={signal.fromSetupExplosion}
      />

      {/* Layer 3: Precision Concentric Optical Node Reticles & Accessible 44px Anchors */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {layout.sockets.map((pt, idx) => {
          const status = signal.sockets[idx] ?? "locked";
          const meta = labels[idx];
          const name = meta?.name ?? (status === "open" ? "Open socket" : "Pro socket");
          const monogram = meta?.monogram ?? "";
          const isOccupied = status === "occupied";
          const isOpen = status === "open";
          const isActive = signal.activeSocket === idx;
          const isHovered = hoveredIdx === idx;

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
              }}
            >
              {/* Subtle Precision Optical Reticle */}
              <svg
                viewBox="0 0 44 44"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                aria-hidden="true"
              >
                {/* Frosted subtle well backing so glyph remains razor-sharp over flowing gold threads */}
                <circle
                  cx="22"
                  cy="22"
                  r={isOccupied ? 13.5 : 10.5}
                  fill={isLight ? "rgba(255, 255, 255, 0.84)" : "rgba(7, 7, 9, 0.72)"}
                />

                {/* Inner precision focal ring */}
                <circle
                  cx="22"
                  cy="22"
                  r={isOccupied ? 13.5 : 10.5}
                  fill="none"
                  stroke={isOccupied || isOpen ? "var(--land-gold)" : "currentColor"}
                  strokeOpacity={
                    isOccupied
                      ? isHovered || isActive
                        ? 0.95
                        : 0.7
                      : isOpen
                        ? isHovered
                          ? 0.78
                          : 0.42
                        : isHovered
                          ? 0.45
                          : 0.22
                  }
                  strokeWidth={isOccupied ? (isHovered || isActive ? 1.5 : 1.15) : 1}
                  strokeDasharray={isOccupied ? undefined : isOpen ? "2.5 3" : "1.5 3.5"}
                  style={{ transition: "stroke-opacity 220ms ease, stroke-width 220ms ease" }}
                />

                {/* Outer slow-orbiting optical arc for occupied / hovered nodes */}
                {isOccupied || isHovered || isActive ? (
                  <circle
                    cx="22"
                    cy="22"
                    r={isOccupied ? 19 : 16}
                    fill="none"
                    stroke="var(--land-gold)"
                    strokeOpacity={isHovered || isActive ? 0.65 : 0.3}
                    strokeWidth="0.95"
                    strokeDasharray="18 22 6 34"
                    strokeLinecap="round"
                    className="neural-reticle-orbit"
                  />
                ) : null}
              </svg>

              {/* Crisp centered monogram or glyph */}
              <span className="neural-node-glyph relative z-10 pointer-events-none flex items-center justify-center">
                {isOccupied ? (
                  <span className="text-[10px] font-semibold tracking-[0.02em]">{monogram}</span>
                ) : isOpen ? (
                  <Plus className="size-3" strokeWidth={1.85} aria-hidden />
                ) : (
                  <Lock className="size-2.5" strokeWidth={1.85} aria-hidden />
                )}
              </span>

              {/* Subtle floating architectural caption directly above the node */}
              <span className="neural-node-tag pointer-events-none">
                <span className="neural-node-tag-name">{name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
