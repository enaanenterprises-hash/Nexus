"use client";

import { FormEvent, useEffect, useRef, useState, useEffectEvent } from "react";
import {
  createPulseId,
  mockNexusReply,
  pickProactiveSuggestion,
  type PulseMessage,
} from "@/lib/nexus/mock-brain";
import { nexusBus } from "@/lib/extensions";

const BOOT_MESSAGE =
  "Network online. I'm holding your day as a living graph — speak a signal and I'll route it.";

/** Breathing centerpiece rendered inside the Extension Hub orbit. */
export function NexusOrb() {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center sm:h-36 sm:w-36">
      <span className="motion-pulse-ring absolute inset-0 rounded-full border border-[color:var(--accent)]/35" />
      <span
        className="motion-pulse-ring absolute inset-4 rounded-full border border-[color:var(--accent)]/20"
        style={{ animationDelay: "1.1s" }}
      />
      <div className="motion-breathe relative flex h-20 w-20 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-[radial-gradient(circle_at_30%_25%,#2a4a55,var(--bg-mid)_70%)] sm:h-24 sm:w-24">
        <span className="font-[family-name:var(--font-display)] text-[10px] tracking-[0.38em] text-[color:var(--accent)] uppercase sm:text-xs">
          Core
        </span>
      </div>
    </div>
  );
}

/** Direct Nexus interaction — proactive pulses, not an SMS transcript. */
export function NexusInteraction() {
  const [pulses, setPulses] = useState<PulseMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [proactive, setProactive] = useState(() => pickProactiveSuggestion(0));
  const scrollerRef = useRef<HTMLDivElement>(null);

  const onProactiveTick = useEffectEvent(() => {
    const line = pickProactiveSuggestion(Math.floor(performance.now()));
    setProactive(line);
    nexusBus.emit("nexus:proactive", {
      suggestion: line,
      at: new Date().toISOString(),
    });
  });

  useEffect(() => {
    const bootAt = new Date().toISOString();
    setPulses([
      {
        id: "seed-1",
        role: "nexus",
        text: BOOT_MESSAGE,
        at: bootAt,
      },
    ]);
    nexusBus.emit("nexus:ready", { version: "0.1.0" });
    nexusBus.setSharedContext({
      activeTaskIds: ["t-1", "t-2"],
      focusSummary: "Ship Nexus Step 1 dashboard",
    });
    const id = window.setInterval(onProactiveTick, 14000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [pulses, thinking]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || thinking) return;

    const userPulse: PulseMessage = {
      id: createPulseId(),
      role: "user",
      text,
      at: new Date().toISOString(),
    };
    setPulses((prev) => [...prev, userPulse]);
    setDraft("");
    setThinking(true);
    nexusBus.emit("nexus:message", {
      role: "user",
      text,
      at: userPulse.at,
    });

    await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
    const reply = mockNexusReply(text, Math.floor(performance.now()));
    const nexusPulse: PulseMessage = {
      id: createPulseId(),
      role: "nexus",
      text: reply,
      at: new Date().toISOString(),
    };
    setPulses((prev) => [...prev, nexusPulse]);
    setThinking(false);
    nexusBus.emit("nexus:message", {
      role: "nexus",
      text: reply,
      at: nexusPulse.at,
    });
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <p className="motion-rise mb-5 text-center text-sm leading-relaxed text-[color:var(--ink-soft)] sm:text-base">
        <span className="motion-scan mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)] align-middle" />
        {proactive}
      </p>

      <div
        ref={scrollerRef}
        className="mb-4 max-h-36 overflow-y-auto px-1 sm:max-h-40"
        aria-live="polite"
      >
        <ul className="space-y-3">
          {pulses.map((pulse) => (
            <li key={pulse.id} className="motion-rise">
              <p
                className={
                  pulse.role === "user"
                    ? "text-sm text-[color:var(--ink)]"
                    : "text-sm leading-relaxed text-[color:var(--ink-soft)]"
                }
              >
                <span className="mr-2 font-[family-name:var(--font-mono)] text-[10px] tracking-wider text-[color:var(--ink-faint)] uppercase">
                  {pulse.role === "user" ? "You" : "Nexus"}
                </span>
                {pulse.text}
              </p>
            </li>
          ))}
          {thinking ? (
            <li className="font-[family-name:var(--font-mono)] text-[10px] tracking-wider text-[color:var(--accent)] uppercase">
              Routing through the network…
            </li>
          ) : null}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        <label htmlFor="nexus-signal" className="sr-only">
          Speak to Nexus
        </label>
        <div className="flex items-end gap-2 border-b border-[color:var(--line)] pb-2 transition-[border-color] focus-within:border-[color:var(--accent)]">
          <textarea
            id="nexus-signal"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder="Pulse a thought, priority, or question…"
            className="max-h-28 min-h-[2.5rem] w-full resize-none bg-transparent px-1 py-2 text-sm text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
          />
          <button
            type="submit"
            disabled={thinking || !draft.trim()}
            className="shrink-0 px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.2em] text-[color:var(--accent)] uppercase transition-opacity disabled:opacity-35"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
