import { CommandLivePreview } from "./CommandLivePreview";
import { EventBusLivePreview } from "./EventBusLivePreview";
import { LandingCTA } from "./LandingCTA";
import { NetworkLivePreview } from "./NetworkLivePreview";
import { NodesLivePreview } from "./NodesLivePreview";

export function LandingScenes() {
  return (
    <div className="landing-content">
      {/* CHAPTER 01: UNIFIED ARCHITECTURE & GOLDEN NEURAL STAGE */}
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

      {/* CHAPTER 02: TIER 01 — NETWORK & BIAS-AWARE RESEARCH */}
      <section className="land-section land-section--stage" aria-labelledby="network-section-title">
        <div className="land-container">
          <div className="nx-hero-bridge">
            <div className="nx-hero-bridge-title">
              <p className="site-kicker">Tier 01 · Network &amp; Research</p>
              <h2 id="network-section-title" className="landing-line max-w-[20ch]">
                A calm voice with context. A reader built for truth.
              </h2>
            </div>
            <p className="nx-hero-bridge-lede">
              Network is the room you arrive in: a single conversational voice with automatic awareness over everything
              wired into Command and your active Nodes. Beside it, Research strips the web of trackers and noise—turning
              pages, highlights, and margin notes into typed sources that any permitted Node can read with no model in
              the path.
            </p>
          </div>

          <NetworkLivePreview />
        </div>
      </section>

      {/* CHAPTER 03: TIER 02 — COMMAND TELEMETRY & DETERMINISTIC AUTOMATIONS */}
      <section className="land-section land-section--stage" aria-labelledby="command-section-title">
        <div className="land-container">
          <div className="nx-hero-bridge">
            <div className="nx-hero-bridge-title">
              <p className="site-kicker">Tier 02 · Command Cockpit</p>
              <h2 id="command-section-title" className="landing-line max-w-[20ch]">
                Every outside signal on one deterministic horizon.
              </h2>
            </div>
            <p className="nx-hero-bridge-lede">
              Connect Gmail, Google Calendar, GitHub, Spotify, Strava, Plaid, Vercel, and Formula 1 once. Command
              places live telemetry on a single 24-hour horizon and executes deterministic cross-API recipes—routing
              email receipts straight into Ledger or locking Deep Work focus blocks—at zero AI compute cost.
            </p>
          </div>

          <CommandLivePreview />
        </div>
      </section>

      {/* CHAPTER 04: TIER 03 — MODULAR SOCKET NODES & PUBLIC SDK */}
      <section className="land-section land-section--stage" aria-labelledby="nodes-section-title">
        <div className="land-container">
          <div className="nx-hero-bridge">
            <div className="nx-hero-bridge-title">
              <p className="site-kicker">Tier 03 · Modular Socket Ecosystem</p>
              <h2 id="nodes-section-title" className="landing-line max-w-[20ch]">
                Standalone workspaces that snap into the core.
              </h2>
            </div>
            <p className="nx-hero-bridge-lede">
              Like extensions in VS Code or Obsidian, Nodes are full-scale deterministic applications—Studio, Study,
              Ledger, and Canvas—wired into orbital sockets around the core. They subscribe to Command feeds and pass
              typed records to one another over the shared event bus.
            </p>
          </div>

          <NodesLivePreview />
        </div>
      </section>

      {/* CHAPTER 05: CONVERGENCE HORIZON & WAITLIST */}
      <LandingCTA />
    </div>
  );
}
