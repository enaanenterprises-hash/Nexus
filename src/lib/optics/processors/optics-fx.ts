import { resolveRuntimeFontFamily } from "@/lib/fonts-runtime";
import { boxBlurRgba, clamp, clampByte, smoothstep } from "../color-math";
import type { ImageBuffer } from "./tonal";
import type {
  OpticsBlendMode,
  OpticsDoubleExposureParams,
  OpticsFramesParams,
  OpticsLensBlurParams,
  OpticsTextItem,
  OpticsTextParams,
  OpticsVignetteParams,
} from "../types";

export function applyLensBlur(buf: ImageBuffer, params: OpticsLensBlurParams): ImageBuffer {
  const { width, height, data } = buf;
  if (params.blurStrength <= 0.5 && params.vignetteStrength <= 0.5) return buf;

  const blurRad = Math.max(2, Math.round((params.blurStrength / 100) * Math.min(width, height) * 0.028));
  // Double-pass box blur approximates smooth Gaussian optical bokeh cleanly
  const blur1 = boxBlurRgba(data, width, height, blurRad);
  const blurred = boxBlurRgba(blur1, width, height, Math.max(2, Math.round(blurRad * 0.72)));
  const bokehBoost = (params.bokehHighlight / 100) * 0.65;
  const vigStrength = (params.vignetteStrength / 100) * 0.72;

  const cx = params.centerX * width;
  const cy = params.centerY * height;
  const minDim = Math.max(1, Math.min(width, height));
  const innerR = (params.radius / 100) * minDim * 0.62;
  const transR = Math.max(14, (params.transition / 100) * minDim * 0.55);
  const radAngle = (params.angleDeg * Math.PI) / 180;
  const nxLine = -Math.sin(radAngle);
  const nyLine = Math.cos(radAngle);

  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d =
        params.shape === "linear"
          ? Math.abs(dx * nxLine + dy * nyLine)
          : Math.hypot(dx, dy);

      const blurWeight = smoothstep(innerR, innerR + transR, d);
      const i = (y * width + x) * 4;

      // Specular bokeh bloom lifts bright highlights slightly inside blurred field
      const bl = (blurred[i]! * 54 + blurred[i + 1]! * 183 + blurred[i + 2]! * 19) >>> 8;
      const spec = bl > 180 ? 1 + ((bl - 180) / 75) * bokehBoost * blurWeight : 1;

      const br = blurred[i]! * spec;
      const bg = blurred[i + 1]! * spec;
      const bb = blurred[i + 2]! * spec;

      let r = data[i]! * (1 - blurWeight) + br * blurWeight;
      let g = data[i + 1]! * (1 - blurWeight) + bg * blurWeight;
      let b = data[i + 2]! * (1 - blurWeight) + bb * blurWeight;

      if (vigStrength > 0.005) {
        const edgeDist = Math.hypot((x - width * 0.5) / (width * 0.5), (y - height * 0.5) / (height * 0.5));
        const vig = 1 - vigStrength * smoothstep(0.35, 1.35, edgeDist);
        r *= vig;
        g *= vig;
        b *= vig;
      }

      out[i] = clampByte(r);
      out[i + 1] = clampByte(g);
      out[i + 2] = clampByte(b);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

export function applyVignette(buf: ImageBuffer, params: OpticsVignetteParams): ImageBuffer {
  const { width, height, data } = buf;
  if (Math.abs(params.outerBrightness) < 0.5 && Math.abs(params.innerBrightness) < 0.5) return buf;

  const cx = params.centerX * width;
  const cy = params.centerY * height;
  const invRx = 1 / Math.max(1, width * 0.5);
  const invRy = 1 / Math.max(1, height * 0.5);
  const roundness = clamp(params.roundness / 100, 0, 1);
  const radiusNorm = clamp(params.radius / 100, 0.1, 1);
  const outerDelta = (params.outerBrightness / 100) * 185;
  const innerDelta = (params.innerBrightness / 100) * 95;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const dyNorm = (y - cy) * invRy;
    for (let x = 0; x < width; x++) {
      const dxNorm = (x - cx) * invRx;
      const circD = Math.hypot(dxNorm, dyNorm);
      const rectD = Math.max(Math.abs(dxNorm), Math.abs(dyNorm));
      const d = rectD * (1 - roundness) + circD * roundness;
      const outerW = smoothstep(radiusNorm * 0.55, radiusNorm + 0.65, d);
      const innerW = 1 - smoothstep(0, radiusNorm * 0.75, d);
      const shift = outerDelta * outerW + innerDelta * innerW;

      const i = (y * width + x) * 4;
      out[i] = clampByte(data[i]! + shift);
      out[i + 1] = clampByte(data[i + 1]! + shift);
      out[i + 2] = clampByte(data[i + 2]! + shift);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

function blendChannel(base: number, top: number, mode: OpticsBlendMode): number {
  const a = base / 255;
  const b = top / 255;
  let out = b;
  switch (mode) {
    case "default":
      out = b;
      break;
    case "add":
      out = Math.min(1, a + b);
      break;
    case "subtract":
      out = Math.max(0, a - b);
      break;
    case "lighten":
      out = Math.max(a, b);
      break;
    case "darken":
      out = Math.min(a, b);
      break;
    case "screen":
      out = 1 - (1 - a) * (1 - b);
      break;
    case "multiply":
      out = a * b;
      break;
    case "overlay":
      out = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
      break;
    case "soft-light":
      out = b < 0.5 ? a - (1 - 2 * b) * a * (1 - a) : a + (2 * b - 1) * (Math.sqrt(a) - a);
      break;
  }
  return clampByte(out * 255);
}

export function applyDoubleExposure(
  buf: ImageBuffer,
  params: OpticsDoubleExposureParams,
  overlayBuf: ImageBuffer | null,
): ImageBuffer {
  if (!overlayBuf || params.opacity <= 0.5) return buf;
  const { width, height, data } = buf;
  const { width: ow, height: oh, data: oData } = overlayBuf;
  const alpha = clamp(params.opacity / 100, 0, 1);
  const scale = Math.max(0.1, params.scale / 100);
  const rad = (-params.rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const offX = (params.offsetX / 100) * width;
  const offY = (params.offsetY / 100) * height;
  const baseCoverScale = Math.max(width / ow, height / oh) * scale;

  const out = new Uint8ClampedArray(data.length);
  const cx = width * 0.5 + offX;
  const cy = height * 0.5 + offY;
  const ocx = ow * 0.5;
  const ocy = oh * 0.5;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / baseCoverScale;
      const dy = (y - cy) / baseCoverScale;
      const sx = dx * cosR - dy * sinR + ocx;
      const sy = dx * sinR + dy * cosR + ocy;
      const i = (y * width + x) * 4;

      if (sx < 0 || sx >= ow - 1 || sy < 0 || sy >= oh - 1) {
        out[i] = data[i]!;
        out[i + 1] = data[i + 1]!;
        out[i + 2] = data[i + 2]!;
        out[i + 3] = data[i + 3]!;
        continue;
      }

      const ix = sx | 0;
      const iy = sy | 0;
      const oi = (iy * ow + ix) * 4;
      const br = blendChannel(data[i]!, oData[oi]!, params.blendMode);
      const bg = blendChannel(data[i + 1]!, oData[oi + 1]!, params.blendMode);
      const bb = blendChannel(data[i + 2]!, oData[oi + 2]!, params.blendMode);

      out[i] = clampByte(data[i]! * (1 - alpha) + br * alpha);
      out[i + 1] = clampByte(data[i + 1]! * (1 - alpha) + bg * alpha);
      out[i + 2] = clampByte(data[i + 2]! * (1 - alpha) + bb * alpha);
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

function resolveTextFont(item: OpticsTextItem, scale: number): { font: string; upper: boolean } {
  const px = Math.max(12, Math.round(item.size * scale));
  const serif = resolveRuntimeFontFamily("serif");
  const display = resolveRuntimeFontFamily("display");
  const sans = resolveRuntimeFontFamily("sans");
  const mono = resolveRuntimeFontFamily("mono");
  switch (item.styleId) {
    case "editorial-serif":
      return { font: `400 ${px}px ${serif}`, upper: false };
    case "technical-mono":
    case "film-frame-caption":
      return { font: `500 ${Math.round(px * 0.72)}px ${mono}`, upper: true };
    case "swiss-clean":
    case "cutout-badge":
      return { font: `600 ${px}px ${display}`, upper: true };
    case "gallery-stamp":
    case "double-hairline":
      return { font: `500 ${Math.round(px * 0.85)}px ${sans}`, upper: true };
    case "horizon-bar":
      return { font: `500 ${px}px ${serif}`, upper: false };
  }
}

export function applyTextOverlays(buf: ImageBuffer, params: OpticsTextParams): ImageBuffer {
  if (typeof document === "undefined" || !params.items || params.items.length === 0) return buf;
  const { width, height, data } = buf;
  const scale = Math.min(width, height) / 960;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) return buf;
  baseCtx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);

  for (const item of params.items) {
    if (!item.text.trim() || item.opacity <= 1) continue;
    const { font, upper } = resolveTextFont(item, scale);
    const label = upper ? item.text.toUpperCase() : item.text;
    const x = item.x * width;
    const y = item.y * height;

    const textMask = document.createElement("canvas");
    textMask.width = width;
    textMask.height = height;
    const mctx = textMask.getContext("2d");
    if (!mctx) continue;

    mctx.save();
    mctx.translate(x, y);
    mctx.rotate((item.rotationDeg * Math.PI) / 180);
    mctx.font = font;
    mctx.textAlign = item.align;
    mctx.textBaseline = "middle";
    if ("letterSpacing" in mctx) {
      (mctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${item.tracking * scale}px`;
    }

    const metrics = mctx.measureText(label);
    const padX = 24 * scale;
    const padY = 14 * scale;
    const boxW = metrics.width + padX * 2;
    const boxH = item.size * scale * 1.45 + padY;
    const boxLeft = item.align === "center" ? -boxW * 0.5 : item.align === "right" ? -boxW + padX : -padX;

    if (item.invert) {
      // Snapseed Inverted Cutout mode: paint tinted card backing with letterforms punched transparent
      mctx.fillStyle = item.color;
      mctx.globalAlpha = clamp(item.opacity / 100, 0, 1);
      mctx.beginPath();
      mctx.roundRect(boxLeft, -boxH * 0.5, boxW, boxH, 6 * scale);
      mctx.fill();

      mctx.globalCompositeOperation = "destination-out";
      mctx.globalAlpha = 1;
      mctx.fillStyle = "#000000";
      mctx.fillText(label, 0, 0);
      mctx.restore();
      baseCtx.drawImage(textMask, 0, 0);
    } else {
      baseCtx.save();
      baseCtx.translate(x, y);
      baseCtx.rotate((item.rotationDeg * Math.PI) / 180);
      baseCtx.globalAlpha = clamp(item.opacity / 100, 0, 1);
      baseCtx.font = font;
      baseCtx.textAlign = item.align;
      baseCtx.textBaseline = "middle";
      if ("letterSpacing" in baseCtx) {
        (baseCtx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${item.tracking * scale}px`;
      }
      baseCtx.fillStyle = item.color;
      baseCtx.strokeStyle = item.color;
      baseCtx.lineWidth = Math.max(1, 1.5 * scale);

      if (item.styleId === "horizon-bar" || item.styleId === "double-hairline") {
        baseCtx.globalAlpha *= 0.65;
        baseCtx.beginPath();
        baseCtx.moveTo(-boxW * 0.52, -boxH * 0.56);
        baseCtx.lineTo(boxW * 0.52, -boxH * 0.56);
        if (item.styleId === "double-hairline") {
          baseCtx.moveTo(-boxW * 0.52, boxH * 0.56);
          baseCtx.lineTo(boxW * 0.52, boxH * 0.56);
        }
        baseCtx.stroke();
        baseCtx.globalAlpha = clamp(item.opacity / 100, 0, 1);
      }

      if (item.styleId === "gallery-stamp" || item.styleId === "cutout-badge") {
        baseCtx.strokeRect(boxLeft, -boxH * 0.5, boxW, boxH);
      }

      baseCtx.shadowColor = "rgba(0,0,0,0.34)";
      baseCtx.shadowBlur = 10 * scale;
      baseCtx.fillText(label, 0, 0);
      baseCtx.restore();
    }
  }

  const outData = baseCtx.getImageData(0, 0, width, height);
  return { data: outData.data, width, height };
}

export function applyFrames(buf: ImageBuffer, params: OpticsFramesParams): ImageBuffer {
  if (params.styleId === "none" || (params.width <= 0.5 && params.innerMargin <= 0.5)) return buf;
  const { width: srcW, height: srcH, data } = buf;
  const minDim = Math.min(srcW, srcH);
  const border = Math.round((params.width / 100) * minDim * 0.14);
  const inner = Math.round((params.innerMargin / 100) * minDim * 0.04);
  if (border + inner < 2 || typeof document === "undefined") return buf;

  const extraBottom = params.styleId === "instant-border" ? Math.round(border * 2.2) : border;
  const outW = srcW + border * 2;
  const outH = srcH + border + extraBottom;

  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext("2d");
  if (!ctx) return buf;

  // Frame matte palette
  const isDarkFrame =
    params.styleId === "obsidian-frame" ||
    params.styleId === "darkroom-edge" ||
    params.styleId === "film-35mm" ||
    params.styleId === "cinema-matte";
  ctx.fillStyle =
    params.styleId === "gallery-matte" || params.styleId === "instant-border"
      ? "#f6f4ee"
      : params.styleId === "hairline-museum"
        ? "#ffffff"
        : isDarkFrame
          ? "#0c0c0f"
          : "#16161b";
  ctx.fillRect(0, 0, outW, outH);

  // Inner matte hairline bevel
  if (inner > 0) {
    ctx.strokeStyle =
      params.styleId === "gold-rule"
        ? "rgba(240, 181, 74, 0.72)"
        : isDarkFrame
          ? "rgba(255,255,255,0.14)"
          : "rgba(18,18,22,0.16)";
    ctx.lineWidth = Math.max(1, Math.round(minDim * 0.002));
    ctx.strokeRect(
      border - inner * 0.45,
      border - inner * 0.45,
      srcW + inner * 0.9,
      srcH + inner * 0.9,
    );
  }

  // 35mm sprocket holes on film-35mm & contact-sheet
  if ((params.styleId === "film-35mm" || params.styleId === "contact-sheet") && border >= 10) {
    const holeW = Math.max(5, Math.round(border * 0.44));
    const holeH = Math.max(4, Math.round(border * 0.34));
    const step = holeW * 2.1;
    ctx.fillStyle = "rgba(244, 240, 232, 0.72)";
    for (let x = border; x < outW - border - holeW; x += step) {
      ctx.beginPath();
      ctx.roundRect(x, Math.round((border - holeH) * 0.5), holeW, holeH, 2);
      ctx.roundRect(x, outH - border + Math.round((border - holeH) * 0.5), holeW, holeH, 2);
      ctx.fill();
    }
  }

  // Paint photo inside frame
  const imgCanvas = document.createElement("canvas");
  imgCanvas.width = srcW;
  imgCanvas.height = srcH;
  const ictx = imgCanvas.getContext("2d");
  if (ictx) {
    ictx.putImageData(new ImageData(new Uint8ClampedArray(data), srcW, srcH), 0, 0);
    if (params.roundness > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(border, border, srcW, srcH, (params.roundness / 100) * minDim * 0.08);
      ctx.clip();
      ctx.drawImage(imgCanvas, border, border);
      ctx.restore();
    } else {
      ctx.drawImage(imgCanvas, border, border);
    }
  }

  const final = ctx.getImageData(0, 0, outW, outH);
  return { data: final.data, width: outW, height: outH };
}
