"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import {
  BranchingNetworkCanvas,
  type BranchNodeMeta,
} from "@/components/dashboard/BranchingNetworkCanvas";
import { TOTAL_EXTENSION_SLOTS, type ExtensionLink } from "@/lib/extensions";
import { NexusMark } from "./NexusLogo";

export type EcosystemLayer = "network" | "command" | "nodes";

type PreviewPrompt = {
  id: string;
  label: string;
  prompt: string;
  response: string;
  fromSocket: number;
  toSocket: number;
  sourceLabel: string;
};

const NETWORK_PROMPTS: PreviewPrompt[] = [
  {
    id: "brief",
    label: "Brief my morning",
    prompt: "Brief my morning and check open reviews",
    response:
      "You have Q4 Architecture Review from Elena Vance, a 14:00 Deep Work block, and PR #48 merged cleanly. Focus Guard is linked across your context branch.",
    fromSocket: 2,
    toSocket: 3,
    sourceLabel: "Daily Brief ↔ Focus Guard",
  },
  {
    id: "studio",
    label: "Route Studio take",
    prompt: "Route my latest Studio take into Cinema",
    response:
      "Routed “Dolomites Score — Take 3” directly over the studio.recording branch bridge into Cinema timeline audio with markers aligned.",
    fromSocket: 0,
    toSocket: 1,
    sourceLabel: "Studio ↔ Cinema",
  },
  {
    id: "focus",
    label: "Start deep work",
    prompt: "Start a 25-minute deep work session",
    response:
      "Focus Guard engaged quiet mode across connected branches, silenced non-urgent inbox signals, and synced status with Daily Brief.",
    fromSocket: 3,
    toSocket: 2,
    sourceLabel: "Focus Guard ↔ Daily Brief",
  },
];

const ACTIVE_PREVIEW_SOCKETS: ReadonlyArray<{
  monogram: string;
  name: string;
  status: "occupied" | "open";
}> = [
  { status: "occupied", monogram: "St", name: "Studio" },
  { status: "occupied", monogram: "Cn", name: "Cinema" },
  { status: "occupied", monogram: "DB", name: "Daily Brief" },
  { status: "occupied", monogram: "FG", name: "Focus Guard" },
  { status: "open", monogram: "", name: "Open slot" },
];

const PREVIEW_BRANCH_NODES: BranchNodeMeta[] = Array.from(
  { length: TOTAL_EXTENSION_SLOTS },
  (_, idx) => {
    const active = ACTIVE_PREVIEW_SOCKETS[idx];
    if (active) {
      return {
        slotId: `preview-${idx}`,
        status: active.status,
        monogram: active.monogram,
        name: active.name,
        tierLabel: active.status === "occupied" ? "Live branch node" : "Free slot",
      };
    }
    return {
      slotId: `preview-${idx}`,
      status: "locked",
      monogram: "",
      name: `Branch slot ${idx + 1}`,
      tierLabel: "Pro branch",
    };
  },
);

const PREVIEW_LINKS: ExtensionLink[] = [
  {
    fromSlotIndex: 0,
    toSlotIndex: 1,
    fromId: "dev.nexus.studio",
    toId: "dev.nexus.cinema",
    kind: "content",
    channel: "studio.recording",
  },
  {
    fromSlotIndex: 2,
    toSlotIndex: 3,
    fromId: "dev.nexus.sample.daily-brief",
    toId: "dev.nexus.sample.focus-guard",
    kind: "capability",
    channel: "context",
  },
  {
    fromSlotIndex: 0,
    toSlotIndex: 2,
    fromId: "dev.nexus.studio",
    toId: "dev.nexus.sample.daily-brief",
    kind: "capability",
    channel: "context",
  },
];

/**
 * Interactive preview of the 50-slot Nexus Network canopy:
 * renders the GoldenNetwork-inspired procedural branching engine, live inter-node bridges,
 * uncluttered node jewels, single hover inspection pill, and working voice prompt bar.
 */
export function NeuralNetworkPreview({ theme }: { theme: "dark" | "light" }) {
  const isLight = theme === "light";
  const stageRef = useRef<HTMLDivElement>(null);
  const [compactWidth, setCompactWidth] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [brainState, setBrainState] = useState<"idle" | "thinking" | "responding">("idle");
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] = useState<{
    prompt: string;
    response: string;
    sourceLabel: string;
  } | null>(null);
  const [transfer, setTransfer] = useState<{
    fromSocket: number;
    toSocket: number;
    label: string;
    serial: number;
  } | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setCompactWidth(w < 540);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  function triggerPrompt(item: {
    prompt: string;
    response: string;
    fromSocket: number;
    toSocket: number;
    sourceLabel: string;
  }) {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setBrainState("thinking");
    setActiveIdx(item.fromSocket);
    setTransfer((prev) => ({
      fromSocket: item.fromSocket,
      toSocket: item.toSocket,
      label: item.sourceLabel,
      serial: (prev?.serial ?? 0) + 1,
    }));
    setConversation({ prompt: item.prompt, response: "", sourceLabel: item.sourceLabel });

    const t1 = window.setTimeout(() => {
      setBrainState("responding");
      setConversation({ prompt: item.prompt, response: item.response, sourceLabel: item.sourceLabel });
      setActiveIdx(item.toSocket >= 0 ? item.toSocket : item.fromSocket);
    }, 460);

    const t2 = window.setTimeout(() => {
      setBrainState("idle");
    }, 1850);

    timersRef.current.push(t1, t2);
  }

  function handleNodeClick(idx: number) {
    if (idx === 0) {
      triggerPrompt(NETWORK_PROMPTS[1]!);
    } else if (idx === 1) {
      triggerPrompt({
        prompt: "Inspect Cinema ↔ Studio bridge",
        response:
          "Cinema reads live stems, beat markers, and smart-cuts directly from Studio over the scoped studio.recording branch bridge.",
        fromSocket: 1,
        toSocket: 0,
        sourceLabel: "Cinema ↔ Studio",
      });
    } else if (idx === 2) {
      triggerPrompt(NETWORK_PROMPTS[0]!);
    } else if (idx === 3) {
      triggerPrompt(NETWORK_PROMPTS[2]!);
    } else {
      const meta = PREVIEW_BRANCH_NODES[idx];
      setActiveIdx(idx);
      setTransfer((prev) => ({
        fromSocket: idx,
        toSocket: 0,
        label: "Branch Network",
        serial: (prev?.serial ?? 0) + 1,
      }));
      setConversation({
        prompt: meta?.status === "open" ? "Inspect open branch slot" : `Inspect branch node ${idx + 1}`,
        response: `Up to ${TOTAL_EXTENSION_SLOTS} modular extensions connect across linked branches without cluttering the canopy—hover any node to trace its links.`,
        sourceLabel: "Branch Topology",
      });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    triggerPrompt({
      prompt: text,
      response:
        "Connected your request across Studio, Cinema, and Daily Brief over capability-scoped branches. Context clears cleanly when you leave.",
      fromSocket: 0,
      toSocket: 1,
      sourceLabel: "Nexus Core",
    });
  }

  const energy = brainState === "thinking" ? 1.0 : brainState === "responding" ? 0.68 : 0.22;

  return (
    <div
      ref={stageRef}
      className="relative h-[585px] w-full overflow-hidden sm:h-[590px]"
      style={{ background: isLight ? "#faf8f2" : "#070709" }}
    >
      <BranchingNetworkCanvas
        theme={theme}
        nodes={PREVIEW_BRANCH_NODES}
        links={PREVIEW_LINKS}
        energy={energy}
        activeNodeIndex={activeIdx}
        transfer={transfer}
        mode="embedded"
        bottomClearance={compactWidth ? 334 : 278}
        onSelectNode={handleNodeClick}
      />

      {/* Subtle bottom scrim keeping the conversational prompt crystal clear */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isLight
            ? "linear-gradient(0deg, rgba(250,248,242,0.95) 0%, rgba(250,248,242,0.58) 20%, rgba(250,248,242,0) 42%)"
            : "linear-gradient(0deg, rgba(7,7,9,0.95) 0%, rgba(7,7,9,0.58) 20%, rgba(7,7,9,0) 42%)",
        }}
      />

      {/* Authentic top-left flat 2D Nexus rotor button */}
      <div className="pointer-events-none absolute top-4 left-4 z-20 flex items-center gap-2.5 sm:top-5 sm:left-5">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md ${
            isLight
              ? "border-[#0e0f12]/[0.1] bg-white/80 shadow-xs"
              : "border-white/[0.1] bg-[#121216]/75"
          }`}
          aria-hidden="true"
        >
          <NexusMark className="h-[18px] w-[18px]" />
        </span>
      </div>

      {/* Compact right-edge active branch indicator pill */}
      <div
        className={`pointer-events-none absolute top-1/2 right-3.5 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-full border px-1.5 py-2.5 backdrop-blur-md sm:flex ${
          isLight
            ? "border-[#0e0f12]/[0.1] bg-white/80"
            : "border-white/[0.1] bg-[#121216]/75"
        }`}
        aria-hidden="true"
      >
        {ACTIVE_PREVIEW_SOCKETS.map((s, idx) => (
          <span
            key={s.name + idx}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              s.status === "occupied"
                ? isLight
                  ? "bg-[#c88d18]"
                  : "bg-[#f0b54a]"
                : isLight
                  ? "bg-[#0e0f12]/35"
                  : "bg-white/40"
            }`}
          />
        ))}
      </div>

      {/* Bottom Conversational Assistant Voice Stage */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center px-4 text-center sm:bottom-6">
        <div className="pointer-events-auto flex w-full max-w-[580px] flex-col items-center gap-3">
          {!conversation ? (
            <div className="flex flex-col items-center gap-1">
              <p
                className={`font-editorial text-[clamp(1.7rem,2.8vw,2.35rem)] leading-[1.1] font-normal tracking-[-0.025em] ${
                  isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]"
                }`}
              >
                Hello, Elena
              </p>
              <p className={`text-[12.5px] ${isLight ? "text-[#52545e]" : "text-[#9d9da6]"}`}>
                Hover a branch node or ask Nexus
              </p>
            </div>
          ) : (
            <div className="lp-stage-panel flex max-w-full flex-col items-center gap-1">
              <p
                className={`max-w-full truncate px-2 text-[12px] ${
                  isLight ? "text-[#636570]" : "text-[#8e8e95]"
                }`}
              >
                {conversation.sourceLabel} · {conversation.prompt}
              </p>
              <p
                className={`font-editorial max-w-[52ch] text-[clamp(1.05rem,1.5vw,1.25rem)] leading-[1.38] ${
                  isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]"
                }`}
              >
                {conversation.response || "Routing across linked branches…"}
              </p>
            </div>
          )}

          {/* Status indicator */}
          <div className="inline-flex items-center gap-2 text-[11.5px] font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                brainState === "idle"
                  ? isLight
                    ? "bg-[#0e0f12]/70"
                    : "bg-white/75"
                  : isLight
                    ? "animate-pulse bg-[#0e0f12]"
                    : "animate-pulse bg-white"
              }`}
              aria-hidden="true"
            />
            <span className={isLight ? "text-[#52545e]" : "text-[#a1a1a6]"}>
              Nexus · {brainState === "thinking" ? "Thinking" : brainState === "responding" ? "Responding" : "Ready"}
            </span>
          </div>

          {/* Interactive quick-ask prompt pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {NETWORK_PROMPTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => triggerPrompt(item)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-3 sm:text-[11.5px] ${
                  isLight
                    ? "border-[#0e0f12]/[0.12] bg-white/85 text-[#22242c] hover:border-[#0e0f12]/35 hover:bg-white"
                    : "border-white/[0.13] bg-[#121217]/75 text-[#d1d1d6] hover:border-white/35 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Interactive frosted Ask Nexus prompt bar */}
          <form
            onSubmit={handleSubmit}
            className={`flex h-12 w-full items-center gap-2 rounded-full border pr-1.5 pl-4 backdrop-blur-xl transition-colors ${
              isLight
                ? "border-[#0e0f12]/[0.12] bg-white/88 shadow-[0_14px_34px_-12px_rgba(14,15,18,0.16)] focus-within:border-[#0e0f12]/40"
                : "border-white/[0.14] bg-[#111116]/82 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.7)] focus-within:border-white/40"
            }`}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Nexus anything…"
              aria-label="Try asking Nexus in the interactive preview"
              className={`min-w-0 flex-1 bg-transparent text-[14px] outline-none ${
                isLight
                  ? "text-[#0e0f12] placeholder:text-[#686a73]"
                  : "text-[#f5f5f7] placeholder:text-[#8e8e95]"
              }`}
            />
            <button
              type="submit"
              aria-label="Send preview message"
              className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
                isLight
                  ? "bg-[#0e0f12] text-white hover:bg-[#23252c]"
                  : "bg-white/[0.16] text-[#f5f5f7] hover:bg-[#f5f5f7] hover:text-[#09090b]"
              }`}
            >
              <ArrowUp className="size-4" strokeWidth={1.85} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
