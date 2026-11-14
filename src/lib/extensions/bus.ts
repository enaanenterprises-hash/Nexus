import type {
  NexusEvent,
  NexusEventHandler,
  NexusEventMap,
  NexusEventSource,
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
    updatedAt: new Date(0).toISOString(),
  };

  getSharedContext(): NexusSharedContext {
    return { ...this.sharedContext, activeTaskIds: [...this.sharedContext.activeTaskIds] };
  }

  setSharedContext(patch: Partial<NexusSharedContext>): void {
    this.sharedContext = {
      ...this.sharedContext,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.emit("nexus:context", this.getSharedContext(), "nexus");
  }

  subscribe<T extends NexusEventType>(type: T, handler: NexusEventHandler<T>): () => void;
  subscribe(type: "*", handler: NexusEventHandler): () => void;
  subscribe(type: NexusEventType | "*", handler: AnyHandler): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(type);
    };
  }

  emit<T extends NexusEventType>(
    type: T,
    payload: NexusEventMap[T],
    source: NexusEventSource = "nexus",
  ): void {
    const event = { type, payload, source, at: new Date().toISOString() } as NexusEvent;
    for (const key of [type, "*"] as const) {
      for (const handler of [...(this.listeners.get(key) ?? [])]) {
        try {
          void Promise.resolve(handler(event)).catch(reportHandlerError);
        } catch (error) {
          reportHandlerError(error);
        }
      }
    }
  }
}

function reportHandlerError(error: unknown) {
  console.error("[nexus bus] handler failed", error);
}

export const nexusBus = new ExtensionBus();
