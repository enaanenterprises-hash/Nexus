import { generateStarterPhotoBlob } from "./starter-photos";
import type { OpticsCollection, OpticsProject } from "./types";

const DB_NAME = "nexus-optics-v1";
const DB_VERSION = 1;
const PHOTO_STORE = "plates";
const LOCAL_SNAPSHOT_KEY = "nexus:optics-studio.v1";

function openOpticsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed opening Optics IndexedDB"));
  });
}

export async function saveOpticsBlob(key: string, blob: Blob): Promise<void> {
  if (!key) return;
  const db = await openOpticsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(blob, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed writing plate into Optics IndexedDB"));
    };
  });
}

export async function loadOpticsBlob(key: string | null | undefined): Promise<Blob | null> {
  if (!key) return null;
  if (key.startsWith("starter:")) {
    const starterId = key.slice("starter:".length) as
      | "alpine-alpenglow"
      | "atelier-portrait"
      | "obsidian-pavilion";
    return generateStarterPhotoBlob(starterId);
  }
  try {
    const db = await openOpticsDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Blob | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error("Failed reading Optics plate"));
      };
    });
  } catch {
    return null;
  }
}

export interface LocalOpticsSnapshot {
  collections: OpticsCollection[];
  projects: OpticsProject[];
}

export function readLocalOpticsSnapshot(): LocalOpticsSnapshot {
  if (typeof window === "undefined") return { collections: [], projects: [] };
  try {
    const raw = window.localStorage.getItem(LOCAL_SNAPSHOT_KEY);
    if (!raw) return { collections: [], projects: [] };
    const parsed = JSON.parse(raw) as Partial<LocalOpticsSnapshot>;
    return {
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return { collections: [], projects: [] };
  }
}

export function writeLocalOpticsSnapshot(snapshot: LocalOpticsSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore localStorage quota failures gracefully
  }
}

export async function decodeBlobToImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode image format"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
