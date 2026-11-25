import type { OpticsLookPreset } from "./types";
import { createDefaultToolParams } from "./tools-meta";

/**
 * Curated Snapseed-inspired non-destructive Looks.
 * Each Look compiles into standard editable OpticsEditLayer steps so every look
 * remains 100% tweakable, maskable, and inspectable in View Edits.
 */
export const BUILTIN_LOOKS: readonly OpticsLookPreset[] = [
  {
    id: "original",
    name: "Original",
    subtitle: "Clean unprocessed negative",
    layers: [],
  },
  {
    id: "portrait-lumen",
    name: "Portrait",
    subtitle: "Soft skin glow + face light",
    layers: [
      {
        toolId: "portrait",
        label: "Portrait",
        params: {
          ...createDefaultToolParams("portrait"),
          faceSpotlight: 22,
          skinSmoothing: 30,
          eyeClarity: 26,
        },
      },
      {
        toolId: "tune",
        label: "Tune Image",
        params: {
          ...createDefaultToolParams("tune"),
          ambiance: 14,
          shadows: 12,
          warmth: 8,
        },
      },
    ],
  },
  {
    id: "smooth-atelier",
    name: "Smooth",
    subtitle: "Creamy highlight rolloff",
    layers: [
      {
        toolId: "glamour-glow",
        label: "Glamour Glow",
        params: { preset: 2, glow: 34, saturation: 8, warmth: 12 },
      },
      {
        toolId: "curves",
        label: "Curves",
        params: {
          ...createDefaultToolParams("curves"),
          preset: "faded-matte",
          rgb: [
            { x: 0, y: 0.06 },
            { x: 0.28, y: 0.26 },
            { x: 0.76, y: 0.8 },
            { x: 1, y: 0.96 },
          ],
        },
      },
    ],
  },
  {
    id: "pop-clarity",
    name: "Pop",
    subtitle: "Crisp micro-contrast + vibrancy",
    layers: [
      {
        toolId: "tune",
        label: "Tune Image",
        params: {
          ...createDefaultToolParams("tune"),
          contrast: 18,
          saturation: 20,
          ambiance: 24,
        },
      },
      {
        toolId: "details",
        label: "Details",
        params: { structure: 30, sharpening: 28 },
      },
    ],
  },
  {
    id: "accentuate",
    name: "Accentuate",
    subtitle: "Elevated shadows + clear texture",
    layers: [
      {
        toolId: "tonal-contrast",
        label: "Tonal Contrast",
        params: {
          highTones: 22,
          midTones: 42,
          lowTones: 28,
          protectShadows: 28,
          protectHighlights: 24,
        },
      },
      {
        toolId: "vignette",
        label: "Vignette",
        params: { ...createDefaultToolParams("vignette"), outerBrightness: -26, innerBrightness: 6 },
      },
    ],
  },
  {
    id: "faded-glow",
    name: "Faded Glow",
    subtitle: "Warm golden halation + lifted blacks",
    layers: [
      {
        toolId: "glamour-glow",
        label: "Glamour Glow",
        params: { preset: 3, glow: 52, saturation: -8, warmth: 24 },
      },
      {
        toolId: "curves",
        label: "Curves",
        params: {
          ...createDefaultToolParams("curves"),
          preset: "golden",
          rgb: [
            { x: 0, y: 0.09 },
            { x: 0.3, y: 0.29 },
            { x: 0.75, y: 0.82 },
            { x: 1, y: 0.95 },
          ],
        },
      },
    ],
  },
  {
    id: "morning-mist",
    name: "Morning",
    subtitle: "Airy cool highlights + gentle warmth",
    layers: [
      {
        toolId: "tune",
        label: "Tune Image",
        params: {
          ...createDefaultToolParams("tune"),
          brightness: 14,
          contrast: -10,
          highlights: -14,
          shadows: 24,
          warmth: -8,
        },
      },
    ],
  },
  {
    id: "bright-clean",
    name: "Bright",
    subtitle: "Editorial high-key luminance",
    layers: [
      {
        toolId: "tune",
        label: "Tune Image",
        params: {
          ...createDefaultToolParams("tune"),
          brightness: 18,
          contrast: 12,
          shadows: 26,
          saturation: 6,
        },
      },
      {
        toolId: "details",
        label: "Details",
        params: { structure: 12, sharpening: 20 },
      },
    ],
  },
  {
    id: "fine-art",
    name: "Fine Art",
    subtitle: "Clean daylight balance + neutral matte",
    layers: [
      {
        toolId: "white-balance",
        label: "White Balance",
        params: { temperature: -6, tint: 4, sampledRgb: null },
      },
      {
        toolId: "tune",
        label: "Tune Image",
        params: {
          ...createDefaultToolParams("tune"),
          contrast: 14,
          saturation: -14,
          ambiance: 18,
        },
      },
      {
        toolId: "frames",
        label: "Frames",
        params: { styleId: "gallery-matte", width: 16, innerMargin: 28, roundness: 0 },
      },
    ],
  },
  {
    id: "push-analog",
    name: "Push Film",
    subtitle: "Rich silver film curve + organic grain",
    layers: [
      {
        toolId: "grainy-film",
        label: "Grainy Film",
        params: { preset: "L03", grain: 32, styleStrength: 76 },
      },
    ],
  },
  {
    id: "silhouette-bw",
    name: "Silhouette",
    subtitle: "Deep amber-filtered monochrome",
    layers: [
      {
        toolId: "black-white",
        label: "Black & White",
        params: {
          preset: "contrast",
          filterColor: "orange",
          brightness: -4,
          contrast: 36,
          grain: 18,
        },
      },
    ],
  },
  {
    id: "noir-35",
    name: "Noir 35",
    subtitle: "Low-key cinema darkroom silver",
    layers: [
      {
        toolId: "noir",
        label: "Noir",
        params: { preset: "S03", brightness: -10, wash: 20, grain: 34, filterStrength: 86 },
      },
    ],
  },
];

const CUSTOM_LOOKS_KEY = "nexus:optics-custom-looks.v1";

export function readCustomLooks(): OpticsLookPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_LOOKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OpticsLookPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomLook(look: OpticsLookPreset): OpticsLookPreset[] {
  const existing = readCustomLooks().filter((l) => l.id !== look.id);
  const next = [{ ...look, custom: true }, ...existing].slice(0, 16);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CUSTOM_LOOKS_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function deleteCustomLook(id: string): OpticsLookPreset[] {
  const next = readCustomLooks().filter((l) => l.id !== id);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CUSTOM_LOOKS_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}
