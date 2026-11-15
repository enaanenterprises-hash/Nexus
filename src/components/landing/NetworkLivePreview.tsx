"use client";

export function NetworkLivePreview() {
  return (
    <div className="vis-preview-wrap" aria-label="Network Live Ambient Context and Research Reader">
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
            <span>Nexus Network · Ambient Context &amp; Bias-Aware Research</span>
          </div>
          <div className="vis-window-tag">Zero Server Chat Storage · Ephemeral</div>
        </div>

        {/* Dual Pane Interface */}
        <div className="vis-network-grid">
          {/* Left Pane: Conversational Context Orchestrator */}
          <div className="vis-chat-pane">
            <div className="vis-pane-header">
              <span className="vis-card-kicker">Conversational Orchestrator</span>
              <span className="vis-pill-tag">Ambient Awareness</span>
            </div>

            <div className="vis-chat-stream">
              {/* User Prompt */}
              <div className="vis-bubble vis-bubble--user">
                <span className="vis-bubble-author">You</span>
                <p>Give me a situational briefing for this afternoon.</p>
              </div>

              {/* Nexus Response with Context Links */}
              <div className="vis-bubble vis-bubble--nexus">
                <div className="vis-nexus-header">
                  <span className="vis-bubble-author vis-gold-text">Nexus Intelligence</span>
                  <span className="vis-model-tag">Zero Compute Idle</span>
                </div>
                <p className="vis-bubble-lead">
                  Here is the synchronized state across your Command feeds and active Nodes:
                </p>

                {/* Ambient Context Cards */}
                <div className="vis-context-items">
                  <div className="vis-ctx-card">
                    <span className="vis-ctx-icon">📅</span>
                    <div>
                      <strong>14:00 - 15:30: Deep Work Block</strong>
                      <span className="vis-faint-text">Command Calendar &middot; Spotify playlist pre-staged</span>
                    </div>
                  </div>

                  <div className="vis-ctx-card">
                    <span className="vis-ctx-icon">✉️</span>
                    <div>
                      <strong>AWS Receipt #290192 ($42.10)</strong>
                      <span className="vis-faint-text">Parsed from Gmail &middot; Auto-logged to Ledger Node</span>
                    </div>
                  </div>

                  <div className="vis-ctx-card">
                    <span className="vis-ctx-icon">🐙</span>
                    <div>
                      <strong>GitHub: 2 Pull Requests Waiting</strong>
                      <span className="vis-faint-text">Branch `feature/event-bus` passed all 44 smoke tests</span>
                    </div>
                  </div>
                </div>

                <div className="vis-quick-actions">
                  <button type="button" className="vis-action-pill">▶ Start 90m Focus Session</button>
                  <button type="button" className="vis-action-pill">Open Ledger Entry</button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Bias-Aware Research Web Reader */}
          <div className="vis-reader-pane">
            <div className="vis-pane-header">
              <span className="vis-card-kicker">Research Reader Mode</span>
              <span className="vis-pill-tag">Brave Search API</span>
            </div>

            {/* Reader Viewport */}
            <div className="vis-reader-doc">
              <div className="vis-reader-address">
                <span className="vis-url-badge">arxiv.org/abs/2411.08291</span>
                <span className="vis-ssrf-badge">SSRF Protected · Clean Text</span>
              </div>

              <h3 className="vis-reader-title">
                Modular Operating Systems and Deterministic Event Busses
              </h3>

              <div className="vis-reader-body">
                <p>
                  Modern computing environments often couple user workflows too closely to unpredictable AI latency.
                  When deterministic tools operate independently on an open bus, reliability remains absolute...
                </p>

                {/* Glowing Text Highlight */}
                <div className="vis-reader-quote">
                  <span>
                    &ldquo;By passing serialized typed payloads between sockets, desktop applications collaborate seamlessly
                    without risking prompt drift or LLM hallucination.&rdquo;
                  </span>
                  <div className="vis-quote-meta">
                    <span className="vis-quote-tag">Highlighted &middot; Tagged: #Architecture</span>
                    <span className="vis-gold-text">Saved to Research Collections</span>
                  </div>
                </div>

                <p className="vis-faint-text">
                  Collections, notes, and highlights remain accessible even when working offline.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
