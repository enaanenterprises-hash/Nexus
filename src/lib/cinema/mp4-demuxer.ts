/**
 * Zero-dependency ISO-BMFF (MP4 / MOV / fMP4) & WebM (Matroska / EBML)
 * Video Track Demuxer + Hardware WebCodecs `VideoDecoder` Frame Extractor.
 *
 * Bypasses the HTML5 `<video>` media clock by demuxing compressed
 * H.264 / VP8 / VP9 / AV1 packets directly from memory into the GPU
 * hardware `VideoDecoder` with a 24-slot consumer-evicted lookahead ring buffer.
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

function normalizeSampleTimestamps(samples: Mp4VideoSample[]): void {
  if (samples.length === 0) return;
  samples[0]!.isSync = true;

  let minCtsUs = Infinity;
  const checkCount = Math.min(16, samples.length);
  for (let i = 0; i < checkCount; i++) {
    if (samples[i]!.ctsUs < minCtsUs) {
      minCtsUs = samples[i]!.ctsUs;
    }
  }
  if (Number.isFinite(minCtsUs) && minCtsUs > 0) {
    for (let i = 0; i < samples.length; i++) {
      samples[i]!.ctsUs = Math.max(0, samples[i]!.ctsUs - minCtsUs);
    }
  }
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
  const entryCountOffset = stsd.payloadStart + 4;
  if (entryCountOffset + 4 > stsd.end) return null;
  const entries = listBoxes(view, stsd.payloadStart + 8, stsd.end);
  const entry = entries[0];
  if (!entry) return null;

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

  if (entry.type === "vp08") {
    return { codec: "vp8", codedWidth, codedHeight };
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

  const stscCount = view.getUint32(stsc.payloadStart + 4, false);
  const stscRuns: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  let pStsc = stsc.payloadStart + 8;
  for (let i = 0; i < stscCount && pStsc + 12 <= stsc.end; i++, pStsc += 12) {
    stscRuns.push({
      firstChunk: view.getUint32(pStsc, false),
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

  let syncSet: Set<number> | null = null;
  if (stss) {
    syncSet = new Set<number>();
    const syncCount = view.getUint32(stss.payloadStart + 4, false);
    let pStss = stss.payloadStart + 8;
    for (let i = 0; i < syncCount && pStss + 4 <= stss.end; i++, pStss += 4) {
      syncSet.add(view.getUint32(pStss, false) - 1);
    }
  }

  const tsScale = 1_000_000 / Math.max(1, timescale);
  const samples: Mp4VideoSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const offset = sampleOffsets[i]!;
    const size = sampleSizes[i]!;
    if (size === 0 || offset + size > view.byteLength) continue;
    const dts = sampleDts[i]!;
    const cts = Math.max(0, dts + sampleCtsOffset[i]!);
    samples.push({
      offset,
      size,
      dtsUs: Math.round(dts * tsScale),
      ctsUs: Math.round(cts * tsScale),
      durationUs: Math.max(1000, Math.round((sampleDur[i] || 1) * tsScale)),
      isSync: syncSet ? syncSet.has(i) : true,
    });
  }

  normalizeSampleTimestamps(samples);
  return samples;
}

function parseFragmentedSamples(
  view: DataView,
  topBoxes: BoxRef[],
  moov: BoxRef,
  videoTrackId: number,
  timescale: number,
): Mp4VideoSample[] {
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
      if (tfhdFlags & 0x000002) pTfhd += 4;
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

  normalizeSampleTimestamps(samples);
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

/* -------------------------------------------------------------------------- */
/* WebM (Matroska / EBML) Video Track Demuxer (`VP8`, `VP9`, `AV1`, `H.264`)   */
/* -------------------------------------------------------------------------- */

function readEbmlId(
  bytes: Uint8Array,
  pos: number,
  end: number,
): { id: number; nextPos: number } | null {
  if (pos >= end) return null;
  const b0 = bytes[pos]!;
  if (b0 === 0) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && (b0 & mask) === 0) {
    len++;
    mask >>= 1;
  }
  if (len > 4 || pos + len > end) return null;
  let id = 0;
  for (let i = 0; i < len; i++) {
    id = id * 256 + bytes[pos + i]!;
  }
  return { id, nextPos: pos + len };
}

function readEbmlSize(
  bytes: Uint8Array,
  pos: number,
  end: number,
): { size: number; unknownSize: boolean; nextPos: number } | null {
  if (pos >= end) return null;
  const b0 = bytes[pos]!;
  if (b0 === 0) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && (b0 & mask) === 0) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || pos + len > end) return null;
  let size = b0 & (mask - 1);
  let allOnes = size === mask - 1;
  for (let i = 1; i < len; i++) {
    const bi = bytes[pos + i]!;
    if (bi !== 0xff) allOnes = false;
    size = size * 256 + bi;
  }
  return { size, unknownSize: allOnes, nextPos: pos + len };
}

function readEbmlUint(bytes: Uint8Array, start: number, len: number): number {
  let val = 0;
  for (let i = 0; i < len; i++) {
    val = val * 256 + bytes[start + i]!;
  }
  return val;
}

export function parseWebmVideoTrack(buffer: ArrayBuffer): Mp4DemuxedVideoTrack | null {
  if (buffer.byteLength < 32) return null;
  const view = new DataView(buffer);
  // EBML Header Magic ID: 0x1A45DFA3
  if (view.getUint32(0, false) !== 0x1a45dfa3) return null;

  const bytes = new Uint8Array(buffer);
  const fileEnd = bytes.length;
  let pos = 0;

  let timecodeScaleNs = 1_000_000; // Default 1ms per tick
  let videoTrackNum = -1;
  let codec = "";
  let description: Uint8Array | undefined;
  let codedWidth = 1920;
  let codedHeight = 1080;
  const samples: Mp4VideoSample[] = [];
  let currentClusterTimecode = 0;

  while (pos < fileEnd) {
    const idRes = readEbmlId(bytes, pos, fileEnd);
    if (!idRes) break;
    const sizeRes = readEbmlSize(bytes, idRes.nextPos, fileEnd);
    if (!sizeRes) break;

    const payloadStart = sizeRes.nextPos;
    const elementEnd = sizeRes.unknownSize
      ? fileEnd
      : Math.min(fileEnd, payloadStart + sizeRes.size);
    const id = idRes.id;

    // Step inside Segment (0x18538067) or Cluster (0x1F43B675) directly
    if (id === 0x18538067) {
      pos = payloadStart;
      continue;
    }

    if (id === 0x1f43b675) {
      currentClusterTimecode = 0;
      pos = payloadStart;
      continue;
    }

    // Segment Info (0x1549A966)
    if (id === 0x1549a966) {
      let p = payloadStart;
      while (p < elementEnd) {
        const cId = readEbmlId(bytes, p, elementEnd);
        if (!cId) break;
        const cSz = readEbmlSize(bytes, cId.nextPos, elementEnd);
        if (!cSz) break;
        const cStart = cSz.nextPos;
        const cEnd = Math.min(elementEnd, cStart + cSz.size);
        if (cId.id === 0x2ad7b1 && cEnd > cStart) {
          timecodeScaleNs = readEbmlUint(bytes, cStart, cEnd - cStart) || 1_000_000;
        }
        p = cEnd;
      }
      pos = elementEnd;
      continue;
    }

    // Tracks (0x1654AE6B)
    if (id === 0x1654ae6b) {
      let p = payloadStart;
      while (p < elementEnd) {
        const teId = readEbmlId(bytes, p, elementEnd);
        if (!teId) break;
        const teSz = readEbmlSize(bytes, teId.nextPos, elementEnd);
        if (!teSz) break;
        const teStart = teSz.nextPos;
        const teEnd = Math.min(elementEnd, teStart + teSz.size);

        if (teId.id === 0xae) {
          let tNum = -1;
          let tType = -1;
          let tCodecId = "";
          let tCodecPriv: Uint8Array | undefined;
          let tW = 1920;
          let tH = 1080;

          let q = teStart;
          while (q < teEnd) {
            const fId = readEbmlId(bytes, q, teEnd);
            if (!fId) break;
            const fSz = readEbmlSize(bytes, fId.nextPos, teEnd);
            if (!fSz) break;
            const fStart = fSz.nextPos;
            const fEnd = Math.min(teEnd, fStart + fSz.size);
            const fLen = fEnd - fStart;

            if (fId.id === 0xd7) tNum = readEbmlUint(bytes, fStart, fLen);
            else if (fId.id === 0x83) tType = readEbmlUint(bytes, fStart, fLen);
            else if (fId.id === 0x86) tCodecId = readAscii(view, fStart, fLen);
            else if (fId.id === 0x63a2 && fLen > 0) {
              tCodecPriv = new Uint8Array(buffer.slice(fStart, fEnd));
            } else if (fId.id === 0xe0) {
              let v = fStart;
              while (v < fEnd) {
                const vId = readEbmlId(bytes, v, fEnd);
                if (!vId) break;
                const vSz = readEbmlSize(bytes, vId.nextPos, fEnd);
                if (!vSz) break;
                const vStart = vSz.nextPos;
                const vEnd = Math.min(fEnd, vStart + vSz.size);
                if (vId.id === 0xb0) tW = readEbmlUint(bytes, vStart, vEnd - vStart) || tW;
                else if (vId.id === 0xba) tH = readEbmlUint(bytes, vStart, vEnd - vStart) || tH;
                v = vEnd;
              }
            }
            q = fEnd;
          }

          if (tType === 1 && tNum > 0 && videoTrackNum === -1) {
            videoTrackNum = tNum;
            codedWidth = tW;
            codedHeight = tH;
            if (tCodecId === "V_VP8") {
              codec = "vp8";
            } else if (tCodecId === "V_VP9") {
              codec = "vp09.00.10.08";
            } else if (tCodecId === "V_AV1") {
              codec = "av01.0.08M.08";
              description = tCodecPriv;
            } else if (tCodecId === "V_MPEG4/ISO/AVC" && tCodecPriv && tCodecPriv.length >= 4) {
              codec = `avc1.${toHex2(tCodecPriv[1]!)}${toHex2(tCodecPriv[2]!)}${toHex2(tCodecPriv[3]!)}`;
              description = tCodecPriv;
            }
          }
        }
        p = teEnd;
      }
      pos = elementEnd;
      continue;
    }

    // Cluster Timecode (0xE7)
    if (id === 0xe7 && elementEnd > payloadStart) {
      currentClusterTimecode = readEbmlUint(bytes, payloadStart, elementEnd - payloadStart);
      pos = elementEnd;
      continue;
    }

    // SimpleBlock (0xA3)
    if (id === 0xa3 && elementEnd - payloadStart > 4) {
      const trk = readEbmlSize(bytes, payloadStart, elementEnd);
      if (trk && trk.size === videoTrackNum && trk.nextPos + 3 < elementEnd) {
        const relTc = view.getInt16(trk.nextPos, false);
        const flags = bytes[trk.nextPos + 2]!;
        const lacing = (flags & 0x06) >> 1;
        if (lacing === 0) {
          const isKeyframe = (flags & 0x80) !== 0 || samples.length === 0;
          const frameOffset = trk.nextPos + 3;
          const frameSize = elementEnd - frameOffset;
          const ctsUs = Math.max(
            0,
            Math.round(((currentClusterTimecode + relTc) * timecodeScaleNs) / 1000),
          );
          samples.push({
            offset: frameOffset,
            size: frameSize,
            dtsUs: ctsUs,
            ctsUs,
            durationUs: 33_333,
            isSync: isKeyframe,
          });
        }
      }
      pos = elementEnd;
      continue;
    }

    // BlockGroup (0xA0)
    if (id === 0xa0) {
      let p = payloadStart;
      let hasReferenceBlock = false;
      let blockStart = -1;
      let blockEnd = -1;
      while (p < elementEnd) {
        const bgId = readEbmlId(bytes, p, elementEnd);
        if (!bgId) break;
        const bgSz = readEbmlSize(bytes, bgId.nextPos, elementEnd);
        if (!bgSz) break;
        const bStart = bgSz.nextPos;
        const bEnd = Math.min(elementEnd, bStart + bgSz.size);
        if (bgId.id === 0xa1) {
          blockStart = bStart;
          blockEnd = bEnd;
        } else if (bgId.id === 0xfb) {
          hasReferenceBlock = true;
        }
        p = bEnd;
      }
      if (blockStart > 0 && blockEnd - blockStart > 4) {
        const trk = readEbmlSize(bytes, blockStart, blockEnd);
        if (trk && trk.size === videoTrackNum && trk.nextPos + 3 < blockEnd) {
          const relTc = view.getInt16(trk.nextPos, false);
          const flags = bytes[trk.nextPos + 2]!;
          const lacing = (flags & 0x06) >> 1;
          if (lacing === 0) {
            const frameOffset = trk.nextPos + 3;
            const frameSize = blockEnd - frameOffset;
            const ctsUs = Math.max(
              0,
              Math.round(((currentClusterTimecode + relTc) * timecodeScaleNs) / 1000),
            );
            samples.push({
              offset: frameOffset,
              size: frameSize,
              dtsUs: ctsUs,
              ctsUs,
              durationUs: 33_333,
              isSync: !hasReferenceBlock || samples.length === 0,
            });
          }
        }
      }
      pos = elementEnd;
      continue;
    }

    pos = elementEnd;
  }

  if (!codec || samples.length === 0) return null;

  normalizeSampleTimestamps(samples);
  for (let i = 0; i + 1 < samples.length; i++) {
    const delta = samples[i + 1]!.ctsUs - samples[i]!.ctsUs;
    if (delta > 1000 && delta < 500_000) {
      samples[i]!.durationUs = delta;
    }
  }

  return {
    trackId: videoTrackNum,
    codec,
    description,
    codedWidth,
    codedHeight,
    timescale: 1_000_000,
    samples,
  };
}

/* -------------------------------------------------------------------------- */
/* Hardware WebCodecs `VideoDecoder` with 24-Slot Consumer-Evicted Ring       */
/* -------------------------------------------------------------------------- */

interface DecodedCanvasSlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  timestampUs: number;
}

const MAX_RING_SLOTS = 24;

export class Mp4HardwareTrackDecoder {
  private readonly buffer: ArrayBuffer;
  private readonly track: Mp4DemuxedVideoTrack;
  private readonly maxTrackCtsUs: number;
  private decoder: VideoDecoder | null = null;
  private decoderConfig: VideoDecoderConfig | null = null;
  private readonly slotPool: DecodedCanvasSlot[] = [];
  private readonly filledSlots: DecodedCanvasSlot[] = [];
  private nextSampleIdx = 0;
  private requestedTargetUs = 0;
  private lastRequestedTargetUs = -1;
  private flushedAtEof = false;
  private decodeError: Error | null = null;
  private outputNotify: (() => void) | null = null;

  constructor(buffer: ArrayBuffer, track: Mp4DemuxedVideoTrack) {
    this.buffer = buffer;
    this.track = track;
    let maxCts = 0;
    for (let i = Math.max(0, track.samples.length - 20); i < track.samples.length; i++) {
      if (track.samples[i]!.ctsUs > maxCts) maxCts = track.samples[i]!.ctsUs;
    }
    this.maxTrackCtsUs = maxCts;
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
      const track = parseMp4VideoTrack(buffer) ?? parseWebmVideoTrack(buffer);
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

  private acquireSlot(w: number, h: number): DecodedCanvasSlot {
    let slot = this.slotPool.pop();
    if (!slot) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, w);
      canvas.height = Math.max(2, h);
      const ctx =
        canvas.getContext("2d", { alpha: false, willReadFrequently: false }) ??
        canvas.getContext("2d")!;
      slot = { canvas, ctx, timestampUs: -1 };
    } else if (slot.canvas.width !== w || slot.canvas.height !== h) {
      slot.canvas.width = Math.max(2, w);
      slot.canvas.height = Math.max(2, h);
    }
    return slot;
  }

  private initDecoder(config: VideoDecoderConfig): void {
    this.decoderConfig = config;
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
    this.flushedAtEof = false;
    this.decoder = new VideoDecoder({
      output: (frame) => {
        let emittedTs = 0;
        try {
          emittedTs = frame.timestamp;
          const w = frame.displayWidth || frame.codedWidth || this.track.codedWidth;
          const h = frame.displayHeight || frame.codedHeight || this.track.codedHeight;

          // When decoding pre-roll frames between a keyframe and `requestedTargetUs`,
          // keep only the single latest pre-roll frame in filledSlots[0] so pre-roll never
          // fills the lookahead buffer while still preserving the preceding frame for VFR videos.
          if (emittedTs < this.requestedTargetUs - 20_000) {
            if (
              this.filledSlots.length === 1 &&
              this.filledSlots[0]!.timestampUs < this.requestedTargetUs - 20_000
            ) {
              const slot = this.filledSlots[0]!;
              if (slot.canvas.width !== w || slot.canvas.height !== h) {
                slot.canvas.width = w;
                slot.canvas.height = h;
              }
              slot.ctx.drawImage(frame, 0, 0, w, h);
              slot.timestampUs = emittedTs;
              return;
            }
            if (this.filledSlots.length > 0) {
              return;
            }
          }

          const slot = this.acquireSlot(w, h);
          slot.ctx.drawImage(frame, 0, 0, w, h);
          slot.timestampUs = emittedTs;
          this.filledSlots.push(slot);
          if (this.filledSlots.length > 1) {
            this.filledSlots.sort((a, b) => a.timestampUs - b.timestampUs);
          }
        } finally {
          // ALWAYS release the GPU hardware decoder surface immediately
          frame.close();
          if (
            this.outputNotify &&
            (emittedTs >= this.requestedTargetUs - 16_000 ||
              !this.decoder ||
              this.decoder.decodeQueueSize === 0)
          ) {
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

  private waitForDecoderBatch(timeoutMs = 60): Promise<void> {
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

  private evictPastFrames(targetUs: number): void {
    while (
      this.filledSlots.length > 1 &&
      this.filledSlots[1]!.timestampUs <= targetUs + 12_000
    ) {
      const old = this.filledSlots.shift()!;
      this.slotPool.push(old);
    }
  }

  /**
   * Decodes forward in hardware up to `targetSec` and returns the GPU-backed
   * `HTMLCanvasElement` containing the exact decoded video frame.
   */
  async decodeFrameAt(targetSec: number): Promise<HTMLCanvasElement | null> {
    if (!this.decoder || this.decodeError) return null;

    const { samples } = this.track;
    const targetUs = Math.max(0, Math.min(this.maxTrackCtsUs, Math.round(targetSec * 1_000_000)));
    this.requestedTargetUs = targetUs;

    // 1. Detect genuine timeline discontinuity (backward seek or large forward jump past a keyframe)
    if (this.lastRequestedTargetUs >= 0 && targetUs < this.lastRequestedTargetUs - 45_000) {
      this.recreateVideoDecoder();
      while (this.filledSlots.length > 0) {
        this.slotPool.push(this.filledSlots.pop()!);
      }
      this.nextSampleIdx = this.findKeyframeBefore(targetUs);
    } else if (
      this.nextSampleIdx < samples.length &&
      (this.lastRequestedTargetUs < 0 || targetUs > this.lastRequestedTargetUs + 350_000)
    ) {
      const kfIdx = this.findKeyframeBefore(targetUs);
      if (kfIdx > this.nextSampleIdx) {
        while (this.filledSlots.length > 0) {
          this.slotPool.push(this.filledSlots.pop()!);
        }
        this.nextSampleIdx = kfIdx;
      }
    }
    this.lastRequestedTargetUs = targetUs;

    // 2. Evict past frames that targetUs has already moved beyond
    this.evictPastFrames(targetUs);

    // 3. Fast synchronous return (0.00ms) when the frame is already in our lookahead ring buffer
    const hasCoveringFrame =
      this.filledSlots.length > 0 &&
      (Math.abs(this.filledSlots[0]!.timestampUs - targetUs) <= 18_000 ||
        (this.filledSlots.length > 1 &&
          this.filledSlots[0]!.timestampUs <= targetUs + 14_000 &&
          this.filledSlots[1]!.timestampUs > targetUs + 12_000) ||
        this.flushedAtEof);

    if (hasCoveringFrame) {
      return this.filledSlots[0]!.canvas;
    }

    // 4. Feed lookahead batches of 12 samples so hardware H.264 DPB never starves
    let safetyBatches = 0;
    while (this.nextSampleIdx < samples.length && safetyBatches < 120) {
      if (this.decodeError) return null;

      const freeSlots =
        MAX_RING_SLOTS - this.filledSlots.length - this.decoder.decodeQueueSize;
      if (freeSlots <= 0) break;

      const batchLimit = Math.min(freeSlots, 12);
      let fed = 0;
      while (this.nextSampleIdx < samples.length && fed < batchLimit) {
        const s = samples[this.nextSampleIdx]!;
        const chunkData = new Uint8Array(this.buffer, s.offset, s.size);
        const chunk = new EncodedVideoChunk({
          type: s.isSync ? "key" : "delta",
          timestamp: s.ctsUs,
          duration: s.durationUs,
          data: chunkData,
        });
        this.decoder.decode(chunk);
        this.nextSampleIdx++;
        fed++;
      }

      safetyBatches++;
      await this.waitForDecoderBatch(55);
      this.evictPastFrames(targetUs);

      const newestTs = this.filledSlots[this.filledSlots.length - 1]?.timestampUs ?? -1;
      if (
        newestTs >= targetUs - 14_000 &&
        (this.filledSlots.length >= 2 ||
          Math.abs(this.filledSlots[0]!.timestampUs - targetUs) <= 18_000)
      ) {
        break;
      }
    }

    // 5. Flush hardware DPB reorder buffer once when all samples have been fed
    if (this.nextSampleIdx >= samples.length && !this.flushedAtEof) {
      this.flushedAtEof = true;
      try {
        await this.decoder.flush();
      } catch {
        // Ignore flush error at EOF
      }
      this.evictPastFrames(targetUs);
    }

    return this.filledSlots[0]?.canvas ?? null;
  }

  dispose(): void {
    this.filledSlots.length = 0;
    this.slotPool.length = 0;
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
