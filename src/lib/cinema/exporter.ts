import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { encodeWavFromBuffer } from "@/lib/studio/wav";
import { renderCinemaAudioOffline } from "./audio-engine";
import { computeProjectDurationMs, renderCinemaFrame, type CinemaRenderRuntime } from "./compositor";
import { resolutionForAspectRatio } from "./presets";
import type { CinemaExportOptions, CinemaExportProgress, CinemaProject, CinemaVideoClip } from "./types";

export interface CinemaExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  engine: "webcodecs-mp4" | "mediarecorder" | "png" | "wav";
}

function safeFileSlug(title: string): string {
  return (title || "cinema-edit")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "cinema-edit";
}

async function seekVideoExact(video: HTMLVideoElement, targetSec: number): Promise<void> {
  const safeTarget = Math.max(0, Math.min(Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.02) : targetSec, targetSec));
  if (Math.abs(video.currentTime - safeTarget) < 0.008) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 450);
    video.addEventListener(
      "seeked",
      () => {
        window.clearTimeout(timer);
        finish();
      },
      { once: true },
    );
    video.currentTime = safeTarget;
  });
}

async function syncAllActiveVideosAt(
  project: CinemaProject,
  timeMs: number,
  mediaElements: ReadonlyMap<string, HTMLVideoElement | HTMLImageElement>,
): Promise<void> {
  const activeVideos = project.clips.filter(
    (c): c is CinemaVideoClip =>
      c.kind === "video" &&
      !c.hidden &&
      timeMs >= c.startMs &&
      timeMs <= c.startMs + c.durationMs,
  );
  await Promise.all(
    activeVideos.map(async (clip) => {
      const el = mediaElements.get(clip.assetId);
      if (!(el instanceof HTMLVideoElement)) return;
      el.pause();
      const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
      const targetSec = (clip.trimStartMs + (timeMs - clip.startMs) * speed) / 1000;
      await seekVideoExact(el, targetSec);
    }),
  );
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

  await syncAllActiveVideosAt(project, timeMs, runtime.mediaElements);
  renderCinemaFrame(ctx, project, timeMs, { ...runtime, showSafeGuides: false, isExport: true });

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
): Promise<{ supported: boolean; codec?: string }> {
  if (
    typeof window === "undefined" ||
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return { supported: false };
  }
  const candidates = ["avc1.640028", "avc1.4d0028", "avc1.42001f"];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        avc: { format: "avc" },
      });
      if (support.supported) {
        return { supported: true, codec };
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
        ? 8_000_000
        : 5_000_000
      : options.quality === "high"
        ? 4_500_000
        : 2_800_000;

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
  const ctx = canvas.getContext("2d");
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
  const { project, codec, fps, totalFrames, bitrate, canvas, ctx, mixedAudio, frameBins, mediaElements, onProgress, signal } =
    params;

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

  videoEncoder.configure({
    codec,
    width: project.width,
    height: project.height,
    bitrate,
    framerate: fps,
    avc: { format: "avc" },
  });

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

  try {
    const frameDurUs = Math.round(1_000_000 / fps);
    const frameDurMs = 1000 / fps;

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) {
        throw new DOMException("Export cancelled", "AbortError");
      }
      if (encodeError) throw encodeError;

      while (videoEncoder.encodeQueueSize > 6) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const timeMs = f * frameDurMs;
      await syncAllActiveVideosAt(project, timeMs, mediaElements);
      renderCinemaFrame(ctx, project, timeMs, {
        mediaElements,
        frequencyBins: frameBins[f],
        showSafeGuides: false,
        isExport: true,
      });

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

      if (f % 3 === 0 || f === totalFrames - 1) {
        onProgress({
          phase: "rendering",
          progress: 0.08 + 0.8 * ((f + 1) / totalFrames),
          currentFrame: f + 1,
          totalFrames,
          message: `Encoding frame ${f + 1} of ${totalFrames}…`,
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
      const chunkFrames = 1024;

      for (let offset = 0; offset < mixedAudio.length; offset += chunkFrames) {
        if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
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
  let frameIdx = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const step = () => {
        if (signal?.aborted) {
          reject(new DOMException("Export cancelled", "AbortError"));
          return;
        }
        const elapsedMs = performance.now() - startPerf;
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

        onProgress({
          phase: "rendering",
          progress: 0.08 + 0.88 * Math.min(1, elapsedMs / Math.max(1, durationMs)),
          currentFrame: frameIdx + 1,
          totalFrames,
          message: `Recording real-time output (${Math.round((elapsedMs / Math.max(1, durationMs)) * 100)}%)…`,
        });

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
