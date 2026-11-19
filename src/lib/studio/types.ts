import type { ContentEnvelope } from "@/lib/extensions/content";
import type { ExtensionId } from "@/lib/extensions/types";

export type StudioAudioStorage = "idb" | "url";

/**
 * Location reference for an audio track's binary payload.
 * Today tracks persist in client IndexedDB (`storage: "idb"`); future cloud
 * object storage (Vercel Blob / S3) attaches a `url` with zero contract churn.
 */
export interface StudioAudioRef {
  storage: StudioAudioStorage;
  idbKey: string;
  url: string | null;
  mimeType: string;
  byteLength: number;
  sampleRate: number;
}

export type StudioTrackRole = "voice" | "instrumental" | "scratch" | "overdub";

export type StudioTrackColor = "gold" | "sky" | "emerald" | "coral" | "slate";

export interface StudioTrackV1 {
  id: string;
  name: string;
  role: StudioTrackRole;
  /** 0-based DAW lane index (`0` = Layer 1, `1` = Layer 2, ...). */
  layerIndex?: number;
  /** Timeline start offset in ms. */
  offsetMs: number;
  /** Source audio crop start offset in ms (for non-destructive splits & trims). */
  trimStartMs?: number;
  /** Visible playback duration on the timeline in ms. */
  durationMs: number;
  /** Uncropped underlying source audio duration in ms. */
  sourceDurationMs?: number;
  /** Non-destructive clip fade-in duration in ms. */
  fadeInMs?: number;
  /** Non-destructive clip fade-out duration in ms. */
  fadeOutMs?: number;
  /** Hardware input source descriptor (e.g. "Ch 3 · Input 1"). */
  inputSource?: string;
  /** Optional lane/clip visual accent token for distinguishing multi-mic speakers. */
  colorTag?: StudioTrackColor;
  /** 80 Hz high-pass rumble filter enabled during playback & mixdown. */
  hpfEnabled?: boolean;
  /** Broadcast speech dynamics compressor enabled during playback & mixdown. */
  compressorEnabled?: boolean;
  /** 3-band subtle voice EQ trim in dB (-6 to +6). */
  eqLowDb?: number;
  eqMidDb?: number;
  eqHighDb?: number;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  peaks: number[];
  audioRef: StudioAudioRef;
  createdAt: string;
}

export type StudioMarkerKind = "cue" | "chapter" | "note" | "edit";

export interface StudioMarkerV1 {
  id: string;
  atMs: number;
  label: string;
  kind: StudioMarkerKind;
  note: string | null;
}

export interface StudioTranscriptSegment {
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
}

export interface StudioTranscriptV1 {
  language: string | null;
  text: string;
  segments: StudioTranscriptSegment[];
  model: string;
  generatedAt: string;
  extensionId: ExtensionId;
}

export interface StudioSummaryV1 {
  text: string;
  keyPoints: string[];
  actionItems: string[];
  model: string;
  generatedAt: string;
  extensionId: ExtensionId;
}

export interface StudioChapterItem {
  title: string;
  startMs: number;
  endMs: number;
  summary: string | null;
}

export interface StudioChaptersV1 {
  items: StudioChapterItem[];
  model: string;
  generatedAt: string;
  extensionId: ExtensionId;
}

export type StudioRoutingIntent =
  | "video-studio"
  | "study-space"
  | "command"
  | "ai-notes"
  | "custom";

export interface StudioCollection {
  id: string;
  name: string;
  description: string | null;
  recordingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudioRecordingSummary {
  id: string;
  collectionId: string;
  title: string;
  description: string | null;
  bpm: number;
  countInBars: number;
  durationMs: number;
  masterGain: number;
  trackCount: number;
  markerCount: number;
  peaks: number[];
  tags: string[];
  hasTranscript: boolean;
  hasSummary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudioRecording extends StudioRecordingSummary {
  tracks: StudioTrackV1[];
  markers: StudioMarkerV1[];
  transcript: StudioTranscriptV1 | null;
  summary: StudioSummaryV1 | null;
  chapters: StudioChaptersV1 | null;
}

export interface SaveStudioRecordingInput {
  id?: string;
  collectionId: string;
  title: string;
  description?: string | null;
  bpm?: number;
  countInBars?: number;
  durationMs: number;
  masterGain?: number;
  tracks: StudioTrackV1[];
  markers: StudioMarkerV1[];
  tags?: string[];
}

/** Light representation returned by `runtime.content.list("studio.recording")`. */
export type StudioRecordingListItemV1 = ContentEnvelope<
  "studio.recording",
  1,
  {
    description: string | null;
    bpm: number;
    durationMs: number;
    trackCount: number;
    markerCount: number;
    peaks: number[];
    tags: string[];
    hasTranscript: boolean;
    hasSummary: boolean;
  }
>;

/** Full representation returned by `runtime.content.get("studio.recording", id)`. */
export type StudioRecordingContentV1 = ContentEnvelope<
  "studio.recording",
  1,
  {
    description: string | null;
    bpm: number;
    countInBars: number;
    durationMs: number;
    masterGain: number;
    tracks: StudioTrackV1[];
    markers: StudioMarkerV1[];
    tags: string[];
    transcript: StudioTranscriptV1 | null;
    summary: StudioSummaryV1 | null;
    chapters: StudioChaptersV1 | null;
  }
>;

export interface WriteStudioTranscriptInput {
  language?: string | null;
  text: string;
  segments?: StudioTranscriptSegment[];
  model: string;
}

export interface WriteStudioSummaryInput {
  text: string;
  keyPoints?: string[];
  actionItems?: string[];
  model: string;
}

export interface WriteStudioChaptersInput {
  items: StudioChapterItem[];
  model: string;
}

/** Annotation payload accepted by `runtime.content.annotate("studio.recording", id, input)`. */
export interface StudioRecordingAnnotationV1 {
  transcript?: WriteStudioTranscriptInput;
  summary?: WriteStudioSummaryInput;
  chapters?: WriteStudioChaptersInput;
}
