"use client";

import { useEffect, useRef } from "react";
import { BookmarkPlus, Mic, MicOff, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LiveAudioTelemetry, StudioTransportState } from "./use-studio-audio";

function formatTimecode(ms: number): string {
  const safe = Math.max(0, ms);
  const mins = Math.floor(safe / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Full-width crimson reactive voice recording bar.
 * Samples `AnalyserNode` telemetry directly inside a 60fps Canvas loop so voice
 * amplitude and frequency spectrum react instantaneously without React re-render lag.
 */
export function ReactiveRecordBar({
  transport,
  micReady,
  playheadMs,
  countInBeat,
  theme,
  sampleTelemetry,
  onArmMic,
  onStartRecord,
  onPauseRecord,
  onResumeRecord,
  onStopRecord,
  onPlay,
  onPausePlay,
  onDropMarker,
}: {
  transport: StudioTransportState;
  micReady: boolean;
  playheadMs: number;
  countInBeat: number | null;
  theme: "dark" | "light";
  sampleTelemetry: () => LiveAudioTelemetry;
  onArmMic: () => void;
  onStartRecord: () => void;
  onPauseRecord: () => void;
  onResumeRecord: () => void;
  onStopRecord: () => void;
  onPlay: () => void;
  onPausePlay: () => void;
  onDropMarker: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const dbLabelRef = useRef<HTMLSpanElement>(null);
  const transportRef = useRef(transport);
  const micReadyRef = useRef(micReady);
  const themeRef = useRef(theme);
  const playheadRef = useRef(playheadMs);
  const sampleRef = useRef(sampleTelemetry);

  useEffect(() => {
    transportRef.current = transport;
    micReadyRef.current = micReady;
    themeRef.current = theme;
    playheadRef.current = playheadMs;
    sampleRef.current = sampleTelemetry;
  }, [transport, micReady, theme, playheadMs, sampleTelemetry]);

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
      const isPlay = state === "playing";
      const isArmed = micReadyRef.current || isRec || isPlay;

      // Update numeric timecode & dB meter directly without triggering React renders at 60fps
      if (timeLabelRef.current) {
        const displayMs =
          state === "recording" || state === "paused" ? tel.recordingProgressMs : playheadRef.current;
        timeLabelRef.current.textContent = formatTimecode(displayMs);
      }
      if (dbLabelRef.current) {
        const db = tel.rms > 0.0015 ? Math.max(-60, Math.round(20 * Math.log10(tel.rms))) : -60;
        dbLabelRef.current.textContent = tel.clipped ? "CLIP" : db <= -60 ? "-∞ dB" : `${db} dB`;
      }

      ctx.clearRect(0, 0, width, height);

      const cy = height * 0.5;
      const barCount = Math.min(tel.bands.length, Math.max(24, Math.floor(width / 10)));
      const slotW = width / barCount;
      const barW = Math.max(2.5, Math.min(5.5, slotW * 0.56));
      const maxAmpH = height * 0.43;

      // Baseline acoustic horizon thread
      const baseAlpha = isRec ? 0.42 : isArmed ? 0.24 : 0.14;
      ctx.strokeStyle = isLight
        ? `rgba(196, 22, 28, ${baseAlpha})`
        : `rgba(252, 58, 52, ${baseAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      // Continuous red glowing reaction bar envelope when speaking / playing
      const energy = Math.min(1, tel.rms * 1.35 + tel.peak * 0.25);
      if (energy > 0.006 || isRec) {
        const glowGrad = ctx.createLinearGradient(0, 0, width, 0);
        const edgeA = 0.04;
        const centerA = (isRec ? 0.34 : 0.2) * Math.max(0.18, energy);
        const glowRgb = isLight ? "204, 24, 30" : "252, 48, 44";
        glowGrad.addColorStop(0, `rgba(${glowRgb}, ${edgeA})`);
        glowGrad.addColorStop(0.5, `rgba(${glowRgb}, ${centerA})`);
        glowGrad.addColorStop(1, `rgba(${glowRgb}, ${edgeA})`);
        ctx.fillStyle = glowGrad;
        const ribbonH = Math.max(4, height * (0.14 + energy * 0.62));
        ctx.fillRect(0, cy - ribbonH * 0.5, width, ribbonH);
      }

      // Symmetrical center-outward voice-reactive crimson bars
      for (let i = 0; i < barCount; i++) {
        // Mirror low/mid voice formants symmetrically out from center so voice naturally blooms from middle!
        const distNorm = Math.abs((i + 0.5) / barCount - 0.5) * 2;
        const bandIdx = Math.min(
          tel.bands.length - 1,
          Math.floor(distNorm * (tel.bands.length * 0.85)),
        );
        const bandVal = tel.bands[bandIdx] ?? 0;
        const idleBreath =
          !reduceMotion && (isArmed || state === "counting-in")
            ? (0.04 + 0.03 * Math.sin(nowMs * 0.003 + i * 0.28)) * (isRec ? 1.8 : 1)
            : 0.03;

        const amp = Math.max(idleBreath, bandVal * (0.55 + 0.75 * (1 - distNorm * 0.45)) + tel.rms * 0.28);
        const barH = Math.max(3, Math.min(maxAmpH, amp * maxAmpH * 1.18)) * 2;
        const x = i * slotW + (slotW - barW) * 0.5;
        const y = cy - barH * 0.5;

        const hot = Math.min(1, amp * 1.25);
        if (isLight) {
          const r = Math.round(188 + hot * 48);
          const g = Math.round(28 + (isRec ? hot * 42 : hot * 18));
          const b = Math.round(30 + hot * 16);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${isArmed ? 0.52 + hot * 0.46 : 0.22})`;
        } else {
          const r = 252;
          const g = Math.round(36 + hot * (isRec ? 98 : 64));
          const b = Math.round(36 + hot * (isRec ? 72 : 44));
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${isArmed ? 0.46 + hot * 0.54 : 0.22})`;
        }

        const radius = barW * 0.5;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, radius);
        ctx.fill();
      }

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
  const isPlaying = transport === "playing";

  return (
    <div
      className="studio-record-bar"
      data-state={transport}
      data-armed={micReady ? "true" : "false"}
      role="region"
      aria-label="Voice reactive recording bar"
    >
      <div className="flex items-center gap-2.5">
        {isRecording || isPaused || isCounting ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    onClick={onStopRecord}
                    aria-label="Stop and keep take"
                    className="studio-rec-stop-btn h-9 rounded-full px-4 text-[12.5px] font-semibold"
                  >
                    <Square className="size-3.5 fill-current" />
                    <span>Stop</span>
                  </Button>
                }
              />
              <TooltipContent side="top">Stop recording and layer take (R)</TooltipContent>
            </Tooltip>

            {!isCounting ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={isRecording ? onPauseRecord : onResumeRecord}
                      aria-label={isRecording ? "Pause recording" : "Resume recording"}
                      className="h-9 w-9 rounded-full"
                    >
                      {isRecording ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                  }
                />
                <TooltipContent side="top">{isRecording ? "Pause take" : "Resume take"}</TooltipContent>
              </Tooltip>
            ) : null}
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              onClick={onStartRecord}
              aria-label="Record layer"
              className="studio-rec-trigger-btn h-9 gap-2 rounded-full px-4 text-[12.5px] font-semibold"
            >
              <span className="studio-rec-dot" aria-hidden />
              <span>Record</span>
            </Button>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    onClick={isPlaying ? onPausePlay : onPlay}
                    aria-label={isPlaying ? "Pause playback" : "Play mix"}
                    className="h-9 w-9 rounded-full"
                  >
                    {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </Button>
                }
              />
              <TooltipContent side="top">{isPlaying ? "Pause (Space)" : "Play mix (Space)"}</TooltipContent>
            </Tooltip>
          </>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={micReady ? "secondary" : "ghost"}
                onClick={onArmMic}
                aria-label={micReady ? "Mic armed and live" : "Test microphone"}
                className="h-9 w-9 rounded-full"
              >
                {micReady ? <Mic className="size-3.5 text-[#fc3a34]" /> : <MicOff className="size-3.5" />}
              </Button>
            }
          />
          <TooltipContent side="top">{micReady ? "Mic live" : "Arm mic input"}</TooltipContent>
        </Tooltip>
      </div>

      <div className="relative order-last min-w-full flex-1 sm:order-none sm:min-w-0">
        <canvas
          ref={canvasRef}
          className="block h-[54px] w-full rounded-xl"
          aria-hidden
        />
        {isCounting && countInBeat !== null ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-background/85 px-3 py-0.5 font-mono text-[13px] font-semibold tracking-wider text-[#fc3a34]">
              Count-in · {countInBeat}
            </span>
          </div>
        ) : !micReady && transport === "idle" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center">
            <span className="truncate rounded-full bg-background/85 px-3 py-0.5 text-[11.5px] font-medium tracking-wide text-muted-foreground">
              Voice-reactive crimson meter — arm mic or press Record (R)
            </span>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:ml-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDropMarker}
                className="h-8 gap-1.5 rounded-full px-3 text-[12px]"
              >
                <BookmarkPlus className="size-3.5" />
                <span className="hidden sm:inline">Marker</span>
              </Button>
            }
          />
          <TooltipContent side="top">Drop marker at playhead (M)</TooltipContent>
        </Tooltip>

        <div className="flex flex-col items-end font-mono leading-tight tabular-nums">
          <span
            ref={timeLabelRef}
            className={`text-[13.5px] font-semibold ${isRecording ? "text-[#fc3a34]" : "text-foreground"}`}
          >
            00:00.00
          </span>
          <span ref={dbLabelRef} className="text-[10px] text-muted-foreground">
            -∞ dB
          </span>
        </div>
      </div>
    </div>
  );
}
