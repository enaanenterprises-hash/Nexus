import type { OpticsCurvePoint, OpticsHistogram } from "./types";

export function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : v + 0.5 | 0;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Monotonic cubic Hermite spline (Fritsch–Carlson) producing a 256-entry LUT.
 * Prevents overshoot ringing when control points have steep slopes.
 */
export function buildSplineLut(points: readonly OpticsCurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const sorted = [...points]
    .map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }))
    .sort((a, b) => a.x - b.x);

  // Deduplicate nearby X coordinates cleanly
  const pts: OpticsCurvePoint[] = [];
  for (const p of sorted) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 0.002) {
      pts[pts.length - 1] = p;
    } else {
      pts.push(p);
    }
  }

  if (pts.length === 1) {
    const val = clampByte(pts[0]!.y * 255);
    lut.fill(val);
    return lut;
  }

  const n = pts.length;
  const dx = new Float64Array(n - 1);
  const dy = new Float64Array(n - 1);
  const m = new Float64Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1e-5, pts[i + 1]!.x - pts[i]!.x);
    dy[i] = pts[i + 1]!.y - pts[i]!.y;
    m[i] = dy[i]! / dx[i]!;
  }

  const tangents = new Float64Array(n);
  tangents[0] = m[0]!;
  tangents[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1]! * m[i]! <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      tangents[i] = (w1 + w2) / (w1 / m[i - 1]! + w2 / m[i]!);
    }
  }

  // Clamp tangents for strict monotonicity
  for (let i = 0; i < n - 1; i++) {
    const mi = m[i]!;
    if (Math.abs(mi) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i]! / mi;
      const b = tangents[i + 1]! / mi;
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * a * mi;
        tangents[i + 1] = tau * b * mi;
      }
    }
  }

  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    if (x <= pts[0]!.x) {
      lut[i] = clampByte(pts[0]!.y * 255);
      continue;
    }
    if (x >= pts[n - 1]!.x) {
      lut[i] = clampByte(pts[n - 1]!.y * 255);
      continue;
    }
    while (seg < n - 2 && x > pts[seg + 1]!.x) seg++;
    const h = dx[seg]!;
    const t = (x - pts[seg]!.x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const y =
      h00 * pts[seg]!.y +
      h10 * h * tangents[seg]! +
      h01 * pts[seg + 1]!.y +
      h11 * h * tangents[seg + 1]!;
    lut[i] = clampByte(y * 255);
  }

  return lut;
}

/** Fast single-pass RGB + Rec.709 Luma histogram + dynamic range telemetry. */
export function computeHistogram(data: Uint8ClampedArray): OpticsHistogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const pixelCount = data.length >>> 2;
  let lumaSum = 0;
  let shadowClip = 0;
  let highlightClip = 0;

  // Step by 1 when <= 1.2MP, stride 2 above that for instant <3ms updates
  const stride = pixelCount > 1_200_000 ? 8 : 4;
  let sampled = 0;

  for (let i = 0; i < data.length; i += stride) {
    const rv = data[i]!;
    const gv = data[i + 1]!;
    const bv = data[i + 2]!;
    const y = (rv * 54 + gv * 183 + bv * 19) >>> 8;
    r[rv] = r[rv]! + 1;
    g[gv] = g[gv]! + 1;
    b[bv] = b[bv]! + 1;
    luma[y] = luma[y]! + 1;
    lumaSum += y;
    if (y <= 4) shadowClip++;
    if (y >= 251) highlightClip++;
    sampled++;
  }

  let maxChannel = 1;
  // Ignore extreme 0/255 spike overflow so clipped borders don't crush histogram detail
  for (let i = 2; i < 254; i++) {
    if (r[i]! > maxChannel) maxChannel = r[i]!;
    if (g[i]! > maxChannel) maxChannel = g[i]!;
    if (b[i]! > maxChannel) maxChannel = b[i]!;
    if (luma[i]! > maxChannel) maxChannel = luma[i]!;
  }

  const denom = Math.max(1, sampled);
  return {
    r,
    g,
    b,
    luma,
    maxChannel,
    meanLuma: lumaSum / denom,
    shadowClipPct: (shadowClip / denom) * 100,
    highlightClipPct: (highlightClip / denom) * 100,
  };
}

/** Fast separable box blur in O(W*H) time regardless of radius on floating luminance buffer. */
export function boxBlurFloat(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const r = Math.max(1, Math.min(80, Math.round(radius)));
  const temp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    let sum = src[rowOff]! * (r + 1);
    for (let x = 1; x <= r; x++) {
      sum += src[rowOff + Math.min(width - 1, x)]!;
    }
    for (let x = 0; x < width; x++) {
      temp[rowOff + x] = sum * inv;
      const addIdx = Math.min(width - 1, x + r + 1);
      const subIdx = Math.max(0, x - r);
      sum += src[rowOff + addIdx]! - src[rowOff + subIdx]!;
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = temp[x]! * (r + 1);
    for (let y = 1; y <= r; y++) {
      sum += temp[Math.min(height - 1, y) * width + x]!;
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum * inv;
      const addRow = Math.min(height - 1, y + r + 1);
      const subRow = Math.max(0, y - r);
      sum += temp[addRow * width + x]! - temp[subRow * width + x]!;
    }
  }

  return dst;
}

/** Fast separable RGB box blur in O(W*H) time (returns Uint8ClampedArray). */
export function boxBlurRgba(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const rad = Math.max(1, Math.min(64, Math.round(radius)));
  const len = width * height * 4;
  const temp = new Float32Array(len);
  const dst = new Uint8ClampedArray(len);
  const inv = 1 / (2 * rad + 1);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sr = src[row * 4]! * (rad + 1);
    let sg = src[row * 4 + 1]! * (rad + 1);
    let sb = src[row * 4 + 2]! * (rad + 1);
    for (let x = 1; x <= rad; x++) {
      const idx = (row + Math.min(width - 1, x)) * 4;
      sr += src[idx]!;
      sg += src[idx + 1]!;
      sb += src[idx + 2]!;
    }
    for (let x = 0; x < width; x++) {
      const o = (row + x) * 4;
      temp[o] = sr * inv;
      temp[o + 1] = sg * inv;
      temp[o + 2] = sb * inv;
      temp[o + 3] = src[o + 3]!;
      const add = (row + Math.min(width - 1, x + rad + 1)) * 4;
      const sub = (row + Math.max(0, x - rad)) * 4;
      sr += src[add]! - src[sub]!;
      sg += src[add + 1]! - src[sub + 1]!;
      sb += src[add + 2]! - src[sub + 2]!;
    }
  }

  for (let x = 0; x < width; x++) {
    const xOff = x * 4;
    let sr = temp[xOff]! * (rad + 1);
    let sg = temp[xOff + 1]! * (rad + 1);
    let sb = temp[xOff + 2]! * (rad + 1);
    for (let y = 1; y <= rad; y++) {
      const idx = Math.min(height - 1, y) * width * 4 + xOff;
      sr += temp[idx]!;
      sg += temp[idx + 1]!;
      sb += temp[idx + 2]!;
    }
    for (let y = 0; y < height; y++) {
      const o = y * width * 4 + xOff;
      dst[o] = clampByte(sr * inv);
      dst[o + 1] = clampByte(sg * inv);
      dst[o + 2] = clampByte(sb * inv);
      dst[o + 3] = temp[o + 3]!;
      const add = Math.min(height - 1, y + rad + 1) * width * 4 + xOff;
      const sub = Math.max(0, y - rad) * width * 4 + xOff;
      sr += temp[add]! - temp[sub]!;
      sg += temp[add + 1]! - temp[sub + 1]!;
      sb += temp[add + 2]! - temp[sub + 2]!;
    }
  }

  return dst;
}

export function extractLumaBuffer(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = (0.2126 * data[o]! + 0.7152 * data[o + 1]! + 0.0722 * data[o + 2]!) / 255;
  }
  return out;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h / 6) * 360, s, l];
}

export function hslToRgb(hDeg: number, s: number, l: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  if (s <= 1e-5) {
    const v = clampByte(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (tIn: number) => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [clampByte(hue2rgb(h + 1 / 3) * 255), clampByte(hue2rgb(h) * 255), clampByte(hue2rgb(h - 1 / 3) * 255)];
}
