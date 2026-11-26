import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/landing/AuthShell";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

export const metadata: Metadata = {
  title: "Waitlist — Nexus",
  description: "Request early access to Nexus, the personal AI operating environment.",
};

export default function WaitlistPage() {
  return (
    <AuthShell>
      <div className="landing-enter w-full max-w-md text-center">
        <p className="site-kicker">Early Access</p>
        <h1 className="landing-title">Join the Nexus waitlist</h1>
        <p className="font-literary mt-3 text-[16px] leading-[1.6] text-[color:var(--land-muted)]">
          We are onboarding early users in waves to ensure system stability and high-touch support.
          Reserve your spot on the network today.
        </p>

        <div className="mt-8">
          <WaitlistForm />
        </div>

        <p className="mt-8 text-[13px] text-[color:var(--land-faint)]">
          Already have an invite or account?{" "}
          <Link href="/signup" className="text-[color:var(--land-gold-soft)] underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
