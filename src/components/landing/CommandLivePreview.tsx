"use client";

import { useEffect, useRef, useState } from "react";
import { BoltIcon, LockIcon, SyncIcon } from "@/components/dashboard/icons";
import {
  bezier,
  clamp,
  fitCanvas,
  lerp,
  radialGlow,
  seededHelpers,
  type Vec,
} from "@/lib/network/geometry";

type MomentId = "morning" | "receipt" | "deepwork" | "run" | "night";

type DayMoment = {
  id: MomentId;
  time: string;
  hourNorm: number; // 0 to 1 along the celestial arc
  label: string;
  temp: string;
  skyCondition: string;
  celestialMeta: string;
  activeConnectors: string[];
  ruleName: string;
  ruleTrigger: string;
  ruleSteps: Array<{ service: string; mono: string; action: string; status: string }>;
  highlightWidget: "weather" | "mail" | "dev" | " athletics";
};

const DAY_MOMENTS: DayMoment[] = [
  {
    id: "morning",
    time: "08:30",
    hourNorm: 0.16,
    label: "Morning Telemetry Sync",
    temp: "12°",
    skyCondition: "Crisp Dawn · Toronto",
    celestialMeta: "Sunrise 07:14 · Wind 6 km/h ENE",
    activeConnectors: ["GC", "Gm", "Wx", "GT"],
    ruleName: "recipe.morning_window",
    ruleTrigger: "when(clock.at == '08:30' && calendar.open)",
    ruleSteps: [
      { service: "Google Calendar", mono: "GC", action: "Pull 4 timed events onto unified timeline", status: "Synced" },
      { service: "Google Tasks", mono: "GT", action: "Stage 3 priority tasks into Today lane", status: "Staged" },
      { service: "Daily Brief Node", mono: "DB", action: "Emit 'nexus:context' to active sockets", status: "Emitted" },
    ],
    highlightWidget: "weather",
  },
  {
    id: "receipt",
    time: "11:20",
    hourNorm: 0.36,
    label: "Receipt & Parcel Ingestion",
    temp: "16°",
    skyCondition: "High Sun · Clear",
    celestialMeta: "UV Index 4 · Visibility 16 km",
    activeConnectors: ["Gm", "Pl", "GC"],
    ruleName: "recipe.receipt_to_ledger",
    ruleTrigger: "when(gmail.message.matches('receipt | invoice | tracking'))",
    ruleSteps: [
      { service: "Gmail Parser", mono: "Gm", action: "Extract merchant 'AWS', total $42.10 USD, #INV-290192", status: "Parsed" },
      { service: "Shared Event Bus", mono: "NX", action: "Publish 'command.purchase' envelope", status: "0.8ms" },
      { service: "Ledger Socket", mono: "LG", action: "Append to November Operating Expenses", status: "Logged" },
    ],
    highlightWidget: "mail",
  },
  {
    id: "deepwork",
    time: "14:00",
    hourNorm: 0.56,
    label: "Deep Work Automation",
    temp: "18°",
    skyCondition: "Clear · Peak Daylight",
    celestialMeta: "Barometer 1018 hPa · Humidity 48%",
    activeConnectors: ["GC", "Sp", "GH", "Vc"],
    ruleName: "recipe.deep_work_focus",
    ruleTrigger: "when(calendar.event.starts('Deep Work'))",
    ruleSteps: [
      { service: "Google Calendar", mono: "GC", action: "Lock 90m window 'Event Bus Architecture'", status: "Active" },
      { service: "Spotify Connect", mono: "Sp", action: "Start playlist 'Solaris Ambient Stems'", status: "Playing" },
      { service: "GitHub & Alerts", mono: "GH", action: "Hold non-critical PR notifications until 15:30", status: "Muted" },
    ],
    highlightWidget: "dev",
  },
  {
    id: "run",
    time: "17:45",
    hourNorm: 0.76,
    label: "Strava Run & Goal Close",
    temp: "14°",
    skyCondition: "Golden Hour · Dusk",
    celestialMeta: "Sunset 17:52 · Air Quality 18 AQI",
    activeConnectors: ["St", "GC", "F1"],
    ruleName: "recipe.strava_goal_sync",
    ruleTrigger: "when(strava.activity.completed(type == 'Run'))",
    ruleSteps: [
      { service: "Strava Telemetry", mono: "St", action: "Ingest 6.4 km run (4:34 /km · 156 bpm)", status: "Synced" },
      { service: "Command Goals", mono: "CG", action: "Advance weekly mileage target (28.4 / 35 km)", status: "+6.4 km" },
      { service: "Formula 1 Feed", mono: "F1", action: "Pin Las Vegas GP Qualifying to evening rail", status: "22:00" },
    ],
    highlightWidget: " athletics",
  },
  {
    id: "night",
    time: "21:15",
    hourNorm: 0.9,
    label: "Night Sky & Edge Audit",
    temp: "9°",
    skyCondition: "Waxing Gibbous · 78% Illumination",
    celestialMeta: "Bortle Class 4 · Clear zenith viewing",
    activeConnectors: ["Wx", "Vc", "GH"],
    ruleName: "recipe.evening_audit",
    ruleTrigger: "when(uptime.check == 'ok' && vercel.deploy == 'ready')",
    ruleSteps: [
      { service: "Vercel Edge", mono: "Vc", action: "Verify production build #88e3706 (33 routes)", status: "Ready" },
      { service: "Uptime Monitor", mono: "Up", action: "Confirm 99.98% availability · 14ms p95", status: "14ms" },
      { service: "Night Sky Widget", mono: "Sk", action: "Log lunar phase & tomorrow's 07:15 dawn", status: "Quiet" },
    ],
    highlightWidget: "weather",
  },
];

const CONNECTORS = [
  { mono: "GC", name: "Google Calendar", category: "Scheduling" },
  { mono: "Gm", name: "Gmail", category: "Receipts & Mail" },
  { mono: "GH", name: "GitHub", category: "Reviews & CI" },
  { mono: "Sp", name: "Spotify", category: "Focus Audio" },
  { mono: "St", name: "Strava", category: "Kinematics" },
  { mono: "Pl", name: "Plaid", category: "Ledger Feed" },
  { mono: "Vc", name: "Vercel", category: "Deployments" },
  { mono: "F1", name: "Formula 1", category: "Race Timing" },
  { mono: "Wx", name: "Weather & Sky", category: "Keyless Telemetry" },
] as const;

export function CommandLivePreview() {
  const [momentId, setMomentId] = useState<MomentId>("deepwork");
  const [paused, setPaused] = useState(false);
  const [mutedConnectors, setMutedConnectors] = useState<Record<string, boolean>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetNormRef = useRef(0.56);

  const moment = DAY_MOMENTS.find((m) => m.id === momentId) ?? DAY_MOMENTS[2]!;

  useEffect(() => {
    targetNormRef.current = moment.hourNorm;
  }, [moment.hourNorm]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setMomentId((prev) => {
        const idx = DAY_MOMENTS.findIndex((m) => m.id === prev);
        return DAY_MOMENTS[(idx + 1) % DAY_MOMENTS.length]!.id;
      });
    }, 6400);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { rnd, between } = seededHelpers(20261119);
    const stars = Array.from({ length: 160 }, () => ({
      x: rnd(),
      y: rnd() * 0.72,
      size: between(0.45, 1.4),
      alpha: between(0.25, 0.85),
      phase: rnd() * Math.PI * 2,
    }));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let currentNorm = targetNormRef.current;
    let width = 1;
    let height = 1;
    let frame = 0;
    let start = 0;
    let last = 0;

    const draw = (time: number, dt: number) => {
      currentNorm = lerp(currentNorm, targetNormRef.current, reduceMotion ? 1 : clamp(dt * 3.5, 0, 1));

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      const p0: Vec = { x: width * 0.04, y: height * 0.82 };
      const p1: Vec = { x: width * 0.34, y: height * 0.08 };
      const p2: Vec = { x: width * 0.66, y: height * 0.08 };
      const p3: Vec = { x: width * 0.96, y: height * 0.82 };

      const orb = bezier(p0, p1, p2, p3, currentNorm);

      // Ambient celestial glow following the sun/moon orb along the 24h horizon
      radialGlow(ctx, orb, Math.max(width, height) * 0.42, [
        [0, "rgba(255, 206, 120, 0.24)"],
        [0.35, "rgba(232, 150, 48, 0.08)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // Multi-strand golden horizon arc
      for (let i = -3; i <= 3; i++) {
        const offset = i * 9;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y + offset);
        ctx.bezierCurveTo(
          p1.x,
          p1.y + offset * 1.4,
          p2.x,
          p2.y + offset * 1.4,
          p3.x,
          p3.y + offset,
        );
        ctx.lineWidth = i === 0 ? 1.5 : 0.6;
        ctx.strokeStyle =
          i === 0 ? "rgba(255, 224, 160, 0.75)" : `rgba(240, 181, 74, ${0.22 - Math.abs(i) * 0.04})`;
        ctx.stroke();
      }

      // Vertical telemetry drop-lines from checkpoints
      DAY_MOMENTS.forEach((m) => {
        const pt = bezier(p0, p1, p2, p3, m.hourNorm);
        const dist = Math.abs(m.hourNorm - currentNorm);
        const strength = clamp(1 - dist * 4, 0.18, 1);

        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x, height);
        ctx.lineWidth = strength > 0.6 ? 1.2 : 0.6;
        ctx.strokeStyle = `rgba(240, 181, 74, ${0.08 + strength * 0.28})`;
        ctx.stroke();

        ctx.fillStyle = strength > 0.6 ? "#ffd99a" : "rgba(240, 181, 74, 0.45)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, strength > 0.6 ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Luminous Celestial Core at current selected time
      radialGlow(ctx, orb, 44, [
        [0, "rgba(255, 252, 240, 1)"],
        [0.25, "rgba(255, 220, 150, 0.8)"],
        [0.6, "rgba(240, 181, 74, 0.25)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // Twinkling celestial field dust
      ctx.fillStyle = "rgb(255, 224, 160)";
      for (const s of stars) {
        const twinkle = 0.4 + 0.6 * Math.sin(time * 1.3 + s.phase);
        ctx.globalAlpha = s.alpha * twinkle * 0.55;
        ctx.fillRect(s.x * width, s.y * height, s.size, s.size);
      }
    };

    const resize = () => {
      const box = fitCanvas(canvas, ctx);
      width = box.width;
      height = box.height;
      if (reduceMotion) draw(2, 0);
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

  function toggleConnector(mono: string) {
    setMutedConnectors((prev) => ({ ...prev, [mono]: !prev[mono] }));
  }

  return (
    <div className="nx-cmd-showcase">
      <div className="nx-monolith">
        {/* Top Interactive 24-Hour Celestial & Telemetry Horizon Stage */}
        <div className="nx-cmd-horizon">
          <div className="nx-canvas-layer" aria-hidden>
            <canvas ref={canvasRef} className="block h-full w-full" />
          </div>

          <div className="nx-topbar">
            <div className="flex items-center gap-2.5">
              <span className="nx-core-beacon" />
              <span className="text-[12px] font-medium text-[color:var(--land-ink)]">
                Tier 02 · Command Telemetry &amp; Deterministic Rules
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11.5px] text-[color:var(--land-muted)]">
              <LockIcon size={13} className="text-[color:var(--land-gold)]" />
              <span>Tokens sealed with AES-256-GCM · Never sent to browser</span>
            </div>
          </div>

          {/* Interactive 24h Scrubber Checkpoints along the Golden Arc */}
          <div className="nx-horizon-scrubber">
            <div className="nx-horizon-readout">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--land-gold)]">
                  24-Hour Unified Horizon · {moment.time}
                </p>
                <h3 className="mt-1 text-[20px] font-light tracking-[-0.02em] text-[color:var(--land-ink)] sm:text-[24px]">
                  {moment.label}
                </h3>
                <p className="mt-0.5 text-[12.5px] text-[color:var(--land-muted)]">{moment.celestialMeta}</p>
              </div>

              <div className="text-right">
                <span className="block text-[34px] font-light leading-none tracking-[-0.04em] text-[color:var(--land-gold-soft)] sm:text-[42px]">
                  {moment.temp}
                </span>
                <span className="mt-1 block text-[12px] text-[color:var(--land-muted)]">{moment.skyCondition}</span>
              </div>
            </div>

            <div className="nx-moment-buttons" role="tablist" aria-label="Select timeline hour">
              {DAY_MOMENTS.map((m) => {
                const active = m.id === moment.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setPaused(true);
                      setMomentId(m.id);
                    }}
                    className={`nx-moment-btn ${active ? "nx-moment-btn--active" : ""}`}
                  >
                    <span className="font-mono text-[11px] text-[color:var(--land-gold-soft)]">{m.time}</span>
                    <span className="truncate text-[12px] font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Interactive Connector Vault Strip */}
        <div className="nx-connector-bar">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-[color:var(--land-faint)]">
            Connected Feeds (Click to test unlinked fallback):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CONNECTORS.map((c) => {
              const isMuted = Boolean(mutedConnectors[c.mono]);
              const isHighlighted = moment.activeConnectors.includes(c.mono) && !isMuted;
              return (
                <button
                  key={c.mono}
                  type="button"
                  onClick={() => toggleConnector(c.mono)}
                  aria-pressed={!isMuted}
                  className={`nx-conn-toggle ${
                    isMuted
                      ? "nx-conn-toggle--off"
                      : isHighlighted
                        ? "nx-conn-toggle--lit"
                        : ""
                  }`}
                >
                  <span className="nx-conn-mono">{c.mono}</span>
                  <span>{c.name}</span>
                  <span className="text-[10px] text-[color:var(--land-faint)]">
                    {isMuted ? "Unlinked" : "Live"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Command Bento Grid: Deterministic Automation Engine + Live Telemetry Widgets */}
        <div className="nx-cmd-bento">
          {/* BENTO 1: DETERMINISTIC CROSS-API AUTOMATION PIPELINE */}
          <article className="nx-glass-card nx-glass-card--lit">
            <div className="nx-card-head">
              <div>
                <p className="nx-card-eyebrow">Deterministic Rule Engine · 0 LLM Tokens</p>
                <h4 className="nx-card-title">{moment.ruleName}</h4>
              </div>
              <span className="nx-sync-pill">
                <BoltIcon size={12} />
                <span>Cross-API Recipe</span>
              </span>
            </div>

            <div className="rounded-xl border border-[rgba(240,181,74,0.3)] bg-black/60 px-3 py-2 font-mono text-[11.5px] text-[color:var(--land-gold-soft)]">
              {moment.ruleTrigger}
            </div>

            <ol className="space-y-2">
              {moment.ruleSteps.map((step, i) => {
                const isSkipped = Boolean(mutedConnectors[step.mono]);
                return (
                  <li
                    key={step.service}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[12.5px] ${
                      isSkipped
                        ? "border-dashed border-white/10 bg-white/[0.01] opacity-60"
                        : "border-white/[0.08] bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="text-[10px] font-mono text-[color:var(--land-faint)]">0{i + 1}</span>
                      <span className="nx-prov-mono">{step.mono}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[color:var(--land-ink)]">{step.service}</p>
                        <p className="truncate text-[11.5px] text-[color:var(--land-muted)]">
                          {isSkipped ? "Service unlinked — step skipped cleanly" : step.action}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10.5px] ${
                        isSkipped
                          ? "bg-white/[0.06] text-[color:var(--land-faint)]"
                          : "border border-[rgba(240,181,74,0.4)] bg-[rgba(240,181,74,0.12)] text-[color:var(--land-gold-soft)]"
                      }`}
                    >
                      {isSkipped ? "SKIPPED" : step.status}
                    </span>
                  </li>
                );
              })}
            </ol>
          </article>

          {/* BENTO 2: GMAIL RECEIPT & TRACKING EXTRACTOR */}
          <article className={`nx-glass-card ${moment.id === "receipt" ? "nx-glass-card--lit" : ""}`}>
            <div className="nx-card-head">
              <div>
                <p className="nx-card-eyebrow">Gmail · Deterministic Parser</p>
                <h4 className="nx-card-title">Receipts, Invoices &amp; Deliveries</h4>
              </div>
              <span className="nx-sync-pill">
                <SyncIcon size={11} />
                <span>command.purchase</span>
              </span>
            </div>

            <div className="space-y-2">
              {[
                {
                  mono: "AWS",
                  from: "Amazon Web Services",
                  subject: "Invoice #INV-290192 · Cloud Infrastructure",
                  badge: "$42.10 USD",
                  route: "→ Routed to Ledger Socket",
                  lit: true,
                },
                {
                  mono: "UPS",
                  from: "UPS Quantum View",
                  subject: "Parcel #1Z999AA10123456784 · Studio Mic Preamp",
                  badge: "Out for delivery",
                  route: "→ Pinned to Today Timeline",
                  lit: false,
                },
                {
                  mono: "LN",
                  from: "Linear Orbit",
                  subject: "Receipt #LN-88412 · Monthly Workspace",
                  badge: "$16.00 USD",
                  route: "→ Routed to Ledger Socket",
                  lit: false,
                },
              ].map((mail) => (
                <div
                  key={mail.subject}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 ${
                    mail.lit
                      ? "border-[rgba(240,181,74,0.38)] bg-[rgba(240,181,74,0.08)]"
                      : "border-white/[0.07] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="nx-prov-mono">{mail.mono}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-[color:var(--land-ink)]">{mail.from}</p>
                      <p className="truncate text-[11px] text-[color:var(--land-muted)]">{mail.subject}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block font-mono text-[12px] font-semibold text-[color:var(--land-gold-soft)]">
                      {mail.badge}
                    </span>
                    <span className="block text-[10px] text-[color:var(--land-faint)]">{mail.route}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* BENTO 3: ENGINEERING, KINEMATICS & GRAND PRIX TELEMETRY */}
          <article
            className={`nx-glass-card nx-cmd-bento-wide ${
              moment.id === "run" || moment.id === "night" ? "nx-glass-card--lit" : ""
            }`}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {/* GitHub + Vercel */}
              <div className="rounded-xl border border-white/[0.07] bg-black/50 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold uppercase tracking-[0.12em] text-[color:var(--land-gold)]">
                    GitHub &amp; Vercel
                  </span>
                  <span className="font-mono text-[color:var(--land-gold-soft)]">READY · 14ms</span>
                </div>
                <p className="mt-2 text-[13px] font-medium text-[color:var(--land-ink)]">
                  main @ 88e3706 · 33 routes
                </p>
                <p className="mt-0.5 text-[11.5px] text-[color:var(--land-muted)]">
                  44/44 extension smoke checks passing
                </p>
              </div>

              {/* Strava Kinematics */}
              <div className="rounded-xl border border-white/[0.07] bg-black/50 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold uppercase tracking-[0.12em] text-[color:var(--land-gold)]">
                    Strava Run
                  </span>
                  <span className="font-mono text-[color:var(--land-gold-soft)]">28.4 / 35 km</span>
                </div>
                <p className="mt-2 text-[18px] font-light tracking-[-0.02em] text-[color:var(--land-ink)]">
                  6.42 km <span className="text-[12px] text-[color:var(--land-muted)]">· 4:34 /km</span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-[color:var(--land-muted)]">
                  Waterfront Tempo · 156 bpm avg
                </p>
              </div>

              {/* Formula 1 Live Schedule */}
              <div className="rounded-xl border border-white/[0.07] bg-black/50 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold uppercase tracking-[0.12em] text-[color:var(--land-gold)]">
                    Formula 1
                  </span>
                  <span className="font-mono text-[color:var(--land-gold-soft)]">Round 22</span>
                </div>
                <p className="mt-2 text-[13px] font-medium text-[color:var(--land-ink)]">
                  Las Vegas Grand Prix
                </p>
                <p className="mt-0.5 text-[11.5px] text-[color:var(--land-muted)]">
                  Qualifying · Friday 22:00 EST
                </p>
              </div>

              {/* Crypto & Uptime Signal */}
              <div className="rounded-xl border border-white/[0.07] bg-black/50 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold uppercase tracking-[0.12em] text-[color:var(--land-gold)]">
                    Uptime &amp; Markets
                  </span>
                  <span className="font-mono text-[color:var(--land-gold-soft)]">99.98% OK</span>
                </div>
                <p className="mt-2 text-[13px] font-medium text-[color:var(--land-ink)]">
                  API Gateway · 14ms p95
                </p>
                <p className="mt-0.5 text-[11.5px] text-[color:var(--land-muted)]">
                  Keyless telemetry synced every 30s
                </p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
