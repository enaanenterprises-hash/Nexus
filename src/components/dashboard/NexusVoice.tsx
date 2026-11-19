"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  idle: "Ready",
  thinking: "Thinking",
  responding: "Responding",
};

/** Nexus speaks in one calm editorial voice anchored beneath the neural singularity. */
export function NexusVoice({
  firstName,
  brain,
  current,
  pendingPrompt,
  revealed,
  history,
  followUps,
  onAsk,
}: Props) {
  const [showEarlier, setShowEarlier] = useState(false);

  const prompt = pendingPrompt ?? current?.prompt ?? null;
  const fromExtension = current && current.source !== "nexus" ? current.source : null;
  const hasConversation = Boolean(prompt || current);

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="dash-voice-stage flex min-h-[4.25rem] w-full flex-col items-center justify-center sm:min-h-[4.85rem]">
        {!hasConversation ? (
          <div className="dash-fade-in flex flex-col items-center gap-1.5">
            <p className="dash-welcome font-editorial" aria-live="polite">
              Hello, {firstName}
            </p>
            <p className="text-[12.5px] text-[color:var(--land-muted)]">
              Touch the filaments, click a node, or ask Nexus directly
            </p>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center justify-center">
            {prompt ? (
              <p
                key={`p-${prompt}`}
                className="dash-fade-in mb-2 max-w-full truncate text-[13.5px] text-[color:var(--land-muted)]"
              >
                <span className="text-[color:var(--land-faint)]">You · </span>
                {prompt}
              </p>
            ) : null}
            {current ? (
              <p key={current.id} className="dash-utterance font-editorial" aria-live="polite">
                {current.text.split(/\s+/).map((word, i) => (
                  <span key={i} className={`word ${i < revealed ? "" : "word--hidden"}`}>
                    {word}{" "}
                  </span>
                ))}
              </p>
            ) : (
              <p className="dash-utterance font-editorial text-[color:var(--land-faint)]">
                Working through your network…
              </p>
            )}
          </div>
        )}
      </div>

      {followUps.length > 0 ? (
        <div
          className={`mt-2.5 flex flex-wrap justify-center gap-2 transition-all duration-300 ${
            brain === "idle" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
          }`}
        >
          {followUps.map((f) => (
            <Button
              key={f}
              type="button"
              variant="outline"
              size="sm"
              className="dash-chip gal-btn-tactile h-8 rounded-full px-3.5 text-[12.5px]"
              onClick={() => onAsk(f)}
              disabled={brain !== "idle"}
            >
              {f}
            </Button>
          ))}
        </div>
      ) : null}

      {history.length > 0 ? (
        <Collapsible open={showEarlier} onOpenChange={setShowEarlier} className="mt-2.5 w-full">
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-7 gap-1 px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
              />
            }
          >
            <ChevronDown
              className={`size-3.5 transition-transform duration-150 ${showEarlier ? "rotate-180" : ""}`}
            />
            <span>{showEarlier ? "Hide earlier" : `Earlier (${history.length})`}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="dash-earlier-list mx-auto mt-2 max-h-40 max-w-md text-left">
              <ol className="space-y-3 pr-2">
                {history.map((u) => (
                  <li key={u.id} className="text-[13px] leading-relaxed text-[color:var(--land-muted)]">
                    {u.prompt ? (
                      <span className="block text-[color:var(--land-faint)]">You · {u.prompt}</span>
                    ) : null}
                    {u.text}
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <p className="mt-3 flex items-center gap-2 text-[11.5px] font-medium text-[color:var(--land-muted)]" aria-live="polite">
        <span
          className={`state-dot ${brain === "thinking" ? "state-dot--thinking" : ""} ${
            brain === "thinking" || brain === "responding" ? "state-dot--calling" : ""
          }`}
        />
        <span>
          {fromExtension ? `${fromExtension} · via Nexus` : `Nexus · ${STATE_LABEL[brain]}`}
        </span>
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
        placeholder={onResearch ? "Ask Nexus, or search the web" : "Ask Nexus anything…"}
        autoComplete="off"
      />
      {onResearch ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="dash-research"
                onClick={() => {
                  onResearch(draft);
                  setDraft("");
                }}
                aria-label={draft.trim() ? `Research “${draft.trim()}”` : "Open Research"}
              >
                <ResearchIcon size={18} />
              </button>
            }
          />
          <TooltipContent side="top">
            {draft.trim() ? "Search the web with Research" : "Open Research"}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="submit"
              className="dash-send gal-btn-tactile"
              disabled={disabled || !draft.trim()}
              aria-label="Send to Nexus"
            >
              <ArrowUp className="size-4" strokeWidth={2} />
            </button>
          }
        />
        <TooltipContent side="top">Send to Nexus</TooltipContent>
      </Tooltip>
    </form>
  );
}
