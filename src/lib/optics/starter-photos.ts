import type { OpticsSourceAsset } from "./types";

export interface StarterPhotoSpec {
  id: NonNullable<OpticsSourceAsset["starterId"]>;
  title: string;
  subtitle: string;
  aspect: string;
  width: number;
  height: number;
  cameraHint: string;
}

export const STARTER_PHOTOS: readonly StarterPhotoSpec[] = [
  {
    id: "alpine-alpenglow",
    title: "Dolomites First Light",
    subtitle: "High-latitude mountain study · warm peaks & cobalt ridges",
    aspect: "3:2",
    width: 1500,
    height: 1000,
    cameraHint: "50mm f/2.8 · ISO 100 · Raw Plate",
  },
  {
    id: "atelier-portrait",
    title: "Studio Ivory Study",
    subtitle: "Warm chiaroscuro light falloff · skin tones & specular catchlights",
    aspect: "4:5",
    width: 1120,
    height: 1400,
    cameraHint: "85mm f/1.4 · ISO 160 · Studio Strobe",
  },
  {
    id: "obsidian-pavilion",
    title: "Nocturne Pavilion",
    subtitle: "Architectural colonnade at dusk · ideal for perspective & WB",
    aspect: "3:2",
    width: 1500,
    height: 1000,
    cameraHint: "24mm f/2.0 · ISO 400 · Blue Hour",
  },
];

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi);
  const b = hash2d(xi + 1, yi);
  const c = hash2d(xi, yi + 1);
  const d = hash2d(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    freq *= 2.04;
    amp *= 0.5;
  }
  return sum;
}

function addOrganicSensorGrain(ctx: CanvasRenderingContext2D, width: number, height: number, alpha = 0.03) {
  const tileSize = 128;
  const tile = document.createElement("canvas");
  tile.width = tileSize;
  tile.height = tileSize;
  const tctx = tile.getContext("2d");
  if (!tctx) return;
  const img = tctx.createImageData(tileSize, tileSize);
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const o = (y * tileSize + x) * 4;
      const g = Math.round(128 + (hash2d(x * 1.37, y * 1.91) - 0.5) * 90);
      img.data[o] = g;
      img.data[o + 1] = g;
      img.data[o + 2] = g;
      img.data[o + 3] = Math.round(alpha * 255);
    }
  }
  tctx.putImageData(img, 0, 0);
  const pat = ctx.createPattern(tile, "repeat");
  if (pat) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function renderAlpineAlpenglow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Crisp alpine twilight sky with golden horizon scatter
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, "#101b32");
  sky.addColorStop(0.42, "#243b5e");
  sky.addColorStop(0.75, "#87635c");
  sky.addColorStop(1, "#eeb87c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Warm sun off-axis radial glow
  const sunGlow = ctx.createRadialGradient(w * 0.24, h * 0.42, 10, w * 0.24, h * 0.42, w * 0.55);
  sunGlow.addColorStop(0, "rgba(255, 224, 174, 0.58)");
  sunGlow.addColorStop(0.35, "rgba(244, 166, 98, 0.24)");
  sunGlow.addColorStop(1, "rgba(244, 166, 98, 0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, w, h);

  // Soft wispy cirrus clouds
  for (let i = 0; i < 18; i++) {
    const cx = w * (0.1 + 0.85 * hash2d(i, 3));
    const cy = h * (0.08 + 0.34 * hash2d(i, 9));
    const rx = w * (0.12 + 0.14 * hash2d(i, 15));
    const ry = h * 0.018;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    cg.addColorStop(0, "rgba(255, 219, 180, 0.16)");
    cg.addColorStop(1, "rgba(255, 219, 180, 0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = cg;
    ctx.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
    ctx.restore();
  }

  // Draw 4 stratified mountain ranges from far to near
  const ranges = [
    { baseY: 0.48, amp: 0.24, freq: 3.2, seed: 11, lit: "#d99d80", shade: "#394865", mistAlpha: 0.38 },
    { baseY: 0.58, amp: 0.26, freq: 4.5, seed: 29, lit: "#e6ab76", shade: "#26334c", mistAlpha: 0.28 },
    { baseY: 0.72, amp: 0.22, freq: 5.8, seed: 47, lit: "#c78554", shade: "#182133", mistAlpha: 0.16 },
    { baseY: 0.86, amp: 0.15, freq: 8.2, seed: 71, lit: "#2a3542", shade: "#0d121a", mistAlpha: 0.05 },
  ];

  for (const r of ranges) {
    const ridgeY = new Float32Array(w);
    const slope = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * r.freq + r.seed;
      const ridge = 1 - Math.abs(fbm(nx, r.seed * 0.7, 5) * 2 - 1);
      const detail = fbm(nx * 2.7, r.seed + 5, 3) * 0.25;
      ridgeY[x] = h * r.baseY - (ridge * ridge * 0.85 + detail) * h * r.amp;
    }
    for (let x = 1; x < w - 1; x++) {
      slope[x] = ridgeY[x + 1]! - ridgeY[x - 1]!;
    }

    // Lit & shadow body fill
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += 2) ctx.lineTo(x, ridgeY[x]!);
    ctx.lineTo(w, h);
    ctx.closePath();

    const mGrad = ctx.createLinearGradient(0, h * (r.baseY - r.amp), 0, h);
    mGrad.addColorStop(0, r.shade);
    mGrad.addColorStop(1, "#0b0f17");
    ctx.fillStyle = mGrad;
    ctx.fill();

    // Sun-kissed east/left peak facets + snow catches
    for (let x = 0; x < w; x += 2) {
      if (slope[x]! < -0.1) {
        const facetStrength = Math.min(1, Math.abs(slope[x]!) * 0.42);
        ctx.fillStyle = r.lit;
        ctx.globalAlpha = facetStrength * 0.85;
        ctx.fillRect(x, ridgeY[x]!, 3, h * 0.14 * facetStrength);
      }
    }
    ctx.globalAlpha = 1;

    // Valley mist band before foreground
    if (r.mistAlpha > 0.08) {
      const mist = ctx.createLinearGradient(0, h * r.baseY - 40, 0, h * (r.baseY + 0.14));
      mist.addColorStop(0, "rgba(235, 206, 188, 0)");
      mist.addColorStop(0.5, `rgba(218, 205, 212, ${r.mistAlpha})`);
      mist.addColorStop(1, "rgba(218, 205, 212, 0)");
      ctx.fillStyle = mist;
      ctx.fillRect(0, h * r.baseY - 40, w, h * 0.22);
    }
  }

  // Calm glacial tarn reflection in foreground
  const lakeTop = h * 0.82;
  const lake = ctx.createLinearGradient(0, lakeTop, 0, h);
  lake.addColorStop(0, "#151d2d");
  lake.addColorStop(0.45, "#2b374e");
  lake.addColorStop(1, "#0a0e16");
  ctx.fillStyle = lake;
  ctx.fillRect(0, lakeTop, w, h - lakeTop);

  // Shimmering reflected alpenglow column on water
  const refl = ctx.createLinearGradient(w * 0.24, lakeTop, w * 0.24, h);
  refl.addColorStop(0, "rgba(244, 185, 118, 0.32)");
  refl.addColorStop(1, "rgba(244, 185, 118, 0)");
  ctx.fillStyle = refl;
  for (let y = lakeTop + 4; y < h; y += 5) {
    const rw = w * (0.09 + 0.08 * Math.sin(y * 0.21));
    ctx.fillRect(w * 0.24 - rw * 0.5, y, rw, 2);
  }
}

function renderAtelierPortrait(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Warm limestone studio sweep
  const bg = ctx.createRadialGradient(w * 0.42, h * 0.34, w * 0.08, w * 0.5, h * 0.5, w * 0.92);
  bg.addColorStop(0, "#d8cab8");
  bg.addColorStop(0.48, "#9b8c7d");
  bg.addColorStop(1, "#2a2420");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Soft studio backdrop paper drape lines
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const x = w * (0.12 + i * 0.16);
    const fold = ctx.createLinearGradient(x, 0, x + w * 0.14, 0);
    fold.addColorStop(0, "rgba(255,250,242,0.06)");
    fold.addColorStop(0.5, "rgba(25,18,14,0.08)");
    fold.addColorStop(1, "rgba(255,250,242,0.0)");
    ctx.fillStyle = fold;
    ctx.fillRect(x, 0, w * 0.14, h);
  }
  ctx.restore();

  // Soft floor / shadow vignette
  const cx = w * 0.5;
  const headY = h * 0.37;

  // Tailored obsidian wool shoulders / silhouette
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h);
  ctx.quadraticCurveTo(w * 0.22, h * 0.65, w * 0.4, h * 0.6);
  ctx.lineTo(w * 0.6, h * 0.6);
  ctx.quadraticCurveTo(w * 0.78, h * 0.65, w * 0.84, h);
  ctx.closePath();
  const coatGrad = ctx.createLinearGradient(w * 0.24, h * 0.6, w * 0.78, h);
  coatGrad.addColorStop(0, "#2f2a29");
  coatGrad.addColorStop(0.45, "#191718");
  coatGrad.addColorStop(1, "#0d0c0d");
  ctx.fillStyle = coatGrad;
  ctx.fill();

  // Silk ivory lapel highlight
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.6);
  ctx.lineTo(w * 0.5, h * 0.82);
  ctx.lineTo(w * 0.58, h * 0.6);
  ctx.closePath();
  ctx.fillStyle = "#efe7dc";
  ctx.fill();
  ctx.restore();

  // Neck with natural ambient occlusion under jaw
  const neckGrad = ctx.createLinearGradient(cx - w * 0.08, h * 0.48, cx + w * 0.09, h * 0.62);
  neckGrad.addColorStop(0, "#deb093");
  neckGrad.addColorStop(0.5, "#c58e70");
  neckGrad.addColorStop(1, "#8c5c46");
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.roundRect(cx - w * 0.075, h * 0.45, w * 0.15, h * 0.18, 28);
  ctx.fill();

  // Sculptural oval portrait face with Rembrandt key-light modeling
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, headY, w * 0.155, h * 0.16, 0, 0, Math.PI * 2);
  ctx.clip();

  const skin = ctx.createRadialGradient(
    cx - w * 0.055,
    headY - h * 0.04,
    w * 0.015,
    cx + w * 0.02,
    headY + h * 0.02,
    w * 0.22,
  );
  skin.addColorStop(0, "#f5d4bd");
  skin.addColorStop(0.45, "#dfb092");
  skin.addColorStop(0.82, "#b57d62");
  skin.addColorStop(1, "#784c3a");
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, w, h);

  // Subtle cheekbone & nose bridge highlights
  const blush = ctx.createRadialGradient(cx - w * 0.06, headY + h * 0.025, 2, cx - w * 0.06, headY + h * 0.025, w * 0.07);
  blush.addColorStop(0, "rgba(216, 128, 108, 0.22)");
  blush.addColorStop(1, "rgba(216, 128, 108, 0)");
  ctx.fillStyle = blush;
  ctx.fillRect(0, 0, w, h);

  // Crisp iris & catchlight pairs for Eye Clarity verification
  for (const dir of [-1, 1]) {
    const ex = cx + dir * w * 0.058;
    const ey = headY - h * 0.012;
    ctx.fillStyle = "#f4efe8";
    ctx.beginPath();
    ctx.ellipse(ex, ey, w * 0.028, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#5c432e";
    ctx.beginPath();
    ctx.arc(ex, ey, w * 0.0135, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#17110d";
    ctx.beginPath();
    ctx.arc(ex, ey, w * 0.0065, 0, Math.PI * 2);
    ctx.fill();

    // Specular window catchlight
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(ex - w * 0.004, ey - h * 0.003, w * 0.0034, 0, Math.PI * 2);
    ctx.fill();

    // Brow
    ctx.strokeStyle = "#36251d";
    ctx.lineWidth = w * 0.009;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex - w * 0.032, ey - h * 0.026);
    ctx.quadraticCurveTo(ex, ey - h * 0.036, ex + w * 0.032, ey - h * 0.025);
    ctx.stroke();
  }

  // Subtle lip shadow & tone
  ctx.fillStyle = "#a96459";
  ctx.beginPath();
  ctx.ellipse(cx, headY + h * 0.075, w * 0.042, h * 0.014, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Architectural chestnut hair crown framing top
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, headY - h * 0.045, w * 0.175, h * 0.155, 0, Math.PI * 0.96, Math.PI * 2.04);
  ctx.quadraticCurveTo(cx + w * 0.06, headY - h * 0.07, cx - w * 0.17, headY - h * 0.01);
  const hairGrad = ctx.createLinearGradient(cx - w * 0.16, headY - h * 0.2, cx + w * 0.16, headY);
  hairGrad.addColorStop(0, "#4a3225");
  hairGrad.addColorStop(0.5, "#2b1c15");
  hairGrad.addColorStop(1, "#160e0b");
  ctx.fillStyle = hairGrad;
  ctx.fill();
  ctx.restore();
}

function renderObsidianPavilion(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Blue-hour cobalt gradient sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  sky.addColorStop(0, "#0b1121");
  sky.addColorStop(0.55, "#1d2c4a");
  sky.addColorStop(1, "#4e6282");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Subtle dusk sunset bounce on right glass tower
  const horizonGlow = ctx.createRadialGradient(w * 0.72, h * 0.45, 20, w * 0.72, h * 0.45, w * 0.5);
  horizonGlow.addColorStop(0, "rgba(232, 162, 92, 0.28)");
  horizonGlow.addColorStop(1, "rgba(232, 162, 92, 0)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 0, w, h);

  // Wet stone plaza floor
  const floorY = h * 0.64;
  const floor = ctx.createLinearGradient(0, floorY, 0, h);
  floor.addColorStop(0, "#171b24");
  floor.addColorStop(1, "#0b0d12");
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, w, h - floorY);

  // Perspective grid lines converging toward off-center vanishing point
  const vpX = w * 0.56;
  const vpY = h * 0.54;
  ctx.strokeStyle = "rgba(180, 198, 224, 0.13)";
  ctx.lineWidth = 1.4;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(vpX + i * w * 0.04, vpY);
    ctx.lineTo(vpX + i * w * 0.18, h);
    ctx.stroke();
  }

  // Travertine colonnade pillars with subtle keystoning
  const columns = [0.08, 0.2, 0.31, 0.41, 0.72, 0.84];
  for (const px of columns) {
    const dist = Math.abs(px - 0.56);
    const colW = w * (0.03 + dist * 0.085);
    const topY = h * (0.14 + (1 - dist * 2) * 0.08);
    const botY = floorY + dist * h * 0.12;
    const x0 = w * px;
    const skew = (0.56 - px) * w * 0.06;

    // Warm interior tungsten spill on inner edge
    const light = ctx.createLinearGradient(x0, topY, x0 + colW, topY);
    light.addColorStop(0, "#1b2029");
    light.addColorStop(0.75, "#2f3542");
    light.addColorStop(1, "#d9a25e");
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x0 + skew, topY);
    ctx.lineTo(x0 + colW + skew * 0.85, topY);
    ctx.lineTo(x0 + colW, botY);
    ctx.lineTo(x0, botY);
    ctx.closePath();
    ctx.fill();

    // Reflection in wet plaza stone
    const refGrad = ctx.createLinearGradient(0, botY, 0, h);
    refGrad.addColorStop(0, "rgba(217, 162, 94, 0.26)");
    refGrad.addColorStop(0.45, "rgba(42, 52, 70, 0.18)");
    refGrad.addColorStop(1, "rgba(10, 12, 16, 0)");
    ctx.fillStyle = refGrad;
    ctx.fillRect(x0, botY, colW * 0.9, h - botY);
  }

  // Warm tungsten ceiling coffers + point bokeh orbs
  const lamps = [
    { x: w * 0.48, y: h * 0.42, r: 9 },
    { x: w * 0.52, y: h * 0.45, r: 7 },
    { x: w * 0.64, y: h * 0.38, r: 11 },
    { x: w * 0.78, y: h * 0.28, r: 14 },
  ];
  for (const lamp of lamps) {
    const halo = ctx.createRadialGradient(lamp.x, lamp.y, 1, lamp.x, lamp.y, lamp.r * 5);
    halo.addColorStop(0, "rgba(255, 224, 165, 0.95)");
    halo.addColorStop(0.25, "rgba(240, 181, 74, 0.36)");
    halo.addColorStop(1, "rgba(240, 181, 74, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, lamp.r * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const starterCache = new Map<string, Promise<Blob>>();

/**
 * Generates and caches a crisp procedural showcase photograph as a PNG Blob.
 * Runs 100% locally in-browser with zero external network dependencies.
 */
export async function generateStarterPhotoBlob(
  starterId: NonNullable<OpticsSourceAsset["starterId"]>,
): Promise<Blob> {
  const cached = starterCache.get(starterId);
  if (cached) return cached;

  const spec = STARTER_PHOTOS.find((s) => s.id === starterId) ?? STARTER_PHOTOS[0]!;
  const promise = (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");

    if (spec.id === "alpine-alpenglow") {
      renderAlpineAlpenglow(ctx, spec.width, spec.height);
    } else if (spec.id === "atelier-portrait") {
      renderAtelierPortrait(ctx, spec.width, spec.height);
    } else {
      renderObsidianPavilion(ctx, spec.width, spec.height);
    }
    addOrganicSensorGrain(ctx, spec.width, spec.height, 0.032);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Starter plate export failed"))),
        "image/png",
      );
    });
  })();

  starterCache.set(starterId, promise);
  return promise;
}
