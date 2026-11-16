/** Pre-baked high-DPI offscreen sprites and palette math for SetupCanvas. */

import { clamp, lerp } from "@/lib/network/geometry";

export type Rgb = readonly [number, number, number];
export type SetupThemeMode = "dark" | "light";

const TAU = Math.PI * 2;

export const GOLD_CORE: Rgb = [255, 250, 232];
export const GOLD_BRIGHT: Rgb = [255, 224, 156];
export const GOLD_MID: Rgb = [246, 182, 74];
export const GOLD_DEEP: Rgb = [212, 128, 34];
export const GOLD_DUST: Rgb = [176, 114, 36];

export const GOLD_LIGHT_SPECULAR: Rgb = [142, 78, 4];
export const GOLD_LIGHT_BRIGHT: Rgb = [184, 112, 10];
export const GOLD_LIGHT_MID: Rgb = [212, 144, 22];
export const GOLD_LIGHT_DEEP: Rgb = [232, 174, 52];
export const GOLD_LIGHT_DUST: Rgb = [196, 142, 62];

export const CRIMSON_ACCENT: Rgb = [252, 64, 56];
export const CRIMSON_LIGHT_ACCENT: Rgb = [204, 22, 28];

export type ThemePalette = {
  goldCore: Rgb;
  goldBright: Rgb;
  goldMid: Rgb;
  goldDeep: Rgb;
  goldDust: Rgb;
  haloInner: Rgb;
  haloMid: Rgb;
  haloOuter: Rgb;
  orbInner: Rgb;
  orbMid: Rgb;
  orbOuter: Rgb;
  crimson: Rgb;
  blendOp: GlobalCompositeOperation;
  alphaScale: number;
};

export function getThemePalette(theme: SetupThemeMode): ThemePalette {
  if (theme === "light") {
    return {
      goldCore: GOLD_LIGHT_SPECULAR,
      goldBright: GOLD_LIGHT_BRIGHT,
      goldMid: GOLD_LIGHT_MID,
      goldDeep: GOLD_LIGHT_DEEP,
      goldDust: GOLD_LIGHT_DUST,
      haloInner: [228, 168, 42],
      haloMid: [204, 134, 14],
      haloOuter: [174, 102, 6],
      orbInner: [156, 88, 6],
      orbMid: [198, 128, 16],
      orbOuter: [228, 168, 42],
      crimson: CRIMSON_LIGHT_ACCENT,
      blendOp: "source-over",
      alphaScale: 1.55,
    };
  }

  return {
    goldCore: GOLD_CORE,
    goldBright: GOLD_BRIGHT,
    goldMid: GOLD_MID,
    goldDeep: GOLD_DEEP,
    goldDust: GOLD_DUST,
    haloInner: [255, 226, 154],
    haloMid: [242, 172, 56],
    haloOuter: [188, 102, 20],
    orbInner: [255, 253, 242],
    orbMid: [255, 220, 128],
    orbOuter: [236, 158, 44],
    crimson: CRIMSON_ACCENT,
    blendOp: "lighter",
    alphaScale: 1.0,
  };
}

export function rgbStr(c: Rgb): string {
  return `${c[0]}, ${c[1]}, ${c[2]}`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const k = clamp(t, 0, 1);
  return `${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))}`;
}

export function mixRgbTuple(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp(t, 0, 1);
  return [
    Math.round(lerp(a[0], b[0], k)),
    Math.round(lerp(a[1], b[1], k)),
    Math.round(lerp(a[2], b[2], k)),
  ];
}

export type SetupSpriteAtlas = {
  theme: SetupThemeMode;
  /** Pinpoint star with subtle 4-point optical diffraction cross (canonical core radius ratio = 14 / 192). */
  goldStarSprite: HTMLCanvasElement;
  /** Anchor star with prominent razor-sharp 4-point optical diffraction spikes (canonical core radius ratio = 14 / 256). */
  goldAnchorFlareSprite: HTMLCanvasElement;
  /** Compact crisp pinpoint spark / photon dot (canonical core radius ratio = 6 / 64). */
  sparkDotSprite: HTMLCanvasElement;
  /** C^infinity smooth radial Moffat mist cloud for atmospheric wash & supernova bloom. */
  dustMistSprite: HTMLCanvasElement;
  /** High-DPI 24-stop Moffat PSF singularity heart orb (radius ratio = 246 / 512). */
  coreMoffatSprite: HTMLCanvasElement;
  /** High-DPI 24-stop Moffat outer optical corona (radius ratio = 246 / 512). */
  coreHaloSprite: HTMLCanvasElement;
  /** Wide razor-sharp horizontal anamorphic optical streak (768x96, active half-span = 372, active half-thick = 42). */
  anamorphicStreakSprite: HTMLCanvasElement;
};

function makeOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) {
    throw new Error("Could not initialize 2D offscreen sprite context");
  }
  return [c, ctx];
}

/**
 * Fills a radial Moffat Point-Spread Function: I(r) = (1 + (r / r0)^2)^(-beta)
 * with a C^infinity smooth edge window so sprites never exhibit Mach banding or box clipping.
 */
function paintMoffatCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  coreRatio: number,
  beta: number,
  peakAlpha: number,
  inner: Rgb,
  mid: Rgb,
  outer: Rgb,
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  const stops = 24;
  for (let i = 0; i <= stops; i++) {
    const u = i / stops;
    const rn = u / coreRatio;
    const moffat = Math.pow(1 + rn * rn, -beta);
    const windowFade = 1 - u * u * (3 - 2 * u);
    const a = clamp(peakAlpha * moffat * windowFade, 0, 1);
    const rgb = u < 0.35 ? mixRgb(inner, mid, u / 0.35) : mixRgb(mid, outer, (u - 0.35) / 0.65);
    g.addColorStop(u, `rgba(${rgb}, ${a})`);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fill();
}

function paintOpticalSpike(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  angle: number,
  halfWidth: number,
  alpha: number,
  coreRgb: Rgb,
  brightRgb: Rgb,
  midRgb: Rgb,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const cStr = rgbStr(coreRgb);
  const bStr = rgbStr(brightRgb);
  const mStr = rgbStr(midRgb);

  // Tapered optical diffraction diamond blade
  const g = ctx.createLinearGradient(-len, 0, len, 0);
  g.addColorStop(0, `rgba(${mStr}, 0)`);
  g.addColorStop(0.24, `rgba(${mStr}, ${alpha * 0.24})`);
  g.addColorStop(0.42, `rgba(${bStr}, ${alpha * 0.72})`);
  g.addColorStop(0.5, `rgba(${cStr}, ${alpha})`);
  g.addColorStop(0.58, `rgba(${bStr}, ${alpha * 0.72})`);
  g.addColorStop(0.76, `rgba(${mStr}, ${alpha * 0.24})`);
  g.addColorStop(1, `rgba(${mStr}, 0)`);

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(-len * 0.16, -halfWidth * 0.32, 0, -halfWidth);
  ctx.quadraticCurveTo(len * 0.16, -halfWidth * 0.32, len, 0);
  ctx.quadraticCurveTo(len * 0.16, halfWidth * 0.32, 0, halfWidth);
  ctx.quadraticCurveTo(-len * 0.16, halfWidth * 0.32, -len, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function bakeGoldStarSprite(p: ThemePalette, isLight: boolean): HTMLCanvasElement {
  const size = 192;
  const half = size * 0.5;
  const [canvas, ctx] = makeOffscreen(size, size);

  // Soft Moffat halo
  paintMoffatCircle(
    ctx,
    half,
    half,
    84,
    0.2,
    1.95,
    isLight ? 0.44 : 0.48,
    p.goldBright,
    p.goldMid,
    p.goldDeep,
  );

  // Subtle crisp 4-point cross spikes
  paintOpticalSpike(ctx, half, half, 74, 0, 2.2, 0.72, p.goldCore, p.goldBright, p.goldMid);
  paintOpticalSpike(ctx, half, half, 66, Math.PI * 0.5, 2.0, 0.64, p.goldCore, p.goldBright, p.goldMid);

  // Radiant pinpoint star core
  paintMoffatCircle(ctx, half, half, 17, 0.44, 1.65, 1.0, p.goldCore, p.goldBright, p.goldMid);
  return canvas;
}

function bakeGoldAnchorFlareSprite(p: ThemePalette, isLight: boolean): HTMLCanvasElement {
  const size = 256;
  const half = size * 0.5;
  const [canvas, ctx] = makeOffscreen(size, size);

  // Wide warm Moffat bloom
  paintMoffatCircle(
    ctx,
    half,
    half,
    118,
    0.18,
    1.85,
    isLight ? 0.52 : 0.62,
    p.goldBright,
    p.goldMid,
    p.goldDeep,
  );

  // Soft wide flare aura + sharp axial optical blades (anamorphic slightly wider horizontally)
  paintOpticalSpike(ctx, half, half, 118, 0, 4.2, 0.42, p.goldBright, p.goldMid, p.goldDeep);
  paintOpticalSpike(ctx, half, half, 102, Math.PI * 0.5, 3.6, 0.36, p.goldBright, p.goldMid, p.goldDeep);
  paintOpticalSpike(ctx, half, half, 118, 0, 1.75, 0.96, p.goldCore, p.goldBright, p.goldMid);
  paintOpticalSpike(ctx, half, half, 102, Math.PI * 0.5, 1.55, 0.88, p.goldCore, p.goldBright, p.goldMid);

  // Faint diagonal micro-glints for astronomical diamond brilliance
  paintOpticalSpike(ctx, half, half, 36, Math.PI * 0.25, 1.1, 0.28, p.goldCore, p.goldBright, p.goldMid);
  paintOpticalSpike(ctx, half, half, 36, -Math.PI * 0.25, 1.1, 0.28, p.goldCore, p.goldBright, p.goldMid);

  // Incandescent pinpoint heart
  paintMoffatCircle(ctx, half, half, 19, 0.42, 1.6, 1.0, p.goldCore, p.goldBright, p.goldMid);
  return canvas;
}

function bakeSparkDotSprite(p: ThemePalette, isLight: boolean): HTMLCanvasElement {
  const size = 64;
  const half = size * 0.5;
  const [canvas, ctx] = makeOffscreen(size, size);

  paintMoffatCircle(
    ctx,
    half,
    half,
    29,
    0.26,
    2.2,
    isLight ? 0.92 : 1.0,
    p.goldCore,
    p.goldBright,
    p.goldMid,
  );
  return canvas;
}

function bakeDustMistSprite(p: ThemePalette, isLight: boolean): HTMLCanvasElement {
  const size = 256;
  const half = size * 0.5;
  const [canvas, ctx] = makeOffscreen(size, size);

  const inner: Rgb = isLight ? [255, 244, 210] : p.goldBright;
  const mid: Rgb = isLight ? [236, 184, 72] : p.goldMid;
  const outer: Rgb = isLight ? [220, 162, 54] : p.goldDeep;

  paintMoffatCircle(ctx, half, half, 122, 0.28, 1.75, isLight ? 0.34 : 0.42, inner, mid, outer);
  return canvas;
}

function bakeCoreMoffatSprite(p: ThemePalette): HTMLCanvasElement {
  const size = 512;
  const half = size * 0.5;
  const [canvas, ctx] = makeOffscreen(size, size);

  paintMoffatCircle(ctx, half, half, 246, 0.26, 2.35, 1.0, p.orbInner, p.orbMid, p.orbOuter);
  return canvas;
}

function bakeCoreHaloSprite(p: ThemePalette): HTMLCanvasElement {
  const size = 512;
  const half = size * 0.5;
  const [canvas, ctx] = makeOffscreen(size, size);

  paintMoffatCircle(ctx, half, half, 246, 0.22, 1.85, 0.65, p.haloInner, p.haloMid, p.haloOuter);
  return canvas;
}

function bakeAnamorphicStreakSprite(p: ThemePalette, isLight: boolean): HTMLCanvasElement {
  const w = 768;
  const h = 96;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const [canvas, ctx] = makeOffscreen(w, h);

  const cStr = rgbStr(p.goldCore);
  const bStr = rgbStr(p.goldBright);
  const mStr = rgbStr(p.goldMid);

  // Outer warm golden optical sheath
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(372, 42);
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  bg.addColorStop(0, `rgba(${bStr}, ${isLight ? 0.44 : 0.56})`);
  bg.addColorStop(0.24, `rgba(${mStr}, ${isLight ? 0.22 : 0.26})`);
  bg.addColorStop(0.62, `rgba(${mStr}, ${isLight ? 0.06 : 0.075})`);
  bg.addColorStop(1, `rgba(${mStr}, 0)`);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Razor-sharp inner white-gold axial filament
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(344, 10.5);
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  cg.addColorStop(0, `rgba(${cStr}, 1)`);
  cg.addColorStop(0.2, `rgba(${bStr}, 0.78)`);
  cg.addColorStop(0.56, `rgba(${mStr}, 0.18)`);
  cg.addColorStop(1, `rgba(${mStr}, 0)`);
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  return canvas;
}

export function buildSpriteAtlas(theme: SetupThemeMode): SetupSpriteAtlas {
  const isLight = theme === "light";
  const palette = getThemePalette(theme);
  return {
    theme,
    goldStarSprite: bakeGoldStarSprite(palette, isLight),
    goldAnchorFlareSprite: bakeGoldAnchorFlareSprite(palette, isLight),
    sparkDotSprite: bakeSparkDotSprite(palette, isLight),
    dustMistSprite: bakeDustMistSprite(palette, isLight),
    coreMoffatSprite: bakeCoreMoffatSprite(palette),
    coreHaloSprite: bakeCoreHaloSprite(palette),
    anamorphicStreakSprite: bakeAnamorphicStreakSprite(palette, isLight),
  };
}

/** Stamps a square pre-baked sprite centered at (x, y) with zero per-frame allocations. */
export function stampSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  displaySize: number,
  alpha: number,
) {
  if (alpha <= 0.005 || displaySize <= 0.2) return;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const half = displaySize * 0.5;
  ctx.drawImage(sprite, x - half, y - half, displaySize, displaySize);
}

/** Stamps the pre-baked horizontal anamorphic optical streak (and optional 90-deg vertical spike). */
export function stampAnamorphicFlare(
  ctx: CanvasRenderingContext2D,
  atlas: SetupSpriteAtlas,
  x: number,
  y: number,
  halfLen: number,
  thickness: number,
  alpha: number,
  verticalStrength = 0,
) {
  if (alpha <= 0.008 || halfLen < 4) return;
  const clampedAlpha = clamp(alpha, 0, 1);
  const drawHalfW = halfLen * (384 / 372);
  const drawHalfH = Math.max(4.0, thickness * 4.6);

  ctx.globalAlpha = clampedAlpha;
  ctx.drawImage(
    atlas.anamorphicStreakSprite,
    x - drawHalfW,
    y - drawHalfH,
    drawHalfW * 2,
    drawHalfH * 2,
  );

  if (verticalStrength > 0.015) {
    const vHalfW = halfLen * 0.44 * verticalStrength * (384 / 372);
    const vHalfH = Math.max(3.6, thickness * 3.8);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI * 0.5);
    ctx.globalAlpha = clamp(clampedAlpha * 0.85 * verticalStrength, 0, 1);
    ctx.drawImage(
      atlas.anamorphicStreakSprite,
      -vHalfW,
      -vHalfH,
      vHalfW * 2,
      vHalfH * 2,
    );
    ctx.restore();
  }
}
