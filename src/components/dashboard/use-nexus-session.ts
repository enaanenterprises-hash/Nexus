"use client";

import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from "react";
import {
  INITIAL_CONTEXT_THREADS,
  INITIAL_TASKS,
  type LifeContextThread,
  type NexusTask,
} from "@/data/mock-tasks";
import { extensionRegistry, nexusBus, type NexusBrainState } from "@/lib/extensions";
import {
  DEFAULT_FOLLOW_UPS,
  openingLine,
  organizeTasks,
  think,
  type BrainAction,
} from "@/lib/nexus/brain";

export type Utterance = {
  id: number;
  /** What you said, when this is a reply. */
  prompt: string | null;
  text: string;
  kind: "reply" | "proactive";
  source: string;
};

type Session = {
  brain: NexusBrainState;
  current: Utterance | null;
  pendingPrompt: string | null;
  revealed: number;
  history: Utterance[];
  followUps: string[];
  tasks: NexusTask[];
  threads: LifeContextThread[];
  /** Ids of tasks / threads Nexus changed most recently, for a brief highlight. */
  touched: string[];
  organized: boolean;
  serial: number;
};

type Action =
  | { type: "ask"; prompt: string }
  | { type: "speak"; text: string; prompt: string | null; kind: Utterance["kind"]; source: string; followUps?: string[] }
  | { type: "reveal"; all?: boolean }
  | { type: "apply"; actions: BrainAction[] }
  | { type: "toggle-task"; id: string }
  | { type: "settle" };

const NUDGES: Array<(s: Session) => string | null> = [
  (s) => {
    const t = s.tasks.find((x) => x.status === "active" && x.priority === "high" && !x.block);
    return t ? `“${t.title}” doesn't have a slot yet. Want me to fit it in before lunch?` : null;
  },
  (s) => (s.organized ? null : "Your afternoon is still unplanned. I can organize the day in one pass."),
  () => "Two sockets on your network are free. Snap in an extension and I'll route context to it.",
];

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

function reduce(state: Session, action: Action): Session {
  switch (action.type) {
    case "ask":
      return {
        ...state,
        brain: "thinking",
        pendingPrompt: action.prompt,
        history: state.current ? [state.current, ...state.history].slice(0, 12) : state.history,
        current: null,
      };
    case "speak": {
      const serial = state.serial + 1;
      const utterance: Utterance = {
        id: serial,
        prompt: action.prompt,
        text: action.text,
        kind: action.kind,
        source: action.source,
      };
      return {
        ...state,
        serial,
        brain: "responding",
        pendingPrompt: null,
        current: utterance,
        history: state.current ? [state.current, ...state.history].slice(0, 12) : state.history,
        revealed: 0,
        followUps: action.followUps ?? state.followUps,
      };
    }
    case "reveal": {
      if (!state.current) return state;
      const total = words(state.current.text);
      const revealed = action.all ? total : state.revealed + 1;
      return { ...state, revealed, brain: revealed >= total ? "idle" : state.brain };
    }
    case "apply": {
      let { tasks, threads, organized } = state;
      const touched: string[] = [];
      for (const a of action.actions) {
        if (a.type === "organize") {
          tasks = organizeTasks(tasks);
          organized = true;
          touched.push(...tasks.filter((t) => t.status === "active").map((t) => t.id));
        } else if (a.type === "add-task") {
          const id = `t-${state.serial}-${tasks.length + 1}`;
          tasks = [{ id, title: a.title, priority: a.priority, status: "active", note: "Added by you, via Nexus" }, ...tasks];
          if (organized) tasks = organizeTasks(tasks);
          touched.push(id);
        } else if (a.type === "complete-task") {
          tasks = tasks.map((t) => (t.id === a.id ? { ...t, status: "done", block: undefined } : t));
          touched.push(a.id);
        } else {
          const id = `c-${state.serial}-${threads.length + 1}`;
          threads = [{ id, label: a.label, detail: a.detail }, ...threads].slice(0, 6);
          touched.push(id);
        }
      }
      return { ...state, tasks, threads, organized, touched };
    }
    case "toggle-task":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, status: t.status === "done" ? "active" : "done" } : t,
        ),
      };
    case "settle":
      return { ...state, touched: [] };
  }
}

const INITIAL: Session = {
  brain: "idle",
  current: null,
  pendingPrompt: null,
  revealed: 0,
  history: [],
  followUps: DEFAULT_FOLLOW_UPS,
  tasks: INITIAL_TASKS,
  threads: INITIAL_CONTEXT_THREADS,
  touched: [],
  organized: false,
  serial: 0,
};

/** Conversation, brain state, and the task space Nexus keeps current. */
export function useNexusSession() {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const stateRef = useRef(state);
  const proactiveQueue = useRef<Array<{ text: string; source: string }>>([]);
  const lastInteraction = useRef(0);
  const nudgeIndex = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    nexusBus.emit("nexus:state", { state: state.brain });
  }, [state.brain]);

  useEffect(() => {
    const open = state.tasks.filter((t) => t.status === "active");
    nexusBus.setSharedContext({
      activeTaskIds: open.map((t) => t.id),
      focusSummary: (open.find((t) => t.priority === "critical") ?? open[0])?.title ?? "Nothing pressing",
    });
  }, [state.tasks]);

  useEffect(() => {
    if (state.brain !== "responding") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dispatch({ type: "reveal", all: true });
      return;
    }
    const id = window.setInterval(() => dispatch({ type: "reveal" }), 55);
    return () => window.clearInterval(id);
  }, [state.brain, state.current?.id]);

  useEffect(() => {
    if (state.touched.length === 0) return;
    const id = window.setTimeout(() => dispatch({ type: "settle" }), 2600);
    return () => window.clearTimeout(id);
  }, [state.touched]);

  const speak = useCallback((text: string, source: string, kind: Utterance["kind"], prompt: string | null, followUps?: string[]) => {
    dispatch({ type: "speak", text, source, kind, prompt, followUps });
    nexusBus.emit("nexus:message", { role: "nexus", text, at: new Date().toISOString() });
  }, []);

  const flushProactive = useEffectEvent(() => {
    if (stateRef.current.brain !== "idle") return;
    const next = proactiveQueue.current.shift();
    if (next) speak(next.text, next.source, "proactive", null);
  });

  useEffect(() => {
    if (state.brain === "idle") {
      const id = window.setTimeout(flushProactive, 3200);
      return () => window.clearTimeout(id);
    }
  }, [state.brain]);

  const onNudgeTick = useEffectEvent(() => {
    const s = stateRef.current;
    if (s.brain !== "idle" || performance.now() - lastInteraction.current < 30000) return;
    for (let i = 0; i < NUDGES.length; i++) {
      const line = NUDGES[(nudgeIndex.current + i) % NUDGES.length]!(s);
      if (line) {
        nudgeIndex.current += i + 1;
        lastInteraction.current = performance.now();
        speak(line, "nexus", "proactive", null, DEFAULT_FOLLOW_UPS);
        nexusBus.emit("nexus:proactive", { suggestion: line, at: new Date().toISOString() });
        return;
      }
    }
  });

  useEffect(() => {
    nexusBus.emit("nexus:ready", { version: "0.2.0" });
    lastInteraction.current = performance.now();
    const opening = window.setTimeout(() => {
      speak(openingLine(new Date().getHours(), stateRef.current.tasks), "nexus", "proactive", null, DEFAULT_FOLLOW_UPS);
    }, 1400);
    const nudges = window.setInterval(onNudgeTick, 5000);
    const off = nexusBus.subscribe("nexus:proactive", (event) => {
      if (event.source === "nexus") return;
      const name = extensionRegistry.get(event.source)?.manifest.name ?? "Nexus";
      proactiveQueue.current.push({ text: event.payload.suggestion, source: name });
      flushProactive();
    });
    return () => {
      window.clearTimeout(opening);
      window.clearInterval(nudges);
      off();
    };
  }, [speak]);

  const ask = useCallback(
    (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || stateRef.current.brain === "thinking") return;
      lastInteraction.current = performance.now();
      dispatch({ type: "ask", prompt });
      nexusBus.emit("nexus:message", { role: "user", text: prompt, at: new Date().toISOString() });
      window.setTimeout(() => {
        const s = stateRef.current;
        const activeExtensions = extensionRegistry
          .listActive()
          .map((id) => extensionRegistry.get(id)?.manifest.name ?? id);
        const reply = think(prompt, { tasks: s.tasks, threads: s.threads, activeExtensions });
        if (reply.actions.length) dispatch({ type: "apply", actions: reply.actions });
        speak(reply.text, "nexus", "reply", prompt, reply.followUps);
      }, 900 + Math.random() * 500);
    },
    [speak],
  );

  const toggleTask = useCallback((id: string) => {
    lastInteraction.current = performance.now();
    dispatch({ type: "toggle-task", id });
  }, []);

  const announce = useCallback(
    (text: string) => {
      lastInteraction.current = performance.now();
      if (stateRef.current.brain === "idle") speak(text, "nexus", "proactive", null);
      else proactiveQueue.current.push({ text, source: "nexus" });
    },
    [speak],
  );

  return { ...state, ask, toggleTask, announce };
}
