import { clamp, type Vec } from "@/lib/network/geometry";

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  /** Primary Great Attractor nucleus of the Laniakea supercluster. */
  core: Vec;
  /** Secondary luminous spine junction ("the Laniakea bridge"). */
  spineJunction: Vec;
  /** Radius scale of the supercluster basin. */
  radius: number;
  /** Coordinates of each Node socket attractor at the heart of its galactic arm. */
  sockets: Vec[];
  /** Intermediate curve control anchors giving each arm its sweeping Laniakea curvature. */
  socketElbows: Vec[];
  /** Outward fan angles for each arm's feathery watershed tributaries. */
  socketAngles: number[];
  /** Overall field scale used for basin envelopes and ambient streams. */
  scale: number;
};

/** Below this width the supercluster draws tighter so mobile/tablet stays balanced. */
export const WIDE_MIN_WIDTH = 1100;

/**
 * Laniakea Supercluster topology shared by the canvas renderer and the
 * interactive DOM node markers so both agree on exact coordinates.
 *
 * Socket indices:
 *   0 — Free Socket 1 (Right Main Spine Ridge)
 *   1 — Free Socket 2 (Left Main Watershed)
 *   2 — Pro Socket 1  (Upper-Left Arching Plume)
 *   3 — Pro Socket 2  (Upper-Right Arching Plume)
 *   4 — Pro Socket 3  (Lower-Right Outer Horizon Wing)
 */
export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;

  const core: Vec = compact
    ? { x: width * 0.5, y: height * 0.33 }
    : { x: width * 0.5, y: clamp(height * 0.36, 210, height * 0.41) };

  const spineJunction: Vec = {
    x: width * 0.5,
    y: core.y - height * 0.02,
  };

  const radius = compact
    ? Math.min(width * 0.38, height * 0.34)
    : clamp(Math.min(width * 0.34, height * 0.42), 220, 620);

  // Relative vectors (in units of `radius`) balanced symmetrically around the center core,
  // leaving the bottom-center dialogue stage open and legible.
  const armSpecs: Array<{
    at: Vec;
    elbow: Vec;
    fanAngle: number;
  }> = compact
    ? [
        // 0: Right Main Ridge
        { at: { x: 0.58, y: -0.04 }, elbow: { x: 0.3, y: -0.08 }, fanAngle: 0.06 },
        // 1: Left Main Watershed
        { at: { x: -0.58, y: -0.04 }, elbow: { x: -0.3, y: 0.08 }, fanAngle: Math.PI - 0.06 },
        // 2: Upper-Left Arching Plume
        { at: { x: -0.44, y: -0.46 }, elbow: { x: -0.17, y: -0.3 }, fanAngle: -2.35 },
        // 3: Upper-Right Arching Plume
        { at: { x: 0.44, y: -0.46 }, elbow: { x: 0.17, y: -0.3 }, fanAngle: -0.78 },
        // 4: Lower-Right Outer Horizon Wing
        { at: { x: 0.66, y: 0.34 }, elbow: { x: 0.35, y: 0.2 }, fanAngle: 0.48 },
      ]
    : [
        // 0: Right Main Ridge
        { at: { x: 0.62, y: -0.04 }, elbow: { x: 0.32, y: -0.08 }, fanAngle: 0.06 },
        // 1: Left Main Watershed
        { at: { x: -0.62, y: -0.04 }, elbow: { x: -0.32, y: 0.08 }, fanAngle: Math.PI - 0.06 },
        // 2: Upper-Left Arching Plume
        { at: { x: -0.46, y: -0.48 }, elbow: { x: -0.18, y: -0.32 }, fanAngle: -2.35 },
        // 3: Upper-Right Arching Plume
        { at: { x: 0.46, y: -0.48 }, elbow: { x: 0.18, y: -0.32 }, fanAngle: -0.78 },
        // 4: Lower-Right Outer Horizon Wing
        { at: { x: 0.72, y: 0.36 }, elbow: { x: 0.38, y: 0.22 }, fanAngle: 0.48 },
      ];

  const sockets: Vec[] = [];
  const socketElbows: Vec[] = [];
  const socketAngles: number[] = [];

  for (let i = 0; i < socketCount; i++) {
    const spec = armSpecs[i % armSpecs.length]!;
    sockets.push({
      x: compact
        ? clamp(core.x + spec.at.x * radius, 72, width - 72)
        : clamp(core.x + spec.at.x * radius, 108, width - 108),
      y: compact
        ? clamp(core.y + spec.at.y * radius, 72, height * 0.56)
        : clamp(core.y + spec.at.y * radius, 78, height - 220),
    });
    socketElbows.push({
      x: core.x + spec.elbow.x * radius,
      y: core.y + spec.elbow.y * radius,
    });
    socketAngles.push(spec.fanAngle);
  }

  return {
    width,
    height,
    compact,
    core,
    spineJunction,
    radius,
    sockets,
    socketElbows,
    socketAngles,
    scale: Math.hypot(width, height) * 0.62,
  };
}
