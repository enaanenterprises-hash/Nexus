"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BookmarkPlus,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Film,
  Lock,
  Magnet,
  Maximize2,
  MousePointer,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  Waves,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeProjectDurationMs } from "@/lib/cinema/compositor";
import { TRANSITION_PRESETS } from "@/lib/cinema/presets";
import type {
  CinemaClip,
  CinemaMarker,
  CinemaProject,
  CinemaTrackKind,
  CinemaTransitionType,
} from "@/lib/cinema/types";

export type CinemaTimelineTool = "select" | "cut";

type DragState =
  | { kind: "scrub"; pointerId: number }
  | {
      kind: "move";
      pointerId: number;
      clipId: string;
      startX: number;
      origStartMs: number;
      origTrackId: string;
      previewStartMs: number;
      previewTrackId: string;
    }
  | {
      kind: "trim-left" | "trim-right";
      pointerId: number;
      clipId: string;
      startX: number;
      origStartMs: number;
      origTrimStartMs: number;
      origDurationMs: number;
      sourceDurationMs: number;
      previewStartMs: number;
      previewTrimStartMs: number;
      previewDurationMs: number;
    };

const TRACK_HEADER_W = 136;
const RULER_H = 28;
const TRACK_H = 54;
const MIN_CLIP_MS = 200;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fmtRulerTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function trackIcon(kind: CinemaTrackKind) {
  if (kind === "audio") return Waves;
  if (kind === "text") return Type;
  if (kind === "overlay") return Sparkles;
  return Film;
}

function compatibleTrackForClip(clipKind: CinemaClip["kind"], trackKind: CinemaTrackKind): boolean {
  if (clipKind === "audio") return trackKind === "audio";
  if (clipKind === "text") return trackKind === "text" || trackKind === "overlay";
  return trackKind === "video" || trackKind === "overlay";
}

export function CinemaTimeline({
  project,
  playheadMs,
  zoom,
  snapEnabled,
  toolMode,
  selectedClipId,
  timelineHeight,
  onResizeHeight,
  onSelectClip,
  onSeek,
  onChangeZoom,
  onToggleSnap,
  onChangeTool,
  onMoveClip,
  onTrimClip,
  onSplitClipAt,
  onDuplicateClip,
  onDeleteClip,
  onAddMarker,
  onSelectMarker,
  onToggleTrackMute,
  onToggleTrackHidden,
  onToggleTrackLocked,
  onAddTrack,
  onSetTransition,
  onExtractVideoAudio,
  onDropFiles,
  onFitZoom,
}: {
  project: CinemaProject;
  playheadMs: number;
  zoom: number;
  snapEnabled: boolean;
  toolMode: CinemaTimelineTool;
  selectedClipId: string | null;
  timelineHeight: number;
  onResizeHeight: (h: number) => void;
  onSelectClip: (clipId: string | null) => void;
  onSeek: (ms: number) => void;
  onChangeZoom: (z: number) => void;
  onToggleSnap: () => void;
  onChangeTool: (tool: CinemaTimelineTool) => void;
  onMoveClip: (clipId: string, startMs: number, trackId: string) => void;
  onTrimClip: (clipId: string, patch: { startMs: number; trimStartMs: number; durationMs: number }) => void;
  onSplitClipAt: (clipId: string, atMs: number) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onAddMarker: () => void;
  onSelectMarker: (m: CinemaMarker) => void;
  onToggleTrackMute: (trackId: string) => void;
  onToggleTrackHidden: (trackId: string) => void;
  onToggleTrackLocked: (trackId: string) => void;
  onAddTrack: (kind: CinemaTrackKind) => void;
  onSetTransition: (afterClipId: string, type: CinemaTransitionType, durationMs: number) => void;
  onExtractVideoAudio: (clipId: string) => void;
  onDropFiles: (files: FileList, trackId: string, atMs: number) => void;
  onFitZoom: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snapGuideMs, setSnapGuideMs] = useState<number | null>(null);
  const [fileDragOverTrackId, setFileDragOverTrackId] = useState<string | null>(null);

  const pxPerSec = 56 * zoom;
  const durationMs = useMemo(() => computeProjectDurationMs(project), [project]);
  const totalSec = Math.max(15, Math.ceil((durationMs + 4000) / 1000));
  const trackWidthPx = Math.max(760, Math.round(totalSec * pxPerSec));

  const assetMap = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);
  const selectedClip = useMemo(
    () => (selectedClipId ? project.clips.find((c) => c.id === selectedClipId) ?? null : null),
    [project.clips, selectedClipId],
  );

  const splittableAtPlayhead = useMemo(() => {
    if (selectedClip && playheadMs > selectedClip.startMs + 140 && playheadMs < selectedClip.startMs + selectedClip.durationMs - 140) {
      return selectedClip;
    }
    return (
      project.clips.find(
        (c) => !c.locked && playheadMs > c.startMs + 140 && playheadMs < c.startMs + c.durationMs - 140,
      ) ?? null
    );
  }, [playheadMs, project.clips, selectedClip]);

  const snapTargetsMs = useCallback(
    (excludeClipId?: string): number[] => {
      const pts = [0, Math.round(playheadMs)];
      for (const m of project.markers) pts.push(m.atMs);
      for (const c of project.clips) {
        if (c.id === excludeClipId) continue;
        pts.push(c.startMs, c.startMs + c.durationMs);
      }
      return pts;
    },
    [playheadMs, project.clips, project.markers],
  );

  const snapMs = useCallback(
    (rawMs: number, excludeClipId: string, bypass: boolean): { ms: number; guide: number | null } => {
      const clamped = Math.max(0, Math.round(rawMs));
      if (!snapEnabled || bypass) return { ms: clamped, guide: null };
      const thresholdMs = (10 / pxPerSec) * 1000;
      let best = clamped;
      let bestDist = thresholdMs;
      let guide: number | null = null;
      for (const t of snapTargetsMs(excludeClipId)) {
        const d = Math.abs(clamped - t);
        if (d < bestDist) {
          bestDist = d;
          best = t;
          guide = t;
        }
      }
      return { ms: best, guide };
    },
    [pxPerSec, snapEnabled, snapTargetsMs],
  );

  const clientXToMs = useCallback(
    (clientX: number): number => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft - TRACK_HEADER_W;
      return Math.max(0, Math.round((x / pxPerSec) * 1000));
    },
    [pxPerSec],
  );

  const handleRulerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: "scrub", pointerId: e.pointerId });
    onSeek(clientXToMs(e.clientX));
  };

  const handleClipPointerDown = (e: ReactPointerEvent<HTMLDivElement>, clip: CinemaClip) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    if (toolMode === "cut") {
      onSplitClipAt(clip.id, clientXToMs(e.clientX));
      return;
    }
    const tr = project.tracks.find((t) => t.id === clip.trackId);
    if (clip.locked || tr?.locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      kind: "move",
      pointerId: e.pointerId,
      clipId: clip.id,
      startX: e.clientX,
      origStartMs: clip.startMs,
      origTrackId: clip.trackId,
      previewStartMs: clip.startMs,
      previewTrackId: clip.trackId,
    });
  };

  const handleTrimPointerDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    clip: CinemaClip,
    side: "trim-left" | "trim-right",
  ) => {
    e.stopPropagation();
    const tr = project.tracks.find((t) => t.id === clip.trackId);
    if (clip.locked || tr?.locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      kind: side,
      pointerId: e.pointerId,
      clipId: clip.id,
      startX: e.clientX,
      origStartMs: clip.startMs,
      origTrimStartMs: clip.trimStartMs,
      origDurationMs: clip.durationMs,
      sourceDurationMs: clip.sourceDurationMs || clip.trimStartMs + clip.durationMs,
      previewStartMs: clip.startMs,
      previewTrimStartMs: clip.trimStartMs,
      previewDurationMs: clip.durationMs,
    });
  };

  const handleLanePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.kind === "scrub") {
      onSeek(clientXToMs(e.clientX));
      return;
    }
    const deltaMs = Math.round(((e.clientX - drag.startX) / pxPerSec) * 1000);
    if (drag.kind === "move") {
      const snappedStart = snapMs(drag.origStartMs + deltaMs, drag.clipId, e.shiftKey);
      setSnapGuideMs(snappedStart.guide);

      // Detect vertical track target
      let nextTrackId = drag.previewTrackId;
      const el = scrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const relY = e.clientY - rect.top + el.scrollTop - RULER_H;
        const idx = clamp(Math.floor(relY / TRACK_H), 0, Math.max(0, project.tracks.length - 1));
        const targetTrack = project.tracks[idx];
        const movingClip = project.clips.find((c) => c.id === drag.clipId);
        if (targetTrack && movingClip && !targetTrack.locked && compatibleTrackForClip(movingClip.kind, targetTrack.kind)) {
          nextTrackId = targetTrack.id;
        }
      }

      setDrag({ ...drag, previewStartMs: snappedStart.ms, previewTrackId: nextTrackId });
    } else if (drag.kind === "trim-left") {
      const maxAdvance = drag.origDurationMs - MIN_CLIP_MS;
      const minAdvance = -Math.min(drag.origStartMs, drag.origTrimStartMs);
      const boundedDelta = clamp(deltaMs, minAdvance, maxAdvance);
      setDrag({
        ...drag,
        previewStartMs: drag.origStartMs + boundedDelta,
        previewTrimStartMs: drag.origTrimStartMs + boundedDelta,
        previewDurationMs: drag.origDurationMs - boundedDelta,
      });
    } else if (drag.kind === "trim-right") {
      const movingClip = project.clips.find((c) => c.id === drag.clipId);
      const isProcedural =
        movingClip &&
        (movingClip.kind === "text" ||
          movingClip.kind === "shape" ||
          movingClip.kind === "visualizer" ||
          movingClip.kind === "image");
      const maxDur = isProcedural
        ? 180_000
        : Math.max(MIN_CLIP_MS, drag.sourceDurationMs - drag.origTrimStartMs);
      const nextDur = clamp(drag.origDurationMs + deltaMs, MIN_CLIP_MS, maxDur);
      const endSnapped = snapMs(drag.origStartMs + nextDur, drag.clipId, e.shiftKey);
      setSnapGuideMs(endSnapped.guide);
      const clampedEndDur = clamp(endSnapped.ms - drag.origStartMs, MIN_CLIP_MS, maxDur);
      setDrag({ ...drag, previewDurationMs: clampedEndDur });
    }
  };

  const handleLanePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.kind === "move") {
      onMoveClip(drag.clipId, drag.previewStartMs, drag.previewTrackId);
    } else if (drag.kind === "trim-left" || drag.kind === "trim-right") {
      onTrimClip(drag.clipId, {
        startMs: drag.previewStartMs,
        trimStartMs: drag.previewTrimStartMs,
        durationMs: drag.previewDurationMs,
      });
    }
    setDrag(null);
    setSnapGuideMs(null);
  };

  const playheadX = (playheadMs / 1000) * pxPerSec;

  const handleSplitDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startY = e.clientY;
    const origH = timelineHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const nextH = clamp(origH + (startY - ev.clientY), 196, 400);
      onResizeHeight(nextH);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <section
      aria-label="Cinema timeline"
      style={{ height: timelineHeight }}
      className="cinema-chrome-surface flex shrink-0 flex-col border-t border-border/80 select-none"
    >
      {/* Top Vertical Resize Splitter */}
      <div
        onPointerDown={handleSplitDragStart}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline panel"
        className="flex h-2 w-full cursor-row-resize items-center justify-center hover:bg-foreground/[0.04]"
      >
        <span className="h-[3px] w-10 rounded-full bg-foreground/20" />
      </div>

      {/* Compact Timeline Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-full border border-border/80 bg-foreground/[0.03] p-0.5">
            <button
              type="button"
              onClick={() => onChangeTool("select")}
              className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                toolMode === "select"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MousePointer className="size-3" />
              <span>Select</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeTool("cut")}
              className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
                toolMode === "cut"
                  ? "bg-[color:var(--cinema-playhead)] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Scissors className="size-3" />
              <span>Razor</span>
            </button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!splittableAtPlayhead}
            onClick={() => {
              if (splittableAtPlayhead) onSplitClipAt(splittableAtPlayhead.id, playheadMs);
            }}
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
          >
            <Scissors className="size-3" />
            <span>Split</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!selectedClip}
            onClick={() => selectedClip && onDuplicateClip(selectedClip.id)}
            aria-label="Duplicate selected clip"
            className="h-7 gap-1 rounded-full px-2 text-[11px]"
          >
            <Copy className="size-3" />
            <span className="hidden sm:inline">Duplicate</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!selectedClip}
            onClick={() => selectedClip && onDeleteClip(selectedClip.id)}
            aria-label="Delete selected clip"
            className="h-7 gap-1 rounded-full px-2 text-[11px] hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAddMarker}
            className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
          >
            <BookmarkPlus className="size-3" />
            <span className="hidden md:inline">Marker</span>
          </Button>

          {selectedClip?.kind === "video" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onExtractVideoAudio(selectedClip.id)}
              className="h-7 gap-1.5 rounded-full border-[color:var(--cinema-studio-link)]/50 bg-[color:var(--cinema-studio-link)]/10 px-2.5 text-[11px] font-medium text-[color:var(--cinema-studio-link)]"
            >
              <Waves className="size-3" />
              <span>Extract Audio → Studio</span>
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger
              render={
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 rounded-full px-2.5 text-[11px]">
                  <Plus className="size-3" />
                  <span>Track</span>
                </Button>
              }
            />
            <PopoverContent align="end" className="w-48 rounded-2xl p-1.5">
              {(
                [
                  { kind: "video", label: "Video Track" },
                  { kind: "overlay", label: "Overlay / PiP Track" },
                  { kind: "text", label: "Text Track" },
                  { kind: "audio", label: "Studio Audio Track" },
                ] as const
              ).map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => onAddTrack(item.kind)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-foreground/[0.06]"
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span>{item.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant={snapEnabled ? "secondary" : "ghost"}
                  onClick={onToggleSnap}
                  aria-pressed={snapEnabled}
                  aria-label="Magnetic timeline snap"
                  className="size-7 rounded-full"
                >
                  <Magnet className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top">Magnetic snap (Shift to bypass)</TooltipContent>
          </Tooltip>

          <div className="inline-flex h-7 items-center rounded-full border border-border/75 px-1">
            <button
              type="button"
              onClick={() => onChangeZoom(Math.max(0.5, Number((zoom - 0.5).toFixed(1))))}
              aria-label="Zoom out timeline"
              className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <ZoomOut className="size-3" />
            </button>
            <span className="px-1.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {zoom}×
            </span>
            <button
              type="button"
              onClick={() => onChangeZoom(Math.min(6, Number((zoom + 0.5).toFixed(1))))}
              aria-label="Zoom in timeline"
              className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <ZoomIn className="size-3" />
            </button>
          </div>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onFitZoom}
            aria-label="Fit timeline"
            className="size-7 rounded-full"
          >
            <Maximize2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Synchronized Timeline Ruler & Multi-Track Canvas */}
      <div
        ref={scrollRef}
        onPointerMove={handleLanePointerMove}
        onPointerUp={handleLanePointerUp}
        onPointerCancel={handleLanePointerUp}
        className="cinema-scroll relative min-h-0 flex-1 overflow-auto"
      >
        <div style={{ width: TRACK_HEADER_W + trackWidthPx }} className="relative min-h-full">
          {/* Ruler Row */}
          <div className="sticky top-0 z-20 flex h-[28px] border-b border-border/75 bg-card/95 backdrop-blur-md">
            <div
              style={{ width: TRACK_HEADER_W }}
              className="sticky left-0 z-30 flex shrink-0 items-center justify-between border-r border-border/75 bg-card px-3 font-mono text-[10.5px] text-muted-foreground"
            >
              <span>Tracks</span>
              <span className="tabular-nums">{project.tracks.length}</span>
            </div>
            <div
              onPointerDown={handleRulerPointerDown}
              style={{ width: trackWidthPx }}
              className="relative h-full cursor-ew-resize"
            >
              {Array.from({ length: totalSec + 1 }, (_, sec) => {
                const showLabel = sec % (zoom >= 2 ? 1 : zoom >= 1 ? 2 : 5) === 0;
                const x = sec * pxPerSec;
                return (
                  <div
                    key={sec}
                    style={{ left: x }}
                    className="pointer-events-none absolute top-0 bottom-0 border-l border-border/60"
                  >
                    {showLabel ? (
                      <span className="pl-1 font-mono text-[10px] leading-[28px] text-muted-foreground tabular-nums">
                        {fmtRulerTime(sec)}
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {/* Ruler Marker Pins */}
              {project.markers.map((marker) => {
                const x = (marker.atMs / 1000) * pxPerSec;
                const isStudio = marker.kind === "studio";
                return (
                  <button
                    key={marker.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(marker.atMs);
                      onSelectMarker(marker);
                    }}
                    style={{ left: x }}
                    title={`${marker.label} (${(marker.atMs / 1000).toFixed(1)}s)`}
                    className={`absolute top-1 z-10 -translate-x-1/2 rounded-full border px-1.5 py-[1px] font-mono text-[9.5px] font-medium whitespace-nowrap ${
                      isStudio
                        ? "border-[color:var(--cinema-studio-link)]/65 bg-[color:var(--cinema-studio-link)]/20 text-[color:var(--cinema-studio-link)]"
                        : "border-white/30 bg-foreground/15 text-foreground"
                    }`}
                  >
                    {marker.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Track Rows */}
          {project.tracks.map((track) => {
            const Icon = trackIcon(track.kind);
            const rawClips = project.clips
              .filter((c) => c.trackId === track.id)
              .sort((a, b) => a.startMs - b.startMs);

            // Include dragged clip preview cleanly on its target track
            const trackClips = project.clips
              .filter((c) => {
                if (drag && drag.kind === "move" && drag.clipId === c.id) {
                  return drag.previewTrackId === track.id;
                }
                return c.trackId === track.id;
              })
              .map((c) => {
                if (drag && drag.kind === "move" && drag.clipId === c.id) {
                  return { ...c, startMs: drag.previewStartMs };
                }
                if (
                  drag &&
                  (drag.kind === "trim-left" || drag.kind === "trim-right") &&
                  drag.clipId === c.id
                ) {
                  return {
                    ...c,
                    startMs: drag.previewStartMs,
                    trimStartMs: drag.previewTrimStartMs,
                    durationMs: drag.previewDurationMs,
                  };
                }
                return c;
              })
              .sort((a, b) => a.startMs - b.startMs);

            const isDropTarget = fileDragOverTrackId === track.id;

            return (
              <div
                key={track.id}
                style={{ height: TRACK_H }}
                className="flex border-b border-border/60"
              >
                {/* Sticky Track Header */}
                <div
                  style={{ width: TRACK_HEADER_W }}
                  className="sticky left-0 z-10 flex shrink-0 items-center justify-between gap-1 border-r border-border/75 bg-card px-2.5"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Icon
                      className={`size-3.5 shrink-0 ${
                        track.kind === "audio"
                          ? "text-[color:var(--cinema-studio-link)]"
                          : "text-muted-foreground"
                      }`}
                      strokeWidth={1.6}
                    />
                    <span className="truncate text-[11.5px] font-medium text-foreground">
                      {track.name}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {track.kind === "audio" || track.kind === "video" ? (
                      <button
                        type="button"
                        onClick={() => onToggleTrackMute(track.id)}
                        aria-label={track.muted ? "Unmute track" : "Mute track"}
                        className={`rounded p-1 transition-colors ${
                          track.muted
                            ? "text-[color:var(--cinema-playhead)]"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {track.muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                      </button>
                    ) : null}

                    {track.kind !== "audio" ? (
                      <button
                        type="button"
                        onClick={() => onToggleTrackHidden(track.id)}
                        aria-label={track.hidden ? "Show track" : "Hide track"}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {track.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onToggleTrackLocked(track.id)}
                      aria-label={track.locked ? "Unlock track" : "Lock track"}
                      className={`rounded p-1 transition-colors ${
                        track.locked
                          ? "text-[color:var(--cinema-select)]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {track.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                    </button>
                  </div>
                </div>

                {/* Track Lane Surface */}
                <div
                  style={{ width: trackWidthPx }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      onSelectClip(null);
                      onSeek(clientXToMs(e.clientX));
                    }
                  }}
                  onDragOver={(e: DragEvent<HTMLDivElement>) => {
                    if (e.dataTransfer.types.includes("Files")) {
                      e.preventDefault();
                      setFileDragOverTrackId(track.id);
                    }
                  }}
                  onDragLeave={() => setFileDragOverTrackId(null)}
                  onDrop={(e: DragEvent<HTMLDivElement>) => {
                    e.preventDefault();
                    setFileDragOverTrackId(null);
                    if (e.dataTransfer.files?.length) {
                      onDropFiles(e.dataTransfer.files, track.id, clientXToMs(e.clientX));
                    }
                  }}
                  className={`relative h-full ${
                    isDropTarget ? "bg-[color:var(--cinema-select-soft)]" : "bg-foreground/[0.015]"
                  } ${track.hidden ? "opacity-45" : ""}`}
                >
                  {trackClips.map((clip, clipIdx) => {
                    const leftPx = (clip.startMs / 1000) * pxPerSec;
                    const widthPx = Math.max(22, (clip.durationMs / 1000) * pxPerSec);
                    const isSelected = selectedClipId === clip.id;
                    const asset = "assetId" in clip ? assetMap.get(clip.assetId) : undefined;
                    const isStudioLinked = clip.kind === "audio" && Boolean(clip.studioRef);
                    const nextClip = rawClips[clipIdx + 1];
                    const hasAdjacentNext =
                      clip.kind !== "audio" &&
                      nextClip &&
                      Math.abs(nextClip.startMs - (clip.startMs + clip.durationMs)) <= 350;
                    const activeTrans = project.transitions.find((t) => t.afterClipId === clip.id);

                    return (
                      <div key={clip.id}>
                        <div
                          onPointerDown={(e) => handleClipPointerDown(e, clip)}
                          style={{ left: leftPx, width: widthPx }}
                          className={`group absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded-lg border transition-colors ${
                            toolMode === "cut" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
                          } ${
                            isSelected
                              ? "z-10 border-[color:var(--cinema-select)] bg-card shadow-[0_0_0_1px_var(--cinema-select)]"
                              : isStudioLinked
                                ? "border-[color:var(--cinema-studio-link)]/55 bg-[color:var(--cinema-studio-link)]/15 hover:border-[color:var(--cinema-studio-link)]"
                                : "border-border/90 bg-card/85 hover:border-foreground/35"
                          }`}
                        >
                          {/* Video Filmstrip Thumbnails */}
                          {clip.kind === "video" && asset?.thumbnails.length ? (
                            <div className="pointer-events-none absolute inset-0 flex opacity-45">
                              {asset.thumbnails.map((src, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={i}
                                  src={src}
                                  alt=""
                                  className="h-full flex-1 object-cover"
                                />
                              ))}
                            </div>
                          ) : null}

                          {/* Audio Peaks Waveform */}
                          {clip.kind === "audio" && clip.peaks.length > 0 ? (
                            <div className="pointer-events-none absolute inset-x-1 inset-y-1.5 flex items-center gap-px opacity-55">
                              {clip.peaks.slice(0, 64).map((pk, idx) => (
                                <span
                                  key={idx}
                                  className={`flex-1 rounded-full ${
                                    isStudioLinked
                                      ? "bg-[color:var(--cinema-studio-link)]"
                                      : "bg-foreground/70"
                                  }`}
                                  style={{ height: `${Math.max(12, Math.round(pk * 100))}%` }}
                                />
                              ))}
                            </div>
                          ) : null}

                          {/* Clip Label Pill */}
                          <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-1.5 px-2.5">
                            {isStudioLinked ? (
                              <span className="shrink-0 rounded bg-[color:var(--cinema-studio-link)] px-1 py-[1px] text-[9px] font-semibold text-white">
                                Studio
                              </span>
                            ) : null}
                            <span className="truncate text-[11px] font-medium text-foreground">
                              {clip.kind === "text" ? clip.text : clip.name}
                            </span>
                          </div>

                          {/* Left & Right Non-Destructive Trim Handles */}
                          <button
                            type="button"
                            aria-label={`Trim start of ${clip.name}`}
                            onPointerDown={(e) => handleTrimPointerDown(e, clip, "trim-left")}
                            className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize bg-transparent transition-colors hover:bg-[color:var(--cinema-select)]/60"
                          />
                          <button
                            type="button"
                            aria-label={`Trim end of ${clip.name}`}
                            onPointerDown={(e) => handleTrimPointerDown(e, clip, "trim-right")}
                            className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize bg-transparent transition-colors hover:bg-[color:var(--cinema-select)]/60"
                          />
                        </div>

                        {/* Adjacent Clip Transition Diamond Picker */}
                        {hasAdjacentNext ? (
                          <Popover>
                            <PopoverTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={`Set transition after ${clip.name}`}
                                  style={{ left: leftPx + widthPx }}
                                  className={`absolute top-1/2 z-20 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border transition-colors ${
                                    activeTrans && activeTrans.type !== "cut"
                                      ? "border-[color:var(--cinema-select)] bg-[color:var(--cinema-select)] text-white"
                                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  <Diamond className="size-2.5" strokeWidth={2} />
                                </button>
                              }
                            />
                            <PopoverContent align="center" side="top" className="w-56 rounded-2xl p-2">
                              <div className="mb-1.5 px-2 text-[11.5px] font-medium text-foreground">
                                Clip Transition
                              </div>
                              <div className="space-y-0.5">
                                {TRANSITION_PRESETS.map((trPreset) => {
                                  const picked =
                                    (activeTrans?.type ?? "cut") === trPreset.type;
                                  return (
                                    <button
                                      key={trPreset.type}
                                      type="button"
                                      onClick={() =>
                                        onSetTransition(
                                          clip.id,
                                          trPreset.type,
                                          activeTrans?.durationMs || trPreset.defaultMs || 550,
                                        )
                                      }
                                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[11.5px] ${
                                        picked
                                          ? "bg-[color:var(--cinema-select-soft)] font-medium text-foreground"
                                          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                                      }`}
                                    >
                                      <span>{trPreset.label}</span>
                                      {trPreset.defaultMs > 0 ? (
                                        <span className="font-mono text-[10px] tabular-nums">
                                          {(trPreset.defaultMs / 1000).toFixed(1)}s
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Magnetic Snap Guide Hairline */}
          {snapGuideMs !== null ? (
            <div
              style={{ left: TRACK_HEADER_W + (snapGuideMs / 1000) * pxPerSec }}
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-[color:var(--cinema-select)]"
              aria-hidden
            />
          ) : null}

          {/* Cinema Crimson Playhead Needle */}
          <div
            style={{ left: TRACK_HEADER_W + playheadX }}
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-[1.5px] bg-[color:var(--cinema-playhead)]"
            aria-hidden
          >
            <div className="h-3 w-3 -translate-x-[5px] rounded-b-sm bg-[color:var(--cinema-playhead)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
