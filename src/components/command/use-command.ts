"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COMMAND_NODE_ID } from "@/extensions/command/node";
import { nexusBus } from "@/lib/extensions";
import { CommandRequestError, commandApi, type CommandSnapshot } from "./command-client";

const SYNC_EVERY_MS = 5 * 60_000;

/** Publishes what a Command request produced onto the Nexus network. */
function publish(snapshot: CommandSnapshot) {
  for (const item of snapshot.created) nexusBus.emit("command:item-published", { kind: item.kind, item }, COMMAND_NODE_ID);
  for (const run of snapshot.newRuns) {
    nexusBus.emit("command:automation-ran", { run }, COMMAND_NODE_ID);
    const ok = run.steps.filter((s) => s.status === "ok").length;
    nexusBus.emit("nexus:proactive", { suggestion: `${run.recipeName} ran: ${ok} of ${run.steps.length} steps done.`, at: new Date().toISOString() }, COMMAND_NODE_ID);
  }
}

export function useCommand() {
  const [state, setState] = useState<CommandSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const lastSync = useRef(0);
  const focusId = useRef<string | null | undefined>(undefined);

  const apply = useCallback((snapshot: CommandSnapshot) => {
    setState(snapshot);
    setError(null);
    publish(snapshot);
    const id = snapshot.focus?.id ?? null;
    if (focusId.current !== undefined && focusId.current !== id) nexusBus.emit("command:focus-changed", { focus: snapshot.focus }, COMMAND_NODE_ID);
    focusId.current = id;
    return snapshot;
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    lastSync.current = Date.now();
    try {
      return apply(await commandApi.sync());
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    commandApi
      .state()
      .then((s) => {
        if (!alive) return;
        setState(s);
        focusId.current = s.focus?.id ?? null;
        if (s.connections.length) void sync();
      })
      .catch((e: Error) => alive && setError(e.message));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastSync.current >= SYNC_EVERY_MS) void sync();
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [sync]);

  /** Runs a mutation, tracks it by key, and returns the error message on failure. */
  const run = useCallback(
    async (key: string, request: () => Promise<CommandSnapshot>): Promise<string | null> => {
      setPending(key);
      try {
        apply(await request());
        return null;
      } catch (e) {
        return e instanceof CommandRequestError ? e.message : "Something went wrong.";
      } finally {
        setPending(null);
      }
    },
    [apply],
  );

  const connect = useCallback(
    async (connectorId: string, input: { settings?: Record<string, string>; credentials?: Record<string, string> }) => {
      const failure = await run(`connect:${connectorId}`, () => commandApi.connect(connectorId, input));
      if (!failure) nexusBus.emit("command:connection-changed", { connectorId, connected: true }, COMMAND_NODE_ID);
      return failure;
    },
    [run],
  );

  const disconnect = useCallback(
    async (connectorId: string) => {
      const failure = await run(`disconnect:${connectorId}`, () => commandApi.disconnect(connectorId));
      if (!failure) nexusBus.emit("command:connection-changed", { connectorId, connected: false }, COMMAND_NODE_ID);
      return failure;
    },
    [run],
  );

  return {
    state,
    error,
    syncing,
    pending,
    sync,
    connect,
    disconnect,
    startFocus: (input: { title: string; minutes: number; targetItemId: string | null }) => run("focus", () => commandApi.startFocus(input)),
    endFocus: () => run("focus", () => commandApi.endFocus()),
    setRecipe: (id: string, enabled: boolean) => run(`recipe:${id}`, () => commandApi.setRecipe(id, enabled)),
    addGoal: (target: number) => run("goal", () => commandApi.addGoal("run", target)),
    sendMail: (message: Parameters<typeof commandApi.sendMail>[0]) =>
      run("mail", async () => {
        await commandApi.sendMail(message);
        return commandApi.state();
      }),
  };
}

export type CommandController = ReturnType<typeof useCommand>;
