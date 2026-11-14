import { FREE_ACTIVE_EXTENSION_SLOTS } from "./pro-gate";
import type { ExtensionSlot } from "./types";

/**
 * Hub sockets wired into the network. Placeholder keys name the planned
 * first-party extension shown as a ghost while a socket is empty — those
 * products are not implemented yet; any extension can occupy any socket its
 * plan allows.
 */
export const EXTENSION_SLOT_BLUEPRINT: Omit<ExtensionSlot, "occupiedBy">[] = [
  {
    id: "slot-free-1",
    label: "Free socket",
    tier: "free",
    placeholderKey: "studio",
    description: "Free socket — Studio, the creative workspace, will live here",
  },
  {
    id: "slot-free-2",
    label: "Free socket",
    tier: "free",
    placeholderKey: "study",
    description: "Free socket — Study, the learning companion, will live here",
  },
  {
    id: "slot-pro-1",
    label: "Pro socket",
    tier: "pro",
    placeholderKey: "call",
    description: "Pro socket — reserved for Call, the voice bridge",
  },
  {
    id: "slot-pro-2",
    label: "Pro socket",
    tier: "pro",
    placeholderKey: "calendar",
    description: "Pro socket — reserved for Calendar, life timing",
  },
  {
    id: "slot-pro-3",
    label: "Pro socket",
    tier: "pro",
    placeholderKey: "third-party",
    description: "Pro socket — open to third-party extensions",
  },
];

export interface PlannedExtension {
  key: string;
  name: string;
  tagline: string;
}

/** First-party extensions on the roadmap; shown as placeholders only. */
export const PLANNED_EXTENSIONS: readonly PlannedExtension[] = [
  { key: "studio", name: "Studio", tagline: "Creative workspace" },
  { key: "study", name: "Study", tagline: "Learning companion" },
  { key: "call", name: "Call", tagline: "Voice bridge" },
  { key: "calendar", name: "Calendar", tagline: "Life timing" },
];

export function placeholderName(key: string): string {
  return PLANNED_EXTENSIONS.find((p) => p.key === key)?.name ?? "Open";
}

export function createEmptySlots(): ExtensionSlot[] {
  return EXTENSION_SLOT_BLUEPRINT.map((slot) => ({ ...slot, occupiedBy: null }));
}

export function freeSlotCount(): number {
  return FREE_ACTIVE_EXTENSION_SLOTS;
}
