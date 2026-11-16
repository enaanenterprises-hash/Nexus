"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import type { StudioMarkerV1, StudioTrackV1 } from "@/lib/studio/types";

const ROLE_COLORS_DARK: Record<StudioTrackV1["role"], string> = {
  voice: "252, 72, 64",
  overdub: "240, 181, 74",
  instrumental: "228, 228, 234",
  scratch: "161, 161, 170",
};

const ROLE_COLORS_LIGHT: Record<StudioTrackV1["role"], string> = {
  voice: "204, 24, 30",
  overdub: "184, 120, 16",
  instrumental: "24, 24, 28",
  scratch: "113, 113, 122",
};

function formatRulerSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Multi-track waveform canvas + time ruler + marker flags with pointer scrubbing.
 */
export function TimelineWaveform({
  tracks,
  markers,
  playheadMs,
  totalTimelineMs,
  bpm,
  selectedTrackId,
  theme,
  onSelectTrack,
  onSeek,
  onSelectMarker,
}: {
  tracks: StudioTrackV1[];
  markers: StudioMarkerV1[];
  playheadMs: number;
  totalTimelineMs: number;
  bpm: number;
  selectedTrackId: string | null;
  theme: "dark" | "light";
  onSelectTrack: (trackId: string) => void;
  onSeek: (ms: number) => void;
  onSelectMarker: (marker: StudioMarkerV1) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubbingRef = useRef(false);

  const laneHeight = 64;
  const rulerHeight = 28;
  const minWidthMs = Math.max(12_000, totalTimelineMs + 2500, playheadMs + 1500);
  const canvasHeight = rulerHeight + Math.max(1, tracks.length) * laneHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const isLight = theme === "light";

    ctx.clearRect(0, 0, width, height);

    // 1. Top time ruler + beat ticks
    ctx.fillStyle = isLight ? "rgba(9, 9, 11, 0.035)" : "rgba(255, 255, 255, 0.03)";
    ctx.fillRect(0, 0, width, rulerHeight);

    const beatMs = 60_000 / Math.max(40, bpm);
    const totalBeats = Math.floor(minWidthMs / beatMs);
    const pxPerMs = width / minWidthMs;

    ctx.strokeStyle = isLight ? "rgba(9, 9, 11, 0.08)" : "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    const beatStep = totalBeats > 80 ? 4 : totalBeats > 40 ? 2 : 1;
    ctx.beginPath();
    for (let b = 0; b <= totalBeats; b += beatStep) {
      const x = b * beatMs * pxPerMs;
      const isBar = b % 4 === 0;
      ctx.moveTo(x, isBar ? rulerHeight - 10 : rulerHeight - 5);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    // Time labels cleanly spaced
    const stepSec = minWidthMs > 90_000 ? 15 : minWidthMs > 36_000 ? 10 : 5;
    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = isLight ? "rgba(17, 17, 19, 0.58)" : "rgba(244, 244, 246, 0.56)";
    for (let sec = 0; sec * 1000 <= minWidthMs; sec += stepSec) {
      const x = sec * 1000 * pxPerMs;
      if (x > width - 28) break;
      ctx.fillText(formatRulerSec(sec), x + 5, 16);
    }

    // Ruler bottom hairline
    ctx.strokeStyle = isLight ? "rgba(9, 9, 11, 0.1)" : "rgba(255, 255, 255, 0.09)";
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight);
    ctx.lineTo(width, rulerHeight);
    ctx.stroke();

    const anySolo = tracks.some((t) => t.solo);
    const rolePalette = isLight ? ROLE_COLORS_LIGHT : ROLE_COLORS_DARK;

    // 2. Track waveform lanes
    for (let idx = 0; idx < tracks.length; idx++) {
      const tr = tracks[idx]!;
      const yTop = rulerHeight + idx * laneHeight;
      const midY = yTop + laneHeight * 0.5;
      const isSelected = tr.id === selectedTrackId;
      const audible = anySolo ? tr.solo : !tr.muted;

      if (isSelected) {
        ctx.fillStyle = isLight ? "rgba(184, 120, 16, 0.06)" : "rgba(240, 181, 74, 0.06)";
        ctx.fillRect(0, yTop, width, laneHeight);
      }

      ctx.strokeStyle = isLight ? "rgba(9, 9, 11, 0.08)" : "rgba(255, 255, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(0, yTop + laneHeight);
      ctx.lineTo(width, yTop + laneHeight);
      ctx.stroke();

      const x0 = tr.offsetMs * pxPerMs;
      const clipW = Math.max(8, tr.durationMs * pxPerMs);
      const rgb = rolePalette[tr.role] ?? rolePalette.voice;

      // Subtle clip container fill
      ctx.fillStyle = `rgba(${rgb}, ${audible ? 0.09 : 0.035})`;
      ctx.strokeStyle = `rgba(${rgb}, ${audible ? (isSelected ? 0.55 : 0.28) : 0.14})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x0, yTop + 6, clipW, laneHeight - 12, 8);
      ctx.fill();
      ctx.stroke();

      // Waveform peaks cleanly rendered inside clip container
      const peaks = tr.peaks;
      if (peaks.length > 0) {
        const innerMaxH = (laneHeight - 20) * 0.48;
        const bars = Math.min(peaks.length, Math.max(12, Math.floor(clipW / 3)));
        const stepW = clipW / bars;
        ctx.fillStyle = `rgba(${rgb}, ${audible ? 0.86 : 0.28})`;
        for (let b = 0; b < bars; b++) {
          const pIdx = Math.min(peaks.length - 1, Math.floor((b / bars) * peaks.length));
          const p = Math.max(0.05, Math.min(1, peaks[pIdx]! * Math.min(1.5, tr.gain)));
          const barH = Math.max(2, p * innerMaxH * 2);
          const bx = x0 + b * stepW + 1;
          ctx.fillRect(bx, midY - barH * 0.5, Math.max(1.5, stepW * 0.65), barH);
        }
      }
    }

    // 3. Markers along ruler
    for (const m of markers) {
      const mx = clampX(m.atMs * pxPerMs, width);
      ctx.strokeStyle = isLight ? "rgba(184, 120, 16, 0.72)" : "rgba(240, 181, 74, 0.72)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, rulerHeight);
      ctx.lineTo(mx, height);
      ctx.stroke();

      ctx.fillStyle = isLight ? "#b87810" : "#f0b54a";
      ctx.beginPath();
      ctx.moveTo(mx - 4, rulerHeight - 9);
      ctx.lineTo(mx + 4, rulerHeight - 9);
      ctx.lineTo(mx, rulerHeight - 1);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Crimson master playhead line
    const playX = clampX(playheadMs * pxPerMs, width);
    ctx.strokeStyle = isLight ? "#c4161c" : "#fc3a34";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();

    ctx.fillStyle = isLight ? "#c4161c" : "#fc3a34";
    ctx.beginPath();
    ctx.arc(playX, rulerHeight - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [bpm, markers, minWidthMs, playheadMs, selectedTrackId, theme, tracks]);

  function msAtClientX(e: PointerEvent<HTMLCanvasElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(u * minWidthMs);
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    if (localY <= rulerHeight) {
      const targetMs = msAtClientX(e);
      const hitMarker = markers.find((m) => Math.abs((m.atMs - targetMs) / minWidthMs) * rect.width < 10);
      if (hitMarker) {
        onSelectMarker(hitMarker);
        onSeek(hitMarker.atMs);
        return;
      }
    } else {
      const trackIdx = Math.floor((localY - rulerHeight) / laneHeight);
      const hitTrack = tracks[trackIdx];
      if (hitTrack) onSelectTrack(hitTrack.id);
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    onSeek(msAtClientX(e));
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!scrubbingRef.current) return;
    onSeek(msAtClientX(e));
  }

  function handlePointerUp() {
    scrubbingRef.current = false;
  }

  return (
    <div className="studio-timeline-shell relative w-full overflow-hidden rounded-2xl border border-border/80">
      <canvas
        ref={canvasRef}
        style={{ height: `${canvasHeight}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="block w-full cursor-ew-resize select-none"
        aria-label="Multi-track audio timeline"
      />
      {tracks.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-[28px] bottom-0 flex items-center justify-center">
          <p className="text-[13px] text-muted-foreground">
            Your timeline is clear. Record a layer or import an audio stem to build a mix.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function clampX(x: number, width: number): number {
  return Math.max(1, Math.min(width - 1, x));
}
