import { ArchitectureOverview } from "./ArchitectureOverview";
import { CommandTier } from "./CommandTier";
import { CommandScene } from "./CommandScene";
import { LandingCTA } from "./LandingCTA";
import { NetworkTier } from "./NetworkTier";
import { NetworkScene } from "./NetworkScene";
import { NodesTier } from "./NodesTier";
import { SocketScene } from "./SocketScene";

export function LandingScenes() {
  return (
    <div className="landing-content">
      {/* 1. Architecture Overview: Three Tiers, Zero AI Lock-in */}
      <ArchitectureOverview />

      {/* 2. Tier 01: Network (Front Door & Contextual Intelligence) */}
      <NetworkScene />
      <NetworkTier />

      {/* 3. Tier 02: Command (Telemetry Cockpit & Deterministic Rules) */}
      <CommandScene />
      <CommandTier />

      {/* 4. Tier 03: Nodes (Standalone Apps & Shared Event Bus) */}
      <SocketScene />
      <NodesTier />

      {/* 5. Call To Action */}
      <LandingCTA />
    </div>
  );
}
