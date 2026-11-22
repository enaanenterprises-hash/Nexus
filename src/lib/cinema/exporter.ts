import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSink,
  WebMOutputFormat,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { encodeWavFromBuffer } from "@/lib/studio/wav";
import { renderCinemaAudioOffline } from "./audio-engine";
import {
  computeProjectDurationMs,
  isCinemaFrameStaticSince,
  renderCinemaFrame,
  type Cinema2DContext,
  type CinemaDrawableMedia,
  type CinemaRenderRuntime,
} from "./compositor";
import { loadCinemaBlob } from "./media-db";
import { resolutionForAspectRatio } from "./presets";
import type {
  CinemaExportOptions,
  CinemaExportProgress,
  CinemaProject,
  CinemaVideoClip,
} from "./types";

export interface CinemaExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  elapsedMs: number;
  engine:
    | "passthrough"
    | "mediabunny-conversion"
    | "mediabunny-compositor"
    | "mediarecorder"
    | "png"
    | "wav";
}

function safeFileSlug(title: string): string {
  return (
    (title || "cinema-edit")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "cinema-edit"
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel !== "undefined") {
    return new Promise<void>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(null);
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function normalizeQuarterTurn(deg: number): 0 | 90 | 180 | 270 | null {
  const mod = ((Math.round(deg) % 360) + 360) % 360;
  if (Math.abs(deg - Math.round(deg)) > 0.25) return null;
  if (mod === 0 || mod === 90 || mod === 180 || mod === 270) return mod;
  return null;
}

function isClipFilterDefault(clip: CinemaVideoClip): boolean {
  const flt = clip.filter;
  return (
    Math.abs(flt.brightness - 1) <= 0.01 &&
    Math.abs(flt.contrast - 1) <= 0.01 &&
    Math.abs(flt.saturate - 1) <= 0.01 &&
    Math.abs(flt.temperature) <= 0.02 &&
    flt.blur <= 0.1 &&
    flt.vignette <= 0.02
  );
}

interface SingleVideoFastCandidate {
  clip: CinemaVideoClip;
  rotation90: 0 | 90 | 180 | 270;
  audioMutedOrDetached: boolean;
  isUntrimmedOriginal: boolean;
}

/**
 * Checks whether the project consists solely of one full-bleed `<video>` clip
 * (optionally trimmed, muted, rotated 90°, flipped horizontally, or resized)
 * with no extra overlays, text, filters, speed changes, transitions, or extra audio tracks.
 */
function inspectSingleVideoFastCandidate(project: CinemaProject): SingleVideoFastCandidate | null {
  const activeTracks = new Map(project.tracks.filter((t) => !t.hidden).map((t) => [t.id, t]));
  const activeClips = project.clips.filter((c) => !c.hidden && activeTracks.has(c.trackId));
  if (activeClips.length !== 1) return null;

  const onlyClip = activeClips[0]!;
  if (onlyClip.kind !== "video") return null;
  if (onlyClip.startMs > 40) return null;
  if (Math.abs((onlyClip.speed || 1) - 1) > 0.01) return null;
  if (!isClipFilterDefault(onlyClip)) return null;
  if (onlyClip.animation.inType !== "none" || onlyClip.animation.outType !== "none") return null;
  if (project.transitions.some((t) => t.type !== "cut" && t.durationMs > 0)) return null;

  const tf = onlyClip.transform;
  const rotation90 = normalizeQuarterTurn(tf.rotation);
  if (rotation90 === null) return null;
  if (
    Math.abs(tf.x - 50) > 0.5 ||
    Math.abs(tf.y - 50) > 0.5 ||
    Math.abs(tf.width - 100) > 0.5 ||
    Math.abs(tf.height - 100) > 0.5 ||
    Math.abs(tf.opacity - 1) > 0.01 ||
    tf.borderRadius > 0 ||
    tf.flipV
  ) {
    return null;
  }

  const track = activeTracks.get(onlyClip.trackId);
  const audioMutedOrDetached = Boolean(onlyClip.muted || onlyClip.audioDetached || track?.muted);
  if (!audioMutedOrDetached) {
    const effVol = (onlyClip.volume ?? 1) * (track?.volume ?? 1);
    if (Math.abs(effVol - 1) > 0.05) return null;
    if ((onlyClip.fadeInMs || 0) > 10 || (onlyClip.fadeOutMs || 0) > 10) return null;
  }

  const isUntrimmedOriginal =
    onlyClip.trimStartMs <= 40 &&
    Math.abs(onlyClip.durationMs - onlyClip.sourceDurationMs) <= 150 &&
    rotation90 === 0 &&
    !tf.flipH &&
    !audioMutedOrDetached;

  return {
    clip: onlyClip,
    rotation90,
    audioMutedOrDetached,
    isUntrimmedOriginal,
  };
}

export function predictCinemaExportMode(
  project: CinemaProject,
  options: CinemaExportOptions,
): { label: string; detail: string } {
  if (options.format === "png") {
    return { label: "Mediabunny Frame Snapshot", detail: "Exact playhead still (.png)" };
  }
  if (options.format === "wav-studio") {
    return { label: "Offline Web Audio Mix", detail: "48 kHz 16-bit stereo WAV" };
  }
  const fast = inspectSingleVideoFastCandidate(project);
  if (fast) {
    const asset = project.assets.find((a) => a.id === fast.clip.assetId);
    const { width, height } = resolutionForAspectRatio(project.aspectRatio, options.resolution);
    const targetMime = options.format === "mp4" ? "video/mp4" : "video/webm";
    const sameRes =
      asset &&
      Math.abs((asset.width || width) - width) <= 2 &&
      Math.abs((asset.height || height) - height) <= 2;

    if (fast.isUntrimmedOriginal && sameRes && asset?.mimeType.toLowerCase().startsWith(targetMime)) {
      return {
        label: "Direct Stream Copy",
        detail: "Zero re-encoding · instant export",
      };
    }
    return {
      label: "Mediabunny Smart Remux / Conversion",
      detail: "Direct packet copy & hardware pipeline (no 2D canvas overhead)",
    };
  }
  return {
    label: "Mediabunny GPU Compositor",
    detail: "Zero-copy VideoSample decode + overlapped WebCodecs encode",
  };
}

async function resolveAssetBlob(
  project: CinemaProject,
  assetId: string,
  baseMedia?: ReadonlyMap<string, CinemaDrawableMedia>,
): Promise<Blob | null> {
  const asset = project.assets.find((a) => a.id === assetId);
  if (asset?.idbKey) {
    const idbBlob = await loadCinemaBlob(asset.idbKey);
    if (idbBlob && idbBlob.size > 0) return idbBlob;
  }
  const base = baseMedia?.get(assetId);
  const url =
    (base instanceof HTMLVideoElement ? base.currentSrc || base.src : undefined) || asset?.url;
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch {
    // Ignore fetch failure
  }
  return null;
}

interface ClipSampleStream {
  clip: CinemaVideoClip;
  input: Input;
  iterator: AsyncGenerator<VideoSample | null, void, unknown>;
  frameIndices: number[];
  cursor: number;
  heldSample: VideoSample | null;
}

/**
 * Decodes every visible `<video>` clip using `mediabunny`'s `VideoSampleSink.samplesAtTimestamps`.
 *
 * Unlike `CanvasSink`, `VideoSample` wraps the GPU `VideoFrame` directly (no intermediate 4K/1080p
 * canvas copy) and draws via `sample.draw(ctx, ...)` in a single GPU blit. Keyed by `clip.id` so
 * split/PiP clips of the same video asset never collide.
 */
class MediabunnySamplePool {
  private readonly project: CinemaProject;
  private readonly videoClips: CinemaVideoClip[];
  private readonly baseMedia: ReadonlyMap<string, CinemaDrawableMedia>;
  private readonly clipStreams: ClipSampleStream[] = [];
  private readonly fallbackClips: CinemaVideoClip[] = [];

  constructor(
    project: CinemaProject,
    baseMedia: ReadonlyMap<string, CinemaDrawableMedia>,
  ) {
    this.project = project;
    this.baseMedia = baseMedia;
    const activeTrackIds = new Set(
      project.tracks.filter((t) => t.kind !== "audio" && !t.hidden).map((t) => t.id),
    );
    this.videoClips = project.clips.filter(
      (c): c is CinemaVideoClip =>
        c.kind === "video" && !c.hidden && activeTrackIds.has(c.trackId),
    );
  }

  get hasVideoClips(): boolean {
    return this.videoClips.length > 0;
  }

  async initForTimeline(fps: number, totalFrames: number): Promise<void> {
    if (this.videoClips.length === 0) return;

    // Pause stage preview <video> elements so CinemaView's "seeked" stage redraw listener stays quiet
    for (const v of this.baseMedia.values()) {
      if (v instanceof HTMLVideoElement && !v.paused) {
        v.pause();
      }
    }

    const blobCache = new Map<string, Blob | null>();
    const frameDurMs = 1000 / fps;

    for (const clip of this.videoClips) {
      if (!blobCache.has(clip.assetId)) {
        blobCache.set(clip.assetId, await resolveAssetBlob(this.project, clip.assetId, this.baseMedia));
      }
      const blob = blobCache.get(clip.assetId) ?? null;
      if (!blob) {
        this.fallbackClips.push(clip);
        continue;
      }

      let input: Input | null = null;
      try {
        input = new Input({
          source: new BlobSource(blob),
          formats: ALL_FORMATS,
        });
        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack || !(await videoTrack.canDecode())) {
          input.dispose();
          this.fallbackClips.push(clip);
          continue;
        }

        const firstTs = Math.max(0, await videoTrack.getFirstTimestamp());
        const speed = clamp(clip.speed || 1, 0.25, 4);
        const frameIndices: number[] = [];
        const timestampsSec: number[] = [];

        for (let f = 0; f < totalFrames; f++) {
          const timeMs = f * frameDurMs;
          if (timeMs >= clip.startMs && timeMs <= clip.startMs + clip.durationMs) {
            const relSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);
            frameIndices.push(f);
            // Tiny +0.5ms epsilon ensures frame 0 is never missed due to float precision against firstTs
            timestampsSec.push(firstTs + relSec + 0.0005);
          }
        }

        if (frameIndices.length === 0) {
          input.dispose();
          continue;
        }

        const sink = new VideoSampleSink(videoTrack, {
          optimizeForLatency: true,
        });
        const iterator = sink.samplesAtTimestamps(timestampsSec);

        this.clipStreams.push({
          clip,
          input,
          iterator,
          frameIndices,
          cursor: 0,
          heldSample: null,
        });
      } catch {
        if (input) {
          try {
            input.dispose();
          } catch {
            // Ignore
          }
        }
        this.fallbackClips.push(clip);
      }
    }
  }

  /**
   * Pulls the exact `VideoSample` (keyed by `clip.id`) for `frameIndex`.
   * Designed to be called concurrently while `CanvasSource.add` encodes the previous frame.
   */
  async pullFrame(
    frameIndex: number,
    timeMs: number,
  ): Promise<Map<string, CinemaDrawableMedia>> {
    const overrides = new Map<string, CinemaDrawableMedia>();
    if (this.videoClips.length === 0) return overrides;

    const activeStreams: ClipSampleStream[] = [];
    for (const stream of this.clipStreams) {
      if (stream.cursor < stream.frameIndices.length && stream.frameIndices[stream.cursor] === frameIndex) {
        activeStreams.push(stream);
      } else if (stream.heldSample && stream.cursor >= stream.frameIndices.length) {
        // Clip has finished its timeline span: close its last held sample immediately
        stream.heldSample.close();
        stream.heldSample = null;
      }
    }

    if (activeStreams.length > 0) {
      await Promise.all(
        activeStreams.map(async (stream) => {
          stream.cursor++;
          try {
            const res = await stream.iterator.next();
            if (!res.done && res.value) {
              if (stream.heldSample) {
                stream.heldSample.close();
              }
              stream.heldSample = res.value;
            }
          } catch {
            // Retain last decoded sample if EOF encounters a trailing packet quirk
          }
          if (stream.heldSample) {
            overrides.set(stream.clip.id, stream.heldSample);
          }
        }),
      );
    }

    if (this.fallbackClips.length > 0) {
      const activeFallbacks = this.fallbackClips.filter(
        (c) => timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
      );
      await Promise.all(
        activeFallbacks.map(async (clip) => {
          const el = this.baseMedia.get(clip.assetId);
          if (!(el instanceof HTMLVideoElement) || el.readyState < 1) return;
          const speed = clamp(clip.speed || 1, 0.25, 4);
          const targetSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);
          const finiteDur =
            Number.isFinite(el.duration) && el.duration > 0
              ? Math.max(0, el.duration - 0.025)
              : targetSec;
          const clamped = Math.min(finiteDur, targetSec);
          if (Math.abs(el.currentTime - clamped) > 0.025) {
            await new Promise<void>((resolve) => {
              let done = false;
              const finish = () => {
                if (done) return;
                done = true;
                el.removeEventListener("seeked", onSeeked);
                resolve();
              };
              const onSeeked = () => {
                window.clearTimeout(timer);
                finish();
              };
              const timer = window.setTimeout(finish, 250);
              el.addEventListener("seeked", onSeeked, { once: true });
              try {
                el.currentTime = clamped;
              } catch {
                window.clearTimeout(timer);
                finish();
              }
            });
          }
          overrides.set(clip.id, el);
        }),
      );
    }

    return overrides;
  }

  dispose(): void {
    for (const stream of this.clipStreams) {
      if (stream.heldSample) {
        try {
          stream.heldSample.close();
        } catch {
          // Ignore
        }
        stream.heldSample = null;
      }
      try {
        void stream.iterator.return();
      } catch {
        // Ignore
      }
      try {
        stream.input.dispose();
      } catch {
        // Ignore
      }
    }
    this.clipStreams.length = 0;
  }
}

export async function exportCurrentFramePng(
  project: CinemaProject,
  timeMs: number,
  runtime: CinemaRenderRuntime,
): Promise<CinemaExportResult> {
  const startedPerf = performance.now();
  const canvas = document.createElement("canvas");
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D export canvas.");

  const overrides = new Map<string, CinemaDrawableMedia>();
  const openedSamples: VideoSample[] = [];
  const activeVideoClips = project.clips.filter(
    (c): c is CinemaVideoClip =>
      c.kind === "video" && !c.hidden && timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
  );

  try {
    for (const clip of activeVideoClips) {
      const blob = await resolveAssetBlob(project, clip.assetId, runtime.mediaElements);
      if (!blob) continue;
      let input: Input | null = null;
      try {
        input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (track && (await track.canDecode())) {
          const firstTs = Math.max(0, await track.getFirstTimestamp());
          const speed = clamp(clip.speed || 1, 0.25, 4);
          const relSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);
          const sink = new VideoSampleSink(track);
          const sample = await sink.getSample(firstTs + relSec + 0.0005);
          if (sample) {
            openedSamples.push(sample);
            overrides.set(clip.id, sample);
          }
        }
      } catch {
        // Use existing media element if Mediabunny single-frame lookup fails
      } finally {
        input?.dispose();
      }
    }

    renderCinemaFrame(ctx, project, timeMs, {
      ...runtime,
      clipMediaOverrides: overrides,
      showSafeGuides: false,
      isExport: true,
    });
  } finally {
    for (const s of openedSamples) {
      try {
        s.close();
      } catch {
        // Ignore
      }
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG frame encoding failed."))),
      "image/png",
    );
  });

  return {
    blob,
    filename: `${safeFileSlug(project.title)}-frame.png`,
    mimeType: "image/png",
    elapsedMs: Math.round(performance.now() - startedPerf),
    engine: "png",
  };
}

/**
 * Tier 0A: Instant zero-re-encode blob copy when the timeline is a single unmodified clip
 * matching the target container and output resolution.
 */
async function tryDirectVideoPassthrough(
  project: CinemaProject,
  options: CinemaExportOptions,
  targetW: number,
  targetH: number,
  baseMedia: ReadonlyMap<string, CinemaDrawableMedia>,
): Promise<CinemaExportResult | null> {
  if (options.format !== "mp4" && options.format !== "webm") return null;
  const startedPerf = performance.now();
  const candidate = inspectSingleVideoFastCandidate(project);
  if (!candidate || !candidate.isUntrimmedOriginal) return null;

  const asset = project.assets.find((a) => a.id === candidate.clip.assetId);
  if (!asset) return null;

  const targetMimePrefix = options.format === "mp4" ? "video/mp4" : "video/webm";
  if (!asset.mimeType.toLowerCase().startsWith(targetMimePrefix)) return null;

  // Only bypass conversion when source dimensions match requested export tier
  if (
    asset.width > 0 &&
    asset.height > 0 &&
    (Math.abs(asset.width - targetW) > 2 || Math.abs(asset.height - targetH) > 2)
  ) {
    return null;
  }

  const blob = await resolveAssetBlob(project, candidate.clip.assetId, baseMedia);
  if (!blob || blob.size === 0) return null;

  return {
    blob,
    filename: `${safeFileSlug(project.title)}.${options.format}`,
    mimeType: targetMimePrefix,
    elapsedMs: Math.round(performance.now() - startedPerf),
    engine: "passthrough",
  };
}

/**
 * Tier 0B: Mediabunny `Conversion` fast path for single-clip trims, mutes, 90° rotations,
 * horizontal flips, container remuxes (MOV/WebM -> MP4), and direct GPU resizes without 2D canvas.
 * Copies compressed packets without decoding/re-encoding whenever possible (`copy: preferred`).
 */
async function tryFastMediabunnyConversion(params: {
  project: CinemaProject;
  options: CinemaExportOptions;
  width: number;
  height: number;
  fps: 24 | 30 | 60;
  videoBitrate: number;
  totalFrames: number;
  baseMedia: ReadonlyMap<string, CinemaDrawableMedia>;
  onProgress: (p: CinemaExportProgress) => void;
  signal?: AbortSignal;
}): Promise<CinemaExportResult | null> {
  const { project, options, width, height, fps, videoBitrate, totalFrames, baseMedia, onProgress, signal } =
    params;
  if (options.format !== "mp4" && options.format !== "webm") return null;

  const candidate = inspectSingleVideoFastCandidate(project);
  if (!candidate) return null;

  const blob = await resolveAssetBlob(project, candidate.clip.assetId, baseMedia);
  if (!blob || blob.size === 0) return null;

  const startedPerf = performance.now();
  const isWebm = options.format === "webm";
  let input: Input | null = null;
  let conversion: Conversion | null = null;

  const onAbort = () => {
    if (conversion) {
      void conversion.cancel();
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) return null;

    const firstTs = Math.max(0, await videoTrack.getFirstTimestamp());
    const srcDur = await input.computeDuration();
    const trimStart = firstTs + candidate.clip.trimStartMs / 1000;
    const trimEnd = Math.min(
      firstTs + Math.max(0.25, srcDur),
      trimStart + candidate.clip.durationMs / 1000,
    );
    const isTrimmed =
      candidate.clip.trimStartMs > 40 || trimEnd < firstTs + srcDur - 0.18;

    const srcW = videoTrack.displayWidth || videoTrack.codedWidth || width;
    const srcH = videoTrack.displayHeight || videoTrack.codedHeight || height;
    const needsResize = Math.abs(srcW - width) > 2 || Math.abs(srcH - height) > 2;

    const target = new BufferTarget();
    const outputFormat = isWebm
      ? new WebMOutputFormat()
      : new Mp4OutputFormat({ fastStart: "in-memory" });
    const output = new Output({ format: outputFormat, target });

    const sourceVideoCodec = await videoTrack.getCodec();
    const canCopyVideoCodec =
      sourceVideoCodec !== null && outputFormat.getSupportedVideoCodecs().includes(sourceVideoCodec);
    const willTranscodeVideo = needsResize || !canCopyVideoCodec;

    const videoQuality = new Quality({
      bitrate: videoBitrate,
      bitrateMode: "variable",
    });

    conversion = await Conversion.init({
      input,
      output,
      ...(isTrimmed ? { trim: { start: trimStart, end: trimEnd } } : {}),
      copy: {
        mode: "preferred",
        shiftTolerance: 0.15,
        boundaryPolicy: "expand",
      },
      video: {
        ...(needsResize ? { width, height, fit: candidate.clip.fit, frameRate: fps } : {}),
        ...(candidate.rotation90 !== 0 ? { rotate: candidate.rotation90 } : {}),
        ...(candidate.clip.transform.flipH ? { flip: true } : {}),
        // Omit `quality` when stream-copy is possible because Mediabunny treats explicit `quality` as force-transcode
        ...(willTranscodeVideo ? { quality: videoQuality } : {}),
      },
      audio: candidate.audioMutedOrDetached ? { discard: true } : {},
      showWarnings: false,
    });

    if (!conversion.isValid) {
      return null;
    }

    let lastProgressPerf = startedPerf;
    conversion.onProgress = (p) => {
      const now = performance.now();
      if (p < 0.99 && now - lastProgressPerf < 80) return;
      lastProgressPerf = now;
      const elapsedSec = Math.max(0.05, (now - startedPerf) / 1000);
      const doneSec = p * (candidate.clip.durationMs / 1000);
      const speedMul = doneSec / elapsedSec;
      const speedTag = speedMul >= 1.2 ? ` · ${speedMul.toFixed(1)}× speed` : "";
      onProgress({
        phase: p >= 0.96 ? "muxing" : "rendering",
        progress: 0.06 + p * 0.92,
        currentFrame: Math.min(totalFrames, Math.round(p * totalFrames)),
        totalFrames,
        speedMul,
        message: willTranscodeVideo
          ? `Hardware converting (${Math.round(p * 100)}%)${speedTag}…`
          : `Fast remuxing stream (${Math.round(p * 100)}%)${speedTag}…`,
      });
    };

    onProgress({
      phase: "rendering",
      progress: 0.06,
      currentFrame: 0,
      totalFrames,
      message: willTranscodeVideo
        ? "Starting Mediabunny direct hardware conversion…"
        : "Starting Mediabunny zero-re-encode remux…",
    });

    await conversion.execute();
    if (!target.buffer || target.buffer.byteLength === 0) return null;

    const mimeType = isWebm ? "video/webm" : "video/mp4";
    const ext = isWebm ? "webm" : "mp4";
    const outBlob = new Blob([target.buffer], { type: mimeType });
    const elapsedMs = Math.round(performance.now() - startedPerf);

    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: `${ext.toUpperCase()} ready in ${(elapsedMs / 1000).toFixed(1)}s.`,
    });

    return {
      blob: outBlob,
      filename: `${safeFileSlug(project.title)}.${ext}`,
      mimeType,
      elapsedMs,
      engine: "mediabunny-conversion",
    };
  } catch (err) {
    if (
      signal?.aborted ||
      err instanceof ConversionCanceledError ||
      (err as DOMException)?.name === "AbortError"
    ) {
      throw new DOMException("Export cancelled", "AbortError");
    }
    // Fall through cleanly to Tier 1 full compositor
    return null;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    input?.dispose();
  }
}

function resolveVideoBitrate(options: CinemaExportOptions): number {
  if (options.resolution === "4k") {
    return options.quality === "high" ? 18_000_000 : 12_000_000;
  }
  if (options.resolution === "1080p") {
    return options.quality === "high" ? 6_500_000 : 3_800_000;
  }
  return options.quality === "high" ? 3_800_000 : 2_200_000;
}

export async function exportCinemaVideo(
  project: CinemaProject,
  options: CinemaExportOptions,
  helpers: {
    mediaElements: ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>;
    audioBuffers: ReadonlyMap<string, AudioBuffer>;
  },
  onProgress: (progress: CinemaExportProgress) => void,
  signal?: AbortSignal,
): Promise<CinemaExportResult> {
  const durationMs = computeProjectDurationMs(project);
  const fps = options.fps;
  const totalFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));
  const { width, height } = resolutionForAspectRatio(project.aspectRatio, options.resolution);
  const videoBitrate = resolveVideoBitrate(options);

  // Tier 0A: Instant zero-re-encode container passthrough (< 30ms)
  const passthrough = await tryDirectVideoPassthrough(
    project,
    options,
    width,
    height,
    helpers.mediaElements,
  );
  if (passthrough) {
    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: "Instant direct stream copy complete.",
    });
    return passthrough;
  }

  // Tier 0B: Mediabunny Conversion (direct packet-copy trim/remux or canvas-free hardware transcode)
  const fastConversion = await tryFastMediabunnyConversion({
    project,
    options,
    width,
    height,
    fps,
    videoBitrate,
    totalFrames,
    baseMedia: helpers.mediaElements,
    onProgress,
    signal,
  });
  if (fastConversion) {
    return fastConversion;
  }

  const renderProject: CinemaProject = {
    ...project,
    width,
    height,
    fps,
    durationMs,
  };

  onProgress({
    phase: "audio",
    progress: 0.04,
    currentFrame: 0,
    totalFrames,
    message: "Mixing Studio & timeline audio stems…",
  });

  const audioStartPerf = performance.now();
  const { buffer: mixedAudio, frameBins } = await renderCinemaAudioOffline(
    renderProject,
    helpers.audioBuffers,
    fps,
    totalFrames,
    48_000,
  );

  if (options.format === "wav-studio") {
    if (!mixedAudio) {
      throw new Error("Add Studio audio or an unmuted audio track before exporting WAV.");
    }
    const wav = encodeWavFromBuffer(mixedAudio);
    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: "Master stereo WAV ready.",
    });
    return {
      blob: wav,
      filename: `${safeFileSlug(project.title)}-master.wav`,
      mimeType: "audio/wav",
      elapsedMs: Math.round(performance.now() - audioStartPerf),
      engine: "wav",
    };
  }

  // Prefer OffscreenCanvas for GPU WebCodecs export to bypass DOM layout/paint attachment
  const isWebm = options.format === "webm";
  const outputFormat = isWebm
    ? new WebMOutputFormat()
    : new Mp4OutputFormat({ fastStart: "in-memory" });
  const videoQuality = new Quality({
    bitrate: videoBitrate,
    bitrateMode: "variable",
  });

  let videoCodec: Awaited<ReturnType<typeof getFirstEncodableVideoCodec>> = null;
  try {
    videoCodec = await getFirstEncodableVideoCodec(outputFormat.getSupportedVideoCodecs(), {
      width,
      height,
      quality: videoQuality,
      frameRate: fps,
    });
  } catch {
    videoCodec = null;
  }

  if (videoCodec) {
    let latencyMode: "realtime" | "quality" = "quality";
    try {
      const realtimeOk = await canEncodeVideo(videoCodec, {
        width,
        height,
        quality: videoQuality,
        frameRate: fps,
        latencyMode: "realtime",
      });
      if (realtimeOk) latencyMode = "realtime";
    } catch {
      latencyMode = "quality";
    }

    const useOffscreen = typeof OffscreenCanvas !== "undefined";
    const exportCanvas: HTMLCanvasElement | OffscreenCanvas = useOffscreen
      ? new OffscreenCanvas(width, height)
      : (() => {
          const el = document.createElement("canvas");
          el.width = width;
          el.height = height;
          return el;
        })();

    const ctx = (exportCanvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    }) ?? exportCanvas.getContext("2d")) as Cinema2DContext | null;
    if (!ctx) throw new Error("Could not initialize 2D render context.");

    return exportViaMediabunnyCompositor({
      project: renderProject,
      isWebm,
      outputFormat,
      videoCodec,
      videoQuality,
      latencyMode,
      fps,
      totalFrames,
      canvas: exportCanvas,
      ctx,
      mixedAudio,
      frameBins,
      mediaElements: helpers.mediaElements,
      onProgress,
      signal,
    });
  }

  const domCanvas = document.createElement("canvas");
  domCanvas.width = width;
  domCanvas.height = height;
  const domCtx =
    domCanvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    }) ?? domCanvas.getContext("2d");
  if (!domCtx) throw new Error("Could not initialize 2D render context.");

  return exportViaMediaRecorder({
    project: renderProject,
    preferMp4: options.format === "mp4",
    fps,
    totalFrames,
    bitrate: videoBitrate,
    canvas: domCanvas,
    ctx: domCtx,
    mixedAudio,
    frameBins,
    mediaElements: helpers.mediaElements,
    onProgress,
    signal,
  });
}

async function exportViaMediabunnyCompositor(params: {
  project: CinemaProject;
  isWebm: boolean;
  outputFormat: Mp4OutputFormat | WebMOutputFormat;
  videoCodec: NonNullable<Awaited<ReturnType<typeof getFirstEncodableVideoCodec>>>;
  videoQuality: Quality;
  latencyMode: "realtime" | "quality";
  fps: 24 | 30 | 60;
  totalFrames: number;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: Cinema2DContext;
  mixedAudio: AudioBuffer | null;
  frameBins: Float32Array[];
  mediaElements: ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>;
  onProgress: (p: CinemaExportProgress) => void;
  signal?: AbortSignal;
}): Promise<CinemaExportResult> {
  const {
    project,
    isWebm,
    outputFormat,
    videoCodec,
    videoQuality,
    latencyMode,
    fps,
    totalFrames,
    canvas,
    ctx,
    mixedAudio,
    frameBins,
    mediaElements,
    onProgress,
    signal,
  } = params;

  const target = new BufferTarget();
  const output = new Output({
    format: outputFormat,
    target,
  });

  const canvasSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: videoQuality,
    keyFrameInterval: 2,
    latencyMode,
  });
  output.addVideoTrack(canvasSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (mixedAudio) {
    const audioQuality = new Quality({ bitrate: 128_000 });
    try {
      const audioCodec = await getFirstEncodableAudioCodec(
        outputFormat.getSupportedAudioCodecs(),
        {
          numberOfChannels: mixedAudio.numberOfChannels,
          sampleRate: mixedAudio.sampleRate,
          quality: audioQuality,
        },
      );
      if (audioCodec) {
        audioSource = new AudioBufferSource({
          codec: audioCodec,
          quality: audioQuality,
        });
        output.addAudioTrack(audioSource);
      }
    } catch {
      audioSource = null;
    }
  }

  const samplePool = new MediabunnySamplePool(project, mediaElements);

  try {
    await samplePool.initForTimeline(fps, totalFrames);
    await output.start();

    const frameDurMs = 1000 / fps;
    const frameDurSec = 1 / fps;
    const exportStartPerf = performance.now();
    let lastProgressPerf = exportStartPerf;
    let lastYieldPerf = exportStartPerf;
    let lastRenderedTimeMs = -1;

    // Pre-pull Frame 0 before the loop so decode(f+1) overlaps with encode(f) on every iteration
    let currentOverrides = samplePool.hasVideoClips
      ? await samplePool.pullFrame(0, 0)
      : new Map<string, CinemaDrawableMedia>();

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) {
        await output.cancel();
        throw new DOMException("Export cancelled", "AbortError");
      }

      const timeMs = f * frameDurMs;
      const canReuseStaticCanvas =
        !samplePool.hasVideoClips &&
        isCinemaFrameStaticSince(project, lastRenderedTimeMs, timeMs);

      if (!canReuseStaticCanvas) {
        renderCinemaFrame(ctx, project, timeMs, {
          mediaElements,
          clipMediaOverrides: currentOverrides,
          frequencyBins: frameBins[f],
          showSafeGuides: false,
          isExport: true,
        });
        lastRenderedTimeMs = timeMs;
      }

      // CanvasSource.add captures the canvas into a VideoSample synchronously before awaiting backpressure,
      // allowing us to decode Frame f+1 on the GPU decoder at the exact same time Frame f encodes!
      const encodePromise = canvasSource.add(f * frameDurSec, frameDurSec);
      const nextPrefetchPromise =
        samplePool.hasVideoClips && f + 1 < totalFrames
          ? samplePool.pullFrame(f + 1, (f + 1) * frameDurMs)
          : Promise.resolve(currentOverrides);

      const [, nextOverrides] = await Promise.all([encodePromise, nextPrefetchPromise]);
      currentOverrides = nextOverrides;

      const now = performance.now();
      if (now - lastYieldPerf >= 28) {
        lastYieldPerf = now;
        await yieldToEventLoop();
      }

      if (f === 0 || f === totalFrames - 1 || now - lastProgressPerf >= 90) {
        lastProgressPerf = now;
        const elapsedSec = Math.max(0.05, (now - exportStartPerf) / 1000);
        const exportedVideoSec = (f + 1) / fps;
        const speedMul = exportedVideoSec / elapsedSec;
        const currentFps = Math.round((f + 1) / elapsedSec);
        const speedTag = speedMul >= 1.1 ? ` · ${speedMul.toFixed(1)}× (${currentFps} fps)` : "";
        onProgress({
          phase: "rendering",
          progress: 0.08 + 0.8 * ((f + 1) / totalFrames),
          currentFrame: f + 1,
          totalFrames,
          fps: currentFps,
          speedMul,
          message: `Encoding frame ${f + 1} of ${totalFrames}${speedTag}…`,
        });
      }
    }

    canvasSource.close();

    if (audioSource && mixedAudio) {
      onProgress({
        phase: "muxing",
        progress: 0.9,
        currentFrame: totalFrames,
        totalFrames,
        message: "Encoding stereo audio mix…",
      });
      await audioSource.add(mixedAudio);
      audioSource.close();
    }

    onProgress({
      phase: "muxing",
      progress: 0.96,
      currentFrame: totalFrames,
      totalFrames,
      message: `Finalizing ${isWebm ? "WebM" : "MP4"} container…`,
    });

    await output.finalize();
    if (!target.buffer) {
      throw new Error("Mediabunny output buffer was empty after finalization.");
    }

    const mimeType = isWebm ? "video/webm" : "video/mp4";
    const ext = isWebm ? "webm" : "mp4";
    const blob = new Blob([target.buffer], { type: mimeType });
    const elapsedMs = Math.round(performance.now() - exportStartPerf);

    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: `${ext.toUpperCase()} ready in ${(elapsedMs / 1000).toFixed(1)}s.`,
    });

    return {
      blob,
      filename: `${safeFileSlug(project.title)}.${ext}`,
      mimeType,
      elapsedMs,
      engine: "mediabunny-compositor",
    };
  } finally {
    samplePool.dispose();
    if (output.state === "started") {
      try {
        await output.cancel();
      } catch {
        // Ignore
      }
    }
  }
}

async function exportViaMediaRecorder(params: {
  project: CinemaProject;
  preferMp4: boolean;
  fps: 24 | 30 | 60;
  totalFrames: number;
  bitrate: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mixedAudio: AudioBuffer | null;
  frameBins: Float32Array[];
  mediaElements: ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>;
  onProgress: (p: CinemaExportProgress) => void;
  signal?: AbortSignal;
}): Promise<CinemaExportResult> {
  const { project, preferMp4, fps, totalFrames, bitrate, canvas, ctx, mixedAudio, frameBins, mediaElements, onProgress, signal } =
    params;

  const mimeCandidates = preferMp4
    ? ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

  const mimeType =
    mimeCandidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ||
    "video/webm";

  const stream = canvas.captureStream(fps);
  let audioCtx: AudioContext | null = null;
  let audioSrc: AudioBufferSourceNode | null = null;

  if (mixedAudio) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtx();
    const dest = audioCtx.createMediaStreamDestination();
    audioSrc = audioCtx.createBufferSource();
    audioSrc.buffer = mixedAudio;
    audioSrc.connect(dest);
    for (const track of dest.stream.getAudioTracks()) {
      stream.addTrack(track);
    }
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error("Browser media recording failed."));
  });

  recorder.start(250);
  if (audioSrc) audioSrc.start();

  const durationMs = project.durationMs;
  const startPerf = performance.now();
  let lastProgressPerf = startPerf;
  let frameIdx = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const step = () => {
        if (signal?.aborted) {
          reject(new DOMException("Export cancelled", "AbortError"));
          return;
        }
        const now = performance.now();
        const elapsedMs = now - startPerf;
        frameIdx = Math.min(totalFrames - 1, Math.floor((elapsedMs / 1000) * fps));

        for (const clip of project.clips) {
          if (clip.kind !== "video" || clip.hidden) continue;
          const el = mediaElements.get(clip.assetId);
          if (!(el instanceof HTMLVideoElement)) continue;
          if (elapsedMs >= clip.startMs && elapsedMs <= clip.startMs + clip.durationMs) {
            const targetSec = (clip.trimStartMs + (elapsedMs - clip.startMs) * (clip.speed || 1)) / 1000;
            if (Math.abs(el.currentTime - targetSec) > 0.12) {
              el.currentTime = targetSec;
            }
          }
        }

        renderCinemaFrame(ctx, project, Math.min(durationMs, elapsedMs), {
          mediaElements,
          frequencyBins: frameBins[frameIdx],
          showSafeGuides: false,
          isExport: true,
        });

        if (now - lastProgressPerf >= 90 || elapsedMs >= durationMs) {
          lastProgressPerf = now;
          onProgress({
            phase: "rendering",
            progress: 0.08 + 0.88 * Math.min(1, elapsedMs / Math.max(1, durationMs)),
            currentFrame: frameIdx + 1,
            totalFrames,
            message: `Recording real-time output (${Math.round((elapsedMs / Math.max(1, durationMs)) * 100)}%)…`,
          });
        }

        if (elapsedMs >= durationMs) {
          resolve();
        } else {
          window.requestAnimationFrame(step);
        }
      };
      window.requestAnimationFrame(step);
    });
  } finally {
    if (audioSrc) {
      try {
        audioSrc.stop();
      } catch {
        // Ignore
      }
    }
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
    if (audioCtx) void audioCtx.close();
  }

  const blob = await stopPromise;
  const isMp4 = mimeType.includes("mp4");
  const elapsedMs = Math.round(performance.now() - startPerf);
  onProgress({
    phase: "done",
    progress: 1,
    currentFrame: totalFrames,
    totalFrames,
    message: isMp4 ? "MP4 export ready." : "WebM export ready.",
  });

  return {
    blob,
    filename: `${safeFileSlug(project.title)}.${isMp4 ? "mp4" : "webm"}`,
    mimeType,
    elapsedMs,
    engine: "mediarecorder",
  };
}
