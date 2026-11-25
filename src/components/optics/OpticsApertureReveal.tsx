"use client";

import { useEffect, useState } from "react";

const IRIS_BLADE_ANGLES = [0, 40, 80, 120, 160, 200, 240, 280, 320] as const;

/**
 * Handcrafted ~720ms Optical Iris & Anamorphic Gold Slit reveal when opening Nexus Optics.
 * Pure CSS + vector iris geometry; respects `prefers-reduced-motion` automatically.
 */
export function OpticsApertureReveal({
  triggerKey,
}: {
  triggerKey: number;
}) {
  const [phase, setPhase] = useState<"idle" | "active" | "done">("active");

  useEffect(() => {
    if (triggerKey <= 0) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const id = window.requestAnimationFrame(() => setPhase("done"));
      return () => window.cancelAnimationFrame(id);
    }

    const startId = window.requestAnimationFrame(() => setPhase("active"));
    const timer = window.setTimeout(() => setPhase("done"), 760);
    return () => {
      window.cancelAnimationFrame(startId);
      window.clearTimeout(timer);
    };
  }, [triggerKey]);

  if (phase === "done") return null;

  return (
    <div
      aria-hidden="true"
      className={`optics-aperture-reveal ${phase === "active" ? "optics-aperture-reveal--run" : ""}`}
    >
      {/* Precision 9-blade optical iris rings */}
      <svg
        viewBox="-160 -160 320 320"
        className="optics-aperture-svg"
      >
        <defs>
          <radialGradient id="optics-slit-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(240, 181, 74, 0.28)" />
            <stop offset="55%" stopColor="rgba(240, 181, 74, 0.08)" />
            <stop offset="100%" stopColor="rgba(240, 181, 74, 0)" />
          </radialGradient>
        </defs>

        <circle cx="0" cy="0" r="144" fill="url(#optics-slit-grad)" />
        <circle
          cx="0"
          cy="0"
          r="118"
          fill="none"
          stroke="rgba(240, 181, 74, 0.34)"
          strokeWidth="0.75"
          strokeDasharray="3 5"
        />
        <circle
          cx="0"
          cy="0"
          r="64"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.24"
          strokeWidth="0.9"
        />

        {IRIS_BLADE_ANGLES.map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path
              d="M -26 -58 Q 28 -44 74 28 L 92 -48 Q 36 -84 -26 -58 Z"
              fill="none"
              stroke="rgba(240, 181, 74, 0.42)"
              strokeWidth="0.85"
            />
          </g>
        ))}

        {/* Precision optical crosshair ticks */}
        <line x1="-132" y1="0" x2="-74" y2="0" stroke="rgba(240, 181, 74, 0.55)" strokeWidth="1" />
        <line x1="74" y1="0" x2="132" y2="0" stroke="rgba(240, 181, 74, 0.55)" strokeWidth="1" />
        <line x1="0" y1="-132" x2="0" y2="-74" stroke="rgba(240, 181, 74, 0.55)" strokeWidth="1" />
        <line x1="0" y1="74" x2="0" y2="132" stroke="rgba(240, 181, 74, 0.55)" strokeWidth="1" />
      </svg>

      {/* Razor-thin horizontal golden light slit */}
      <div className="optics-aperture-slit" />

      {/* Optical glass engraving */}
      <div className="optics-aperture-caption">
        <span className="font-mono text-[11.5px] tracking-normal text-[color:var(--land-gold)] tabular-nums">
          Optics · f/1.4
        </span>
      </div>
    </div>
  );
}
