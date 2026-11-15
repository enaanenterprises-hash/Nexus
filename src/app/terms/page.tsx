import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_DATE, SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Terms — Nexus",
  description:
    "Terms of use for Nexus, the personal AI operating environment made by Muhtasim Mohammad in Toronto.",
};

export default function TermsPage() {
  return (
    <SiteDocument
      kicker="Terms"
      title="Terms of use"
      lede={
        <>
          <p>
            These terms govern your access to and use of Nexus, the personal AI operating environment built by Muhtasim
            Mohammad in Toronto. By signing in or using the application, you agree to be bound by these terms.
            Our <Link href="/privacy">privacy policy</Link> forms an integral part of this agreement.
          </p>
          <p>
            <time dateTime="2026-11-14">Effective {POLICY_DATE}</time>
          </p>
        </>
      }
    >
      <h2>1. The product &amp; scope</h2>
      <p>
        Nexus provides a unified personal computing environment comprising the central neural network and chat interface,
        modular extension sockets, the Research web reader, and the Command integration cockpit.
      </p>
      <p>
        Extension sockets allow background services to interoperate under explicit capability grants. The first two
        sockets are provided free of charge. Pro sockets are offered as an early preview; Nexus does not charge fees or
        collect payment information at this time. Sockets with reserved designations (such as Studio, Study, Call, and
        Calendar) are upcoming releases and are not yet active.
      </p>
      <p>
        The central intelligence assists in organizing, synthesizing, and displaying contextual information across your
        day. AI outputs can be incomplete or inaccurate. Nexus is not a licensed attorney, medical practitioner,
        financial consultant, or fiduciary. Final decisions and actions always remain your sole responsibility.
      </p>

      <h2>2. Eligibility &amp; account responsibility</h2>
      <p>
        You must be at least sixteen years old to access or create an account on Nexus. By using the platform, you
        warrant that you have full legal capacity to enter into these terms.
      </p>
      <p>
        Authentication is managed through Google OAuth or email-delivered magic links; passwords are not used. You are
        responsible for safeguarding access to your email and Google credentials, and for all activities that occur
        under your session. Each verified email corresponds to a single distinct user account.
      </p>

      <h2>3. Your content &amp; intellectual property</h2>
      <p>
        You retain full ownership and intellectual property rights in all data, documents, highlights, personal notes,
        and third-party content you bring into Nexus.
      </p>
      <p>
        You grant Nexus a limited, non-exclusive license to process, store, index, and transmit your content solely to the
        extent necessary to provide, protect, and operate the platform for you. Nexus never claims ownership of your
        materials, does not sell your data to third parties, and does not use your private content to train public AI models.
      </p>

      <h2>4. Connected services &amp; third-party APIs</h2>
      <p>
        Command allows you to link external accounts including Gmail, Google Calendar, Google Tasks, GitHub, Vercel,
        Strava, Spotify, and Telegram. Each third-party service is governed by its own independent terms and privacy
        agreements. Nexus is independent of these providers.
      </p>
      <p>
        You must connect only accounts and resources that you have lawful authorization to access. Connectors may fail,
        change, or be revoked by the respective third-party provider without notice. Automation workflows execute strictly
        according to deterministic rules, skipping steps whose underlying connectors are unlinked or unauthorized.
      </p>
      <p>
        Credentials, tokens, and OAuth keys provided for connectors are encrypted with AES-256-GCM prior to storage in
        Neon Postgres. Disconnecting a service immediately purges the connector credential and its synced cache.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        You agree to use Nexus strictly for lawful, personal, or professional productivity purposes. You shall not:
      </p>
      <ul>
        <li>Use Nexus to violate any applicable municipal, provincial, federal, or international law.</li>
        <li>Probe, scan, reverse-engineer, or attempt to compromise the integrity or security of Nexus infrastructure.</li>
        <li>Transmit spam, unauthorized promotional messages, or abusive communications through connected integrations.</li>
        <li>Attempt to intercept, access, or decrypt data belonging to other users.</li>
        <li>Abuse automated rate limits or disrupt network availability for other members of the community.</li>
      </ul>

      <h2>6. Intellectual property of Nexus</h2>
      <p>
        The Nexus name, logo marks, visual interfaces, graphic assets, typography, design systems, and source code are
        the exclusive intellectual property of Muhtasim Mohammad. Nothing in these terms confers any title or licensing
        rights beyond the limited right to use the web application in accordance with this agreement.
      </p>

      <h2>7. Service availability &amp; modifications</h2>
      <p>
        Nexus is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis during its beta development cycle.
        Features may be modified, updated, temporarily paused, or retired at any time. We make reasonable efforts to
        maintain dependable uptime, but we do not guarantee uninterrupted availability.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by applicable law, Nexus and Muhtasim Mohammad disclaim all warranties, whether
        express, statutory, or implied, including warranties of merchantability, fitness for a particular purpose, and
        non-infringement.
      </p>
      <p>
        In no event shall Muhtasim Mohammad be liable for indirect, incidental, special, exemplary, or consequential
        damages, including loss of profits, data, goodwill, or service interruptions resulting from your use of the
        application or third-party connectors. Where jurisdictions prohibit certain liability waivers, liability shall
        be limited to the lowest amount permitted under governing law.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may cease using Nexus at any time. Disconnecting third-party services removes their associated records, and
        you may request permanent account deletion via our <Link href="/contact">contact page</Link>.
      </p>
      <p>
        Nexus reserves the right to suspend or terminate accounts that breach these terms or threaten the stability and
        security of the platform. Clauses regarding ownership, intellectual property, liability limits, and dispute
        resolution survive termination.
      </p>

      <h2>10. Governing law &amp; jurisdiction</h2>
      <p>
        These terms shall be governed by and construed in accordance with the laws of the Province of Ontario and the
        federal laws of Canada applicable therein, without regard to conflict of law principles. Any legal proceeding
        arising under these terms shall be instituted exclusively in the competent courts located in Toronto, Ontario.
      </p>

      <h2>11. Amendments</h2>
      <p>
        We may update these terms periodically to reflect product changes, new features, or statutory requirements.
        When updates are published, the effective date at the top of this document will be amended accordingly.
        Continued use of Nexus following updates constitutes acceptance of the revised terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        If you have questions or require clarification regarding these terms, please visit our{" "}
        <Link href="/contact">contact page</Link> or reach out directly to Muhtasim Mohammad.
      </p>
    </SiteDocument>
  );
}
