import type { CinemaAspectRatio, CinemaBackground, CinemaFilter, CinemaFilterPresetId, CinemaProject, CinemaShapeKind, CinemaTrack, CinemaTransform, CinemaTransitionType, CinemaVisualizerStyle } from "./types";

export const ASPECT_RATIO_PRESETS: Record<
  CinemaAspectRatio,
  { id: CinemaAspectRatio; label: string; width: number; height: number; hint: string }
> = {
  "16:9": { id: "16:9", label: "16:9 Widescreen", width: 1920, height: 1080, hint: "YouTube & Cinema" },
  "9:16": { id: "9:16", label: "9:16 Vertical", width: 1080, height: 1920, hint: "Shorts & Reels" },
  "1:1": { id: "1:1", label: "1:1 Square", width: 1080, height: 1080, hint: "Social & Feed" },
  "4:5": { id: "4:5", label: "4:5 Portrait", width: 1080, height: 1350, hint: "Editorial Portrait" },
  "21:9": { id: "21:9", label: "21:9 Anamorphic", width: 2560, height: 1080, hint: "Ultrawide Master" },
};

export function resolutionForAspectRatio(
  aspectRatio: CinemaAspectRatio,
  tier: "1080p" | "720p",
): { width: number; height: number } {
  const base = ASPECT_RATIO_PRESETS[aspectRatio] ?? ASPECT_RATIO_PRESETS["16:9"];
  if (tier === "1080p") return { width: base.width & ~1, height: base.height & ~1 };
  const scale = 720 / Math.min(base.width, base.height);
  return {
    width: Math.max(320, Math.round(base.width * scale) & ~1),
    height: Math.max(320, Math.round(base.height * scale) & ~1),
  };
}

export const DEFAULT_TRANSFORM: CinemaTransform = {
  x: 50,
  y: 50,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  borderRadius: 0,
  shadow: false,
  blendMode: "source-over",
  flipH: false,
  flipV: false,
};

export const DEFAULT_FILTER: CinemaFilter = {
  preset: "natural",
  brightness: 1,
  contrast: 1,
  saturate: 1,
  temperature: 0,
  blur: 0,
  vignette: 0,
};

export const FILTER_PRESETS: Array<{
  id: CinemaFilterPresetId;
  name: string;
  swatch: [string, string];
  values: Omit<CinemaFilter, "preset">;
}> = [
  { id: "natural", name: "Natural", swatch: ["#3f3f46", "#d4d4d8"], values: { brightness: 1, contrast: 1, saturate: 1, temperature: 0, blur: 0, vignette: 0 } },
  { id: "obsidian-matte", name: "Obsidian Matte", swatch: ["#111216", "#64748b"], values: { brightness: 0.96, contrast: 1.12, saturate: 0.88, temperature: -0.1, blur: 0, vignette: 0.34 } },
  { id: "silver-halide", name: "Silver Halide", swatch: ["#18181b", "#e4e4e7"], values: { brightness: 1.03, contrast: 1.24, saturate: 0.05, temperature: 0, blur: 0, vignette: 0.25 } },
  { id: "warm-35mm", name: "Warm 35mm", swatch: ["#573b26", "#e7b98a"], values: { brightness: 1.02, contrast: 1.08, saturate: 1.12, temperature: 0.35, blur: 0, vignette: 0.2 } },
  { id: "cool-editorial", name: "Cool Editorial", swatch: ["#0f172a", "#7dd3fc"], values: { brightness: 1.0, contrast: 1.1, saturate: 0.92, temperature: -0.35, blur: 0, vignette: 0.14 } },
  { id: "vivid", name: "Vivid", swatch: ["#0c4a6e", "#38bdf8"], values: { brightness: 1.04, contrast: 1.14, saturate: 1.38, temperature: 0.08, blur: 0, vignette: 0.08 } },
  { id: "faded-film", name: "Faded Film", swatch: ["#3b3a36", "#b8b4a8"], values: { brightness: 1.06, contrast: 0.86, saturate: 0.82, temperature: 0.16, blur: 0, vignette: 0.12 } },
  { id: "noir", name: "Noir", swatch: ["#050507", "#71717a"], values: { brightness: 0.92, contrast: 1.42, saturate: 0, temperature: -0.1, blur: 0, vignette: 0.45 } },
];

export interface TextStylePreset {
  id: string;
  name: string;
  previewText: string;
  fontFamily:
    | "Manrope, -apple-system, 'SF Pro Display', sans-serif"
    | "'Source Serif 4', 'New York', Georgia, serif"
    | "'Cormorant Garamond', Georgia, serif"
    | "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";
  fontSize: number;
  fontWeight: 300 | 400 | 500 | 600 | 700;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  color: string;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundRadius: number;
  width: number;
  height: number;
  y: number;
}

export const TEXT_PRESETS: TextStylePreset[] = [
  {
    id: "editorial-title",
    name: "Editorial Title",
    previewText: "Design in motion",
    fontFamily: "'Source Serif 4', 'New York', Georgia, serif",
    fontSize: 82,
    fontWeight: 400,
    letterSpacing: -0.03,
    lineHeight: 1.08,
    align: "center",
    color: "#f5f5f7",
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    width: 78,
    height: 24,
    y: 48,
  },
  {
    id: "ceremonial-serif",
    name: "Ceremonial Serif",
    previewText: "Chapter One",
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 92,
    fontWeight: 400,
    letterSpacing: -0.02,
    lineHeight: 1.05,
    align: "center",
    color: "#ffffff",
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    width: 72,
    height: 24,
    y: 48,
  },
  {
    id: "swiss-subhead",
    name: "Swiss Subhead",
    previewText: "Precision workspace",
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
    fontSize: 46,
    fontWeight: 300,
    letterSpacing: -0.025,
    lineHeight: 1.2,
    align: "center",
    color: "#e4e4e7",
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    width: 68,
    height: 16,
    y: 60,
  },
  {
    id: "lower-third",
    name: "Lower Third",
    previewText: "Nexus Creative Suite · 2026",
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
    fontSize: 30,
    fontWeight: 500,
    letterSpacing: -0.01,
    lineHeight: 1.25,
    align: "left",
    color: "#f5f5f7",
    backgroundColor: "rgba(15, 15, 19, 0.84)",
    backgroundPadding: 20,
    backgroundRadius: 12,
    width: 48,
    height: 12,
    y: 84,
  },
  {
    id: "kinetic-caption",
    name: "Kinetic Caption",
    previewText: "One environment for your craft.",
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
    fontSize: 40,
    fontWeight: 600,
    letterSpacing: -0.015,
    lineHeight: 1.24,
    align: "center",
    color: "#09090b",
    backgroundColor: "#f5f5f7",
    backgroundPadding: 18,
    backgroundRadius: 14,
    width: 66,
    height: 14,
    y: 82,
  },
  {
    id: "pull-quote",
    name: "Pull Quote",
    previewText: "“Simplicity carried to the extreme becomes elegance.”",
    fontFamily: "'Source Serif 4', 'New York', Georgia, serif",
    fontSize: 44,
    fontWeight: 400,
    letterSpacing: -0.02,
    lineHeight: 1.3,
    align: "center",
    color: "#f5f5f7",
    backgroundColor: "transparent",
    backgroundPadding: 0,
    backgroundRadius: 0,
    width: 74,
    height: 28,
    y: 50,
  },
  {
    id: "timecode-stamp",
    name: "Timecode Stamp",
    previewText: "REC · 48 KHZ · 01",
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
    fontSize: 24,
    fontWeight: 500,
    letterSpacing: 0.04,
    lineHeight: 1.3,
    align: "center",
    color: "#d4d4d8",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    backgroundPadding: 14,
    backgroundRadius: 999,
    width: 34,
    height: 10,
    y: 16,
  },
  {
    id: "pill-tag",
    name: "Monochrome Badge",
    previewText: "Episode 04 · Live Mix",
    fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
    fontSize: 26,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: "center",
    color: "#f5f5f7",
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    backgroundPadding: 16,
    backgroundRadius: 999,
    width: 36,
    height: 10,
    y: 22,
  },
];

export const ELEMENT_PRESETS: Array<{
  id: string;
  name: string;
  category: "shape" | "frame" | "visualizer";
  shapeKind?: CinemaShapeKind;
  visualizerStyle?: CinemaVisualizerStyle;
  fill: string;
  stroke: string;
  width: number;
  height: number;
}> = [
  { id: "rect", name: "Obsidian Card", category: "shape", shapeKind: "rect", fill: "rgba(22, 22, 27, 0.88)", stroke: "rgba(255, 255, 255, 0.18)", width: 42, height: 32 },
  { id: "circle", name: "Orbital Ring", category: "shape", shapeKind: "circle", fill: "rgba(255, 255, 255, 0.06)", stroke: "rgba(255, 255, 255, 0.35)", width: 24, height: 24 },
  { id: "pill", name: "Glass Pill", category: "shape", shapeKind: "pill", fill: "rgba(255, 255, 255, 0.12)", stroke: "rgba(255, 255, 255, 0.25)", width: 32, height: 10 },
  { id: "line", name: "Hairline Rule", category: "shape", shapeKind: "line", fill: "transparent", stroke: "rgba(255, 255, 255, 0.45)", width: 54, height: 4 },
  { id: "arrow", name: "Pointer Arrow", category: "shape", shapeKind: "arrow", fill: "transparent", stroke: "#38bdf8", width: 24, height: 10 },
  { id: "callout", name: "Callout Frame", category: "shape", shapeKind: "callout", fill: "rgba(18, 19, 24, 0.9)", stroke: "#38bdf8", width: 34, height: 18 },
  { id: "device-desktop", name: "Display Frame", category: "frame", shapeKind: "device-desktop", fill: "rgba(12, 12, 16, 0.9)", stroke: "rgba(255, 255, 255, 0.24)", width: 72, height: 64 },
  { id: "device-phone", name: "Phone Frame", category: "frame", shapeKind: "device-phone", fill: "rgba(12, 12, 16, 0.9)", stroke: "rgba(255, 255, 255, 0.24)", width: 28, height: 76 },
  { id: "progress-bar", name: "Progress Bar", category: "frame", shapeKind: "progress-bar", fill: "#38bdf8", stroke: "rgba(255, 255, 255, 0.16)", width: 76, height: 4 },
  { id: "viz-bars", name: "Studio Bars", category: "visualizer", visualizerStyle: "bars", fill: "#5b9cf6", stroke: "#e4e4e7", width: 64, height: 22 },
  { id: "viz-mirror", name: "Mirror Wave", category: "visualizer", visualizerStyle: "mirror-wave", fill: "#f5f5f7", stroke: "#5b9cf6", width: 72, height: 26 },
  { id: "viz-horizon", name: "Horizon Line", category: "visualizer", visualizerStyle: "horizon-line", fill: "#38bdf8", stroke: "#ffffff", width: 78, height: 20 },
  { id: "viz-ring", name: "Radial Pulse", category: "visualizer", visualizerStyle: "ring", fill: "#5b9cf6", stroke: "#f5f5f7", width: 34, height: 34 },
];

export const TRANSITION_PRESETS: Array<{
  type: CinemaTransitionType;
  label: string;
  defaultMs: number;
}> = [
  { type: "cut", label: "Cut (Hard)", defaultMs: 0 },
  { type: "dissolve", label: "Cross Dissolve", defaultMs: 600 },
  { type: "dip-black", label: "Dip to Obsidian", defaultMs: 700 },
  { type: "dip-white", label: "Dip to Gallery Light", defaultMs: 650 },
  { type: "slide-left", label: "Push Left", defaultMs: 550 },
  { type: "slide-right", label: "Push Right", defaultMs: 550 },
  { type: "wipe", label: "Architectural Wipe", defaultMs: 600 },
  { type: "zoom", label: "Smooth Zoom", defaultMs: 550 },
];

export const BACKDROP_PRESETS: Array<{
  id: string;
  name: string;
  background: CinemaBackground;
}> = [
  { id: "obsidian", name: "Obsidian Deep", background: { type: "solid", colorA: "#0a0a0c", colorB: "#131317", angleDeg: 135, grain: 0.02 } },
  { id: "pitch", name: "Pure Pitch", background: { type: "solid", colorA: "#000000", colorB: "#000000", angleDeg: 135, grain: 0 } },
  { id: "gallery-paper", name: "Gallery Paper", background: { type: "solid", colorA: "#f7f6f2", colorB: "#eceae5", angleDeg: 135, grain: 0.015 } },
  { id: "graphite", name: "Graphite Sweep", background: { type: "linear", colorA: "#0c0d11", colorB: "#1c1e26", angleDeg: 145, grain: 0.03 } },
  { id: "slate-halo", name: "Slate Vignette", background: { type: "radial", colorA: "#1c2029", colorB: "#07080a", angleDeg: 0, grain: 0.025 } },
  { id: "abyss-teal", name: "Nocturne Teal", background: { type: "radial", colorA: "#0f222d", colorB: "#07090d", angleDeg: 0, grain: 0.025 } },
  { id: "warm-slate", name: "Warm Slate", background: { type: "linear", colorA: "#1a1816", colorB: "#0b0a09", angleDeg: 160, grain: 0.035 } },
  { id: "technical-grid", name: "Studio Grid", background: { type: "grid", colorA: "#0b0c10", colorB: "rgba(255,255,255,0.055)", angleDeg: 0, grain: 0.015 } },
];

export interface CinemaTemplateMeta {
  id: string;
  name: string;
  subtitle: string;
  defaultAspect: CinemaAspectRatio;
  accentSwatch: string;
}

export const CINEMA_TEMPLATES: CinemaTemplateMeta[] = [
  { id: "blank", name: "Blank Canvas", subtitle: "Clean video, overlay, text & Studio audio tracks", defaultAspect: "16:9", accentSwatch: "#27272a" },
  { id: "podcast-audiogram", name: "Podcast Audiogram", subtitle: "Live Studio waveform visualizer + synced progress bar", defaultAspect: "16:9", accentSwatch: "#5b9cf6" },
  { id: "product-reel", name: "Product Launch Reel", subtitle: "Device showcase frame + staggered architectural headlines", defaultAspect: "16:9", accentSwatch: "#38bdf8" },
  { id: "vertical-short", name: "Vertical Short (9:16)", subtitle: "Bold kinetic captions framed for mobile reels", defaultAspect: "9:16", accentSwatch: "#ef4444" },
  { id: "editorial-title", name: "Editorial Essay", subtitle: "Gallery serif typography + warm film plate aesthetic", defaultAspect: "16:9", accentSwatch: "#d4d4d8" },
  { id: "quote-sequence", name: "Minimal Quote Loop", subtitle: "Calm gallery-paper typography & rule composition", defaultAspect: "1:1", accentSwatch: "#f7f6f2" },
];

export function defaultTracks(): CinemaTrack[] {
  return [
    { id: "trk-text-1", name: "Text & Titles", kind: "text", muted: false, hidden: false, locked: false, volume: 1 },
    { id: "trk-overlay-1", name: "Overlay & FX", kind: "overlay", muted: false, hidden: false, locked: false, volume: 1 },
    { id: "trk-video-1", name: "Main Video", kind: "video", muted: false, hidden: false, locked: false, volume: 1 },
    { id: "trk-audio-1", name: "Studio Audio", kind: "audio", muted: false, hidden: false, locked: false, volume: 1 },
  ];
}

export function buildTemplateProject(
  templateId: string,
  collectionId: string,
  overrideAspect?: CinemaAspectRatio,
): CinemaProject {
  const now = new Date().toISOString();
  const meta = CINEMA_TEMPLATES.find((t) => t.id === templateId) ?? CINEMA_TEMPLATES[0]!;
  const aspectRatio = overrideAspect ?? meta.defaultAspect;
  const dims = ASPECT_RATIO_PRESETS[aspectRatio];
  const tracks = defaultTracks();
  const id = `cin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const base: CinemaProject = {
    id,
    collectionId,
    title: meta.id === "blank" ? "Untitled edit" : meta.name,
    description: meta.subtitle,
    aspectRatio,
    fps: 30,
    width: dims.width,
    height: dims.height,
    durationMs: 8000,
    clipCount: 0,
    trackCount: tracks.length,
    markerCount: 0,
    thumbnailUrl: null,
    hasLinkedStudioAudio: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
    background: BACKDROP_PRESETS[0]!.background,
    tracks,
    clips: [],
    transitions: [],
    assets: [],
    markers: [],
    notes: null,
  };

  if (templateId === "podcast-audiogram") {
    base.background = BACKDROP_PRESETS[4]!.background;
    base.durationMs = 12_000;
    base.clips = [
      {
        id: `${id}-tag`,
        trackId: "trk-text-1",
        name: "Episode Badge",
        kind: "text",
        startMs: 0,
        durationMs: 12_000,
        trimStartMs: 0,
        sourceDurationMs: 12_000,
        speed: 1,
        locked: false,
        hidden: false,
        text: "NEXUS RECORDING STUDIO · MASTER MIX",
        fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: 0.04,
        lineHeight: 1.2,
        align: "center",
        color: "#5b9cf6",
        backgroundColor: "rgba(91, 156, 246, 0.14)",
        backgroundPadding: 14,
        backgroundRadius: 999,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "pill-tag",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 21, width: 44, height: 8 },
        animation: { inType: "fade", inDurationMs: 350, outType: "fade", outDurationMs: 300 },
      },
      {
        id: `${id}-title`,
        trackId: "trk-text-1",
        name: "Episode Headline",
        kind: "text",
        startMs: 150,
        durationMs: 11_850,
        trimStartMs: 0,
        sourceDurationMs: 11_850,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Conversation & Notes",
        fontFamily: "'Source Serif 4', 'New York', Georgia, serif",
        fontSize: 78,
        fontWeight: 400,
        letterSpacing: -0.03,
        lineHeight: 1.08,
        align: "center",
        color: "#f5f5f7",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "editorial-title",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 38, width: 78, height: 18 },
        animation: { inType: "rise", inDurationMs: 450, outType: "fade", outDurationMs: 350 },
      },
      {
        id: `${id}-viz`,
        trackId: "trk-overlay-1",
        name: "Mirror Waveform",
        kind: "visualizer",
        startMs: 0,
        durationMs: 12_000,
        trimStartMs: 0,
        sourceDurationMs: 12_000,
        speed: 1,
        locked: false,
        hidden: false,
        style: "mirror-wave",
        barCount: 48,
        color: "#5b9cf6",
        secondaryColor: "#e4e4e7",
        sensitivity: 1.25,
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 66, width: 72, height: 22 },
        animation: { inType: "fade", inDurationMs: 400, outType: "fade", outDurationMs: 400 },
      },
      {
        id: `${id}-prog`,
        trackId: "trk-overlay-1",
        name: "Timeline Progress",
        kind: "shape",
        startMs: 0,
        durationMs: 12_000,
        trimStartMs: 0,
        sourceDurationMs: 12_000,
        speed: 1,
        locked: false,
        hidden: false,
        shapeKind: "progress-bar",
        fill: "#5b9cf6",
        stroke: "rgba(255, 255, 255, 0.14)",
        strokeWidth: 1,
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 88, width: 72, height: 2 },
        animation: { inType: "none", inDurationMs: 0, outType: "none", outDurationMs: 0 },
      },
    ];
    base.markers = [{ id: `${id}-m1`, atMs: 4000, label: "Key Insight", kind: "chapter", note: null }];
  } else if (templateId === "product-reel") {
    base.background = BACKDROP_PRESETS[7]!.background;
    base.durationMs = 10_000;
    base.clips = [
      {
        id: `${id}-device`,
        trackId: "trk-overlay-1",
        name: "Display Stage",
        kind: "shape",
        startMs: 0,
        durationMs: 10_000,
        trimStartMs: 0,
        sourceDurationMs: 10_000,
        speed: 1,
        locked: false,
        hidden: false,
        shapeKind: "device-desktop",
        fill: "rgba(18, 19, 25, 0.92)",
        stroke: "rgba(255, 255, 255, 0.24)",
        strokeWidth: 2,
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 55, width: 68, height: 62, shadow: true },
        animation: { inType: "zoom-in", inDurationMs: 550, outType: "fade", outDurationMs: 350 },
      },
      {
        id: `${id}-h1`,
        trackId: "trk-text-1",
        name: "Headline 1",
        kind: "text",
        startMs: 200,
        durationMs: 4600,
        trimStartMs: 0,
        sourceDurationMs: 4600,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Crafted for speed.",
        fontFamily: "'Source Serif 4', 'New York', Georgia, serif",
        fontSize: 72,
        fontWeight: 400,
        letterSpacing: -0.03,
        lineHeight: 1.08,
        align: "center",
        color: "#f5f5f7",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "editorial-title",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 52, width: 60, height: 18 },
        animation: { inType: "rise", inDurationMs: 400, outType: "fade", outDurationMs: 300 },
      },
      {
        id: `${id}-h2`,
        trackId: "trk-text-1",
        name: "Headline 2",
        kind: "text",
        startMs: 4800,
        durationMs: 5200,
        trimStartMs: 0,
        sourceDurationMs: 5200,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Studio audio, frame exact.",
        fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
        fontSize: 52,
        fontWeight: 400,
        letterSpacing: -0.025,
        lineHeight: 1.18,
        align: "center",
        color: "#38bdf8",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "swiss-subhead",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 52, width: 62, height: 16 },
        animation: { inType: "rise", inDurationMs: 400, outType: "fade", outDurationMs: 350 },
      },
    ];
  } else if (templateId === "vertical-short") {
    base.background = BACKDROP_PRESETS[5]!.background;
    base.durationMs = 9000;
    base.clips = [
      {
        id: `${id}-hook`,
        trackId: "trk-text-1",
        name: "Hook Caption",
        kind: "text",
        startMs: 0,
        durationMs: 4200,
        trimStartMs: 0,
        sourceDurationMs: 4200,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Why creators unify audio & video",
        fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
        fontSize: 56,
        fontWeight: 600,
        letterSpacing: -0.02,
        lineHeight: 1.2,
        align: "center",
        color: "#09090b",
        backgroundColor: "#f5f5f7",
        backgroundPadding: 24,
        backgroundRadius: 18,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "kinetic-caption",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 46, width: 84, height: 22, shadow: true },
        animation: { inType: "pop", inDurationMs: 320, outType: "fade", outDurationMs: 250 },
      },
      {
        id: `${id}-sub`,
        trackId: "trk-text-1",
        name: "Follow-up",
        kind: "text",
        startMs: 4200,
        durationMs: 4800,
        trimStartMs: 0,
        sourceDurationMs: 4800,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Record once. Edit everywhere.",
        fontFamily: "'Source Serif 4', 'New York', Georgia, serif",
        fontSize: 64,
        fontWeight: 400,
        letterSpacing: -0.03,
        lineHeight: 1.12,
        align: "center",
        color: "#f5f5f7",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "editorial-title",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 50, width: 82, height: 20 },
        animation: { inType: "rise", inDurationMs: 380, outType: "fade", outDurationMs: 350 },
      },
      {
        id: `${id}-viz`,
        trackId: "trk-overlay-1",
        name: "Lower Bars",
        kind: "visualizer",
        startMs: 0,
        durationMs: 9000,
        trimStartMs: 0,
        sourceDurationMs: 9000,
        speed: 1,
        locked: false,
        hidden: false,
        style: "bars",
        barCount: 32,
        color: "#38bdf8",
        secondaryColor: "#f5f5f7",
        sensitivity: 1.2,
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 80, width: 78, height: 14 },
        animation: { inType: "fade", inDurationMs: 350, outType: "fade", outDurationMs: 350 },
      },
    ];
  } else if (templateId === "editorial-title") {
    base.background = BACKDROP_PRESETS[6]!.background;
    base.durationMs = 8000;
    base.clips = [
      {
        id: `${id}-rule`,
        trackId: "trk-overlay-1",
        name: "Center Hairline",
        kind: "shape",
        startMs: 200,
        durationMs: 7800,
        trimStartMs: 0,
        sourceDurationMs: 7800,
        speed: 1,
        locked: false,
        hidden: false,
        shapeKind: "line",
        fill: "transparent",
        stroke: "rgba(255, 255, 255, 0.32)",
        strokeWidth: 2,
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 58, width: 32, height: 2 },
        animation: { inType: "fade", inDurationMs: 400, outType: "fade", outDurationMs: 300 },
      },
      {
        id: `${id}-serif`,
        trackId: "trk-text-1",
        name: "Opening Chapter",
        kind: "text",
        startMs: 0,
        durationMs: 8000,
        trimStartMs: 0,
        sourceDurationMs: 8000,
        speed: 1,
        locked: false,
        hidden: false,
        text: "The Calm Atelier",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 96,
        fontWeight: 400,
        letterSpacing: -0.025,
        lineHeight: 1.05,
        align: "center",
        color: "#f5f5f7",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "ceremonial-serif",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 45, width: 76, height: 20 },
        animation: { inType: "fade", inDurationMs: 650, outType: "fade", outDurationMs: 450 },
      },
      {
        id: `${id}-sub`,
        trackId: "trk-text-1",
        name: "Subtitle",
        kind: "text",
        startMs: 450,
        durationMs: 7550,
        trimStartMs: 0,
        sourceDurationMs: 7550,
        speed: 1,
        locked: false,
        hidden: false,
        text: "DIRECTED IN NEXUS CINEMA",
        fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: 0.08,
        lineHeight: 1.2,
        align: "center",
        color: "#a1a1aa",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "timecode-stamp",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 66, width: 52, height: 8 },
        animation: { inType: "rise", inDurationMs: 500, outType: "fade", outDurationMs: 400 },
      },
    ];
  } else if (templateId === "quote-sequence") {
    base.background = BACKDROP_PRESETS[2]!.background;
    base.durationMs = 7000;
    base.clips = [
      {
        id: `${id}-quote`,
        trackId: "trk-text-1",
        name: "Editorial Quote",
        kind: "text",
        startMs: 0,
        durationMs: 7000,
        trimStartMs: 0,
        sourceDurationMs: 7000,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Precision leaves room for silence.",
        fontFamily: "'Source Serif 4', 'New York', Georgia, serif",
        fontSize: 64,
        fontWeight: 400,
        letterSpacing: -0.03,
        lineHeight: 1.18,
        align: "center",
        color: "#0e0f12",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "pull-quote",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 46, width: 78, height: 28 },
        animation: { inType: "rise", inDurationMs: 500, outType: "fade", outDurationMs: 400 },
      },
      {
        id: `${id}-attr`,
        trackId: "trk-text-1",
        name: "Attribution",
        kind: "text",
        startMs: 350,
        durationMs: 6650,
        trimStartMs: 0,
        sourceDurationMs: 6650,
        speed: 1,
        locked: false,
        hidden: false,
        text: "Nexus Creative Suite",
        fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
        fontSize: 28,
        fontWeight: 500,
        letterSpacing: 0,
        lineHeight: 1.3,
        align: "center",
        color: "#52545e",
        backgroundColor: "transparent",
        backgroundPadding: 0,
        backgroundRadius: 0,
        strokeColor: "transparent",
        strokeWidth: 0,
        textPreset: "swiss-subhead",
        transform: { ...DEFAULT_TRANSFORM, x: 50, y: 70, width: 46, height: 10 },
        animation: { inType: "fade", inDurationMs: 450, outType: "fade", outDurationMs: 350 },
      },
    ];
  }

  base.clipCount = base.clips.length;
  return base;
}
