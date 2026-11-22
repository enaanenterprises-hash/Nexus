"use client";

import {
  memo,
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
  inspectNativeVideoStagePlan,
  renderCinemaFrame,
  visualBoxPx,
  type CinemaDrawableMedia,
} from "@/lib/cinema/compositor";
import type { CinemaScrubCache } from "@/lib/cinema/scrub-cache";
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

function parkStageVideoEl(vid: HTMLVideoElement): void {
  vid.style.position = "absolute";
  vid.style.left = "0";
  vid.style.top = "0";
  vid.style.width = "2px";
  vid.style.height = "2px";
  vid.style.opacity = "0";
  vid.style.transform = "none";
  vid.style.filter = "none";
  vid.style.borderRadius = "0";
  vid.style.boxShadow = "none";
  vid.style.pointerEvents = "none";
}

function applyStageVideoStyle(
  vid: HTMLVideoElement,
  params: {
    leftPct: number;
    topPct: number;
    wPct: number;
    hPct: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    filterCss: string;
    fit: "cover" | "contain";
    radiusPx: number;
    shadow: boolean;
  },
): void {
  vid.style.position = "absolute";
  vid.style.left = `${params.leftPct}%`;
  vid.style.top = `${params.topPct}%`;
  vid.style.width = `${params.wPct}%`;
  vid.style.height = `${params.hPct}%`;
  vid.style.objectFit = params.fit;
  vid.style.opacity = String(params.opacity);
  vid.style.filter = params.filterCss === "none" ? "" : params.filterCss;
  vid.style.borderRadius = params.radiusPx > 0 ? `${params.radiusPx}px` : "0";
  vid.style.boxShadow = params.shadow ? "0 14px 36px rgba(0, 0, 0, 0.48)" : "none";
  vid.style.transform = `translate3d(0, 0, 0) rotate(${params.rotation}deg) scale(${params.scaleX}, ${params.scaleY})`;
  vid.style.transformOrigin = "center center";
  vid.style.pointerEvents = "none";
}

export const CinemaStage = memo(function CinemaStage({
  project,
  playheadMs,
  playheadRef,
  subscribePlayhead,
  playing,
  loopEnabled,
  showSafeGuides,
  selectedClipId,
  canvasZoom,
  stageExpanded,
  mediaElementsRef,
  videoHostRef,
  scrubCacheRef,
  isScrubbingRef,
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
  subscribePlayhead: (listener: (ms: number) => void) => () => void;
  playing: boolean;
  loopEnabled: boolean;
  showSafeGuides: boolean;
  selectedClipId: string | null;
  canvasZoom: "fit" | 0.5 | 0.75 | 1;
  stageExpanded: boolean;
  mediaElementsRef: React.RefObject<Map<string, HTMLVideoElement | HTMLImageElement>>;
  videoHostRef: React.RefObject<HTMLDivElement | null>;
  scrubCacheRef: React.RefObject<CinemaScrubCache | null>;
  isScrubbingRef: React.RefObject<boolean>;
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
  const timecodeElRef = useRef<HTMLSpanElement>(null);
  const meterBarsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 460 });
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [inlineEditClipId, setInlineEditClipId] = useState<string | null>(null);
  const binsRef = useRef<Float32Array>(new Float32Array(32));
  const pendingPaintRafRef = useRef<number | null>(null);
  const activeNativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastNativeStyleKeyRef = useRef<string>("");
  const overlayCanvasDirtyRef = useRef<boolean>(true);
  const lastStaticOverlayKeyRef = useRef<string>("");
  const drawStateRef = useRef({ project, drag, showSafeGuides, playing, displayW: 800, displayH: 450 });

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

  const updateMeterDom = useCallback((level: number) => {
    const bars = meterBarsRef.current;
    for (let idx = 0; idx < 10; idx++) {
      const bar = bars[idx];
      if (!bar) continue;
      const lit = level >= (idx + 1) / 10;
      bar.style.backgroundColor = lit
        ? idx >= 8
          ? "var(--cinema-playhead)"
          : "rgba(244, 244, 246, 0.85)"
        : "rgba(244, 244, 246, 0.15)";
    }
  }, []);

  const paintAt = useCallback(
    (targetMs: number) => {
      const canvas = renderCanvasRef.current;
      if (!canvas) return;
      const st = drawStateRef.current;
      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      const desiredScale =
        Math.max(
          st.displayW / Math.max(1, st.project.width),
          st.displayH / Math.max(1, st.project.height),
        ) * dpr;
      const minScale = Math.min(
        1,
        540 / Math.max(1, Math.max(st.project.width, st.project.height)),
      );
      const scale = clamp(desiredScale, minScale, 1);
      const targetW = Math.max(2, Math.round(st.project.width * scale));
      const targetH = Math.max(2, Math.round(st.project.height * scale));

      let resized = false;
      if (canvas.width !== targetW) {
        canvas.width = targetW;
        resized = true;
      }
      if (canvas.height !== targetH) {
        canvas.height = targetH;
        resized = true;
      }
      if (resized) {
        overlayCanvasDirtyRef.current = true;
        lastStaticOverlayKeyRef.current = "";
      }

      // Alpha-enabled overlay canvas sits transparently above the hardware-composited <video> layer
      const ctx = canvas.getContext("2d", { alpha: true }) ?? canvas.getContext("2d");
      if (!ctx) return;

      const activeProject = st.drag
        ? {
            ...st.project,
            clips: st.project.clips.map((c) =>
              c.id === st.drag!.clipId && c.kind !== "audio" ? { ...c, transform: st.drag!.preview } : c,
            ),
          }
        : st.project;

      // Canva-style Direct Hardware <video> Stage Layer:
      // Presents the primary video directly via DirectComposition/CoreAnimation (0ms JS/frame, native VSync!)
      const allowNative = !isScrubbingRef.current && !st.drag;
      const nativePlan = allowNative ? inspectNativeVideoStagePlan(activeProject, targetMs) : null;
      const candidateVid = nativePlan ? mediaElementsRef.current.get(nativePlan.clip.assetId) : null;
      const bgCompatible =
        nativePlan !== null &&
        (nativePlan.isFullBleedOpaque ||
          (activeProject.background.type === "solid" && activeProject.background.grain <= 0.005));

      if (
        nativePlan &&
        bgCompatible &&
        candidateVid instanceof HTMLVideoElement &&
        candidateVid.readyState >= 2
      ) {
        if (activeNativeVideoRef.current && activeNativeVideoRef.current !== candidateVid) {
          parkStageVideoEl(activeNativeVideoRef.current);
          lastNativeStyleKeyRef.current = "";
        }
        activeNativeVideoRef.current = candidateVid;

        const tf = nativePlan.clip.transform;
        const wPct = tf.width;
        const hPct = tf.height;
        const leftPct = tf.x - wPct / 2 + nativePlan.dxPct;
        const topPct = tf.y - hPct / 2 + nativePlan.dyPct;
        const scaleX = nativePlan.scale * (tf.flipH ? -1 : 1);
        const scaleY = nativePlan.scale * (tf.flipV ? -1 : 1);
        const radiusPx =
          tf.borderRadius > 0 ? (tf.borderRadius / 1080) * st.displayH * (hPct / 100) * 1.4 : 0;
        const styleKey = `${nativePlan.clip.id}|${leftPct.toFixed(2)}|${topPct.toFixed(2)}|${wPct.toFixed(2)}|${hPct.toFixed(2)}|${tf.rotation}|${scaleX.toFixed(3)}|${scaleY.toFixed(3)}|${nativePlan.opacity.toFixed(3)}|${nativePlan.filterCss}|${nativePlan.clip.fit}|${radiusPx.toFixed(1)}|${tf.shadow ? 1 : 0}`;

        if (styleKey !== lastNativeStyleKeyRef.current) {
          lastNativeStyleKeyRef.current = styleKey;
          applyStageVideoStyle(candidateVid, {
            leftPct,
            topPct,
            wPct,
            hPct,
            rotation: tf.rotation,
            scaleX,
            scaleY,
            opacity: nativePlan.opacity,
            filterCss: nativePlan.filterCss,
            fit: nativePlan.clip.fit,
            radiusPx,
            shadow: tf.shadow,
          });
        }

        // Pure video with no overlays above: skip canvas compositing completely (0ms JS/frame!)
        if (!nativePlan.hasOverlaysAbove && !st.showSafeGuides) {
          if (overlayCanvasDirtyRef.current) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, targetW, targetH);
            overlayCanvasDirtyRef.current = false;
            lastStaticOverlayKeyRef.current = "";
          }
          return;
        }

        // Static text/logo overlay over playing video: paint once, then 0ms JS/frame until overlays change!
        const activeOverlayIds = activeProject.clips
          .filter(
            (c) =>
              c.kind !== "audio" &&
              !c.hidden &&
              c.id !== nativePlan.clip.id &&
              targetMs >= c.startMs &&
              targetMs <= c.startMs + c.durationMs,
          )
          .map((c) => c.id)
          .join(",");
        const staticKey = `${activeProject.updatedAt}|${st.showSafeGuides ? 1 : 0}|${activeOverlayIds}|${targetW}x${targetH}`;
        if (st.playing && !nativePlan.overlaysAnimated && lastStaticOverlayKeyRef.current === staticKey) {
          return;
        }

        const engine = audioEngineRef.current;
        if (st.playing && engine) {
          engine.getFrequencyBins(binsRef.current);
        } else {
          binsRef.current.fill(0);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.setTransform(targetW / st.project.width, 0, 0, targetH / st.project.height, 0, 0);
        renderCinemaFrame(ctx, activeProject, targetMs, {
          mediaElements: mediaElementsRef.current,
          frequencyBins: st.playing && engine ? binsRef.current : undefined,
          showSafeGuides: st.showSafeGuides,
          isPlaying: st.playing,
          skipBackground: true,
          skipClipIds: new Set([nativePlan.clip.id]),
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCanvasDirtyRef.current = true;
        lastStaticOverlayKeyRef.current = nativePlan.overlaysAnimated ? "" : staticKey;
        return;
      }

      // Canvas path (scrubbing with 120fps ImageBitmap cache, drag transforms, complex blends/transitions)
      if (activeNativeVideoRef.current) {
        parkStageVideoEl(activeNativeVideoRef.current);
        activeNativeVideoRef.current = null;
        lastNativeStyleKeyRef.current = "";
      }
      lastStaticOverlayKeyRef.current = "";
      overlayCanvasDirtyRef.current = true;

      const engine = audioEngineRef.current;
      if (st.playing && engine) {
        engine.getFrequencyBins(binsRef.current);
      } else {
        binsRef.current.fill(0);
      }

      let scrubOverrides: Map<string, CinemaDrawableMedia> | undefined;
      if (!st.playing && isScrubbingRef.current && scrubCacheRef.current) {
        const cache = scrubCacheRef.current;
        for (const clip of activeProject.clips) {
          if (clip.kind !== "video" || clip.hidden) continue;
          if (targetMs < clip.startMs || targetMs > clip.startMs + clip.durationMs) continue;
          const targetSec = Math.max(
            0,
            (clip.trimStartMs + (targetMs - clip.startMs) * (clip.speed || 1)) / 1000,
          );
          const vid = mediaElementsRef.current.get(clip.assetId);
          const vidReadyExact =
            vid instanceof HTMLVideoElement &&
            !vid.seeking &&
            vid.readyState >= 2 &&
            Math.abs(vid.currentTime - targetSec) <= 0.12;
          if (!vidReadyExact) {
            const proxyBmp = cache.getNearestFrame(clip.assetId, targetSec);
            if (proxyBmp) {
              if (!scrubOverrides) scrubOverrides = new Map();
              scrubOverrides.set(clip.id, proxyBmp);
            }
          }
        }
      }

      ctx.setTransform(targetW / st.project.width, 0, 0, targetH / st.project.height, 0, 0);
      renderCinemaFrame(ctx, activeProject, targetMs, {
        mediaElements: mediaElementsRef.current,
        clipMediaOverrides: scrubOverrides,
        frequencyBins: st.playing && engine ? binsRef.current : undefined,
        showSafeGuides: st.showSafeGuides,
        isPlaying: st.playing,
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [audioEngineRef, isScrubbingRef, mediaElementsRef, renderCanvasRef, scrubCacheRef],
  );

  useEffect(() => {
    drawStateRef.current = {
      project,
      drag,
      showSafeGuides,
      playing,
      displayW: displayDims.w,
      displayH: displayDims.h,
    };
    redrawRef.current = () => {
      paintAt(playheadRef.current);
    };
    if (!playing) {
      updateMeterDom(0);
      if (timecodeElRef.current) {
        timecodeElRef.current.textContent = fmtTimecode(playheadRef.current, project.fps);
      }
      paintAt(playheadRef.current);
    }
  }, [
    displayDims.h,
    displayDims.w,
    drag,
    mediaVersion,
    paintAt,
    playheadMs,
    playheadRef,
    playing,
    project,
    redrawRef,
    showSafeGuides,
    updateMeterDom,
  ]);

  // Zero-React-render 60fps playhead subscriber (paints canvas + updates timecode & meter DOM directly)
  useEffect(() => {
    let lastMeterPerf = 0;
    return subscribePlayhead((ms) => {
      const st = drawStateRef.current;
      if (timecodeElRef.current) {
        timecodeElRef.current.textContent = fmtTimecode(ms, st.project.fps);
      }
      if (st.playing) {
        const now = performance.now();
        if (now - lastMeterPerf >= 45) {
          lastMeterPerf = now;
          const engine = audioEngineRef.current;
          updateMeterDom(engine ? engine.getPeakLevel() : 0);
        }
        // Already inside CinemaView's unified 60fps RAF callback
        paintAt(ms);
      } else {
        // Coalesce high-frequency 120Hz mouse scrub events to 1 paint per display refresh
        if (pendingPaintRafRef.current === null) {
          pendingPaintRafRef.current = window.requestAnimationFrame(() => {
            pendingPaintRafRef.current = null;
            paintAt(playheadRef.current);
          });
        }
      }
    });
  }, [audioEngineRef, paintAt, playheadRef, subscribePlayhead, updateMeterDom]);

  useEffect(() => {
    return () => {
      if (pendingPaintRafRef.current !== null) {
        window.cancelAnimationFrame(pendingPaintRafRef.current);
      }
    };
  }, []);

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
      const hit = hitTestVisualClip(project, playheadRef.current, canvasX, canvasY);
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
    [inlineEditClipId, onSelectClip, playheadRef, project],
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
          {/* Direct Hardware-Composited <video> Stage Layer (Canva-style zero-copy playback) */}
          <div
            ref={videoHostRef}
            aria-hidden
            style={{ backgroundColor: project.background.colorA }}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[10px]"
          />
          <canvas
            ref={renderCanvasRef}
            className="relative z-[1] block h-full w-full rounded-[10px] select-none"
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

          {/* Canva-style Interactive Selection Frame & Handles (hidden during live playback) */}
          {!playing && selectedVisual && selectedBoxStyle ? (
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
        {/* Left: Crisp Zero-Filter CSS Darkroom Glass Transport Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSeek(0)}
            aria-label="Rewind to start"
            className="inline-flex size-8 items-center justify-center rounded-full border border-white/[0.11] bg-white/[0.06] text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/[0.12] hover:text-foreground"
          >
            <SkipBack className="size-3.5" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            aria-label="Previous frame"
            className="hidden size-8 items-center justify-center rounded-full border border-white/[0.11] bg-white/[0.06] text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/[0.12] hover:text-foreground sm:inline-flex"
          >
            <StepBack className="size-3.5" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause (Space)" : "Play (Space)"}
            className={`mx-0.5 inline-flex size-9 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition-colors ${
              playing
                ? "border-[color:var(--cinema-playhead)]/45 bg-[color:var(--cinema-playhead)]/15 text-[color:var(--cinema-playhead)] hover:bg-[color:var(--cinema-playhead)]/22"
                : "border-white/[0.16] bg-white/[0.11] text-foreground hover:bg-white/[0.18]"
            }`}
          >
            {playing ? (
              <Pause className="size-3.5 fill-current" />
            ) : (
              <Play className="size-3.5 translate-x-[0.5px] fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(1)}
            aria-label="Next frame"
            className="hidden size-8 items-center justify-center rounded-full border border-white/[0.11] bg-white/[0.06] text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/[0.12] hover:text-foreground sm:inline-flex"
          >
            <StepForward className="size-3.5" strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            aria-pressed={loopEnabled}
            aria-label="Loop playback (L)"
            className={`inline-flex size-8 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors ${
              loopEnabled
                ? "border-white/25 bg-white/[0.14] text-foreground"
                : "border-white/[0.10] bg-white/[0.05] text-muted-foreground hover:bg-white/[0.11] hover:text-foreground"
            }`}
          >
            <Repeat className="size-3.5" strokeWidth={1.6} />
          </button>
        </div>

        {/* Center: Tabular Timecode Readout */}
        <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
          <span ref={timecodeElRef} className="font-medium text-foreground">
            {fmtTimecode(playheadMs, project.fps)}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{fmtTimecode(durationMs, project.fps)}</span>
          <span className="hidden rounded-full border border-border/75 px-2 py-0.5 text-[10px] text-muted-foreground md:inline">
            {project.aspectRatio} · {project.fps}fps
          </span>
        </div>

        {/* Right: Stereo Peak Meter, Safe Guides, Zoom & Expand */}
        <div className="flex items-center gap-1.5">
          {/* Stereo Peak Meter (updated via direct DOM refs at 22Hz with zero React renders) */}
          <div
            className="hidden h-5 items-center gap-0.5 rounded-md border border-border/75 px-2 sm:flex"
            aria-label="Audio output level"
          >
            {Array.from({ length: 10 }, (_, idx) => (
              <span
                key={idx}
                ref={(el) => {
                  meterBarsRef.current[idx] = el;
                }}
                style={{ backgroundColor: "rgba(244, 244, 246, 0.15)" }}
                className="h-2.5 w-1 rounded-full"
              />
            ))}
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
});
