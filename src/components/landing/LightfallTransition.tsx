"use client";

import Lightfall from "./Lightfall";

/**
 * Architectural Gallery Light (#ffffff) -> Obsidian Dark (#000000) transition
 * driven by the WebGL2 golden Lightfall warp curtain.
 */
export function LightfallTransition() {
  return (
    <div
      id="lightfall-transition"
      aria-hidden="true"
      className="relative h-[460px] w-full select-none overflow-hidden sm:h-[540px] lg:h-[600px]"
      style={{
        background:
          "linear-gradient(180deg, #ffffff 0%, #f5f3ee 10%, #1c1a16 32%, #070709 54%, #000000 100%)",
      }}
    >
      {/* WebGL2 Golden Lightfall Tunnel */}
      <div className="absolute inset-0">
        <Lightfall
          colors={["#eab308"]}
          backgroundColor="#ffffff"
          speed={0.3}
          streakCount={3}
          streakWidth={0.8}
          twinkle={0.3}
          backgroundGlow={0.02}
          headGlow={0.6}
          bloom={0.35}
          mouseInteraction={false}
          holdToWarp
          intro
          mouseRadius={0.5}
        />
      </div>

      {/* Seamless luminous top feather emerging out of the white Editorial Manifesto */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-44 sm:h-52"
        style={{
          background:
            "linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.92) 22%, rgba(255, 255, 255, 0.42) 56%, rgba(255, 255, 255, 0) 100%)",
        }}
      />

      {/* Seamless obsidian floor feather dissolving cleanly into the black Workspace band */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 sm:h-40"
        style={{
          background:
            "linear-gradient(0deg, #000000 0%, rgba(0, 0, 0, 0.82) 34%, rgba(0, 0, 0, 0) 100%)",
        }}
      />
    </div>
  );
}
