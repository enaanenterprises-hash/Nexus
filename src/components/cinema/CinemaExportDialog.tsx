"use client";

import { useRef, useState } from "react";
import { Download, Film, Image as ImageIcon, Loader2, Waves, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { computeProjectDurationMs, type CinemaRenderRuntime } from "@/lib/cinema/compositor";
import { exportCinemaVideo, exportCurrentFramePng, type CinemaExportResult } from "@/lib/cinema/exporter";
import type {
  CinemaExportFormat,
  CinemaExportOptions,
  CinemaExportProgress,
  CinemaProject,
} from "@/lib/cinema/types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

const FORMAT_CARDS: Array<{
  id: CinemaExportFormat;
  label: string;
  sub: string;
  icon: typeof Film;
}> = [
  { id: "mp4", label: "MP4 Video", sub: "Turbo Hardware WebCodecs H.264", icon: Film },
  { id: "webm", label: "WebM Video", sub: "Real-time VP9 / Opus container", icon: Film },
  { id: "png", label: "PNG Frame", sub: "Crisp still at current playhead", icon: ImageIcon },
  { id: "wav-studio", label: "Master WAV", sub: "48 kHz mixdown for Studio / DAW", icon: Waves },
];

export function CinemaExportDialog({
  open,
  onOpenChange,
  project,
  playheadMs,
  theme,
  mediaElementsRef,
  audioBuffersRef,
  onSendMasterWavToStudio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: CinemaProject;
  playheadMs: number;
  theme: "dark" | "light";
  mediaElementsRef: React.RefObject<Map<string, HTMLVideoElement | HTMLImageElement>>;
  audioBuffersRef: React.RefObject<Map<string, AudioBuffer>>;
  onSendMasterWavToStudio: (blob: Blob) => Promise<void>;
}) {
  const [format, setFormat] = useState<CinemaExportFormat>("mp4");
  const [resolution, setResolution] = useState<"1080p" | "720p">("1080p");
  const [fps, setFps] = useState<24 | 30 | 60>(project.fps);
  const [quality, setQuality] = useState<"high" | "balanced">("balanced");

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<CinemaExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CinemaExportResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function startExport() {
    setError(null);
    setLastResult(null);
    setExporting(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const mediaElements = mediaElementsRef.current;
      const audioBuffers = audioBuffersRef.current;
      let result: CinemaExportResult;
      if (format === "png") {
        const runtime: CinemaRenderRuntime = { mediaElements, showSafeGuides: false, isExport: true };
        result = await exportCurrentFramePng(project, playheadMs, runtime);
      } else {
        const options: CinemaExportOptions = { format, resolution, fps, quality };
        result = await exportCinemaVideo(
          project,
          options,
          { mediaElements, audioBuffers },
          (p) => setProgress(p),
          controller.signal,
        );
      }

      if (format === "wav-studio") {
        await onSendMasterWavToStudio(result.blob);
      }
      downloadBlob(result.blob, result.filename);
      setLastResult(result);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        setError("Export cancelled.");
      } else {
        setError(err instanceof Error ? err.message : "Export failed.");
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  }

  function cancelExport() {
    abortRef.current?.abort();
  }

  const durationSec = (computeProjectDurationMs(project) / 1000).toFixed(1);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!exporting) onOpenChange(next);
      }}
    >
      <DialogContent
        data-theme={theme}
        className="setup-card max-w-[540px] rounded-[22px] border border-border p-6"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-[1.15rem] font-medium tracking-[-0.015em]">
            Export {project.title}
          </DialogTitle>
          <DialogDescription className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {project.aspectRatio} · {durationSec}s · Rendered 100% client-side
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Format Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {FORMAT_CARDS.map((card) => {
              const Icon = card.icon;
              const active = format === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={exporting}
                  onClick={() => setFormat(card.id)}
                  className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors ${
                    active
                      ? "border-[color:var(--cinema-select)] bg-[color:var(--cinema-select-soft)] text-foreground"
                      : "border-border/80 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${
                      card.id === "wav-studio"
                        ? "text-[color:var(--nexus-link)]"
                        : active
                          ? "text-[color:var(--cinema-playhead)]"
                          : ""
                    }`}
                    strokeWidth={1.6}
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground">{card.label}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {card.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {format === "mp4" || format === "webm" ? (
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border/80 bg-muted/25 p-3.5 text-[12px]">
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">Resolution</div>
                <div className="flex gap-1">
                  {(["1080p", "720p"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={exporting}
                      onClick={() => setResolution(r)}
                      className={`flex-1 rounded-lg py-1 font-mono text-[11px] transition-colors ${
                        resolution === r
                          ? "bg-foreground font-medium text-background"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">Frame rate</div>
                <div className="flex gap-1">
                  {([24, 30, 60] as const).map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      disabled={exporting}
                      onClick={() => setFps(rate)}
                      className={`flex-1 rounded-lg py-1 font-mono text-[11px] tabular-nums transition-colors ${
                        fps === rate
                          ? "bg-foreground font-medium text-background"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {rate}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">Quality</div>
                <div className="flex gap-1">
                  {(["high", "balanced"] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={exporting}
                      onClick={() => setQuality(q)}
                      className={`flex-1 rounded-lg py-1 text-[11px] capitalize transition-colors ${
                        quality === q
                          ? "bg-foreground font-medium text-background"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {q === "high" ? "High" : "Fast"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {progress && exporting ? (
            <div className="space-y-2 rounded-2xl border border-border/80 bg-card/60 p-3.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-foreground">{progress.message}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {Math.round(progress.progress * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-[color:var(--cinema-playhead)] transition-all duration-150"
                  style={{ width: `${Math.round(progress.progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}

          {lastResult && !exporting ? (
            <p className="rounded-xl border border-[color:var(--cinema-select)]/45 bg-[color:var(--cinema-select-soft)] px-3 py-2 text-[12px] text-foreground">
              Saved <strong>{lastResult.filename}</strong> ({(lastResult.blob.size / (1024 * 1024)).toFixed(2)} MB)
              {format === "wav-studio" ? " & staged for Recording Studio." : "."}
            </p>
          ) : null}

          <Separator />

          <div className="flex items-center justify-end gap-2">
            {exporting ? (
              <Button type="button" variant="outline" onClick={cancelExport} className="rounded-full">
                <X className="mr-1.5 size-3.5" />
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={exporting}
              onClick={() => void startExport()}
              className="h-9 gap-1.5 rounded-full bg-foreground px-5 text-[13px] font-medium text-background hover:opacity-90"
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              <span>
                {exporting
                  ? "Rendering…"
                  : format === "png"
                    ? "Save Frame (.png)"
                    : format === "wav-studio"
                      ? "Export WAV + Send to Studio"
                      : `Render ${format.toUpperCase()}`}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
