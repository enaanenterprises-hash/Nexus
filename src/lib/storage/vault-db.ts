import { decodeAudioBufferUniversal } from "@/lib/cinema/media-db";
import { computePeaksFromBuffer } from "@/lib/studio/wav";
import {
  DEFAULT_VAULT_FOLDERS,
  type VaultFolder,
  type VaultItem,
  type VaultItemKind,
  type VaultItemMetadata,
} from "./types";

const DB_NAME = "nexus-vault-v1";
const DB_VERSION = 1;
const BLOB_STORE = "files";
const LOCAL_VAULT_KEY = "nexus:storage-vault.v1";

function openVaultDb(): Promise<IDBDatabase> {
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
    req.onerror = () => reject(req.error ?? new Error("Failed opening Nexus Storage database"));
  });
}

export async function saveVaultBlob(key: string, blob: Blob): Promise<void> {
  if (!key) return;
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put(blob, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed saving file into IndexedDB"));
    };
  });
}

export async function loadVaultBlob(key: string | null | undefined): Promise<Blob | null> {
  if (!key) return null;
  try {
    const db = await openVaultDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Blob | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error("Failed reading file from IndexedDB"));
      };
    });
  } catch {
    return null;
  }
}

export async function deleteVaultBlob(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    const db = await openVaultDb();
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

export interface LocalVaultSnapshot {
  folders: VaultFolder[];
  items: VaultItem[];
}

export function buildDefaultFolders(): VaultFolder[] {
  const now = new Date().toISOString();
  return DEFAULT_VAULT_FOLDERS.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    parentId: null,
    system: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function readLocalVaultSnapshot(): LocalVaultSnapshot {
  if (typeof window === "undefined") {
    return { folders: buildDefaultFolders(), items: [] };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_VAULT_KEY);
    if (!raw) return { folders: buildDefaultFolders(), items: [] };
    const parsed = JSON.parse(raw) as Partial<LocalVaultSnapshot>;
    const folders =
      Array.isArray(parsed.folders) && parsed.folders.length > 0
        ? parsed.folders
        : buildDefaultFolders();
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return { folders, items };
  } catch {
    return { folders: buildDefaultFolders(), items: [] };
  }
}

export function writeLocalVaultSnapshot(snap: LocalVaultSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_VAULT_KEY, JSON.stringify(snap));
  } catch {
    // Ignore localStorage quota failures gracefully
  }
}

async function extractVideoPosterAndMeta(blob: Blob): Promise<{
  width?: number;
  height?: number;
  durationMs?: number;
  aspectRatio?: string;
  thumbnailDataUrl: string | null;
}> {
  if (typeof document === "undefined") return { thumbnailDataUrl: null };
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => resolve(), 3500);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Video metadata decode failed"));
      };
      video.src = url;
    });

    const width = video.videoWidth || undefined;
    const height = video.videoHeight || undefined;
    const durationMs =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : undefined;

    if (Number.isFinite(video.duration) && video.duration > 0.25) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(() => resolve(), 1800);
        video.onseeked = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        try {
          video.currentTime = Math.min(0.6, video.duration * 0.15);
        } catch {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    }

    let thumbnailDataUrl: string | null = null;
    if (width && height) {
      const targetW = 480;
      const targetH = Math.max(120, Math.round((height / width) * targetW));
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);
        thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.78);
      }
    }

    const aspectRatio =
      width && height
        ? Math.abs(width / height - 16 / 9) < 0.08
          ? "16:9"
          : Math.abs(width / height - 9 / 16) < 0.08
            ? "9:16"
            : Math.abs(width / height - 1) < 0.08
              ? "1:1"
              : `${width}:${height}`
        : undefined;

    return { width, height, durationMs, aspectRatio, thumbnailDataUrl };
  } catch {
    return { thumbnailDataUrl: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function extractImagePosterAndMeta(blob: Blob): Promise<{
  width?: number;
  height?: number;
  thumbnailDataUrl: string | null;
}> {
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return { thumbnailDataUrl: null };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = url;
    });
    const width = img.naturalWidth || undefined;
    const height = img.naturalHeight || undefined;
    let thumbnailDataUrl: string | null = null;
    if (width && height) {
      const targetW = 480;
      const targetH = Math.max(96, Math.round((height / width) * targetW));
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.8);
      }
    }
    return { width, height, thumbnailDataUrl };
  } catch {
    return { thumbnailDataUrl: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractTextOrDatasetMeta(
  blob: Blob,
  kind: VaultItemKind,
  filename: string,
): Promise<Partial<VaultItemMetadata>> {
  try {
    const slice = blob.slice(0, 64_000);
    const text = await slice.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (kind === "dataset" || filename.toLowerCase().endsWith(".csv")) {
      const header = lines[0]?.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
      return {
        rowCount: Math.max(0, lines.length - 1),
        columns: header?.slice(0, 12),
        excerpt: lines.slice(0, 3).join("\n"),
      };
    }
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return {
      wordCount: words,
      excerpt: text.trim().slice(0, 240),
    };
  } catch {
    return {};
  }
}

export async function extractVaultFileMeta(
  blob: Blob,
  filename: string,
  kind: VaultItemKind,
): Promise<{ metadata: Partial<VaultItemMetadata>; thumbnailDataUrl: string | null }> {
  if (kind === "video") {
    const res = await extractVideoPosterAndMeta(blob);
    return {
      metadata: {
        width: res.width,
        height: res.height,
        durationMs: res.durationMs,
        aspectRatio: res.aspectRatio,
      },
      thumbnailDataUrl: res.thumbnailDataUrl,
    };
  }
  if (kind === "image") {
    const res = await extractImagePosterAndMeta(blob);
    return {
      metadata: { width: res.width, height: res.height },
      thumbnailDataUrl: res.thumbnailDataUrl,
    };
  }
  if (kind === "audio") {
    const audioBuf = await decodeAudioBufferUniversal(blob);
    if (!audioBuf) return { metadata: {}, thumbnailDataUrl: null };
    return {
      metadata: {
        durationMs: Math.max(250, Math.round(audioBuf.duration * 1000)),
        peaks: computePeaksFromBuffer(audioBuf, 48),
      },
      thumbnailDataUrl: null,
    };
  }
  if (kind === "note" || kind === "document" || kind === "dataset") {
    return {
      metadata: await extractTextOrDatasetMeta(blob, kind, filename),
      thumbnailDataUrl: null,
    };
  }
  return { metadata: {}, thumbnailDataUrl: null };
}
