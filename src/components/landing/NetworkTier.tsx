export function NetworkTier() {
  return (
    <section className="land-section" aria-labelledby="network-detail-title">
      <div className="land-container">
        <div className="land-section-header">
          <p className="site-kicker">Tier 01 · Network</p>
          <h2 id="network-detail-title" className="land-section-title">
            The front page. Contextual intelligence on your terms.
          </h2>
          <p className="land-section-desc">
            Network is the primary way you interact with your operating environment. An ambient assistant with total
            situational awareness across your connected services, paired with a bias-aware web research reader.
          </p>
        </div>

        <div className="land-split-grid">
          {/* Left: Conversational Orchestrator */}
          <div className="land-panel">
            <div className="land-panel-header">
              <span className="land-panel-label">Ambient Orchestrator</span>
              <span className="land-pill-active">Live Context</span>
            </div>

            <div className="land-chat-preview">
              <div className="land-chat-msg land-chat-msg--user">
                <span className="land-chat-sender">You</span>
                <p>What does my afternoon look like after the sprint demo?</p>
              </div>

              <div className="land-chat-msg land-chat-msg--nexus">
                <span className="land-chat-sender land-gold-text">Nexus</span>
                <p>
                  You have a 90-minute deep work block starting at <strong>2:00 PM</strong>.
                </p>
                <div className="land-chat-signals">
                  <div className="land-signal-item">
                    <span className="land-signal-tag">GitHub</span>
                    <span>2 pull requests awaiting your review on Nexus core.</span>
                  </div>
                  <div className="land-signal-item">
                    <span className="land-signal-tag">Command</span>
                    <span>Automated Spotify focus session staged for 2:00 PM.</span>
                  </div>
                  <div className="land-signal-item">
                    <span className="land-signal-tag">Event Bus</span>
                    <span>AWS cloud receipt ($42.10) routed to Ledger Node.</span>
                  </div>
                </div>
                <p className="land-chat-footer-note">
                  Shall I mute notifications across Slack and Telegram when your focus block begins?
                </p>
              </div>
            </div>

            <div className="land-panel-footer">
              <span className="land-metric">
                <em>Zero</em> chat persistence
              </span>
              <span className="land-metric">
                <em>Deterministic</em> data source
              </span>
              <span className="land-metric">
                <em>Optional</em> compute
              </span>
            </div>
          </div>

          {/* Right: Bias-Aware Research Reader */}
          <div className="land-panel">
            <div className="land-panel-header">
              <span className="land-panel-label">Bias-Aware Research</span>
              <span className="land-pill-neutral">Brave Search</span>
            </div>

            <div className="land-reader-preview">
              <div className="land-reader-bar">
                <span className="land-reader-url">arxiv.org/abs/2411.08291 · Clean Reader Mode</span>
                <span className="land-reader-tag">Saved to Neural Systems</span>
              </div>
              <div className="land-reader-content">
                <h4 className="land-reader-heading">Decentralized Event Busses in Modular Operating Systems</h4>
                <p className="land-reader-excerpt">
                  By isolating compute into discrete sandboxes connected through declared capability schemas,
                  operating environments eliminate tight coupling between AI layers and daily deterministic tools...
                </p>
                <div className="land-reader-highlight">
                  <span>&ldquo;Deterministic workflows must never depend on the latency or hallucination of an LLM.&rdquo;</span>
                  <span className="land-reader-author">— Tagged: Architecture · 3 Highlights</span>
                </div>
              </div>
            </div>

            <div className="land-panel-prose">
              <h4>Read without the noise</h4>
              <p>
                Research opens web pages as pure, distraction-free prose. Highlight passages, tag concepts, and store
                articles into themed research collections. Queries run through server-side Brave Search with built-in
                SSRF safeguards that refuse requests to private internal networks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
