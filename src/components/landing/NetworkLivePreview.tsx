"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookmarkIcon,
  ExternalIcon,
  LibraryIcon,
  ReaderIcon,
  ResearchIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import {
  add,
  bezier,
  clamp,
  fitCanvas,
  lerp,
  polar,
  radialGlow,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";

type VoicePromptId = "afternoon" | "spend" | "research";
type ReaderTabId = "reader" | "claims" | "consumers";

type PromptScenario = {
  id: VoicePromptId;
  chipLabel: string;
  prompt: string;
  brainMode: "speaking" | "thinking" | "researching";
  utterance: string;
  latencyLabel: string;
  provenance: Array<{
    monogram: string;
    source: string;
    detail: string;
    capability: string;
  }>;
  stagedActions: Array<{
    label: string;
    target: string;
    deterministic: boolean;
  }>;
};

const PROMPT_SCENARIOS: PromptScenario[] = [
  {
    id: "afternoon",
    chipLabel: "Afternoon synthesis",
    prompt: "Shape my afternoon around the 14:00 architecture block and my open PRs.",
    brainMode: "speaking",
    utterance:
      "You have a 90-minute Deep Work block at 14:00 on Google Calendar. Command has already staged your Solaris focus stems on Spotify and held Slack alerts. Two GitHub pull requests passed all 44 smoke checks and can wait until 15:30.",
    latencyLabel: "Context assembled in 3.2ms · Ephemeral session",
    provenance: [
      {
        monogram: "GC",
        source: "Google Calendar",
        detail: "14:00–15:30 · Deep Work: Event Bus",
        capability: "command.event",
      },
      {
        monogram: "GH",
        source: "GitHub Telemetry",
        detail: "PR #16 & #15 · 44/44 checks green",
        capability: "command.task",
      },
      {
        monogram: "SY",
        source: "Study Socket",
        detail: "8 recall cards queued for 16:00",
        capability: "content:study.deck",
      },
    ],
    stagedActions: [
      { label: "Hold notifications until 15:30", target: "Command Rule", deterministic: true },
      { label: "Open PR #16 diff at 15:30", target: "GitHub Widget", deterministic: true },
    ],
  },
  {
    id: "spend",
    chipLabel: "Audit cloud spend",
    prompt: "Did any infrastructure receipts land this week, and how does November look?",
    brainMode: "speaking",
    utterance:
      "Gmail ingested three infrastructure receipts this week totaling $78.10 USD—AWS ($42.10), Vercel ($20.00), and Linear ($16.00). Command routed each envelope directly into Ledger, bringing November operating spend to $624.50.",
    latencyLabel: "Read from Ledger Socket · 0 LLM calls for ingestion",
    provenance: [
      {
        monogram: "Gm",
        source: "Gmail Receipt Parser",
        detail: "INV-290192 · $42.10 USD verified",
        capability: "command.purchase",
      },
      {
        monogram: "LG",
        source: "Ledger Node",
        detail: "14 November entries · $624.50 total",
        capability: "content:command.purchase:read",
      },
      {
        monogram: "Pl",
        source: "Plaid Settlement",
        detail: "Matched checking debit #8841",
        capability: "command.signal",
      },
    ],
    stagedActions: [
      { label: "Export November R&D tax ledger", target: "Ledger Socket", deterministic: true },
      { label: "Flag invoices over $100", target: "Command Recipe", deterministic: true },
    ],
  },
  {
    id: "research",
    chipLabel: "Cross-reference notes",
    prompt: "Compare my Distributed Systems lecture transcript against the local-first bus paper.",
    brainMode: "researching",
    utterance:
      "Your Studio recording from Lecture 11 emphasizes deterministic state replication before model inference. That aligns directly with Section 4 of the highlighted ArXiv source in Research, which proves typed socket contracts eliminate prompt drift.",
    latencyLabel: "Cross-referenced Research + Studio · Citation verified",
    provenance: [
      {
        monogram: "RS",
        source: "Research Library",
        detail: "arxiv.org/abs/2411.08291 · 3 highlights",
        capability: "content:research.source:read",
      },
      {
        monogram: "ST",
        source: "Studio Transcript",
        detail: "Lecture 11 · Timestamp 18:42",
        capability: "content:studio.transcript:read",
      },
      {
        monogram: "CV",
        source: "Canvas Graph",
        detail: "Linked to cluster 'Deterministic OS'",
        capability: "content:canvas.cluster",
      },
    ],
    stagedActions: [
      { label: "Pin citation to Canvas cluster", target: "Canvas Socket", deterministic: true },
      { label: "Generate 3 synthesis flashcards", target: "Study Socket", deterministic: false },
    ],
  },
];

type WaveFilament = {
  yNorm: number;
  amp: number;
  freq: number;
  phase: number;
  width: number;
  alpha: number;
  color: string;
};

type AcousticParticle = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
};

function createVoiceField() {
  const { rnd, between, gauss } = seededHelpers(20261118);
  const colors = [
    "255, 236, 190",
    "255, 206, 120",
    "240, 181, 74",
    "214, 128, 36",
  ] as const;

  const waves: WaveFilament[] = Array.from({ length: 42 }, (_, i) => ({
    yNorm: 0.5 + gauss() * 0.24,
    amp: between(0.03, 0.16),
    freq: between(1.2, 3.2),
    phase: rnd() * Math.PI * 2,
    width: i % 5 === 0 ? 1.15 : 0.55,
    alpha: between(0.08, 0.34),
    color: colors[i % colors.length]!,
  }));

  const particles: AcousticParticle[] = Array.from({ length: 190 }, () => ({
    angle: rnd() * Math.PI * 2,
    radius: between(0.06, 0.92),
    speed: between(0.08, 0.28),
    size: between(0.5, 1.65),
    alpha: between(0.3, 0.92),
  }));

  return { waves, particles };
}

export function NetworkLivePreview() {
  const [promptId, setPromptId] = useState<VoicePromptId>("afternoon");
  const [readerTab, setReaderTab] = useState<ReaderTabId>("reader");
  const [savedHighlight, setSavedHighlight] = useState(true);
  const [revealedWords, setRevealedWords] = useState(999);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef({ promptId: "afternoon" as VoicePromptId, pulse: 1 });

  const scenario = PROMPT_SCENARIOS.find((p) => p.id === promptId) ?? PROMPT_SCENARIOS[0]!;
  const words = scenario.utterance.split(/\s+/);

  function selectPrompt(nextId: VoicePromptId) {
    setPromptId(nextId);
    setRevealedWords(0);
    modeRef.current = { promptId: nextId, pulse: modeRef.current.pulse + 1 };
  }

  useEffect(() => {
    if (revealedWords >= words.length) return;
    const timer = window.setTimeout(() => {
      setRevealedWords((c) => Math.min(words.length, c + 2));
    }, 32);
    return () => window.clearTimeout(timer);
  }, [revealedWords, words.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const field = createVoiceField();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ripples: number[] = [0.15, 0.55];
    let lastPulse = modeRef.current.pulse;
    let energy = 0.75;
    let width = 1;
    let height = 1;
    let frame = 0;
    let start = 0;
    let last = 0;
    let rippleClock = 0;

    const draw = (time: number, dt: number) => {
      if (modeRef.current.pulse !== lastPulse) {
        lastPulse = modeRef.current.pulse;
        energy = 1;
        if (!reduceMotion) ripples.push(0);
      }

      const targetEnergy = modeRef.current.promptId === "research" ? 0.92 : 0.72;
      energy = lerp(energy, targetEnergy, clamp(dt * 2.2, 0, 1));

      if (!reduceMotion) {
        rippleClock += dt;
        if (rippleClock > 1.8) {
          rippleClock = 0;
          ripples.push(0);
        }
      }

      const focal: Vec = { x: width * 0.28, y: height * 0.46 };
      const readerFocal: Vec = { x: width * 0.76, y: height * 0.48 };
      const S = Math.max(width * 0.45, height * 0.8);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      radialGlow(ctx, focal, S * 0.62 * (1 + 0.06 * Math.sin(time * 0.8)), [
        [0, `rgba(255, 196, 98, ${0.16 + 0.08 * energy})`],
        [0.42, "rgba(204, 118, 34, 0.05)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      radialGlow(ctx, readerFocal, S * 0.48, [
        [0, "rgba(255, 214, 140, 0.11)"],
        [0.5, "rgba(200, 116, 36, 0.03)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // Flowing acoustic golden bezier filaments bridging Voice Core -> Research Reader
      field.waves.forEach((w) => {
        const sway = Math.sin(time * 0.55 * w.freq + w.phase);
        const y0 = height * w.yNorm + sway * height * w.amp * 0.4;
        const p0: Vec = { x: 0, y: y0 };
        const p1: Vec = {
          x: focal.x,
          y: lerp(y0, focal.y, 0.76) + Math.cos(time * 0.7 + w.phase) * height * w.amp * energy,
        };
        const p2: Vec = {
          x: readerFocal.x,
          y: lerp(y0, readerFocal.y, 0.58) - sway * height * w.amp * 0.65,
        };
        const p3: Vec = { x: width, y: height * w.yNorm - sway * height * w.amp * 0.3 };

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        ctx.lineWidth = w.width;
        ctx.strokeStyle = `rgba(${w.color}, ${w.alpha * (0.65 + 0.35 * energy)})`;
        ctx.stroke();

        // Sample a flowing light particle on every 3rd wave
        if (!reduceMotion) {
          const u = (time * 0.09 * w.freq + w.phase) % 1;
          const pt = bezier(p0, p1, p2, p3, u);
          ctx.fillStyle = "rgb(255, 242, 210)";
          ctx.globalAlpha = w.alpha * 1.9;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1;

      // Concentric acoustic voice ripples
      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (!reduceMotion) ripples[i]! += dt * 0.38;
        const r = ripples[i]!;
        if (r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 220, 155, ${0.28 * (1 - r) * (1 - r)})`;
        ctx.beginPath();
        ctx.arc(focal.x, focal.y, S * (0.06 + r * 0.48), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Vocal nucleus glow
      radialGlow(ctx, focal, S * 0.085, [
        [0, "rgba(255, 252, 240, 0.95)"],
        [0.24, "rgba(255, 224, 160, 0.65)"],
        [0.6, "rgba(240, 181, 74, 0.18)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // Orbiting dust motes
      ctx.fillStyle = "rgb(255, 218, 148)";
      for (const p of field.particles) {
        if (!reduceMotion) p.angle += p.speed * dt * 0.35;
        const pos = add(focal, polar(p.radius * S * 0.7, p.angle));
        const twinkle = 0.45 + 0.55 * Math.sin(time * 1.6 + p.angle * 3);
        ctx.globalAlpha = p.alpha * twinkle * 0.65;
        ctx.fillRect(pos.x, pos.y, p.size, p.size);
      }
    };

    const resize = () => {
      const box = fitCanvas(canvas, ctx);
      width = box.width;
      height = box.height;
      if (reduceMotion) draw(4, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw((now - start) / 1000, dt);
      frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="nx-net-showcase">
      <div className="nx-net-stage">
        {/* Procedural Acoustic Filament Canvas Backdrop */}
        <div className="nx-canvas-layer" aria-hidden>
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="nx-canvas-vignette" />
        </div>

        {/* Stage Header Bar */}
        <div className="nx-topbar">
          <div className="flex items-center gap-2.5">
            <span className="state-dot state-dot--thinking" />
            <span className="text-[12px] font-medium text-[color:var(--land-ink)]">
              Tier 01 · Network &amp; Research Surface
            </span>
          </div>

          <div className="nx-stage-pills">
            {PROMPT_SCENARIOS.map((item) => {
              const active = item.id === promptId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectPrompt(item.id)}
                  aria-pressed={active}
                  className={`nx-tier-chip ${active ? "nx-tier-chip--on" : ""}`}
                >
                  {item.chipLabel}
                </button>
              );
            })}
          </div>

          <span className="hidden font-mono text-[11px] text-[color:var(--land-gold-soft)] lg:inline">
            {scenario.latencyLabel}
          </span>
        </div>

        {/* Dual Spatial Stage: Left = Single-Voice Ambient Synthesizer, Right = Bias-Aware Research Reader */}
        <div className="nx-net-columns">
          {/* LEFT WING: THE SINGLE CALM VOICE OF NEXUS */}
          <div className="nx-net-voice-wing">
            <div className="nx-voice-orb-badge">
              <span className="nx-core-beacon" />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--land-gold-soft)]">
                Nexus · {scenario.brainMode === "researching" ? "Cross-Referencing" : "Speaking"}
              </span>
              <span className="text-[11px] text-[color:var(--land-faint)]">
                · Ephemeral session (never stored on servers)
              </span>
            </div>

            {/* Prompt Utterance Box */}
            <div className="nx-net-utterance-box">
              <p className="text-[13px] text-[color:var(--land-muted)]">
                <span className="text-[color:var(--land-faint)]">You — </span>
                {scenario.prompt}
              </p>

              <p className="mt-3.5 text-[18px] font-light leading-[1.48] tracking-[-0.02em] text-[color:var(--land-ink)] sm:text-[21px]">
                {words.map((word, idx) => (
                  <span
                    key={`${scenario.id}-${idx}`}
                    className={`word ${idx < revealedWords ? "" : "word--hidden"}`}
                  >
                    {word}{" "}
                  </span>
                ))}
              </p>

              {/* Live Context Provenance Strip */}
              <div className="mt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--land-faint)]">
                  Automatic Context Wired from Command &amp; Sockets
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {scenario.provenance.map((prov) => (
                    <div key={prov.source} className="nx-prov-card">
                      <div className="flex items-center gap-2">
                        <span className="nx-prov-mono">{prov.monogram}</span>
                        <span className="truncate text-[12px] font-medium text-[color:var(--land-ink)]">
                          {prov.source}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[11px] text-[color:var(--land-muted)]">
                        {prov.detail}
                      </p>
                      <code className="mt-1 block truncate font-mono text-[10px] text-[color:var(--land-gold)]">
                        {prov.capability}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Staged Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {scenario.stagedActions.map((act) => (
                  <button
                    key={act.label}
                    type="button"
                    onClick={() =>
                      selectPrompt(
                        promptId === "afternoon" ? "spend" : promptId === "spend" ? "research" : "afternoon",
                      )
                    }
                    className="dash-chip text-[12px]"
                  >
                    <span>{act.label}</span>
                    <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-[color:var(--land-gold-soft)]">
                      {act.target}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT WING: BIAS-AWARE RESEARCH BROWSER & SOURCE GRAPH */}
          <div className="nx-net-reader-wing">
            {/* Authentic Research Browser Chrome */}
            <div className="nx-reader-shell">
              <div className="nx-reader-bar">
                <div className="research-address flex-1">
                  <SearchIcon size={14} className="text-[color:var(--land-gold)]" />
                  <span className="truncate font-mono text-[12px] text-[color:var(--land-ink)]">
                    https://arxiv.org/abs/2411.08291
                  </span>
                  <span className="ml-auto rounded-full border border-[rgba(240,181,74,0.35)] bg-[rgba(240,181,74,0.1)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--land-gold-soft)]">
                    SSRF Guard · Readability
                  </span>
                </div>

                <div className="research-segment" role="group" aria-label="Research view mode">
                  <button
                    type="button"
                    aria-pressed={readerTab === "reader"}
                    onClick={() => setReaderTab("reader")}
                    title="Clean Reader View"
                  >
                    <ReaderIcon size={14} />
                  </button>
                  <button
                    type="button"
                    aria-pressed={readerTab === "claims"}
                    onClick={() => setReaderTab("claims")}
                    title="Extracted Claims & Margin Notes"
                  >
                    <LibraryIcon size={14} />
                  </button>
                  <button
                    type="button"
                    aria-pressed={readerTab === "consumers"}
                    onClick={() => setReaderTab("consumers")}
                    title="Socket Consumers"
                  >
                    <ResearchIcon size={14} />
                  </button>
                </div>
              </div>

              {/* Sub-toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-2.5 text-[11.5px]">
                <div className="flex items-center gap-2">
                  <span className="research-tag research-tag--on">#Architecture</span>
                  <span className="research-tag">#Deterministic-Bus</span>
                  <span className="text-[color:var(--land-faint)]">Brave Search Index · Ad-free</span>
                </div>

                <button
                  type="button"
                  onClick={() => setSavedHighlight((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[color:var(--land-gold-soft)]"
                >
                  <BookmarkIcon size={13} filled={savedHighlight} />
                  <span>{savedHighlight ? "Saved to Sources" : "Save Source"}</span>
                </button>
              </div>

              {/* Tab 1: Clean Reader Prose */}
              {readerTab === "reader" ? (
                <div className="nx-reader-content">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--land-gold)]">
                    Systems &amp; Control · Cornell ArXiv
                  </p>
                  <h3 className="mt-1 text-[17px] font-medium leading-snug text-[color:var(--land-ink)]">
                    Typed Capability Busses in Modular Personal Operating Environments
                  </h3>

                  <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--land-muted)]">
                    When personal tools rely on an LLM as the sole glue between calendars, files, and local
                    workspaces, every routine action inherits token cost, network latency, and non-deterministic drift.
                  </p>

                  {/* Interactive Highlight Passage */}
                  <div
                    onClick={() => setSavedHighlight((v) => !v)}
                    className="nx-reader-highlight"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSavedHighlight((v) => !v);
                    }}
                  >
                    <p className="text-[13px] leading-relaxed text-[color:var(--land-ink)]">
                      &ldquo;By separating deterministic socket-to-socket message passing from optional conversational
                      synthesis, the operating environment sustains 100% manual reliability at zero idle compute.&rdquo;
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(240,181,74,0.22)] pt-2 text-[11px]">
                      <span className="text-[color:var(--land-gold-soft)]">
                        Margin Note — Linked to Lecture 11 (Studio Socket)
                      </span>
                      <span className="font-mono text-[10px] text-[color:var(--land-faint)]">
                        content:research.source
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11.5px] text-[color:var(--land-faint)]">
                    <span>Read, highlight, and file with no model in the path.</span>
                    <button
                      type="button"
                      onClick={() => setReaderTab("claims")}
                      className="inline-flex items-center gap-1 text-[color:var(--land-gold-soft)] hover:underline"
                    >
                      <span>Inspect source structure</span>
                      <ExternalIcon size={12} />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Tab 2: Extracted Claims & Bias Audit */}
              {readerTab === "claims" ? (
                <div className="nx-reader-content space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--land-gold)]">
                      Source Provenance &amp; Margin Annotations
                    </span>
                    <span className="font-mono text-[11px] text-[color:var(--land-muted)]">3 Highlights</span>
                  </div>

                  {[
                    {
                      tag: "Primary Claim",
                      text: "Typed capability envelopes prevent unauthorized extensions from reading unrelated user streams.",
                      meta: "Section 2.1 · Verified against `src/lib/extensions/event-access.ts`",
                    },
                    {
                      tag: "Empirical Benchmark",
                      text: "Local event bus dispatch completes in < 1.5ms vs. 1,400ms+ for round-trip LLM tool calling.",
                      meta: "Section 4.3 · Cited in Study Deck 'Distributed Systems'",
                    },
                    {
                      tag: "Framing & Bias Check",
                      text: "Primary academic source with reproducible benchmarks; zero commercial tracker scripts detected.",
                      meta: "Sanitized via Mozilla Readability + LinkeDOM",
                    },
                  ].map((claim) => (
                    <div
                      key={claim.tag}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--land-gold-soft)]">
                        {claim.tag}
                      </span>
                      <p className="mt-1 text-[12.5px] leading-snug text-[color:var(--land-ink)]">{claim.text}</p>
                      <p className="mt-1 font-mono text-[10.5px] text-[color:var(--land-faint)]">{claim.meta}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Tab 3: Socket Consumers */}
              {readerTab === "consumers" ? (
                <div className="nx-reader-content space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--land-gold)]">
                    Nodes Subscribed to `content:research.source:read`
                  </p>
                  <p className="text-[12.5px] text-[color:var(--land-muted)]">
                    Every saved page, highlight, and margin note in Research is a typed record that permitted Nodes can
                    consume directly:
                  </p>
                  {[
                    {
                      mono: "SY",
                      name: "Study Node",
                      action: "Converts highlighted passages into spaced-repetition cards automatically.",
                    },
                    {
                      mono: "CV",
                      name: "Canvas Node",
                      action: "Maps saved sources and margin notes onto a 2D spatial citation graph.",
                    },
                    {
                      mono: "DB",
                      name: "Daily Brief",
                      action: "Surfaces unread research sources alongside morning calendar blocks.",
                    },
                  ].map((node) => (
                    <div
                      key={node.mono}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"
                    >
                      <span className="nx-node-badge shrink-0">{node.mono}</span>
                      <div>
                        <p className="text-[13px] font-medium text-[color:var(--land-ink)]">{node.name}</p>
                        <p className="text-[11.5px] text-[color:var(--land-muted)]">{node.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
