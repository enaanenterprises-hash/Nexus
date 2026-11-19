"use client";

import { useEffect, useRef } from "react";
import type { Vec } from "@/lib/network/geometry";

const MAX_THREADS = 20;
const MAX_COLORS = 6;
const MAX_SURGES = 3;
const MAX_SOCKETS = 5;
const SURGE_SECONDS = 1.65;
const SURGE_STAGGER = 0.045;
const STROKE_SECONDS = 1.3;
const TAU = Math.PI * 2;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * Bespoke Nexus Neural WebGL2 Shader adapted from React Bits <WebThreads />:
 * 1) 18 flowing sinusoidal braided horizon threads pinching through the Nexus Singularity Core
 * 2) 5 sculpted orbital braided neural conduits flowing directly from Core -> Socket pinch -> upper sky
 * 3) Analytical inverse-power luminous glow + white-hot core convergence + 3D twist depth
 * 4) Fluid pointer lens + individual strand hover illumination + click/transfer optical surges
 * 5) Native Dark (molten 24k gold light) and Light (crisp burnished gold ink) dual-mode rendering
 */
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uPhase;
uniform float uClock;
uniform int uCount;
uniform float uFrequency;
uniform float uSpread;
uniform float uTaper;
uniform vec2 uCore;
uniform float uGlow;
uniform float uFalloff;
uniform float uThickness;
uniform float uBrightness;
uniform float uOpacity;
uniform float uDepth;
uniform float uPulses;
uniform float uFade;
uniform float uGrain;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform vec3 uCoreColor;
uniform float uLight;
uniform vec4 uIntro;
uniform float uFocus[${MAX_THREADS}];
uniform vec2 uFocusState;
uniform vec4 uSurges[${MAX_SURGES}];
uniform vec4 uPointer;
uniform vec2 uSockets[${MAX_SOCKETS}];
uniform float uSocketLevel[${MAX_SOCKETS}];
uniform float uSocketSurge[${MAX_SOCKETS}];
uniform int uSocketCount;
out vec4 outColor;

const float PI = 3.14159265;
const float TAU = 6.28318530;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float easeInOut(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
}

vec3 palette(float t) {
  if (uColorCount <= 1) return uColors[0];
  float scaled = clamp(t, 0.0, 1.0) * float(uColorCount - 1);
  int index = int(min(floor(scaled), float(uColorCount - 2)));
  return mix(uColors[index], uColors[index + 1], scaled - float(index));
}

vec3 mainThread(float x, float i, float n) {
  float dx = x - uCore.x;
  float side = dx < 0.0 ? -1.0 : 1.0;
  float envX = uSpread * abs(dx);
  float envY = uSpread * side;
  float amp = 1.0 + i * uTaper;
  float shimmer = sin(uClock * 1.15 + i * 1.37) * 0.28;
  float angle = x * uFrequency + (uPhase + i * TAU / max(n, 1.0)) * side + shimmer;
  float wave = sin(angle);
  float y = uCore.y - envX * amp * wave;
  float slope = -(envY * amp * wave + envX * amp * cos(angle) * uFrequency);
  return vec3(y, slope, angle);
}

void main() {
  vec2 p = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;

  // Subtle organic viscous optical lens around pointer (gentle parting / breath as mouse glides over filaments)
  vec2 s = p;
  if (uPointer.z > 0.001) {
    vec2 diff = vec2((p.x - uPointer.x) * aspect, p.y - uPointer.y);
    float distSq = dot(diff, diff);
    float reach = 0.068;
    float influence = exp(-distSq / reach) * uPointer.z;
    // Gentle outward fluid parting at hover, turning into subtle silk harp-draw toward pointer while held
    float dirSign = mix(-0.022, 0.026, uPointer.w);
    vec2 shift = diff * dirSign * influence;
    s += vec2(shift.x / aspect, shift.y);
  }

  float x = s.x;
  float y = s.y;
  float n = float(uCount);
  float pixel = 1.0 / uResolution.y;
  float presence = uFocusState.x;
  float settle = uFocusState.y;

  vec3 color = vec3(0.0);
  float energy = 0.0;
  float ink = 0.0;
  vec3 inkColor = vec3(0.0);

  // ——— 1. Primary 18-Strand Flowing Braided Neural Weave ———
  for (int idx = 0; idx < ${MAX_THREADS}; idx++) {
    if (idx >= uCount) break;
    float i = float(idx);
    float ci = n > 1.0 ? i / (n - 1.0) : 0.0;

    float head = 2.0;
    float bead = 0.0;
    float born = 1.0;
    if (uIntro.w > 0.5) {
      float progress = clamp((uIntro.x - i * uIntro.y) / uIntro.z, 0.0, 1.0);
      head = mix(-0.04, 1.04, easeInOut(progress));
      bead = sin(PI * progress);
      born = progress > 0.0 ? smoothstep(-0.04, 0.03, head) : 0.0;
    }
    if (born <= 0.0) continue;

    bool tip = x > head;
    vec3 lead = bead > 0.0 || tip ? mainThread(head, i, n) : vec3(0.0);
    vec3 t = tip ? lead : mainThread(x, i, n);

    float focus = uFocus[idx];
    float spot = tip ? head : x;
    float twist = uDepth * smoothstep(0.0, 0.075, abs(spot - uCore.x));
    float depth = 0.5 + 0.5 * cos(t.z);
    float front = mix(1.0, 0.34 + 0.66 * depth, twist);
    float width = uThickness * mix(1.0, 0.58 + 0.65 * depth, twist) * (1.0 + 0.32 * focus * presence);

    float d;
    if (tip) {
      float back = head - 0.02;
      vec2 a = vec2(back * aspect, mainThread(back, i, n).x);
      vec2 b = vec2(head * aspect, lead.x);
      vec2 pa = vec2(x * aspect, y) - a;
      vec2 ba = b - a;
      d = length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
    } else {
      float bend = t.y * smoothstep(0.0, 0.04, abs(x - uCore.x));
      d = abs(y - t.x) / sqrt(1.0 + bend * bend / (aspect * aspect));
    }

    float g = uGlow / pow(max(d / width, pixel * 0.35), uFalloff) * front * born;
    float onLine = exp(-d / (width * 0.012));

    if (bead > 0.0) {
      vec2 near = vec2((x - head) * aspect, y - lead.x);
      g *= 1.0 + bead * 1.5 * exp(-dot(near, near) / 0.0024);
    }

    // Travelling click / press optical surges converging into the core pinch and fanning across
    float surgeLight = 0.0;
    for (int k = 0; k < ${MAX_SURGES}; k++) {
      vec4 surge = uSurges[k];
      if (surge.w <= 0.0) continue;
      float sp = clamp((surge.y - i * ${SURGE_STAGGER.toFixed(3)}) / ${SURGE_SECONDS.toFixed(2)}, 0.0, 1.0);
      if (sp <= 0.0 || sp >= 1.0) continue;
      float sLead = mix(surge.x, surge.z > 0.0 ? 1.12 : -0.12, easeInOut(sp));
      float along = (x - sLead) * surge.z * aspect;
      float trail = along < 0.0 ? exp(along / 0.24) : exp(-along * along / 0.0009);
      surgeLight += trail * sin(PI * sp);
    }
    g *= 1.0 + surgeLight * (0.14 + 2.8 * onLine);

    if (uPulses > 0.0) {
      float travel = abs(x - uCore.x);
      float pulse = pow(0.5 + 0.5 * sin(travel * 15.0 + uClock * 2.0 + i * 1.85), 24.0);
      g *= 1.0 + uPulses * 4.6 * pulse * onLine;
    }

    float sheen = pow(0.5 + 0.5 * sin(abs(x - uCore.x) * 11.0 + uClock * 1.35), 10.0);
    float lift = focus * presence;
    g *= (1.0 - settle * (1.0 - focus)) * (1.0 + lift * (0.95 + 1.4 * sheen * onLine));

    vec3 tint = mix(palette(ci), uCoreColor, 0.28 * lift);
    color += g * tint;
    energy += g;
    float stroke = smoothstep(0.45, 1.28, g);
    inkColor += tint * stroke;
    ink += stroke;
  }

  // ——— 2. Five Sculpted Orbital Socket Braids (Core -> Node Pinch -> Upper Canopy) ———
  float introArm = uIntro.w > 0.5 ? easeInOut(clamp(uIntro.x / (uIntro.z * 0.95), 0.0, 1.0)) : 1.0;
  vec2 pAspect = vec2(s.x * aspect, s.y);
  vec2 coreAspect = vec2(uCore.x * aspect, uCore.y);

  for (int sIdx = 0; sIdx < ${MAX_SOCKETS}; sIdx++) {
    if (sIdx >= uSocketCount) break;
    float level = uSocketLevel[sIdx];
    if (level <= 0.01) continue;

    vec2 sockAspect = vec2(uSockets[sIdx].x * aspect, uSockets[sIdx].y);
    vec2 axis = sockAspect - coreAspect;
    float segLen = max(length(axis), 0.001);
    vec2 dir = axis / segLen;
    vec2 perp = vec2(-dir.y, dir.x);

    vec2 rel = pAspect - coreAspect;
    float u = dot(rel, dir) / segLen; // 0 = Core, 1 = Socket waist, >1 = outer canopy
    float v = dot(rel, perp);

    float maxU = mix(0.0, 1.95, introArm);
    if (u < -0.02 || u > maxU) continue;

    // Gentle organic S-inflection on the outer arm so branches arch naturally like silk
    float archOffset = (float(sIdx) - 2.0) * 0.018 * sin(clamp(u, 0.0, 1.0) * PI);
    float uFade = smoothstep(-0.02, 0.06, u) * (1.0 - smoothstep(1.12, maxU, u));
    float env = u <= 1.0
      ? 0.026 * sin(PI * clamp(u, 0.0, 1.0))
      : 0.018 * (u - 1.0) * (1.0 + 0.55 * (u - 1.0));

    float armSurge = uSocketSurge[sIdx];

    // 3 braided silk strands pinching through Core (u=0) and Socket waist (u=1)
    for (int k = 0; k < 3; k++) {
      float kf = float(k);
      float phase = u * 7.8 - uPhase * 2.1 + kf * (TAU / 3.0) + float(sIdx) * 0.9;
      float targetV = archOffset + env * (0.75 + 0.35 * kf) * sin(phase);
      float d = abs(v - targetV);

      float w = uThickness * (0.62 + 0.24 * level);
      float g = (uGlow * 0.68) / pow(max(d / w, pixel * 0.45), uFalloff) * uFade * level;
      float onLine = exp(-d / (w * 0.014));

      // Rhythmic travelling pulses climbing from Core to occupied sockets
      float pWave = pow(0.5 + 0.5 * sin(u * 10.0 - uClock * 2.4 + kf * 2.1 + float(sIdx)), 20.0);
      g *= 1.0 + uPulses * 3.8 * level * pWave * onLine;

      // Dedicated bright comet surge when snapped, clicked, or transferring signals
      if (armSurge > 0.001 && armSurge < 0.999) {
        float distS = u - armSurge * 1.45;
        float comet = exp(-distS * distS / 0.018) * sin(PI * armSurge);
        g *= 1.0 + comet * (0.4 + 4.8 * onLine);
      }

      // Soft warm pin-star right at the socket optical waist
      if (k == 1) {
        float sd = length(pAspect - sockAspect);
        g += exp(-sd * sd / 0.00038) * 0.42 * level * uFade;
      }

      vec3 tint = mix(palette(0.18 + 0.34 * kf), uCoreColor, 0.22 * clamp(level, 0.0, 1.0));
      color += g * tint;
      energy += g;
      float stroke = smoothstep(0.45, 1.25, g);
      inkColor += tint * stroke;
      ink += stroke;
    }
  }

  float edgeFade = 1.0;
  if (uFade > 0.0) {
    float edge = min(x, 1.0 - x);
    float f = clamp(edge / max(uFade * 0.5, 0.001), 0.0, 1.0);
    edgeFade = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  }

  // Hot white convergence core right where all threads pinch together
  float coreHeat = smoothstep(0.45, 2.2, energy);
  color = mix(color, uCoreColor * energy, coreHeat * 0.52);
  color *= uBrightness * edgeFade;
  float alpha = clamp(energy * edgeFade, 0.0, 1.0) * uOpacity;
  float grain = (hash(gl_FragCoord.xy + fract(uClock) * 97.0) - 0.5) * uGrain;

  if (uLight < 0.5) {
    vec3 rgb = max(color * alpha * (1.0 + grain * 1.6), 0.0);
    outColor = vec4(rgb, alpha);
  } else {
    ink *= edgeFade;
    vec3 hue = ink > 0.0001 ? inkColor / ink : palette(0.5);
    float body = clamp(ink, 0.0, 1.0);
    float haze = clamp(1.0 - exp(-energy * edgeFade * 0.32), 0.0, 1.0) * 0.14;
    float focal = smoothstep(1.8, 8.5, energy * edgeFade) * 0.26;
    float cover = clamp((body * 0.92 + (haze + focal) * (1.0 - body)) * (1.0 + grain * 1.2), 0.0, 0.95) * uOpacity;
    outColor = vec4(hue * cover, cover);
  }
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

let colorProbe: CanvasRenderingContext2D | null = null;
function parseColor(value: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof document === "undefined") return fallback;
  if (!colorProbe) colorProbe = document.createElement("canvas").getContext("2d");
  if (!colorProbe) return fallback;
  colorProbe.fillStyle = "#000000";
  colorProbe.fillStyle = value;
  const text = colorProbe.fillStyle;
  if (text.startsWith("#")) {
    const hex = parseInt(text.slice(1), 16);
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(text);
  if (!match) return fallback;
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
}

const staggerFor = (count: number) => Math.min(0.11, 0.85 / Math.max(count - 1, 1));

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

export interface NeuralThreadsWebGLProps {
  theme: "dark" | "light";
  /** Core center in WebGL UV coordinates (0..1, Y bottom-up). */
  coreUV: Vec;
  /** Up to 5 socket positions in WebGL UV coordinates (0..1, Y bottom-up). */
  socketsUV: Vec[];
  /** Target intensity for each socket (locked ~0.18, open ~0.38, live ~1.0, active/hover ~1.35). */
  socketTargets: number[];
  /** Brain activity energy (0..1). */
  energy: number;
  /** Trigger surge along a specific socket arm (index 0..4, serial). */
  armPulse: { indices: number[]; serial: number } | null;
  /** Notify parent when the user presses directly on the neural lines (so volumetric glow pulses in sync). */
  onLinePress?: () => void;
  paused?: boolean;
  skipIntro?: boolean;
}

type ThreadSettings = {
  palette: [number, number, number][];
  coreColor: [number, number, number];
  lightMode: boolean;
  count: number;
  speed: number;
  frequency: number;
  spread: number;
  taper: number;
  coreUV: Vec;
  socketsUV: Vec[];
  socketTargets: number[];
  glow: number;
  falloff: number;
  thickness: number;
  brightness: number;
  opacity: number;
  depth: number;
  pulses: number;
  fade: number;
  grain: number;
  intro: boolean;
  mouseStrength: number;
  paused: boolean;
};

function buildSettings(props: NeuralThreadsWebGLProps): ThreadSettings {
  const isLight = props.theme === "light";
  const e = clamp(props.energy, 0, 1);
  return {
    palette: isLight
      ? [
          parseColor("#d49610", [0.83, 0.59, 0.06]),
          parseColor("#e67e22", [0.9, 0.49, 0.13]),
          parseColor("#b87a08", [0.72, 0.48, 0.03]),
        ]
      : [
          parseColor("#eab308", [0.92, 0.7, 0.03]),
          parseColor("#ff9952", [1.0, 0.6, 0.32]),
          parseColor("#f7d06b", [0.97, 0.82, 0.42]),
        ],
    coreColor: isLight
      ? parseColor("#f5b82e", [0.96, 0.72, 0.18])
      : parseColor("#ffffff", [1, 1, 1]),
    lightMode: isLight,
    count: 18,
    speed: 0.15 + e * 0.16,
    frequency: 4.8,
    spread: 0.21,
    taper: 0.15,
    coreUV: props.coreUV,
    socketsUV: props.socketsUV,
    socketTargets: props.socketTargets,
    glow: isLight ? 0.014 : 0.0125 + e * 0.003,
    falloff: 0.7,
    thickness: isLight ? 1.15 : 1.08,
    brightness: isLight ? 0.85 : 0.74 + e * 0.22,
    opacity: 1,
    depth: 0.38,
    pulses: 0.88 + e * 0.45,
    fade: 0.16,
    grain: isLight ? 0.015 : 0.03,
    intro: !props.skipIntro,
    mouseStrength: 0.55,
    paused: Boolean(props.paused),
  };
}

/**
 * Flowing WebGL2 braided neural threads engine adapted from React Bits <WebThreads />
 * with 5 unified orbital node conduits, hover strand focus, viscous pointer parting, and click surges.
 */
export function NeuralThreadsWebGL(props: NeuralThreadsWebGLProps) {
  const { armPulse, onLinePress } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const normalized = buildSettings(props);
  const settingsRef = useRef<ThreadSettings>(normalized);
  const onLinePressRef = useRef(onLinePress);
  const armSurgeTriggerRef = useRef<((indices: number[]) => void) | null>(null);
  const lastPulseSerialRef = useRef<number>(armPulse?.serial ?? -1);

  useEffect(() => {
    settingsRef.current = normalized;
    onLinePressRef.current = onLinePress;
  });

  useEffect(() => {
    if (armPulse && armPulse.serial !== lastPulseSerialRef.current) {
      lastPulseSerialRef.current = armPulse.serial;
      armSurgeTriggerRef.current?.(armPulse.indices);
    }
  }, [armPulse]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full cursor-crosshair";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      canvas.remove();
      return undefined;
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      canvas.remove();
      return undefined;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      canvas.remove();
      return undefined;
    }

    const uniformNames = [
      "uResolution",
      "uPhase",
      "uClock",
      "uCount",
      "uFrequency",
      "uSpread",
      "uTaper",
      "uCore",
      "uGlow",
      "uFalloff",
      "uThickness",
      "uBrightness",
      "uOpacity",
      "uDepth",
      "uPulses",
      "uFade",
      "uGrain",
      "uColors",
      "uColorCount",
      "uCoreColor",
      "uLight",
      "uIntro",
      "uFocus",
      "uFocusState",
      "uSurges",
      "uPointer",
      "uSockets",
      "uSocketLevel",
      "uSocketSurge",
      "uSocketCount",
    ] as const;
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      u[name] = gl.getUniformLocation(program, name);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const colorData = new Float32Array(MAX_COLORS * 3);
    const surgeData = new Float32Array(MAX_SURGES * 4);
    const focusData = new Float32Array(MAX_THREADS);
    const socketPosData = new Float32Array(MAX_SOCKETS * 2);
    const socketLevelData = new Float32Array(MAX_SOCKETS);
    const socketSurgeData = new Float32Array(MAX_SOCKETS);
    const socketSurgeAges = Array<number>(MAX_SOCKETS).fill(-1);

    const state = {
      width: 1,
      height: 1,
      phase: 0,
      clock: 0,
      last: 0,
      raf: 0,
      visible: true,
      introAt: -1,
      pointer: [0.5, 0.5] as [number, number],
      smoothPointer: [0.5, 0.5] as [number, number],
      inside: false,
      held: false,
      holdStrength: 0,
      presence: 0,
      settle: 0,
      target: -1,
      surges: [] as Array<{ x: number; direction: number; at: number }>,
      quiet: 0,
      seenTheme: null as boolean | null,
    };

    const reduceMotion = () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(container.clientWidth * ratio));
      const height = Math.max(1, Math.round(container.clientHeight * ratio));
      if (width === state.width && height === state.height) return;
      state.width = width;
      state.height = height;
      canvas.width = width;
      canvas.height = height;
    };

    const introLength = (s: ThreadSettings) => (s.count - 1) * staggerFor(s.count) + STROKE_SECONDS;

    const mainThreadY = (s: ThreadSettings, x: number, index: number, phase: number, clock: number) => {
      const dx = x - s.coreUV.x;
      const side = dx < 0 ? -1 : 1;
      const env = s.spread * Math.abs(dx);
      const shimmer = Math.sin(clock * 1.15 + index * 1.37) * 0.28;
      const angle = x * s.frequency + (phase + (index * TAU) / Math.max(s.count, 1)) * side + shimmer;
      return s.coreUV.y - env * (1 + index * s.taper) * Math.sin(angle);
    };

    const updateFocus = (s: ThreadSettings, dt: number, reduced: boolean) => {
      const wanted = state.inside;
      const ptrFollow = 1 - Math.exp(-dt * 9);
      state.smoothPointer[0] += (state.pointer[0] - state.smoothPointer[0]) * ptrFollow;
      state.smoothPointer[1] += (state.pointer[1] - state.smoothPointer[1]) * ptrFollow;
      state.holdStrength += ((state.held && state.inside ? 1 : 0) - state.holdStrength) * (1 - Math.exp(-dt * 7));

      if (wanted) {
        const cx = state.pointer[0];
        const cy = 1 - state.pointer[1];
        let best = -1;
        let bestDist = Infinity;
        for (let idx = 0; idx < s.count; idx++) {
          const dist = Math.abs(mainThreadY(s, cx, idx, state.phase, reduced ? 0 : state.clock) - cy);
          const reach = idx === state.target ? 0.105 : 0.08;
          if (dist < reach && dist < bestDist) {
            best = idx;
            bestDist = dist;
          }
        }
        state.target = best;
      } else {
        state.target = -1;
      }

      const ease = 1 - Math.exp(-dt / 0.22);
      let strongest = 0;
      for (let idx = 0; idx < MAX_THREADS; idx++) {
        const goal = idx === state.target ? 1 : 0;
        focusData[idx] += (goal - focusData[idx]!) * ease;
        strongest = Math.max(strongest, focusData[idx]!);
      }

      state.presence += ((wanted ? 1 : 0) - state.presence) * (1 - Math.exp(-dt / 0.28));
      const settleGoal = s.mouseStrength * 0.58 * strongest * state.presence;
      state.settle += (settleGoal - state.settle) * (1 - Math.exp(-dt / 0.28));
    };

    const render = (reduced: boolean) => {
      const s = settingsRef.current;
      const introClock = state.introAt < 0 ? 0 : state.clock - state.introAt;
      const introRunning = s.intro && !reduced && introClock < introLength(s);

      gl.viewport(0, 0, state.width, state.height);
      gl.uniform2f(u.uResolution, state.width, state.height);
      gl.uniform1f(u.uPhase, state.phase);
      gl.uniform1f(u.uClock, reduced ? 0 : state.clock);
      gl.uniform1i(u.uCount, s.count);
      gl.uniform1f(u.uFrequency, s.frequency);
      gl.uniform1f(u.uSpread, s.spread);
      gl.uniform1f(u.uTaper, s.taper);
      gl.uniform2f(u.uCore, s.coreUV.x, s.coreUV.y);
      gl.uniform1f(u.uGlow, s.glow * Math.sqrt(6 / Math.max(s.count, 6)));
      gl.uniform1f(u.uFalloff, s.falloff);
      gl.uniform1f(u.uThickness, s.thickness);
      gl.uniform1f(u.uBrightness, s.brightness);
      gl.uniform1f(u.uOpacity, s.opacity);
      gl.uniform1f(u.uDepth, s.depth);
      gl.uniform1f(u.uPulses, s.pulses);
      gl.uniform1f(u.uFade, s.fade);
      gl.uniform1f(u.uGrain, s.grain);

      colorData.fill(0);
      s.palette.slice(0, MAX_COLORS).forEach((rgb, idx) => colorData.set(rgb, idx * 3));
      gl.uniform3fv(u.uColors, colorData);
      gl.uniform1i(u.uColorCount, Math.min(s.palette.length, MAX_COLORS));
      gl.uniform3f(u.uCoreColor, s.coreColor[0], s.coreColor[1], s.coreColor[2]);
      gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
      gl.uniform4f(u.uIntro, introClock, staggerFor(s.count), STROKE_SECONDS, introRunning ? 1 : 0);
      gl.uniform1fv(u.uFocus, focusData);
      gl.uniform2f(u.uFocusState, state.presence * (0.4 + 0.6 * s.mouseStrength), state.settle);

      surgeData.fill(0);
      state.surges.slice(-MAX_SURGES).forEach((surge, idx) => {
        surgeData.set([surge.x, state.clock - surge.at, surge.direction, 1], idx * 4);
      });
      gl.uniform4fv(u.uSurges, surgeData);

      gl.uniform4f(
        u.uPointer,
        state.smoothPointer[0],
        1 - state.smoothPointer[1],
        reduced ? 0 : state.presence,
        state.holdStrength,
      );

      const sCount = Math.min(s.socketsUV.length, MAX_SOCKETS);
      socketPosData.fill(0);
      for (let i = 0; i < sCount; i++) {
        const pt = s.socketsUV[i]!;
        socketPosData[i * 2] = pt.x;
        socketPosData[i * 2 + 1] = pt.y;
      }
      gl.uniform2fv(u.uSockets, socketPosData);
      gl.uniform1fv(u.uSocketLevel, socketLevelData);
      gl.uniform1fv(u.uSocketSurge, socketSurgeData);
      gl.uniform1i(u.uSocketCount, sCount);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now: number) => {
      state.raf = requestAnimationFrame(tick);
      const s = settingsRef.current;
      if (!state.visible || document.hidden || s.paused) {
        state.last = now;
        return;
      }
      const dt = state.last ? Math.min((now - state.last) / 1000, 0.08) : 1 / 60;
      state.last = now;
      const reduced = reduceMotion();

      state.clock += dt;
      if (state.introAt < 0) state.introAt = state.clock;
      if (!reduced) state.phase += dt * s.speed;

      // Smoothly interpolate socket brightness & advance orbital comet surges
      const levelLerp = 1 - Math.exp(-dt * 5.2);
      let armActive = false;
      for (let i = 0; i < MAX_SOCKETS; i++) {
        const goal = s.socketTargets[i] ?? 0;
        const delta = goal - socketLevelData[i]!;
        if (Math.abs(delta) > 0.002) armActive = true;
        socketLevelData[i] += delta * (reduced ? 1 : levelLerp);
        if (socketSurgeAges[i]! >= 0) {
          armActive = true;
          socketSurgeAges[i]! += dt / 1.15;
          if (socketSurgeAges[i]! >= 1) {
            socketSurgeAges[i] = -1;
            socketSurgeData[i] = 0;
          } else {
            socketSurgeData[i] = socketSurgeAges[i]!;
          }
        }
      }

      updateFocus(s, dt, reduced);
      state.surges = state.surges.filter(
        (surge) => state.clock - surge.at < SURGE_SECONDS + (s.count - 1) * SURGE_STAGGER,
      );

      if (reduced && !armActive && state.seenTheme === s.lightMode) {
        state.quiet += 1;
        if (state.quiet > 3) return;
      } else {
        state.quiet = 0;
      }
      state.seenTheme = s.lightMode;

      resize();
      render(reduced);
    };

    armSurgeTriggerRef.current = (indices: number[]) => {
      if (reduceMotion()) return;
      for (const idx of indices) {
        if (idx >= 0 && idx < MAX_SOCKETS) {
          socketSurgeAges[idx] = 0;
        }
      }
      // Also send a balanced outward surge through the primary flowing weave
      state.surges.push({ x: settingsRef.current.coreUV.x, direction: 1, at: state.clock });
      state.surges.push({ x: settingsRef.current.coreUV.x, direction: -1, at: state.clock });
      if (state.surges.length > MAX_SURGES) state.surges.splice(0, state.surges.length - MAX_SURGES);
    };

    const localPoint = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / Math.max(rect.width, 1),
        y: (event.clientY - rect.top) / Math.max(rect.height, 1),
        inside:
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      };
    };

    const onMove = (event: PointerEvent) => {
      const pt = localPoint(event);
      state.inside = pt.inside;
      if (pt.inside) state.pointer = [pt.x, pt.y];
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || reduceMotion()) return;
      if (
        event.target instanceof Element &&
        event.target.closest('a, button, input, textarea, select, label, [role="button"]')
      ) {
        return;
      }
      const pt = localPoint(event);
      if (!pt.inside) return;

      state.held = true;
      state.pointer = [pt.x, pt.y];

      const s = settingsRef.current;
      const direction = pt.x <= s.coreUV.x ? 1 : -1;
      state.surges.push({ x: pt.x, direction, at: state.clock });
      if (state.surges.length > MAX_SURGES) state.surges.shift();

      // Trigger subtle surge along the orbital arm closest to the press
      const uvY = 1 - pt.y;
      let nearestArm = -1;
      let nearestDist = 0.26;
      for (let i = 0; i < s.socketsUV.length; i++) {
        const sock = s.socketsUV[i]!;
        const d = Math.hypot(pt.x - sock.x, uvY - sock.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestArm = i;
        }
      }
      if (nearestArm >= 0) {
        socketSurgeAges[nearestArm] = 0;
      }
      onLinePressRef.current?.();
    };

    const onUp = () => {
      state.held = false;
    };

    const onLeave = () => {
      state.inside = false;
      state.held = false;
    };

    const visibility = new IntersectionObserver((entries) => {
      state.visible = entries.some((entry) => entry.isIntersecting);
    });
    visibility.observe(container);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    resize();
    state.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(state.raf);
      armSurgeTriggerRef.current = null;
      visibility.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" />;
}
