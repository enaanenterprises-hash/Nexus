"use client";

import { useState, type FormEvent } from "react";

export function WaitlistForm({ compact = false }: { compact?: boolean }) {
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

  if (status === "success") {
    return (
      <div className="waitlist-success-box" role="status">
        <span className="waitlist-success-icon">✓</span>
        <div>
          <strong className="waitlist-success-title">You&apos;re on the list!</strong>
          <p className="waitlist-success-desc">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`waitlist-form ${compact ? "waitlist-form--compact" : ""}`}>
      <div className="waitlist-input-group">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email for early access"
          disabled={status === "loading"}
          className="waitlist-input"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="waitlist-submit-btn landing-signup"
        >
          {status === "loading" ? "Joining…" : "Join waitlist"}
        </button>
      </div>

      {status === "error" && message ? (
        <p className="waitlist-error-msg" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
