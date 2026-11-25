import type {
  OpticsCurvePoint,
  OpticsHslBand,
  OpticsHslChannel,
  OpticsToolId,
  OpticsToolMeta,
  OpticsToolParamMap,
} from "./types";

export const DEFAULT_CURVE_POINTS: OpticsCurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export const CURVE_PRESETS: Record<
  string,
  {
    label: string;
    rgb: OpticsCurvePoint[];
    red?: OpticsCurvePoint[];
    green?: OpticsCurvePoint[];
    blue?: OpticsCurvePoint[];
  }
> = {
  neutral: { label: "Linear", rgb: DEFAULT_CURVE_POINTS },
  "soft-contrast": {
    label: "Soft Contrast",
    rgb: [
      { x: 0, y: 0 },
      { x: 0.24, y: 0.2 },
      { x: 0.74, y: 0.8 },
      { x: 1, y: 1 },
    ],
  },
  "hard-contrast": {
    label: "Hard Contrast",
    rgb: [
      { x: 0, y: 0 },
      { x: 0.24, y: 0.14 },
      { x: 0.76, y: 0.86 },
      { x: 1, y: 1 },
    ],
  },
  "faded-matte": {
    label: "Faded Matte",
    rgb: [
      { x: 0, y: 0.08 },
      { x: 0.25, y: 0.24 },
      { x: 0.76, y: 0.78 },
      { x: 1, y: 0.94 },
    ],
  },
  golden: {
    label: "Golden Hour",
    rgb: [
      { x: 0, y: 0.02 },
      { x: 0.3, y: 0.28 },
      { x: 0.75, y: 0.8 },
      { x: 1, y: 0.98 },
    ],
    red: [
      { x: 0, y: 0.02 },
      { x: 0.55, y: 0.6 },
      { x: 1, y: 1 },
    ],
    blue: [
      { x: 0, y: 0.04 },
      { x: 0.55, y: 0.49 },
      { x: 1, y: 0.9 },
    ],
  },
  teal: {
    label: "Silver Teal",
    rgb: [
      { x: 0, y: 0.04 },
      { x: 0.75, y: 0.82 },
      { x: 1, y: 0.97 },
    ],
    red: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.41 },
      { x: 1, y: 0.96 },
    ],
    blue: [
      { x: 0, y: 0.06 },
      { x: 0.45, y: 0.48 },
      { x: 1, y: 0.98 },
    ],
  },
  brighten: {
    label: "Brighten",
    rgb: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.56 },
      { x: 1, y: 1 },
    ],
  },
  darken: {
    label: "Darken",
    rgb: [
      { x: 0, y: 0 },
      { x: 0.54, y: 0.43 },
      { x: 1, y: 1 },
    ],
  },
};

const EMPTY_HSL_BAND = (): OpticsHslBand => ({ hue: 0, saturation: 0, luminance: 0 });

export const HSL_CHANNEL_META: ReadonlyArray<{
  id: OpticsHslChannel;
  label: string;
  centerHue: number;
  swatch: string;
}> = [
  { id: "red", label: "Red", centerHue: 0, swatch: "#d84a48" },
  { id: "orange", label: "Orange", centerHue: 30, swatch: "#e08438" },
  { id: "yellow", label: "Yellow", centerHue: 58, swatch: "#e0be42" },
  { id: "green", label: "Green", centerHue: 120, swatch: "#4ca468" },
  { id: "aqua", label: "Aqua", centerHue: 175, swatch: "#44a8a4" },
  { id: "blue", label: "Blue", centerHue: 215, swatch: "#4886d6" },
  { id: "cobalt", label: "Cobalt", centerHue: 252, swatch: "#5a6cd8" },
  { id: "magenta", label: "Magenta", centerHue: 312, swatch: "#c25a9c" },
];

export const OPTICS_TOOLS_META: ReadonlyArray<OpticsToolMeta> = [
  {
    id: "tune",
    name: "Tune Image",
    category: "tonal",
    blurb: "Exposure, contrast, saturation, ambiance, highlights, shadows, and warmth.",
    parameters: [
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "contrast", label: "Contrast", min: -100, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
      { key: "ambiance", label: "Ambiance", min: -100, max: 100 },
      { key: "highlights", label: "Highlights", min: -100, max: 100 },
      { key: "shadows", label: "Shadows", min: -100, max: 100 },
      { key: "warmth", label: "Warmth", min: -100, max: 100 },
    ],
  },
  {
    id: "details",
    name: "Details",
    category: "tonal",
    blurb: "Tactile micro-contrast structure and precision edge sharpening.",
    parameters: [
      { key: "structure", label: "Structure", min: -100, max: 100 },
      { key: "sharpening", label: "Sharpening", min: 0, max: 100 },
    ],
  },
  {
    id: "curves",
    name: "Curves",
    category: "tonal",
    blurb: "Monotonic RGB and per-channel tonal spline editor with live histogram.",
    parameters: [],
  },
  {
    id: "white-balance",
    name: "White Balance",
    category: "tonal",
    blurb: "Calibrate Kelvin warmth, tint, or sample a neutral point directly on canvas.",
    parameters: [
      { key: "temperature", label: "Temperature", min: -100, max: 100 },
      { key: "tint", label: "Tint", min: -100, max: 100 },
    ],
  },
  {
    id: "hsl",
    name: "Color Mixer",
    category: "tonal",
    blurb: "8-channel HSL spectrum calibration plus shadow/midtone/highlight split toning.",
    parameters: [
      { key: "balance", label: "Tone Balance", min: -100, max: 100 },
    ],
  },
  {
    id: "crop",
    name: "Crop & Rotate",
    category: "geometry",
    blurb: "Precision aspect ratios, rule-of-thirds guides, straighten tilt, and mirror flip.",
    parameters: [
      { key: "straightenDeg", label: "Straighten", min: -45, max: 45, step: 0.5, unit: "°" },
    ],
  },
  {
    id: "perspective",
    name: "Perspective",
    category: "geometry",
    blurb: "Optical keystone tilt correction with seamless edge synthesis.",
    parameters: [
      { key: "vertical", label: "Vertical Tilt", min: -100, max: 100 },
      { key: "horizontal", label: "Horizontal Tilt", min: -100, max: 100 },
      { key: "rotate", label: "Rotate", min: -45, max: 45, step: 0.5, unit: "°" },
      { key: "scale", label: "Scale", min: -50, max: 50 },
    ],
  },
  {
    id: "expand",
    name: "Expand",
    category: "geometry",
    blurb: "Extend frame margins with smart edge synthesis, blur, or gallery matte.",
    parameters: [
      { key: "top", label: "Top Edge", min: 0, max: 50, unit: "%" },
      { key: "right", label: "Right Edge", min: 0, max: 50, unit: "%" },
      { key: "bottom", label: "Bottom Edge", min: 0, max: 50, unit: "%" },
      { key: "left", label: "Left Edge", min: 0, max: 50, unit: "%" },
    ],
  },
  {
    id: "selective",
    name: "Selective",
    category: "local",
    blurb: "U-Point bilateral control pins matching color and luminance naturally.",
    parameters: [
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "contrast", label: "Contrast", min: -100, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
      { key: "structure", label: "Structure", min: -100, max: 100 },
    ],
  },
  {
    id: "brush",
    name: "Brush",
    category: "local",
    blurb: "Paint local dodge & burn, exposure, warmth, or saturation straight onto the plate.",
    parameters: [
      { key: "brushSize", label: "Brush Size", min: 10, max: 100 },
    ],
  },
  {
    id: "healing",
    name: "Healing",
    category: "local",
    blurb: "Seamless patch-matched removal of dust specks, cables, and distractions.",
    parameters: [
      { key: "brushSize", label: "Brush Size", min: 8, max: 80 },
    ],
  },
  {
    id: "lens-blur",
    name: "Lens Blur",
    category: "effects",
    blurb: "Elliptical & tilt-shift optical defocus with specular bokeh bloom.",
    parameters: [
      { key: "blurStrength", label: "Blur Strength", min: 0, max: 100 },
      { key: "transition", label: "Transition", min: 0, max: 100 },
      { key: "vignetteStrength", label: "Vignette", min: 0, max: 100 },
      { key: "bokehHighlight", label: "Bokeh Bloom", min: 0, max: 100 },
    ],
  },
  {
    id: "vignette",
    name: "Vignette",
    category: "effects",
    blurb: "Moveable spotlight falloff to draw focus inward.",
    parameters: [
      { key: "outerBrightness", label: "Outer Brightness", min: -100, max: 100 },
      { key: "innerBrightness", label: "Inner Brightness", min: -100, max: 100 },
      { key: "radius", label: "Radius", min: 10, max: 95 },
      { key: "roundness", label: "Roundness", min: 0, max: 100 },
    ],
  },
  {
    id: "double-exposure",
    name: "Double Exposure",
    category: "effects",
    blurb: "Blend a second photograph with optical add, screen, multiply, or soft-light modes.",
    parameters: [
      { key: "opacity", label: "Opacity", min: 0, max: 100 },
      { key: "scale", label: "Scale", min: 50, max: 220, unit: "%" },
      { key: "rotationDeg", label: "Rotation", min: -180, max: 180, unit: "°" },
    ],
  },
  {
    id: "text",
    name: "Text",
    category: "effects",
    blurb: "Editorial serif & studio technical captions with inverse luminance cutout mode.",
    parameters: [],
  },
  {
    id: "frames",
    name: "Frames",
    category: "effects",
    blurb: "Museum gallery mattes, 35mm film rebates, and subtle edge borders.",
    parameters: [
      { key: "width", label: "Border Width", min: 0, max: 100 },
      { key: "innerMargin", label: "Inner Matte", min: 0, max: 100 },
    ],
  },
  {
    id: "hdr-scape",
    name: "HDR Scape",
    category: "creative",
    blurb: "Dual-scale local tone mapping with controlled highlight & shadow latitude.",
    parameters: [
      { key: "filterStrength", label: "Filter Strength", min: 0, max: 100 },
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
      { key: "smoothing", label: "Smoothing", min: 0, max: 100 },
    ],
  },
  {
    id: "glamour-glow",
    name: "Glamour Glow",
    category: "creative",
    blurb: "Soft optical halation across highlights with subtle warmth.",
    parameters: [
      { key: "glow", label: "Glow", min: 0, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
      { key: "warmth", label: "Warmth", min: -100, max: 100 },
    ],
  },
  {
    id: "tonal-contrast",
    name: "Tonal Contrast",
    category: "creative",
    blurb: "Independent high, mid, and shadow local contrast with highlight protection.",
    parameters: [
      { key: "highTones", label: "High Tones", min: 0, max: 100 },
      { key: "midTones", label: "Mid Tones", min: 0, max: 100 },
      { key: "lowTones", label: "Low Tones", min: 0, max: 100 },
      { key: "protectShadows", label: "Protect Shadows", min: 0, max: 100 },
      { key: "protectHighlights", label: "Protect Highlights", min: 0, max: 100 },
    ],
  },
  {
    id: "drama",
    name: "Drama",
    category: "creative",
    blurb: "Sculptural chiaroscuro atmospheric depth.",
    parameters: [
      { key: "filterStrength", label: "Filter Strength", min: 0, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
    ],
  },
  {
    id: "vintage",
    name: "Vintage",
    category: "creative",
    blurb: "Twelve darkroom split-tone paper emulsions with vignette falloff.",
    parameters: [
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
      { key: "styleStrength", label: "Style Strength", min: 0, max: 100 },
      { key: "vignetteStrength", label: "Vignette", min: 0, max: 100 },
    ],
  },
  {
    id: "grainy-film",
    name: "Grainy Film",
    category: "creative",
    blurb: "Authentic luminance-modulated silver halide film stocks.",
    parameters: [
      { key: "grain", label: "Grain", min: 0, max: 100 },
      { key: "styleStrength", label: "Style Strength", min: 0, max: 100 },
    ],
  },
  {
    id: "retrolux",
    name: "Retrolux",
    category: "creative",
    blurb: "Analog light leaks, subtle emulsion scratches, and retro color curves.",
    parameters: [
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "saturation", label: "Saturation", min: -100, max: 100 },
      { key: "contrast", label: "Contrast", min: -100, max: 100 },
      { key: "styleStrength", label: "Style Strength", min: 0, max: 100 },
      { key: "scratches", label: "Scratches", min: 0, max: 100 },
      { key: "lightLeaks", label: "Light Leaks", min: 0, max: 100 },
    ],
  },
  {
    id: "black-white",
    name: "Black & White",
    category: "creative",
    blurb: "Glass optical color filters (Red/Orange/Yellow/Green/Blue) for monochrome zone control.",
    parameters: [
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "contrast", label: "Contrast", min: -100, max: 100 },
      { key: "grain", label: "Grain", min: 0, max: 100 },
    ],
  },
  {
    id: "noir",
    name: "Noir",
    category: "creative",
    blurb: "Deep silver-gelatin cinema monochrome with shadow matte wash.",
    parameters: [
      { key: "brightness", label: "Brightness", min: -100, max: 100 },
      { key: "wash", label: "Wash", min: 0, max: 100 },
      { key: "grain", label: "Grain", min: 0, max: 100 },
      { key: "filterStrength", label: "Filter Strength", min: 0, max: 100 },
    ],
  },
  {
    id: "portrait",
    name: "Portrait",
    category: "creative",
    blurb: "Skin-tone luminance smoothing, face spotlight, and iris clarity.",
    parameters: [
      { key: "faceSpotlight", label: "Face Spotlight", min: -100, max: 100 },
      { key: "skinSmoothing", label: "Skin Smoothing", min: 0, max: 100 },
      { key: "eyeClarity", label: "Eye Clarity", min: 0, max: 100 },
    ],
  },
];

export function getToolMeta(toolId: OpticsToolId): OpticsToolMeta {
  return OPTICS_TOOLS_META.find((t) => t.id === toolId) ?? OPTICS_TOOLS_META[0]!;
}

export function createDefaultToolParams<K extends OpticsToolId>(toolId: K): OpticsToolParamMap[K] {
  const map: { [T in OpticsToolId]: OpticsToolParamMap[T] } = {
    tune: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      ambiance: 0,
      highlights: 0,
      shadows: 0,
      warmth: 0,
    },
    details: { structure: 18, sharpening: 22 },
    curves: {
      preset: "neutral",
      activeChannel: "rgb",
      rgb: [...DEFAULT_CURVE_POINTS],
      red: [...DEFAULT_CURVE_POINTS],
      green: [...DEFAULT_CURVE_POINTS],
      blue: [...DEFAULT_CURVE_POINTS],
      luma: [...DEFAULT_CURVE_POINTS],
    },
    "white-balance": { temperature: 0, tint: 0, sampledRgb: null },
    hsl: {
      activeBand: "red",
      bands: {
        red: EMPTY_HSL_BAND(),
        orange: EMPTY_HSL_BAND(),
        yellow: EMPTY_HSL_BAND(),
        green: EMPTY_HSL_BAND(),
        aqua: EMPTY_HSL_BAND(),
        blue: EMPTY_HSL_BAND(),
        cobalt: EMPTY_HSL_BAND(),
        magenta: EMPTY_HSL_BAND(),
      },
      shadows: { hue: 215, saturation: 0 },
      midtones: { hue: 38, saturation: 0 },
      highlights: { hue: 40, saturation: 0 },
      balance: 0,
    },
    crop: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      aspect: "free",
      straightenDeg: 0,
      rotate90: 0,
      flipX: false,
      flipY: false,
    },
    perspective: {
      vertical: 0,
      horizontal: 0,
      rotate: 0,
      scale: 0,
      fillMode: "smart",
    },
    expand: { top: 0, right: 0, bottom: 0, left: 0, fillMode: "smart" },
    selective: {
      points: [
        {
          id: "pt-1",
          x: 0.5,
          y: 0.48,
          reach: 0.28,
          brightness: 16,
          contrast: 8,
          saturation: 12,
          structure: 10,
        },
      ],
      selectedPointId: "pt-1",
      showMaskOverlay: false,
    },
    brush: {
      mode: "dodge-burn",
      strength: 5,
      brushSize: 36,
      showMaskOverlay: false,
      strokes: [],
    },
    healing: { brushSize: 28, strokes: [] },
    "lens-blur": {
      shape: "elliptical",
      centerX: 0.5,
      centerY: 0.5,
      radius: 36,
      transition: 44,
      blurStrength: 42,
      vignetteStrength: 18,
      bokehHighlight: 32,
      angleDeg: 0,
    },
    vignette: {
      centerX: 0.5,
      centerY: 0.5,
      outerBrightness: -42,
      innerBrightness: 10,
      radius: 52,
      roundness: 60,
    },
    "double-exposure": {
      overlayAssetId: null,
      overlayName: null,
      blendMode: "screen",
      opacity: 58,
      scale: 100,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0,
    },
    text: {
      items: [
        {
          id: "txt-1",
          text: "First Light",
          styleId: "editorial-serif",
          x: 0.5,
          y: 0.84,
          size: 46,
          tracking: 0,
          opacity: 92,
          rotationDeg: 0,
          color: "#f5f4ef",
          invert: false,
          align: "center",
        },
      ],
      selectedItemId: "txt-1",
    },
    frames: {
      styleId: "gallery-matte",
      width: 18,
      innerMargin: 24,
      roundness: 0,
    },
    "hdr-scape": {
      preset: "nature",
      filterStrength: 46,
      brightness: 0,
      saturation: 18,
      smoothing: 28,
    },
    "glamour-glow": {
      preset: 1,
      glow: 44,
      saturation: 12,
      warmth: 16,
    },
    "tonal-contrast": {
      highTones: 28,
      midTones: 34,
      lowTones: 22,
      protectShadows: 24,
      protectHighlights: 24,
    },
    drama: {
      preset: "drama",
      filterStrength: 55,
      saturation: -18,
    },
    vintage: {
      style: 3,
      brightness: 4,
      saturation: -12,
      styleStrength: 55,
      vignetteStrength: 34,
    },
    "grainy-film": {
      preset: "L03",
      grain: 26,
      styleStrength: 62,
    },
    retrolux: {
      style: 2,
      brightness: 4,
      saturation: -8,
      contrast: 12,
      styleStrength: 58,
      scratches: 16,
      lightLeaks: 34,
      seed: 17,
    },
    "black-white": {
      preset: "contrast",
      filterColor: "orange",
      brightness: 2,
      contrast: 24,
      grain: 14,
    },
    noir: {
      preset: "S02",
      brightness: -6,
      wash: 24,
      grain: 28,
      filterStrength: 74,
    },
    portrait: {
      preset: "spotlight",
      faceSpotlight: 24,
      skinSmoothing: 32,
      eyeClarity: 28,
      focusX: 0.5,
      focusY: 0.42,
    },
  };
  return structuredClone(map[toolId]);
}
