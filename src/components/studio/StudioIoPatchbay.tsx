"use client";

import { useEffect, useRef } from "react";
import {
  Check,
  Headphones,
  Mic,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Split,
  Trash2,
  Usb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  MAX_STUDIO_INPUTS,
  formatHardwareChannelName,
  type AudioInterfaceDetection,
  type MicDeviceOption,
  type StudioCaptureMode,
} from "@/lib/studio/capture-engine";
import { STUDIO_STEM_COLORS, normalizeStudioColor } from "@/lib/studio/colors";
import type { LiveAudioTelemetry, MicChannelConfig } from "./use-studio-audio";

const MODE_OPTIONS: Array<{
  id: StudioCaptureMode;
  title: string;
  detail: string;
  icon: typeof Mic;
}> = [
  {
    id: "solo",
    title: "Solo",
    detail: "Single microphone",
    icon: Mic,
  },
  {
    id: "multitrack",
    title: "Multitrack USB",
    detail: "Isolated channels (2–8 mics)",
    icon: Sliders,
  },
  {
    id: "stereo-split",
    title: "Stereo L/R Split",
    detail: "Pan Mic 1 Left & Mic 2 Right",
    icon: Split,
  },
  {
    id: "multi-device",
    title: "Multi-USB",
    detail: "Separate audio devices",
    icon: Usb,
  },
];

export function StudioIoPatchbay({
  open,
  onOpenChange,
  captureMode,
  devices,
  audioInterfaces,
  useBroadcastChannelMap,
  selectedDeviceId,
  inputs,
  micReady,
  isRecordingLocked,
  detectedChannels,
  sampleRate,
  studioRawMic,
  monitorInput,
  recordSafetyMix,
  sampleTelemetry,
  onChangeMode,
  onSelectDevice,
  onAddInput,
  onRemoveInput,
  onUpdateInput,
  onToggleRawMic,
  onToggleMonitor,
  onToggleSafetyMix,
  onArmInputs,
  onAutoConfigureMultiMic,
  onRefreshDevices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captureMode: StudioCaptureMode;
  devices: MicDeviceOption[];
  audioInterfaces: AudioInterfaceDetection;
  useBroadcastChannelMap: boolean;
  selectedDeviceId: string;
  inputs: MicChannelConfig[];
  micReady: boolean;
  isRecordingLocked: boolean;
  detectedChannels: number;
  sampleRate: number;
  studioRawMic: boolean;
  monitorInput: boolean;
  recordSafetyMix: boolean;
  sampleTelemetry: () => LiveAudioTelemetry;
  onChangeMode: (mode: StudioCaptureMode) => void;
  onSelectDevice: (id: string) => void;
  onAddInput: () => void;
  onRemoveInput: (id: string) => void;
  onUpdateInput: (id: string, patch: Partial<MicChannelConfig>) => void;
  onToggleRawMic: (next: boolean) => void;
  onToggleMonitor: (next: boolean) => void;
  onToggleSafetyMix: (next: boolean) => void;
  onArmInputs: () => void;
  onAutoConfigureMultiMic: (preferred?: "multitrack" | "stereo-split" | "multi-device") => void;
  onRefreshDevices: () => void;
}) {
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sampleRef = useRef(sampleTelemetry);

  useEffect(() => {
    sampleRef.current = sampleTelemetry;
  }, [sampleTelemetry]);

  useEffect(() => {
    if (!open || !micReady) return;
    let rafId = 0;
    const tick = () => {
      const tel = sampleRef.current();
      const chCount = Math.min(16, Math.max(2, tel.detectedChannels));
      for (let i = 0; i < chCount; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        const level = Math.min(1, tel.rawChannelRms[i] ?? 0);
        el.style.transform = `scaleX(${Math.max(0.015, level).toFixed(3)})`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [open, micReady]);

  const primaryLabel =
    selectedDeviceId === "default"
      ? "System default input"
      : (devices.find((d) => d.deviceId === selectedDeviceId)?.label ?? "System default input");

  const isMultiChannelMatrix = captureMode === "multitrack" || captureMode === "stereo-split";
  const channelSlots = Math.min(16, Math.max(2, detectedChannels));
  const hasExternalHardware = audioInterfaces.externalInputs.length > 0;
  const canAddMore =
    !isRecordingLocked &&
    inputs.length < (captureMode === "stereo-split" ? 2 : MAX_STUDIO_INPUTS);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="dark flex w-[368px] flex-col gap-0 border-white/10 bg-[#08080b] p-0 text-[#f4f4f6] sm:max-w-[432px]"
      >
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div>
              <SheetTitle className="text-[15px] font-medium tracking-[-0.01em]">
                Audio I/O
              </SheetTitle>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                {micReady
                  ? `Live · ${(sampleRate / 1000).toFixed(1)} kHz · ${detectedChannels} ch PCM`
                  : "Inputs standby · Connect hardware to meter channels"}
              </p>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onRefreshDevices}
              aria-label="Rescan audio devices"
              className="h-8 w-8 rounded-full"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Hardware Status & Quick Setup Card (100% generic, brand-free) */}
          <div className="rounded-xl border border-border/80 bg-muted/25 p-3.5">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  micReady
                    ? "bg-[#34d399]"
                    : hasExternalHardware
                      ? "bg-[color:var(--studio-accent)]"
                      : "bg-muted-foreground/45"
                }`}
              />
              <span className="text-[13px] font-medium text-foreground">
                {audioInterfaces.hasMultitrackInterface
                  ? "Multitrack USB interface detected"
                  : hasExternalHardware
                    ? "External USB audio interface detected"
                    : "Single or multi-mic capture"}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {hasExternalHardware
                ? `Available: ${audioInterfaces.externalInputs
                    .slice(0, 3)
                    .map((d) => d.label)
                    .join(", ")}.`
                : "Record solo out of the box, or connect a USB audio interface or multiple microphones for isolated multitrack stems."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isRecordingLocked}
                onClick={() => onArmInputs()}
                className="h-8 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background hover:opacity-90"
              >
                {micReady ? "Reconnect inputs" : "Connect & test mics"}
              </Button>
              {captureMode === "solo" || hasExternalHardware ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRecordingLocked}
                  onClick={() => onAutoConfigureMultiMic()}
                  className="h-8 rounded-full px-3 text-[12px]"
                >
                  Auto-setup multi-mic
                </Button>
              ) : null}
            </div>
          </div>

          {/* Routing Topology */}
          <div className="space-y-2">
            <span className="text-[12px] font-medium text-foreground">Input topology</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Input routing topology">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = captureMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    disabled={isRecordingLocked}
                    aria-checked={active}
                    onClick={() => onChangeMode(opt.id)}
                    className={`flex min-h-[58px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[color:var(--studio-accent)] ${
                      active
                        ? "border-[color:var(--studio-accent)]/70 bg-[color:var(--studio-accent)]/12 text-foreground"
                        : "border-border/75 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                        <Icon className="size-3.5 shrink-0" />
                        <span>{opt.title}</span>
                      </span>
                      {active ? <Check className="size-3.5 shrink-0 text-[color:var(--studio-accent)]" /> : null}
                    </div>
                    <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{opt.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Device Selector (Solo / Multitrack / Stereo Split) */}
          {captureMode !== "multi-device" ? (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Audio interface / microphone</label>
              <Select
                value={selectedDeviceId}
                disabled={isRecordingLocked}
                onValueChange={(v) => v && onSelectDevice(v)}
              >
                <SelectTrigger aria-label="Primary audio device" className="h-9 w-full rounded-lg text-[12.5px]">
                  <SelectValue>{primaryLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System default input</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* Active Microphones List (1..8) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-foreground">
                Active inputs ({inputs.length})
              </span>
              {canAddMore ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onAddInput}
                  className="h-7 gap-1 rounded-full px-2.5 text-[11.5px]"
                >
                  <Plus className="size-3.5" />
                  <span>Add mic</span>
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              {inputs.map((inp, idx) => {
                const devLabel =
                  inp.deviceId === "default"
                    ? "System default input"
                    : (devices.find((d) => d.deviceId === inp.deviceId)?.label ?? "System default input");
                return (
                  <div
                    key={inp.id}
                    className="space-y-2 rounded-xl border border-border/75 bg-card/40 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border/80 font-mono text-[10.5px] font-medium text-foreground">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={inp.label}
                          onChange={(e) => onUpdateInput(inp.id, { label: e.target.value })}
                          aria-label={`Microphone ${idx + 1} label`}
                          className="min-w-0 flex-1 truncate bg-transparent text-[12.5px] font-medium text-foreground focus:outline-none"
                        />
                      </div>

                      {captureMode !== "multi-device" && captureMode !== "solo" ? (
                        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                          {formatHardwareChannelName(inp.channelIndex, useBroadcastChannelMap, detectedChannels)}
                        </span>
                      ) : null}

                      {inputs.length > 1 ? (
                        <button
                          type="button"
                          disabled={isRecordingLocked}
                          onClick={() => onRemoveInput(inp.id)}
                          aria-label={`Remove ${inp.label}`}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>

                    {captureMode === "multi-device" ? (
                      <Select
                        value={inp.deviceId}
                        disabled={isRecordingLocked}
                        onValueChange={(v) => v && onUpdateInput(inp.id, { deviceId: v })}
                      >
                        <SelectTrigger aria-label={`${inp.label} USB device`} className="h-8 w-full rounded-lg text-[12px]">
                          <SelectValue>{devLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">System default input</SelectItem>
                          {devices.map((d) => (
                            <SelectItem key={d.deviceId} value={d.deviceId}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Hardware Channel Matrix & 1-Click Bus Assignment */}
          {isMultiChannelMatrix ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-foreground">
                  Channel patchbay ({channelSlots} ch)
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Tap mic to locate
                </span>
              </div>

              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/75 bg-card/50">
                {Array.from({ length: channelSlots }, (_, chIdx) => (
                  <div
                    key={chIdx}
                    className="flex items-center justify-between gap-2.5 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-foreground">
                        {formatHardwareChannelName(chIdx, useBroadcastChannelMap, channelSlots)}
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                        <div
                          ref={(el) => {
                            barRefs.current[chIdx] = el;
                          }}
                          style={{ transform: "scaleX(0.015)", transformOrigin: "left center" }}
                          className="h-full w-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#f97316_76%,#e12621_100%)] will-change-transform"
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {inputs.map((inp, slotIdx) => {
                        const assigned = inp.channelIndex === chIdx;
                        const activeCls =
                          STUDIO_STEM_COLORS[normalizeStudioColor(inp.colorTag, slotIdx)].patchActiveClass;
                        return (
                          <button
                            key={inp.id}
                            type="button"
                            onClick={() => onUpdateInput(inp.id, { channelIndex: chIdx })}
                            aria-pressed={assigned}
                            aria-label={`Assign channel ${chIdx + 1} to ${inp.label}`}
                            title={`Assign to ${inp.label}`}
                            className={`h-7 min-w-[28px] rounded-md border px-1.5 font-mono text-[10.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[color:var(--studio-accent)] ${
                              assigned
                                ? activeCls
                                : "border-border/70 bg-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {slotIdx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {captureMode === "multitrack" && detectedChannels >= 4
                  ? "Multitrack USB bus active. Each assigned channel records as an isolated, sample-locked 48 kHz WAV stem."
                  : captureMode === "multitrack"
                    ? "Your browser currently sees 2 channels on this endpoint. Enable USB multitrack output on your audio interface for 4+ isolated channels, or pan Mic 1 Left and Mic 2 Right to isolate Ch 1 and Ch 2."
                    : "Stereo L/R Split active. Pan Mic 1 Hard Left and Mic 2 Hard Right on your mixer to capture both voices as isolated centered mono stems."}
              </p>
            </div>
          ) : null}

          <Separator />

          {/* Signal Integrity & Monitoring */}
          <div className="space-y-3.5">
            {captureMode === "multitrack" && detectedChannels >= 4 ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <ShieldCheck className="size-3.5 text-[color:var(--studio-accent)]" />
                    <span>Main Mix safety stem (Ch 1–2)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Records the stereo main bus alongside your isolated microphone stems.
                  </p>
                </div>
                <Switch
                  checked={recordSafetyMix}
                  onCheckedChange={onToggleSafetyMix}
                  aria-label="Record Ch 1-2 Main Mix safety stem"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                  <Radio className="size-3.5 text-muted-foreground" />
                  <span>Raw unprocessed hardware audio</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {captureMode !== "solo"
                    ? "Locked on for multi-mic routing so browser echo cancellation cannot collapse channels to mono."
                    : "Bypasses browser noise suppression to preserve external preamp & interface processing."}
                </p>
              </div>
              <Switch
                checked={captureMode !== "solo" ? true : studioRawMic}
                disabled={captureMode !== "solo"}
                onCheckedChange={onToggleRawMic}
                aria-label="Toggle raw hardware audio"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                  <Headphones className="size-3.5 text-muted-foreground" />
                  <span>Browser headphone monitor</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Keep off when monitoring directly through your audio interface headphones.
                </p>
              </div>
              <Switch
                checked={monitorInput}
                onCheckedChange={onToggleMonitor}
                aria-label="Toggle browser headphone monitoring"
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
