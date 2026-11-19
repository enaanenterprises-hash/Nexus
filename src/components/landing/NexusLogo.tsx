import Image from "next/image";
import wordmark from "@/assets/brand/nexus-wordmark.png";

/**
 * Flat 2D geometric three-blade Nexus mark constructed in exact 120° rotational symmetry.
 * Adapts flat burnished gold automatically between Gallery Light and Obsidian Dark grounds,
 * or accepts an explicit flat fill color via `fill` / Tailwind text color when `variant="current"`.
 */
export function NexusMark({
  className = "",
  variant = "gold",
}: {
  className?: string;
  variant?: "gold" | "obsidian" | "current";
}) {
  const fill =
    variant === "current"
      ? "currentColor"
      : variant === "obsidian"
        ? "#0e0f12"
        : "var(--nexus-mark-fill, #c9932c)";

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Nexus"
      className={`nexus-flat-mark block aspect-square shrink-0 select-none ${className}`}
      fill="none"
    >
      <g className="nexus-mark-rotor" fill={fill}>
        {/* Three identical flat chamfered blades rotated 0°, 120°, 240° around optical center (50, 52) */}
        <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" />
        <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" transform="rotate(120 50 52)" />
        <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" transform="rotate(240 50 52)" />
      </g>
    </svg>
  );
}

/** Chrome NEXUS wordmark for legacy dark auxiliary routes. */
export function NexusWordmark({ className = "", preload = true }: { className?: string; preload?: boolean }) {
  return (
    <Image
      src={wordmark}
      alt="Nexus"
      unoptimized
      preload={preload}
      draggable={false}
      className={`select-none ${className}`}
    />
  );
}
