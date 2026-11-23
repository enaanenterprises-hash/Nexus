"use client";

import { useCallback, useEffect, useState } from "react";
import { nexusBus } from "@/lib/extensions";
import type { SocialPublishDraft, SocialPublishRecord } from "@/lib/social/platforms";
import {
  classifyVaultKind,
  defaultFolderForKind,
  type VaultFolder,
  type VaultItem,
  type VaultItemMetadata,
} from "./types";
import {
  buildDefaultFolders,
  deleteVaultBlob,
  extractVaultFileMeta,
  loadVaultBlob,
  readLocalVaultSnapshot,
  saveVaultBlob,
  writeLocalVaultSnapshot,
} from "./vault-db";

export interface VaultSnapshot {
  folders: VaultFolder[];
  items: VaultItem[];
}

export type SaveBlobToVaultInput = {
  blob: Blob;
  name: string;
  mimeType?: string;
  folderId?: string | null;
  tags?: string[];
  starred?: boolean;
  metadata?: Partial<VaultItemMetadata>;
  source?: "upload" | "studio" | "cinema" | "command" | "extension";
};

const listeners = new Set<() => void>();
let cachedSnapshot: VaultSnapshot | null = null;
let serverSyncedOnce = false;
let serverSyncInFlight: Promise<VaultSnapshot> | null = null;

function notifyVaultListeners() {
  for (const listener of listeners) listener();
}

function getOrInitLocalSnapshot(): VaultSnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = readLocalVaultSnapshot();
  }
  return cachedSnapshot;
}

function commitLocalSnapshot(next: VaultSnapshot) {
  cachedSnapshot = next;
  writeLocalVaultSnapshot(next);
  notifyVaultListeners();
}

function mergeSnapshots(local: VaultSnapshot, remote: VaultSnapshot): VaultSnapshot {
  const folderMap = new Map<string, VaultFolder>();
  for (const f of buildDefaultFolders()) folderMap.set(f.id, f);
  for (const f of local.folders) folderMap.set(f.id, f);
  for (const f of remote.folders) folderMap.set(f.id, f);

  const itemMap = new Map<string, VaultItem>();
  for (const item of remote.items) itemMap.set(item.id, item);
  for (const item of local.items) {
    const existing = itemMap.get(item.id);
    if (!existing) {
      itemMap.set(item.id, item);
    } else if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      itemMap.set(item.id, item);
    }
  }

  const items = [...itemMap.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return { folders: [...folderMap.values()], items };
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function postItemToServer(item: VaultItem): Promise<void> {
  try {
    const res = await fetch("/api/storage/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) return;
  } catch {
    // Offline or unconfigured DB — local snapshot remains authoritative
  }
}

async function patchItemOnServer(
  id: string,
  patch: Partial<Pick<VaultItem, "name" | "folderId" | "starred" | "tags" | "metadata">>,
): Promise<void> {
  try {
    await fetch(`/api/storage/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    // Offline / DB optional
  }
}

export async function refreshVaultFromServer(force = false): Promise<VaultSnapshot> {
  const local = getOrInitLocalSnapshot();
  if (serverSyncedOnce && !force) return local;
  if (serverSyncInFlight && !force) return serverSyncInFlight;

  serverSyncInFlight = (async () => {
    try {
      const res = await fetch("/api/storage/items", { cache: "no-store" });
      if (!res.ok) {
        serverSyncedOnce = true;
        return local;
      }
      const data = (await res.json()) as Partial<VaultSnapshot>;
      const remote: VaultSnapshot = {
        folders: Array.isArray(data.folders) ? data.folders : [],
        items: Array.isArray(data.items) ? data.items : [],
      };
      const merged = mergeSnapshots(getOrInitLocalSnapshot(), remote);
      commitLocalSnapshot(merged);
      serverSyncedOnce = true;
      return merged;
    } catch {
      serverSyncedOnce = true;
      return getOrInitLocalSnapshot();
    } finally {
      serverSyncInFlight = null;
    }
  })();

  return serverSyncInFlight;
}

/** Saves any binary Blob + rich metadata directly into Command Storage + IndexedDB + DB metadata sync. */
export async function saveBlobToVault(input: SaveBlobToVaultInput): Promise<VaultItem> {
  const now = new Date().toISOString();
  const mimeType = input.mimeType || input.blob.type || "application/octet-stream";
  const kind = classifyVaultKind(mimeType, input.name);
  const id = makeId("vitem");
  const blobKey = `blob-${id}`;

  await saveVaultBlob(blobKey, input.blob);
  const extracted = await extractVaultFileMeta(input.blob, input.name, kind);

  const folderId =
    input.folderId !== undefined
      ? input.folderId
      : defaultFolderForKind(kind, input.metadata?.sourceNodeId);

  const item: VaultItem = {
    id,
    folderId,
    name: input.name,
    mimeType,
    kind,
    sizeBytes: input.blob.size,
    blobKey,
    remoteUrl: null,
    thumbnailDataUrl: extracted.thumbnailDataUrl,
    starred: Boolean(input.starred),
    tags: input.tags ?? [],
    metadata: {
      ...extracted.metadata,
      ...input.metadata,
    },
    createdAt: now,
    updatedAt: now,
  };

  const snap = getOrInitLocalSnapshot();
  commitLocalSnapshot({
    ...snap,
    items: [item, ...snap.items.filter((x) => x.id !== item.id)],
  });

  nexusBus.emit(
    "storage:item-saved",
    {
      itemId: item.id,
      kind: item.kind,
      name: item.name,
      folderId: item.folderId,
      source: input.source ?? "upload",
    },
    "dev.nexus.core.command",
  );

  void postItemToServer(item);
  return item;
}

export async function updateVaultItem(
  id: string,
  patch: Partial<Pick<VaultItem, "name" | "folderId" | "starred" | "tags">> & {
    metadata?: Partial<VaultItemMetadata>;
  },
): Promise<VaultItem | null> {
  const snap = getOrInitLocalSnapshot();
  const idx = snap.items.findIndex((x) => x.id === id);
  if (idx < 0) return null;

  const current = snap.items[idx]!;
  const updated: VaultItem = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
    ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    metadata: patch.metadata ? { ...current.metadata, ...patch.metadata } : current.metadata,
    updatedAt: new Date().toISOString(),
  };

  const nextItems = [...snap.items];
  nextItems[idx] = updated;
  commitLocalSnapshot({ ...snap, items: nextItems });
  void patchItemOnServer(id, {
    name: updated.name,
    folderId: updated.folderId,
    starred: updated.starred,
    tags: updated.tags,
    metadata: updated.metadata,
  });
  return updated;
}

export async function deleteVaultItem(id: string): Promise<void> {
  const snap = getOrInitLocalSnapshot();
  const target = snap.items.find((x) => x.id === id);
  if (!target) return;

  commitLocalSnapshot({
    ...snap,
    items: snap.items.filter((x) => x.id !== id),
  });

  await deleteVaultBlob(target.blobKey);
  nexusBus.emit("storage:item-deleted", { itemId: id, name: target.name }, "dev.nexus.core.command");

  try {
    await fetch(`/api/storage/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // Ignore DB delete error in local mode
  }
}

export async function createVaultFolder(name: string, description?: string): Promise<VaultFolder> {
  const now = new Date().toISOString();
  const folder: VaultFolder = {
    id: makeId("vdir"),
    name: name.trim() || "Untitled folder",
    description: description ?? null,
    parentId: null,
    system: false,
    createdAt: now,
    updatedAt: now,
  };
  const snap = getOrInitLocalSnapshot();
  commitLocalSnapshot({
    ...snap,
    folders: [...snap.folders, folder],
  });
  try {
    await fetch("/api/storage/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(folder),
    });
  } catch {
    // Ignore DB errors offline
  }
  return folder;
}

export async function deleteVaultFolder(folderId: string): Promise<void> {
  const snap = getOrInitLocalSnapshot();
  const target = snap.folders.find((f) => f.id === folderId);
  if (!target || target.system) return;

  commitLocalSnapshot({
    folders: snap.folders.filter((f) => f.id !== folderId),
    items: snap.items.map((item) => (item.folderId === folderId ? { ...item, folderId: null } : item)),
  });
  try {
    await fetch(`/api/storage/folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
  } catch {
    // Ignore DB errors offline
  }
}

export function findVaultItemByProjectId(projectId: string): VaultItem | null {
  const snap = getOrInitLocalSnapshot();
  return snap.items.find((i) => i.metadata.sourceProjectId === projectId && i.kind === "video") ?? null;
}

export async function resolveVaultItemBlob(item: VaultItem): Promise<Blob | null> {
  if (item.blobKey) {
    const localBlob = await loadVaultBlob(item.blobKey);
    if (localBlob) return localBlob;
  }
  if (item.remoteUrl) {
    const res = await fetch(item.remoteUrl);
    if (res.ok) return res.blob();
  }
  return null;
}

/** Reactive hook powering StorageWidget, StorageVaultView, CinemaSidebar, and SocialPublishStudio. */
export function useVault() {
  const [snapshot, setSnapshot] = useState<VaultSnapshot>(() => getOrInitLocalSnapshot());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const onUpdate = () => setSnapshot(getOrInitLocalSnapshot());
    listeners.add(onUpdate);
    void refreshVaultFromServer();
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const next = await refreshVaultFromServer(true);
      setSnapshot(next);
    } finally {
      setSyncing(false);
    }
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[], folderId?: string | null): Promise<VaultItem[]> => {
      const arr = Array.from(files);
      const saved: VaultItem[] = [];
      for (const file of arr) {
        const item = await saveBlobToVault({
          blob: file,
          name: file.name,
          mimeType: file.type,
          folderId,
          source: "upload",
        });
        saved.push(item);
      }
      return saved;
    },
    [],
  );

  const saveSocialDraft = useCallback(async (itemId: string, draft: SocialPublishDraft) => {
    return updateVaultItem(itemId, {
      metadata: { socialDraft: { ...draft, updatedAt: new Date().toISOString() } },
    });
  }, []);

  const recordPublishResults = useCallback(async (itemId: string, record: SocialPublishRecord) => {
    const snap = getOrInitLocalSnapshot();
    const existing = snap.items.find((i) => i.id === itemId);
    const history = existing?.metadata.publishHistory ?? [];
    return updateVaultItem(itemId, {
      metadata: { publishHistory: [record, ...history].slice(0, 20) },
    });
  }, []);

  return {
    folders: snapshot.folders,
    items: snapshot.items,
    syncing,
    refresh,
    uploadFiles,
    saveBlobToVault,
    updateItem: updateVaultItem,
    deleteItem: deleteVaultItem,
    createFolder: createVaultFolder,
    deleteFolder: deleteVaultFolder,
    saveSocialDraft,
    recordPublishResults,
  };
}
