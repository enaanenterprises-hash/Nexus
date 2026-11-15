export function CommandTier() {
  const widgets = [
    {
      title: "Mail & Receipts",
      desc: "Gmail connector extracts tracking numbers, orders, and receipts directly to your timeline.",
      tag: "Gmail",
      active: true,
    },
    {
      title: "Schedule & Tasks",
      desc: "Unified calendar view syncing Google Calendar and Tasks with real-time chronological markers.",
      tag: "Google Workspace",
      active: true,
    },
    {
      title: "Developer Telemetry",
      desc: "Monitor PR reviews, branch build passes, and Vercel edge deployment status in real time.",
      tag: "GitHub · Vercel",
      active: true,
    },
    {
      title: "Health & Media",
      desc: "Live Strava run mileage, recovery metrics, and active Spotify playback controls.",
      tag: "Strava · Spotify",
      active: true,
    },
    {
      title: "Academic & Finance",
      desc: "Canvas LMS syllabus deadlines and Plaid financial ledger feeds unified into one stream.",
      tag: "Canvas · Plaid",
      active: true,
    },
    {
      title: "Keyless Feeds",
      desc: "Live weather from Open-Meteo, crypto indices from CoinGecko, and Formula 1 lap timing.",
      tag: "Keyless",
      active: false,
    },
  ];

  return (
    <section className="land-section" aria-labelledby="command-detail-title">
      <div className="land-container">
        <div className="land-section-header">
          <p className="site-kicker">Tier 02 · Command</p>
          <h2 id="command-detail-title" className="land-section-title">
            The central cockpit. Telemetry and deterministic rules.
          </h2>
          <p className="land-section-desc">
            Instead of keeping six tabs open to monitor your life, Command centralizes your incoming signals into a
            customizable dashboard. It executes deterministic cross-API automations without unpredictable AI latency.
          </p>
        </div>

        {/* Widgets Grid */}
        <div className="land-widgets-grid">
          {widgets.map((widget) => (
            <div key={widget.title} className="land-widget-card">
              <div className="land-widget-top">
                <span className="land-widget-tag">{widget.tag}</span>
                <span className={widget.active ? "land-status-dot land-status-dot--live" : "land-status-dot"} />
              </div>
              <h4 className="land-widget-title">{widget.title}</h4>
              <p className="land-widget-desc">{widget.desc}</p>
            </div>
          ))}
        </div>

        {/* Deterministic Automations Showcase */}
        <div className="land-automation-box">
          <div className="land-automation-header">
            <span className="site-kicker">Deterministic Engine</span>
            <h3>Cross-API Automations That Never Hallucinate</h3>
            <p>
              Automations run by strict rule logic. When a trigger fires, steps execute immediately and predictably.
            </p>
          </div>

          <div className="land-recipe-cards">
            {/* Recipe 1 */}
            <div className="land-recipe-card">
              <div className="land-recipe-trigger">
                <span className="land-recipe-step-num">Trigger</span>
                <strong>Google Calendar: &ldquo;Deep Work&rdquo; block begins</strong>
              </div>
              <div className="land-recipe-arrow">&rarr;</div>
              <div className="land-recipe-actions">
                <div className="land-recipe-action">
                  <span className="land-recipe-step-num">Action 01</span>
                  <span>Spotify &middot; Trigger ambient focus playlist</span>
                </div>
                <div className="land-recipe-action">
                  <span className="land-recipe-step-num">Action 02</span>
                  <span>Slack &middot; Set status to Do Not Disturb</span>
                </div>
                <div className="land-recipe-action">
                  <span className="land-recipe-step-num">Action 03</span>
                  <span>Command &middot; Log GitHub active commit telemetry</span>
                </div>
              </div>
            </div>

            {/* Recipe 2 */}
            <div className="land-recipe-card">
              <div className="land-recipe-trigger">
                <span className="land-recipe-step-num">Trigger</span>
                <strong>Gmail: Incoming purchase receipt detected</strong>
              </div>
              <div className="land-recipe-arrow">&rarr;</div>
              <div className="land-recipe-actions">
                <div className="land-recipe-action">
                  <span className="land-recipe-step-num">Action 01</span>
                  <span>Extract order total, currency, and merchant</span>
                </div>
                <div className="land-recipe-action">
                  <span className="land-recipe-step-num">Action 02</span>
                  <span>Forward structured payload over Event Bus to Ledger Node</span>
                </div>
                <div className="land-recipe-action">
                  <span className="land-recipe-step-num">Action 03</span>
                  <span>Pin package tracking ETA directly to timeline</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
