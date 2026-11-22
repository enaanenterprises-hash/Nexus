import { ArrayBufferTarget, Muxer } from "mp4-muxer";
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
import { Mp4HardwareTrackDecoder } from "./mp4-demuxer";
import { resolutionForAspectRatio } from "./presets";
import type { CinemaExportOptions, CinemaExportProgress, CinemaProject, CinemaVideoClip } from "./types";

export interface CinemaExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  engine: "webcodecs-mp4" | "passthrough" | "mediarecorder" | "png" | "wav";
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

interface StreamerSlot {
  video: HTMLVideoElement;
  isClone: boolean;
  activeClipId: string | null;
  eofAtSec: number;
  rateMultiplier: number;
}

/**
 * Performs a single clean seek when entering a new video clip or jumping across a cut.
 * Never aborts in-flight seeks prematurely.
 */
function seekVideoOnceClean(slot: StreamerSlot, rawTargetSec: number): Promise<void> {
  const { video } = slot;
  if (video.readyState < 1) return Promise.resolve();
  if (!video.paused) video.pause();

  const finiteDur =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 0.025)
      : Infinity;
  const clampedSec = Math.max(0, Math.min(finiteDur, slot.eofAtSec, rawTargetSec));

  if (!video.seeking && Math.abs(video.currentTime - clampedSec) < 0.022) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      if (clampedSec - video.currentTime > 0.06 && video.currentTime > 0.05) {
        slot.eofAtSec = video.currentTime + 0.01;
      }
      resolve();
    };
    const onSeeked = () => {
      window.clearTimeout(timer);
      finish();
    };
    const timer = window.setTimeout(finish, 900);
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = clampedSec;
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });
}

/**
 * Waits for a continuously playing hardware-decoded `<video>` element to advance
 * to `minSec` without touching `video.currentTime` (zero GOP decoder flushes).
 */
function waitForForwardStreamFrame(
  slot: StreamerSlot,
  minSec: number,
  maxWaitMs = 150,
): Promise<boolean> {
  const { video } = slot;
  if (video.currentTime >= minSec || video.ended || minSec >= slot.eofAtSec) {
    return Promise.resolve(true);
  }

  const initialTime = video.currentTime;
  return new Promise<boolean>((resolve) => {
    let done = false;
    let rvfcId: number | null = null;
    const hasRvfc =
      typeof (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown })
        .requestVideoFrameCallback === "function";

    const finish = (advanced: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
      if (
        rvfcId !== null &&
        typeof (video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void })
          .cancelVideoFrameCallback === "function"
      ) {
        (
          video as HTMLVideoElement & { cancelVideoFrameCallback: (id: number) => void }
        ).cancelVideoFrameCallback(rvfcId);
      }
      resolve(advanced);
    };

    const check = () => {
      if (video.currentTime >= minSec || video.ended) {
        finish(true);
        return;
      }
      if (hasRvfc && !done) {
        rvfcId = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback(check);
      }
    };

    const pollTimer = window.setInterval(() => {
      if (video.currentTime >= minSec || video.ended) {
        finish(true);
      }
    }, 3);

    const timeoutTimer = window.setTimeout(() => {
      finish(video.currentTime > initialTime + 0.004 || video.currentTime >= minSec);
    }, maxWaitMs);

    if (hasRvfc) {
      rvfcId = (
        video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback(check);
    }
  });
}

function setSafePlaybackRate(video: HTMLVideoElement, rate: number): void {
  const safe = clamp(rate, 0.25, 4.0);
  if (Math.abs(video.playbackRate - safe) < 0.04) return;
  try {
    video.playbackRate = safe;
  } catch {
    try {
      video.playbackRate = clamp(safe, 0.5, 2.0);
    } catch {
      // Ignore rate constraint
    }
  }
}

/**
 * Streams `<video>` clips sequentially forward using the browser's hardware video
 * decoder (`video.play()` + proportional `playbackRate` control) instead of per-frame
 * `video.currentTime = ...` GOP seeking.
 *
 * Result: A 14-second video clip performs 1 initial seek instead of 420 GOP seeks,
 * reducing decoded frames from ~40,000 down to 420 (30x-50x faster).
 */
class SequentialVideoStreamer {
  private readonly project: CinemaProject;
  private readonly videoClips: CinemaVideoClip[];
  private readonly hwDecoders = new Map<string, Mp4HardwareTrackDecoder>();
  private readonly slots = new Map<string, StreamerSlot>();
  private readonly baseMedia: ReadonlyMap<string, CinemaDrawableMedia>;
  private readonly frameMedia = new Map<string, CinemaDrawableMedia>();

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

  private async loadAssetBlob(assetId: string, fallbackSrc?: string): Promise<Blob | null> {
    const asset = this.project.assets.find((a) => a.id === assetId);
    if (asset?.idbKey) {
      const idbBlob = await loadCinemaBlob(asset.idbKey);
      if (idbBlob && idbBlob.size > 0) return idbBlob;
    }
    const url = fallbackSrc || asset?.url;
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {
      // Ignore fetch failure
    }
    return null;
  }

  async init(useOffscreenClone = true): Promise<void> {
    if (this.videoClips.length === 0 || typeof document === "undefined") return;

    const uniqueAssetIds = Array.from(new Set(this.videoClips.map((c) => c.assetId)));
    await Promise.all(
      uniqueAssetIds.map(async (assetId) => {
        const base = this.baseMedia.get(assetId);
        // Pause stage preview video so CinemaView's "seeked" stage redraw listener stays quiet
        if (base instanceof HTMLVideoElement && !base.paused) {
          base.pause();
        }

        const src = base instanceof HTMLVideoElement ? base.currentSrc || base.src : undefined;

        // Tier 1: Direct ISO-BMFF (MP4 / MOV / fMP4) Demux + Hardware WebCodecs VideoDecoder (10x-25x real-time)
        if (useOffscreenClone) {
          const blob = await this.loadAssetBlob(assetId, src);
          if (blob) {
            const hwDecoder = await Mp4HardwareTrackDecoder.create(blob);
            if (hwDecoder) {
              this.hwDecoders.set(assetId, hwDecoder);
              return;
            }
          }
        }

        // Tier 2 Fallback (e.g. WebM containers): Continuous forward hardware <video> streamer (3.5x-4x real-time)
        if (!(base instanceof HTMLVideoElement)) return;
        let clone: HTMLVideoElement | null = null;
        if (useOffscreenClone && src) {
          clone = await this.createOffscreenVideo(src, base.crossOrigin);
        }

        const video = clone ?? base;
        this.frameMedia.set(assetId, video);
        this.slots.set(assetId, {
          video,
          isClone: Boolean(clone),
          activeClipId: null,
          eofAtSec: Infinity,
          rateMultiplier: 3.2,
        });
      }),
    );
  }

  private createOffscreenVideo(
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
      const timer = window.setTimeout(() => done(v.readyState >= 2 ? v : null), 900);
      v.addEventListener("loadeddata", onReady, { once: true });
      v.addEventListener("error", onError, { once: true });
      v.src = src;
      v.load();
    });
  }

  async syncAt(
    timeMs: number,
    streamForward = true,
  ): Promise<ReadonlyMap<string, CinemaDrawableMedia>> {
    if (this.videoClips.length === 0) return this.baseMedia;

    const activeNow = this.videoClips.filter(
      (c) => timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
    );
    const activeAssetIds = new Set(activeNow.map((c) => c.assetId));

    // Pause any streamer slot that is no longer active at this timestamp
    for (const [assetId, slot] of this.slots.entries()) {
      if (!activeAssetIds.has(assetId) && !slot.video.paused) {
        slot.video.pause();
        slot.activeClipId = null;
      }
    }

    if (activeNow.length === 0) return this.frameMedia;

    await Promise.all(
      activeNow.map(async (clip) => {
        const speed = clamp(clip.speed || 1, 0.25, 4);
        const rawTargetSec = Math.max(0, (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000);

        // Tier 1: Hardware WebCodecs MP4 VideoDecoder path (no playback clock limit)
        const hwDecoder = this.hwDecoders.get(clip.assetId);
        if (hwDecoder) {
          const decodedCanvas = await hwDecoder.decodeFrameAt(rawTargetSec);
          if (decodedCanvas) {
            this.frameMedia.set(clip.assetId, decodedCanvas);
            return;
          }
        }

        // Tier 2: Continuous forward hardware <video> streamer fallback
        const slot = this.slots.get(clip.assetId);
        if (!slot) return;
        const { video } = slot;
        const finiteDur =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.max(0, video.duration - 0.02)
            : Infinity;
        const targetSec = Math.max(0, Math.min(finiteDur, slot.eofAtSec, rawTargetSec));

        if (!streamForward) {
          await seekVideoOnceClean(slot, targetSec);
          return;
        }

        if (targetSec >= slot.eofAtSec || (video.ended && targetSec >= video.currentTime - 0.04)) {
          if (!video.paused) video.pause();
          return;
        }

        const deltaSec = targetSec - video.currentTime;

        // 1. Entering clip for the first time or large timeline cut discontinuity: single initial seek (remain paused while Frame 0 initializes VideoEncoder)
        if (slot.activeClipId !== clip.id || deltaSec < -0.35 || deltaSec > 0.85) {
          slot.activeClipId = clip.id;
          slot.rateMultiplier = 1.8;
          await seekVideoOnceClean(slot, targetSec);
          return;
        }

        // 2. Video hardware decoder is ahead of or inside the target frame window: pause so it never drifts ahead during canvas/encoder work
        if (deltaSec <= 0.015) {
          if (!video.paused) video.pause();
          return;
        }

        // 3. Video hardware decoder needs to step forward by 1 frame (~15-33ms): play forward until targetSec, then pause immediately
        slot.rateMultiplier = Math.min(3.2 / speed, slot.rateMultiplier * 1.04);
        setSafePlaybackRate(video, speed * slot.rateMultiplier);
        if (video.paused && !video.ended) {
          await video.play().catch(() => {});
        }

        const advanced = await waitForForwardStreamFrame(slot, targetSec - 0.012, 160);
        if (!video.paused) video.pause();
        if (!advanced && Math.abs(targetSec - video.currentTime) > 0.045) {
          await seekVideoOnceClean(slot, targetSec);
        }
      }),
    );

    return this.frameMedia;
  }

  dispose(): void {
    for (const hw of this.hwDecoders.values()) {
      hw.dispose();
    }
    this.hwDecoders.clear();
    for (const slot of this.slots.values()) {
      try {
        if (!slot.video.paused) slot.video.pause();
        if (slot.isClone) {
          slot.video.removeAttribute("src");
          slot.video.load();
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    this.slots.clear();
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

  const streamer = new SequentialVideoStreamer(project, runtime.mediaElements);
  try {
    await streamer.init(false);
    const frameMedia = await streamer.syncAt(timeMs, false);
    renderCinemaFrame(ctx, project, timeMs, {
      ...runtime,
      mediaElements: frameMedia,
      showSafeGuides: false,
      isExport: true,
    });
  } finally {
    streamer.dispose();
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

  // Order H.264 levels from the MINIMUM level required for (width, height, fps) upward.
  // Asking for Level 5.1 (0x33) on 720p/1080p30 can cause integrated GPUs (which top out at
  // Level 4.1/4.2 in hardware) to fall back to CPU OpenH264 software encoding.
  const is720pOrLower = width * height <= 1280 * 720 && width <= 1280 && height <= 1280 && fps <= 30;
  const is1080p30Standard =
    width * height <= 1920 * 1088 && width <= 1920 && height <= 1088 && fps <= 30;

  const candidates = is720pOrLower
    ? [
        "avc1.64001f",
        "avc1.4d001f",
        "avc1.42001f",
        "avc1.640028",
        "avc1.4d0028",
        "avc1.420028",
        "avc1.64002a",
        "avc1.42E01E",
      ]
    : is1080p30Standard
      ? [
          "avc1.640028",
          "avc1.4d0028",
          "avc1.420028",
          "avc1.640029",
          "avc1.4d0029",
          "avc1.64002a",
          "avc1.4d002a",
          "avc1.640032",
          "avc1.640033",
        ]
      : [
          "avc1.64002a",
          "avc1.4d002a",
          "avc1.42002a",
          "avc1.640032",
          "avc1.4d0032",
          "avc1.420032",
          "avc1.640033",
          "avc1.4d0033",
          "avc1.420033",
          "avc1.640028",
          "avc1.4d0028",
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

  const streamer = new SequentialVideoStreamer(project, mediaElements);

  try {
    await streamer.init(true);

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
        !streamer.hasVideoClips && isCinemaFrameStaticSince(project, lastRenderedTimeMs, timeMs);

      if (!canReuseStaticCanvas) {
        const frameMedia = streamer.hasVideoClips
          ? await streamer.syncAt(timeMs, true)
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
    streamer.dispose();
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
