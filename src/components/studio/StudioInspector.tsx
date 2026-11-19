"use client";

import {
  BookmarkPlus,
  Copy,
  Download,
  Gauge,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { formatGainDb } from "@/lib/studio/capture-engine";
import type {
  StudioMarkerKind,
  StudioMarkerV1,
  StudioTrackColor,
  StudioTrackV1,
} from "@/lib/studio/types";

export type StudioInspectorTab = "clip" | "markers" | "session";

const MARKER_KIND_LABELS: Record<StudioMarkerKind, string> = {
  chapter: "Chapter",
  cue: "Cue",
  note: "Note",
  edit: "Edit point",
};

const COUNT_IN_LABELS: Record<string, string> = {
  "0": "Off",
  "1": "1 bar",
  "2": "2 bars",
};

const COLOR_SWATCHES: Array<{ id: StudioTrackColor; label: string; dotClass: string }> = [
  { id: "gold", label: "Gold (Host)", dotClass: "bg-[#f0b54a]" },
  { id: "sky", label: "Slate Blue (Guest)", dotClass: "bg-[#94b2d0]" },
  { id: "emerald", label: "Sage (Stem)", dotClass: "bg-[#6ec49f]" },
  { id: "coral", label: "Clay (Overdub)", dotClass: "bg-[#e29584]" },
  { id: "slate", label: "Silver (Safety)", dotClass: "bg-[#a1a1aa]" },
];

function fmtExactSec(ms: number): string {
  const safe = Math.max(0, ms);
  return `${(safe / 1000).toFixed(2)}s`;
}

function fmtDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const mins = Math.floor(safe / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function fmtSignedDb(db: number): string {
  if (Math.abs(db) < 0.05) return "0.0 dB";
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

export function StudioInspectorContent({
  tab,
  onChangeTab,
  selectedTrack,
  playheadMs,
  markers,
  markerKind,
  description,
  bpm,
  countInBars,
  masterGain,
  overdubEnabled,
  normalizing,
  onClose,
  onUpdateTrack,
  onSplitClipAtPlayhead,
  onDuplicateClip,
  onNormalizeClip,
  onDownloadRawTrack,
  onRemoveTrack,
  onChangeMarkerKind,
  onDropMarker,
  onSeek,
  onUpdateMarker,
  onDeleteMarker,
  onChangeDescription,
  onBlurDescription,
  onChangeBpm,
  onChangeCountInBars,
  onChangeMasterGain,
  onToggleOverdub,
  onOpenPatchbay,
}: {
  tab: StudioInspectorTab;
  onChangeTab: (tab: StudioInspectorTab) => void;
  selectedTrack: StudioTrackV1 | null;
  playheadMs: number;
  markers: StudioMarkerV1[];
  markerKind: StudioMarkerKind;
  description: string;
  bpm: number;
  countInBars: number;
  masterGain: number;
  overdubEnabled: boolean;
  normalizing: boolean;
  onClose?: () => void;
  onUpdateTrack: (trackId: string, updater: (prev: StudioTrackV1) => StudioTrackV1) => void;
  onSplitClipAtPlayhead: (trackId: string) => void;
  onDuplicateClip: (track: StudioTrackV1) => void;
  onNormalizeClip: (track: StudioTrackV1) => void;
  onDownloadRawTrack: (track: StudioTrackV1) => void;
  onRemoveTrack: (track: StudioTrackV1) => void;
  onChangeMarkerKind: (kind: StudioMarkerKind) => void;
  onDropMarker: () => void;
  onSeek: (ms: number) => void;
  onUpdateMarker: (markerId: string, label: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onChangeDescription: (val: string) => void;
  onBlurDescription: () => void;
  onChangeBpm: (bpm: number) => void;
  onChangeCountInBars: (bars: number) => void;
  onChangeMasterGain: (gain: number) => void;
  onToggleOverdub: () => void;
  onOpenPatchbay: () => void;
}) {
  const canSplitSelected =
    selectedTrack !== null &&
    playheadMs > selectedTrack.offsetMs + 140 &&
    playheadMs < selectedTrack.offsetMs + selectedTrack.durationMs - 140;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Segmented Inspector Tabs Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/75 px-3 py-2.5">
        <div
          role="tablist"
          aria-label="Studio inspector section"
          className="inline-grid flex-1 grid-cols-3 rounded-lg border border-border/75 bg-foreground/[0.04] p-0.5"
        >
          {(
            [
              { id: "clip", label: "Clip & Mix" },
              { id: "markers", label: `Markers (${markers.length})` },
              { id: "session", label: "Session" },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeTab(item.id)}
                className={`h-7 truncate rounded-md px-1.5 text-[11.5px] font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {onClose ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close inspector"
            className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {/* Scrollable Inspector Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">
        {tab === "clip" ? (
          selectedTrack ? (
            <div className="space-y-4">
              {/* Clip Identity & Color Tag */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-foreground">Selected clip</span>
                  {selectedTrack.inputSource ? (
                    <span className="max-w-[155px] truncate font-mono text-[10.5px] text-muted-foreground">
                      {selectedTrack.inputSource}
                    </span>
                  ) : null}
                </div>

                <Input
                  value={selectedTrack.name}
                  onChange={(e) =>
                    onUpdateTrack(selectedTrack.id, (prev) => ({ ...prev, name: e.target.value }))
                  }
                  aria-label="Clip name"
                  className="h-8 rounded-lg text-[12.5px] font-medium"
                />

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-muted-foreground">Color</span>
                  <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Clip color accent">
                    {COLOR_SWATCHES.map((sw) => {
                      const active = (selectedTrack.colorTag ?? "gold") === sw.id;
                      return (
                        <button
                          key={sw.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={sw.label}
                          title={sw.label}
                          onClick={() =>
                            onUpdateTrack(selectedTrack.id, (prev) => ({ ...prev, colorTag: sw.id }))
                          }
                          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform ${
                            active
                              ? "scale-110 border-foreground"
                              : "border-transparent opacity-70 hover:opacity-100"
                          }`}
                        >
                          <span className={`h-3 w-3 rounded-full ${sw.dotClass}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Exact Time Range Readout */}
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/70 bg-foreground/[0.025] p-2 text-center font-mono text-[10.5px] tabular-nums">
                  <div>
                    <div className="text-[9.5px] text-muted-foreground">Start</div>
                    <div className="mt-0.5 text-foreground">{fmtExactSec(selectedTrack.offsetMs)}</div>
                  </div>
                  <div className="border-x border-border/60">
                    <div className="text-[9.5px] text-muted-foreground">End</div>
                    <div className="mt-0.5 text-foreground">
                      {fmtExactSec(selectedTrack.offsetMs + selectedTrack.durationMs)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9.5px] text-muted-foreground">Length</div>
                    <div className="mt-0.5 text-foreground">{fmtExactSec(selectedTrack.durationMs)}</div>
                  </div>
                </div>

                {/* Clip Actions */}
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canSplitSelected}
                    onClick={() => onSplitClipAtPlayhead(selectedTrack.id)}
                    className="h-8 justify-start gap-1.5 rounded-lg text-[11.5px]"
                  >
                    <Scissors className="size-3.5" />
                    <span>Split here</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDuplicateClip(selectedTrack)}
                    className="h-8 justify-start gap-1.5 rounded-lg text-[11.5px]"
                  >
                    <Copy className="size-3.5" />
                    <span>Duplicate</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={normalizing}
                    onClick={() => onNormalizeClip(selectedTrack)}
                    className="h-8 justify-start gap-1.5 rounded-lg text-[11.5px]"
                  >
                    <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
                    <span>{normalizing ? "Measuring…" : "Normalize"}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDownloadRawTrack(selectedTrack)}
                    className="h-8 justify-start gap-1.5 rounded-lg text-[11.5px]"
                  >
                    <Download className="size-3.5" />
                    <span>Clip WAV</span>
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Non-Destructive Fade Envelopes & Stereo Balance */}
              <div className="space-y-2.5">
                <span className="text-[12px] font-medium text-foreground">Envelope &amp; balance</span>
                <label className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="w-16 text-muted-foreground">Stereo pan</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={selectedTrack.pan}
                    onDoubleClick={() =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({ ...prev, pan: 0 }))
                    }
                    onChange={(e) =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({
                        ...prev,
                        pan: Number(e.target.value),
                      }))
                    }
                    className="studio-range min-w-0 flex-1"
                  />
                  <span className="w-12 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums">
                    {Math.abs(selectedTrack.pan) < 0.04
                      ? "Center"
                      : selectedTrack.pan < 0
                        ? `L ${Math.round(Math.abs(selectedTrack.pan) * 100)}`
                        : `R ${Math.round(selectedTrack.pan * 100)}`}
                  </span>
                </label>

                <label className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="w-16 text-muted-foreground">Fade in</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(3000, Math.round(selectedTrack.durationMs * 0.45))}
                    step={25}
                    value={selectedTrack.fadeInMs ?? 0}
                    onChange={(e) =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({
                        ...prev,
                        fadeInMs: Number(e.target.value),
                      }))
                    }
                    className="studio-range min-w-0 flex-1"
                  />
                  <span className="w-12 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums">
                    {((selectedTrack.fadeInMs ?? 0) / 1000).toFixed(2)}s
                  </span>
                </label>

                <label className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="w-16 text-muted-foreground">Fade out</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(3000, Math.round(selectedTrack.durationMs * 0.45))}
                    step={25}
                    value={selectedTrack.fadeOutMs ?? 0}
                    onChange={(e) =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({
                        ...prev,
                        fadeOutMs: Number(e.target.value),
                      }))
                    }
                    className="studio-range min-w-0 flex-1"
                  />
                  <span className="w-12 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums">
                    {((selectedTrack.fadeOutMs ?? 0) / 1000).toFixed(2)}s
                  </span>
                </label>
              </div>

              <Separator />

              {/* Real-Time Voice DSP Strip (Auditioned live + baked into WAV & Stem Exports) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-foreground">Voice channel DSP</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({
                        ...prev,
                        hpfEnabled: false,
                        compressorEnabled: false,
                        eqLowDb: 0,
                        eqMidDb: 0,
                        eqHighDb: 0,
                      }))
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <div>
                    <div className="font-medium text-foreground">80 Hz High-Pass</div>
                    <div className="text-[11px] text-muted-foreground">Cuts desk thumps &amp; low rumble</div>
                  </div>
                  <Switch
                    checked={Boolean(selectedTrack.hpfEnabled)}
                    onCheckedChange={(checked) =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({ ...prev, hpfEnabled: checked }))
                    }
                    aria-label="Toggle 80 Hz high-pass filter"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <div>
                    <div className="font-medium text-foreground">Broadcast Compressor</div>
                    <div className="text-[11px] text-muted-foreground">Levels speech dynamics evenly</div>
                  </div>
                  <Switch
                    checked={Boolean(selectedTrack.compressorEnabled)}
                    onCheckedChange={(checked) =>
                      onUpdateTrack(selectedTrack.id, (prev) => ({ ...prev, compressorEnabled: checked }))
                    }
                    aria-label="Toggle broadcast voice compressor"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  {(
                    [
                      { key: "eqLowDb", label: "Warmth", freq: "120 Hz" },
                      { key: "eqMidDb", label: "Presence", freq: "2.8 kHz" },
                      { key: "eqHighDb", label: "Air", freq: "8 kHz" },
                    ] as const
                  ).map((band) => {
                    const val = selectedTrack[band.key] ?? 0;
                    return (
                      <label key={band.key} className="flex items-center justify-between gap-2 text-[11.5px]">
                        <span className="w-[68px] shrink-0 text-muted-foreground" title={band.freq}>
                          {band.label}
                        </span>
                        <input
                          type="range"
                          min={-6}
                          max={6}
                          step={0.5}
                          value={val}
                          onDoubleClick={() =>
                            onUpdateTrack(selectedTrack.id, (prev) => ({ ...prev, [band.key]: 0 }))
                          }
                          onChange={(e) =>
                            onUpdateTrack(selectedTrack.id, (prev) => ({
                              ...prev,
                              [band.key]: Number(e.target.value),
                            }))
                          }
                          aria-label={`${band.label} EQ (${band.freq})`}
                          className="studio-range min-w-0 flex-1"
                        />
                        <span className="w-12 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums">
                          {fmtSignedDb(val)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemoveTrack(selectedTrack)}
                className="h-8 w-full justify-center gap-1.5 rounded-lg text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                <span>Delete selected clip</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/75 px-4 py-10 text-center">
              <Gauge className="size-5 text-muted-foreground" />
              <p className="mt-2.5 text-[12.5px] font-medium text-foreground">No clip selected</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                Select any clip on the timeline to adjust fades, normalize volume to -1 dBFS, or apply voice EQ and
                compression.
              </p>
            </div>
          )
        ) : null}

        {tab === "markers" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Select
                value={markerKind}
                onValueChange={(v) => {
                  if (v) onChangeMarkerKind(v as StudioMarkerKind);
                }}
              >
                <SelectTrigger aria-label="Marker type" className="h-8 flex-1 rounded-lg text-[12px]">
                  <SelectValue>{MARKER_KIND_LABELS[markerKind]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(MARKER_KIND_LABELS) as [StudioMarkerKind, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDropMarker}
                className="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-[11.5px]"
              >
                <BookmarkPlus className="size-3.5 text-[color:var(--land-gold)]" />
                <span className="font-mono tabular-nums">{fmtDuration(playheadMs)}</span>
              </Button>
            </div>

            {markers.length === 0 ? (
              <p className="rounded-xl border border-border/70 bg-foreground/[0.02] p-3 text-[12px] leading-relaxed text-muted-foreground">
                Press <kbd className="rounded border border-border px-1 font-mono text-[10.5px]">M</kbd> during capture
                or playback to drop chapter &amp; edit markers synced with your stems.
              </p>
            ) : (
              <div className="space-y-1.5">
                {markers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-xl border border-border/75 bg-foreground/[0.02] px-2.5 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSeek(m.atMs)}
                      className="shrink-0 font-mono text-[11px] font-medium text-[color:var(--land-gold)] tabular-nums hover:underline"
                    >
                      {fmtDuration(m.atMs)}
                    </button>
                    <input
                      type="text"
                      value={m.label}
                      onChange={(e) => onUpdateMarker(m.id, e.target.value)}
                      aria-label={`Marker label at ${fmtDuration(m.atMs)}`}
                      className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteMarker(m.id)}
                      aria-label={`Delete marker ${m.label}`}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === "session" ? (
          <div className="space-y-4">
            <div className="space-y-2.5">
              <span className="text-[12px] font-medium text-foreground">Master &amp; timing</span>

              <label className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted-foreground">Master bus</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={masterGain}
                    onDoubleClick={() => onChangeMasterGain(1)}
                    onChange={(e) => onChangeMasterGain(Number(e.target.value))}
                    className="studio-range w-24"
                  />
                  <span className="w-12 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                    {formatGainDb(masterGain)}
                  </span>
                </div>
              </label>

              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted-foreground">Tempo (BPM)</span>
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={bpm}
                  onChange={(e) => onChangeBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                  aria-label="Session BPM"
                  className="h-8 w-20 rounded-lg border border-border/80 bg-transparent px-2 text-right font-mono text-[12px] text-foreground tabular-nums focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted-foreground">Count-in</span>
                <Select
                  value={String(countInBars)}
                  onValueChange={(v) => {
                    if (v !== null) onChangeCountInBars(Number(v));
                  }}
                >
                  <SelectTrigger aria-label="Session count-in bars" className="h-8 w-24 rounded-lg text-[12px]">
                    <SelectValue>{COUNT_IN_LABELS[String(countInBars)] ?? "1 bar"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COUNT_IN_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted-foreground">Overdub playback</span>
                <Switch
                  checked={overdubEnabled}
                  onCheckedChange={onToggleOverdub}
                  aria-label="Toggle overdub playback while recording"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <label htmlFor="studio-session-notes" className="text-[12px] font-medium text-foreground">
                Show notes &amp; context
              </label>
              <textarea
                id="studio-session-notes"
                value={description}
                onChange={(e) => onChangeDescription(e.target.value)}
                onBlur={onBlurDescription}
                rows={5}
                placeholder="Episode topics, guest notes, sponsor cues, or edit reminders…"
                className="w-full resize-none rounded-xl border border-border/80 bg-foreground/[0.02] p-2.5 text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:border-[color:var(--land-gold)]/70 focus:outline-none"
              />
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenPatchbay}
              className="h-9 w-full justify-center gap-1.5 rounded-xl text-[12px]"
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Open Audio I/O Patchbay</span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
