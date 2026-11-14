import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_DATE, SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Terms — Nexus",
  description: "The terms for using Nexus, a personal AI operating environment made by Muhtasim Mohammad in Toronto.",
};

export default function TermsPage() {
  return (
    <SiteDocument
      kicker="Terms"
      title="Terms of use"
      lede={
        <>
          <p>
            These terms cover your use of Nexus, the personal AI operating environment made by Muhtasim Mohammad in
            Toronto. Signing in, or using the product, means you agree to them. The{" "}
            <Link href="/privacy">privacy policy</Link> is part of this agreement.
          </p>
          <p>
            <time dateTime="2026-11-14">Effective {POLICY_DATE}</time>
          </p>
        </>
      }
    >
      <h2>The product</h2>
      <p>
        Nexus gives you a network and a chat, extension sockets on that network, Research, and Command. Extensions are
        built to work without the intelligence. Research reads and files pages. Command connects outside services and
        runs automations by rule.
      </p>
      <p>
        Names reserved on empty sockets — Studio, Study, Call, and Calendar — are not available yet. Two sockets are
        free. Further sockets are marked Pro. Pro on the dashboard is a preview: Nexus does not charge a fee today, and
        it does not collect payment information.
      </p>
      <p>
        The voice on the network can arrange the day in front of you. It can be wrong. It is not a lawyer, a physician,
        or a financial adviser. Decisions stay with you.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with Google or with an email magic link. You need the right to use that Google account or that
        email address. You are responsible for what happens under your sign-in, including the services you choose to
        connect.
      </p>

      <h2>Your material</h2>
      <p>
        You keep the rights in what you bring: pages you save, notes, highlights, and the content of the accounts you
        connect. You let Nexus store that material, fetch pages you open, and call the services you connect, so the
        product can show it to you and share it among your own extensions.
      </p>
      <p>
        Nexus does not take ownership of that material. Nexus does not sell it. The{" "}
        <Link href="/privacy">privacy policy</Link> describes what is stored and how to ask for it to be removed.
      </p>

      <h2>Connected services</h2>
      <p>
        Google, Resend, Neon, Brave, Vercel, and every service you connect in Command have their own terms. Nexus is
        not those companies. A connector can fail, change, or be revoked on the other side. Automations do what their
        rules say, and a step is skipped when its service is not connected.
      </p>
      <p>Connect only accounts you are allowed to connect. Tokens you provide are stored encrypted, as the privacy policy describes.</p>

      <h2>Acceptable use</h2>
      <p>
        Use Nexus for your own life and work. Do not use it to break the law, to probe or disrupt systems you do not
        have permission to touch, to send abuse through a connected account, or to interfere with the service for
        anyone else. Do not attempt to read another person&apos;s data.
      </p>

      <h2>Availability</h2>
      <p>
        Nexus is offered as it stands. It may change, pause, or drop a connector when a provider changes. Access may be
        suspended if a use harms the service or other people. There is no promised uptime.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, Nexus is provided without warranties of any kind, and Muhtasim Mohammad is not
        liable for indirect, incidental, or consequential loss, or for what a connected service does under its own
        terms. Where a limit of that kind is not allowed, the limit is the smallest the law does allow.
      </p>
      <p>Nothing in these terms limits liability that cannot legally be limited.</p>

      <h2>Ending</h2>
      <p>
        You may stop at any time and sign out. Disconnecting a service removes that connection. Asking for the account
        to be removed is described in the <Link href="/privacy">privacy policy</Link>. Access may end if these terms
        are broken.
      </p>

      <h2>Law</h2>
      <p>
        These terms are governed by the laws of Ontario and the federal laws of Canada that apply in Ontario. Disputes
        are handled in the courts of Toronto, Ontario, unless the law requires another forum.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change, the date on this page changes. This version is {POLICY_DATE}. Continuing to use Nexus
        after the date changes means you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        To reach Muhtasim Mohammad about these terms, <Link href="/signup">sign in on this site</Link>.
      </p>
    </SiteDocument>
  );
}
