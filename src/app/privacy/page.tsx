import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_DATE, SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Privacy — Nexus",
  description:
    "How Nexus handles data: zero selling of personal info, client-ephemeral conversations, and AES-256 encrypted credentials.",
};

export default function PrivacyPage() {
  return (
    <SiteDocument
      kicker="Privacy"
      title="Privacy policy"
      lede={
        <>
          <p>
            Nexus is built by Muhtasim Mohammad in Toronto. This policy outlines exactly what information we handle,
            where it lives, and the rule that never changes: Nexus does not sell your personal data, run advertising
            trackers, or monetize your private activity.
          </p>
          <p>
            <time dateTime="2026-11-14">Effective {POLICY_DATE}</time>
          </p>
        </>
      }
    >
      <h2>1. Account credentials &amp; identity</h2>
      <p>
        Authentication is passwordless. You sign in through Google OAuth or an email magic link dispatched via Resend.
        Your account profile in Neon Postgres records:
      </p>
      <ul>
        <li>A unique internal account identifier.</li>
        <li>Your verified email address.</li>
        <li>Your display name and avatar URL (when provided by Google).</li>
        <li>The timestamp of account creation and email verification.</li>
      </ul>
      <p>
        If you authenticate via Google, Nexus also maintains your OAuth tokens (access token, refresh token, expiry,
        and scopes). These allow your session to persist and enable Google integrations in Command only when you
        explicitly choose to connect them. Signing in with Google does not automatically read or link your Calendar,
        Gmail, or Tasks.
      </p>
      <p>
        For magic links, Resend receives your destination email address solely to deliver the single-use sign-in link,
        which expires after twenty-four hours.
      </p>

      <h2>2. Ephemeral network conversations</h2>
      <p>
        The central conversation with Nexus and your interactive Today timeline live strictly within your browser
        session. They are never written to our persistent database tables.
      </p>
      <p>
        When you refresh the tab or close your browser, the conversation context vanishes from active memory. We do not
        transmit your conversational queries to external consumer AI networks for model training. Privacy through
        ephemerality is central to our architectural design.
      </p>

      <h2>3. Research collections &amp; web reader</h2>
      <p>
        When you utilize Research, Nexus persists the collections you organize, web articles you explicitly save, and
        the text highlights and marginal notes you record. A saved item contains the source address, canonical title,
        cleaned article content, and metadata tags.
      </p>
      <p>
        Web search queries are dispatched through server-side calls to the Brave Search API. Your personal client IP is
        not exposed to Brave, and the server-side API secret remains strictly protected. The reader fetch engine rejects
        requests targeting localhost or internal private IP subnets (SSRF protection).
      </p>

      <h2>4. Command connectors &amp; encrypted credentials</h2>
      <p>
        Command synchronizes data from external tools you choose to connect. The scope of cached data is strictly
        limited to what each connector requires for your timeline:
      </p>
      <ul>
        <li>
          <strong>Gmail:</strong> Syncs sender names, message subjects, date headers, and brief preview snippets. Full
          message bodies are evaluated solely when an incoming email resembles an order receipt or shipping notice,
          allowing automated timeline tracking. Sent messages are dispatched directly via Gmail API without local retention.
        </li>
        <li>
          <strong>Calendar &amp; Tasks:</strong> Retains upcoming schedule intervals, task names, and due dates.
        </li>
        <li>
          <strong>Developer tools (GitHub, Vercel):</strong> Tracks notifications, deployment events, and repository signals.
        </li>
        <li>
          <strong>Activity feeds (Strava, Spotify):</strong> Syncs recent workouts and currently playing tracks.
        </li>
        <li>
          <strong>Keyless widgets:</strong> Weather and celestial coordinates (Open-Meteo), crypto rates (CoinGecko),
          Formula 1 lap timing (Jolpica), and public uptime monitors require no user authentication tokens.
        </li>
      </ul>
      <p>
        All connector tokens and OAuth refresh secrets are encrypted at rest with AES-256-GCM before writing to the
        database. Encrypted credentials are never sent down to the client browser. Disconnecting an integration instantly
        purges its stored credentials and associated cached records.
      </p>

      <h2>5. Cookies &amp; local storage</h2>
      <p>
        Nexus uses strictly necessary cookies to keep you signed in. Session cookies are marked <code>httpOnly</code>,
        <code>SameSite=Lax</code>, and <code>Secure</code> on production domains, meaning they cannot be read by
        third-party client scripts.
      </p>
      <p>
        Temporary cookies may be generated during OAuth handshake flows to prevent CSRF attacks; these expire in a matter
        of minutes. Local storage is used minimally, such as storing your active Research collection preference.
        We use zero third-party advertising cookies or cross-site tracking beacons.
      </p>

      <h2>6. Service providers &amp; data processors</h2>
      <p>
        To run our global cloud infrastructure, data is processed with vetted hosting providers:
      </p>
      <ul>
        <li><strong>Vercel:</strong> Edge hosting, serverless functions, and static assets.</li>
        <li><strong>Neon:</strong> Managed cloud PostgreSQL database with encrypted storage.</li>
        <li><strong>Resend:</strong> Transactional magic-link delivery.</li>
        <li><strong>Brave Search:</strong> Server-side web search query fulfillment.</li>
      </ul>

      <h2>7. Data retention &amp; your rights</h2>
      <p>
        You have complete control over your content. You can delete collections, highlights, and sources within
        Research at any moment. Disconnecting integrations in Command wipes the connection state and cached items.
      </p>
      <p>
        To request complete account deletion, data exports, or rectification under applicable privacy laws (including
        GDPR or CCPA/CPRA), please visit our <Link href="/contact">contact page</Link>. When an account deletion is
        executed, all associated database records are permanently deleted.
      </p>

      <h2>8. Children&apos;s privacy</h2>
      <p>
        Nexus is designed for individuals aged sixteen and older. We do not intentionally solicit or collect personal
        data from children. If you become aware that a minor has registered an account without authorization, please notify
        us immediately so we can remove the account.
      </p>

      <h2>9. Policy updates</h2>
      <p>
        We may amend this privacy policy as our system capabilities evolve. Changes will be posted to this page with an
        updated effective date. Material alterations will be highlighted within the product interface.
      </p>

      <h2>10. Inquiries &amp; contact</h2>
      <p>
        For inquiries regarding our privacy standards or to exercise your privacy rights, please submit a request via our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </SiteDocument>
  );
}
