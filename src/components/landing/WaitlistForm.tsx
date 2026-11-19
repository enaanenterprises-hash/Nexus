"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WaitlistForm({
  compact = false,
  theme = "dark",
}: {
  compact?: boolean;
  theme?: "dark" | "light";
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

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
        setMessage(data.message || "You're on the waitlist! We'll reach out soon.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Unable to join waitlist. Please check your email.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again in a moment.");
    }
  }

  const isLight = theme === "light";

  if (status === "success") {
    return (
      <div
        className={`waitlist-success-box ${isLight ? "waitlist-success-box--light" : ""}`}
        role="status"
      >
        <span className="waitlist-success-icon">
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
        <div>
          <strong className="waitlist-success-title">You&apos;re on the list!</strong>
          <p className="waitlist-success-desc">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`waitlist-form ${compact ? "waitlist-form--compact" : ""} ${isLight ? "waitlist-form--light" : ""}`}
    >
      <div className="waitlist-input-group">
        <label htmlFor={`waitlist-email-${theme}`} className="sr-only">
          Email address
        </label>
        <Input
          id={`waitlist-email-${theme}`}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email for early access"
          disabled={status === "loading"}
          className={
            isLight
              ? "waitlist-input h-auto border-black/12 bg-transparent shadow-none focus-visible:ring-0 sm:border-0"
              : "waitlist-input h-auto border-white/12 bg-transparent shadow-none focus-visible:ring-0 sm:border-0"
          }
        />
        <Button
          type="submit"
          disabled={status === "loading"}
          className={
            isLight
              ? "waitlist-submit-btn waitlist-submit-btn--light h-auto rounded-full bg-[#0e0f12] font-medium text-white transition-colors hover:bg-[#23252c]"
              : "waitlist-submit-btn h-auto rounded-full bg-[#f5f5f7] font-medium text-[#09090b] transition-colors hover:bg-white"
          }
        >
          {status === "loading" ? "Joining…" : "Join waitlist"}
        </Button>
      </div>

      {status === "error" && message ? (
        <Alert
          variant="destructive"
          className={
            isLight
              ? "mt-2.5 rounded-xl border-red-600/25 bg-red-50 py-2 text-left"
              : "mt-2.5 rounded-xl border-red-500/30 bg-red-500/10 py-2"
          }
        >
          <AlertTitle className="sr-only">Waitlist error</AlertTitle>
          <AlertDescription className={isLight ? "text-xs text-[#b91c1c]" : "text-xs text-[#fca5a5]"}>
            {message}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
