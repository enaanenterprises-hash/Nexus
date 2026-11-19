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
        // Matching raised-cosine Oklab fallback for SSR / non-WebGL frames (single monotonic curve, zero seams)
        background:
          "linear-gradient(180deg, #ffffff 0%, #faf9f6 10%, #e4e2dc 20%, #c1beb7 30%, #96938c 40%, #6a6862 50%, #42413d 60%, #22211f 70%, #0d0d0c 80%, #030303 90%, #000000 100%)",
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
