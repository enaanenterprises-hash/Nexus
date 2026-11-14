import type {
  ExtensionId,
  NexusEvent,
  NexusEventHandler,
  NexusEventMap,
  NexusEventType,
  NexusSharedContext,
} from "./types";

type AnyHandler = NexusEventHandler<NexusEventType>;

/**
 * In-process network bus. Future remotes (web workers, packaged extensions)
 * can proxy the same typed event surface.
 */
export class ExtensionBus {
  private listeners = new Map<NexusEventType | "*", Set<AnyHandler>>();
  private sharedContext: NexusSharedContext = {
    activeTaskIds: [],
    focusSummary: "Bootstrapping personal network",
    updatedAt: new Date().toISOString(),
  };

  getSharedContext(): NexusSharedContext {
    return { ...this.sharedContext };
  }

  setSharedContext(patch: Partial<NexusSharedContext>): void {
    this.sharedContext = {
      ...this.sharedContext,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.emit("nexus:context", this.getSharedContext(), "nexus");
  }

  subscribe<T extends NexusEventType>(
    type: T | "*",
    handler: NexusEventHandler<T>,
  ): () => void {
    const key = type;
    const set = this.listeners.get(key) ?? new Set();
    set.add(handler as AnyHandler);
    this.listeners.set(key, set);
    return () => {
      set.delete(handler as AnyHandler);
      if (set.size === 0) this.listeners.delete(key);
    };
  }

  emit<T extends NexusEventType>(
    type: T,
    payload: NexusEventMap[T],
    source: ExtensionId | "nexus" | "system" = "nexus",
  ): void {
    const event: NexusEvent<T> = {
      type,
      payload,
      source,
      at: new Date().toISOString(),
    };
    const targeted = this.listeners.get(type);
    const wildcard = this.listeners.get("*");
    for (const handler of targeted ?? []) {
      void handler(event as NexusEvent);
    }
    for (const handler of wildcard ?? []) {
      void handler(event as NexusEvent);
    }
  }
}

export const nexusBus = new ExtensionBus();
