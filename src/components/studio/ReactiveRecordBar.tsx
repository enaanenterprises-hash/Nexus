"use client";

import { useEffect, useRef } from "react";
import { BookmarkPlus, Pause, Play, SkipBack } from "lucide-react";
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

function formatRemaining(playheadMs: number, totalMs: number): string {
  const remMs = Math.max(0, totalMs - playheadMs);
  const mins = Math.floor(remMs / 60_000);
  const secs = Math.floor((remMs % 60_000) / 1000);
  return `-${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Edit-page top playback & waveform scrub strip: dedicated exclusively to playing,
 * rewinding, scrubbing across the dual-tone mix preview, and dropping markers.
 */
export function ReactiveRecordBar({
  transport,
  micReady,
  playheadMs,
  totalTimelineMs = 0,
  summaryPeaks = [],
  countInBeat,
  theme,
  sampleTelemetry,
  onSeek,
  onPlay,
  onPausePlay,
  onDropMarker,
}: {
  transport: StudioTransportState;
  micReady: boolean;
  playheadMs: number;
  totalTimelineMs?: number;
  summaryPeaks?: number[];
  countInBeat: number | null;
  theme: "dark" | "light";
  sampleTelemetry: () => LiveAudioTelemetry;
  onSeek?: (ms: number) => void;
  onPlay: () => void;
  onPausePlay: () => void;
  onDropMarker: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const remainingLabelRef = useRef<HTMLSpanElement>(null);

  const transportRef = useRef(transport);
  const micReadyRef = useRef(micReady);
  const themeRef = useRef(theme);
  const playheadRef = useRef(playheadMs);
  const totalRef = useRef(totalTimelineMs);
  const peaksRef = useRef(summaryPeaks);
  const sampleRef = useRef(sampleTelemetry);

  useEffect(() => {
    transportRef.current = transport;
    micReadyRef.current = micReady;
    themeRef.current = theme;
    playheadRef.current = playheadMs;
    totalRef.current = totalTimelineMs;
    peaksRef.current = summaryPeaks;
    sampleRef.current = sampleTelemetry;
  }, [transport, micReady, theme, playheadMs, totalTimelineMs, summaryPeaks, sampleTelemetry]);

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
      const total = totalRef.current;

      if (timeLabelRef.current) {
        const displayMs =
          state === "recording" || state === "paused" ? tel.recordingProgressMs : playheadRef.current;
        timeLabelRef.current.textContent = formatTimecode(displayMs);
      }
      if (remainingLabelRef.current) {
        if (tel.clipped) {
          remainingLabelRef.current.textContent = "CLIP";
        } else if (total > 0) {
          remainingLabelRef.current.textContent = formatRemaining(playheadRef.current, total);
        } else {
          const db = tel.rms > 0.0015 ? Math.max(-60, Math.round(20 * Math.log10(tel.rms))) : -60;
          remainingLabelRef.current.textContent = db <= -60 ? "-00:00" : `${db} dB`;
        }
      }

      ctx.clearRect(0, 0, width, height);

      const cy = height * 0.5;
      const maxAmpH = height * 0.42;
      const step = Math.max(4.5, Math.min(6.5, width / 115));
      const barCount = Math.max(32, Math.floor(width / step));
      const barW = Math.max(1.8, Math.min(2.8, step * 0.45));
      const peaks = peaksRef.current;
      const splitRatio =
        total > 0 ? Math.max(0.15, Math.min(0.85, playheadRef.current / Math.max(1, total))) : 0.44;
      const splitIdx = Math.floor(barCount * splitRatio);

      // Subtle center-right red ambient glow mirroring Image 2's bar feel
      const energy = Math.min(1, tel.rms * 1.2 + tel.peak * 0.2);
      if (energy > 0.015 || peaks.length > 0 || isRec) {
        const glowGrad = ctx.createRadialGradient(
          width * 0.62,
          cy,
          4,
          width * 0.62,
          cy,
          width * 0.36,
        );
        glowGrad.addColorStop(0, `rgba(252, 48, 42, ${isRec ? 0.24 : 0.11})`);
        glowGrad.addColorStop(1, "rgba(252, 48, 42, 0)");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, width, height);
      }

      for (let i = 0; i < barCount; i++) {
        const x = i * step + (step - barW) * 0.5;
        const normX = i / Math.max(1, barCount - 1);
        const edgeFade = Math.sin(normX * Math.PI);

        let amp = 0.05;
        if (isRec || (isArmed && tel.rms > 0.012)) {
          const distFromCenter = Math.abs(normX - 0.55) * 2;
          const bIdx = Math.min(
            tel.bands.length - 1,
            Math.floor(Math.min(1, distFromCenter) * (tel.bands.length * 0.82)),
          );
          const bandVal = tel.bands[bIdx] ?? 0;
          amp = Math.max(0.05, bandVal * (0.65 + 0.55 * edgeFade) + tel.rms * 0.32);
        } else if (peaks.length > 0) {
          const pIdx = Math.min(peaks.length - 1, Math.floor(normX * peaks.length));
          const p = peaks[pIdx] ?? 0.08;
          const playPulse =
            isPlay && !reduceMotion ? 0.85 + 0.25 * Math.sin(nowMs * 0.012 + i * 0.35) : 1;
          amp = Math.max(0.04, Math.min(1, p * playPulse * (0.35 + 0.65 * edgeFade)));
        } else {
          const idleShimmer =
            !reduceMotion && isArmed
              ? 0.04 + 0.025 * Math.sin(nowMs * 0.003 + i * 0.32)
              : 0.035;
          amp = idleShimmer * (0.3 + 0.7 * edgeFade);
        }

        const barH = Math.max(2.2, Math.min(maxAmpH * 2, amp * maxAmpH * 2));
        const y = cy - barH * 0.5;
        const isCrimsonSide = i >= splitIdx;

        if (isCrimsonSide) {
          const hot = Math.min(1, amp * 1.25);
          ctx.fillStyle = isLight
            ? `rgba(${Math.round(196 + hot * 36)}, 24, 28, ${(0.35 + edgeFade * 0.55) * (peaks.length > 0 || isArmed ? 1 : 0.45)})`
            : `rgba(255, ${Math.round(44 + hot * 42)}, ${Math.round(38 + hot * 24)}, ${
                (0.32 + edgeFade * 0.62) * (peaks.length > 0 || isArmed ? 1 : 0.45)
              })`;
        } else {
          ctx.fillStyle = isLight
            ? `rgba(28, 30, 36, ${(0.24 + edgeFade * 0.46) * (peaks.length > 0 || isArmed ? 1 : 0.5)})`
            : `rgba(205, 210, 220, ${(0.22 + edgeFade * 0.5) * (peaks.length > 0 || isArmed ? 1 : 0.45)})`;
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW * 0.5);
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
  const isCounting = transport === "counting-in";
  const isPlaying = transport === "playing";

  return (
    <div
      className="studio-record-bar"
      data-state={transport}
      data-armed={micReady ? "true" : "false"}
      role="region"
      aria-label="Edit playback transport bar"
    >
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => onSeek?.(0)}
                aria-label="Return playhead to start"
                className="h-9 w-9 rounded-full border-border/80 bg-background/40"
              >
                <SkipBack className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="top">Jump to start</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={isPlaying ? onPausePlay : onPlay}
                aria-label={isPlaying ? "Pause playback" : "Play mix"}
                className={`h-9 gap-2 rounded-full border-border/80 px-4 text-[12.5px] font-medium ${
                  isPlaying ? "bg-foreground text-background hover:bg-foreground/90" : "bg-background/45"
                }`}
              >
                {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </Button>
            }
          />
          <TooltipContent side="top">{isPlaying ? "Pause (Space)" : "Play mix (Space)"}</TooltipContent>
        </Tooltip>
      </div>

      <div className="relative order-last min-w-full flex-1 sm:order-none sm:min-w-0">
        <canvas
          ref={canvasRef}
          onClick={(e) => {
            if (!onSeek || totalTimelineMs <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            onSeek(Math.round(ratio * totalTimelineMs));
          }}
          className="block h-[50px] w-full cursor-pointer rounded-xl"
          aria-label="Overview mix waveform scrub bar"
        />
        {isCounting && countInBeat !== null ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-background/85 px-3 py-0.5 font-mono text-[13px] font-semibold tracking-wider text-[#fc3a34]">
              Count-in · {countInBeat}
            </span>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3 sm:ml-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDropMarker}
                className="h-8 gap-1.5 rounded-full border-border/80 bg-background/40 px-3 text-[12px]"
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
            className={`text-[13px] font-medium ${isRecording ? "text-[#fc3a34]" : "text-foreground"}`}
          >
            00:00.00
          </span>
          <span ref={remainingLabelRef} className="text-[10.5px] text-muted-foreground">
            -00:00
          </span>
        </div>
      </div>
    </div>
  );
}
