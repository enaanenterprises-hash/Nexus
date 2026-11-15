"use client";

import { useEffect, useRef, useState } from "react";
import { BoltIcon, LockIcon, NodesIcon, PlusIcon } from "@/components/dashboard/icons";
import {
  bezier,
  fitCanvas,
  lerp,
  radialGlow,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";

type WorkspaceId = "studio" | "study" | "ledger" | "canvas" | "sdk";

type SocketSpec = {
  id: WorkspaceId;
  slotLabel: string;
  tier: "free" | "pro";
  monogram: string;
  name: string;
  tagline: string;
  capability: string;
};

const SOCKETS: SocketSpec[] = [
  {
    id: "studio",
    slotLabel: "Socket 01 · Free",
    tier: "free",
    monogram: "ST",
    name: "Studio",
    tagline: "Multi-track DAW & local transcription",
    capability: "content:studio.transcript:write",
  },
  {
    id: "study",
    slotLabel: "Socket 02 · Free",
    tier: "free",
    monogram: "SY",
    name: "Study",
    tagline: "Spaced repetition & syllabus parser",
    capability: "content:studio.transcript:read",
  },
  {
    id: "ledger",
    slotLabel: "Socket 03 · Pro",
    tier: "pro",
    monogram: "LG",
    name: "Ledger",
    tagline: "Deterministic receipt & expense journal",
    capability: "content:command.purchase:read",
  },
  {
    id: "canvas",
    slotLabel: "Socket 04 · Pro",
    tier: "pro",
    monogram: "CV",
    name: "Canvas",
    tagline: "Spatial citation & synthesis graph",
    capability: "content:research.source:read",
  },
  {
    id: "sdk",
    slotLabel: "Socket 05 · Open SDK",
    tier: "pro",
    monogram: "DX",
    name: "Node SDK",
    tagline: "Public TypeScript extension contract",
    capability: "nexus.extension.v1",
  },
];

const STUDY_CARDS = [
  {
    q: "Why does the Nexus event bus enforce capability declarations in the manifest before delivering an item?",
    a: "Each socket runs with least-privilege isolation: `canReceive()` verifies that an extension explicitly declared `content:<kind>:read` before any payload crosses the bus.",
    source: "Studio Lecture 11 · 14:22",
  },
  {
    q: "How do Command automations behave when an optional external connector (such as Slack or Strava) is unlinked?",
    a: "Recipes execute deterministically: missing connectors are cleanly skipped and logged without failing the remaining steps in the pipeline.",
    source: "Command Spec · Section 3.2",
  },
  {
    q: "What happens to Pro sockets if a user switches back to the Free plan?",
    a: "Free sockets 01 and 02 remain wired and active; Pro sockets gracefully release their slot while preserving all underlying user collections.",
    source: "Extension Hub Contract · v1",
  },
];

const CANVAS_NODES = [
  {
    id: "paper",
    x: 165,
    y: 88,
    mono: "RS",
    title: "ArXiv 2411.08291",
    subtitle: "Research Source · 3 Highlights",
    note: "Proves deterministic typed message passing eliminates LLM round-trip latency during routine workflows.",
  },
  {
    id: "bus",
    x: 410,
    y: 155,
    mono: "NX",
    title: "Shared Event Bus",
    subtitle: "Central Core Router",
    note: "Routes typed envelopes (`command.purchase`, `studio.transcript`, `research.source`) across active sockets in <1.5ms.",
  },
  {
    id: "stem",
    x: 655,
    y: 84,
    mono: "ST",
    title: "Lecture 11 Audio Stem",
    subtitle: "Studio Socket · 45m WAV",
    note: "Time-coded vocal markers exported directly to Study to synthesize 8 active-recall cards.",
  },
  {
    id: "audit",
    x: 655,
    y: 228,
    mono: "LG",
    title: "November Burn Audit",
    subtitle: "Ledger Socket · $624.50",
    note: "Compiled automatically from Gmail receipt envelopes without manual spreadsheet entry.",
  },
] as const;

export function NodesLivePreview() {
  const [activeId, setActiveId] = useState<WorkspaceId>("studio");
  const [isPro, setIsPro] = useState(true);
  const [busToast, setBusToast] = useState<string>(
    "All 5 sockets wired to the shared bus · Click any socket or dispatch an event",
  );

  // Studio state
  const [playhead, setPlayhead] = useState(42);
  const [dispatchedCount, setDispatchedCount] = useState(8);

  // Study state
  const [cardIndex, setCardIndex] = useState(0);
  const [answerShown, setAnswerShown] = useState(true);

  // Ledger state
  const [extraReceipts, setExtraReceipts] = useState<
    Array<{ merchant: string; category: string; origin: string; amount: number }>
  >([]);

  // Canvas state
  const [selectedCanvasNode, setSelectedCanvasNode] = useState<string>("bus");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busRef = useRef({
    activeIdx: 0,
    isPro: true,
    burstSerial: 1,
    targetIdx: 1,
  });

  useEffect(() => {
    const idx = SOCKETS.findIndex((s) => s.id === activeId);
    busRef.current = {
      ...busRef.current,
      activeIdx: idx >= 0 ? idx : 0,
      isPro,
    };
  }, [activeId, isPro]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlayhead((p) => (p >= 92 ? 12 : Number((p + 0.9).toFixed(1))));
    }, 140);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { rnd, between } = seededHelpers(20261120);
    const particles = Array.from({ length: 120 }, (_, i) => ({
      socket: i % SOCKETS.length,
      u: rnd(),
      speed: between(0.18, 0.45),
      size: between(0.6, 1.6),
      alpha: between(0.4, 0.95),
    }));

    const bursts: Array<{ from: number; to: number; t: number }> = [];
    let lastSerial = busRef.current.burstSerial;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let frame = 0;
    let last = 0;

    const draw = (dt: number) => {
      if (busRef.current.burstSerial !== lastSerial) {
        lastSerial = busRef.current.burstSerial;
        bursts.push({
          from: busRef.current.activeIdx,
          to: busRef.current.targetIdx,
          t: 0,
        });
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      const core: Vec = { x: width * 0.5, y: height * 0.88 };
      const socketPts: Vec[] = SOCKETS.map((_, i) => ({
        x: width * (0.1 + (i / (SOCKETS.length - 1)) * 0.8),
        y: height * 0.24,
      }));

      radialGlow(ctx, core, Math.max(width, height) * 0.28, [
        [0, "rgba(255, 206, 120, 0.28)"],
        [0.45, "rgba(214, 128, 36, 0.08)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      socketPts.forEach((pt, idx) => {
        const unlocked = idx < 2 || busRef.current.isPro;
        const isCurrent = idx === busRef.current.activeIdx;
        const strength = isCurrent ? 1 : unlocked ? 0.55 : 0.16;

        const c1: Vec = { x: lerp(core.x, pt.x, 0.35), y: height * 0.72 };
        const c2: Vec = { x: pt.x, y: height * 0.46 };

        for (let strand = -2; strand <= 2; strand++) {
          ctx.beginPath();
          ctx.moveTo(core.x + strand * 5, core.y);
          ctx.bezierCurveTo(
            c1.x + strand * 10,
            c1.y,
            c2.x + strand * 6,
            c2.y,
            pt.x,
            pt.y,
          );
          ctx.lineWidth = strand === 0 ? 1.5 : 0.65;
          ctx.strokeStyle = `rgba(240, 181, 74, ${(strand === 0 ? 0.68 : 0.22) * strength})`;
          ctx.stroke();
        }

        radialGlow(ctx, pt, isCurrent ? 46 : 28, [
          [0, `rgba(255, 232, 175, ${0.75 * strength})`],
          [0.45, `rgba(240, 181, 74, ${0.22 * strength})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      });

      // Flowing particles on socket wires
      ctx.fillStyle = "rgb(255, 240, 205)";
      for (const p of particles) {
        const unlocked = p.socket < 2 || busRef.current.isPro;
        if (!unlocked) continue;
        if (!reduceMotion) p.u = (p.u + p.speed * dt) % 1;
        const pt = socketPts[p.socket]!;
        const pos = bezier(
          core,
          { x: lerp(core.x, pt.x, 0.35), y: height * 0.72 },
          { x: pt.x, y: height * 0.46 },
          pt,
          p.u,
        );
        ctx.globalAlpha = p.alpha * (p.socket === busRef.current.activeIdx ? 1 : 0.55);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Travelling event bursts
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]!;
        b.t += dt * 1.35;
        if (b.t >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        const fromPt = socketPts[b.from] ?? core;
        const toPt = socketPts[b.to] ?? core;
        const pos =
          b.t < 0.5
            ? bezier(fromPt, { x: fromPt.x, y: height * 0.55 }, core, core, b.t * 2)
            : bezier(core, core, { x: toPt.x, y: height * 0.55 }, toPt, (b.t - 0.5) * 2);
        radialGlow(ctx, pos, 32, [
          [0, "rgba(255, 252, 240, 0.98)"],
          [0.35, "rgba(240, 181, 74, 0.45)"],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      radialGlow(ctx, core, 28, [
        [0, "rgba(255, 252, 240, 1)"],
        [0.3, "rgba(255, 217, 154, 0.75)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);
    };

    const resize = () => {
      const box = fitCanvas(canvas, ctx);
      width = box.width;
      height = box.height;
      if (reduceMotion) draw(0);
    };

    const loop = (now: number) => {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
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

  function triggerBusTransfer(targetId: WorkspaceId, message: string) {
    const targetIdx = SOCKETS.findIndex((s) => s.id === targetId);
    busRef.current = {
      ...busRef.current,
      targetIdx: targetIdx >= 0 ? targetIdx : 1,
      burstSerial: busRef.current.burstSerial + 1,
    };
    setBusToast(message);
  }

  function dispatchTranscriptToStudy() {
    setDispatchedCount((c) => c + 4);
    triggerBusTransfer(
      "study",
      "studio:transcript.ready → Routed across Shared Bus → Study synthesized +4 recall cards",
    );
    setActiveId("study");
  }

  function simulateReceiptToLedger() {
    const samples = [
      { merchant: "Cloudflare Workers", category: "Infrastructure", origin: "Gmail #CF-9041", amount: 19.0 },
      { merchant: "Anthropic API Credits", category: "R&D Compute", origin: "Gmail #AN-3318", amount: 35.0 },
      { merchant: "Supabase Pro", category: "Database", origin: "Gmail #SB-7720", amount: 25.0 },
    ];
    const next = samples[extraReceipts.length % samples.length]!;
    setExtraReceipts((prev) => [next, ...prev.slice(0, 2)]);
    triggerBusTransfer(
      "ledger",
      `command:item-published (${next.merchant} · $${next.amount.toFixed(2)}) → Logged to Ledger Socket`,
    );
  }

  const baseLedgerTotal = 624.5;
  const currentLedgerTotal =
    baseLedgerTotal + extraReceipts.reduce((sum, item) => sum + item.amount, 0);
  const currentCard = STUDY_CARDS[cardIndex % STUDY_CARDS.length]!;
  const currentCanvasNode =
    CANVAS_NODES.find((n) => n.id === selectedCanvasNode) ?? CANVAS_NODES[1]!;

  return (
    <div className="nx-nodes-showcase">
      <div className="nx-monolith">
        {/* Top Socket Bay Header & Entitlement Switcher */}
        <div className="nx-topbar">
          <div className="flex items-center gap-2.5">
            <NodesIcon size={16} className="text-[color:var(--land-gold)]" />
            <span className="text-[12px] font-medium text-[color:var(--land-ink)]">
              Tier 03 · Modular Socket Hub
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10.5px] text-[color:var(--land-muted)]">
              {isPro ? "5 of 5 Sockets Active (Pro)" : "2 of 2 Free Sockets Active"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-[color:var(--land-muted)]">Entitlement:</span>
            <button
              type="button"
              onClick={() => {
                const next = !isPro;
                setIsPro(next);
                if (!next && (activeId === "ledger" || activeId === "canvas" || activeId === "sdk")) {
                  setActiveId("studio");
                }
              }}
              className="dash-button dash-button--gold"
            >
              {isPro ? "Nexus Pro · Unlimited Sockets" : "Free Plan · 2 Sockets (Click to Preview Pro)"}
            </button>
          </div>
        </div>

        {/* Procedural Golden Socket Wire Stage */}
        <div className="nx-socket-wire-stage">
          <div className="nx-canvas-layer" aria-hidden>
            <canvas ref={canvasRef} className="block h-full w-full" />
          </div>

          <div className="nx-socket-bay-grid" role="tablist" aria-label="Modular Node Sockets">
            {SOCKETS.map((sock, idx) => {
              const unlocked = idx < 2 || isPro;
              const active = sock.id === activeId;
              return (
                <button
                  key={sock.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    if (!unlocked) {
                      setIsPro(true);
                      setBusToast(`Unlocked Pro sockets — ${sock.name} snapped into ${sock.slotLabel}`);
                    }
                    setActiveId(sock.id);
                  }}
                  className={`nx-bay-card ${active ? "nx-bay-card--active" : ""} ${
                    !unlocked ? "nx-bay-card--locked" : ""
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="nx-bay-mono">
                      {unlocked ? sock.monogram : <LockIcon size={12} />}
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--land-faint)]">
                      {sock.slotLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] font-medium text-[color:var(--land-ink)]">{sock.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-[color:var(--land-muted)]">
                    {sock.tagline}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="nx-bus-live-banner" role="status" aria-live="polite">
            <span className="nx-core-beacon" />
            <code className="truncate font-mono text-[11.5px] text-[color:var(--land-gold-soft)]">
              {busToast}
            </code>
          </div>
        </div>

        {/* Active Standalone Node Application Viewport */}
        <div className="nx-node-app-stage">
          {/* WORKSPACE 1: STUDIO NODE */}
          {activeId === "studio" ? (
            <div className="nx-workspace-grid">
              <div className="nx-glass-card nx-glass-card--lit">
                <div className="nx-card-head">
                  <div>
                    <p className="nx-card-eyebrow">Socket 01 · Studio Node (Deterministic DAW)</p>
                    <h3 className="nx-card-title">Session: Distributed Systems Lecture 11</h3>
                  </div>
                  <button
                    type="button"
                    onClick={dispatchTranscriptToStudy}
                    className="dash-button dash-button--gold inline-flex items-center gap-1.5"
                  >
                    <BoltIcon size={13} />
                    <span>Emit Transcript → Study Socket</span>
                  </button>
                </div>

                {/* Multi-Track Stem Timeline */}
                <div className="nx-stem-rack">
                  {[
                    {
                      label: "CH-01 · Neumann U87",
                      meta: "48kHz PCM · Vocal Stem",
                      bars: [28, 52, 84, 96, 64, 42, 76, 92, 88, 50, 38, 74, 94, 82, 60, 44, 78, 90, 68, 48, 84, 95, 72, 40],
                      bright: true,
                    },
                    {
                      label: "CH-02 · Room Stereo",
                      meta: "Audience Q&A Bus",
                      bars: [14, 22, 34, 42, 28, 18, 30, 45, 38, 22, 16, 32, 44, 36, 25, 18, 34, 40, 28, 20, 36, 42, 30, 18],
                      bright: false,
                    },
                  ].map((stem) => (
                    <div key={stem.label} className="nx-stem-row">
                      <div className="w-40 shrink-0">
                        <p className="font-mono text-[11px] font-semibold text-[color:var(--land-ink)]">
                          {stem.label}
                        </p>
                        <p className="text-[10px] text-[color:var(--land-faint)]">{stem.meta}</p>
                      </div>
                      <div className="nx-stem-wave">
                        {stem.bars.map((h, i) => (
                          <span
                            key={i}
                            style={{
                              height: `${h}%`,
                              opacity: stem.bright ? 0.9 : 0.4,
                            }}
                          />
                        ))}
                        <span className="nx-stem-playhead" style={{ left: `${playhead}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Time-Coded Transcript Output */}
                <div className="rounded-xl border border-[rgba(240,181,74,0.28)] bg-black/60 p-3.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold uppercase tracking-[0.14em] text-[color:var(--land-gold)]">
                      Local On-Device Transcription · 0 Cloud Calls
                    </span>
                    <span className="font-mono text-[color:var(--land-gold-soft)]">
                      Markers: {dispatchedCount} queued for Study
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--land-ink)]">
                    &ldquo;[14:22] When a socket emits a typed envelope over the Nexus event bus, subscribing nodes
                    ingest the structured record immediately—so your recording studio and study deck collaborate
                    without copy-pasting or model lock-in.&rdquo;
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* WORKSPACE 2: STUDY NODE */}
          {activeId === "study" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="nx-glass-card lg:col-span-5">
                <div>
                  <p className="nx-card-eyebrow">Socket 02 · Study Node</p>
                  <h3 className="nx-card-title">CS 3410 · Distributed Systems</h3>
                  <p className="mt-1 text-[12px] text-[color:var(--land-muted)]">
                    Subscribed to <code className="text-[color:var(--land-gold-soft)]">studio.transcript</code> and{" "}
                    <code className="text-[color:var(--land-gold-soft)]">research.source</code>
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-black/50 p-3.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[color:var(--land-muted)]">Active Recall Queue</span>
                    <span className="font-mono font-semibold text-[color:var(--land-gold-soft)]">
                      {dispatchedCount} Cards Ready
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[78%] rounded-full bg-[color:var(--land-gold)]" />
                  </div>
                  <p className="mt-2 text-[11px] text-[color:var(--land-faint)]">
                    Next spaced review block pushed to Google Calendar at 15:30.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-[color:var(--land-faint)]">
                    Card {(cardIndex % STUDY_CARDS.length) + 1} of {STUDY_CARDS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveId("studio")}
                    className="text-[12px] font-medium text-[color:var(--land-gold-soft)] hover:underline"
                  >
                    ← Back to Studio Stem
                  </button>
                </div>
              </div>

              <div className="nx-glass-card nx-glass-card--lit lg:col-span-7">
                <div className="flex items-center justify-between">
                  <span className="nx-card-eyebrow">FSRS Active Recall Card</span>
                  <span className="font-mono text-[11px] text-[color:var(--land-gold-soft)]">
                    {currentCard.source}
                  </span>
                </div>

                <p className="text-[16px] font-medium leading-snug text-[color:var(--land-ink)]">
                  {currentCard.q}
                </p>

                {answerShown ? (
                  <div className="rounded-xl border border-[rgba(240,181,74,0.3)] bg-[rgba(240,181,74,0.07)] p-3.5 text-[13px] leading-relaxed text-[color:var(--land-ink)]">
                    {currentCard.a}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAnswerShown(true)}
                    className="rounded-xl border border-dashed border-[rgba(240,181,74,0.45)] py-6 text-center text-[13px] font-medium text-[color:var(--land-gold-soft)]"
                  >
                    Reveal deterministic answer
                  </button>
                )}

                <div className="flex flex-wrap gap-2">
                  {[
                    ["Again · 10m", "command:calendar.hold('Review Retry')"],
                    ["Good · 2d", "study:interval.advance('+2d')"],
                    ["Easy · 6d", "study:interval.advance('+6d')"],
                  ].map(([label, eventMsg]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setCardIndex((c) => c + 1);
                        setAnswerShown(true);
                        triggerBusTransfer("study", `${eventMsg} → Synced to Command Timeline`);
                      }}
                      className="dash-button flex-1"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* WORKSPACE 3: LEDGER NODE */}
          {activeId === "ledger" ? (
            <div className="nx-glass-card nx-glass-card--lit">
              <div className="nx-card-head">
                <div>
                  <p className="nx-card-eyebrow">Socket 03 · Ledger Node (`content:command.purchase:read`)</p>
                  <h3 className="nx-card-title">
                    November Operating Journal — ${currentLedgerTotal.toFixed(2)} USD
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={simulateReceiptToLedger}
                  className="dash-button dash-button--gold inline-flex items-center gap-1.5"
                >
                  <PlusIcon size={13} />
                  <span>Simulate Incoming Gmail Receipt</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--land-faint)]">
                      <th className="pb-2 font-semibold">Merchant</th>
                      <th className="pb-2 font-semibold">Category</th>
                      <th className="pb-2 font-semibold">Provenance Envelope</th>
                      <th className="pb-2 text-right font-semibold">Amount (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {[
                      ...extraReceipts,
                      {
                        merchant: "Amazon Web Services",
                        category: "Cloud Infrastructure",
                        origin: "Gmail Receipt #INV-290192",
                        amount: 42.1,
                      },
                      {
                        merchant: "Vercel Inc.",
                        category: "Edge Hosting",
                        origin: "Gmail Receipt #VC-88210",
                        amount: 20.0,
                      },
                      {
                        merchant: "Linear Orbit",
                        category: "Issue Tracking",
                        origin: "Gmail Receipt #LN-44109",
                        amount: 16.0,
                      },
                    ].map((row, idx) => (
                      <tr key={`${row.merchant}-${idx}`} className={idx === 0 ? "text-[color:var(--land-gold-soft)]" : ""}>
                        <td className="py-2.5 font-medium text-[color:var(--land-ink)]">{row.merchant}</td>
                        <td className="py-2.5 text-[color:var(--land-muted)]">{row.category}</td>
                        <td className="py-2.5 font-mono text-[11px] text-[color:var(--land-faint)]">{row.origin}</td>
                        <td className="py-2.5 text-right font-mono font-semibold text-[color:var(--land-gold-soft)]">
                          ${row.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* WORKSPACE 4: CANVAS NODE */}
          {activeId === "canvas" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="nx-glass-card nx-glass-card--lit lg:col-span-8">
                <div className="flex items-center justify-between">
                  <span className="nx-card-eyebrow">Socket 04 · Spatial Research Canvas</span>
                  <span className="text-[11px] text-[color:var(--land-muted)]">
                    Click any node to inspect its bus lineage
                  </span>
                </div>

                <svg viewBox="0 0 820 290" className="w-full h-auto overflow-visible" role="img" aria-label="Canvas citation graph">
                  <defs>
                    <linearGradient id="nxCanvasEdge" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(240,181,74,0.85)" />
                      <stop offset="100%" stopColor="rgba(255,217,154,0.3)" />
                    </linearGradient>
                  </defs>

                  <path d="M 165 88 C 275 88, 305 155, 410 155" fill="none" stroke="url(#nxCanvasEdge)" strokeWidth="1.6" />
                  <path d="M 410 155 C 515 155, 545 84, 655 84" fill="none" stroke="url(#nxCanvasEdge)" strokeWidth="1.6" />
                  <path d="M 410 155 C 515 155, 545 228, 655 228" fill="none" stroke="url(#nxCanvasEdge)" strokeWidth="1.6" />

                  {CANVAS_NODES.map((node) => {
                    const selected = node.id === currentCanvasNode.id;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={() => setSelectedCanvasNode(node.id)}
                        className="cursor-pointer"
                      >
                        <rect
                          x="-115"
                          y="-30"
                          width="230"
                          height="60"
                          rx="14"
                          fill="#090806"
                          stroke={selected ? "#f0b54a" : "rgba(255,255,255,0.14)"}
                          strokeWidth={selected ? "1.8" : "1"}
                        />
                        <circle cx="-88" cy="0" r="14" fill="rgba(240,181,74,0.16)" stroke="rgba(240,181,74,0.65)" />
                        <text x="-88" y="4" textAnchor="middle" fill="#ffd99a" fontSize="10" fontWeight="600">
                          {node.mono}
                        </text>
                        <text x="-64" y="-4" fill="#f5f5f7" fontSize="12.5" fontWeight="600">
                          {node.title}
                        </text>
                        <text x="-64" y="13" fill="#a1a1a6" fontSize="10.5">
                          {node.subtitle}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="nx-glass-card lg:col-span-4">
                <div>
                  <span className="nx-card-eyebrow">Selected Graph Node</span>
                  <h4 className="nx-card-title mt-1">{currentCanvasNode.title}</h4>
                  <p className="mt-0.5 font-mono text-[11px] text-[color:var(--land-gold-soft)]">
                    {currentCanvasNode.subtitle}
                  </p>
                </div>
                <p className="text-[13px] leading-relaxed text-[color:var(--land-ink)]">
                  {currentCanvasNode.note}
                </p>
                <div className="rounded-xl border border-white/[0.07] bg-black/50 p-3 font-mono text-[11px] text-[color:var(--land-muted)]">
                  capability: content:research.source:read
                </div>
              </div>
            </div>
          ) : null}

          {/* WORKSPACE 5: NODE SDK CONTRACT */}
          {activeId === "sdk" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="nx-glass-card nx-glass-card--lit lg:col-span-7">
                <div className="flex items-center justify-between">
                  <span className="nx-card-eyebrow">Public TypeScript Extension API · v1</span>
                  <span className="font-mono text-[11px] text-[color:var(--land-gold-soft)]">
                    src/extensions/samples.ts
                  </span>
                </div>
                <pre className="dash-code overflow-x-auto rounded-xl border border-white/[0.08] bg-black/70 p-4 text-[12px] leading-relaxed">
{`export const ledger = defineExtension({
  manifest: {
    id: "dev.nexus.sample.ledger",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Ledger",
    capabilities: ["content:command.purchase:read"],
    monogram: "LG",
  },
  handlers: {
    onEvent: (event, runtime) => {
      if (event.type !== "command:item-published") return;
      runtime.emit("nexus:proactive", {
        suggestion: "Logged purchase envelope to Ledger.",
      });
    },
  },
});`}
                </pre>
              </div>

              <div className="nx-glass-card lg:col-span-5">
                <div>
                  <span className="nx-card-eyebrow">Zero-Trust Capability Sandbox</span>
                  <h4 className="nx-card-title">Built like VS Code or Obsidian</h4>
                </div>
                <p className="text-[13px] leading-relaxed text-[color:var(--land-muted)]">
                  Every first-party and third-party Node declares its exact content capabilities up front. The central
                  event bus enforces schema versions and capability checks on every message.
                </p>
                <ul className="space-y-2 text-[12px] text-[color:var(--land-ink)]">
                  <li className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                    <strong className="text-[color:var(--land-gold-soft)]">Deterministic Runtime:</strong> Runs at 0
                    LLM cost with full local state.
                  </li>
                  <li className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                    <strong className="text-[color:var(--land-gold-soft)]">Typed Content Bus:</strong> Validated by
                    44 automated smoke assertions.
                  </li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
