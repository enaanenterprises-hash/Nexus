import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "About — Nexus",
  description:
    "Nexus is a personal AI operating environment made by Muhtasim Mohammad in Toronto. One room for work that usually lives apart.",
};

export default function AboutPage() {
  return (
    <SiteDocument
      kicker="About"
      title="Made in Toronto."
      lede={
        <p>
          Nexus is a personal AI operating environment. One room for work that usually lives apart.
          Muhtasim Mohammad builds it in Toronto.
        </p>
      }
    >
      <h2>The vision</h2>
      <p>
        Modern life is scattered across dozens of disjointed apps, tabs, and notifications. We jump between calendar
        invites, inbox threads, research snippets, and background trackers, constantly rebuilding context from scratch.
      </p>
      <p>
        Nexus is an attempt to bring the essential threads into one intelligent, coherent room. It is not another
        to-do list or distraction-heavy feed. It is a quiet operating environment with a neural network at the center
        that understands the shape of your day, connects your tools, and provides clarity without the noise.
      </p>

      <h2>The network</h2>
      <p>
        The home view is a living golden neural field with an open conversation beneath it. When you ask Nexus to
        arrange your morning or synthesize the commitments ahead, it answers with immediate context.
      </p>
      <p>
        The exchange is ephemeral by design: refresh the page, and the room resets cleanly. Nothing from the live chat
        or your temporary Today list is permanently stored in a database. Privacy through impermanence is an intentional
        foundation, not an afterthought.
      </p>

      <h2>Research</h2>
      <p>
        Research is a reader and memory system for the web. Powered by Brave Search, it lets you explore topics and
        read articles stripped of popups, cookie walls, and trackers.
      </p>
      <p>
        Save articles into themed collections, highlight key phrases, and record margin notes that stay tethered to
        their sources. The search key remains protected on the server, and requests to private internal networks are
        automatically blocked.
      </p>

      <h2>Command</h2>
      <p>
        Command is the cockpit turned outward to the real world. Weather forecasts, emails, calendar schedules, and
        the external services you link arrive on a single chronological timeline.
      </p>
      <p>
        Connect Gmail, Google Calendar, Google Tasks, GitHub, Vercel, Strava, Spotify, and Telegram. Each connector
        syncs only the fields required for your timeline. Automations execute according to deterministic rules, and
        every third-party credential is encrypted with AES-256-GCM before storage. Keyless feeds like weather, crypto
        prices, and Formula 1 timing require no authentication tokens at all.
      </p>

      <h2>The socket architecture</h2>
      <p>
        Everything in Nexus connects through a modular socket protocol. Extensions occupy sockets on the network and
        declare typed capabilities specifying exactly what content they may inspect and share.
      </p>
      <p>
        Two sockets are free forever. Pro unlocks additional sockets for power workflows. Extensions run quietly in the
        background, maintaining awareness even when you are not speaking directly to the network. Reserved sockets like
        Studio, Study, Call, and Calendar represent the future expansions already taking shape.
      </p>

      <h2>The stack &amp; craftsmanship</h2>
      <p>
        Nexus is engineered with Next.js, React, Tailwind CSS, and Neon Postgres, hosted on Vercel. Authentication uses
        secure Google OAuth or passwordless email magic links delivered via Resend.
      </p>
      <p>
        We do not sell personal data, host advertising networks, or run tracking pixels. To learn more about our
        principles and technical safeguards, read our <Link href="/privacy">privacy policy</Link> and{" "}
        <Link href="/security">security overview</Link>.
      </p>

      <h2>Open beta</h2>
      <p>
        Nexus is actively in beta. We are continually refining the interface, polishing extension behaviors, and
        listening closely to early users.
      </p>
      <p>
        If you encounter an issue, have an idea, or want to say hello, reach out through our{" "}
        <Link href="/contact">contact page</Link> or <Link href="/signup">sign in</Link> to experience the network.
      </p>
    </SiteDocument>
  );
}
