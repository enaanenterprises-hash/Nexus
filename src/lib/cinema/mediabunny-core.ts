import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
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
import {
  isCinemaFrameStaticSince,
  renderCinemaFrame,
  type Cinema2DContext,
  type CinemaDrawableMedia,
} from "./compositor";
import type {
  CinemaExportProgress,
  CinemaImageClip,
  CinemaProject,
  CinemaVideoClip,
} from "./types";

export class WorkerFallbackRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerFallbackRequiredError";
  }
}

export interface TransferableAudioMix {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  channels: Float32Array[];
}

export interface ConversionCoreParams {
  blob: Blob;
  format: "mp4" | "webm";
  width: number;
  height: number;
  fps: 24 | 30 | 60;
  videoBitrate: number;
  totalFrames: number;
  trimStartMs: number;
  durationMs: number;
  fit: "cover" | "contain";
  rotation90: 0 | 90 | 180 | 270;
  flipH: boolean;
  audioMutedOrDetached: boolean;
  onProgress: (p: CinemaExportProgress) => void;
  signal?: AbortSignal;
}

export interface CompositorCoreParams {
  project: CinemaProject;
  format: "mp4" | "webm";
  fps: 24 | 30 | 60;
  totalFrames: number;
  videoBitrate: number;
  assetBlobs: ReadonlyMap<string, Blob>;
  audioMix: TransferableAudioMix | null;
  frameBins: Float32Array[];
  /** Optional fallback DOM media map (only populated when running on main thread). */
  fallbackMediaElements?: ReadonlyMap<string, CinemaDrawableMedia>;
  /** True when executing inside a Web Worker (no DOM yields needed, strict OffscreenCanvas). */
  inWorker: boolean;
  onProgress: (p: CinemaExportProgress) => void;
  signal?: AbortSignal;
}

export interface CoreBinaryOutput {
  buffer: ArrayBuffer;
  mimeType: string;
  ext: "mp4" | "webm";
  elapsedMs: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function yieldToMainThread(): Promise<void> {
  if (typeof MessageChannel !== "undefined") {
    return new Promise<void>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(null);
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export interface HardwareEncodeSelection {
  codec: NonNullable<Awaited<ReturnType<typeof getFirstEncodableVideoCodec>>>;
  hardwareAcceleration: "prefer-hardware" | "no-preference";
  latencyMode: "quality";
}

/**
 * Probes WebCodecs video encoding with `latencyMode: 'quality'` ONLY.
 *
 * CRITICAL: Offline exports must NEVER use `latencyMode: 'realtime'`, because WebCodecs
 * encoders (NVENC / MediaFoundation / VideoToolbox / OpenH264) are explicitly permitted
 * to drop frames in `'realtime'` mode when frames arrive faster than real-time.
 * `'quality'` guarantees zero dropped frames and full visual sharpness while still
 * accelerating via GPU hardware when `hardwareAcceleration: 'prefer-hardware'` is supported.
 */
export async function probeHardwareVideoEncode(
  outputFormat: Mp4OutputFormat | WebMOutputFormat,
  params: {
    width: number;
    height: number;
    videoQuality: Quality;
    fps: number;
    allowHardware?: boolean;
  },
): Promise<HardwareEncodeSelection | null> {
  const codecs = outputFormat.getSupportedVideoCodecs();
  const { width, height, videoQuality, fps, allowHardware = true } = params;

  // 1. Prefer the first codec supporting hardware-accelerated quality-mode encoding
  if (allowHardware) {
    for (const codec of codecs) {
      try {
        const hwOk = await canEncodeVideo(codec, {
          width,
          height,
          quality: videoQuality,
          frameRate: fps,
          hardwareAcceleration: "prefer-hardware",
          latencyMode: "quality",
        });
        if (hwOk) {
          return {
            codec,
            hardwareAcceleration: "prefer-hardware",
            latencyMode: "quality",
          };
        }
      } catch {
        // Try next supported codec
      }
    }
  }

  // 2. Safe fallback to browser-selected encoder ('no-preference') in quality mode
  try {
    const fallbackCodec = await getFirstEncodableVideoCodec(codecs, {
      width,
      height,
      quality: videoQuality,
      frameRate: fps,
    });
    if (!fallbackCodec) return null;
    return {
      codec: fallbackCodec,
      hardwareAcceleration: "no-preference",
      latencyMode: "quality",
    };
  } catch {
    return null;
  }
}

interface ActiveSequentialStream {
  clip: CinemaVideoClip;
  input: Input;
  iterator: AsyncGenerator<VideoSample, void, unknown>;
  firstTs: number;
  currentSample: VideoSample | null;
  nextSample: VideoSample | null;
  exhausted: boolean;
}

function closeSampleSafe(sample: VideoSample | null | undefined): void {
  if (!sample) return;
  try {
    sample.close();
  } catch {
    // Ignore already-closed sample
  }
}

/**
 * Sequential, zero-missing-frame Mediabunny `VideoSampleSink.samples()` decoder pool:
 * - Uses Mediabunny's continuous `samples(start, end)` stream (zero GOP decoder flushes,
 *   proper HEVC/H.264 B-frame presentation ordering, internal 4-frame lookahead pump).
 * - Opens each clip's `Input` + `VideoDecoder` lazily only while active on the timeline and
 *   disposes it immediately once the clip ends (never exhausts GPU decoder session limits).
 * - Holds at most 1 current sample (`currentSample`) + 1 lookahead (`nextSample`) per active
 *   clip, closing every superseded `VideoSample` immediately to prevent GPU memory exhaustion.
 * - Guarantees Frame 0 and trailing/VFR frames never render blank/missing frames.
 */
class SequentialSamplePool {
  private readonly videoClips: CinemaVideoClip[];
  private readonly assetBlobs: ReadonlyMap<string, Blob>;
  private readonly fallbackMediaElements?: ReadonlyMap<string, CinemaDrawableMedia>;
  private readonly inWorker: boolean;
  private readonly activeStreams = new Map<string, ActiveSequentialStream>();
  private readonly finishedClipIds = new Set<string>();
  private readonly fallbackClipIds = new Set<string>();

  constructor(
    project: CinemaProject,
    assetBlobs: ReadonlyMap<string, Blob>,
    inWorker: boolean,
    fallbackMediaElements?: ReadonlyMap<string, CinemaDrawableMedia>,
  ) {
    this.assetBlobs = assetBlobs;
    this.inWorker = inWorker;
    this.fallbackMediaElements = fallbackMediaElements;
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

  private async openClipStream(clip: CinemaVideoClip): Promise<ActiveSequentialStream | null> {
    const blob = this.assetBlobs.get(clip.assetId);
    if (!blob) {
      if (this.inWorker) {
        throw new WorkerFallbackRequiredError(`Missing video blob for clip ${clip.id}`);
      }
      this.fallbackClipIds.add(clip.id);
      return null;
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
        if (this.inWorker) {
          throw new WorkerFallbackRequiredError(`Undecodable video track for clip ${clip.id}`);
        }
        this.fallbackClipIds.add(clip.id);
        return null;
      }

      const firstTs = Math.max(0, await videoTrack.getFirstTimestamp());
      const speed = clamp(clip.speed || 1, 0.25, 4);
      const startSec = firstTs + Math.max(0, clip.trimStartMs / 1000);
      // Add generous +0.6s end headroom so Mediabunny never drops the clip's closing frame
      const endSec = startSec + (clip.durationMs * speed) / 1000 + 0.6;

      // Batch export uses full hardware decoder pipelining (`optimizeForLatency: false`)
      const sink = new VideoSampleSink(videoTrack, {
        optimizeForLatency: false,
      });
      const iterator = sink.samples(startSec, endSec);

      // Prime initial sample + 1 lookahead sample so Frame 0 is guaranteed non-null
      const firstRes = await iterator.next();
      const currentSample = !firstRes.done ? firstRes.value : null;
      let nextSample: VideoSample | null = null;
      let exhausted = firstRes.done === true;

      if (!exhausted) {
        const secondRes = await iterator.next();
        if (secondRes.done) {
          exhausted = true;
        } else {
          nextSample = secondRes.value;
        }
      }

      const stream: ActiveSequentialStream = {
        clip,
        input,
        iterator,
        firstTs,
        currentSample,
        nextSample,
        exhausted,
      };
      this.activeStreams.set(clip.id, stream);
      return stream;
    } catch (err) {
      if (input) {
        try {
          input.dispose();
        } catch {
          // Ignore
        }
      }
      if (err instanceof WorkerFallbackRequiredError) throw err;
      if (this.inWorker) {
        throw new WorkerFallbackRequiredError(
          err instanceof Error ? err.message : "Worker video decode initialization failed",
        );
      }
      this.fallbackClipIds.add(clip.id);
      return null;
    }
  }

  private closeStream(clipId: string): void {
    const stream = this.activeStreams.get(clipId);
    if (!stream) return;
    this.activeStreams.delete(clipId);
    closeSampleSafe(stream.currentSample);
    closeSampleSafe(stream.nextSample);
    stream.currentSample = null;
    stream.nextSample = null;
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

  private async advanceStreamTo(
    stream: ActiveSequentialStream,
    targetSec: number,
  ): Promise<VideoSample | null> {
    // Advance until `nextSample` lies strictly after `targetSec` (closing every skipped sample immediately)
    while (stream.nextSample && stream.nextSample.timestamp <= targetSec + 0.002) {
      closeSampleSafe(stream.currentSample);
      stream.currentSample = stream.nextSample;
      stream.nextSample = null;
      if (!stream.exhausted) {
        try {
          const res = await stream.iterator.next();
          if (res.done) {
            stream.exhausted = true;
          } else {
            stream.nextSample = res.value;
          }
        } catch {
          stream.exhausted = true;
        }
      }
    }
    return stream.currentSample;
  }

  /**
   * Returns exact, frame-accurate drawables for every video clip visible at `timeMs`.
   * Immediately closes and disposes any clip streams whose timeline span has ended.
   */
  async getSamplesForTime(timeMs: number): Promise<Map<string, CinemaDrawableMedia>> {
    const overrides = new Map<string, CinemaDrawableMedia>();
    if (this.videoClips.length === 0) return overrides;

    // 1. Dispose any active stream whose clip has already ended on the timeline
    for (const [clipId, stream] of Array.from(this.activeStreams.entries())) {
      if (timeMs > stream.clip.startMs + stream.clip.durationMs + 2) {
        this.closeStream(clipId);
        this.finishedClipIds.add(clipId);
      }
    }

    // 2. Collect clips visible at `timeMs`
    const visibleClips: CinemaVideoClip[] = [];
    for (const clip of this.videoClips) {
      if (timeMs >= clip.startMs && timeMs <= clip.startMs + clip.durationMs) {
        visibleClips.push(clip);
      }
    }
    if (visibleClips.length === 0) return overrides;

    // 3. Advance (or lazily open) each visible clip concurrently
    await Promise.all(
      visibleClips.map(async (clip) => {
        const speed = clamp(clip.speed || 1, 0.25, 4);
        const relSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);

        if (!this.fallbackClipIds.has(clip.id) && !this.finishedClipIds.has(clip.id)) {
          let stream = this.activeStreams.get(clip.id) ?? null;
          if (!stream) {
            stream = await this.openClipStream(clip);
          }
          if (stream) {
            const sample = await this.advanceStreamTo(stream, stream.firstTs + relSec);
            if (sample) {
              overrides.set(clip.id, sample);
              return;
            }
          }
        }

        // Main-thread fallback for codecs unsupported by WebCodecs VideoDecoder
        if (!this.inWorker && this.fallbackMediaElements) {
          const el = this.fallbackMediaElements.get(clip.assetId);
          if (
            typeof HTMLVideoElement === "undefined" ||
            !(el instanceof HTMLVideoElement) ||
            el.readyState < 1
          ) {
            return;
          }
          const finiteDur =
            Number.isFinite(el.duration) && el.duration > 0
              ? Math.max(0, el.duration - 0.025)
              : relSec;
          const clamped = Math.min(finiteDur, relSec);
          if (Math.abs(el.currentTime - clamped) > 0.02) {
            await new Promise<void>((resolve) => {
              let done = false;
              const finish = () => {
                if (done) return;
                done = true;
                el.removeEventListener("seeked", onSeeked);
                resolve();
              };
              const onSeeked = () => {
                clearTimeout(timer);
                finish();
              };
              const timer = setTimeout(finish, 300);
              el.addEventListener("seeked", onSeeked, { once: true });
              try {
                el.currentTime = clamped;
              } catch {
                clearTimeout(timer);
                finish();
              }
            });
          }
          overrides.set(clip.id, el);
        }
      }),
    );

    return overrides;
  }

  dispose(): void {
    for (const clipId of Array.from(this.activeStreams.keys())) {
      this.closeStream(clipId);
    }
    this.finishedClipIds.clear();
    this.fallbackClipIds.clear();
  }
}

/**
 * Tier 0B core: Mediabunny `Conversion` for single-clip remuxes, mutes, rotations,
 * frame-accurate trims, and direct hardware resizes without 2D canvas overhead.
 *
 * - Pure untrimmed remux/mute/rotation: zero-re-encode packet stream copy (`copy: preferred`).
 * - Trimmed or resized clips: frame-accurate hardware transcode in `'quality'` mode so cuts
 *   never suffer keyframe-boundary missing/frozen opening frames.
 */
export async function runMediabunnyConversionCore(
  params: ConversionCoreParams,
): Promise<CoreBinaryOutput | null> {
  const {
    blob,
    format,
    width,
    height,
    fps,
    videoBitrate,
    totalFrames,
    trimStartMs,
    durationMs,
    fit,
    rotation90,
    flipH,
    audioMutedOrDetached,
    onProgress,
    signal,
  } = params;

  const startedPerf = performance.now();
  const isWebm = format === "webm";
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
    const trimStart = firstTs + trimStartMs / 1000;
    const trimEnd = Math.min(
      firstTs + Math.max(0.25, srcDur),
      trimStart + durationMs / 1000,
    );
    const isTrimmed = trimStartMs > 40 || trimEnd < firstTs + srcDur - 0.18;

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

    // Only stream-copy when untrimmed; trimmed cuts transcode cleanly for exact frame accuracy
    const willTranscodeVideo = isTrimmed || needsResize || !canCopyVideoCodec;

    const videoQuality = new Quality({
      bitrate: videoBitrate,
      bitrateMode: "variable",
    });

    let hwAccel: "prefer-hardware" | "no-preference" = "no-preference";
    if (willTranscodeVideo) {
      const probed = await probeHardwareVideoEncode(outputFormat, {
        width,
        height,
        videoQuality,
        fps,
      });
      if (probed) {
        hwAccel = probed.hardwareAcceleration;
      }
    }

    conversion = await Conversion.init({
      input,
      output,
      ...(isTrimmed ? { trim: { start: trimStart, end: trimEnd } } : {}),
      ...(!isTrimmed
        ? {
            copy: {
              mode: "preferred",
              shiftTolerance: 0.1,
              boundaryPolicy: "expand",
            },
          }
        : {}),
      video: {
        ...(needsResize ? { width, height, fit, frameRate: fps } : {}),
        ...(willTranscodeVideo ? { forceTranscode: true } : {}),
        ...(rotation90 !== 0 ? { rotate: rotation90 } : {}),
        ...(flipH ? { flip: true } : {}),
        ...(willTranscodeVideo
          ? { quality: videoQuality, hardwareAcceleration: hwAccel }
          : {}),
      },
      audio: audioMutedOrDetached ? { discard: true } : {},
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
      const doneSec = p * (durationMs / 1000);
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
        ? "Starting frame-accurate hardware conversion…"
        : "Starting zero-re-encode stream remux…",
    });

    await conversion.execute();
    if (!target.buffer || target.buffer.byteLength === 0) return null;

    const mimeType = isWebm ? "video/webm" : "video/mp4";
    const ext = isWebm ? "webm" : "mp4";
    const elapsedMs = Math.round(performance.now() - startedPerf);

    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: `${ext.toUpperCase()} ready in ${(elapsedMs / 1000).toFixed(1)}s.`,
    });

    return {
      buffer: target.buffer,
      mimeType,
      ext,
      elapsedMs,
    };
  } catch (err) {
    if (
      signal?.aborted ||
      err instanceof ConversionCanceledError ||
      (err as DOMException)?.name === "AbortError"
    ) {
      throw new DOMException("Export cancelled", "AbortError");
    }
    return null;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    input?.dispose();
  }
}

async function runCompositorPass(
  params: CompositorCoreParams,
  allowHardware: boolean,
): Promise<CoreBinaryOutput | null> {
  const {
    project,
    format,
    fps,
    totalFrames,
    videoBitrate,
    assetBlobs,
    audioMix,
    frameBins,
    fallbackMediaElements,
    inWorker,
    onProgress,
    signal,
  } = params;

  const isWebm = format === "webm";
  const outputFormat = isWebm
    ? new WebMOutputFormat()
    : new Mp4OutputFormat({ fastStart: "in-memory" });
  const videoQuality = new Quality({
    bitrate: videoBitrate,
    bitrateMode: "variable",
  });

  const encodeChoice = await probeHardwareVideoEncode(outputFormat, {
    width: project.width,
    height: project.height,
    videoQuality,
    fps,
    allowHardware,
  });
  if (!encodeChoice) return null;

  let exportCanvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== "undefined") {
    exportCanvas = new OffscreenCanvas(project.width, project.height);
  } else if (!inWorker && typeof document !== "undefined") {
    const el = document.createElement("canvas");
    el.width = project.width;
    el.height = project.height;
    exportCanvas = el;
  } else {
    throw new WorkerFallbackRequiredError("OffscreenCanvas unavailable");
  }

  const ctx = (exportCanvas.getContext("2d", {
    alpha: false,
    willReadFrequently: false,
  }) ?? exportCanvas.getContext("2d")) as Cinema2DContext | null;
  if (!ctx) throw new Error("Could not initialize 2D OffscreenCanvas render context.");

  // Decode image clips into GPU ImageBitmaps inside the Worker (or reuse DOM images on fallback)
  const decodedBitmaps: ImageBitmap[] = [];
  const mediaMap = new Map<string, CinemaDrawableMedia>();
  if (fallbackMediaElements) {
    for (const [k, v] of fallbackMediaElements) mediaMap.set(k, v);
  }
  const activeImageAssetIds = new Set(
    project.clips
      .filter((c): c is CinemaImageClip => c.kind === "image" && !c.hidden)
      .map((c) => c.assetId),
  );
  if (typeof createImageBitmap === "function") {
    for (const assetId of activeImageAssetIds) {
      const imgBlob = assetBlobs.get(assetId);
      if (!imgBlob) continue;
      try {
        const bitmap = await createImageBitmap(imgBlob);
        decodedBitmaps.push(bitmap);
        mediaMap.set(assetId, bitmap);
      } catch {
        // Keep fallback media entry if any
      }
    }
  }

  const target = new BufferTarget();
  const output = new Output({
    format: outputFormat,
    target,
  });

  const canvasSource = new CanvasSource(exportCanvas, {
    codec: encodeChoice.codec,
    quality: videoQuality,
    keyFrameInterval: 2,
    latencyMode: "quality",
    hardwareAcceleration: encodeChoice.hardwareAcceleration,
  });
  output.addVideoTrack(canvasSource, { frameRate: fps });

  let audioSource: AudioSampleSource | null = null;
  if (audioMix && audioMix.length > 0 && audioMix.channels.length > 0) {
    const audioQuality = new Quality({ bitrate: 160_000 });
    try {
      const audioCodec = await getFirstEncodableAudioCodec(
        outputFormat.getSupportedAudioCodecs(),
        {
          numberOfChannels: audioMix.numberOfChannels,
          sampleRate: audioMix.sampleRate,
          quality: audioQuality,
        },
      );
      if (audioCodec) {
        audioSource = new AudioSampleSource({
          codec: audioCodec,
          quality: audioQuality,
        });
        output.addAudioTrack(audioSource);
      }
    } catch {
      audioSource = null;
    }
  }

  const samplePool = new SequentialSamplePool(
    project,
    assetBlobs,
    inWorker,
    fallbackMediaElements,
  );

  try {
    await output.start();

    const frameDurMs = 1000 / fps;
    const frameDurSec = 1 / fps;
    const exportStartPerf = performance.now();
    let lastProgressPerf = exportStartPerf;
    let lastYieldPerf = exportStartPerf;
    let lastRenderedTimeMs = -1;

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
        const clipMediaOverrides = samplePool.hasVideoClips
          ? await samplePool.getSamplesForTime(timeMs)
          : undefined;

        renderCinemaFrame(ctx, project, timeMs, {
          mediaElements: mediaMap,
          clipMediaOverrides,
          frequencyBins: frameBins[f],
          showSafeGuides: false,
          isExport: true,
        });
        lastRenderedTimeMs = timeMs;
      }

      // Snapshots OffscreenCanvas synchronously & awaits encoder backpressure cleanly (0 dropped frames).
      // Mediabunny's internal VideoSampleSink.samples() pump pre-decodes 4 frames ahead concurrently!
      await canvasSource.add(f / fps, frameDurSec);

      // Only yield when running on the main thread fallback; inside the Web Worker run full speed
      const now = performance.now();
      if (!inWorker && now - lastYieldPerf >= 28) {
        lastYieldPerf = now;
        await yieldToMainThread();
      }

      if (f === 0 || f === totalFrames - 1 || now - lastProgressPerf >= 90) {
        lastProgressPerf = now;
        const elapsedSec = Math.max(0.05, (now - exportStartPerf) / 1000);
        const exportedVideoSec = (f + 1) / fps;
        const speedMul = exportedVideoSec / elapsedSec;
        const currentFps = Math.round((f + 1) / elapsedSec);
        const hwLabel = encodeChoice.hardwareAcceleration === "prefer-hardware" ? "HW · " : "";
        const speedTag = speedMul >= 1.05 ? ` · ${hwLabel}${speedMul.toFixed(1)}× (${currentFps} fps)` : "";
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

    // Release all remaining decoded video samples before muxing audio & finalizing container
    samplePool.dispose();
    canvasSource.close();

    if (audioSource && audioMix && audioMix.length > 0) {
      onProgress({
        phase: "muxing",
        progress: 0.9,
        currentFrame: totalFrames,
        totalFrames,
        message: "Encoding stereo audio mix…",
      });

      const { sampleRate, numberOfChannels, length, channels } = audioMix;
      const maxFramesPerChunk = Math.max(
        1024,
        Math.floor((sampleRate * 5) / Math.max(1, numberOfChannels)),
      );
      let offset = 0;

      while (offset < length) {
        if (signal?.aborted) {
          await output.cancel();
          throw new DOMException("Export cancelled", "AbortError");
        }
        const framesToCopy = Math.min(maxFramesPerChunk, length - offset);
        const chunkData = new Float32Array(numberOfChannels * framesToCopy);
        for (let ch = 0; ch < numberOfChannels; ch++) {
          const srcChannel = channels[Math.min(ch, channels.length - 1)]!;
          chunkData.set(srcChannel.subarray(offset, offset + framesToCopy), ch * framesToCopy);
        }
        const audioSample = new AudioSample({
          format: "f32-planar",
          sampleRate,
          numberOfChannels,
          timestamp: offset / sampleRate,
          data: chunkData,
        });
        try {
          await audioSource.add(audioSample);
        } finally {
          audioSample.close();
        }
        offset += framesToCopy;
      }
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
    const elapsedMs = Math.round(performance.now() - exportStartPerf);

    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: `${ext.toUpperCase()} ready in ${(elapsedMs / 1000).toFixed(1)}s.`,
    });

    return {
      buffer: target.buffer,
      mimeType,
      ext,
      elapsedMs,
    };
  } finally {
    samplePool.dispose();
    for (const bmp of decodedBitmaps) {
      try {
        bmp.close();
      } catch {
        // Ignore
      }
    }
    if (output.state === "started") {
      try {
        await output.cancel();
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Tier 1 core: Full multi-layer Mediabunny GPU compositor (`OffscreenCanvas` + continuous
 * `VideoSampleSink.samples()` + `CanvasSource` + `AudioSampleSource`).
 * Automatically retries with `'no-preference'` if a GPU driver rejects `'prefer-hardware'` mid-run.
 */
export async function runMediabunnyCompositorCore(
  params: CompositorCoreParams,
): Promise<CoreBinaryOutput | null> {
  try {
    return await runCompositorPass(params, true);
  } catch (err) {
    if (
      params.signal?.aborted ||
      (err as DOMException)?.name === "AbortError" ||
      err instanceof WorkerFallbackRequiredError
    ) {
      throw err;
    }
    // Retry once without forcing hardwareAcceleration in case a driver rejected 'prefer-hardware'
    return runCompositorPass(params, false);
  }
}
