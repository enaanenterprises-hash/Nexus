"use client";

import { useEffect, useState } from "react";

type FlowId = "receipt" | "lecture" | "focus";

type FlowInfo = {
  id: FlowId;
  label: string;
  source: string;
  target: string;
  packet: string;
  log: string;
};

const FLOWS: FlowInfo[] = [
  {
    id: "receipt",
    label: "Receipt ➔ Ledger",
    source: "Command (Gmail)",
    target: "Ledger Node",
    packet: "📄 AWS Invoice $42.10",
    log: "eventBus.emit('receipt:parsed') ➔ Routed to Ledger Node ➔ Logged to Operating Expenses",
  },
  {
    id: "lecture",
    label: "Audio ➔ Study ➔ Calendar",
    source: "Studio Node",
    target: "Study Node",
    packet: "🎙️ 45m Lecture Audio",
    log: "studio.emit('transcript:ready') ➔ Study Node generates 8 cards ➔ Review block staged to Calendar",
  },
  {
    id: "focus",
    label: "Calendar ➔ Spotify & Slack",
    source: "Command (Calendar)",
    target: "Spotify & Slack",
    packet: "⚡ Deep Work Trigger",
    log: "calendar.emit('focus:start') ➔ Spotify queue 'Solaris' ➔ Slack status 'Do Not Disturb'",
  },
];

export function EventBusLivePreview() {
  const [activeFlow, setActiveFlow] = useState<FlowId>("receipt");

  // Auto-cycle through the flows every 6 seconds if user doesn't click
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFlow((prev) => {
        if (prev === "receipt") return "lecture";
        if (prev === "lecture") return "focus";
        return "receipt";
      });
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const current = FLOWS.find((f) => f.id === activeFlow)!;

  return (
    <div className="vis-preview-wrap" aria-label="Shared Event Bus Animation">
      <div className="vis-window">
        {/* Window Chrome Header */}
        <div className="vis-window-bar">
          <div className="vis-dots">
            <span className="vis-dot vis-dot--red" />
            <span className="vis-dot vis-dot--yellow" />
            <span className="vis-dot vis-dot--green" />
          </div>
          <div className="vis-window-title">
            <span className="vis-pulse-gold" />
            <span>Nexus Shared Event Bus · Central Core Routing</span>
          </div>
          <div className="vis-window-tag">0 LLM Compute · Deterministic</div>
        </div>

        {/* Interactive Flow Switcher */}
        <div className="vis-bus-toolbar">
          <div className="vis-flow-buttons">
            {FLOWS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`vis-flow-btn ${activeFlow === f.id ? "vis-flow-btn--active" : ""}`}
                onClick={() => {
                  setActiveFlow(f.id);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="vis-bus-status">
            <span className="vis-status-pill">BUS ACTIVE</span>
            <span className="vis-status-text">{current.log}</span>
          </div>
        </div>

        {/* SVG Graphic Circuit Board */}
        <div className="vis-circuit-stage">
          <svg className="vis-circuit-svg" viewBox="0 0 900 480" role="presentation">
            <defs>
              <radialGradient id="nexusCoreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f0b54a" stopOpacity="0.8" />
                <stop offset="35%" stopColor="#f0b54a" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#000" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="goldBeam" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0b54a" />
                <stop offset="50%" stopColor="#ffd99a" />
                <stop offset="100%" stopColor="#f0b54a" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background Grid Lines */}
            <g opacity="0.12" stroke="#f0b54a" strokeWidth="0.5">
              <line x1="50" y1="120" x2="850" y2="120" strokeDasharray="4 8" />
              <line x1="50" y1="240" x2="850" y2="240" strokeDasharray="4 8" />
              <line x1="50" y1="360" x2="850" y2="360" strokeDasharray="4 8" />
              <line x1="200" y1="50" x2="200" y2="430" strokeDasharray="4 8" />
              <line x1="450" y1="50" x2="450" y2="430" strokeDasharray="4 8" />
              <line x1="700" y1="50" x2="700" y2="430" strokeDasharray="4 8" />
            </g>

            {/* Circuit Traces between Nodes and Central Bus Core */}
            {/* Top Left: Command */}
            <path
              id="path-cmd-core"
              d="M 180 120 C 300 120, 360 240, 450 240"
              fill="none"
              stroke={activeFlow === "receipt" || activeFlow === "focus" ? "rgba(240,181,74,0.9)" : "rgba(240,181,74,0.22)"}
              strokeWidth={activeFlow === "receipt" || activeFlow === "focus" ? "2.5" : "1.2"}
              strokeDasharray={activeFlow === "receipt" || activeFlow === "focus" ? "none" : "3 3"}
            />
            {/* Top Right: Studio Node */}
            <path
              id="path-studio-core"
              d="M 720 120 C 600 120, 540 240, 450 240"
              fill="none"
              stroke={activeFlow === "lecture" ? "rgba(240,181,74,0.9)" : "rgba(240,181,74,0.22)"}
              strokeWidth={activeFlow === "lecture" ? "2.5" : "1.2"}
              strokeDasharray={activeFlow === "lecture" ? "none" : "3 3"}
            />
            {/* Bottom Left: Ledger Node */}
            <path
              id="path-core-ledger"
              d="M 450 240 C 360 240, 300 360, 180 360"
              fill="none"
              stroke={activeFlow === "receipt" ? "rgba(240,181,74,0.9)" : "rgba(240,181,74,0.22)"}
              strokeWidth={activeFlow === "receipt" ? "2.5" : "1.2"}
              strokeDasharray={activeFlow === "receipt" ? "none" : "3 3"}
            />
            {/* Bottom Right: Study Node */}
            <path
              id="path-core-study"
              d="M 450 240 C 540 240, 600 360, 720 360"
              fill="none"
              stroke={activeFlow === "lecture" ? "rgba(240,181,74,0.9)" : "rgba(240,181,74,0.22)"}
              strokeWidth={activeFlow === "lecture" ? "2.5" : "1.2"}
              strokeDasharray={activeFlow === "lecture" ? "none" : "3 3"}
            />
            {/* Top Center: Network AI Surface */}
            <path
              id="path-network-core"
              d="M 450 70 L 450 240"
              fill="none"
              stroke={activeFlow === "focus" ? "rgba(240,181,74,0.9)" : "rgba(240,181,74,0.22)"}
              strokeWidth={activeFlow === "focus" ? "2.5" : "1.2"}
            />

            {/* Animated Data Packets Traveling Along Paths */}
            {activeFlow === "receipt" && (
              <>
                <g>
                  <animateMotion dur="2.4s" repeatCount="indefinite" path="M 180 120 C 300 120, 360 240, 450 240" />
                  <PacketMark label="📄 Receipt ($42.10)" />
                </g>
                <g>
                  <animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path="M 450 240 C 360 240, 300 360, 180 360" />
                  <PacketMark label="💳 Ledger Transaction" />
                </g>
              </>
            )}

            {activeFlow === "lecture" && (
              <>
                <g>
                  <animateMotion dur="2.4s" repeatCount="indefinite" path="M 720 120 C 600 120, 540 240, 450 240" />
                  <PacketMark label="🎙️ Audio Transcript" />
                </g>
                <g>
                  <animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path="M 450 240 C 540 240, 600 360, 720 360" />
                  <PacketMark label="📚 Study Flashcards" />
                </g>
              </>
            )}

            {activeFlow === "focus" && (
              <>
                <g>
                  <animateMotion dur="2.2s" repeatCount="indefinite" path="M 180 120 C 300 120, 360 240, 450 240" />
                  <PacketMark label="📅 Deep Work (14:00)" />
                </g>
                <g>
                  <animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite" path="M 450 240 L 450 70" />
                  <PacketMark label="⚡ Spotify & Slack Event" />
                </g>
              </>
            )}

            {/* Central Core: Shared Event Bus */}
            <g transform="translate(450, 240)">
              <circle r="60" fill="url(#nexusCoreGlow)" />
              <circle r="34" fill="#070605" stroke="rgba(240,181,74,0.8)" strokeWidth="1.5" filter="url(#glow)" />
              <circle r="22" fill="none" stroke="rgba(255,217,154,0.4)" strokeDasharray="3 3">
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite" />
              </circle>
              <circle r="7" fill="#f0b54a" />
              <circle r="3" fill="#ffffff" />
              <text y="50" textAnchor="middle" fill="#ffd99a" fontSize="11" fontWeight="600" letterSpacing="0.1em">
                SHARED EVENT BUS
              </text>
            </g>

            {/* Node 1: Command (Top Left) */}
            <NodeBox
              x={180}
              y={120}
              title="Command Cockpit"
              subtitle="Gmail · Calendar · Strava"
              active={activeFlow === "receipt" || activeFlow === "focus"}
            />

            {/* Node 2: Network (Top Center) */}
            <NodeBox
              x={450}
              y={70}
              title="Network"
              subtitle="Conversational AI Layer"
              active={activeFlow === "focus"}
            />

            {/* Node 3: Studio Node (Top Right) */}
            <NodeBox
              x={720}
              y={120}
              title="Studio Node"
              subtitle="Audio DAW · Live Transcription"
              active={activeFlow === "lecture"}
            />

            {/* Node 4: Ledger Node (Bottom Left) */}
            <NodeBox
              x={180}
              y={360}
              title="Ledger Node"
              subtitle="Deterministic Expense Journal"
              active={activeFlow === "receipt"}
            />

            {/* Node 5: Study Node (Bottom Right) */}
            <NodeBox
              x={720}
              y={360}
              title="Study Node"
              subtitle="Active Recall · Spaced Repetition"
              active={activeFlow === "lecture"}
            />
          </svg>
        </div>

        {/* Live Event Stream Ticker */}
        <div className="vis-stream-ticker">
          <span className="vis-ticker-label">EVENT STREAM:</span>
          <div className="vis-ticker-items">
            <span className="vis-ticker-item">
              <em>14:32:01</em> <code>command:gmail.receipt</code> &rarr; <code>ledger.ingest</code> [200 OK]
            </span>
            <span className="vis-ticker-item">
              <em>14:31:40</em> <code>studio:transcript.chunk</code> &rarr; <code>study.parse</code> [200 OK]
            </span>
            <span className="vis-ticker-item">
              <em>14:30:00</em> <code>calendar:event.start</code> &rarr; <code>spotify.queue</code> [200 OK]
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PacketMark({ label }: { label: string }) {
  return (
    <g transform="translate(0, 0)">
      <rect x="-65" y="-14" width="130" height="28" rx="14" fill="#0c0a07" stroke="#f0b54a" strokeWidth="1.5" />
      <text y="4" textAnchor="middle" fill="#ffd99a" fontSize="11" fontWeight="600" letterSpacing="0.02em">
        {label}
      </text>
    </g>
  );
}

function NodeBox({
  x,
  y,
  title,
  subtitle,
  active,
}: {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  active: boolean;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x="-95"
        y="-34"
        width="190"
        height="68"
        rx="12"
        fill="#070605"
        stroke={active ? "rgba(240, 181, 74, 0.9)" : "rgba(255, 255, 255, 0.12)"}
        strokeWidth={active ? 1.5 : 1}
      />
      {active ? (
        <rect
          x="-95"
          y="-34"
          width="190"
          height="68"
          rx="12"
          fill="none"
          stroke="#f0b54a"
          strokeWidth="1.5"
          opacity="0.35"
        >
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" />
        </rect>
      ) : null}
      <circle cx="-75" cy="0" r="4" fill={active ? "#f0b54a" : "rgba(255,255,255,0.25)"} />
      <text x="-62" y="-6" fill="#f5f5f7" fontSize="12" fontWeight="600">
        {title}
      </text>
      <text x="-62" y="14" fill="rgba(255,255,255,0.4)" fontSize="10">
        {subtitle}
      </text>
    </g>
  );
}
