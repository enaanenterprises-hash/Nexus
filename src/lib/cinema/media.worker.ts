/// <reference lib="esnext" />

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";

export type MediaWorkerRequest =
  | {
      id: number;
      type: "extract-meta";
      blob: Blob;
      thumbCount?: number;
      thumbWidth?: number;
    }
  | {
      id: number;
      type: "extract-scrub-frames";
      blob: Blob;
      maxFrames?: number;
      frameWidth?: number;
    };

export type MediaWorkerResponse =
  | {
      id: number;
      type: "meta";
      width: number;
      height: number;
      durationMs: number;
      thumbnails: string[];
    }
  | {
      id: number;
      type: "scrub-frames";
      timestampsSec: number[];
      bitmaps: ImageBitmap[];
    }
  | {
      id: number;
      type: "error";
      message: string;
    };

interface MediaWorkerScope {
  postMessage(message: MediaWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MediaWorkerRequest>) => void) | null;
}

const workerScope = globalThis as unknown as MediaWorkerScope;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function canvasToJpegDataUrlWorker(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string | null> {
  try {
    if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.68 });
      const buf = await blob.arrayBuffer();
      return `data:image/jpeg;base64,${arrayBufferToBase64(buf)}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function handleExtractMeta(req: Extract<MediaWorkerRequest, { type: "extract-meta" }>): Promise<void> {
  let input: Input | null = null;
  try {
    input = new Input({ source: new BlobSource(req.blob), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      workerScope.postMessage({ id: req.id, type: "error", message: "Undecodable video track" });
      return;
    }

    const width = videoTrack.displayWidth || videoTrack.codedWidth || 1920;
    const height = videoTrack.displayHeight || videoTrack.codedHeight || 1080;
    const firstTs = Math.max(0, await videoTrack.getFirstTimestamp());
    const computedDur = await input.computeDuration();
    const durationSec = Number.isFinite(computedDur) && computedDur > 0.1 ? computedDur : 5;
    const durationMs = Math.max(500, Math.round(durationSec * 1000));

    const count = req.thumbCount ?? 6;
    const thumbWidth = req.thumbWidth ?? 160;
    const thumbTimes: number[] = [];
    for (let i = 0; i < count; i++) {
      const rel = Math.min(Math.max(0.02, durationSec - 0.04), ((i + 0.15) / count) * durationSec);
      thumbTimes.push(firstTs + rel);
    }

    const sink = new CanvasSink(videoTrack, {
      width: thumbWidth,
      poolSize: 2,
      decoderOptions: { optimizeForLatency: true },
    });

    const thumbnails: string[] = [];
    for await (const wrapped of sink.canvasesAtTimestamps(thumbTimes)) {
      if (!wrapped?.canvas) continue;
      const url = await canvasToJpegDataUrlWorker(wrapped.canvas);
      if (url) thumbnails.push(url);
    }

    workerScope.postMessage({
      id: req.id,
      type: "meta",
      width,
      height,
      durationMs,
      thumbnails,
    });
  } catch (err) {
    workerScope.postMessage({
      id: req.id,
      type: "error",
      message: err instanceof Error ? err.message : "Failed extracting video metadata",
    });
  } finally {
    input?.dispose();
  }
}

async function handleExtractScrubFrames(
  req: Extract<MediaWorkerRequest, { type: "extract-scrub-frames" }>,
): Promise<void> {
  let input: Input | null = null;
  const bitmaps: ImageBitmap[] = [];
  const timestampsSec: number[] = [];

  try {
    if (typeof createImageBitmap !== "function") {
      workerScope.postMessage({ id: req.id, type: "error", message: "createImageBitmap unavailable" });
      return;
    }

    input = new Input({ source: new BlobSource(req.blob), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      workerScope.postMessage({ id: req.id, type: "error", message: "Undecodable video track" });
      return;
    }

    const firstTs = Math.max(0, await videoTrack.getFirstTimestamp());
    const computedDur = await input.computeDuration();
    const durationSec = Number.isFinite(computedDur) && computedDur > 0.1 ? computedDur : 5;

    // Dense enough (~2-3 frames/sec for short clips, capped at maxFrames) for instant scrub feedback
    const maxFrames = req.maxFrames ?? 32;
    const desiredCount = Math.max(8, Math.min(maxFrames, Math.ceil(durationSec * 2.5)));
    const frameWidth = req.frameWidth ?? 480;

    const queryTimes: number[] = [];
    const relativeTimes: number[] = [];
    for (let i = 0; i < desiredCount; i++) {
      const ratio = desiredCount <= 1 ? 0 : i / (desiredCount - 1);
      const rel = Math.min(Math.max(0.01, durationSec - 0.03), ratio * Math.max(0.05, durationSec - 0.03));
      relativeTimes.push(rel);
      queryTimes.push(firstTs + rel);
    }

    const sink = new CanvasSink(videoTrack, {
      width: frameWidth,
      poolSize: 2,
      decoderOptions: { optimizeForLatency: true },
    });

    let idx = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(queryTimes)) {
      const relSec = relativeTimes[idx] ?? 0;
      idx++;
      if (!wrapped?.canvas) continue;
      try {
        const bmp = await createImageBitmap(wrapped.canvas);
        bitmaps.push(bmp);
        timestampsSec.push(relSec);
      } catch {
        // Skip unreadable frame
      }
    }

    workerScope.postMessage(
      {
        id: req.id,
        type: "scrub-frames",
        timestampsSec,
        bitmaps,
      },
      bitmaps,
    );
  } catch (err) {
    for (const bmp of bitmaps) {
      try {
        bmp.close();
      } catch {
        // Ignore
      }
    }
    workerScope.postMessage({
      id: req.id,
      type: "error",
      message: err instanceof Error ? err.message : "Failed extracting scrub proxy frames",
    });
  } finally {
    input?.dispose();
  }
}

workerScope.onmessage = (event: MessageEvent<MediaWorkerRequest>) => {
  const req = event.data;
  if (req.type === "extract-meta") {
    void handleExtractMeta(req);
  } else if (req.type === "extract-scrub-frames") {
    void handleExtractScrubFrames(req);
  }
};
