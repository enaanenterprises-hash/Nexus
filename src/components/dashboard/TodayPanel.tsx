"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import type { LifeContextThread, NexusTask, TaskPriority } from "@/data/mock-tasks";

type Props = {
  tasks: NexusTask[];
  threads: LifeContextThread[];
  touched: string[];
  organized: boolean;
  onToggle: (id: string) => void;
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "Priority",
  steady: "Steady",
};

const noopSubscribe = () => () => {};
const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** Active tasks, priorities, and ongoing context — the space Nexus keeps current. */
export function TodayPanel({ tasks, threads, touched, organized, onToggle }: Props) {
  const date = useSyncExternalStore(noopSubscribe, todayLabel, () => "");
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((t) => t.status === "active");
  const done = tasks.filter((t) => t.status === "done");
  const focus = open.find((t) => t.priority === "critical") ?? open[0];
  const nexusIsUpdating = touched.length > 0;

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="dash-eyebrow">{date || "Today"}</p>
        <h2 id="today-heading" className="dash-heading">
          Today
        </h2>
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              nexusIsUpdating ? "bg-[color:var(--land-gold)]" : "bg-border"
            }`}
          />
          {nexusIsUpdating
            ? "Nexus is updating your plan"
            : organized
              ? "Organized by Nexus"
              : "Nexus keeps this current"}
        </p>
      </header>

      {focus ? (
        <Card size="sm" className="rounded-2xl border border-border/80 bg-card/60 ring-0 shadow-none">
          <CardHeader className="pb-0">
            <CardTitle className="font-sans text-[12px] font-medium text-muted-foreground">
              Current focus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-editorial text-[18px] font-medium leading-snug tracking-[-0.02em]">
              {focus.title}
            </p>
            <p className="text-[13px] text-muted-foreground">{focus.note}</p>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <div className="flex items-center justify-between">
          <p className="dash-eyebrow">Priorities</p>
          <Badge variant="outline" className="h-5 px-2 text-[11px] font-normal tabular-nums">
            {open.length} open
          </Badge>
        </div>

        <ul className="mt-2">
          {open.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              touched={touched.includes(task.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>

        {done.length > 0 ? (
          <Collapsible open={showDone} onOpenChange={setShowDone} className="mt-3">
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-ml-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                />
              }
            >
              <ChevronDown
                className={`size-3.5 transition-transform duration-150 ${showDone ? "rotate-180" : ""}`}
              />
              <span>{showDone ? "Hide completed" : `Completed (${done.length})`}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1">
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    touched={touched.includes(task.id)}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

      <Separator />

      <div>
        <p className="dash-eyebrow">Ongoing context</p>
        <ul className="mt-3 space-y-2.5">
          {threads.map((thread) => (
            <li
              key={thread.id}
              className={`-mx-2 rounded-xl px-2.5 py-1.5 ${
                touched.includes(thread.id) ? "row-touched" : ""
              }`}
            >
              <p className="text-[12.5px] font-medium text-foreground">{thread.label}</p>
              <p className="text-[13px] leading-snug text-muted-foreground">{thread.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TaskRow({
  task,
  touched,
  onToggle,
}: {
  task: NexusTask;
  touched: boolean;
  onToggle: (id: string) => void;
}) {
  const done = task.status === "done";
  return (
    <li
      className={`-mx-2 flex items-start gap-3 rounded-lg border-b border-border/70 px-2 py-3 last:border-b-0 ${
        touched ? "row-touched" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        aria-pressed={done}
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors ${
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:border-foreground"
        }`}
      >
        {done ? <Check className="size-3" strokeWidth={2.5} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] leading-snug ${done ? "text-muted-foreground line-through" : ""}`}>
          {task.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          <PriorityMark priority={task.priority} />
          {PRIORITY_LABEL[task.priority]} · {task.note}
        </p>
      </div>
      {task.block && !done ? (
        <span className="shrink-0 pt-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">
          {task.block}
        </span>
      ) : null}
    </li>
  );
}

function PriorityMark({ priority }: { priority: TaskPriority }) {
  if (priority === "critical") {
    return <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--land-gold)]" />;
  }
  if (priority === "high") {
    return <span className="h-1.5 w-1.5 rounded-full border border-[color:var(--land-gold)]" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-border" />;
}
