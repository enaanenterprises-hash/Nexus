import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_DATE, SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Privacy — Nexus",
  description:
    "What Nexus stores, who else handles it, and the rule that does not bend: Nexus does not sell personal data.",
};

export default function PrivacyPage() {
  return (
    <SiteDocument
      kicker="Privacy"
      title="Privacy policy"
      lede={
        <>
          <p>
            Nexus is made by Muhtasim Mohammad in Toronto. This policy describes what the product stores, who else
            handles it, and the rule that does not bend: Nexus does not sell personal data.
          </p>
          <p>
            <time dateTime="2026-11-14">Effective {POLICY_DATE}</time>
          </p>
        </>
      }
    >
      <h2>Account</h2>
      <p>
        You sign in with Google, or with a magic link sent to your email through Resend. There is no password.
      </p>
      <p>An account is stored in Neon Postgres:</p>
      <ul>
        <li>an id for the account</li>
        <li>your email address</li>
        <li>your name and profile image, when Google provides them</li>
        <li>the time your email was verified</li>
      </ul>
      <p>
        The same verified email, whether it arrives from Google or from the magic link, belongs to one account.
      </p>
      <p>
        If you use Google, Nexus also stores the OAuth tokens Google returns for that sign-in: an access token, a
        refresh token when Google issues one, the expiry, the scopes, and the id token. They stay in the account record
        so the sign-in can continue, and so a Google service in Command can be connected later, only if you ask.
        Signing in with Google does not, by itself, connect Calendar, Gmail, or Tasks.
      </p>
      <p>
        If you use email, Resend delivers the message. Resend receives your address and the letter so the link can
        arrive. The link expires in 24 hours. Nexus keeps a verification token until you use it or it expires.
      </p>

      <h2>Session and cookies</h2>
      <p>
        A session is a row in Neon Postgres. The cookie in your browser holds a session identifier, not your profile. It
        is httpOnly, and on the live site it is sent only over HTTPS. Signing out ends that session.
      </p>
      <p>
        While you connect a service, Nexus may set a short-lived cookie to remember the OAuth state, or to remember
        which Google service you asked to connect. Those cookies expire within minutes.
      </p>
      <p>
        Research remembers the collection you last had open, in local storage on your device, as an id and nothing more.
      </p>

      <h2>The network and chat</h2>
      <p>
        The conversation with Nexus, and the Today list you shape beside it, live in the browser for that visit. They
        are not written to the database. Refresh the page, or leave, and that exchange is gone.
      </p>
      <p>
        The day opens with sample tasks so the room is not empty. Those samples are part of the interface. They are not
        a record of you.
      </p>

      <h2>Research</h2>
      <p>
        When you use Research, Nexus stores, under your account, the collections you create, the pages you save, and
        the highlights you take. A saved page includes its address, title, and the text of the article, together with a
        cleaned copy of the page markup, plus any tags and notes.
      </p>
      <p>
        When you search, the query is sent from the Nexus server to Brave Search. Brave receives the query. The Brave
        key stays on the server. When you open an address, the server fetches the page in order to build the reader, and
        refuses addresses that point at local or private networks.
      </p>

      <h2>Command</h2>
      <p>
        Command stores the services you connect, the settings you give them, the items those services sync, the
        automations you switch on, a log of automation runs, and focus sessions you start. A place you set for weather
        or the night sky is part of those settings, and the coordinates are sent to Open-Meteo.
      </p>
      <p>What a sync keeps depends on the service you connected.</p>
      <ul>
        <li>Gmail keeps the sender, subject, and snippet of recent inbox messages. A portion of the body is kept only when the message looks like a receipt, so a delivery can be tracked.</li>
        <li>Mail you send is handed to Gmail. Nexus does not keep a separate copy of an outbox.</li>
        <li>Calendar, Tasks, GitHub, Vercel, Strava, Spotify, Telegram, prices, Formula 1, uptime, weather, and the night sky keep the fields that connector is built to show on your timeline.</li>
      </ul>
      <p>
        Connector credentials — personal tokens, and the grants for Google Calendar, Gmail, and Tasks — are encrypted
        with AES-256-GCM before they are saved. The encrypted value is not sent back to the browser. A dedicated key is
        used when one is configured. Otherwise the key is derived from the sign-in secret.
      </p>
      <p>Disconnecting a service deletes that connection and the items it synced.</p>
      <p>
        Command talks only to services you connect, and to a few sources that need no token: weather and the night sky
        through Open-Meteo, prices through CoinGecko, Formula 1 timing through Jolpica, and public uptime checks of
        sites you name.
      </p>

      <h2>Where data is kept</h2>
      <p>The application is hosted on Vercel. The database is Neon Postgres. Other parties see data only as follows.</p>
      <ul>
        <li>Google, if you sign in with Google or connect a Google service.</li>
        <li>Resend, to deliver a magic-link email.</li>
        <li>Brave Search, which receives a Research query.</li>
        <li>Open-Meteo, CoinGecko, and Jolpica, for the keyless readings Command shows.</li>
        <li>GitHub, Vercel, Telegram, Strava, and Spotify, only after you connect them, and only for what that connection requires.</li>
      </ul>

      <h2>Sale of personal data</h2>
      <p>
        Nexus does not sell personal data. It does not share personal data with advertisers or data brokers. It does not
        run advertising cookies, and it does not run a third-party analytics product on this site. The conversation on
        the network is not sent to a model provider.
      </p>

      <h2>Removal</h2>
      <p>
        Inside Research you can delete a collection, a saved source, or a highlight. Disconnecting a service in Command
        removes that connection and the items it synced. Signing out ends the session.
      </p>
      <p>
        The account and the rows tied to it are removed together when the account is deleted from the database. The
        product does not yet include a self-serve button for that. To ask for the account to be removed,{" "}
        <Link href="/signup">sign in on this site</Link> and reach Muhtasim Mohammad there.
      </p>

      <h2>Children</h2>
      <p>
        Nexus is a personal product for the person who signs in. It is not made for children, and it does not knowingly
        collect their information.
      </p>

      <h2>Changes</h2>
      <p>
        When this policy changes, the date at the top changes with it. This version is {POLICY_DATE}. The{" "}
        <Link href="/terms">terms</Link> point here, and this policy is part of them.
      </p>

      <h2>Contact</h2>
      <p>
        Muhtasim Mohammad makes Nexus in Toronto. To reach him about this policy,{" "}
        <Link href="/signup">sign in on this site</Link>.
      </p>
    </SiteDocument>
  );
}
