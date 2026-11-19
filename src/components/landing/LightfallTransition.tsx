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
      className="relative h-[720px] w-full select-none overflow-hidden sm:h-[840px] lg:h-[960px]"
      style={{
        // Matching 21-stop C2 Oklab fallback for SSR / non-WebGL frames (single monotonic curve, zero seams)
        background:
          "linear-gradient(180deg, #ffffff 0%, #ffffff 5%, #fdfdfb 10%, #f9f8f4 15%, #f0efe9 20%, #e3e1da 25%, #d1cfc7 30%, #bcb9b1 35%, #a3a098 40%, #87847d 45%, #6a6862 50%, #4e4d48 55%, #353431 60%, #21201e 65%, #121211 70%, #090908 75%, #030303 80%, #010101 85%, #000000 90%, #000000 100%)",
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
