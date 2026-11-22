"use client";

import type { CinemaProject } from "@/lib/cinema/types";

export type BridgeCutRegion = {
  startMs: number;
  endMs: number;
};

let activeCinemaSnapshot: CinemaProject | null = null;
const cinemaListeners = new Set<(project: CinemaProject | null) => void>();

/**
 * Publishes the live Cinema project state in-memory so companion Nexus nodes
 * (like Recording Studio's frame-locked video monitor) can preview edits without roundtrips.
 */
export function setActiveCinemaProjectSnapshot(project: CinemaProject | null): void {
  activeCinemaSnapshot = project;
  for (const listener of cinemaListeners) {
    listener(project);
  }
}

export function getActiveCinemaProjectSnapshot(): CinemaProject | null {
  return activeCinemaSnapshot;
}

export function subscribeActiveCinemaProject(
  listener: (project: CinemaProject | null) => void,
): () => void {
  cinemaListeners.add(listener);
  listener(activeCinemaSnapshot);
  return () => {
    cinemaListeners.delete(listener);
  };
}

/**
 * Deterministic energy-threshold VAD / silence detector over a decoded AudioBuffer.
 * Splits speech/program segments into padded keep-regions for Cinema smart ripple jump-cuts.
 */
export function detectSpeechAndSilenceRegions(
  buffer: AudioBuffer,
  options: {
    thresholdDb?: number;
    minSilenceMs?: number;
    paddingMs?: number;
  } = {},
): {
  keepRegions: BridgeCutRegion[];
  silenceRegions: BridgeCutRegion[];
  removedMs: number;
  totalMs: number;
} {
  const thresholdDb = options.thresholdDb ?? -34;
  const minSilenceMs = options.minSilenceMs ?? 420;
  const paddingMs = options.paddingMs ?? 120;
  const sr = Math.max(8000, buffer.sampleRate || 48000);
  const totalMs = Math.max(0, Math.round(buffer.duration * 1000));
  if (totalMs <= 0 || buffer.length === 0) {
    return { keepRegions: [], silenceRegions: [], removedMs: 0, totalMs };
  }

  const chCount = Math.max(1, buffer.numberOfChannels);
  const channels: Float32Array[] = [];
  for (let c = 0; c < chCount; c++) {
    channels.push(buffer.getChannelData(c));
  }

  const winMs = 25;
  const winSamples = Math.max(1, Math.round((sr * winMs) / 1000));
  const winCount = Math.ceil(buffer.length / winSamples);
  const rmsDb = new Float32Array(winCount);

  for (let w = 0; w < winCount; w++) {
    const start = w * winSamples;
    const end = Math.min(buffer.length, start + winSamples);
    let sumSq = 0;
    let samples = 0;
    for (let i = start; i < end; i++) {
      let peakAtSample = 0;
      for (let c = 0; c < chCount; c++) {
        const v = Math.abs(channels[c]![i] ?? 0);
        if (v > peakAtSample) peakAtSample = v;
      }
      sumSq += peakAtSample * peakAtSample;
      samples++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, samples));
    rmsDb[w] = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
  }

  const active = new Uint8Array(winCount);
  for (let w = 0; w < winCount; w++) {
    active[w] = rmsDb[w]! >= thresholdDb ? 1 : 0;
  }

  // Merge short dips below minSilenceMs so natural speech syllables stay intact
  const minGapWindows = Math.max(1, Math.ceil(minSilenceMs / winMs));
  let i = 0;
  while (i < winCount) {
    if (active[i] === 0) {
      let j = i;
      while (j < winCount && active[j] === 0) j++;
      if (j - i < minGapWindows && i > 0 && j < winCount) {
        for (let k = i; k < j; k++) active[k] = 1;
      }
      i = j;
    } else {
      i++;
    }
  }

  const rawKeep: BridgeCutRegion[] = [];
  i = 0;
  while (i < winCount) {
    if (active[i] === 1) {
      let j = i;
      while (j < winCount && active[j] === 1) j++;
      const s = Math.max(0, i * winMs - paddingMs);
      const e = Math.min(totalMs, j * winMs + paddingMs);
      if (e - s >= 180) {
        if (rawKeep.length > 0 && s <= rawKeep[rawKeep.length - 1]!.endMs + 40) {
          rawKeep[rawKeep.length - 1]!.endMs = Math.max(rawKeep[rawKeep.length - 1]!.endMs, e);
        } else {
          rawKeep.push({ startMs: s, endMs: e });
        }
      }
      i = j;
    } else {
      i++;
    }
  }

  const keepRegions = rawKeep.length > 0 ? rawKeep : [{ startMs: 0, endMs: totalMs }];
  const silenceRegions: BridgeCutRegion[] = [];
  let cursor = 0;
  for (const reg of keepRegions) {
    if (reg.startMs > cursor + 20) {
      silenceRegions.push({ startMs: cursor, endMs: reg.startMs });
    }
    cursor = Math.max(cursor, reg.endMs);
  }
  if (totalMs > cursor + 20) {
    silenceRegions.push({ startMs: cursor, endMs: totalMs });
  }

  const keptMs = keepRegions.reduce((sum, r) => sum + Math.max(0, r.endMs - r.startMs), 0);
  return {
    keepRegions,
    silenceRegions,
    removedMs: Math.max(0, totalMs - keptMs),
    totalMs,
  };
}

/**
 * Computes onset/transient peaks and quantizes a deterministic musical/cadence BPM grid
 * from decoded Studio audio so Cinema's timeline can snap and auto-cut to the groove.
 */
export function detectBeatsAndTransients(
  buffer: AudioBuffer,
  fallbackBpm = 120,
): {
  bpm: number;
  beatMs: number[];
  transientMs: number[];
} {
  const sr = Math.max(8000, buffer.sampleRate || 48000);
  const totalMs = Math.round(buffer.duration * 1000);
  const safeBpm = Math.max(60, Math.min(180, Math.round(fallbackBpm || 120)));
  if (totalMs <= 0 || buffer.length === 0) {
    return { bpm: safeBpm, beatMs: [], transientMs: [] };
  }

  const ch0 = buffer.getChannelData(0);
  const hopMs = 20;
  const hopSamples = Math.max(1, Math.round((sr * hopMs) / 1000));
  const frames = Math.floor(ch0.length / hopSamples);
  const energy = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    const s0 = f * hopSamples;
    const s1 = Math.min(ch0.length, s0 + hopSamples);
    let sum = 0;
    for (let i = s0; i < s1; i++) {
      const v = ch0[i] ?? 0;
      sum += v * v;
    }
    energy[f] = Math.sqrt(sum / Math.max(1, s1 - s0));
  }

  const flux = new Float32Array(frames);
  let meanFlux = 0;
  for (let f = 1; f < frames; f++) {
    const diff = Math.max(0, energy[f]! - energy[f - 1]!);
    flux[f] = diff;
    meanFlux += diff;
  }
  meanFlux /= Math.max(1, frames);

  const transientMs: number[] = [];
  const threshold = Math.max(0.015, meanFlux * 2.15);
  let lastOnsetMs = -999;

  for (let f = 1; f < frames - 1; f++) {
    const val = flux[f]!;
    if (val >= threshold && val >= flux[f - 1]! && val >= flux[f + 1]!) {
      const ms = Math.round(f * hopMs);
      if (ms - lastOnsetMs >= 210) {
        transientMs.push(ms);
        lastOnsetMs = ms;
      }
    }
  }

  // Histogram IOI estimate across 60..180 BPM
  let estimatedBpm = safeBpm;
  if (transientMs.length >= 4) {
    const bins = new Int32Array(181);
    for (let a = 0; a < transientMs.length; a++) {
      for (let b = a + 1; b < Math.min(transientMs.length, a + 6); b++) {
        const dt = transientMs[b]! - transientMs[a]!;
        if (dt < 260 || dt > 1200) continue;
        let candBpm = 60_000 / dt;
        while (candBpm < 72) candBpm *= 2;
        while (candBpm > 168) candBpm /= 2;
        const rounded = Math.round(candBpm);
        if (rounded >= 60 && rounded <= 180) {
          bins[rounded] = (bins[rounded] ?? 0) + 1;
        }
      }
    }
    let bestBpm = safeBpm;
    let bestScore = 0;
    for (let b = 60; b <= 180; b++) {
      const score = (bins[b] ?? 0) * 2 + (bins[b - 1] ?? 0) + (bins[b + 1] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestBpm = b;
      }
    }
    if (bestScore >= 4) {
      estimatedBpm = bestBpm;
    }
  }

  const beatStepMs = 60_000 / estimatedBpm;
  const anchorOffsetMs = transientMs[0] !== undefined && transientMs[0] < beatStepMs ? transientMs[0] % beatStepMs : 0;
  const beatMs: number[] = [];
  for (let t = anchorOffsetMs; t <= totalMs + 10; t += beatStepMs) {
    beatMs.push(Math.round(t));
  }

  return {
    bpm: estimatedBpm,
    beatMs,
    transientMs: transientMs.slice(0, 240),
  };
}

/**
 * Samples normalized `0..1` peak envelope intensity at a timeline timestamp for a specific clip.
 * Powers deterministic live preview & offline MP4 export reactivity bound to individual Studio stems.
 */
export function sampleClipEnvelopeAt(
  peaks: readonly number[],
  clip: {
    startMs: number;
    durationMs: number;
    trimStartMs: number;
    sourceDurationMs: number;
    speed?: number;
  },
  timeMs: number,
): number {
  if (!peaks.length || timeMs < clip.startMs || timeMs > clip.startMs + clip.durationMs) {
    return 0;
  }
  const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
  const localSourceMs = clip.trimStartMs + (timeMs - clip.startMs) * speed;
  const totalSourceMs = Math.max(250, clip.sourceDurationMs || clip.trimStartMs + clip.durationMs);
  const ratio = Math.max(0, Math.min(0.9999, localSourceMs / totalSourceMs));
  const exactIdx = ratio * (peaks.length - 1);
  const i0 = Math.floor(exactIdx);
  const i1 = Math.min(peaks.length - 1, i0 + 1);
  const frac = exactIdx - i0;
  const val = (peaks[i0] ?? 0) * (1 - frac) + (peaks[i1] ?? 0) * frac;
  return Math.max(0, Math.min(1, val));
}

/**
 * Computes active speech intervals from an audio clip's peak envelope with lookahead & hold padding
 * so background music beds smoothly duck by -12 dB whenever voiceover stems are speaking.
 */
export function buildDuckingIntervalsFromClip(
  clip: {
    startMs: number;
    durationMs: number;
    trimStartMs: number;
    sourceDurationMs: number;
    speed?: number;
    peaks: readonly number[];
  },
  threshold = 0.14,
): BridgeCutRegion[] {
  if (!clip.peaks.length || clip.durationMs <= 0) return [];
  const stepMs = 45;
  const preLookaheadMs = 160;
  const holdReleaseMs = 280;
  const raw: BridgeCutRegion[] = [];

  for (let t = clip.startMs; t <= clip.startMs + clip.durationMs; t += stepMs) {
    const level = sampleClipEnvelopeAt(clip.peaks, clip, t);
    if (level >= threshold) {
      const s = Math.max(0, t - preLookaheadMs);
      const e = t + holdReleaseMs;
      if (raw.length > 0 && s <= raw[raw.length - 1]!.endMs + 90) {
        raw[raw.length - 1]!.endMs = Math.max(raw[raw.length - 1]!.endMs, e);
      } else {
        raw.push({ startMs: s, endMs: e });
      }
    }
  }
  return raw;
}
