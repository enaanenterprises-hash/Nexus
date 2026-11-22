import { FREE_ACTIVE_EXTENSION_SLOTS } from "./pro-gate";
import type { ExtensionSlot } from "./types";

export const PRO_EXTENSION_SLOTS = 48;
export const TOTAL_EXTENSION_SLOTS = FREE_ACTIVE_EXTENSION_SLOTS + PRO_EXTENSION_SLOTS;

const PRO_PRESETS: ReadonlyArray<{ key: string; description: string }> = [
  { key: "call", description: "Pro socket — reserved for Call, the voice bridge" },
  { key: "calendar", description: "Pro socket — reserved for Calendar, life timing" },
  { key: "study", description: "Pro socket — reserved for Study, learning companion" },
];

/**
 * Hub sockets wired into the branching network (50 slots by default: 2 free + 48 Pro).
 * Placeholder keys name planned first-party extensions while a socket is empty; any
 * extension can occupy any socket its plan allows.
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
    placeholderKey: "cinema",
    description: "Free socket — Cinema, the video workspace, lives here alongside Studio",
  },
  ...Array.from({ length: PRO_EXTENSION_SLOTS }, (_, i) => {
    const preset = PRO_PRESETS[i];
    return {
      id: `slot-pro-${i + 1}`,
      label: "Pro socket",
      tier: "pro" as const,
      placeholderKey: preset?.key ?? "third-party",
      description: preset?.description ?? `Pro socket ${i + 1} — open to extensions on the branching bus`,
    };
  }),
];

export interface PlannedExtension {
  key: string;
  name: string;
  tagline: string;
}

/** First-party extensions on the roadmap; shown as placeholders only. */
export const PLANNED_EXTENSIONS: readonly PlannedExtension[] = [
  { key: "studio", name: "Studio", tagline: "Creative workspace" },
  { key: "cinema", name: "Cinema", tagline: "Video workspace" },
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
