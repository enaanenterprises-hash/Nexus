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
  latencyMode: "realtime" | "quality";
}

/**
 * Probes WebCodecs hardware video encoding (`hardwareAcceleration: 'prefer-hardware'`)
 * first so NVENC / QuickSync / VideoToolbox accelerate exports, falling back safely
 * to `'no-preference'` when a given codec/resolution lacks HW encode support.
 */
export async function probeHardwareVideoEncode(
  outputFormat: Mp4OutputFormat | WebMOutputFormat,
  params: {
    width: number;
    height: number;
    videoQuality: Quality;
    fps: number;
  },
): Promise<HardwareEncodeSelection | null> {
  const codecs = outputFormat.getSupportedVideoCodecs();
  const { width, height, videoQuality, fps } = params;

  // 1. Prefer the first codec that genuinely supports hardware-accelerated encoding
  for (const codec of codecs) {
    try {
      const hwRealtimeOk = await canEncodeVideo(codec, {
        width,
        height,
        quality: videoQuality,
        frameRate: fps,
        hardwareAcceleration: "prefer-hardware",
        latencyMode: "realtime",
      });
      if (hwRealtimeOk) {
        return {
          codec,
          hardwareAcceleration: "prefer-hardware",
          latencyMode: "realtime",
        };
      }
      const hwQualityOk = await canEncodeVideo(codec, {
        width,
        height,
        quality: videoQuality,
        frameRate: fps,
        hardwareAcceleration: "prefer-hardware",
        latencyMode: "quality",
      });
      if (hwQualityOk) {
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

  // 2. Fallback to browser-selected encoder ('no-preference')
  try {
    const fallbackCodec = await getFirstEncodableVideoCodec(codecs, {
      width,
      height,
      quality: videoQuality,
      frameRate: fps,
    });
    if (!fallbackCodec) return null;

    let latencyMode: "realtime" | "quality" = "quality";
    try {
      const realtimeOk = await canEncodeVideo(fallbackCodec, {
        width,
        height,
        quality: videoQuality,
        frameRate: fps,
        hardwareAcceleration: "no-preference",
        latencyMode: "realtime",
      });
      if (realtimeOk) latencyMode = "realtime";
    } catch {
      latencyMode = "quality";
    }
    return {
      codec: fallbackCodec,
      hardwareAcceleration: "no-preference",
      latencyMode,
    };
  } catch {
    return null;
  }
}

interface ClipSampleStream {
  clip: CinemaVideoClip;
  input: Input;
  iterator: AsyncGenerator<VideoSample | null, void, unknown>;
  frameIndices: number[];
  cursor: number;
}

function closeSamplesMap(samples: Map<string, CinemaDrawableMedia>): void {
  for (const drawable of samples.values()) {
    if (drawable instanceof VideoSample) {
      try {
        drawable.close();
      } catch {
        // Ignore already-closed sample
      }
    }
  }
  samples.clear();
}

/**
 * Worker-safe Mediabunny `VideoSampleSink` pool:
 * - Uses `optimizeForLatency: false` for full hardware B-frame/batch decoder pipelining.
 * - Clamps requested timestamps cleanly inside `[firstTs, trackEnd]` so EOF never drops frames.
 * - Does NOT retain old `VideoSample` references across frames; callers close every `VideoSample`
 *   immediately after `renderCinemaFrame(...)` draws it to keep GPU VideoFrame pools clear.
 */
class WorkerSamplePool {
  private readonly project: CinemaProject;
  private readonly videoClips: CinemaVideoClip[];
  private readonly assetBlobs: ReadonlyMap<string, Blob>;
  private readonly fallbackMediaElements?: ReadonlyMap<string, CinemaDrawableMedia>;
  private readonly inWorker: boolean;
  private readonly clipStreams: ClipSampleStream[] = [];
  private readonly fallbackClips: CinemaVideoClip[] = [];

  constructor(
    project: CinemaProject,
    assetBlobs: ReadonlyMap<string, Blob>,
    inWorker: boolean,
    fallbackMediaElements?: ReadonlyMap<string, CinemaDrawableMedia>,
  ) {
    this.project = project;
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

  async initForTimeline(fps: number, totalFrames: number): Promise<void> {
    if (this.videoClips.length === 0) return;

    const frameDurMs = 1000 / fps;

    for (const clip of this.videoClips) {
      const blob = this.assetBlobs.get(clip.assetId);
      if (!blob) {
        if (this.inWorker) {
          throw new WorkerFallbackRequiredError(`Missing video blob for clip ${clip.id}`);
        }
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
          if (this.inWorker) {
            throw new WorkerFallbackRequiredError(`Undecodable video track for clip ${clip.id}`);
          }
          this.fallbackClips.push(clip);
          continue;
        }

        const firstTs = Math.max(0, await videoTrack.getFirstTimestamp());
        const computedDur = await videoTrack.computeDuration().catch(() => 0);
        const maxValidTs =
          Number.isFinite(computedDur) && computedDur > 0.04
            ? firstTs + Math.max(0.0005, computedDur - 0.015)
            : Number.POSITIVE_INFINITY;

        const speed = clamp(clip.speed || 1, 0.25, 4);
        const frameIndices: number[] = [];
        const timestampsSec: number[] = [];

        for (let f = 0; f < totalFrames; f++) {
          const timeMs = f * frameDurMs;
          if (timeMs >= clip.startMs && timeMs <= clip.startMs + clip.durationMs) {
            const relSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);
            frameIndices.push(f);
            timestampsSec.push(Math.min(maxValidTs, firstTs + relSec + 0.0005));
          }
        }

        if (frameIndices.length === 0) {
          input.dispose();
          continue;
        }

        // Batch export benefits from decoder pipelining (`optimizeForLatency: false`)
        const sink = new VideoSampleSink(videoTrack, {
          optimizeForLatency: false,
        });
        const iterator = sink.samplesAtTimestamps(timestampsSec);

        this.clipStreams.push({
          clip,
          input,
          iterator,
          frameIndices,
          cursor: 0,
        });
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
        this.fallbackClips.push(clip);
      }
    }
  }

  /**
   * Decodes the `VideoSample`s for `frameIndex`. Caller MUST close all returned
   * `VideoSample`s immediately after `renderCinemaFrame(...)` completes!
   */
  async pullFrame(
    frameIndex: number,
    timeMs: number,
  ): Promise<Map<string, CinemaDrawableMedia>> {
    const overrides = new Map<string, CinemaDrawableMedia>();
    if (this.videoClips.length === 0) return overrides;

    const activeStreams: ClipSampleStream[] = [];
    for (const stream of this.clipStreams) {
      if (
        stream.cursor < stream.frameIndices.length &&
        stream.frameIndices[stream.cursor] === frameIndex
      ) {
        activeStreams.push(stream);
      }
    }

    if (activeStreams.length > 0) {
      await Promise.all(
        activeStreams.map(async (stream) => {
          stream.cursor++;
          try {
            const res = await stream.iterator.next();
            if (!res.done && res.value) {
              overrides.set(stream.clip.id, res.value);
            }
          } catch {
            // Skip malformed trailing packet safely
          }
        }),
      );
    }

    if (!this.inWorker && this.fallbackClips.length > 0 && this.fallbackMediaElements) {
      const activeFallbacks = this.fallbackClips.filter(
        (c) => timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
      );
      await Promise.all(
        activeFallbacks.map(async (clip) => {
          const el = this.fallbackMediaElements?.get(clip.assetId);
          if (typeof HTMLVideoElement === "undefined" || !(el instanceof HTMLVideoElement) || el.readyState < 1) {
            return;
          }
          const speed = clamp(clip.speed || 1, 0.25, 4);
          const targetSec = Math.max(
            0,
            (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000,
          );
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
                clearTimeout(timer);
                finish();
              };
              const timer = setTimeout(finish, 250);
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
        }),
      );
    }

    return overrides;
  }

  dispose(): void {
    for (const stream of this.clipStreams) {
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

/**
 * Tier 0B core: Mediabunny `Conversion` (direct packet-copy trim/remux or hardware-accelerated
 * canvas-free transcode). Runs identically inside `export.worker.ts` or on the main thread.
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
    const willTranscodeVideo = needsResize || !canCopyVideoCodec;

    const videoQuality = new Quality({
      bitrate: videoBitrate,
      bitrateMode: "variable",
    });

    // Probe hardware encoder preference ONLY when transcoding is actually required
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
      copy: {
        mode: "preferred",
        shiftTolerance: 0.15,
        boundaryPolicy: "expand",
      },
      video: {
        ...(needsResize ? { width, height, fit, frameRate: fps } : {}),
        ...(rotation90 !== 0 ? { rotate: rotation90 } : {}),
        ...(flipH ? { flip: true } : {}),
        // Omit quality & hardwareAcceleration when stream-copying so Mediabunny never forces a transcode
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
        ? "Starting Mediabunny hardware conversion (Worker)…"
        : "Starting Mediabunny zero-re-encode remux…",
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

/**
 * Tier 1 core: Full multi-layer Mediabunny GPU compositor (`OffscreenCanvas` + `VideoSampleSink`
 * + `CanvasSource` + `AudioSampleSource`) with:
 * - `hardwareAcceleration: 'prefer-hardware'` video encoding (with automatic safe fallback)
 * - Immediate `sample.close()` after every single frame draw (zero GPU VideoFrame starvation)
 * - Overlapped `Promise.all` encode(f) + decode(f+1)
 * - Zero `requestAnimationFrame` throttling
 */
export async function runMediabunnyCompositorCore(
  params: CompositorCoreParams,
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
    latencyMode: encodeChoice.latencyMode,
    hardwareAcceleration: encodeChoice.hardwareAcceleration,
  });
  output.addVideoTrack(canvasSource, { frameRate: fps });

  let audioSource: AudioSampleSource | null = null;
  if (audioMix && audioMix.length > 0 && audioMix.channels.length > 0) {
    const audioQuality = new Quality({ bitrate: 128_000 });
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

  const samplePool = new WorkerSamplePool(
    project,
    assetBlobs,
    inWorker,
    fallbackMediaElements,
  );

  let currentOverrides = new Map<string, CinemaDrawableMedia>();

  try {
    await samplePool.initForTimeline(fps, totalFrames);
    await output.start();

    const frameDurMs = 1000 / fps;
    const frameDurSec = 1 / fps;
    const exportStartPerf = performance.now();
    let lastProgressPerf = exportStartPerf;
    let lastYieldPerf = exportStartPerf;
    let lastRenderedTimeMs = -1;

    // Pre-pull Frame 0 before the tight loop (never RAF-throttled!)
    if (samplePool.hasVideoClips) {
      currentOverrides = await samplePool.pullFrame(0, 0);
    }

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) {
        closeSamplesMap(currentOverrides);
        await output.cancel();
        throw new DOMException("Export cancelled", "AbortError");
      }

      const timeMs = f * frameDurMs;
      const canReuseStaticCanvas =
        !samplePool.hasVideoClips &&
        isCinemaFrameStaticSince(project, lastRenderedTimeMs, timeMs);

      try {
        if (!canReuseStaticCanvas) {
          renderCinemaFrame(ctx, project, timeMs, {
            mediaElements: mediaMap,
            clipMediaOverrides: currentOverrides,
            frequencyBins: frameBins[f],
            showSafeGuides: false,
            isExport: true,
          });
          lastRenderedTimeMs = timeMs;
        }
      } finally {
        // Immediately close every VideoSample right after drawing to release WebCodecs GPU surfaces
        closeSamplesMap(currentOverrides);
      }

      // Overlap GPU encode(f) with hardware decode(f+1) with zero stale GPU frames pinned
      const encodePromise = canvasSource.add(f * frameDurSec, frameDurSec);
      const nextPrefetchPromise =
        samplePool.hasVideoClips && f + 1 < totalFrames
          ? samplePool.pullFrame(f + 1, (f + 1) * frameDurMs)
          : Promise.resolve(currentOverrides);

      const [, nextOverrides] = await Promise.all([encodePromise, nextPrefetchPromise]);
      currentOverrides = nextOverrides;

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
        const speedTag = speedMul >= 1.1 ? ` · ${hwLabel}${speedMul.toFixed(1)}× (${currentFps} fps)` : "";
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

    closeSamplesMap(currentOverrides);
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
      const maxFramesPerChunk = Math.max(1024, Math.floor((sampleRate * 5) / Math.max(1, numberOfChannels)));
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
    closeSamplesMap(currentOverrides);
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
