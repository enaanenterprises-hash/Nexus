import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSample,
  VideoSampleSink,
} from "mediabunny";
import { encodeWavFromBuffer } from "@/lib/studio/wav";
import { renderCinemaAudioOffline } from "./audio-engine";
import {
  computeProjectDurationMs,
  renderCinemaFrame,
  type CinemaDrawableMedia,
  type CinemaRenderRuntime,
} from "./compositor";
import type { ExportWorkerRequest, ExportWorkerResponse } from "./export.worker";
import { loadCinemaBlob } from "./media-db";
import {
  runMediabunnyCompositorCore,
  runMediabunnyConversionCore,
  type CoreBinaryOutput,
  type TransferableAudioMix,
} from "./mediabunny-core";
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
      label: "Mediabunny Worker Remux / HW Conversion",
      detail: "Off-main-thread packet copy & hardware WebCodecs",
    };
  }
  return {
    label: "Mediabunny Worker GPU Compositor",
    detail: "OffscreenCanvas Web Worker · prefer-hardware WebCodecs",
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
    (typeof HTMLVideoElement !== "undefined" && base instanceof HTMLVideoElement
      ? base.currentSrc || base.src
      : typeof HTMLImageElement !== "undefined" && base instanceof HTMLImageElement
        ? base.currentSrc || base.src
        : undefined) || asset?.url;
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch {
    // Ignore fetch failure
  }
  return null;
}

function audioBufferToTransferable(buffer: AudioBuffer | null): {
  mix: TransferableAudioMix | null;
  transfer: Transferable[];
} {
  if (!buffer || buffer.length === 0) {
    return { mix: null, transfer: [] };
  }
  const channels: Float32Array[] = [];
  const transfer: Transferable[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const copy = new Float32Array(buffer.length);
    buffer.copyFromChannel(copy, ch);
    channels.push(copy);
    transfer.push(copy.buffer);
  }
  return {
    mix: {
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
      length: buffer.length,
      channels,
    },
    transfer,
  };
}

/**
 * Runs a Mediabunny export job inside our dedicated ES-Module Web Worker (`export.worker.ts`)
 * so `Input`, `Conversion`, `VideoSampleSink`, `OffscreenCanvas`, `CanvasSource`, and `Output`
 * never block the main UI thread. Returns `null` if the worker requests fallback or cannot start.
 */
async function runInExportWorker(
  request: Exclude<ExportWorkerRequest, { type: "cancel" }>,
  transfer: Transferable[],
  onProgress: (p: CinemaExportProgress) => void,
  signal?: AbortSignal,
): Promise<CoreBinaryOutput | null> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    return null;
  }
  if (signal?.aborted) {
    throw new DOMException("Export cancelled", "AbortError");
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./export.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }

  return new Promise<CoreBinaryOutput | null>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const finishResolve = (val: CoreBinaryOutput | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };
    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onAbort = () => {
      try {
        worker.postMessage({ type: "cancel" } satisfies ExportWorkerRequest);
      } catch {
        // Ignore
      }
      finishReject(new DOMException("Export cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress(msg.progress);
      } else if (msg.type === "done") {
        finishResolve({
          buffer: msg.buffer,
          mimeType: msg.mimeType,
          ext: msg.ext,
          elapsedMs: msg.elapsedMs,
        });
      } else if (msg.type === "fallback") {
        finishResolve(null);
      } else if (msg.type === "aborted") {
        finishReject(new DOMException("Export cancelled", "AbortError"));
      } else if (msg.type === "error") {
        // Let caller fall back cleanly to main thread core on worker-specific runtime errors
        finishResolve(null);
      }
    };

    worker.onerror = () => {
      finishResolve(null);
    };

    try {
      worker.postMessage(request, transfer);
    } catch {
      finishResolve(null);
    }
  });
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
 * Tier 0B: Mediabunny `Conversion` running in `export.worker.ts` (with main-thread fallback)
 * for single-clip trims, mutes, 90° rotations, horizontal flips, remuxes, and hardware resizes.
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

  const workerRequest: Extract<ExportWorkerRequest, { type: "conversion" }> = {
    type: "conversion",
    blob,
    format: options.format,
    width,
    height,
    fps,
    videoBitrate,
    totalFrames,
    trimStartMs: candidate.clip.trimStartMs,
    durationMs: candidate.clip.durationMs,
    fit: candidate.clip.fit,
    rotation90: candidate.rotation90,
    flipH: candidate.clip.transform.flipH,
    audioMutedOrDetached: candidate.audioMutedOrDetached,
  };

  // Run off the main thread first; seamlessly fall back to main-thread core if worker unavailable
  let result = await runInExportWorker(workerRequest, [], onProgress, signal);
  if (!result) {
    result = await runMediabunnyConversionCore({
      blob,
      format: options.format,
      width,
      height,
      fps,
      videoBitrate,
      totalFrames,
      trimStartMs: candidate.clip.trimStartMs,
      durationMs: candidate.clip.durationMs,
      fit: candidate.clip.fit,
      rotation90: candidate.rotation90,
      flipH: candidate.clip.transform.flipH,
      audioMutedOrDetached: candidate.audioMutedOrDetached,
      onProgress,
      signal,
    });
  }
  if (!result) return null;

  return {
    blob: new Blob([result.buffer], { type: result.mimeType }),
    filename: `${safeFileSlug(project.title)}.${result.ext}`,
    mimeType: result.mimeType,
    elapsedMs: result.elapsedMs,
    engine: "mediabunny-conversion",
  };
}

function resolveVideoBitrate(options: CinemaExportOptions): number {
  if (options.resolution === "4k") {
    return options.quality === "high" ? 38_000_000 : 24_000_000;
  }
  if (options.resolution === "1080p") {
    return options.quality === "high" ? 15_000_000 : 9_000_000;
  }
  return options.quality === "high" ? 8_000_000 : 5_000_000;
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

  // Pause live stage <video> elements so background preview decoding doesn't contend with export
  for (const el of helpers.mediaElements.values()) {
    if (typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement && !el.paused) {
      el.pause();
    }
  }

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

  // Tier 0B: Off-main-thread Mediabunny Conversion (packet copy trim/remux or HW canvas-free transcode)
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

  // Resolve all active video & image asset Blobs once (zero-copy structured-cloned into Worker)
  const activeTrackIds = new Set(
    renderProject.tracks.filter((t) => t.kind !== "audio" && !t.hidden).map((t) => t.id),
  );
  const neededAssetIds = new Set<string>();
  for (const clip of renderProject.clips) {
    if ((clip.kind === "video" || clip.kind === "image") && !clip.hidden && activeTrackIds.has(clip.trackId)) {
      neededAssetIds.add(clip.assetId);
    }
  }
  const assetBlobs = new Map<string, Blob>();
  await Promise.all(
    Array.from(neededAssetIds).map(async (assetId) => {
      const blob = await resolveAssetBlob(renderProject, assetId, helpers.mediaElements);
      if (blob) assetBlobs.set(assetId, blob);
    }),
  );

  const exportFormat: "mp4" | "webm" = options.format === "webm" ? "webm" : "mp4";

  // Tier 1A: Off-main-thread Web Worker Mediabunny GPU Compositor (OffscreenCanvas + prefer-hardware)
  const workerAudio = audioBufferToTransferable(mixedAudio);
  const workerBinsCopy = frameBins.map((b) => new Float32Array(b));
  const workerTransfer: Transferable[] = [
    ...workerAudio.transfer,
    ...workerBinsCopy.map((b) => b.buffer),
  ];

  let compositorResult = await runInExportWorker(
    {
      type: "compositor",
      project: renderProject,
      format: exportFormat,
      fps,
      totalFrames,
      videoBitrate,
      assetEntries: Array.from(assetBlobs.entries()),
      audioMix: workerAudio.mix,
      frameBins: workerBinsCopy,
    },
    workerTransfer,
    onProgress,
    signal,
  );

  // Tier 1B: Main-thread Mediabunny Compositor fallback (if Worker unavailable or exotic codec needs <video>)
  if (!compositorResult) {
    const fallbackAudio = audioBufferToTransferable(mixedAudio).mix;
    compositorResult = await runMediabunnyCompositorCore({
      project: renderProject,
      format: exportFormat,
      fps,
      totalFrames,
      videoBitrate,
      assetBlobs,
      audioMix: fallbackAudio,
      frameBins,
      fallbackMediaElements: helpers.mediaElements,
      inWorker: false,
      onProgress,
      signal,
    });
  }

  if (compositorResult) {
    return {
      blob: new Blob([compositorResult.buffer], { type: compositorResult.mimeType }),
      filename: `${safeFileSlug(project.title)}.${compositorResult.ext}`,
      mimeType: compositorResult.mimeType,
      elapsedMs: compositorResult.elapsedMs,
      engine: "mediabunny-compositor",
    };
  }

  // Tier 2: Legacy real-time MediaRecorder fallback when WebCodecs isn't supported
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
  const {
    project,
    preferMp4,
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
