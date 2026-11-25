import { boxBlurFloat, boxBlurRgba, clamp, clampByte, extractLumaBuffer, smoothstep } from "../color-math";
import type { ImageBuffer } from "./tonal";
import type {
  OpticsBlackWhiteParams,
  OpticsBwFilterColor,
  OpticsDramaParams,
  OpticsGlamourGlowParams,
  OpticsGrainyFilmParams,
  OpticsHdrScapeParams,
  OpticsNoirParams,
  OpticsPortraitParams,
  OpticsRetroluxParams,
  OpticsTonalContrastParams,
  OpticsVintageParams,
} from "../types";

function hashNoise(idx: number, seed: number): number {
  const x = Math.sin(idx * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

export function applyHdrScape(buf: ImageBuffer, params: OpticsHdrScapeParams): ImageBuffer {
  const { width, height, data } = buf;
  const strength = clamp(params.filterStrength / 100, 0, 1);
  if (strength < 0.01 && Math.abs(params.brightness) < 0.5) return buf;

  const luma = extractLumaBuffer(data, width, height);
  const rad = Math.max(6, Math.round(Math.min(width, height) * (0.015 + (params.smoothing / 100) * 0.03)));
  const localMean = boxBlurFloat(luma, width, height, rad);

  const presetBias =
    params.preset === "people"
      ? 0.58
      : params.preset === "strong"
        ? 1.25
        : params.preset === "fine"
          ? 0.78
          : 1;

  const brShift = (params.brightness / 100) * 0.28;
  const satGain = 1 + (params.saturation / 100) * 0.65;
  const out = new Uint8ClampedArray(data.length);

  for (let px = 0, i = 0; i < data.length; px++, i += 4) {
    const l = luma[px]!;
    const detail = l - localMean[px]!;
    // Compress macro dynamic range slightly while boosting micro-texture
    const compressedBase = 0.5 + (localMean[px]! - 0.5) * (1 - 0.34 * strength);
    const targetL = clamp(
      compressedBase + detail * (1 + strength * 1.65 * presetBias) + brShift * strength,
      0,
      1,
    );
    const ratio = l > 0.01 ? targetL / l : 1 + targetL * 1.8;

    let r = data[i]! * ratio;
    let g = data[i + 1]! * ratio;
    let b = data[i + 2]! * ratio;
    const ny = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = ny + (r - ny) * satGain;
    g = ny + (g - ny) * satGain;
    b = ny + (b - ny) * satGain;

    out[i] = clampByte(data[i]! * (1 - strength) + r * strength);
    out[i + 1] = clampByte(data[i + 1]! * (1 - strength) + g * strength);
    out[i + 2] = clampByte(data[i + 2]! * (1 - strength) + b * strength);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyGlamourGlow(buf: ImageBuffer, params: OpticsGlamourGlowParams): ImageBuffer {
  const { width, height, data } = buf;
  const glow = clamp(params.glow / 100, 0, 1);
  if (glow < 0.01 && Math.abs(params.warmth) < 0.5 && Math.abs(params.saturation) < 0.5) return buf;

  const rad = Math.max(5, Math.round(Math.min(width, height) * (0.014 + params.preset * 0.004)));
  const bloom = boxBlurRgba(data, width, height, rad);
  const warmShift = (params.warmth / 100) * 32;
  const satScale = 1 + params.saturation / 100;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r0 = data[i]! / 255;
    const g0 = data[i + 1]! / 255;
    const b0 = data[i + 2]! / 255;
    const br = bloom[i]! / 255;
    const bg = bloom[i + 1]! / 255;
    const bb = bloom[i + 2]! / 255;

    // Soft-screen optical halation with preset contrast personality
    const scrR = 1 - (1 - r0) * (1 - br * 0.82);
    const scrG = 1 - (1 - g0) * (1 - bg * 0.82);
    const scrB = 1 - (1 - b0) * (1 - bb * 0.82);

    const contrastMul = params.preset >= 4 ? 1.08 : 1;
    let r = (r0 * (1 - glow * 0.65) + scrR * (glow * 0.65)) * 255 * contrastMul + warmShift;
    let g = (g0 * (1 - glow * 0.65) + scrG * (glow * 0.65)) * 255 * contrastMul + warmShift * 0.25;
    let b = (b0 * (1 - glow * 0.65) + scrB * (glow * 0.65)) * 255 * contrastMul - warmShift * 0.78;

    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * satScale;
    g = l + (g - l) * satScale;
    b = l + (b - l) * satScale;

    out[i] = clampByte(r);
    out[i + 1] = clampByte(g);
    out[i + 2] = clampByte(b);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyTonalContrast(buf: ImageBuffer, params: OpticsTonalContrastParams): ImageBuffer {
  const { width, height, data } = buf;
  const hiG = params.highTones / 100;
  const midG = params.midTones / 100;
  const lowG = params.lowTones / 100;
  if (hiG < 0.01 && midG < 0.01 && lowG < 0.01) return buf;

  const luma = extractLumaBuffer(data, width, height);
  const fineBlur = boxBlurFloat(luma, width, height, Math.max(2, Math.round(Math.min(width, height) * 0.006)));
  const medBlur = boxBlurFloat(luma, width, height, Math.max(6, Math.round(Math.min(width, height) * 0.018)));
  const protLow = 1 - clamp(params.protectShadows / 100, 0, 0.92);
  const protHi = 1 - clamp(params.protectHighlights / 100, 0, 0.92);
  const out = new Uint8ClampedArray(data.length);

  for (let px = 0, i = 0; i < data.length; px++, i += 4) {
    const l = luma[px]!;
    const detail = (l - fineBlur[px]!) * 0.6 + (l - medBlur[px]!) * 0.4;
    const wHi = smoothstep(0.55, 0.92, l) * protHi;
    const wLow = (1 - smoothstep(0.08, 0.45, l)) * protLow;
    const wMid = clamp(1 - wHi - wLow, 0, 1);

    const boost = detail * (hiG * wHi + midG * wMid + lowG * wLow) * 285;
    out[i] = clampByte(data[i]! + boost);
    out[i + 1] = clampByte(data[i + 1]! + boost);
    out[i + 2] = clampByte(data[i + 2]! + boost);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyDrama(buf: ImageBuffer, params: OpticsDramaParams): ImageBuffer {
  const { width, height, data } = buf;
  const strength = clamp(params.filterStrength / 100, 0, 1);
  if (strength < 0.01) return buf;

  const luma = extractLumaBuffer(data, width, height);
  const local = boxBlurFloat(luma, width, height, Math.max(6, Math.round(Math.min(width, height) * 0.02)));
  const bias = params.preset === "bright" ? 16 : params.preset === "dark1" ? -18 : params.preset === "dark2" ? -28 : 0;
  const satScale = 1 + (params.saturation / 100) * 0.85;
  const out = new Uint8ClampedArray(data.length);

  for (let px = 0, i = 0; i < data.length; px++, i += 4) {
    const l = luma[px]!;
    const detail = (l - local[px]!) * 2.1;
    const sCurve = 0.5 + Math.tanh((l - 0.5) * 2.1) * 0.5;
    const targetL = clamp(sCurve + detail * 0.72 + bias / 255, 0, 1);
    const scale = l > 0.01 ? targetL / l : 1;

    let r = data[i]! * scale;
    let g = data[i + 1]! * scale;
    let b = data[i + 2]! * scale;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * satScale;
    g = y + (g - y) * satScale;
    b = y + (b - y) * satScale;

    out[i] = clampByte(data[i]! * (1 - strength) + r * strength);
    out[i + 1] = clampByte(data[i + 1]! * (1 - strength) + g * strength);
    out[i + 2] = clampByte(data[i + 2]! * (1 - strength) + b * strength);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

const VINTAGE_PALETTES: ReadonlyArray<{ sh: [number, number, number]; hi: [number, number, number] }> = [
  { sh: [24, 34, 48], hi: [248, 226, 186] },
  { sh: [42, 26, 20], hi: [252, 232, 198] },
  { sh: [18, 42, 38], hi: [246, 224, 178] },
  { sh: [38, 28, 44], hi: [242, 228, 202] },
  { sh: [30, 36, 24], hi: [248, 238, 198] },
  { sh: [18, 26, 48], hi: [236, 226, 212] },
  { sh: [48, 24, 32], hi: [252, 220, 182] },
  { sh: [22, 38, 44], hi: [242, 236, 210] },
  { sh: [36, 30, 22], hi: [248, 220, 172] },
  { sh: [24, 24, 34], hi: [236, 226, 198] },
  { sh: [34, 38, 26], hi: [252, 216, 178] },
  { sh: [18, 32, 42], hi: [246, 234, 204] },
];

export function applyVintage(buf: ImageBuffer, params: OpticsVintageParams): ImageBuffer {
  const { width, height, data } = buf;
  const styleS = clamp(params.styleStrength / 100, 0, 1);
  const vigS = clamp(params.vignetteStrength / 100, 0, 1);
  const pal = VINTAGE_PALETTES[Math.max(0, Math.min(VINTAGE_PALETTES.length - 1, params.style - 1))]!;
  const brShift = (params.brightness / 100) * 65;
  const satScale = 1 + params.saturation / 100;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const ny = (y - height * 0.5) / Math.max(1, height * 0.5);
    for (let x = 0; x < width; x++) {
      const nx = (x - width * 0.5) / Math.max(1, width * 0.5);
      const dist = Math.hypot(nx, ny);
      const vig = 1 - vigS * 0.62 * smoothstep(0.38, 1.38, dist);
      const i = (y * width + x) * 4;

      let r = data[i]! + brShift;
      let g = data[i + 1]! + brShift;
      let b = data[i + 2]! + brShift;
      const l = clamp((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, 0, 1);

      const sr = pal.sh[0] * (1 - l) + pal.hi[0] * l;
      const sg = pal.sh[1] * (1 - l) + pal.hi[1] * l;
      const sb = pal.sh[2] * (1 - l) + pal.hi[2] * l;

      r = r * (1 - styleS * 0.42) + sr * (styleS * 0.42);
      g = g * (1 - styleS * 0.42) + sg * (styleS * 0.42);
      b = b * (1 - styleS * 0.42) + sb * (styleS * 0.42);

      const y2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = (y2 + (r - y2) * satScale) * vig;
      g = (y2 + (g - y2) * satScale) * vig;
      b = (y2 + (b - y2) * satScale) * vig;

      out[i] = clampByte(r);
      out[i + 1] = clampByte(g);
      out[i + 2] = clampByte(b);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

export const FILM_STOCKS: ReadonlyArray<{
  id: string;
  label: string;
  contrast: number;
  fade: number;
  warm: number;
  tealShift: number;
  sat: number;
}> = [
  { id: "A01", label: "A01 Crisp Warm", contrast: 1.12, fade: 8, warm: 12, tealShift: 0, sat: 1.08 },
  { id: "A02", label: "A02 Soft Kodak", contrast: 1.06, fade: 14, warm: 16, tealShift: -4, sat: 0.94 },
  { id: "B01", label: "B01 Cobalt Fade", contrast: 1.08, fade: 18, warm: -8, tealShift: 12, sat: 0.88 },
  { id: "B02", label: "B02 Golden Amber", contrast: 1.14, fade: 10, warm: 20, tealShift: -2, sat: 1.05 },
  { id: "C01", label: "C01 Emerald Fuji", contrast: 1.1, fade: 12, warm: -4, tealShift: 16, sat: 0.96 },
  { id: "C02", label: "C02 Pastel Portra", contrast: 0.98, fade: 16, warm: 10, tealShift: 4, sat: 0.9 },
  { id: "L01", label: "L01 Silver Slide", contrast: 1.22, fade: 6, warm: 4, tealShift: 6, sat: 1.12 },
  { id: "L02", label: "L02 Muted Slate", contrast: 1.05, fade: 20, warm: -6, tealShift: 8, sat: 0.78 },
  { id: "L03", label: "L03 Obsidian Cine", contrast: 1.18, fade: 12, warm: 14, tealShift: 12, sat: 0.92 },
  { id: "S01", label: "S01 Warm Sepia", contrast: 1.12, fade: 14, warm: 24, tealShift: -6, sat: 0.56 },
  { id: "X01", label: "X01 Cross Process", contrast: 1.2, fade: 10, warm: -10, tealShift: 20, sat: 1.18 },
  { id: "X02", label: "X02 Dusk Copper", contrast: 1.15, fade: 12, warm: 22, tealShift: 6, sat: 0.95 },
];

export function applyGrainyFilm(buf: ImageBuffer, params: OpticsGrainyFilmParams): ImageBuffer {
  const { width, height, data } = buf;
  const stock = FILM_STOCKS.find((f) => f.id === params.preset) ?? FILM_STOCKS[0]!;
  const strength = clamp(params.styleStrength / 100, 0, 1);
  const grainAmp = (params.grain / 100) * 34;
  const out = new Uint8ClampedArray(data.length);

  for (let px = 0, i = 0; i < data.length; px++, i += 4) {
    let r = (data[i]! - 128) * (1 + (stock.contrast - 1) * strength) + 128 + stock.fade * strength;
    let g = (data[i + 1]! - 128) * (1 + (stock.contrast - 1) * strength) + 128 + stock.fade * strength;
    let b = (data[i + 2]! - 128) * (1 + (stock.contrast - 1) * strength) + 128 + stock.fade * strength;

    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = 1 + (stock.sat - 1) * strength;
    r = l + (r - l) * sat + stock.warm * strength;
    g = l + (g - l) * sat + stock.tealShift * 0.35 * strength;
    b = l + (b - l) * sat - stock.warm * 0.65 * strength + stock.tealShift * (1 - l / 255) * strength;

    if (grainAmp > 0.2) {
      const midBias = 0.5 + 0.5 * (1 - Math.abs(l / 255 - 0.5) * 2);
      const n = hashNoise(px, 41) * grainAmp * midBias;
      r += n;
      g += n;
      b += n;
    }

    out[i] = clampByte(r);
    out[i + 1] = clampByte(g);
    out[i + 2] = clampByte(b);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyRetrolux(buf: ImageBuffer, params: OpticsRetroluxParams): ImageBuffer {
  const { width, height, data } = buf;
  const styleS = clamp(params.styleStrength / 100, 0, 1);
  const brShift = (params.brightness / 100) * 58;
  const contrastF = 1 + (params.contrast / 100) * 0.68;
  const satScale = 1 + params.saturation / 100;
  const leakAmp = clamp(params.lightLeaks / 100, 0, 1);
  const scratchAmp = clamp(params.scratches / 100, 0, 1);

  const leakX = width * (((params.seed * 37) % 100) / 100);
  const leakY = height * (((params.seed * 61) % 100) / 100);
  const maxDim = Math.max(width, height);
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const isDustLine = scratchAmp > 0.05 && Math.abs(Math.sin(y * 0.87 + params.seed)) > 0.996 - scratchAmp * 0.015;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = (data[i]! + brShift - 128) * contrastF + 128;
      let g = (data[i + 1]! + brShift - 128) * contrastF + 128;
      let b = (data[i + 2]! + brShift - 128) * contrastF + 128;

      // Color emulsion tinting keyed by style 1..10
      const warmTint = ((params.style % 3) - 1) * 14 * styleS;
      const greenShadow = (1 - (r + g + b) / 765) * 16 * styleS;
      r += warmTint + 8 * styleS;
      g += greenShadow * 0.6;
      b -= warmTint * 0.8 - 6 * styleS;

      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * satScale;
      g = l + (g - l) * satScale;
      b = l + (b - l) * satScale;

      if (leakAmp > 0.02) {
        const dLeak = Math.hypot(x - leakX, y - leakY) / (maxDim * 0.55);
        const lw = clamp(1 - dLeak, 0, 1) ** 2 * leakAmp * 0.75;
        r += 235 * lw;
        g += 128 * lw;
        b += 46 * lw;
      }

      if (isDustLine && Math.abs(Math.cos(x * 0.12 + params.seed)) > 0.78) {
        r += 54 * scratchAmp;
        g += 52 * scratchAmp;
        b += 48 * scratchAmp;
      }

      out[i] = clampByte(r);
      out[i + 1] = clampByte(g);
      out[i + 2] = clampByte(b);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

const BW_FILTER_WEIGHTS: Record<OpticsBwFilterColor, [number, number, number]> = {
  neutral: [0.299, 0.587, 0.114],
  red: [0.76, 0.2, 0.04],
  orange: [0.62, 0.34, 0.04],
  yellow: [0.46, 0.5, 0.04],
  green: [0.18, 0.72, 0.1],
  blue: [0.12, 0.26, 0.62],
};

export function applyBlackWhite(buf: ImageBuffer, params: OpticsBlackWhiteParams): ImageBuffer {
  const { width, height, data } = buf;
  const [wr, wg, wb] = BW_FILTER_WEIGHTS[params.filterColor] ?? BW_FILTER_WEIGHTS.neutral;
  const brShift = (params.brightness / 100) * 72 + (params.preset === "bright" ? 16 : params.preset === "dark" ? -16 : 0);
  const contrastBoost = params.preset === "contrast" ? 0.22 : params.preset === "film" ? 0.12 : 0;
  const contrastF = 1 + clamp(params.contrast / 100 + contrastBoost, -0.8, 1.4);
  const grainAmp = (params.grain / 100) * 32;
  const out = new Uint8ClampedArray(data.length);

  for (let px = 0, i = 0; i < data.length; px++, i += 4) {
    let lum = data[i]! * wr + data[i + 1]! * wg + data[i + 2]! * wb;
    if (params.preset === "darken-sky") {
      const blueRatio = clamp((data[i + 2]! - data[i]!) / 255, 0, 1);
      lum -= blueRatio * 42;
    }
    lum = (lum + brShift - 128) * contrastF + 128;
    if (grainAmp > 0.2) {
      lum += hashNoise(px, 19) * grainAmp;
    }
    const v = clampByte(lum);
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

export function applyNoir(buf: ImageBuffer, params: OpticsNoirParams): ImageBuffer {
  const { width, height, data } = buf;
  const strength = clamp(params.filterStrength / 100, 0, 1);
  const brShift = (params.brightness / 100) * 65;
  const washFloor = (params.wash / 100) * 34;
  const grainAmp = (params.grain / 100) * 36;
  const silverTint = params.preset === "S02" ? [3, 2, -2] : params.preset === "S04" ? [-2, 1, 4] : [0, 0, 0];
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const ny = (y - height * 0.5) / Math.max(1, height * 0.5);
    for (let x = 0; x < width; x++) {
      const nx = (x - width * 0.5) / Math.max(1, width * 0.5);
      const vig = 1 - 0.58 * smoothstep(0.32, 1.32, Math.hypot(nx, ny));
      const px = y * width + x;
      const i = px * 4;

      const rawLum = (data[i]! * 0.34 + data[i + 1]! * 0.54 + data[i + 2]! * 0.12 + brShift) / 255;
      // High-contrast cinema curve + lifted darkroom wash floor
      const curved = 0.5 + Math.tanh((rawLum - 0.48) * 2.55) * 0.5;
      let bw = curved * 255 * vig;
      bw = washFloor + (bw / 255) * (255 - washFloor * 1.15);
      if (grainAmp > 0.2) bw += hashNoise(px, 73) * grainAmp;

      const nr = clampByte(bw + silverTint[0]!);
      const ng = clampByte(bw + silverTint[1]!);
      const nb = clampByte(bw + silverTint[2]!);

      out[i] = clampByte(data[i]! * (1 - strength) + nr * strength);
      out[i + 1] = clampByte(data[i + 1]! * (1 - strength) + ng * strength);
      out[i + 2] = clampByte(data[i + 2]! * (1 - strength) + nb * strength);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

export function applyPortrait(buf: ImageBuffer, params: OpticsPortraitParams): ImageBuffer {
  const { width, height, data } = buf;
  const rad = Math.max(4, Math.round(Math.min(width, height) * 0.012));
  const softRgb = params.skinSmoothing > 0.5 ? boxBlurRgba(data, width, height, rad) : null;
  const smoothAmt = clamp(params.skinSmoothing / 100, 0, 1) * 0.72;
  const eyeAmt = clamp(params.eyeClarity / 100, 0, 1);
  const spotAmt = (params.faceSpotlight / 100) * 64;

  const luma = eyeAmt > 0.01 ? extractLumaBuffer(data, width, height) : null;
  const eyeBlur = luma && eyeAmt > 0.01 ? boxBlurFloat(luma, width, height, 2) : null;

  const cx = params.focusX * width;
  const cy = params.focusY * height;
  const maxR = Math.max(1, Math.min(width, height) * 0.52);
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = y * width + x;
      const i = px * 4;
      let r = data[i]!;
      let g = data[i + 1]!;
      let b = data[i + 2]!;

      // Skin-chroma affinity detector (Cb/Cr heuristic) so eyes/hair stay razor crisp
      if (softRgb && smoothAmt > 0.01) {
        const isWarmSkin = r > 70 && g > 45 && b > 30 && r > g && r > b && r - g > 10 && r - b > 18;
        if (isWarmSkin) {
          const edgeDiff = Math.abs(r - softRgb[i]!) + Math.abs(g - softRgb[i + 1]!);
          const bilateral = clamp(1 - edgeDiff / 85, 0, 1) * smoothAmt;
          r = r * (1 - bilateral) + softRgb[i]! * bilateral;
          g = g * (1 - bilateral) + softRgb[i + 1]! * bilateral;
          b = b * (1 - bilateral) + softRgb[i + 2]! * bilateral;
        }
      }

      const d = Math.hypot(x - cx, y - cy) / maxR;
      const spotW = 1 - smoothstep(0.32, 1.15, d);

      // Eye / catchlight clarity inside central face region
      if (luma && eyeBlur && spotW > 0.15) {
        const detail = (luma[px]! - eyeBlur[px]!) * eyeAmt * spotW * 240;
        r += detail;
        g += detail;
        b += detail;
      }

      // Face spotlight lift + subtle background falloff
      const spotShift = spotAmt * (spotW - 0.35);
      out[i] = clampByte(r + spotShift);
      out[i + 1] = clampByte(g + spotShift);
      out[i + 2] = clampByte(b + spotShift);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}
