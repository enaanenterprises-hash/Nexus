export function ArchitectureOverview() {
  return (
    <section className="land-section" aria-labelledby="arch-title">
      <div className="land-container">
        <div className="land-section-header">
          <p className="site-kicker">Architecture</p>
          <h2 id="arch-title" className="land-section-title">
            Three tiers. Zero AI lock-in.
          </h2>
          <p className="land-section-desc">
            A desktop-first personal operating environment built so core daily productivity is deterministic and never
            depends on an LLM. The intelligence layer is an optional accelerator when you want it—not a single point
            of failure.
          </p>
        </div>

        <div className="land-arch-grid">
          {/* Tier 1: Network */}
          <div className="land-tier-card land-tier-card--gold">
            <div className="land-tier-badge">Tier 01 · Intelligence</div>
            <h3 className="land-tier-name">Network</h3>
            <p className="land-tier-tagline">
              The front door to your workspace. An ambient conversational interface and bias-aware research reader.
            </p>
            <ul className="land-tier-features">
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Full ambient context:</strong> Understands all feeds wired into Command and orchestrates
                  tasks across installed Nodes when asked.
                </span>
              </li>
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Bias-aware Research:</strong> Reads web pages stripped of trackers, ads, and noise, saving
                  insights into persistent collections.
                </span>
              </li>
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Zero compute when idle:</strong> Ephemeral browser exchange that respects privacy and runs
                  at zero AI cost during normal workflows.
                </span>
              </li>
            </ul>
          </div>

          {/* Tier 2: Command */}
          <div className="land-tier-card">
            <div className="land-tier-badge">Tier 02 · Control Center</div>
            <h3 className="land-tier-name">Command</h3>
            <p className="land-tier-tagline">
              The central telemetry and API-ingestion cockpit. Connect accounts once and monitor your life in one place.
            </p>
            <ul className="land-tier-features">
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Unified telemetry:</strong> Live feeds for Gmail, Calendar, GitHub, Canvas LMS, Strava,
                  Spotify, Plaid feeds, and Formula 1 schedules.
                </span>
              </li>
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Deterministic rules:</strong> Automations execute on strict triggers without prompt drift or
                  hallucinations.
                </span>
              </li>
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Encrypted credentials:</strong> AES-256-GCM encryption isolates sensitive tokens away from
                  client browsers.
                </span>
              </li>
            </ul>
          </div>

          {/* Tier 3: Nodes */}
          <div className="land-tier-card">
            <div className="land-tier-badge">Tier 03 · Applications</div>
            <h3 className="land-tier-name">Nodes</h3>
            <p className="land-tier-tagline">
              Full-scale, standalone desktop tools that plug into sockets and communicate over a shared central event bus.
            </p>
            <ul className="land-tier-features">
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Modular tools:</strong> Studio recording, Study syllabus planner, Spatial Canvas, Personal
                  Ledger, and Code workspace.
                </span>
              </li>
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Shared event bus:</strong> Nodes pass structured typed content to each other—not just working
                  side-by-side, but truly working together.
                </span>
              </li>
              <li>
                <span className="land-dot" />
                <span>
                  <strong>Extensible ecosystem:</strong> Built in the spirit of VS Code and Obsidian, with open APIs for
                  third-party creators.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
