"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import "./Lightfall.css";

const MAX_COLORS = 8;
const BLOOM_LEVELS = 4;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const STREAKS = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uView;
uniform float uZoom;
uniform float uPhase;
uniform float uTwinkleClock;
uniform float uRings;
uniform vec3 uColors[8];
uniform int uColorCount;
uniform int uStreakCount;
uniform int uColumns;
uniform float uWidth;
uniform float uTail;
uniform float uTwinkle;
uniform float uHead;
uniform float uDepth;
uniform vec4 uMouse;
uniform vec3 uLens;
uniform float uLightMode;
uniform float uEncode;
out vec4 outColor;

const vec3 CAMERA = vec3(0.0, -0.8888889, -0.2222222);
const float TAU = 6.28318530718;
const float SPACING = 0.005;
const float REACH = 0.32;

uint scramble(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

float unit(uint x) {
  return float(x & 0xffffu) / 65535.0;
}

float stroke(float d, float w) {
  float s = max(0.75 * w, 0.55);
  return 0.75 * w / s * exp(-0.5 * d * d / (s * s));
}

float orb(float d, float r) {
  float s = max(0.6 * r, 0.7);
  float e = 0.6 * r / s;
  return e * e * exp(-0.5 * d * d / (s * s));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  // Use landscape-safe basis so portrait mobile viewports preserve full tunnel perspective & crisp streak density
  float basis = max(uView.x, uView.y * 1.55);
  vec2 screen = (2.0 * frag - uView) / basis;
  vec2 p = screen;
  mat2 warp = mat2(1.0);
  if (uLens.z > 0.0) {
    vec2 o = p - uLens.xy;
    float e = uLens.z * exp(-dot(o, o) / (REACH * REACH));
    p -= o * e;
    warp = mat2(1.0 - e) + outerProduct(o, o) * (2.0 * e / (REACH * REACH));
  }

  vec3 dir = vec3(p, uZoom);
  vec3 exits = (1.0 - CAMERA * sign(dir)) / max(abs(dir), vec3(1e-6));
  float u = min(exits.x, min(exits.y, exits.z));
  for (int i = 0; i < 5; i++) {
    vec3 h = CAMERA + u * dir;
    vec3 h2 = h * h;
    float denom = 4.0 * dot(dir, h2 * h);
    denom = abs(denom) > 1e-6 ? denom : (denom >= 0.0 ? 1e-6 : -1e-6);
    u -= (dot(h2, h2) - 1.0) / denom;
  }
  vec3 hit = CAMERA + u * dir;
  vec3 normal = hit * hit * hit;
  float safeFacing = max(dot(normal, dir), 1e-6);
  vec3 stepX = u * (vec3(1.0, 0.0, 0.0) - dir * (normal.x / safeFacing));
  vec3 stepY = u * (vec3(0.0, 1.0, 0.0) - dir * (normal.y / safeFacing));
  float ring = max(hit.y * hit.y + hit.z * hit.z, 1e-6);
  float theta = atan(hit.z, hit.y);
  mat2 jacobian = mat2(
    stepX.x,
    (hit.y * stepX.z - hit.z * stepX.y) / ring,
    stepY.x,
    (hit.y * stepY.z - hit.z * stepY.y) / ring
  ) * warp * (2.0 / basis);

  vec2 gradX = vec2(jacobian[0][0], jacobian[1][0]);
  vec2 gradTheta = vec2(jacobian[0][1], jacobian[1][1]);
  float scale = max(length(gradX), 1e-8);
  float det = max(abs(gradX.x * gradTheta.y - gradX.y * gradTheta.x), 1e-12);
  float along = scale / det;
  float skew = dot(gradX, gradTheta) / det;
  float spacing = SPACING / scale;
  float detail = smoothstep(1.6, 3.2, spacing);
  if (detail <= 0.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float halfWidth = min(uWidth / scale, 0.2 * spacing);
  float headRadius = min(2.0 * uWidth / scale, 0.35 * spacing);
  float headReach = 4.0 * max(0.6 * headRadius, 0.7);
  float edge = uColumns > 1 ? 1.0 : 0.5;
  float period = TAU / uRings;
  float fog = exp(-max(u * length(dir) - 0.6, 0.0) * 1.6 * uDepth);

  float boost = 1.0;
  if (uMouse.z > 0.0) {
    vec2 m = screen - uMouse.xy;
    boost += 2.0 * uMouse.z * exp(-dot(m, m) / max(uMouse.w * uMouse.w, 1e-4));
  }

  int count = max(uColorCount, 1);
  vec3 total = vec3(0.0);
  for (int layer = 0; layer < 16; layer++) {
    if (layer >= uStreakCount) break;
    float x = hit.x + float(layer) * SPACING / 8.0;
    float nearest = floor(x / SPACING + 0.5);
    float side = x >= nearest * SPACING ? 1.0 : -1.0;
    for (int k = 0; k < 2; k++) {
      if (k >= uColumns) break;
      float column = nearest + side * float(k);
      float across = (x - column * SPACING) / scale;
      uint seed = scramble(uint(int(column) + 65536) + uint(layer) * 0x9e3779b9u);
      uint next = scramble(seed);
      float hue = unit(seed >> 16);
      float delta = theta - uPhase * (1.0 + floor(unit(seed) * 16.0) / 16.0) - unit(next) * period;
      delta -= period * floor(delta / period + 0.5);
      float ahead = delta * along - across * skew;
      if (abs(ahead) > headReach && (delta > 0.0 || -delta * uTail > 3.2)) continue;
      float behind = max(-delta, 0.0);
      float fall = exp(-uTail * behind) * (1.0 - smoothstep(0.5, 0.95, behind / (0.5 * period)));
      fall *= 1.0 - smoothstep(1.2, 3.2, uTail * behind);
      float reach = length(vec2(across, ahead));
      float trail = stroke(ahead > 0.0 ? reach : abs(across), halfWidth * mix(0.4, 1.0, fall)) * fall;
      float glint = orb(reach, headRadius) * mix(3.0, 1.8, uLightMode);
      float weight = mix(1.5, 1.0 + sin(uTwinkleClock + 7.0 * hue + 4.0), uTwinkle);
      weight *= 1.0 - smoothstep(0.72 * edge, edge, abs(across) / spacing);
      vec3 color = uColors[min(int(hue * float(count)), count - 1)];
      vec3 hot = mix(color, vec3(1.0), uHead * (1.0 - uLightMode));
      total += (trail * color + glint * hot) * weight;
    }
  }

  outColor = vec4(clamp(total * fog * boost * detail * uEncode, 0.0, 64.0), 1.0);
}`;

const DOWNSAMPLE = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTarget;
uniform vec2 uTexel;
uniform float uLimit;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec3 color = texture(uSource, uv - uTexel).rgb;
  color += texture(uSource, uv + uTexel).rgb;
  color += texture(uSource, uv + vec2(uTexel.x, -uTexel.y)).rgb;
  color += texture(uSource, uv + vec2(-uTexel.x, uTexel.y)).rgb;
  outColor = vec4(min(color * 0.25, vec3(uLimit)), 1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTarget;
uniform vec2 uStep;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec3 color = texture(uSource, uv).rgb * 0.181862;
  color += (texture(uSource, uv + uStep * 1.423135).rgb + texture(uSource, uv - uStep * 1.423135).rgb) * 0.284316;
  color += (texture(uSource, uv + uStep * 3.326702).rgb + texture(uSource, uv - uStep * 3.326702).rgb) * 0.106598;
  color += (texture(uSource, uv + uStep * 5.242989).rgb + texture(uSource, uv - uStep * 5.242989).rgb) * 0.018156;
  outColor = vec4(color, 1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uScene;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;
uniform vec2 uView;
uniform float uDecode;
uniform float uGlow;
uniform float uBloom;
uniform float uPresence;
uniform float uOpacity;
uniform float uFade;
uniform float uLightMode;
uniform float uBackdropTransition;
uniform vec3 uTopColor;
uniform float uTopGlow;
out vec4 outColor;

float smootherstep01(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float safePow(float x, float y) {
  return x > 1e-6 ? pow(x, y) : 0.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  vec3 light = texelFetch(uScene, ivec2(gl_FragCoord.xy), 0).rgb;
  if (uBloom > 0.0) {
    vec3 halo = texture(uBloom0, uv).rgb * 0.42;
    halo += texture(uBloom1, uv).rgb * 0.3;
    halo += texture(uBloom2, uv).rgb * 0.18;
    halo += texture(uBloom3, uv).rgb * 0.1;
    light += halo * uBloom * (uLightMode > 0.5 ? 0.2 : 1.0);
  }
  light *= uDecode * uGlow * uPresence;
  if (uDecode > 1.5) {
    light = max(light - 0.018, 0.0);
  }

  if (uBackdropTransition < 0.5 && uLightMode < 0.5 && uTopGlow > 0.0) {
    float aspect = uView.x / uView.y;
    vec2 q = vec2((uv.x - 0.5) * aspect, 1.04 - uv.y);
    float spread = 0.34 * max(aspect, 0.75);
    float core = exp(-q.x * q.x / (spread * spread) - q.y * q.y / 0.06);
    float halo = exp(-q.x * q.x / (3.6 * spread * spread) - q.y * q.y / 0.18);
    light += uTopColor * uTopGlow * (core * 0.85 + halo * 0.3) * uPresence;
  }

  vec3 lit = max(light, 0.0);
  vec3 mapped = sqrt(max(vec3(0.0), 1.0 - exp(-1.3 * lit * lit / (lit + 0.025))));
  float peak = max(mapped.r, max(mapped.g, mapped.b));

  if (uBackdropTransition > 0.5) {
    // Single-pass C2-continuous Oklab soft cream (#faf8f2) -> deep charcoal (#111216) transition:
    // L'(0) = L''(0) = 0 and L'(1) = L''(1) = 0 (mathematically zero Mach bands at either seam),
    // with triangular-PDF dithering and depth-linked star opacity (translucent near cream,
    // blooming to full luminous brilliance as comets fall into charcoal darkness).
    float t = clamp(1.0 - uv.y, 0.0, 1.0);
    float s = smootherstep01(t);
    float u = safePow(1.0 - s, 1.85);

    // Exact Oklab endpoints: #faf8f2 (top) -> #111216 (bottom)
    float warmth = 4.0 * u * (1.0 - u);
    float L = mix(0.182920, 0.979009, u);
    float a = mix(0.000643, -0.000212, u) + 0.0012 * warmth;
    float b = mix(-0.008295, 0.008210, u) + 0.0055 * warmth;
    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    float l3 = l_ * l_ * l_;
    float m3 = m_ * m_ * m_;
    float s3 = s_ * s_ * s_;
    vec3 linBg = max(vec3(
      +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
      -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
      -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
    ), 0.0);
    vec3 srgbBg = mix(
      12.92 * linBg,
      1.055 * pow(max(linBg, vec3(1e-6)), vec3(1.0 / 2.4)) - 0.055,
      step(vec3(0.0031308), linBg)
    );
    // Pin exact CSS endpoints at the outer edges so GPU float rounding matches #faf8f2 and #111216 bit-for-bit
    vec3 exactTop = vec3(250.0, 248.0, 242.0) / 255.0;
    vec3 exactBot = vec3(17.0, 18.0, 22.0) / 255.0;
    srgbBg = mix(exactTop, srgbBg, smootherstep01(t / 0.03));
    srgbBg = mix(srgbBg, exactBot, smootherstep01((t - 0.96) / 0.04));

    // Stars start whisper-translucent near the cream top and become progressively more visible
    // as they fall into the deepening charcoal-slate lower zone
    float darkness = clamp(1.0 - u, 0.0, 1.0);
    float revealBase = smootherstep01(clamp(darkness / 0.86, 0.0, 1.0));
    float topMask = smootherstep01(clamp((t - 0.03) / 0.12, 0.0, 1.0));
    float starReveal = safePow(revealBase, 1.35) * topMask;
    float bottomDissolve = 1.0 - smootherstep01(clamp((t - 0.80) / 0.20, 0.0, 1.0));
    float streakEnv = starReveal * bottomDissolve * uOpacity;

    // Subtle translucent gold tint in the upper twilight so stars materialize gently out of cream
    float twilightInk = smoothstep(0.06, 0.62, peak) * streakEnv * u * 0.34;
    vec3 dayGold = vec3(0.86, 0.62, 0.08);
    vec3 composed = mix(srgbBg, dayGold, clamp(twilightInk, 0.0, 0.45));

    // Luminous 24k gold comets blooming to full intensity as the sky deepens into charcoal
    float nightVisibility = smoothstep(0.06, 0.72, darkness);
    vec3 nightGlow = mapped * streakEnv * (0.20 + 0.80 * nightVisibility);
    composed = 1.0 - (1.0 - composed) * (1.0 - clamp(nightGlow, 0.0, 1.0));
    composed = mix(exactTop, composed, smootherstep01(t / 0.025));
    composed = mix(composed, exactBot, smootherstep01((t - 0.975) / 0.025));

    // Triangular-PDF sub-pixel dithering kills 8-bit gradient banding completely
    float r1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float r2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(17.0, 31.0), vec2(0.06711056, 0.00583715))));
    float triDither = (r1 + r2 - 1.0) / 255.0;
    float endPin = smoothstep(0.0, 0.015, t) * smoothstep(0.0, 0.015, 1.0 - t);

    outColor = vec4(clamp(composed + triDither * endPin, 0.0, 1.0), 1.0);
    return;
  }

  float mask = uOpacity;
  float edge = uFade * 0.5;
  if (edge > 0.0) {
    mask *= smootherstep01(uv.x / edge) * smootherstep01((1.0 - uv.x) / edge);
    mask *= smootherstep01(uv.y / edge) * smootherstep01((1.0 - uv.y) / edge);
  }
  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;

  if (uLightMode > 0.5) {
    float coverage = clamp(smoothstep(0.0, 0.5, peak) * mask * 0.94 + grain, 0.0, 1.0);
    vec3 chroma = sqrt(clamp(lit / max(max(lit.r, max(lit.g, lit.b)), 1e-6), 0.0, 1.0));
    chroma = pow(max(chroma, vec3(1e-6)), vec3(1.35));
    chroma /= max(max(chroma.r, max(chroma.g, chroma.b)), 1e-4);
    float saturation = 1.0 - min(chroma.r, min(chroma.g, chroma.b));
    chroma = mix(vec3(0.3), chroma, smoothstep(0.08, 0.35, saturation));
    outColor = vec4(chroma * coverage, coverage);
  } else {
    vec3 color = clamp(mapped + grain, 0.0, 1.0) * mask;
    outColor = vec4(color, max(color.r, max(color.g, color.b)));
  }
}`;

const INTRO_SECONDS = 2.6;
const WARP_SPEED = 9;
const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type LinkedProgram = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

type RenderTarget = {
  texture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = (gl: WebGL2RenderingContext, fragmentSource: string): LinkedProgram | null => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};

export interface LightfallProps {
  colors?: string[];
  backgroundColor?: string;
  speed?: number;
  streakCount?: number;
  streakWidth?: number;
  streakLength?: number;
  glow?: number;
  density?: number;
  twinkle?: number;
  zoom?: number;
  backgroundGlow?: number;
  headGlow?: number;
  depth?: number;
  bloom?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  mouseRadius?: number;
  mouseDampening?: number;
  lens?: number;
  holdToWarp?: boolean;
  intro?: boolean;
  fade?: number;
  lightMode?: boolean;
  /** Renders a single-pass C2-continuous Oklab #ffffff -> #000000 backdrop with triangular-PDF dithering inside the WebGL2 composite shader. */
  backdropTransition?: boolean;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

type NormalizedSettings = {
  colors: string[];
  backgroundColor: string;
  speed: number;
  streakCount: number;
  streakWidth: number;
  streakLength: number;
  glow: number;
  density: number;
  twinkle: number;
  zoom: number;
  backgroundGlow: number;
  headGlow: number;
  depth: number;
  bloom: number;
  opacity: number;
  mouseInteraction: boolean;
  mouseStrength: number;
  mouseRadius: number;
  mouseDampening: number;
  lens: number;
  holdToWarp: boolean;
  intro: boolean;
  fade: number;
  lightMode: boolean;
  backdropTransition: boolean;
  paused: boolean;
  dpr?: number;
};

function normalizeSettings(props: LightfallProps): NormalizedSettings {
  const {
    colors = ["#ffffff"],
    backgroundColor = "#94a3b8",
    speed = 0.3,
    streakCount = 2,
    streakWidth = 0.8,
    streakLength = 1,
    glow = 1,
    density = 0.6,
    twinkle = 0.3,
    zoom = 3,
    backgroundGlow = 0.1,
    headGlow = 0.6,
    depth = 0.5,
    bloom = 0.35,
    opacity = 1,
    mouseInteraction = true,
    mouseStrength = 0.4,
    mouseRadius = 0.45,
    mouseDampening = 0.15,
    lens = 0.5,
    holdToWarp = true,
    intro = true,
    fade = 0,
    lightMode = false,
    backdropTransition = false,
    paused = false,
    dpr,
  } = props;

  return {
    colors: (Array.isArray(colors) && colors.length ? colors : ["#ffffff"]).slice(0, MAX_COLORS).map(String),
    backgroundColor: String(backgroundColor),
    speed,
    streakCount: Math.round(clamp(streakCount, 1, 16)),
    streakWidth: Math.max(0.05, streakWidth),
    streakLength: Math.max(0.05, streakLength),
    glow: Math.max(0, glow),
    density,
    twinkle: clamp(twinkle, 0, 1),
    zoom: Math.max(0.1, zoom),
    backgroundGlow: Math.max(0, backgroundGlow),
    headGlow: clamp(headGlow, 0, 1),
    depth: Math.max(0, depth),
    bloom: Math.max(0, bloom),
    opacity: clamp(opacity, 0, 1),
    mouseInteraction,
    mouseStrength: Math.max(0, mouseStrength),
    mouseRadius: Math.max(0.01, mouseRadius),
    mouseDampening: Math.max(0, mouseDampening),
    lens: clamp(lens, 0, 1),
    holdToWarp,
    intro,
    fade: clamp(fade, 0, 1),
    lightMode,
    backdropTransition,
    paused,
    dpr,
  };
}

export default function Lightfall(props: LightfallProps) {
  const { mixBlendMode, className = "", style } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const normalized = normalizeSettings(props);
  const settingsRef = useRef<NormalizedSettings>(normalized);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    settingsRef.current = normalized;
    wakeRef.current?.();
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const isNearViewport = () => {
      const rect = container.getBoundingClientRect();
      const vh = window.innerHeight || 900;
      return rect.bottom >= -360 && rect.top <= vh + 360;
    };

    /** Lightweight Canvas2D fallback when WebGL2 or shaders are unavailable on restricted mobile GPUs. */
    const startCanvas2DFallback = () => {
      const fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.className = "lightfall-canvas";
      fallbackCanvas.setAttribute("aria-hidden", "true");
      canvas.style.display = "none";
      container.appendChild(fallbackCanvas);
      const ctx = fallbackCanvas.getContext("2d");
      if (!ctx) {
        fallbackCanvas.remove();
        canvas.style.display = "";
        return undefined;
      }

      const STREAK_COUNT = 54;
      const streaks = Array.from({ length: STREAK_COUNT }, (_, i) => {
        const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        const s2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
        const s3 = Math.sin(i * 419.2 + 73.1) * 43758.5453;
        const r1 = s1 - Math.floor(s1);
        const r2 = s2 - Math.floor(s2);
        const r3 = s3 - Math.floor(s3);
        return {
          lane: (r1 - 0.5) * 1.92,
          phase: r2,
          speed: 0.22 + r3 * 0.28,
          len: 0.14 + (1 - r3) * 0.18,
          width: 0.85 + r3 * 0.85,
        };
      });

      let width = 1;
      let height = 1;
      let raf2d = 0;
      let last2d = 0;
      let clock = 0;
      let visible2d = isNearViewport();

      const draw2d = () => {
        const s = settingsRef.current;
        ctx.clearRect(0, 0, width, height);
        const cx = width * 0.5;
        const spread = Math.max(width, height * 0.85) * 0.54;

        for (const st of streaks) {
          const p = (st.phase + clock * st.speed * s.speed) % 1;
          const tHead = p;
          const tTail = Math.max(0, p - st.len);

          // Mirror the shader's C2 Oklab darkness curve so stars stay ghostly near white and blaze in black
          const smooth = (x: number) => {
            const k = clamp(x, 0, 1);
            return k * k * k * (k * (k * 6 - 15) + 10);
          };
          const darkness = 1 - Math.pow(1 - smooth(tHead), 1.85);
          const reveal = Math.pow(smooth(clamp(darkness / 0.86, 0, 1)), 1.35);
          const bottomOut = 1 - smooth(clamp((tHead - 0.8) / 0.2, 0, 1));
          const alpha = reveal * bottomOut * s.opacity;
          if (alpha < 0.01) continue;

          const xTail = cx + st.lane * spread * (0.48 + 0.65 * tTail * tTail);
          const yTail = tTail * height;
          const xHead = cx + st.lane * spread * (0.48 + 0.65 * tHead * tHead);
          const yHead = tHead * height;

          const grad = ctx.createLinearGradient(xTail, yTail, xHead, yHead);
          grad.addColorStop(0, "rgba(234, 179, 8, 0)");
          grad.addColorStop(0.68, `rgba(234, 179, 8, ${(alpha * 0.68).toFixed(3)})`);
          grad.addColorStop(1, `rgba(255, 245, 210, ${(alpha * 0.96).toFixed(3)})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = st.width;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(xTail, yTail);
          ctx.lineTo(xHead, yHead);
          ctx.stroke();

          ctx.fillStyle = `rgba(255, 250, 232, ${(alpha * 0.95).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(xHead, yHead, st.width * 1.15, 0, TAU);
          ctx.fill();
        }
      };

      const resize2d = () => {
        width = Math.max(1, container.clientWidth);
        height = Math.max(1, container.clientHeight);
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        fallbackCanvas.width = Math.round(width * ratio);
        fallbackCanvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        draw2d();
      };

      const tick2d = (now: number) => {
        raf2d = 0;
        if (!visible2d || document.hidden || settingsRef.current.paused || reduce) return;
        const dt = last2d ? Math.min(0.05, (now - last2d) / 1000) : 1 / 60;
        last2d = now;
        clock += dt;
        draw2d();
        raf2d = requestAnimationFrame(tick2d);
      };

      const wake2d = () => {
        if (!raf2d && visible2d && !document.hidden && !reduce) {
          last2d = 0;
          raf2d = requestAnimationFrame(tick2d);
        }
      };

      const onScroll2d = () => {
        const near = isNearViewport();
        if (near && !visible2d) {
          visible2d = true;
          wake2d();
        }
      };

      const ro2d = new ResizeObserver(resize2d);
      ro2d.observe(container);
      const io2d = new IntersectionObserver(
        (entries) => {
          visible2d = entries.some((e) => e.isIntersecting) || isNearViewport();
          if (visible2d) wake2d();
        },
        { rootMargin: "360px 0px 360px 0px", threshold: 0 },
      );
      io2d.observe(container);
      window.addEventListener("scroll", onScroll2d, { passive: true });
      resize2d();
      wake2d();

      return () => {
        cancelAnimationFrame(raf2d);
        ro2d.disconnect();
        io2d.disconnect();
        window.removeEventListener("scroll", onScroll2d);
        fallbackCanvas.remove();
        canvas.style.display = "";
      };
    };

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "default",
    });
    if (!gl) return startCanvas2DFallback();

    const isCompactViewport = window.innerWidth < 820 || (window.matchMedia?.("(pointer: coarse)").matches ?? false);

    // Probe real RGBA16F FBO completeness + linear filtering; on mobile always prefer universal RGBA8
    // so iOS Safari / Android GPUs never silently fail float FBO sampling.
    const probeFloatTargets = () => {
      if (isCompactViewport) return false;
      const extFloat = gl.getExtension("EXT_color_buffer_float");
      if (!extFloat) return false;
      gl.getExtension("OES_texture_float_linear");
      const testTex = gl.createTexture();
      const testFb = gl.createFramebuffer();
      if (!testTex || !testFb) return false;
      gl.bindTexture(gl.TEXTURE_2D, testTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, testFb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTex, 0);
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(testFb);
      gl.deleteTexture(testTex);
      return complete && gl.getError() === gl.NO_ERROR;
    };

    const floatTargets = probeFloatTargets();
    const streakProgram = link(gl, STREAKS);
    const downProgram = link(gl, DOWNSAMPLE);
    const blurProgram = link(gl, BLUR);
    const compositeProgram = link(gl, COMPOSITE);
    if (!streakProgram || !downProgram || !blurProgram || !compositeProgram) {
      return startCanvas2DFallback();
    }

    const onContextLost = (event: Event) => {
      event.preventDefault();
    };
    const onContextRestored = () => setGeneration((value) => value + 1);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const internalFormat = floatTargets ? gl.RGBA16F : gl.RGBA8;
    const pixelType = floatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const encode = floatTargets ? 1 : 0.25;
    const createTarget = (): RenderTarget => ({
      texture: null,
      framebuffer: gl.createFramebuffer(),
      width: 0,
      height: 0,
    });
    const scene = createTarget();
    const levels: [RenderTarget, RenderTarget][] = Array.from({ length: BLOOM_LEVELS }, () => [
      createTarget(),
      createTarget(),
    ]);

    const allocate = (target: RenderTarget, width: number, height: number) => {
      if (target.texture && target.width === width && target.height === height) return;
      if (target.texture) gl.deleteTexture(target.texture);
      target.texture = gl.createTexture();
      target.width = width;
      target.height = height;
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, pixelType, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    };

    const pass = (target: RenderTarget | null, program: LinkedProgram) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
      gl.useProgram(program.program);
      return program.uniforms;
    };

    const bind = (unit: number, texture: WebGLTexture | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    };

    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const colorCache = new Map<string, [number, number, number]>();
    const toRgb = (value: string): [number, number, number] => {
      const cached = colorCache.get(value);
      if (cached) return cached;
      let rgb: [number, number, number] = [1, 1, 1];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#ffffff";
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        rgb = [(r ?? 255) / 255, (g ?? 255) / 255, (b ?? 255) / 255];
      }
      colorCache.set(value, rgb);
      return rgb;
    };
    const toLinear = (value: string): [number, number, number] => {
      const [r, g, b] = toRgb(value);
      return [r * r, g * g, b * b];
    };

    const palette = new Float32Array(MAX_COLORS * 3);
    const pointer = { x: 0, y: 0, inside: false, held: false };
    const state = {
      travel: 0,
      intro: settingsRef.current.intro && !reduce ? 0 : 1,
      mouseX: 0,
      mouseY: 0,
      lensX: 0,
      lensY: 0,
      touch: 0,
      warp: 0,
    };
    let raf = 0;
    let last = 0;
    let visible = isNearViewport();

    const render = () => {
      const s = settingsRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const cssWidth = Math.max(1, container.clientWidth);
      const cssHeight = Math.max(1, container.clientHeight);
      gl.bindVertexArray(vao);
      allocate(scene, width, height);
      levels.forEach((pair, index) => {
        const levelWidth = Math.max(1, Math.round(cssWidth / 2 ** (index + 1)));
        const levelHeight = Math.max(1, Math.round(cssHeight / 2 ** (index + 1)));
        allocate(pair[0], levelWidth, levelHeight);
        allocate(pair[1], levelWidth, levelHeight);
      });

      const introVal = state.intro;
      const presence = Math.max(0.55, Math.min(1, introVal * 2.4));
      const stretch = 1 + 5 * Math.pow(1 - introVal, 2) + 2.5 * state.warp;
      const rings = Math.max(1, Math.floor(TAU * Math.max(s.density, 0.05) + 0.5));
      const period = TAU / rings;
      const clock = 9 + state.travel;

      const list = s.colors.map(toLinear);
      palette.fill(0);
      for (let i = 0; i < MAX_COLORS; i++) {
        const rgb = list[Math.min(i, list.length - 1)]!;
        palette.set(rgb, i * 3);
      }

      const basis = Math.max(width, height * 1.55);
      const toScreenX = (value: number) => (2 * value - width) / basis;
      const toScreenY = (value: number) => (2 * value - height) / basis;

      const r = pass(scene, streakProgram);
      gl.uniform2f(r.uView, width, height);
      gl.uniform1f(r.uZoom, s.zoom);
      gl.uniform1f(r.uPhase, clock % (16 * period));
      gl.uniform1f(r.uTwinkleClock, clock % TAU);
      gl.uniform1f(r.uRings, rings);
      gl.uniform3fv(r.uColors, palette);
      gl.uniform1i(r.uColorCount, list.length);
      gl.uniform1i(r.uStreakCount, s.streakCount);
      gl.uniform1i(r.uColumns, s.streakWidth > 1 ? 2 : 1);
      gl.uniform1f(r.uWidth, 5e-4 * s.streakWidth);
      gl.uniform1f(r.uTail, 19 / (s.streakLength * stretch));
      gl.uniform1f(r.uTwinkle, s.twinkle);
      gl.uniform1f(r.uHead, s.headGlow);
      gl.uniform1f(r.uDepth, s.depth);
      gl.uniform4f(
        r.uMouse,
        toScreenX(state.mouseX),
        toScreenY(state.mouseY),
        s.mouseInteraction ? s.mouseStrength * state.touch : 0,
        s.mouseRadius,
      );
      gl.uniform3f(
        r.uLens,
        toScreenX(state.lensX),
        toScreenY(state.lensY),
        s.mouseInteraction ? 0.5 * s.lens * state.touch : 0,
      );
      gl.uniform1f(r.uLightMode, s.lightMode ? 1 : 0);
      gl.uniform1f(r.uEncode, encode);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (s.bloom > 0) {
        let source = scene;
        levels.forEach(([front, back]) => {
          const d = pass(front, downProgram);
          bind(0, source.texture);
          gl.uniform1i(d.uSource, 0);
          gl.uniform2f(d.uTarget, front.width, front.height);
          gl.uniform2f(d.uTexel, 1 / source.width, 1 / source.height);
          gl.uniform1f(d.uLimit, 4 * encode);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          let b = pass(back, blurProgram);
          bind(0, front.texture);
          gl.uniform1i(b.uSource, 0);
          gl.uniform2f(b.uTarget, back.width, back.height);
          gl.uniform2f(b.uStep, 1 / front.width, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          b = pass(front, blurProgram);
          bind(0, back.texture);
          gl.uniform1i(b.uSource, 0);
          gl.uniform2f(b.uTarget, front.width, front.height);
          gl.uniform2f(b.uStep, 0, 1 / back.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          source = front;
        });
      }

      const c = pass(null, compositeProgram);
      bind(0, scene.texture);
      gl.uniform1i(c.uScene, 0);
      levels.forEach(([front], index) => {
        bind(index + 1, front.texture);
        gl.uniform1i(c[`uBloom${index}`], index + 1);
      });
      gl.uniform2f(c.uView, width, height);
      gl.uniform1f(c.uDecode, 1 / encode);
      gl.uniform1f(c.uGlow, s.glow);
      gl.uniform1f(c.uBloom, s.bloom);
      gl.uniform1f(c.uPresence, presence);
      gl.uniform1f(c.uOpacity, s.opacity);
      gl.uniform1f(c.uFade, s.fade);
      gl.uniform1f(c.uLightMode, s.lightMode ? 1 : 0);
      gl.uniform1f(c.uBackdropTransition, s.backdropTransition ? 1 : 0);
      gl.uniform3fv(c.uTopColor, toLinear(s.backgroundColor));
      gl.uniform1f(c.uTopGlow, s.backgroundGlow);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (let unit = BLOOM_LEVELS; unit >= 0; unit--) bind(unit, null);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (!s.intro || reduce) state.intro = 1;
      else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);

      const holding = s.holdToWarp && pointer.held && pointer.inside && !reduce;
      state.warp += ((holding ? 1 : 0) - state.warp) * (1 - Math.exp(-dt * (holding ? 2.2 : 1.6)));
      const rush = WARP_SPEED * Math.pow(1 - state.intro, 2) + 6 * state.warp;
      const running = !s.paused && !reduce;
      if (running) state.travel += dt * 0.1 * s.speed * (1 + rush);

      const ratio = canvas.width / Math.max(1, container.clientWidth);
      const targetX = pointer.x * ratio;
      const targetY = (container.clientHeight - pointer.y) * ratio;
      const engaged = s.mouseInteraction && pointer.inside && !reduce;
      if (engaged && state.touch < 0.01) {
        state.mouseX = targetX;
        state.mouseY = targetY;
        state.lensX = targetX;
        state.lensY = targetY;
      }
      const follow = s.mouseDampening > 0 ? 1 - Math.exp(-dt / s.mouseDampening) : 1;
      state.mouseX += (targetX - state.mouseX) * follow;
      state.mouseY += (targetY - state.mouseY) * follow;
      const lensFollow = 1 - Math.exp(-dt * 6);
      state.lensX += (targetX - state.lensX) * lensFollow;
      state.lensY += (targetY - state.lensY) * lensFollow;
      state.touch += ((engaged ? 1 : 0) - state.touch) * (1 - Math.exp(-dt * (engaged ? 4 : 2)));

      render();

      const settling =
        state.intro < 1 || state.warp > 0.001 || Math.abs((engaged ? 1 : 0) - state.touch) > 0.002;
      if ((running && s.speed !== 0) || settling) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const s = settingsRef.current;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const maxRatio = isCompactViewport ? 1.5 : 2;
      const ratio = Math.min(s.dpr || window.devicePixelRatio || 1, maxRatio);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      render();
      wake();
    };

    const locate = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = locate(event);
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.inside = point.inside;
      wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const point = locate(event);
      if (!point.inside) return;
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.inside = true;
      pointer.held = true;
      wake();
    };

    const onPointerUp = () => {
      pointer.held = false;
      wake();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      pointer.held = false;
      wake();
    };

    const onVisibility = () => {
      last = 0;
      wake();
    };

    const onScrollWake = () => {
      const near = isNearViewport();
      if (near && !visible) {
        visible = true;
        last = 0;
        wake();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting) || isNearViewport();
        if (visible) {
          last = 0;
          wake();
        }
      },
      { rootMargin: "360px 0px 360px 0px", threshold: 0 },
    );
    intersection.observe(container);
    window.addEventListener("scroll", onScrollWake, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    let lastDpr = settingsRef.current.dpr;
    wakeRef.current = () => {
      const s = settingsRef.current;
      if (s.dpr !== lastDpr) {
        lastDpr = s.dpr;
        resize();
        return;
      }
      if (!raf) render();
      wake();
    };

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("scroll", onScrollWake);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      [scene, ...levels.flat()].forEach((target) => {
        if (target.texture) gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
      });
      [streakProgram, downProgram, blurProgram, compositeProgram].forEach((item) =>
        gl.deleteProgram(item.program),
      );
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      if (!canvas.isConnected && !gl.isContextLost()) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    };
  }, [generation]);

  return (
    <div
      ref={containerRef}
      className={`lightfall-container${className ? ` ${className}` : ""}`}
      style={{ ...(mixBlendMode ? { mixBlendMode } : null), ...style }}
    >
      <canvas ref={canvasRef} className="lightfall-canvas" aria-hidden="true" />
    </div>
  );
}
