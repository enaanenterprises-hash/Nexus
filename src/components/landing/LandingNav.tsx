"use client";

import Link from "next/link";
import { useState } from "react";
import { ChromeWordmark } from "./ChromeWordmark";

const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#extensions", label: "Extensions" },
  { href: "#about", label: "About" },
  { href: "#pricing", label: "Pricing" },
  { href: "#docs", label: "Docs" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-30 px-5 pt-5 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="shrink-0" aria-label="Nexus home">
          <ChromeWordmark size="nav" />
        </Link>

        <nav
          className="hidden items-center gap-7 md:flex"
          aria-label="Primary"
        >
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`font-[family-name:var(--font-body)] text-[13px] text-[color:var(--land-muted)] transition-colors hover:text-[color:var(--land-ink)] ${
                link.label === "Home"
                  ? "text-[color:var(--land-ink)] underline decoration-[color:var(--land-gold)] decoration-1 underline-offset-8"
                  : ""
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="landing-cta-solid hidden md:inline-flex"
          >
            Open Dashboard
            <span aria-hidden className="ml-1.5">
              →
            </span>
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center border border-[color:var(--land-line)] text-[color:var(--land-ink)] md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <span className="flex flex-col gap-1.5" aria-hidden>
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="mt-3 border border-[color:var(--land-line)] bg-black/80 px-4 py-3 backdrop-blur-md md:hidden"
        >
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-[color:var(--land-muted)]"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/dashboard"
              className="landing-cta-solid mt-1 justify-center"
              onClick={() => setOpen(false)}
            >
              Open Dashboard →
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
