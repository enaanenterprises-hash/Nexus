"use client";

import { useState } from "react";
import {
  INITIAL_CONTEXT_THREADS,
  INITIAL_TASKS,
  type NexusTask,
  type TaskPriority,
} from "@/data/mock-tasks";
import { nexusBus } from "@/lib/extensions";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  steady: "Steady",
};

export function TaskPanel() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [threads] = useState(INITIAL_CONTEXT_THREADS);

  function toggleDone(task: NexusTask) {
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: t.status === "done" ? ("active" as const) : ("done" as const),
            }
          : t,
      );
      const activeIds = next
        .filter((t) => t.status === "active")
        .map((t) => t.id);
      nexusBus.setSharedContext({
        activeTaskIds: activeIds,
        focusSummary:
          next.find((t) => t.status === "active" && t.priority === "critical")
            ?.title ?? "No critical focus",
      });
      return next;
    });
  }

  const active = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <section
      id="organize"
      className="border-t border-[color:var(--line)] bg-[color:var(--bg-mid)]/55"
      aria-labelledby="organize-heading"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-20">
        <div>
          <p className="mb-3 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] text-[color:var(--accent)] uppercase">
            Life organization
          </p>
          <h2
            id="organize-heading"
            className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[color:var(--ink)] sm:text-4xl"
          >
            Active tasks & priorities
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[color:var(--ink-soft)]">
            What the network is holding right now. Local mock state for Step 1 —
            extensions will share this context through the bus later.
          </p>

          <ul className="mt-8 space-y-0 divide-y divide-[color:var(--line)]">
            {active.map((task) => (
              <li key={task.id} className="flex items-start gap-4 py-4">
                <button
                  type="button"
                  onClick={() => toggleDone(task)}
                  aria-label={`Mark ${task.title} done`}
                  className="mt-1 h-4 w-4 shrink-0 border border-[color:var(--line-strong)] bg-transparent transition-colors hover:border-[color:var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-[15px] text-[color:var(--ink)]">
                      {task.title}
                    </p>
                    <span
                      className={`font-[family-name:var(--font-mono)] text-[10px] tracking-[0.16em] uppercase ${
                        task.priority === "critical"
                          ? "text-[color:var(--signal)]"
                          : task.priority === "high"
                            ? "text-[color:var(--accent)]"
                            : "text-[color:var(--ink-faint)]"
                      }`}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--ink-faint)]">
                    {task.context}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {done.length > 0 ? (
            <p className="mt-4 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] text-[color:var(--ink-faint)] uppercase">
              Cleared · {done.map((t) => t.title).join(" · ")}
            </p>
          ) : null}
        </div>

        <aside>
          <p className="mb-3 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] text-[color:var(--ink-faint)] uppercase">
            Ongoing context
          </p>
          <ul className="space-y-6">
            {threads.map((thread) => (
              <li key={thread.id}>
                <p className="font-[family-name:var(--font-display)] text-lg text-[color:var(--ink)]">
                  {thread.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                  {thread.detail}
                </p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
