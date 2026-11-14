/**
 * Freemium Pro gate (stub).
 * Free tier: up to FREE_ACTIVE_EXTENSION_SLOTS concurrent active extensions.
 * Nexus Pro unlocks additional slots and heavier AI capabilities.
 */

export const FREE_ACTIVE_EXTENSION_SLOTS = 2;

export interface ProEntitlement {
  isPro: boolean;
  maxActiveExtensions: number;
}

/** Stub: flip to true when billing/auth is wired. */
let stubIsPro = false;

export function setStubPro(enabled: boolean): void {
  stubIsPro = enabled;
}

export function getProEntitlement(): ProEntitlement {
  if (stubIsPro) {
    return { isPro: true, maxActiveExtensions: Number.POSITIVE_INFINITY };
  }
  return {
    isPro: false,
    maxActiveExtensions: FREE_ACTIVE_EXTENSION_SLOTS,
  };
}

export function canActivateAnother(
  currentActiveCount: number,
  entitlement = getProEntitlement(),
): boolean {
  return currentActiveCount < entitlement.maxActiveExtensions;
}

export function proRequiredMessage(activeCount: number): string {
  return `Free plan allows ${FREE_ACTIVE_EXTENSION_SLOTS} active extensions (currently ${activeCount}). Upgrade to Nexus Pro for more nodes.`;
}
