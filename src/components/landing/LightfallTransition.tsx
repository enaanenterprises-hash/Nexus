"use client";

import Lightfall from "./Lightfall";

/**
 * Seamless Gallery Light (#ffffff) -> Obsidian Dark (#000000) transition.
 *
 * Uses a single-pass WebGL2 C2-continuous Oklab perceptual lightness ramp with
 * triangular-PDF sub-pixel dithering and integrated golden <Lightfall /> streaks —
 * zero overlapping CSS layers, zero Mach-band inflection shelves, and zero 8-bit banding.
 */
export function LightfallTransition() {
  return (
    <div
      id="lightfall-transition"
      aria-hidden="true"
      className="relative h-[460px] w-full select-none overflow-hidden sm:h-[540px] lg:h-[600px]"
      style={{
        // Matching top-edge Gaussian Oklab fallback for SSR / non-WebGL frames
        background:
          "linear-gradient(180deg, #ffffff 0%, #ebeae8 4%, #b9b8b5 8%, #7c7b78 12%, #474644 16%, #222120 20%, #0e0e0e 24%, #050505 28%, #010101 32%, #000000 38%, #000000 100%)",
      }}
    >
      <div className="absolute inset-0">
        <Lightfall
          colors={["#eab308"]}
          backgroundColor="#ffffff"
          speed={0.3}
          streakCount={3}
          streakWidth={0.8}
          twinkle={0.3}
          backgroundGlow={0}
          headGlow={0.6}
          bloom={0.35}
          mouseInteraction={false}
          holdToWarp
          intro
          backdropTransition
          mouseRadius={0.5}
        />
      </div>
    </div>
  );
}
