"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, X } from "lucide-react";

export function FloatingWaitlistPill() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const heroEl = document.getElementById("hero-top");
    const waitlistEl = document.getElementById("waitlist");
    const footerEl = document.getElementById("gallery-footer");
    const targets = [heroEl, waitlistEl, footerEl].filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;

    const intersecting = new Set<Element>();
    // Assume hero is visible on initial mount so the pill stays hidden at scroll y = 0
    if (heroEl) intersecting.add(heroEl);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.add(entry.target);
          } else {
            intersecting.delete(entry.target);
          }
        }
        setVisible(intersecting.size === 0);
      },
      { threshold: 0.06 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message || "You're on the waitlist.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Please check your email address.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  if (dismissed) return null;

  return (
    <aside
      aria-label="Quick waitlist signup"
      className={`fixed bottom-4 left-1/2 z-40 w-[min(92vw,456px)] -translate-x-1/2 transition-all duration-300 ease-out sm:bottom-5 ${
        visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"
      }`}
    >
      <div className="apple-glass rounded-full p-1.5 pl-3.5">
        {status === "success" ? (
          <div className="flex items-center justify-between gap-2 py-1 pr-1" role="status">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#15803d] text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="truncate text-[13.5px] font-medium text-[#14532d]">{message}</span>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss waitlist bar"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#636570] transition-colors hover:bg-[#0e0f12]/[0.06] hover:text-[#0e0f12]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            <label htmlFor="floating-waitlist-email" className="sr-only">
              Email address for open beta
            </label>
            <input
              id="floating-waitlist-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "loading"}
              placeholder={status === "error" && message ? message : "Email for early access"}
              className="min-h-[38px] min-w-0 flex-1 bg-transparent px-1.5 text-[14px] text-[#0e0f12] placeholder:text-[#636570] focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex min-h-[38px] shrink-0 cursor-pointer items-center gap-1 rounded-full bg-[#0e0f12] px-4 text-[13.5px] font-medium text-white transition-colors hover:bg-[#252730] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] disabled:opacity-60"
            >
              <span>{status === "loading" ? "…" : "Join beta"}</span>
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss waitlist bar"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#636570] transition-colors hover:bg-[#0e0f12]/[0.06] hover:text-[#0e0f12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
