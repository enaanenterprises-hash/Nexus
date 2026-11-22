import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type WrappedCanvas,
} from "mediabunny";
import { encodeWavFromBuffer } from "@/lib/studio/wav";
import { renderCinemaAudioOffline } from "./audio-engine";
import {
  computeProjectDurationMs,
  isCinemaFrameStaticSince,
  renderCinemaFrame,
  type CinemaDrawableMedia,
  type CinemaRenderRuntime,
} from "./compositor";
import { loadCinemaBlob } from "./media-db";
import { resolutionForAspectRatio } from "./presets";
import type { CinemaExportOptions, CinemaExportProgress, CinemaProject, CinemaVideoClip } from "./types";

export interface CinemaExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  engine: "mediabunny" | "webcodecs-mp4" | "passthrough" | "mediarecorder" | "png" | "wav";
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

interface ClipMediabunnyStream {
  clip: CinemaVideoClip;
  input: Input;
  iterator: AsyncGenerator<WrappedCanvas | null, void, unknown>;
  frameIndices: number[];
  cursor: number;
  lastCanvas: HTMLCanvasElement | OffscreenCanvas | null;
}

/**
 * Uses the pre-built `mediabunny` engine (`Input` + `ALL_FORMATS` + `CanvasSink.canvasesAtTimestamps`)
 * to demux and hardware-decode MP4, MOV, fMP4, WebM, and MKV video clips in a single forward pass.
 */
class MediabunnyTimelineDecoder {
  private readonly project: CinemaProject;
  private readonly videoClips: CinemaVideoClip[];
  private readonly baseMedia: ReadonlyMap<string, CinemaDrawableMedia>;
  private readonly frameMedia = new Map<string, CinemaDrawableMedia>();
  private readonly clipStreams: ClipMediabunnyStream[] = [];
  private readonly fallbackClips: CinemaVideoClip[] = [];

  constructor(
    project: CinemaProject,
    baseMedia: ReadonlyMap<string, CinemaDrawableMedia>,
  ) {
    this.project = project;
    this.baseMedia = baseMedia;
    for (const [k, v] of baseMedia.entries()) {
      this.frameMedia.set(k, v);
    }
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

  private async loadAssetBlob(assetId: string): Promise<Blob | null> {
    const asset = this.project.assets.find((a) => a.id === assetId);
    if (asset?.idbKey) {
      const idbBlob = await loadCinemaBlob(asset.idbKey);
      if (idbBlob && idbBlob.size > 0) return idbBlob;
    }
    const base = this.baseMedia.get(assetId);
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

  async initForTimeline(fps: number, totalFrames: number): Promise<void> {
    if (this.videoClips.length === 0) return;

    // Pause any stage preview <video> elements so CinemaView's "seeked" listener stays quiet
    for (const v of this.baseMedia.values()) {
      if (v instanceof HTMLVideoElement && !v.paused) {
        v.pause();
      }
    }

    const blobCache = new Map<string, Blob | null>();
    const frameDurMs = 1000 / fps;

    for (const clip of this.videoClips) {
      if (!blobCache.has(clip.assetId)) {
        blobCache.set(clip.assetId, await this.loadAssetBlob(clip.assetId));
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
            timestampsSec.push(firstTs + relSec);
          }
        }

        if (frameIndices.length === 0) {
          input.dispose();
          continue;
        }

        const sink = new CanvasSink(videoTrack, {
          poolSize: 4,
          decoderOptions: {
            optimizeForLatency: true,
          },
        });
        const iterator = sink.canvasesAtTimestamps(timestampsSec);

        this.clipStreams.push({
          clip,
          input,
          iterator,
          frameIndices,
          cursor: 0,
          lastCanvas: null,
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

  async syncFrame(
    frameIndex: number,
    timeMs: number,
  ): Promise<ReadonlyMap<string, CinemaDrawableMedia>> {
    if (this.videoClips.length === 0) return this.baseMedia;

    // 1. Advance all active Mediabunny CanvasSink streams for this frame index
    const activeStreams: ClipMediabunnyStream[] = [];
    for (const stream of this.clipStreams) {
      if (stream.cursor < stream.frameIndices.length && stream.frameIndices[stream.cursor] === frameIndex) {
        activeStreams.push(stream);
      }
    }

    if (activeStreams.length > 0) {
      await Promise.all(
        activeStreams.map(async (stream) => {
          stream.cursor++;
          try {
            const res = await stream.iterator.next();
            if (!res.done && res.value?.canvas) {
              stream.lastCanvas = res.value.canvas;
            }
          } catch {
            // Keep last decoded canvas if final packet encounters an EOF quirk
          }
          if (stream.lastCanvas) {
            this.frameMedia.set(stream.clip.assetId, stream.lastCanvas);
          }
        }),
      );
    }

    // 2. Fallback path for any clip that wasn't decodable by Mediabunny
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
          this.frameMedia.set(clip.assetId, el);
        }),
      );
    }

    return this.frameMedia;
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

export async function exportCurrentFramePng(
  project: CinemaProject,
  timeMs: number,
  runtime: CinemaRenderRuntime,
): Promise<CinemaExportResult> {
  const canvas = document.createElement("canvas");
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D export canvas.");

  const frameMedia = new Map<string, CinemaDrawableMedia>(runtime.mediaElements);
  const activeVideoClips = project.clips.filter(
    (c): c is CinemaVideoClip =>
      c.kind === "video" && !c.hidden && timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
  );

  for (const clip of activeVideoClips) {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    const blob = asset?.idbKey ? await loadCinemaBlob(asset.idbKey) : null;
    if (blob) {
      let input: Input | null = null;
      try {
        input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (track && (await track.canDecode())) {
          const firstTs = Math.max(0, await track.getFirstTimestamp());
          const speed = clamp(clip.speed || 1, 0.25, 4);
          const relSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);
          const sink = new CanvasSink(track);
          const wrapped = await sink.getCanvas(firstTs + relSec);
          if (wrapped?.canvas) {
            frameMedia.set(clip.assetId, wrapped.canvas);
          }
        }
      } catch {
        // Use existing media element if Mediabunny single-frame lookup fails
      } finally {
        input?.dispose();
      }
    }
  }

  renderCinemaFrame(ctx, project, timeMs, {
    ...runtime,
    mediaElements: frameMedia,
    showSafeGuides: false,
    isExport: true,
  });

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
    engine: "png",
  };
}

/**
 * Instant zero-re-encode passthrough when the timeline is a single unmodified video clip
 * with no extra overlays, text, filters, speed changes, or additional audio tracks.
 */
async function tryDirectVideoPassthrough(
  project: CinemaProject,
  options: CinemaExportOptions,
): Promise<CinemaExportResult | null> {
  if (options.format !== "mp4" && options.format !== "webm") return null;

  const activeTracks = new Map(project.tracks.filter((t) => !t.hidden).map((t) => [t.id, t]));
  const activeClips = project.clips.filter((c) => !c.hidden && activeTracks.has(c.trackId));
  if (activeClips.length !== 1) return null;

  const onlyClip = activeClips[0]!;
  if (onlyClip.kind !== "video") return null;
  if (onlyClip.startMs > 50 || onlyClip.trimStartMs > 50) return null;
  if (Math.abs((onlyClip.speed || 1) - 1) > 0.01) return null;
  if (Math.abs(onlyClip.durationMs - onlyClip.sourceDurationMs) > 150) return null;
  if (onlyClip.muted || Math.abs((onlyClip.volume ?? 1) - 1) > 0.05) return null;
  if ((onlyClip.fadeInMs || 0) > 10 || (onlyClip.fadeOutMs || 0) > 10) return null;

  const tf = onlyClip.transform;
  if (
    Math.abs(tf.x - 50) > 0.5 ||
    Math.abs(tf.y - 50) > 0.5 ||
    Math.abs(tf.width - 100) > 0.5 ||
    Math.abs(tf.height - 100) > 0.5 ||
    Math.abs(tf.rotation) > 0.1 ||
    Math.abs(tf.opacity - 1) > 0.01 ||
    tf.borderRadius > 0 ||
    tf.flipH ||
    tf.flipV
  ) {
    return null;
  }

  const flt = onlyClip.filter;
  if (
    Math.abs(flt.brightness - 1) > 0.01 ||
    Math.abs(flt.contrast - 1) > 0.01 ||
    Math.abs(flt.saturate - 1) > 0.01 ||
    Math.abs(flt.temperature) > 0.02 ||
    flt.blur > 0.1 ||
    flt.vignette > 0.02
  ) {
    return null;
  }

  if (onlyClip.animation.inType !== "none" || onlyClip.animation.outType !== "none") {
    return null;
  }

  const asset = project.assets.find((a) => a.id === onlyClip.assetId);
  if (!asset) return null;

  const targetMimePrefix = options.format === "mp4" ? "video/mp4" : "video/webm";
  if (!asset.mimeType.toLowerCase().startsWith(targetMimePrefix)) return null;

  let blob: Blob | null = asset.idbKey ? await loadCinemaBlob(asset.idbKey) : null;
  if (!blob && asset.url) {
    try {
      const res = await fetch(asset.url);
      if (res.ok) blob = await res.blob();
    } catch {
      blob = null;
    }
  }
  if (!blob || blob.size === 0) return null;

  return {
    blob,
    filename: `${safeFileSlug(project.title)}.${options.format}`,
    mimeType: targetMimePrefix,
    engine: "passthrough",
  };
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

  // Fast-path 0: Instant zero-re-encode container passthrough when unmodified single clip matches format
  const passthrough = await tryDirectVideoPassthrough(project, options);
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

  const { width, height } = resolutionForAspectRatio(project.aspectRatio, options.resolution);
  const videoBitrate =
    options.resolution === "1080p"
      ? options.quality === "high"
        ? 6_500_000
        : 3_800_000
      : options.quality === "high"
        ? 3_800_000
        : 2_200_000;

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
      engine: "wav",
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx =
    canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    }) ?? canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D render context.");

  // Primary Engine: Mediabunny (Input + CanvasSink + Output + CanvasSource + AudioBufferSource)
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
    return exportViaMediabunny({
      project: renderProject,
      isWebm,
      outputFormat,
      videoCodec,
      videoQuality,
      fps,
      totalFrames,
      canvas,
      ctx,
      mixedAudio,
      frameBins,
      mediaElements: helpers.mediaElements,
      onProgress,
      signal,
    });
  }

  return exportViaMediaRecorder({
    project: renderProject,
    preferMp4: options.format === "mp4",
    fps,
    totalFrames,
    bitrate: videoBitrate,
    canvas,
    ctx,
    mixedAudio,
    frameBins,
    mediaElements: helpers.mediaElements,
    onProgress,
    signal,
  });
}

async function exportViaMediabunny(params: {
  project: CinemaProject;
  isWebm: boolean;
  outputFormat: Mp4OutputFormat | WebMOutputFormat;
  videoCodec: NonNullable<Awaited<ReturnType<typeof getFirstEncodableVideoCodec>>>;
  videoQuality: Quality;
  fps: 24 | 30 | 60;
  totalFrames: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
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
    latencyMode: "realtime",
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

  const timelineDecoder = new MediabunnyTimelineDecoder(project, mediaElements);

  try {
    await timelineDecoder.initForTimeline(fps, totalFrames);
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
        !timelineDecoder.hasVideoClips &&
        isCinemaFrameStaticSince(project, lastRenderedTimeMs, timeMs);

      if (!canReuseStaticCanvas) {
        const frameMedia = timelineDecoder.hasVideoClips
          ? await timelineDecoder.syncFrame(f, timeMs)
          : mediaElements;

        renderCinemaFrame(ctx, project, timeMs, {
          mediaElements: frameMedia,
          frequencyBins: frameBins[f],
          showSafeGuides: false,
          isExport: true,
        });
        lastRenderedTimeMs = timeMs;
      }

      await canvasSource.add(f * frameDurSec, frameDurSec);

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
        const speedTag = speedMul >= 1.1 ? ` · ${speedMul.toFixed(1)}× speed` : "";
        onProgress({
          phase: "rendering",
          progress: 0.08 + 0.8 * ((f + 1) / totalFrames),
          currentFrame: f + 1,
          totalFrames,
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

    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: `${ext.toUpperCase()} export ready.`,
    });

    return {
      blob,
      filename: `${safeFileSlug(project.title)}.${ext}`,
      mimeType,
      engine: "mediabunny",
    };
  } finally {
    timelineDecoder.dispose();
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
            message: `Recording real-time WebM output (${Math.round((elapsedMs / Math.max(1, durationMs)) * 100)}%)…`,
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
    engine: "mediarecorder",
  };
}
