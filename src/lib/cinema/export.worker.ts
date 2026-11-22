/// <reference lib="esnext" />

import {
  WorkerFallbackRequiredError,
  runMediabunnyCompositorCore,
  runMediabunnyConversionCore,
  type TransferableAudioMix,
} from "./mediabunny-core";
import type { CinemaExportProgress, CinemaProject } from "./types";

export type ExportWorkerRequest =
  | {
      type: "conversion";
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
    }
  | {
      type: "compositor";
      project: CinemaProject;
      format: "mp4" | "webm";
      fps: 24 | 30 | 60;
      totalFrames: number;
      videoBitrate: number;
      assetEntries: Array<[string, Blob]>;
      audioMix: TransferableAudioMix | null;
      frameBins: Float32Array[];
    }
  | {
      type: "cancel";
    };

export type ExportWorkerResponse =
  | { type: "progress"; progress: CinemaExportProgress }
  | {
      type: "done";
      buffer: ArrayBuffer;
      mimeType: string;
      ext: "mp4" | "webm";
      elapsedMs: number;
    }
  | { type: "fallback"; reason: string }
  | { type: "aborted" }
  | { type: "error"; message: string };

interface WorkerSelfScope {
  postMessage(message: ExportWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null;
}

const workerScope = globalThis as unknown as WorkerSelfScope;
let activeAbort: AbortController | null = null;

workerScope.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    activeAbort?.abort();
    return;
  }

  activeAbort?.abort();
  const controller = new AbortController();
  activeAbort = controller;

  void (async () => {
    try {
      const onProgress = (progress: CinemaExportProgress) => {
        workerScope.postMessage({ type: "progress", progress });
      };

      const result =
        msg.type === "conversion"
          ? await runMediabunnyConversionCore({
              blob: msg.blob,
              format: msg.format,
              width: msg.width,
              height: msg.height,
              fps: msg.fps,
              videoBitrate: msg.videoBitrate,
              totalFrames: msg.totalFrames,
              trimStartMs: msg.trimStartMs,
              durationMs: msg.durationMs,
              fit: msg.fit,
              rotation90: msg.rotation90,
              flipH: msg.flipH,
              audioMutedOrDetached: msg.audioMutedOrDetached,
              onProgress,
              signal: controller.signal,
            })
          : await runMediabunnyCompositorCore({
              project: msg.project,
              format: msg.format,
              fps: msg.fps,
              totalFrames: msg.totalFrames,
              videoBitrate: msg.videoBitrate,
              assetBlobs: new Map(msg.assetEntries),
              audioMix: msg.audioMix,
              frameBins: msg.frameBins,
              inWorker: true,
              onProgress,
              signal: controller.signal,
            });

      if (!result) {
        workerScope.postMessage({
          type: "fallback",
          reason: "Mediabunny worker returned null; falling back to next tier.",
        });
        return;
      }

      workerScope.postMessage(
        {
          type: "done",
          buffer: result.buffer,
          mimeType: result.mimeType,
          ext: result.ext,
          elapsedMs: result.elapsedMs,
        },
        [result.buffer],
      );
    } catch (err) {
      if (controller.signal.aborted || (err as DOMException)?.name === "AbortError") {
        workerScope.postMessage({ type: "aborted" });
        return;
      }
      if (err instanceof WorkerFallbackRequiredError) {
        workerScope.postMessage({ type: "fallback", reason: err.message });
        return;
      }
      workerScope.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : "Mediabunny export worker failed.",
      });
    } finally {
      if (activeAbort === controller) {
        activeAbort = null;
      }
    }
  })();
};
