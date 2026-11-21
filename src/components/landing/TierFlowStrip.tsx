"use client";

import { AudioWaveform, LayoutGrid, Sparkles, type LucideIcon } from "lucide-react";
import { TierSilkCanvas } from "./OpticalCanvases";
import type { EcosystemLayer } from "./WorkspaceVisuals";

type FlowLens = {
  id: EcosystemLayer;
  title: string;
  role: string;
  signal: string;
  isNetwork: boolean;
  icon: LucideIcon;
};

const FLOW_LENSES: readonly FlowLens[] = [
  {
    id: "network",
    title: "Network",
    role: "Ask",
    signal: "“Send clips over 5m to Drive”",
    isNetwork: true,
    icon: Sparkles,
  },
  {
    id: "command",
    title: "Command",
    role: "Route",
    signal: "Drive & Gmail · Scoped vault",
    isNetwork: false,
    icon: LayoutGrid,
  },
  {
    id: "nodes",
    title: "Nodes",
    role: "Execute",
    signal: "Studio → 2 clips over 5:00",
    isNetwork: false,
    icon: AudioWaveform,
  },
] as const;

/**
 * Borderless sculptural 3-lens optical bridge directly on #111216:
 * Network gleams in 24k Gold while Command and Nodes operate in platinum-silver.
 */
export function TierFlowStrip({
  activeLayer,
  onSelect,
}: {
  activeLayer: EcosystemLayer;
  onSelect: (layer: EcosystemLayer) => void;
}) {
  const activeLens = FLOW_LENSES.find((lens) => lens.id === activeLayer) ?? FLOW_LENSES[0]!;

  return (
    <div
      className="flex flex-col items-center py-2"
      role="group"
      aria-label="Nexus 3-tier request flow"
    >
      {/* Quiet contextual signal pill */}
      <div
        key={activeLens.id}
        className="lp-stage-panel inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.09] bg-[#16171d] px-3.5 py-1.5 text-[12.5px] text-[#d1d1d6]"
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            activeLens.isNetwork ? "bg-[#f0b54a]" : "bg-[#f5f5f7]"
          }`}
          aria-hidden="true"
        />
        <span className="truncate">{activeLens.signal}</span>
      </div>

      {/* Living Canvas2D Silk Bridge + 3 Precision Concentric Reticles */}
      <div className="relative mx-auto mt-4 w-full max-w-[600px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[56px]">
          <TierSilkCanvas activeLayer={activeLayer} />
        </div>

        <div className="relative z-10 grid grid-cols-3 items-start">
          {FLOW_LENSES.map((lens) => {
            const Icon = lens.icon;
            const isSelected = lens.id === activeLayer;
            const isNetwork = lens.isNetwork;

            return (
              <button
                key={lens.id}
                type="button"
                onClick={() => onSelect(lens.id)}
                aria-pressed={isSelected}
                aria-label={`Select ${lens.title} tier`}
                className={`group flex min-h-[44px] cursor-pointer flex-col items-center rounded-[12px] text-center focus-visible:outline-2 focus-visible:outline-offset-4 ${
                  isNetwork ? "focus-visible:outline-[#f0b54a]" : "focus-visible:outline-white/75"
                }`}
              >
                <span
                  className={`relative flex h-[56px] w-[56px] items-center justify-center rounded-full border transition-colors duration-200 ${
                    isNetwork
                      ? isSelected
                        ? "border-[#f0b54a] bg-[#171511] text-[#ffd99a] shadow-[0_0_0_5px_rgba(240,181,74,0.1)]"
                        : "border-[#f0b54a]/45 bg-[#141418] text-[#f0b54a] group-hover:border-[#f0b54a]/80"
                      : isSelected
                        ? "border-[#f5f5f7] bg-[#191a21] text-[#f5f5f7] shadow-[0_0_0_5px_rgba(255,255,255,0.08)]"
                        : "border-white/20 bg-[#14151a] text-[#9d9da6] group-hover:border-white/45 group-hover:text-[#f5f5f7]"
                  }`}
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

                <span
                  className={`mt-3 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200 ${
                    isSelected ? "text-[#f5f5f7]" : "text-[#a1a1a6] group-hover:text-[#f5f5f7]"
                  }`}
                >
                  {lens.title}
                </span>
                <span className="mt-0.5 text-[11.5px] text-[#8e8e95]">{lens.role}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
