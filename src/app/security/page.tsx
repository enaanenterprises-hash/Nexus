import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Security — Nexus",
  description:
    "How Nexus safeguards user data: AES-256-GCM encryption, passwordless authentication, ephemeral chat, and SSRF prevention.",
};

export default function SecurityPage() {
  return (
    <SiteDocument
      kicker="Security"
      title="Architecture &amp; safeguards."
      lede={
        <p>
          Security in Nexus is built directly into our system architecture, from client-side ephemerality to
          authenticated cryptographic storage for every connected service.
        </p>
      }
    >
      <h2>Zero-password authentication</h2>
      <p>
        Nexus completely eliminates traditional passwords, mitigating credential stuffing, password reuse attacks, and
        database password leaks. Authentication is handled exclusively through:
      </p>
      <ul>
        <li>
          <strong>Google OAuth 2.0:</strong> Cryptographically verified tokens using OpenID Connect standards.
        </li>
        <li>
          <strong>Cryptographic magic links:</strong> Time-bounded, single-use signed verification tokens delivered via
          Resend that automatically expire after twenty-four hours.
        </li>
      </ul>
      <p>
        Sessions are stored securely in Neon Postgres. Client browsers receive only randomized, opaque session tokens
        stored in <code>httpOnly</code>, <code>SameSite=Lax</code> cookies delivered strictly over TLS/HTTPS.
      </p>

      <h2>AES-256-GCM credential encryption</h2>
      <p>
        When you connect integrations like Gmail, GitHub, or Spotify in Command, credentials such as OAuth refresh
        tokens and personal access keys are immediately encrypted at rest using Galois/Counter Mode (AES-256-GCM).
      </p>
      <p>
        GCM provides both confidentiality and cryptographic authenticity checks against tampering. Encryption keys are
        isolated in runtime environment variables (or derived using high-entropy secrets) and are never exposed to client
        browsers or stored in plaintext database fields.
      </p>

      <h2>Ephemeral intelligence layer</h2>
      <p>
        The central neural network conversation and your interactive Today agenda are held in volatile browser state.
        Unlike conventional AI chat assistants that permanently record conversations into searchable databases, Nexus
        never writes your prompt exchanges to persistent tables. Refreshing or navigating away clears the active context.
      </p>

      <h2>Network boundary &amp; SSRF protections</h2>
      <p>
        When Research opens articles from the web, fetch operations are proxied through our server-side reader engine.
        To guard against Server-Side Request Forgery (SSRF), our proxy validates target hostnames and IP addresses
        against RFC 1918 private network ranges, loopback addresses (127.0.0.1/8), link-local subnets, and cloud
        metadata endpoints.
      </p>

      <h2>Scoped extension permissions</h2>
      <p>
        Nexus extensions operate within strict capability sandboxes. An extension cannot broadly read another
        extension&apos;s internal state; it must declare typed content schemas (such as <code>content:mail:read</code> or{" "}
        <code>content:calendar:write</code>). The socket bus enforces these boundaries before relaying messages between
        modules.
      </p>

      <h2>Hosting &amp; cloud infrastructure</h2>
      <p>
        Nexus infrastructure is hosted with world-class cloud providers:
      </p>
      <ul>
        <li>
          <strong>Vercel Edge Network:</strong> ISO 27001, SOC 2 Type II certified edge hosting with automated DDoS
          mitigation and continuous TLS certificate enforcement.
        </li>
        <li>
          <strong>Neon Serverless Postgres:</strong> SOC 2 Type II certified managed database with continuous backups and
          encryption at rest.
        </li>
      </ul>

      <h2>Vulnerability disclosure</h2>
      <p>
        We welcome responsible reports from security researchers. If you identify a potential vulnerability, please
        email our security team at <a href="mailto:security@nexushq.app">security@nexushq.app</a> or reach out through our{" "}
        <Link href="/contact">contact page</Link>. We commit to acknowledging your report within forty-eight hours and
        keeping you updated as we validate and deploy a remediation.
      </p>
    </SiteDocument>
  );
}
