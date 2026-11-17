"use client";

import { useEffect, useRef } from "react";
import {
  BookmarkPlus,
  Headphones,
  Metronome,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { LiveAudioTelemetry, MicDeviceOption, StudioTransportState } from "./use-studio-audio";

function formatClockHMS(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Page 1 of Nexus Recording Studio — dedicated full-screen vocal & audio capture stage.
 * Displays a centered split-needle tape waveform (silver/grey recorded trace on the left,
 * glowing crimson reactive spectrum on the right), glass transport capsule, and HH:MM:SS timer.
 */
export function StudioCaptureStage({
  transport,
  micReady,
  micError,
  statusNotice,
  countInBeat,
  metronomeEnabled,
  overdubEnabled,
  monitorInput,
  studioRawMic,
  inputGain,
  devices,
  selectedDeviceId,
  theme,
  sampleTelemetry,
  onArmMic,
  onStartRecord,
  onPauseRecord,
  onResumeRecord,
  onStopRecord,
  onToggleMetronome,
  onToggleOverdub,
  onToggleMonitor,
  onToggleRawMic,
  onChangeInputGain,
  onSelectDevice,
  onDropMarker,
}: {
  transport: StudioTransportState;
  micReady: boolean;
  micError: string | null;
  statusNotice: string | null;
  countInBeat: number | null;
  metronomeEnabled: boolean;
  overdubEnabled: boolean;
  monitorInput: boolean;
  studioRawMic: boolean;
  inputGain: number;
  devices: MicDeviceOption[];
  selectedDeviceId: string;
  theme: "dark" | "light";
  sampleTelemetry: () => LiveAudioTelemetry;
  onArmMic: () => void;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onResumeRecord: () => void;
  onStopRecord: () => void;
  onToggleMetronome: () => void;
  onToggleOverdub: () => void;
  onToggleMonitor: (next: boolean) => void;
  onToggleRawMic: (next: boolean) => void;
  onChangeInputGain: (val: number) => void;
  onSelectDevice: (id: string) => void;
  onDropMarker: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const historyRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef<number>(0);

  const transportRef = useRef(transport);
  const micReadyRef = useRef(micReady);
  const themeRef = useRef(theme);
  const sampleRef = useRef(sampleTelemetry);

  useEffect(() => {
    transportRef.current = transport;
    micReadyRef.current = micReady;
    themeRef.current = theme;
    sampleRef.current = sampleTelemetry;
  }, [micReady, sampleTelemetry, theme, transport]);

  useEffect(() => {
    if (transport === "idle") {
      lastSampleAtRef.current = 0;
    }
  }, [transport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let rafId = 0;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      width = rect.width;
      height = rect.height;
    };

    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();

    const drawFrame = (nowMs: number) => {
      const tel = sampleRef.current();
      const state = transportRef.current;
      const isLight = themeRef.current === "light";
      const isRec = state === "recording";
      const isCounting = state === "counting-in";
      const isArmed = micReadyRef.current || isRec || isCounting;

      if (timerRef.current) {
        timerRef.current.textContent = formatClockHMS(tel.recordingProgressMs);
      }

      if ((isRec || (isArmed && tel.rms > 0.015)) && nowMs - lastSampleAtRef.current >= 42) {
        lastSampleAtRef.current = nowMs;
        const instantaneous = Math.min(1, Math.max(0.03, tel.rms * 1.45 + tel.peak * 0.3));
        historyRef.current.push(instantaneous);
        if (historyRef.current.length > 180) {
          historyRef.current.shift();
        }
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxBarH = height * 0.42;
      const step = 6.5;
      const barW = 2.4;
      const halfCount = Math.max(24, Math.floor((cx - 12) / step));

      // Soft radial crimson bloom contained within canvas height
      const energy = Math.min(1, tel.rms * 1.4 + tel.peak * 0.25);
      if (isRec || (isArmed && energy > 0.02)) {
        const bloomRadius = Math.max(40, Math.min(width * 0.36, height * 0.48));
        const bloomCx = cx + bloomRadius * 0.65;
        const bloom = ctx.createRadialGradient(bloomCx, cy, 4, bloomCx, cy, bloomRadius);
        bloom.addColorStop(0, `rgba(252, 46, 38, ${0.14 + energy * 0.14})`);
        bloom.addColorStop(0.65, `rgba(252, 46, 38, ${0.04 + energy * 0.04})`);
        bloom.addColorStop(1, "rgba(252, 46, 38, 0)");
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(bloomCx, cy, bloomRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // LEFT OF NEEDLE: Crisp silver/white recorded history waveform trailing cleanly into dots
      const hist = historyRef.current;
      for (let i = 0; i < halfCount; i++) {
        const x = cx - 7 - i * step;
        if (x < 8) break;
        const normFromCenter = i / halfCount;
        const edgeFade = Math.max(0.08, 1 - Math.pow(normFromCenter, 1.35));

        let amp: number;
        if (hist.length > 0 && i < hist.length) {
          amp = hist[hist.length - 1 - i]!;
        } else {
          const gentle = !reduceMotion ? 0.028 + 0.018 * Math.sin(nowMs * 0.002 - i * 0.25) : 0.03;
          amp = isArmed ? gentle * 1.2 : gentle;
        }

        const shaped = amp * (0.28 + 0.72 * (1 - normFromCenter * 0.78));
        const h = Math.max(2.4, Math.min(maxBarH * 2, shaped * maxBarH * 2));
        ctx.fillStyle = isLight
          ? `rgba(24, 24, 28, ${0.2 + edgeFade * (hist.length > 0 && i < hist.length ? 0.62 : 0.28)})`
          : `rgba(216, 220, 228, ${0.16 + edgeFade * (hist.length > 0 && i < hist.length ? 0.68 : 0.28)})`;
        ctx.beginPath();
        ctx.roundRect(x - barW * 0.5, cy - h * 0.5, barW, h, barW * 0.5);
        ctx.fill();
      }

      // RIGHT OF NEEDLE: Vibrant glowing crimson reactive spectrum bars responding live to voice
      ctx.save();
      if (isRec || (isArmed && energy > 0.02)) {
        ctx.shadowColor = isLight ? "rgba(200, 24, 28, 0.35)" : "rgba(255, 52, 44, 0.65)";
        ctx.shadowBlur = 10;
      }
      for (let i = 0; i < halfCount; i++) {
        const x = cx + 7 + i * step;
        if (x > width - 8) break;
        const normFromCenter = i / halfCount;
        const edgeFade = Math.max(0.12, 1 - Math.pow(normFromCenter, 1.45));

        const bandIdx = Math.min(
          tel.bands.length - 1,
          Math.floor(normFromCenter * (tel.bands.length * 0.85)),
        );
        const bandVal = tel.bands[bandIdx] ?? 0;
        const pulseMod =
          !reduceMotion && isArmed
            ? 0.035 + 0.025 * Math.sin(nowMs * 0.004 - i * 0.34)
            : 0.025;
        const liveLevel =
          bandVal * (0.68 + 0.62 * Math.sin(i * 0.48 + nowMs * 0.008) * 0.28) + tel.rms * 0.36;
        const amp = Math.max(pulseMod, liveLevel) * (0.25 + 0.75 * (1 - normFromCenter * 0.72));
        const h = Math.max(2.4, Math.min(maxBarH * 2, amp * maxBarH * 2));

        const hot = Math.min(1, amp * 1.3);
        ctx.fillStyle = isLight
          ? `rgba(${Math.round(196 + hot * 42)}, ${Math.round(24 + hot * 24)}, 28, ${
              (isArmed ? 0.48 : 0.24) + edgeFade * (0.35 + hot * 0.2)
            })`
          : `rgba(255, ${Math.round(42 + hot * 36)}, ${Math.round(36 + hot * 22)}, ${
              (isArmed ? 0.45 : 0.22) + edgeFade * (0.38 + hot * 0.22)
            })`;
        ctx.beginPath();
        ctx.roundRect(x - barW * 0.5, cy - h * 0.5, barW, h, barW * 0.5);
        ctx.fill();
      }
      ctx.restore();

      // CENTER VERTICAL NEEDLE LINE WITH BRIGHT CAP DOT
      const needleTop = cy - maxBarH * 0.88;
      const needleBot = cy + maxBarH * 0.82;
      const needleGrad = ctx.createLinearGradient(0, needleTop, 0, needleBot);
      if (isLight) {
        needleGrad.addColorStop(0, "rgba(17, 17, 20, 0.95)");
        needleGrad.addColorStop(0.65, "rgba(17, 17, 20, 0.75)");
        needleGrad.addColorStop(1, "rgba(17, 17, 20, 0)");
      } else {
        needleGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
        needleGrad.addColorStop(0.68, "rgba(255, 255, 255, 0.82)");
        needleGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      }
      ctx.strokeStyle = needleGrad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, needleTop);
      ctx.lineTo(cx, needleBot);
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = isLight ? "#111114" : "#ffffff";
      ctx.shadowColor = isLight ? "rgba(17,17,20,0.28)" : "rgba(255, 255, 255, 0.9)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, needleTop, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!reduceMotion) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const isRecording = transport === "recording";
  const isPaused = transport === "paused";
  const isCounting = transport === "counting-in";
  const micLabel =
    selectedDeviceId === "default"
      ? "Default microphone"
      : (devices.find((d) => d.deviceId === selectedDeviceId)?.label ?? "Default microphone");

  return (
    <section
      aria-label="Nexus Capture Stage"
      className="studio-capture-stage relative flex h-full w-full flex-col justify-between overflow-hidden"
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-center justify-center gap-10 px-4">
        {micError ? (
          <div role="alert" className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-1.5 text-[12.5px] text-destructive">
            {micError}
          </div>
        ) : statusNotice ? (
          <div role="status" className="rounded-full border border-border/75 bg-background/60 px-4 py-1 text-[12px] text-muted-foreground">
            {statusNotice}
          </div>
        ) : null}

        <div className="relative w-full">
          <canvas
            ref={canvasRef}
            onClick={() => {
              if (!micReady && transport === "idle") onArmMic();
            }}
            className="block h-[220px] w-full cursor-pointer sm:h-[270px]"
            aria-label="Live voice-reactive capture wave"
          />
          {isCounting && countInBeat !== null ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              <span className="rounded-full bg-background/85 px-3.5 py-1 font-mono text-[13px] font-semibold tracking-wider text-[#fc3a34]">
                Count-in · {countInBeat}
              </span>
            </div>
          ) : null}
        </div>

        {/* Sleek Glass Capsule Control + Crisp HH:MM:SS Timer */}
        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6">
          <div className="studio-capture-pill flex items-center gap-3 rounded-full px-6 py-2.5">
            {isRecording || isPaused || isCounting ? (
              <>
                {!isCounting ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={isRecording ? onPauseRecord : onResumeRecord}
                    aria-label={isRecording ? "Pause recording" : "Resume recording"}
                    className="h-8 w-8 rounded-full"
                  >
                    {isRecording ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </Button>
                ) : null}

                <button
                  type="button"
                  onClick={onStopRecord}
                  aria-label="Stop and keep take"
                  className="studio-capture-stop-btn flex h-8 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium"
                >
                  <Square className="size-3.5 fill-current" />
                  <span>Done</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onStartRecord}
                aria-label="Record layer"
                className="studio-capture-dot-btn flex h-8 w-16 items-center justify-center rounded-full"
              >
                <span className="studio-capture-red-dot" aria-hidden />
              </button>
            )}
          </div>

          <span
            ref={timerRef}
            className={`font-mono text-[1.65rem] font-light tracking-wider tabular-nums ${
              isRecording ? "text-foreground" : "text-foreground/85"
            }`}
          >
            00:00:00
          </span>
        </div>
      </div>

      {/* Subtle Bottom Utility Bar */}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 pb-6 pt-2 opacity-70 transition-opacity hover:opacity-100">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onArmMic}
          className="h-8 gap-1.5 rounded-full text-[12px]"
        >
          {micReady ? <Mic className="size-3.5 text-[#fc3a34]" /> : <MicOff className="size-3.5" />}
          <span>{micReady ? "Mic Live" : "Test Mic"}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={metronomeEnabled ? "secondary" : "ghost"}
          onClick={onToggleMetronome}
          aria-pressed={metronomeEnabled}
          className="h-8 gap-1.5 rounded-full text-[12px]"
        >
          <Metronome className="size-3.5" />
          <span>Click</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={overdubEnabled ? "secondary" : "ghost"}
          onClick={onToggleOverdub}
          className="h-8 rounded-full text-[12px]"
        >
          Overdub {overdubEnabled ? "On" : "Off"}
        </Button>

        {isRecording || isPaused ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDropMarker}
            className="h-8 gap-1.5 rounded-full text-[12px]"
          >
            <BookmarkPlus className="size-3.5" />
            <span>Marker (M)</span>
          </Button>
        ) : null}

        <Popover>
          <PopoverTrigger
            render={
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 rounded-full text-[12px]">
                <SlidersHorizontal className="size-3.5" />
                <span>Mic Setup</span>
              </Button>
            }
          />
          <PopoverContent align="center" side="top" className="w-76 space-y-4 rounded-2xl p-4">
            <div className="space-y-1.5">
              <label className="text-[11.5px] font-medium text-muted-foreground">Microphone Input</label>
              <Select value={selectedDeviceId} onValueChange={(v) => v && onSelectDevice(v)}>
                <SelectTrigger aria-label="Capture microphone input" className="h-8 w-full text-[12px]">
                  <SelectValue>{micLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default microphone</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <div className="flex items-center gap-2">
                <Headphones className="size-3.5 text-muted-foreground" />
                <span>Headphone Monitor</span>
              </div>
              <Switch checked={monitorInput} onCheckedChange={onToggleMonitor} />
            </div>

            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <div className="flex items-center gap-2">
                <Radio className="size-3.5 text-muted-foreground" />
                <span>Raw Mic</span>
              </div>
              <Switch checked={studioRawMic} onCheckedChange={onToggleRawMic} />
            </div>

            <Separator />

            <label className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground">Mic Gain</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={inputGain}
                onChange={(e) => onChangeInputGain(Number(e.target.value))}
                className="studio-range w-28"
              />
            </label>
          </PopoverContent>
        </Popover>
      </footer>
    </section>
  );
}
