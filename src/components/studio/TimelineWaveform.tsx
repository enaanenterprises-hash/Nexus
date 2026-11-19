"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatGainDb } from "@/lib/studio/capture-engine";
import type { StudioMarkerV1, StudioTrackColor, StudioTrackV1 } from "@/lib/studio/types";

export type StudioTimelineTool = "select" | "cut";

export type LayerMixerState = {
  name?: string;
  inputHint?: string;
  colorTag?: StudioTrackColor;
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

const LANE_HEIGHT = 84;
const RULER_HEIGHT = 30;
const EDGE_HANDLE_PX = 9;
const MIN_CLIP_MS = 160;

const COLOR_PALETTE: Record<
  StudioTrackColor,
  { darkRgb: readonly [number, number, number]; lightRgb: readonly [number, number, number]; dotClass: string }
> = {
  gold: { darkRgb: [240, 181, 74], lightRgb: [166, 116, 18], dotClass: "bg-[#f0b54a]" },
  sky: { darkRgb: [186, 206, 226], lightRgb: [72, 92, 114], dotClass: "bg-[#94b2d0]" },
  emerald: { darkRgb: [134, 204, 174], lightRgb: [28, 122, 86], dotClass: "bg-[#6ec49f]" },
  coral: { darkRgb: [232, 152, 134], lightRgb: [176, 78, 58], dotClass: "bg-[#e29584]" },
  slate: { darkRgb: [176, 176, 184], lightRgb: [92, 94, 104], dotClass: "bg-[#a1a1aa]" },
};

function defaultColorForLayer(layerIdx: number): StudioTrackColor {
  if (layerIdx === 0) return "gold";
  if (layerIdx === 1) return "sky";
  if (layerIdx === 2) return "emerald";
  if (layerIdx === 3) return "coral";
  return "slate";
}

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
 * Interactive multi-track DAW timeline with color-coded speaker stems, fade ramps,
 * magnetic snap-to-grid/edges, inline track mixer strips, non-destructive trim/split,
 * and drag-and-drop external audio stem import.
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
  snapEnabled,
  loopEnabled,
  toolMode,
  selectedTrackId,
  theme,
  onSelectTrack,
  onSelectLayer,
  onAddLayer,
  onRemoveLayer,
  onRenameLayer,
  onMoveClip,
  onTrimClip,
  onSplitClipAt,
  onSeek,
  onSelectMarker,
  onToggleLayerMute,
  onToggleLayerSolo,
  onChangeLayerGain,
  onDropFiles,
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
  snapEnabled: boolean;
  loopEnabled: boolean;
  toolMode: StudioTimelineTool;
  selectedTrackId: string | null;
  theme: "dark" | "light";
  onSelectTrack: (trackId: string | null) => void;
  onSelectLayer: (layerIndex: number) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerIndex: number) => void;
  onRenameLayer: (layerIndex: number, name: string) => void;
  onMoveClip: (trackId: string, offsetMs: number, layerIndex: number) => void;
  onTrimClip: (trackId: string, patch: { offsetMs: number; trimStartMs: number; durationMs: number }) => void;
  onSplitClipAt: (trackId: string, atTimelineMs: number) => void;
  onSeek: (ms: number) => void;
  onSelectMarker: (marker: StudioMarkerV1) => void;
  onToggleLayerMute: (layerIndex: number) => void;
  onToggleLayerSolo: (layerIndex: number) => void;
  onChangeLayerGain: (layerIndex: number, gain: number) => void;
  onDropFiles?: (files: FileList, layerIndex: number, offsetMs: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
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

  const minWidthMs = Math.max(15_000, totalTimelineMs + 4000, playheadMs + 2000);
  const canvasHeight = RULER_HEIGHT + effectiveLayers * LANE_HEIGHT;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setCanvasResizeTick((v) => v + 1));
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

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

    // 1. Top time ruler + subtle loop range indicator
    ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.032)" : "rgba(255, 255, 255, 0.025)";
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    if (loopEnabled && totalTimelineMs > 0) {
      const loopW = Math.min(width, totalTimelineMs * pxPerMs);
      ctx.fillStyle = isLight ? "rgba(184, 120, 16, 0.14)" : "rgba(240, 181, 74, 0.15)";
      ctx.fillRect(0, 0, loopW, 3);
    }

    const beatMs = 60_000 / Math.max(40, bpm);
    const totalBeats = Math.floor(minWidthMs / beatMs);
    const beatStep = totalBeats > 160 ? 4 : totalBeats > 80 ? 2 : 1;

    ctx.lineWidth = 1;
    for (let b = 0; b <= totalBeats; b += beatStep) {
      const x = b * beatMs * pxPerMs;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar
        ? isLight
          ? "rgba(14, 15, 18, 0.085)"
          : "rgba(255, 255, 255, 0.068)"
        : isLight
          ? "rgba(14, 15, 18, 0.04)"
          : "rgba(255, 255, 255, 0.03)";
      ctx.beginPath();
      ctx.moveTo(x, isBar ? RULER_HEIGHT - 10 : RULER_HEIGHT - 5);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const stepSec = minWidthMs > 180_000 ? 30 : minWidthMs > 90_000 ? 15 : minWidthMs > 40_000 ? 10 : 5;
    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.56)" : "rgba(232, 232, 236, 0.52)";
    for (let sec = 0; sec * 1000 <= minWidthMs; sec += stepSec) {
      const x = sec * 1000 * pxPerMs;
      if (x > width - 28) break;
      ctx.fillText(formatRulerSec(sec), x + 5, 18);
    }

    ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.1)" : "rgba(255, 255, 255, 0.09)";
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    ctx.stroke();

    // 2. Lane row surfaces & horizontal hairlines
    const dropTargetLayer = drag?.kind === "move" ? drag.previewLayerIndex : null;
    for (let layerIdx = 0; layerIdx < effectiveLayers; layerIdx++) {
      const yTop = RULER_HEIGHT + layerIdx * LANE_HEIGHT;
      const isDropTarget = dropTargetLayer === layerIdx;
      const isActiveRow = layerIdx === activeLayerIndex;

      if (isDropTarget) {
        ctx.fillStyle = isLight ? "rgba(184, 120, 16, 0.09)" : "rgba(240, 181, 74, 0.09)";
        ctx.fillRect(0, yTop, width, LANE_HEIGHT);
      } else if (isActiveRow) {
        ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.018)" : "rgba(255, 255, 255, 0.018)";
        ctx.fillRect(0, yTop, width, LANE_HEIGHT);
      }

      ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.08)" : "rgba(255, 255, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(0, yTop + LANE_HEIGHT);
      ctx.lineTo(width, yTop + LANE_HEIGHT);
      ctx.stroke();
    }

    // 3. Color-coded clips, fade ramps & mirrored precision waveforms
    const anySolo =
      Object.values(layerMixers).some((m) => m.solo) || displayTracks.some((t) => t.solo);

    for (const tr of displayTracks) {
      const layerIdx = Math.max(0, tr.layerIndex ?? 0);
      const yTop = RULER_HEIGHT + layerIdx * LANE_HEIGHT;
      const layerMix = layerMixers[layerIdx];
      const muted = layerMix ? layerMix.muted : tr.muted;
      const solo = layerMix ? layerMix.solo : tr.solo;
      const audible = anySolo ? solo : !muted;
      const isSelected = tr.id === selectedTrackId;

      const colorKey = tr.colorTag ?? layerMix?.colorTag ?? defaultColorForLayer(layerIdx);
      const rgb = isLight ? COLOR_PALETTE[colorKey].lightRgb : COLOR_PALETTE[colorKey].darkRgb;
      const [cr, cg, cb] = rgb;

      const x0 = tr.offsetMs * pxPerMs;
      const clipW = Math.max(14, tr.durationMs * pxPerMs);
      const clipH = LANE_HEIGHT - 14;
      const clipTop = yTop + 7;

      // Quiet, restrained clip container with crisp 1px hairline border
      ctx.fillStyle = isLight
        ? `rgba(${cr}, ${cg}, ${cb}, ${audible ? (isSelected ? 0.12 : 0.06) : 0.025})`
        : `rgba(${cr}, ${cg}, ${cb}, ${audible ? (isSelected ? 0.13 : 0.065) : 0.022})`;
      ctx.strokeStyle = isSelected
        ? `rgba(${cr}, ${cg}, ${cb}, ${isLight ? 0.85 : 0.82})`
        : `rgba(${cr}, ${cg}, ${cb}, ${audible ? (isLight ? 0.3 : 0.26) : 0.12})`;
      ctx.lineWidth = isSelected ? 1.25 : 1;
      ctx.beginPath();
      ctx.roundRect(x0, clipTop, clipW, clipH, 10);
      ctx.fill();
      ctx.stroke();

      // Trim edge handles when selected
      if (isSelected && clipW > 28) {
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.75)`;
        ctx.fillRect(x0 + 3.5, clipTop + clipH * 0.34, 1.5, clipH * 0.32);
        ctx.fillRect(x0 + clipW - 5, clipTop + clipH * 0.34, 1.5, clipH * 0.32);
      }

      // Clip title + duration caption
      if (clipW > 64) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 6, clipTop + 3, clipW - 12, 16);
        ctx.clip();
        ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = isLight
          ? `rgba(14, 15, 18, ${audible ? 0.78 : 0.35})`
          : `rgba(244, 244, 246, ${audible ? 0.82 : 0.36})`;
        ctx.fillText(`${tr.name} · ${formatClipDuration(tr.durationMs)}`, x0 + 9, clipTop + 14);
        ctx.restore();
      }

      const fadeInMs = Math.min(tr.durationMs * 0.5, tr.fadeInMs ?? 0);
      const fadeOutMs = Math.min(tr.durationMs * 0.5, tr.fadeOutMs ?? 0);

      // Dense mirrored precision bar waveform honoring fade envelope visually
      const peaks = tr.peaks;
      const waveMid = clipTop + clipH * 0.58;
      if (peaks.length > 0 && clipW > 12) {
        const innerMaxH = Math.max(8, (clipH - 22) * 0.48);
        const barStep = 3.8;
        const bars = Math.max(8, Math.floor((clipW - 10) / barStep));
        const barW = 1.8;
        ctx.fillStyle = isLight
          ? `rgba(${cr}, ${cg}, ${cb}, ${audible ? 0.82 : 0.25})`
          : `rgba(${Math.min(255, cr + 26)}, ${Math.min(255, cg + 24)}, ${Math.min(255, cb + 24)}, ${audible ? 0.82 : 0.24})`;

        for (let b = 0; b < bars; b++) {
          const frac = (b + 0.5) / bars;
          const timeInClipMs = frac * tr.durationMs;
          let fadeMul = 1;
          if (fadeInMs > 10 && timeInClipMs < fadeInMs) {
            fadeMul *= timeInClipMs / fadeInMs;
          }
          if (fadeOutMs > 10 && timeInClipMs > tr.durationMs - fadeOutMs) {
            fadeMul *= (tr.durationMs - timeInClipMs) / fadeOutMs;
          }

          const pIdx = Math.min(peaks.length - 1, Math.floor(frac * peaks.length));
          const p = Math.max(0.04, Math.min(1, peaks[pIdx]! * Math.min(1.4, tr.gain) * Math.max(0.08, fadeMul)));
          const barH = Math.max(2, p * innerMaxH * 2);
          const bx = x0 + 5 + b * barStep;
          ctx.beginPath();
          ctx.roundRect(bx, waveMid - barH * 0.5, barW, barH, barW * 0.5);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.38)`;
        ctx.beginPath();
        ctx.moveTo(x0 + 5, waveMid);
        ctx.lineTo(x0 + clipW - 5, waveMid);
        ctx.stroke();
      }

      // Visual Fade-In & Fade-Out ramp overlays
      if (fadeInMs > 20) {
        const fiW = Math.min(clipW * 0.5, fadeInMs * pxPerMs);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x0, clipTop, clipW, clipH, 10);
        ctx.clip();
        ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.08)" : "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.moveTo(x0, clipTop);
        ctx.lineTo(x0 + fiW, clipTop);
        ctx.lineTo(x0, clipTop + clipH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.72)`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x0, clipTop + clipH);
        ctx.lineTo(x0 + fiW, clipTop + 3);
        ctx.stroke();
        ctx.restore();
      }

      if (fadeOutMs > 20) {
        const foW = Math.min(clipW * 0.5, fadeOutMs * pxPerMs);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x0, clipTop, clipW, clipH, 10);
        ctx.clip();
        ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.08)" : "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.moveTo(x0 + clipW, clipTop);
        ctx.lineTo(x0 + clipW - foW, clipTop);
        ctx.lineTo(x0 + clipW, clipTop + clipH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.72)`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x0 + clipW - foW, clipTop + 3);
        ctx.lineTo(x0 + clipW, clipTop + clipH);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Razor cut preview guide when Split tool hovers over a clip
    if (toolMode === "cut" && hoverInfo.cutTrackId && hoverInfo.cutMs !== null) {
      const targetClip = displayTracks.find((t) => t.id === hoverInfo.cutTrackId);
      if (targetClip) {
        const yTop = RULER_HEIGHT + (targetClip.layerIndex ?? 0) * LANE_HEIGHT + 4;
        const cx = clampX(hoverInfo.cutMs * pxPerMs, width);
        ctx.strokeStyle = isLight ? "#c4161c" : "#fc3a34";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, yTop);
        ctx.lineTo(cx, yTop + LANE_HEIGHT - 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 5. Golden chapter & cue markers along ruler
    for (const m of markers) {
      const mx = clampX(m.atMs * pxPerMs, width);
      ctx.strokeStyle = isLight ? "rgba(184, 120, 16, 0.62)" : "rgba(240, 181, 74, 0.62)";
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

    // 6. Precision crimson master playhead line
    const playX = clampX(playheadMs * pxPerMs, width);
    ctx.strokeStyle = isLight ? "#c4161c" : "#fc3a34";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();

    ctx.fillStyle = isLight ? "#c4161c" : "#fc3a34";
    ctx.beginPath();
    ctx.moveTo(playX - 4.5, RULER_HEIGHT - 8);
    ctx.lineTo(playX + 4.5, RULER_HEIGHT - 8);
    ctx.lineTo(playX, RULER_HEIGHT);
    ctx.closePath();
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
    loopEnabled,
    markers,
    minWidthMs,
    playheadMs,
    selectedTrackId,
    theme,
    toolMode,
    totalTimelineMs,
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

  function snapCandidateMs(rawMs: number, pxPerMs: number, ignoreTrackId: string): number {
    const snapPx = 7;
    const candidates: number[] = [0, Math.round(playheadMs)];
    for (const m of markers) candidates.push(m.atMs);
    for (const tr of tracks) {
      if (tr.id === ignoreTrackId) continue;
      candidates.push(tr.offsetMs, tr.offsetMs + tr.durationMs);
    }
    let best = rawMs;
    let bestDistPx = snapPx;
    for (const c of candidates) {
      const distPx = Math.abs(rawMs - c) * pxPerMs;
      if (distPx < bestDistPx) {
        bestDistPx = distPx;
        best = c;
      }
    }
    if (best !== rawMs) return Math.max(0, Math.round(best));

    // Also snap lightly to nearest beat grid line
    const beatMs = 60_000 / Math.max(40, bpm);
    const nearestBeat = Math.round(rawMs / beatMs) * beatMs;
    if (Math.abs(rawMs - nearestBeat) * pxPerMs < 5.5) {
      return Math.max(0, Math.round(nearestBeat));
    }
    return rawMs;
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
    const shouldSnap = snapEnabled && !e.shiftKey;

    if (drag.kind === "move") {
      let nextOffsetMs = Math.max(0, Math.round(drag.origOffsetMs + dxMs));
      if (shouldSnap) {
        nextOffsetMs = snapCandidateMs(nextOffsetMs, hit.pxPerMs, drag.trackId);
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
      let targetEdge = drag.origOffsetMs + Math.round(dxMs);
      if (shouldSnap) {
        targetEdge = snapCandidateMs(targetEdge, hit.pxPerMs, drag.trackId);
      }
      const delta = clamp(targetEdge - drag.origOffsetMs, minDelta, maxDelta);
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
      let targetEnd = drag.origOffsetMs + Math.round(drag.origDurationMs + dxMs);
      if (shouldSnap) {
        targetEnd = snapCandidateMs(targetEnd, hit.pxPerMs, drag.trackId);
      }
      const nextDur = clamp(targetEnd - drag.origOffsetMs, MIN_CLIP_MS, maxDur);
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

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!onDropFiles || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isFileDragOver) setIsFileDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsFileDragOver(false);
    if (!onDropFiles || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const hit = getHitContext(e.clientX, e.clientY);
    const targetLayer = hit ? clamp(hit.layerIdx, 0, effectiveLayers - 1) : activeLayerIndex;
    const targetMs = hit ? Math.max(0, hit.ms) : Math.round(playheadMs);
    onDropFiles(e.dataTransfer.files, targetLayer, targetMs);
  }

  const timelineMinWidthPct = Math.max(100, Math.round(zoom * 100));

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsFileDragOver(false);
      }}
      onDrop={handleDrop}
      className={`studio-daw-shell relative flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[18px] border transition-colors ${
        isFileDragOver ? "border-[color:var(--land-gold)]" : "border-border/80"
      }`}
    >
      <div className="flex min-h-full items-stretch">
        {/* Left Track Headers & Quiet Mixer Gutter */}
        <div className="studio-gutter sticky left-0 z-10 flex w-[160px] shrink-0 flex-col border-r border-border/75 sm:w-[200px]">
          <div
            style={{ height: `${RULER_HEIGHT}px` }}
            className="flex items-center justify-between border-b border-border/75 px-3 text-[11.5px] font-medium text-muted-foreground"
          >
            <span>Tracks</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={onAddLayer}
                    aria-label="Add audio track lane"
                    className="h-6 w-6 rounded-md"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="right">Add track</TooltipContent>
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
              const colorKey = mixer.colorTag ?? layerClips[0]?.colorTag ?? defaultColorForLayer(idx);
              const inputHint = mixer.inputHint ?? layerClips[0]?.inputSource;
              const isTarget = idx === activeLayerIndex;
              const isExtraGhost = drag?.kind === "move" && idx >= layerCount && drag.previewLayerIndex === idx;
              const canDeleteLayer = idx >= 2 && layerClips.length === 0 && !isExtraGhost;

              return (
                <div
                  key={`layer-${idx}`}
                  style={{ height: `${LANE_HEIGHT}px` }}
                  onClick={() => onSelectLayer(idx)}
                  className={`flex flex-col justify-between border-b border-border/65 px-3 py-2.5 transition-colors ${
                    isExtraGhost
                      ? "bg-[color:var(--land-gold)]/10"
                      : isTarget
                        ? "bg-foreground/[0.035]"
                        : "hover:bg-foreground/[0.02]"
                  }`}
                >
                  {/* Top Row: Quiet 6px Status Dot + Editable Track Name + M / S */}
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_PALETTE[colorKey].dotClass} ${
                            isTarget ? "opacity-100" : "opacity-60"
                          }`}
                          aria-hidden
                        />
                        <input
                          type="text"
                          value={mixer.name ?? `Track ${idx + 1}`}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onRenameLayer(idx, e.target.value)}
                          aria-label={`Track ${idx + 1} name`}
                          className="w-full truncate rounded bg-transparent py-0.5 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.07] focus:outline-none"
                        />
                      </div>
                      <div className="truncate pl-3 font-mono text-[10px] text-muted-foreground/80">
                        {inputHint || (layerClips.length > 0 ? `${layerClips.length} ${layerClips.length === 1 ? "clip" : "clips"}` : "Empty")}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerMute(idx);
                        }}
                        aria-pressed={mixer.muted}
                        aria-label={`Mute ${mixer.name ?? `Track ${idx + 1}`}`}
                        className={`h-6 w-6 rounded-md font-mono text-[10px] font-medium transition-colors ${
                          mixer.muted
                            ? "bg-destructive/90 text-white"
                            : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerSolo(idx);
                        }}
                        aria-pressed={mixer.solo}
                        aria-label={`Solo ${mixer.name ?? `Track ${idx + 1}`}`}
                        className={`h-6 w-6 rounded-md font-mono text-[10px] font-medium transition-colors ${
                          mixer.solo
                            ? "bg-[color:var(--land-gold)] text-[#09090b]"
                            : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                        }`}
                      >
                        S
                      </button>
                      {canDeleteLayer ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveLayer(idx);
                          }}
                          aria-label={`Remove empty Track ${idx + 1}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Bottom Row: Clean Hairline Volume Fader + Tabular dB Readout */}
                  <div className="flex items-center gap-2 pl-3">
                    <input
                      type="range"
                      min={0}
                      max={1.8}
                      step={0.05}
                      value={mixer.gain}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onChangeLayerGain(idx, 1);
                      }}
                      onChange={(e) => onChangeLayerGain(idx, Number(e.target.value))}
                      aria-label={`${mixer.name ?? `Track ${idx + 1}`} volume`}
                      className="studio-range min-w-0 flex-1"
                    />
                    <span className="w-[42px] shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                      {formatGainDb(mixer.gain)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Interactive Multi-Track Waveform Canvas */}
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
              aria-label="Multi-track audio arrangement timeline"
            />

            {tracks.length === 0 ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[30px] flex items-center justify-center px-6 text-center">
                <p className="max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
                  Record a 2-mic RØDECaster session on the Capture tab, or drag and drop WAV, MP3, or M4A stems directly
                  onto this timeline.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Drag-and-drop file overlay */}
      {isFileDragOver ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[14px] border-2 border-dashed border-[color:var(--land-gold)] bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground">
            <Upload className="size-4 text-[color:var(--land-gold)]" />
            <span>Drop audio files to import stems</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
