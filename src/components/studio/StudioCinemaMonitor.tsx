"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Film, Maximize2, Minimize2, X } from "lucide-react";
import { renderCinemaFrame } from "@/lib/cinema/compositor";
import { loadCinemaBlob } from "@/lib/cinema/media-db";
import type { CinemaProject } from "@/lib/cinema/types";
import { subscribeActiveCinemaProject } from "@/lib/creative/nexus-bridge";

function fmtMonitorTimecode(ms: number, fps = 30): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const f = Math.floor(((safe % 1000) / 1000) * fps);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

/**
 * Floating Picture-in-Picture Cinema monitor docked inside Recording Studio.
 * Scrubs and plays Cinema's live edit lock-step with Studio's audio playhead.
 */
export function StudioCinemaMonitor({
  open,
  playheadMs,
  transport,
  onOpenCinema,
  onClose,
}: {
  open: boolean;
  playheadMs: number;
  transport: "idle" | "counting-in" | "recording" | "paused" | "playing";
  onOpenCinema?: () => void;
  onClose: () => void;
}) {
  const [project, setProject] = useState<CinemaProject | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const hydratingRef = useRef<Set<string>>(new Set());
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const redrawRef = useRef<(() => void) | null>(null);
  const playheadRef = useRef(playheadMs);

  useEffect(() => {
    playheadRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    return subscribeActiveCinemaProject((next) => {
      setProject(next);
    });
  }, []);

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  // Hydrate video/image media elements for Cinema's live snapshot
  useEffect(() => {
    if (!open || !project) return;
    for (const asset of project.assets) {
      if (asset.kind === "audio") continue;
      if (mediaElementsRef.current.has(asset.id) || hydratingRef.current.has(asset.id)) continue;
      hydratingRef.current.add(asset.id);

      void (async () => {
        try {
          let blob: Blob | null = asset.idbKey ? await loadCinemaBlob(asset.idbKey) : null;
          if (!blob && asset.url) {
            const res = await fetch(asset.url);
            if (res.ok) blob = await res.blob();
          }
          if (!blob) return;

          const url = URL.createObjectURL(blob);
          blobUrlsRef.current.add(url);

          if (asset.kind === "image") {
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error("Monitor image load failed"));
              img.src = url;
            });
            mediaElementsRef.current.set(asset.id, img);
            setMediaVersion((v) => v + 1);
          } else {
            const vid = document.createElement("video");
            vid.crossOrigin = "anonymous";
            vid.muted = true;
            vid.playsInline = true;
            vid.preload = "auto";
            vid.src = url;
            vid.addEventListener("seeked", () => redrawRef.current?.());
            vid.addEventListener("loadeddata", () => redrawRef.current?.());
            await new Promise<void>((resolve) => {
              const t = window.setTimeout(resolve, 4000);
              vid.onloadeddata = () => {
                window.clearTimeout(t);
                resolve();
              };
              vid.onerror = () => {
                window.clearTimeout(t);
                resolve();
              };
            });
            mediaElementsRef.current.set(asset.id, vid);
            setMediaVersion((v) => v + 1);
          }
        } finally {
          hydratingRef.current.delete(asset.id);
        }
      })();
    }
  }, [open, project]);

  const syncVideos = useCallback(
    (ms: number, isMoving: boolean) => {
      if (!project) return;
      const activeIds = new Set<string>();
      for (const clip of project.clips) {
        if (clip.kind !== "video" || clip.hidden) continue;
        if (ms >= clip.startMs && ms <= clip.startMs + clip.durationMs) {
          activeIds.add(clip.assetId);
          const vid = mediaElementsRef.current.get(clip.assetId);
          if (!(vid instanceof HTMLVideoElement)) continue;
          const targetSec = Math.max(0, (clip.trimStartMs + (ms - clip.startMs) * (clip.speed || 1)) / 1000);
          if (isMoving) {
            if (vid.paused) {
              if (Math.abs(vid.currentTime - targetSec) > 0.1) vid.currentTime = targetSec;
              void vid.play().catch(() => {});
            } else if (Math.abs(vid.currentTime - targetSec) > 0.28) {
              vid.currentTime = targetSec;
            }
          } else {
            if (!vid.paused) vid.pause();
            if (Math.abs(vid.currentTime - targetSec) > 0.04) {
              vid.currentTime = targetSec;
            }
          }
        }
      }
      for (const [id, el] of mediaElementsRef.current) {
        if (el instanceof HTMLVideoElement && !activeIds.has(id) && !el.paused) {
          el.pause();
        }
      }
    },
    [project],
  );

  const isMoving = transport === "playing" || transport === "recording";

  useEffect(() => {
    if (!open || !project) return;
    const drawAt = (ms: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== project.width) canvas.width = project.width;
      if (canvas.height !== project.height) canvas.height = project.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderCinemaFrame(ctx, project, ms, { mediaElements: mediaElementsRef.current });
    };

    redrawRef.current = () => drawAt(playheadRef.current);
    syncVideos(playheadMs, isMoving);
    drawAt(playheadMs);

    if (!isMoving) return;
    let rafId = 0;
    const tick = () => {
      drawAt(playheadRef.current);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isMoving, mediaVersion, open, playheadMs, project, syncVideos]);

  const nextCueMs = useMemo(() => {
    if (!project) return null;
    const points = [
      ...project.clips.map((c) => c.startMs),
      ...project.clips.map((c) => c.startMs + c.durationMs),
      ...project.markers.map((m) => m.atMs),
    ]
      .filter((t) => t > playheadMs + 50)
      .sort((a, b) => a - b);
    return points[0] ?? null;
  }, [playheadMs, project]);

  if (!open) return null;

  const widthPx = expanded ? 384 : 284;
  const aspectStyle = project
    ? { aspectRatio: `${project.width} / ${Math.max(1, project.height)}` }
    : { aspectRatio: "16 / 9" };

  return (
    <aside
      aria-label="Cinema Video Monitor"
      style={{ width: widthPx }}
      className="cinema-glass-bar fixed right-4 bottom-4 z-30 overflow-hidden rounded-xl shadow-2xl"
    >
      {/* Compact Header Strip */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--nexus-link)]" />
          <span className="truncate text-[11px] font-medium text-foreground">
            {project ? project.title : "Cinema Monitor"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onOpenCinema ? (
            <button
              type="button"
              onClick={onOpenCinema}
              aria-label="Switch to Cinema"
              title="Open in Cinema"
              className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <ArrowUpRight className="size-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Shrink video monitor" : "Expand video monitor"}
            className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide Cinema monitor"
            className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Live Aspect-Correct Video Canvas */}
      <div style={aspectStyle} className="relative w-full bg-[#08080a]">
        {project ? (
          <canvas ref={canvasRef} className="block h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center">
            <Film className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-[11px] text-muted-foreground">
              Open Cinema to sync live frames
            </span>
          </div>
        )}

        {/* Frame-Locked Timecode + Cut Countdown */}
        <div className="pointer-events-none absolute right-2 bottom-1.5 left-2 flex items-center justify-between font-mono text-[10px] text-white tabular-nums">
          <span className="rounded bg-black/75 px-1.5 py-0.5">
            {fmtMonitorTimecode(playheadMs, project?.fps ?? 30)}
          </span>
          {nextCueMs !== null ? (
            <span className="rounded bg-black/75 px-1.5 py-0.5 text-[color:var(--nexus-link)]">
              Cue in {((nextCueMs - playheadMs) / 1000).toFixed(1)}s
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
