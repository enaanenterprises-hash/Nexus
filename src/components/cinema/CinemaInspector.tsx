"use client";

import { memo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Lock,
  Palette,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Waves,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FILTER_PRESETS } from "@/lib/cinema/presets";
import type {
  CinemaAudioClip,
  CinemaBlendMode,
  CinemaClip,
  CinemaFontFamily,
  CinemaKenBurnsMode,
  CinemaMarker,
  CinemaMotionType,
  CinemaProject,
  CinemaVisualizerStyle,
} from "@/lib/cinema/types";

export type CinemaInspectorTab = "style" | "color" | "motion" | "layers";

const MOTION_OPTIONS: Array<{ value: CinemaMotionType; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "rise", label: "Apple Rise" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "pop", label: "Spring Pop" },
  { value: "zoom-in", label: "Smooth Zoom" },
  { value: "blur-in", label: "Optical Focus" },
  { value: "typewriter", label: "Typewriter Reveal" },
];

const BLEND_MODES: Array<{ value: CinemaBlendMode; label: string }> = [
  { value: "source-over", label: "Normal" },
  { value: "screen", label: "Screen" },
  { value: "multiply", label: "Multiply" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft Light" },
];

const COLOR_CHIPS = [
  "#f5f5f7",
  "#09090b",
  "#ff3b30",
  "#d4d4d8",
  "#71717a",
  "#22c55e",
  "transparent",
] as const;

export const CinemaInspectorContent = memo(function CinemaInspectorContent({
  tab,
  onChangeTab,
  project,
  selectedClip,
  onSelectClip,
  onUpdateClip,
  onReorderClip,
  onDeleteClip,
  onSeek,
  onUpdateMarker,
  onDeleteMarker,
  onCreateLowerThirdAtMarker,
  onPushMarkersToStudio,
  onResyncStudioAudio,
  onExtractVideoAudio,
  onClose,
}: {
  tab: CinemaInspectorTab;
  onChangeTab: (tab: CinemaInspectorTab) => void;
  project: CinemaProject;
  selectedClip: CinemaClip | null;
  onSelectClip: (id: string | null) => void;
  onUpdateClip: (clipId: string, updater: (c: CinemaClip) => CinemaClip, recordHistory?: boolean) => void;
  onReorderClip: (clipId: string, dir: "up" | "down") => void;
  onDeleteClip: (clipId: string) => void;
  onSeek: (ms: number) => void;
  onUpdateMarker: (markerId: string, label: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onCreateLowerThirdAtMarker: (marker: CinemaMarker) => void;
  onPushMarkersToStudio: (markers: CinemaMarker[]) => void;
  onResyncStudioAudio: (clipId: string) => void;
  onExtractVideoAudio: (clipId: string) => void;
  onClose?: () => void;
}) {
  const [resyncing, setResyncing] = useState(false);

  const audioStemClips = project.clips.filter(
    (c): c is CinemaAudioClip => c.kind === "audio",
  );
  const hasTransform = selectedClip && selectedClip.kind !== "audio";
  const hasFilter = selectedClip && (selectedClip.kind === "video" || selectedClip.kind === "image");
  const hasAnim = selectedClip && selectedClip.kind !== "audio";
  const hasAudioControls =
    selectedClip && (selectedClip.kind === "audio" || selectedClip.kind === "video");
  const canBindAudioStem =
    selectedClip &&
    (selectedClip.kind === "visualizer" ||
      selectedClip.kind === "text" ||
      selectedClip.kind === "shape");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header + 4 Focused Inspector Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-border/75 px-3 py-2">
        <div className="grid flex-1 grid-cols-4 gap-0.5 rounded-full border border-border/75 bg-foreground/[0.03] p-0.5">
          {(
            [
              { id: "style", label: "Style", icon: Sliders },
              { id: "color", label: "Color", icon: Palette },
              { id: "motion", label: "Motion", icon: Sparkles },
              { id: "layers", label: "Layers", icon: Lock },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`h-6 rounded-full text-[11px] font-medium transition-colors ${
                tab === item.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close Inspector"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="cinema-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3.5 py-3.5">
        {tab !== "layers" && !selectedClip ? (
          <div className="rounded-2xl border border-border/65 bg-card/45 px-4 py-8 text-center">
            <p className="text-[12.5px] font-medium text-foreground">No element selected</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Click any item on the stage or timeline to adjust properties, filters, or motion.
            </p>
          </div>
        ) : null}

        {tab === "style" && selectedClip ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {selectedClip.name}
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground capitalize tabular-nums">
                  {selectedClip.kind} · {(selectedClip.durationMs / 1000).toFixed(1)}s
                </div>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onDeleteClip(selectedClip.id)}
                aria-label="Delete clip"
                className="size-7 rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            {/* Text Controls */}
            {selectedClip.kind === "text" ? (
              <div className="space-y-3 rounded-2xl border border-border/75 bg-card/50 p-3">
                <Textarea
                  value={selectedClip.text}
                  rows={2}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => (c.kind === "text" ? { ...c, text: e.target.value } : c),
                      false,
                    )
                  }
                  className="text-[12.5px]"
                />

                <Select
                  value={selectedClip.fontFamily}
                  onValueChange={(val) => {
                    if (!val) return;
                    onUpdateClip(selectedClip.id, (c) =>
                      c.kind === "text" ? { ...c, fontFamily: val as CinemaFontFamily } : c,
                    );
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General Sans, -apple-system, sans-serif">
                      General Sans (UI)
                    </SelectItem>
                    <SelectItem value="'Cabinet Grotesk', -apple-system, sans-serif">
                      Cabinet Grotesk (Display)
                    </SelectItem>
                    <SelectItem value="'Gambetta', Georgia, serif">
                      Gambetta (Editorial Serif)
                    </SelectItem>
                    <SelectItem value="'Commit Mono', ui-monospace, monospace">
                      Commit Mono (Technical)
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Size</span>
                      <span className="font-mono tabular-nums">{selectedClip.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={18}
                      max={150}
                      value={selectedClip.fontSize}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) =>
                            c.kind === "text" ? { ...c, fontSize: Number(e.target.value) } : c,
                          false,
                        )
                      }
                      className="cinema-range w-full"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-muted-foreground">Align</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["left", "center", "right"] as const).map((al) => (
                        <button
                          key={al}
                          type="button"
                          onClick={() =>
                            onUpdateClip(selectedClip.id, (c) =>
                              c.kind === "text" ? { ...c, align: al } : c,
                            )
                          }
                          className={`h-6 rounded-md text-[10.5px] capitalize ${
                            selectedClip.align === al
                              ? "bg-foreground text-background"
                              : "bg-card text-muted-foreground"
                          }`}
                        >
                          {al[0]!.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] text-muted-foreground">Ink Color</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_CHIPS.filter((c) => c !== "transparent").map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        aria-label={`Set text color ${swatch}`}
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) =>
                            c.kind === "text" ? { ...c, color: swatch } : c,
                          )
                        }
                        style={{ background: swatch }}
                        className={`size-5 rounded-full border ${
                          selectedClip.color === swatch
                            ? "border-[color:var(--cinema-select)] ring-2 ring-[color:var(--cinema-select)]/40"
                            : "border-white/20"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] text-muted-foreground">Background Plate</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_CHIPS.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        aria-label={`Set plate color ${swatch}`}
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) =>
                            c.kind === "text"
                              ? {
                                  ...c,
                                  backgroundColor: swatch,
                                  backgroundPadding: swatch === "transparent" ? 0 : Math.max(14, c.backgroundPadding),
                                  backgroundRadius: swatch === "transparent" ? 0 : Math.max(10, c.backgroundRadius),
                                }
                              : c,
                          )
                        }
                        style={{ background: swatch === "transparent" ? "transparent" : swatch }}
                        className={`size-5 rounded-full border ${
                          selectedClip.backgroundColor === swatch
                            ? "border-[color:var(--cinema-select)] ring-2 ring-[color:var(--cinema-select)]/40"
                            : "border-white/20"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Visualizer Controls */}
            {selectedClip.kind === "visualizer" ? (
              <div className="space-y-3 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] text-muted-foreground">Waveform Style</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["bars", "mirror-wave", "horizon-line", "ring"] as CinemaVisualizerStyle[]).map(
                      (st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            onUpdateClip(selectedClip.id, (c) =>
                              c.kind === "visualizer" ? { ...c, style: st } : c,
                            )
                          }
                          className={`h-7 rounded-lg text-[11px] capitalize ${
                            selectedClip.style === st
                              ? "bg-foreground text-background"
                              : "bg-card text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {st}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>Sensitivity</span>
                    <span className="font-mono tabular-nums">
                      {selectedClip.sensitivity.toFixed(1)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.4}
                    step={0.1}
                    value={selectedClip.sensitivity}
                    onChange={(e) =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) =>
                          c.kind === "visualizer"
                            ? { ...c, sensitivity: Number(e.target.value) }
                            : c,
                        false,
                      )
                    }
                    className="cinema-range w-full"
                  />
                </div>
              </div>
            ) : null}

            {/* Shape Controls */}
            {selectedClip.kind === "shape" ? (
              <div className="space-y-3 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="text-[11px] text-muted-foreground">Fill Color</div>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_CHIPS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() =>
                        onUpdateClip(selectedClip.id, (c) =>
                          c.kind === "shape" ? { ...c, fill: swatch } : c,
                        )
                      }
                      style={{ background: swatch === "transparent" ? "transparent" : swatch }}
                      className={`size-5 rounded-full border ${
                        selectedClip.fill === swatch
                          ? "border-[color:var(--cinema-select)] ring-2 ring-[color:var(--cinema-select)]/40"
                          : "border-white/20"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Transform Controls */}
            {hasTransform ? (
              <div className="space-y-3 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Opacity</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(selectedClip.transform.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={selectedClip.transform.opacity}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) =>
                            c.kind !== "audio"
                              ? { ...c, transform: { ...c.transform, opacity: Number(e.target.value) } }
                              : c,
                          false,
                        )
                      }
                      className="cinema-range w-full"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Corner Radius</span>
                      <span className="font-mono tabular-nums">
                        {selectedClip.transform.borderRadius}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={selectedClip.transform.borderRadius}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) =>
                            c.kind !== "audio"
                              ? {
                                  ...c,
                                  transform: {
                                    ...c.transform,
                                    borderRadius: Number(e.target.value),
                                  },
                                }
                              : c,
                          false,
                        )
                      }
                      className="cinema-range w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={selectedClip.transform.blendMode}
                    onValueChange={(val) => {
                      if (!val) return;
                      onUpdateClip(selectedClip.id, (c) =>
                        c.kind !== "audio"
                          ? { ...c, transform: { ...c.transform, blendMode: val as CinemaBlendMode } }
                          : c,
                      );
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLEND_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    size="sm"
                    variant={selectedClip.transform.shadow ? "secondary" : "outline"}
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) =>
                        c.kind !== "audio"
                          ? {
                              ...c,
                              transform: { ...c.transform, shadow: !c.transform.shadow },
                            }
                          : c,
                      )
                    }
                    className="h-7 rounded-xl text-[11px]"
                  >
                    Drop Shadow
                  </Button>
                </div>

                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) =>
                        c.kind !== "audio"
                          ? { ...c, transform: { ...c.transform, flipH: !c.transform.flipH } }
                          : c,
                      )
                    }
                    className="h-7 flex-1 rounded-xl text-[11px]"
                  >
                    Flip H
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) =>
                        c.kind !== "audio"
                          ? { ...c, transform: { ...c.transform, x: 50, y: 50, rotation: 0 } }
                          : c,
                      )
                    }
                    className="h-7 flex-1 rounded-xl text-[11px]"
                  >
                    Center
                  </Button>
                </div>

                {(selectedClip.kind === "video" || selectedClip.kind === "image") ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["cover", "contain"] as const).map((fit) => (
                      <button
                        key={fit}
                        type="button"
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) =>
                            c.kind === "video" || c.kind === "image" ? { ...c, fit } : c,
                          )
                        }
                        className={`h-7 rounded-xl text-[11px] capitalize ${
                          selectedClip.fit === fit
                            ? "bg-foreground font-medium text-background"
                            : "bg-card text-muted-foreground"
                        }`}
                      >
                        Fit: {fit}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Audio & Recording Studio Sync Controls */}
            {hasAudioControls ? (
              <div className="space-y-3 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-medium text-foreground">Audio Gain &amp; Fades</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {Math.round(selectedClip.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={selectedClip.volume}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) =>
                        c.kind === "audio" || c.kind === "video"
                          ? { ...c, volume: Number(e.target.value) }
                          : c,
                      false,
                    )
                  }
                  className="cinema-range w-full"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[10.5px] text-muted-foreground">
                      <span>Fade In</span>
                      <span className="font-mono tabular-nums">
                        {(selectedClip.fadeInMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={4000}
                      step={100}
                      value={selectedClip.fadeInMs}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) =>
                            c.kind === "audio" || c.kind === "video"
                              ? { ...c, fadeInMs: Number(e.target.value) }
                              : c,
                          false,
                        )
                      }
                      className="cinema-range w-full"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[10.5px] text-muted-foreground">
                      <span>Fade Out</span>
                      <span className="font-mono tabular-nums">
                        {(selectedClip.fadeOutMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={4000}
                      step={100}
                      value={selectedClip.fadeOutMs}
                      onChange={(e) =>
                        onUpdateClip(
                          selectedClip.id,
                          (c) =>
                            c.kind === "audio" || c.kind === "video"
                              ? { ...c, fadeOutMs: Number(e.target.value) }
                              : c,
                          false,
                        )
                      }
                      className="cinema-range w-full"
                    />
                  </div>
                </div>

                {selectedClip.kind === "audio" ? (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) =>
                        c.kind === "audio" ? { ...c, duckOthers: !c.duckOthers } : c,
                      )
                    }
                    className={`flex h-8 w-full items-center justify-between rounded-lg border px-2.5 text-[11px] transition-colors ${
                      selectedClip.duckOthers
                        ? "border-[color:var(--nexus-link-border)] bg-[color:var(--nexus-link-soft)] font-medium text-foreground"
                        : "border-border/75 bg-background/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>Auto-Duck Music Below This Track</span>
                    <span
                      className={`font-mono text-[10px] ${
                        selectedClip.duckOthers ? "text-[color:var(--nexus-link)]" : ""
                      }`}
                    >
                      {selectedClip.duckOthers ? "Active" : "Off"}
                    </span>
                  </button>
                ) : null}

                {selectedClip.kind === "video" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onExtractVideoAudio(selectedClip.id)}
                    className="h-8 w-full gap-1.5 rounded-lg border-[color:var(--nexus-link-border)] bg-[color:var(--nexus-link-soft)] text-[11.5px] text-[color:var(--nexus-link)]"
                  >
                    <Waves className="size-3.5" />
                    <span>Send Audio Track → Studio</span>
                  </Button>
                ) : null}

                {selectedClip.kind === "audio" && selectedClip.studioRef ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={resyncing}
                    onClick={async () => {
                      setResyncing(true);
                      try {
                        await onResyncStudioAudio(selectedClip.id);
                      } finally {
                        setResyncing(false);
                      }
                    }}
                    className="h-8 w-full gap-1.5 rounded-lg border-[color:var(--nexus-link-border)] bg-[color:var(--nexus-link-soft)] text-[11.5px] text-[color:var(--nexus-link)]"
                  >
                    <RefreshCw className={`size-3.5 ${resyncing ? "animate-spin" : ""}`} />
                    <span>Pull Latest from Studio</span>
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Stem-Bound Audio Reactivity (Visualizers, Typography & Shapes) */}
            {canBindAudioStem ? (
              <div className="space-y-2 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-medium text-foreground">Stem Reactivity</span>
                  {selectedClip.reactiveAudioClipId ? (
                    <span className="size-1.5 rounded-full bg-[color:var(--nexus-link)]" />
                  ) : null}
                </div>
                <Select
                  value={selectedClip.reactiveAudioClipId || "__master__"}
                  onValueChange={(val) => {
                    if (!val) return;
                    const nextId = val === "__master__" ? undefined : val;
                    onUpdateClip(selectedClip.id, (c) =>
                      c.kind === "visualizer" || c.kind === "text" || c.kind === "shape"
                        ? { ...c, reactiveAudioClipId: nextId }
                        : c,
                    );
                  }}
                >
                  <SelectTrigger className="h-8 w-full rounded-lg text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__master__">Master Output Mix</SelectItem>
                    {audioStemClips.map((aud) => (
                      <SelectItem key={aud.id} value={aud.id}>
                        Stem: {aud.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "color" && selectedClip ? (
          hasFilter ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1.5">
                {FILTER_PRESETS.map((preset) => {
                  const active = selectedClip.filter.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        onUpdateClip(selectedClip.id, (c) =>
                          c.kind === "video" || c.kind === "image"
                            ? { ...c, filter: { preset: preset.id, ...preset.values } }
                            : c,
                        )
                      }
                      className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-colors ${
                        active
                          ? "border-[color:var(--cinema-select)] bg-[color:var(--cinema-select-soft)]"
                          : "border-border/75 bg-card/55 hover:border-border"
                      }`}
                    >
                      <span
                        className="size-5 shrink-0 rounded-full border border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${preset.swatch[0]}, ${preset.swatch[1]})`,
                        }}
                      />
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <Separator />

              {(
                [
                  { key: "brightness", label: "Exposure", min: 0.5, max: 1.5, step: 0.02 },
                  { key: "contrast", label: "Contrast", min: 0.6, max: 1.6, step: 0.02 },
                  { key: "saturate", label: "Saturation", min: 0, max: 1.8, step: 0.02 },
                  { key: "temperature", label: "Warmth / Tint", min: -1, max: 1, step: 0.05 },
                  { key: "blur", label: "Optical Blur", min: 0, max: 16, step: 0.5 },
                  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.04 },
                ] as const
              ).map((slider) => (
                <div key={slider.key} className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{slider.label}</span>
                    <span className="font-mono text-foreground tabular-nums">
                      {selectedClip.filter[slider.key].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={selectedClip.filter[slider.key]}
                    onChange={(e) =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) =>
                          c.kind === "video" || c.kind === "image"
                            ? {
                                ...c,
                                filter: { ...c.filter, [slider.key]: Number(e.target.value) },
                              }
                            : c,
                        false,
                      )
                    }
                    className="cinema-range w-full"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-border/65 bg-card/45 px-4 py-6 text-center text-[11.5px] text-muted-foreground">
              Select a Video or Photo clip on the timeline to adjust color grading.
            </p>
          )
        ) : null}

        {tab === "motion" && selectedClip ? (
          hasAnim ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="text-[11.5px] font-medium text-foreground">Entrance Motion</div>
                <Select
                  value={selectedClip.animation.inType}
                  onValueChange={(val) => {
                    if (!val) return;
                    onUpdateClip(selectedClip.id, (c) =>
                      c.kind !== "audio"
                        ? { ...c, animation: { ...c.animation, inType: val as CinemaMotionType } }
                        : c,
                    );
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTION_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>In Duration</span>
                  <span className="font-mono tabular-nums">
                    {(selectedClip.animation.inDurationMs / 1000).toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={150}
                  max={1800}
                  step={50}
                  value={selectedClip.animation.inDurationMs}
                  onChange={(e) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) =>
                        c.kind !== "audio"
                          ? {
                              ...c,
                              animation: { ...c.animation, inDurationMs: Number(e.target.value) },
                            }
                          : c,
                      false,
                    )
                  }
                  className="cinema-range w-full"
                />
              </div>

              <div className="space-y-2 rounded-2xl border border-border/75 bg-card/50 p-3">
                <div className="text-[11.5px] font-medium text-foreground">Exit Motion</div>
                <Select
                  value={selectedClip.animation.outType}
                  onValueChange={(val) => {
                    if (!val) return;
                    onUpdateClip(selectedClip.id, (c) =>
                      c.kind !== "audio"
                        ? { ...c, animation: { ...c.animation, outType: val as CinemaMotionType } }
                        : c,
                    );
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTION_OPTIONS.filter((m) => m.value !== "typewriter").map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedClip.kind === "image" ? (
                <div className="space-y-2 rounded-2xl border border-border/75 bg-card/50 p-3">
                  <div className="text-[11.5px] font-medium text-foreground">Ken Burns Camera</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: "none", label: "Static" },
                        { id: "zoom-in", label: "Slow Zoom In" },
                        { id: "zoom-out", label: "Slow Pull Back" },
                        { id: "pan-left", label: "Pan Left" },
                        { id: "pan-right", label: "Pan Right" },
                      ] as Array<{ id: CinemaKenBurnsMode; label: string }>
                    ).map((kb) => (
                      <button
                        key={kb.id}
                        type="button"
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) =>
                            c.kind === "image" ? { ...c, kenBurns: kb.id } : c,
                          )
                        }
                        className={`h-7 rounded-lg text-[11px] ${
                          selectedClip.kenBurns === kb.id
                            ? "bg-foreground text-background"
                            : "bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {kb.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedClip.kind === "video" ? (
                <div className="space-y-1.5 rounded-2xl border border-border/75 bg-card/50 p-3">
                  <div className="flex justify-between text-[11.5px]">
                    <span className="font-medium text-foreground">Playback Speed</span>
                    <span className="font-mono tabular-nums">{selectedClip.speed}×</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {([0.5, 1, 1.5, 2] as const).map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) => ({ ...c, speed: sp }))
                        }
                        className={`h-7 rounded-lg font-mono text-[11px] tabular-nums ${
                          selectedClip.speed === sp
                            ? "bg-foreground text-background"
                            : "bg-card text-muted-foreground"
                        }`}
                      >
                        {sp}×
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-2xl border border-border/65 bg-card/45 px-4 py-6 text-center text-[11.5px] text-muted-foreground">
              Audio clip fades are adjusted in the Style tab.
            </p>
          )
        ) : null}

        {tab === "layers" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px] font-medium text-foreground">
                <span>Layer Stack ({project.clips.length})</span>
              </div>
              {project.clips.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground">No clips on timeline yet.</p>
              ) : (
                <div className="space-y-1">
                  {project.clips.map((clip) => {
                    const active = selectedClip?.id === clip.id;
                    return (
                      <div
                        key={clip.id}
                        className={`flex items-center justify-between gap-1 rounded-xl border px-2.5 py-1.5 text-[11.5px] ${
                          active
                            ? "border-[color:var(--cinema-select)] bg-[color:var(--cinema-select-soft)]"
                            : "border-border/70 bg-card/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectClip(clip.id);
                            onSeek(clip.startMs + 20);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate font-medium text-foreground">
                            {clip.kind === "text" ? clip.text : clip.name}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                            {(clip.startMs / 1000).toFixed(1)}s · {clip.kind}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorderClip(clip.id, "up")}
                          aria-label="Move layer up"
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorderClip(clip.id, "down")}
                          aria-label="Move layer down"
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateClip(clip.id, (c) => ({ ...c, hidden: !c.hidden }))
                          }
                          aria-label={clip.hidden ? "Show" : "Hide"}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          {clip.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateClip(clip.id, (c) => ({ ...c, locked: !c.locked }))
                          }
                          aria-label={clip.locked ? "Unlock" : "Lock"}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          {clip.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-foreground">
                  Timeline Markers ({project.markers.length})
                </span>
                {project.markers.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onPushMarkersToStudio(project.markers)}
                    className="text-[10.5px] font-medium text-[color:var(--nexus-link)] hover:underline"
                  >
                    Sync to Studio
                  </button>
                ) : null}
              </div>

              {project.markers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Press <kbd className="font-mono">M</kbd> on the timeline to drop a cue or pull chapter markers from Recording Studio.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {project.markers.map((marker) => (
                    <div
                      key={marker.id}
                      className="flex items-center gap-1 rounded-xl border border-border/75 bg-card/55 px-2.5 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => onSeek(marker.atMs)}
                        className="shrink-0 font-mono text-[10.5px] text-[color:var(--cinema-playhead)] tabular-nums hover:underline"
                      >
                        {(marker.atMs / 1000).toFixed(1)}s
                      </button>
                      <Input
                        value={marker.label}
                        onChange={(e) => onUpdateMarker(marker.id, e.target.value)}
                        className="h-6 border-0 bg-transparent px-1 text-[11.5px] shadow-none"
                      />
                      <button
                        type="button"
                        title="Create lower-third card at marker"
                        aria-label={`Add lower-third at ${marker.label}`}
                        onClick={() => onCreateLowerThirdAtMarker(marker)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Type className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteMarker(marker.id)}
                        aria-label={`Remove marker ${marker.label}`}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
