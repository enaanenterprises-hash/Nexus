"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Link2,
  Pause,
  Play,
  Scissors,
  SkipBack,
} from "lucide-react";

type NodeId = "studio" | "cinema";
type GradeId = "Natural" | "Alpine" | "Noir";

type NodeDef = {
  id: NodeId;
  monogram: string;
  name: string;
  tagline: string;
  statusLabel: string;
  scope: string;
};

const NODE_ITEMS: readonly NodeDef[] = [
  {
    id: "studio",
    monogram: "St",
    name: "Recording Studio",
    tagline: "Multi-track stem & arrange editor",
    statusLabel: "Live",
    scope: "content:studio.recording:read",
  },
  {
    id: "cinema",
    monogram: "Cn",
    name: "Cinema",
    tagline: "Multi-track timeline video editor",
    statusLabel: "Live",
    scope: "content:cinema.project:read",
  },
] as const;

type WaveProfile = "voice" | "ambient" | "piano" | "swell";

function buildWaveform(seed: number, count: number, profile: WaveProfile): number[] {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const waveA = Math.abs(Math.sin(i * 0.62 + seed * 1.7));
    const waveB = Math.abs(Math.cos(i * 1.35 + seed * 0.9));
    let amp = 0.4;

    if (profile === "voice") {
      const phrase = Math.abs(Math.sin(t * Math.PI * 3.5 + seed)) > 0.24 ? 1 : 0.28;
      amp = (0.34 + 0.54 * waveA * 0.65 + 0.35 * waveB) * phrase;
    } else if (profile === "ambient") {
      amp = 0.22 + 0.24 * Math.sin(t * Math.PI) + 0.16 * waveA;
    } else if (profile === "piano") {
      const hit = Math.pow(Math.abs(Math.sin(t * Math.PI * 5 + seed * 0.4)), 0.7);
      amp = 0.26 + 0.56 * hit * (0.65 + 0.35 * waveB);
    } else {
      const env = Math.sin(t * Math.PI);
      amp = 0.18 + 0.68 * env * (0.6 + 0.4 * waveA);
    }

    bars.push(Math.max(12, Math.min(94, Math.round(amp * 100))));
  }
  return bars;
}

function scrubPercentFromClick(e: MouseEvent<HTMLDivElement>): number {
  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  return Math.max(1, Math.min(99, pct));
}

function TimelinePlayhead({ pct, topOffsetPx }: { pct: number; topOffsetPx?: number }) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 z-30 w-[1.5px] bg-[#ff3b30]"
      style={{
        left: `${pct}%`,
        top: topOffsetPx ?? 0,
      }}
      aria-hidden="true"
    >
      <span className="absolute -left-[4.5px] -top-0.5 h-2.5 w-[10.5px] rounded-b-[3px] rounded-t-[2px] bg-[#ff3b30] shadow-xs" />
    </div>
  );
}

type StudioClipDef = {
  id: string;
  filename: string;
  duration: string;
  leftPct: number;
  widthPct: number;
  bars: number[];
};

type StudioTrackDef = {
  id: string;
  name: string;
  shortName: string;
  hex: string;
  tint: string;
  border: string;
  dbLabel: string;
  gainPct: number;
  clips: StudioClipDef[];
};

const STUDIO_TRACKS: readonly StudioTrackDef[] = [
  {
    id: "narration",
    name: "Lead Narration",
    shortName: "Narration",
    hex: "#ff453a",
    tint: "rgba(255, 69, 58, 0.13)",
    border: "rgba(255, 69, 58, 0.44)",
    dbLabel: "+0.0 dB",
    gainPct: 82,
    clips: [
      {
        id: "nar-1",
        filename: "narration-intro-v2.wav",
        duration: "0:05.9",
        leftPct: 3,
        widthPct: 37,
        bars: buildWaveform(1.2, 28, "voice"),
      },
      {
        id: "nar-2",
        filename: "summit-take-03.wav",
        duration: "0:06.5",
        leftPct: 50,
        widthPct: 42,
        bars: buildWaveform(3.4, 32, "voice"),
      },
    ],
  },
  {
    id: "ambience",
    name: "Alpine Ambience",
    shortName: "Ambience",
    hex: "#d4d4d8",
    tint: "rgba(212, 212, 216, 0.1)",
    border: "rgba(212, 212, 216, 0.34)",
    dbLabel: "-6.5 dB",
    gainPct: 58,
    clips: [
      {
        id: "amb-1",
        filename: "dolomites-wind-stereo.wav",
        duration: "0:15.8",
        leftPct: 0.5,
        widthPct: 97.5,
        bars: buildWaveform(2.1, 64, "ambient"),
      },
    ],
  },
  {
    id: "piano",
    name: "Felt Piano Bed",
    shortName: "Piano Bed",
    hex: "#d4a373",
    tint: "rgba(212, 163, 115, 0.13)",
    border: "rgba(212, 163, 115, 0.42)",
    dbLabel: "-3.2 dB",
    gainPct: 72,
    clips: [
      {
        id: "pno-1",
        filename: "felt-piano-chords.wav",
        duration: "0:07.6",
        leftPct: 6,
        widthPct: 48,
        bars: buildWaveform(4.5, 36, "piano"),
      },
      {
        id: "pno-2",
        filename: "piano-resolve-118bpm.wav",
        duration: "0:06.4",
        leftPct: 57,
        widthPct: 39,
        bars: buildWaveform(5.8, 30, "piano"),
      },
    ],
  },
  {
    id: "cello",
    name: "Cello Swell",
    shortName: "Cello",
    hex: "#f47266",
    tint: "rgba(244, 114, 102, 0.13)",
    border: "rgba(244, 114, 102, 0.42)",
    dbLabel: "-4.8 dB",
    gainPct: 66,
    clips: [
      {
        id: "cel-1",
        filename: "cello-ridge-swell.wav",
        duration: "0:09.6",
        leftPct: 26,
        widthPct: 61,
        bars: buildWaveform(6.9, 44, "swell"),
      },
    ],
  },
] as const;

const STUDIO_CUES = [
  { label: "Intro", pct: 5 },
  { label: "Ridge Cut", pct: 50 },
  { label: "Swell", pct: 74 },
] as const;

const STUDIO_RULER_MARKS = [
  { label: "0:00", pct: 0 },
  { label: "0:04", pct: 25 },
  { label: "0:08", pct: 50 },
  { label: "0:12", pct: 75 },
  { label: "0:16", pct: 98 },
] as const;

const STUDIO_TOTAL_SEC = 16.0;

function formatStudioClock(pct: number): string {
  const sec = (pct / 100) * STUDIO_TOTAL_SEC;
  const whole = Math.floor(sec);
  const tenths = Math.floor((sec - whole) * 10);
  const secs = String(whole % 60).padStart(2, "0");
  return `00:${secs}.${tenths}`;
}

function RecordingStudioArrangePreview() {
  const [playing, setPlaying] = useState(true);
  const [playheadPct, setPlayheadPct] = useState(34);
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [soloIds, setSoloIds] = useState<string[]>([]);

  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setPlayheadPct((prev) => {
        const next = prev + dt * 5.8;
        return next > 98 ? 2 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  const toggleMute = (id: string) => {
    setMutedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSolo = (id: string) => {
    setSoloIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const isTrackAudible = (id: string) => {
    if (mutedIds.includes(id)) return false;
    if (soloIds.length > 0 && !soloIds.includes(id)) return false;
    return true;
  };

  const activeStemCount = STUDIO_TRACKS.filter((t) => isTrackAudible(t.id)).length;

  const handleScrub = useCallback((e: MouseEvent<HTMLDivElement>) => {
    setPlayheadPct(scrubPercentFromClick(e));
  }, []);

  return (
    <div className="flex flex-col bg-[#050508] text-[#f5f5f7]">
      {/* Studio Top Capsule Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] bg-[#09090d] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-[#f5f5f7]">
            Dolomites Film Score
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-[#8e8e95]" aria-hidden="true" />
        </div>

        <div className="inline-flex items-center rounded-full border border-white/[0.1] bg-[#121319] p-0.5 text-[11px]">
          <span className="rounded-full px-2.5 py-0.5 text-[#8e8e95]">Record</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.14] px-2.5 py-0.5 font-medium text-[#f5f5f7]">
            <span>Arrange</span>
            <span className="rounded-full bg-white/[0.14] px-1.5 text-[10px] tabular-nums text-[#e4e4e9]">
              {STUDIO_TRACKS.length}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f0b54a]/35 bg-[#f0b54a]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#f0b54a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f0b54a]" aria-hidden="true" />
            <Link2 className="size-3" aria-hidden="true" />
            <span>Links</span>
          </span>
          <span className="rounded-full bg-[#f5f5f7] px-2.5 py-0.5 text-[11px] font-medium text-[#09090b]">
            Export
          </span>
        </div>
      </div>

      {/* Transport & Arrange Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#0c0c11] px-3.5 py-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPlayheadPct(2)}
            aria-label="Rewind studio arrange playhead"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[#d1d1d6] transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <SkipBack className="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause studio arrange preview" : "Play studio arrange preview"}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#f5f5f7] text-[#09090b] transition-colors hover:bg-white"
          >
            {playing ? (
              <Pause className="size-3 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-3 translate-x-[0.5px] fill-current" aria-hidden="true" />
            )}
          </button>
          <span className="font-mono text-[12px] text-[#f5f5f7] tabular-nums">
            {formatStudioClock(playheadPct)}{" "}
            <span className="text-[#8e8e95]">/ 00:16.0</span>
          </span>
          <span className="hidden items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[11px] text-[#d1d1d6] sm:inline-flex">
            <Scissors className="size-3 text-[#a1a1a6]" aria-hidden="true" />
            <span>Split</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
          <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-[#d4d4d8]">
            118 BPM
          </span>
          <span className="rounded-full border border-white/[0.18] bg-white/[0.1] px-2 py-0.5 font-medium text-[#f5f5f7]">
            Snap
          </span>
          <span className="hidden rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-[#a1a1a6] sm:inline-flex">
            1.5×
          </span>
        </div>
      </div>

      {/* Multi-Track Arrange Grid */}
      <div className="flex min-w-0">
        {/* Left Track Mixer Column */}
        <div className="w-[116px] shrink-0 border-r border-white/[0.08] bg-[#09090d] sm:w-[174px]">
          <div className="flex h-[34px] items-center justify-between border-b border-white/[0.08] px-2.5 text-[11px] text-[#8e8e95]">
            <span>{STUDIO_TRACKS.length} Tracks</span>
            <span className="hidden font-mono text-[10px] text-[#8e8e95] sm:inline">48kHz</span>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {STUDIO_TRACKS.map((track) => {
              const muted = mutedIds.includes(track.id);
              const solo = soloIds.includes(track.id);
              const audible = isTrackAudible(track.id);
              return (
                <div
                  key={track.id}
                  className={`flex h-[58px] flex-col justify-between px-2.5 py-2 transition-opacity ${
                    audible ? "opacity-100" : "opacity-55"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: track.hex }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-[11px] font-medium text-[#e4e4e9]">
                        <span className="sm:hidden">{track.shortName}</span>
                        <span className="hidden sm:inline">{track.name}</span>
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleMute(track.id)}
                        aria-pressed={muted}
                        aria-label={`Mute ${track.name}`}
                        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-[4px] border text-[9px] font-semibold transition-colors ${
                          muted
                            ? "border-[#ff453a]/65 bg-[#ff453a]/25 text-[#ff847d]"
                            : "border-white/[0.12] bg-white/[0.04] text-[#9d9da6] hover:text-white"
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSolo(track.id)}
                        aria-pressed={solo}
                        aria-label={`Solo ${track.name}`}
                        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-[4px] border text-[9px] font-semibold transition-colors ${
                          solo
                            ? "border-[#f0b54a]/70 bg-[#f0b54a]/25 text-[#f0b54a]"
                            : "border-white/[0.12] bg-white/[0.04] text-[#9d9da6] hover:text-white"
                        }`}
                      >
                        S
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.09]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${track.gainPct}%`,
                          backgroundColor: track.hex,
                        }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[9.5px] text-[#9d9da6] tabular-nums">
                      {track.dbLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Waveform Arrange Lanes */}
        <div
          onClick={handleScrub}
          role="slider"
          tabIndex={0}
          aria-label="Recording Studio arrange timeline scrub"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(playheadPct)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPlayheadPct((p) => Math.max(1, p - 4));
            if (e.key === "ArrowRight") setPlayheadPct((p) => Math.min(99, p + 4));
          }}
          className="relative min-w-0 flex-1 cursor-pointer select-none overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/75"
        >
          {/* Subtle bar gridlines */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {[12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((x) => (
              <span
                key={x}
                className="absolute inset-y-0 w-px bg-white/[0.04]"
                style={{ left: `${x}%` }}
              />
            ))}
          </div>

          {/* Time Ruler + Nexus Gold Cue Markers (separated top cue row + bottom timecode row) */}
          <div className="relative h-[34px] border-b border-white/[0.08] bg-[#09090d]">
            {STUDIO_CUES.map((cue) => (
              <span
                key={cue.label}
                className="pointer-events-none absolute top-1 inline-flex items-center gap-1 rounded-[4px] border border-[#f0b54a]/40 bg-[#f0b54a]/12 px-1 py-[1px] text-[8.5px] leading-none font-medium text-[#f0b54a]"
                style={{ left: `${cue.pct}%` }}
              >
                <span className="h-1 w-1 rounded-full bg-[#f0b54a]" aria-hidden="true" />
                <span className="hidden sm:inline">{cue.label}</span>
              </span>
            ))}

            {STUDIO_RULER_MARKS.map((mark) => (
              <span
                key={mark.label}
                className="absolute bottom-0.5 font-mono text-[9.5px] leading-none text-[#8e8e95] tabular-nums"
                style={{
                  left: `${mark.pct}%`,
                  transform:
                    mark.pct === 0
                      ? "translateX(6px)"
                      : mark.pct >= 95
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {mark.label}
              </span>
            ))}
          </div>

          {/* 4 Populated Audio Stem Lanes */}
          <div className="divide-y divide-white/[0.06]">
            {STUDIO_TRACKS.map((track) => {
              const audible = isTrackAudible(track.id);
              return (
                <div
                  key={track.id}
                  className={`relative h-[58px] transition-opacity ${
                    audible ? "opacity-100" : "opacity-35"
                  }`}
                >
                  {track.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className="absolute bottom-[5px] top-[5px] flex flex-col justify-between overflow-hidden rounded-[8px] border px-2 py-1"
                      style={{
                        left: `${clip.leftPct}%`,
                        width: `${clip.widthPct}%`,
                        backgroundColor: track.tint,
                        borderColor: track.border,
                      }}
                    >
                      {/* Fade-in / fade-out corner ramps */}
                      <span
                        className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-b border-r border-white/[0.18] bg-white/[0.05]"
                        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
                        aria-hidden="true"
                      />
                      <span
                        className="pointer-events-none absolute right-0 top-0 h-3 w-3 border-b border-l border-white/[0.18] bg-white/[0.05]"
                        style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
                        aria-hidden="true"
                      />

                      <div className="relative z-10 flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate font-mono text-[9.5px] font-medium text-[#f5f5f7]">
                          {clip.filename}
                        </span>
                        <span className="hidden shrink-0 font-mono text-[9px] text-[#d1d1d6] tabular-nums sm:inline">
                          {clip.duration}
                        </span>
                      </div>

                      {/* Mirrored Deterministic Bar Waveform */}
                      <div
                        className="relative z-10 flex h-[24px] w-full items-center gap-[1.5px]"
                        aria-hidden="true"
                      >
                        {clip.bars.map((heightPct, idx) => (
                          <span
                            key={idx}
                            className="min-w-[1px] flex-1 rounded-full"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: track.hex,
                              opacity: 0.85,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <TimelinePlayhead pct={playheadPct} />
        </div>
      </div>

      {/* Bottom Studio Bus Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#09090d] px-3.5 py-2 text-[11px]">
        <span className="font-mono text-[#a1a1a6] tabular-nums">
          48 kHz · 24-bit stereo bus · {activeStemCount} stems active
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f0b54a]/35 bg-[#f0b54a]/10 px-2.5 py-0.5 font-medium text-[#f0b54a]">
          <Link2 className="size-3" aria-hidden="true" />
          <span>Stems synced → Cinema</span>
        </span>
      </div>
    </div>
  );
}

type GradePreset = {
  filter: string;
  contrast: string;
  saturation: string;
  warmth: string;
  contrastPct: number;
  saturationPct: number;
  warmthPct: number;
};

const GRADE_PRESETS: Record<GradeId, GradePreset> = {
  Natural: {
    filter: "contrast(1.04) saturate(1.06)",
    contrast: "1.04",
    saturation: "1.06",
    warmth: "+4",
    contrastPct: 58,
    saturationPct: 56,
    warmthPct: 62,
  },
  Alpine: {
    filter: "contrast(1.14) saturate(1.2) brightness(1.03) hue-rotate(-5deg)",
    contrast: "1.14",
    saturation: "1.20",
    warmth: "-8",
    contrastPct: 72,
    saturationPct: 76,
    warmthPct: 36,
  },
  Noir: {
    filter: "grayscale(0.92) contrast(1.28) brightness(0.96)",
    contrast: "1.28",
    saturation: "0.08",
    warmth: "0",
    contrastPct: 86,
    saturationPct: 12,
    warmthPct: 50,
  },
};

const GRADE_ORDER: readonly GradeId[] = ["Natural", "Alpine", "Noir"] as const;

const CINEMA_SCORE_WAVE = buildWaveform(2.7, 56, "piano");

const CINEMA_RULER_MARKS = [
  { label: "0:00", pct: 0 },
  { label: "0:06", pct: 33.3 },
  { label: "0:12", pct: 66.6 },
  { label: "0:18", pct: 98 },
] as const;

const CINEMA_TOTAL_SEC = 18.0;

function formatSmpte(pct: number): string {
  const sec = (pct / 100) * CINEMA_TOTAL_SEC;
  const whole = Math.floor(sec);
  const frames = Math.floor((sec - whole) * 30);
  return `00:${String(whole).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function getStereoLevels(pct: number): { left: number; right: number } {
  const phase = (pct / 100) * Math.PI * 6;
  const left = Math.max(4, Math.min(10, Math.round(6 + 3.2 * Math.sin(phase) + Math.cos(phase * 1.9))));
  const right = Math.max(4, Math.min(10, Math.round(5.8 + 3.1 * Math.cos(phase * 0.9 + 0.5))));
  return { left, right };
}

function CinemaEditorPreview() {
  const [playing, setPlaying] = useState(true);
  const [playheadPct, setPlayheadPct] = useState(28);
  const [grade, setGrade] = useState<GradeId>("Natural");

  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setPlayheadPct((prev) => {
        const next = prev + dt * 5.2;
        return next > 98 ? 2 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  const handleScrub = useCallback((e: MouseEvent<HTMLDivElement>) => {
    setPlayheadPct(scrubPercentFromClick(e));
  }, []);

  const currentGrade = GRADE_PRESETS[grade];
  const meter = getStereoLevels(playheadPct);
  const showOpeningTitle = playheadPct < 54;
  const videoScale = 1 + (playheadPct / 100) * 0.045;

  return (
    <div className="flex flex-col bg-[#020204] text-[#f5f5f7]">
      {/* Cinema Top Darkroom Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] bg-[#060609] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-[#f5f5f7]">
            Dolomites Reel — Cut 04
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-[#8e8e95]" aria-hidden="true" />
        </div>

        <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] text-[#d1d1d6] tabular-nums">
          16:9 · 30fps · <span className="text-[#f0b54a]">118 BPM</span>
        </span>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f0b54a]/35 bg-[#f0b54a]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#f0b54a]">
            <Link2 className="size-3" aria-hidden="true" />
            <span>Links</span>
          </span>
          <span className="rounded-full bg-[#f5f5f7] px-2.5 py-0.5 text-[11px] font-medium text-[#09090b]">
            Export · MP4
          </span>
        </div>
      </div>

      {/* Upper Theater Stage + Color Inspector */}
      <div className="grid grid-cols-1 bg-[#020204] md:grid-cols-[1fr_204px]">
        <div className="p-3 sm:p-3.5">
          {/* 16:9 Active Video Monitor */}
          <div className="relative aspect-video w-full overflow-hidden rounded-[10px] border border-white/[0.1] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/cinema-preview-mountains.jpg"
              alt="Golden-hour alpine mountains clip inside the Nexus Cinema editor"
              className="h-full w-full object-cover transition-[filter] duration-300"
              style={{
                filter: currentGrade.filter,
                transform: `scale(${videoScale.toFixed(4)})`,
              }}
            />

            {/* Legibility gradient scrim */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/30"
              aria-hidden="true"
            />

            {/* Top HUD telemetry */}
            <div className="pointer-events-none absolute inset-x-2.5 top-2 flex items-center justify-between text-[10px] font-mono text-[#e4e4e9]">
              <span className="rounded-[5px] border border-white/[0.14] bg-black/55 px-1.5 py-0.5 backdrop-blur-xs tabular-nums">
                1080p · 30fps
              </span>
              <span className="rounded-[5px] border border-white/[0.14] bg-black/55 px-1.5 py-0.5 backdrop-blur-xs">
                LUT · {grade}
              </span>
            </div>

            {/* Live On-Canvas Direct-Manipulation Title / Lower-Third */}
            {showOpeningTitle ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
                <div
                  className={`relative px-4 py-1.5 text-center ${
                    !playing ? "border border-white/80 bg-black/20" : ""
                  }`}
                >
                  {!playing ? (
                    <>
                      <span className="absolute -left-1 -top-1 h-2 w-2 bg-white" />
                      <span className="absolute -right-1 -top-1 h-2 w-2 bg-white" />
                      <span className="absolute -bottom-1 -left-1 h-2 w-2 bg-white" />
                      <span className="absolute -bottom-1 -right-1 h-2 w-2 bg-white" />
                    </>
                  ) : null}
                  <p className="font-editorial text-[clamp(1.2rem,2.4vw,1.65rem)] leading-none tracking-[0.04em] text-white drop-shadow-md">
                    DOLOMITES
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[#e4e4e9] drop-shadow-sm">
                    First Light · 2,840m
                  </p>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none absolute bottom-3 left-3.5 rounded-[7px] border border-white/[0.18] bg-black/60 px-2.5 py-1.5 backdrop-blur-xs">
                <p className="text-[12.5px] font-medium leading-tight text-white">Summit Ridge</p>
                <p className="font-mono text-[10px] text-[#d1d1d6] tabular-nums">
                  06:14 AM · North Face
                </p>
              </div>
            )}
          </div>

          {/* Darkroom Transport & Stereo Peak Meter */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPlayheadPct(2)}
                aria-label="Rewind cinema timeline"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[#d1d1d6] transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                <SkipBack className="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPlayheadPct((p) => Math.max(1, p - 4))}
                aria-label="Step back cinema frame"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[#d1d1d6] transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pause cinema preview" : "Play cinema preview"}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#f5f5f7] text-[#09090b] transition-colors hover:bg-white"
              >
                {playing ? (
                  <Pause className="size-3 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="size-3 translate-x-[0.5px] fill-current" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPlayheadPct((p) => Math.min(99, p + 4))}
                aria-label="Step forward cinema frame"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[#d1d1d6] transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>

              <span className="ml-1 font-mono text-[11.5px] text-[#f5f5f7] tabular-nums">
                {formatSmpte(playheadPct)} <span className="text-[#8e8e95]">/ 00:18:00</span>
              </span>
            </div>

            {/* 10-LED Stereo Peak Meter */}
            <div className="flex items-center gap-2" aria-label="Stereo audio peak meter">
              <span className="font-mono text-[9.5px] text-[#8e8e95]">L/R</span>
              <div className="flex flex-col gap-[3px]" aria-hidden="true">
                {[meter.left, meter.right].map((activeCount, rowIdx) => (
                  <div key={rowIdx} className="flex items-center gap-[2px]">
                    {Array.from({ length: 10 }, (_, segIdx) => {
                      const lit = segIdx < activeCount;
                      const isPeak = segIdx >= 8;
                      return (
                        <span
                          key={segIdx}
                          className={`h-[4px] w-[6px] rounded-[1px] transition-colors ${
                            !lit
                              ? "bg-white/[0.1]"
                              : isPeak
                                ? "bg-[#ff3b30]"
                                : "bg-[#f0b54a]"
                          }`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Color Preset Pills */}
          <div className="mt-2.5 flex items-center gap-1.5 md:hidden">
            {GRADE_ORDER.map((preset) => {
              const active = preset === grade;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setGrade(preset)}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-white/45 bg-white/[0.14] text-[#f5f5f7]"
                      : "border-white/[0.1] bg-white/[0.04] text-[#9d9da6]"
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Compact Color Inspector */}
        <div className="hidden flex-col justify-between border-l border-white/[0.08] bg-[#08080c] p-3 md:flex">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium text-[#f5f5f7]">Inspector</span>
              <span className="truncate font-mono text-[10px] text-[#8e8e95]">ridge-4k</span>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {GRADE_ORDER.map((preset) => {
                const active = preset === grade;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGrade(preset)}
                    className={`cursor-pointer rounded-[6px] border px-1.5 py-1 text-[10px] font-medium transition-colors ${
                      active
                        ? "border-white/45 bg-white/[0.14] text-[#f5f5f7]"
                        : "border-white/[0.08] bg-white/[0.03] text-[#9d9da6] hover:text-[#e4e4e9]"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2.5 text-[10.5px]">
              {[
                { label: "Contrast", value: currentGrade.contrast, pct: currentGrade.contrastPct },
                {
                  label: "Saturation",
                  value: currentGrade.saturation,
                  pct: currentGrade.saturationPct,
                },
                { label: "Warmth", value: currentGrade.warmth, pct: currentGrade.warmthPct },
              ].map((slider) => (
                <div key={slider.label}>
                  <div className="flex items-center justify-between text-[#a1a1a6]">
                    <span>{slider.label}</span>
                    <span className="font-mono text-[#f5f5f7] tabular-nums">{slider.value}</span>
                  </div>
                  <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.1]">
                    <div
                      className="h-full rounded-full bg-[#e4e4e7] transition-all duration-200"
                      style={{ width: `${slider.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[9px] border border-[#f0b54a]/28 bg-[#f0b54a]/[0.06] p-2.5">
            <div className="flex items-center justify-between gap-1 text-[10.5px] font-medium text-[#f0b54a]">
              <span className="inline-flex items-center gap-1">
                <Link2 className="size-3" aria-hidden="true" />
                <span>Studio Sync</span>
              </span>
              <span className="font-mono tabular-nums">118 BPM</span>
            </div>
            <p className="mt-1 truncate text-[10.5px] text-[#e4e4e9]">Dolomites Film Score</p>
            <p className="mt-0.5 font-mono text-[9.5px] text-[#8e8e95]">Stems linked · Active</p>
          </div>
        </div>
      </div>

      {/* Bottom Populated 4-Track Cinema Timeline */}
      <div className="flex min-w-0 border-t border-white/[0.09] bg-[#030305]">
        {/* Left Track Headers */}
        <div className="w-[84px] shrink-0 border-r border-white/[0.08] bg-[#08080c] sm:w-[98px]">
          <div className="flex h-[24px] items-center border-b border-white/[0.08] px-2.5 font-mono text-[10px] text-[#8e8e95]">
            4 Tracks
          </div>
          <div className="flex h-[26px] items-center gap-1.5 border-b border-white/[0.06] px-2.5 text-[10.5px] text-[#d1d1d6]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e4e4e7]" aria-hidden="true" />
            <span className="font-mono sm:hidden">T1 Text</span>
            <span className="hidden font-mono sm:inline">T1 · Text</span>
          </div>
          <div className="flex h-[24px] items-center gap-1.5 border-b border-white/[0.06] px-2.5 text-[10.5px] text-[#a1a1a6]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#94a3b8]" aria-hidden="true" />
            <span className="font-mono sm:hidden">V2 FX</span>
            <span className="hidden font-mono sm:inline">V2 · FX</span>
          </div>
          <div className="flex h-[44px] items-center gap-1.5 border-b border-white/[0.06] px-2.5 text-[10.5px] font-medium text-[#f5f5f7]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f5f5f7]" aria-hidden="true" />
            <span className="font-mono sm:hidden">V1 Vid</span>
            <span className="hidden font-mono sm:inline">V1 · Video</span>
          </div>
          <div className="flex h-[34px] items-center gap-1.5 px-2.5 text-[10.5px] text-[#f0b54a]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0b54a]" aria-hidden="true" />
            <span className="font-mono sm:hidden">A1 Aud</span>
            <span className="hidden font-mono sm:inline">A1 · Audio</span>
          </div>
        </div>

        {/* Right Click-to-Scrub Timeline Lanes */}
        <div
          onClick={handleScrub}
          role="slider"
          tabIndex={0}
          aria-label="Cinema multi-track timeline scrub"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(playheadPct)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPlayheadPct((p) => Math.max(1, p - 4));
            if (e.key === "ArrowRight") setPlayheadPct((p) => Math.min(99, p + 4));
          }}
          className="relative min-w-0 flex-1 cursor-pointer select-none overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/75"
        >
          {/* Ruler */}
          <div className="relative h-[24px] border-b border-white/[0.08] bg-[#060609]">
            {CINEMA_RULER_MARKS.map((mark) => (
              <span
                key={mark.label}
                className="absolute bottom-1 font-mono text-[9.5px] text-[#8e8e95] tabular-nums"
                style={{
                  left: `${mark.pct}%`,
                  transform:
                    mark.pct === 0
                      ? "translateX(6px)"
                      : mark.pct >= 95
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {mark.label}
              </span>
            ))}
            <span
              className="pointer-events-none absolute top-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-[#f0b54a]"
              style={{ left: "56%" }}
              aria-hidden="true"
            />
          </div>

          {/* T1 · Text */}
          <div className="relative h-[26px] border-b border-white/[0.06]">
            <div
              className="absolute bottom-[3px] top-[3px] flex items-center overflow-hidden rounded-[5px] border border-white/[0.16] bg-white/[0.07] px-2"
              style={{ left: "3%", width: "47%" }}
            >
              <span className="truncate font-mono text-[9.5px] text-[#f5f5f7]">
                Title: Dolomites
              </span>
            </div>
            <div
              className="absolute bottom-[3px] top-[3px] flex items-center overflow-hidden rounded-[5px] border border-white/[0.14] bg-white/[0.05] px-2"
              style={{ left: "55%", width: "35%" }}
            >
              <span className="truncate font-mono text-[9.5px] text-[#d1d1d6]">
                Lower Third: Summit Ridge
              </span>
            </div>
          </div>

          {/* V2 · FX */}
          <div className="relative h-[24px] border-b border-white/[0.06]">
            <div
              className="absolute bottom-[3px] top-[3px] flex items-center overflow-hidden rounded-[5px] border border-white/[0.11] bg-white/[0.04] px-2"
              style={{ left: "0.5%", width: "97.5%" }}
            >
              <span className="truncate font-mono text-[9px] text-[#a1a1a6]">
                LUT · {grade} Grade
              </span>
            </div>
          </div>

          {/* V1 · Video with Mountain Filmstrips + Crossfade */}
          <div className="relative h-[44px] border-b border-white/[0.06]">
            {/* Clip 1: Selected Mountain Clip */}
            <div
              className="absolute bottom-[4px] top-[4px] overflow-hidden rounded-[6px] border border-[#f5f5f7]/80 bg-black"
              style={{ left: "0.5%", width: "55.5%" }}
            >
              <div className="grid h-full w-full grid-cols-4 gap-px bg-black">
                {["15% 45%", "38% 48%", "62% 45%", "82% 50%"].map((pos, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src="/images/cinema-preview-mountains.jpg"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: pos, filter: currentGrade.filter }}
                  />
                ))}
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/45 to-transparent px-2 py-0.5"
              >
                <span className="truncate font-mono text-[9.5px] font-medium text-white">
                  mountain-ridge-4k.mp4
                </span>
                <span className="hidden shrink-0 font-mono text-[9px] text-[#e4e4e9] tabular-nums sm:inline">
                  10.1s
                </span>
              </div>
            </div>

            {/* Clip 2: Alpine Valley Pan */}
            <div
              className="absolute bottom-[4px] top-[4px] overflow-hidden rounded-[6px] border border-white/[0.22] bg-black"
              style={{ left: "56%", width: "42%" }}
            >
              <div className="grid h-full w-full grid-cols-3 gap-px bg-black">
                {["75% 32%", "48% 28%", "24% 38%"].map((pos, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src="/images/cinema-preview-mountains.jpg"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: pos, filter: currentGrade.filter }}
                  />
                ))}
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/45 to-transparent px-2 py-0.5"
              >
                <span className="truncate font-mono text-[9.5px] text-[#e4e4e9]">
                  alpine-valley-pan.mp4
                </span>
                <span className="hidden shrink-0 font-mono text-[9px] text-[#d1d1d6] tabular-nums sm:inline">
                  7.9s
                </span>
              </div>
            </div>

            {/* Crossfade Transition Diamond */}
            <span
              title="Crossfade transition (0.4s)"
              className="pointer-events-none absolute top-1/2 z-20 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-[2px] border border-black/40 bg-[#f5f5f7] shadow-sm"
              style={{ left: "56%" }}
              aria-hidden="true"
            />
          </div>

          {/* A1 · Audio (Synced Studio Stem) */}
          <div className="relative h-[34px]">
            <div
              className="absolute bottom-[4px] top-[4px] flex flex-col justify-between overflow-hidden rounded-[6px] border border-[#f0b54a]/45 bg-[#f0b54a]/[0.11] px-2 py-0.5"
              style={{ left: "0.5%", width: "97%" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[9px] font-medium text-[#f0b54a]">
                  <Link2 className="size-2.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Dolomites Score · Studio Link</span>
                </span>
                <span className="hidden shrink-0 font-mono text-[8.5px] text-[#f0b54a]/80 tabular-nums sm:inline">
                  118 BPM
                </span>
              </div>
              <div className="flex h-[10px] w-full items-center gap-[1.5px]" aria-hidden="true">
                {CINEMA_SCORE_WAVE.map((heightPct, idx) => (
                  <span
                    key={idx}
                    className="min-w-[1px] flex-1 rounded-full bg-[#f0b54a]/80"
                    style={{ height: `${heightPct}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <TimelinePlayhead pct={playheadPct} />
        </div>
      </div>
    </div>
  );
}

export function NodePlatformSection() {
  const [selectedId, setSelectedId] = useState<NodeId>("studio");
  const activeNode = NODE_ITEMS.find((item) => item.id === selectedId) ?? NODE_ITEMS[0]!;

  return (
    <section
      id="platform"
      className="scroll-mt-24 border-b border-white/[0.08] bg-[#0e0f13] px-6 py-20 sm:px-10 lg:px-14 lg:py-24"
      aria-label="Node platform and extension API"
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Left: Editorial headline + Live Node Switcher Rail */}
        <div className="lg:col-span-4">
          <h2 className="font-editorial text-[clamp(2.2rem,3.8vw,3.3rem)] font-medium leading-[1.06] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
            Full apps, snapped into one bus
          </h2>
          <p className="font-literary mt-4 max-w-[36ch] text-[16.5px] leading-[1.6] text-[#a1a1a6]">
            Like extensions in a code editor—each Node is a complete application built on one
            permission-scoped API. Preview the two creative Nodes live in Nexus today.
          </p>

          <div
            role="tablist"
            aria-label="Preview live Nexus Nodes"
            className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]"
          >
            {NODE_ITEMS.map((node) => {
              const selected = node.id === selectedId;
              return (
                <button
                  key={node.id}
                  id={`node-tab-${node.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`node-panel-${node.id}`}
                  onClick={() => setSelectedId(node.id)}
                  className={`relative flex min-h-[64px] w-full cursor-pointer items-center justify-between gap-4 px-3.5 py-3.5 text-left transition-colors duration-150 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/75 ${
                    selected ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {selected ? (
                    <span
                      className="pointer-events-none absolute inset-y-2 left-0 w-[2px] bg-[#f5f5f7]"
                      aria-hidden="true"
                    />
                  ) : null}

                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors ${
                        selected
                          ? "border-white/50 bg-[#1e2028] text-[#f5f5f7]"
                          : "border-white/[0.12] bg-[#16171d] text-[#9d9da6]"
                      }`}
                    >
                      {node.monogram}
                    </span>
                    <div className="min-w-0">
                      <span
                        className={`block text-[15px] font-medium transition-colors ${
                          selected ? "text-[#f5f5f7]" : "text-[#a1a1a6]"
                        }`}
                      >
                        {node.name}
                      </span>
                      <span className="block truncate text-[12.5px] text-[#8e8e95]">
                        {node.tagline}
                      </span>
                    </div>
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[#d1d1d6]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
                    <span>{node.statusLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-[12.5px] leading-[1.55] text-[#8e8e95]">
            Next on the bus: Research Reader, Study Space, and third-party Nodes built on the open
            manifest API.
          </p>
        </div>

        {/* Right: Populated Live Node App Preview Window */}
        <div className="min-w-0 lg:col-span-8">
          <div
            key={activeNode.id}
            id={`node-panel-${activeNode.id}`}
            role="tabpanel"
            aria-labelledby={`node-tab-${activeNode.id}`}
            className="lp-stage-panel overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#0b0b0f] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)]"
          >
            {/* Window Chrome Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#121318] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.16] bg-[#181920] text-[10.5px] font-semibold text-[#f5f5f7]">
                  {activeNode.monogram}
                </span>
                <span className="text-[13.5px] font-medium text-[#f5f5f7]">{activeNode.name}</span>
              </div>

              <span className="rounded-full border border-white/[0.14] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] text-[#d1d1d6]">
                {activeNode.scope}
              </span>
            </div>

            {activeNode.id === "studio" ? (
              <RecordingStudioArrangePreview />
            ) : (
              <CinemaEditorPreview />
            )}

            {/* Open Manifest API Footer */}
            <div className="border-t border-white/[0.08] bg-[#121318] px-5 py-3">
              <code className="block break-words font-mono text-[11.5px] leading-[1.55] text-[#9d9da6]">
                defineExtension({"{ "}id:{" "}
                <span className="text-[#f5f5f7]">&quot;dev.nexus.{activeNode.id}&quot;</span>, api:{" "}
                1, scope: <span className="text-[#d1d1d6]">&quot;{activeNode.scope}&quot;</span>
                {" }"})
              </code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
