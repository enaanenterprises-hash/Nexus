"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Aperture, Camera, FolderOpen, HardDrive, ImagePlus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STARTER_PHOTOS, generateStarterPhotoBlob } from "@/lib/optics/starter-photos";
import type { OpticsSourceAsset } from "@/lib/optics/types";
import { formatVaultBytes, type VaultItem } from "@/lib/storage/types";
import { resolveVaultItemBlob, useVault } from "@/lib/storage/vault-client";

export type OpticsImportedImage = {
  blob: Blob;
  name: string;
  mimeType: string;
  source: OpticsSourceAsset["source"];
  starterId?: OpticsSourceAsset["starterId"];
  vaultItemId?: string | null;
  cameraHint?: string | null;
};

type ImportTab = "starter" | "vault" | "upload" | "camera";

export function OpticsImportModal({
  open,
  onOpenChange,
  mode = "source",
  onSelectImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `"source"` opens a new primary photograph; `"overlay"` picks a Double Exposure blend plate. */
  mode?: "source" | "overlay";
  onSelectImage: (img: OpticsImportedImage) => void;
}) {
  const vault = useVault();
  const [tab, setTab] = useState<ImportTab>("starter");
  const [search, setSearch] = useState("");
  const [starterPreviews, setStarterPreviews] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Render thumbnails for built-in showcase plates lazily once modal opens
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      for (const spec of STARTER_PHOTOS) {
        if (starterPreviews[spec.id]) continue;
        try {
          const blob = await generateStarterPhotoBlob(spec.id);
          if (!alive) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setStarterPreviews((prev) => ({ ...prev, [spec.id]: url }));
        } catch {
          // Ignore preview failure
        }
      }
    })();
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Manage live camera stream when Camera tab is selected
  useEffect(() => {
    if (!open || tab !== "camera") {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setCameraError("Camera access was unavailable or denied. Allow camera permission or pick from Vault / Device.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
    };
  }, [open, tab]);

  const vaultImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vault.items.filter(
      (item) =>
        item.kind === "image" &&
        (!q || item.name.toLowerCase().includes(q) || item.tags.some((t) => t.toLowerCase().includes(q))),
    );
  }, [vault.items, search]);

  async function pickStarter(starterId: NonNullable<OpticsSourceAsset["starterId"]>, title: string, cameraHint: string) {
    setBusyId(starterId);
    try {
      const blob = await generateStarterPhotoBlob(starterId);
      onSelectImage({
        blob,
        name: title,
        mimeType: "image/png",
        source: "starter",
        starterId,
        cameraHint,
      });
      onOpenChange(false);
    } finally {
      setBusyId(null);
    }
  }

  async function pickVaultItem(item: VaultItem) {
    setBusyId(item.id);
    try {
      const blob = await resolveVaultItemBlob(item);
      if (!blob) return;
      onSelectImage({
        blob,
        name: item.name,
        mimeType: item.mimeType || "image/png",
        source: "vault",
        vaultItemId: item.id,
        cameraHint: "Command Vault plate",
      });
      onOpenChange(false);
    } finally {
      setBusyId(null);
    }
  }

  function handleFilePicked(file: File) {
    onSelectImage({
      blob: file,
      name: file.name.replace(/\.[^.]+$/, "") || "Untitled Plate",
      mimeType: file.type || "image/png",
      source: "upload",
      cameraHint: `${Math.max(1, Math.round(file.size / 1024))} KB · Local Plate`,
    });
    onOpenChange(false);
  }

  async function captureCameraFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    onSelectImage({
      blob,
      name: `Capture ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      mimeType: "image/png",
      source: "capture",
      cameraHint: `${canvas.width}×${canvas.height} · Optical Capture`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-[22px] border border-border bg-card/95 p-0 text-card-foreground shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="border-b border-border/70 px-6 pt-5 pb-4">
          <DialogTitle className="font-editorial text-[1.45rem] font-normal tracking-[-0.02em]">
            {mode === "overlay" ? "Select Double Exposure Plate" : "Open Photograph in Optics"}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            {mode === "overlay"
              ? "Choose a secondary image to blend optically over your active frame."
              : "Start from curated showcase stills, open any image in Command Storage, upload from disk, or capture live."}
          </DialogDescription>

          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
            {(
              [
                { id: "starter", label: "Showcase Stills", icon: Aperture },
                { id: "vault", label: `Command Vault (${vaultImages.length})`, icon: HardDrive },
                { id: "upload", label: "Device File", icon: Upload },
                { id: "camera", label: "Camera", icon: Camera },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors ${
                    active
                      ? "border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/12 text-foreground"
                      : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </DialogHeader>

        <div className="p-6">
          {tab === "starter" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {STARTER_PHOTOS.map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  disabled={busyId === spec.id}
                  onClick={() => void pickStarter(spec.id, spec.title, spec.cameraHint)}
                  className="group flex flex-col overflow-hidden rounded-[16px] border border-border/80 bg-background/50 text-left transition-all hover:border-[color:var(--land-gold)]/60 hover:bg-background"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
                    {starterPreviews[spec.id] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={starterPreviews[spec.id]}
                        alt={spec.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground">
                        <Aperture className="size-5 animate-pulse" />
                      </div>
                    )}
                    <span className="absolute right-2 bottom-2 rounded-full bg-black/65 px-2 py-0.5 font-mono text-[10px] text-white tabular-nums backdrop-blur-md">
                      {spec.aspect}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="text-[13px] font-medium text-foreground">{spec.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                      {spec.subtitle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {tab === "vault" ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter images in Command Storage…"
                  aria-label="Filter images in Command Storage"
                  className="h-9 rounded-full pl-8 text-[12.5px]"
                />
              </div>
              {vaultImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
                  <FolderOpen className="size-6 text-muted-foreground" />
                  <p className="mt-2 text-[13px] font-medium text-foreground">
                    No matching images in Command Storage
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Save an Optics plate or drop photos into Storage to access them here.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[290px] pr-2">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {vaultImages.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void pickVaultItem(item)}
                        className="group overflow-hidden rounded-[14px] border border-border/80 bg-background/50 text-left transition-all hover:border-[color:var(--land-gold)]/60"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden bg-muted/40">
                          {item.thumbnailDataUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.thumbnailDataUrl}
                              alt={item.name}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-muted-foreground">
                              <ImagePlus className="size-5" />
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="truncate text-[12.5px] font-medium text-foreground">{item.name}</p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                            {formatVaultBytes(item.sizeBytes)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : null}

          {tab === "upload" ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-background/40 px-6 py-12 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFilePicked(file);
                  e.target.value = "";
                }}
              />
              <div className="grid size-12 place-items-center rounded-2xl border border-border bg-card">
                <Upload className="size-5 text-[color:var(--land-gold)]" />
              </div>
              <p className="mt-3 text-[14px] font-medium text-foreground">
                Load any high-resolution photograph
              </p>
              <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
                PNG, JPEG, WebP, HEIC (browser-decoded), or SVG rasterized locally inside your browser — nothing leaves your device.
              </p>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 h-10 rounded-full bg-foreground px-5 text-[13px] text-background hover:bg-foreground/90"
              >
                Choose Photo from Device
              </Button>
            </div>
          ) : null}

          {tab === "camera" ? (
            <div className="space-y-4">
              {cameraError ? (
                <div className="rounded-2xl border border-border bg-background/50 p-6 text-center text-[13px] text-muted-foreground">
                  {cameraError}
                </div>
              ) : (
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  {/* Rule of thirds optical viewfinder overlay */}
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }, (_, i) => (
                      <div key={i} className="border-[0.5px] border-white/15" />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  disabled={Boolean(cameraError)}
                  onClick={() => void captureCameraFrame()}
                  className="h-10 gap-2 rounded-full bg-[color:var(--land-gold)] px-5 text-[13px] font-medium text-black hover:opacity-90"
                >
                  <Aperture className="size-4" />
                  <span>Capture Plate</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
