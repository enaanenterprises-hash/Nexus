"use client";

import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  BarChart3,
  FileText,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Music,
  Plus,
  Send,
  Upload,
} from "lucide-react";
import { StorageVaultView } from "@/components/storage/StorageVaultView";
import { formatVaultBytes, formatVaultDuration, kindLabel, type VaultItem } from "@/lib/storage/types";
import { useVault } from "@/lib/storage/vault-client";
import type { CommandController } from "../use-command";
import { WidgetFrame } from "./frame";

function itemKindIcon(item: VaultItem) {
  switch (item.kind) {
    case "video":
      return Film;
    case "audio":
      return Music;
    case "image":
      return ImageIcon;
    case "dataset":
      return BarChart3;
    default:
      return FileText;
  }
}

export function StorageWidget({
  command,
  expanded = false,
  initialItemId = null,
  onExpand,
  onExpandWithItem,
  onCollapse,
  onConnections,
  onOpenCinemaWithItem,
  onOpenStudioWithItem,
  onOpenOpticsWithItem,
  style,
}: {
  command: CommandController;
  expanded?: boolean;
  initialItemId?: string | null;
  onExpand?: () => void;
  onExpandWithItem?: (itemId: string) => void;
  onCollapse?: () => void;
  onConnections?: (connectorId?: string) => void;
  onOpenCinemaWithItem?: (itemId: string) => void;
  onOpenStudioWithItem?: (itemId: string) => void;
  onOpenOpticsWithItem?: (itemId: string) => void;
  style?: CSSProperties;
}) {
  const vault = useVault();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);

  const connectedConnectorIds = useMemo(
    () =>
      (command.state?.connections ?? [])
        .filter((c) => c.status === "ok" && c.hasCredentials)
        .map((c) => c.connectorId),
    [command.state?.connections],
  );

  const connectedAccounts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of command.state?.connections ?? []) {
      const label = c.settings?.["accountLabel"]?.trim();
      if (c.status === "ok" && c.hasCredentials && label) out[c.connectorId] = label;
    }
    return out;
  }, [command.state?.connections]);

  const totalBytes = useMemo(
    () => vault.items.reduce((sum, item) => sum + item.sizeBytes, 0),
    [vault.items],
  );

  const previewItems = useMemo(() => vault.items.slice(0, 4), [vault.items]);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);
    if (e.dataTransfer.files?.length) {
      void vault.uploadFiles(e.dataTransfer.files);
    }
  }

  return (
    <WidgetFrame
      widgetId="storage"
      title="Storage"
      icon={<HardDrive className="size-3.5 text-[color:var(--land-gold)]" />}
      hint={
        vault.items.length > 0
          ? `${vault.items.length} file${vault.items.length === 1 ? "" : "s"} · ${formatVaultBytes(totalBytes)}`
          : "Vault"
      }
      removable={false}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={() => {}}
      style={style}
      actions={
        !expanded ? (
          <button
            type="button"
            data-no-expand="true"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            aria-label="Upload file to Storage"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border/80 bg-background/60 px-2 text-[11px] font-medium text-foreground transition-colors hover:border-[color:var(--land-gold)]/60"
          >
            <Plus className="size-3 text-[color:var(--land-gold)]" />
            <span className="hidden sm:inline">Add</span>
          </button>
        ) : undefined
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void vault.uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {expanded ? (
        <StorageVaultView
          initialItemId={initialItemId}
          connectedConnectorIds={connectedConnectorIds}
          connectedAccounts={connectedAccounts}
          connectorAvailability={command.state?.availability}
          onOpenCinemaWithItem={onOpenCinemaWithItem}
          onOpenStudioWithItem={onOpenStudioWithItem}
          onOpenOpticsWithItem={onOpenOpticsWithItem}
          onOpenConnections={(connectorId) => onConnections?.(connectorId)}
        />
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!draggingOver) setDraggingOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDraggingOver(false);
            }
          }}
          onDrop={handleDrop}
          className={`relative flex h-full min-h-0 flex-col justify-between gap-2.5 rounded-xl transition-colors ${
            draggingOver ? "ring-1 ring-[color:var(--land-gold)]" : ""
          }`}
        >
          {/* Thin proportional footprint bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>Videos · Podcasts · Notes · Datasets</span>
              <span className="font-mono text-[10.5px] text-foreground">
                {vault.items.length > 0 ? formatVaultBytes(totalBytes) : "Ready"}
              </span>
            </div>
            <div className="h-[2px] w-full overflow-hidden rounded-full bg-border/60" aria-hidden>
              <div
                className="h-full rounded-full bg-[color:var(--land-gold)] transition-all duration-300"
                style={{ width: `${vault.items.length > 0 ? Math.min(100, Math.max(12, vault.items.length * 14)) : 0}%` }}
              />
            </div>
          </div>

          {previewItems.length > 0 ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              {previewItems.map((item) => {
                const Icon = itemKindIcon(item);
                const hasLivePost = item.metadata.publishHistory?.some((r) =>
                  r.platforms.some((p) => p.status === "published"),
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-no-expand="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onExpandWithItem) onExpandWithItem(item.id);
                      else onExpand?.();
                    }}
                    className="group/tile relative flex min-h-[82px] flex-col justify-between overflow-hidden rounded-[10px] border border-border/75 bg-background/60 p-2 text-left transition-colors hover:border-[color:var(--land-gold)]/55"
                  >
                    {item.thumbnailDataUrl ? (
                      <div className="relative mb-1.5 aspect-[16/9] w-full overflow-hidden rounded-[6px] bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnailDataUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {item.metadata.durationMs ? (
                          <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 py-px font-mono text-[9px] text-white tabular-nums">
                            {formatVaultDuration(item.metadata.durationMs)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mb-1.5 flex aspect-[16/9] w-full items-center justify-center rounded-[6px] border border-border/50 bg-muted/40">
                        {item.kind === "audio" ? (
                          <div className="flex h-5 items-center gap-[2px]">
                            {[0.4, 0.8, 0.6, 1, 0.5, 0.75, 0.35, 0.65].map((h, i) => (
                              <span
                                key={i}
                                className="w-[2px] rounded-full bg-[color:var(--land-gold)]"
                                style={{ height: `${Math.round(h * 100)}%` }}
                              />
                            ))}
                          </div>
                        ) : (
                          <Icon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-foreground">
                        {item.name}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between text-[9.5px] text-muted-foreground tabular-nums">
                        <span className="truncate">{kindLabel(item.kind)}</span>
                        {hasLivePost ? (
                          <Send className="size-2.5 shrink-0 text-[color:var(--land-gold)]" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[90px] flex-1 items-center justify-between gap-3 rounded-[12px] border border-dashed border-border/85 bg-background/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">
                  Drop exports, podcasts, notes, or datasets
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Open Storage to manage files or post videos across TikTok, Instagram, YouTube, X &amp; LinkedIn.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5" data-no-expand="true">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[11.5px] font-medium text-foreground hover:border-[color:var(--land-gold)]/60"
                >
                  <Upload className="size-3.5 text-[color:var(--land-gold)]" />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpand?.();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-[11.5px] font-medium text-background hover:opacity-90"
                >
                  <FolderOpen className="size-3.5" />
                  <span>Open</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </WidgetFrame>
  );
}
