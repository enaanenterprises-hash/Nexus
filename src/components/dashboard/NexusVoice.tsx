"use client";

import { useState, type FormEvent } from "react";
import type { NexusBrainState } from "@/lib/extensions";
import { ResearchIcon } from "./icons";
import type { Utterance } from "./use-nexus-session";

type Props = {
  brain: NexusBrainState;
  current: Utterance | null;
  pendingPrompt: string | null;
  revealed: number;
  history: Utterance[];
  followUps: string[];
  onAsk: (text: string) => void;
};

const STATE_LABEL: Record<NexusBrainState, string> = {
  idle: "Listening",
  thinking: "Thinking",
  responding: "Speaking",
};

/** Nexus speaks in one calm voice beneath the core rather than a message thread. */
export function NexusVoice({ brain, current, pendingPrompt, revealed, history, followUps, onAsk }: Props) {
  const [showEarlier, setShowEarlier] = useState(false);
  const prompt = pendingPrompt ?? current?.prompt ?? null;
  const fromExtension = current && current.source !== "nexus" ? current.source : null;

  return (
    <div className="flex flex-col items-center text-center">
      <p className="dash-eyebrow flex items-center gap-2" aria-live="polite">
        <span className={`state-dot ${brain === "thinking" ? "state-dot--thinking" : ""}`} />
        {fromExtension ? `${fromExtension} · via Nexus` : `Nexus · ${STATE_LABEL[brain]}`}
      </p>

      <div className="mt-5 flex min-h-[6.5rem] w-full flex-col items-center sm:min-h-[9.5rem]">
        {prompt ? (
          <p key={`p-${prompt}`} className="dash-fade-in mb-3 max-w-full truncate text-[14px] text-[color:var(--land-muted)]">
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
            {brain === "thinking" ? "Working through your network…" : "Waking the network…"}
          </p>
        )}
      </div>

      <div className={`mt-5 flex flex-wrap justify-center gap-2 transition-opacity duration-500 ${brain === "idle" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {followUps.map((f) => (
          <button key={f} type="button" className="dash-chip" onClick={() => onAsk(f)} disabled={brain !== "idle"}>
            {f}
          </button>
        ))}
      </div>

      {history.length > 0 ? (
        <div className="mt-4 w-full">
          <button
            type="button"
            onClick={() => setShowEarlier((v) => !v)}
            className="text-[12px] font-medium text-[color:var(--land-faint)] transition-colors hover:text-[color:var(--land-muted)]"
            aria-expanded={showEarlier}
          >
            {showEarlier ? "Hide earlier" : `Earlier (${history.length})`}
          </button>
          {showEarlier ? (
            <ol className="mx-auto mt-3 max-h-40 max-w-md space-y-3 overflow-y-auto text-left dash-panel">
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
