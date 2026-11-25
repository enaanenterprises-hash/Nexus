"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Check,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Paintbrush,
  Pipette,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildSplineLut, clamp } from "@/lib/optics/color-math";
import { FILM_STOCKS } from "@/lib/optics/processors/creative-filters";
import {
  CURVE_PRESETS,
  DEFAULT_CURVE_POINTS,
  HSL_CHANNEL_META,
  getToolMeta,
} from "@/lib/optics/tools-meta";
import type {
  OpticsBlackWhiteParams,
  OpticsBlendMode,
  OpticsBrushParams,
  OpticsCropAspect,
  OpticsCropParams,
  OpticsCurveChannelKey,
  OpticsCurvePoint,
  OpticsCurvesParams,
  OpticsDoubleExposureParams,
  OpticsEditLayer,
  OpticsExpandParams,
  OpticsFillMode,
  OpticsFramesParams,
  OpticsFrameStyleId,
  OpticsGrainyFilmParams,
  OpticsHealingParams,
  OpticsHistogram,
  OpticsHslParams,
  OpticsLensBlurParams,
  OpticsPerspectiveParams,
  OpticsProject,
  OpticsRetroluxParams,
  OpticsSelectiveParams,
  OpticsTextParams,
  OpticsTextStyleId,
  OpticsToolId,
  OpticsToolParamMap,
  OpticsVintageParams,
} from "@/lib/optics/types";

export type OpticsInspectorTab = "adjust" | "histogram" | "stack";

const BLEND_MODES: ReadonlyArray<{ id: OpticsBlendMode; label: string }> = [
  { id: "default", label: "Normal" },
  { id: "screen", label: "Screen" },
  { id: "multiply", label: "Multiply" },
  { id: "overlay", label: "Overlay" },
  { id: "soft-light", label: "Soft Light" },
  { id: "add", label: "Add" },
  { id: "subtract", label: "Subtract" },
  { id: "lighten", label: "Lighten" },
  { id: "darken", label: "Darken" },
];

const FRAME_STYLES: ReadonlyArray<{ id: OpticsFrameStyleId; label: string }> = [
  { id: "none", label: "None" },
  { id: "gallery-matte", label: "Gallery Matte" },
  { id: "hairline-museum", label: "Museum White" },
  { id: "obsidian-frame", label: "Obsidian Matte" },
  { id: "gold-rule", label: "Gold Keyline" },
  { id: "film-35mm", label: "35mm Sprocket" },
  { id: "instant-border", label: "Instant Border" },
  { id: "darkroom-edge", label: "Darkroom Edge" },
  { id: "cinema-matte", label: "Cinema Matte" },
  { id: "contact-sheet", label: "Contact Sheet" },
];

const TEXT_STYLES: ReadonlyArray<{ id: OpticsTextStyleId; label: string }> = [
  { id: "editorial-serif", label: "Editorial Serif" },
  { id: "swiss-clean", label: "Swiss Clean" },
  { id: "technical-mono", label: "Technical Mono" },
  { id: "gallery-stamp", label: "Gallery Stamp" },
  { id: "horizon-bar", label: "Horizon Rule" },
  { id: "double-hairline", label: "Double Hairline" },
  { id: "cutout-badge", label: "Cutout Plate" },
  { id: "film-frame-caption", label: "Film Caption" },
];

const CROP_ASPECTS: readonly OpticsCropAspect[] = [
  "free",
  "original",
  "1:1",
  "4:5",
  "16:9",
  "9:16",
  "3:2",
  "4:3",
];

function ParamSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  active = false,
  onFocus,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  active?: boolean;
  onFocus?: () => void;
  onChange: (next: number) => void;
  onReset: () => void;
}) {
  const formatted =
    value > 0 && min < 0 ? `+${Number.isInteger(step) ? Math.round(value) : value.toFixed(1)}` : Number.isInteger(step) ? `${Math.round(value)}` : value.toFixed(1);
  return (
    <div
      onPointerDown={onFocus}
      onDoubleClick={onReset}
      className={`rounded-xl px-2.5 py-1.5 transition-colors ${
        active ? "bg-[color:var(--land-gold)]/10" : "hover:bg-foreground/[0.03]"
      }`}
      title="Double-click to reset parameter"
    >
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
          {label}
        </span>
        <span
          className={`font-mono text-[11.5px] tabular-nums ${
            Math.abs(value) > 0.01 ? "text-[color:var(--land-gold)]" : "text-muted-foreground"
          }`}
        >
          {formatted}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="optics-range w-full"
      />
    </div>
  );
}

function HistogramCanvas({
  histogram,
  compact = false,
}: {
  histogram: OpticsHistogram | null;
  compact?: boolean;
}) {
  const paths = useMemo(() => {
    if (!histogram) return null;
    const W = 260;
    const H = compact ? 72 : 108;
    const maxV = Math.max(1, histogram.maxChannel);

    const buildArea = (bins: Uint32Array) => {
      let d = `M 0 ${H}`;
      for (let i = 0; i < 256; i += 2) {
        const x = (i / 255) * W;
        const val = clamp((bins[i]! / maxV) * (H - 4), 0, H - 2);
        d += ` L ${x.toFixed(1)} ${(H - val).toFixed(1)}`;
      }
      d += ` L ${W} ${H} Z`;
      return d;
    };

    return {
      W,
      H,
      r: buildArea(histogram.r),
      g: buildArea(histogram.g),
      b: buildArea(histogram.b),
      luma: buildArea(histogram.luma),
    };
  }, [compact, histogram]);

  if (!paths) {
    return (
      <div className="grid h-24 place-items-center rounded-xl border border-border/70 text-[12px] text-muted-foreground">
        Evaluating tones…
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${paths.W} ${paths.H}`}
      className="w-full overflow-hidden rounded-xl border border-border/80 bg-black/75"
      aria-label="Live RGB and luminance histogram"
    >
      {/* Subtle quarter grid lines */}
      {[0.25, 0.5, 0.75].map((q) => (
        <line
          key={q}
          x1={paths.W * q}
          y1="0"
          x2={paths.W * q}
          y2={paths.H}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}
      <path d={paths.r} fill="rgba(232, 88, 84, 0.34)" />
      <path d={paths.g} fill="rgba(86, 198, 134, 0.32)" />
      <path d={paths.b} fill="rgba(96, 152, 240, 0.34)" />
      <path d={paths.luma} fill="rgba(244, 244, 247, 0.22)" stroke="rgba(244, 244, 247, 0.55)" strokeWidth="1" />
    </svg>
  );
}

function CurvesEditor({
  params,
  histogram,
  onChange,
}: {
  params: OpticsCurvesParams;
  histogram: OpticsHistogram | null;
  onChange: (next: OpticsCurvesParams) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const channelKey = params.activeChannel;
  const points = params[channelKey] ?? DEFAULT_CURVE_POINTS;
  const lut = useMemo(() => buildSplineLut(points), [points]);

  const splinePath = useMemo(() => {
    let d = "";
    for (let i = 0; i < 256; i += 2) {
      const x = (i / 255) * 240;
      const y = (1 - lut[i]! / 255) * 240;
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [lut]);

  const channelStroke =
    channelKey === "red"
      ? "#ef5b56"
      : channelKey === "green"
        ? "#55c786"
        : channelKey === "blue"
          ? "#5b9bf2"
          : channelKey === "luma"
            ? "#f0b54a"
            : "#f5f4f0";

  function toNormCoord(clientX: number, clientY: number): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp(1 - (clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function updatePoints(nextPts: OpticsCurvePoint[]) {
    const sorted = [...nextPts].sort((a, b) => a.x - b.x);
    onChange({
      ...params,
      preset: "custom",
      [channelKey]: sorted,
    });
  }

  return (
    <div className="space-y-3">
      {/* Channel Selector */}
      <div className="grid grid-cols-5 gap-1">
        {(
          [
            { id: "rgb", label: "RGB" },
            { id: "luma", label: "Luma" },
            { id: "red", label: "Red" },
            { id: "green", label: "Green" },
            { id: "blue", label: "Blue" },
          ] as ReadonlyArray<{ id: OpticsCurveChannelKey; label: string }>
        ).map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => onChange({ ...params, activeChannel: ch.id })}
            className={`h-7 rounded-lg text-[11px] font-medium transition-colors ${
              channelKey === ch.id
                ? "bg-foreground text-background"
                : "bg-foreground/[0.06] text-muted-foreground hover:text-foreground"
            }`}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* Interactive Spline Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-[#09090d]">
        {histogram ? (
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <HistogramCanvas histogram={histogram} compact />
          </div>
        ) : null}
        <svg
          ref={svgRef}
          viewBox="0 0 240 240"
          className="relative z-10 aspect-square w-full cursor-crosshair touch-none select-none"
          onPointerDown={(e) => {
            const coord = toNormCoord(e.clientX, e.clientY);
            // Check proximity to an existing node
            let hitIdx = -1;
            let bestDist = 0.065;
            points.forEach((p, idx) => {
              const d = Math.hypot(p.x - coord.x, p.y - coord.y);
              if (d < bestDist) {
                bestDist = d;
                hitIdx = idx;
              }
            });
            if (hitIdx >= 0) {
              setDraggingIdx(hitIdx);
              (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            } else if (points.length < 10) {
              const next = [...points, coord].sort((a, b) => a.x - b.x);
              const addedIdx = next.indexOf(coord);
              updatePoints(next);
              setDraggingIdx(addedIdx);
              (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (draggingIdx === null) return;
            const coord = toNormCoord(e.clientX, e.clientY);
            const next = points.map((p, idx) => {
              if (idx !== draggingIdx) return p;
              // Keep endpoints constrained cleanly left/right
              const prevX = idx > 0 ? points[idx - 1]!.x + 0.02 : 0;
              const nextX = idx < points.length - 1 ? points[idx + 1]!.x - 0.02 : 1;
              return {
                x: idx === 0 ? clamp(coord.x, 0, 0.3) : idx === points.length - 1 ? clamp(coord.x, 0.7, 1) : clamp(coord.x, prevX, nextX),
                y: coord.y,
              };
            });
            onChange({ ...params, preset: "custom", [channelKey]: next });
          }}
          onPointerUp={() => setDraggingIdx(null)}
        >
          {[60, 120, 180].map((v) => (
            <g key={v}>
              <line x1={v} y1="0" x2={v} y2="240" stroke="rgba(255,255,255,0.08)" />
              <line x1="0" y1={v} x2="240" y2={v} stroke="rgba(255,255,255,0.08)" />
            </g>
          ))}
          <line x1="0" y1="240" x2="240" y2="0" stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
          <path d={splinePath} fill="none" stroke={channelStroke} strokeWidth="2.2" />
          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x * 240}
                cy={(1 - p.y) * 240}
                r="5.5"
                fill="#09090d"
                stroke={idx === draggingIdx ? "#f0b54a" : channelStroke}
                strokeWidth="2"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (points.length > 2 && idx > 0 && idx < points.length - 1) {
                    updatePoints(points.filter((_, i) => i !== idx));
                  }
                }}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Curve Presets */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(CURVE_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              onChange({
                preset: key,
                activeChannel: "rgb",
                rgb: [...preset.rgb],
                red: preset.red ? [...preset.red] : [...DEFAULT_CURVE_POINTS],
                green: preset.green ? [...preset.green] : [...DEFAULT_CURVE_POINTS],
                blue: preset.blue ? [...preset.blue] : [...DEFAULT_CURVE_POINTS],
                luma: [...DEFAULT_CURVE_POINTS],
              })
            }
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              params.preset === key
                ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                : "border-border/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OpticsInspector({
  open,
  tab,
  onTabChange,
  project,
  activeLayer,
  activeParamIndex,
  onSelectParamIndex,
  histogram,
  maskingLayerId,
  maskBrushStrength,
  maskBrushSize,
  eyedropperArmed,
  selectiveAddArmed,
  onUpdateLayerParams,
  onUpdateLayerOpacity,
  onAutoTune,
  onAutoWhiteBalance,
  onArmEyedropper,
  onArmSelectiveAdd,
  onOpenOverlayPicker,
  onResetActiveLayer,
  onSelectLayerForEdit,
  onToggleLayer,
  onMoveLayer,
  onDeleteLayer,
  onStartMaskBrush,
  onStopMaskBrush,
  onMaskBrushStrengthChange,
  onMaskBrushSizeChange,
  onToggleMaskInvert,
}: {
  open: boolean;
  tab: OpticsInspectorTab;
  onTabChange: (tab: OpticsInspectorTab) => void;
  project: OpticsProject;
  activeLayer: OpticsEditLayer | null;
  activeParamIndex: number;
  onSelectParamIndex: (idx: number) => void;
  histogram: OpticsHistogram | null;
  maskingLayerId: string | null;
  maskBrushStrength: 0 | 25 | 50 | 75 | 100;
  maskBrushSize: number;
  eyedropperArmed: boolean;
  selectiveAddArmed: boolean;
  onUpdateLayerParams: <K extends OpticsToolId>(layerId: string, nextParams: OpticsToolParamMap[K]) => void;
  onUpdateLayerOpacity: (layerId: string, opacity: number) => void;
  onAutoTune: (layerId: string) => void;
  onAutoWhiteBalance: (layerId: string) => void;
  onArmEyedropper: (armed: boolean) => void;
  onArmSelectiveAdd: (armed: boolean) => void;
  onOpenOverlayPicker: () => void;
  onResetActiveLayer: (layerId: string) => void;
  onSelectLayerForEdit: (layerId: string) => void;
  onToggleLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, dir: -1 | 1) => void;
  onDeleteLayer: (layerId: string) => void;
  onStartMaskBrush: (layerId: string) => void;
  onStopMaskBrush: () => void;
  onMaskBrushStrengthChange: (strength: 0 | 25 | 50 | 75 | 100) => void;
  onMaskBrushSizeChange: (size: number) => void;
  onToggleMaskInvert: (layerId: string) => void;
}) {
  if (!open) return null;

  const meta = activeLayer ? getToolMeta(activeLayer.toolId) : null;
  const maskingLayer = maskingLayerId
    ? project.editStack.find((l) => l.id === maskingLayerId) ?? null
    : null;

  function renderToolBody() {
    if (!activeLayer || !meta) {
      return (
        <div className="space-y-4 py-6 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-2xl border border-border/80 bg-background/50">
            <SlidersHorizontal className="size-4 text-[color:var(--land-gold)]" />
          </div>
          <div className="space-y-1 px-2">
            <p className="text-[13.5px] font-medium text-foreground">Select any tool or look</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Choose a module below or swipe vertically &amp; horizontally directly across your photograph to sculpt light non-destructively.
            </p>
          </div>
        </div>
      );
    }

    const patch = (next: OpticsToolParamMap[OpticsToolId]) =>
      onUpdateLayerParams(activeLayer.id, next);

    const genericNumericParams = meta.parameters.map((p, idx) => {
      const record = activeLayer.params as unknown as Record<string, number>;
      const val = typeof record[p.key] === "number" ? record[p.key]! : 0;
      const defaultVal = p.min < 0 ? 0 : p.min;
      return (
        <ParamSlider
          key={p.key}
          label={p.label}
          value={val}
          min={p.min}
          max={p.max}
          step={p.step ?? 1}
          unit={p.unit ?? ""}
          active={activeParamIndex === idx}
          onFocus={() => onSelectParamIndex(idx)}
          onChange={(nextVal) =>
            patch({
              ...(activeLayer.params as unknown as Record<string, unknown>),
              [p.key]: nextVal,
            } as unknown as OpticsToolParamMap[OpticsToolId])
          }
          onReset={() =>
            patch({
              ...(activeLayer.params as unknown as Record<string, unknown>),
              [p.key]: defaultVal,
            } as unknown as OpticsToolParamMap[OpticsToolId])
          }
        />
      );
    });

    return (
      <div className="space-y-4">
        {/* Tool Header */}
        <div className="flex items-start justify-between gap-2 px-1">
          <div>
            <h3 className="text-[13.5px] font-semibold text-foreground">{meta.name}</h3>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{meta.blurb}</p>
          </div>
          <button
            type="button"
            onClick={() => onResetActiveLayer(activeLayer.id)}
            title="Reset layer parameters"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>

        {/* Specialized interactive tool sub-controls */}
        {activeLayer.toolId === "tune" ? (
          <div className="px-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAutoTune(activeLayer.id)}
              className="h-8 w-full gap-1.5 rounded-full border-[color:var(--land-gold)]/40 text-[12px]"
            >
              <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
              <span>Auto-Tune Exposure &amp; Color</span>
            </Button>
          </div>
        ) : null}

        {activeLayer.toolId === "white-balance" ? (
          <div className="grid grid-cols-2 gap-2 px-1">
            <Button
              type="button"
              size="sm"
              variant={eyedropperArmed ? "default" : "outline"}
              onClick={() => onArmEyedropper(!eyedropperArmed)}
              className={`h-8 gap-1.5 rounded-full text-[12px] ${
                eyedropperArmed ? "bg-[color:var(--land-gold)] text-black" : ""
              }`}
            >
              <Pipette className="size-3.5" />
              <span>{eyedropperArmed ? "Pick pixel…" : "Neutral Picker"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAutoWhiteBalance(activeLayer.id)}
              className="h-8 gap-1.5 rounded-full text-[12px]"
            >
              <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
              <span>Auto WB</span>
            </Button>
          </div>
        ) : null}

        {activeLayer.toolId === "curves" ? (
          <CurvesEditor
            params={activeLayer.params as OpticsCurvesParams}
            histogram={histogram}
            onChange={(next) => patch(next)}
          />
        ) : null}

        {activeLayer.toolId === "hsl" ? (() => {
          const p = activeLayer.params as OpticsHslParams;
          const activeMeta = HSL_CHANNEL_META.find((c) => c.id === p.activeBand) ?? HSL_CHANNEL_META[0]!;
          const band = p.bands[activeMeta.id];
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-1.5 px-1">
                {HSL_CHANNEL_META.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => patch({ ...p, activeBand: ch.id })}
                    className={`flex h-8 items-center gap-1.5 rounded-xl border px-2 text-[11px] font-medium ${
                      p.activeBand === ch.id
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: ch.swatch }} />
                    <span className="truncate">{ch.label}</span>
                  </button>
                ))}
              </div>
              <ParamSlider
                label={`${activeMeta.label} Hue`}
                value={band.hue}
                min={-100}
                max={100}
                onChange={(v) =>
                  patch({
                    ...p,
                    bands: { ...p.bands, [activeMeta.id]: { ...band, hue: v } },
                  })
                }
                onReset={() =>
                  patch({
                    ...p,
                    bands: { ...p.bands, [activeMeta.id]: { ...band, hue: 0 } },
                  })
                }
              />
              <ParamSlider
                label={`${activeMeta.label} Saturation`}
                value={band.saturation}
                min={-100}
                max={100}
                onChange={(v) =>
                  patch({
                    ...p,
                    bands: { ...p.bands, [activeMeta.id]: { ...band, saturation: v } },
                  })
                }
                onReset={() =>
                  patch({
                    ...p,
                    bands: { ...p.bands, [activeMeta.id]: { ...band, saturation: 0 } },
                  })
                }
              />
              <ParamSlider
                label={`${activeMeta.label} Luminance`}
                value={band.luminance}
                min={-100}
                max={100}
                onChange={(v) =>
                  patch({
                    ...p,
                    bands: { ...p.bands, [activeMeta.id]: { ...band, luminance: v } },
                  })
                }
                onReset={() =>
                  patch({
                    ...p,
                    bands: { ...p.bands, [activeMeta.id]: { ...band, luminance: 0 } },
                  })
                }
              />

              {/* Split toning Shadows & Highlights */}
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                <p className="text-[11.5px] font-medium text-foreground">Split Toning</p>
                <ParamSlider
                  label="Shadow Hue"
                  value={p.shadows.hue}
                  min={0}
                  max={360}
                  unit="°"
                  onChange={(v) => patch({ ...p, shadows: { ...p.shadows, hue: v } })}
                  onReset={() => patch({ ...p, shadows: { ...p.shadows, hue: 215 } })}
                />
                <ParamSlider
                  label="Shadow Amount"
                  value={p.shadows.saturation}
                  min={0}
                  max={100}
                  onChange={(v) => patch({ ...p, shadows: { ...p.shadows, saturation: v } })}
                  onReset={() => patch({ ...p, shadows: { ...p.shadows, saturation: 0 } })}
                />
                <ParamSlider
                  label="Highlight Hue"
                  value={p.highlights.hue}
                  min={0}
                  max={360}
                  unit="°"
                  onChange={(v) => patch({ ...p, highlights: { ...p.highlights, hue: v } })}
                  onReset={() => patch({ ...p, highlights: { ...p.highlights, hue: 40 } })}
                />
                <ParamSlider
                  label="Highlight Amount"
                  value={p.highlights.saturation}
                  min={0}
                  max={100}
                  onChange={(v) => patch({ ...p, highlights: { ...p.highlights, saturation: v } })}
                  onReset={() => patch({ ...p, highlights: { ...p.highlights, saturation: 0 } })}
                />
              </div>
            </div>
          );
        })() : null}

        {activeLayer.toolId === "crop" ? (() => {
          const p = activeLayer.params as OpticsCropParams;
          const applyAspect = (aspect: OpticsCropAspect) => {
            if (aspect === "free") {
              patch({ ...p, aspect });
              return;
            }
            const imgAspect = project.width / Math.max(1, project.height);
            const target =
              aspect === "original"
                ? imgAspect
                : aspect === "1:1"
                  ? 1
                  : aspect === "4:5"
                    ? 0.8
                    : aspect === "16:9"
                      ? 16 / 9
                      : aspect === "9:16"
                        ? 9 / 16
                        : aspect === "3:2"
                          ? 1.5
                          : 4 / 3;
            let nw = 0.88;
            let nh = (nw * imgAspect) / target;
            if (nh > 0.9) {
              nh = 0.9;
              nw = (nh * target) / imgAspect;
            }
            patch({
              ...p,
              aspect,
              width: clamp(nw, 0.12, 1),
              height: clamp(nh, 0.12, 1),
              x: clamp((1 - nw) * 0.5, 0, 1 - nw),
              y: clamp((1 - nh) * 0.5, 0, 1 - nh),
            });
          };
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 px-1">
                {CROP_ASPECTS.map((aspect) => (
                  <button
                    key={aspect}
                    type="button"
                    onClick={() => applyAspect(aspect)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      p.aspect === aspect
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {aspect}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 px-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => patch({ ...p, rotate90: (((p.rotate90 + 1) % 4) as 0 | 1 | 2 | 3) })}
                  className="h-8 gap-1 rounded-xl text-[11.5px]"
                >
                  <RotateCw className="size-3.5" />
                  <span>90°</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={p.flipX ? "secondary" : "outline"}
                  onClick={() => patch({ ...p, flipX: !p.flipX })}
                  className="h-8 gap-1 rounded-xl text-[11.5px]"
                >
                  <FlipHorizontal className="size-3.5" />
                  <span>Flip H</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={p.flipY ? "secondary" : "outline"}
                  onClick={() => patch({ ...p, flipY: !p.flipY })}
                  className="h-8 gap-1 rounded-xl text-[11.5px]"
                >
                  <FlipVertical className="size-3.5" />
                  <span>Flip V</span>
                </Button>
              </div>
            </div>
          );
        })() : null}

        {activeLayer.toolId === "perspective" || activeLayer.toolId === "expand" ? (() => {
          const p = activeLayer.params as OpticsPerspectiveParams | OpticsExpandParams;
          return (
            <div className="space-y-1.5 px-1">
              <span className="text-[11.5px] font-medium text-muted-foreground">Edge Fill Mode</span>
              <div className="grid grid-cols-4 gap-1">
                {(["smart", "blur", "obsidian", "paper"] as readonly OpticsFillMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patch({ ...p, fillMode: mode } as OpticsToolParamMap[OpticsToolId])}
                    className={`h-8 rounded-lg border text-[11px] font-medium capitalize ${
                      p.fillMode === mode
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          );
        })() : null}

        {activeLayer.toolId === "selective" ? (() => {
          const p = activeLayer.params as OpticsSelectiveParams;
          const sel =
            p.points.find((pt) => pt.id === p.selectedPointId) ?? p.points[0] ?? null;
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 px-1">
                <Button
                  type="button"
                  size="sm"
                  variant={selectiveAddArmed ? "default" : "outline"}
                  onClick={() => onArmSelectiveAdd(!selectiveAddArmed)}
                  className={`h-8 flex-1 gap-1.5 rounded-full text-[12px] ${
                    selectiveAddArmed ? "bg-[color:var(--land-gold)] text-black" : ""
                  }`}
                >
                  <Plus className="size-3.5" />
                  <span>{selectiveAddArmed ? "Tap photo to place" : "Add Control Point"}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={p.showMaskOverlay ? "secondary" : "outline"}
                  onClick={() => patch({ ...p, showMaskOverlay: !p.showMaskOverlay })}
                  className="h-8 rounded-full px-3 text-[11.5px]"
                >
                  Mask
                </Button>
              </div>
              {sel ? (
                <div className="space-y-1 rounded-xl border border-border/70 bg-background/40 p-2">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Pin {p.points.findIndex((pt) => pt.id === sel.id) + 1} of {p.points.length}
                    </span>
                    {p.points.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const rest = p.points.filter((pt) => pt.id !== sel.id);
                          patch({
                            ...p,
                            points: rest,
                            selectedPointId: rest[0]?.id ?? null,
                          });
                        }}
                        className="text-[11px] text-destructive hover:underline"
                      >
                        Remove pin
                      </button>
                    ) : null}
                  </div>
                  <ParamSlider
                    label="Reach Radius"
                    value={Math.round(sel.reach * 100)}
                    min={5}
                    max={65}
                    unit="%"
                    onChange={(v) =>
                      patch({
                        ...p,
                        points: p.points.map((pt) =>
                          pt.id === sel.id ? { ...pt, reach: v / 100 } : pt,
                        ),
                      })
                    }
                    onReset={() =>
                      patch({
                        ...p,
                        points: p.points.map((pt) =>
                          pt.id === sel.id ? { ...pt, reach: 0.28 } : pt,
                        ),
                      })
                    }
                  />
                  {(
                    [
                      ["brightness", "Brightness"],
                      ["contrast", "Contrast"],
                      ["saturation", "Saturation"],
                      ["structure", "Structure"],
                    ] as const
                  ).map(([field, label]) => (
                    <ParamSlider
                      key={field}
                      label={label}
                      value={sel[field]}
                      min={-100}
                      max={100}
                      onChange={(v) =>
                        patch({
                          ...p,
                          points: p.points.map((pt) =>
                            pt.id === sel.id ? { ...pt, [field]: v } : pt,
                          ),
                        })
                      }
                      onReset={() =>
                        patch({
                          ...p,
                          points: p.points.map((pt) =>
                            pt.id === sel.id ? { ...pt, [field]: 0 } : pt,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "brush" ? (() => {
          const p = activeLayer.params as OpticsBrushParams;
          return (
            <div className="space-y-3 px-1">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: "dodge-burn", label: "Dodge & Burn" },
                    { id: "exposure", label: "Exposure" },
                    { id: "temperature", label: "Temperature" },
                    { id: "saturation", label: "Saturation" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => patch({ ...p, mode: m.id })}
                    className={`h-8 rounded-xl border text-[11.5px] font-medium ${
                      p.mode === m.id
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                  <span>Brush Strength</span>
                  <button
                    type="button"
                    onClick={() => patch({ ...p, showMaskOverlay: !p.showMaskOverlay })}
                    className={p.showMaskOverlay ? "text-rose-400" : "hover:text-foreground"}
                  >
                    {p.showMaskOverlay ? "Hide ruby mask" : "Show ruby mask"}
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {([-10, -5, 0, 5, 10] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => patch({ ...p, strength: s })}
                      className={`h-8 rounded-lg border font-mono text-[11px] tabular-nums ${
                        p.strength === s
                          ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)] text-black font-semibold"
                          : "border-border/70 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === 0 ? "Erase" : s > 0 ? `+${s}` : s}
                    </button>
                  ))}
                </div>
              </div>
              {p.strokes.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => patch({ ...p, strokes: [] })}
                  className="h-8 w-full rounded-full text-[12px] text-muted-foreground hover:text-destructive"
                >
                  Clear {p.strokes.length} brush stroke{p.strokes.length === 1 ? "" : "s"}
                </Button>
              ) : null}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "healing" ? (() => {
          const p = activeLayer.params as OpticsHealingParams;
          return (
            <div className="space-y-2 px-1">
              <p className="text-[11.5px] text-muted-foreground">
                Paint directly across any dust spot, cable, or distraction on the stage to patch-blend seamlessly.
              </p>
              {p.strokes.length > 0 ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => patch({ ...p, strokes: p.strokes.slice(0, -1) })}
                    className="h-8 flex-1 rounded-full text-[12px]"
                  >
                    Undo last spot
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => patch({ ...p, strokes: [] })}
                    className="h-8 rounded-full text-[12px] text-destructive"
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "lens-blur" ? (() => {
          const p = activeLayer.params as OpticsLensBlurParams;
          return (
            <div className="grid grid-cols-2 gap-1.5 px-1">
              {(["elliptical", "linear"] as const).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => patch({ ...p, shape })}
                  className={`h-8 rounded-xl border text-[12px] font-medium capitalize ${
                    p.shape === shape
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {shape === "elliptical" ? "Radial Optical" : "Linear Tilt-Shift"}
                </button>
              ))}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "double-exposure" ? (() => {
          const p = activeLayer.params as OpticsDoubleExposureParams;
          return (
            <div className="space-y-3 px-1">
              <Button
                type="button"
                variant="outline"
                onClick={onOpenOverlayPicker}
                className="h-9 w-full justify-between rounded-xl px-3 text-[12.5px]"
              >
                <span className="truncate">
                  {p.overlayName ? `Plate: ${p.overlayName}` : "Choose Overlay Image…"}
                </span>
                <span className="text-[11px] text-[color:var(--land-gold)]">Browse</span>
              </Button>
              <div className="grid grid-cols-3 gap-1">
                {BLEND_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => patch({ ...p, blendMode: m.id })}
                    className={`h-7 rounded-lg border text-[11px] font-medium ${
                      p.blendMode === m.id
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })() : null}

        {activeLayer.toolId === "text" ? (() => {
          const p = activeLayer.params as OpticsTextParams;
          const cur = p.items.find((it) => it.id === p.selectedItemId) ?? p.items[0] ?? null;
          return cur ? (
            <div className="space-y-3 px-1">
              <Input
                value={cur.text}
                onChange={(e) =>
                  patch({
                    ...p,
                    items: p.items.map((it) => (it.id === cur.id ? { ...it, text: e.target.value } : it)),
                  })
                }
                placeholder="Type caption…"
                className="h-9 rounded-xl text-[12.5px]"
              />
              <div className="grid grid-cols-2 gap-1">
                {TEXT_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      patch({
                        ...p,
                        items: p.items.map((it) => (it.id === cur.id ? { ...it, styleId: st.id } : it)),
                      })
                    }
                    className={`h-7 rounded-lg border px-2 text-left text-[11px] font-medium ${
                      cur.styleId === st.id
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      ...p,
                      items: p.items.map((it) => (it.id === cur.id ? { ...it, invert: !it.invert } : it)),
                    })
                  }
                  className={`h-8 flex-1 rounded-full border text-[11.5px] font-medium ${
                    cur.invert
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                      : "border-border/70 text-muted-foreground"
                  }`}
                >
                  {cur.invert ? "Invert Cutout: On" : "Invert Cutout: Off"}
                </button>
                <div className="flex items-center gap-1">
                  {["#f5f4ef", "#0c0c0f", "#f0b54a", "#c85d4c"].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        patch({
                          ...p,
                          items: p.items.map((it) => (it.id === cur.id ? { ...it, color: hex } : it)),
                        })
                      }
                      aria-label={`Color ${hex}`}
                      className={`size-6 rounded-full border ${
                        cur.color === hex ? "border-[color:var(--land-gold)] ring-2 ring-[color:var(--land-gold)]/40" : "border-white/25"
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
              <ParamSlider
                label="Type Size"
                value={cur.size}
                min={14}
                max={120}
                onChange={(v) =>
                  patch({
                    ...p,
                    items: p.items.map((it) => (it.id === cur.id ? { ...it, size: v } : it)),
                  })
                }
                onReset={() =>
                  patch({
                    ...p,
                    items: p.items.map((it) => (it.id === cur.id ? { ...it, size: 46 } : it)),
                  })
                }
              />
              <ParamSlider
                label="Opacity"
                value={cur.opacity}
                min={10}
                max={100}
                unit="%"
                onChange={(v) =>
                  patch({
                    ...p,
                    items: p.items.map((it) => (it.id === cur.id ? { ...it, opacity: v } : it)),
                  })
                }
                onReset={() =>
                  patch({
                    ...p,
                    items: p.items.map((it) => (it.id === cur.id ? { ...it, opacity: 92 } : it)),
                  })
                }
              />
            </div>
          ) : null;
        })() : null}

        {activeLayer.toolId === "frames" ? (() => {
          const p = activeLayer.params as OpticsFramesParams;
          return (
            <div className="grid grid-cols-2 gap-1 px-1">
              {FRAME_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => patch({ ...p, styleId: st.id })}
                  className={`h-8 rounded-xl border px-2.5 text-left text-[11.5px] font-medium ${
                    p.styleId === st.id
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "black-white" ? (() => {
          const p = activeLayer.params as OpticsBlackWhiteParams;
          return (
            <div className="space-y-2 px-1">
              <span className="text-[11.5px] font-medium text-muted-foreground">Optical Glass Filter</span>
              <div className="grid grid-cols-6 gap-1">
                {(
                  [
                    { id: "neutral", swatch: "#9e9ea6", label: "Neutral" },
                    { id: "red", swatch: "#d44b48", label: "Red" },
                    { id: "orange", swatch: "#e48c3c", label: "Orange" },
                    { id: "yellow", swatch: "#dfc148", label: "Yellow" },
                    { id: "green", swatch: "#4aa66b", label: "Green" },
                    { id: "blue", swatch: "#4c84d6", label: "Blue" },
                  ] as const
                ).map((flt) => (
                  <button
                    key={flt.id}
                    type="button"
                    title={`${flt.label} optical glass filter`}
                    onClick={() => patch({ ...p, filterColor: flt.id })}
                    className={`grid h-8 place-items-center rounded-lg border ${
                      p.filterColor === flt.id
                        ? "border-[color:var(--land-gold)] bg-foreground/10"
                        : "border-border/70"
                    }`}
                  >
                    <span className="size-4 rounded-full" style={{ backgroundColor: flt.swatch }} />
                  </button>
                ))}
              </div>
            </div>
          );
        })() : null}

        {activeLayer.toolId === "grainy-film" ? (() => {
          const p = activeLayer.params as OpticsGrainyFilmParams;
          return (
            <div className="grid grid-cols-3 gap-1 px-1">
              {FILM_STOCKS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => patch({ ...p, preset: st.id })}
                  className={`h-8 rounded-lg border px-1.5 font-mono text-[11px] font-medium ${
                    p.preset === st.id
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/12 text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st.id}
                </button>
              ))}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "vintage" ? (() => {
          const p = activeLayer.params as OpticsVintageParams;
          return (
            <div className="grid grid-cols-6 gap-1 px-1">
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => patch({ ...p, style: n })}
                  className={`h-7 rounded-lg border font-mono text-[11px] tabular-nums ${
                    p.style === n
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/14 text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          );
        })() : null}

        {activeLayer.toolId === "retrolux" ? (() => {
          const p = activeLayer.params as OpticsRetroluxParams;
          return (
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patch({ ...p, style: s })}
                    className={`size-7 rounded-lg border font-mono text-[11px] ${
                      p.style === s
                        ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/14 text-foreground"
                        : "border-border/70 text-muted-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => patch({ ...p, seed: (p.seed + 7) % 97 })}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                Randomize leak
              </Button>
            </div>
          );
        })() : null}

        {(activeLayer.toolId === "hdr-scape" ||
          activeLayer.toolId === "drama" ||
          activeLayer.toolId === "noir" ||
          activeLayer.toolId === "glamour-glow" ||
          activeLayer.toolId === "portrait") ? (() => {
          const presets =
            activeLayer.toolId === "hdr-scape"
              ? ["nature", "people", "fine", "strong"]
              : activeLayer.toolId === "drama"
                ? ["drama", "bright", "dark1", "dark2"]
                : activeLayer.toolId === "noir"
                  ? ["S01", "S02", "S03", "S04", "S05"]
                  : activeLayer.toolId === "portrait"
                    ? ["spotlight", "smooth-1", "smooth-2", "eye-clarity"]
                    : ["1", "2", "3", "4", "5"];
          const currentPreset = String((activeLayer.params as { preset: string | number }).preset);
          return (
            <div className="flex flex-wrap gap-1 px-1">
              {presets.map((pr) => (
                <button
                  key={pr}
                  type="button"
                  onClick={() =>
                    patch({
                      ...(activeLayer.params as unknown as Record<string, unknown>),
                      preset: activeLayer.toolId === "glamour-glow" ? Number(pr) : pr,
                    } as unknown as OpticsToolParamMap[OpticsToolId])
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${
                    currentPreset === pr
                      ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/14 text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {pr}
                </button>
              ))}
            </div>
          );
        })() : null}

        {/* Standard Parameter Sliders */}
        {genericNumericParams.length > 0 ? (
          <div className="space-y-0.5">{genericNumericParams}</div>
        ) : null}

        {/* Master Layer Opacity & Per-Layer Mask Shortcut */}
        <div className="border-t border-border/70 pt-3">
          <ParamSlider
            label="Layer Opacity"
            value={activeLayer.opacity}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onUpdateLayerOpacity(activeLayer.id, v)}
            onReset={() => onUpdateLayerOpacity(activeLayer.id, 100)}
          />
          {activeLayer.toolId !== "crop" &&
          activeLayer.toolId !== "perspective" &&
          activeLayer.toolId !== "expand" &&
          activeLayer.toolId !== "frames" ? (
            <div className="mt-2 px-1">
              <Button
                type="button"
                size="sm"
                variant={maskingLayerId === activeLayer.id ? "default" : "outline"}
                onClick={() =>
                  maskingLayerId === activeLayer.id
                    ? onStopMaskBrush()
                    : onStartMaskBrush(activeLayer.id)
                }
                className={`h-8 w-full gap-1.5 rounded-full text-[12px] ${
                  maskingLayerId === activeLayer.id ? "bg-[color:var(--land-gold)] text-black" : ""
                }`}
              >
                <Paintbrush className="size-3.5" />
                <span>
                  {maskingLayerId === activeLayer.id
                    ? "Finish Mask Brush"
                    : activeLayer.mask?.strokes.length
                      ? `Edit Layer Mask (${activeLayer.mask.strokes.length})`
                      : "Paint Selective Mask…"}
                </span>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label="Optics Precision Inspector"
      className="optics-glass-panel flex h-full w-full flex-col overflow-hidden rounded-[22px] lg:w-[324px]"
    >
      {/* Inspector Mode Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-border/70 p-2">
        {(
          [
            { id: "adjust", label: "Adjust", icon: SlidersHorizontal },
            { id: "histogram", label: "Scopes", icon: Sparkles },
            { id: "stack", label: `Edits (${project.editStack.length})`, icon: Layers },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex h-8 items-center justify-center gap-1.5 rounded-xl text-[12px] font-medium transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="tabular-nums">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Mask Brush Banner */}
      {maskingLayer ? (
        <div className="border-b border-[color:var(--land-gold)]/30 bg-[color:var(--land-gold)]/10 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <Brush className="size-3.5 text-[color:var(--land-gold)]" />
              Masking · {maskingLayer.label}
            </span>
            <button
              type="button"
              onClick={onStopMaskBrush}
              className="inline-flex h-6 items-center gap-1 rounded-full bg-foreground px-2.5 text-[11px] font-medium text-background"
            >
              <Check className="size-3" />
              Done
            </button>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {([0, 25, 50, 75, 100] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onMaskBrushStrengthChange(s)}
                className={`h-7 rounded-lg border font-mono text-[11px] tabular-nums ${
                  maskBrushStrength === s
                    ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)] text-black font-semibold"
                    : "border-border/70 text-muted-foreground"
                }`}
              >
                {s === 0 ? "Erase" : `${s}`}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Size</span>
            <div className="flex-1">
              <input
                type="range"
                min={8}
                max={96}
                step={2}
                value={maskBrushSize}
                onChange={(e) => onMaskBrushSizeChange(Number(e.target.value))}
                aria-label="Mask brush size"
                className="optics-range w-full"
              />
            </div>
            <button
              type="button"
              onClick={() => onToggleMaskInvert(maskingLayer.id)}
              className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-foreground"
            >
              {maskingLayer.mask?.invert ? "Inverted" : "Invert"}
            </button>
          </div>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3.5">
          {tab === "adjust" ? renderToolBody() : null}

          {tab === "histogram" ? (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-[12.5px] font-medium text-foreground">
                  RGB &amp; Luminance Waveform
                </h3>
                <HistogramCanvas histogram={histogram} />
              </div>

              {histogram ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="text-[10.5px] text-muted-foreground">Mean Luma</div>
                    <div className="mt-0.5 font-mono text-[14px] font-medium text-foreground tabular-nums">
                      {Math.round((histogram.meanLuma / 255) * 100)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="text-[10.5px] text-muted-foreground">Shadow Clip</div>
                    <div
                      className={`mt-0.5 font-mono text-[14px] font-medium tabular-nums ${
                        histogram.shadowClipPct > 5 ? "text-[color:var(--land-gold)]" : "text-foreground"
                      }`}
                    >
                      {histogram.shadowClipPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="text-[10.5px] text-muted-foreground">High Clip</div>
                    <div
                      className={`mt-0.5 font-mono text-[14px] font-medium tabular-nums ${
                        histogram.highlightClipPct > 5 ? "text-[color:var(--land-gold)]" : "text-foreground"
                      }`}
                    >
                      {histogram.highlightClipPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ) : null}

              <dl className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-3 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Plate Dimensions</dt>
                  <dd className="font-mono text-foreground tabular-nums">
                    {project.width} × {project.height}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Source Optics</dt>
                  <dd className="truncate text-right text-foreground">
                    {project.source.cameraHint ?? project.source.name}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Edit Stack</dt>
                  <dd className="font-mono text-foreground tabular-nums">
                    {project.editStack.length} non-destructive
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {tab === "stack" ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[12px] font-medium text-foreground">
                  View Edits Stack
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  Bottom → Top
                </span>
              </div>

              {project.editStack.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 p-5 text-center text-[12.5px] text-muted-foreground">
                  No adjustment layers yet. Pick a Look, Tool, or Filter below to begin your non-destructive stack.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...project.editStack].reverse().map((layer, revIdx) => {
                    const idx = project.editStack.length - 1 - revIdx;
                    const isSelected = activeLayer?.id === layer.id;
                    const isMasking = maskingLayerId === layer.id;
                    return (
                      <div
                        key={layer.id}
                        className={`group rounded-xl border p-2.5 transition-all ${
                          isSelected
                            ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/10"
                            : "border-border/75 bg-background/45 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleLayer(layer.id)}
                            aria-label={layer.enabled ? `Hide ${layer.label}` : `Show ${layer.label}`}
                            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                          >
                            {layer.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 opacity-50" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectLayerForEdit(layer.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-[12.5px] font-medium text-foreground">
                              {layer.label}
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                              <span>{layer.opacity}%</span>
                              {layer.mask?.strokes.length ? (
                                <>
                                  <span>·</span>
                                  <span className="text-[color:var(--land-gold)]">
                                    Mask ({layer.mask.strokes.length})
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </button>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                isMasking ? onStopMaskBrush() : onStartMaskBrush(layer.id)
                              }
                              aria-label={`Mask brush for ${layer.label}`}
                              title="Paint selective layer mask"
                              className={`grid size-7 place-items-center rounded-lg transition-colors ${
                                isMasking
                                  ? "bg-[color:var(--land-gold)] text-black"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Paintbrush className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === project.editStack.length - 1}
                              onClick={() => onMoveLayer(layer.id, 1)}
                              aria-label={`Move ${layer.label} up`}
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ArrowUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => onMoveLayer(layer.id, -1)}
                              aria-label={`Move ${layer.label} down`}
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ArrowDown className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteLayer(layer.id)}
                              aria-label={`Delete ${layer.label}`}
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/30 px-3 py-2 text-[11.5px] text-muted-foreground">
                <span>Original Plate</span>
                <span className="font-mono tabular-nums">
                  {project.width}×{project.height}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
