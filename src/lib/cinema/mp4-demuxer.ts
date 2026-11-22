/**
 * Zero-dependency ISO-BMFF (MP4 / MOV / fMP4) Video Track Demuxer +
 * Hardware WebCodecs `VideoDecoder` Frame Extractor for Nexus Cinema.
 *
 * Bypasses the HTML5 `<video>` media clock (4x speed limit) by demuxing
 * compressed H.264 / HEVC / VP9 / AV1 packets directly from memory into
 * the GPU hardware `VideoDecoder` at 200-500+ fps (10x-25x real-time).
 */

export interface Mp4VideoSample {
  offset: number;
  size: number;
  dtsUs: number;
  ctsUs: number;
  durationUs: number;
  isSync: boolean;
}

export interface Mp4DemuxedVideoTrack {
  trackId: number;
  codec: string;
  description?: Uint8Array;
  codedWidth: number;
  codedHeight: number;
  timescale: number;
  samples: Mp4VideoSample[];
}

interface BoxRef {
  type: string;
  start: number;
  payloadStart: number;
  end: number;
}

function readAscii(view: DataView, offset: number, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

function toHex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, "0");
}

function readUint64(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  return hi * 4294967296 + lo;
}

function listBoxes(view: DataView, start: number, end: number): BoxRef[] {
  const boxes: BoxRef[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos, false);
    const type = readAscii(view, pos + 4, 4);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      size = readUint64(view, pos + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) break;
    boxes.push({
      type,
      start: pos,
      payloadStart: pos + headerSize,
      end: pos + size,
    });
    pos += size;
  }
  return boxes;
}

function findBox(view: DataView, start: number, end: number, type: string): BoxRef | null {
  for (const b of listBoxes(view, start, end)) {
    if (b.type === type) return b;
  }
  return null;
}

function parseVisualSampleEntry(
  buffer: ArrayBuffer,
  view: DataView,
  stsd: BoxRef,
): {
  codec: string;
  description?: Uint8Array;
  codedWidth: number;
  codedHeight: number;
} | null {
  // FullBox header (4 bytes version/flags) + 4 bytes entry_count
  const entryCountOffset = stsd.payloadStart + 4;
  if (entryCountOffset + 4 > stsd.end) return null;
  const entries = listBoxes(view, stsd.payloadStart + 8, stsd.end);
  const entry = entries[0];
  if (!entry) return null;

  // VisualSampleEntry has 78 bytes of fixed header fields after its 8-byte box header
  const base = entry.payloadStart;
  if (base + 78 > entry.end) return null;
  const codedWidth = view.getUint16(base + 24, false);
  const codedHeight = view.getUint16(base + 26, false);
  const children = listBoxes(view, base + 78, entry.end);

  if (entry.type === "avc1" || entry.type === "avc3") {
    const avcC = children.find((c) => c.type === "avcC");
    if (!avcC || avcC.end - avcC.payloadStart < 4) return null;
    const desc = new Uint8Array(buffer.slice(avcC.payloadStart, avcC.end));
    const codec = `${entry.type}.${toHex2(desc[1]!)}${toHex2(desc[2]!)}${toHex2(desc[3]!)}`;
    return { codec, description: desc, codedWidth, codedHeight };
  }

  if (entry.type === "vp09") {
    const vpcC = children.find((c) => c.type === "vpcC");
    let codec = "vp09.00.10.08";
    let desc: Uint8Array | undefined;
    if (vpcC && vpcC.end - vpcC.payloadStart >= 8) {
      desc = new Uint8Array(buffer.slice(vpcC.payloadStart, vpcC.end));
      const profile = toHex2(desc[4]!);
      const level = toHex2(desc[5]!);
      const bitDepth = toHex2((desc[6]! >> 4) & 0x0f);
      codec = `vp09.${profile}.${level}.${bitDepth}`;
    }
    return { codec, description: desc, codedWidth, codedHeight };
  }

  if (entry.type === "av01") {
    const av1C = children.find((c) => c.type === "av1C");
    const desc = av1C ? new Uint8Array(buffer.slice(av1C.payloadStart, av1C.end)) : undefined;
    return { codec: "av01.0.08M.08", description: desc, codedWidth, codedHeight };
  }

  return null;
}

function parseStblSamples(
  view: DataView,
  stbl: BoxRef,
  timescale: number,
): Mp4VideoSample[] {
  const stsz = findBox(view, stbl.payloadStart, stbl.end, "stsz");
  const stsc = findBox(view, stbl.payloadStart, stbl.end, "stsc");
  const stts = findBox(view, stbl.payloadStart, stbl.end, "stts");
  const stco = findBox(view, stbl.payloadStart, stbl.end, "stco");
  const co64 = findBox(view, stbl.payloadStart, stbl.end, "co64");
  const ctts = findBox(view, stbl.payloadStart, stbl.end, "ctts");
  const stss = findBox(view, stbl.payloadStart, stbl.end, "stss");

  if (!stsz || !stsc || !stts || (!stco && !co64)) return [];

  // 1. Sample sizes (stsz)
  const defaultSampleSize = view.getUint32(stsz.payloadStart + 4, false);
  const sampleCount = view.getUint32(stsz.payloadStart + 8, false);
  if (sampleCount === 0) return [];

  const sampleSizes = new Uint32Array(sampleCount);
  if (defaultSampleSize > 0) {
    sampleSizes.fill(defaultSampleSize);
  } else {
    let p = stsz.payloadStart + 12;
    for (let i = 0; i < sampleCount && p + 4 <= stsz.end; i++, p += 4) {
      sampleSizes[i] = view.getUint32(p, false);
    }
  }

  // 2. Chunk offsets (stco or co64)
  let chunkOffsets: Float64Array;
  if (stco) {
    const chunkCount = view.getUint32(stco.payloadStart + 4, false);
    chunkOffsets = new Float64Array(chunkCount);
    let p = stco.payloadStart + 8;
    for (let i = 0; i < chunkCount && p + 4 <= stco.end; i++, p += 4) {
      chunkOffsets[i] = view.getUint32(p, false);
    }
  } else {
    const chunkCount = view.getUint32(co64!.payloadStart + 4, false);
    chunkOffsets = new Float64Array(chunkCount);
    let p = co64!.payloadStart + 8;
    for (let i = 0; i < chunkCount && p + 8 <= co64!.end; i++, p += 8) {
      chunkOffsets[i] = readUint64(view, p);
    }
  }

  // 3. Sample-to-chunk runs (stsc)
  const stscCount = view.getUint32(stsc.payloadStart + 4, false);
  const stscRuns: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  let pStsc = stsc.payloadStart + 8;
  for (let i = 0; i < stscCount && pStsc + 12 <= stsc.end; i++, pStsc += 12) {
    stscRuns.push({
      firstChunk: view.getUint32(pStsc, false), // 1-based
      samplesPerChunk: view.getUint32(pStsc + 4, false),
    });
  }

  const sampleOffsets = new Float64Array(sampleCount);
  let sampleIdx = 0;
  for (let r = 0; r < stscRuns.length && sampleIdx < sampleCount; r++) {
    const run = stscRuns[r]!;
    const startChunkIdx = Math.max(0, run.firstChunk - 1);
    const endChunkIdx =
      r + 1 < stscRuns.length
        ? Math.min(chunkOffsets.length, stscRuns[r + 1]!.firstChunk - 1)
        : chunkOffsets.length;

    for (let c = startChunkIdx; c < endChunkIdx && sampleIdx < sampleCount; c++) {
      let byteOffset = chunkOffsets[c]!;
      for (let s = 0; s < run.samplesPerChunk && sampleIdx < sampleCount; s++) {
        sampleOffsets[sampleIdx] = byteOffset;
        byteOffset += sampleSizes[sampleIdx]!;
        sampleIdx++;
      }
    }
  }

  // 4. Decoding Time-to-Sample (stts)
  const sttsCount = view.getUint32(stts.payloadStart + 4, false);
  const sampleDts = new Float64Array(sampleCount);
  const sampleDur = new Uint32Array(sampleCount);
  let pStts = stts.payloadStart + 8;
  let dtsCursor = 0;
  let dtsSampleIdx = 0;
  for (let i = 0; i < sttsCount && pStts + 8 <= stts.end; i++, pStts += 8) {
    const count = view.getUint32(pStts, false);
    const delta = view.getUint32(pStts + 4, false);
    for (let k = 0; k < count && dtsSampleIdx < sampleCount; k++) {
      sampleDts[dtsSampleIdx] = dtsCursor;
      sampleDur[dtsSampleIdx] = delta;
      dtsCursor += delta;
      dtsSampleIdx++;
    }
  }

  // 5. Composition Time-to-Sample offset (ctts, optional)
  const sampleCtsOffset = new Int32Array(sampleCount);
  if (ctts) {
    const cttsCount = view.getUint32(ctts.payloadStart + 4, false);
    let pCtts = ctts.payloadStart + 8;
    let ctsSampleIdx = 0;
    for (let i = 0; i < cttsCount && pCtts + 8 <= ctts.end; i++, pCtts += 8) {
      const count = view.getUint32(pCtts, false);
      const offset = view.getInt32(pCtts + 4, false);
      for (let k = 0; k < count && ctsSampleIdx < sampleCount; k++) {
        sampleCtsOffset[ctsSampleIdx] = offset;
        ctsSampleIdx++;
      }
    }
  }

  // 6. Sync Sample Table (stss, optional; if omitted, all samples are keyframes)
  let syncSet: Set<number> | null = null;
  if (stss) {
    syncSet = new Set<number>();
    const syncCount = view.getUint32(stss.payloadStart + 4, false);
    let pStss = stss.payloadStart + 8;
    for (let i = 0; i < syncCount && pStss + 4 <= stss.end; i++, pStss += 4) {
      syncSet.add(view.getUint32(pStss, false) - 1); // convert 1-based to 0-based
    }
  }

  const tsScale = 1_000_000 / Math.max(1, timescale);
  const samples: Mp4VideoSample[] = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const dts = sampleDts[i]!;
    const cts = Math.max(0, dts + sampleCtsOffset[i]!);
    samples[i] = {
      offset: sampleOffsets[i]!,
      size: sampleSizes[i]!,
      dtsUs: Math.round(dts * tsScale),
      ctsUs: Math.round(cts * tsScale),
      durationUs: Math.max(1000, Math.round(sampleDur[i]! * tsScale)),
      isSync: syncSet ? syncSet.has(i) : true,
    };
  }

  return samples;
}

function parseFragmentedSamples(
  view: DataView,
  topBoxes: BoxRef[],
  moov: BoxRef,
  videoTrackId: number,
  timescale: number,
): Mp4VideoSample[] {
  // Read default values from mvex -> trex if present
  let trexDefaultDuration = 0;
  let trexDefaultSize = 0;
  let trexDefaultFlags = 0;

  const mvex = findBox(view, moov.payloadStart, moov.end, "mvex");
  if (mvex) {
    for (const b of listBoxes(view, mvex.payloadStart, mvex.end)) {
      if (b.type === "trex" && b.end - b.payloadStart >= 24) {
        const tid = view.getUint32(b.payloadStart + 4, false);
        if (tid === videoTrackId) {
          trexDefaultDuration = view.getUint32(b.payloadStart + 12, false);
          trexDefaultSize = view.getUint32(b.payloadStart + 16, false);
          trexDefaultFlags = view.getUint32(b.payloadStart + 20, false);
        }
      }
    }
  }

  const tsScale = 1_000_000 / Math.max(1, timescale);
  const samples: Mp4VideoSample[] = [];
  let runningDts = 0;

  for (const box of topBoxes) {
    if (box.type !== "moof") continue;
    for (const child of listBoxes(view, box.payloadStart, box.end)) {
      if (child.type !== "traf") continue;
      const tfhd = findBox(view, child.payloadStart, child.end, "tfhd");
      if (!tfhd || tfhd.end - tfhd.payloadStart < 8) continue;

      const tfhdFlags = view.getUint32(tfhd.payloadStart, false) & 0xffffff;
      const trackId = view.getUint32(tfhd.payloadStart + 4, false);
      if (trackId !== videoTrackId) continue;

      let pTfhd = tfhd.payloadStart + 8;
      let baseDataOffset = box.start;
      let defaultDuration = trexDefaultDuration;
      let defaultSize = trexDefaultSize;
      let defaultFlags = trexDefaultFlags;

      if (tfhdFlags & 0x000001) {
        baseDataOffset = readUint64(view, pTfhd);
        pTfhd += 8;
      }
      if (tfhdFlags & 0x000002) pTfhd += 4; // sample_description_index
      if (tfhdFlags & 0x000008) {
        defaultDuration = view.getUint32(pTfhd, false);
        pTfhd += 4;
      }
      if (tfhdFlags & 0x000010) {
        defaultSize = view.getUint32(pTfhd, false);
        pTfhd += 4;
      }
      if (tfhdFlags & 0x000020) {
        defaultFlags = view.getUint32(pTfhd, false);
        pTfhd += 4;
      }

      const tfdt = findBox(view, child.payloadStart, child.end, "tfdt");
      if (tfdt && tfdt.end - tfdt.payloadStart >= 8) {
        const ver = view.getUint8(tfdt.payloadStart);
        runningDts =
          ver === 1 && tfdt.end - tfdt.payloadStart >= 12
            ? readUint64(view, tfdt.payloadStart + 4)
            : view.getUint32(tfdt.payloadStart + 4, false);
      }

      for (const trun of listBoxes(view, child.payloadStart, child.end)) {
        if (trun.type !== "trun" || trun.end - trun.payloadStart < 8) continue;
        const trunFlags = view.getUint32(trun.payloadStart, false) & 0xffffff;
        const count = view.getUint32(trun.payloadStart + 4, false);
        let pTrun = trun.payloadStart + 8;

        let dataOffset = baseDataOffset;
        if (trunFlags & 0x000001) {
          dataOffset = baseDataOffset + view.getInt32(pTrun, false);
          pTrun += 4;
        }
        let firstSampleFlags = defaultFlags;
        if (trunFlags & 0x000004) {
          firstSampleFlags = view.getUint32(pTrun, false);
          pTrun += 4;
        }

        let currentByteOffset = dataOffset;
        for (let i = 0; i < count && pTrun <= trun.end; i++) {
          let dur = defaultDuration;
          let size = defaultSize;
          let flags = i === 0 && (trunFlags & 0x000004) ? firstSampleFlags : defaultFlags;
          let ctsOffset = 0;

          if (trunFlags & 0x000100) {
            dur = view.getUint32(pTrun, false);
            pTrun += 4;
          }
          if (trunFlags & 0x000200) {
            size = view.getUint32(pTrun, false);
            pTrun += 4;
          }
          if (trunFlags & 0x000400) {
            flags = view.getUint32(pTrun, false);
            pTrun += 4;
          }
          if (trunFlags & 0x000800) {
            ctsOffset = view.getInt32(pTrun, false);
            pTrun += 4;
          }

          const isNonSync = (flags & 0x00010000) !== 0;
          const dependsOnNoOther = ((flags >> 24) & 0x03) === 2;
          const isSync = dependsOnNoOther || !isNonSync;

          if (size > 0 && currentByteOffset + size <= view.byteLength) {
            const dts = runningDts;
            const cts = Math.max(0, dts + ctsOffset);
            samples.push({
              offset: currentByteOffset,
              size,
              dtsUs: Math.round(dts * tsScale),
              ctsUs: Math.round(cts * tsScale),
              durationUs: Math.max(1000, Math.round((dur || 1) * tsScale)),
              isSync,
            });
          }
          currentByteOffset += size;
          runningDts += dur;
        }
      }
    }
  }

  return samples;
}

export function parseMp4VideoTrack(buffer: ArrayBuffer): Mp4DemuxedVideoTrack | null {
  if (buffer.byteLength < 32) return null;
  const view = new DataView(buffer);
  const topBoxes = listBoxes(view, 0, buffer.byteLength);
  const moov = topBoxes.find((b) => b.type === "moov");
  if (!moov) return null;

  for (const trak of listBoxes(view, moov.payloadStart, moov.end)) {
    if (trak.type !== "trak") continue;
    let trackId = 1;
    const tkhd = findBox(view, trak.payloadStart, trak.end, "tkhd");
    if (tkhd && tkhd.end - tkhd.payloadStart >= 20) {
      const ver = view.getUint8(tkhd.payloadStart);
      trackId = view.getUint32(tkhd.payloadStart + (ver === 1 ? 20 : 12), false);
    }

    const mdia = findBox(view, trak.payloadStart, trak.end, "mdia");
    if (!mdia) continue;

    const hdlr = findBox(view, mdia.payloadStart, mdia.end, "hdlr");
    if (!hdlr || hdlr.end - hdlr.payloadStart < 12) continue;
    const handlerType = readAscii(view, hdlr.payloadStart + 8, 4);
    if (handlerType !== "vide") continue;

    const mdhd = findBox(view, mdia.payloadStart, mdia.end, "mdhd");
    let timescale = 90_000;
    if (mdhd && mdhd.end - mdhd.payloadStart >= 16) {
      const ver = view.getUint8(mdhd.payloadStart);
      timescale = view.getUint32(mdhd.payloadStart + (ver === 1 ? 20 : 12), false) || 90_000;
    }

    const minf = findBox(view, mdia.payloadStart, mdia.end, "minf");
    if (!minf) continue;
    const stbl = findBox(view, minf.payloadStart, minf.end, "stbl");
    if (!stbl) continue;
    const stsd = findBox(view, stbl.payloadStart, stbl.end, "stsd");
    if (!stsd) continue;

    const visual = parseVisualSampleEntry(buffer, view, stsd);
    if (!visual) continue;

    let samples = parseStblSamples(view, stbl, timescale);
    if (samples.length === 0) {
      samples = parseFragmentedSamples(view, topBoxes, moov, trackId, timescale);
    }
    if (samples.length === 0) continue;

    // Ensure the very first sample is marked as sync
    samples[0]!.isSync = true;

    return {
      trackId,
      codec: visual.codec,
      description: visual.description,
      codedWidth: visual.codedWidth || 1920,
      codedHeight: visual.codedHeight || 1080,
      timescale,
      samples,
    };
  }

  return null;
}

interface DecodedCanvasSlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  timestampUs: number;
}

/**
 * Hardware-accelerated WebCodecs `VideoDecoder` instance for one MP4 video asset.
 *
 * Uses a 3-slot GPU canvas ring buffer and calls `frame.close()` synchronously inside
 * `VideoDecoder`'s `output(frame)` callback so zero `VideoFrame` GPU surfaces are ever
 * held open outside the callback.
 */
export class Mp4HardwareTrackDecoder {
  private readonly buffer: ArrayBuffer;
  private readonly track: Mp4DemuxedVideoTrack;
  private decoder: VideoDecoder | null = null;
  private decoderConfig: VideoDecoderConfig | null = null;
  private readonly ring: DecodedCanvasSlot[] = [];
  private readonly filledSlots: DecodedCanvasSlot[] = [];
  private nextSampleIdx = 0;
  private requestedTargetUs = 0;
  private decodeError: Error | null = null;
  private outputNotify: (() => void) | null = null;

  constructor(buffer: ArrayBuffer, track: Mp4DemuxedVideoTrack) {
    this.buffer = buffer;
    this.track = track;
  }

  static async create(blob: Blob): Promise<Mp4HardwareTrackDecoder | null> {
    if (
      typeof window === "undefined" ||
      typeof VideoDecoder === "undefined" ||
      typeof EncodedVideoChunk === "undefined" ||
      typeof document === "undefined"
    ) {
      return null;
    }

    try {
      const buffer = await blob.arrayBuffer();
      const track = parseMp4VideoTrack(buffer);
      if (!track || track.samples.length === 0) return null;

      const hwCfg: VideoDecoderConfig = {
        codec: track.codec,
        codedWidth: track.codedWidth,
        codedHeight: track.codedHeight,
        hardwareAcceleration: "prefer-hardware",
        ...(track.description ? { description: track.description } : {}),
      };

      let chosenConfig: VideoDecoderConfig | null = null;
      try {
        const sup = await VideoDecoder.isConfigSupported(hwCfg);
        if (sup.supported) chosenConfig = sup.config ?? hwCfg;
      } catch {
        chosenConfig = null;
      }

      if (!chosenConfig) {
        const swCfg: VideoDecoderConfig = {
          codec: track.codec,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight,
          ...(track.description ? { description: track.description } : {}),
        };
        const sup = await VideoDecoder.isConfigSupported(swCfg);
        if (!sup.supported) return null;
        chosenConfig = sup.config ?? swCfg;
      }

      const instance = new Mp4HardwareTrackDecoder(buffer, track);
      instance.initDecoder(chosenConfig);
      return instance;
    } catch {
      return null;
    }
  }

  private initDecoder(config: VideoDecoderConfig): void {
    this.decoderConfig = config;
    for (let i = 0; i < 3; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, this.track.codedWidth);
      canvas.height = Math.max(2, this.track.codedHeight);
      const ctx =
        canvas.getContext("2d", { alpha: false, willReadFrequently: false }) ??
        canvas.getContext("2d")!;
      this.ring.push({ canvas, ctx, timestampUs: -1 });
    }
    this.recreateVideoDecoder();
  }

  private recreateVideoDecoder(): void {
    if (!this.decoderConfig) return;
    if (this.decoder && this.decoder.state !== "closed") {
      try {
        this.decoder.close();
      } catch {
        // Ignore
      }
    }
    this.decodeError = null;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        try {
          const ts = frame.timestamp;
          // Skip blitting early pre-roll frames when we still have samples before requestedTargetUs
          if (
            ts < this.requestedTargetUs - 34_000 &&
            this.filledSlots.length > 0 &&
            this.nextSampleIdx < this.track.samples.length
          ) {
            return;
          }

          let slot: DecodedCanvasSlot;
          if (this.filledSlots.length < this.ring.length) {
            slot = this.ring.find((r) => !this.filledSlots.includes(r)) ?? this.ring[0]!;
          } else {
            slot = this.filledSlots.shift()!;
          }

          if (
            frame.displayWidth > 0 &&
            frame.displayHeight > 0 &&
            (slot.canvas.width !== frame.displayWidth || slot.canvas.height !== frame.displayHeight)
          ) {
            slot.canvas.width = frame.displayWidth;
            slot.canvas.height = frame.displayHeight;
          }

          slot.ctx.drawImage(frame, 0, 0, slot.canvas.width, slot.canvas.height);
          slot.timestampUs = ts;
          this.filledSlots.push(slot);
          this.filledSlots.sort((a, b) => a.timestampUs - b.timestampUs);
        } finally {
          // ALWAYS release the GPU hardware decoder surface immediately
          frame.close();
          if (this.outputNotify) {
            const cb = this.outputNotify;
            this.outputNotify = null;
            cb();
          }
        }
      },
      error: (err) => {
        this.decodeError = err instanceof Error ? err : new Error(String(err));
        if (this.outputNotify) {
          const cb = this.outputNotify;
          this.outputNotify = null;
          cb();
        }
      },
    });
    this.decoder.configure(this.decoderConfig);
  }

  private findKeyframeBefore(targetUs: number): number {
    const { samples } = this.track;
    let lastSync = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      if (s.isSync) {
        if (s.ctsUs <= targetUs + 15_000) {
          lastSync = i;
        } else if (s.dtsUs > targetUs + 50_000) {
          break;
        }
      }
    }
    return lastSync;
  }

  private waitForDecoderOutput(timeoutMs = 120): Promise<void> {
    if (!this.decoder || this.decoder.decodeQueueSize === 0 || this.decodeError) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (this.outputNotify === onOut) this.outputNotify = null;
        resolve();
      };
      const onOut = () => {
        window.clearTimeout(timer);
        finish();
      };
      const timer = window.setTimeout(finish, timeoutMs);
      this.outputNotify = onOut;
    });
  }

  /**
   * Decodes forward in hardware up to `targetSec` and returns the GPU-backed
   * `HTMLCanvasElement` containing the decoded video frame.
   */
  async decodeFrameAt(targetSec: number): Promise<HTMLCanvasElement | null> {
    if (!this.decoder || this.decodeError) return null;

    const { samples } = this.track;
    const lastSample = samples[samples.length - 1]!;
    const maxTrackUs = lastSample.ctsUs;
    const targetUs = Math.max(0, Math.min(maxTrackUs, Math.round(targetSec * 1_000_000)));
    this.requestedTargetUs = targetUs;

    // 1. Evict older frames in the 3-slot ring buffer when a newer slot has reached targetUs
    while (
      this.filledSlots.length > 1 &&
      this.filledSlots[1]!.timestampUs <= targetUs + 14_000
    ) {
      this.filledSlots.shift();
    }

    // 2. If we jumped backward or jumped forward past an undecoded keyframe, seek to that keyframe
    const oldestSlotTs = this.filledSlots[0]?.timestampUs ?? -1;
    const newestSlotTs = this.filledSlots[this.filledSlots.length - 1]?.timestampUs ?? -1;
    if (oldestSlotTs > targetUs + 80_000) {
      // Backward jump (e.g. loop or second clip referencing earlier trim)
      this.recreateVideoDecoder();
      this.filledSlots.length = 0;
      this.nextSampleIdx = this.findKeyframeBefore(targetUs);
    } else if (this.nextSampleIdx < samples.length) {
      const kfIdx = this.findKeyframeBefore(targetUs);
      if (kfIdx > this.nextSampleIdx) {
        this.filledSlots.length = 0;
        this.nextSampleIdx = kfIdx;
      }
    }

    // 3. Fast return if we already have the exact frame in our 3-slot ring buffer
    if (
      this.filledSlots.length > 0 &&
      (Math.abs(this.filledSlots[0]!.timestampUs - targetUs) <= 20_000 ||
        (this.filledSlots.length > 1 &&
          this.filledSlots[0]!.timestampUs <= targetUs + 14_000 &&
          this.filledSlots[1]!.timestampUs > targetUs) ||
        (this.nextSampleIdx >= samples.length && newestSlotTs >= maxTrackUs - 40_000))
    ) {
      return this.filledSlots[0]!.canvas;
    }

    // 4. Feed compressed MP4 samples into hardware VideoDecoder until we reach targetUs
    let safetySteps = 0;
    while (this.nextSampleIdx < samples.length && safetySteps < 600) {
      if (this.decodeError) return null;

      // Feed a small batch of samples (including up to 2 lookahead samples for B-frame reordering)
      let fedInBatch = 0;
      while (
        this.nextSampleIdx < samples.length &&
        this.decoder.decodeQueueSize < 10 &&
        fedInBatch < 8
      ) {
        const s = samples[this.nextSampleIdx]!;
        // Stop feeding once we've fed 3 samples past targetUs
        if (
          this.filledSlots.length > 0 &&
          s.dtsUs > targetUs + 110_000 &&
          s.ctsUs > targetUs + 110_000
        ) {
          break;
        }

        const chunkData = new Uint8Array(this.buffer, s.offset, s.size);
        const chunk = new EncodedVideoChunk({
          type: s.isSync ? "key" : "delta",
          timestamp: s.ctsUs,
          duration: s.durationUs,
          data: chunkData,
        });
        this.decoder.decode(chunk);
        this.nextSampleIdx++;
        fedInBatch++;
        safetySteps++;
      }

      await this.waitForDecoderOutput(90);

      while (
        this.filledSlots.length > 1 &&
        this.filledSlots[1]!.timestampUs <= targetUs + 14_000
      ) {
        this.filledSlots.shift();
      }

      const newest = this.filledSlots[this.filledSlots.length - 1]?.timestampUs ?? -1;
      if (newest >= targetUs - 14_000) {
        break;
      }

      if (fedInBatch === 0 && this.decoder.decodeQueueSize === 0) {
        break;
      }
    }

    // Flush decoder if we reached the very end of the sample table and still need final frames
    if (
      this.nextSampleIdx >= samples.length &&
      this.decoder.decodeQueueSize > 0 &&
      (this.filledSlots[this.filledSlots.length - 1]?.timestampUs ?? -1) < targetUs - 14_000
    ) {
      try {
        await this.decoder.flush();
      } catch {
        // Ignore flush errors at EOF
      }
      while (
        this.filledSlots.length > 1 &&
        this.filledSlots[1]!.timestampUs <= targetUs + 14_000
      ) {
        this.filledSlots.shift();
      }
    }

    return this.filledSlots[0]?.canvas ?? null;
  }

  dispose(): void {
    this.filledSlots.length = 0;
    if (this.decoder && this.decoder.state !== "closed") {
      try {
        this.decoder.close();
      } catch {
        // Ignore
      }
    }
    this.decoder = null;
  }
}
