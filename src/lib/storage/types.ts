import type { SocialPublishDraft, SocialPublishRecord } from "@/lib/social/platforms";

/**
 * Domain-agnostic Storage Vault model inside Command.
 * Built to hold videos & Studio audio today and expand seamlessly to Class Notes,
 * Business Analytics datasets, and future extensions via typed metadata + `extensions` bags.
 */
export type VaultItemKind =
  | "video"
  | "audio"
  | "image"
  | "document"
  | "dataset"
  | "note"
  | "archive"
  | "other";

export type VaultSpaceId =
  | "all"
  | "videos"
  | "audio"
  | "documents"
  | "analytics"
  | "published"
  | "starred";

export interface VaultFolder {
  id: string;
  name: string;
  parentId: string | null;
  description?: string | null;
  system: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  aspectRatio?: string;
  codec?: string;
  peaks?: number[];
  wordCount?: number;
  rowCount?: number;
  columns?: string[];
  excerpt?: string;
  sourceNodeId?: string;
  sourceProjectId?: string;
  sourceRecordingId?: string;
  socialDraft?: SocialPublishDraft;
  publishHistory?: SocialPublishRecord[];
  /** Open extension metadata namespace for future modules (e.g. study decks, analytics schemas). */
  extensions?: Record<string, unknown>;
}

export interface VaultItem {
  id: string;
  folderId: string | null;
  name: string;
  mimeType: string;
  kind: VaultItemKind;
  sizeBytes: number;
  blobKey: string | null;
  remoteUrl: string | null;
  thumbnailDataUrl: string | null;
  starred: boolean;
  tags: string[];
  metadata: VaultItemMetadata;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_VAULT_FOLDERS: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
}> = [
  {
    id: "cinema-exports",
    name: "Cinema Exports",
    description: "Rendered timelines and camera captures from Nexus Cinema.",
  },
  {
    id: "podcast-audio",
    name: "Podcast & Audio",
    description: "Mixed podcast masters and stems from Recording Studio.",
  },
  {
    id: "class-notes",
    name: "Class Notes",
    description: "Lectures, outlines, PDFs, and study material.",
  },
  {
    id: "business-analytics",
    name: "Business Analytics",
    description: "CSV datasets, dashboards, and quarterly telemetry exports.",
  },
];

const EXT_MAP: Record<string, VaultItemKind> = {
  mp4: "video",
  mov: "video",
  webm: "video",
  m4v: "video",
  mkv: "video",
  wav: "audio",
  mp3: "audio",
  m4a: "audio",
  ogg: "audio",
  flac: "audio",
  aac: "audio",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  csv: "dataset",
  tsv: "dataset",
  xlsx: "dataset",
  parquet: "dataset",
  json: "dataset",
  md: "note",
  txt: "note",
  pdf: "document",
  doc: "document",
  docx: "document",
  ppt: "document",
  pptx: "document",
  zip: "archive",
  tar: "archive",
  gz: "archive",
};

export function classifyVaultKind(mimeType: string, filename: string): VaultItemKind {
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.startsWith("video/")) return "video";
  if (lowerMime.startsWith("audio/")) return "audio";
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.includes("csv") || lowerMime.includes("spreadsheet")) return "dataset";
  if (lowerMime === "text/markdown") return "note";
  if (lowerMime === "application/pdf" || lowerMime.startsWith("text/")) return "document";

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "other";
}

export function defaultFolderForKind(kind: VaultItemKind, sourceNodeId?: string): string | null {
  if (sourceNodeId === "dev.nexus.cinema") return "cinema-exports";
  if (sourceNodeId === "dev.nexus.studio") return "podcast-audio";
  if (kind === "video") return "cinema-exports";
  if (kind === "audio") return "podcast-audio";
  if (kind === "note") return "class-notes";
  if (kind === "dataset") return "business-analytics";
  return null;
}

export function formatVaultBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatVaultDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSecs = Math.max(0, Math.round(ms / 1000));
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function itemMatchesSpace(item: VaultItem, space: VaultSpaceId): boolean {
  switch (space) {
    case "all":
      return true;
    case "videos":
      return item.kind === "video";
    case "audio":
      return item.kind === "audio";
    case "documents":
      return item.kind === "document" || item.kind === "note";
    case "analytics":
      return item.kind === "dataset";
    case "published":
      return (item.metadata.publishHistory?.length ?? 0) > 0;
    case "starred":
      return item.starred;
  }
}

export function kindLabel(kind: VaultItemKind): string {
  switch (kind) {
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "image":
      return "Image";
    case "document":
      return "Document";
    case "dataset":
      return "Dataset";
    case "note":
      return "Note";
    case "archive":
      return "Archive";
    case "other":
      return "File";
  }
}
