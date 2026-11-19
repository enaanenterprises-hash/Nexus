import type { StudioTrackV1 } from "./types";

/** Downsamples a single mono Float32Array into normalized `[0..1]` peak amplitude bars. */
export function computePeaksFromFloat32(data: Float32Array, bars = 200): number[] {
  const length = data.length;
  if (length === 0) return [];
  const sampleCount = Math.min(bars, length);
  const blockSize = Math.max(1, Math.floor(length / sampleCount));
  const peaks = new Array<number>(sampleCount).fill(0);

  for (let i = 0; i < sampleCount; i++) {
    const start = i * blockSize;
    const end = Math.min(length, start + blockSize);
    let maxAbs = 0;
    const stride = Math.max(1, Math.floor((end - start) / 64));
    for (let s = start; s < end; s += stride) {
      const a = Math.abs(data[s]!);
      if (a > maxAbs) maxAbs = a;
    }
    peaks[i] = maxAbs;
  }

  let globalMax = 0;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i]! > globalMax) globalMax = peaks[i]!;
  }
  const scale = globalMax > 0.04 ? 1 / Math.max(globalMax, 0.35) : 1;
  return peaks.map((v) => Math.round(Math.min(1, v * scale) * 1000) / 1000);
}

/** Downsamples an `AudioBuffer` into normalized `[0..1]` peak amplitude bars. */
export function computePeaksFromBuffer(buffer: AudioBuffer, bars = 200): number[] {
  const chCount = Math.max(1, buffer.numberOfChannels);
  const length = buffer.length;
  if (length === 0) return [];
  const sampleCount = Math.min(bars, length);
  const blockSize = Math.max(1, Math.floor(length / sampleCount));
  const peaks = new Array<number>(sampleCount).fill(0);

  for (let ch = 0; ch < chCount; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < sampleCount; i++) {
      const start = i * blockSize;
      const end = Math.min(length, start + blockSize);
      let maxAbs = 0;
      const stride = Math.max(1, Math.floor((end - start) / 48));
      for (let s = start; s < end; s += stride) {
        const a = Math.abs(data[s]!);
        if (a > maxAbs) maxAbs = a;
      }
      if (maxAbs > peaks[i]!) peaks[i] = maxAbs;
    }
  }

  let globalMax = 0;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i]! > globalMax) globalMax = peaks[i]!;
  }
  const scale = globalMax > 0.04 ? 1 / Math.max(globalMax, 0.35) : 1;
  return peaks.map((v) => Math.round(Math.min(1, v * scale) * 1000) / 1000);
}

/** Measures the true peak sample amplitude `[0..1]` within a clip's active non-destructive trim range. */
export function computeClipPeakAmplitude(
  buffer: AudioBuffer,
  trimStartMs = 0,
  durationMs?: number,
): number {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.min(buffer.length, Math.floor((trimStartMs / 1000) * sr)));
  const endSample =
    durationMs !== undefined && durationMs > 0
      ? Math.min(buffer.length, startSample + Math.ceil((durationMs / 1000) * sr))
      : buffer.length;
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = startSample; i < endSample; i++) {
      const a = Math.abs(data[i]!);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

/** Encodes raw Float32 PCM channel arrays directly into a 16-bit PCM RIFF/WAVE Blob. */
export function encodeWavFromFloat32Channels(
  channels: Float32Array[],
  sampleRate: number,
): Blob {
  const numChannels = Math.min(2, Math.max(1, channels.length));
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = numFrames * blockAlign;
  const out = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const ch = channels[c] ?? channels[0]!;
      const sample = Math.max(-1, Math.min(1, ch[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([out], { type: "audio/wav" });
}

/** Encodes a decoded `AudioBuffer` to a standard 16-bit PCM RIFF/WAVE Blob. */
export function encodeWavFromBuffer(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c < buffer.numberOfChannels ? c : 0));
  }
  return encodeWavFromFloat32Channels(channels, buffer.sampleRate);
}

/** Resamples a clip's `peaks` slice cleanly across a non-destructive sub-range. */
export function slicePeaksForRange(
  sourcePeaks: number[],
  totalSourceDurationMs: number,
  rangeStartMs: number,
  rangeDurationMs: number,
  targetBars = 140,
): number[] {
  if (sourcePeaks.length === 0 || totalSourceDurationMs <= 0 || rangeDurationMs <= 0) return [];
  const startFrac = Math.max(0, Math.min(1, rangeStartMs / totalSourceDurationMs));
  const endFrac = Math.max(startFrac, Math.min(1, (rangeStartMs + rangeDurationMs) / totalSourceDurationMs));
  const count = Math.max(16, Math.min(targetBars, Math.round((endFrac - startFrac) * sourcePeaks.length * 1.4)));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const f = startFrac + ((i + 0.5) / count) * (endFrac - startFrac);
    const idx = Math.min(sourcePeaks.length - 1, Math.max(0, Math.floor(f * sourcePeaks.length)));
    out.push(sourcePeaks[idx] ?? 0.1);
  }
  return out;
}

export interface ConnectedTrackChain {
  gainNode: GainNode;
  panNode: StereoPannerNode;
  hpfNode?: BiquadFilterNode;
  lowEqNode?: BiquadFilterNode;
  midEqNode?: BiquadFilterNode;
  highEqNode?: BiquadFilterNode;
  compNode?: DynamicsCompressorNode;
  compMakeupNode?: GainNode;
  dispose: () => void;
}

/**
 * Wires a consistent studio channel strip (80 Hz HPF -> 3-Band Voice EQ -> Broadcast Compressor ->
 * Fade Envelope -> Track Gain -> Stereo Panner) for both real-time playback and offline WAV mixdown.
 */
export function connectTrackDspChain(
  ctx: BaseAudioContext,
  source: AudioNode,
  track: StudioTrackV1,
  destination: AudioNode,
  options: {
    audible: boolean;
    clipStartAtCtxSec: number;
    clipElapsedSec: number;
    playDurSec: number;
    totalClipDurSec: number;
    /** When true (real-time playback), mounts DSP nodes permanently so Inspector sliders audition live. */
    liveControllable?: boolean;
  },
): ConnectedTrackChain {
  const created: AudioNode[] = [];
  let cursor: AudioNode = source;
  const live = Boolean(options.liveControllable);

  let hpfNode: BiquadFilterNode | undefined;
  if (live || track.hpfEnabled) {
    hpfNode = ctx.createBiquadFilter();
    hpfNode.type = "highpass";
    hpfNode.frequency.value = track.hpfEnabled ? 80 : 10;
    hpfNode.Q.value = 0.707;
    cursor.connect(hpfNode);
    cursor = hpfNode;
    created.push(hpfNode);
  }

  let lowEqNode: BiquadFilterNode | undefined;
  const eqLow = track.eqLowDb ?? 0;
  if (live || Math.abs(eqLow) >= 0.1) {
    lowEqNode = ctx.createBiquadFilter();
    lowEqNode.type = "lowshelf";
    lowEqNode.frequency.value = 120;
    lowEqNode.gain.value = eqLow;
    cursor.connect(lowEqNode);
    cursor = lowEqNode;
    created.push(lowEqNode);
  }

  let midEqNode: BiquadFilterNode | undefined;
  const eqMid = track.eqMidDb ?? 0;
  if (live || Math.abs(eqMid) >= 0.1) {
    midEqNode = ctx.createBiquadFilter();
    midEqNode.type = "peaking";
    midEqNode.frequency.value = 2800;
    midEqNode.Q.value = 1.05;
    midEqNode.gain.value = eqMid;
    cursor.connect(midEqNode);
    cursor = midEqNode;
    created.push(midEqNode);
  }

  let highEqNode: BiquadFilterNode | undefined;
  const eqHigh = track.eqHighDb ?? 0;
  if (live || Math.abs(eqHigh) >= 0.1) {
    highEqNode = ctx.createBiquadFilter();
    highEqNode.type = "highshelf";
    highEqNode.frequency.value = 8000;
    highEqNode.gain.value = eqHigh;
    cursor.connect(highEqNode);
    cursor = highEqNode;
    created.push(highEqNode);
  }

  let compNode: DynamicsCompressorNode | undefined;
  let compMakeupNode: GainNode | undefined;
  if (live || track.compressorEnabled) {
    compNode = ctx.createDynamicsCompressor();
    compNode.threshold.value = track.compressorEnabled ? -20 : 0;
    compNode.knee.value = 14;
    compNode.ratio.value = track.compressorEnabled ? 3.2 : 1;
    compNode.attack.value = 0.008;
    compNode.release.value = 0.18;
    compMakeupNode = ctx.createGain();
    compMakeupNode.gain.value = track.compressorEnabled ? 1.26 : 1;
    cursor.connect(compNode);
    compNode.connect(compMakeupNode);
    cursor = compMakeupNode;
    created.push(compNode, compMakeupNode);
  }

  // Dedicated fade envelope node (separate from live track volume fader so user volume moves don't clobber fades)
  const fadeInSec = Math.max(0, Math.min(options.totalClipDurSec * 0.5, (track.fadeInMs ?? 0) / 1000));
  const fadeOutSec = Math.max(0, Math.min(options.totalClipDurSec * 0.5, (track.fadeOutMs ?? 0) / 1000));

  if (fadeInSec > 0.004 || fadeOutSec > 0.004) {
    const env = ctx.createGain();
    const t0 = options.clipStartAtCtxSec;
    const tEnd = t0 + options.playDurSec;
    const elapsed = options.clipElapsedSec;

    let initialAmp = 1;
    if (fadeInSec > 0.004 && elapsed < fadeInSec) {
      initialAmp = Math.max(0.0001, elapsed / fadeInSec);
    }
    const fadeOutStartInClip = Math.max(0, options.totalClipDurSec - fadeOutSec);
    if (fadeOutSec > 0.004 && elapsed > fadeOutStartInClip) {
      const remFrac = Math.max(0, 1 - (elapsed - fadeOutStartInClip) / fadeOutSec);
      initialAmp = Math.min(initialAmp, Math.max(0.0001, remFrac));
    }

    env.gain.setValueAtTime(initialAmp, t0);
    if (fadeInSec > 0.004 && elapsed < fadeInSec) {
      const fadeInEndAt = Math.min(tEnd, t0 + (fadeInSec - elapsed));
      env.gain.linearRampToValueAtTime(1, fadeInEndAt);
    }
    if (fadeOutSec > 0.004) {
      const fadeOutStartAt = t0 + Math.max(0, fadeOutStartInClip - elapsed);
      if (fadeOutStartAt < tEnd) {
        if (fadeOutStartAt > t0) {
          env.gain.setValueAtTime(1, fadeOutStartAt);
        }
        env.gain.linearRampToValueAtTime(0.0001, tEnd);
      }
    }

    cursor.connect(env);
    cursor = env;
    created.push(env);
  }

  const gainNode = ctx.createGain();
  gainNode.gain.value = options.audible ? Math.max(0, Math.min(2, track.gain)) : 0;
  const panNode = ctx.createStereoPanner();
  panNode.pan.value = Math.max(-1, Math.min(1, track.pan));

  cursor.connect(gainNode);
  gainNode.connect(panNode);
  panNode.connect(destination);
  created.push(gainNode, panNode);

  return {
    gainNode,
    panNode,
    hpfNode,
    lowEqNode,
    midEqNode,
    highEqNode,
    compNode,
    compMakeupNode,
    dispose: () => {
      for (const node of created) {
        try {
          node.disconnect();
        } catch {
          // Ignore already disconnected nodes
        }
      }
    },
  };
}

/** Renders all active (unmuted, honoring solo) studio tracks into one mixed master `AudioBuffer`. */
export async function mixTracksOffline(
  items: Array<{ track: StudioTrackV1; buffer: AudioBuffer }>,
  masterGain: number,
  sampleRate = 48000,
): Promise<AudioBuffer> {
  const anySolo = items.some((x) => x.track.solo);
  const active = items.filter((x) => (anySolo ? x.track.solo : !x.track.muted));
  const totalSec = Math.max(
    0.5,
    ...active.map((x) => (x.track.offsetMs + x.track.durationMs) / 1000),
  );
  const frameCount = Math.max(1, Math.ceil(totalSec * sampleRate));
  const offline = new OfflineAudioContext(2, frameCount, sampleRate);

  const master = offline.createGain();
  master.gain.value = Math.max(0, Math.min(2, masterGain));
  // Subtle brickwall safety limiter on master export bus to prevent inter-sample clipping
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -1.0;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;

  master.connect(limiter);
  limiter.connect(offline.destination);

  for (const { track, buffer } of active) {
    const trimStartSec = Math.max(0, (track.trimStartMs ?? 0) / 1000);
    const availableSec = Math.max(0, buffer.duration - trimStartSec);
    const clipDurSec = Math.min(availableSec, Math.max(0.01, track.durationMs / 1000));
    if (clipDurSec <= 0.01) continue;

    const src = offline.createBufferSource();
    src.buffer = buffer;
    const startAt = Math.max(0, track.offsetMs / 1000);
    connectTrackDspChain(offline, src, track, master, {
      audible: true,
      clipStartAtCtxSec: startAt,
      clipElapsedSec: 0,
      playDurSec: clipDurSec,
      totalClipDurSec: clipDurSec,
    });
    src.start(startAt, trimStartSec, clipDurSec);
  }

  return offline.startRendering();
}

/**
 * Renders one isolated WAV stem per active track lane, aligned cleanly from `00:00.00`
 * to the project's full timeline length so stems drop straight into Premiere / Final Cut / Logic Pro in sync.
 */
export async function renderLayerStemsOffline(
  items: Array<{ track: StudioTrackV1; buffer: AudioBuffer }>,
  layerNames: Record<number, string>,
  sampleRate = 48000,
): Promise<Array<{ layerIndex: number; label: string; blob: Blob }>> {
  const anySolo = items.some((x) => x.track.solo);
  const active = items.filter((x) => (anySolo ? x.track.solo : !x.track.muted));
  if (active.length === 0) return [];

  const totalSec = Math.max(
    0.5,
    ...active.map((x) => (x.track.offsetMs + x.track.durationMs) / 1000),
  );
  const frameCount = Math.max(1, Math.ceil(totalSec * sampleRate));

  const byLayer = new Map<number, Array<{ track: StudioTrackV1; buffer: AudioBuffer }>>();
  for (const item of active) {
    const idx = Math.max(0, item.track.layerIndex ?? 0);
    const list = byLayer.get(idx) ?? [];
    list.push(item);
    byLayer.set(idx, list);
  }

  const results: Array<{ layerIndex: number; label: string; blob: Blob }> = [];
  for (const [layerIndex, layerItems] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const offline = new OfflineAudioContext(2, frameCount, sampleRate);
    for (const { track, buffer } of layerItems) {
      const trimStartSec = Math.max(0, (track.trimStartMs ?? 0) / 1000);
      const availableSec = Math.max(0, buffer.duration - trimStartSec);
      const clipDurSec = Math.min(availableSec, Math.max(0.01, track.durationMs / 1000));
      if (clipDurSec <= 0.01) continue;

      const src = offline.createBufferSource();
      src.buffer = buffer;
      const startAt = Math.max(0, track.offsetMs / 1000);
      connectTrackDspChain(offline, src, track, offline.destination, {
        audible: true,
        clipStartAtCtxSec: startAt,
        clipElapsedSec: 0,
        playDurSec: clipDurSec,
        totalClipDurSec: clipDurSec,
      });
      src.start(startAt, trimStartSec, clipDurSec);
    }
    const rendered = await offline.startRendering();
    const label = layerNames[layerIndex] || `Track ${layerIndex + 1}`;
    results.push({ layerIndex, label, blob: encodeWavFromBuffer(rendered) });
  }
  return results;
}
