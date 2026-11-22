"use client";

import { memo, useMemo } from "react";
import type { ExtensionLink, NexusBrainState } from "@/lib/extensions";
import { BranchingNetworkCanvas, type BranchNodeMeta } from "./BranchingNetworkCanvas";

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
  links?: ExtensionLink[];
  theme?: "dark" | "light";
  socketLabels?: Array<{ monogram: string; name: string; status: string }>;
  /** Increments each time an extension snaps in; `index` is the socket. */
  snap: { index: number; serial: number } | null;
  /** Explicit node call / transfer trigger. */
  transfer?: StageTransfer | null;
  /** Currently opened or called socket index, if any. */
  activeSocket?: number | null;
  /** Skip drawing while a full view covers the stage. */
  paused?: boolean;
  /** Skip opening bloom delay and continue the singularity explosion straight into node unfurl. */
  fromSetupExplosion?: boolean;
};

const BRAIN_ENERGY: Record<NexusBrainState, number> = {
  idle: 0.18,
  responding: 0.68,
  thinking: 1.0,
};

/**
 * Nexus Network Stage:
 * Renders the 50-slot procedural branching filament canopy modeled on the Welcome page's
 * GoldenNetwork aesthetic, complete with capability-linked inter-node synapse bridges,
 * uncluttered node jewels, and a single floating Liquid Glass hover inspector.
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
  const theme = signal.theme ?? "dark";
  const energy = BRAIN_ENERGY[signal.brain];

  const branchNodes = useMemo<BranchNodeMeta[]>(() => {
    const labels = signal.socketLabels ?? [];
    return signal.sockets.map((status, idx) => {
      const meta = labels[idx];
      return {
        status,
        monogram: meta?.monogram ?? "",
        name: meta?.name ?? (status === "open" ? "Open slot" : "Branch slot"),
        tierLabel: status === "occupied" ? "Live node" : status === "open" ? "Free slot" : "Pro branch",
      };
    });
  }, [signal.sockets, signal.socketLabels]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: theme === "light" ? "#faf8f2" : "#070709" }}
    >
      <BranchingNetworkCanvas
        theme={theme}
        nodes={branchNodes}
        links={signal.links ?? []}
        energy={energy}
        activeNodeIndex={typeof signal.activeSocket === "number" ? signal.activeSocket : null}
        snap={signal.snap}
        transfer={signal.transfer ?? null}
        paused={signal.paused}
        mode="stage"
        onSelectNode={onSelectSocket}
      />
    </div>
  );
});
