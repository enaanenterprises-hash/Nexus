import { WaitlistForm } from "./WaitlistForm";

export function LandingCTA() {
  return (
    <section id="waitlist" className="land-section land-cta-section" aria-labelledby="cta-title">
      <div className="land-container text-center">
        <p className="site-kicker">Early Access</p>
        <h2 id="cta-title" className="land-cta-title">
          Reserve your spot on the network.
        </h2>
        <p className="land-cta-desc">
          We are rolling out Nexus in measured beta batches. Join the waitlist with your email to receive an early access invite.
        </p>

        <div className="land-cta-form-wrap max-w-md mx-auto">
          <WaitlistForm />
        </div>

        <div className="land-cta-badges">
          <span>✓ Two sockets free forever</span>
          <span>✓ Zero advertising or trackers</span>
          <span>✓ AES-256 encrypted connectors</span>
          <span>✓ No spam ever</span>
        </div>
      </div>
    </section>
  );
}
