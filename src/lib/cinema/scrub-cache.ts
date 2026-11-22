import type { MediaWorkerRequest, MediaWorkerResponse } from "./media.worker";

type MediaWorkerPayload = MediaWorkerRequest extends infer R
  ? R extends MediaWorkerRequest
    ? Omit<R, "id">
    : never
  : never;

interface PendingWorkerJob {
  resolve: (res: MediaWorkerResponse) => void;
  reject: (err: Error) => void;
}

class CinemaMediaWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingWorkerJob>();
  private disabled = false;

  private ensureWorker(): Worker | null {
    if (this.disabled || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
      return null;
    }
    if (!this.worker) {
      try {
        const w = new Worker(new URL("./media.worker.ts", import.meta.url), {
          type: "module",
        });
        w.onmessage = (event: MessageEvent<MediaWorkerResponse>) => {
          const msg = event.data;
          const job = this.pending.get(msg.id);
          if (!job) return;
          this.pending.delete(msg.id);
          job.resolve(msg);
        };
        w.onerror = () => {
          this.disabled = true;
          for (const job of this.pending.values()) {
            job.reject(new Error("Cinema media worker crashed"));
          }
          this.pending.clear();
          w.terminate();
          this.worker = null;
        };
        this.worker = w;
      } catch {
        this.disabled = true;
        return null;
      }
    }
    return this.worker;
  }

  request(payload: MediaWorkerPayload): Promise<MediaWorkerResponse | null> {
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise<MediaWorkerResponse | null>((resolve) => {
      const timer = window.setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve(null);
        }
      }, 20_000);
      this.pending.set(id, {
        resolve: (res) => {
          window.clearTimeout(timer);
          resolve(res);
        },
        reject: () => {
          window.clearTimeout(timer);
          resolve(null);
        },
      });
      worker.postMessage({ ...payload, id } as MediaWorkerRequest);
    });
  }
}

const sharedMediaWorker = new CinemaMediaWorkerClient();

/**
 * Extracts video dimensions, duration, and filmstrip thumbnails off the main thread
 * using Mediabunny inside `media.worker.ts`. Returns `null` if worker isn't available.
 */
export async function extractVideoMetaInWorker(blob: Blob): Promise<{
  width: number;
  height: number;
  durationMs: number;
  thumbnails: string[];
} | null> {
  const res = await sharedMediaWorker.request({
    type: "extract-meta",
    blob,
    thumbCount: 6,
    thumbWidth: 160,
  });
  if (!res || res.type !== "meta") return null;
  return {
    width: res.width,
    height: res.height,
    durationMs: res.durationMs,
    thumbnails: res.thumbnails,
  };
}

export interface ScrubFrameSet {
  timestampsSec: number[];
  bitmaps: ImageBitmap[];
}

const MAX_CACHED_ASSETS = 4;

/**
 * LRU GPU `ImageBitmap` proxy cache for instant 120fps timeline scrubbing.
 * Decodes ~24-32 lightweight 480px frames per video in `media.worker.ts` (off the main thread),
 * eliminating Chrome's 100-300ms `<video>` GOP seek lag while dragging the playhead bar.
 */
export class CinemaScrubCache {
  private readonly entries = new Map<string, ScrubFrameSet>();
  private readonly inflight = new Set<string>();
  private disposed = false;

  warmAsset(assetId: string, blob: Blob, onReady?: () => void): void {
    if (this.disposed || this.entries.has(assetId) || this.inflight.has(assetId)) return;
    this.inflight.add(assetId);
    void sharedMediaWorker
      .request({
        type: "extract-scrub-frames",
        blob,
        maxFrames: 32,
        frameWidth: 480,
      })
      .then((res) => {
        if (!res || res.type !== "scrub-frames" || res.bitmaps.length === 0) return;
        if (this.disposed) {
          for (const bmp of res.bitmaps) bmp.close();
          return;
        }
        // Evict oldest entry if LRU cap reached
        while (this.entries.size >= MAX_CACHED_ASSETS) {
          const oldestKey = this.entries.keys().next().value;
          if (oldestKey === undefined) break;
          this.evict(oldestKey);
        }
        this.entries.set(assetId, {
          timestampsSec: res.timestampsSec,
          bitmaps: res.bitmaps,
        });
        onReady?.();
      })
      .finally(() => {
        this.inflight.delete(assetId);
      });
  }

  /**
   * Binary-searches the nearest cached GPU `ImageBitmap` for `targetSec` in O(log N) (< 0.01ms).
   */
  getNearestFrame(assetId: string, targetSec: number): ImageBitmap | null {
    const entry = this.entries.get(assetId);
    if (!entry || entry.bitmaps.length === 0) return null;

    // Refresh LRU recency
    this.entries.delete(assetId);
    this.entries.set(assetId, entry);

    const ts = entry.timestampsSec;
    let lo = 0;
    let hi = ts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid]! < targetSec) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(ts[lo - 1]! - targetSec) < Math.abs(ts[lo]! - targetSec)) {
      return entry.bitmaps[lo - 1] ?? null;
    }
    return entry.bitmaps[lo] ?? null;
  }

  evict(assetId: string): void {
    const entry = this.entries.get(assetId);
    if (!entry) return;
    for (const bmp of entry.bitmaps) {
      try {
        bmp.close();
      } catch {
        // Ignore
      }
    }
    this.entries.delete(assetId);
  }

  dispose(): void {
    this.disposed = true;
    for (const key of Array.from(this.entries.keys())) {
      this.evict(key);
    }
    this.inflight.clear();
  }
}
