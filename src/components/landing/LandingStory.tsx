import Link from "next/link";

export function LandingStory() {
  return (
    <div className="site-story">
      <section className="site-block" aria-labelledby="environment-title">
        <p className="site-kicker">Nexus</p>
        <h2 id="environment-title" className="site-display">
          A personal operating environment.
        </h2>
        <div className="site-copy">
          <p>
            The network is the room you come home to. Chat lives there with it. Extensions take their place on the same
            network and keep working when the intelligence is quiet. Research reads the web. Command is the cockpit for
            everything outside.
          </p>
        </div>
      </section>

      <section className="site-block" aria-labelledby="network-title">
        <div className="site-rule" aria-hidden="true" />
        <p className="site-kicker">Network</p>
        <h2 id="network-title" className="site-display">
          One field. One conversation.
        </h2>
        <div className="site-copy">
          <p>
            Sign in, and the golden network is the room: filaments drawn through a core, the same field you crossed to
            arrive. Beneath it, a single voice. Ask Nexus to shape the day, to take something on, to set something down.
            The reply comes in a quiet line, and the day moves with it.
          </p>
          <p>
            While Nexus thinks, light draws in toward the core. While it speaks, a ripple travels out along the
            filaments. The home view is only that field, and the chat. The conversation lives for the visit. When you
            leave, it lets go.
          </p>
        </div>
      </section>

      <section className="site-block" aria-labelledby="extensions-title">
        <div className="site-rule" aria-hidden="true" />
        <p className="site-kicker">Extensions</p>
        <h2 id="extensions-title" className="site-display">
          They work without the intelligence.
        </h2>
        <div className="site-copy">
          <p>
            An extension is a node wired into the core. It does its own work. Nothing has to be asked of the intelligence
            first. Nodes pass typed content between them — a source, a note, a record — and only along the capabilities
            each one is granted.
          </p>
          <p>
            Two sockets are free. Pro opens the rest. What you place there stays on the same network, so the work is
            shared instead of sealed in a separate app.
          </p>
        </div>
      </section>

      <section className="site-block" aria-labelledby="research-title">
        <div className="site-rule" aria-hidden="true" />
        <p className="site-kicker">Research</p>
        <h2 id="research-title" className="site-display">
          The web, read properly.
        </h2>
        <div className="site-copy">
          <p>
            Research is a browser inside Nexus. One bar takes an address or a question. Search is Brave. A page opens as
            a clean reader, the writing held on its own, and the original remains available when the site allows it.
          </p>
          <p>
            Save a page and it becomes a source: a collection, tags, a highlight, a note in the margin. Other extensions
            can read that source. Finding, reading, and keeping happen with no model in the path.
          </p>
        </div>
      </section>

      <section className="site-block" aria-labelledby="command-title">
        <div className="site-rule" aria-hidden="true" />
        <p className="site-kicker">Command</p>
        <h2 id="command-title" className="site-display">
          A cockpit for the outside world.
        </h2>
        <div className="site-copy">
          <p>
            Command connects the services you choose and lays them on one timeline. Weather and the night sky. Mail, and
            the month ahead. GitHub, a deploy, a run, a playlist, a race weekend. What you leave unconnected is simply
            absent.
          </p>
          <p>
            The links between them are rules. Deep work can hold time on the calendar and start the music. A receipt can
            become a delivery on the day. A finished run can close a goal. When a service is missing, that step is
            skipped, and the log says so.
          </p>
          <p>
            Tokens you give Command are sealed with encryption before they are stored. They are never handed back to the
            browser.
          </p>
        </div>
      </section>

      <section className="site-block site-block--close" aria-labelledby="enter-title">
        <div className="site-rule" aria-hidden="true" />
        <h2 id="enter-title" className="site-display">
          The room is open.
        </h2>
        <div className="site-copy">
          <p>Sign in with Google, or with a link sent to your email. There is no password.</p>
        </div>
        <Link href="/signup" className="landing-signup site-enter">
          Sign up
        </Link>
      </section>
    </div>
  );
}
