"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ReaderDocument, ResearchSource, SearchResponse } from "@/lib/research/types";
import { ApiFailure, displayHost, researchApi } from "./research-client";

export type Entry =
  | { kind: "start" }
  | { kind: "search"; query: string }
  | { kind: "page"; url: string }
  | { kind: "source"; sourceId: string; url: string; title: string };

export type Load =
  | { status: "loading" }
  | { status: "error"; message: string; code?: string }
  | { status: "ready"; kind: "search"; data: SearchResponse }
  | { status: "ready"; kind: "page"; data: ReaderDocument }
  | { status: "ready"; kind: "source"; data: ResearchSource };

export type Tab = { id: string; history: Entry[]; index: number };

type State = { tabs: Tab[]; activeId: string; loads: Record<string, Load>; serial: number };

type Action =
  | { type: "navigate"; entry: Entry; newTab?: boolean }
  | { type: "go"; delta: -1 | 1 }
  | { type: "reload" }
  | { type: "new-tab" }
  | { type: "close-tab"; id: string }
  | { type: "select-tab"; id: string }
  | { type: "load"; key: string; load: Load }
  | { type: "patch-source"; sourceId: string; patch: Partial<ResearchSource> };

export const MAX_TABS = 8;

export function entryKey(entry: Entry): string {
  switch (entry.kind) {
    case "start":
      return "start";
    case "search":
      return `search:${entry.query}`;
    case "page":
      return `page:${entry.url}`;
    case "source":
      return `source:${entry.sourceId}`;
  }
}

export const currentEntry = (tab: Tab) => tab.history[tab.index]!;

function sameEntry(a: Entry, b: Entry) {
  return entryKey(a) === entryKey(b);
}

function referencedKeys(tabs: Tab[]) {
  return new Set(tabs.flatMap((t) => t.history.map(entryKey)));
}

function reduce(state: State, action: Action): State {
  const active = state.tabs.find((t) => t.id === state.activeId)!;
  const replaceActive = (tab: Tab) => state.tabs.map((t) => (t.id === tab.id ? tab : t));

  switch (action.type) {
    case "navigate": {
      if (action.newTab && state.tabs.length < MAX_TABS) {
        const serial = state.serial + 1;
        const tab: Tab = { id: `tab-${serial}`, history: [action.entry], index: 0 };
        const at = state.tabs.indexOf(active) + 1;
        return { ...state, serial, activeId: tab.id, tabs: [...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)] };
      }
      if (sameEntry(currentEntry(active), action.entry)) return state;
      const history = [...active.history.slice(0, active.index + 1), action.entry].slice(-50);
      return { ...state, tabs: replaceActive({ ...active, history, index: history.length - 1 }) };
    }
    case "go": {
      const index = active.index + action.delta;
      if (index < 0 || index >= active.history.length) return state;
      return { ...state, tabs: replaceActive({ ...active, index }) };
    }
    case "reload": {
      const loads = { ...state.loads };
      delete loads[entryKey(currentEntry(active))];
      return { ...state, loads };
    }
    case "new-tab": {
      if (state.tabs.length >= MAX_TABS) return state;
      const serial = state.serial + 1;
      const tab: Tab = { id: `tab-${serial}`, history: [{ kind: "start" }], index: 0 };
      return { ...state, serial, activeId: tab.id, tabs: [...state.tabs, tab] };
    }
    case "close-tab": {
      if (state.tabs.length === 1) {
        const serial = state.serial + 1;
        const tab: Tab = { id: `tab-${serial}`, history: [{ kind: "start" }], index: 0 };
        return { ...state, serial, activeId: tab.id, tabs: [tab], loads: {} };
      }
      const at = state.tabs.findIndex((t) => t.id === action.id);
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const activeId = state.activeId === action.id ? tabs[Math.max(0, at - 1)]!.id : state.activeId;
      const keep = referencedKeys(tabs);
      const loads = Object.fromEntries(Object.entries(state.loads).filter(([k]) => keep.has(k)));
      return { ...state, tabs, activeId, loads };
    }
    case "select-tab":
      return state.tabs.some((t) => t.id === action.id) ? { ...state, activeId: action.id } : state;
    case "load":
      return { ...state, loads: { ...state.loads, [action.key]: action.load } };
    case "patch-source": {
      const key = `source:${action.sourceId}`;
      const load = state.loads[key];
      if (!load || load.status !== "ready" || load.kind !== "source") return state;
      return { ...state, loads: { ...state.loads, [key]: { ...load, data: { ...load.data, ...action.patch } } } };
    }
  }
}

const INITIAL: State = { tabs: [{ id: "tab-0", history: [{ kind: "start" }], index: 0 }], activeId: "tab-0", loads: {}, serial: 0 };

export function tabTitle(tab: Tab, loads: Record<string, Load>): string {
  const entry = currentEntry(tab);
  const load = loads[entryKey(entry)];
  switch (entry.kind) {
    case "start":
      return "New tab";
    case "search":
      return entry.query;
    case "page":
      return load?.status === "ready" && load.kind === "page" ? load.data.title : displayHost(entry.url);
    case "source":
      return entry.title;
  }
}

/** Tabs, per-tab back/forward history, and a cache of loaded pages / searches. */
export function useResearchBrowser() {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const inflight = useRef(new Map<string, AbortController>());
  const active = state.tabs.find((t) => t.id === state.activeId)!;
  const entry = currentEntry(active);
  const key = entryKey(entry);
  const load = state.loads[key];

  useEffect(() => {
    if (entry.kind === "start" || load || inflight.current.has(key)) return;
    const controller = new AbortController();
    inflight.current.set(key, controller);
    dispatch({ type: "load", key, load: { status: "loading" } });

    const run = async (): Promise<Load> => {
      if (entry.kind === "search") return { status: "ready", kind: "search", data: await researchApi.search(entry.query, controller.signal) };
      if (entry.kind === "page") return { status: "ready", kind: "page", data: await researchApi.read(entry.url, controller.signal) };
      return { status: "ready", kind: "source", data: (await researchApi.source(entry.sourceId, controller.signal)).source };
    };
    run()
      .then((next) => dispatch({ type: "load", key, load: next }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = error instanceof ApiFailure ? error : null;
        dispatch({
          type: "load",
          key,
          load: { status: "error", message: failure?.message ?? "Something went wrong loading this.", code: failure?.code },
        });
      })
      .finally(() => inflight.current.delete(key));
  }, [entry, key, load]);

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    active,
    entry,
    load,
    loads: state.loads,
    canBack: active.index > 0,
    canForward: active.index < active.history.length - 1,
    navigate: useCallback((next: Entry, options?: { newTab?: boolean }) => dispatch({ type: "navigate", entry: next, newTab: options?.newTab }), []),
    back: useCallback(() => dispatch({ type: "go", delta: -1 }), []),
    forward: useCallback(() => dispatch({ type: "go", delta: 1 }), []),
    reload: useCallback(() => dispatch({ type: "reload" }), []),
    newTab: useCallback(() => dispatch({ type: "new-tab" }), []),
    closeTab: useCallback((id: string) => dispatch({ type: "close-tab", id }), []),
    selectTab: useCallback((id: string) => dispatch({ type: "select-tab", id }), []),
    patchSource: useCallback((sourceId: string, patch: Partial<ResearchSource>) => dispatch({ type: "patch-source", sourceId, patch }), []),
  };
}
