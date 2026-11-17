"use client";

import { CircleDot, GitCommitHorizontal, GitPullRequest, Sun } from "lucide-react";

/** Visual miniature preview of each Command widget for galleries and setup boards. */
export function WidgetVisualPreview({ id }: { id: string }) {
  switch (id) {
    case "gmail":
      return (
        <div className="space-y-1.5 pt-0.5 text-foreground">
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[10.5px] text-muted-foreground">
            <span className="truncate">All · Unread</span>
            <span className="shrink-0 font-medium text-[color:var(--land-gold)]">Compose</span>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-border/40 py-0.5 text-[12px]">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--land-gold)]" aria-hidden />
              <span className="truncate">Alex Rivera · Q4 rollout &amp; latency</span>
            </span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">10m</span>
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">Linear · 3 issues assigned in Nexus</span>
            <span className="shrink-0 text-[10.5px] tabular-nums">1h</span>
          </div>
        </div>
      );
    case "calendar":
      return (
        <div className="space-y-1 pt-0.5 text-foreground">
          <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
            <span>Month view</span>
            <span className="text-[color:var(--land-gold)]">Google Calendar</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-muted-foreground">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
            {Array.from({ length: 14 }, (_, idx) => {
              const day = idx + 10;
              const isToday = day === 17;
              const hasEvent = day === 12 || day === 17 || day === 19 || day === 22;
              return (
                <span
                  key={day}
                  className={`flex flex-col items-center rounded border py-0.5 text-[9.5px] tabular-nums ${
                    isToday
                      ? "border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/15 font-semibold text-foreground"
                      : "border-border/40 bg-muted/30 text-foreground/80"
                  }`}
                >
                  <span>{day}</span>
                  {hasEvent ? <span className="mt-0.5 h-1 w-2.5 rounded-full bg-[color:var(--land-gold)]" /> : null}
                </span>
              );
            })}
          </div>
        </div>
      );
    case "weather":
      return (
        <div className="space-y-1.5 pt-0.5 text-foreground">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="cmd-wx-temp tabular-nums">72°</p>
              <p className="mt-1 truncate text-[11.5px] text-muted-foreground">Mostly clear · H 75° L 58°</p>
            </div>
            <Sun className="mt-0.5 size-4 shrink-0 text-[color:var(--land-gold)]" aria-hidden />
          </div>
          <ol className="cmd-wx-hours" style={{ marginTop: "0.35rem" }}>
            {[
              ["Now", "72°"],
              ["1PM", "74°"],
              ["2PM", "75°"],
              ["3PM", "73°"],
            ].map(([t, temp]) => (
              <li key={t} className="rounded-md border border-border/40 bg-muted/45 py-0.5">
                <span className="font-medium text-foreground">{temp}</span>
                <span className="text-[10px] text-muted-foreground">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "tasks":
      return (
        <div className="space-y-1 pt-0.5 text-foreground">
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            + Add a task…
          </div>
          {[
            "Finalize Laniakea stage polish",
            "Review Google OAuth scopes",
            "Send investor update deck",
          ].map((title, idx) => (
            <div
              key={title}
              className="cmd-task-row"
              style={{
                alignItems: "center",
                paddingBlock: "0.22rem",
                fontSize: "12px",
                ...(idx === 2 ? { borderBottom: "none" } : {}),
              }}
            >
              <span aria-hidden className="size-3 shrink-0 rounded-full border border-[color:var(--land-line)]" />
              <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
              {idx === 0 ? (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--land-gold)]" />
              ) : null}
            </div>
          ))}
        </div>
      );
    case "crypto":
      return (
        <div className="space-y-1.5 pt-0.5 text-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-lg border border-border/60 bg-muted/35 px-2.5 py-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11.5px] font-medium text-foreground">Bitcoin</span>
                <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">BTC</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-1.5">
                <span className="text-[13px] font-medium text-foreground tabular-nums">$94,280</span>
                <span className="cmd-up text-[11px] font-medium tabular-nums">+3.8%</span>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-border/60 bg-muted/35 px-2.5 py-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11.5px] font-medium text-foreground">Ethereum</span>
                <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">ETH</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-1.5">
                <span className="text-[13px] font-medium text-foreground tabular-nums">$3,140</span>
                <span className="cmd-up text-[11px] font-medium tabular-nums">+2.1%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/25 px-2.5 py-1 text-[11px]">
            <span className="truncate font-medium text-foreground">
              Solana <span className="ml-1 font-mono text-[9.5px] font-normal text-muted-foreground">SOL</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-foreground">$184.20</span>
              <span className="cmd-up ml-1.5 text-[10.5px] font-medium">+5.4%</span>
            </span>
          </div>
        </div>
      );
    case "sky":
      return (
        <div className="space-y-2 pt-0.5 text-foreground">
          <div className="flex items-center gap-2.5">
            <span className="cmd-moon shrink-0" style={{ width: "2rem", height: "2rem" }} aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-foreground">Waxing Gibbous</p>
              <p className="truncate text-[11px] text-muted-foreground tabular-nums">78% lit · 82/100</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/40 bg-muted/40 px-2 py-1.5 text-[10.5px]">
            <div className="min-w-0">
              <span className="block text-[9.5px] text-muted-foreground">Sunset</span>
              <span className="font-medium text-foreground tabular-nums">7:48 PM</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9.5px] text-muted-foreground">Dark</span>
              <span className="font-medium text-foreground tabular-nums">9:12 PM</span>
            </div>
          </div>
        </div>
      );
    case "f1":
      return (
        <div className="space-y-1 pt-0.5 text-foreground">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/10 px-2.5 py-1 text-[11.5px]">
            <span className="min-w-0 truncate font-medium text-foreground">Up next · Monaco Qualifying</span>
            <span className="shrink-0 font-medium text-[color:var(--land-gold)] tabular-nums">in 2d</span>
          </div>
          <div className="cmd-f1-row" style={{ alignItems: "center", paddingBlock: "0.24rem" }}>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Monaco GP · Practice 3</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">Sat 6:30 AM</span>
          </div>
          <div className="cmd-f1-row" style={{ alignItems: "center", paddingBlock: "0.24rem", borderBottom: "none" }}>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">Monaco GP · Race</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">Sun 9:00 AM</span>
          </div>
        </div>
      );
    case "uptime":
      return (
        <div className="space-y-2 pt-0.5 text-foreground">
          <div>
            <div className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <span className="truncate font-medium text-foreground">nexus.app</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">200</span>
              </span>
              <span className="cmd-up shrink-0 font-mono tabular-nums">118 ms</span>
            </div>
            <div className="cmd-up-meter" style={{ marginBottom: 0 }} aria-hidden>
              <span style={{ width: "24%" }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <span className="truncate font-medium text-foreground">api.nexus.app</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">200</span>
              </span>
              <span className="cmd-up shrink-0 font-mono tabular-nums">84 ms</span>
            </div>
            <div className="cmd-up-meter" style={{ marginBottom: 0 }} aria-hidden>
              <span style={{ width: "16%" }} />
            </div>
          </div>
        </div>
      );
    case "github":
      return (
        <div className="pt-0.5 text-foreground">
          <div className="cmd-gh-row" style={{ alignItems: "center", paddingBlock: "0.26rem" }}>
            <GitPullRequest className="size-3 shrink-0 text-[color:var(--land-gold)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              Review: Laniakea supercluster stage
            </span>
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">Nexus #42</span>
          </div>
          <div className="cmd-gh-row" style={{ alignItems: "center", paddingBlock: "0.26rem" }}>
            <GitCommitHorizontal className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground/90">Pushed 3 commits to main</span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">today</span>
          </div>
          <div className="cmd-gh-row" style={{ alignItems: "center", paddingBlock: "0.26rem", borderBottom: "none" }}>
            <CircleDot className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Token polish in Gallery Light</span>
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">Nexus #39</span>
          </div>
        </div>
      );
    case "strava":
      return (
        <div className="space-y-1.5 pt-0.5 text-foreground">
          <div>
            <p className="cmd-run-distance leading-none tabular-nums" style={{ fontSize: "1.65rem" }}>
              8.4 <span className="text-xs font-normal text-muted-foreground">km</span>
            </p>
            <p className="mt-1 truncate text-[11.5px] font-medium text-foreground">Morning tempo run</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/40 bg-muted/40 px-2 py-1 text-[10.5px]">
            <div className="min-w-0">
              <span className="block text-[9.5px] text-muted-foreground">Time</span>
              <span className="font-medium text-foreground tabular-nums">42 min</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9.5px] text-muted-foreground">Pace</span>
              <span className="font-medium text-foreground tabular-nums">5:02 /km</span>
            </div>
          </div>
        </div>
      );
    case "vercel":
      return (
        <div className="pt-0.5 text-foreground">
          <div className="cmd-deploy-row" style={{ alignItems: "center", paddingBlock: "0.28rem" }}>
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">nexus · Production</span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">12m</span>
          </div>
          <div className="cmd-deploy-row" style={{ alignItems: "center", paddingBlock: "0.28rem" }}>
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground/90">fix: Command widget sizing</span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">1h</span>
          </div>
          <div className="cmd-deploy-row" style={{ alignItems: "center", paddingBlock: "0.28rem", borderBottom: "none" }}>
            <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--land-gold)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">feat: Preview tokens</span>
            <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">3h</span>
          </div>
        </div>
      );
    default:
      return null;
  }
}
