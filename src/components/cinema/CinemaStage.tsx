"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Frame,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  RotateCw,
  SkipBack,
  StepBack,
  StepForward,
  Trash2,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CinemaAudioEngine } from "@/lib/cinema/audio-engine";
import {
  computeProjectDurationMs,
  hitTestVisualClip,
  renderCinemaFrame,
  visualBoxPx,
} from "@/lib/cinema/compositor";
import type {
  CinemaClip,
  CinemaProject,
  CinemaTransform,
  CinemaVisualClip,
} from "@/lib/cinema/types";

type DragMode =
  | {
      kind: "move";
      pointerId: number;
      clipId: string;
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
      preview: CinemaTransform;
    }
  | {
      kind: "resize";
      pointerId: number;
      clipId: string;
      handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
      startClientX: number;
      startClientY: number;
      orig: CinemaTransform;
      preview: CinemaTransform;
    }
  | {
      kind: "rotate";
      pointerId: number;
      clipId: string;
      centerX: number;
      centerY: number;
      orig: CinemaTransform;
      preview: CinemaTransform;
    };

function fmtTimecode(ms: number, fps: number): string {
  const safe = Math.max(0, ms);
  const totalSecs = Math.floor(safe / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const frames = Math.floor(((safe % 1000) / 1000) * fps);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function snapPercent(val: number, targets: number[], threshold = 1.6): { value: number; snapped: number | null } {
  for (const t of targets) {
    if (Math.abs(val - t) <= threshold) return { value: t, snapped: t };
  }
  return { value: val, snapped: null };
}

export function CinemaStage({
  project,
  playheadMs,
  playheadRef,
  playing,
  loopEnabled,
  showSafeGuides,
  selectedClipId,
  canvasZoom,
  stageExpanded,
  mediaElementsRef,
  audioEngineRef,
  redrawRef,
  mediaVersion,
  onSelectClip,
  onPreviewTransform,
  onCommitTransform,
  onUpdateClip,
  onDuplicateClip,
  onReorderLayer,
  onDeleteClip,
  onExtractVideoAudio,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onToggleLoop,
  onToggleSafeGuides,
  onChangeCanvasZoom,
  onToggleStageExpanded,
  renderCanvasRef,
}: {
  project: CinemaProject;
  playheadMs: number;
  playheadRef: React.RefObject<number>;
  playing: boolean;
  loopEnabled: boolean;
  showSafeGuides: boolean;
  selectedClipId: string | null;
  canvasZoom: "fit" | 0.5 | 0.75 | 1;
  stageExpanded: boolean;
  mediaElementsRef: React.RefObject<Map<string, HTMLVideoElement | HTMLImageElement>>;
  audioEngineRef: React.RefObject<CinemaAudioEngine | null>;
  redrawRef: React.RefObject<(() => void) | null>;
  mediaVersion: number;
  onSelectClip: (clipId: string | null) => void;
  onPreviewTransform: (clipId: string, transform: CinemaTransform) => void;
  onCommitTransform: (clipId: string, transform: CinemaTransform) => void;
  onUpdateClip: (clipId: string, updater: (c: CinemaClip) => CinemaClip, recordHistory?: boolean) => void;
  onDuplicateClip: (clipId: string) => void;
  onReorderLayer: (clipId: string, dir: "up" | "down") => void;
  onDeleteClip: (clipId: string) => void;
  onExtractVideoAudio: (clipId: string) => void;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  onStepFrame: (deltaFrames: number) => void;
  onToggleLoop: () => void;
  onToggleSafeGuides: () => void;
  onChangeCanvasZoom: (z: "fit" | 0.5 | 0.75 | 1) => void;
  onToggleStageExpanded: () => void;
  renderCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 460 });
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [inlineEditClipId, setInlineEditClipId] = useState<string | null>(null);
  const [meterLevel, setMeterLevel] = useState(0);
  const binsRef = useRef<Float32Array>(new Float32Array(32));
  const drawStateRef = useRef({ project, drag, showSafeGuides, playing });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setViewportSize({ w: Math.max(240, rect.width), h: Math.max(180, rect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayDims = useMemo(() => {
    const maxW = Math.max(200, viewportSize.w - 40);
    const maxH = Math.max(160, viewportSize.h - 32);
    const aspect = project.width / Math.max(1, project.height);
    let fitW = maxW;
    let fitH = fitW / aspect;
    if (fitH > maxH) {
      fitH = maxH;
      fitW = fitH * aspect;
    }
    const factor = canvasZoom === "fit" ? 1 : clamp((canvasZoom * 900) / Math.max(1, fitW), 0.35, 1.35);
    return {
      w: Math.round(fitW * (canvasZoom === "fit" ? 1 : Math.min(1.25, factor))),
      h: Math.round(fitH * (canvasZoom === "fit" ? 1 : Math.min(1.25, factor))),
    };
  }, [canvasZoom, project.height, project.width, viewportSize.h, viewportSize.w]);

  const paintAt = useCallback(
    (targetMs: number) => {
      const canvas = renderCanvasRef.current;
      if (!canvas) return;
      const st = drawStateRef.current;
      if (canvas.width !== st.project.width) canvas.width = st.project.width;
      if (canvas.height !== st.project.height) canvas.height = st.project.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const engine = audioEngineRef.current;
      if (st.playing && engine) {
        engine.getFrequencyBins(binsRef.current);
      } else {
        binsRef.current.fill(0);
      }

      const activeProject = st.drag
        ? {
            ...st.project,
            clips: st.project.clips.map((c) =>
              c.id === st.drag!.clipId && c.kind !== "audio" ? { ...c, transform: st.drag!.preview } : c,
            ),
          }
        : st.project;

      renderCinemaFrame(ctx, activeProject, targetMs, {
        mediaElements: mediaElementsRef.current,
        frequencyBins: st.playing && engine ? binsRef.current : undefined,
        showSafeGuides: st.showSafeGuides,
      });
    },
    [audioEngineRef, mediaElementsRef, renderCanvasRef],
  );

  useEffect(() => {
    drawStateRef.current = { project, drag, showSafeGuides, playing };
    redrawRef.current = () => {
      paintAt(playheadRef.current);
    };
    if (!playing) {
      paintAt(playheadMs);
    }
  }, [drag, mediaVersion, paintAt, playheadMs, playheadRef, playing, project, redrawRef, showSafeGuides]);

  // Persistent 60fps RAF loop when playing (never depends on `playheadMs`)
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      const engine = audioEngineRef.current;
      setMeterLevel(engine ? engine.getPeakLevel() : 0);
      paintAt(playheadRef.current);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [audioEngineRef, paintAt, playheadRef, playing]);

  const displayMeterLevel = playing ? meterLevel : 0;

  const selectedVisual = useMemo(() => {
    if (!selectedClipId) return null;
    const found = project.clips.find(
      (c): c is CinemaVisualClip =>
        c.id === selectedClipId &&
        c.kind !== "audio" &&
        !c.hidden &&
        playheadMs >= c.startMs &&
        playheadMs <= c.startMs + c.durationMs,
    );
    if (!found) return null;
    if (drag && drag.clipId === found.id) {
      return { ...found, transform: drag.preview };
    }
    return found;
  }, [drag, playheadMs, project.clips, selectedClipId]);

  const handleCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (inlineEditClipId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * project.width;
      const canvasY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * project.height;
      const hit = hitTestVisualClip(project, playheadMs, canvasX, canvasY);
      if (!hit) {
        onSelectClip(null);
        return;
      }
      onSelectClip(hit.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        kind: "move",
        pointerId: e.pointerId,
        clipId: hit.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: hit.transform.x,
        origY: hit.transform.y,
        preview: { ...hit.transform },
      });
    },
    [inlineEditClipId, onSelectClip, playheadMs, project],
  );

  const handleBoxPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, clip: CinemaVisualClip) => {
      e.stopPropagation();
      if (clip.locked || inlineEditClipId === clip.id) return;
      onSelectClip(clip.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        kind: "move",
        pointerId: e.pointerId,
        clipId: clip.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: clip.transform.x,
        origY: clip.transform.y,
        preview: { ...clip.transform },
      });
    },
    [inlineEditClipId, onSelectClip],
  );

  const handleResizePointerDown = useCallback(
    (
      e: ReactPointerEvent<HTMLButtonElement>,
      clip: CinemaVisualClip,
      handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
    ) => {
      e.stopPropagation();
      if (clip.locked) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        kind: "resize",
        pointerId: e.pointerId,
        clipId: clip.id,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        orig: { ...clip.transform },
        preview: { ...clip.transform },
      });
    },
    [],
  );

  const handleRotatePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, clip: CinemaVisualClip) => {
      e.stopPropagation();
      if (clip.locked) return;
      const stageRect = e.currentTarget.closest("[data-cinema-canvas-wrap]")?.getBoundingClientRect();
      if (!stageRect) return;
      const cx = stageRect.left + (clip.transform.x / 100) * stageRect.width;
      const cy = stageRect.top + (clip.transform.y / 100) * stageRect.height;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        kind: "rotate",
        pointerId: e.pointerId,
        clipId: clip.id,
        centerX: cx,
        centerY: cy,
        orig: { ...clip.transform },
        preview: { ...clip.transform },
      });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag || e.pointerId !== drag.pointerId || drag.kind === "rotate") return;
      const dxPct = ((e.clientX - drag.startClientX) / Math.max(1, displayDims.w)) * 100;
      const dyPct = ((e.clientY - drag.startClientY) / Math.max(1, displayDims.h)) * 100;

      if (drag.kind === "move") {
        const rawX = clamp(drag.origX + dxPct, -40, 140);
        const rawY = clamp(drag.origY + dyPct, -40, 140);
        const sx = e.shiftKey ? { value: rawX, snapped: null } : snapPercent(rawX, [5, 33.3, 50, 66.7, 95]);
        const sy = e.shiftKey ? { value: rawY, snapped: null } : snapPercent(rawY, [5, 33.3, 50, 66.7, 95]);
        setSnapGuides({ x: sx.snapped, y: sy.snapped });
        const preview = { ...drag.preview, x: Math.round(sx.value * 10) / 10, y: Math.round(sy.value * 10) / 10 };
        setDrag({ ...drag, preview });
        onPreviewTransform(drag.clipId, preview);
      } else if (drag.kind === "resize") {
        let nextW = drag.orig.width;
        let nextH = drag.orig.height;
        let nextX = drag.orig.x;
        let nextY = drag.orig.y;
        const h = drag.handle;
        if (h.includes("e")) {
          nextW = clamp(drag.orig.width + dxPct, 4, 200);
          nextX = drag.orig.x + (nextW - drag.orig.width) / 2;
        }
        if (h.includes("w")) {
          nextW = clamp(drag.orig.width - dxPct, 4, 200);
          nextX = drag.orig.x - (nextW - drag.orig.width) / 2;
        }
        if (h.includes("s")) {
          nextH = clamp(drag.orig.height + dyPct, 3, 200);
          nextY = drag.orig.y + (nextH - drag.orig.height) / 2;
        }
        if (h.includes("n")) {
          nextH = clamp(drag.orig.height - dyPct, 3, 200);
          nextY = drag.orig.y - (nextH - drag.orig.height) / 2;
        }
        const preview: CinemaTransform = {
          ...drag.orig,
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
          width: Math.round(nextW * 10) / 10,
          height: Math.round(nextH * 10) / 10,
        };
        setDrag({ ...drag, preview });
        onPreviewTransform(drag.clipId, preview);
      }
    },
    [displayDims.h, displayDims.w, drag, onPreviewTransform],
  );

  const handleRotateMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.kind !== "rotate" || e.pointerId !== drag.pointerId) return;
      const rad = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
      let deg = Math.round(((rad * 180) / Math.PI - 90 + 360) % 360);
      if (deg > 180) deg -= 360;
      for (const target of [0, 45, 90, -45, -90, 180, -180]) {
        if (Math.abs(deg - target) <= 4) {
          deg = target;
          break;
        }
      }
      const preview = { ...drag.orig, rotation: deg };
      setDrag({ ...drag, preview });
      onPreviewTransform(drag.clipId, preview);
    },
    [drag, onPreviewTransform],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      onCommitTransform(drag.clipId, drag.preview);
      setDrag(null);
      setSnapGuides({ x: null, y: null });
    },
    [drag, onCommitTransform],
  );

  const durationMs = useMemo(() => computeProjectDurationMs(project), [project]);
  const selectedBoxStyle = useMemo(() => {
    if (!selectedVisual) return null;
    const { cx, cy, w, h } = visualBoxPx(selectedVisual.transform, displayDims.w, displayDims.h);
    return {
      left: cx - w / 2,
      top: cy - h / 2,
      width: w,
      height: h,
      cx,
      cy,
    };
  }, [displayDims.h, displayDims.w, selectedVisual]);

  return (
    <div className="cinema-stage-well flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Main Theater Viewport */}
      <div
        ref={viewportRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onSelectClip(null);
            setInlineEditClipId(null);
          }
        }}
      >
        <div
          data-cinema-canvas-wrap="true"
          style={{ width: displayDims.w, height: displayDims.h }}
          className="relative shrink-0 overflow-visible rounded-[10px] shadow-[0_24px_70px_-18px_rgba(0,0,0,0.72)] ring-1 ring-white/[0.12]"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas
            ref={renderCanvasRef}
            className="block h-full w-full rounded-[10px] select-none"
          />

          {/* Live Magnetic Snap Guides */}
          {snapGuides.x !== null ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[color:var(--cinema-playhead)]"
              style={{ left: `${snapGuides.x}%` }}
              aria-hidden
            />
          ) : null}
          {snapGuides.y !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 h-px bg-[color:var(--cinema-playhead)]"
              style={{ top: `${snapGuides.y}%` }}
              aria-hidden
            />
          ) : null}

          {/* Canva-style Interactive Selection Frame & Handles */}
          {selectedVisual && selectedBoxStyle ? (
            <>
              <div
                onPointerDown={(e) => handleBoxPointerDown(e, selectedVisual)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (selectedVisual.kind === "text") {
                    setInlineEditClipId(selectedVisual.id);
                  }
                }}
                style={{
                  left: selectedBoxStyle.left,
                  top: selectedBoxStyle.top,
                  width: selectedBoxStyle.width,
                  height: selectedBoxStyle.height,
                  transform: `rotate(${selectedVisual.transform.rotation}deg)`,
                }}
                className="group absolute z-20 cursor-move touch-none border-[1.5px] border-[color:var(--cinema-select)]"
              >
                {/* Inline Canvas Text Editing */}
                {selectedVisual.kind === "text" && inlineEditClipId === selectedVisual.id ? (
                  <textarea
                    autoFocus
                    value={selectedVisual.text}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onUpdateClip(
                        selectedVisual.id,
                        (c) => (c.kind === "text" ? { ...c, text: e.target.value } : c),
                        false,
                      )
                    }
                    onBlur={() => setInlineEditClipId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
                        setInlineEditClipId(null);
                      }
                    }}
                    className="h-full w-full resize-none bg-black/75 p-2 text-center text-[14px] text-white outline-none backdrop-blur-sm"
                  />
                ) : null}

                {/* 8 Resize Handles */}
                {(
                  [
                    { h: "nw", cls: "-top-1.5 -left-1.5 cursor-nwse-resize rounded-full size-3" },
                    { h: "n", cls: "-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize rounded-full h-2 w-5" },
                    { h: "ne", cls: "-top-1.5 -right-1.5 cursor-nesw-resize rounded-full size-3" },
                    { h: "e", cls: "top-1/2 -right-1 -translate-y-1/2 cursor-ew-resize rounded-full w-2 h-5" },
                    { h: "se", cls: "-bottom-1.5 -right-1.5 cursor-nwse-resize rounded-full size-3" },
                    { h: "s", cls: "-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize rounded-full h-2 w-5" },
                    { h: "sw", cls: "-bottom-1.5 -left-1.5 cursor-nesw-resize rounded-full size-3" },
                    { h: "w", cls: "top-1/2 -left-1 -translate-y-1/2 cursor-ew-resize rounded-full w-2 h-5" },
                  ] as const
                ).map(({ h, cls }) => (
                  <button
                    key={h}
                    type="button"
                    aria-label={`Resize ${h}`}
                    onPointerDown={(e) => handleResizePointerDown(e, selectedVisual, h)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className={`absolute border border-[color:var(--cinema-select)] bg-white shadow-sm ${cls}`}
                  />
                ))}

                {/* Rotation Handle */}
                <button
                  type="button"
                  aria-label="Rotate element"
                  onPointerDown={(e) => handleRotatePointerDown(e, selectedVisual)}
                  onPointerMove={handleRotateMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="absolute -bottom-8 left-1/2 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md hover:border-[color:var(--cinema-select)] active:cursor-grabbing"
                >
                  <RotateCw className="size-3" strokeWidth={1.6} />
                </button>

                {drag?.kind === "rotate" ? (
                  <span className="absolute -bottom-15 left-1/2 -translate-x-1/2 rounded-full bg-popover px-2 py-0.5 font-mono text-[10.5px] text-foreground shadow tabular-nums">
                    {selectedVisual.transform.rotation}°
                  </span>
                ) : null}
              </div>

              {/* Floating Liquid Glass Quick Action Bar */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  left: clamp(selectedBoxStyle.cx, 120, Math.max(120, displayDims.w - 120)),
                  top: Math.max(8, selectedBoxStyle.top - 48),
                }}
                className="cinema-glass-bar absolute z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl px-1.5 py-1"
              >
                {selectedVisual.kind === "text" ? (
                  <button
                    type="button"
                    onClick={() => setInlineEditClipId(selectedVisual.id)}
                    className="h-7 rounded-lg px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-foreground/10"
                  >
                    Edit text
                  </button>
                ) : null}

                {selectedVisual.kind === "video" ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => onExtractVideoAudio(selectedVisual.id)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium text-[color:var(--nexus-link)] transition-colors hover:bg-[color:var(--nexus-link-soft)]"
                        >
                          <Waves className="size-3.5" strokeWidth={1.6} />
                          <span>Send Audio → Studio</span>
                        </button>
                      }
                    />
                    <TooltipContent side="top">
                      Extract video soundtrack to Recording Studio
                    </TooltipContent>
                  </Tooltip>
                ) : null}

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Bring forward"
                        onClick={() => onReorderLayer(selectedVisual.id, "up")}
                        className="inline-flex size-7 items-center justify-center rounded-full text-foreground/85 hover:bg-foreground/10 hover:text-foreground"
                      >
                        <ArrowUpToLine className="size-3.5" strokeWidth={1.6} />
                      </button>
                    }
                  />
                  <TooltipContent side="top">Bring forward</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Send backward"
                        onClick={() => onReorderLayer(selectedVisual.id, "down")}
                        className="inline-flex size-7 items-center justify-center rounded-full text-foreground/85 hover:bg-foreground/10 hover:text-foreground"
                      >
                        <ArrowDownToLine className="size-3.5" strokeWidth={1.6} />
                      </button>
                    }
                  />
                  <TooltipContent side="top">Send backward</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Duplicate clip"
                        onClick={() => onDuplicateClip(selectedVisual.id)}
                        className="inline-flex size-7 items-center justify-center rounded-full text-foreground/85 hover:bg-foreground/10 hover:text-foreground"
                      >
                        <Copy className="size-3.5" strokeWidth={1.6} />
                      </button>
                    }
                  />
                  <TooltipContent side="top">Duplicate</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={selectedVisual.locked ? "Unlock element" : "Lock element"}
                        onClick={() =>
                          onUpdateClip(selectedVisual.id, (c) => ({ ...c, locked: !c.locked }))
                        }
                        className="inline-flex size-7 items-center justify-center rounded-full text-foreground/85 hover:bg-foreground/10 hover:text-foreground"
                      >
                        <Lock className="size-3.5" strokeWidth={1.6} />
                      </button>
                    }
                  />
                  <TooltipContent side="top">{selectedVisual.locked ? "Unlock" : "Lock"}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Delete element"
                        onClick={() => onDeleteClip(selectedVisual.id)}
                        className="inline-flex size-7 items-center justify-center rounded-full text-foreground/80 hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.6} />
                      </button>
                    }
                  />
                  <TooltipContent side="top">Delete</TooltipContent>
                </Tooltip>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Calm Apple Pro Transport & Peak Meter Bar */}
      <div className="cinema-chrome-surface flex h-11 shrink-0 items-center justify-between gap-2 border-t border-border/75 px-3 sm:px-4">
        {/* Left: Transport Controls */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onSeek(0)}
            aria-label="Rewind to start"
            className="size-8 rounded-full"
          >
            <SkipBack className="size-3.5" strokeWidth={1.6} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onStepFrame(-1)}
            aria-label="Previous frame"
            className="hidden size-8 rounded-full sm:inline-flex"
          >
            <StepBack className="size-3.5" strokeWidth={1.6} />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause (Space)" : "Play (Space)"}
            className="mx-0.5 size-8 rounded-full bg-foreground text-background hover:opacity-90"
          >
            {playing ? (
              <Pause className="size-3.5 fill-current" />
            ) : (
              <Play className="size-3.5 translate-x-[0.5px] fill-current" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onStepFrame(1)}
            aria-label="Next frame"
            className="hidden size-8 rounded-full sm:inline-flex"
          >
            <StepForward className="size-3.5" strokeWidth={1.6} />
          </Button>
          <Button
            type="button"
            variant={loopEnabled ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={onToggleLoop}
            aria-pressed={loopEnabled}
            aria-label="Loop playback (L)"
            className="size-8 rounded-full"
          >
            <Repeat className="size-3.5" strokeWidth={1.6} />
          </Button>
        </div>

        {/* Center: Tabular Timecode Readout */}
        <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
          <span className="font-medium text-foreground">{fmtTimecode(playheadMs, project.fps)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{fmtTimecode(durationMs, project.fps)}</span>
          <span className="hidden rounded-full border border-border/75 px-2 py-0.5 text-[10px] text-muted-foreground md:inline">
            {project.aspectRatio} · {project.fps}fps
          </span>
        </div>

        {/* Right: Stereo Peak Meter, Safe Guides, Zoom & Expand */}
        <div className="flex items-center gap-1.5">
          {/* Stereo Peak Meter */}
          <div
            className="hidden h-5 items-center gap-0.5 rounded-md border border-border/75 px-2 sm:flex"
            aria-label="Audio output level"
          >
            {Array.from({ length: 10 }, (_, idx) => {
              const thresh = (idx + 1) / 10;
              const lit = displayMeterLevel >= thresh;
              return (
                <span
                  key={idx}
                  className={`h-2.5 w-1 rounded-full transition-colors duration-75 ${
                    lit
                      ? idx >= 8
                        ? "bg-[color:var(--cinema-playhead)]"
                        : "bg-foreground/80"
                      : "bg-foreground/15"
                  }`}
                />
              );
            })}
          </div>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant={showSafeGuides ? "secondary" : "ghost"}
                  onClick={onToggleSafeGuides}
                  aria-pressed={showSafeGuides}
                  aria-label="Toggle safe frame guides"
                  className="size-8 rounded-full"
                >
                  <Frame className="size-3.5" strokeWidth={1.6} />
                </Button>
              }
            />
            <TooltipContent side="top">Title &amp; action safe guides</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={() => {
              const order: Array<"fit" | 0.5 | 0.75 | 1> = ["fit", 0.5, 0.75, 1];
              const next = order[(order.indexOf(canvasZoom) + 1) % order.length]!;
              onChangeCanvasZoom(next);
            }}
            className="hidden h-7 rounded-full border border-border/75 px-2.5 font-mono text-[11px] text-muted-foreground tabular-nums transition-colors hover:text-foreground sm:inline-flex sm:items-center"
          >
            {canvasZoom === "fit" ? "Fit" : `${Math.round(canvasZoom * 100)}%`}
          </button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onToggleStageExpanded}
                  aria-label={stageExpanded ? "Restore side panels" : "Expand stage"}
                  className="size-8 rounded-full"
                >
                  {stageExpanded ? (
                    <Minimize2 className="size-3.5" strokeWidth={1.6} />
                  ) : (
                    <Maximize2 className="size-3.5" strokeWidth={1.6} />
                  )}
                </Button>
              }
            />
            <TooltipContent side="top">
              {stageExpanded ? "Show panels" : "Theater focus"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
