import { CommandLivePreview } from "./CommandLivePreview";
import { EventBusLivePreview } from "./EventBusLivePreview";
import { LandingCTA } from "./LandingCTA";
import { NetworkLivePreview } from "./NetworkLivePreview";
import { NodesLivePreview } from "./NodesLivePreview";

export function LandingScenes() {
  return (
    <div className="landing-content">
      {/* SECTION 1 (PART 2 OF LANDING PAGE): UNIFIED ARCHITECTURE & GOLDEN NEURAL STAGE */}
      <section className="land-section land-section--hero-continuation" aria-labelledby="bus-section-title">
        <div className="land-container">
          <div className="nx-hero-bridge">
            <div className="nx-hero-bridge-title">
              <p className="site-kicker">Architecture · Network, Command, Nodes</p>
              <h2 id="bus-section-title" className="landing-line max-w-[20ch]">
                One connection, structured across three tiers.
              </h2>
            </div>
            <p className="nx-hero-bridge-lede">
              Nexus unifies your outside accounts, heavy-duty desktop workspaces, and ambient intelligence onto one
              deterministic event bus. Command ingests live telemetry and runs cross-API rules; Nodes snap standalone
              applications into modular sockets; Network sits at the core with full situational awareness—while your
              daily workflow runs at zero LLM compute cost.
            </p>
          </div>

          <EventBusLivePreview />
        </div>
      </section>

      {/* SECTION 2: TIER 01 — NETWORK */}
      <section className="land-section" aria-labelledby="network-section-title">
        <div className="land-container">
          <div className="land-section-header">
            <p className="site-kicker">Tier 01 · Network</p>
            <h2 id="network-section-title" className="land-section-title">
              Ambient intelligence &amp; bias-aware research.
            </h2>
            <p className="land-section-desc">
              Network has automatic situational awareness over everything connected into Command. It answers with
              real context, while Research strips the web of ads and noise for deep, focused reading.
            </p>
          </div>

          {/* Real-time Graphical Preview of Network & Research */}
          <NetworkLivePreview />
        </div>
      </section>

      {/* SECTION 3: TIER 02 — COMMAND */}
      <section className="land-section" aria-labelledby="command-section-title">
        <div className="land-container">
          <div className="land-section-header">
            <p className="site-kicker">Tier 02 · Command</p>
            <h2 id="command-section-title" className="land-section-title">
              Your real-time telemetry cockpit.
            </h2>
            <p className="land-section-desc">
              Connect external services once. Command consolidates your mail receipts, calendar timelines, developer
              builds, and media into a unified dashboard that executes deterministic cross-API automations.
            </p>
          </div>

          {/* Full-Scale Graphical Preview of Command Cockpit */}
          <CommandLivePreview />
        </div>
      </section>

      {/* SECTION 4: TIER 03 — NODES */}
      <section className="land-section" aria-labelledby="nodes-section-title">
        <div className="land-container">
          <div className="land-section-header">
            <p className="site-kicker">Tier 03 · Nodes</p>
            <h2 id="nodes-section-title" className="land-section-title">
              Heavy-duty desktop applications in modular sockets.
            </h2>
            <p className="land-section-desc">
              Like extensions in VS Code or Obsidian, Nodes are standalone deterministic applications that subscribe to
              Command data streams. Toggle between Studio, Study, Ledger, and Canvas below:
            </p>
          </div>

          {/* Interactive Switcher Preview of Desktop Nodes */}
          <NodesLivePreview />
        </div>
      </section>

      {/* SECTION 5: CALL TO ACTION */}
      <LandingCTA />
    </div>
  );
}
