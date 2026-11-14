import { FREE_ACTIVE_EXTENSION_SLOTS } from "./pro-gate";
import type { ExtensionSlot } from "./types";

/**
 * Visual Extension Hub slots. Step 1 ships placeholders only —
 * Studio / Study / Call / Calendar are not implemented yet.
 */
export const EXTENSION_SLOT_BLUEPRINT: Omit<ExtensionSlot, "occupiedBy">[] = [
  {
    id: "slot-free-1",
    label: "Free Node A",
    tier: "free",
    placeholderKey: "studio",
    description: "Reserved for Studio — creative workspace (coming soon)",
  },
  {
    id: "slot-free-2",
    label: "Free Node B",
    tier: "free",
    placeholderKey: "study",
    description: "Reserved for Study — learning companion (coming soon)",
  },
  {
    id: "slot-pro-1",
    label: "Pro Node",
    tier: "pro",
    placeholderKey: "call",
    description: "Reserved for Call — voice bridge (Pro)",
  },
  {
    id: "slot-pro-2",
    label: "Pro Node",
    tier: "pro",
    placeholderKey: "calendar",
    description: "Reserved for Calendar — life timing (Pro)",
  },
  {
    id: "slot-pro-3",
    label: "Pro Node",
    tier: "pro",
    placeholderKey: "third-party",
    description: "Open socket for third-party extensions (Pro)",
  },
];

export function createEmptySlots(): ExtensionSlot[] {
  return EXTENSION_SLOT_BLUEPRINT.map((slot) => ({
    ...slot,
    occupiedBy: null,
  }));
}

export function freeSlotCount(): number {
  return FREE_ACTIVE_EXTENSION_SLOTS;
}
