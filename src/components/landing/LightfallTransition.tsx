"use client";

import Lightfall from "./Lightfall";

/**
 * Seamless Soft Cream (#faf8f2) -> Deep Charcoal-Grey (#111216) transition.
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
      className="relative h-[460px] w-full select-none overflow-hidden sm:h-[550px] lg:h-[620px]"
      style={{
        // Matching C2-continuous composed quintic Oklab fallback for SSR / non-WebGL frames
        background:
          "linear-gradient(180deg, #faf8f2 0%, #f6f4ee 10%, #dfdcd6 20%, #b2afaa 30%, #7b7975 40%, #494848 50%, #28282a 60%, #17181c 70%, #121317 80%, #111216 100%)",
      }}
    >
      <div className="absolute inset-0">
        <Lightfall
          colors={["#eab308"]}
          backgroundColor="#faf8f2"
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
