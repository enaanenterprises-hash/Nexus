import { saveAudioBlob } from "@/lib/studio/audio-db";
import { computePeaksFromBuffer, encodeWavFromBuffer } from "@/lib/studio/wav";
import type { CinemaAsset, CinemaAssetSource, CinemaCollection, CinemaProject } from "./types";

const DB_NAME = "nexus-cinema-v1";
const DB_VERSION = 1;
const BLOB_STORE = "media";
const LOCAL_SNAPSHOT_KEY = "nexus:cinema-local.v1";

function openCinemaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open Cinema DB"));
  });
}

export async function saveCinemaBlob(key: string, blob: Blob): Promise<void> {
  const db = await openCinemaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put(blob, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed saving Cinema media"));
    };
  });
}

export async function loadCinemaBlob(key: string): Promise<Blob | null> {
  if (!key) return null;
  try {
    const db = await openCinemaDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Blob | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error("Failed reading Cinema media"));
      };
    });
  } catch {
    return null;
  }
}

export async function deleteCinemaBlob(key: string): Promise<void> {
  if (!key) return;
  try {
    const db = await openCinemaDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore IDB cleanup failures
  }
}

export type LocalCinemaSnapshot = {
  collections: CinemaCollection[];
  projects: CinemaProject[];
};

export function readLocalCinemaSnapshot(): LocalCinemaSnapshot {
  if (typeof window === "undefined") return { collections: [], projects: [] };
  try {
    const raw = window.localStorage.getItem(LOCAL_SNAPSHOT_KEY);
    if (!raw) return { collections: [], projects: [] };
    const parsed = JSON.parse(raw) as Partial<LocalCinemaSnapshot>;
    return {
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return { collections: [], projects: [] };
  }
}

export function writeLocalCinemaSnapshot(snap: LocalCinemaSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // Ignore localStorage quota overflow gracefully
  }
}

function makeMediaId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function decodePeaksAndDuration(blob: Blob): Promise<{ durationMs: number; peaks: number[] }> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return { durationMs: 0, peaks: [] };
    const ctx = new AudioCtx();
    try {
      const arr = await blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);
      return {
        durationMs: Math.max(250, Math.round(buffer.duration * 1000)),
        peaks: computePeaksFromBuffer(buffer, 160),
      };
    } finally {
      void ctx.close();
    }
  } catch {
    return { durationMs: 0, peaks: [] };
  }
}

async function extractImageMeta(blob: Blob): Promise<{
  width: number;
  height: number;
  thumbnails: string[];
}> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image"));
      el.src = objectUrl;
    });
    const width = img.naturalWidth || 1920;
    const height = img.naturalHeight || 1080;
    const canvas = document.createElement("canvas");
    const targetW = 160;
    const targetH = Math.max(48, Math.round((height / Math.max(1, width)) * targetW));
    canvas.width = targetW;
    canvas.height = targetH;
    const c = canvas.getContext("2d");
    let thumb = "";
    if (c) {
      c.drawImage(img, 0, 0, targetW, targetH);
      thumb = canvas.toDataURL("image/jpeg", 0.72);
    }
    return { width, height, thumbnails: thumb ? [thumb] : [] };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function extractVideoMeta(blob: Blob): Promise<{
  width: number;
  height: number;
  durationMs: number;
  thumbnails: string[];
}> {
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Video metadata timeout")), 7000);
      video.onloadeddata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Could not load video metadata"));
      };
    });

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
    const durationMs = Math.max(500, Math.round(durationSec * 1000));

    const count = 6;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = Math.max(48, Math.round((height / Math.max(1, width)) * 160));
    const ctx = canvas.getContext("2d");
    const thumbnails: string[] = [];

    if (ctx) {
      for (let i = 0; i < count; i++) {
        const atSec = Math.min(Math.max(0.05, durationSec - 0.05), ((i + 0.15) / count) * durationSec);
        try {
          await new Promise<void>((resolve) => {
            const timeout = window.setTimeout(resolve, 900);
            const onSeeked = () => {
              window.clearTimeout(timeout);
              video.removeEventListener("seeked", onSeeked);
              resolve();
            };
            video.addEventListener("seeked", onSeeked);
            video.currentTime = atSec;
          });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push(canvas.toDataURL("image/jpeg", 0.68));
        } catch {
          // Skip unreadable frame safely
        }
      }
    }

    return { width, height, durationMs, thumbnails };
  } finally {
    video.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}

export async function ingestMediaFile(
  file: File | Blob,
  options: {
    name?: string;
    source?: CinemaAssetSource;
    url?: string | null;
    attribution?: { author: string; url: string };
  } = {},
): Promise<CinemaAsset> {
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const originalFileName = (file instanceof File ? file.name : options.name || "").toLowerCase();
  const rawName =
    options.name ||
    (file instanceof File ? file.name.replace(/\.[^/.]+$/, "") : "") ||
    "Untitled media";

  const kind: CinemaAsset["kind"] = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("image/")
      ? "image"
      : mime.startsWith("audio/")
        ? "audio"
        : /\.(mp4|webm|mov|m4v|mkv|avi)$/.test(originalFileName)
          ? "video"
          : /\.(png|jpg|jpeg|webp|gif|bmp|avif)$/.test(originalFileName)
            ? "image"
            : "audio";

  const id = makeMediaId("ast");
  const idbKey = `cin-media-${id}`;
  await saveCinemaBlob(idbKey, file);

  let width = 1920;
  let height = 1080;
  let durationMs = 5000;
  let thumbnails: string[] = [];
  let peaks: number[] = [];

  if (kind === "image") {
    const meta = await extractImageMeta(file).catch(() => ({
      width: 1920,
      height: 1080,
      thumbnails: [] as string[],
    }));
    width = meta.width;
    height = meta.height;
    thumbnails = meta.thumbnails;
    durationMs = 5000;
  } else if (kind === "video") {
    const [vMeta, aMeta] = await Promise.all([
      extractVideoMeta(file).catch(() => ({
        width: 1920,
        height: 1080,
        durationMs: 5000,
        thumbnails: [] as string[],
      })),
      decodePeaksAndDuration(file),
    ]);
    width = vMeta.width;
    height = vMeta.height;
    durationMs = Math.max(vMeta.durationMs, aMeta.durationMs);
    thumbnails = vMeta.thumbnails;
    peaks = aMeta.peaks;
  } else {
    const aMeta = await decodePeaksAndDuration(file);
    width = 0;
    height = 0;
    durationMs = Math.max(500, aMeta.durationMs);
    peaks = aMeta.peaks;
  }

  return {
    id,
    kind,
    name: rawName.slice(0, 120),
    idbKey,
    url: options.url ?? null,
    mimeType: mime,
    byteLength: file.size,
    durationMs,
    width,
    height,
    thumbnails,
    peaks,
    source: options.source ?? "upload",
    ...(options.attribution ? { attribution: options.attribution } : {}),
  };
}

/**
 * Decodes the audio track from a Cinema video asset, encodes it into stereo
 * 16-bit PCM WAV, and writes it directly into Recording Studio's shared IDB
 * so Recording Studio can open & process it immediately with EQ/compression/mixdown.
 */
export async function extractAudioFromVideoBlob(
  blob: Blob,
  clipName: string,
): Promise<{
  audioKey: string;
  durationMs: number;
  sampleRate: number;
  peaks: number[];
  byteLength: number;
  mimeType: string;
  wavBlob: Blob;
}> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("Web Audio API is unavailable in this browser.");
  }
  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    const buf = await blob.arrayBuffer();
    decoded = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error(`“${clipName}” has no decodable audio track.`);
  } finally {
    void ctx.close();
  }

  const wavBlob = encodeWavFromBuffer(decoded);
  const peaks = computePeaksFromBuffer(decoded, 200);
  const durationMs = Math.max(250, Math.round(decoded.duration * 1000));
  const audioKey = `st-from-cinema-${makeMediaId("wav")}`;
  await saveAudioBlob(audioKey, wavBlob);

  return {
    audioKey,
    durationMs,
    sampleRate: decoded.sampleRate,
    peaks,
    byteLength: wavBlob.size,
    mimeType: "audio/wav",
    wavBlob,
  };
}
