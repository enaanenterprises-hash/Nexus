"use client";

/**
 * Warm gold / amber neural filament burst — brand atmosphere for the hero.
 * Visual only; respects reduced motion.
 */
export function GoldNeuralField() {
  return (
    <div
      className="landing-neural pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="landing-neural__glow" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 900 720"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="goldCore" cx="72%" cy="42%" r="35%">
            <stop offset="0%" stopColor="#fff6d6" stopOpacity="0.95" />
            <stop offset="28%" stopColor="#f0b429" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#b8732a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="filamentA" x1="100%" y1="30%" x2="0%" y2="70%">
            <stop offset="0%" stopColor="#ffe08a" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#d4a017" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8a5a1a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="filamentB" x1="90%" y1="10%" x2="10%" y2="90%">
            <stop offset="0%" stopColor="#fff1c2" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#c4892d" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse cx="650" cy="300" rx="220" ry="180" fill="url(#goldCore)" />

        <g
          fill="none"
          strokeLinecap="round"
          filter="url(#softGlow)"
          className="landing-filaments"
        >
          <path
            d="M680 290 C 560 240, 420 200, 260 250"
            stroke="url(#filamentA)"
            strokeWidth="1.6"
          />
          <path
            d="M700 310 C 540 280, 380 320, 220 400"
            stroke="url(#filamentB)"
            strokeWidth="1.2"
          />
          <path
            d="M660 260 C 520 160, 400 120, 280 140"
            stroke="url(#filamentA)"
            strokeWidth="1.1"
            opacity="0.75"
          />
          <path
            d="M720 340 C 580 380, 440 460, 300 520"
            stroke="url(#filamentB)"
            strokeWidth="1.4"
            opacity="0.8"
          />
          <path
            d="M640 320 C 500 360, 360 340, 200 300"
            stroke="url(#filamentA)"
            strokeWidth="0.9"
            opacity="0.65"
          />
          <path
            d="M690 220 C 600 180, 480 90, 360 60"
            stroke="url(#filamentB)"
            strokeWidth="1"
            opacity="0.55"
          />
          <path
            d="M710 400 C 560 470, 420 560, 250 610"
            stroke="url(#filamentA)"
            strokeWidth="1.15"
            opacity="0.7"
          />
          <path
            d="M630 280 C 480 250, 340 180, 180 200"
            stroke="url(#filamentB)"
            strokeWidth="0.85"
            opacity="0.5"
          />
        </g>

        {/* Particle field */}
        {PARTICLES.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={p.fill}
            opacity={p.o}
            className="landing-particle"
            style={{ animationDelay: `${p.delay}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

const PARTICLES: Array<{
  x: number;
  y: number;
  r: number;
  o: number;
  fill: string;
  delay: number;
}> = [
  { x: 620, y: 260, r: 1.8, o: 0.9, fill: "#fff6d6", delay: 0 },
  { x: 700, y: 300, r: 2.4, o: 0.85, fill: "#ffe08a", delay: 0.4 },
  { x: 560, y: 220, r: 1.2, o: 0.7, fill: "#f0b429", delay: 0.8 },
  { x: 480, y: 280, r: 1.5, o: 0.65, fill: "#e2a93b", delay: 1.2 },
  { x: 400, y: 180, r: 1.1, o: 0.55, fill: "#c4892d", delay: 0.2 },
  { x: 340, y: 320, r: 1.3, o: 0.5, fill: "#f0b429", delay: 1.6 },
  { x: 280, y: 240, r: 0.9, o: 0.45, fill: "#ffe08a", delay: 0.6 },
  { x: 520, y: 360, r: 1.6, o: 0.6, fill: "#fff1c2", delay: 1.0 },
  { x: 600, y: 400, r: 1.4, o: 0.55, fill: "#d4a017", delay: 1.4 },
  { x: 740, y: 240, r: 2.0, o: 0.75, fill: "#fff6d6", delay: 0.3 },
  { x: 760, y: 360, r: 1.7, o: 0.7, fill: "#f0b429", delay: 0.9 },
  { x: 440, y: 420, r: 1.2, o: 0.5, fill: "#c4892d", delay: 1.8 },
  { x: 360, y: 480, r: 1.0, o: 0.4, fill: "#e2a93b", delay: 0.5 },
  { x: 660, y: 180, r: 1.3, o: 0.65, fill: "#ffe08a", delay: 1.1 },
  { x: 500, y: 140, r: 0.8, o: 0.45, fill: "#fff1c2", delay: 1.5 },
  { x: 420, y: 520, r: 1.1, o: 0.4, fill: "#d4a017", delay: 0.7 },
  { x: 580, y: 480, r: 1.5, o: 0.5, fill: "#f0b429", delay: 1.3 },
  { x: 720, y: 440, r: 1.2, o: 0.55, fill: "#ffe08a", delay: 0.1 },
  { x: 300, y: 380, r: 0.9, o: 0.4, fill: "#c4892d", delay: 1.7 },
  { x: 240, y: 160, r: 0.7, o: 0.35, fill: "#e2a93b", delay: 2.0 },
  { x: 680, y: 320, r: 3.2, o: 0.35, fill: "#fff6d6", delay: 0.55 },
  { x: 540, y: 300, r: 2.6, o: 0.28, fill: "#f0b429", delay: 1.25 },
  { x: 450, y: 240, r: 2.2, o: 0.25, fill: "#ffe08a", delay: 0.85 },
];
