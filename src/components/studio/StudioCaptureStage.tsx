"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  BookmarkPlus,
  Check,
  Headphones,
  Metronome,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatDbReadout,
  formatGainDb,
  formatHardwareChannelName,
  linearToDb,
  type MicDeviceOption,
  type RodeCasterDetection,
  type StudioCaptureMode,
} from "@/lib/studio/capture-engine";
import type {
  ChannelMeterTelemetry,
  LiveAudioTelemetry,
  MicChannelConfig,
  StudioTransportState,
} from "./use-studio-audio";

function formatClockHMSD(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((safe % 1000) / 100);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

function dbToMeterFrac(db: number): number {
  const clamped = Math.max(-48, Math.min(0, db));
  return (clamped + 48) / 48;
}

const DECK_ACCENT = {
  gold: {
    barDark: [240, 181, 74] as const,
    barLight: [184, 120, 16] as const,
    stripe: "bg-[#f0b54a]",
    pillActive: "border-[#f0b54a]/70 bg-[#f0b54a]/15 text-foreground",
  },
  sky: {
    barDark: [56, 189, 248] as const,
    barLight: [2, 132, 199] as const,
    stripe: "bg-[#38bdf8]",
    pillActive: "border-[#38bdf8]/70 bg-[#38bdf8]/15 text-foreground",
  },
};

interface ChannelScopeRefs {
  canvas: HTMLCanvasElement | null;
  rmsBar: HTMLDivElement | null;
  peakTick: HTMLDivElement | null;
  dbText: HTMLSpanElement | null;
  clipBadge: HTMLButtonElement | null;
  history: number[];
  lastSampleAt: number;
}

function createScopeRefs(): ChannelScopeRefs {
  return {
    canvas: null,
    rmsBar: null,
    peakTick: null,
    dbText: null,
    clipBadge: null,
    history: [],
    lastSampleAt: 0,
  };
}

function renderChannelScope(
  scope: ChannelScopeRefs,
  meter: ChannelMeterTelemetry,
  accentRgb: readonly [number, number, number],
  options: {
    nowMs: number;
    isLight: boolean;
    isRec: boolean;
    isArmedAndLive: boolean;
    isMuted: boolean;
    reduceMotion: boolean;
  },
) {
  const { nowMs, isLight, isRec, isArmedAndLive, isMuted, reduceMotion } = options;

  // Update horizontal calibrated dBFS meter & peak hold DOM refs with zero React re-renders
  const effectiveRms = isMuted ? 0 : meter.rms;
  const effectivePeak = isMuted ? 0 : meter.peak;
  const effectiveHold = isMuted ? 0 : meter.peakHold;

  if (scope.rmsBar) {
    const frac = effectiveRms <= 0.0005 ? 0 : dbToMeterFrac(linearToDb(effectiveRms));
    scope.rmsBar.style.transform = `scaleX(${Math.max(0.004, frac).toFixed(3)})`;
  }
  if (scope.peakTick) {
    const holdFrac = effectiveHold <= 0.0005 ? 0 : dbToMeterFrac(linearToDb(effectiveHold));
    scope.peakTick.style.left = `${(holdFrac * 100).toFixed(1)}%`;
    scope.peakTick.style.opacity = holdFrac > 0.02 ? "1" : "0";
  }
  if (scope.dbText) {
    scope.dbText.textContent = formatDbReadout(Math.max(effectiveRms, effectivePeak * 0.85));
  }
  if (scope.clipBadge) {
    scope.clipBadge.dataset.clipped = meter.clipped ? "true" : "false";
  }

  const canvas = scope.canvas;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;

  if ((isRec || (isArmedAndLive && effectiveRms > 0.006)) && nowMs - scope.lastSampleAt >= 36) {
    scope.lastSampleAt = nowMs;
    const instantaneous = isMuted ? 0.012 : Math.min(1, Math.max(0.02, effectiveRms * 1.42 + effectivePeak * 0.3));
    scope.history.push(instantaneous);
    if (scope.history.length > 220) scope.history.shift();
  }

  ctx.clearRect(0, 0, width, height);

  const cx = width * 0.56;
  const cy = height * 0.5;
  const maxBarH = height * 0.42;

  // Precision broadcast reference grid (-12 dB sweet spot & 0 dB center axis)
  ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.065)" : "rgba(255, 255, 255, 0.055)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  const sweetOffset = maxBarH * 0.52;
  ctx.moveTo(0, cy - sweetOffset);
  ctx.lineTo(width, cy - sweetOffset);
  ctx.moveTo(0, cy + sweetOffset);
  ctx.lineTo(width, cy + sweetOffset);
  ctx.stroke();

  const step = 5.5;
  const barW = 2.2;
  const leftCount = Math.max(16, Math.floor((cx - 10) / step));
  const rightCount = Math.max(12, Math.floor((width - cx - 10) / step));
  const [ar, ag, ab] = accentRgb;

  // LEFT OF NEEDLE: Crisp rolling recorded tape amplitude history
  const hist = scope.history;
  for (let i = 0; i < leftCount; i++) {
    const x = cx - 6 - i * step;
    if (x < 6) break;
    const norm = i / leftCount;
    const fade = Math.max(0.14, 1 - Math.pow(norm, 1.55));
    const hasHist = hist.length > 0 && i < hist.length;
    const amp = hasHist
      ? hist[hist.length - 1 - i]!
      : reduceMotion
        ? 0.022
        : 0.022 + 0.01 * Math.sin(nowMs * 0.0018 - i * 0.22);

    const barH = Math.max(2.2, Math.min(maxBarH * 2, amp * maxBarH * 2));
    if (isRec && hasHist && !isMuted) {
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${(0.24 + fade * 0.62).toFixed(3)})`;
    } else {
      ctx.fillStyle = isLight
        ? `rgba(20, 22, 28, ${(0.14 + fade * (hasHist ? 0.54 : 0.16)).toFixed(3)})`
        : `rgba(220, 224, 232, ${(0.12 + fade * (hasHist ? 0.56 : 0.16)).toFixed(3)})`;
    }
    ctx.beginPath();
    ctx.roundRect(x - barW * 0.5, cy - barH * 0.5, barW, barH, barW * 0.5);
    ctx.fill();
  }

  // RIGHT OF NEEDLE: Real-time harmonic response bars in speaker accent color (crimson above -3 dBFS)
  const isHotPeak = effectivePeak > 0.72 && !isMuted;
  for (let i = 0; i < rightCount; i++) {
    const x = cx + 6 + i * step;
    if (x > width - 6) break;
    const norm = i / rightCount;
    const fade = Math.max(0.16, 1 - Math.pow(norm, 1.45));
    const bandIdx = Math.min(meter.bands.length - 1, Math.floor(norm * (meter.bands.length * 0.85)));
    const bandVal = isMuted ? 0 : (meter.bands[bandIdx] ?? 0);
    const liveLevel = isArmedAndLive ? bandVal * 0.76 + effectiveRms * 0.34 : 0.018;
    const amp = Math.max(0.02, liveLevel) * (0.3 + 0.7 * (1 - norm * 0.68));
    const barH = Math.max(2.2, Math.min(maxBarH * 2, amp * maxBarH * 2));

    if (isHotPeak && i < 6) {
      ctx.fillStyle = isLight
        ? `rgba(196, 22, 28, ${(0.55 + fade * 0.35).toFixed(3)})`
        : `rgba(252, 58, 52, ${(0.58 + fade * 0.35).toFixed(3)})`;
    } else if (isMuted) {
      ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.14)" : "rgba(255, 255, 255, 0.14)";
    } else {
      const alpha = (isArmedAndLive ? 0.32 : 0.16) + fade * (isArmedAndLive ? 0.58 : 0.22);
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha.toFixed(3)})`;
    }
    ctx.beginPath();
    ctx.roundRect(x - barW * 0.5, cy - barH * 0.5, barW, barH, barW * 0.5);
    ctx.fill();
  }

  // Precision hairline playhead needle (crisp, zero blur/glow)
  ctx.strokeStyle = isRec
    ? isLight
      ? "#c4161c"
      : "#fc3a34"
    : isLight
      ? "rgba(14, 15, 18, 0.72)"
      : "rgba(244, 244, 246, 0.72)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, 8);
  ctx.lineTo(cx, height - 8);
  ctx.stroke();

  ctx.fillStyle = isRec
    ? isLight
      ? "#c4161c"
      : "#fc3a34"
    : isLight
      ? "#0e0f12"
      : "#f4f4f6";
  ctx.beginPath();
  ctx.arc(cx, 8, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function StudioCaptureStage({
  transport,
  captureMode,
  rodeCaster,
  devices,
  selectedDeviceId,
  mic1,
  mic2,
  micReady,
  micError,
  statusNotice,
  detectedChannels,
  sampleRate,
  countInBeat,
  countInBars,
  bpm,
  metronomeEnabled,
  overdubEnabled,
  monitorInput,
  recordSafetyMix,
  theme,
  sampleTelemetry,
  onChangeMode,
  onUpdateMic1,
  onUpdateMic2,
  onArmInputs,
  onApplyRodeCasterPreset,
  onClearClipIndicators,
  onOpenPatchbay,
  onStartRecord,
  onPauseRecord,
  onResumeRecord,
  onStopRecord,
  onDiscardRecord,
  onToggleMetronome,
  onCycleCountIn,
  onToggleOverdub,
  onToggleMonitor,
  onDropMarker,
}: {
  transport: StudioTransportState;
  captureMode: StudioCaptureMode;
  rodeCaster: RodeCasterDetection;
  devices: MicDeviceOption[];
  selectedDeviceId: string;
  mic1: MicChannelConfig;
  mic2: MicChannelConfig;
  micReady: boolean;
  micError: string | null;
  statusNotice: string | null;
  detectedChannels: number;
  sampleRate: number;
  countInBeat: number | null;
  countInBars: number;
  bpm: number;
  metronomeEnabled: boolean;
  overdubEnabled: boolean;
  monitorInput: boolean;
  recordSafetyMix: boolean;
  theme: "dark" | "light";
  sampleTelemetry: () => LiveAudioTelemetry;
  onChangeMode: (mode: StudioCaptureMode) => void;
  onUpdateMic1: (patch: Partial<MicChannelConfig>) => void;
  onUpdateMic2: (patch: Partial<MicChannelConfig>) => void;
  onArmInputs: () => void;
  onApplyRodeCasterPreset: () => void;
  onClearClipIndicators: () => void;
  onOpenPatchbay: () => void;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onResumeRecord: () => void;
  onStopRecord: () => void;
  onDiscardRecord: () => void;
  onToggleMetronome: () => void;
  onCycleCountIn: () => void;
  onToggleOverdub: () => void;
  onToggleMonitor: (next: boolean) => void;
  onDropMarker: () => void;
}) {
  const timerRef = useRef<HTMLSpanElement>(null);
  const mic1ScopeRef = useRef<ChannelScopeRefs>(createScopeRefs());
  const mic2ScopeRef = useRef<ChannelScopeRefs>(createScopeRefs());

  const stateRef = useRef({
    transport,
    captureMode,
    micReady,
    mic1,
    mic2,
    theme,
    sampleTelemetry,
  });

  useEffect(() => {
    stateRef.current = {
      transport,
      captureMode,
      micReady,
      mic1,
      mic2,
      theme,
      sampleTelemetry,
    };
  }, [captureMode, mic1, mic2, micReady, sampleTelemetry, theme, transport]);

  useEffect(() => {
    if (transport === "idle") {
      mic1ScopeRef.current.lastSampleAt = 0;
      mic2ScopeRef.current.lastSampleAt = 0;
    }
  }, [transport]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId = 0;
    let lastReducedDraw = 0;

    const tick = (nowMs: number) => {
      if (reduceMotion && nowMs - lastReducedDraw < 90) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastReducedDraw = nowMs;

      const s = stateRef.current;
      const tel = s.sampleTelemetry();
      const isLight = s.theme === "light";
      const isRec = s.transport === "recording";
      const isLive = s.micReady || isRec || s.transport === "counting-in";

      if (timerRef.current) {
        timerRef.current.textContent = formatClockHMSD(tel.recordingProgressMs);
      }

      renderChannelScope(
        mic1ScopeRef.current,
        tel.mic1,
        isLight ? DECK_ACCENT.gold.barLight : DECK_ACCENT.gold.barDark,
        {
          nowMs,
          isLight,
          isRec: isRec && s.mic1.armed,
          isArmedAndLive: isLive && (s.captureMode === "single" || s.mic1.armed),
          isMuted: s.mic1.muted,
          reduceMotion,
        },
      );

      if (s.captureMode !== "single") {
        renderChannelScope(
          mic2ScopeRef.current,
          tel.mic2,
          isLight ? DECK_ACCENT.sky.barLight : DECK_ACCENT.sky.barDark,
          {
            nowMs,
            isLight,
            isRec: isRec && s.mic2.armed,
            isArmedAndLive: isLive && s.mic2.armed,
            isMuted: s.mic2.muted,
            reduceMotion,
          },
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const isDualMic = captureMode !== "single";
  const isRecording = transport === "recording";
  const isPaused = transport === "paused";
  const isCounting = transport === "counting-in";
  const isActiveTake = isRecording || isPaused || isCounting;
  const isRodeMultitrack = captureMode === "rcp2-multitrack" && detectedChannels >= 4;

  const armedStemCount = isDualMic
    ? (mic1.armed ? 1 : 0) + (mic2.armed ? 1 : 0) + (recordSafetyMix && isRodeMultitrack ? 1 : 0)
    : 1;

  const activeDeviceName =
    selectedDeviceId === "default"
      ? rodeCaster.detected
        ? rodeCaster.allMatches[0]!.label
        : "System default audio"
      : (devices.find((d) => d.deviceId === selectedDeviceId)?.label ?? "Audio interface");

  const modeSummaryLabel =
    captureMode === "rcp2-multitrack"
      ? detectedChannels >= 4
        ? "RCP II Multitrack"
        : "RCP II · 2-Ch USB"
      : captureMode === "stereo-split"
        ? "Stereo L/R Split"
        : captureMode === "dual-device"
          ? "Dual USB Inputs"
          : "Solo Mic";

  const mic1SourceTag =
    captureMode === "single"
      ? activeDeviceName
      : captureMode === "dual-device"
        ? devices.find((d) => d.deviceId === mic1.deviceId)?.label ?? "USB Input 1"
        : formatHardwareChannelName(mic1.channelIndex, isRodeMultitrack, detectedChannels);

  const mic2SourceTag =
    captureMode === "dual-device"
      ? devices.find((d) => d.deviceId === mic2.deviceId)?.label ?? "USB Input 2"
      : formatHardwareChannelName(mic2.channelIndex, isRodeMultitrack, detectedChannels);

  function renderDeck(
    slot: "mic1" | "mic2",
    cfg: MicChannelConfig,
    onUpdate: (patch: Partial<MicChannelConfig>) => void,
    sourceTag: string,
    scopeRef: RefObject<ChannelScopeRefs>,
    singleWide: boolean,
  ) {
    const accent = slot === "mic1" ? DECK_ACCENT.gold : DECK_ACCENT.sky;
    const deckRecording = isRecording && (singleWide || cfg.armed);

    return (
      <div
        data-recording={deckRecording ? "true" : "false"}
        data-armed={singleWide || cfg.armed ? "true" : "false"}
        className="studio-mic-deck flex flex-col gap-3 rounded-[20px] border border-border/80 p-3.5 transition-colors sm:p-4"
      >
        {/* Deck Header: Accent Stripe + Editable Speaker Label + Hardware Bus Pill + Arm Toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className={`h-7 w-1 shrink-0 rounded-full ${accent.stripe}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={cfg.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                aria-label={slot === "mic1" ? "Microphone 1 track name" : "Microphone 2 track name"}
                className="w-full truncate rounded-md bg-transparent px-1 py-0.5 text-[14px] font-medium tracking-[-0.01em] text-foreground transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.06] focus:outline-none"
              />
              <button
                type="button"
                onClick={onOpenPatchbay}
                className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md px-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="truncate">{sourceTag}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">Remap</span>
              </button>
            </div>
          </div>

          {!singleWide ? (
            <button
              type="button"
              disabled={isActiveTake}
              onClick={() => onUpdate({ armed: !cfg.armed })}
              aria-pressed={cfg.armed}
              aria-label={`Arm ${cfg.label} for recording`}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors disabled:opacity-50 ${
                cfg.armed
                  ? accent.pillActive
                  : "border-border/75 bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  deckRecording
                    ? "bg-[#fc3a34]"
                    : cfg.armed
                      ? accent.stripe
                      : "bg-muted-foreground/40"
                }`}
                aria-hidden
              />
              <span>{cfg.armed ? "Armed" : "Off"}</span>
            </button>
          ) : (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/75 px-2.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {(sampleRate / 1000).toFixed(1)} kHz PCM
            </span>
          )}
        </div>

        {/* Live Precision Acoustic Tape Oscilloscope */}
        <div className="studio-scope-well relative overflow-hidden rounded-[14px] border border-border/70">
          <canvas
            ref={(el) => {
              scopeRef.current.canvas = el;
            }}
            onClick={() => {
              if (!micReady && transport === "idle") onArmInputs();
            }}
            className={`block w-full cursor-pointer ${singleWide ? "h-[188px] sm:h-[224px]" : "h-[146px] sm:h-[172px]"}`}
            aria-label={`${cfg.label} live audio waveform oscilloscope`}
          />
          {!micReady && transport === "idle" ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full border border-border/80 bg-background/85 px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground backdrop-blur-md">
                Click to connect &amp; meter {slot === "mic1" && !singleWide ? "both mics" : "input"}
              </span>
            </div>
          ) : null}
          {cfg.muted ? (
            <div className="pointer-events-none absolute right-2.5 top-2.5 rounded-full border border-destructive/40 bg-destructive/15 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-destructive">
              Muted
            </div>
          ) : null}
        </div>

        {/* Calibrated Horizontal dBFS Peak-Hold Meter */}
        <div className="flex items-center gap-2.5">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.09]">
            <div
              ref={(el) => {
                scopeRef.current.rmsBar = el;
              }}
              style={{ transform: "scaleX(0.004)", transformOrigin: "left center" }}
              className="h-full w-full rounded-full bg-[linear-gradient(90deg,#34d399_0%,#34d399_68%,#f0b54a_84%,#fc3a34_96%)] will-change-transform"
            />
            {/* -12 dB broadcast target tick & Peak-Hold marker */}
            <span
              className="pointer-events-none absolute inset-y-0 left-[75%] w-px bg-foreground/25"
              title="-12 dBFS target"
              aria-hidden
            />
            <div
              ref={(el) => {
                scopeRef.current.peakTick = el;
              }}
              style={{ left: "0%", opacity: 0 }}
              className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-foreground"
            />
          </div>

          <span
            ref={(el) => {
              scopeRef.current.dbText = el;
            }}
            className="w-[58px] shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums"
          >
            -∞ dB
          </span>

          <button
            ref={(el) => {
              scopeRef.current.clipBadge = el;
            }}
            type="button"
            data-clipped="false"
            onClick={onClearClipIndicators}
            title="Click to reset clip indicator"
            className="studio-clip-badge h-5 rounded px-1.5 font-mono text-[10px] font-semibold tracking-tight transition-colors"
          >
            CLIP
          </button>
        </div>

        {/* Channel Strip Controls: Mute, 80 Hz HPF, Phase Invert, Input Trim Gain */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={cfg.muted ? "destructive" : "outline"}
                    onClick={() => onUpdate({ muted: !cfg.muted })}
                    aria-pressed={cfg.muted}
                    aria-label={`${cfg.muted ? "Unmute" : "Mute"} ${cfg.label}`}
                    className="h-8 gap-1 rounded-lg px-2.5 text-[11.5px]"
                  >
                    {cfg.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                    <span>Mute</span>
                  </Button>
                }
              />
              <TooltipContent side="top">Mute input feed on this channel</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={cfg.hpf ? "secondary" : "outline"}
                    onClick={() => onUpdate({ hpf: !cfg.hpf })}
                    aria-pressed={cfg.hpf}
                    className="h-8 rounded-lg px-2.5 font-mono text-[11px]"
                  >
                    80 Hz
                  </Button>
                }
              />
              <TooltipContent side="top">80 Hz high-pass filter removes desk &amp; room rumble</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={cfg.invertPhase ? "secondary" : "outline"}
                    onClick={() => onUpdate({ invertPhase: !cfg.invertPhase })}
                    aria-pressed={cfg.invertPhase}
                    aria-label={`Invert polarity on ${cfg.label}`}
                    className="h-8 w-8 rounded-lg p-0 font-mono text-[12px]"
                  >
                    Ø
                  </Button>
                }
              />
              <TooltipContent side="top">Invert polarity (fixes phase hollowness on 2-mic desk setups)</TooltipContent>
            </Tooltip>
          </div>

          <label className="flex min-w-[148px] flex-1 items-center justify-end gap-2 sm:flex-initial">
            <span className="text-[11.5px] text-muted-foreground">Trim</span>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={cfg.gain}
              onChange={(e) => onUpdate({ gain: Number(e.target.value) })}
              aria-label={`${cfg.label} digital trim gain`}
              className="studio-range w-24 sm:w-28"
            />
            <span className="w-[50px] text-right font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatGainDb(cfg.gain)}
            </span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Nexus Dual-Mic Capture Stage"
      className="studio-capture-stage relative flex h-full w-full flex-col justify-between overflow-y-auto px-4 pb-6 pt-4 sm:px-6"
    >
      {/* Top Hardware & Mode Bar */}
      <div className="mx-auto flex w-full max-w-[1220px] shrink-0 flex-wrap items-center justify-between gap-2.5">
        {/* Quick Topology Switch: 2-Mic RØDECaster vs Solo */}
        <div
          className="inline-flex items-center rounded-full border border-border/80 bg-card/70 p-0.5"
          role="group"
          aria-label="Microphone layout"
        >
          <button
            type="button"
            disabled={isActiveTake}
            onClick={() => {
              if (!isDualMic) onChangeMode(rodeCaster.multitrackDevice ? "rcp2-multitrack" : "rcp2-multitrack");
            }}
            aria-pressed={isDualMic}
            className={`h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
              isDualMic
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            2-Mic Console
          </button>
          <button
            type="button"
            disabled={isActiveTake}
            onClick={() => onChangeMode("single")}
            aria-pressed={!isDualMic}
            className={`h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
              !isDualMic
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Solo Mic
          </button>
        </div>

        {/* Live Hardware Status Pill + One-Click RØDECaster Pro II Auto-Setup */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPatchbay}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3.5 text-[12px] transition-colors hover:border-border hover:bg-card"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                micReady
                  ? "bg-[#34d399]"
                  : rodeCaster.detected
                    ? "bg-[#f0b54a]"
                    : "bg-muted-foreground/45"
              }`}
              aria-hidden
            />
            <span className="max-w-[190px] truncate font-medium text-foreground">
              {rodeCaster.detected ? "RØDECaster Pro II" : activeDeviceName}
            </span>
            <span className="hidden font-mono text-[11px] text-muted-foreground tabular-nums sm:inline">
              · {modeSummaryLabel}
              {micReady ? ` · ${(sampleRate / 1000).toFixed(1)} kHz · ${detectedChannels} ch` : ""}
            </span>
          </button>

          {isDualMic && (!micReady || rodeCaster.detected) ? (
            <Button
              type="button"
              size="sm"
              variant={rodeCaster.detected && !micReady ? "default" : "outline"}
              disabled={isActiveTake}
              onClick={onApplyRodeCasterPreset}
              className="h-9 gap-1.5 rounded-full px-3.5 text-[12px]"
            >
              {micReady && rodeCaster.detected ? (
                <Check className="size-3.5 text-[#34d399]" />
              ) : (
                <Radio className="size-3.5 text-[color:var(--land-gold)]" />
              )}
              <span>{rodeCaster.detected ? "RCP II Auto-Setup" : "2-Mic RCP II Preset"}</span>
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenPatchbay}
            className="h-9 gap-1.5 rounded-full px-3.5 text-[12px]"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>I/O Patchbay</span>
          </Button>
        </div>
      </div>

      {/* Center Acoustic Console Stage */}
      <div className="mx-auto my-auto flex w-full max-w-[1220px] flex-col items-center justify-center gap-4 py-5">
        {micError ? (
          <div
            role="alert"
            className="w-full max-w-[760px] rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-center text-[12.5px] text-destructive"
          >
            {micError}
          </div>
        ) : statusNotice ? (
          <div
            role="status"
            className="rounded-full border border-border/80 bg-card/85 px-4 py-1.5 text-[12px] text-foreground"
          >
            {statusNotice}
          </div>
        ) : null}

        <div className="relative w-full">
          {isDualMic ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {renderDeck("mic1", mic1, onUpdateMic1, mic1SourceTag, mic1ScopeRef, false)}
              {renderDeck("mic2", mic2, onUpdateMic2, mic2SourceTag, mic2ScopeRef, false)}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[920px]">
              {renderDeck("mic1", mic1, onUpdateMic1, mic1SourceTag, mic1ScopeRef, true)}
            </div>
          )}

          {isCounting && countInBeat !== null ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="studio-glass-dock flex h-24 w-24 flex-col items-center justify-center rounded-full border border-border">
                <span className="font-mono text-[2.25rem] font-semibold leading-none text-[#fc3a34] tabular-nums">
                  {countInBeat}
                </span>
                <span className="mt-1 text-[11px] font-medium text-muted-foreground">Count-in</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom Floating Apple Liquid Glass Transport Dock */}
      <footer className="mx-auto flex w-full max-w-[1040px] shrink-0 justify-center pt-1">
        <div className="studio-glass-dock flex w-full flex-wrap items-center justify-between gap-3 rounded-[26px] px-4 py-2.5 sm:flex-nowrap sm:rounded-full sm:px-5">
          {/* Left: Precision Monospace Timecode + Live Stem Count */}
          <div className="flex min-w-0 items-center gap-3">
            <span
              ref={timerRef}
              className="font-mono text-[1.25rem] font-medium tracking-[-0.02em] text-foreground tabular-nums sm:text-[1.4rem]"
            >
              00:00:00.0
            </span>
            <span className="hidden h-5 w-px bg-border/80 sm:block" aria-hidden />
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              {isRecording
                ? `Recording · ${armedStemCount} ${armedStemCount === 1 ? "stem" : "stems"}`
                : isPaused
                  ? "Take paused"
                  : micReady
                    ? isDualMic
                      ? `Ready · ${armedStemCount} armed`
                      : "Mic live"
                    : "Standby"}
            </span>
          </div>

          {/* Center: Ergonomic 44px Primary Transport Controls */}
          <div className="flex items-center gap-2">
            {isActiveTake ? (
              <>
                {!isCounting ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={isRecording ? onPauseRecord : onResumeRecord}
                    aria-label={isRecording ? "Pause recording" : "Resume recording"}
                    className="h-11 w-11 rounded-full p-0"
                  >
                    {isRecording ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </Button>
                ) : null}

                <button
                  type="button"
                  onClick={onStopRecord}
                  aria-label="Stop and keep take"
                  className="studio-capture-stop-btn inline-flex h-11 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-colors"
                >
                  <Square className="size-3.5 fill-current" />
                  <span>Stop &amp; Keep</span>
                </button>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={onDiscardRecord}
                        aria-label="Discard current take"
                        className="h-11 w-11 rounded-full p-0 text-muted-foreground hover:text-destructive"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent side="top">Discard in-progress take</TooltipContent>
                </Tooltip>

                {!isCounting ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onDropMarker}
                          aria-label="Drop timeline marker (M)"
                          className="h-11 gap-1.5 rounded-full px-3.5 text-[12px]"
                        >
                          <BookmarkPlus className="size-4 text-[color:var(--land-gold)]" />
                          <span className="hidden sm:inline">Marker</span>
                        </Button>
                      }
                    />
                    <TooltipContent side="top">Drop marker at current timestamp (M)</TooltipContent>
                  </Tooltip>
                ) : null}
              </>
            ) : (
              <>
                {!micReady ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onArmInputs}
                    className="h-11 gap-1.5 rounded-full px-4 text-[12.5px]"
                  >
                    <Mic className="size-4" />
                    <span>Connect Mics</span>
                  </Button>
                ) : null}

                <button
                  type="button"
                  onClick={onStartRecord}
                  aria-label={isDualMic ? "Start 2-mic recording (R)" : "Start recording (R)"}
                  className="studio-capture-rec-btn inline-flex h-11 items-center gap-2.5 rounded-full px-5 text-[13px] font-medium transition-transform active:scale-[0.98]"
                >
                  <span className="studio-capture-rec-dot" aria-hidden />
                  <span>{isDualMic ? "Record 2 Mics" : "Record"}</span>
                </button>
              </>
            )}
          </div>

          {/* Right: Compact Session Aids (Click, Count-in, Overdub, Monitor) */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={metronomeEnabled ? "secondary" : "ghost"}
                    onClick={onToggleMetronome}
                    aria-pressed={metronomeEnabled}
                    aria-label="Toggle click metronome"
                    className="h-9 gap-1.5 rounded-full px-2.5 text-[12px]"
                  >
                    <Metronome className="size-3.5" />
                    <span className="hidden font-mono text-[11px] tabular-nums md:inline">{bpm}</span>
                  </Button>
                }
              />
              <TooltipContent side="top">Metronome click ({bpm} BPM)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={countInBars > 0 ? "secondary" : "ghost"}
                    onClick={onCycleCountIn}
                    aria-label="Cycle count-in bars"
                    className="h-9 rounded-full px-2.5 font-mono text-[11px] tabular-nums"
                  >
                    {countInBars === 0 ? "0 bar" : `${countInBars} bar`}
                  </Button>
                }
              />
              <TooltipContent side="top">Count-in before capture (Off / 1 bar / 2 bars)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={overdubEnabled ? "secondary" : "ghost"}
                    onClick={onToggleOverdub}
                    aria-pressed={overdubEnabled}
                    className="hidden h-9 rounded-full px-2.5 text-[11.5px] lg:inline-flex"
                  >
                    Overdub
                  </Button>
                }
              />
              <TooltipContent side="top">Play existing timeline layers while recording new takes</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={monitorInput ? "secondary" : "ghost"}
                    onClick={() => onToggleMonitor(!monitorInput)}
                    aria-pressed={monitorInput}
                    aria-label="Toggle browser headphone monitoring"
                    className="h-9 w-9 rounded-full"
                  >
                    {monitorInput ? (
                      <Headphones className="size-4 text-[color:var(--land-gold)]" />
                    ) : (
                      <MicOff className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                }
              />
              <TooltipContent side="top">
                {monitorInput
                  ? "Browser headphone monitor ON (turn off if monitoring via RØDECaster Pro II)"
                  : "Browser monitor OFF (recommended for RØDECaster direct headphone monitoring)"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </footer>
    </section>
  );
}
