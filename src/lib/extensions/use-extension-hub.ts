"use client";

import { useSyncExternalStore } from "react";
import { extensionRegistry, type ExtensionRegistry } from "./registry";
import type { ExtensionHubSnapshot } from "./types";

/** Live hub state (sockets, catalog, plan) for React components. */
export function useExtensionHub(registry: ExtensionRegistry = extensionRegistry): ExtensionHubSnapshot {
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
}
