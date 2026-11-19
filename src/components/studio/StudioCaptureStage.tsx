"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  ChevronDown,
  Headphones,
  Metronome,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MAX_STUDIO_INPUTS,
  formatDbReadout,
  formatGainDb,
  formatHardwareChannelName,
  linearToDb,
  type MicDeviceOption,
  type StudioCaptureMode,
} from "@/lib/studio/capture-engine";
import { STUDIO_STEM_COLORS, normalizeStudioColor } from "@/lib/studio/colors";
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

function drawAcousticRibbon(
  ctx: CanvasRenderingContext2D,
  meter: ChannelMeterTelemetry | undefined,
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
    compact: boolean;
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
    compact,
  } = options;

  const [ar, ag, ab] = accentRgb;
  const effectiveRms = !meter || isMuted ? 0 : meter.rms;
  const effectivePeak = !meter || isMuted ? 0 : meter.peak;

  // Hairline datum rule + subtle rangefinder ticks
  ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.07)" : "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();

  if (!compact) {
    const tickStep = 28;
    ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.055)" : "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    for (let x = cx % tickStep; x < width; x += tickStep) {
      const major = Math.abs(Math.round((x - cx) / tickStep)) % 4 === 0;
      const tickH = major ? 4.5 : 2;
      ctx.moveTo(x, cy - tickH);
      ctx.lineTo(x, cy + tickH);
    }
    ctx.stroke();
  }

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

  // LEFT OF NEEDLE: Recorded trace tapering gently into negative space
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
  const bands = meter?.bands;
  for (let i = 0; i < rightCount; i++) {
    const x = cx + 7 + i * step;
    if (x > width - 6) break;
    const norm = i / rightCount;
    const edgeFade = Math.max(0.08, 1 - Math.pow(norm, 1.4));

    const bandIdx = bands ? Math.min(bands.length - 1, Math.floor(norm * (bands.length * 0.82))) : 0;
    const bandVal = isMuted || !bands ? 0 : (bands[bandIdx] ?? 0);
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

function InputStripRow({
  cfg,
  slotIndex,
  sourceTag,
  isMultiMic,
  isActiveTake,
  canRemove,
  onRegisterMeter,
  onRegisterDb,
  onUpdate,
  onRemove,
  onOpenPatchbay,
}: {
  cfg: MicChannelConfig;
  slotIndex: number;
  sourceTag: string;
  isMultiMic: boolean;
  isActiveTake: boolean;
  canRemove: boolean;
  onRegisterMeter: (id: string, el: HTMLDivElement | null) => void;
  onRegisterDb: (id: string, el: HTMLSpanElement | null) => void;
  onUpdate: (patch: Partial<MicChannelConfig>) => void;
  onRemove: () => void;
  onOpenPatchbay: () => void;
}) {
  const dotClass = STUDIO_STEM_COLORS[normalizeStudioColor(cfg.colorTag, slotIndex)].dotClass;

  return (
    <div className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
          <input
            type="text"
            value={cfg.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            aria-label={`Input ${slotIndex + 1} name`}
            className="w-32 truncate rounded-md bg-transparent px-1 py-0.5 text-[13px] font-medium text-foreground hover:bg-foreground/[0.04] focus:bg-foreground/[0.07] focus:outline-none"
          />
          <button
            type="button"
            onClick={onOpenPatchbay}
            className="max-w-[140px] truncate font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {sourceTag}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isMultiMic ? (
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
            aria-label={`Invert polarity on ${cfg.label}`}
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

          {canRemove ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={isActiveTake}
              onClick={onRemove}
              aria-label={`Remove ${cfg.label}`}
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            ref={(el) => onRegisterMeter(cfg.id, el)}
            style={{ transform: "scaleX(0.004)", transformOrigin: "left center" }}
            className="h-full w-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#22c55e_70%,#f97316_88%,#e12621_98%)] will-change-transform"
          />
        </div>
        <span
          ref={(el) => onRegisterDb(cfg.id, el)}
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
  useBroadcastChannelMap,
  devices,
  selectedDeviceId,
  inputs,
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
  onAddInput,
  onRemoveInput,
  onUpdateInput,
  onArmInputs,
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
  useBroadcastChannelMap: boolean;
  devices: MicDeviceOption[];
  selectedDeviceId: string;
  inputs: MicChannelConfig[];
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
  onAddInput: () => void;
  onRemoveInput: (id: string) => void;
  onUpdateInput: (id: string, patch: Partial<MicChannelConfig>) => void;
  onArmInputs: () => void;
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
  const [mixerTrayOpen, setMixerTrayOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const clipDotRef = useRef<HTMLButtonElement>(null);
  const meterElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const dbElsRef = useRef<Map<string, HTMLSpanElement>>(new Map());
  const historiesRef = useRef<Map<string, number[]>>(new Map());
  const lastSampleRef = useRef<number>(0);

  const stateRef = useRef({
    transport,
    captureMode,
    micReady,
    inputs,
    theme,
    sampleTelemetry,
  });

  useEffect(() => {
    stateRef.current = {
      transport,
      captureMode,
      micReady,
      inputs,
      theme,
      sampleTelemetry,
    };
  }, [captureMode, inputs, micReady, sampleTelemetry, theme, transport]);

  useEffect(() => {
    if (transport === "idle") {
      lastSampleRef.current = 0;
    }
  }, [transport]);

  const registerMeter = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) meterElsRef.current.set(id, el);
    else meterElsRef.current.delete(id);
  }, []);

  const registerDb = useCallback((id: string, el: HTMLSpanElement | null) => {
    if (el) dbElsRef.current.set(id, el);
    else dbElsRef.current.delete(id);
  }, []);

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
      const count = Math.max(1, s.inputs.length);

      if (timerRef.current) {
        timerRef.current.textContent = formatStageClock(tel.recordingProgressMs);
      }

      let anyClip = false;
      let anySignal = false;
      for (let i = 0; i < s.inputs.length; i++) {
        const inp = s.inputs[i]!;
        const meter = tel.inputMeters[i];
        const rms = !meter || inp.muted ? 0 : meter.rms;
        const peak = !meter || inp.muted ? 0 : meter.peak;
        if (meter?.clipped) anyClip = true;
        if (rms > 0.006) anySignal = true;

        const dbEl = dbElsRef.current.get(inp.id);
        if (dbEl) dbEl.textContent = formatDbReadout(Math.max(rms, peak * 0.85));

        const meterEl = meterElsRef.current.get(inp.id);
        if (meterEl) {
          const frac = rms <= 0.0005 ? 0 : dbToMeterFrac(linearToDb(rms));
          meterEl.style.transform = `scaleX(${Math.max(0.004, frac).toFixed(3)})`;
        }
      }

      if (clipDotRef.current) {
        clipDotRef.current.dataset.clipped = anyClip ? "true" : "false";
      }

      if ((isRec || (isLive && anySignal)) && nowMs - lastSampleRef.current >= 36) {
        lastSampleRef.current = nowMs;
        for (let i = 0; i < s.inputs.length; i++) {
          const inp = s.inputs[i]!;
          const meter = tel.inputMeters[i];
          const val =
            !meter || inp.muted
              ? 0.012
              : Math.min(1, Math.max(0.02, meter.rms * 1.45 + meter.peak * 0.3));
          let hist = historiesRef.current.get(inp.id);
          if (!hist) {
            hist = [];
            historiesRef.current.set(inp.id, hist);
          }
          hist.push(val);
          if (hist.length > 260) hist.shift();
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

          const laneH = height / count;
          for (let i = 0; i < count; i++) {
            const inp = s.inputs[i]!;
            const meter = tel.inputMeters[i];
            const hist = historiesRef.current.get(inp.id) ?? [];
            const cy = laneH * (i + 0.5);
            const maxBarH = laneH * (count === 1 ? 0.42 : 0.38);
            const palette = STUDIO_STEM_COLORS[normalizeStudioColor(inp.colorTag, i)];

            if (i > 0) {
              ctx.strokeStyle = isLight ? "rgba(14, 15, 18, 0.05)" : "rgba(255, 255, 255, 0.045)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(0, laneH * i);
              ctx.lineTo(width, laneH * i);
              ctx.stroke();
            }

            drawAcousticRibbon(ctx, meter, hist, {
              width,
              cy,
              maxBarH,
              cx,
              accentRgb: isLight ? palette.lightRgb : palette.darkRgb,
              isLight,
              isRec: isRec && (count === 1 || inp.armed),
              isLive: isLive && (count === 1 || inp.armed),
              isMuted: inp.muted,
              nowMs,
              reduceMotion,
              label: count > 1 ? inp.label || `Mic ${i + 1}` : undefined,
              compact: count > 2,
            });
          }

          // Single sculptural vertical needle bisecting the entire acoustic horizon (zero blur/glow)
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

  const isMultiMic = inputs.length > 1 || captureMode !== "solo";
  const isRecording = transport === "recording";
  const isPaused = transport === "paused";
  const isCounting = transport === "counting-in";
  const isActiveTake = isRecording || isPaused || isCounting;

  const armedCount = isMultiMic
    ? inputs.filter((i) => i.armed).length +
      (captureMode === "multitrack" && recordSafetyMix && detectedChannels >= 4 ? 1 : 0)
    : 1;

  const activeDeviceLabel =
    captureMode === "multi-device"
      ? `${inputs.length} USB Inputs`
      : selectedDeviceId === "default"
        ? "Microphone"
        : (devices.find((d) => d.deviceId === selectedDeviceId)?.label ?? "Audio Interface");

  const canvasHeightClass =
    inputs.length <= 1
      ? "h-[192px] sm:h-[228px]"
      : inputs.length === 2
        ? "h-[212px] sm:h-[252px]"
        : inputs.length === 3
          ? "h-[248px] sm:h-[280px]"
          : "h-[276px] sm:h-[312px]";

  const canAddMore =
    !isActiveTake &&
    inputs.length < (captureMode === "stereo-split" ? 2 : MAX_STUDIO_INPUTS);

  return (
    <section
      aria-label="Nexus Audio Recorder"
      className="studio-capture-stage relative flex h-full w-full flex-col justify-between overflow-y-auto px-6 pb-8 pt-6 sm:px-10"
    >
      {/* Top Whisper Pill — Single Quiet Input Indicator */}
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
                    : "bg-muted-foreground/45"
              }`}
              aria-hidden
            />
            <span className="max-w-[220px] truncate font-medium text-foreground">{activeDeviceLabel}</span>
            {isMultiMic ? (
              <>
                <span className="text-muted-foreground/70" aria-hidden>·</span>
                <span className="font-mono text-[11px] tabular-nums">{armedCount} Mics</span>
              </>
            ) : null}
            {micReady ? (
              <>
                <span className="text-muted-foreground/70" aria-hidden>·</span>
                <span className="font-mono text-[11px] tabular-nums">{(sampleRate / 1000).toFixed(0)} kHz</span>
              </>
            ) : null}
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
            className={`block w-full cursor-pointer ${canvasHeightClass}`}
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

        {/* Sculptural Light-Weight Tabular Clock + Tactile Machined Shutter */}
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
                ? isMultiMic
                  ? `Recording ${armedCount} synced stems`
                  : "Recording"
                : isPaused
                  ? "Paused"
                  : micReady
                    ? isMultiMic
                      ? `${armedCount} inputs live`
                      : "Mic live"
                    : "Tap shutter to record"}
            </p>
          </div>

          <div className="flex items-center justify-center gap-6">
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

            <button
              type="button"
              onClick={() => {
                if (isActiveTake) onStopRecord();
                else onStartRecord();
              }}
              data-recording={isActiveTake ? "true" : "false"}
              aria-label={isActiveTake ? "Stop and keep take" : "Start recording (R)"}
              className="studio-shutter-ring flex h-[68px] w-[68px] items-center justify-center rounded-full transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--studio-accent)]"
            >
              <span className="studio-shutter-core" aria-hidden />
            </button>

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
                        <BookmarkPlus className="size-4 text-[color:var(--studio-accent)]" />
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

        {/* Progressive Disclosure: Collapsible Pro Multi-Mic Input Mixer Tray (Hidden at face value!) */}
        {mixerTrayOpen ? (
          <div className="studio-pro-tray w-full max-w-[780px] rounded-[20px] border border-border/80 px-5 py-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium text-foreground">
                  {inputs.length === 1 ? "Input channel" : `Inputs (${inputs.length})`}
                </span>
                {canAddMore ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onAddInput}
                    className="h-7 gap-1 rounded-full px-2.5 text-[11.5px]"
                  >
                    <Plus className="size-3" />
                    <span>Add mic</span>
                  </Button>
                ) : null}
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onOpenPatchbay}
                className="h-7 gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <SlidersHorizontal className="size-3" />
                <span>Audio I/O</span>
              </Button>
            </div>

            <div className="divide-y divide-border/55">
              {inputs.map((inp, idx) => {
                const sourceTag =
                  captureMode === "solo"
                    ? activeDeviceLabel
                    : captureMode === "multi-device"
                      ? (devices.find((d) => d.deviceId === inp.deviceId)?.label ?? `USB Input ${idx + 1}`)
                      : formatHardwareChannelName(inp.channelIndex, useBroadcastChannelMap, detectedChannels);
                return (
                  <InputStripRow
                    key={inp.id}
                    cfg={inp}
                    slotIndex={idx}
                    sourceTag={sourceTag}
                    isMultiMic={isMultiMic}
                    isActiveTake={isActiveTake}
                    canRemove={inputs.length > 1}
                    onRegisterMeter={registerMeter}
                    onRegisterDb={registerDb}
                    onUpdate={(patch) => onUpdateInput(inp.id, patch)}
                    onRemove={() => onRemoveInput(inp.id)}
                    onOpenPatchbay={onOpenPatchbay}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Whisper-Quiet Bottom Utility Footer */}
      <footer className="mx-auto flex shrink-0 flex-wrap items-center justify-center gap-1 text-[12px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setMixerTrayOpen((v) => !v)}
          aria-expanded={mixerTrayOpen}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium transition-colors ${
            mixerTrayOpen
              ? "bg-foreground/10 text-foreground"
              : "hover:bg-foreground/[0.05] hover:text-foreground"
          }`}
        >
          <span>{inputs.length > 1 ? `Inputs (${inputs.length})` : "Mixer"}</span>
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${mixerTrayOpen ? "rotate-180" : ""}`}
          />
        </button>

        <span className="text-border" aria-hidden>·</span>

        <button
          type="button"
          onClick={onOpenPatchbay}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-medium transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <SlidersHorizontal className="size-3.5" />
          <span>Audio I/O</span>
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
