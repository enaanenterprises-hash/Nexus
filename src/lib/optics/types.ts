import type { ContentEnvelope } from "@/lib/extensions/content";
import type { ExtensionId } from "@/lib/extensions/types";

/**
 * Typed data model for Nexus Optics (dev.nexus.optics) — non-destructive photo darkroom & tonal studio.
 * Every adjustment step is an immutable OpticsEditLayer inside `editStack` so users can reopen, reorder,
 * toggle, or selectively paint/mask any step at any time (Snapseed View Edits+ paradigm).
 */

export type OpticsCoreToolId =
  | "tune"
  | "details"
  | "curves"
  | "white-balance"
  | "hsl"
  | "crop"
  | "perspective"
  | "expand"
  | "selective"
  | "brush"
  | "healing"
  | "lens-blur"
  | "vignette"
  | "double-exposure"
  | "text"
  | "frames";

export type OpticsFilterToolId =
  | "hdr-scape"
  | "glamour-glow"
  | "tonal-contrast"
  | "drama"
  | "vintage"
  | "grainy-film"
  | "retrolux"
  | "black-white"
  | "noir"
  | "portrait";

export type OpticsToolId = OpticsCoreToolId | OpticsFilterToolId;

export type OpticsMatteMode = "auto" | "obsidian" | "grey" | "paper";

export type OpticsCompareMode = "off" | "hold" | "split";

export interface OpticsMaskStroke {
  id: string;
  /** Normalized image coordinates 0..1 */
  points: ReadonlyArray<{ x: number; y: number }>;
  /** Normalized radius relative to max(width, height) */
  radius: number;
  feather: number;
  /** Target painted mask strength 0..1 (e.g. 0 = erase, 0.25, 0.5, 0.75, 1 = full reveal) */
  strength: number;
}

export interface OpticsLayerMask {
  enabled: boolean;
  invert: boolean;
  /** Base alpha 0..1 before strokes (default 1 when unmasked, or 0 when painting from scratch) */
  baseAlpha: number;
  strokes: OpticsMaskStroke[];
}

export interface OpticsTuneParams {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  ambiance: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  warmth: number; // -100..100
}

export interface OpticsDetailsParams {
  structure: number; // -100..100
  sharpening: number; // 0..100
}

export interface OpticsCurvePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export type OpticsCurveChannelKey = "rgb" | "red" | "green" | "blue" | "luma";

export interface OpticsCurvesParams {
  preset: string;
  activeChannel: OpticsCurveChannelKey;
  rgb: OpticsCurvePoint[];
  red: OpticsCurvePoint[];
  green: OpticsCurvePoint[];
  blue: OpticsCurvePoint[];
  luma: OpticsCurvePoint[];
}

export interface OpticsWhiteBalanceParams {
  temperature: number; // -100..100
  tint: number; // -100..100
  sampledRgb?: { r: number; g: number; b: number } | null;
}

export type OpticsHslChannel =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "cobalt"
  | "magenta";

export interface OpticsHslBand {
  hue: number; // -100..100
  saturation: number; // -100..100
  luminance: number; // -100..100
}

export interface OpticsSplitToneTarget {
  hue: number; // 0..360
  saturation: number; // 0..100
}

export interface OpticsHslParams {
  activeBand: OpticsHslChannel;
  bands: Record<OpticsHslChannel, OpticsHslBand>;
  shadows: OpticsSplitToneTarget;
  midtones: OpticsSplitToneTarget;
  highlights: OpticsSplitToneTarget;
  balance: number; // -100..100
}

export type OpticsCropAspect = "free" | "original" | "1:1" | "4:5" | "16:9" | "9:16" | "3:2" | "4:3";

export interface OpticsCropParams {
  /** Normalized box 0..1 in current stage space */
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: OpticsCropAspect;
  straightenDeg: number; // -45..45
  rotate90: 0 | 1 | 2 | 3;
  flipX: boolean;
  flipY: boolean;
}

export type OpticsFillMode = "smart" | "blur" | "obsidian" | "paper";

export interface OpticsPerspectiveParams {
  vertical: number; // -100..100
  horizontal: number; // -100..100
  rotate: number; // -45..45
  scale: number; // -50..50
  fillMode: OpticsFillMode;
}

export interface OpticsExpandParams {
  top: number; // 0..50 (% of edge)
  right: number;
  bottom: number;
  left: number;
  fillMode: OpticsFillMode;
}

export interface OpticsControlPoint {
  id: string;
  /** Normalized 0..1 */
  x: number;
  y: number;
  /** Normalized radius 0.04..0.65 */
  reach: number;
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  structure: number; // -100..100
}

export interface OpticsSelectiveParams {
  points: OpticsControlPoint[];
  selectedPointId: string | null;
  showMaskOverlay: boolean;
}

export type OpticsBrushMode = "dodge-burn" | "exposure" | "temperature" | "saturation";

export interface OpticsBrushStroke {
  id: string;
  mode: OpticsBrushMode;
  /** -10, -5, 0 (eraser), 5, 10 */
  strength: number;
  radius: number; // normalized
  points: ReadonlyArray<{ x: number; y: number }>;
}

export interface OpticsBrushParams {
  mode: OpticsBrushMode;
  strength: -10 | -5 | 0 | 5 | 10;
  brushSize: number; // 10..100
  showMaskOverlay: boolean;
  strokes: OpticsBrushStroke[];
}

export interface OpticsHealStroke {
  id: string;
  radius: number; // normalized
  points: ReadonlyArray<{ x: number; y: number }>;
  seed: number;
}

export interface OpticsHealingParams {
  brushSize: number; // 8..80
  strokes: OpticsHealStroke[];
}

export type OpticsBlurShape = "elliptical" | "linear";

export interface OpticsLensBlurParams {
  shape: OpticsBlurShape;
  centerX: number; // 0..1
  centerY: number; // 0..1
  radius: number; // 5..95
  transition: number; // 0..100
  blurStrength: number; // 0..100
  vignetteStrength: number; // 0..100
  bokehHighlight: number; // 0..100
  angleDeg: number; // -180..180 for linear tilt-shift
}

export interface OpticsVignetteParams {
  centerX: number; // 0..1
  centerY: number; // 0..1
  outerBrightness: number; // -100..100
  innerBrightness: number; // -100..100
  radius: number; // 10..95
  roundness: number; // 0..100
}

export type OpticsBlendMode =
  | "default"
  | "add"
  | "subtract"
  | "lighten"
  | "darken"
  | "screen"
  | "multiply"
  | "overlay"
  | "soft-light";

export interface OpticsDoubleExposureParams {
  overlayAssetId: string | null;
  overlayName: string | null;
  blendMode: OpticsBlendMode;
  opacity: number; // 0..100
  scale: number; // 50..220
  offsetX: number; // -50..50
  offsetY: number; // -50..50
  rotationDeg: number; // -180..180
}

export type OpticsTextStyleId =
  | "editorial-serif"
  | "swiss-clean"
  | "technical-mono"
  | "gallery-stamp"
  | "horizon-bar"
  | "film-frame-caption"
  | "cutout-badge"
  | "double-hairline";

export interface OpticsTextItem {
  id: string;
  text: string;
  styleId: OpticsTextStyleId;
  x: number; // 0..1
  y: number; // 0..1
  size: number; // 12..140
  tracking: number; // -4..24
  opacity: number; // 0..100
  rotationDeg: number; // -180..180
  color: string;
  invert: boolean;
  align: "left" | "center" | "right";
}

export interface OpticsTextParams {
  items: OpticsTextItem[];
  selectedItemId: string | null;
}

export type OpticsFrameStyleId =
  | "none"
  | "gallery-matte"
  | "hairline-museum"
  | "film-35mm"
  | "instant-border"
  | "darkroom-edge"
  | "obsidian-frame"
  | "gold-rule"
  | "cinema-matte"
  | "contact-sheet";

export interface OpticsFramesParams {
  styleId: OpticsFrameStyleId;
  width: number; // 0..100
  innerMargin: number; // 0..100
  roundness: number; // 0..40
}

export interface OpticsHdrScapeParams {
  preset: "nature" | "people" | "fine" | "strong";
  filterStrength: number; // 0..100
  brightness: number; // -100..100
  saturation: number; // -100..100
  smoothing: number; // 0..100
}

export interface OpticsGlamourGlowParams {
  preset: 1 | 2 | 3 | 4 | 5;
  glow: number; // 0..100
  saturation: number; // -100..100
  warmth: number; // -100..100
}

export interface OpticsTonalContrastParams {
  highTones: number; // 0..100
  midTones: number; // 0..100
  lowTones: number; // 0..100
  protectShadows: number; // 0..100
  protectHighlights: number; // 0..100
}

export interface OpticsDramaParams {
  preset: "drama" | "bright" | "dark1" | "dark2";
  filterStrength: number; // 0..100
  saturation: number; // -100..100
}

export interface OpticsVintageParams {
  style: number; // 1..12
  brightness: number; // -100..100
  saturation: number; // -100..100
  styleStrength: number; // 0..100
  vignetteStrength: number; // 0..100
}

export interface OpticsGrainyFilmParams {
  preset: string; // e.g. "B01".."X02" (12 stocks)
  grain: number; // 0..100
  styleStrength: number; // 0..100
}

export interface OpticsRetroluxParams {
  style: number; // 1..10
  brightness: number; // -100..100
  saturation: number; // -100..100
  contrast: number; // -100..100
  styleStrength: number; // 0..100
  scratches: number; // 0..100
  lightLeaks: number; // 0..100
  seed: number;
}

export type OpticsBwFilterColor = "neutral" | "red" | "orange" | "yellow" | "green" | "blue";

export interface OpticsBlackWhiteParams {
  preset: "neutral" | "contrast" | "bright" | "dark" | "film" | "darken-sky";
  filterColor: OpticsBwFilterColor;
  brightness: number; // -100..100
  contrast: number; // -100..100
  grain: number; // 0..100
}

export interface OpticsNoirParams {
  preset: string; // S01..S06
  brightness: number; // -100..100
  wash: number; // 0..100
  grain: number; // 0..100
  filterStrength: number; // 0..100
}

export interface OpticsPortraitParams {
  preset: "spotlight" | "smooth-1" | "smooth-2" | "eye-clarity";
  faceSpotlight: number; // -100..100
  skinSmoothing: number; // 0..100
  eyeClarity: number; // 0..100
  focusX: number; // 0..1
  focusY: number; // 0..1
}

export interface OpticsToolParamMap {
  tune: OpticsTuneParams;
  details: OpticsDetailsParams;
  curves: OpticsCurvesParams;
  "white-balance": OpticsWhiteBalanceParams;
  hsl: OpticsHslParams;
  crop: OpticsCropParams;
  perspective: OpticsPerspectiveParams;
  expand: OpticsExpandParams;
  selective: OpticsSelectiveParams;
  brush: OpticsBrushParams;
  healing: OpticsHealingParams;
  "lens-blur": OpticsLensBlurParams;
  vignette: OpticsVignetteParams;
  "double-exposure": OpticsDoubleExposureParams;
  text: OpticsTextParams;
  frames: OpticsFramesParams;
  "hdr-scape": OpticsHdrScapeParams;
  "glamour-glow": OpticsGlamourGlowParams;
  "tonal-contrast": OpticsTonalContrastParams;
  drama: OpticsDramaParams;
  vintage: OpticsVintageParams;
  "grainy-film": OpticsGrainyFilmParams;
  retrolux: OpticsRetroluxParams;
  "black-white": OpticsBlackWhiteParams;
  noir: OpticsNoirParams;
  portrait: OpticsPortraitParams;
}

export type OpticsEditLayer<K extends OpticsToolId = OpticsToolId> = {
  id: string;
  toolId: K;
  label: string;
  enabled: boolean;
  /** Overall layer strength 0..100 */
  opacity: number;
  params: OpticsToolParamMap[K];
  mask: OpticsLayerMask | null;
  createdAt: string;
};

export interface OpticsSourceAsset {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
  source: "starter" | "upload" | "vault" | "capture";
  starterId?: "alpine-alpenglow" | "atelier-portrait" | "obsidian-pavilion";
  idbKey: string;
  vaultItemId?: string | null;
  cameraHint?: string | null;
}

export interface OpticsOverlayAsset {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  idbKey: string;
  thumbnailDataUrl: string | null;
}

export interface OpticsLookPreset {
  id: string;
  name: string;
  subtitle: string;
  custom?: boolean;
  layers: Array<{
    toolId: OpticsToolId;
    label: string;
    opacity?: number;
    params: OpticsToolParamMap[OpticsToolId];
  }>;
}

export interface OpticsCollection {
  id: string;
  name: string;
  description: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpticsProjectAnnotation {
  notes: string;
  extensionId: ExtensionId;
  updatedAt: string;
}

export interface OpticsProject {
  id: string;
  collectionId: string;
  title: string;
  description: string | null;
  width: number;
  height: number;
  source: OpticsSourceAsset;
  overlays: OpticsOverlayAsset[];
  editStack: OpticsEditLayer[];
  activeLookId: string | null;
  matteMode: OpticsMatteMode;
  thumbnailUrl: string | null;
  tags: string[];
  notes: OpticsProjectAnnotation | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpticsProjectSummary {
  id: string;
  collectionId: string;
  title: string;
  description: string | null;
  width: number;
  height: number;
  layerCount: number;
  activeLookId: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveOpticsProjectInput {
  id?: string;
  collectionId: string;
  title: string;
  description?: string | null;
  width: number;
  height: number;
  source: OpticsSourceAsset;
  overlays?: OpticsOverlayAsset[];
  editStack: OpticsEditLayer[];
  activeLookId?: string | null;
  matteMode?: OpticsMatteMode;
  thumbnailUrl?: string | null;
  tags?: string[];
}

export interface OpticsHistogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  maxChannel: number;
  meanLuma: number;
  shadowClipPct: number;
  highlightClipPct: number;
}

export type OpticsProjectContentV1 = ContentEnvelope<
  "optics.project",
  1,
  {
    description: string | null;
    width: number;
    height: number;
    layerCount: number;
    activeLookId: string | null;
    editStack: OpticsEditLayer[];
    tags: string[];
    notes: OpticsProjectAnnotation | null;
  }
>;

export type OpticsProjectListItemV1 = ContentEnvelope<
  "optics.project",
  1,
  {
    description: string | null;
    width: number;
    height: number;
    layerCount: number;
    activeLookId: string | null;
    tags: string[];
  }
>;

export interface OpticsProjectAnnotationV1 {
  notes: string;
}

export interface OpticsPhotoRoutedTransfer {
  projectId: string;
  vaultItemId: string;
  title: string;
  width: number;
  height: number;
  targetNodeId?: ExtensionId;
  createdAt: string;
}

export interface OpticsToolMeta {
  id: OpticsToolId;
  name: string;
  category: "tonal" | "geometry" | "local" | "effects" | "creative";
  blurb: string;
  parameters: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    unit?: string;
  }>;
}
