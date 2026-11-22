import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { encodeWavFromBuffer } from "@/lib/studio/wav";
import { renderCinemaAudioOffline } from "./audio-engine";
import {
  computeProjectDurationMs,
  isCinemaFrameStaticSince,
  renderCinemaFrame,
  type CinemaRenderRuntime,
} from "./compositor";
import { resolutionForAspectRatio } from "./presets";
import type { CinemaExportOptions, CinemaExportProgress, CinemaProject, CinemaVideoClip } from "./types";

export interface CinemaExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  engine: "webcodecs-mp4" | "mediarecorder" | "png" | "wav";
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

/**
 * Zero-delay macrotask yield via MessageChannel (~0.02ms vs 4-16ms for setTimeout(0)).
 */
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

/**
 * Event-driven backpressure for WebCodecs VideoEncoder/AudioEncoder using `dequeue`
 * instead of 10-16ms timer polling.
 */
function waitForEncoderCapacity(
  encoder: VideoEncoder | AudioEncoder,
  maxQueue: number,
): Promise<void> {
  if (encoder.encodeQueueSize <= maxQueue || encoder.state !== "configured") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      encoder.removeEventListener("dequeue", onDequeue);
      resolve();
    };
    const onDequeue = () => {
      if (encoder.encodeQueueSize <= maxQueue || encoder.state !== "configured") {
        window.clearTimeout(timer);
        finish();
      }
    };
    const timer = window.setTimeout(finish, 18);
    encoder.addEventListener("dequeue", onDequeue);
  });
}

const SOURCE_VIDEO_QUANT_FPS = 30;

function quantizeVideoTimeSec(sec: number): number {
  return Math.round(Math.max(0, sec) * SOURCE_VIDEO_QUANT_FPS) / SOURCE_VIDEO_QUANT_FPS;
}

interface VideoDecoderSlot {
  video: HTMLVideoElement;
  isClone: boolean;
  targetQuantSec: number;
  eofAtSec: number;
  pending: Promise<void>;
}

function seekSlotFast(slot: VideoDecoderSlot, rawTargetSec: number): Promise<void> {
  const { video } = slot;
  if (video.readyState < 1) return Promise.resolve();

  const finiteDur =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 0.025)
      : Infinity;
  const clampedSec = Math.max(0, Math.min(finiteDur, slot.eofAtSec, rawTargetSec));
  const quantSec = quantizeVideoTimeSec(clampedSec);

  if (
    Math.abs(slot.targetQuantSec - quantSec) < 0.018 ||
    Math.abs(video.currentTime - clampedSec) < 0.024
  ) {
    slot.targetQuantSec = quantSec;
    return slot.pending;
  }

  slot.targetQuantSec = quantSec;
  const job = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      // Detect EOF clamping on unindexed WebM blobs where video.duration === Infinity
      if (clampedSec - video.currentTime > 0.055 && video.currentTime > 0.05) {
        slot.eofAtSec = video.currentTime + 0.01;
      }
      resolve();
    };
    const onSeeked = () => {
      window.clearTimeout(timer);
      finish();
    };
    const timer = window.setTimeout(finish, 65);
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = clampedSec;
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });

  slot.pending = job;
  return job;
}

class ExportVideoSeekPool {
  private readonly videoClips: CinemaVideoClip[];
  private readonly pools = new Map<string, VideoDecoderSlot[]>();
  private readonly baseMedia: ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>;
  private readonly frameMedia = new Map<string, HTMLVideoElement | HTMLImageElement>();

  constructor(
    project: CinemaProject,
    baseMedia: ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>,
  ) {
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

  async init(CloneCountPerAsset = 2): Promise<void> {
    if (this.videoClips.length === 0 || typeof document === "undefined") return;

    const uniqueAssetIds = Array.from(new Set(this.videoClips.map((c) => c.assetId)));
    await Promise.all(
      uniqueAssetIds.map(async (assetId) => {
        const base = this.baseMedia.get(assetId);
        if (!(base instanceof HTMLVideoElement)) return;
        if (!base.paused) base.pause();

        const slots: VideoDecoderSlot[] = [
          {
            video: base,
            isClone: false,
            targetQuantSec: quantizeVideoTimeSec(base.currentTime),
            eofAtSec: Infinity,
            pending: Promise.resolve(),
          },
        ];

        const src = base.currentSrc || base.src;
        if (src && CloneCountPerAsset > 0) {
          const clones = await Promise.all(
            Array.from({ length: CloneCountPerAsset }, () => this.createReadyClone(src, base.crossOrigin)),
          );
          for (const clone of clones) {
            if (clone) {
              slots.push({
                video: clone,
                isClone: true,
                targetQuantSec: -1,
                eofAtSec: Infinity,
                pending: Promise.resolve(),
              });
            }
          }
        }

        this.pools.set(assetId, slots);
      }),
    );
  }

  private createReadyClone(
    src: string,
    crossOrigin: string | null,
  ): Promise<HTMLVideoElement | null> {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      if (crossOrigin) v.crossOrigin = crossOrigin;

      let settled = false;
      const done = (result: HTMLVideoElement | null) => {
        if (settled) return;
        settled = true;
        v.removeEventListener("loadeddata", onReady);
        v.removeEventListener("error", onError);
        resolve(result);
      };
      const onReady = () => {
        window.clearTimeout(timer);
        done(v);
      };
      const onError = () => {
        window.clearTimeout(timer);
        done(null);
      };
      const timer = window.setTimeout(() => done(v.readyState >= 2 ? v : null), 150);
      v.addEventListener("loadeddata", onReady, { once: true });
      v.addEventListener("error", onError, { once: true });
      v.src = src;
      v.load();
    });
  }

  private targetSecForClipAt(clip: CinemaVideoClip, timeMs: number): number {
    const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
    return (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000;
  }

  /**
   * Synchronizes all active video clips for `timeMs` and pipelined-prefetches
   * upcoming frame timestamps on idle pool slots in the background.
   */
  async syncAt(
    timeMs: number,
    lookaheadTimesMs: number[],
  ): Promise<ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>> {
    if (this.videoClips.length === 0) return this.baseMedia;

    const activeNow = this.videoClips.filter(
      (c) => timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
    );
    if (activeNow.length === 0) return this.baseMedia;

    const currentWaits: Promise<void>[] = [];
    const activeSlotsThisFrame = new Set<VideoDecoderSlot>();

    for (const clip of activeNow) {
      const slots = this.pools.get(clip.assetId);
      if (!slots || slots.length === 0) continue;

      const targetSec = this.targetSecForClipAt(clip, timeMs);
      const quantSec = quantizeVideoTimeSec(targetSec);

      // 1. Prefer a slot that is already positioned or seeking to this quantized frame
      let chosen = slots.find((s) => Math.abs(s.targetQuantSec - quantSec) < 0.018);
      if (!chosen) {
        chosen = slots[0]!;
        // Rotate slot order so least-recently-used slot is picked next
        slots.push(slots.shift()!);
      }

      activeSlotsThisFrame.add(chosen);
      currentWaits.push(seekSlotFast(chosen, targetSec));
      this.frameMedia.set(clip.assetId, chosen.video);

      // 2. Pipeline-prefetch upcoming frames onto idle slots in parallel (non-blocking)
      if (slots.length > 1) {
        for (const futureMs of lookaheadTimesMs) {
          if (futureMs < clip.startMs || futureMs > clip.startMs + clip.durationMs) continue;
          const futureSec = this.targetSecForClipAt(clip, futureMs);
          const futureQuant = quantizeVideoTimeSec(futureSec);
          if (Math.abs(futureQuant - quantSec) < 0.018) continue;
          if (slots.some((s) => Math.abs(s.targetQuantSec - futureQuant) < 0.018)) continue;

          const idleSlot = slots.find((s) => !activeSlotsThisFrame.has(s));
          if (idleSlot) {
            activeSlotsThisFrame.add(idleSlot);
            void seekSlotFast(idleSlot, futureSec);
          }
        }
      }
    }

    if (currentWaits.length > 0) {
      await Promise.all(currentWaits);
    }
    return this.frameMedia;
  }

  dispose(): void {
    for (const slots of this.pools.values()) {
      for (const slot of slots) {
        if (!slot.isClone) continue;
        try {
          slot.video.pause();
          slot.video.removeAttribute("src");
          slot.video.load();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    this.pools.clear();
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

  const pool = new ExportVideoSeekPool(project, runtime.mediaElements);
  try {
    await pool.init(0);
    const frameMedia = await pool.syncAt(timeMs, []);
    renderCinemaFrame(ctx, project, timeMs, {
      ...runtime,
      mediaElements: frameMedia,
      showSafeGuides: false,
      isExport: true,
    });
  } finally {
    pool.dispose();
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
    engine: "png",
  };
}

export async function supportsWebCodecsMp4(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<{ supported: boolean; codec?: string; config?: VideoEncoderConfig }> {
  if (
    typeof window === "undefined" ||
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return { supported: false };
  }

  // Test Levels 5.1 (0x33), 5.0 (0x32), 4.2 (0x2a), 4.0 (0x28), and 3.1 (0x1f)
  // across High, Main, and Baseline profiles so 1080p60, 9:16 (1080x1920), and 21:9 (2560x1080)
  // always engage WebCodecs hardware encoding instead of falling back to 1x MediaRecorder.
  const candidates = [
    "avc1.640033",
    "avc1.640032",
    "avc1.64002a",
    "avc1.640028",
    "avc1.4d0033",
    "avc1.4d0032",
    "avc1.4d002a",
    "avc1.4d0028",
    "avc1.420033",
    "avc1.420032",
    "avc1.42002a",
    "avc1.420028",
    "avc1.42001f",
    "avc1.42E01E",
  ];

  // First pass: prefer hardware encoder + realtime zero-B-frame latency mode for maximum throughput
  for (const codec of candidates) {
    try {
      const fastCfg: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: "prefer-hardware",
        latencyMode: "realtime",
        avc: { format: "avc" },
      };
      const support = await VideoEncoder.isConfigSupported(fastCfg);
      if (support.supported) {
        return { supported: true, codec, config: support.config ?? fastCfg };
      }
    } catch {
      // Try next candidate
    }
  }

  // Second pass: default acceleration profile fallback
  for (const codec of candidates) {
    try {
      const baseCfg: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        avc: { format: "avc" },
      };
      const support = await VideoEncoder.isConfigSupported(baseCfg);
      if (support.supported) {
        return { supported: true, codec, config: support.config ?? baseCfg };
      }
    } catch {
      // Try next H.264 profile
    }
  }

  return { supported: false };
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
  const videoBitrate =
    options.resolution === "1080p"
      ? options.quality === "high"
        ? 6_800_000
        : 4_200_000
      : options.quality === "high"
        ? 4_000_000
        : 2_500_000;

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

  if (options.format === "mp4") {
    const codecCheck = await supportsWebCodecsMp4(width, height, fps, videoBitrate);
    const hasAudioEncoder = typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined";

    let audioEncodeSupported = false;
    if (mixedAudio && hasAudioEncoder) {
      try {
        const aSup = await AudioEncoder.isConfigSupported({
          codec: "mp4a.40.2",
          numberOfChannels: 2,
          sampleRate: mixedAudio.sampleRate,
          bitrate: 128_000,
        });
        audioEncodeSupported = Boolean(aSup.supported);
      } catch {
        audioEncodeSupported = false;
      }
    }

    if (codecCheck.supported && codecCheck.codec) {
      return exportViaWebCodecsMp4({
        project: renderProject,
        codec: codecCheck.codec,
        encoderConfig: codecCheck.config,
        fps,
        totalFrames,
        bitrate: videoBitrate,
        canvas,
        ctx,
        mixedAudio: audioEncodeSupported ? mixedAudio : null,
        frameBins,
        mediaElements: helpers.mediaElements,
        onProgress,
        signal,
      });
    }
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

async function exportViaWebCodecsMp4(params: {
  project: CinemaProject;
  codec: string;
  encoderConfig?: VideoEncoderConfig;
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
  const {
    project,
    codec,
    encoderConfig,
    fps,
    totalFrames,
    bitrate,
    canvas,
    ctx,
    mixedAudio,
    frameBins,
    mediaElements,
    onProgress,
    signal,
  } = params;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: {
      codec: "avc",
      width: project.width,
      height: project.height,
      frameRate: fps,
    },
    ...(mixedAudio
      ? {
          audio: {
            codec: "aac",
            numberOfChannels: 2,
            sampleRate: mixedAudio.sampleRate,
          },
        }
      : {}),
  });

  let encodeError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure(
    encoderConfig ?? {
      codec,
      width: project.width,
      height: project.height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "realtime",
      avc: { format: "avc" },
    },
  );

  let audioEncoder: AudioEncoder | null = null;
  if (mixedAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => {
        encodeError = err instanceof Error ? err : new Error(String(err));
      },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      numberOfChannels: 2,
      sampleRate: mixedAudio.sampleRate,
      bitrate: 128_000,
    });
  }

  const seekPool = new ExportVideoSeekPool(project, mediaElements);

  try {
    await seekPool.init(2);

    const frameDurUs = Math.round(1_000_000 / fps);
    const frameDurMs = 1000 / fps;
    const exportStartPerf = performance.now();
    let lastProgressPerf = exportStartPerf;
    let lastYieldPerf = exportStartPerf;
    let lastRenderedTimeMs = -1;

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) {
        throw new DOMException("Export cancelled", "AbortError");
      }
      if (encodeError) throw encodeError;

      if (videoEncoder.encodeQueueSize > 18) {
        await waitForEncoderCapacity(videoEncoder, 12);
      }

      const timeMs = f * frameDurMs;
      const canReuseStaticCanvas =
        !seekPool.hasVideoClips && isCinemaFrameStaticSince(project, lastRenderedTimeMs, timeMs);

      if (!canReuseStaticCanvas) {
        const frameMedia = seekPool.hasVideoClips
          ? await seekPool.syncAt(timeMs, [(f + 1) * frameDurMs, (f + 2) * frameDurMs])
          : mediaElements;

        renderCinemaFrame(ctx, project, timeMs, {
          mediaElements: frameMedia,
          frequencyBins: frameBins[f],
          showSafeGuides: false,
          isExport: true,
        });
        lastRenderedTimeMs = timeMs;
      }

      const timestampUs = f * frameDurUs;
      const frame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurUs,
      });
      const keyFrame = f === 0 || f % (fps * 2) === 0;
      try {
        videoEncoder.encode(frame, { keyFrame });
      } finally {
        frame.close();
      }

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

    if (audioEncoder && mixedAudio) {
      onProgress({
        phase: "muxing",
        progress: 0.9,
        currentFrame: totalFrames,
        totalFrames,
        message: "Encoding AAC stereo mix…",
      });
      const ch0 = mixedAudio.getChannelData(0);
      const ch1 = mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : ch0;
      const sr = mixedAudio.sampleRate;
      const chunkFrames = 4096;

      for (let offset = 0; offset < mixedAudio.length; offset += chunkFrames) {
        if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
        if (audioEncoder.encodeQueueSize > 24) {
          await waitForEncoderCapacity(audioEncoder, 12);
        }
        const count = Math.min(chunkFrames, mixedAudio.length - offset);
        const planar = new Float32Array(count * 2);
        planar.set(ch0.subarray(offset, offset + count), 0);
        planar.set(ch1.subarray(offset, offset + count), count);

        const audioData = new AudioData({
          format: "f32-planar",
          sampleRate: sr,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((offset / sr) * 1_000_000),
          data: planar,
        });
        try {
          audioEncoder.encode(audioData);
        } finally {
          audioData.close();
        }
      }
      await audioEncoder.flush();
    }

    onProgress({
      phase: "muxing",
      progress: 0.96,
      currentFrame: totalFrames,
      totalFrames,
      message: "Finalizing MP4 container…",
    });

    await videoEncoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: "video/mp4" });
    onProgress({
      phase: "done",
      progress: 1,
      currentFrame: totalFrames,
      totalFrames,
      message: "MP4 export ready.",
    });

    return {
      blob,
      filename: `${safeFileSlug(project.title)}.mp4`,
      mimeType: "video/mp4",
      engine: "webcodecs-mp4",
    };
  } finally {
    seekPool.dispose();
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {
      // Ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    } catch {
      // Ignore
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
