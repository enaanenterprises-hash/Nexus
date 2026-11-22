import type { ContentEnvelope } from "@/lib/extensions/content";
import type { ExtensionId } from "@/lib/extensions/types";

export type CinemaAspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";

export type CinemaBlendMode =
  | "source-over"
  | "screen"
  | "multiply"
  | "overlay"
  | "soft-light";

export interface CinemaTransform {
  /** Horizontal center position as percentage of canvas width (`0..100`, default `50`). */
  x: number;
  /** Vertical center position as percentage of canvas height (`0..100`, default `50`). */
  y: number;
  /** Width as percentage of canvas width (`2..200`). */
  width: number;
  /** Height as percentage of canvas height (`2..200`). */
  height: number;
  /** Clockwise rotation in degrees (`-180..180`). */
  rotation: number;
  /** Opacity (`0..1`). */
  opacity: number;
  borderRadius: number;
  shadow: boolean;
  blendMode: CinemaBlendMode;
  flipH: boolean;
  flipV: boolean;
}

export type CinemaFilterPresetId =
  | "natural"
  | "obsidian-matte"
  | "silver-halide"
  | "warm-35mm"
  | "cool-editorial"
  | "vivid"
  | "faded-film"
  | "noir";

export interface CinemaFilter {
  preset: CinemaFilterPresetId;
  /** `0.4..1.8`, default `1`. */
  brightness: number;
  /** `0.4..1.8`, default `1`. */
  contrast: number;
  /** `0..2`, default `1`. */
  saturate: number;
  /** `-1..1` (cool blue to warm amber tone curve), default `0`. */
  temperature: number;
  /** `0..24` px blur, default `0`. */
  blur: number;
  /** `0..1` radial edge darkening, default `0`. */
  vignette: number;
}

export type CinemaMotionType =
  | "none"
  | "fade"
  | "rise"
  | "slide-left"
  | "slide-right"
  | "pop"
  | "zoom-in"
  | "blur-in"
  | "typewriter";

export interface CinemaAnimation {
  inType: CinemaMotionType;
  inDurationMs: number;
  outType: CinemaMotionType;
  outDurationMs: number;
}

export type CinemaTransitionType =
  | "cut"
  | "dissolve"
  | "dip-black"
  | "dip-white"
  | "slide-left"
  | "slide-right"
  | "wipe"
  | "zoom";

export interface CinemaTransition {
  id: string;
  /** Transition starts around the tail edge of this clip toward the adjacent clip on the same track. */
  afterClipId: string;
  type: CinemaTransitionType;
  durationMs: number;
}

export type CinemaMarkerKind = "cue" | "chapter" | "cut" | "studio";

export interface CinemaMarker {
  id: string;
  atMs: number;
  label: string;
  kind: CinemaMarkerKind;
  note: string | null;
  studioMarkerId?: string;
}

export type CinemaAssetSource = "upload" | "capture" | "studio" | "stock" | "procedural";

export interface CinemaStudioRef {
  recordingId: string;
  trackId?: string;
  updatedAt: string;
  title: string;
  colorTag?: string;
}

export interface CinemaAsset {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  /** Key inside `nexus-cinema-v1` (or `studioRef` read via Studio IDB/API). */
  idbKey: string;
  /** Same-origin `/api/cinema/media-proxy?...` or `/api/studio/audio?...` or local fallback URL. */
  url: string | null;
  mimeType: string;
  byteLength: number;
  durationMs: number;
  width: number;
  height: number;
  /** Compact JPEG data URL filmstrip frames for video timeline rendering & card thumbnails. */
  thumbnails: string[];
  /** Normalized `[0..1]` audio waveform peaks for instant canvas/timeline drawing. */
  peaks: number[];
  source: CinemaAssetSource;
  studioRef?: CinemaStudioRef;
  attribution?: {
    author: string;
    url: string;
  };
}

export type CinemaTrackKind = "video" | "overlay" | "text" | "audio";

export interface CinemaTrack {
  id: string;
  name: string;
  kind: CinemaTrackKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  /** Track fader gain (`0..2`), primarily used on audio tracks. */
  volume: number;
}

interface CinemaClipBase {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  trimStartMs: number;
  sourceDurationMs: number;
  speed: number;
  locked: boolean;
  hidden: boolean;
}

export interface CinemaVideoClip extends CinemaClipBase {
  kind: "video";
  assetId: string;
  transform: CinemaTransform;
  filter: CinemaFilter;
  animation: CinemaAnimation;
  fit: "cover" | "contain";
  volume: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  audioDetached?: boolean;
}

export type CinemaKenBurnsMode = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";

export interface CinemaImageClip extends CinemaClipBase {
  kind: "image";
  assetId: string;
  transform: CinemaTransform;
  filter: CinemaFilter;
  animation: CinemaAnimation;
  fit: "cover" | "contain";
  kenBurns: CinemaKenBurnsMode;
}

export type CinemaFontFamily =
  | "Manrope, -apple-system, 'SF Pro Display', sans-serif"
  | "'Source Serif 4', 'New York', Georgia, serif"
  | "'Cormorant Garamond', Georgia, serif"
  | "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

export interface CinemaTextClip extends CinemaClipBase {
  kind: "text";
  text: string;
  fontFamily: CinemaFontFamily;
  /** Point size authored relative to 1080p canonical frame height (`16..180`). */
  fontSize: number;
  fontWeight: 300 | 400 | 500 | 600 | 700;
  letterSpacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  color: string;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundRadius: number;
  strokeColor: string;
  strokeWidth: number;
  textPreset: string;
  reactiveAudioClipId?: string;
  transform: CinemaTransform;
  animation: CinemaAnimation;
}

export type CinemaShapeKind =
  | "rect"
  | "circle"
  | "pill"
  | "line"
  | "arrow"
  | "device-desktop"
  | "device-phone"
  | "progress-bar"
  | "callout";

export interface CinemaShapeClip extends CinemaClipBase {
  kind: "shape";
  shapeKind: CinemaShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  reactiveAudioClipId?: string;
  transform: CinemaTransform;
  animation: CinemaAnimation;
}

export type CinemaVisualizerStyle = "bars" | "mirror-wave" | "horizon-line" | "ring";

export interface CinemaVisualizerClip extends CinemaClipBase {
  kind: "visualizer";
  style: CinemaVisualizerStyle;
  barCount: number;
  color: string;
  secondaryColor: string;
  sensitivity: number;
  sourceClipId?: string;
  reactiveAudioClipId?: string;
  transform: CinemaTransform;
  animation: CinemaAnimation;
}

export interface CinemaAudioClip extends CinemaClipBase {
  kind: "audio";
  assetId: string;
  volume: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  peaks: number[];
  duckOthers?: boolean;
  studioRef?: CinemaStudioRef;
}

export type CinemaClip =
  | CinemaVideoClip
  | CinemaImageClip
  | CinemaTextClip
  | CinemaShapeClip
  | CinemaVisualizerClip
  | CinemaAudioClip;

export type CinemaVisualClip = Exclude<CinemaClip, CinemaAudioClip>;

export interface CinemaBackground {
  type: "solid" | "linear" | "radial" | "grid";
  colorA: string;
  colorB: string;
  angleDeg: number;
  /** Subtle deterministic luminance texture (`0..0.12`). */
  grain: number;
}

export interface CinemaCollection {
  id: string;
  name: string;
  description: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CinemaProjectSummary {
  id: string;
  collectionId: string;
  title: string;
  description: string | null;
  aspectRatio: CinemaAspectRatio;
  fps: 24 | 30 | 60;
  durationMs: number;
  clipCount: number;
  trackCount: number;
  markerCount: number;
  thumbnailUrl: string | null;
  hasLinkedStudioAudio: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CinemaRhythmGrid {
  bpm: number;
  beatMs: number[];
  transientMs: number[];
  sourceRecordingId?: string;
  sourceTitle?: string;
}

export interface CinemaProject extends CinemaProjectSummary {
  width: number;
  height: number;
  background: CinemaBackground;
  tracks: CinemaTrack[];
  clips: CinemaClip[];
  transitions: CinemaTransition[];
  assets: CinemaAsset[];
  markers: CinemaMarker[];
  rhythmGrid?: CinemaRhythmGrid | null;
  notes: CinemaProjectAnnotationV1 | null;
}

export interface SaveCinemaProjectInput {
  id?: string;
  collectionId: string;
  title: string;
  description?: string | null;
  aspectRatio: CinemaAspectRatio;
  fps: 24 | 30 | 60;
  width: number;
  height: number;
  durationMs: number;
  thumbnailUrl?: string | null;
  background: CinemaBackground;
  tracks: CinemaTrack[];
  clips: CinemaClip[];
  transitions: CinemaTransition[];
  assets: CinemaAsset[];
  markers: CinemaMarker[];
  tags?: string[];
}

export interface CinemaProjectAnnotationV1 {
  notes?: string;
  extensionId?: ExtensionId;
  updatedAt?: string;
}

/** Light representation returned by `runtime.content.list("cinema.project")`. */
export type CinemaProjectListItemV1 = ContentEnvelope<
  "cinema.project",
  1,
  {
    description: string | null;
    aspectRatio: CinemaAspectRatio;
    fps: 24 | 30 | 60;
    durationMs: number;
    clipCount: number;
    markerCount: number;
    hasLinkedStudioAudio: boolean;
    tags: string[];
  }
>;

/** Full representation returned by `runtime.content.get("cinema.project", id)`. */
export type CinemaProjectContentV1 = ContentEnvelope<
  "cinema.project",
  1,
  {
    description: string | null;
    aspectRatio: CinemaAspectRatio;
    fps: 24 | 30 | 60;
    width: number;
    height: number;
    durationMs: number;
    background: CinemaBackground;
    tracks: CinemaTrack[];
    clips: CinemaClip[];
    transitions: CinemaTransition[];
    markers: CinemaMarker[];
    tags: string[];
    notes: CinemaProjectAnnotationV1 | null;
  }
>;

export type CinemaExportFormat = "mp4" | "webm" | "png" | "wav-studio";

export interface CinemaExportOptions {
  format: CinemaExportFormat;
  resolution: "1080p" | "720p";
  fps: 24 | 30 | 60;
  quality: "high" | "balanced";
}

export interface CinemaExportProgress {
  phase: "preparing" | "audio" | "rendering" | "muxing" | "done";
  progress: number;
  currentFrame: number;
  totalFrames: number;
  message: string;
}

export interface StockMediaItem {
  id: string;
  kind: "video" | "image";
  title: string;
  width: number;
  height: number;
  durationMs: number;
  thumbnailUrl: string;
  previewUrl: string;
  /** Same-origin `/api/cinema/media-proxy?url=...` path so `<canvas>` stays untainted. */
  mediaUrl: string;
  mimeType: string;
  author: string;
  authorUrl: string;
}

export interface CinemaVoiceoverRequest {
  projectId: string;
  projectTitle: string;
  playheadMs: number;
  durationMs: number;
  markers: CinemaMarker[];
  requestedAt: string;
}

export interface CinemaExtractedAudioTransfer {
  projectId: string;
  projectTitle: string;
  clipName: string;
  sourceVideoClipId: string;
  sourceStartMs: number;
  sourceTrimStartMs: number;
  audioKey: string;
  durationMs: number;
  sampleRate: number;
  byteLength: number;
  mimeType: string;
  peaks: number[];
  extractedAt: string;
}

export interface StudioSmartCutsTransfer {
  recordingId: string;
  title: string;
  keepRegions: Array<{ startMs: number; endMs: number }>;
  removedMs: number;
  silenceCount: number;
  createdAt: string;
}

export interface StudioRhythmGridTransfer {
  recordingId: string;
  title: string;
  bpm: number;
  beatMs: number[];
  transientMs: number[];
  createdAt: string;
}

export interface StudioAudioRepairedTransfer {
  recordingId: string;
  title: string;
  targetProjectId: string;
  targetVideoClipId: string;
  sourceStartMs: number;
  audioKey: string;
  durationMs: number;
  sampleRate: number;
  byteLength: number;
  mimeType: string;
  peaks: number[];
  repairedAt: string;
}
