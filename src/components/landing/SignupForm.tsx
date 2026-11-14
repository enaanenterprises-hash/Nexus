"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { GoldenNetwork } from "./GoldenNetwork";
import { NexusLogo } from "./NexusLogo";

/** Account creation is stubbed until auth exists; continuing opens the dashboard. */
export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    router.push("/dashboard");
  }

  return (
    <div className="landing relative flex min-h-[100svh] flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0 opacity-40">
        <GoldenNetwork />
      </div>

      <header className="relative z-10 flex items-center px-6 pt-6 sm:px-10 sm:pt-8 lg:px-14">
        <Link href="/" aria-label="Nexus home" className="inline-flex">
          <NexusLogo className="h-[13px] w-auto sm:h-[15px]" />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <form
          onSubmit={handleSubmit}
          className="landing-enter w-full max-w-sm text-center"
        >
          <h1 className="landing-title">Create your Nexus</h1>
          <p className="mt-3 text-[15px] text-[color:var(--land-muted)]">
            Free to start. Two extensions included.
          </p>

          <label htmlFor="signup-email" className="sr-only">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="landing-input mt-10"
          />
          <button type="submit" className="landing-primary mt-3 w-full">
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}
