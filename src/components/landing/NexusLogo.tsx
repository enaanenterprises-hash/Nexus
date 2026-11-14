import { useId } from "react";

/** Geometric chrome wordmark: stemless three-bar E, square U, flat-terminal S. */
export function NexusLogo({ className = "" }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 506 80"
      className={className}
      role="img"
      aria-label="Nexus"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#c9c9c9" />
          <stop offset="0.55" stopColor="#8f8f8f" />
          <stop offset="0.72" stopColor="#f2f2f2" />
          <stop offset="1" stopColor="#9a9a9a" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 72V8l68 64V8" />
        <path d="M110 8h68M110 40h68M110 72h68" />
        <path d="M214 8l70 64M284 8l-70 64" />
        <path d="M320 8v48q0 16 16 16h38q16 0 16-16V8" />
        <path d="M498 8h-56q-16 0-16 16t16 16h40q16 0 16 16t-16 16h-58" />
      </g>
    </svg>
  );
}
