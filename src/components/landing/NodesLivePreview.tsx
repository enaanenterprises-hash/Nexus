"use client";

import { useEffect, useState } from "react";

type NodeId = "studio" | "study" | "ledger" | "canvas";

export function NodesLivePreview() {
  const [activeNode, setActiveNode] = useState<NodeId>("studio");
  const [playHead, setPlayHead] = useState(38);

  // Animate playback head across the DAW waveform
  useEffect(() => {
    const timer = setInterval(() => {
      setPlayHead((p) => (p >= 92 ? 15 : p + 1.2));
    }, 150);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="vis-preview-wrap" aria-label="Nodes Ecosystem Desktop Previews">
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
            <span>Nexus Nodes · Modular Desktop Workspaces</span>
          </div>
          <div className="vis-window-tag">VS Code Extension Architecture</div>
        </div>

        {/* Node Tabs Switcher */}
        <div className="vis-node-tabs">
          <button
            type="button"
            className={`vis-node-tab ${activeNode === "studio" ? "vis-node-tab--active" : ""}`}
            onClick={() => setActiveNode("studio")}
          >
            <span className="vis-tab-icon">🎙️</span>
            <span>Studio Node (DAW)</span>
          </button>
          <button
            type="button"
            className={`vis-node-tab ${activeNode === "study" ? "vis-node-tab--active" : ""}`}
            onClick={() => setActiveNode("study")}
          >
            <span className="vis-tab-icon">📚</span>
            <span>Study Node (Active Recall)</span>
          </button>
          <button
            type="button"
            className={`vis-node-tab ${activeNode === "ledger" ? "vis-node-tab--active" : ""}`}
            onClick={() => setActiveNode("ledger")}
          >
            <span className="vis-tab-icon">💳</span>
            <span>Ledger Node (Finance)</span>
          </button>
          <button
            type="button"
            className={`vis-node-tab ${activeNode === "canvas" ? "vis-node-tab--active" : ""}`}
            onClick={() => setActiveNode("canvas")}
          >
            <span className="vis-tab-icon">🗺️</span>
            <span>Canvas Node (Spatial Graph)</span>
          </button>
        </div>

        {/* Active Node Viewport */}
        <div className="vis-node-viewport">
          {/* VIEW 1: STUDIO NODE (Digital Audio Workstation) */}
          {activeNode === "studio" && (
            <div className="vis-studio-workspace">
              <div className="vis-studio-topbar">
                <div className="vis-rec-meter">
                  <span className="vis-rec-dot" />
                  <strong>REC 00:14:32.4</strong>
                  <span className="vis-faint-text">24-bit / 48kHz WAV</span>
                </div>
                <div className="vis-track-controls">
                  <span className="vis-pill-tag">Track 01: Lecture Mic</span>
                  <span className="vis-pill-tag">Track 02: System Audio</span>
                  <button type="button" className="vis-bus-dispatch-btn">
                    &rarr; Route Transcript to Study Node
                  </button>
                </div>
              </div>

              {/* Multi-Track Audio Waveform Display */}
              <div className="vis-daw-canvas">
                <div className="vis-daw-track">
                  <span className="vis-daw-label">MIC 1</span>
                  <div className="vis-waveform-container">
                    {/* Audio wave bars */}
                    <div className="vis-waveform-bars">
                      {[15, 30, 45, 80, 95, 60, 40, 20, 50, 75, 90, 85, 40, 60, 80, 50, 25, 45, 70, 90, 80, 60, 30, 45, 65, 85, 95, 70, 50, 30, 60, 80].map((h, i) => (
                        <span key={i} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="vis-daw-track">
                  <span className="vis-daw-label">SYS 2</span>
                  <div className="vis-waveform-container">
                    <div className="vis-waveform-bars vis-waveform-bars--dim">
                      {[10, 20, 25, 40, 55, 30, 20, 10, 25, 45, 50, 45, 20, 30, 40, 25, 15, 25, 40, 50, 45, 30, 15, 25, 35, 45, 50, 35, 25, 15, 30, 40].map((h, i) => (
                        <span key={i} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Animated Gold Playback Scrub Head */}
                <div className="vis-playhead" style={{ left: `${playHead}%` }}>
                  <span className="vis-playhead-handle" />
                </div>
              </div>

              {/* Real-Time Live Speech-To-Text Output */}
              <div className="vis-transcript-box">
                <div className="vis-transcript-header">
                  <span className="vis-card-kicker">Live Speech-To-Text Engine</span>
                  <span className="vis-confidence-badge">99.4% Confidence · Whisper Local</span>
                </div>
                <p className="vis-transcript-text">
                  &ldquo;...and because the event bus passes serialized payloads between sockets, the recording studio
                  can emit this transcription directly into the study workspace, generating review cards without any manual
                  copy-pasting...&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* VIEW 2: STUDY NODE (Syllabus & Active Recall) */}
          {activeNode === "study" && (
            <div className="vis-study-workspace">
              <div className="vis-study-grid">
                <div className="vis-study-card">
                  <span className="vis-card-kicker">Syllabus Ingestion</span>
                  <div className="vis-course-header">
                    <h4>CS 3410 · Distributed Systems</h4>
                    <span className="vis-subbadge">Parsed from Syllabus PDF</span>
                  </div>
                  <div className="vis-exam-countdown">
                    <strong>Midterm Examination</strong>
                    <span>Thursday, 14:00 · 3 Days Remaining</span>
                  </div>
                  <div className="vis-study-progress">
                    <div className="vis-prog-bar">
                      <div className="vis-prog-fill" style={{ width: "68%" }} />
                    </div>
                    <span>68% Material Mastered</span>
                  </div>
                </div>

                <div className="vis-study-card vis-study-card--flashcard">
                  <span className="vis-card-kicker">Active Recall Card 08/24</span>
                  <div className="vis-card-question">
                    <strong>What is the difference between Paxos consensus and Raft consensus in distributed event logs?</strong>
                  </div>
                  <div className="vis-card-answer">
                    <p>
                      Raft decomposes consensus into explicit leader election, log replication, and safety guarantees,
                      making state machine transitions deterministically auditable.
                    </p>
                  </div>
                  <div className="vis-flashcard-actions">
                    <button type="button" className="vis-rating-btn vis-rating-btn--again">Again (10m)</button>
                    <button type="button" className="vis-rating-btn vis-rating-btn--good">Good (1d)</button>
                    <button type="button" className="vis-rating-btn vis-rating-btn--easy">Easy (4d)</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: LEDGER NODE (Deterministic Finance) */}
          {activeNode === "ledger" && (
            <div className="vis-ledger-workspace">
              <div className="vis-ledger-top">
                <div className="vis-ledger-metric">
                  <span className="vis-card-kicker">November Operating Expenses</span>
                  <strong className="vis-stat-number">$1,429.50</strong>
                  <span className="vis-faint-text">Auto-compiled from 14 email receipts</span>
                </div>
                <div className="vis-ledger-metric">
                  <span className="vis-card-kicker">Tax Deductible Balance</span>
                  <strong className="vis-stat-number vis-gold-text">$892.10</strong>
                  <span className="vis-faint-text">Infrastructure &amp; R&amp;D</span>
                </div>
              </div>

              <div className="vis-ledger-table">
                <div className="vis-ledger-row vis-ledger-row--head">
                  <span>Merchant</span>
                  <span>Category</span>
                  <span>Origin</span>
                  <span>Amount</span>
                </div>
                <div className="vis-ledger-row">
                  <span className="vis-merchant-col">☁️ AWS Cloud Infrastructure</span>
                  <span><span className="vis-pill-tag">Hosting</span></span>
                  <span className="vis-faint-text">Gmail Receipt #290192</span>
                  <strong className="vis-row-amt">-$42.10</strong>
                </div>
                <div className="vis-ledger-row">
                  <span className="vis-merchant-col">🐙 GitHub Enterprise Co.</span>
                  <span><span className="vis-pill-tag">Developer Tools</span></span>
                  <span className="vis-faint-text">Auto-Debit Hook</span>
                  <strong className="vis-row-amt">-$21.00</strong>
                </div>
                <div className="vis-ledger-row">
                  <span className="vis-merchant-col">☕ Neo Coffee Bar Toronto</span>
                  <span><span className="vis-pill-tag">Meals</span></span>
                  <span className="vis-faint-text">Plaid Bank Feed</span>
                  <strong className="vis-row-amt">-$6.85</strong>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: CANVAS NODE (Spatial Knowledge Graph) */}
          {activeNode === "canvas" && (
            <div className="vis-canvas-workspace">
              <svg className="vis-canvas-svg" viewBox="0 0 800 320" role="presentation">
                <defs>
                  <linearGradient id="canvasLineGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f0b54a" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#ffd99a" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
                {/* Connecting Graph Edges */}
                <path d="M 180 80 C 280 80, 320 180, 420 180" fill="none" stroke="url(#canvasLineGlow)" strokeWidth="1.5" />
                <path d="M 420 180 C 520 180, 560 90, 640 90" fill="none" stroke="url(#canvasLineGlow)" strokeWidth="1.5" />
                <path d="M 420 180 C 500 240, 580 250, 660 250" fill="none" stroke="rgba(240,181,74,0.3)" strokeWidth="1" strokeDasharray="3 3" />

                {/* Nodes on the Canvas */}
                <g transform="translate(180, 80)">
                  <rect x="-80" y="-24" width="160" height="48" rx="8" fill="#0c0a07" stroke="#f0b54a" strokeWidth="1" />
                  <text y="4" textAnchor="middle" fill="#f5f5f7" fontSize="11" fontWeight="600">Research Clip: ArXiv #2411</text>
                </g>
                <g transform="translate(420, 180)">
                  <rect x="-90" y="-28" width="180" height="56" rx="10" fill="#140f09" stroke="#f0b54a" strokeWidth="1.5" />
                  <circle cx="-68" cy="0" r="4" fill="#f0b54a" />
                  <text x="-56" y="-3" fill="#ffd99a" fontSize="12" fontWeight="600">Shared Event Bus</text>
                  <text x="-56" y="14" fill="rgba(255,255,255,0.4)" fontSize="10">Central Core Hub</text>
                </g>
                <g transform="translate(640, 90)">
                  <rect x="-80" y="-24" width="160" height="48" rx="8" fill="#0c0a07" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <text y="4" textAnchor="middle" fill="#f5f5f7" fontSize="11">Study Card: Consensus</text>
                </g>
                <g transform="translate(660, 250)">
                  <rect x="-80" y="-24" width="160" height="48" rx="8" fill="#0c0a07" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <text y="4" textAnchor="middle" fill="#f5f5f7" fontSize="11">Code Spec: Socket API</text>
                </g>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
