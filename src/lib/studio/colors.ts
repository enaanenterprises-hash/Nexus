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
 * Professional audio stem palette — tuned for calm acoustic readability in both
 * Obsidian Dark and Gallery Light modes without borrowing Nexus's Neural Network gold.
 */
export const STUDIO_STEM_COLORS: Record<StudioTrackColor, StudioStemStyle> = {
  blue: {
    id: "blue",
    label: "Cobalt",
    darkRgb: [91, 156, 246],
    lightRgb: [37, 99, 235],
    dotClass: "bg-[#5b9cf6]",
    patchActiveClass: "border-[#5b9cf6] bg-[#5b9cf6]/18 text-foreground",
  },
  teal: {
    id: "teal",
    label: "Teal",
    darkRgb: [45, 212, 191],
    lightRgb: [13, 148, 136],
    dotClass: "bg-[#2dd4bf]",
    patchActiveClass: "border-[#2dd4bf] bg-[#2dd4bf]/18 text-foreground",
  },
  indigo: {
    id: "indigo",
    label: "Indigo",
    darkRgb: [129, 140, 248],
    lightRgb: [79, 70, 229],
    dotClass: "bg-[#818cf8]",
    patchActiveClass: "border-[#818cf8] bg-[#818cf8]/18 text-foreground",
  },
  coral: {
    id: "coral",
    label: "Coral",
    darkRgb: [248, 113, 113],
    lightRgb: [220, 38, 38],
    dotClass: "bg-[#f87171]",
    patchActiveClass: "border-[#f87171] bg-[#f87171]/18 text-foreground",
  },
  slate: {
    id: "slate",
    label: "Silver",
    darkRgb: [161, 161, 170],
    lightRgb: [82, 82, 91],
    dotClass: "bg-[#a1a1aa]",
    patchActiveClass: "border-[#a1a1aa] bg-[#a1a1aa]/18 text-foreground",
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
