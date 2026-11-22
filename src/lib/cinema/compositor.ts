import { sampleClipEnvelopeAt } from "@/lib/creative/nexus-bridge";
import type {
  CinemaAnimation,
  CinemaAudioClip,
  CinemaBackground,
  CinemaClip,
  CinemaFilter,
  CinemaImageClip,
  CinemaProject,
  CinemaShapeClip,
  CinemaTextClip,
  CinemaTransform,
  CinemaTransition,
  CinemaVideoClip,
  CinemaVisualClip,
  CinemaVisualizerClip,
} from "./types";

export type CinemaDrawableMedia = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export interface CinemaRenderRuntime {
  mediaElements: ReadonlyMap<string, CinemaDrawableMedia>;
  frequencyBins?: Float32Array;
  showSafeGuides?: boolean;
  isExport?: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function easeOutCubic(t: number): number {
  const u = clamp(t, 0, 1);
  return 1 - Math.pow(1 - u, 3);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function computeProjectDurationMs(project: Pick<CinemaProject, "clips">): number {
  const maxClip = project.clips.reduce((max, c) => Math.max(max, c.startMs + c.durationMs), 0);
  return Math.max(5000, maxClip);
}

export function visualBoxPx(
  transform: CinemaTransform,
  canvasWidth: number,
  canvasHeight: number,
): { cx: number; cy: number; w: number; h: number } {
  const w = (transform.width / 100) * canvasWidth;
  const h = (transform.height / 100) * canvasHeight;
  const cx = (transform.x / 100) * canvasWidth;
  const cy = (transform.y / 100) * canvasHeight;
  return { cx, cy, w, h };
}

let cachedBgCanvas: HTMLCanvasElement | null = null;
let cachedBgKey = "";

function paintBackgroundDirect(
  ctx: CanvasRenderingContext2D,
  bg: CinemaBackground,
  width: number,
  height: number,
): void {
  if (bg.type === "linear") {
    const rad = ((bg.angleDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(rad) * width * 0.6;
    const dy = Math.sin(rad) * height * 0.6;
    const grad = ctx.createLinearGradient(
      width / 2 - dx,
      height / 2 - dy,
      width / 2 + dx,
      height / 2 + dy,
    );
    grad.addColorStop(0, bg.colorA);
    grad.addColorStop(1, bg.colorB);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (bg.type === "radial") {
    const grad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.44,
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    grad.addColorStop(0, bg.colorA);
    grad.addColorStop(1, bg.colorB);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = bg.colorA;
    ctx.fillRect(0, 0, width, height);
    if (bg.type === "grid") {
      ctx.save();
      ctx.strokeStyle = bg.colorB || "rgba(255,255,255,0.06)";
      ctx.lineWidth = Math.max(1, width / 1400);
      const step = Math.max(48, Math.round(width / 24));
      ctx.beginPath();
      for (let x = step; x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = step; y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  if (bg.grain > 0.005) {
    ctx.save();
    const alpha = Math.min(0.08, bg.grain * 0.6);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    const dotStep = Math.max(24, Math.round(width / 46));
    let seed = 1337;
    for (let y = 8; y < height; y += dotStep) {
      for (let x = 8; x < width; x += dotStep) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const jx = ((seed & 255) / 255 - 0.5) * dotStep * 0.8;
        const jy = (((seed >> 8) & 255) / 255 - 0.5) * dotStep * 0.8;
        ctx.fillRect(x + jx, y + jy, 1.4, 1.4);
      }
    }
    ctx.restore();
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: CinemaBackground,
  width: number,
  height: number,
): void {
  if (typeof document === "undefined") {
    paintBackgroundDirect(ctx, bg, width, height);
    return;
  }

  const key = `${width}x${height}|${bg.type}|${bg.colorA}|${bg.colorB}|${bg.angleDeg}|${bg.grain.toFixed(4)}`;
  if (!cachedBgCanvas || cachedBgKey !== key) {
    if (!cachedBgCanvas) {
      cachedBgCanvas = document.createElement("canvas");
    }
    cachedBgCanvas.width = width;
    cachedBgCanvas.height = height;
    const bgCtx = cachedBgCanvas.getContext("2d", { alpha: false });
    if (!bgCtx) {
      paintBackgroundDirect(ctx, bg, width, height);
      return;
    }
    paintBackgroundDirect(bgCtx, bg, width, height);
    cachedBgKey = key;
  }

  ctx.drawImage(cachedBgCanvas, 0, 0);
}

function buildFilterString(filter: CinemaFilter, extraBlurPx = 0): string {
  const parts: string[] = [];
  if (Math.abs(filter.brightness - 1) > 0.01) parts.push(`brightness(${filter.brightness.toFixed(2)})`);
  if (Math.abs(filter.contrast - 1) > 0.01) parts.push(`contrast(${filter.contrast.toFixed(2)})`);
  if (Math.abs(filter.saturate - 1) > 0.01) parts.push(`saturate(${filter.saturate.toFixed(2)})`);
  if (filter.temperature > 0.02) parts.push(`sepia(${(filter.temperature * 0.48).toFixed(2)})`);
  if (filter.temperature < -0.02) parts.push(`hue-rotate(${Math.round(filter.temperature * 26)}deg)`);
  const blurTotal = filter.blur + extraBlurPx;
  if (blurTotal > 0.1) parts.push(`blur(${blurTotal.toFixed(1)}px)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function computeMotionState(
  anim: CinemaAnimation,
  clipLocalMs: number,
  clipDurationMs: number,
  canvasWidth: number,
  canvasHeight: number,
): { opacityMul: number; dx: number; dy: number; scale: number; blurPx: number; charFraction: number } {
  let opacityMul = 1;
  let dx = 0;
  let dy = 0;
  let scale = 1;
  let blurPx = 0;
  let charFraction = 1;

  if (anim.inType !== "none" && anim.inDurationMs > 0 && clipLocalMs < anim.inDurationMs) {
    const p = easeOutCubic(clipLocalMs / anim.inDurationMs);
    switch (anim.inType) {
      case "fade":
        opacityMul *= p;
        break;
      case "rise":
        opacityMul *= p;
        dy += (1 - p) * canvasHeight * 0.045;
        break;
      case "slide-left":
        opacityMul *= p;
        dx += (1 - p) * canvasWidth * 0.08;
        break;
      case "slide-right":
        opacityMul *= p;
        dx -= (1 - p) * canvasWidth * 0.08;
        break;
      case "pop":
        opacityMul *= p;
        scale *= 0.84 + p * 0.16;
        break;
      case "zoom-in":
        opacityMul *= p;
        scale *= 0.92 + p * 0.08;
        break;
      case "blur-in":
        opacityMul *= p;
        blurPx += (1 - p) * 14;
        break;
      case "typewriter":
        charFraction = clamp(clipLocalMs / anim.inDurationMs, 0.04, 1);
        break;
    }
  }

  const remaining = clipDurationMs - clipLocalMs;
  if (anim.outType !== "none" && anim.outDurationMs > 0 && remaining < anim.outDurationMs) {
    const p = easeOutCubic(remaining / anim.outDurationMs);
    switch (anim.outType) {
      case "fade":
      case "typewriter":
        opacityMul *= p;
        break;
      case "rise":
        opacityMul *= p;
        dy -= (1 - p) * canvasHeight * 0.04;
        break;
      case "slide-left":
        opacityMul *= p;
        dx -= (1 - p) * canvasWidth * 0.08;
        break;
      case "slide-right":
        opacityMul *= p;
        dx += (1 - p) * canvasWidth * 0.08;
        break;
      case "pop":
      case "zoom-in":
        opacityMul *= p;
        scale *= 0.9 + p * 0.1;
        break;
      case "blur-in":
        opacityMul *= p;
        blurPx += (1 - p) * 12;
        break;
    }
  }

  return { opacityMul, dx, dy, scale, blurPx, charFraction };
}

function computeClipTransitionEffect(
  clip: CinemaVisualClip,
  trackClips: CinemaVisualClip[],
  transitions: CinemaTransition[],
  timeMs: number,
  canvasWidth: number,
): { opacityMul: number; dx: number; scale: number; wipeX?: number; dipColor?: string; dipAlpha?: number } {
  let opacityMul = 1;
  let dx = 0;
  let scale = 1;
  let wipeX: number | undefined;
  let dipColor: string | undefined;
  let dipAlpha = 0;

  // Outgoing transition (tail of clip)
  const outTrans = transitions.find((t) => t.afterClipId === clip.id);
  if (outTrans && outTrans.type !== "cut" && outTrans.durationMs > 0) {
    const outStart = clip.startMs + clip.durationMs - outTrans.durationMs;
    if (timeMs >= outStart && timeMs <= clip.startMs + clip.durationMs) {
      const p = clamp((timeMs - outStart) / outTrans.durationMs, 0, 1);
      if (outTrans.type === "dissolve") opacityMul *= 1 - p;
      else if (outTrans.type === "slide-left") dx -= p * canvasWidth;
      else if (outTrans.type === "slide-right") dx += p * canvasWidth;
      else if (outTrans.type === "zoom") {
        scale *= 1 + p * 0.16;
        opacityMul *= 1 - p;
      } else if (outTrans.type === "wipe") {
        wipeX = 1 - p;
      } else if (outTrans.type === "dip-black") {
        dipColor = "#000000";
        dipAlpha = Math.sin(p * Math.PI * 0.5);
      } else if (outTrans.type === "dip-white") {
        dipColor = "#f7f6f2";
        dipAlpha = Math.sin(p * Math.PI * 0.5);
      }
    }
  }

  // Incoming transition from immediately preceding clip on same track
  const idx = trackClips.findIndex((c) => c.id === clip.id);
  if (idx > 0) {
    const prevClip = trackClips[idx - 1]!;
    const inTrans = transitions.find((t) => t.afterClipId === prevClip.id);
    if (inTrans && inTrans.type !== "cut" && inTrans.durationMs > 0) {
      const inEnd = clip.startMs + inTrans.durationMs;
      if (timeMs >= clip.startMs && timeMs <= inEnd) {
        const p = clamp((timeMs - clip.startMs) / inTrans.durationMs, 0, 1);
        if (inTrans.type === "dissolve") opacityMul *= p;
        else if (inTrans.type === "slide-left") dx += (1 - easeOutCubic(p)) * canvasWidth;
        else if (inTrans.type === "slide-right") dx -= (1 - easeOutCubic(p)) * canvasWidth;
        else if (inTrans.type === "zoom") {
          scale *= 1.15 - easeOutCubic(p) * 0.15;
          opacityMul *= p;
        } else if (inTrans.type === "wipe") {
          wipeX = p;
        } else if (inTrans.type === "dip-black") {
          dipColor = "#000000";
          dipAlpha = Math.cos(p * Math.PI * 0.5);
        } else if (inTrans.type === "dip-white") {
          dipColor = "#f7f6f2";
          dipAlpha = Math.cos(p * Math.PI * 0.5);
        }
      }
    }
  }

  return { opacityMul, dx, scale, wipeX, dipColor, dipAlpha };
}

function drawMediaBox(
  ctx: CanvasRenderingContext2D,
  el: CinemaDrawableMedia,
  w: number,
  h: number,
  fit: "cover" | "contain",
  kenBurnsFactor = { scale: 1, panX: 0 },
): void {
  const natW =
    el instanceof HTMLVideoElement
      ? el.videoWidth || w
      : el instanceof HTMLImageElement
        ? el.naturalWidth || w
        : el.width || w;
  const natH =
    el instanceof HTMLVideoElement
      ? el.videoHeight || h
      : el instanceof HTMLImageElement
        ? el.naturalHeight || h
        : el.height || h;
  if (natW <= 0 || natH <= 0) return;

  const boxAspect = w / Math.max(1, h);
  const srcAspect = natW / Math.max(1, natH);

  let drawW = w;
  let drawH = h;
  if (fit === "cover") {
    if (srcAspect > boxAspect) {
      drawH = h;
      drawW = h * srcAspect;
    } else {
      drawW = w;
      drawH = w / srcAspect;
    }
  } else {
    if (srcAspect > boxAspect) {
      drawW = w;
      drawH = w / srcAspect;
    } else {
      drawH = h;
      drawW = h * srcAspect;
    }
  }

  drawW *= kenBurnsFactor.scale;
  drawH *= kenBurnsFactor.scale;
  const offsetX = -drawW / 2 + kenBurnsFactor.panX * w * 0.08;
  const offsetY = -drawH / 2;
  ctx.drawImage(el, offsetX, offsetY, drawW, drawH);
}

function drawTextClip(
  ctx: CanvasRenderingContext2D,
  clip: CinemaTextClip,
  w: number,
  h: number,
  canvasHeight: number,
  charFraction: number,
): void {
  const fontPx = Math.max(10, (clip.fontSize / 1080) * canvasHeight);
  const visibleChars = Math.max(1, Math.round(clip.text.length * charFraction));
  const rawText = charFraction < 0.999 ? clip.text.slice(0, visibleChars) : clip.text;
  ctx.font = `${clip.fontWeight} ${fontPx}px ${clip.fontFamily}`;
  ctx.textBaseline = "middle";

  const pad = (clip.backgroundPadding / 1080) * canvasHeight;
  const maxLineWidth = Math.max(40, w - pad * 2);

  // Word-wrap respecting explicit newlines
  const paragraphs = rawText.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxLineWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }

  const linePx = fontPx * clip.lineHeight;
  const totalTextH = lines.length * linePx;
  const maxMeasuredW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);

  if (clip.backgroundColor && clip.backgroundColor !== "transparent") {
    const plateW = Math.min(w, maxMeasuredW + pad * 2.2);
    const plateH = totalTextH + pad * 1.4;
    const plateX =
      clip.align === "left"
        ? -w / 2
        : clip.align === "right"
          ? w / 2 - plateW
          : -plateW / 2;
    const plateY = -plateH / 2;
    ctx.fillStyle = clip.backgroundColor;
    roundRectPath(
      ctx,
      plateX,
      plateY,
      plateW,
      plateH,
      (clip.backgroundRadius / 1080) * canvasHeight,
    );
    ctx.fill();
  }

  ctx.textAlign = clip.align;
  const anchorX =
    clip.align === "left"
      ? -w / 2 + pad
      : clip.align === "right"
        ? w / 2 - pad
        : 0;
  const startY = -totalTextH / 2 + linePx / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * linePx;
    if (clip.strokeWidth > 0 && clip.strokeColor !== "transparent") {
      ctx.strokeStyle = clip.strokeColor;
      ctx.lineWidth = (clip.strokeWidth / 1080) * canvasHeight;
      ctx.lineJoin = "round";
      ctx.strokeText(lines[i]!, anchorX, y);
    }
    ctx.fillStyle = clip.color;
    ctx.fillText(lines[i]!, anchorX, y);
  }
}

function drawShapeClip(
  ctx: CanvasRenderingContext2D,
  clip: CinemaShapeClip,
  w: number,
  h: number,
  projectProgress: number,
  canvasHeight: number,
): void {
  const strokeW = (clip.strokeWidth / 1080) * canvasHeight;
  const radius = (clip.transform.borderRadius / 1080) * canvasHeight;

  if (clip.shapeKind === "circle") {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
    if (clip.fill !== "transparent") {
      ctx.fillStyle = clip.fill;
      ctx.fill();
    }
    if (strokeW > 0) {
      ctx.strokeStyle = clip.stroke;
      ctx.lineWidth = strokeW;
      ctx.stroke();
    }
    return;
  }

  if (clip.shapeKind === "line" || clip.shapeKind === "arrow") {
    ctx.strokeStyle = clip.stroke || clip.fill;
    ctx.lineWidth = Math.max(2, strokeW || 3);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    if (clip.shapeKind === "arrow") {
      const head = Math.min(w * 0.25, h * 0.75, 24);
      ctx.moveTo(w / 2 - head, -head * 0.7);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(w / 2 - head, head * 0.7);
    }
    ctx.stroke();
    return;
  }

  if (clip.shapeKind === "progress-bar") {
    const barR = Math.min(h / 2, 999);
    ctx.fillStyle = clip.stroke || "rgba(255,255,255,0.16)";
    roundRectPath(ctx, -w / 2, -h / 2, w, h, barR);
    ctx.fill();
    const fillW = Math.max(h, w * clamp(projectProgress, 0, 1));
    ctx.fillStyle = clip.fill || "#ff3b30";
    roundRectPath(ctx, -w / 2, -h / 2, fillW, h, barR);
    ctx.fill();
    return;
  }

  if (clip.shapeKind === "device-desktop") {
    const outerR = Math.max(14, Math.min(28, w * 0.024));
    ctx.fillStyle = clip.fill;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, outerR);
    ctx.fill();
    ctx.strokeStyle = clip.stroke;
    ctx.lineWidth = Math.max(1.5, strokeW);
    ctx.stroke();
    const chromeH = Math.max(22, h * 0.085);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2 + chromeH);
    ctx.lineTo(w / 2, -h / 2 + chromeH);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    const dotY = -h / 2 + chromeH / 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-w / 2 + chromeH * 0.55 + i * 14, dotY, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
    }
    return;
  }

  if (clip.shapeKind === "device-phone") {
    const outerR = Math.max(24, w * 0.14);
    ctx.fillStyle = clip.fill;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, outerR);
    ctx.fill();
    ctx.strokeStyle = clip.stroke;
    ctx.lineWidth = Math.max(2, strokeW);
    ctx.stroke();
    const islandW = w * 0.28;
    const islandH = Math.max(10, h * 0.028);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRectPath(ctx, -islandW / 2, -h / 2 + islandH * 0.85, islandW, islandH, islandH / 2);
    ctx.fill();
    return;
  }

  if (clip.shapeKind === "callout") {
    const tail = Math.min(20, h * 0.22);
    const r = radius || 14;
    ctx.fillStyle = clip.fill;
    roundRectPath(ctx, -w / 2, -h / 2, w, h - tail * 0.5, r);
    ctx.fill();
    if (strokeW > 0) {
      ctx.strokeStyle = clip.stroke;
      ctx.lineWidth = strokeW;
      ctx.stroke();
    }
    return;
  }

  const r = clip.shapeKind === "pill" ? Math.min(w, h) / 2 : radius || 16;
  ctx.fillStyle = clip.fill;
  roundRectPath(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();
  if (strokeW > 0) {
    ctx.strokeStyle = clip.stroke;
    ctx.lineWidth = strokeW;
    ctx.stroke();
  }
}

function drawVisualizerClip(
  ctx: CanvasRenderingContext2D,
  clip: CinemaVisualizerClip,
  w: number,
  h: number,
  bins: Float32Array | undefined,
  timeMs: number,
): void {
  const count = clamp(clip.barCount, 12, 96);
  const gap = (w / count) * 0.28;
  const barW = Math.max(2, w / count - gap);

  const sampleAt = (i: number): number => {
    if (bins && bins.length > 0) {
      const idx = Math.min(bins.length - 1, Math.floor((i / count) * bins.length));
      return clamp((bins[idx] ?? 0) * clip.sensitivity, 0.04, 1);
    }
    // Gentle resting baseline modulation when paused so layout stays visible
    const phase = timeMs * 0.002 + i * 0.34;
    return clamp(0.14 + 0.09 * Math.sin(phase) + 0.05 * Math.cos(phase * 1.7), 0.04, 1);
  };

  if (clip.style === "horizon-line") {
    ctx.beginPath();
    ctx.strokeStyle = clip.color;
    ctx.lineWidth = Math.max(2.5, h * 0.025);
    ctx.lineCap = "round";
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = -w / 2 + t * w;
      const amp = sampleAt(Math.min(i, count - 1));
      const wave = Math.sin(t * Math.PI * 8 + timeMs * 0.005) * amp * h * 0.44;
      if (i === 0) ctx.moveTo(x, wave);
      else ctx.lineTo(x, wave);
    }
    ctx.stroke();
    return;
  }

  if (clip.style === "ring") {
    const rBase = Math.min(w, h) * 0.28;
    const rReach = Math.min(w, h) * 0.21;
    ctx.strokeStyle = clip.color;
    ctx.lineWidth = Math.max(2, (rBase * 2 * Math.PI) / count * 0.45);
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const amp = sampleAt(i);
      const r1 = rBase;
      const r2 = rBase + amp * rReach;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      ctx.stroke();
    }
    return;
  }

  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, clip.color);
  grad.addColorStop(1, clip.secondaryColor || clip.color);
  ctx.fillStyle = grad;

  for (let i = 0; i < count; i++) {
    const amp = sampleAt(i);
    const barH = Math.max(barW, amp * h);
    const x = -w / 2 + i * (barW + gap);
    const y = clip.style === "mirror-wave" ? -barH / 2 : h / 2 - barH;
    roundRectPath(ctx, x, y, barW, barH, barW / 2);
    ctx.fill();
  }
}

/**
 * Returns true if the rendered 2D canvas frame at `timeMs` is guaranteed to be
 * pixel-identical to the frame already rendered at `prevTimeMs`.
 */
export function isCinemaFrameStaticSince(
  project: CinemaProject,
  prevTimeMs: number,
  timeMs: number,
): boolean {
  if (prevTimeMs < 0) return false;

  const activeTrackIds = new Set<string>();
  for (const t of project.tracks) {
    if (t.kind !== "audio" && !t.hidden) activeTrackIds.add(t.id);
  }

  const maxTransMs =
    project.transitions.length > 0
      ? project.transitions.reduce((m, tr) => Math.max(m, tr.durationMs), 0)
      : 0;

  let prevVisibleCount = 0;
  let currVisibleCount = 0;

  for (const clip of project.clips) {
    if (clip.kind === "audio" || clip.hidden || !activeTrackIds.has(clip.trackId)) continue;
    const endMs = clip.startMs + clip.durationMs;
    const inPrev = prevTimeMs >= clip.startMs && prevTimeMs <= endMs;
    const inCurr = timeMs >= clip.startMs && timeMs <= endMs;
    if (inPrev !== inCurr) return false;
    if (inPrev) prevVisibleCount++;
    if (!inCurr) continue;
    currVisibleCount++;

    if (clip.kind === "video" || clip.kind === "visualizer") return false;
    if (clip.kind === "shape" && clip.shapeKind === "progress-bar") return false;
    if ("reactiveAudioClipId" in clip && clip.reactiveAudioClipId) return false;
    if (clip.kind === "image" && clip.kenBurns !== "none") return false;

    const localCurr = timeMs - clip.startMs;
    const localPrev = prevTimeMs - clip.startMs;
    const enterDur = Math.max(0, clip.animation.inDurationMs);
    if (clip.animation.inType !== "none" && (localCurr <= enterDur || localPrev <= enterDur)) {
      return false;
    }
    const exitStart = Math.max(0, clip.durationMs - Math.max(0, clip.animation.outDurationMs));
    if (clip.animation.outType !== "none" && (localCurr >= exitStart || localPrev >= exitStart)) {
      return false;
    }

    if (maxTransMs > 0) {
      if (
        localCurr <= maxTransMs ||
        localPrev <= maxTransMs ||
        clip.durationMs - localCurr <= maxTransMs ||
        clip.durationMs - localPrev <= maxTransMs
      ) {
        return false;
      }
    }
  }

  return prevVisibleCount === currVisibleCount;
}

export function renderCinemaFrame(
  ctx: CanvasRenderingContext2D,
  project: CinemaProject,
  timeMs: number,
  runtime: CinemaRenderRuntime,
): void {
  const { width, height } = project;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = runtime.isExport ? "medium" : "high";
  drawBackground(ctx, project.background, width, height);

  const projectDurationMs = computeProjectDurationMs(project);
  const projectProgress = projectDurationMs > 0 ? timeMs / projectDurationMs : 0;

  // Render from bottom track -> top track so upper tracks overlay lower tracks
  const orderedTracks = [...project.tracks]
    .filter((t) => t.kind !== "audio" && !t.hidden)
    .reverse();

  let activeDip: { color: string; alpha: number } | null = null;

  for (const track of orderedTracks) {
    const trackClips = project.clips
      .filter((c): c is CinemaVisualClip => c.trackId === track.id && c.kind !== "audio")
      .sort((a, b) => a.startMs - b.startMs);

    const visibleClips = trackClips.filter(
      (c) => !c.hidden && timeMs >= c.startMs && timeMs <= c.startMs + c.durationMs,
    );

    for (const clip of visibleClips) {
      const localMs = timeMs - clip.startMs;
      const motion = computeMotionState(clip.animation, localMs, clip.durationMs, width, height);
      const trans = computeClipTransitionEffect(
        clip,
        trackClips,
        project.transitions,
        timeMs,
        width,
      );

      if (trans.dipColor && (trans.dipAlpha ?? 0) > (activeDip?.alpha ?? 0)) {
        activeDip = { color: trans.dipColor, alpha: trans.dipAlpha ?? 0 };
      }

      const { cx, cy, w, h } = visualBoxPx(clip.transform, width, height);
      const opacity = clamp(clip.transform.opacity * motion.opacityMul * trans.opacityMul, 0, 1);
      if (opacity <= 0.005) continue;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = clip.transform.blendMode;

      if (trans.wipeX !== undefined) {
        ctx.beginPath();
        ctx.rect(0, 0, width * clamp(trans.wipeX, 0, 1), height);
        ctx.clip();
      }

      ctx.translate(cx + motion.dx + trans.dx, cy + motion.dy);
      if (clip.transform.rotation !== 0) {
        ctx.rotate((clip.transform.rotation * Math.PI) / 180);
      }
      const reactiveAudioClipId =
        "reactiveAudioClipId" in clip ? clip.reactiveAudioClipId : undefined;
      const totalScale =
        motion.scale *
        trans.scale *
        (reactiveAudioClipId
          ? (() => {
              const targetAud = project.clips.find(
                (c): c is CinemaAudioClip =>
                  c.id === reactiveAudioClipId && c.kind === "audio" && !c.muted,
              );
              if (!targetAud) return 1;
              return 1 + sampleClipEnvelopeAt(targetAud.peaks, targetAud, timeMs) * 0.065;
            })()
          : 1);
      ctx.scale(
        totalScale * (clip.transform.flipH ? -1 : 1),
        totalScale * (clip.transform.flipV ? -1 : 1),
      );

      if (clip.transform.shadow) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.48)";
        ctx.shadowBlur = Math.max(12, width * 0.018);
        ctx.shadowOffsetY = Math.max(6, height * 0.014);
      }

      if (clip.kind === "video" || clip.kind === "image") {
        drawVisualAssetClip(ctx, clip, w, h, localMs, motion.blurPx, runtime);
      } else if (clip.kind === "text") {
        if (motion.blurPx > 0.2) ctx.filter = `blur(${motion.blurPx.toFixed(1)}px)`;
        drawTextClip(ctx, clip, w, h, height, motion.charFraction);
      } else if (clip.kind === "shape") {
        drawShapeClip(ctx, clip, w, h, projectProgress, height);
      } else if (clip.kind === "visualizer") {
        let boundBins = runtime.frequencyBins;
        if (clip.reactiveAudioClipId) {
          const targetAud = project.clips.find(
            (c): c is CinemaAudioClip =>
              c.id === clip.reactiveAudioClipId && c.kind === "audio" && !c.muted,
          );
          if (targetAud && targetAud.peaks.length > 0) {
            const synth = new Float32Array(32);
            const energy = sampleClipEnvelopeAt(targetAud.peaks, targetAud, timeMs);
            for (let b = 0; b < 32; b++) {
              const harmonic = 0.62 + 0.38 * Math.sin(timeMs * 0.014 + b * 0.65);
              synth[b] = clamp(energy * harmonic * 1.15, 0.04, 1);
            }
            boundBins = synth;
          }
        }
        drawVisualizerClip(ctx, clip, w, h, boundBins, timeMs);
      }

      ctx.restore();
    }
  }

  if (activeDip && activeDip.alpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = clamp(activeDip.alpha, 0, 1);
    ctx.fillStyle = activeDip.color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (runtime.showSafeGuides && !runtime.isExport) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = Math.max(1, width / 1000);
    ctx.setLineDash([6, 6]);
    const mx = width * 0.05;
    const my = height * 0.05;
    ctx.strokeRect(mx, my, width - mx * 2, height - my * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);
    ctx.restore();
  }
}

function drawVisualAssetClip(
  ctx: CanvasRenderingContext2D,
  clip: CinemaVideoClip | CinemaImageClip,
  w: number,
  h: number,
  localMs: number,
  extraBlurPx: number,
  runtime: CinemaRenderRuntime,
): void {
  const el = runtime.mediaElements.get(clip.assetId);
  const radius = clip.transform.borderRadius > 0 ? (clip.transform.borderRadius / 1080) * h * 1.4 : 0;

  if (radius > 0) {
    roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
  }

  if (!el) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    return;
  }

  let kb = { scale: 1, panX: 0 };
  if (clip.kind === "image" && clip.kenBurns !== "none") {
    const p = clamp(localMs / Math.max(1, clip.durationMs), 0, 1);
    if (clip.kenBurns === "zoom-in") kb = { scale: 1 + p * 0.12, panX: 0 };
    else if (clip.kenBurns === "zoom-out") kb = { scale: 1.12 - p * 0.12, panX: 0 };
    else if (clip.kenBurns === "pan-left") kb = { scale: 1.08, panX: 0.45 - p * 0.9 };
    else if (clip.kenBurns === "pan-right") kb = { scale: 1.08, panX: -0.45 + p * 0.9 };
  }

      const filterStr = buildFilterString(clip.filter, extraBlurPx);
      if (filterStr !== "none") {
        ctx.filter = filterStr;
        drawMediaBox(ctx, el, w, h, clip.fit, kb);
        ctx.filter = "none";
      } else {
        drawMediaBox(ctx, el, w, h, clip.fit, kb);
      }

  if (clip.filter.vignette > 0.02) {
    const vig = ctx.createRadialGradient(0, 0, Math.min(w, h) * 0.25, 0, 0, Math.max(w, h) * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${(clip.filter.vignette * 0.78).toFixed(2)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
}

/** Hit-tests active visual clips from top-most track down to bottom-most track. */
export function hitTestVisualClip(
  project: CinemaProject,
  timeMs: number,
  canvasX: number,
  canvasY: number,
): CinemaVisualClip | null {
  for (const track of project.tracks) {
    if (track.kind === "audio" || track.hidden || track.locked) continue;
    const candidates = project.clips
      .filter(
        (c): c is CinemaVisualClip =>
          c.trackId === track.id &&
          c.kind !== "audio" &&
          !c.hidden &&
          !c.locked &&
          timeMs >= c.startMs &&
          timeMs <= c.startMs + c.durationMs,
      )
      .reverse();

    for (const clip of candidates) {
      const { cx, cy, w, h } = visualBoxPx(clip.transform, project.width, project.height);
      const rad = (-clip.transform.rotation * Math.PI) / 180;
      const dx = canvasX - cx;
      const dy = canvasY - cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) {
        return clip;
      }
    }
  }
  return null;
}

export function isTimelineClip(clip: CinemaClip): clip is CinemaClip {
  return Boolean(clip.id);
}
