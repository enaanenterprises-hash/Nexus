"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

export function AutomationsView({ command }: { command: CommandController }) {
  const state = command.state!;
  const [error, setError] = useState<string | null>(null);
  const connected = new Set(state.connections.map((c) => c.connectorId));

  return (
    <div className="cmd-automations">
      <p className="max-w-[40rem] text-[14px] leading-relaxed text-[color:var(--land-muted)]">
        Automations are plain rules: a trigger, conditions, and actions. No AI decides anything. A
        step whose service isn’t connected is skipped and noted in the log.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-4 rounded-xl py-2.5">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="mt-8 space-y-2">
        {state.recipes.map((r) => (
          <li key={r.id} className={`cmd-recipe ${r.enabled ? "" : "cmd-recipe--off"}`}>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{r.name}</p>
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
            <div className="cmd-flow">
              <Badge variant="outline" className="cmd-flow-trigger h-auto px-2.5 py-1 font-normal">
                {triggerLabel(r.trigger)}
              </Badge>
              {r.actions.map((a, i) => {
                const def = ACTION_DEFINITIONS[a.action];
                const by = def.core
                  ? ["Command"]
                  : CONNECTOR_CATALOG.filter(
                      (m) => connected.has(m.id) && m.actions.includes(a.action),
                    ).map((m) => m.name);
                const tip = by.length
                  ? `Runs on ${by.join(", ")}`
                  : "No connected service can do this yet";
                return (
                  <Tooltip key={`${a.action}-${i}`}>
                    <TooltipTrigger
                      render={
                        <span tabIndex={0} className={`cmd-flow-step ${by.length ? "" : "cmd-flow-step--idle"}`}>
                          {def.label}
                          <span className="cmd-flow-by">
                            {by.length ? by.join(", ") : "not connected"}
                          </span>
                        </span>
                      }
                    />
                    <TooltipContent side="bottom">{tip}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <h3 className="dash-eyebrow">Run log</h3>
        {state.runs.length ? (
          <ul className="mt-3">
            {state.runs.map((run) => (
              <li key={run.id} className="border-b border-[color:var(--land-hair)] py-3 last:border-b-0">
                <p className="flex items-center gap-2 text-[14px]">
                  <StatusDot
                    tone={run.status === "ok" ? "ok" : run.status === "partial" ? "warn" : "alert"}
                  />
                  <span className="font-medium">{run.recipeName}</span>
                  <span className="truncate text-[color:var(--land-faint)]">· {run.trigger}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-[color:var(--land-faint)]">
                    {dayLabel(run.createdAt)} {clock(run.createdAt)}
                  </span>
                </p>
                <ul className="mt-2 space-y-1 pl-4">
                  {run.steps.map((s, i) => (
                    <li
                      key={i}
                      className={`flex gap-2 text-[12.5px] ${
                        s.status === "ok"
                          ? "text-[color:var(--land-muted)]"
                          : s.status === "failed"
                            ? "text-[color:var(--cmd-alert)]"
                            : "text-[color:var(--land-faint)]"
                      }`}
                    >
                      <span className="w-14 shrink-0 text-[10.5px] uppercase leading-[18px] tracking-[0.08em]">
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
          <p className="cmd-empty mt-3">
            No runs yet. Start a focus session from Today to watch Deep work run.
          </p>
        )}
      </section>
    </div>
  );
}
