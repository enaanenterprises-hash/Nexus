import { boxBlurRgba, clamp, clampByte } from "../color-math";
import type { ImageBuffer } from "./tonal";
import type {
  OpticsCropParams,
  OpticsExpandParams,
  OpticsFillMode,
  OpticsPerspectiveParams,
} from "../types";

function sampleBilinearMirrored(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  fx: number,
  fy: number,
): [number, number, number, number] {
  const mirrorCoord = (v: number, limit: number) => {
    if (limit <= 1) return 0;
    let m = v % (2 * (limit - 1));
    if (m < 0) m += 2 * (limit - 1);
    return m >= limit ? 2 * (limit - 1) - m : m;
  };
  const mx = mirrorCoord(fx, w);
  const my = mirrorCoord(fy, h);
  const x0 = Math.floor(mx);
  const y0 = Math.floor(my);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = mx - x0;
  const ty = my - y0;

  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 255];
  for (let c = 0; c < 4; c++) {
    const top = src[i00 + c]! * (1 - tx) + src[i10 + c]! * tx;
    const bot = src[i01 + c]! * (1 - tx) + src[i11 + c]! * tx;
    out[c] = clampByte(top * (1 - ty) + bot * ty);
  }
  return out;
}

function sampleFillPixel(
  src: Uint8ClampedArray,
  blurred: Uint8ClampedArray | null,
  w: number,
  h: number,
  fx: number,
  fy: number,
  fillMode: OpticsFillMode,
): [number, number, number, number] {
  if (fx >= 0 && fx <= w - 1 && fy >= 0 && fy <= h - 1) {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const i00 = (y0 * w + x0) * 4;
    const i10 = (y0 * w + x1) * 4;
    const i01 = (y1 * w + x0) * 4;
    const i11 = (y1 * w + x1) * 4;
    const res: [number, number, number, number] = [0, 0, 0, 255];
    for (let c = 0; c < 4; c++) {
      const top = src[i00 + c]! * (1 - tx) + src[i10 + c]! * tx;
      const bot = src[i01 + c]! * (1 - tx) + src[i11 + c]! * tx;
      res[c] = clampByte(top * (1 - ty) + bot * ty);
    }
    return res;
  }

  if (fillMode === "obsidian") return [10, 10, 13, 255];
  if (fillMode === "paper") return [245, 243, 238, 255];

  if (fillMode === "blur" && blurred) {
    const cx = clamp(Math.round(fx), 0, w - 1);
    const cy = clamp(Math.round(fy), 0, h - 1);
    const o = (cy * w + cx) * 4;
    return [blurred[o]!, blurred[o + 1]!, blurred[o + 2]!, 255];
  }

  // "smart": mirror-repeat + subtle edge softening farther from image bounds
  const m = sampleBilinearMirrored(src, w, h, fx, fy);
  if (!blurred) return m;
  const distOut = Math.max(
    fx < 0 ? -fx : fx > w - 1 ? fx - (w - 1) : 0,
    fy < 0 ? -fy : fy > h - 1 ? fy - (h - 1) : 0,
  );
  const blend = clamp(distOut / Math.max(12, Math.min(w, h) * 0.08), 0, 0.45);
  const bPx = sampleBilinearMirrored(blurred, w, h, fx, fy);
  return [
    clampByte(m[0] * (1 - blend) + bPx[0] * blend),
    clampByte(m[1] * (1 - blend) + bPx[1] * blend),
    clampByte(m[2] * (1 - blend) + bPx[2] * blend),
    255,
  ];
}

export function applyCrop(buf: ImageBuffer, params: OpticsCropParams): ImageBuffer {
  const { width: srcW, height: srcH, data } = buf;
  const hasStraighten = Math.abs(params.straightenDeg) > 0.05;
  const hasCrop =
    params.x > 0.002 ||
    params.y > 0.002 ||
    params.width < 0.998 ||
    params.height < 0.998;

  if (!hasCrop && !hasStraighten && params.rotate90 === 0 && !params.flipX && !params.flipY) {
    return buf;
  }

  // First orient with 90-degree step + flip
  const rotSteps = ((params.rotate90 % 4) + 4) % 4;
  const rotW = rotSteps % 2 === 1 ? srcH : srcW;
  const rotH = rotSteps % 2 === 1 ? srcW : srcH;

  // Crop output rectangle in oriented pixel coordinates
  const cropW = Math.max(16, Math.round(clamp(params.width, 0.05, 1) * rotW));
  const cropH = Math.max(16, Math.round(clamp(params.height, 0.05, 1) * rotH));
  const cropX = clamp(Math.round(params.x * rotW), 0, Math.max(0, rotW - cropW));
  const cropY = clamp(Math.round(params.y * rotH), 0, Math.max(0, rotH - cropH));

  const angleRad = (params.straightenDeg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  // Subtle auto-zoom when straightening to avoid black wedge corners
  const straightenScale = hasStraighten
    ? 1 + Math.abs(Math.sin(angleRad)) * 0.48
    : 1;

  const out = new Uint8ClampedArray(cropW * cropH * 4);
  const cx = rotW * 0.5;
  const cy = rotH * 0.5;

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      let rx = cropX + x - cx;
      let ry = cropY + y - cy;

      if (hasStraighten) {
        const sx = (rx * cosA + ry * sinA) / straightenScale;
        const sy = (-rx * sinA + ry * cosA) / straightenScale;
        rx = sx;
        ry = sy;
      }

      let ox = rx + cx;
      let oy = ry + cy;

      if (params.flipX) ox = rotW - 1 - ox;
      if (params.flipY) oy = rotH - 1 - oy;

      let sx = ox;
      let sy = oy;
      if (rotSteps === 1) {
        sx = oy;
        sy = srcH - 1 - ox;
      } else if (rotSteps === 2) {
        sx = srcW - 1 - ox;
        sy = srcH - 1 - oy;
      } else if (rotSteps === 3) {
        sx = srcW - 1 - oy;
        sy = ox;
      }

      const [r, g, b, a] = sampleBilinearMirrored(data, srcW, srcH, sx, sy);
      const o = (y * cropW + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }

  return { data: out, width: cropW, height: cropH };
}

export function applyPerspective(buf: ImageBuffer, params: OpticsPerspectiveParams): ImageBuffer {
  const { width, height, data } = buf;
  if (
    Math.abs(params.vertical) < 0.2 &&
    Math.abs(params.horizontal) < 0.2 &&
    Math.abs(params.rotate) < 0.1 &&
    Math.abs(params.scale) < 0.2
  ) {
    return buf;
  }

  const blurred =
    params.fillMode === "blur" || params.fillMode === "smart"
      ? boxBlurRgba(data, width, height, Math.max(4, Math.round(Math.min(width, height) * 0.014)))
      : null;

  const ky = (params.vertical / 100) * 0.42;
  const kx = (params.horizontal / 100) * 0.42;
  const ang = (-params.rotate * Math.PI) / 180;
  const cosR = Math.cos(ang);
  const sinR = Math.sin(ang);
  const scale = 1 + (params.scale / 100) * 0.9;
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    const ny0 = (y - halfH) / Math.max(1, halfH);
    for (let x = 0; x < width; x++) {
      const nx0 = (x - halfW) / Math.max(1, halfW);
      // Inverse rotate & scale
      const rx = (nx0 * cosR - ny0 * sinR) / scale;
      const ry = (nx0 * sinR + ny0 * cosR) / scale;

      // Inverse projective keystone warp
      const denom = Math.max(0.28, 1 + ky * ry + kx * rx);
      const u = (rx / denom) * halfW + halfW;
      const v = (ry / denom) * halfH + halfH;

      const [r, g, b, a] = sampleFillPixel(data, blurred, width, height, u, v, params.fillMode);
      const o = (y * width + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }

  return { data: out, width, height };
}

export function applyExpand(buf: ImageBuffer, params: OpticsExpandParams): ImageBuffer {
  const { width, height, data } = buf;
  const padL = Math.round((clamp(params.left, 0, 50) / 100) * width);
  const padR = Math.round((clamp(params.right, 0, 50) / 100) * width);
  const padT = Math.round((clamp(params.top, 0, 50) / 100) * height);
  const padB = Math.round((clamp(params.bottom, 0, 50) / 100) * height);
  if (padL + padR + padT + padB === 0) return buf;

  const outW = width + padL + padR;
  const outH = height + padT + padB;
  const out = new Uint8ClampedArray(outW * outH * 4);
  const blurred =
    params.fillMode === "blur" || params.fillMode === "smart"
      ? boxBlurRgba(data, width, height, Math.max(6, Math.round(Math.min(width, height) * 0.02)))
      : null;

  for (let y = 0; y < outH; y++) {
    const sy = y - padT;
    for (let x = 0; x < outW; x++) {
      const sx = x - padL;
      const [r, g, b, a] = sampleFillPixel(data, blurred, width, height, sx, sy, params.fillMode);
      const o = (y * outW + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = a;
    }
  }

  return { data: out, width: outW, height: outH };
}
