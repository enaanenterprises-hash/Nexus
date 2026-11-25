import { boxBlurFloat, clamp, clampByte, extractLumaBuffer } from "../color-math";
import type { ImageBuffer } from "./tonal";
import type {
  OpticsBrushParams,
  OpticsHealingParams,
  OpticsLayerMask,
  OpticsSelectiveParams,
} from "../types";

/**
 * U-Point Selective Control Points (Snapseed signature):
 * Each pin samples its anchor pixel color, builds a bilateral color+spatial falloff mask
 * controlled by `reach`, and locally tunes Brightness, Contrast, Saturation, and Structure.
 */
export function applySelectivePoints(buf: ImageBuffer, params: OpticsSelectiveParams): ImageBuffer {
  if (!params.points || params.points.length === 0) return buf;
  const { width, height, data } = buf;
  const needsStructure = params.points.some((p) => Math.abs(p.structure) > 0.5);
  const lumaBuf = needsStructure ? extractLumaBuffer(data, width, height) : null;
  const blurBuf =
    needsStructure && lumaBuf
      ? boxBlurFloat(lumaBuf, width, height, Math.max(4, Math.round(Math.min(width, height) * 0.012)))
      : null;

  const minDim = Math.max(1, Math.min(width, height));
  const refs = params.points.map((pt) => {
    const px = clamp(Math.round(pt.x * (width - 1)), 0, width - 1);
    const py = clamp(Math.round(pt.y * (height - 1)), 0, height - 1);
    const idx = (py * width + px) * 4;
    return {
      pt,
      cx: pt.x * width,
      cy: pt.y * height,
      radSq: Math.max(12, pt.reach * minDim) ** 2,
      refR: data[idx]!,
      refG: data[idx + 1]!,
      refB: data[idx + 2]!,
      refL: (data[idx]! * 54 + data[idx + 1]! * 183 + data[idx + 2]! * 19) >>> 8,
    };
  });

  const selectedId = params.selectedPointId ?? params.points[0]?.id ?? null;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = y * width + x;
      const i = px * 4;
      let r = data[i]!;
      let g = data[i + 1]!;
      let b = data[i + 2]!;
      const origL = (r * 54 + g * 183 + b * 19) >>> 8;
      let overlayMask = 0;

      for (const ref of refs) {
        const dx = x - ref.cx;
        const dy = y - ref.cy;
        const distSq = dx * dx + dy * dy;
        if (distSq > ref.radSq * 2.2) continue;

        const spatialW = Math.exp((-distSq / ref.radSq) * 1.9);
        const dr = r - ref.refR;
        const dg = g - ref.refG;
        const db = b - ref.refB;
        const dl = origL - ref.refL;
        // Color + luminance affinity (normalized U-Point tolerance)
        const colorDist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
        const lumDist = Math.abs(dl) / 255;
        const colorW = Math.exp(-(colorDist * colorDist * 14 + lumDist * lumDist * 10));
        const w = clamp(spatialW * colorW * 1.15, 0, 1);
        if (w < 0.01) continue;

        if (params.showMaskOverlay && ref.pt.id === selectedId) {
          overlayMask = Math.max(overlayMask, w);
        }

        const br = (ref.pt.brightness / 100) * 95 * w;
        const cf = 1 + (ref.pt.contrast / 100) * 0.72 * w;
        const sat = 1 + (ref.pt.saturation / 100) * 0.9 * w;
        const structBoost =
          lumaBuf && blurBuf ? (lumaBuf[px]! - blurBuf[px]!) * (ref.pt.structure / 100) * 280 * w : 0;

        let rr = (r + br + structBoost - 128) * cf + 128;
        let gg = (g + br + structBoost - 128) * cf + 128;
        let bb = (b + br + structBoost - 128) * cf + 128;
        const ll = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
        rr = ll + (rr - ll) * sat;
        gg = ll + (gg - ll) * sat;
        bb = ll + (bb - ll) * sat;

        r = clampByte(rr);
        g = clampByte(gg);
        b = clampByte(bb);
      }

      if (overlayMask > 0.02) {
        const tintA = overlayMask * 0.56;
        out[i] = clampByte(r * (1 - tintA) + 225 * tintA);
        out[i + 1] = clampByte(g * (1 - tintA) + 54 * tintA);
        out[i + 2] = clampByte(b * (1 - tintA) + 64 * tintA);
      } else {
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
      out[i + 3] = data[i + 3]!;
    }
  }

  return { data: out, width, height };
}

function rasterizeStrokesMap(
  width: number,
  height: number,
  strokes: ReadonlyArray<{
    points: ReadonlyArray<{ x: number; y: number }>;
    radius: number;
    strength: number;
  }>,
  baseVal = 0,
): Float32Array {
  const map = new Float32Array(width * height);
  if (baseVal !== 0) map.fill(baseVal);
  const maxDim = Math.max(width, height);

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const radPx = Math.max(3, stroke.radius * maxDim);
    const radSq = radPx * radPx;
    const target = stroke.strength;

    for (let p = 0; p < stroke.points.length; p++) {
      const a = stroke.points[p]!;
      const b = p > 0 ? stroke.points[p - 1]! : a;
      const ax = a.x * width;
      const ay = a.y * height;
      const bx = b.x * width;
      const by = b.y * height;
      const dist = Math.hypot(ax - bx, ay - by);
      const steps = Math.max(1, Math.ceil(dist / Math.max(2, radPx * 0.35)));

      for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0 : s / steps;
        const cx = bx + (ax - bx) * t;
        const cy = by + (ay - by) * t;
        const x0 = Math.max(0, Math.floor(cx - radPx));
        const x1 = Math.min(width - 1, Math.ceil(cx + radPx));
        const y0 = Math.max(0, Math.floor(cy - radPx));
        const y1 = Math.min(height - 1, Math.ceil(cy + radPx));

        for (let y = y0; y <= y1; y++) {
          const dy = y - cy;
          for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const d2 = dx * dx + dy * dy;
            if (d2 >= radSq) continue;
            const dNorm = Math.sqrt(d2) / radPx;
            const falloff = (1 - dNorm * dNorm) ** 2;
            const idx = y * width + x;
            if (target === 0) {
              // Eraser stroke pulls toward 0 smoothly
              map[idx] = map[idx]! * (1 - falloff * 0.85);
            } else {
              // Brush accumulates cleanly up to target sign/magnitude without harsh seams
              const cur = map[idx]!;
              map[idx] = cur + (target - cur) * falloff * 0.65;
            }
          }
        }
      }
    }
  }
  return map;
}

export function applyBrushTool(buf: ImageBuffer, params: OpticsBrushParams): ImageBuffer {
  if (!params.strokes || params.strokes.length === 0) return buf;
  const { width, height, data } = buf;

  const byMode: Record<string, Float32Array> = {
    "dodge-burn": new Float32Array(width * height),
    exposure: new Float32Array(width * height),
    temperature: new Float32Array(width * height),
    saturation: new Float32Array(width * height),
  };

  for (const stroke of params.strokes) {
    const modeMap = byMode[stroke.mode] ?? byMode["dodge-burn"]!;
    const layer = rasterizeStrokesMap(
      width,
      height,
      [{ points: stroke.points, radius: stroke.radius, strength: stroke.strength === 0 ? 0 : stroke.strength / 10 }],
      0,
    );
    for (let i = 0; i < modeMap.length; i++) {
      if (stroke.strength === 0) {
        const eraseW = clamp(
          rasterizeStrokesMap(width, height, [{ points: stroke.points, radius: stroke.radius, strength: 1 }], 0)[i]!,
          0,
          1,
        );
        for (const k of Object.keys(byMode)) {
          byMode[k]![i] = byMode[k]![i]! * (1 - eraseW);
        }
      } else {
        const v = layer[i]!;
        if (Math.abs(v) > 0.001) {
          modeMap[i] = clamp(modeMap[i]! + v * (1 - Math.abs(modeMap[i]!) * 0.35), -1, 1);
        }
      }
    }
  }

  const out = new Uint8ClampedArray(data.length);
  const dodgeMap = byMode["dodge-burn"]!;
  const expMap = byMode["exposure"]!;
  const tempMap = byMode["temperature"]!;
  const satMap = byMode["saturation"]!;

  for (let px = 0, i = 0; i < data.length; px++, i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    const db = dodgeMap[px]!;
    if (Math.abs(db) > 0.005) {
      const mul = db > 0 ? 1 + db * 0.58 : 1 + db * 0.45;
      r *= mul;
      g *= mul;
      b *= mul;
    }

    const ex = expMap[px]!;
    if (Math.abs(ex) > 0.005) {
      const shift = ex * 78;
      r += shift;
      g += shift;
      b += shift;
    }

    const tp = tempMap[px]!;
    if (Math.abs(tp) > 0.005) {
      r += tp * 36;
      b -= tp * 36;
    }

    const st = satMap[px]!;
    if (Math.abs(st) > 0.005) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const scale = Math.max(0, 1 + st * 0.95);
      r = l + (r - l) * scale;
      g = l + (g - l) * scale;
      b = l + (b - l) * scale;
    }

    if (params.showMaskOverlay) {
      const maskVis = clamp(Math.max(Math.abs(db), Math.abs(ex), Math.abs(tp), Math.abs(st)), 0, 1) * 0.55;
      if (maskVis > 0.02) {
        r = r * (1 - maskVis) + 225 * maskVis;
        g = g * (1 - maskVis) + 52 * maskVis;
        b = b * (1 - maskVis) + 64 * maskVis;
      }
    }

    out[i] = clampByte(r);
    out[i + 1] = clampByte(g);
    out[i + 2] = clampByte(b);
    out[i + 3] = data[i + 3]!;
  }

  return { data: out, width, height };
}

/**
 * Patch-matched Healing Brush:
 * Rasterizes the healed stroke mask, computes its bounding box + clean annulus candidates,
 * picks the lowest boundary gradient patch offset around the defect, and Poisson-blends
 * luminance & texture smoothly across the mask border.
 */
export function applyHealing(buf: ImageBuffer, params: OpticsHealingParams): ImageBuffer {
  if (!params.strokes || params.strokes.length === 0) return buf;
  const { width, height, data } = buf;
  const working = new Uint8ClampedArray(data);
  const maxDim = Math.max(width, height);

  for (const stroke of params.strokes) {
    if (stroke.points.length === 0) continue;
    const radPx = Math.max(4, Math.round(stroke.radius * maxDim));
    const mask = rasterizeStrokesMap(
      width,
      height,
      [{ points: stroke.points, radius: stroke.radius, strength: 1 }],
      0,
    );

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]! > 0.04) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX > maxX || minY > maxY) continue;

    // Sample candidate clean offsets in 12 directions around stroke centroid
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const searchDist = Math.max(radPx * 1.9, Math.min(maxDim * 0.14, Math.max(boxW, boxH) * 0.9 + radPx));
    let bestDx = Math.round(searchDist);
    let bestDy = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let k = 0; k < 12; k++) {
      const theta = ((k + (stroke.seed % 5) * 0.15) * Math.PI * 2) / 12;
      const dx = Math.round(Math.cos(theta) * searchDist);
      const dy = Math.round(Math.sin(theta) * searchDist);
      if (minX + dx < 0 || maxX + dx >= width || minY + dy < 0 || maxY + dy >= height) continue;

      let cost = 0;
      let samples = 0;
      let overlapsMask = false;
      const step = Math.max(1, Math.floor(Math.max(boxW, boxH) / 16));
      for (let y = minY; y <= maxY; y += step) {
        for (let x = minX; x <= maxX; x += step) {
          const m = mask[y * width + x]!;
          const sx = x + dx;
          const sy = y + dy;
          if (mask[sy * width + sx]! > 0.15) {
            overlapsMask = true;
            break;
          }
          if (m > 0.04 && m < 0.55) {
            const p0 = (y * width + x) * 4;
            const p1 = (sy * width + sx) * 4;
            cost +=
              Math.abs(working[p0]! - working[p1]!) +
              Math.abs(working[p0 + 1]! - working[p1 + 1]!) +
              Math.abs(working[p0 + 2]! - working[p1 + 2]!);
            samples++;
          }
        }
        if (overlapsMask) break;
      }
      if (!overlapsMask && samples > 0 && cost / samples < bestCost) {
        bestCost = cost / samples;
        bestDx = dx;
        bestDy = dy;
      }
    }

    // Illumination-compensated patch blend inside masked stroke
    let origEdgeSumR = 0;
    let origEdgeSumG = 0;
    let origEdgeSumB = 0;
    let srcEdgeSumR = 0;
    let srcEdgeSumG = 0;
    let srcEdgeSumB = 0;
    let edgeCount = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const m = mask[y * width + x]!;
        if (m > 0.05 && m < 0.55) {
          const sx = clamp(x + bestDx, 0, width - 1);
          const sy = clamp(y + bestDy, 0, height - 1);
          const p0 = (y * width + x) * 4;
          const p1 = (sy * width + sx) * 4;
          origEdgeSumR += working[p0]!;
          origEdgeSumG += working[p0 + 1]!;
          origEdgeSumB += working[p0 + 2]!;
          srcEdgeSumR += working[p1]!;
          srcEdgeSumG += working[p1 + 1]!;
          srcEdgeSumB += working[p1 + 2]!;
          edgeCount++;
        }
      }
    }

    const biasR = edgeCount > 0 ? (origEdgeSumR - srcEdgeSumR) / edgeCount : 0;
    const biasG = edgeCount > 0 ? (origEdgeSumG - srcEdgeSumG) / edgeCount : 0;
    const biasB = edgeCount > 0 ? (origEdgeSumB - srcEdgeSumB) / edgeCount : 0;

    const snapshot = new Uint8ClampedArray(working);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const m = clamp(mask[y * width + x]! * 1.45, 0, 1);
        if (m <= 0.01) continue;
        const sx = clamp(x + bestDx, 0, width - 1);
        const sy = clamp(y + bestDy, 0, height - 1);
        const p0 = (y * width + x) * 4;
        const p1 = (sy * width + sx) * 4;
        const pr = clampByte(snapshot[p1]! + biasR * 0.72);
        const pg = clampByte(snapshot[p1 + 1]! + biasG * 0.72);
        const pb = clampByte(snapshot[p1 + 2]! + biasB * 0.72);
        working[p0] = clampByte(snapshot[p0]! * (1 - m) + pr * m);
        working[p0 + 1] = clampByte(snapshot[p0 + 1]! * (1 - m) + pg * m);
        working[p0 + 2] = clampByte(snapshot[p0 + 2]! * (1 - m) + pb * m);
      }
    }
  }

  return { data: working, width, height };
}

/**
 * Composites `processed` over `upstream` using per-layer painted Stack Mask (`mask`),
 * layer `opacity`, and optional ruby mask visualization.
 */
export function blendWithLayerMask(
  upstream: ImageBuffer,
  processed: ImageBuffer,
  mask: OpticsLayerMask | null,
  opacityPct: number,
  previewRubyMask = false,
): ImageBuffer {
  const layerAlpha = clamp(opacityPct / 100, 0, 1);
  if (
    upstream.width !== processed.width ||
    upstream.height !== processed.height ||
    (!mask && layerAlpha >= 0.995 && !previewRubyMask)
  ) {
    return processed;
  }

  const { width, height } = processed;
  const out = new Uint8ClampedArray(processed.data.length);
  const maskMap =
    mask && mask.enabled
      ? rasterizeStrokesMap(
          width,
          height,
          mask.strokes.map((s) => ({ points: s.points, radius: s.radius, strength: s.strength })),
          mask.baseAlpha,
        )
      : null;

  for (let px = 0, i = 0; i < out.length; px++, i += 4) {
    let w = layerAlpha;
    if (maskMap) {
      let m = clamp(maskMap[px]!, 0, 1);
      if (mask?.invert) m = 1 - m;
      w *= m;
    }
    const r = clampByte(upstream.data[i]! * (1 - w) + processed.data[i]! * w);
    const g = clampByte(upstream.data[i + 1]! * (1 - w) + processed.data[i + 1]! * w);
    const b = clampByte(upstream.data[i + 2]! * (1 - w) + processed.data[i + 2]! * w);

    if (previewRubyMask && w > 0.02) {
      const ruby = w * 0.48;
      out[i] = clampByte(r * (1 - ruby) + 225 * ruby);
      out[i + 1] = clampByte(g * (1 - ruby) + 46 * ruby);
      out[i + 2] = clampByte(b * (1 - ruby) + 58 * ruby);
    } else {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
    out[i + 3] = processed.data[i + 3]!;
  }

  return { data: out, width, height };
}
