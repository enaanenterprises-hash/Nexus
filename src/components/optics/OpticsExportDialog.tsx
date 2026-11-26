"use client";

import { useState } from "react";
import { CheckCircle2, Download, Film, HardDrive, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { OPTICS_NODE_ID } from "@/extensions/optics/node";
import { exportBufferToBlob } from "@/lib/optics/processors/engine";
import type { ImageBuffer } from "@/lib/optics/processors/tonal";
import type { OpticsProject } from "@/lib/optics/types";
import { formatVaultBytes, type VaultItem } from "@/lib/storage/types";
import { saveBlobToVault } from "@/lib/storage/vault-client";

export type OpticsExportFormat = "image/jpeg" | "image/png" | "image/webp";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function OpticsExportDialog({
  open,
  onOpenChange,
  project,
  renderFullPlate,
  onPersistProject,
  onSendToCinema,
  onPublishVaultItem,
  onSavedNotice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: OpticsProject;
  renderFullPlate: () => Promise<ImageBuffer>;
  onPersistProject?: () => Promise<OpticsProject>;
  onSendToCinema: (vaultItem: VaultItem, blob: Blob, width: number, height: number) => void;
  onPublishVaultItem: (vaultItem: VaultItem) => void;
  onSavedNotice: (msg: string) => void;
}) {
  const [format, setFormat] = useState<OpticsExportFormat>("image/jpeg");
  const [quality, setQuality] = useState(94);
  const [scale, setScale] = useState<1 | 0.75 | 0.5>(1);
  const [busyAction, setBusyAction] = useState<"download" | "vault" | "cinema" | "publish" | null>(null);
  const [savedVaultItem, setSavedVaultItem] = useState<VaultItem | null>(null);

  const ext = format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
  const safeBase = project.title.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") || "optics-plate";
  const outW = Math.max(1, Math.round(project.width * scale));
  const outH = Math.max(1, Math.round(project.height * scale));

  async function buildOutput() {
    const buffer = await renderFullPlate();
    const blob = await exportBufferToBlob(buffer, format, quality / 100, scale);
    return { buffer, blob };
  }

  async function persistToVault(blob: Blob, w: number, h: number): Promise<VaultItem> {
    const persisted = onPersistProject ? await onPersistProject() : project;
    const saved = await saveBlobToVault({
      blob,
      name: `${safeBase}.${ext}`,
      mimeType: format,
      folderId: "optics-darkroom",
      tags: ["optics", ...persisted.tags],
      source: "extension",
      metadata: {
        width: w,
        height: h,
        aspectRatio: `${w}:${h}`,
        sourceNodeId: OPTICS_NODE_ID,
        sourceProjectId: persisted.id,
        extensions: {
          [OPTICS_NODE_ID]: {
            projectId: persisted.id,
            layerCount: persisted.editStack.length,
            activeLookId: persisted.activeLookId,
          },
        },
      },
    });
    setSavedVaultItem(saved);
    return saved;
  }

  async function runAction(action: "download" | "vault" | "cinema" | "publish") {
    setBusyAction(action);
    try {
      const { buffer, blob } = await buildOutput();
      const fw = Math.max(1, Math.round(buffer.width * scale));
      const fh = Math.max(1, Math.round(buffer.height * scale));
      if (action === "download") {
        triggerDownload(blob, `${safeBase}.${ext}`);
        onSavedNotice(`Downloaded ${safeBase}.${ext} (${formatVaultBytes(blob.size)}).`);
      } else if (action === "vault") {
        await persistToVault(blob, fw, fh);
        onSavedNotice(`Saved ${safeBase}.${ext} to Command Storage → Optics Darkroom.`);
      } else if (action === "cinema") {
        const vItem = await persistToVault(blob, fw, fh);
        onOpenChange(false);
        onSendToCinema(vItem, blob, fw, fh);
      } else if (action === "publish") {
        const vItem = await persistToVault(blob, fw, fh);
        onOpenChange(false);
        onPublishVaultItem(vItem);
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[22px] border border-border bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-[1.45rem] font-medium tracking-[-0.02em]">
            Develop &amp; Export Master
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            Render your full-resolution non-destructive stack ({project.editStack.length} layer
            {project.editStack.length === 1 ? "" : "s"}) cleanly to disk, Command Storage, Cinema, or Social Publish.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-5">
          {/* Format picker */}
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-muted-foreground">Output Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "image/jpeg", label: "JPEG", hint: "Social & Print" },
                  { id: "image/png", label: "PNG", hint: "Lossless Alpha" },
                  { id: "image/webp", label: "WebP", hint: "High Efficiency" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    format === f.id
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                      : "border-border/80 bg-background/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="text-[13px] font-semibold">{f.label}</div>
                  <div className="text-[11px] opacity-80">{f.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quality + Scale */}
          {format !== "image/png" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Compression Quality</span>
                <span className="font-mono text-foreground tabular-nums">{quality}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={100}
                step={1}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                aria-label="Compression Quality"
                className="optics-range w-full"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Dimensions</span>
              <span className="font-mono text-foreground tabular-nums">
                {outW} × {outH} px
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([1, 0.75, 0.5] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={`h-9 rounded-xl border font-mono text-[12px] tabular-nums transition-colors ${
                    scale === s
                      ? "border-foreground/50 bg-foreground/10 text-foreground"
                      : "border-border/80 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
          </div>

          {savedVaultItem ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-[12.5px] text-emerald-500">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Saved to Command Vault ({formatVaultBytes(savedVaultItem.sizeBytes)}).
              </span>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => void runAction("download")}
              className="h-11 justify-start gap-2 rounded-xl px-4 text-[13px]"
            >
              {busyAction === "download" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              <span>Download File</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => void runAction("vault")}
              className="h-11 justify-start gap-2 rounded-xl px-4 text-[13px]"
            >
              {busyAction === "vault" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <HardDrive className="size-4 text-[color:var(--land-gold)]" />
              )}
              <span>Save to Vault</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => void runAction("cinema")}
              className="h-11 justify-start gap-2 rounded-xl px-4 text-[13px]"
            >
              {busyAction === "cinema" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Film className="size-4" />
              )}
              <span>Send to Cinema</span>
            </Button>

            <Button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void runAction("publish")}
              className="h-11 justify-start gap-2 rounded-xl bg-[color:var(--land-gold)] px-4 text-[13px] font-medium text-black hover:opacity-90"
            >
              {busyAction === "publish" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Share2 className="size-4" />
              )}
              <span>Publish to Social…</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
