import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Contact — Nexus",
  description:
    "Get in touch with Muhtasim Mohammad and the team behind Nexus. Support, feedback, bug reports, and inquiries.",
};

export default function ContactPage() {
  return (
    <SiteDocument
      kicker="Contact"
      title="Get in touch."
      lede={
        <p>
          Nexus is made with care in Toronto. Whether you have feedback, a bug report, or questions about our
          roadmap, every message is read and answered.
        </p>
      }
    >
      <h2>General inquiries &amp; feedback</h2>
      <p>
        We love hearing how Nexus fits into your workflow. If you have questions about current capabilities or
        suggestions for new extensions and connectors, drop us a note at:
      </p>
      <p>
        <a href="mailto:hello@nexushq.app">hello@nexushq.app</a>
      </p>
      <p>
        You can also share immediate feedback directly inside the app whenever you are signed into your account.
      </p>

      <h2>Bug reports &amp; technical issues</h2>
      <p>
        If something in the network behaves unexpectedly, please let us know so we can resolve it promptly. When
        reporting an issue, including the following details helps us reproduce and fix it quickly:
      </p>
      <ul>
        <li>Your operating system and browser version.</li>
        <li>The specific view or connector involved (e.g., Command timeline, Research reader, or Google sync).</li>
        <li>Any error message or screenshot illustrating the behavior.</li>
      </ul>
      <p>
        Send technical reports to <a href="mailto:bugs@nexushq.app">bugs@nexushq.app</a> or open an issue on our GitHub
        repository if you are participating in the developer beta.
      </p>

      <h2>Privacy &amp; data requests</h2>
      <p>
        To request an export of your saved research collections, ask questions about our AES-256 encrypted credential
        architecture, or request complete account deletion, please email us with the subject line &ldquo;Privacy
        Request&rdquo; at:
      </p>
      <p>
        <a href="mailto:privacy@nexushq.app">privacy@nexushq.app</a>
      </p>
      <p>
        For detailed explanations of our storage and retention policies, consult our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Security vulnerabilities</h2>
      <p>
        If you believe you have discovered a security concern or vulnerability in Nexus, please practice coordinated
        vulnerability disclosure and report it immediately to:
      </p>
      <p>
        <a href="mailto:security@nexushq.app">security@nexushq.app</a>
      </p>
      <p>
        Please review our <Link href="/security">security guidelines</Link> before submitting.
      </p>

      <h2>Location &amp; origin</h2>
      <p>
        Nexus is headquartered in Toronto, Ontario, Canada.
      </p>
    </SiteDocument>
  );
}
