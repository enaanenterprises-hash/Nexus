import Link from "next/link";

export function LandingCTA() {
  return (
    <section className="land-section land-cta-section" aria-labelledby="cta-title">
      <div className="land-container text-center">
        <p className="site-kicker">Get Started</p>
        <h2 id="cta-title" className="land-cta-title">
          Enter the network.
        </h2>
        <p className="land-cta-desc">
          One room for work that usually lives apart. Sign up in seconds with passwordless authentication and start
          orchestrating your day with complete context.
        </p>

        <div className="land-cta-actions">
          <Link href="/signup" className="landing-signup land-cta-btn">
            Create your account &rarr;
          </Link>
        </div>

        <div className="land-cta-badges">
          <span>✓ Two sockets free forever</span>
          <span>✓ Passwordless sign-in</span>
          <span>✓ AES-256 encrypted connectors</span>
          <span>✓ Zero advertising or trackers</span>
        </div>
      </div>
    </section>
  );
}
