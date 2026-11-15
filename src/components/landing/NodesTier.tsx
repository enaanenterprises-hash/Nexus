export function NodesTier() {
  const nodes = [
    {
      name: "Studio Node",
      badge: "Media & Audio",
      desc: "Multi-track audio recording and transcription workspace. Captures lectures, meetings, and ideas with automated timestamp markers.",
      busEvent: "Emits: audio:transcript",
    },
    {
      name: "Study Node",
      badge: "Academic",
      desc: "Ingests syllabus PDFs and reading lists, synthesizes revision notes, and schedules spaced repetition intervals back to your calendar.",
      busEvent: "Consumes: transcript · syllabus",
    },
    {
      name: "Canvas Node",
      badge: "Spatial Thinking",
      desc: "Infinite spatial research canvas. Connect web clips, notes, and PDF excerpts into visual graph relationships.",
      busEvent: "Consumes: research:source",
    },
    {
      name: "Ledger Node",
      badge: "Finance",
      desc: "Deterministic expense ledger. Automatically categorizes incoming receipts from Command and monitors cash flow.",
      busEvent: "Consumes: receipt:payload",
    },
    {
      name: "Code Node",
      badge: "Engineering",
      desc: "Lightweight dev environment integrated with Command GitHub notifications, branch commits, and build status.",
      busEvent: "Subscribes: git:telemetry",
    },
    {
      name: "Your Custom Node",
      badge: "Open API",
      desc: "Build and publish your own Node against our stable Node API and typed capability contracts (VS Code/Obsidian-style).",
      busEvent: "Declared Capabilities",
    },
  ];

  return (
    <section className="land-section" aria-labelledby="nodes-detail-title">
      <div className="land-container">
        <div className="land-section-header">
          <p className="site-kicker">Tier 03 · Nodes</p>
          <h2 id="nodes-detail-title" className="land-section-title">
            Heavy-duty tools on a shared event bus.
          </h2>
          <p className="land-section-desc">
            Nodes work like extensions in VS Code or Obsidian: full-scale, standalone desktop tools that you install into
            sockets. Instead of operating in silos, they share structured content across a central event bus.
          </p>
        </div>

        {/* Nodes Grid */}
        <div className="land-nodes-grid">
          {nodes.map((node) => (
            <div key={node.name} className="land-node-card">
              <div className="land-node-top">
                <span className="land-node-badge">{node.badge}</span>
                <span className="land-node-bus">{node.busEvent}</span>
              </div>
              <h3 className="land-node-title">{node.name}</h3>
              <p className="land-node-desc">{node.desc}</p>
            </div>
          ))}
        </div>

        {/* Inter-Node Event Bus Demonstration */}
        <div className="land-bus-demo">
          <div className="land-bus-demo-header">
            <span className="site-kicker">The Shared Event Bus</span>
            <h3>How Nodes Genuinely Work Together</h3>
            <p>
              When apps pass structured content over a central bus, tedious manual copying between tools disappears:
            </p>
          </div>

          <div className="land-flow-grid">
            {/* Flow 1: Lecture to Calendar */}
            <div className="land-flow-card">
              <div className="land-flow-title">1. Lecture Capture &rarr; Exam Prep</div>
              <div className="land-flow-step">
                <span className="land-flow-icon">🎙️</span>
                <div>
                  <strong>Studio Node:</strong> Records audio and generates timecoded transcript.
                </div>
              </div>
              <div className="land-flow-divider">&darr; Shared Event Bus &darr;</div>
              <div className="land-flow-step">
                <span className="land-flow-icon">📚</span>
                <div>
                  <strong>Study Node:</strong> Breaks transcript into active recall flashcards.
                </div>
              </div>
              <div className="land-flow-divider">&darr; Command Automation &darr;</div>
              <div className="land-flow-step">
                <span className="land-flow-icon">📅</span>
                <div>
                  <strong>Calendar:</strong> Pushes spaced review sessions directly to your schedule.
                </div>
              </div>
            </div>

            {/* Flow 2: Receipt to Ledger */}
            <div className="land-flow-card">
              <div className="land-flow-title">2. Emailed Receipt &rarr; Balance Sheet</div>
              <div className="land-flow-step">
                <span className="land-flow-icon">✉️</span>
                <div>
                  <strong>Command (Gmail):</strong> Detects invoice email and extracts total, tax, and vendor.
                </div>
              </div>
              <div className="land-flow-divider">&darr; Shared Event Bus &darr;</div>
              <div className="land-flow-step">
                <span className="land-flow-icon">📊</span>
                <div>
                  <strong>Ledger Node:</strong> Automatically logs expense under correct tax category.
                </div>
              </div>
              <div className="land-flow-divider">&darr; Deterministic Rule &darr;</div>
              <div className="land-flow-step">
                <span className="land-flow-icon">📦</span>
                <div>
                  <strong>Command Timeline:</strong> Pins live courier delivery tracking on Today view.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Freemium & Ecosystem Callout */}
        <div className="land-ecosystem-banner">
          <div className="land-ecosystem-text">
            <h4>An extensible ecosystem for desktop productivity</h4>
            <p>
              Two active sockets are free forever on the community tier. Pro unlocks unlimited active sockets for power
              users. Built for longevity with an open Node API so developers can publish bespoke tools.
            </p>
          </div>
          <div className="land-ecosystem-stats">
            <div className="land-stat">
              <span className="land-stat-val">2</span>
              <span className="land-stat-lbl">Sockets Free Forever</span>
            </div>
            <div className="land-stat">
              <span className="land-stat-val">&infin;</span>
              <span className="land-stat-lbl">Pro Socket Expansion</span>
            </div>
            <div className="land-stat">
              <span className="land-stat-val">0</span>
              <span className="land-stat-lbl">LLM Overhead on Daily Work</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
