import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "FAQ — Nexus",
  description:
    "Frequently asked questions about Nexus: architecture, extension sockets, privacy, pricing, and how it works.",
};

export default function FAQPage() {
  return (
    <SiteDocument
      kicker="FAQ"
      title="Common questions."
      lede={
        <p>
          Everything you need to know about Nexus, its architecture, and how it handles your day.
          If your question isn&apos;t covered here, reach out to us directly on our{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      }
    >
      <h2>What exactly is Nexus?</h2>
      <p>
        Nexus is a personal AI operating environment. Rather than forcing you to jump across dozens of disjointed apps
        and tabs, Nexus unifies your digital tools into a single room with a neural network at the center. It combines
        a conversational intelligence, a distraction-free web research reader, and a timeline cockpit connecting your
        mail, calendar, and developer tools.
      </p>

      <h2>How does the network chat work? Is it private?</h2>
      <p>
        The central golden network provides a real-time conversational interface designed for orchestrating your day.
        Crucially, this live exchange is ephemeral: it lives in your browser session and is never written to a permanent
        database table. When you leave or refresh the tab, the room clears. Your chat is not harvested to train public AI models.
      </p>

      <h2>What are extension sockets?</h2>
      <p>
        Sockets are modular integration ports built directly into the Nexus neural architecture. Each extension occupies
        a designated socket and declares typed capabilities defining exactly what information it can read or emit.
        This ensures extensions cannot snoop on unrelated workflows.
      </p>

      <h2>How much does Nexus cost?</h2>
      <p>
        Nexus is currently in open beta. The base operating environment and your first two extension sockets are
        completely free. Pro sockets are shown as an early preview; no subscription fees or payment cards are required
        today.
      </p>

      <h2>How do I sign up or log in?</h2>
      <p>
        Nexus uses completely passwordless authentication. You can sign in using your Google account or request an email
        magic link via Resend on our <Link href="/signup">sign-up page</Link>. We never ask you to create or memorize
        passwords.
      </p>

      <h2>What is the Research view?</h2>
      <p>
        Research is a web reader designed for deep, focused exploration. It uses Brave Search to query the web, opens
        articles in clean typography stripped of clutter and trackers, and lets you save highlights, notes, and full
        sources into organized collections.
      </p>

      <h2>What services can I connect in Command?</h2>
      <p>
        Command currently supports connectors for Gmail, Google Calendar, Google Tasks, GitHub, Vercel, Strava, Spotify,
        and Telegram. It also includes keyless widgets for local weather and astronomy forecasts (Open-Meteo),
        cryptocurrency prices (CoinGecko), Formula 1 championship timing (Jolpica), and automated uptime monitors.
      </p>

      <h2>How are my credentials and tokens protected?</h2>
      <p>
        Third-party OAuth tokens and API secrets linked through Command are encrypted using industry-standard
        AES-256-GCM encryption before being committed to our database. Encrypted keys are never transmitted down to the
        browser. Learn more on our <Link href="/security">security page</Link>.
      </p>

      <h2>Can I delete my account and data?</h2>
      <p>
        Yes. You can delete collections, saved articles, and highlights directly in Research, and unlinking a connector
        in Command immediately removes all its synced cached records. For a full account wipe, send a request via our{" "}
        <Link href="/contact">contact page</Link> and we will permanently delete your account and all associated data.
      </p>

      <h2>What browsers and devices are supported?</h2>
      <p>
        Nexus is a modern web application built for evergreen browsers including Chrome, Edge, Safari, and Firefox
        across macOS, Windows, Linux, iOS, and Android. No local installation or native application download is required.
      </p>
    </SiteDocument>
  );
}
