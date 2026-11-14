"use client";

/** Soft SVG mesh behind the hub — visual only, not interactive. */
export function NetworkCanvas() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3ecfbe" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5a8fb0" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Mesh links */}
      <g stroke="url(#linkGrad)" strokeWidth="1.2" fill="none">
        <path className="motion-orbit" strokeDasharray="6 10" d="M600 400 L280 180" />
        <path className="motion-orbit" strokeDasharray="6 10" d="M600 400 L920 170" />
        <path className="motion-orbit" strokeDasharray="5 12" d="M600 400 L230 470" />
        <path className="motion-orbit" strokeDasharray="5 12" d="M600 400 L970 460" />
        <path className="motion-orbit" strokeDasharray="4 14" d="M600 400 L420 650" />
        <path className="motion-orbit" strokeDasharray="4 14" d="M600 400 L780 640" />
        <path d="M280 180 L420 650" opacity="0.25" />
        <path d="M920 170 L780 640" opacity="0.25" />
        <path d="M230 470 L970 460" opacity="0.2" />
      </g>

      {/* Satellite nodes */}
      {[
        [280, 180],
        [920, 170],
        [230, 470],
        [970, 460],
        [420, 650],
        [780, 640],
        [600, 120],
        [150, 320],
        [1050, 320],
      ].map(([x, y], i) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={i % 3 === 0 ? 3.5 : 2.5}
          fill={i % 2 === 0 ? "#3ecfbe" : "#8eb6c9"}
          opacity={0.55 + (i % 3) * 0.1}
          className="motion-scan"
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </svg>
  );
}
