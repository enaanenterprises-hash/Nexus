import {
  boxBlurFloat,
  buildSplineLut,
  clamp,
  clampByte,
  extractLumaBuffer,
  hslToRgb,
  rgbToHsl,
} from "../color-math";
import { HSL_CHANNEL_META } from "../tools-meta";
import type {
  OpticsCurvesParams,
  OpticsDetailsParams,
  OpticsHslParams,
  OpticsTuneParams,
  OpticsWhiteBalanceParams,
} from "../types";

export interface ImageBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Computes intelligent Auto-Tune values from dynamic-range percentiles and chroma spread. */
export function computeAutoTuneParams(buf: ImageBuffer): OpticsTuneParams {
  const { data } = buf;
  const hist = new Uint32Array(256);
  let satSum = 0;
  let warmBias = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const y = (r * 54 + g * 183 + b * 19) >>> 8;
    hist[y] = hist[y]! + 1;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx > 0) satSum += (mx - mn) / mx;
    warmBias += (r - b) / 255;
    count++;
  }

  let p5 = 0;
  let p50 = 128;
  let p95 = 255;
  let acc = 0;
  const c5 = count * 0.05;
  const c50 = count * 0.5;
  const c95 = count * 0.95;
  let got5 = false;
  let got50 = false;

  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    if (!got5 && acc >= c5) {
      p5 = i;
      got5 = true;
    }
    if (!got50 && acc >= c50) {
      p50 = i;
      got50 = true;
    }
    if (acc >= c95) {
      p95 = i;
      break;
    }
  }

  const spread = p95 - p5;
  const meanSat = satSum / Math.max(1, count);
  const brightness = Math.round(clamp((126 - p50) * 0.52, -32, 34));
  const contrast = Math.round(clamp((205 - spread) * 0.34, -12, 38));
  const ambiance = Math.round(clamp(16 + (0.42 - meanSat) * 28, 6, 30));
  const shadows = Math.round(clamp(p5 < 24 ? 18 : 6, -15, 28));
  const highlights = Math.round(clamp(p95 > 236 ? -18 : -6, -30, 12));
  const saturation = Math.round(clamp((0.36 - meanSat) * 48, -12, 26));
  const warmth = Math.round(clamp(-(warmBias / Math.max(1, count)) * 18, -14, 14));

  return { brightness, contrast, saturation, ambiance, highlights, shadows, warmth };
}

/** Computes Gray-World White Balance correction + Tint neutralization. */
export function computeAutoWhiteBalance(buf: ImageBuffer): OpticsWhiteBalanceParams {
  const { data } = buf;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 12) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const l = (r + g + b) / 3;
    if (l > 25 && l < 235) {
      sr += r;
      sg += g;
      sb += b;
      n++;
    }
  }
  if (n === 0) return { temperature: 0, tint: 0, sampledRgb: null };
  const mr = sr / n;
  const mg = sg / n;
  const mb = sb / n;
  return solveNeutralWhiteBalance(mr, mg, mb);
}

/** Converts an eye-dropped neutral pixel RGB into calibrated Temperature & Tint shifts. */
export function solveNeutralWhiteBalance(r: number, g: number, b: number): OpticsWhiteBalanceParams {
  const avg = Math.max(1, (r + g + b) / 3);
  const rbDiff = (b - r) / avg; // if blue > red, warm it up (+)
  const gDiff = (r + b) / 2 - g; // if green > rb midpoint, push magenta (+)
  return {
    temperature: Math.round(clamp(rbDiff * 135, -100, 100)),
    tint: Math.round(clamp((gDiff / avg) * 145, -100, 100)),
    sampledRgb: { r: Math.round(r), g: Math.round(g), b: Math.round(b) },
  };
}

export function applyTune(buf: ImageBuffer, params: OpticsTuneParams): ImageBuffer {
  const { width, height, data } = buf;
  const out = new Uint8ClampedArray(data.length);
  const bright = (params.brightness / 100) * 0.42;
  const contrastFactor = 1 + (params.contrast / 100) * 0.85;
  const satScale = 1 + params.saturation / 100;
  const ambiance = params.ambiance / 100;
  const hiShift = (params.highlights / 100) * 0.55;
  const shShift = (params.shadows / 100) * 0.55;
  const warm = (params.warmth / 100) * 38;

  // Ambiance local midtone map when non-zero
  const localBlur =
    Math.abs(ambiance) > 0.01
      ? boxBlurFloat(extractLumaBuffer(data, width, height), width, height, Math.max(8, Math.round(Math.min(width, height) * 0.028)))
      : null;

  for (let i = 0, px = 0; i < data.length; i += 4, px++) {
    let r = data[i]! / 255;
    let g = data[i + 1]! / 255;
    let b = data[i + 2]! / 255;

    // 1. Brightness & Warmth
    r += bright + warm / 255;
    g += bright + (warm * 0.14) / 255;
    b += bright - (warm * 0.88) / 255;

    // 2. Shadow / Highlight selective zone recovery
    const luma = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
    const shadowMask = (1 - luma) * (1 - luma);
    const highMask = luma * luma;
    const zoneGain = shShift * shadowMask + hiShift * highMask;
    r += zoneGain;
    g += zoneGain;
    b += zoneGain;

    // 3. Ambiance (local contrast + shadow lift + vibrant color depth)
    if (localBlur) {
      const localL = localBlur[px]!;
      const detail = luma - localL;
      const midWeight = 4 * luma * (1 - luma);
      const lift = ambiance * 0.16 * (1 - localL) + detail * ambiance * 0.58 * (0.4 + 0.6 * midWeight);
      r += lift;
      g += lift;
      b += lift;
    }

    // 4. Contrast S-curve pivot at 0.5
    r = (r - 0.5) * contrastFactor + 0.5;
    g = (g - 0.5) * contrastFactor + 0.5;
    b = (b - 0.5) * contrastFactor + 0.5;

    // 5. Saturation + Ambiance vibrance boost
    const l2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const vib = ambiance > 0 ? 1 + ambiance * 0.22 : 1 + ambiance * 0.15;
    const totalSat = Math.max(0, satScale * vib);
    r = l2 + (r - l2) * totalSat;
    g = l2 + (g - l2) * totalSat;
    b = l2 + (b - l2) * totalSat;

    out[i] = clampByte(r * 255);
    out[i + 1] = clampByte(g * 255);
    out[i + 2] = clampByte(b * 255);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyDetails(buf: ImageBuffer, params: OpticsDetailsParams): ImageBuffer {
  const { width, height, data } = buf;
  const struct = params.structure / 100;
  const sharp = clamp(params.sharpening / 100, 0, 1);
  if (Math.abs(struct) < 0.01 && sharp < 0.01) return buf;

  const luma = extractLumaBuffer(data, width, height);
  const structRadius = Math.max(4, Math.min(18, Math.round(Math.min(width, height) * 0.012)));
  const blurStruct = Math.abs(struct) > 0.01 ? boxBlurFloat(luma, width, height, structRadius) : null;
  const blurSharp = sharp > 0.01 ? boxBlurFloat(luma, width, height, 1.5) : null;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0, px = 0; i < data.length; i += 4, px++) {
    const l = luma[px]!;
    let delta = 0;
    if (blurStruct) {
      const hp = l - blurStruct[px]!;
      // Protect deep blacks & pure whites from halo clipping
      const protect = clamp(4 * l * (1 - l), 0.18, 1);
      delta += hp * struct * 1.45 * protect;
    }
    if (blurSharp) {
      const edge = l - blurSharp[px]!;
      if (Math.abs(edge) > 0.008) {
        delta += edge * sharp * 1.65;
      }
    }
    const shift = delta * 255;
    out[i] = clampByte(data[i]! + shift);
    out[i + 1] = clampByte(data[i + 1]! + shift);
    out[i + 2] = clampByte(data[i + 2]! + shift);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyCurves(buf: ImageBuffer, params: OpticsCurvesParams): ImageBuffer {
  const lutRgb = buildSplineLut(params.rgb);
  const lutR = buildSplineLut(params.red);
  const lutG = buildSplineLut(params.green);
  const lutB = buildSplineLut(params.blue);
  const lutLuma = buildSplineLut(params.luma);

  let lumaNonLinear = false;
  for (let i = 0; i < 256; i++) {
    if (lutLuma[i] !== i) {
      lumaNonLinear = true;
      break;
    }
  }

  const { data, width, height } = buf;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    let r = lutRgb[lutR[data[i]!]!]!;
    let g = lutRgb[lutG[data[i + 1]!]!]!;
    let b = lutRgb[lutB[data[i + 2]!]!]!;

    if (lumaNonLinear) {
      const y = (r * 54 + g * 183 + b * 19) >>> 8;
      const targetY = lutLuma[y]!;
      const scale = y > 2 ? targetY / y : 1;
      r = clampByte(r * scale + (targetY - y) * 0.25);
      g = clampByte(g * scale + (targetY - y) * 0.25);
      b = clampByte(b * scale + (targetY - y) * 0.25);
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyWhiteBalance(buf: ImageBuffer, params: OpticsWhiteBalanceParams): ImageBuffer {
  const temp = (params.temperature / 100) * 0.34;
  const tint = (params.tint / 100) * 0.28;
  if (Math.abs(temp) < 0.002 && Math.abs(tint) < 0.002) return buf;

  const rGain = 1 + temp + tint * 0.35;
  const gGain = 1 - tint * 0.65;
  const bGain = 1 - temp + tint * 0.35;

  const { data, width, height } = buf;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r0 = data[i]!;
    const g0 = data[i + 1]!;
    const b0 = data[i + 2]!;
    const origY = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    const rn = r0 * rGain;
    const gn = g0 * gGain;
    const bn = b0 * bGain;
    const newY = Math.max(1, 0.2126 * rn + 0.7152 * gn + 0.0722 * bn);
    // Preserve natural scene exposure while shifting color balance
    const norm = 0.68 + 0.32 * (origY / newY);
    out[i] = clampByte(rn * norm);
    out[i + 1] = clampByte(gn * norm);
    out[i + 2] = clampByte(bn * norm);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyHslAndSplitTone(buf: ImageBuffer, params: OpticsHslParams): ImageBuffer {
  const { data, width, height } = buf;
  const hasBands = HSL_CHANNEL_META.some((ch) => {
    const b = params.bands[ch.id];
    return b && (Math.abs(b.hue) > 0.5 || Math.abs(b.saturation) > 0.5 || Math.abs(b.luminance) > 0.5);
  });
  const hasSplit =
    params.shadows.saturation > 0.5 ||
    params.midtones.saturation > 0.5 ||
    params.highlights.saturation > 0.5;

  if (!hasBands && !hasSplit) return buf;

  const [shR, shG, shB] = hslToRgb(params.shadows.hue, 0.75, 0.5);
  const [mdR, mdG, mdB] = hslToRgb(params.midtones.hue, 0.75, 0.5);
  const [hiR, hiG, hiB] = hslToRgb(params.highlights.hue, 0.75, 0.5);
  const balanceShift = (params.balance / 100) * 0.25;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    if (hasBands) {
      const [h, s, l] = rgbToHsl(r, g, b);
      if (s > 0.03) {
        let dHue = 0;
        let dSat = 0;
        let dLum = 0;
        for (const ch of HSL_CHANNEL_META) {
          const band = params.bands[ch.id];
          if (!band) continue;
          let dist = Math.abs(h - ch.centerHue);
          if (dist > 180) dist = 360 - dist;
          if (dist < 48) {
            const w = 0.5 * (1 + Math.cos((Math.PI * dist) / 48));
            dHue += (band.hue / 100) * 32 * w;
            dSat += (band.saturation / 100) * 0.85 * w;
            dLum += (band.luminance / 100) * 0.34 * w;
          }
        }
        if (Math.abs(dHue) > 0.05 || Math.abs(dSat) > 0.005 || Math.abs(dLum) > 0.005) {
          const [nr, ng, nb] = hslToRgb(h + dHue, clamp(s * (1 + dSat), 0, 1), clamp(l + dLum, 0, 1));
          r = nr;
          g = ng;
          b = nb;
        }
      }
    }

    if (hasSplit) {
      const y = clamp((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 + balanceShift, 0, 1);
      const wShadow = Math.pow(clamp(1 - y * 2, 0, 1), 1.35) * (params.shadows.saturation / 100) * 0.35;
      const wHigh = Math.pow(clamp((y - 0.5) * 2, 0, 1), 1.35) * (params.highlights.saturation / 100) * 0.35;
      const wMid = (1 - Math.abs(y - 0.5) * 2) * (params.midtones.saturation / 100) * 0.25;
      r = clampByte(r * (1 - wShadow - wMid - wHigh) + shR * wShadow + mdR * wMid + hiR * wHigh);
      g = clampByte(g * (1 - wShadow - wMid - wHigh) + shG * wShadow + mdG * wMid + hiG * wHigh);
      b = clampByte(b * (1 - wShadow - wMid - wHigh) + shB * wShadow + mdB * wMid + hiB * wHigh);
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}
