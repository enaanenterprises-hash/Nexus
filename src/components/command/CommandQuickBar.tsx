"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  Compass,
  LayoutGrid,
  Link2,
  Play,
  RefreshCw,
  Search,
  Square,
  Workflow,
  X,
} from "lucide-react";
import { COMMAND_WIDGETS } from "@/lib/command/widgets";
import { COMMAND_BOARD_PRESETS, type CommandBoardPreset } from "@/lib/command/presets";
import type { CommandController } from "./use-command";
import type { CommandTab } from "./CommandView";

type QuickAction = {
  id: string;
  group: "Focus" | "Navigate" | "Layouts" | "Widgets" | "Actions";
  title: string;
  subtitle: string;
  keywords: string;
  icon: "focus-start" | "focus-stop" | "tab-overview" | "tab-auto" | "tab-conn" | "layout" | "widget" | "sync" | "task";
  run: () => void | Promise<void>;
};

export function CommandQuickBar({
  open,
  command,
  onClose,
  onSelectTab,
  onExpandWidget,
  onApplyPreset,
  onNotify,
}: {
  open: boolean;
  command: CommandController;
  onClose: () => void;
  onSelectTab: (tab: CommandTab) => void;
  onExpandWidget: (widgetId: string) => void;
  onApplyPreset: (preset: CommandBoardPreset) => void;
  onNotify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [taskDraft, setTaskDraft] = useState<string | null>(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const state = command.state;
  const activeFocus = state?.focus ?? null;
  const hasTasksConnector = Boolean(state?.connections.some((c) => c.connectorId === "google_tasks"));

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setQuery("");
      setActiveIndex(0);
      setTaskDraft(null);
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const actions = useMemo<QuickAction[]>(() => {
    const list: QuickAction[] = [];

    if (activeFocus) {
      list.push({
        id: "focus-end",
        group: "Focus",
        title: `End focus session (“${activeFocus.title}”)`,
        subtitle: "Stops the active countdown and runs end-of-focus automations",
        keywords: "focus stop end deep work timer",
        icon: "focus-stop",
        run: async () => {
          onClose();
          const err = await command.endFocus();
          onNotify(err ?? "Focus session ended.");
        },
      });
    } else {
      for (const mins of [25, 45, 60] as const) {
        list.push({
          id: `focus-${mins}`,
          group: "Focus",
          title: `Start ${mins}-minute Deep Work`,
          subtitle: "Begins a focus timer and triggers enabled focus automations",
          keywords: `focus start deep work timer ${mins} min pomodoro`,
          icon: "focus-start",
          run: async () => {
            onClose();
            const err = await command.startFocus({
              title: "Deep work",
              minutes: mins,
              targetItemId: null,
            });
            onNotify(err ?? `Started ${mins}-minute Deep work session.`);
          },
        });
      }
    }

    list.push({
      id: "quick-task",
      group: "Actions",
      title: hasTasksConnector ? "Capture a new Google Task" : "Connect Google Tasks to capture tasks",
      subtitle: hasTasksConnector
        ? "Create a task directly in your default Google Tasks list"
        : "Opens Connections so you can link Google Tasks",
      keywords: "task todo create add capture google",
      icon: "task",
      run: () => {
        if (!hasTasksConnector) {
          onClose();
          onSelectTab("connections");
          return;
        }
        setTaskDraft("");
      },
    });

    list.push({
      id: "sync-all",
      group: "Actions",
      title: "Sync all connected services",
      subtitle: "Fetch fresh inbox, calendar, GitHub, weather, and telemetry updates",
      keywords: "sync refresh reload update services",
      icon: "sync",
      run: async () => {
        onClose();
        await command.sync();
        onNotify("Synced connected services.");
      },
    });

    list.push(
      {
        id: "nav-storage",
        group: "Widgets",
        title: "Open Storage Vault",
        subtitle: "Browse files, video exports, podcasts & multi-platform social publishing",
        keywords: "storage files vault media social export tiktok instagram youtube",
        icon: "widget",
        run: () => {
          onClose();
          onSelectTab("overview");
          onExpandWidget("storage");
        },
      },
      {
        id: "nav-overview",
        group: "Navigate",
        title: "Go to Overview board",
        subtitle: "4×2 modular cockpit",
        keywords: "overview board widgets home",
        icon: "tab-overview",
        run: () => {
          onClose();
          onSelectTab("overview");
        },
      },
      {
        id: "nav-automations",
        group: "Navigate",
        title: "Go to Automations",
        subtitle: `${state?.recipes.filter((r) => r.enabled).length ?? 0} active deterministic rules`,
        keywords: "automations rules recipes workflows log",
        icon: "tab-auto",
        run: () => {
          onClose();
          onSelectTab("automations");
        },
      },
      {
        id: "nav-connections",
        group: "Navigate",
        title: "Go to Connections",
        subtitle: `${state?.connections.length ?? 0} live APIs & OAuth services`,
        keywords: "connections integrations oauth tokens apis",
        icon: "tab-conn",
        run: () => {
          onClose();
          onSelectTab("connections");
        },
      },
    );

    for (const preset of COMMAND_BOARD_PRESETS) {
      list.push({
        id: `preset-${preset.id}`,
        group: "Layouts",
        title: `Switch board to ${preset.name}`,
        subtitle: preset.tagline,
        keywords: `layout preset board ${preset.name} ${preset.tagline}`,
        icon: "layout",
        run: () => {
          onClose();
          onSelectTab("overview");
          onApplyPreset(preset);
        },
      });
    }

    const overviewSet = new Set(state?.overview ?? []);
    for (const widget of COMMAND_WIDGETS) {
      const onBoard = overviewSet.has(widget.id);
      list.push({
        id: `widget-${widget.id}`,
        group: "Widgets",
        title: onBoard ? `Open ${widget.name}` : `Place & open ${widget.name}`,
        subtitle: `${widget.blurb} · ${widget.w}×${widget.h}`,
        keywords: `widget ${widget.name} ${widget.blurb} ${widget.id}`,
        icon: "widget",
        run: () => {
          onClose();
          onSelectTab("overview");
          onExpandWidget(widget.id);
        },
      });
    }

    return list;
  }, [activeFocus, command, hasTasksConnector, onApplyPreset, onClose, onExpandWidget, onNotify, onSelectTab, state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        a.keywords.toLowerCase().includes(q) ||
        a.group.toLowerCase().includes(q),
    );
  }, [actions, query]);

  const safeActive = filtered.length > 0 ? Math.min(activeIndex, filtered.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (taskDraft !== null) {
          setTaskDraft(null);
          window.requestAnimationFrame(() => inputRef.current?.focus());
        } else {
          onClose();
        }
        return;
      }
      if (taskDraft !== null) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((idx) => (filtered.length ? (idx + 1) % filtered.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((idx) => (filtered.length ? (idx - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === "Enter" && filtered[safeActive]) {
        e.preventDefault();
        void filtered[safeActive]!.run();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, filtered, safeActive, onClose, taskDraft]);

  if (!open) return null;

  async function submitTask(e: React.FormEvent) {
    e.preventDefault();
    const title = taskDraft?.trim();
    if (!title || taskSubmitting) return;
    setTaskSubmitting(true);
    const err = await command.createTask({ title });
    setTaskSubmitting(false);
    setTaskDraft(null);
    onClose();
    onNotify(err ?? `Added task “${title}”.`);
  }

  return (
    <div
      className="cmd-quickbar-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command Spotlight"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmd-quickbar">
        {taskDraft !== null ? (
          <form onSubmit={submitTask} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <CheckSquare className="size-4 text-[color:var(--land-gold)]" />
                <span>Quick capture task</span>
              </div>
              <button
                type="button"
                onClick={() => setTaskDraft(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                aria-label="Back to search"
              >
                <X className="size-4" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder="What needs to happen next?"
              disabled={taskSubmitting}
              className="mt-3 h-11 w-full rounded-xl border border-border bg-background/60 px-3.5 text-[14.5px] text-foreground outline-none focus:border-[color:var(--land-gold)]"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Saves to your default Google Tasks list.</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTaskDraft(null)}
                  className="h-8 rounded-full px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!taskDraft.trim() || taskSubmitting}
                  className="h-8 rounded-full bg-foreground px-4 text-[12.5px] font-medium text-background disabled:opacity-40"
                >
                  {taskSubmitting ? "Saving…" : "Add task"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border/80 px-4 py-3.5">
              <Search className="size-4 shrink-0 text-[color:var(--land-gold)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Jump to a widget, switch layout, start focus, or capture a task…"
                className="flex-1 bg-transparent text-[14.5px] text-foreground placeholder:text-muted-foreground outline-none"
              />
              <kbd className="cmd-kbd-key">ESC</kbd>
            </div>

            <div className="max-h-[min(24rem,56svh)] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                  No matching Command actions for “{query}”.
                </p>
              ) : (
                <ul role="listbox" aria-label="Command actions" className="space-y-0.5">
                  {filtered.map((item, index) => {
                    const isActive = index === safeActive;
                    const showGroupHeader = index === 0 || filtered[index - 1]?.group !== item.group;
                    return (
                      <li key={item.id}>
                        {showGroupHeader ? (
                          <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground/80">
                            {item.group}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => void item.run()}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            isActive
                              ? "bg-foreground/9 text-foreground"
                              : "text-foreground/85 hover:bg-foreground/5"
                          }`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/50 text-[color:var(--land-gold)]">
                            <ActionIcon kind={item.icon} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium">{item.title}</span>
                            <span className="block truncate text-[12px] text-muted-foreground">
                              {item.subtitle}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-[11px] text-muted-foreground">
              <span>Use ↑↓ to move · Enter to run</span>
              <span className="tabular-nums">{filtered.length} actions</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionIcon({ kind }: { kind: QuickAction["icon"] }) {
  switch (kind) {
    case "focus-start":
      return <Play className="size-3.5" />;
    case "focus-stop":
      return <Square className="size-3" />;
    case "tab-overview":
      return <LayoutGrid className="size-3.5" />;
    case "tab-auto":
      return <Workflow className="size-3.5" />;
    case "tab-conn":
      return <Link2 className="size-3.5" />;
    case "layout":
      return <Compass className="size-3.5" />;
    case "sync":
      return <RefreshCw className="size-3.5" />;
    case "task":
      return <CheckSquare className="size-3.5" />;
    default:
      return <LayoutGrid className="size-3.5" />;
  }
}
