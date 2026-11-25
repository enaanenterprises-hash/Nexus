import type { ExtensionSlot, ProEntitlement } from "./types";

/**
 * Freemium Pro gate (stub).
 * Free tier: up to FREE_ACTIVE_EXTENSION_SLOTS concurrent active extensions,
 * and only in free sockets. Nexus Pro opens every socket.
 */

export const FREE_ACTIVE_EXTENSION_SLOTS = 25;

/** Stub: replaced by billing/auth later. */
let stubIsPro = false;
const listeners = new Set<(entitlement: ProEntitlement) => void>();

export function getProEntitlement(): ProEntitlement {
  if (stubIsPro) {
    return { isPro: true, maxActiveExtensions: Number.POSITIVE_INFINITY };
  }
  return { isPro: false, maxActiveExtensions: FREE_ACTIVE_EXTENSION_SLOTS };
}

export function setStubPro(enabled: boolean): void {
  if (stubIsPro === enabled) return;
  stubIsPro = enabled;
  const entitlement = getProEntitlement();
  for (const listener of listeners) listener(entitlement);
}

export function subscribeEntitlement(listener: (entitlement: ProEntitlement) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canActivateAnother(
  currentActiveCount: number,
  entitlement = getProEntitlement(),
): boolean {
  return currentActiveCount < entitlement.maxActiveExtensions;
}

export function canUseSlot(slot: ExtensionSlot, entitlement = getProEntitlement()): boolean {
  return slot.tier === "free" || entitlement.isPro;
}

export function proRequiredMessage(activeCount: number): string {
  return `Free plan allows ${FREE_ACTIVE_EXTENSION_SLOTS} active extensions (currently ${activeCount}). Upgrade to Nexus Pro for more nodes.`;
}
