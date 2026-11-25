"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, AudioWaveform, LayoutGrid, Sparkles, type LucideIcon } from "lucide-react";
import { TRIANGLE_NODE_RADIUS, TRIANGLE_VERTICES, TierTriangleCanvas } from "./TierTriangleCanvas";
import type { EcosystemLayer } from "./WorkspaceVisuals";

type FlowLens = {
  id: EcosystemLayer;
  title: string;
  role: string;
  icon: LucideIcon;
};

const FLOW_LENSES: readonly FlowLens[] = [
  { id: "network", title: "Network", role: "Ask", icon: Sparkles },
  { id: "command", title: "Command", role: "Route", icon: LayoutGrid },
  { id: "nodes", title: "Nodes", role: "Execute", icon: AudioWaveform },
];

const LAYER_TITLE: Record<EcosystemLayer, string> = {
  network: "Network",
  command: "Command",
  nodes: "Nodes",
};

type Hop = { from: EcosystemLayer; to: EcosystemLayer; signal: string };

/** One request travelling the full triangle: ask, route, execute, report back. */
const HOPS: readonly Hop[] = [
  { from: "network", to: "command", signal: "“Send clips over 5m to Drive”" },
  { from: "command", to: "nodes", signal: "Routed to Studio with Drive scope" },
  { from: "nodes", to: "network", signal: "2 clips over 5:00 filed in Drive" },
];

const HOP_INTERVAL_MS = 3400;

/**
 * Triangular request flow: Network, Command, and Nodes bound by living filaments.
 * Each hop lights the edge it travels along and names the connection in the centre.
 */
export function TierFlowStrip({
  activeLayer,
  onSelect,
}: {
  activeLayer: EcosystemLayer;
  onSelect: (layer: EcosystemLayer) => void;
}) {
  const [hopSerial, setHopSerial] = useState(0);
  const hop = HOPS[hopSerial % HOPS.length]!;
  const centroidY =
    (TRIANGLE_VERTICES.network.y + TRIANGLE_VERTICES.command.y + TRIANGLE_VERTICES.nodes.y) / 3;

  useEffect(() => {
    const id = window.setTimeout(() => setHopSerial((s) => s + 1), HOP_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [hopSerial]);

  function select(layer: EcosystemLayer) {
    onSelect(layer);
    setHopSerial((s) => {
      let next = s + 1;
      while (HOPS[next % HOPS.length]!.from !== layer) next++;
      return next;
    });
  }

  return (
    <div
      className="relative mx-auto w-full max-w-[600px] py-8 sm:py-2"
      role="group"
      aria-label="How Network, Command, and Nodes pass work between each other"
    >
      <div className="relative aspect-[6/5] w-full sm:aspect-[600/390]">
        <TierTriangleCanvas
          className="absolute inset-0"
          hopFrom={hop.from}
          hopTo={hop.to}
          hopSerial={hopSerial}
        />

        {/* The live connection, named at the heart of the triangle */}
        <div
          className="pointer-events-none absolute top-[62%] left-1/2 w-[42%] max-w-[152px] -translate-x-1/2 -translate-y-1/2 text-center sm:top-[var(--tri-centroid-y)] sm:w-[46%] sm:max-w-[240px]"
          style={{ "--tri-centroid-y": `${centroidY * 100}%` } as CSSProperties}
          aria-live="polite"
        >
          <div key={hopSerial} className="lp-stage-panel">
            <p className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#8e8e95] sm:gap-1.5 sm:text-[11px]">
              <span className={hop.from === "network" ? "text-[#f0b54a]" : "text-[#d1d1d6]"}>
                {LAYER_TITLE[hop.from]}
              </span>
              <ArrowRight className="size-3 text-[#6e6e76]" strokeWidth={1.75} aria-hidden="true" />
              <span className={hop.to === "network" ? "text-[#f0b54a]" : "text-[#d1d1d6]"}>
                {LAYER_TITLE[hop.to]}
              </span>
            </p>
            <p className="mt-1 text-[11px] leading-[1.35] text-[#e5e5ea] sm:text-[13px] sm:leading-snug">
              {hop.signal}
            </p>
          </div>
        </div>

        {FLOW_LENSES.map((lens) => {
          const Icon = lens.icon;
          const isSelected = lens.id === activeLayer;
          const isNetwork = lens.id === "network";
          const v = TRIANGLE_VERTICES[lens.id];
          const labelAbove = v.y < 0.5;

          return (
            <button
              key={lens.id}
              type="button"
              onClick={() => select(lens.id)}
              aria-pressed={isSelected}
              aria-label={`Select ${lens.title} tier`}
              style={{
                left: `${v.x * 100}%`,
                top: `${v.y * 100}%`,
                transform: labelAbove
                  ? `translate(-50%, calc(-100% + ${TRIANGLE_NODE_RADIUS}px))`
                  : `translate(-50%, -${TRIANGLE_NODE_RADIUS}px)`,
              }}
              className={`group absolute z-10 flex cursor-pointer items-center gap-2.5 rounded-[12px] text-center focus-visible:outline-2 focus-visible:outline-offset-4 ${
                labelAbove ? "flex-col-reverse" : "flex-col"
              } ${isNetwork ? "focus-visible:outline-[#f0b54a]" : "focus-visible:outline-white/75"}`}
            >
              <span
                className={`relative flex items-center justify-center rounded-full border transition-[border-color,color,box-shadow] duration-300 ${
                  isNetwork
                    ? isSelected
                      ? "border-[#f0b54a] bg-[#171511] text-[#ffd99a] shadow-[0_0_0_5px_rgba(240,181,74,0.1)]"
                      : "border-[#f0b54a]/45 bg-[#141418] text-[#f0b54a] group-hover:border-[#f0b54a]/80"
                    : isSelected
                      ? "border-[#f5f5f7] bg-[#191a21] text-[#f5f5f7] shadow-[0_0_0_5px_rgba(255,255,255,0.08)]"
                      : "border-white/20 bg-[#14151a] text-[#9d9da6] group-hover:border-white/45 group-hover:text-[#f5f5f7]"
                }`}
                style={{ width: TRIANGLE_NODE_RADIUS * 2, height: TRIANGLE_NODE_RADIUS * 2 }}
              >
                {isSelected ? (
                  <span
                    className={`pointer-events-none absolute inset-1.5 rounded-full border ${
                      isNetwork ? "border-[#f0b54a]/40" : "border-white/30"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <Icon className="relative z-10 size-4" strokeWidth={1.5} aria-hidden="true" />
              </span>

              <span className="flex flex-col items-center whitespace-nowrap">
                <span
                  className={`text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200 ${
                    isSelected ? "text-[#f5f5f7]" : "text-[#a1a1a6] group-hover:text-[#f5f5f7]"
                  }`}
                >
                  {lens.title}
                </span>
                <span className="mt-0.5 text-[11.5px] text-[#8e8e95]">{lens.role}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
