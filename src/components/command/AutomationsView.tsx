"use client";

import { Fragment, useState } from "react";
import { ArrowRight, Play, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTION_DEFINITIONS } from "@/lib/command/actions";
import type { RecipeTrigger } from "@/lib/command/automation/types";
import { CONNECTOR_CATALOG, getConnector } from "@/lib/connectors/catalog";
import { clock, dayLabel } from "./format";
import { StatusDot, Toggle } from "./parts";
import type { CommandController } from "./use-command";

function triggerLabel(t: RecipeTrigger): string {
  const services = (ids?: string[]) =>
    ids?.length ? ids.map((id) => getConnector(id)?.name ?? id).join(" or ") : "any service";
  const noun = (kind: string) => kind.replace("command.", "");
  switch (t.type) {
    case "focus.started":
      return "When a focus session starts";
    case "focus.ended":
      return "When a focus session ends";
    case "item.created":
      return `When a new ${noun(t.kind)} arrives from ${services(t.connectors)}`;
    case "item.upcoming":
      return `${t.withinHours} h before a ${noun(t.kind)} from ${services(t.connectors)}`;
  }
}

export function AutomationsView({
  command,
  onConnections,
  onStartQuickFocus,
}: {
  command: CommandController;
  onConnections?: () => void;
  onStartQuickFocus?: () => void;
}) {
  const state = command.state!;
  const [error, setError] = useState<string | null>(null);
  const connected = new Set(state.connections.map((c) => c.connectorId));
  const enabledCount = state.recipes.filter((r) => r.enabled).length;

  return (
    <div className="cmd-automations mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[42rem]">
          <h2 className="font-editorial text-[1.75rem] leading-tight font-medium tracking-[-0.02em] text-foreground">
            Deterministic automations
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--land-muted)]">
            Plain rules built from explicit triggers and connected service actions. No hidden AI
            guesses. Any step whose service isn’t connected yet is skipped cleanly and recorded in
            your run log.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono tabular-nums">
            <span className="size-1.5 rounded-full bg-[color:var(--land-gold)]" />
            {enabledCount} of {state.recipes.length} active
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono tabular-nums">
            {state.runs.length} recorded run{state.runs.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="mt-5 rounded-xl py-2.5">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="mt-8 space-y-3.5">
        {state.recipes.map((r) => (
          <li
            key={r.id}
            className={`cmd-recipe rounded-2xl transition-all ${r.enabled ? "" : "cmd-recipe--off"}`}
          >
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15.5px] font-medium text-foreground">{r.name}</p>
                  <Badge
                    variant="outline"
                    className={`h-5 px-2 text-[10.5px] font-medium ${
                      r.enabled
                        ? "border-[color:var(--land-gold)]/45 text-[color:var(--land-gold-soft)]"
                        : "text-muted-foreground"
                    }`}
                  >
                    {r.enabled ? "Armed" : "Paused"}
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--land-muted)]">
                  {r.summary}
                </p>
              </div>
              <Toggle
                on={r.enabled}
                label={`${r.name} automation`}
                disabled={command.pending === `recipe:${r.id}`}
                onChange={async (next) => setError(await command.setRecipe(r.id, next))}
              />
            </div>

            {/* Visual signal flow pipeline */}
            <div className="cmd-flow items-center">
              <span className="cmd-flow-trigger inline-flex flex-row items-center gap-1.5 px-3 py-1.5">
                <Zap className="size-3" />
                <span>{triggerLabel(r.trigger)}</span>
              </span>

              {r.actions.map((a, i) => {
                const def = ACTION_DEFINITIONS[a.action];
                const by = def.core
                  ? ["Command"]
                  : CONNECTOR_CATALOG.filter(
                      (m) => connected.has(m.id) && m.actions.includes(a.action),
                    ).map((m) => m.name);
                const ready = by.length > 0;
                const tip = ready
                  ? `Runs on ${by.join(", ")}`
                  : "No connected service can run this action yet";
                return (
                  <Fragment key={`${a.action}-${i}`}>
                    <span
                      aria-hidden
                      className={`cmd-flow-connector ${r.enabled && ready ? "cmd-flow-connector--live" : ""}`}
                    />
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className={`cmd-flow-step ${ready ? "" : "cmd-flow-step--idle"}`}
                          >
                            <span className="font-medium">{def.label}</span>
                            <span className="cmd-flow-by">
                              {ready ? by.join(", ") : "Connect a service"}
                            </span>
                          </span>
                        }
                      />
                      <TooltipContent side="bottom">{tip}</TooltipContent>
                    </Tooltip>
                  </Fragment>
                );
              })}

              {onConnections &&
              r.actions.some((a) => {
                const def = ACTION_DEFINITIONS[a.action];
                if (def.core) return false;
                return !CONNECTOR_CATALOG.some(
                  (m) => connected.has(m.id) && m.actions.includes(a.action),
                );
              }) ? (
                <button
                  type="button"
                  onClick={onConnections}
                  className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-[color:var(--land-gold-soft)] transition-colors hover:bg-[color:var(--land-gold)]/10"
                >
                  <span>Wire services</span>
                  <ArrowRight className="size-3" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-editorial text-[1.25rem] font-medium text-foreground">Run log</h3>
          {!state.focus && onStartQuickFocus ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onStartQuickFocus}
              className="h-8 gap-1.5 rounded-full px-3 text-[12px]"
            >
              <Play className="size-3 text-[color:var(--land-gold)]" />
              <span>Run 25m focus test</span>
            </Button>
          ) : null}
        </div>

        {state.runs.length ? (
          <ul className="mt-4 rounded-2xl border border-border bg-card px-4">
            {state.runs.map((run) => (
              <li
                key={run.id}
                className="border-b border-[color:var(--land-hair)] py-3.5 last:border-b-0"
              >
                <p className="flex items-center gap-2 text-[14px]">
                  <StatusDot
                    tone={run.status === "ok" ? "ok" : run.status === "partial" ? "warn" : "alert"}
                  />
                  <span className="font-medium text-foreground">{run.recipeName}</span>
                  <span className="truncate text-[color:var(--land-faint)]">· {run.trigger}</span>
                  <span className="ml-auto shrink-0 text-[12px] tabular-nums text-[color:var(--land-faint)]">
                    {dayLabel(run.createdAt)} {clock(run.createdAt)}
                  </span>
                </p>
                <ul className="mt-2 space-y-1 pl-4">
                  {run.steps.map((s, i) => (
                    <li
                      key={i}
                      className={`flex gap-2.5 text-[12.5px] ${
                        s.status === "ok"
                          ? "text-[color:var(--land-muted)]"
                          : s.status === "failed"
                            ? "text-[color:var(--cmd-alert)]"
                            : "text-[color:var(--land-faint)]"
                      }`}
                    >
                      <span className="w-14 shrink-0 font-mono text-[10.5px] uppercase leading-[18px] tracking-[0.06em]">
                        {s.status}
                      </span>
                      <span className="min-w-0">
                        {ACTION_DEFINITIONS[s.action].label}
                        {s.connectorId ? ` · ${getConnector(s.connectorId)?.name ?? s.connectorId}` : ""}{" "}
                        — {s.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-5 py-6">
            <div>
              <p className="text-[14px] font-medium text-foreground">No automation runs yet</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Start a focus session from the header or click below to watch Deep work execute in
                real time.
              </p>
            </div>
            {onStartQuickFocus ? (
              <Button
                type="button"
                size="sm"
                onClick={onStartQuickFocus}
                className="h-9 gap-1.5 rounded-full bg-foreground px-4 text-[12.5px] text-background hover:bg-foreground/90"
              >
                <Play className="size-3.5" />
                <span>Start 25m focus</span>
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
