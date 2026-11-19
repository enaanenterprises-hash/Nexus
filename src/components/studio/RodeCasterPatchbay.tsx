"use client";

import { useEffect, useRef } from "react";
import {
  Check,
  Headphones,
  Mic,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Split,
  Usb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  formatHardwareChannelName,
  type MicDeviceOption,
  type RodeCasterDetection,
  type StudioCaptureMode,
} from "@/lib/studio/capture-engine";
import type { LiveAudioTelemetry, MicChannelConfig } from "./use-studio-audio";

const MODE_OPTIONS: Array<{
  id: StudioCaptureMode;
  title: string;
  detail: string;
  icon: typeof Sliders;
}> = [
  {
    id: "rcp2-multitrack",
    title: "RCP II Multitrack",
    detail: "Isolated Ch 3 & Ch 4 over USB1",
    icon: Sliders,
  },
  {
    id: "stereo-split",
    title: "Stereo L/R Split",
    detail: "Pan Mic 1 Left & Mic 2 Right",
    icon: Split,
  },
  {
    id: "dual-device",
    title: "Dual USB Inputs",
    detail: "Two separate audio devices",
    icon: Usb,
  },
  {
    id: "single",
    title: "Solo Mic",
    detail: "Single microphone capture",
    icon: Mic,
  },
];

export function RodeCasterPatchbay({
  open,
  onOpenChange,
  captureMode,
  devices,
  rodeCaster,
  selectedDeviceId,
  mic1,
  mic2,
  micReady,
  detectedChannels,
  sampleRate,
  studioRawMic,
  monitorInput,
  recordSafetyMix,
  sampleTelemetry,
  onChangeMode,
  onSelectDevice,
  onUpdateMic1,
  onUpdateMic2,
  onToggleRawMic,
  onToggleMonitor,
  onToggleSafetyMix,
  onArmInputs,
  onApplyRodeCasterPreset,
  onRefreshDevices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captureMode: StudioCaptureMode;
  devices: MicDeviceOption[];
  rodeCaster: RodeCasterDetection;
  selectedDeviceId: string;
  mic1: MicChannelConfig;
  mic2: MicChannelConfig;
  micReady: boolean;
  detectedChannels: number;
  sampleRate: number;
  studioRawMic: boolean;
  monitorInput: boolean;
  recordSafetyMix: boolean;
  sampleTelemetry: () => LiveAudioTelemetry;
  onChangeMode: (mode: StudioCaptureMode) => void;
  onSelectDevice: (id: string) => void;
  onUpdateMic1: (patch: Partial<MicChannelConfig>) => void;
  onUpdateMic2: (patch: Partial<MicChannelConfig>) => void;
  onToggleRawMic: (next: boolean) => void;
  onToggleMonitor: (next: boolean) => void;
  onToggleSafetyMix: (next: boolean) => void;
  onArmInputs: () => void;
  onApplyRodeCasterPreset: (preferred?: "rcp2-multitrack" | "stereo-split" | "dual-device") => void;
  onRefreshDevices: () => void;
}) {
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sampleRef = useRef(sampleTelemetry);

  useEffect(() => {
    sampleRef.current = sampleTelemetry;
  }, [sampleTelemetry]);

  // Animate live per-channel signal bars inside the patchbay at 60fps only while the sheet is open
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
  const mic1DevLabel =
    mic1.deviceId === "default"
      ? "System default input"
      : (devices.find((d) => d.deviceId === mic1.deviceId)?.label ?? "System default input");
  const mic2DevLabel =
    mic2.deviceId === "default"
      ? "System default input"
      : (devices.find((d) => d.deviceId === mic2.deviceId)?.label ?? "System default input");

  const isMultiChannelMatrix = captureMode === "rcp2-multitrack" || captureMode === "stereo-split";
  const channelSlots = Math.min(16, Math.max(2, detectedChannels));
  const isRodeMultitrack = captureMode === "rcp2-multitrack" && detectedChannels >= 4;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[360px] flex-col gap-0 p-0 sm:max-w-[420px]"
      >
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div>
              <SheetTitle className="text-[15px] font-medium tracking-[-0.01em]">
                Audio Hardware &amp; Routing
              </SheetTitle>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                {micReady
                  ? `Live · ${(sampleRate / 1000).toFixed(1)} kHz · ${detectedChannels} ch PCM`
                  : "Inputs idle · Connect hardware to meter channels"}
              </p>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onRefreshDevices}
              aria-label="Rescan USB audio devices"
              className="h-8 w-8 rounded-full"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* RØDECaster Pro II Hardware Banner */}
          <div className="rounded-xl border border-border/80 bg-muted/25 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      rodeCaster.detected ? "bg-[#4ade80]" : "bg-[color:var(--land-gold)]"
                    }`}
                  />
                  <span className="text-[13px] font-medium text-foreground">
                    {rodeCaster.detected ? "RØDECaster Pro II connected" : "RØDECaster Pro II workflow"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {rodeCaster.detected
                    ? `Found ${rodeCaster.allMatches.map((d) => d.label).join(", ")}.`
                    : "Plug in via USB-C and click Connect to auto-configure raw 48 kHz dual-mic isolation."}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onApplyRodeCasterPreset()}
                className="h-8 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background hover:opacity-90"
              >
                {micReady && rodeCaster.detected ? "Re-arm RØDECaster Pro II" : "Auto-Setup 2-Mic RCP II"}
              </Button>
              {!micReady ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onArmInputs}
                  className="h-8 rounded-full px-3 text-[12px]"
                >
                  Connect &amp; Test Mics
                </Button>
              ) : null}
            </div>
          </div>

          {/* 4 Capture Topologies */}
          <div className="space-y-2">
            <span className="text-[12px] font-medium text-foreground">Capture routing mode</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Capture routing mode">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = captureMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChangeMode(opt.id)}
                    className={`flex min-h-[60px] flex-col items-start justify-center rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[color:var(--land-gold)] ${
                      active
                        ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/10 text-foreground"
                        : "border-border/75 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                        <Icon className="size-3.5 shrink-0" />
                        <span>{opt.title}</span>
                      </span>
                      {active ? <Check className="size-3.5 shrink-0 text-[color:var(--land-gold)]" /> : null}
                    </div>
                    <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{opt.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* USB Device Selector(s) */}
          {captureMode === "dual-device" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground">Mic 1 (Host) device</label>
                <Select value={mic1.deviceId} onValueChange={(v) => v && onUpdateMic1({ deviceId: v })}>
                  <SelectTrigger aria-label="Mic 1 audio device" className="h-9 w-full rounded-lg text-[12.5px]">
                    <SelectValue>{mic1DevLabel}</SelectValue>
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
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground">Mic 2 (Guest) device</label>
                <Select value={mic2.deviceId} onValueChange={(v) => v && onUpdateMic2({ deviceId: v })}>
                  <SelectTrigger aria-label="Mic 2 audio device" className="h-9 w-full rounded-lg text-[12.5px]">
                    <SelectValue>{mic2DevLabel}</SelectValue>
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
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">Audio interface / microphone</label>
              <Select value={selectedDeviceId} onValueChange={(v) => v && onSelectDevice(v)}>
                <SelectTrigger aria-label="Primary audio interface" className="h-9 w-full rounded-lg text-[12.5px]">
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
          )}

          {/* Live Hardware Channel Activity Matrix & Patching */}
          {isMultiChannelMatrix ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-foreground">
                  Hardware channel patchbay ({channelSlots} ch)
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  Tap mic to identify
                </span>
              </div>

              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/75 bg-card/50">
                {Array.from({ length: channelSlots }, (_, chIdx) => {
                  const isMic1 = mic1.channelIndex === chIdx;
                  const isMic2 = mic2.channelIndex === chIdx;
                  return (
                    <div
                      key={chIdx}
                      className="flex items-center justify-between gap-2.5 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-foreground">
                          {formatHardwareChannelName(chIdx, isRodeMultitrack, channelSlots)}
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            ref={(el) => {
                              barRefs.current[chIdx] = el;
                            }}
                            style={{ transform: "scaleX(0.015)", transformOrigin: "left center" }}
                            className="h-full w-full rounded-full bg-[linear-gradient(90deg,#34d399_0%,#f0b54a_72%,#ef4444_100%)] will-change-transform"
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onUpdateMic1({ channelIndex: chIdx })}
                          aria-pressed={isMic1}
                          aria-label={`Assign channel ${chIdx + 1} to Mic 1`}
                          className={`h-7 min-w-[34px] rounded-md border px-2 font-mono text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[color:var(--land-gold)] ${
                            isMic1
                              ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/20 text-foreground"
                              : "border-border/70 bg-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          M1
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateMic2({ channelIndex: chIdx })}
                          aria-pressed={isMic2}
                          aria-label={`Assign channel ${chIdx + 1} to Mic 2`}
                          className={`h-7 min-w-[34px] rounded-md border px-2 font-mono text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[color:var(--land-gold)] ${
                            isMic2
                              ? "border-[#94b2d0] bg-[#94b2d0]/20 text-foreground"
                              : "border-border/70 bg-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          M2
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {captureMode === "rcp2-multitrack" && detectedChannels >= 4
                  ? "Multitrack bus active. Combo 1 (Ch 3) and Combo 2 (Ch 4) capture as isolated, sample-locked 48 kHz WAV tracks."
                  : captureMode === "rcp2-multitrack"
                    ? "Your OS/browser currently exposed 2 channels from this endpoint. On the RØDECaster Pro II, enable USB Multitrack (Settings → Outputs → Multitrack → USB) for Ch 3/4, or pan Mic 1 Hard Left & Mic 2 Hard Right to split Ch 1 & Ch 2 cleanly."
                    : "Stereo L/R Split active. Pan Mic 1 Hard Left (L) and Mic 2 Hard Right (R) on your RØDECaster Pro II — both mics will record as centered, isolated mono tracks."}
              </p>
            </div>
          ) : null}

          <Separator />

          {/* Signal Integrity & Monitoring Controls */}
          <div className="space-y-3.5">
            {captureMode === "rcp2-multitrack" && detectedChannels >= 4 ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <ShieldCheck className="size-3.5 text-[color:var(--land-gold)]" />
                    <span>Main Mix safety stem (Ch 1–2)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Records the RCP II stereo main mix alongside isolated Mic 1 &amp; Mic 2.
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
                  {captureMode !== "single"
                    ? "Locked on in 2-Mic mode so browser AEC cannot collapse channels to mono."
                    : "Bypasses browser noise suppression to preserve RØDECaster Aphex DSP."}
                </p>
              </div>
              <Switch
                checked={captureMode !== "single" ? true : studioRawMic}
                disabled={captureMode !== "single"}
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
                  Keep off when monitoring directly through RØDECaster Pro II headphone outputs.
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
