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
 * interactive DOM node-pin overlay so both agree on exact coordinates.
 *
 * Socket indices:
 *   0 — Free Socket 1 (Upper-Right Main Spine Attractor — "You Are Here" ridge)
 *   1 — Free Socket 2 (Lower-Center Golden Basin Stream)
 *   2 — Pro Socket 1  (Upper-Left Arching Watershed Feather)
 *   3 — Pro Socket 2  (Far-Right Outer Filament Wing)
 *   4 — Pro Socket 3  (Lower-Left Deep Cosmic Tributary)
 */
export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;

  const core: Vec = compact
    ? { x: width * 0.42, y: height * 0.36 }
    : { x: width * 0.39, y: clamp(height * 0.37, 240, height * 0.44) };

  const spineJunction: Vec = compact
    ? { x: width * 0.62, y: height * 0.39 }
    : { x: width * 0.58, y: core.y + height * 0.035 };

  const radius = compact
    ? Math.min(width * 0.36, height * 0.34)
    : clamp(Math.min(width * 0.28, height * 0.36), 190, 360);

  // Relative vectors (in units of `radius`) for up to 5 Laniakea arm attractors
  const armSpecs: Array<{
    at: Vec;
    elbow: Vec;
    fanAngle: number;
  }> = compact
    ? [
        // 0: Main bright right ridge ("You Are Here" locus in Laniakea reference)
        { at: { x: 0.72, y: 0.12 }, elbow: { x: 0.42, y: 0.02 }, fanAngle: 0.18 },
        // 1: Lower golden basin sweep
        { at: { x: 0.14, y: 0.68 }, elbow: { x: 0.02, y: 0.36 }, fanAngle: 1.42 },
        // 2: Upper-left arching plume
        { at: { x: -0.58, y: -0.44 }, elbow: { x: -0.22, y: -0.34 }, fanAngle: -2.35 },
        // 3: Upper-right outer wing
        { at: { x: 0.76, y: -0.46 }, elbow: { x: 0.38, y: -0.24 }, fanAngle: -0.55 },
        // 4: Lower-left cosmic tributary
        { at: { x: -0.66, y: 0.38 }, elbow: { x: -0.34, y: 0.18 }, fanAngle: 2.55 },
      ]
    : [
        // 0: Main blazing Laniakea right ridge ("You Are Here" locus)
        { at: { x: 0.88, y: 0.14 }, elbow: { x: 0.48, y: 0.02 }, fanAngle: 0.16 },
        // 1: Sweeping lower-center golden basin arm
        { at: { x: 0.12, y: 0.72 }, elbow: { x: -0.02, y: 0.38 }, fanAngle: 1.45 },
        // 2: Upper-left arching watershed arm
        { at: { x: -0.68, y: -0.48 }, elbow: { x: -0.24, y: -0.38 }, fanAngle: -2.42 },
        // 3: Upper-right feather plume
        { at: { x: 0.96, y: -0.48 }, elbow: { x: 0.46, y: -0.22 }, fanAngle: -0.52 },
        // 4: Lower-left deep cosmic arm
        { at: { x: -0.78, y: 0.42 }, elbow: { x: -0.4, y: 0.18 }, fanAngle: 2.58 },
      ];

  const sockets: Vec[] = [];
  const socketElbows: Vec[] = [];
  const socketAngles: number[] = [];

  for (let i = 0; i < socketCount; i++) {
    const spec = armSpecs[i % armSpecs.length]!;
    sockets.push({
      x: clamp(core.x + spec.at.x * radius, 88, width - 88),
      y: clamp(core.y + spec.at.y * radius, 76, height - 180),
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
    scale: compact ? Math.max(width * 0.9, height * 0.72) : Math.max(width * 0.56, height * 0.88),
  };
}
