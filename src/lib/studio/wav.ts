import type { StudioTrackV1 } from "./types";

/** Downsamples an `AudioBuffer` into normalized `[0..1]` peak amplitude bars. */
export function computePeaksFromBuffer(buffer: AudioBuffer, bars = 160): number[] {
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
  const scale = globalMax > 0.05 ? 1 / Math.max(globalMax, 0.35) : 1;
  return peaks.map((v) => Math.round(Math.min(1, v * scale) * 1000) / 1000);
}

/** Encodes a decoded `AudioBuffer` to a standard 16-bit PCM RIFF/WAVE Blob. */
export function encodeWavFromBuffer(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
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
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataByteLength, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c < buffer.numberOfChannels ? c : 0));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([out], { type: "audio/wav" });
}

/** Resamples a clip's `peaks` slice cleanly across a non-destructive sub-range. */
export function slicePeaksForRange(
  sourcePeaks: number[],
  totalSourceDurationMs: number,
  rangeStartMs: number,
  rangeDurationMs: number,
  targetBars = 120,
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
  master.connect(offline.destination);

  for (const { track, buffer } of active) {
    const trimStartSec = Math.max(0, (track.trimStartMs ?? 0) / 1000);
    const availableSec = Math.max(0, buffer.duration - trimStartSec);
    const clipDurSec = Math.min(availableSec, Math.max(0.01, track.durationMs / 1000));
    if (clipDurSec <= 0.01) continue;

    const src = offline.createBufferSource();
    src.buffer = buffer;
    const gainNode = offline.createGain();
    gainNode.gain.value = Math.max(0, Math.min(2, track.gain));
    const panNode = offline.createStereoPanner();
    panNode.pan.value = Math.max(-1, Math.min(1, track.pan));
    src.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(master);
    src.start(Math.max(0, track.offsetMs / 1000), trimStartSec, clipDurSec);
  }

  return offline.startRendering();
}
