"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import { ResearchIcon } from "./icons";
import type { Utterance } from "./use-nexus-session";

type Props = {
  firstName: string;
  brain: NexusBrainState;
  current: Utterance | null;
  pendingPrompt: string | null;
  revealed: number;
  history: Utterance[];
  followUps: string[];
  skipWake?: boolean;
  onAsk: (text: string) => void;
};

const STATE_LABEL: Record<NexusBrainState, string> = {
  idle: "Listening",
  thinking: "Thinking",
  responding: "Speaking",
};

/** Nexus speaks in one calm voice in the negative space beneath the core. */
export function NexusVoice({ firstName, brain, current, pendingPrompt, revealed, history, followUps, skipWake = false, onAsk }: Props) {
  const [showEarlier, setShowEarlier] = useState(false);
  const [waking, setWaking] = useState(!skipWake);

  useEffect(() => {
    if (skipWake) return;
    const timer = window.setTimeout(() => setWaking(false), 1600);
    return () => window.clearTimeout(timer);
  }, [skipWake]);

  const prompt = pendingPrompt ?? current?.prompt ?? null;
  const fromExtension = current && current.source !== "nexus" ? current.source : null;
  const hasConversation = Boolean(prompt || current);

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="dash-voice-stage flex min-h-[4.5rem] w-full flex-col items-center justify-center sm:min-h-[5.25rem]">
        {!hasConversation ? (
          waking ? (
            <p key="waking" className="dash-welcome dash-welcome--waking dash-fade-in" aria-live="polite">
              Waking up Nexus…
            </p>
          ) : (
            <p key="hello" className="dash-welcome dash-fade-in" aria-live="polite">
              Hello, {firstName}
            </p>
          )
        ) : (
          <div className="flex w-full flex-col items-center justify-center">
            {prompt ? (
              <p key={`p-${prompt}`} className="dash-fade-in mb-2.5 max-w-full truncate text-[14px] text-[color:var(--land-muted)]">
                <span className="text-[color:var(--land-faint)]">You — </span>
                {prompt}
              </p>
            ) : null}
            {current ? (
              <p key={current.id} className="dash-utterance text-[color:var(--land-ink)]" aria-live="polite">
                {current.text.split(/\s+/).map((word, i) => (
                  <span key={i} className={`word ${i < revealed ? "" : "word--hidden"}`}>
                    {word}{" "}
                  </span>
                ))}
              </p>
            ) : (
              <p className="dash-utterance text-[color:var(--land-faint)]">
                Working through your network…
              </p>
            )}
          </div>
        )}
      </div>

      {followUps.length > 0 ? (
        <div className={`mt-3 flex flex-wrap justify-center gap-2 transition-opacity duration-500 ${brain === "idle" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          {followUps.map((f) => (
            <button key={f} type="button" className="dash-chip" onClick={() => onAsk(f)} disabled={brain !== "idle"}>
              {f}
            </button>
          ))}
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-3 w-full">
          <button
            type="button"
            onClick={() => setShowEarlier((v) => !v)}
            className="text-[12px] font-medium text-[color:var(--land-faint)] transition-colors hover:text-[color:var(--land-muted)]"
            aria-expanded={showEarlier}
          >
            {showEarlier ? "Hide earlier" : `Earlier (${history.length})`}
          </button>
          {showEarlier ? (
            <ol className="dash-earlier-list mx-auto mt-2.5 max-h-40 max-w-md space-y-3 overflow-y-auto text-left dash-panel">
              {history.map((u) => (
                <li key={u.id} className="text-[13px] leading-relaxed text-[color:var(--land-muted)]">
                  {u.prompt ? <span className="block text-[color:var(--land-faint)]">You — {u.prompt}</span> : null}
                  {u.text}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <p className="dash-eyebrow mt-4 flex items-center gap-2" aria-live="polite">
        <span
          className={`state-dot ${
            waking || brain === "thinking" ? "state-dot--thinking" : ""
          } ${brain === "thinking" || brain === "responding" ? "state-dot--calling" : ""}`}
        />
        {waking
          ? "Nexus · Waking"
          : fromExtension
            ? `${fromExtension} · via Nexus`
            : `Nexus · ${STATE_LABEL[brain]}`}
      </p>
    </div>
  );
}

export function NexusInput({
  disabled,
  onAsk,
  onResearch,
}: {
  disabled: boolean;
  onAsk: (text: string) => void;
  /** Shows the Research hand-off button when set. */
  onResearch?: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || disabled) return;
    onAsk(draft);
    setDraft("");
  }

  return (
    <form onSubmit={submit} className="dash-input w-full">
      <label htmlFor="nexus-input" className="sr-only">
        Talk to Nexus
      </label>
      <input
        id="nexus-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={onResearch ? "Ask Nexus, or search the web" : "Ask Nexus"}
        autoComplete="off"
      />
      {onResearch ? (
        <button
          type="button"
          className="dash-research"
          onClick={() => {
            onResearch(draft);
            setDraft("");
          }}
          aria-label={draft.trim() ? `Research “${draft.trim()}”` : "Open Research"}
          title={draft.trim() ? "Search the web with Research" : "Open Research"}
        >
          <ResearchIcon size={18} />
        </button>
      ) : null}
      <button type="submit" className="dash-send" disabled={disabled || !draft.trim()} aria-label="Send to Nexus">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
