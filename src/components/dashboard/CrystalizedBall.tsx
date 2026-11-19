'use client';

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Renderer, Program, Mesh, Triangle, Geometry, RenderTarget, Texture } from 'ogl';

import './CrystalizedBall.css';

export type CrystalizedBallPreset =
  | 'plasma'
  | 'aurora'
  | 'nebula'
  | 'ember'
  | 'frost'
  | 'solar'
  | 'eclipse'
  | 'abyss';

export type CrystalizedBallMotion = 'rise' | 'fall' | 'drift' | 'orbit';
export type CrystalizedBallShape = 'square' | 'round';

export interface CrystalizedBallMorphBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}

export interface CrystalizedBallProps {
  preset?: CrystalizedBallPreset;
  color?: string;
  theme?: 'dark' | 'light';
  size?: number;
  strands?: number;
  crackle?: number;
  flares?: number;
  glow?: number;
  sparks?: number;
  particleCount?: number;
  fill?: number;
  motion?: CrystalizedBallMotion;
  particleShape?: CrystalizedBallShape;
  depth?: number;
  sway?: number;
  twinkle?: number;
  haze?: number;
  speed?: number;
  dustSpeed?: number;
  interactive?: boolean;
  hoverStrength?: number;
  intro?: boolean;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Optional explicit orb center [x, y] in CSS pixels from top-left of the container */
  orbCenter?: [number, number];
  /** Optional explicit orb radius in CSS pixels */
  orbRadius?: number;
  /** When true, the orb's dust particles stream down to form the target morphBox */
  morphOpen?: boolean;
  /** Target menu box geometry in CSS pixels relative to container top-left */
  morphBox?: CrystalizedBallMorphBox | null;
}

interface PresetConfig {
  color: string;
  strands: number;
  crackle: number;
  flares: number;
  glow: number;
  sparks: number;
  particleCount: number;
  fill: number;
  motion: CrystalizedBallMotion;
  particleShape: CrystalizedBallShape;
  depth: number;
  sway: number;
  twinkle: number;
  haze: number;
  dustSpeed: number;
}

const BALL_PRESETS: Record<CrystalizedBallPreset, PresetConfig> = {
  plasma: {
    color: '#F25BD0',
    strands: 6,
    crackle: 0.85,
    flares: 0.65,
    glow: 0.9,
    sparks: 0.6,
    particleCount: 15000,
    fill: 0.5,
    motion: 'rise',
    particleShape: 'square',
    depth: 0.6,
    sway: 0.5,
    twinkle: 0.5,
    haze: 0.7,
    dustSpeed: 1
  },
  aurora: {
    color: '#5CFFC8',
    strands: 5,
    crackle: 0.6,
    flares: 0.5,
    glow: 0.8,
    sparks: 0.45,
    particleCount: 15000,
    fill: 0.5,
    motion: 'rise',
    particleShape: 'square',
    depth: 0.6,
    sway: 0.5,
    twinkle: 0.5,
    haze: 0.7,
    dustSpeed: 1
  },
  nebula: {
    color: '#9478FF',
    strands: 6,
    crackle: 1,
    flares: 0.5,
    glow: 0.9,
    sparks: 0.6,
    particleCount: 18000,
    fill: 0.45,
    motion: 'rise',
    particleShape: 'square',
    depth: 0.5,
    sway: 0.4,
    twinkle: 0.6,
    haze: 0.8,
    dustSpeed: 1.2
  },
  ember: {
    color: '#FF8A2A',
    strands: 5,
    crackle: 0.9,
    flares: 0.8,
    glow: 1,
    sparks: 0.8,
    particleCount: 12000,
    fill: 0.35,
    motion: 'rise',
    particleShape: 'round',
    depth: 0.7,
    sway: 0.3,
    twinkle: 0.7,
    haze: 0.9,
    dustSpeed: 1.6
  },
  frost: {
    color: '#BFE6FF',
    strands: 3,
    crackle: 0.3,
    flares: 0.3,
    glow: 0.6,
    sparks: 0.2,
    particleCount: 16000,
    fill: 0.6,
    motion: 'fall',
    particleShape: 'round',
    depth: 0.8,
    sway: 0.4,
    twinkle: 0.4,
    haze: 0.5,
    dustSpeed: 0.7
  },
  solar: {
    color: '#FFD36E',
    strands: 6,
    crackle: 0.7,
    flares: 1,
    glow: 1.1,
    sparks: 0.5,
    particleCount: 15000,
    fill: 0.55,
    motion: 'orbit',
    particleShape: 'square',
    depth: 0.6,
    sway: 0.7,
    twinkle: 0.5,
    haze: 0.8,
    dustSpeed: 1
  },
  eclipse: {
    color: '#FFFFFF',
    strands: 4,
    crackle: 0.5,
    flares: 0.4,
    glow: 0.7,
    sparks: 0.35,
    particleCount: 14000,
    fill: 0.5,
    motion: 'drift',
    particleShape: 'square',
    depth: 0.7,
    sway: 0.5,
    twinkle: 0.5,
    haze: 0.5,
    dustSpeed: 0.8
  },
  abyss: {
    color: '#3F7BFF',
    strands: 5,
    crackle: 0.55,
    flares: 0.6,
    glow: 0.9,
    sparks: 0.4,
    particleCount: 20000,
    fill: 0.8,
    motion: 'orbit',
    particleShape: 'round',
    depth: 0.8,
    sway: 0.8,
    twinkle: 0.5,
    haze: 0.6,
    dustSpeed: 0.9
  }
};

const MOTIONS: Record<CrystalizedBallMotion, number> = { rise: 0, fall: 1, drift: 2, orbit: 3 };
const SHAPES: Record<CrystalizedBallShape, number> = { square: 0, round: 1 };
const MAX_STRANDS = 8;
const MAX_ARCS = 4;
const MAX_PARTICLES = 40000;
const STATE_WIDTH = 256;
const PIXEL_BUDGET = 4.5e6;
const INTRO_SECONDS = 2.2;
const SETTLE_SECONDS = 7;
const WHITE: [number, number, number] = [1, 1, 1];
const BLACK: [number, number, number] = [0, 0, 0];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const mixColor = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
const wrapAngle = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

const parseColor = (value: string, fallback: number[]) => {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return fallback;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    const resolved = ctx.fillStyle;
    if (resolved.startsWith('#')) {
      const n = parseInt(resolved.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const parts = resolved.match(/[\d.]+/g);
    if (!parts || parts.length < 3) return fallback;
    return [Number(parts[0]) / 255, Number(parts[1]) / 255, Number(parts[2]) / 255];
  } catch {
    return fallback;
  }
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

const toOklab = (rgb: number[]): [number, number, number] => {
  const [r = 0, g = 0, b = 0] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
};

const fromOklab = ([L = 0, a = 0, b = 0]: number[]) => {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map(v => clamp(toGamma(clamp(v, 0, 1)), 0, 1));
};

const blend = (a: number[], b: number[], t: number) => fromOklab(mixColor(toOklab(a), toOklab(b), t));

const shift = (rgb: number[], hue: number, lightness: number, chroma: number) => {
  const [L, a, b] = toOklab(rgb);
  const c = Math.hypot(a, b) * chroma;
  const h = Math.atan2(b, a) + (hue * Math.PI) / 180;
  return fromOklab([clamp(L + lightness, 0, 1), c * Math.cos(h), c * Math.sin(h)]);
};

const withLightness = (rgb: number[], hue: number, lightness: number, chroma: number) => {
  const [, a, b] = toOklab(rgb);
  const c = Math.max(Math.hypot(a, b) * chroma, 0.02);
  const h = Math.atan2(b, a) + (hue * Math.PI) / 180;
  return fromOklab([clamp(lightness, 0, 1), c * Math.cos(h), c * Math.sin(h)]);
};

const buildPalette = (color: number[], light: boolean) => {
  if (light) {
    const ink = withLightness(color, 0, Math.min(toOklab(color)[0], 0.62), 1.15);
    return {
      rim: ink,
      rimHot: ink,
      rimMid: ink,
      rimDeep: withLightness(color, 0, 0.72, 0.8),
      spark: withLightness(color, 0, 0.6, 1.2),
      sparkGlow: withLightness(color, 0, 0.78, 0.8),
      haze: withLightness(color, 0, 0.8, 0.6),
      edge: withLightness(color, 0, 0.72, 0.8),
      tones: [
        withLightness(color, 0, 0.56, 1.1),
        withLightness(color, 16, 0.6, 1.05),
        withLightness(color, -16, 0.5, 1.1),
        withLightness(color, 0, 0.66, 0.9),
        withLightness(color, 0, 0.74, 0.7)
      ]
    };
  }
  return {
    rim: color,
    rimHot: mixColor(color, WHITE, 0.72),
    rimMid: mixColor(color, BLACK, 0.15),
    rimDeep: mixColor(color, BLACK, 0.45),
    spark: mixColor(color, WHITE, 0.45),
    sparkGlow: shift(color, 0, -0.15, 1),
    haze: mixColor(color, BLACK, 0.6),
    edge: shift(color, 0, -0.3, 0.9),
    tones: [
      shift(color, 0, -0.06, 1),
      shift(color, 16, -0.02, 1),
      shift(color, -16, -0.12, 1.05),
      shift(blend(color, WHITE, 0.25), 0, 0.04, 1),
      blend(color, WHITE, 0.7)
    ]
  };
};

const seeded = (start: number) => {
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const buildStrands = () => {
  const random = seeded(99);
  const bands: Array<[number, number, number, number]> = [
    [6, 12, 0.6, 1.6],
    [18, 34, 1.5, 3.5],
    [40, 70, 3, 7],
    [80, 130, 6, 12]
  ];
  const data = {
    harmonics: [] as number[],
    rates: [] as number[],
    phases: [] as number[],
    flareHarmonics: [] as number[],
    flareRates: [] as number[],
    flarePhases: [] as number[]
  };
  for (let s = 0; s < MAX_STRANDS; s++) {
    bands.forEach(([low, high, slow, fast]) => {
      data.harmonics.push(Math.round(low + random() * (high - low)));
      data.rates.push((slow + random() * (fast - slow)) * (random() < 0.5 ? -1 : 1));
      data.phases.push(random() * Math.PI * 2);
    });
    for (let j = 0; j < 3; j++) {
      data.flareHarmonics.push(4 + Math.floor(random() * 6));
      data.flareRates.push((0.4 + random() * 0.8) * (random() < 0.5 ? -1 : 1));
      data.flarePhases.push(random() * Math.PI * 2);
    }
    const lead = s === 0;
    data.flareHarmonics.push(lead ? 0.75 : 0.95 + random() * 0.3);
    data.flareRates.push(lead ? 1.15 : 0.8 + random() * 0.2);
    data.flarePhases.push(lead ? 1 : 0.7 + random() * 0.25);
  }
  return data;
};

const buildDust = (count: number) => {
  const random = seeded(1337);
  const rows = Math.max(1, Math.ceil(count / STATE_WIDTH));
  const home = new Float32Array(STATE_WIDTH * rows * 4);
  const seed = new Float32Array(STATE_WIDTH * rows * 4);
  let k = 0;
  let guard = 0;
  while (k < count && guard < count * 80) {
    guard++;
    let x: number;
    let y: number;
    let tone: number;
    if (random() < 0.28) {
      const angle = random() * Math.PI * 2;
      const radius = 0.87 + Math.sqrt(random()) * 0.105;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      if (random() > smooth(-0.6, 0.3, -y)) continue;
      const q = random();
      tone = q < 0.5 ? 3 : q < 0.8 ? 2 : 1;
    } else {
      x = random() * 2 - 1;
      y = random() * 2 - 1;
      const radius = Math.hypot(x, y);
      if (radius > 0.975) continue;
      const bowl = Math.pow(smooth(-0.25, 0.85, -y), 1.3);
      const band = smooth(0.66, 0.96, radius) * smooth(-0.7, 0.3, -y);
      const weight = Math.max(bowl, band * 0.9);
      if (random() > 0.012 + 0.988 * weight) continue;
      if (weight < 0.12) tone = 4;
      else {
        const q = random();
        tone = q < 0.32 ? 0 : q < 0.52 ? 1 : q < 0.8 ? 2 : 3;
      }
    }
    const chord = Math.sqrt(Math.max(0, 0.95 - x * x - y * y));
    home[k * 4] = x;
    home[k * 4 + 1] = y;
    home[k * 4 + 2] = (random() * 2 - 1) * chord;
    home[k * 4 + 3] = tone;
    seed[k * 4] = tone === 4 ? 1.8 : random() < 0.22 ? 2.1 : 1.3;
    seed[k * 4 + 1] = random();
    seed[k * 4 + 2] = 2.5 + random() * 3.5;
    seed[k * 4 + 3] = 0.16 + random() * 0.26;
    k++;
  }
  return { home, seed, count: k, rows };
};

const passVertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const hashChunk = `
uint scramble(uint v) {
  v = v * 747796405u + 2891336453u;
  uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (w >> 22u) ^ w;
}

float random(uint v) {
  return float(scramble(v)) * (1.0 / 4294967295.0);
}
`;

const dustChunk = `
uniform float uDustTime;
uniform vec2 uTurn;
uniform float uMotion;
uniform float uFill;

vec3 settle(vec3 p, out float spread) {
  float bend = exp2((0.5 - uFill) * 1.8);
  float h = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  float y = 2.0 * pow(h, bend) - 1.0;
  float from = sqrt(max(1.0 - p.y * p.y, 1e-4));
  float to = sqrt(max(1.0 - y * y, 0.0));
  spread = clamp(bend * pow(max(h, 1e-3), bend - 1.0) * to / from, 0.25, 1.0);
  return vec3(p.xz * (to / from), y).xzy;
}

vec3 drift(vec4 home, vec4 seed, uint id, out float life, out float spread) {
  vec3 p = settle(home.xyz, spread);
  float t = uDustTime;
  float u = fract(t / seed.z + seed.y);
  life = sin(3.14159265 * u);
  float travel = seed.w;
  if (uMotion < 0.5) {
    p.y += travel * (u - 0.5);
  } else if (uMotion < 1.5) {
    p.y -= travel * (u - 0.5);
  } else if (uMotion < 2.5) {
    p += 0.045 * vec3(
      sin(t * 0.37 + seed.y * 17.0) + 0.5 * sin(t * 0.83 + seed.z * 5.0),
      sin(t * 0.29 + seed.z * 11.0) + 0.5 * sin(t * 0.61 + seed.w * 7.0),
      sin(t * 0.33 + seed.w * 23.0)
    );
  } else {
    float loop = t * (0.6 + 0.9 * random(id * 7u + 3u)) * (random(id * 7u + 10u) < 0.5 ? -1.0 : 1.0) + seed.y * 6.2831853;
    p.xy += (0.025 + 0.05 * random(id * 7u + 16u)) * vec2(cos(loop), sin(loop));
  }
  float wobble = 0.002 + 0.006 * random(id * 7u + 1u);
  float w1 = 0.8 + 2.4 * random(id * 7u + 2u);
  float w2 = 0.8 + 2.4 * random(id * 7u + 4u);
  p += wobble * vec3(sin(t * w1 + seed.y * 40.0), cos(t * w2 + seed.z * 30.0), sin(t * (w1 + w2) * 0.5 + seed.w * 20.0));
  float cy = cos(uTurn.x);
  float sy = sin(uTurn.x);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  float cx = cos(uTurn.y);
  float sx = sin(uTurn.y);
  p.yz = mat2(cx, -sx, sx, cx) * p.yz;
  return p;
}
`;

const fieldFragment = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uCenter;
uniform float uRadius;
uniform float uDpr;
uniform float uLine;
uniform float uTime;
uniform float uFrame;
uniform float uBins;
uniform float uStrands;
uniform float uCrackle;
uniform float uFlares;
uniform float uGlow;
uniform float uHaze;
uniform float uFill;
uniform float uPresence;
uniform float uUnfold;
uniform float uBloom;
uniform float uInside;
uniform float uEncode;
uniform float uMorph;
uniform vec4 uMenuBox;
uniform float uMenuCorner;
uniform vec3 uRim;
uniform vec3 uRimHot;
uniform vec3 uRimMid;
uniform vec3 uRimDeep;
uniform vec3 uSpark;
uniform vec3 uSparkGlow;
uniform vec3 uHazeColor;
uniform vec3 uEdgeColor;
uniform vec4 uHeat;
uniform vec4 uHarmonics[8];
uniform vec4 uRates[8];
uniform vec4 uPhases[8];
uniform vec4 uFlareHarmonics[8];
uniform vec4 uFlareRates[8];
uniform vec4 uFlarePhases[8];
uniform vec4 uArcs[4];

out vec4 fragColor;
${hashChunk}
const float PI = 3.14159265;
const float TAU = 6.28318531;
const vec4 AMPS = vec4(0.35, 0.3, 0.22, 0.13);

float bell(float d, float w) {
  float x = d / w;
  return exp(-x * x);
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float pool(vec2 q) {
  float t = length(q - vec2(0.0, mix(-1.0, -0.66, uFill))) / mix(0.8, 1.35, uFill);
  return t < 0.6 ? mix(0.5, 0.22, t / 0.6) : mix(0.22, 0.0, clamp((t - 0.6) / 0.4, 0.0, 1.0));
}

void main() {
  vec2 screenPos = gl_FragCoord.xy / uDpr;
  vec2 p = screenPos - uCenter;
  float r = length(p);
  float R = uRadius;
  float theta = atan(p.y, p.x);
  float lift = p.y / max(r, 1e-3);
  float topDim = 1.0 - 0.35 * pow(max(lift, 0.0), 1.5);
  vec3 col = vec3(0.0);
  float hot = 0.0;
  uint frame = uint(uFrame);

  // As uMorph progresses 0 -> 1, the entire orb sags downward toward the menu top
  // and dissolves from top to bottom as its energy pours into the menu box.
  float meltShift = smoothstep(0.0, 0.56, uMorph) * min(R * 1.45, 34.0);
  vec2 pMelt = screenPos - vec2(uCenter.x, uCenter.y - meltShift);
  float stretchY = 1.0 + 0.65 * smoothstep(0.0, 0.5, uMorph);
  vec2 pOrb = vec2(pMelt.x, pMelt.y / stretchY);
  float rOrb = length(pOrb);
  float thetaOrb = atan(pOrb.y, pOrb.x);
  float liftOrb = pOrb.y / max(rOrb, 1e-3);
  float topDimOrb = 1.0 - 0.35 * pow(max(liftOrb, 0.0), 1.5);

  // Top of the orb melts first, completely dissolving the orb by uMorph ~ 0.56
  float orbVerticalMelt = clamp((pOrb.y / max(R, 1.0)) * 0.5 + 0.5, 0.0, 1.0);
  float orbAlive = 1.0 - smoothstep(0.04, 0.44, uMorph - (1.0 - orbVerticalMelt) * 0.16);

  float delta = mod(thetaOrb - uHeat.x + PI, TAU) - PI;
  float heat = uHeat.z * uHeat.y * exp(-delta * delta / 0.3);
  float meltSurge = sin(clamp(uMorph / 0.55, 0.0, 1.0) * PI) * 0.55;
  float crackle = uCrackle + heat * 0.9 + meltSurge;

  // Boost relative strand displacement on compact orbs so the 5 braided filaments
  // and flares stay unmistakably distinct at 44px-48px diameter.
  float dispR = max(R, R * 0.55 + 32.0);
  float amp = dispR * 0.017 * (0.3 + 1.4 * crackle) * uUnfold;
  float jitterAmp = dispR * 0.0052 * (0.3 + 1.4 * uCrackle) * uUnfold * (1.0 + heat * 0.3 + meltSurge);
  float flareAmp = dispR * 0.068 * (0.4 + 1.2 * crackle) * uFlares * 1.6 * uUnfold;

  if (orbAlive > 0.002) {
    if (rOrb < R) {
      vec2 q = pOrb / R;
      float chord = sqrt(max(1.0 - dot(q, q), 0.0));
      float haze = pool(q) * (0.55 + 0.45 * chord);
      col += uHazeColor * haze * uHaze * uInside * orbAlive;
      float e = length(q - vec2(0.0, 0.2)) / 1.2;
      float edge = 0.5 * pow(smoothstep(0.62, 1.0, e), 1.4);
      col += uEdgeColor * edge * uInside * (0.5 + 0.5 * uHaze) * orbAlive;
    }

    float dr = rOrb - R;
    float halo = 1.0 - smoothstep(dispR * 0.05, dispR * 0.115, abs(dr - dispR * 0.0213));
    col += uRimDeep * 0.22 * halo * topDimOrb * uGlow * uBloom * orbAlive;
    col += uRim * 0.15 * bell(dr + dispR * 0.0383, dispR * 0.034) * uGlow * uBloom * orbAlive;
    col += uRim * 0.36 * bell(dr, max(dispR * 0.012, uLine)) * uPresence * uUnfold * orbAlive;

    if (abs(dr) < amp * 2.2 + flareAmp + dispR * 0.32) {
      float step = TAU / uBins;
      float binPos = (thetaOrb + PI) / step;
      float bin0 = floor(binPos);
      float binF = binPos - bin0;
      float th0 = bin0 * step - PI;
      float th1 = th0 + step;
      uint b0 = uint(mod(bin0, uBins));
      uint b1 = uint(mod(bin0 + 1.0, uBins));
      float gain = min(1.0, 2.4 / max(uStrands, 1.0));
      for (int k = 0; k < 8; k++) {
        if (float(k) >= uStrands) break;
        vec4 m = uHarmonics[k];
        vec4 lead = uRates[k] * uTime + uPhases[k];
        float wave0 = dot(AMPS, sin(m * th0 + lead));
        float wave1 = dot(AMPS, sin(m * th1 + lead));
        uint salt = uint(k) * 1013u + frame * 7919u;
        vec4 shape = uFlareHarmonics[k];
        vec4 look = uFlareRates[k];
        vec4 tone = uFlarePhases[k];
        float a = amp * shape.w;
        float off0 = a * wave0 + jitterAmp * (random(b0 + salt) - 0.5);
        float off1 = a * wave1 + jitterAmp * (random(b1 + salt) - 0.5);
        float rc = R + mix(off0, off1, binF);
        float grade = (off1 - off0) / (step * max(rOrb, 1.0));
        float d = abs(rOrb - rc) * inversesqrt(1.0 + grade * grade);
        float swell = 0.8 + 0.4 * (0.5 + 0.5 * sin(3.0 * thetaOrb + uTime * 0.7 + tone.x * 1.7));
        float width = uLine * look.w * swell * (1.0 + heat * 0.25);
        float core = exp(-d * d / (width * width));
        float sheath = exp(-d * d / (width * width * 3.2));
        float bright = tone.w * (1.0 + heat * 0.45 + meltSurge * 0.4) * uPresence * orbAlive;
        col += (uRimHot * core * 0.88 + uRim * sheath * 0.36) * bright;
        hot += core * bright;
        vec3 fargs = shape.xyz * thetaOrb + look.xyz * uTime + tone.xyz;
        float flare = max(0.0, (sin(fargs.x) + sin(fargs.y) + sin(fargs.z)) / 3.0);
        flare = (flare * flare + heat * 0.35) * flareAmp;
        float dw = abs(rOrb - rc - flare);
        float dm = abs(rOrb - rc - flare * 0.6);
        float dn = abs(rOrb - rc - flare * 0.25);
        vec3 glow = uRimDeep * (0.08 * bell(dw, dispR * 0.09) + 0.18 * bell(dw, dispR * 0.05));
        glow += uRimMid * 0.32 * bell(dm, dispR * 0.027) + uRim * 0.42 * bell(dn, dispR * 0.013);
        col += glow * gain * topDimOrb * uGlow * uBloom * (1.0 + heat * 1.4) * orbAlive;
      }
    }

    for (int i = 0; i < 4; i++) {
      vec4 arc = uArcs[i];
      if (arc.w <= 0.002) continue;
      float mid = arc.x + arc.y * 0.5;
      vec2 center = R * 0.93 * vec2(cos(mid), sin(mid));
      if (distance(pOrb, center) > R * (abs(arc.y) * 0.6 + 0.1) + 12.0) continue;
      float ar = R * 0.955;
      vec2 a0 = ar * vec2(cos(arc.x), sin(arc.x));
      vec2 a2 = ar * vec2(cos(arc.x + arc.y), sin(arc.x + arc.y));
      vec2 a1 = R * (0.955 - arc.z) * vec2(cos(mid), sin(mid));
      float dmin = 1e5;
      float along = 0.0;
      vec2 prev = a0;
      for (int s = 1; s <= 10; s++) {
        float u = float(s) / 10.0;
        vec2 b = mix(mix(a0, a1, u), mix(a1, a2, u), u);
        vec2 pa = pOrb - prev;
        vec2 ba = b - prev;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
        float dist = length(pa - ba * h);
        if (dist < dmin) {
          dmin = dist;
          along = (float(s) - 1.0 + h) / 10.0;
        }
        prev = b;
      }
      float taper = sqrt(max(sin(PI * along), 0.0));
      float arcWidth = uLine * (0.55 + 0.6 * taper);
      float arcCore = exp(-dmin * dmin / (arcWidth * arcWidth));
      float arcGlow = exp(-dmin * dmin / (arcWidth * arcWidth * 12.0));
      col += (uSpark * 0.95 * arcCore + uSparkGlow * 0.4 * arcGlow) * arc.w * taper * orbAlive;
      hot += arcCore * arc.w * taper * 0.6 * orbAlive;
    }
  }

  // Melted Orb -> Crackling Electric Menu Frame & Ember Cavity
  if (uMorph > 0.01 && uMenuBox.z > 4.0) {
    vec2 boxP = screenPos - uMenuBox.xy;
    float dBox = sdRoundedBox(boxP, uMenuBox.zw, uMenuCorner);
    float boxYProg = clamp((uMenuBox.w - boxP.y) / max(2.0 * uMenuBox.w, 1.0), 0.0, 1.0);
    float boxWave = smoothstep(boxYProg * 0.52, boxYProg * 0.52 + 0.36, uMorph);

    // Molten pouring neck bridging the melting orb into the top crown of the menu
    float bridgeActive = smoothstep(0.03, 0.22, uMorph) * (1.0 - smoothstep(0.45, 0.78, uMorph));
    if (bridgeActive > 0.002) {
      float yTop = uCenter.y - R * 0.35;
      float yBot = uMenuBox.y + uMenuBox.w - 6.0;
      if (screenPos.y <= yTop + 10.0 && screenPos.y >= yBot - 16.0) {
        float yT = clamp((yTop - screenPos.y) / max(yTop - yBot, 1.0), 0.0, 1.0);
        float funnelW = mix(R * 0.42, uMenuBox.z * 0.55, yT);
        float dxNeck = abs(screenPos.x - mix(uCenter.x, uMenuBox.x, yT));
        float neckGlow = exp(-(dxNeck * dxNeck) / max(funnelW * funnelW * 0.45, 4.0));
        float neckFilament = exp(-pow(dxNeck - funnelW * 0.45 * sin(yT * 5.0 - uTime * 3.0), 2.0) / 3.5);
        col += (uRim * neckGlow * 0.42 + uRimHot * neckFilament * 0.55) * bridgeActive * uPresence;
        hot += neckFilament * 0.35 * bridgeActive * uPresence;
      }
    }

    // Interior ember haze pooling at the bottom and along the inner glass walls of the menu box
    if (dBox < 2.0 && boxWave > 0.002) {
      vec2 qBox = boxP / max(uMenuBox.zw, vec2(1.0));
      float innerMask = smoothstep(2.0, -3.0, dBox);
      float bottomPool = pow(clamp((-qBox.y + 1.0) * 0.5, 0.0, 1.0), 1.55);
      float wallCreep = smoothstep(0.45, 0.98, abs(qBox.x)) * pow(clamp((-qBox.y + 1.15) * 0.5, 0.0, 1.0), 0.9);
      float boxHaze = (bottomPool * 0.58 + wallCreep * 0.34);
      col += uHazeColor * boxHaze * uHaze * innerMask * boxWave * 1.25;
      float boxEdge = pow(smoothstep(-16.0, 0.0, dBox), 1.35);
      col += uEdgeColor * boxEdge * 0.55 * (0.5 + 0.5 * uHaze) * innerMask * boxWave;
    }

    // Braided crackling electric strands & flares around the menu perimeter
    float boxDispR = 38.0;
    float boxAmp = boxDispR * 0.022 * (0.35 + 1.25 * crackle);
    float boxJitter = boxDispR * 0.006 * (0.35 + 1.25 * uCrackle) * (1.0 + heat * 0.3);
    float boxFlareAmp = boxDispR * 0.072 * (0.4 + 1.1 * crackle) * uFlares * 1.4;

    if (abs(dBox) < boxAmp * 2.5 + boxFlareAmp + 16.0 && boxWave > 0.002) {
      // Map perimeter coordinate around the menu box to a continuous angle [-PI, PI]
      vec2 normP = vec2(boxP.x / max(uMenuBox.z, 1.0), boxP.y / max(uMenuBox.w, 1.0));
      float boxTheta = atan(normP.y, normP.x);
      float boxLift = normP.y / max(length(normP), 1e-3);
      float boxTopDim = 1.0 - 0.22 * pow(max(boxLift, 0.0), 1.5);

      float halo = 1.0 - smoothstep(2.0, 9.5, abs(dBox - 1.0));
      col += uRimDeep * 0.24 * halo * boxTopDim * uGlow * uBloom * boxWave;
      col += uRim * 0.16 * bell(dBox + 1.8, 2.2) * uGlow * uBloom * boxWave;
      col += uRim * 0.34 * bell(dBox, max(0.65, uLine)) * uPresence * boxWave;

      float boxBins = 520.0;
      float step = TAU / boxBins;
      float binPos = (boxTheta + PI) / step;
      float bin0 = floor(binPos);
      float binF = binPos - bin0;
      float th0 = bin0 * step - PI;
      float th1 = th0 + step;
      uint b0 = uint(mod(bin0, boxBins));
      uint b1 = uint(mod(bin0 + 1.0, boxBins));
      float gain = min(1.0, 2.4 / max(uStrands, 1.0));
      float lineW = max(uLine * 1.05, 0.62);

      for (int k = 0; k < 8; k++) {
        if (float(k) >= uStrands) break;
        vec4 m = uHarmonics[k];
        vec4 lead = uRates[k] * uTime + uPhases[k];
        float wave0 = dot(AMPS, sin(m * th0 + lead));
        float wave1 = dot(AMPS, sin(m * th1 + lead));
        uint salt = uint(k) * 1013u + frame * 7919u + 31u;
        vec4 shape = uFlareHarmonics[k];
        vec4 look = uFlareRates[k];
        vec4 tone = uFlarePhases[k];
        float a = boxAmp * shape.w;
        float off0 = a * wave0 + boxJitter * (random(b0 + salt) - 0.5);
        float off1 = a * wave1 + boxJitter * (random(b1 + salt) - 0.5);
        float offset = mix(off0, off1, binF);
        float d = abs(dBox - offset);
        float swell = 0.8 + 0.4 * (0.5 + 0.5 * sin(3.0 * boxTheta + uTime * 0.7 + tone.x * 1.7));
        float width = lineW * look.w * swell * (1.0 + heat * 0.25);
        float core = exp(-d * d / (width * width));
        float sheath = exp(-d * d / (width * width * 3.4));
        float bright = tone.w * (1.0 + heat * 0.45) * uPresence * boxWave;
        col += (uRimHot * core * 0.82 + uRim * sheath * 0.36) * bright;
        hot += core * bright * 0.9;
        vec3 fargs = shape.xyz * boxTheta + look.xyz * uTime + tone.xyz;
        float flare = max(0.0, (sin(fargs.x) + sin(fargs.y) + sin(fargs.z)) / 3.0);
        flare = (flare * flare + heat * 0.35) * boxFlareAmp;
        float dw = abs(dBox - offset - flare);
        float dm = abs(dBox - offset - flare * 0.6);
        float dn = abs(dBox - offset - flare * 0.25);
        vec3 glow = uRimDeep * (0.08 * bell(dw, 4.2) + 0.16 * bell(dw, 2.3));
        glow += uRimMid * 0.28 * bell(dm, 1.4) + uRim * 0.38 * bell(dn, 0.75);
        col += glow * gain * boxTopDim * uGlow * uBloom * (1.0 + heat * 1.3) * boxWave;
      }
    }
  }

  fragColor = vec4(col, hot) * uEncode;
}
`;

const dustVertex = `#version 300 es
precision highp float;
precision highp int;

in float aIndex;

uniform sampler2D tHome;
uniform sampler2D tSeed;
uniform sampler2D tOffset;
uniform float uStirred;
uniform vec2 uCenter;
uniform vec2 uViewport;
uniform float uRadius;
uniform float uDpr;
uniform float uDepth;
uniform float uTwinkle;
uniform float uPointScale;
uniform float uReveal;
uniform float uEncode;
uniform float uMorph;
uniform vec4 uMenuBox;
uniform float uMenuCorner;
uniform vec3 uTones[5];
uniform vec3 uRimTone;

out vec3 vColor;
out float vSize;
${hashChunk}
${dustChunk}

vec2 menuPerimeterPoint(float rightSideFlag, float prog, vec2 halfSize, float rc, out vec2 outwardNormal) {
  float sideSign = rightSideFlag > 0.5 ? 1.0 : -1.0;
  float r = min(rc, min(halfSize.x, halfSize.y) - 1.0);
  float innerW = max(halfSize.x - r, 0.0);
  float innerH = max(halfSize.y - r, 0.0);
  float cornerArc = 1.57079632679 * r;
  float L1 = innerW;
  float L2 = cornerArc;
  float L3 = 2.0 * innerH;
  float L4 = cornerArc;
  float L5 = innerW;
  float halfPerim = max(L1 + L2 + L3 + L4 + L5, 1e-3);
  float d = clamp(prog, 0.0, 1.0) * halfPerim;
  if (d < L1) {
    outwardNormal = vec2(0.0, 1.0);
    return vec2(sideSign * d, halfSize.y);
  } else if (d < L1 + L2) {
    float a = 1.57079632679 - (d - L1) / max(r, 1e-3);
    vec2 dir = vec2(cos(a), sin(a));
    outwardNormal = vec2(sideSign * dir.x, dir.y);
    return vec2(sideSign * (innerW + r * dir.x), innerH + r * dir.y);
  } else if (d < L1 + L2 + L3) {
    float yd = innerH - (d - L1 - L2);
    outwardNormal = vec2(sideSign, 0.0);
    return vec2(sideSign * halfSize.x, yd);
  } else if (d < L1 + L2 + L3 + L4) {
    float a = -(d - L1 - L2 - L3) / max(r, 1e-3);
    vec2 dir = vec2(cos(a), sin(a));
    outwardNormal = vec2(sideSign * dir.x, dir.y);
    return vec2(sideSign * (innerW + r * dir.x), -innerH + r * dir.y);
  } else {
    float xd = max(innerW - (d - L1 - L2 - L3 - L4), 0.0);
    outwardNormal = vec2(0.0, -1.0);
    return vec2(sideSign * xd, -halfSize.y);
  }
}

void main() {
  ivec2 cell = ivec2(int(mod(aIndex, ${STATE_WIDTH}.0)), int(floor(aIndex / ${STATE_WIDTH}.0)));
  uint id = uint(aIndex);
  vec4 home = texelFetch(tHome, cell, 0);
  vec4 seed = texelFetch(tSeed, cell, 0);
  float life;
  float spread;
  vec3 p = drift(home, seed, id, life, spread);
  if (uStirred > 0.5) p += texelFetch(tOffset, cell, 0).xyz;
  float len = length(p);
  float inside = 1.0 - smoothstep(0.955, 0.985, length(p.xy));
  if (len > 0.975) p *= 0.975 / len;

  float front = p.z * 0.5 + 0.5;
  float depthSize = mix(1.0, 0.7 + 0.6 * front, uDepth);
  float depthLight = mix(1.0, 0.35 + 0.8 * front, uDepth);
  float blink = sin(uDustTime * (2.0 + 6.0 * random(id * 7u + 5u)) + random(id * 7u + 6u) * 6.2831853);
  float twinkle = mix(1.0, smoothstep(-0.9, -0.6, blink), uTwinkle);
  float fade = smoothstep(0.04, 0.12, life);
  float order = (home.y + 1.0) * 0.5 * 0.55 + random(id * 7u + 8u) * 0.25;
  float reveal = smoothstep(order, order + 0.2, uReveal * 1.0);
  float alpha = random(id * 7u + 9u) < 0.5 || home.w > 3.5 ? 1.0 : 0.6;

  float size = seed.x * uPointScale * (0.35 + 0.95 * life) * depthSize * mix(0.5, 1.0, reveal);
  vec2 orbScreen = uCenter + p.xy * uRadius;
  vec2 screen = orbScreen;
  float morphBoost = 0.0;

  // Calibrate resting orb density so a 44-48px orb matches the rich ember pool
  // and distinct upper-cavity twinkling sparks of the 600px reference preview,
  // while waking 100% of all 12,000+ particles when the orb melts into the menu.
  float radiusRatio = clamp(uRadius / 180.0, 0.12, 1.0);
  float activeOrbRatio = clamp(radiusRatio * radiusRatio * 14.5, 0.22, 1.0);
  float particleRank = float(id) / 12000.0;
  float orbDensityMask = particleRank <= activeOrbRatio ? 1.0 : 0.0;
  float orbGain = mix(0.92, 1.0, smoothstep(18.0, 140.0, uRadius));
  float visibilityMask = orbDensityMask;

  if (uMorph > 0.001 && uMenuBox.z > 4.0) {
    // 100% of the orb melts into the particles that make up the menu box
    float uBase = random(id * 17u + 11u);
    float rightSideFlag = uBase < 0.5 ? 1.0 : 0.0;
    float sideSign = rightSideFlag > 0.5 ? 1.0 : -1.0;
    float progBase = rightSideFlag > 0.5 ? (uBase * 2.0) : ((uBase - 0.5) * 2.0);
    float roleHash = random(id * 43u + 7u);

    vec2 targetScreen;
    float verticalProg = progBase;

    if (roleHash < 0.54) {
      // Layer 1 (54%): Dense, living particle walls & rim around the menu perimeter
      float progDrift = clamp(
        progBase + 0.024 * sin(uDustTime * (0.65 + 0.55 * random(id * 29u + 3u)) + seed.y * 12.566),
        0.0,
        1.0
      );
      vec2 boxNormal;
      vec2 perimLocal = menuPerimeterPoint(rightSideFlag, progDrift, uMenuBox.zw, uMenuCorner, boxNormal);
      float bottomWeight = smoothstep(-0.1, 1.0, -perimLocal.y / max(uMenuBox.w, 1.0));
      float inwardDepth = mix(3.2, 7.5, bottomWeight) * pow(random(id * 31u + 9u), 1.25);
      float outwardFuzz = (random(id * 37u + 2u) - 0.35) * 2.4 + 0.75 * sin(uDustTime * 1.4 + seed.y * 19.0);
      float radialOffset = outwardFuzz - inwardDepth;
      vec2 tangDrift = vec2(-boxNormal.y, boxNormal.x) * (1.8 * cos(uDustTime * 0.9 + seed.z * 11.0));
      targetScreen = uMenuBox.xy + perimLocal + boxNormal * radialOffset + tangDrift;
      verticalProg = clamp((uMenuBox.w - perimLocal.y) / max(2.0 * uMenuBox.w, 1.0), 0.0, 1.0);
    } else {
      // Layer 2 (46%): Swirling interior particle matrix & bottom ember pool inside the menu
      float rY = random(id * 53u + 13u);
      float rX = random(id * 61u + 19u);
      // Pool particles more densely toward the bottom and inner walls of the menu,
      // while keeping twinkling sparks rising throughout the full menu height.
      float yNorm;
      if (roleHash < 0.80) {
        // Rich lower & mid-column ember pool climbing the inner walls
        yNorm = -1.0 + 2.0 * pow(rY, 1.55);
      } else {
        // Full-height suspended twinkling ember sparks across all menu items
        yNorm = -0.92 + 1.84 * rY;
      }
      float wallCurve = (rX < 0.5 ? -1.0 : 1.0) * (1.0 - pow(random(id * 67u + 23u), 0.68));
      float xNorm = mix(rX * 2.0 - 1.0, wallCurve, 0.48);

      // Account for rounded corners at top and bottom of the menu box
      float absY = abs(yNorm) * uMenuBox.w;
      float cornerStart = max(uMenuBox.w - uMenuCorner, 0.0);
      float maxHalfX = uMenuBox.z - 3.0;
      if (absY > cornerStart) {
        float dyCorner = absY - cornerStart;
        float cornerChord = sqrt(max(0.0, uMenuCorner * uMenuCorner - dyCorner * dyCorner));
        maxHalfX = max(4.0, (uMenuBox.z - uMenuCorner) + cornerChord - 3.0);
      }

      vec2 liveDrift = vec2(
        p.x * 6.5 + 2.6 * sin(uDustTime * 0.85 + seed.y * 17.0),
        p.y * 10.5 + 3.4 * cos(uDustTime * 0.72 + seed.z * 13.0)
      );
      vec2 innerLocal = vec2(xNorm * maxHalfX, yNorm * (uMenuBox.w - 4.0)) + liveDrift;
      innerLocal.x = clamp(innerLocal.x, -maxHalfX, maxHalfX);
      innerLocal.y = clamp(innerLocal.y, -(uMenuBox.w - 3.5), uMenuBox.w - 3.5);
      targetScreen = uMenuBox.xy + innerLocal;
      verticalProg = clamp((uMenuBox.w - innerLocal.y) / max(2.0 * uMenuBox.w, 1.0), 0.0, 1.0);
    }

    // Order the melt cascade so particles pour out of the orb and fill the menu top-to-bottom
    float orbBottomFirst = clamp((1.0 - p.y) * 0.5, 0.0, 1.0);
    float delay = verticalProg * 0.36 + orbBottomFirst * 0.08 + random(id * 19u + 5u) * 0.12;
    float localT = smoothstep(delay, min(delay + 0.44, 1.0), uMorph);
    float easedT = localT * localT * (3.0 - 2.0 * localT);
    float inFlight = sin(localT * 3.14159265);

    // Melting orb sags downward before particles funnel into the menu column
    vec2 meltedOrbOrigin = orbScreen - vec2(0.0, smoothstep(0.0, 0.45, uMorph) * min(uRadius * 1.1, 24.0));
    vec2 throat = vec2(
      mix(uCenter.x, uMenuBox.x, 0.72) + sideSign * uMenuBox.z * (0.14 + 0.55 * random(id * 23u + 1u)),
      min(uCenter.y - uRadius * 0.55, uMenuBox.y + uMenuBox.w + 2.0)
    );
    vec2 streamPos = mix(mix(meltedOrbOrigin, throat, easedT), mix(throat, targetScreen, easedT), easedT);
    streamPos.x += inFlight * sideSign * (4.2 * sin(localT * 6.2831853 + seed.y * 6.2831853));

    screen = mix(meltedOrbOrigin, streamPos, localT);
    // Wake up 100% of particles as they pour out of the melting orb
    visibilityMask = mix(orbDensityMask, 1.0, smoothstep(0.01, 0.16, localT));
    orbGain = mix(orbGain, 1.22, localT);
    inside = mix(inside, 1.0, smoothstep(0.0, 0.1, localT));
    reveal = mix(reveal, 1.0, smoothstep(0.0, 0.1, localT));
    fade = mix(fade, 0.94, smoothstep(0.0, 0.18, localT));
    size *= 1.0 + 0.34 * inFlight + 0.16 * localT;
    morphBoost = 0.45 * inFlight + 0.24 * localT;
  }

  gl_Position = vec4(screen / uViewport * 2.0 - 1.0, 0.0, 1.0);
  float px = size * uDpr;
  gl_PointSize = visibilityMask > 0.001 ? (px + 2.0) : 0.0;
  vSize = px;

  int tone = int(home.w + 0.5);
  float rimLit = smoothstep(0.8, 0.97, length(p.xy));
  vec3 color = uTones[tone] + uRimTone * (rimLit * rimLit * 0.14 + morphBoost * 0.22);
  vColor =
    color *
    orbGain *
    visibilityMask *
    (1.0 + morphBoost * 0.35) *
    alpha *
    fade *
    twinkle *
    depthLight *
    reveal *
    inside *
    sqrt(spread) *
    uEncode;
}
`;

const dustFragment = `#version 300 es
precision highp float;

uniform float uShape;

in vec3 vColor;
in float vSize;

out vec4 fragColor;

void main() {
  vec2 q = (gl_PointCoord - 0.5) * (vSize + 2.0);
  float half_ = max(vSize * 0.5, 0.5);
  float cover;
  if (uShape < 0.5) {
    vec2 c = clamp(half_ - abs(q) + 0.5, 0.0, 1.0);
    cover = c.x * c.y;
  } else {
    cover = clamp(half_ - length(q) + 0.5, 0.0, 1.0);
  }
  if (cover <= 0.0) discard;
  fragColor = vec4(vColor * cover, 0.0);
}
`;

const stirFragment = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D tHome;
uniform sampler2D tSeed;
uniform sampler2D tOffset;
uniform sampler2D tVelocity;
uniform float uDt;
uniform float uReset;
uniform vec4 uBrush;
uniform float uBrushPower;
uniform vec4 uKick;

layout(location = 0) out vec4 outOffset;
layout(location = 1) out vec4 outVelocity;
${hashChunk}
${dustChunk}
vec3 swirl(vec3 p) {
  float t = uDustTime * 0.15;
  vec3 a = vec3(1.7, 1.9, 1.5) * p.yzx + vec3(t, 1.2, 2.1);
  vec3 b = vec3(2.3, 2.1, 2.7) * p.zxy + vec3(0.4, t * 1.3, 0.9);
  vec3 ca = cos(a) * vec3(1.7, 1.9, 1.5);
  vec3 cb = cos(b) * vec3(2.3, 2.1, 2.7);
  return vec3(ca.z - cb.x, cb.y - ca.x, ca.y - cb.z);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  if (uReset > 0.5) {
    outOffset = vec4(0.0);
    outVelocity = vec4(0.0);
    return;
  }
  uint id = uint(cell.y * ${STATE_WIDTH} + cell.x);
  vec4 home = texelFetch(tHome, cell, 0);
  vec4 seed = texelFetch(tSeed, cell, 0);
  vec3 o = texelFetch(tOffset, cell, 0).xyz;
  vec3 v = texelFetch(tVelocity, cell, 0).xyz;
  float life;
  float spread;
  vec3 base = drift(home, seed, id, life, spread);
  vec3 p = base + o;

  float k = mix(0.8, 2.2, random(id * 7u + 11u));
  vec3 acc = -k * o - 1.5 * sqrt(k) * v;

  vec2 gap = p.xy - uBrush.xy;
  float touch = exp(-dot(gap, gap) / 0.07) * uBrushPower;
  acc += (vec3(uBrush.zw, 0.0) - v) * touch * 14.0;
  float pace = length(v);
  if (pace > 1e-4) {
    vec3 heading = v / pace;
    vec3 curl = swirl(p * 1.6);
    acc += (curl - heading * dot(curl, heading)) * min(pace, 2.0) * 1.8;
  }

  if (uKick.z > 0.0) {
    vec3 jolt = vec3(random(id * 7u + 12u), random(id * 7u + 13u), random(id * 7u + 14u)) - 0.5;
    float near = exp(-dot(p.xy - uKick.xy, p.xy - uKick.xy) / 0.4);
    vec3 spinKick = vec3(-p.z, 0.0, p.x) * 0.9;
    vec3 lift = vec3(0.0, 0.5 + 0.8 * random(id * 7u + 15u), 0.0) * (0.3 + 0.7 * smoothstep(0.2, -0.8, p.y));
    v += (jolt * 0.8 + spinKick + lift) * uKick.z * (0.4 + 0.45 * near);
  }

  v += acc * uDt;
  o += v * uDt;
  vec3 q = base + o;
  float len = length(q);
  if (len > 0.97) {
    vec3 n = q / len;
    o -= n * (len - 0.97);
    v -= n * max(dot(v, n), 0.0) * 1.5;
  }
  outOffset = vec4(o, 1.0);
  outVelocity = vec4(v, 1.0);
}
`;

const compositeFragment = `#version 300 es
precision highp float;

uniform sampler2D tScene;
uniform float uLight;
uniform float uDecode;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uDpr;
uniform float uMorph;
uniform vec4 uMenuBox;
uniform float uMenuCorner;

in vec2 vUv;
out vec4 fragColor;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec3 soften(vec3 x) {
  vec3 over = max(x - 0.6, 0.0);
  return min(x, 0.6) + 0.4 * (1.0 - exp(-over / 0.4));
}

void main() {
  vec4 scene = texture(tScene, vUv) * uDecode;
  vec3 light = max(scene.rgb, 0.0);
  float peak = max(light.r, max(light.g, light.b));
  if (uLight > 0.5) {
    vec3 hue = light / max(peak, 1e-4);
    float cover = 1.0 - exp(-peak * 2.4);
    vec3 ink = hue * mix(0.92, 0.72, cover);
    float core = clamp(scene.a * 0.7, 0.0, 1.0) * cover;
    vec3 tint = mix(vec3(1.0), hue, 0.22);
    fragColor = vec4(tint * core + ink * cover * (1.0 - core), core + cover * (1.0 - core));
    return;
  }

  vec2 screenPos = gl_FragCoord.xy / uDpr;
  float R = uRadius;
  float meltShift = smoothstep(0.0, 0.56, uMorph) * min(R * 1.45, 34.0);
  vec2 pMelt = screenPos - vec2(uCenter.x, uCenter.y - meltShift);
  float stretchY = 1.0 + 0.65 * smoothstep(0.0, 0.5, uMorph);
  vec2 pOrb = vec2(pMelt.x, pMelt.y / stretchY);
  float rOrb = length(pOrb);
  float orbVerticalMelt = clamp((pOrb.y / max(R, 1.0)) * 0.5 + 0.5, 0.0, 1.0);
  float orbAlive = 1.0 - smoothstep(0.04, 0.44, uMorph - (1.0 - orbVerticalMelt) * 0.16);
  float orbGlass = smoothstep(R + 1.5, R - 1.5, rOrb) * orbAlive;

  light += vec3(max(peak - 1.8, 0.0) * 0.25);
  vec3 shown = soften(light);
  float lightAlpha = max(shown.r, max(shown.g, shown.b));

  // Inside the melted menu box, keep alpha light-driven so the emissive particles
  // and crackling rim glow vividly over the dark menu without occluding menu labels.
  float inMenuInterior = 0.0;
  if (uMorph > 0.05 && uMenuBox.z > 4.0) {
    float dBox = sdRoundedBox(screenPos - uMenuBox.xy, uMenuBox.zw, uMenuCorner);
    inMenuInterior = smoothstep(0.0, -5.0, dBox) * smoothstep(0.05, 0.35, uMorph);
  }

  float glassAlpha = orbGlass * 0.92 * (1.0 - inMenuInterior);
  vec3 glassBase = vec3(0.018, 0.016, 0.022) * glassAlpha * (1.0 - clamp(lightAlpha, 0.0, 1.0));
  float finalAlpha = max(glassAlpha, lightAlpha * mix(1.0, 0.55, inMenuInterior));

  fragColor = vec4(glassBase + shown, clamp(finalAlpha, 0.0, 1.0));
}
`;

interface RuntimeSettings {
  light: boolean;
  palette: ReturnType<typeof buildPalette>;
  size: number;
  strands: number;
  crackle: number;
  flares: number;
  glow: number;
  sparks: number;
  particleCount: number;
  fill: number;
  motion: CrystalizedBallMotion;
  particleShape: CrystalizedBallShape;
  depth: number;
  sway: number;
  twinkle: number;
  haze: number;
  dustSpeed: number;
  speed: number;
  interactive: boolean;
  hoverStrength: number;
  intro: boolean;
  paused: boolean;
  orbCenter?: [number, number];
  orbRadius?: number;
  morphOpen: boolean;
  morphBox?: CrystalizedBallMorphBox | null;
}

const CrystalizedBall = ({
  preset = 'plasma',
  color,
  theme = 'dark',
  size = 0.7,
  strands,
  crackle,
  flares,
  glow,
  sparks,
  particleCount,
  fill,
  motion,
  particleShape,
  depth,
  sway,
  twinkle,
  haze,
  speed = 1,
  dustSpeed,
  interactive = true,
  hoverStrength = 0.7,
  intro = true,
  paused = false,
  className = '',
  style,
  orbCenter,
  orbRadius,
  morphOpen = false,
  morphBox = null
}: CrystalizedBallProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<RuntimeSettings | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);

  const base = BALL_PRESETS[preset] || BALL_PRESETS.plasma;
  const pick = <K extends keyof PresetConfig>(value: PresetConfig[K] | undefined, key: K): PresetConfig[K] =>
    value === undefined || value === null ? base[key] : value;
  const tint = pick(color, 'color');

  const colors = useMemo(() => {
    const light = theme === 'light';
    return { light, palette: buildPalette(parseColor(tint, [0.95, 0.36, 0.82]), light) };
  }, [tint, theme]);

  useEffect(() => {
    settingsRef.current = {
      ...colors,
      size,
      strands: pick(strands, 'strands'),
      crackle: pick(crackle, 'crackle'),
      flares: pick(flares, 'flares'),
      glow: pick(glow, 'glow'),
      sparks: pick(sparks, 'sparks'),
      particleCount: pick(particleCount, 'particleCount'),
      fill: pick(fill, 'fill'),
      motion: pick(motion, 'motion'),
      particleShape: pick(particleShape, 'particleShape'),
      depth: pick(depth, 'depth'),
      sway: pick(sway, 'sway'),
      twinkle: pick(twinkle, 'twinkle'),
      haze: pick(haze, 'haze'),
      dustSpeed: pick(dustSpeed, 'dustSpeed'),
      speed,
      interactive,
      hoverStrength,
      intro,
      paused,
      orbCenter,
      orbRadius,
      morphOpen,
      morphBox
    };
    wakeRef.current?.();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return undefined;
    }
    const canvas = gl.canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    const fullFloat = !!gl.getExtension('EXT_color_buffer_float');
    const halfFloat = fullFloat || !!gl.getExtension('EXT_color_buffer_half_float');
    const encode = halfFloat ? 1 : 0.25;
    const geometry = new Triangle(gl);
    const blank = new Texture(gl);
    const strandData = buildStrands();

    const sceneTarget = new RenderTarget(gl, {
      width: 1,
      height: 1,
      depth: false,
      type: halfFloat ? (gl as WebGL2RenderingContext).HALF_FLOAT : gl.UNSIGNED_BYTE,
      format: gl.RGBA,
      internalFormat: halfFloat ? (gl as WebGL2RenderingContext).RGBA16F : gl.RGBA,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR
    });

    const arcData = new Array<number>(MAX_ARCS * 4).fill(0);
    const fieldUniforms = {
      uCenter: { value: [0, 0] },
      uRadius: { value: 1 },
      uDpr: { value: 1 },
      uLine: { value: 0.6 },
      uTime: { value: 0 },
      uFrame: { value: 0 },
      uBins: { value: 420 },
      uStrands: { value: 5 },
      uCrackle: { value: 0.6 },
      uFlares: { value: 0.5 },
      uGlow: { value: 0.8 },
      uHaze: { value: 0.7 },
      uFill: { value: 0.5 },
      uPresence: { value: 0 },
      uUnfold: { value: 0 },
      uBloom: { value: 0 },
      uInside: { value: 0 },
      uEncode: { value: encode },
      uMorph: { value: 0 },
      uMenuBox: { value: [0, 0, 0, 0] },
      uMenuCorner: { value: 22 },
      uRim: { value: [1, 1, 1] },
      uRimHot: { value: [1, 1, 1] },
      uRimMid: { value: [1, 1, 1] },
      uRimDeep: { value: [1, 1, 1] },
      uSpark: { value: [1, 1, 1] },
      uSparkGlow: { value: [1, 1, 1] },
      uHazeColor: { value: [0, 0, 0] },
      uEdgeColor: { value: [0, 0, 0] },
      uHeat: { value: [0, 0, 0, 0] },
      uHarmonics: { value: strandData.harmonics },
      uRates: { value: strandData.rates },
      uPhases: { value: strandData.phases },
      uFlareHarmonics: { value: strandData.flareHarmonics },
      uFlareRates: { value: strandData.flareRates },
      uFlarePhases: { value: strandData.flarePhases },
      uArcs: { value: arcData }
    };

    const dustShared = {
      uDustTime: { value: 0 },
      uTurn: { value: [0, 0] },
      uMotion: { value: 0 },
      uFill: fieldUniforms.uFill,
      tHome: { value: blank },
      tSeed: { value: blank }
    };

    const dustUniforms = {
      ...dustShared,
      tOffset: { value: blank },
      uStirred: { value: 0 },
      uCenter: fieldUniforms.uCenter,
      uViewport: { value: [1, 1] },
      uRadius: fieldUniforms.uRadius,
      uDpr: fieldUniforms.uDpr,
      uDepth: { value: 0.6 },
      uTwinkle: { value: 0.5 },
      uPointScale: { value: 1 },
      uReveal: { value: 0 },
      uEncode: { value: encode },
      uMorph: fieldUniforms.uMorph,
      uMenuBox: fieldUniforms.uMenuBox,
      uMenuCorner: fieldUniforms.uMenuCorner,
      uTones: { value: new Array<number>(15).fill(1) },
      uRimTone: { value: [1, 1, 1] },
      uShape: { value: 0 }
    };

    const stirUniforms = {
      ...dustShared,
      tOffset: { value: blank },
      tVelocity: { value: blank },
      uDt: { value: 0.016 },
      uReset: { value: 1 },
      uBrush: { value: [0, 0, 0, 0] },
      uBrushPower: { value: 0 },
      uKick: { value: [0, 0, 0, 0] }
    };

    const compositeUniforms = {
      tScene: { value: sceneTarget.texture },
      uLight: { value: 0 },
      uDecode: { value: 1 / encode },
      uCenter: fieldUniforms.uCenter,
      uRadius: fieldUniforms.uRadius,
      uDpr: fieldUniforms.uDpr,
      uMorph: fieldUniforms.uMorph,
      uMenuBox: fieldUniforms.uMenuBox,
      uMenuCorner: fieldUniforms.uMenuCorner
    };

    const additive = (program: Program) => {
      program.setBlendFunc(gl.ONE, gl.ONE);
      return program;
    };

    const fieldMesh = new Mesh(gl, {
      geometry,
      program: additive(
        new Program(gl, {
          vertex: passVertex,
          fragment: fieldFragment,
          uniforms: fieldUniforms,
          transparent: true,
          depthTest: false,
          depthWrite: false
        })
      )
    });
    const dustProgram = additive(
      new Program(gl, {
        vertex: dustVertex,
        fragment: dustFragment,
        uniforms: dustUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false
      })
    );
    const stirMesh = halfFloat
      ? new Mesh(gl, {
          geometry,
          program: new Program(gl, {
            vertex: passVertex,
            fragment: stirFragment,
            uniforms: stirUniforms,
            depthTest: false,
            depthWrite: false
          })
        })
      : null;
    const compositeMesh = new Mesh(gl, {
      geometry,
      program: new Program(gl, {
        vertex: passVertex,
        fragment: compositeFragment,
        uniforms: compositeUniforms,
        depthTest: false,
        depthWrite: false
      })
    });

    const disposeTarget = (target: RenderTarget | null) => {
      if (!target) return;
      if (target.buffer) gl.deleteFramebuffer(target.buffer);
      target.textures.forEach(texture => {
        if (texture.texture) gl.deleteTexture(texture.texture);
      });
    };

    const stateTarget = (rows: number) =>
      new RenderTarget(gl, {
        width: STATE_WIDTH,
        height: rows,
        color: 2,
        depth: false,
        type: fullFloat ? gl.FLOAT : (gl as WebGL2RenderingContext).HALF_FLOAT,
        format: gl.RGBA,
        internalFormat: fullFloat ? (gl as WebGL2RenderingContext).RGBA32F : (gl as WebGL2RenderingContext).RGBA16F,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST
      });

    const dataTexture = (data: Float32Array, rows: number) =>
      new Texture(gl, {
        image: data,
        width: STATE_WIDTH,
        height: rows,
        type: gl.FLOAT,
        format: gl.RGBA,
        internalFormat: (gl as WebGL2RenderingContext).RGBA32F,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
        generateMipmaps: false,
        flipY: false
      });

    interface DustLayer {
      requested: number;
      rows: number;
      home: Texture;
      seed: Texture;
      mesh: Mesh;
      read: RenderTarget | null;
      write: RenderTarget | null;
    }

    let dust: DustLayer | null = null;

    const disposeDust = () => {
      if (!dust) return;
      dust.mesh.geometry.remove();
      if (dust.home.texture) gl.deleteTexture(dust.home.texture);
      if (dust.seed.texture) gl.deleteTexture(dust.seed.texture);
      disposeTarget(dust.read);
      disposeTarget(dust.write);
      dust = null;
    };

    const resetStir = () => {
      if (!stirMesh || !dust || !dust.read || !dust.write) return;
      stirUniforms.tOffset.value = blank;
      stirUniforms.tVelocity.value = blank;
      stirUniforms.uReset.value = 1;
      renderer.render({ scene: stirMesh, target: dust.read, clear: false });
      renderer.render({ scene: stirMesh, target: dust.write, clear: false });
      stirUniforms.uReset.value = 0;
    };

    const rebuildDust = (requested: number) => {
      const total = clamp(Math.round(requested / 100) * 100, 0, MAX_PARTICLES);
      if (dust && dust.requested === total) return;
      disposeDust();
      if (!total) {
        dust = null;
        return;
      }
      const data = buildDust(total);
      const indices = new Float32Array(data.count);
      for (let i = 0; i < data.count; i++) indices[i] = i;
      const points = new Geometry(gl, { aIndex: { size: 1, data: indices } });
      dust = {
        requested: total,
        rows: data.rows,
        home: dataTexture(data.home, data.rows),
        seed: dataTexture(data.seed, data.rows),
        mesh: new Mesh(gl, { mode: gl.POINTS, geometry: points, program: dustProgram }),
        read: stirMesh ? stateTarget(data.rows) : null,
        write: stirMesh ? stateTarget(data.rows) : null
      };
      dustShared.tHome.value = dust.home;
      dustShared.tSeed.value = dust.seed;
      resetStir();
      stirring = 0;
    };

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const random = seeded(913);

    let width = 1;
    let height = 1;
    let raf = 0;
    let last = performance.now();
    let rimTime = 0;
    let dustTime = 0;
    let swayClock = 0;
    let introClock = 0;
    let morphClock = settingsRef.current?.morphOpen ? 1 : 0;
    let lastMorphOpen = Boolean(settingsRef.current?.morphOpen);
    let visible = true;
    let alive = true;
    let surge = 0;
    let stirring = 0;
    let stirEnergy = 0;
    let kick: { x: number; y: number; strength: number } | null = null;
    let nextArc = 0.3;
    const arcs: Array<{
      start: number;
      span: number;
      curl: number;
      life: number;
      duration: number;
      drift: number;
      strength: number;
    }> = [];
    const pointer = { x: 0, y: 0, inside: false, fresh: true };
    const heat = { angle: 0, velocity: 0, power: 0, near: 0 };
    const brush = { x: 0, y: 0, vx: 0, vy: 0 };
    const look = { x: 0, y: 0, vx: 0, vy: 0 };

    let resizePending = false;
    const applyResize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      // Always render at >= 2x DPR when within the pixel budget so compact orbs
      // stay razor-sharp and never stair-step on 1x desktop monitors.
      const desiredDpr = Math.max(2, window.devicePixelRatio || 1);
      renderer.dpr = Math.min(desiredDpr, 2.5, Math.sqrt(PIXEL_BUDGET / (width * height)));
      renderer.setSize(width, height);
      sceneTarget.setSize(gl.canvas.width, gl.canvas.height);
    };

    const resize = () => {
      resizePending = true;
      start();
    };

    const spawnArc = (angle: number, strength: number) => {
      if (arcs.length >= MAX_ARCS) return;
      arcs.push({
        start: angle,
        span: (0.05 + random() * 0.07) * (random() < 0.5 ? -1 : 1),
        curl: 0.02 + random() * 0.04,
        life: 0,
        duration: 0.2 + random() * 0.2,
        drift: (random() - 0.5) * 0.3,
        strength
      });
    };

    const getOrbGeometry = (s: RuntimeSettings) => {
      const cx = s.orbCenter ? s.orbCenter[0] : width / 2;
      const cyDom = s.orbCenter ? s.orbCenter[1] : height / 2;
      const cyWebgl = height - cyDom;
      const radius =
        s.orbRadius !== undefined && s.orbRadius > 0
          ? s.orbRadius
          : Math.max(8, (clamp(s.size, 0.1, 1.5) * Math.min(width, height)) / 2);
      return { cx, cyDom, cyWebgl, radius };
    };

    const frame = (now: number) => {
      raf = 0;
      if (resizePending) {
        resizePending = false;
        applyResize();
      }
      if (!alive) return;
      const s = settingsRef.current;
      const dt = Math.min(0.05, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      if (!s) return;

      const moving = !s.paused && !reducedMotion;
      introClock = s.intro && !reducedMotion ? Math.min(1, introClock + dt / INTRO_SECONDS) : 1;

      if (s.morphOpen !== lastMorphOpen) {
        lastMorphOpen = s.morphOpen;
        surge = Math.max(surge, 0.65);
        spawnArc(-Math.PI * 0.5 + (random() - 0.5) * 0.6, 1.15);
      }
      const morphTarget = s.morphOpen ? 1 : 0;
      if (reducedMotion) {
        morphClock = morphTarget;
      } else if (morphClock < morphTarget) {
        morphClock = Math.min(1, morphClock + dt / 1.05);
      } else if (morphClock > morphTarget) {
        morphClock = Math.max(0, morphClock - dt / 0.8);
      }

      const presence = easeOut(smooth(0, 0.42, introClock));
      const unfold = easeOut(smooth(0, 0.32, introClock));
      const charge = Math.sin(Math.PI * smooth(0.22, 0.78, introClock)) * 0.35;
      const { cx, cyDom, cyWebgl, radius } = getOrbGeometry(s);

      // Track pointer against the resting orb when closed, and smoothly shift interaction
      // center to the melted menu box when open so hovering menu items stirs the dust & heats the rim.
      const hasMenu = Boolean(s.morphBox && morphClock > 0.25);
      const boxCxDom = s.morphBox ? s.morphBox.x + s.morphBox.width * 0.5 : cx;
      const boxCyDom = s.morphBox ? s.morphBox.y + s.morphBox.height * 0.5 : cyDom;
      const boxHalfW = s.morphBox ? Math.max(s.morphBox.width * 0.5, 20) : radius;
      const boxHalfH = s.morphBox ? Math.max(s.morphBox.height * 0.5, 20) : radius;

      const activeCx = hasMenu ? cx + (boxCxDom - cx) * morphClock : cx;
      const activeCyDom = hasMenu ? cyDom + (boxCyDom - cyDom) * morphClock : cyDom;
      const activeScaleX = hasMenu ? radius + (boxHalfW - radius) * morphClock : radius;
      const activeScaleY = hasMenu ? radius + (boxHalfH - radius) * morphClock : radius;

      const strength = s.interactive && !reducedMotion ? clamp(s.hoverStrength, 0, 1) : 0;
      const px = pointer.x - activeCx;
      const py = activeCyDom - pointer.y;
      const normX = px / Math.max(activeScaleX, 1);
      const normY = py / Math.max(activeScaleY, 1);
      const normReach = Math.hypot(normX, normY);
      const nearActive = normReach <= 2.35;
      const target = pointer.inside && nearActive ? strength : 0;
      if (heat.power < 0.02) {
        heat.angle = Math.atan2(normY, normX);
        heat.velocity = 0;
      }
      const turn = wrapAngle(Math.atan2(normY, normX) - heat.angle);
      heat.velocity += (120 * turn - 19 * heat.velocity) * dt;
      heat.angle = wrapAngle(heat.angle + heat.velocity * dt);
      heat.power += (target - heat.power) * (1 - Math.exp(-dt / (target > heat.power ? 0.3 : 0.55)));
      const nearTarget = Math.exp(-Math.pow((normReach - 1) / 0.55, 2));
      heat.near += (nearTarget - heat.near) * (1 - Math.exp(-dt / 0.15));
      surge *= Math.exp(-dt / 0.7);

      const bx = normX;
      const by = normY;
      if (Math.hypot(bx - brush.x, by - brush.y) > 0.6) pointer.fresh = true;
      if (pointer.fresh) {
        brush.x = bx;
        brush.y = by;
        brush.vx = 0;
        brush.vy = 0;
        pointer.fresh = false;
      }
      const follow = 1 - Math.exp(-dt / 0.05);
      brush.vx += ((bx - brush.x) / dt - brush.vx) * follow;
      brush.vy += ((by - brush.y) / dt - brush.vy) * follow;
      brush.x = bx;
      brush.y = by;
      const brushSpeed = Math.hypot(brush.vx, brush.vy);
      const cap = brushSpeed > 4 ? 4 / brushSpeed : 1;
      const inBall = Math.exp(-Math.max(0, Math.hypot(bx, by) - 1) * 5);
      const brushPower = pointer.inside && nearActive ? strength * inBall * presence : 0;
      stirEnergy = stirEnergy * Math.exp(-dt / 1.2) + brushPower * Math.min(brushSpeed, 4) * dt;

      if (moving) {
        const pace = 1 + surge * 0.6 + heat.power * heat.near * 0.3;
        const step = dt * Math.max(0, s.speed) * 2 * pace;
        rimTime += step;
        dustTime += dt * Math.max(0, s.dustSpeed) * (1 + surge * 0.4);
        swayClock += dt * Math.max(0, s.dustSpeed);
        const crackleNow = clamp(s.crackle + surge * 0.5, 0, 1.5);
        if (s.sparks > 0.01 && introClock > 0.55) {
          nextArc -= step * s.sparks * 2 * (0.6 + crackleNow * 0.6);
          if (nextArc <= 0) {
            const local = heat.power * heat.near;
            const angle =
              random() < local * 0.7
                ? heat.angle + (random() - 0.5) * 0.8
                : random() < 0.7
                  ? Math.PI / 2 + (random() - 0.5) * 1.5
                  : random() * Math.PI * 2;
            spawnArc(angle, 0.8 + local * 0.6 + surge * 0.4);
            nextArc = 0.15 + random() * 0.6;
          }
        }
        for (let i = arcs.length - 1; i >= 0; i--) {
          const arc = arcs[i]!;
          arc.life += step;
          arc.start += arc.drift * step;
          if (arc.life >= arc.duration) arcs.splice(i, 1);
        }
      } else {
        arcs.length = 0;
      }
      for (let i = 0; i < MAX_ARCS; i++) {
        const arc = arcs[i];
        arcData[i * 4] = arc ? arc.start : 0;
        arcData[i * 4 + 1] = arc ? arc.span : 0;
        arcData[i * 4 + 2] = arc ? arc.curl : 0;
        arcData[i * 4 + 3] = arc ? Math.sin((Math.PI * arc.life) / arc.duration) * arc.strength : 0;
      }

      rebuildDust(s.particleCount);
      const palette = s.palette;

      fieldUniforms.uCenter.value = [cx, cyWebgl];
      fieldUniforms.uRadius.value = radius;
      fieldUniforms.uDpr.value = renderer.dpr;
      fieldUniforms.uLine.value = Math.max(0.62, radius * 0.025);
      fieldUniforms.uTime.value = rimTime;
      fieldUniforms.uFrame.value = Math.floor(rimTime * 24) % 100000;
      fieldUniforms.uBins.value = clamp(Math.round((Math.PI * 2 * Math.max(radius, 42)) / 2.2), 260, 900);
      fieldUniforms.uStrands.value = Math.round(clamp(s.strands, 1, MAX_STRANDS));
      fieldUniforms.uCrackle.value = clamp(s.crackle, 0, 1) + surge * 0.45 + charge;
      fieldUniforms.uFlares.value = clamp(s.flares, 0, 1);
      fieldUniforms.uGlow.value =
        clamp(s.glow, 0, 2) * (1 + surge * 0.45 + charge) * (s.light ? 0.45 : 1);
      fieldUniforms.uHaze.value = clamp(s.haze, 0, 2) * (s.light ? 0.65 : 1);
      fieldUniforms.uFill.value = clamp(s.fill, 0, 1);
      fieldUniforms.uPresence.value = presence;
      fieldUniforms.uUnfold.value = unfold;
      fieldUniforms.uBloom.value = presence * presence;
      fieldUniforms.uInside.value = smooth(0.2, 0.95, introClock);
      fieldUniforms.uMorph.value = morphClock;
      if (s.morphBox) {
        const boxCx = s.morphBox.x + s.morphBox.width * 0.5;
        const boxCyWebgl = height - (s.morphBox.y + s.morphBox.height * 0.5);
        fieldUniforms.uMenuBox.value = [boxCx, boxCyWebgl, s.morphBox.width * 0.5, s.morphBox.height * 0.5];
        fieldUniforms.uMenuCorner.value = s.morphBox.radius ?? 22;
      } else {
        fieldUniforms.uMenuBox.value = [0, 0, 0, 0];
      }
      fieldUniforms.uRim.value = palette.rim;
      fieldUniforms.uRimHot.value = palette.rimHot;
      fieldUniforms.uRimMid.value = palette.rimMid;
      fieldUniforms.uRimDeep.value = palette.rimDeep;
      fieldUniforms.uSpark.value = palette.spark;
      fieldUniforms.uSparkGlow.value = palette.sparkGlow;
      fieldUniforms.uHazeColor.value = palette.haze;
      fieldUniforms.uEdgeColor.value = palette.edge;
      fieldUniforms.uHeat.value = [heat.angle, heat.near, heat.power * presence, 0];

      dustShared.uDustTime.value = dustTime;
      const gaze = pointer.inside && nearActive ? strength * presence : 0;
      const lookX = clamp(bx, -1.6, 1.6) * gaze;
      const lookY = clamp(by, -1.6, 1.6) * gaze;
      look.vx += (40 * (lookX - look.x) - 11 * look.vx) * dt;
      look.vy += (40 * (lookY - look.y) - 11 * look.vy) * dt;
      look.x += look.vx * dt;
      look.y += look.vy * dt;
      const swing = clamp(s.sway, 0, 1);
      dustShared.uTurn.value = [
        swing * 0.42 * Math.sin(swayClock * 0.23) + look.x * 0.3,
        swing * 0.12 * Math.sin(swayClock * 0.17 + 1.3) - look.y * 0.16
      ];
      dustShared.uMotion.value = MOTIONS[s.motion] ?? 0;
      dustUniforms.uViewport.value = [width, height];
      dustUniforms.uDepth.value = clamp(s.depth, 0, 1);
      dustUniforms.uTwinkle.value = clamp(s.twinkle, 0, 1);
      dustUniforms.uPointScale.value =
        radius < 120 ? clamp(radius / 31, 0.74, 1) : Math.max(1, radius / 491);
      dustUniforms.uReveal.value = smooth(0.18, 1, introClock);
      dustUniforms.uTones.value = palette.tones.flat();
      dustUniforms.uRimTone.value = palette.rim;
      dustUniforms.uShape.value = SHAPES[s.particleShape] ?? 0;

      const layer = dust;
      if (layer && stirMesh && (stirEnergy > 0.002 || kick)) stirring = SETTLE_SECONDS;
      let stirred = false;
      if (layer && layer.read && layer.write && stirMesh && stirring > 0) {
        stirUniforms.uDt.value = Math.min(dt, 1 / 30);
        stirUniforms.uBrush.value = [brush.x, brush.y, brush.vx * cap, brush.vy * cap];
        stirUniforms.uBrushPower.value = brushPower;
        stirUniforms.uKick.value = kick ? [kick.x, kick.y, kick.strength, 0] : [0, 0, 0, 0];
        stirUniforms.tOffset.value = layer.read.textures[0]!;
        stirUniforms.tVelocity.value = layer.read.textures[1]!;
        renderer.render({ scene: stirMesh, target: layer.write, clear: false });
        const swap = layer.read;
        layer.read = layer.write;
        layer.write = swap;
        stirring -= dt;
        stirred = stirring > 0;
        if (!stirred) {
          stirring = 0;
          resetStir();
        }
      }
      kick = null;
      dustUniforms.uStirred.value = stirred ? 1 : 0;
      dustUniforms.tOffset.value = layer && layer.read ? layer.read.textures[0]! : blank;

      gl.clearColor(0, 0, 0, 0);
      renderer.render({ scene: fieldMesh, target: sceneTarget, clear: true });
      if (dust) renderer.render({ scene: dust.mesh, target: sceneTarget, clear: false });

      compositeUniforms.uLight.value = s.light ? 1 : 0;
      renderer.render({ scene: compositeMesh, clear: false });

      const settling =
        Math.abs(target - heat.power) > 0.002 ||
        Math.abs(morphTarget - morphClock) > 0.001 ||
        surge > 0.002 ||
        stirring > 0 ||
        Math.abs(heat.velocity) > 0.01 ||
        Math.hypot(look.vx, look.vy, look.x - lookX, look.y - lookY) > 0.001;
      if (visible && (moving || introClock < 1 || settling)) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const locate = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };

    const onPointerMove = (e: PointerEvent) => {
      const spot = locate(e);
      if (spot.inside && !pointer.inside) pointer.fresh = true;
      pointer.x = spot.x;
      pointer.y = spot.y;
      pointer.inside = spot.inside;
      if (spot.inside) start();
    };

    const onPointerDown = (e: PointerEvent) => {
      const s = settingsRef.current;
      const spot = locate(e);
      if (!s || !s.interactive || reducedMotion || !spot.inside) return;
      if (!pointer.inside) pointer.fresh = true;
      pointer.x = spot.x;
      pointer.y = spot.y;
      pointer.inside = true;
      const { cx, cyDom, radius } = getOrbGeometry(s);
      const kx = (spot.x - cx) / radius;
      const ky = (cyDom - spot.y) / radius;
      const distance = Math.hypot(kx, ky);
      if (distance > 1.35) return;
      const strength = clamp(s.hoverStrength, 0, 1);
      kick = { x: kx, y: ky, strength: strength * 1.2 };
      surge = Math.max(surge, strength);
      const angle = Math.atan2(ky, kx);
      spawnArc(angle + (random() - 0.5) * 0.5, 1.3);
      spawnArc(angle + Math.PI + (random() - 0.5) * 1.2, 1.1);
      start();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      start();
    };

    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) onPointerLeave();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') onPointerLeave();
    };

    const onVisibility = () => {
      if (!document.hidden) start();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      visible = entry.isIntersecting;
      start();
    });
    intersectionObserver.observe(container);

    wakeRef.current = start;
    resize();

    return () => {
      alive = false;
      visible = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      wakeRef.current = null;
      disposeDust();
      disposeTarget(sceneTarget);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return <div ref={containerRef} className={`crystalized-ball ${className}`.trim()} style={style} />;
};

export default CrystalizedBall;
