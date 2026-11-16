/** Shared math for the procedural golden network renderers. */

export type Vec = { x: number; y: number };

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededHelpers(seed: number) {
  const rnd = mulberry32(seed);
  return {
    rnd,
    gauss: () => (rnd() + rnd() + rnd() - 1.5) / 1.5,
    between: (lo: number, hi: number) => lo + rnd() * (hi - lo),
  };
}

export const polar = (r: number, angle: number): Vec => ({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function bezier(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Point at `u` (0–1) along a chain of cubic bezier segments. */
export function pointOnPath(segments: Vec[][], u: number): Vec {
  const scaled = clamp(u, 0, 0.9999) * segments.length;
  const index = Math.floor(scaled);
  const [a, b, c, d] = segments[index]!;
  return bezier(a!, b!, c!, d!, scaled - index);
}

export function radialGlow(
  ctx: CanvasRenderingContext2D,
  at: Vec,
  radius: number,
  stops: Array<[number, string]>,
) {
  if (radius <= 0) return;
  const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
}

/** Fits a canvas to its CSS box at a balanced device pixel ratio for 60fps rendering. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

/**
 * Watches whether `element` is near/in the viewport and the document tab is visible.
 * Pauses offscreen & background animation loops cleanly.
 */
export function observeCanvasActivity(
  element: Element,
  onActiveChange: (active: boolean) => void,
): () => void {
  let inView = true;
  let visible = typeof document === "undefined" || document.visibilityState !== "hidden";
  let lastActive: boolean | null = null;

  const notify = () => {
    const next = inView && visible;
    if (next !== lastActive) {
      lastActive = next;
      onActiveChange(next);
    }
  };

  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        inView = entry.isIntersecting;
        notify();
      },
      { rootMargin: "120px" },
    );
    io.observe(element);
  }

  const onVis = () => {
    visible = document.visibilityState !== "hidden";
    notify();
  };
  document.addEventListener("visibilitychange", onVis);
  notify();

  return () => {
    io?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
  };
}
