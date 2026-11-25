import { FREE_ACTIVE_EXTENSION_SLOTS } from "./pro-gate";
import type { ExtensionSlot } from "./types";

export const PRO_EXTENSION_SLOTS = 25;
export const TOTAL_EXTENSION_SLOTS = FREE_ACTIVE_EXTENSION_SLOTS + PRO_EXTENSION_SLOTS;

const FREE_PRESETS: ReadonlyArray<{ key: string; description: string }> = [
  { key: "studio", description: "Free socket — Studio, the creative audio workspace, lives here" },
  { key: "cinema", description: "Free socket — Cinema, the video workspace, lives here" },
  { key: "optics", description: "Free socket — Optics, the photo darkroom & grading studio, lives here" },
];

const PRO_PRESETS: ReadonlyArray<{ key: string; description: string }> = [
  { key: "call", description: "Pro socket — reserved for Call, the voice bridge" },
  { key: "calendar", description: "Pro socket — reserved for Calendar, life timing" },
  { key: "study", description: "Pro socket — reserved for Study, learning companion" },
];

/**
 * Hub sockets wired into the branching network (50 slots by default: 25 free + 25 Pro).
 * Placeholder keys name planned first-party extensions while a socket is empty; any
 * extension can occupy any socket its plan allows.
 */
export const EXTENSION_SLOT_BLUEPRINT: Omit<ExtensionSlot, "occupiedBy">[] = [
  ...Array.from({ length: FREE_ACTIVE_EXTENSION_SLOTS }, (_, i) => {
    const preset = FREE_PRESETS[i];
    return {
      id: `slot-free-${i + 1}`,
      label: "Free socket",
      tier: "free" as const,
      placeholderKey: preset?.key ?? "third-party",
      description: preset?.description ?? `Free socket ${i + 1} — open to extensions on the branching bus`,
    };
  }),
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
  { key: "optics", name: "Optics", tagline: "Precision lens & tonal studio" },
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
