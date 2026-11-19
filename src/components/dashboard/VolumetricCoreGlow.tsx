"use client";

import { useEffect, useRef, useState } from "react";

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * Adapted from React Bits <LightPillar /> for Nexus's Network stage:
 * Raymarched swirling volumetric light column centered on the Nexus Core
 * with radial optical containment so it bathes the flowing neural threads cleanly.
 */
const MARCH = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uTarget;
uniform vec2 uRot;
uniform vec2 uPillarRot;
uniform vec2 uWave;
uniform float uShift;
uniform float uCoreY;
uniform float uPillarWidth;
uniform float uPillarHeight;
uniform int uDetail;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uGlowAmount;
uniform float uWidthNorm;
out vec4 outColor;

void main() {
  vec2 vUv = gl_FragCoord.xy / uTarget;
  vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  uv.x -= uShift;
  uv.y -= (uCoreY * 2.0 - 1.0) * 0.45;
  uv = vec2(uPillarRot.x * uv.x - uPillarRot.y * uv.y, uPillarRot.y * uv.x + uPillarRot.x * uv.y);

  vec3 ro = vec3(0.0, 0.0, -10.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  vec3 origin = vec3(uRot.x * ro.x - uRot.y * ro.z, ro.y, uRot.y * ro.x + uRot.x * ro.z);
  vec3 dir = vec3(uRot.x * rd.x - uRot.y * rd.z, rd.y, uRot.y * rd.x + uRot.x * rd.z);

  float glow = 0.0;
  float lift = 0.0;
  float t = 0.1;
  for (int i = 0; i < 64; i++) {
    vec3 p = origin + dir * t;
    vec3 q = p;
    q.y = p.y * uPillarHeight + uTime;

    float freq = 1.0;
    float amp = 1.0;
    for (int j = 0; j < 6; j++) {
      if (j >= uDetail) break;
      q.xz = vec2(uWave.y * q.x - uWave.x * q.z, uWave.x * q.x + uWave.y * q.z);
      q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
      freq *= 2.0;
      amp *= 0.5;
    }

    float d = length(cos(q.xz)) - 0.2;
    float bound = length(p.xz) - uPillarWidth;
    float h = max(4.0 - abs(d - bound), 0.0);
    d = max(d, bound) + h * h * 0.015625;
    d = abs(d) * 0.15 + 0.01;

    float weight = 1.0 / d;
    glow += weight;
    lift += clamp((15.0 - p.y) / 30.0, 0.0, 1.0) * weight;

    t += d;
    if (t > 44.0) break;
  }

  vec3 col = tanh((uBottomColor * glow + (uTopColor - uBottomColor) * lift) * uGlowAmount / uWidthNorm);
  float peak = max(col.r, max(col.g, col.b));
  outColor = vec4(col, smoothstep(0.58, 1.0, peak));
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uFieldSize;
uniform vec2 uView;
uniform vec2 uAspect;
uniform vec2 uPillarRot;
uniform float uShift;
uniform float uCoreY;
uniform float uIntensity;
uniform float uLightMode;
uniform float uNeutral;
uniform float uBloom;
uniform float uFade;
uniform float uReveal;
uniform float uFlare;
uniform vec4 uPulses[3];
out vec4 outColor;

vec3 tap(vec2 uv) {
  return textureLod(uField, uv, 0.0).rgb;
}

vec3 bicubic(vec2 uv) {
  vec2 position = uv * uFieldSize;
  vec2 center = floor(position - 0.5) + 0.5;
  vec2 f = position - center;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (center - 1.0) / uFieldSize;
  vec2 t3 = (center + 2.0) / uFieldSize;
  vec2 t12 = (center + w2 / w12) / uFieldSize;
  vec3 result = vec3(0.0);
  result += tap(vec2(t0.x, t0.y)) * w0.x * w0.y;
  result += tap(vec2(t12.x, t0.y)) * w12.x * w0.y;
  result += tap(vec2(t3.x, t0.y)) * w3.x * w0.y;
  result += tap(vec2(t0.x, t12.y)) * w0.x * w12.y;
  result += tap(vec2(t12.x, t12.y)) * w12.x * w12.y;
  result += tap(vec2(t3.x, t12.y)) * w3.x * w12.y;
  result += tap(vec2(t0.x, t3.y)) * w0.x * w3.y;
  result += tap(vec2(t12.x, t3.y)) * w12.x * w3.y;
  result += tap(vec2(t3.x, t3.y)) * w3.x * w3.y;
  return max(result, 0.0);
}

float smootherstep01(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  vec3 col = bicubic(uv);

  if (uBloom > 0.0) {
    vec4 l3 = textureLod(uField, uv, 3.0);
    vec4 l4 = textureLod(uField, uv, 4.0);
    vec4 l5 = textureLod(uField, uv, 5.0);
    vec4 l6 = textureLod(uField, uv, 6.0);
    float halo = l3.a * 0.3 + l4.a * 0.3 + l5.a * 0.25 + l6.a * 0.15;
    vec3 tint = l4.rgb + l5.rgb;
    tint /= max(max(tint.r, max(tint.g, tint.b)), 0.001);
    vec3 glow = clamp(tint * halo * uBloom * 1.12, 0.0, 1.0);
    col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * (1.0 - glow);
  }

  vec2 p = (uv * 2.0 - 1.0) * uAspect;
  p.x -= uShift;
  float axis = uPillarRot.y * p.x + uPillarRot.x * p.y;

  float boost = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 pulse = uPulses[i];
    if (pulse.y <= 0.0) continue;
    float offset = (axis - pulse.x) / 0.26;
    boost += exp(-offset * offset) * pulse.y;
  }
  float head = (axis - uReveal + 0.35) / 0.3;
  boost += exp(-head * head) * uFlare;
  float lum = max(col.r, max(col.g, col.b));
  col += mix(col, vec3(lum), 0.45) * boost * 1.65;

  // Soft elliptical optical veil anchored on the Nexus Core so the volumetric glow frames the neural canopy naturally
  vec2 coreDist = vec2((uv.x - 0.5) * 1.15, (uv.y - uCoreY) * 1.25);
  float radialVeil = exp(-dot(coreDist, coreDist) * 1.65);

  vec3 result = clamp(col * uIntensity * (0.35 + 0.65 * radialVeil), 0.0, 1.0);

  float mask = smoothstep(uReveal, uReveal - 0.9, axis);
  float edge = uFade * 0.5;
  if (edge > 0.0) {
    mask *= smootherstep01(uv.x / edge) * smootherstep01((1.0 - uv.x) / edge);
    mask *= smootherstep01(uv.y / edge) * smootherstep01((1.0 - uv.y) / edge);
  }

  if (uLightMode > 0.5) {
    float energy = max(result.r, max(result.g, result.b));
    vec3 hue = result / max(energy, 0.001);
    float coverage = smoothstep(0.03, 0.95, energy);
    hue = pow(clamp(hue, 0.0, 1.0), vec3(1.18));
    vec3 tinted = mix(vec3(1.0), hue, coverage * 0.88 * mask);
    vec3 ink = vec3(1.0) - pow(result, vec3(1.5)) * 0.72 * mask;
    result = mix(tinted, ink, uNeutral);
  } else {
    result *= mask;
  }
  outColor = vec4(result, 1.0);
}`;

const INTRO_SECONDS = 1.9;
const PULSE_LIFE = 1.45;
const MIN_SCALE = 0.25;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

type LinkedProgram = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
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

export interface VolumetricCoreGlowProps {
  theme: "dark" | "light";
  /** WebGL UV Y position of the Nexus Core (0 = bottom, 1 = top). */
  coreYNorm: number;
  /** Brain activity level (0..1). */
  energy: number;
  /** Increment to launch a soft volumetric surge through the core. */
  pulseSerial: number;
  paused?: boolean;
  skipIntro?: boolean;
}

type GlowSettings = {
  topColor: string;
  bottomColor: string;
  intensity: number;
  rotationSpeed: number;
  flow: number;
  glowAmount: number;
  bloom: number;
  pillarWidth: number;
  pillarHeight: number;
  pillarRotation: number;
  twist: number;
  detail: number;
  fade: number;
  scale: number;
  coreYNorm: number;
  lightMode: boolean;
  paused: boolean;
  intro: boolean;
};

function computeSettings(props: VolumetricCoreGlowProps): GlowSettings {
  const isLight = props.theme === "light";
  const e = clamp(props.energy, 0, 1);
  return {
    topColor: isLight ? "#f5d77f" : "#ffffff",
    bottomColor: "#eab308",
    intensity: isLight ? 0.48 + e * 0.18 : 0.72 + e * 0.34,
    rotationSpeed: 0.22 + e * 0.18,
    flow: 1.45 + e * 0.45,
    glowAmount: isLight ? 0.002 : 0.0021,
    bloom: isLight ? 0.42 : 0.52,
    pillarWidth: 3.1,
    pillarHeight: 0.65,
    pillarRotation: 10,
    twist: 0.42,
    detail: 5,
    fade: 0.28,
    scale: 0.5,
    coreYNorm: clamp(props.coreYNorm, 0.15, 0.85),
    lightMode: isLight,
    paused: Boolean(props.paused),
    intro: !props.skipIntro,
  };
}

/**
 * Atmospheric volumetric golden glow aura adapted from <LightPillar />
 * to illuminate the Nexus Core and flowing neural threads from behind.
 */
export function VolumetricCoreGlow(props: VolumetricCoreGlowProps) {
  const { theme, pulseSerial } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const pulseTriggerRef = useRef<(() => void) | null>(null);
  const normalized = computeSettings(props);
  const settingsRef = useRef<GlowSettings>(normalized);
  const lastPulseRef = useRef(pulseSerial);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    settingsRef.current = normalized;
    wakeRef.current?.();
  });

  useEffect(() => {
    if (pulseSerial !== lastPulseRef.current) {
      lastPulseRef.current = pulseSerial;
      pulseTriggerRef.current?.();
    }
  }, [pulseSerial]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!container || !canvas || !gl) return undefined;

    const floatTargets = Boolean(gl.getExtension("EXT_color_buffer_float"));
    const marchProgram = link(gl, MARCH);
    const compositeProgram = link(gl, COMPOSITE);
    if (!marchProgram || !compositeProgram) return undefined;

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

    let texture: WebGLTexture | null = null;
    const framebuffer = gl.createFramebuffer();
    const target = { width: 0, height: 0 };
    const sizeTarget = (width: number, height: number) => {
      if (target.width === width && target.height === height) return;
      target.width = width;
      target.height = height;
      if (texture) gl.deleteTexture(texture);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
      gl.texStorage2D(gl.TEXTURE_2D, levels, floatTargets ? gl.RGBA16F : gl.RGBA8, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
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

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const view = { width: 1, height: 1 };
    const pointer = { x: 0.5, inside: false };
    const pulses: Array<{ axis: number; age: number }> = [];
    const pulseData = new Float32Array(12);
    const state = {
      clock: 0,
      intro: settingsRef.current.intro && !reduce ? 0 : 1,
      touch: 0,
      spin: 0,
      lean: 0,
      shift: 0,
      governor: 1,
      slow: 0,
      quick: 0,
    };
    let raf = 0;
    let last = 0;
    let visible = true;

    const render = () => {
      const s = settingsRef.current;
      const scale = Math.max(MIN_SCALE, s.scale * state.governor);
      const fieldWidth = Math.max(1, Math.round(view.width * scale));
      const fieldHeight = Math.max(1, Math.round(view.height * scale));
      sizeTarget(fieldWidth, fieldHeight);

      const grow = ease(state.intro);
      const rise = easeOut(state.intro);
      const tilt = ((s.pillarRotation + state.lean) * Math.PI) / 180;
      const angle = state.clock * 0.3 + state.spin;
      const width = s.pillarWidth * (0.35 + 0.65 * grow);

      gl.bindVertexArray(vao);
      const m = marchProgram.uniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.useProgram(marchProgram.program);
      gl.uniform1f(m.uTime, state.clock * s.flow);
      gl.uniform2f(m.uResolution, view.width, view.height);
      gl.uniform2f(m.uTarget, target.width, target.height);
      gl.uniform2f(m.uRot, Math.cos(angle), Math.sin(angle));
      gl.uniform2f(m.uPillarRot, Math.cos(tilt), Math.sin(tilt));
      gl.uniform2f(m.uWave, Math.sin(s.twist), Math.cos(s.twist));
      gl.uniform1f(m.uShift, state.shift);
      gl.uniform1f(m.uCoreY, s.coreYNorm);
      gl.uniform1f(m.uPillarWidth, width);
      gl.uniform1f(m.uPillarHeight, s.pillarHeight);
      gl.uniform1i(m.uDetail, s.detail);
      gl.uniform3fv(m.uTopColor, toRgb(s.topColor));
      gl.uniform3fv(m.uBottomColor, toRgb(s.bottomColor));
      gl.uniform1f(m.uGlowAmount, s.glowAmount);
      gl.uniform1f(m.uWidthNorm, width / 3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (s.bloom > 0) gl.generateMipmap(gl.TEXTURE_2D);

      pulseData.fill(0);
      pulses.forEach((pulse, index) => {
        pulseData.set(
          [pulse.axis + pulse.age * 1.55, Math.exp(-pulse.age / (PULSE_LIFE * 0.45)), 0, 0],
          index * 4,
        );
      });

      const c = compositeProgram.uniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compositeProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(c.uField, 0);
      gl.uniform2f(c.uFieldSize, target.width, target.height);
      gl.uniform2f(c.uView, canvas.width, canvas.height);
      gl.uniform2f(c.uAspect, view.width / view.height, 1);
      gl.uniform2f(c.uPillarRot, Math.cos(tilt), Math.sin(tilt));
      gl.uniform1f(c.uShift, state.shift);
      gl.uniform1f(c.uCoreY, s.coreYNorm);
      gl.uniform1f(c.uIntensity, s.intensity * (0.2 + 0.8 * rise) * (1 + 0.08 * state.touch));
      gl.uniform1f(c.uLightMode, s.lightMode ? 1 : 0);
      const chroma = (rgb: [number, number, number]) => Math.max(...rgb) - Math.min(...rgb);
      const vivid = Math.max(chroma(toRgb(s.topColor)), chroma(toRgb(s.bottomColor)));
      gl.uniform1f(c.uNeutral, 1 - clamp((vivid - 0.08) / 0.12, 0, 1));
      gl.uniform1f(c.uBloom, s.bloom);
      gl.uniform1f(c.uFade, s.fade);
      const span = view.width / view.height + 1.2;
      gl.uniform1f(c.uReveal, state.intro >= 1 ? 1e4 : -span + rise * (span * 2 + 1.2));
      gl.uniform1f(c.uFlare, state.intro >= 1 ? 0 : (1 - rise) * 1.15 * Math.min(1, state.intro * 8));
      gl.uniform4fv(c.uPulses, pulseData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tune = (dt: number) => {
      if (dt > 1 / 40) {
        state.slow += 1;
        state.quick = 0;
      } else if (dt < 1 / 55) {
        state.quick += 1;
        state.slow = 0;
      }
      if (state.slow > 20) {
        state.governor = Math.max(0.5, state.governor * 0.85);
        state.slow = 0;
      } else if (state.quick > 180 && state.governor < 1) {
        state.governor = Math.min(1, state.governor * 1.1);
        state.quick = 0;
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      if (last) tune((now - last) / 1000);
      last = now;
      const running = !s.paused && !reduce && s.rotationSpeed !== 0;
      if (running) state.clock += dt * 0.96 * s.rotationSpeed;
      if (!s.intro || reduce) state.intro = 1;
      else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);

      // Very gentle, poised cursor lean toward the active region without jarring jitter
      const engaged = pointer.inside && !reduce;
      const aim = engaged ? pointer.x - 0.5 : 0;
      const follow = 1 - Math.exp(-dt * 1.8);
      state.spin += (aim * 0.45 - state.spin) * follow;
      state.lean += (aim * 4.5 - state.lean) * follow;
      state.shift += (aim * 0.14 * (view.width / view.height) - state.shift) * follow;
      state.touch += ((engaged ? 1 : 0) - state.touch) * (1 - Math.exp(-dt * 2.5));

      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i]!.age += dt;
        if (pulses[i]!.age > PULSE_LIFE * 2.2) pulses.splice(i, 1);
      }

      render();

      const settling =
        state.intro < 1 ||
        pulses.length > 0 ||
        Math.abs(aim * 0.45 - state.spin) > 0.0005 ||
        Math.abs((engaged ? 1 : 0) - state.touch) > 0.002;
      if (running || settling) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      view.width = width;
      view.height = height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      render();
      wake();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      pointer.inside = inside;
      if (inside) pointer.x = (event.clientX - rect.left) / Math.max(1, rect.width);
      wake();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
    };

    const onVisibility = () => {
      last = 0;
      wake();
    };

    pulseTriggerRef.current = () => {
      if (reduce) return;
      pulses.push({ axis: -0.65, age: 0 });
      if (pulses.length > 3) pulses.shift();
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(container);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    wakeRef.current = () => {
      if (!raf) render();
      wake();
    };

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      pulseTriggerRef.current = null;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (texture) gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(marchProgram.program);
      gl.deleteProgram(compositeProgram.program);
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
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        mixBlendMode: theme === "light" ? "multiply" : "screen",
        opacity: theme === "light" ? 0.52 : 0.72,
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
