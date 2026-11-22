import { buildDuckingIntervalsFromClip, type BridgeCutRegion } from "@/lib/creative/nexus-bridge";
import type { CinemaAudioClip, CinemaProject, CinemaVideoClip } from "./types";

type AudioClipPlayable = CinemaAudioClip | CinemaVideoClip;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function wireClipGainEnvelope(
  ctx: BaseAudioContext,
  source: AudioNode,
  destination: AudioNode,
  clip: AudioClipPlayable,
  trackVolume: number,
  clipStartAtCtxSec: number,
  clipElapsedSec: number,
  playDurSec: number,
  clipTimelineStartMs: number,
  playOriginTimelineMs: number,
  duckIntervals: BridgeCutRegion[],
): AudioNode[] {
  const created: AudioNode[] = [];
  const totalClipSec = Math.max(0.05, clip.durationMs / 1000);
  const fadeInSec = clamp((clip.fadeInMs || 0) / 1000, 0, totalClipSec * 0.5);
  const fadeOutSec = clamp((clip.fadeOutMs || 0) / 1000, 0, totalClipSec * 0.5);

  const env = ctx.createGain();
  const baseVol = clamp((clip.volume ?? 1) * trackVolume, 0, 2);

  if (fadeInSec > 0.005 || fadeOutSec > 0.005) {
    let initialAmp = 1;
    if (fadeInSec > 0.005 && clipElapsedSec < fadeInSec) {
      initialAmp = Math.max(0.0001, clipElapsedSec / fadeInSec);
    }
    const fadeOutStartInClip = Math.max(0, totalClipSec - fadeOutSec);
    if (fadeOutSec > 0.005 && clipElapsedSec > fadeOutStartInClip) {
      initialAmp = Math.min(
        initialAmp,
        Math.max(0.0001, 1 - (clipElapsedSec - fadeOutStartInClip) / fadeOutSec),
      );
    }

    env.gain.setValueAtTime(initialAmp * baseVol, clipStartAtCtxSec);
    if (fadeInSec > 0.005 && clipElapsedSec < fadeInSec) {
      const fadeInEndAt = Math.min(clipStartAtCtxSec + playDurSec, clipStartAtCtxSec + (fadeInSec - clipElapsedSec));
      env.gain.linearRampToValueAtTime(baseVol, fadeInEndAt);
    }
    if (fadeOutSec > 0.005) {
      const fadeOutStartAt = clipStartAtCtxSec + Math.max(0, fadeOutStartInClip - clipElapsedSec);
      if (fadeOutStartAt < clipStartAtCtxSec + playDurSec) {
        if (fadeOutStartAt > clipStartAtCtxSec) {
          env.gain.setValueAtTime(baseVol, fadeOutStartAt);
        }
        env.gain.linearRampToValueAtTime(0.0001, clipStartAtCtxSec + playDurSec);
      }
    }
  } else {
    env.gain.setValueAtTime(baseVol, clipStartAtCtxSec);
  }

  let outputNode: AudioNode = env;

  // Apply smooth -12 dB sidechain auto-ducking whenever a vocal clip with `duckOthers` speaks
  const isDuckLeader = clip.kind === "audio" && Boolean(clip.duckOthers);
  if (!isDuckLeader && duckIntervals.length > 0) {
    const duckGain = ctx.createGain();
    duckGain.gain.setValueAtTime(1, clipStartAtCtxSec);
    const clipActiveStartMs = Math.max(playOriginTimelineMs, clipTimelineStartMs);
    const clipActiveEndMs = clipActiveStartMs + playDurSec * 1000;
    const rampSec = 0.14;

    for (const seg of duckIntervals) {
      if (seg.endMs <= clipActiveStartMs || seg.startMs >= clipActiveEndMs) continue;
      const enterOffsetSec = (seg.startMs - clipActiveStartMs) / 1000;
      const exitOffsetSec = (seg.endMs - clipActiveStartMs) / 1000;
      if (enterOffsetSec <= 0 && exitOffsetSec > 0) {
        duckGain.gain.setValueAtTime(0.25, clipStartAtCtxSec);
      } else if (enterOffsetSec > 0) {
        const tEnter = clipStartAtCtxSec + enterOffsetSec;
        duckGain.gain.setValueAtTime(1, Math.max(clipStartAtCtxSec, tEnter - rampSec));
        duckGain.gain.linearRampToValueAtTime(0.25, tEnter);
      }
      if (exitOffsetSec > 0 && exitOffsetSec < playDurSec) {
        const tExit = clipStartAtCtxSec + exitOffsetSec;
        duckGain.gain.setValueAtTime(0.25, tExit);
        duckGain.gain.linearRampToValueAtTime(1, Math.min(clipStartAtCtxSec + playDurSec, tExit + rampSec));
      }
    }

    env.connect(duckGain);
    duckGain.connect(destination);
    created.push(duckGain);
    outputNode = duckGain;
  } else {
    env.connect(destination);
  }

  source.connect(env);
  created.push(env);
  void outputNode;
  return created;
}

function collectDuckingRegions(project: CinemaProject): BridgeCutRegion[] {
  const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
  const regions: BridgeCutRegion[] = [];
  for (const c of project.clips) {
    if (c.kind !== "audio" || !c.duckOthers || c.hidden || c.muted) continue;
    const tr = trackMap.get(c.trackId);
    if (!tr || tr.muted || tr.hidden) continue;
    regions.push(...buildDuckingIntervalsFromClip(c));
  }
  if (regions.length <= 1) return regions;
  regions.sort((a, b) => a.startMs - b.startMs);
  const merged: BridgeCutRegion[] = [regions[0]!];
  for (let i = 1; i < regions.length; i++) {
    const prev = merged[merged.length - 1]!;
    const cur = regions[i]!;
    if (cur.startMs <= prev.endMs + 80) {
      prev.endMs = Math.max(prev.endMs, cur.endMs);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/**
 * Live Web Audio playback engine for Cinema: mixes linked Recording Studio audio stems
 * and decoded video soundtracks through an analyser for real-time meters & visualizers.
 */
export class CinemaAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqRaw: Uint8Array<ArrayBuffer> | null = null;
  private timeRaw: Uint8Array<ArrayBuffer> | null = null;
  private activeSources: Array<{ src: AudioBufferSourceNode; nodes: AudioNode[] }> = [];

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqRaw = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.timeRaw = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.5;
      limiter.ratio.value = 12;
      this.analyser.connect(limiter);
      limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  stop(): void {
    for (const item of this.activeSources) {
      try {
        item.src.stop();
        item.src.disconnect();
      } catch {
        // Already stopped
      }
      for (const n of item.nodes) {
        try {
          n.disconnect();
        } catch {
          // Ignore
        }
      }
    }
    this.activeSources = [];
  }

  play(
    project: CinemaProject,
    fromMs: number,
    audioBuffers: ReadonlyMap<string, AudioBuffer>,
  ): void {
    this.stop();
    const ctx = this.ensureContext();
    const dest = this.analyser!;
    const nowCtx = ctx.currentTime + 0.025;

    const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
    const duckRegions = collectDuckingRegions(project);
    const audibleClips = project.clips.filter(
      (c): c is AudioClipPlayable =>
        (c.kind === "audio" || (c.kind === "video" && !c.audioDetached)) &&
        !c.hidden &&
        !c.muted,
    );

    for (const clip of audibleClips) {
      const track = trackMap.get(clip.trackId);
      if (!track || track.muted || track.hidden) continue;
      const buf = audioBuffers.get(clip.assetId);
      if (!buf) continue;

      const clipEndMs = clip.startMs + clip.durationMs;
      if (clipEndMs <= fromMs) continue;

      const speed = clamp(clip.speed || 1, 0.25, 4);
      const elapsedInTimelineMs = Math.max(0, fromMs - clip.startMs);
      const delaySec = Math.max(0, (clip.startMs - fromMs) / 1000);
      const remainingTimelineSec = Math.max(0.01, (clipEndMs - Math.max(fromMs, clip.startMs)) / 1000);
      const sourceOffsetSec = clamp(
        (clip.trimStartMs + elapsedInTimelineMs * speed) / 1000,
        0,
        Math.max(0, buf.duration - 0.01),
      );
      const availableSourceSec = Math.max(0, buf.duration - sourceOffsetSec);
      const playSourceSec = Math.min(availableSourceSec, remainingTimelineSec * speed);
      if (playSourceSec <= 0.01) continue;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = speed;

      const nodes = wireClipGainEnvelope(
        ctx,
        src,
        dest,
        clip,
        track.volume ?? 1,
        nowCtx + delaySec,
        elapsedInTimelineMs / 1000,
        remainingTimelineSec,
        clip.startMs,
        fromMs,
        duckRegions,
      );
      src.start(nowCtx + delaySec, sourceOffsetSec, playSourceSec);
      this.activeSources.push({ src, nodes });
    }
  }

  getFrequencyBins(out: Float32Array): void {
    if (!this.analyser || !this.freqRaw) {
      out.fill(0);
      return;
    }
    this.analyser.getByteFrequencyData(this.freqRaw);
    const len = out.length;
    const rawLen = Math.max(1, Math.floor(this.freqRaw.length * 0.72));
    for (let i = 0; i < len; i++) {
      const idx = Math.min(rawLen - 1, Math.floor((i / len) * rawLen));
      out[i] = (this.freqRaw[idx] ?? 0) / 255;
    }
  }

  getPeakLevel(): number {
    if (!this.analyser || !this.timeRaw) return 0;
    this.analyser.getByteTimeDomainData(this.timeRaw);
    let maxDev = 0;
    for (let i = 0; i < this.timeRaw.length; i++) {
      const dev = Math.abs((this.timeRaw[i]! - 128) / 128);
      if (dev > maxDev) maxDev = dev;
    }
    return clamp(maxDev * 1.4, 0, 1);
  }

  dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.analyser = null;
    }
  }
}

/**
 * Offline render of all project audio tracks into one peak-limited stereo `AudioBuffer`
 * plus deterministic per-frame visualizer bands for frame-exact MP4 exports.
 */
export async function renderCinemaAudioOffline(
  project: CinemaProject,
  audioBuffers: ReadonlyMap<string, AudioBuffer>,
  fps: number,
  totalFrames: number,
  sampleRate = 48_000,
): Promise<{
  buffer: AudioBuffer | null;
  frameBins: Float32Array[];
}> {
  const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
  const playable = project.clips.filter((c): c is AudioClipPlayable => {
    if (!(c.kind === "audio" || (c.kind === "video" && !c.audioDetached))) return false;
    if (c.hidden || c.muted) return false;
    const tr = trackMap.get(c.trackId);
    if (!tr || tr.muted || tr.hidden) return false;
    return audioBuffers.has(c.assetId);
  });

  const emptyBins = Array.from({ length: totalFrames }, () => new Float32Array(32));
  if (playable.length === 0) {
    return { buffer: null, frameBins: emptyBins };
  }

  const totalSec = Math.max(0.5, totalFrames / Math.max(1, fps));
  const frameCount = Math.max(1, Math.ceil(totalSec * sampleRate));
  const offline = new OfflineAudioContext(2, frameCount, sampleRate);

  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1.0;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  limiter.connect(offline.destination);

  const duckRegions = collectDuckingRegions(project);

  for (const clip of playable) {
    const buf = audioBuffers.get(clip.assetId);
    const tr = trackMap.get(clip.trackId);
    if (!buf || !tr) continue;

    const speed = clamp(clip.speed || 1, 0.25, 4);
    const startSec = Math.max(0, clip.startMs / 1000);
    const trimSec = clamp((clip.trimStartMs || 0) / 1000, 0, Math.max(0, buf.duration - 0.01));
    const timelineDurSec = Math.max(0.01, clip.durationMs / 1000);
    const sourcePlaySec = Math.min(Math.max(0, buf.duration - trimSec), timelineDurSec * speed);
    if (sourcePlaySec <= 0.01) continue;

    const src = offline.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = speed;
    wireClipGainEnvelope(
      offline,
      src,
      limiter,
      clip,
      tr.volume ?? 1,
      startSec,
      0,
      timelineDurSec,
      clip.startMs,
      0,
      duckRegions,
    );
    src.start(startSec, trimSec, sourcePlaySec);
  }

  const buffer = await offline.startRendering();
  const ch0 = buffer.getChannelData(0);
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / Math.max(1, fps)));

  const frameBins: Float32Array[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const startSample = Math.min(ch0.length - 1, f * samplesPerFrame);
    const endSample = Math.min(ch0.length, startSample + samplesPerFrame);
    const bins = new Float32Array(32);
    const sliceLen = Math.max(1, endSample - startSample);
    const subSize = Math.max(1, Math.floor(sliceLen / 32));
    for (let b = 0; b < 32; b++) {
      let peak = 0;
      const s0 = startSample + b * subSize;
      const s1 = Math.min(endSample, s0 + subSize);
      const stride = Math.max(1, Math.floor((s1 - s0) / 12));
      for (let s = s0; s < s1; s += stride) {
        const a = Math.abs(ch0[s] ?? 0);
        if (a > peak) peak = a;
      }
      bins[b] = clamp(peak * 1.45, 0.04, 1);
    }
    frameBins.push(bins);
  }

  return { buffer, frameBins };
}
