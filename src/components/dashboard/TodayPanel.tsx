"use client";

import { useState, useSyncExternalStore } from "react";
import type { LifeContextThread, NexusTask, TaskPriority } from "@/data/mock-tasks";

type Props = {
  tasks: NexusTask[];
  threads: LifeContextThread[];
  touched: string[];
  organized: boolean;
  onToggle: (id: string) => void;
};

const PRIORITY_LABEL: Record<TaskPriority, string> = { critical: "Critical", high: "Priority", steady: "Steady" };

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
    <section aria-labelledby="today-heading" className="flex flex-col gap-8">
      <header>
        <p className="dash-eyebrow">{date || "Today"}</p>
        <h2 id="today-heading" className="dash-heading mt-2">
          Today
        </h2>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-[color:var(--land-muted)]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${nexusIsUpdating ? "bg-[color:var(--land-gold)]" : "bg-white/25"}`} />
          {nexusIsUpdating ? "Nexus is updating your plan" : organized ? "Organized by Nexus" : "Nexus keeps this current"}
        </p>
      </header>

      {focus ? (
        <div>
          <p className="dash-eyebrow">Focus</p>
          <p className="mt-2 text-[19px] font-medium leading-snug tracking-[-0.015em]">{focus.title}</p>
          <p className="mt-1 text-[13px] text-[color:var(--land-muted)]">{focus.note}</p>
        </div>
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <p className="dash-eyebrow">Priorities</p>
          <p className="text-[12px] text-[color:var(--land-faint)]">{open.length} open</p>
        </div>
        <ul className="mt-2">
          {open.map((task) => (
            <TaskRow key={task.id} task={task} touched={touched.includes(task.id)} onToggle={onToggle} />
          ))}
        </ul>
        {done.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="text-[12px] font-medium text-[color:var(--land-faint)] hover:text-[color:var(--land-muted)]"
            >
              {showDone ? "Hide completed" : `Completed (${done.length})`}
            </button>
            {showDone ? (
              <ul className="mt-1">
                {done.map((task) => (
                  <TaskRow key={task.id} task={task} touched={touched.includes(task.id)} onToggle={onToggle} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <p className="dash-eyebrow">Ongoing context</p>
        <ul className="mt-3 space-y-3">
          {threads.map((thread) => (
            <li
              key={thread.id}
              className={`-mx-2 rounded-lg px-2 py-1 ${touched.includes(thread.id) ? "row-touched" : ""}`}
            >
              <p className="text-[12px] font-medium text-[color:var(--land-gold-soft)]">{thread.label}</p>
              <p className="text-[13.5px] leading-snug text-[color:var(--land-muted)]">{thread.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TaskRow({ task, touched, onToggle }: { task: NexusTask; touched: boolean; onToggle: (id: string) => void }) {
  const done = task.status === "done";
  return (
    <li className={`-mx-2 flex items-start gap-3 rounded-lg border-b border-[color:var(--land-hair)] px-2 py-3 last:border-b-0 ${touched ? "row-touched" : ""}`}>
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        aria-pressed={done}
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors ${
          done ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)] text-black" : "border-white/30 hover:border-[color:var(--land-gold)]"
        }`}
      >
        {done ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 5.2 4.1 7.3 8 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[14.5px] leading-snug ${done ? "text-[color:var(--land-faint)] line-through" : ""}`}>{task.title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[12px] text-[color:var(--land-faint)]">
          <PriorityMark priority={task.priority} />
          {PRIORITY_LABEL[task.priority]} · {task.note}
        </p>
      </div>
      {task.block && !done ? (
        <span className="shrink-0 pt-0.5 text-[12px] font-medium tabular-nums text-[color:var(--land-gold-soft)]">{task.block}</span>
      ) : null}
    </li>
  );
}

function PriorityMark({ priority }: { priority: TaskPriority }) {
  if (priority === "critical") return <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--land-gold)]" />;
  if (priority === "high") return <span className="h-1.5 w-1.5 rounded-full border border-[color:var(--land-gold)]" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-white/20" />;
}
