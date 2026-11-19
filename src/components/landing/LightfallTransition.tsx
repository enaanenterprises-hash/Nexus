"use client";

import Lightfall from "./Lightfall";

/**
 * Perceptually smoothed Gallery Light (#ffffff) -> Obsidian Dark (#000000) transition
 * using a long warm-gamma skylight curve and masked WebGL2 golden Lightfall streaks
 * (zero harsh horizontal seam or cold grey midpoint band).
 */
export function LightfallTransition() {
  return (
    <div
      id="lightfall-transition"
      aria-hidden="true"
      className="relative h-[560px] w-full select-none overflow-hidden sm:h-[660px] lg:h-[760px]"
      style={{
        background: [
          // Soft curved sunlit skylight dome pouring from the white Editorial Manifesto above
          "radial-gradient(ellipse 135% 56% at 50% -4%, #ffffff 0%, rgba(255, 255, 255, 0.96) 24%, rgba(252, 249, 242, 0.72) 44%, rgba(234, 198, 120, 0.14) 66%, rgba(0, 0, 0, 0) 88%)",
          // Warm whisper of 24k gold light right across the twilight shoulder so midtones never look muddy grey
          "radial-gradient(ellipse 90% 34% at 50% 34%, rgba(234, 179, 8, 0.11) 0%, rgba(234, 179, 8, 0.04) 48%, rgba(0, 0, 0, 0) 82%)",
          // 14-stop perceptually eased gamma ramp from pure #ffffff to pure #000000
          "linear-gradient(180deg, #ffffff 0%, #fdfcf9 8%, #f8f5ee 15%, #ece6d9 22%, #d5ccb9 29%, #b0a38d 36%, #7f725d 43%, #4f4536 50%, #2a241b 58%, #14110d 66%, #080706 74%, #030303 83%, #000000 92%, #000000 100%)",
        ].join(", "),
      }}
    >
      {/* WebGL2 Golden Lightfall Tunnel — softly masked at top & bottom so streaks emerge and dissolve naturally */}
      <div
        className="absolute inset-0"
        style={{
          maskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.06) 10%, rgba(0,0,0,0.38) 24%, rgba(0,0,0,0.82) 40%, #000000 54%, #000000 78%, rgba(0,0,0,0.45) 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.06) 10%, rgba(0,0,0,0.38) 24%, rgba(0,0,0,0.82) 40%, #000000 54%, #000000 78%, rgba(0,0,0,0.45) 90%, transparent 100%)",
        }}
      >
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

      {/* Subtle atmospheric top white kiss guaranteeing a 0px seamless join with EditorialManifesto */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 sm:h-28"
        style={{
          background:
            "linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.8) 38%, rgba(255, 255, 255, 0) 100%)",
        }}
      />
    </div>
  );
}
