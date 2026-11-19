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
      className="relative -mt-8 h-[480px] w-full select-none overflow-hidden sm:-mt-10 sm:h-[580px] lg:-mt-12 lg:h-[660px]"
      style={{
        // Matching C2-continuous composed quintic Oklab fallback for SSR / non-WebGL frames
        background:
          "linear-gradient(180deg, #ffffff 0%, #f9f9f8 10%, #dbd9d5 20%, #a3a19c 30%, #62605d 40%, #2c2b29 50%, #0e0e0e 60%, #020202 70%, #000000 80%, #000000 100%)",
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
