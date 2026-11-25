import { clamp } from "../color-math";
import {
  applyBlackWhite,
  applyDrama,
  applyGlamourGlow,
  applyGrainyFilm,
  applyHdrScape,
  applyNoir,
  applyPortrait,
  applyRetrolux,
  applyTonalContrast,
  applyVintage,
} from "./creative-filters";
import { applyBrushTool, applyHealing, applySelectivePoints, blendWithLayerMask } from "./local";
import {
  applyDoubleExposure,
  applyFrames,
  applyLensBlur,
  applyTextOverlays,
  applyVignette,
} from "./optics-fx";
import { applyCrop, applyExpand, applyPerspective } from "./spatial";
import {
  applyCurves,
  applyDetails,
  applyHslAndSplitTone,
  applyTune,
  applyWhiteBalance,
  type ImageBuffer,
} from "./tonal";
import type { OpticsEditLayer, OpticsToolParamMap } from "../types";

export interface OpticsRenderOptions {
  /** Stop evaluation after this layer id (inclusive), useful when editing/peeking mid-stack. */
  stopAtLayerId?: string | null;
  /** Optional layer currently being masked so its ruby overlay renders live. */
  rubyMaskLayerId?: string | null;
  /** When actively adjusting a Crop layer, keep its full oriented frame behind the crop box. */
  editingCropLayerId?: string | null;
  /** Map of double-exposure overlay buffers keyed by overlayAssetId. */
  overlayBuffers?: Map<string, ImageBuffer>;
  /** Optional upstream cache to skip re-evaluating unmodified preceding layers. */
  upstreamCache?: {
    key: string;
    buffer: ImageBuffer;
  } | null;
}

export interface OpticsRenderResult {
  buffer: ImageBuffer;
  /** Upstream snapshot right before `targetCacheLayerId`, for interactive zero-lag scrubbing. */
  upstreamSnapshot?: {
    key: string;
    buffer: ImageBuffer;
  };
}

function applySingleLayer(
  buf: ImageBuffer,
  layer: OpticsEditLayer,
  options: OpticsRenderOptions,
): ImageBuffer {
  switch (layer.toolId) {
    case "tune":
      return applyTune(buf, layer.params as OpticsToolParamMap["tune"]);
    case "details":
      return applyDetails(buf, layer.params as OpticsToolParamMap["details"]);
    case "curves":
      return applyCurves(buf, layer.params as OpticsToolParamMap["curves"]);
    case "white-balance":
      return applyWhiteBalance(buf, layer.params as OpticsToolParamMap["white-balance"]);
    case "hsl":
      return applyHslAndSplitTone(buf, layer.params as OpticsToolParamMap["hsl"]);
    case "crop":
      return applyCrop(
        buf,
        layer.params as OpticsToolParamMap["crop"],
        options.editingCropLayerId === layer.id,
      );
    case "perspective":
      return applyPerspective(buf, layer.params as OpticsToolParamMap["perspective"]);
    case "expand":
      return applyExpand(buf, layer.params as OpticsToolParamMap["expand"]);
    case "selective":
      return applySelectivePoints(buf, layer.params as OpticsToolParamMap["selective"]);
    case "brush":
      return applyBrushTool(buf, layer.params as OpticsToolParamMap["brush"]);
    case "healing":
      return applyHealing(buf, layer.params as OpticsToolParamMap["healing"]);
    case "lens-blur":
      return applyLensBlur(buf, layer.params as OpticsToolParamMap["lens-blur"]);
    case "vignette":
      return applyVignette(buf, layer.params as OpticsToolParamMap["vignette"]);
    case "double-exposure": {
      const p = layer.params as OpticsToolParamMap["double-exposure"];
      const overlay = p.overlayAssetId ? options.overlayBuffers?.get(p.overlayAssetId) ?? null : null;
      return applyDoubleExposure(buf, p, overlay);
    }
    case "text":
      return applyTextOverlays(buf, layer.params as OpticsToolParamMap["text"]);
    case "frames":
      return applyFrames(buf, layer.params as OpticsToolParamMap["frames"]);
    case "hdr-scape":
      return applyHdrScape(buf, layer.params as OpticsToolParamMap["hdr-scape"]);
    case "glamour-glow":
      return applyGlamourGlow(buf, layer.params as OpticsToolParamMap["glamour-glow"]);
    case "tonal-contrast":
      return applyTonalContrast(buf, layer.params as OpticsToolParamMap["tonal-contrast"]);
    case "drama":
      return applyDrama(buf, layer.params as OpticsToolParamMap["drama"]);
    case "vintage":
      return applyVintage(buf, layer.params as OpticsToolParamMap["vintage"]);
    case "grainy-film":
      return applyGrainyFilm(buf, layer.params as OpticsToolParamMap["grainy-film"]);
    case "retrolux":
      return applyRetrolux(buf, layer.params as OpticsToolParamMap["retrolux"]);
    case "black-white":
      return applyBlackWhite(buf, layer.params as OpticsToolParamMap["black-white"]);
    case "noir":
      return applyNoir(buf, layer.params as OpticsToolParamMap["noir"]);
    case "portrait":
      return applyPortrait(buf, layer.params as OpticsToolParamMap["portrait"]);
  }
}

export function buildUpstreamCacheKey(
  sourceKey: string,
  editStack: readonly OpticsEditLayer[],
  targetLayerId: string | null | undefined,
): string {
  if (!targetLayerId) return "";
  const idx = editStack.findIndex((l) => l.id === targetLayerId);
  if (idx <= 0) return `${sourceKey}::root`;
  return `${sourceKey}::${JSON.stringify(editStack.slice(0, idx))}`;
}

/**
 * Evaluates a non-destructive Optics edit stack sequentially from bottom to top.
 * Supports per-layer opacity, vector mask brush overlays, View Edits mid-stack inspection,
 * and active-layer upstream caching for 60fps parameter scrubbing.
 */
export function evaluateEditStack(
  source: ImageBuffer,
  sourceKey: string,
  editStack: readonly OpticsEditLayer[],
  activeLayerId?: string | null,
  options: OpticsRenderOptions = {},
): OpticsRenderResult {
  const stopIdx = options.stopAtLayerId
    ? editStack.findIndex((l) => l.id === options.stopAtLayerId)
    : -1;
  const limit = stopIdx >= 0 ? stopIdx + 1 : editStack.length;

  const desiredCacheKey = buildUpstreamCacheKey(sourceKey, editStack, activeLayerId);
  const activeIdx = activeLayerId ? editStack.findIndex((l) => l.id === activeLayerId) : -1;

  let startIdx = 0;
  let current: ImageBuffer = source;
  let capturedUpstream: { key: string; buffer: ImageBuffer } | undefined;

  if (
    activeIdx >= 0 &&
    options.upstreamCache &&
    options.upstreamCache.key === desiredCacheKey &&
    desiredCacheKey !== ""
  ) {
    current = options.upstreamCache.buffer;
    startIdx = activeIdx;
    capturedUpstream = options.upstreamCache;
  }

  for (let idx = startIdx; idx < limit; idx++) {
    if (idx === activeIdx && desiredCacheKey && !capturedUpstream) {
      capturedUpstream = {
        key: desiredCacheKey,
        buffer: {
          width: current.width,
          height: current.height,
          data: new Uint8ClampedArray(current.data),
        },
      };
    }

    const layer = editStack[idx]!;
    if (!layer.enabled || layer.opacity <= 0.5) continue;

    const processed = applySingleLayer(current, layer, options);
    const isSpatialResized =
      processed.width !== current.width || processed.height !== current.height;

    if (isSpatialResized) {
      current = processed;
    } else {
      current = blendWithLayerMask(
        current,
        processed,
        layer.mask,
        clamp(layer.opacity, 0, 100),
        options.rubyMaskLayerId === layer.id,
      );
    }
  }

  return {
    buffer: current,
    upstreamSnapshot: capturedUpstream,
  };
}

/** Scales an ImageData/HTMLImageElement/ImageBitmap cleanly to a working ImageBuffer. */
export function imageSourceToBuffer(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  maxEdge?: number,
): ImageBuffer {
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = maxEdge && Math.max(sw, sh) > maxEdge ? maxEdge / Math.max(sw, sh) : 1;
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  return { width, height, data: imgData.data };
}

/** Exports any evaluated ImageBuffer cleanly to a Blob at requested MIME type & quality. */
export async function exportBufferToBlob(
  buffer: ImageBuffer,
  mimeType: "image/png" | "image/jpeg" | "image/webp" = "image/jpeg",
  quality = 0.94,
  scale = 1,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height), 0, 0);

  let targetCanvas = canvas;
  if (scale > 0 && Math.abs(scale - 1) > 0.02) {
    const outCanvas = document.createElement("canvas");
    outCanvas.width = Math.max(1, Math.round(buffer.width * scale));
    outCanvas.height = Math.max(1, Math.round(buffer.height * scale));
    const octx = outCanvas.getContext("2d");
    if (octx) {
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(canvas, 0, 0, outCanvas.width, outCanvas.height);
      targetCanvas = outCanvas;
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    targetCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image export failed"))),
      mimeType,
      mimeType === "image/png" ? undefined : quality,
    );
  });
}
