import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "Accessibility — Nexus",
  description:
    "Our commitment to digital accessibility: WCAG 2.1 AA targets, keyboard navigation, high contrast, and reduced motion.",
};

export default function AccessibilityPage() {
  return (
    <SiteDocument
      kicker="Accessibility"
      title="Built for everyone."
      lede={
        <p>
          Technology should adapt to people, not the other way around. We are committed to making Nexus intuitive,
          navigable, and accessible to everyone, including those navigating with assistive technologies.
        </p>
      }
    >
      <h2>Our standards &amp; commitment</h2>
      <p>
        Nexus strives to meet and exceed the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. As a software
        environment designed to reduce cognitive load and simplify complex workflows, clarity and ease of navigation
        are foundational design principles.
      </p>

      <h2>Core accessibility practices</h2>
      <p>
        We build accessibility directly into the component layer rather than treating it as a patch:
      </p>
      <ul>
        <li>
          <strong>Semantic HTML structure:</strong> Clean document outlines utilizing proper HTML5 landmarks (
          <code>header</code>, <code>main</code>, <code>nav</code>, <code>footer</code>, and heading hierarchies) to
          ensure reliable screen reader interpretation.
        </li>
        <li>
          <strong>Keyboard navigation:</strong> All interactive controls, pill buttons, and integration panels are fully
          reachable via standard tab sequences, with visible gold focus outlines (<code>:focus-visible</code>).
        </li>
        <li>
          <strong>Contrast &amp; dark mode:</strong> High contrast color pairings featuring our near-white ink (
          <code>#f5f5f7</code>) and warm gold accents against deep black backgrounds, meeting WCAG AA contrast minimums
          for body text and large headers.
        </li>
        <li>
          <strong>Respect for motion preferences:</strong> We honor the <code>prefers-reduced-motion</code> system setting.
          When active, background ambient movements, pulse animations, and slide-in transitions are disabled.
        </li>
        <li>
          <strong>Decorative visual separation:</strong> Complex decorative graphics (like the golden neural canvas and
          orbit visualizations) are explicitly marked with <code>aria-hidden=&quot;true&quot;</code> or descriptive labels
          so they do not overwhelm assistive tools.
        </li>
      </ul>

      <h2>Ongoing work &amp; beta improvements</h2>
      <p>
        Because Nexus is in active beta development, we recognize there is always room to improve. We are continuously
        conducting audits across complex dynamic widgets (such as the timeline scrubber and multi-step connector
        dialogs) to improve screen reader announcements and dynamic live regions.
      </p>

      <h2>Feedback &amp; assistance</h2>
      <p>
        If you encounter an accessibility barrier or have suggestions to make Nexus more accessible for your assistive
        setup, please let us know. We treat accessibility reports with high priority:
      </p>
      <p>
        <a href="mailto:accessibility@nexushq.app">accessibility@nexushq.app</a>
      </p>
      <p>
        You can also send notes through our <Link href="/contact">contact page</Link>.
      </p>
    </SiteDocument>
  );
}
