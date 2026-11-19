"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  Headphones,
  Metronome,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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

function formatStageClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((safe % 1000) / 100);
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

function dbToMeterFrac(db: number): number {
  const clamped = Math.max(-48, Math.min(0, db));
  return (clamped + 48) / 48;
}

/**
 * Draws one ultra-crisp, borderless acoustic tape ribbon onto the shared stage canvas.
 * Left of needle: delicate rolling history trace.
 * Right of needle: live harmonic voice response.
 * Zero canvas shadowBlur, zero glow halos — pure hairline optical craft.
 */
function drawAcousticTrack(
  ctx: CanvasRenderingContext2D,
  meter: ChannelMeterTelemetry,
  history: number[],
  options: {
    width: number;
    cy: number;
    maxBarH: number;
    cx: number;
    accentRgb: readonly [number, number, number];
    isLight: boolean;
    isRec: boolean;
    isLive: boolean;
    isMuted: boolean;
    nowMs: number;
    reduceMotion: boolean;
    label?: string;
    showBaseline?: boolean;
  },
) {
  const {
    width,
    cy,
    maxBarH,
    cx,
    accentRgb,
    isLight,
    isRec,
    isLive,
    isMuted,
    nowMs,
    reduceMotion,
    label,
    showBaseline,
  } = options;

  const [ar, ag, ab] = accentRgb;
  const effectiveRms = isMuted ? 0 : meter.rms;
  const effectivePeak = isMuted ? 0 : meter.peak;

  // Hairline acoustic datum rule + calibrated rangefinder ticks
  if (showBaseline) {
    ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.075)" : "rgba(255, 255, 255, 0.065)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.stroke();

    const tickStep = 28;
    ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.06)" : "rgba(255, 255, 255, 0.055)";
    ctx.beginPath();
    for (let x = cx % tickStep; x < width; x += tickStep) {
      const major = Math.abs(Math.round((x - cx) / tickStep)) % 4 === 0;
      const tickH = major ? 5 : 2.5;
      ctx.moveTo(x, cy - tickH);
      ctx.lineTo(x, cy + tickH);
    }
    ctx.stroke();
  }

  // Quiet tucked channel name on far left when in 2-Mic mode
  if (label) {
    ctx.font = "500 11px Manrope, -apple-system, 'SF Pro Display', sans-serif";
    ctx.fillStyle = isLight
      ? `rgba(14, 15, 18, ${isMuted ? 0.3 : 0.48})`
      : `rgba(244, 244, 246, ${isMuted ? 0.28 : 0.48})`;
    ctx.fillText(label, 4, cy - maxBarH + 10);
  }

  const step = 5;
  const barW = 1.75;
  const leftCount = Math.max(20, Math.floor((cx - 10) / step));
  const rightCount = Math.max(20, Math.floor((width - cx - 10) / step));

  // LEFT OF NEEDLE: Recorded tape history tapering smoothly into negative space
  for (let i = 0; i < leftCount; i++) {
    const x = cx - 7 - i * step;
    if (x < 6) break;
    const norm = i / leftCount;
    const edgeFade = Math.max(0.06, 1 - Math.pow(norm, 1.45));
    const hasHist = history.length > 0 && i < history.length;

    let amp: number;
    if (hasHist) {
      amp = history[history.length - 1 - i]!;
    } else if (!reduceMotion && isLive && !isMuted) {
      amp = 0.018 + 0.008 * Math.sin(nowMs * 0.0016 - i * 0.22);
    } else {
      amp = 0.016;
    }

    const shaped = amp * (0.26 + 0.74 * (1 - norm * 0.65));
    const barH = Math.max(2, Math.min(maxBarH * 1.9, shaped * maxBarH * 1.9));

    if (isRec && hasHist && !isMuted) {
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${(0.22 + edgeFade * 0.66).toFixed(3)})`;
    } else {
      ctx.fillStyle = isLight
        ? `rgba(14, 15, 18, ${(0.08 + edgeFade * (hasHist ? 0.56 : 0.18)).toFixed(3)})`
        : `rgba(244, 244, 246, ${(0.07 + edgeFade * (hasHist ? 0.58 : 0.16)).toFixed(3)})`;
    }
    ctx.beginPath();
    ctx.roundRect(x - barW * 0.5, cy - barH * 0.5, barW, barH, barW * 0.5);
    ctx.fill();
  }

  // RIGHT OF NEEDLE: Live voice-reactive spectrum contour
  const isHotPeak = effectivePeak > 0.78 && !isMuted;
  for (let i = 0; i < rightCount; i++) {
    const x = cx + 7 + i * step;
    if (x > width - 6) break;
    const norm = i / rightCount;
    const edgeFade = Math.max(0.08, 1 - Math.pow(norm, 1.4));

    const bandIdx = Math.min(meter.bands.length - 1, Math.floor(norm * (meter.bands.length * 0.82)));
    const bandVal = isMuted ? 0 : (meter.bands[bandIdx] ?? 0);
    const liveLevel = isLive ? bandVal * 0.74 + effectiveRms * 0.36 : 0.016;
    const breath = !reduceMotion && isLive && !isMuted ? 0.018 + 0.01 * Math.sin(nowMs * 0.0022 - i * 0.28) : 0.016;
    const amp = Math.max(breath, liveLevel) * (0.28 + 0.72 * (1 - norm * 0.68));
    const barH = Math.max(2, Math.min(maxBarH * 1.9, amp * maxBarH * 1.9));

    if (isHotPeak && i < 6) {
      ctx.fillStyle = isLight
        ? `rgba(196, 22, 28, ${(0.5 + edgeFade * 0.4).toFixed(3)})`
        : `rgba(225, 38, 33, ${(0.55 + edgeFade * 0.4).toFixed(3)})`;
    } else if (isMuted) {
      ctx.fillStyle = isLight ? "rgba(14, 15, 18, 0.12)" : "rgba(255, 255, 255, 0.1)";
    } else if (isLive) {
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${(0.24 + edgeFade * 0.68).toFixed(3)})`;
    } else {
      ctx.fillStyle = isLight
        ? `rgba(14, 15, 18, ${(0.08 + edgeFade * 0.16).toFixed(3)})`
        : `rgba(244, 244, 246, ${(0.07 + edgeFade * 0.15).toFixed(3)})`;
    }

    ctx.beginPath();
    ctx.roundRect(x - barW * 0.5, cy - barH * 0.5, barW, barH, barW * 0.5);
    ctx.fill();
  }
}

function ProChannelRow({
  slot,
  cfg,
  sourceTag,
  isDualMic,
  isActiveTake,
  meterRef,
  dbRef,
  onUpdate,
  onOpenPatchbay,
}: {
  slot: "mic1" | "mic2";
  cfg: MicChannelConfig;
  sourceTag: string;
  isDualMic: boolean;
  isActiveTake: boolean;
  meterRef: RefObject<HTMLDivElement | null>;
  dbRef: RefObject<HTMLSpanElement | null>;
  onUpdate: (patch: Partial<MicChannelConfig>) => void;
  onOpenPatchbay: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 py-3 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              slot === "mic1" ? "bg-[#f0b54a]" : "bg-[#d1d1d6]"
            }`}
            aria-hidden
          />
          <input
            type="text"
            value={cfg.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            aria-label={slot === "mic1" ? "Mic 1 name" : "Mic 2 name"}
            className="w-36 truncate rounded-md bg-transparent px-1 py-0.5 text-[13px] font-medium text-foreground hover:bg-foreground/[0.04] focus:bg-foreground/[0.07] focus:outline-none"
          />
          <button
            type="button"
            onClick={onOpenPatchbay}
            className="truncate font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {sourceTag}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isDualMic ? (
            <button
              type="button"
              disabled={isActiveTake}
              onClick={() => onUpdate({ armed: !cfg.armed })}
              aria-pressed={cfg.armed}
              className={`h-7 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                cfg.armed
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {cfg.armed ? "Armed" : "Off"}
            </button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant={cfg.muted ? "destructive" : "ghost"}
            onClick={() => onUpdate({ muted: !cfg.muted })}
            aria-pressed={cfg.muted}
            aria-label={`Mute ${cfg.label}`}
            className="h-7 w-7 rounded-full p-0"
          >
            {cfg.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>

          <Button
            type="button"
            size="sm"
            variant={cfg.hpf ? "secondary" : "ghost"}
            onClick={() => onUpdate({ hpf: !cfg.hpf })}
            aria-pressed={cfg.hpf}
            className="h-7 rounded-full px-2.5 font-mono text-[11px]"
          >
            80 Hz
          </Button>

          <Button
            type="button"
            size="sm"
            variant={cfg.invertPhase ? "secondary" : "ghost"}
            onClick={() => onUpdate({ invertPhase: !cfg.invertPhase })}
            aria-pressed={cfg.invertPhase}
            aria-label={`Invert phase on ${cfg.label}`}
            className="h-7 w-7 rounded-full p-0 font-mono text-[12px]"
          >
            Ø
          </Button>

          <label className="ml-1 flex items-center gap-2">
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={cfg.gain}
              onDoubleClick={() => onUpdate({ gain: 1 })}
              onChange={(e) => onUpdate({ gain: Number(e.target.value) })}
              aria-label={`${cfg.label} trim gain`}
              className="studio-range w-20 sm:w-24"
            />
            <span className="w-[46px] text-right font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatGainDb(cfg.gain)}
            </span>
          </label>
        </div>
      </div>

      {/* Slim hairline dBFS meter bar */}
      <div className="flex items-center gap-2.5">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            ref={meterRef}
            style={{ transform: "scaleX(0.004)", transformOrigin: "left center" }}
            className="h-full w-full rounded-full bg-[linear-gradient(90deg,#34d399_0%,#34d399_72%,#f0b54a_88%,#e12621_98%)] will-change-transform"
          />
        </div>
        <span
          ref={dbRef}
          className="w-12 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums"
        >
          -∞ dB
        </span>
      </div>
    </div>
  );
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
  onChangeBpm,
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
  onChangeBpm: (bpm: number) => void;
  onToggleMetronome: () => void;
  onCycleCountIn: () => void;
  onToggleOverdub: () => void;
  onToggleMonitor: (next: boolean) => void;
  onDropMarker: () => void;
}) {
  const [proConsoleOpen, setProConsoleOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const mic1DbRef = useRef<HTMLSpanElement>(null);
  const mic2DbRef = useRef<HTMLSpanElement>(null);
  const mic1MeterRef = useRef<HTMLDivElement>(null);
  const mic2MeterRef = useRef<HTMLDivElement>(null);
  const clipDotRef = useRef<HTMLButtonElement>(null);

  const hist1Ref = useRef<number[]>([]);
  const hist2Ref = useRef<number[]>([]);
  const lastSampleRef = useRef<number>(0);

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
      lastSampleRef.current = 0;
    }
  }, [transport]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId = 0;
    let lastReduced = 0;

    const tick = (nowMs: number) => {
      if (reduceMotion && nowMs - lastReduced < 90) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastReduced = nowMs;

      const s = stateRef.current;
      const tel = s.sampleTelemetry();
      const isLight = s.theme === "light";
      const isRec = s.transport === "recording";
      const isLive = s.micReady || isRec || s.transport === "counting-in";
      const isDual = s.captureMode !== "single";

      if (timerRef.current) {
        timerRef.current.textContent = formatStageClock(tel.recordingProgressMs);
      }

      // Live quiet dB & drawer meter updates (zero React re-renders)
      const m1Rms = s.mic1.muted ? 0 : tel.mic1.rms;
      const m2Rms = s.mic2.muted ? 0 : tel.mic2.rms;
      if (mic1DbRef.current) {
        mic1DbRef.current.textContent = formatDbReadout(Math.max(m1Rms, s.mic1.muted ? 0 : tel.mic1.peak * 0.85));
      }
      if (mic2DbRef.current) {
        mic2DbRef.current.textContent = formatDbReadout(Math.max(m2Rms, s.mic2.muted ? 0 : tel.mic2.peak * 0.85));
      }
      if (mic1MeterRef.current) {
        const f1 = m1Rms <= 0.0005 ? 0 : dbToMeterFrac(linearToDb(m1Rms));
        mic1MeterRef.current.style.transform = `scaleX(${Math.max(0.004, f1).toFixed(3)})`;
      }
      if (mic2MeterRef.current) {
        const f2 = m2Rms <= 0.0005 ? 0 : dbToMeterFrac(linearToDb(m2Rms));
        mic2MeterRef.current.style.transform = `scaleX(${Math.max(0.004, f2).toFixed(3)})`;
      }
      if (clipDotRef.current) {
        clipDotRef.current.dataset.clipped = tel.mic1.clipped || tel.mic2.clipped ? "true" : "false";
      }

      if ((isRec || (isLive && (m1Rms > 0.006 || m2Rms > 0.006))) && nowMs - lastSampleRef.current >= 36) {
        lastSampleRef.current = nowMs;
        const v1 = s.mic1.muted ? 0.012 : Math.min(1, Math.max(0.02, m1Rms * 1.45 + tel.mic1.peak * 0.3));
        hist1Ref.current.push(v1);
        if (hist1Ref.current.length > 260) hist1Ref.current.shift();

        if (isDual) {
          const v2 = s.mic2.muted ? 0.012 : Math.min(1, Math.max(0.02, m2Rms * 1.45 + tel.mic2.peak * 0.3));
          hist2Ref.current.push(v2);
          if (hist2Ref.current.length > 260) hist2Ref.current.shift();
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width >= 8 && rect.height >= 8) {
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
          const cx = width * 0.5;
          ctx.clearRect(0, 0, width, height);

          const goldAccent = isLight ? ([166, 116, 18] as const) : ([240, 181, 74] as const);
          const silverAccent = isLight ? ([82, 84, 94] as const) : ([209, 209, 214] as const);

          if (isDual) {
            // Two serene, parallel acoustic tape ribbons separated by clean negative space
            const topY = height * 0.27;
            const botY = height * 0.73;
            const maxH = height * 0.2;

            drawAcousticTrack(ctx, tel.mic1, hist1Ref.current, {
              width,
              cy: topY,
              maxBarH: maxH,
              cx,
              accentRgb: goldAccent,
              isLight,
              isRec: isRec && s.mic1.armed,
              isLive: isLive && s.mic1.armed,
              isMuted: s.mic1.muted,
              nowMs,
              reduceMotion,
              label: s.mic1.label || "Mic 1",
              showBaseline: true,
            });

            // Whisper hairline dividing the two parallel staves
            ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.05)" : "rgba(255, 255, 255, 0.045)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height * 0.5);
            ctx.lineTo(width, height * 0.5);
            ctx.stroke();

            drawAcousticTrack(ctx, tel.mic2, hist2Ref.current, {
              width,
              cy: botY,
              maxBarH: maxH,
              cx,
              accentRgb: silverAccent,
              isLight,
              isRec: isRec && s.mic2.armed,
              isLive: isLive && s.mic2.armed,
              isMuted: s.mic2.muted,
              nowMs,
              reduceMotion,
              label: s.mic2.label || "Mic 2",
              showBaseline: true,
            });
          } else {
            drawAcousticTrack(ctx, tel.mic1, hist1Ref.current, {
              width,
              cy: height * 0.5,
              maxBarH: height * 0.4,
              cx,
              accentRgb: goldAccent,
              isLight,
              isRec,
              isLive,
              isMuted: s.mic1.muted,
              nowMs,
              reduceMotion,
              showBaseline: true,
            });
          }

          // Single sculptural vertical needle bisecting the entire acoustic stage (zero blur/glow)
          const needleTop = 10;
          const needleBot = height - 10;
          ctx.strokeStyle = isRec
            ? isLight
              ? "#c4161c"
              : "#e12621"
            : isLight
              ? "rgba(14, 15, 18, 0.72)"
              : "rgba(244, 244, 246, 0.78)";
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(cx, needleTop);
          ctx.lineTo(cx, needleBot);
          ctx.stroke();

          ctx.fillStyle = isRec
            ? isLight
              ? "#c4161c"
              : "#e12621"
            : isLight
              ? "#0e0f12"
              : "#f4f4f6";
          ctx.beginPath();
          ctx.arc(cx, needleTop, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
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

  const armedCount = isDualMic
    ? (mic1.armed ? 1 : 0) + (mic2.armed ? 1 : 0) + (recordSafetyMix && isRodeMultitrack ? 1 : 0)
    : 1;

  const activeDeviceLabel =
    selectedDeviceId === "default"
      ? rodeCaster.detected
        ? "RØDECaster Pro II"
        : "Built-in Microphone"
      : rodeCaster.detected
        ? "RØDECaster Pro II"
        : (devices.find((d) => d.deviceId === selectedDeviceId)?.label ?? "Audio Interface");

  const mic1SourceTag =
    captureMode === "single"
      ? activeDeviceLabel
      : captureMode === "dual-device"
        ? (devices.find((d) => d.deviceId === mic1.deviceId)?.label ?? "USB Input 1")
        : formatHardwareChannelName(mic1.channelIndex, isRodeMultitrack, detectedChannels);

  const mic2SourceTag =
    captureMode === "dual-device"
      ? (devices.find((d) => d.deviceId === mic2.deviceId)?.label ?? "USB Input 2")
      : formatHardwareChannelName(mic2.channelIndex, isRodeMultitrack, detectedChannels);

  return (
    <section
      aria-label="Nexus Audio Recorder"
      className="studio-capture-stage relative flex h-full w-full flex-col justify-between overflow-y-auto px-6 pb-8 pt-6 sm:px-10"
    >
      {/* Top Whisper Pill — Single Quiet Hardware & Mode Entry Point */}
      <div className="mx-auto flex w-full max-w-[1040px] shrink-0 flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onOpenPatchbay}
            className="inline-flex h-8 items-center gap-2 rounded-full border border-border/75 bg-card/55 px-3.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isRecording
                  ? "bg-[#e12621]"
                  : micReady
                    ? "bg-[#34d399]"
                    : rodeCaster.detected
                      ? "bg-[#f0b54a]"
                      : "bg-muted-foreground/45"
              }`}
              aria-hidden
            />
            <span className="max-w-[200px] truncate font-medium text-foreground">{activeDeviceLabel}</span>
            <span className="text-muted-foreground/70" aria-hidden>·</span>
            <span className="font-mono text-[11px] tabular-nums">
              {isDualMic ? `${armedCount} Mics` : "Solo"}
              {micReady ? ` · ${(sampleRate / 1000).toFixed(0)} kHz` : ""}
            </span>
          </button>

          <button
            ref={clipDotRef}
            type="button"
            data-clipped="false"
            onClick={onClearClipIndicators}
            title="Peak clip detected — click to reset"
            className="studio-clip-pill h-7 rounded-full px-2.5 font-mono text-[10.5px] font-medium transition-opacity"
          >
            Clipped
          </button>
        </div>

        {micError ? (
          <div role="alert" className="text-center text-[12px] text-destructive">
            {micError}
          </div>
        ) : statusNotice ? (
          <div role="status" className="text-center text-[12px] text-muted-foreground">
            {statusNotice}
          </div>
        ) : null}
      </div>

      {/* Center Focal Moment — Borderless Sculptural Acoustic Tape Horizon */}
      <div className="mx-auto my-auto flex w-full max-w-[1140px] flex-col items-center justify-center gap-10 py-6">
        <div className="relative w-full">
          <canvas
            ref={canvasRef}
            onClick={() => {
              if (!micReady && transport === "idle") onArmInputs();
            }}
            className={`block w-full cursor-pointer ${
              isDualMic ? "h-[208px] sm:h-[248px]" : "h-[184px] sm:h-[224px]"
            }`}
            aria-label="Live voice waveform tape"
          />

          {isCounting && countInBeat !== null ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="studio-glass-dock flex h-20 w-20 items-center justify-center rounded-full">
                <span className="font-mono text-[2rem] font-light text-foreground tabular-nums">
                  {countInBeat}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Sculptural Light-Weight Tabular Clock + Tactile Machined Record Shutter */}
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div
              ref={timerRef}
              className="font-sans text-[2.75rem] font-light leading-none tracking-[-0.03em] text-foreground tabular-nums sm:text-[3.25rem]"
            >
              00:00.0
            </div>
            <p className="text-[12px] text-muted-foreground">
              {isRecording
                ? isDualMic
                  ? `Recording ${armedCount} synced stems`
                  : "Recording"
                : isPaused
                  ? "Paused"
                  : micReady
                    ? isDualMic
                      ? "Ready · Tap shutter or press R"
                      : "Mic live · Ready to record"
                    : "Tap shutter to record"}
            </p>
          </div>

          {/* Primary Concentric Shutter Transport Row */}
          <div className="flex items-center justify-center gap-6">
            {/* Left flanking control: Pause / Resume (visible only during active take) */}
            <div className="flex w-11 justify-center">
              {isRecording || isPaused ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={isRecording ? onPauseRecord : onResumeRecord}
                        aria-label={isRecording ? "Pause recording" : "Resume recording"}
                        className="h-11 w-11 rounded-full p-0"
                      >
                        {isRecording ? <Pause className="size-4" /> : <Play className="size-4 translate-x-[0.5px]" />}
                      </Button>
                    }
                  />
                  <TooltipContent side="top">{isRecording ? "Pause" : "Resume"}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>

            {/* Center Iconic Apple-style Concentric Shutter Record / Stop Button */}
            <button
              type="button"
              onClick={() => {
                if (isActiveTake) onStopRecord();
                else onStartRecord();
              }}
              data-recording={isActiveTake ? "true" : "false"}
              aria-label={isActiveTake ? "Stop and keep take" : "Start recording (R)"}
              className="studio-shutter-ring flex h-[68px] w-[68px] items-center justify-center rounded-full transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--land-gold)]"
            >
              <span className="studio-shutter-core" aria-hidden />
            </button>

            {/* Right flanking control: Marker during capture, or Discard when paused */}
            <div className="flex w-11 justify-center">
              {isRecording ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onDropMarker}
                        aria-label="Drop marker (M)"
                        className="h-11 w-11 rounded-full p-0"
                      >
                        <BookmarkPlus className="size-4 text-[color:var(--land-gold)]" />
                      </Button>
                    }
                  />
                  <TooltipContent side="top">Drop marker (M)</TooltipContent>
                </Tooltip>
              ) : isPaused ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={onDiscardRecord}
                        aria-label="Discard paused take"
                        className="h-11 w-11 rounded-full p-0 text-muted-foreground hover:text-destructive"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent side="top">Discard take</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>

        {/* Progressive Disclosure: Sleek Collapsible Pro 2-Mic Console Tray (Hidden at face value!) */}
        {proConsoleOpen ? (
          <div className="studio-pro-tray w-full max-w-[760px] rounded-[20px] border border-border/80 px-5 py-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/60">
              <div className="inline-flex items-center rounded-full border border-border/75 bg-foreground/[0.03] p-0.5">
                <button
                  type="button"
                  disabled={isActiveTake}
                  onClick={() => onChangeMode("rcp2-multitrack")}
                  aria-pressed={isDualMic}
                  className={`h-7 rounded-full px-3 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                    isDualMic ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  2-Mic Studio
                </button>
                <button
                  type="button"
                  disabled={isActiveTake}
                  onClick={() => onChangeMode("single")}
                  aria-pressed={!isDualMic}
                  className={`h-7 rounded-full px-3 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                    !isDualMic ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Solo Mic
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isDualMic ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isActiveTake}
                    onClick={onApplyRodeCasterPreset}
                    className="h-7 gap-1.5 rounded-full px-3 text-[11.5px]"
                  >
                    {micReady && rodeCaster.detected ? (
                      <Check className="size-3 text-[#34d399]" />
                    ) : (
                      <Radio className="size-3 text-[color:var(--land-gold)]" />
                    )}
                    <span>RCP II Auto-Setup</span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onOpenPatchbay}
                  className="h-7 gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  <SlidersHorizontal className="size-3" />
                  <span>Full Patchbay</span>
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border/55">
              <ProChannelRow
                slot="mic1"
                cfg={mic1}
                sourceTag={mic1SourceTag}
                isDualMic={isDualMic}
                isActiveTake={isActiveTake}
                meterRef={mic1MeterRef}
                dbRef={mic1DbRef}
                onUpdate={onUpdateMic1}
                onOpenPatchbay={onOpenPatchbay}
              />
              {isDualMic ? (
                <ProChannelRow
                  slot="mic2"
                  cfg={mic2}
                  sourceTag={mic2SourceTag}
                  isDualMic={isDualMic}
                  isActiveTake={isActiveTake}
                  meterRef={mic2MeterRef}
                  dbRef={mic2DbRef}
                  onUpdate={onUpdateMic2}
                  onOpenPatchbay={onOpenPatchbay}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Whisper-Quiet Bottom Utility Footer (3 calm triggers, zero visual bulk) */}
      <footer className="mx-auto flex shrink-0 flex-wrap items-center justify-center gap-1 text-[12px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setProConsoleOpen((v) => !v)}
          aria-expanded={proConsoleOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium transition-colors ${
            proConsoleOpen
              ? "bg-foreground/10 text-foreground"
              : "hover:bg-foreground/[0.05] hover:text-foreground"
          }`}
        >
          <span>Pro Console</span>
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${proConsoleOpen ? "rotate-180" : ""}`}
          />
        </button>

        <span className="text-border" aria-hidden>·</span>

        <button
          type="button"
          onClick={onOpenPatchbay}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <SlidersHorizontal className="size-3.5" />
          <span>RØDECaster I/O</span>
        </button>

        <span className="text-border" aria-hidden>·</span>

        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <Metronome className="size-3.5" />
                <span>{metronomeEnabled ? `Click · ${bpm}` : "Timing"}</span>
              </button>
            }
          />
          <PopoverContent align="center" side="top" className="w-64 space-y-3.5 rounded-2xl p-4">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-foreground">Metronome click</span>
              <Switch
                checked={metronomeEnabled}
                onCheckedChange={onToggleMetronome}
                aria-label="Toggle metronome click"
              />
            </div>

            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Tempo (BPM)</span>
              <input
                type="number"
                min={40}
                max={240}
                value={bpm}
                onChange={(e) => onChangeBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                aria-label="Tempo BPM"
                className="h-7 w-16 rounded-lg border border-border/80 bg-transparent px-2 text-right font-mono text-[12px] text-foreground tabular-nums focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Count-in</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCycleCountIn}
                className="h-7 rounded-full px-2.5 font-mono text-[11px] tabular-nums"
              >
                {countInBars === 0 ? "Off" : `${countInBars} ${countInBars === 1 ? "bar" : "bars"}`}
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-foreground">Overdub playback</span>
              <Switch
                checked={overdubEnabled}
                onCheckedChange={onToggleOverdub}
                aria-label="Toggle overdub playback"
              />
            </div>

            <div className="flex items-center justify-between text-[12.5px]">
              <div className="flex items-center gap-1.5">
                <Headphones className="size-3.5 text-muted-foreground" />
                <span className="text-foreground">Browser monitor</span>
              </div>
              <Switch
                checked={monitorInput}
                onCheckedChange={onToggleMonitor}
                aria-label="Toggle browser headphone monitor"
              />
            </div>
          </PopoverContent>
        </Popover>
      </footer>
    </section>
  );
}
