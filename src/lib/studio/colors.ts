import type { StudioTrackColor } from "./types";

export interface StudioStemStyle {
  id: StudioTrackColor;
  label: string;
  darkRgb: readonly [number, number, number];
  lightRgb: readonly [number, number, number];
  dotClass: string;
  patchActiveClass: string;
}

export const STUDIO_COLOR_CYCLE: readonly StudioTrackColor[] = [
  "blue",
  "teal",
  "indigo",
  "coral",
  "slate",
];

/**
 * Apple Pro console stem palette — monochrome hardware tones plus calm recording
 * crimson without distracting neon blues, keeping Nexus Gold strictly for interconnections.
 */
export const STUDIO_STEM_COLORS: Record<StudioTrackColor, StudioStemStyle> = {
  blue: {
    id: "blue",
    label: "Crimson",
    darkRgb: [255, 69, 58],
    lightRgb: [215, 0, 21],
    dotClass: "bg-[#ff453a]",
    patchActiveClass: "border-[#ff453a] bg-[#ff453a]/16 text-foreground",
  },
  teal: {
    id: "teal",
    label: "Titanium",
    darkRgb: [212, 212, 216],
    lightRgb: [63, 63, 70],
    dotClass: "bg-[#d4d4d8]",
    patchActiveClass: "border-[#d4d4d8] bg-[#d4d4d8]/16 text-foreground",
  },
  indigo: {
    id: "indigo",
    label: "Warm Sand",
    darkRgb: [212, 163, 115],
    lightRgb: [146, 100, 52],
    dotClass: "bg-[#d4a373]",
    patchActiveClass: "border-[#d4a373] bg-[#d4a373]/16 text-foreground",
  },
  coral: {
    id: "coral",
    label: "Ember",
    darkRgb: [244, 114, 102],
    lightRgb: [194, 48, 40],
    dotClass: "bg-[#f47266]",
    patchActiveClass: "border-[#f47266] bg-[#f47266]/16 text-foreground",
  },
  slate: {
    id: "slate",
    label: "Graphite",
    darkRgb: [152, 152, 160],
    lightRgb: [82, 82, 91],
    dotClass: "bg-[#9898a0]",
    patchActiveClass: "border-[#9898a0] bg-[#9898a0]/16 text-foreground",
  },
};

export function defaultStudioColorForSlot(index: number): StudioTrackColor {
  return STUDIO_COLOR_CYCLE[Math.max(0, index) % STUDIO_COLOR_CYCLE.length]!;
}

/** Migrates any legacy saved color tags seamlessly into the current pro-audio stem palette. */
export function normalizeStudioColor(raw: string | undefined, fallbackIndex = 0): StudioTrackColor {
  if (raw === "blue" || raw === "teal" || raw === "indigo" || raw === "coral" || raw === "slate") {
    return raw;
  }
  if (raw === "gold") return "blue";
  if (raw === "sky") return "teal";
  if (raw === "emerald") return "indigo";
  return defaultStudioColorForSlot(fallbackIndex);
}
