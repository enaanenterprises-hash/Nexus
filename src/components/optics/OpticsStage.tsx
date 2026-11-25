"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pipette, Plus, SlidersHorizontal, Upload } from "lucide-react";
import { clamp } from "@/lib/optics/color-math";
import { getToolMeta } from "@/lib/optics/tools-meta";
import type { ImageBuffer } from "@/lib/optics/processors/tonal";
import type {
  OpticsBrushParams,
  OpticsCompareMode,
  OpticsCropParams,
  OpticsDoubleExposureParams,
  OpticsEditLayer,
  OpticsHealingParams,
  OpticsLensBlurParams,
  OpticsMatteMode,
  OpticsPortraitParams,
  OpticsSelectiveParams,
  OpticsTextParams,
  OpticsToolId,
  OpticsToolParamMap,
  OpticsVignetteParams,
} from "@/lib/optics/types";

export interface ActiveScrubHudState {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
}

let stageIdSerial = 0;
function nextStageId(prefix: string): string {
  stageIdSerial += 1;
  return `${prefix}-${stageIdSerial}`;
}

export function OpticsStage({
  renderedBuffer,
  originalBuffer,
  matteMode,
  compareMode,
  splitPos,
  onSplitPosChange,
  loupeEnabled,
  zoomMode,
  onZoomModeChange,
  activeLayer,
  activeParamIndex,
  onSelectParamIndex,
  onScrubHudChange,
  onUpdateLayerParams,
  onSampleWhiteBalance,
  eyedropperArmed,
  selectiveAddArmed,
  onClearSelectiveAdd,
  maskingLayerId,
  maskBrushStrength,
  maskBrushSize,
  onPaintMaskStroke,
  onDropFiles,
}: {
  renderedBuffer: ImageBuffer | null;
  originalBuffer: ImageBuffer | null;
  matteMode: OpticsMatteMode;
  compareMode: OpticsCompareMode;
  splitPos: number;
  onSplitPosChange: (pos: number) => void;
  loupeEnabled: boolean;
  zoomMode: "fit" | 0.5 | 1 | 2;
  onZoomModeChange: (next: "fit" | 0.5 | 1 | 2) => void;
  activeLayer: OpticsEditLayer | null;
  activeParamIndex: number;
  onSelectParamIndex: (idx: number) => void;
  onScrubHudChange: (hud: ActiveScrubHudState | null) => void;
  onUpdateLayerParams: <K extends OpticsToolId>(layerId: string, nextParams: OpticsToolParamMap[K]) => void;
  onSampleWhiteBalance: (r: number, g: number, b: number) => void;
  eyedropperArmed: boolean;
  selectiveAddArmed: boolean;
  onClearSelectiveAdd: () => void;
  maskingLayerId: string | null;
  maskBrushStrength: 0 | 25 | 50 | 75 | 100;
  maskBrushSize: number;
  onPaintMaskStroke: (layerId: string, points: Array<{ x: number; y: number }>, radius: number, strength: number) => void;
  onDropFiles: (files: FileList) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorNorm, setCursorNorm] = useState<{ x: number; y: number } | null>(null);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<string | null>(null);
  const [dragFileOver, setDragFileOver] = useState(false);
  const cropDragRef = useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startNormX: number;
    startNormY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const gestureRef = useRef<{
    kind: "none" | "gesture-pending" | "scrub-x" | "wheel-y" | "paint" | "pan" | "split";
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    lastClientY: number;
    startValue: number;
    paramIdx: number;
    strokePoints: Array<{ x: number; y: number }>;
  }>({
    kind: "none",
    startClientX: 0,
    startClientY: 0,
    lastClientX: 0,
    lastClientY: 0,
    startValue: 0,
    paramIdx: 0,
    strokePoints: [],
  });

  // Paint renderedBuffer & originalBuffer onto canvases whenever buffers change
  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas || !renderedBuffer) return;
    if (canvas.width !== renderedBuffer.width || canvas.height !== renderedBuffer.height) {
      canvas.width = renderedBuffer.width;
      canvas.height = renderedBuffer.height;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(renderedBuffer.data),
          renderedBuffer.width,
          renderedBuffer.height,
        ),
        0,
        0,
      );
    }
  }, [renderedBuffer]);

  useEffect(() => {
    const canvas = originalCanvasRef.current;
    if (!canvas || !originalBuffer) return;
    if (canvas.width !== originalBuffer.width || canvas.height !== originalBuffer.height) {
      canvas.width = originalBuffer.width;
      canvas.height = originalBuffer.height;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(originalBuffer.data),
          originalBuffer.width,
          originalBuffer.height,
        ),
        0,
        0,
      );
    }
  }, [originalBuffer]);

  // Draw 1:1 optical loupe magnification around pointer when active
  useEffect(() => {
    if (!loupeEnabled || !cursorNorm || !renderedBuffer || !loupeCanvasRef.current) return;
    const lc = loupeCanvasRef.current;
    const lctx = lc.getContext("2d");
    const srcCanvas = displayCanvasRef.current;
    if (!lctx || !srcCanvas) return;

    const size = 132;
    if (lc.width !== size || lc.height !== size) {
      lc.width = size;
      lc.height = size;
    }
    lctx.clearRect(0, 0, size, size);
    const sx = clamp(cursorNorm.x * renderedBuffer.width - size * 0.25, 0, Math.max(0, renderedBuffer.width - size * 0.5));
    const sy = clamp(cursorNorm.y * renderedBuffer.height - size * 0.25, 0, Math.max(0, renderedBuffer.height - size * 0.5));
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(srcCanvas, sx, sy, size * 0.5, size * 0.5, 0, 0, size, size);
  }, [cursorNorm, loupeEnabled, renderedBuffer]);

  const meta = useMemo(
    () => (activeLayer ? getToolMeta(activeLayer.toolId) : null),
    [activeLayer],
  );
  const clampedParamIdx = meta?.parameters.length
    ? Math.min(activeParamIndex, meta.parameters.length - 1)
    : 0;

  const isBrushInteractive =
    !maskingLayerId &&
    (activeLayer?.toolId === "brush" || activeLayer?.toolId === "healing");
  const isPaintMode = Boolean(maskingLayerId) || isBrushInteractive;

  function clientToImageNorm(clientX: number, clientY: number): { x: number; y: number } {
    const rect = displayCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function commitBrushOrHealStroke(points: Array<{ x: number; y: number }>) {
    if (points.length === 0) return;
    if (maskingLayerId) {
      onPaintMaskStroke(maskingLayerId, points, maskBrushSize / 720, maskBrushStrength / 100);
      return;
    }
    if (!activeLayer) return;
    if (activeLayer.toolId === "brush") {
      const p = activeLayer.params as OpticsBrushParams;
      onUpdateLayerParams(activeLayer.id, {
        ...p,
        strokes: [
          ...p.strokes,
          {
            id: nextStageId("b"),
            mode: p.mode,
            strength: p.strength,
            radius: p.brushSize / 720,
            points,
          },
        ],
      });
    } else if (activeLayer.toolId === "healing") {
      const p = activeLayer.params as OpticsHealingParams;
      onUpdateLayerParams(activeLayer.id, {
        ...p,
        strokes: [
          ...p.strokes,
          {
            id: nextStageId("h"),
            radius: p.brushSize / 720,
            points,
            seed: p.strokes.length * 13 + 7,
          },
        ],
      });
    }
  }

  function handleCanvasPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button === 1 || (e.button === 0 && zoomMode !== "fit" && e.altKey)) {
      setIsPanning(true);
      gestureRef.current = {
        ...gestureRef.current,
        kind: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const norm = clientToImageNorm(e.clientX, e.clientY);

    // 1. White balance neutral pixel sampling
    if (eyedropperArmed && activeLayer?.toolId === "white-balance" && renderedBuffer) {
      const px = clamp(Math.round(norm.x * (renderedBuffer.width - 1)), 0, renderedBuffer.width - 1);
      const py = clamp(Math.round(norm.y * (renderedBuffer.height - 1)), 0, renderedBuffer.height - 1);
      const i = (py * renderedBuffer.width + px) * 4;
      onSampleWhiteBalance(renderedBuffer.data[i]!, renderedBuffer.data[i + 1]!, renderedBuffer.data[i + 2]!);
      return;
    }

    // 2. Selective place new U-Point
    if (selectiveAddArmed && activeLayer?.toolId === "selective") {
      const p = activeLayer.params as OpticsSelectiveParams;
      if (p.points.length < 12) {
        const id = nextStageId("pt");
        onUpdateLayerParams(activeLayer.id, {
          ...p,
          points: [
            ...p.points,
            {
              id,
              x: norm.x,
              y: norm.y,
              reach: 0.28,
              brightness: 18,
              contrast: 8,
              saturation: 12,
              structure: 8,
            },
          ],
          selectedPointId: id,
        });
      }
      onClearSelectiveAdd();
      return;
    }

    // 3. Direct brush / healing / stack mask painting
    if (isPaintMode) {
      gestureRef.current = {
        ...gestureRef.current,
        kind: "paint",
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        strokePoints: [norm],
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // 4. Snapseed vertical+horizontal stage gesture when active tool has scrubbable parameters
    if (activeLayer && meta && meta.parameters.length > 0) {
      const param = meta.parameters[clampedParamIdx]!;
      const curVal = Number(
        (activeLayer.params as unknown as Record<string, number>)[param.key] ?? 0,
      );
      gestureRef.current = {
        kind: "gesture-pending",
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        startValue: curVal,
        paramIdx: clampedParamIdx,
        strokePoints: [],
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handleCanvasPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) {
      setCursorScreen({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    const norm = clientToImageNorm(e.clientX, e.clientY);
    setCursorNorm(norm);

    const g = gestureRef.current;
    if (g.kind === "none") return;

    if (g.kind === "pan") {
      const dx = e.clientX - g.lastClientX;
      const dy = e.clientY - g.lastClientY;
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (g.kind === "paint") {
      const last = g.strokePoints[g.strokePoints.length - 1];
      if (!last || Math.hypot(norm.x - last.x, norm.y - last.y) > 0.008) {
        g.strokePoints.push(norm);
      }
      return;
    }

    if (!activeLayer || !meta || meta.parameters.length === 0) return;
    const totalDx = e.clientX - g.startClientX;
    const totalDy = e.clientY - g.startClientY;

    if (g.kind === "gesture-pending") {
      if (Math.abs(totalDx) < 7 && Math.abs(totalDy) < 7) return;
      if (Math.abs(totalDy) > Math.abs(totalDx) * 1.15 && meta.parameters.length > 1) {
        g.kind = "wheel-y";
        setWheelVisible(true);
      } else {
        g.kind = "scrub-x";
      }
    }

    if (g.kind === "wheel-y") {
      const stepDelta = Math.trunc((e.clientY - g.startClientY) / 36);
      const nextIdx =
        ((g.paramIdx + stepDelta) % meta.parameters.length + meta.parameters.length) %
        meta.parameters.length;
      if (nextIdx !== clampedParamIdx) {
        onSelectParamIndex(nextIdx);
        const param = meta.parameters[nextIdx]!;
        const v = Number((activeLayer.params as unknown as Record<string, number>)[param.key] ?? 0);
        onScrubHudChange({
          label: param.label,
          value: v,
          min: param.min,
          max: param.max,
          unit: param.unit ?? "",
        });
      }
      return;
    }

    if (g.kind === "scrub-x") {
      const param = meta.parameters[clampedParamIdx]!;
      const span = param.max - param.min;
      const precision = e.shiftKey ? 0.25 : 1;
      const step = param.step ?? 1;
      const rawNext = clamp(
        g.startValue + (totalDx / 320) * span * precision,
        param.min,
        param.max,
      );
      const snapped = Math.round(rawNext / step) * step;

      if (activeLayer.toolId === "selective") {
        const sp = activeLayer.params as OpticsSelectiveParams;
        const selId = sp.selectedPointId ?? sp.points[0]?.id;
        if (selId) {
          onUpdateLayerParams(activeLayer.id, {
            ...sp,
            points: sp.points.map((pt) =>
              pt.id === selId ? { ...pt, [param.key]: snapped } : pt,
            ),
          });
        }
      } else {
        onUpdateLayerParams(activeLayer.id, {
          ...(activeLayer.params as unknown as Record<string, unknown>),
          [param.key]: snapped,
        } as unknown as OpticsToolParamMap[OpticsToolId]);
      }

      onScrubHudChange({
        label: param.label,
        value: snapped,
        min: param.min,
        max: param.max,
        unit: param.unit ?? "",
      });
    }
  }

  function handleCanvasPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (g.kind === "paint" && g.strokePoints.length > 0) {
      commitBrushOrHealStroke(g.strokePoints);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    g.kind = "none";
    g.strokePoints = [];
    setIsPanning(false);
    setWheelVisible(false);
    onScrubHudChange(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragFileOver(false);
    if (e.dataTransfer.files?.length) {
      onDropFiles(e.dataTransfer.files);
    }
  }

  // Interactive on-canvas handle renderers for spatial & optical tools
  function renderStageHandles() {
    if (!activeLayer || compareMode !== "off") return null;

    if (activeLayer.toolId === "selective") {
      const p = activeLayer.params as OpticsSelectiveParams;
      return p.points.map((pt, idx) => {
        const selected = pt.id === (p.selectedPointId ?? p.points[0]?.id);
        return (
          <div
            key={pt.id}
            style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
            onPointerDown={(e) => {
              e.stopPropagation();
              onUpdateLayerParams(activeLayer.id, { ...p, selectedPointId: pt.id });
              setDraggingHandle(`pt:${pt.id}`);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (draggingHandle !== `pt:${pt.id}`) return;
              const norm = clientToImageNorm(e.clientX, e.clientY);
              onUpdateLayerParams(activeLayer.id, {
                ...p,
                selectedPointId: pt.id,
                points: p.points.map((x) =>
                  x.id === pt.id ? { ...x, x: norm.x, y: norm.y } : x,
                ),
              });
            }}
            onPointerUp={(e) => {
              setDraggingHandle(null);
              if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              }
            }}
          >
            {selected ? (
              <span
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[color:var(--land-gold)]/70"
                style={{
                  width: `${Math.max(46, pt.reach * 420)}px`,
                  height: `${Math.max(46, pt.reach * 420)}px`,
                }}
              />
            ) : null}
            <div
              className={`grid size-7 cursor-grab place-items-center rounded-full border font-mono text-[11px] font-semibold shadow-lg transition-transform active:cursor-grabbing ${
                selected
                  ? "scale-110 border-[color:var(--land-gold)] bg-[color:var(--land-gold)] text-black"
                  : "border-white/70 bg-black/70 text-white backdrop-blur-md"
              }`}
            >
              {idx + 1}
            </div>
          </div>
        );
      });
    }

    if (
      activeLayer.toolId === "lens-blur" ||
      activeLayer.toolId === "vignette" ||
      activeLayer.toolId === "portrait"
    ) {
      const cx =
        activeLayer.toolId === "portrait"
          ? (activeLayer.params as OpticsPortraitParams).focusX
          : (activeLayer.params as OpticsLensBlurParams | OpticsVignetteParams).centerX;
      const cy =
        activeLayer.toolId === "portrait"
          ? (activeLayer.params as OpticsPortraitParams).focusY
          : (activeLayer.params as OpticsLensBlurParams | OpticsVignetteParams).centerY;
      return (
        <div
          style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDraggingHandle("focal-center");
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (draggingHandle !== "focal-center") return;
            const norm = clientToImageNorm(e.clientX, e.clientY);
            if (activeLayer.toolId === "portrait") {
              onUpdateLayerParams(activeLayer.id, {
                ...(activeLayer.params as OpticsPortraitParams),
                focusX: norm.x,
                focusY: norm.y,
              });
            } else {
              onUpdateLayerParams(activeLayer.id, {
                ...(activeLayer.params as OpticsLensBlurParams | OpticsVignetteParams),
                centerX: norm.x,
                centerY: norm.y,
              });
            }
          }}
          onPointerUp={() => setDraggingHandle(null)}
        >
          <div className="grid size-8 place-items-center rounded-full border border-[color:var(--land-gold)] bg-black/45 shadow-lg backdrop-blur-md">
            <span className="size-2 rounded-full bg-[color:var(--land-gold)]" />
          </div>
        </div>
      );
    }

    if (activeLayer.toolId === "text") {
      const p = activeLayer.params as OpticsTextParams;
      return p.items.map((item) => (
        <div
          key={item.id}
          style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-lg border border-dashed border-[color:var(--land-gold)]/70 px-3 py-1.5 active:cursor-grabbing"
          onPointerDown={(e) => {
            e.stopPropagation();
            onUpdateLayerParams(activeLayer.id, { ...p, selectedItemId: item.id });
            setDraggingHandle(`txt:${item.id}`);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (draggingHandle !== `txt:${item.id}`) return;
            const norm = clientToImageNorm(e.clientX, e.clientY);
            onUpdateLayerParams(activeLayer.id, {
              ...p,
              items: p.items.map((it) => (it.id === item.id ? { ...it, x: norm.x, y: norm.y } : it)),
            });
          }}
          onPointerUp={() => setDraggingHandle(null)}
        >
          <span className="sr-only">Drag caption position</span>
        </div>
      ));
    }

    if (activeLayer.toolId === "double-exposure") {
      const p = activeLayer.params as OpticsDoubleExposureParams;
      return (
        <div
          style={{ left: `${50 + p.offsetX}%`, top: `${50 + p.offsetY}%` }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDraggingHandle("overlay-offset");
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (draggingHandle !== "overlay-offset") return;
            const norm = clientToImageNorm(e.clientX, e.clientY);
            onUpdateLayerParams(activeLayer.id, {
              ...p,
              offsetX: clamp((norm.x - 0.5) * 100, -50, 50),
              offsetY: clamp((norm.y - 0.5) * 100, -50, 50),
            });
          }}
          onPointerUp={() => setDraggingHandle(null)}
        >
          <div className="flex items-center gap-1 rounded-full border border-[color:var(--land-gold)] bg-black/60 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur-md">
            <span>Drag Double Exposure</span>
          </div>
        </div>
      );
    }

    if (activeLayer.toolId === "crop") {
      const p = activeLayer.params as OpticsCropParams;
      const startCropDrag = (
        mode: "move" | "nw" | "ne" | "sw" | "se",
        e: React.PointerEvent<HTMLElement>,
      ) => {
        e.stopPropagation();
        const norm = clientToImageNorm(e.clientX, e.clientY);
        cropDragRef.current = {
          mode,
          startNormX: norm.x,
          startNormY: norm.y,
          startX: p.x,
          startY: p.y,
          startW: p.width,
          startH: p.height,
        };
        setDraggingHandle(`crop-${mode}`);
        e.currentTarget.setPointerCapture(e.pointerId);
      };
      const moveCropDrag = (
        mode: "move" | "nw" | "ne" | "sw" | "se",
        e: React.PointerEvent<HTMLElement>,
      ) => {
        const start = cropDragRef.current;
        if (draggingHandle !== `crop-${mode}` || !start) return;
        const norm = clientToImageNorm(e.clientX, e.clientY);
        const dx = norm.x - start.startNormX;
        const dy = norm.y - start.startNormY;
        const minSize = 0.14;

        if (mode === "move") {
          const nx = clamp(start.startX + dx, 0, Math.max(0, 1 - start.startW));
          const ny = clamp(start.startY + dy, 0, Math.max(0, 1 - start.startH));
          onUpdateLayerParams(activeLayer.id, { ...p, x: nx, y: ny });
          return;
        }

        let left = start.startX;
        let top = start.startY;
        let right = start.startX + start.startW;
        let bottom = start.startY + start.startH;

        if (mode === "nw" || mode === "sw") {
          left = clamp(start.startX + dx, 0, right - minSize);
        } else {
          right = clamp(start.startX + start.startW + dx, left + minSize, 1);
        }

        if (mode === "nw" || mode === "ne") {
          top = clamp(start.startY + dy, 0, bottom - minSize);
        } else {
          bottom = clamp(start.startY + start.startH + dy, top + minSize, 1);
        }

        let nw = right - left;
        let nh = bottom - top;

        if (p.aspect !== "free" && renderedBuffer) {
          const imgAspect = renderedBuffer.width / Math.max(1, renderedBuffer.height);
          const targetAspect =
            p.aspect === "original"
              ? imgAspect
              : p.aspect === "1:1"
                ? 1
                : p.aspect === "4:5"
                  ? 0.8
                  : p.aspect === "16:9"
                    ? 16 / 9
                    : p.aspect === "9:16"
                      ? 9 / 16
                      : p.aspect === "3:2"
                        ? 1.5
                        : 4 / 3;
          nh = (nw * imgAspect) / targetAspect;
          const maxH = mode === "nw" || mode === "ne" ? bottom : 1 - top;
          if (nh > maxH) {
            nh = maxH;
            nw = (nh * targetAspect) / imgAspect;
          }
          const maxW = mode === "nw" || mode === "sw" ? right : 1 - left;
          if (nw > maxW) {
            nw = maxW;
            nh = (nw * imgAspect) / targetAspect;
          }
          if (nw < minSize || nh < minSize) return;
          if (mode === "nw" || mode === "sw") left = right - nw;
          if (mode === "nw" || mode === "ne") top = bottom - nh;
        }

        onUpdateLayerParams(activeLayer.id, {
          ...p,
          x: clamp(left, 0, 1 - minSize),
          y: clamp(top, 0, 1 - minSize),
          width: clamp(nw, minSize, 1),
          height: clamp(nh, minSize, 1),
        });
      };
      const endCropDrag = () => {
        cropDragRef.current = null;
        setDraggingHandle(null);
      };

      const corners: ReadonlyArray<{
        mode: "nw" | "ne" | "sw" | "se";
        label: string;
        posClass: string;
        cursorClass: string;
      }> = [
        { mode: "nw", label: "Resize top-left crop corner", posClass: "-top-2 -left-2", cursorClass: "cursor-nwse-resize" },
        { mode: "ne", label: "Resize top-right crop corner", posClass: "-top-2 -right-2", cursorClass: "cursor-nesw-resize" },
        { mode: "sw", label: "Resize bottom-left crop corner", posClass: "-bottom-2 -left-2", cursorClass: "cursor-nesw-resize" },
        { mode: "se", label: "Resize bottom-right crop corner", posClass: "-bottom-2 -right-2", cursorClass: "cursor-nwse-resize" },
      ];

      return (
        <div
          style={{
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            width: `${p.width * 100}%`,
            height: `${p.height * 100}%`,
          }}
          onPointerDown={(e) => startCropDrag("move", e)}
          onPointerMove={(e) => moveCropDrag("move", e)}
          onPointerUp={endCropDrag}
          className="pointer-events-auto absolute cursor-move border border-[color:var(--land-gold)] shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
        >
          {/* Rule of thirds hairlines */}
          <div className="pointer-events-none grid h-full w-full grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, idx) => (
              <div key={idx} className="border-[0.5px] border-white/25" />
            ))}
          </div>
          {corners.map((corner) => (
            <button
              key={corner.mode}
              type="button"
              aria-label={corner.label}
              onPointerDown={(e) => startCropDrag(corner.mode, e)}
              onPointerMove={(e) => moveCropDrag(corner.mode, e)}
              onPointerUp={endCropDrag}
              className={`pointer-events-auto absolute ${corner.posClass} size-4 ${corner.cursorClass} rounded-sm border border-black bg-[color:var(--land-gold)] shadow-sm`}
            />
          ))}
        </div>
      );
    }

    return null;
  }

  const matteClass =
    matteMode === "obsidian"
      ? "optics-matte-obsidian"
      : matteMode === "grey"
        ? "optics-matte-grey"
        : matteMode === "paper"
          ? "optics-matte-paper"
          : "optics-matte-auto";

  const showBrushRing = isPaintMode && cursorScreen !== null;
  const activeBrushPx = maskingLayerId
    ? maskBrushSize
    : activeLayer?.toolId === "brush"
      ? (activeLayer.params as OpticsBrushParams).brushSize
      : activeLayer?.toolId === "healing"
        ? (activeLayer.params as OpticsHealingParams).brushSize
        : 32;

  const effectivePan = zoomMode === "fit" ? { x: 0, y: 0 } : pan;

  return (
    <div
      ref={stageRef}
      data-optics-stage="true"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragFileOver) setDragFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragFileOver(false);
      }}
      onDrop={handleDrop}
      onDoubleClick={() => {
        if (isPaintMode || eyedropperArmed || selectiveAddArmed) return;
        setPan({ x: 0, y: 0 });
        onZoomModeChange(zoomMode === "fit" ? 1 : "fit");
      }}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const steps: ReadonlyArray<"fit" | 0.5 | 1 | 2> = [0.5, "fit", 1, 2];
        const curIdx = steps.indexOf(zoomMode);
        const nextIdx = e.deltaY < 0 ? Math.min(steps.length - 1, curIdx + 1) : Math.max(0, curIdx - 1);
        const nextZoom = steps[nextIdx] ?? "fit";
        if (nextZoom === "fit") setPan({ x: 0, y: 0 });
        onZoomModeChange(nextZoom);
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerLeave={() => {
        setCursorScreen(null);
      }}
      className={`optics-stage ${matteClass} relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[22px] select-none touch-none ${
        eyedropperArmed || selectiveAddArmed
          ? "cursor-crosshair"
          : isPaintMode
            ? "cursor-none"
            : activeLayer && meta?.parameters.length
              ? "cursor-ew-resize"
              : "cursor-default"
      }`}
    >
      {/* Photo Surface */}
      <div
        style={{
          transform: `translate3d(${effectivePan.x}px, ${effectivePan.y}px, 0) scale(${zoomMode === "fit" ? 1 : zoomMode})`,
          transition: isPanning ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="relative flex max-h-[calc(100%-24px)] max-w-[calc(100%-24px)] items-center justify-center"
      >
        <div className="relative overflow-hidden rounded-[4px] shadow-[0_24px_70px_-16px_rgba(0,0,0,0.58)] ring-1 ring-white/10">
          <canvas
            ref={displayCanvasRef}
            className="block h-auto w-auto max-h-[calc(100svh-248px)] max-w-full object-contain lg:max-h-[calc(100svh-232px)]"
          />

          {/* Original Canvas for Instant Hold / Split-Curtain Compare */}
          <canvas
            ref={originalCanvasRef}
            aria-hidden
            style={{
              opacity: compareMode === "off" ? 0 : 1,
              clipPath:
                compareMode === "split"
                  ? `inset(0 ${(1 - splitPos) * 100}% 0 0)`
                  : undefined,
            }}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-150"
          />

          {/* Split-Curtain Interactive Handle */}
          {compareMode === "split" ? (
            <div
              style={{ left: `${splitPos * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingSplit(true);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!draggingSplit) return;
                const norm = clientToImageNorm(e.clientX, e.clientY);
                onSplitPosChange(clamp(norm.x, 0.04, 0.96));
              }}
              onPointerUp={() => setDraggingSplit(false)}
              className="pointer-events-auto absolute inset-y-0 z-20 -ml-3 flex w-6 cursor-ew-resize items-center justify-center"
            >
              <div className="h-full w-px bg-[color:var(--land-gold)] shadow-[0_0_8px_rgba(240,181,74,0.65)]" />
              <span className="absolute rounded-full border border-[color:var(--land-gold)] bg-black/80 px-1.5 py-0.5 font-mono text-[9.5px] text-white backdrop-blur-md">
                ⇄
              </span>
            </div>
          ) : null}

          {renderStageHandles()}
        </div>
      </div>

      {/* Snapseed Floating Left Vertical Parameter Wheel HUD (appears during vertical canvas gesture) */}
      {wheelVisible && meta && meta.parameters.length > 0 ? (
        <div className="optics-glass-panel pointer-events-none absolute top-1/2 left-4 z-30 w-52 -translate-y-1/2 rounded-2xl p-2 shadow-2xl">
          <div className="mb-1 px-2 text-[10.5px] font-medium text-[color:var(--land-gold)]">
            Swipe vertically to switch
          </div>
          {meta.parameters.map((param, idx) => {
            const val = Number(
              (activeLayer?.params as unknown as Record<string, number> | undefined)?.[param.key] ?? 0,
            );
            const active = idx === clampedParamIdx;
            return (
              <div
                key={param.key}
                className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[12px] ${
                  active ? "bg-foreground text-background font-medium" : "text-muted-foreground"
                }`}
              >
                <span>{param.label}</span>
                <span className="font-mono tabular-nums">
                  {val > 0 && param.min < 0 ? `+${Math.round(val)}` : Math.round(val)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Contextual Stage Instruction Pill (White Balance / Selective / Paint) */}
      {eyedropperArmed || selectiveAddArmed ? (
        <div className="optics-glass-pill pointer-events-none absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] text-foreground">
          {eyedropperArmed ? <Pipette className="size-3.5 text-[color:var(--land-gold)]" /> : <Plus className="size-3.5 text-[color:var(--land-gold)]" />}
          <span>
            {eyedropperArmed
              ? "Click any grey or white surface on the plate to neutralize tint"
              : "Click anywhere on the plate to anchor a U-Point"}
          </span>
        </div>
      ) : activeLayer && meta && meta.parameters.length > 0 && !isPaintMode ? (
        <div className="pointer-events-none absolute bottom-3 left-4 z-10 hidden items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur-md sm:inline-flex">
          <SlidersHorizontal className="size-3 text-[color:var(--land-gold)]" />
          <span>Drag horizontally to adjust · vertically to switch parameters</span>
        </div>
      ) : null}

      {/* 1:1 Optical Loupe */}
      {loupeEnabled && cursorScreen && cursorNorm ? (
        <div
          style={{
            left: `${clamp(cursorScreen.x + 22, 16, 860)}px`,
            top: `${Math.max(16, cursorScreen.y - 148)}px`,
          }}
          className="pointer-events-none absolute z-30 overflow-hidden rounded-full border-2 border-[color:var(--land-gold)] bg-black shadow-2xl"
        >
          <canvas ref={loupeCanvasRef} className="block size-[132px]" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="size-2.5 rounded-full border border-[color:var(--land-gold)]" />
          </div>
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-1.5 py-0.5 font-mono text-[9px] text-white tabular-nums">
            1:1 · 200%
          </span>
        </div>
      ) : null}

      {/* Live Brush Ring Cursor */}
      {showBrushRing && cursorScreen ? (
        <div
          style={{
            left: `${cursorScreen.x}px`,
            top: `${cursorScreen.y}px`,
            width: `${Math.max(14, activeBrushPx)}px`,
            height: `${Math.max(14, activeBrushPx)}px`,
          }}
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--land-gold)] shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
        />
      ) : null}

      {/* Drag-and-Drop Overlay */}
      {dragFileOver ? (
        <div className="pointer-events-none absolute inset-4 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--land-gold)] bg-background/85 backdrop-blur-xl">
          <Upload className="size-7 text-[color:var(--land-gold)]" />
          <p className="mt-2 text-[14px] font-medium text-foreground">Drop photograph to open in Optics</p>
        </div>
      ) : null}
    </div>
  );
}
