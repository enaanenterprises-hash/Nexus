"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudioMarkerV1, StudioTrackV1 } from "@/lib/studio/types";

export type StudioTimelineTool = "select" | "cut";

export type LayerMixerState = {
  name?: string;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
};

type DragSession =
  | { kind: "scrub"; pointerId: number }
  | {
      kind: "move";
      pointerId: number;
      trackId: string;
      startX: number;
      origOffsetMs: number;
      origLayerIndex: number;
      previewOffsetMs: number;
      previewLayerIndex: number;
    }
  | {
      kind: "trim-left" | "trim-right";
      pointerId: number;
      trackId: string;
      startX: number;
      origOffsetMs: number;
      origTrimStartMs: number;
      origDurationMs: number;
      sourceDurationMs: number;
      previewOffsetMs: number;
      previewTrimStartMs: number;
      previewDurationMs: number;
    };

const LANE_HEIGHT = 76;
const RULER_HEIGHT = 28;
const EDGE_HANDLE_PX = 9;
const MIN_CLIP_MS = 180;

function formatRulerSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatClipDuration(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 60_000) return `${(safe / 1000).toFixed(1)}s`;
  const m = Math.floor(safe / 60_000);
  const s = Math.floor((safe % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampX(val: number, max: number): number {
  return Math.max(0.5, Math.min(max - 0.5, val));
}

/**
 * Interactive multi-layer DAW timeline with integrated layer controls, pointer scrubbing,
 * horizontal/vertical clip dragging, non-destructive edge trimming, and razor splitting.
 */
export function TimelineWaveform({
  tracks,
  markers,
  layerCount,
  activeLayerIndex,
  layerMixers,
  playheadMs,
  totalTimelineMs,
  bpm,
  zoom,
  toolMode,
  selectedTrackId,
  theme,
  onSelectTrack,
  onSelectLayer,
  onAddLayer,
  onRemoveLayer,
  onMoveClip,
  onTrimClip,
  onSplitClipAt,
  onSeek,
  onSelectMarker,
  onToggleLayerMute,
  onToggleLayerSolo,
  onChangeLayerGain,
}: {
  tracks: StudioTrackV1[];
  markers: StudioMarkerV1[];
  layerCount: number;
  activeLayerIndex: number;
  layerMixers: Record<number, LayerMixerState>;
  playheadMs: number;
  totalTimelineMs: number;
  bpm: number;
  zoom: number;
  toolMode: StudioTimelineTool;
  selectedTrackId: string | null;
  theme: "dark" | "light";
  onSelectTrack: (trackId: string | null) => void;
  onSelectLayer: (layerIndex: number) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerIndex: number) => void;
  onMoveClip: (trackId: string, offsetMs: number, layerIndex: number) => void;
  onTrimClip: (trackId: string, patch: { offsetMs: number; trimStartMs: number; durationMs: number }) => void;
  onSplitClipAt: (trackId: string, atTimelineMs: number) => void;
  onSeek: (ms: number) => void;
  onSelectMarker: (marker: StudioMarkerV1) => void;
  onToggleLayerMute: (layerIndex: number) => void;
  onToggleLayerSolo: (layerIndex: number) => void;
  onChangeLayerGain: (layerIndex: number, gain: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    cursor: string;
    cutTrackId: string | null;
    cutMs: number | null;
  }>({ cursor: "default", cutTrackId: null, cutMs: null });
  const [canvasResizeTick, setCanvasResizeTick] = useState(0);

  const effectiveLayers = useMemo(() => {
    const highestClipLayer = tracks.reduce((max, t) => Math.max(max, t.layerIndex ?? 0), 0);
    const dragExtra =
      drag?.kind === "move" && drag.previewLayerIndex >= Math.max(layerCount, highestClipLayer + 1) ? 1 : 0;
    return Math.max(2, layerCount, highestClipLayer + 1) + dragExtra;
  }, [drag, layerCount, tracks]);

  const minWidthMs = Math.max(12_000, totalTimelineMs + 3000, playheadMs + 1500);
  const canvasHeight = RULER_HEIGHT + effectiveLayers * LANE_HEIGHT;

  // Observe canvas container size changes so waveforms re-paint crisply at 2x DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setCanvasResizeTick((v) => v + 1));
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // Derive live visual clip snapshot applying active drag/trim preview cleanly.
  const displayTracks = useMemo(() => {
    if (!drag || drag.kind === "scrub") return tracks;
    return tracks.map((tr) => {
      if (tr.id !== drag.trackId) return tr;
      if (drag.kind === "move") {
        return {
          ...tr,
          offsetMs: drag.previewOffsetMs,
          layerIndex: drag.previewLayerIndex,
        };
      }
      return {
        ...tr,
        offsetMs: drag.previewOffsetMs,
        trimStartMs: drag.previewTrimStartMs,
        durationMs: drag.previewDurationMs,
      };
    });
  }, [drag, tracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const isLight = theme === "light";
    const pxPerMs = width / minWidthMs;

    ctx.clearRect(0, 0, width, height);

    // 1. Top time ruler + grid ticks
    ctx.fillStyle = isLight ? "rgba(9, 9, 11, 0.035)" : "rgba(255, 255, 255, 0.03)";
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    const beatMs = 60_000 / Math.max(40, bpm);
    const totalBeats = Math.floor(minWidthMs / beatMs);
    const beatStep = totalBeats > 140 ? 4 : totalBeats > 70 ? 2 : 1;

    ctx.strokeStyle = isLight ? "rgba(9, 9, 11, 0.075)" : "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let b = 0; b <= totalBeats; b += beatStep) {
      const x = b * beatMs * pxPerMs;
      const isBar = b % 4 === 0;
      ctx.moveTo(x, isBar ? RULER_HEIGHT - 10 : RULER_HEIGHT - 5);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    const stepSec = minWidthMs > 120_000 ? 15 : minWidthMs > 45_000 ? 10 : 5;
    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = isLight ? "rgba(17, 17, 19, 0.58)" : "rgba(244, 244, 246, 0.56)";
    for (let sec = 0; sec * 1000 <= minWidthMs; sec += stepSec) {
      const x = sec * 1000 * pxPerMs;
      if (x > width - 28) break;
      ctx.fillText(formatRulerSec(sec), x + 5, 16);
    }

    ctx.strokeStyle = isLight ? "rgba(9, 9, 11, 0.1)" : "rgba(255, 255, 255, 0.09)";
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    ctx.stroke();

    // 2. Layer row bands & horizontal hairlines
    const dropTargetLayer = drag?.kind === "move" ? drag.previewLayerIndex : null;
    for (let layerIdx = 0; layerIdx < effectiveLayers; layerIdx++) {
      const yTop = RULER_HEIGHT + layerIdx * LANE_HEIGHT;
      const isDropTarget = dropTargetLayer === layerIdx;
      const isActiveRow = layerIdx === activeLayerIndex;

      if (isDropTarget) {
        ctx.fillStyle = isLight ? "rgba(184, 120, 16, 0.1)" : "rgba(240, 181, 74, 0.1)";
        ctx.fillRect(0, yTop, width, LANE_HEIGHT);
      } else if (isActiveRow) {
        ctx.fillStyle = isLight ? "rgba(9, 9, 11, 0.018)" : "rgba(255, 255, 255, 0.018)";
        ctx.fillRect(0, yTop, width, LANE_HEIGHT);
      }

      ctx.strokeStyle = isLight ? "rgba(9, 9, 11, 0.075)" : "rgba(255, 255, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(0, yTop + LANE_HEIGHT);
      ctx.lineTo(width, yTop + LANE_HEIGHT);
      ctx.stroke();
    }

    // 3. Draw every clip in its assigned vertical layer lane (monochrome silver waveforms in frosted glass clip frames)
    const anySolo =
      Object.values(layerMixers).some((m) => m.solo) || displayTracks.some((t) => t.solo);

    for (const tr of displayTracks) {
      const layerIdx = Math.max(0, tr.layerIndex ?? 0);
      const yTop = RULER_HEIGHT + layerIdx * LANE_HEIGHT;
      const midY = yTop + LANE_HEIGHT * 0.5;
      const layerMix = layerMixers[layerIdx];
      const muted = layerMix ? layerMix.muted : tr.muted;
      const solo = layerMix ? layerMix.solo : tr.solo;
      const audible = anySolo ? solo : !muted;
      const isSelected = tr.id === selectedTrackId;

      const x0 = tr.offsetMs * pxPerMs;
      const clipW = Math.max(14, tr.durationMs * pxPerMs);
      const clipH = LANE_HEIGHT - 14;
      const clipTop = yTop + 7;

      // Translucent clip block matching Image 2
      ctx.fillStyle = isLight
        ? `rgba(18, 20, 26, ${audible ? (isSelected ? 0.08 : 0.04) : 0.015})`
        : `rgba(255, 255, 255, ${audible ? (isSelected ? 0.065 : 0.032) : 0.014})`;
      ctx.strokeStyle = isSelected
        ? isLight
          ? "rgba(18, 20, 26, 0.72)"
          : "rgba(255, 255, 255, 0.62)"
        : isLight
          ? `rgba(18, 20, 26, ${audible ? 0.24 : 0.12})`
          : `rgba(255, 255, 255, ${audible ? 0.22 : 0.1})`;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(x0, clipTop, clipW, clipH, 10);
      ctx.fill();
      ctx.stroke();

      // Subtle corner trim handle bars when selected
      if (isSelected && clipW > 28) {
        ctx.fillStyle = isLight ? "rgba(18, 20, 26, 0.68)" : "rgba(255, 255, 255, 0.72)";
        ctx.fillRect(x0 + 3.5, clipTop + clipH * 0.3, 2, clipH * 0.4);
        ctx.fillRect(x0 + clipW - 5.5, clipTop + clipH * 0.3, 2, clipH * 0.4);
      }

      // Subtle clip caption tucked softly at top-left
      if (clipW > 56) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 6, clipTop, clipW - 12, clipH);
        ctx.clip();
        ctx.font = "500 9.5px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = isLight ? "rgba(18, 20, 26, 0.52)" : "rgba(220, 224, 232, 0.48)";
        ctx.fillText(`${tr.name} · ${formatClipDuration(tr.durationMs)}`, x0 + 9, clipTop + 12);
        ctx.restore();
      }

      // Dense mirrored vertical bar waveform matching Image 2
      const peaks = tr.peaks;
      if (peaks.length > 0 && clipW > 12) {
        const innerMaxH = Math.max(8, (clipH - 18) * 0.48);
        const waveMid = clipTop + clipH * 0.54;
        const barStep = 4.2;
        const bars = Math.max(8, Math.floor((clipW - 10) / barStep));
        const barW = 1.9;
        ctx.fillStyle = isLight
          ? `rgba(28, 30, 38, ${audible ? 0.82 : 0.25})`
          : `rgba(218, 222, 232, ${audible ? 0.84 : 0.26})`;
        for (let b = 0; b < bars; b++) {
          const pIdx = Math.min(peaks.length - 1, Math.floor((b / bars) * peaks.length));
          const p = Math.max(0.05, Math.min(1, peaks[pIdx]! * Math.min(1.4, tr.gain)));
          const barH = Math.max(2.2, p * innerMaxH * 2);
          const bx = x0 + 5 + b * barStep;
          ctx.beginPath();
          ctx.roundRect(bx, waveMid - barH * 0.5, barW, barH, barW * 0.5);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = isLight ? "rgba(28, 30, 38, 0.35)" : "rgba(218, 222, 232, 0.35)";
        ctx.beginPath();
        ctx.moveTo(x0 + 5, midY);
        ctx.lineTo(x0 + clipW - 5, midY);
        ctx.stroke();
      }
    }

    // 4. Razor cut preview guide when Split tool hovers over a clip
    if (toolMode === "cut" && hoverInfo.cutTrackId && hoverInfo.cutMs !== null) {
      const targetClip = displayTracks.find((t) => t.id === hoverInfo.cutTrackId);
      if (targetClip) {
        const yTop = RULER_HEIGHT + (targetClip.layerIndex ?? 0) * LANE_HEIGHT + 4;
        const cx = clampX(hoverInfo.cutMs * pxPerMs, width);
        ctx.strokeStyle = isLight ? "#c4161c" : "#fc3a34";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, yTop);
        ctx.lineTo(cx, yTop + LANE_HEIGHT - 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 5. Markers along ruler
    for (const m of markers) {
      const mx = clampX(m.atMs * pxPerMs, width);
      ctx.strokeStyle = isLight ? "rgba(184, 120, 16, 0.72)" : "rgba(240, 181, 74, 0.72)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, RULER_HEIGHT);
      ctx.lineTo(mx, height);
      ctx.stroke();

      ctx.fillStyle = isLight ? "#b87810" : "#f0b54a";
      ctx.beginPath();
      ctx.moveTo(mx - 4, RULER_HEIGHT - 9);
      ctx.lineTo(mx + 4, RULER_HEIGHT - 9);
      ctx.lineTo(mx, RULER_HEIGHT - 1);
      ctx.closePath();
      ctx.fill();
    }

    // 6. Crimson master playhead line
    const playX = clampX(playheadMs * pxPerMs, width);
    ctx.strokeStyle = isLight ? "#c4161c" : "#fc3a34";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();

    ctx.fillStyle = isLight ? "#c4161c" : "#fc3a34";
    ctx.beginPath();
    ctx.arc(playX, RULER_HEIGHT - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [
    activeLayerIndex,
    bpm,
    canvasResizeTick,
    displayTracks,
    drag,
    effectiveLayers,
    hoverInfo,
    layerMixers,
    markers,
    minWidthMs,
    playheadMs,
    selectedTrackId,
    theme,
    toolMode,
  ]);

  function getHitContext(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    const pxPerMs = rect.width / minWidthMs;
    const ms = Math.round(x / Math.max(1e-6, pxPerMs));
    const layerIdx = Math.max(0, Math.floor((y - RULER_HEIGHT) / LANE_HEIGHT));

    let hitTrack: StudioTrackV1 | null = null;
    let region: "body" | "left" | "right" | null = null;
    if (y > RULER_HEIGHT) {
      for (let i = tracks.length - 1; i >= 0; i--) {
        const tr = tracks[i]!;
        if ((tr.layerIndex ?? 0) !== layerIdx) continue;
        const x0 = tr.offsetMs * pxPerMs;
        const x1 = Math.max(x0 + 14, (tr.offsetMs + tr.durationMs) * pxPerMs);
        if (x >= x0 - 4 && x <= x1 + 4) {
          hitTrack = tr;
          if (Math.abs(x - x0) <= EDGE_HANDLE_PX && x1 - x0 >= 28) region = "left";
          else if (Math.abs(x - x1) <= EDGE_HANDLE_PX && x1 - x0 >= 28) region = "right";
          else region = "body";
          break;
        }
      }
    }

    return { rect, x, y, pxPerMs, ms, layerIdx, hitTrack, region };
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const hit = getHitContext(e.clientX, e.clientY);
    if (!hit) return;

    if (hit.y <= RULER_HEIGHT) {
      const hitMarker = markers.find((m) => Math.abs((m.atMs - hit.ms) * hit.pxPerMs) < 10);
      if (hitMarker) {
        onSelectMarker(hitMarker);
        onSeek(hitMarker.atMs);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: "scrub", pointerId: e.pointerId });
      onSeek(hit.ms);
      return;
    }

    onSelectLayer(clamp(hit.layerIdx, 0, effectiveLayers - 1));

    if (hit.hitTrack) {
      const tr = hit.hitTrack;
      if (toolMode === "cut") {
        onSelectTrack(tr.id);
        onSplitClipAt(tr.id, hit.ms);
        return;
      }

      onSelectTrack(tr.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      const origTrimStartMs = tr.trimStartMs ?? 0;
      const sourceDurationMs = tr.sourceDurationMs ?? origTrimStartMs + tr.durationMs;

      if (hit.region === "left" || hit.region === "right") {
        setDrag({
          kind: hit.region === "left" ? "trim-left" : "trim-right",
          pointerId: e.pointerId,
          trackId: tr.id,
          startX: e.clientX,
          origOffsetMs: tr.offsetMs,
          origTrimStartMs,
          origDurationMs: tr.durationMs,
          sourceDurationMs,
          previewOffsetMs: tr.offsetMs,
          previewTrimStartMs: origTrimStartMs,
          previewDurationMs: tr.durationMs,
        });
        return;
      }

      setDrag({
        kind: "move",
        pointerId: e.pointerId,
        trackId: tr.id,
        startX: e.clientX,
        origOffsetMs: tr.offsetMs,
        origLayerIndex: tr.layerIndex ?? 0,
        previewOffsetMs: tr.offsetMs,
        previewLayerIndex: tr.layerIndex ?? 0,
      });
      return;
    }

    onSelectTrack(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: "scrub", pointerId: e.pointerId });
    onSeek(hit.ms);
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const hit = getHitContext(e.clientX, e.clientY);
    if (!hit) return;

    if (!drag) {
      if (hit.y <= RULER_HEIGHT) {
        setHoverInfo({ cursor: "ew-resize", cutTrackId: null, cutMs: null });
        return;
      }
      if (toolMode === "cut" && hit.hitTrack) {
        const canCut =
          hit.ms > hit.hitTrack.offsetMs + 90 &&
          hit.ms < hit.hitTrack.offsetMs + hit.hitTrack.durationMs - 90;
        setHoverInfo({
          cursor: canCut ? "crosshair" : "not-allowed",
          cutTrackId: canCut ? hit.hitTrack.id : null,
          cutMs: canCut ? hit.ms : null,
        });
        return;
      }
      if (hit.hitTrack) {
        const cur = hit.region === "left" || hit.region === "right" ? "ew-resize" : "grab";
        setHoverInfo({ cursor: cur, cutTrackId: null, cutMs: null });
        return;
      }
      setHoverInfo({ cursor: "default", cutTrackId: null, cutMs: null });
      return;
    }

    if (drag.kind === "scrub") {
      onSeek(hit.ms);
      return;
    }

    const dxMs = (e.clientX - drag.startX) / Math.max(1e-6, hit.pxPerMs);

    if (drag.kind === "move") {
      let nextOffsetMs = Math.max(0, Math.round(drag.origOffsetMs + dxMs));
      // Gentle magnetic snap to playhead & 0ms unless Shift is held
      if (!e.shiftKey) {
        if (Math.abs(nextOffsetMs) * hit.pxPerMs < 7) nextOffsetMs = 0;
        else if (Math.abs(nextOffsetMs - playheadMs) * hit.pxPerMs < 7) nextOffsetMs = Math.round(playheadMs);
      }
      const nextLayer = clamp(Math.floor((hit.y - RULER_HEIGHT) / LANE_HEIGHT), 0, Math.max(layerCount, 1));
      setDrag({
        ...drag,
        previewOffsetMs: nextOffsetMs,
        previewLayerIndex: nextLayer,
      });
      return;
    }

    if (drag.kind === "trim-left") {
      const minDelta = Math.max(-drag.origTrimStartMs, -drag.origOffsetMs);
      const maxDelta = drag.origDurationMs - MIN_CLIP_MS;
      const delta = clamp(Math.round(dxMs), minDelta, maxDelta);
      setDrag({
        ...drag,
        previewOffsetMs: drag.origOffsetMs + delta,
        previewTrimStartMs: drag.origTrimStartMs + delta,
        previewDurationMs: drag.origDurationMs - delta,
      });
      return;
    }

    if (drag.kind === "trim-right") {
      const maxDur = Math.max(MIN_CLIP_MS, drag.sourceDurationMs - drag.origTrimStartMs);
      const nextDur = clamp(Math.round(drag.origDurationMs + dxMs), MIN_CLIP_MS, maxDur);
      setDrag({
        ...drag,
        previewDurationMs: nextDur,
      });
    }
  }

  function finishDrag() {
    if (!drag) return;
    if (drag.kind === "move") {
      if (drag.previewOffsetMs !== drag.origOffsetMs || drag.previewLayerIndex !== drag.origLayerIndex) {
        onMoveClip(drag.trackId, drag.previewOffsetMs, drag.previewLayerIndex);
        onSelectLayer(drag.previewLayerIndex);
      }
    } else if (drag.kind === "trim-left" || drag.kind === "trim-right") {
      if (
        drag.previewOffsetMs !== drag.origOffsetMs ||
        drag.previewTrimStartMs !== drag.origTrimStartMs ||
        drag.previewDurationMs !== drag.origDurationMs
      ) {
        onTrimClip(drag.trackId, {
          offsetMs: drag.previewOffsetMs,
          trimStartMs: drag.previewTrimStartMs,
          durationMs: drag.previewDurationMs,
        });
      }
    }
    setDrag(null);
  }

  const timelineMinWidthPct = Math.max(100, Math.round(zoom * 100));

  return (
    <div className="studio-daw-shell flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-border/80">
      <div className="flex min-h-full items-stretch">
        {/* Left Unified Layer Controls Gutter */}
        <div className="sticky left-0 z-10 flex w-[148px] shrink-0 flex-col border-r border-border/75 bg-card/95 sm:w-[192px]">
          <div
            style={{ height: `${RULER_HEIGHT}px` }}
            className="flex items-center justify-between border-b border-border/75 px-3 text-[11px] font-medium text-muted-foreground"
          >
            <span>Layers ({effectiveLayers})</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={onAddLayer}
                    aria-label="Add audio layer"
                    className="h-5 w-5 rounded-md"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="right">Add layer track</TooltipContent>
            </Tooltip>
          </div>

          <div>
            {Array.from({ length: effectiveLayers }, (_, idx) => {
              const mixer = layerMixers[idx] ?? {
                gain: 1,
                pan: 0,
                muted: false,
                solo: false,
              };
              const layerClips = displayTracks.filter((t) => (t.layerIndex ?? 0) === idx);
              const isTarget = idx === activeLayerIndex;
              const isExtraGhost = drag?.kind === "move" && idx >= layerCount && drag.previewLayerIndex === idx;
              const canDeleteLayer = idx >= 2 && layerClips.length === 0 && !isExtraGhost;

              return (
                <div
                  key={`layer-${idx}`}
                  style={{ height: `${LANE_HEIGHT}px` }}
                  onClick={() => onSelectLayer(idx)}
                  className={`flex flex-col justify-between border-b border-border/70 px-2.5 py-2 transition-colors ${
                    isExtraGhost
                      ? "bg-[color:var(--land-gold)]/12"
                      : isTarget
                        ? "bg-muted/50"
                        : "hover:bg-muted/25"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isTarget
                            ? "bg-[#e55336]"
                            : layerClips.length > 0
                              ? "bg-foreground/45"
                              : "bg-foreground/15"
                        }`}
                      />
                      <span className="truncate text-[12px] font-medium text-foreground">
                        {mixer.name ?? `Layer ${idx + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant={mixer.muted ? "destructive" : "ghost"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerMute(idx);
                        }}
                        aria-label={`Mute Layer ${idx + 1}`}
                        className="h-6 w-6 rounded-md p-0"
                      >
                        {mixer.muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={mixer.solo ? "secondary" : "ghost"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerSolo(idx);
                        }}
                        aria-label={`Solo Layer ${idx + 1}`}
                        className="h-6 w-6 rounded-md p-0 font-mono text-[10.5px] font-semibold"
                      >
                        S
                      </Button>
                      {canDeleteLayer ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveLayer(idx);
                          }}
                          aria-label={`Remove empty Layer ${idx + 1}`}
                          className="h-6 w-6 rounded-md p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={1.8}
                      step={0.05}
                      value={mixer.gain}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onChangeLayerGain(idx, Number(e.target.value))}
                      aria-label={`Layer ${idx + 1} volume`}
                      className="studio-range min-w-0 flex-1"
                    />
                    <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                      {Math.round(mixer.gain * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Interactive Multi-Layer Waveform & Arrange Canvas */}
        <div className="relative min-w-0 flex-1 overflow-x-auto">
          <div style={{ width: `${timelineMinWidthPct}%`, minWidth: "100%" }} className="relative">
            <canvas
              ref={canvasRef}
              style={{
                height: `${canvasHeight}px`,
                cursor: drag ? (drag.kind === "move" ? "grabbing" : "ew-resize") : hoverInfo.cursor,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onPointerLeave={() => {
                if (!drag) setHoverInfo({ cursor: "default", cutTrackId: null, cutMs: null });
              }}
              className="block w-full touch-none select-none"
              aria-label="Multi-layer audio arrangement timeline"
            />

            {tracks.length === 0 ? (
              <div className="pointer-events-none absolute inset-x-0 top-[28px] bottom-0 flex items-center justify-center px-6 text-center">
                <p className="text-[12.5px] text-muted-foreground">
                  Press Record (R) or Import an audio stem to start layering. Drag clips horizontally across time or
                  vertically between layers.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
