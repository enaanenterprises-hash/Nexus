import type { StudioCollection, StudioRecording } from "./types";

const DB_NAME = "nexus-studio-v1";
const DB_VERSION = 1;
const BLOB_STORE = "blobs";
const LOCAL_META_KEY = "nexus:studio-local.v1";

function openDb(): Promise<IDBDatabase> {
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
    req.onerror = () => reject(req.error ?? new Error("Failed to open studio DB"));
  });
}

export async function saveAudioBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put(blob, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed saving audio blob"));
    };
  });
}

export async function loadAudioBlob(key: string): Promise<Blob | null> {
  if (!key) return null;
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Blob | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error("Failed reading audio blob"));
      };
    });
  } catch {
    return null;
  }
}

export async function deleteAudioBlob(key: string): Promise<void> {
  if (!key) return;
  try {
    const db = await openDb();
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

export type LocalStudioSnapshot = {
  collections: StudioCollection[];
  recordings: StudioRecording[];
};

export function readLocalStudioSnapshot(): LocalStudioSnapshot {
  if (typeof window === "undefined") return { collections: [], recordings: [] };
  try {
    const raw = window.localStorage.getItem(LOCAL_META_KEY);
    if (!raw) return { collections: [], recordings: [] };
    const parsed = JSON.parse(raw) as Partial<LocalStudioSnapshot>;
    return {
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      recordings: Array.isArray(parsed.recordings) ? parsed.recordings : [],
    };
  } catch {
    return { collections: [], recordings: [] };
  }
}

export function writeLocalStudioSnapshot(snap: LocalStudioSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_META_KEY, JSON.stringify(snap));
  } catch {
    // Ignore quota errors
  }
}
