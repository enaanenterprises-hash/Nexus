import { add, clamp, polar, type Vec } from "@/lib/network/geometry";

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  /** Primary Singularity Core positioned in the lower-middle of the screen. */
  core: Vec;
  /** Secondary luminous spine junction just above the core. */
  spineJunction: Vec;
  /** Characteristic radius scale of the node focal arc. */
  radius: number;
  /** Coordinates of each Node focal pinch (0..4). */
  sockets: Vec[];
  /** Intermediate curve control anchors giving each arm its sweeping curvature. */
  socketElbows: Vec[];
  /** Outward fan angles for each arm's flowing filaments sweeping off the corners. */
  socketAngles: number[];
  /** Overall field scale used so flowing filaments reach well past all screen corners. */
  scale: number;
};

export const WIDE_MIN_WIDTH = 1100;

/**
 * Computes the layout so the central node sits lower down (around 55% of viewport height)
 * and the 5 outer nodes sit balanced across the middle of the screen while their
 * flowing filaments sweep all the way past the corners and edges of the viewport.
 */
export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;

  // Lower the central node so both the core and the 5 outer nodes sit in the middle of the screen
  const core: Vec = compact
    ? { x: width * 0.5, y: height * 0.53 }
    : { x: width * 0.5, y: clamp(height * 0.55, 360, height - 250) };

  const spineJunction: Vec = {
    x: width * 0.5,
    y: core.y - height * 0.02,
  };

  const radius = compact
    ? clamp(Math.min(width * 0.34, height * 0.28), 130, 220)
    : clamp(Math.min(width * 0.26, height * 0.32), 180, 310);

  // 5 balanced node arms distributed around the middle of the screen:
  // Arm 0 & Arm 4 sweep laterally across the middle-left and middle-right into the side/lower corners;
  // Arm 1 & Arm 3 sweep diagonally into the upper-left and upper-right corners;
  // Arm 2 rises into the upper-center crown.
  const armSpecs: Array<{
    at: Vec;
    elbow: Vec;
    fanAngle: number;
  }> = compact
    ? [
        // 0: Mid-Left Horizon Wing (nearly level with core, sweeping to left/lower-left corner)
        { at: { x: -0.78, y: -0.06 }, elbow: { x: -0.38, y: 0.04 }, fanAngle: Math.PI - 0.08 },
        // 1: Upper-Left Corner Sweeping Arm
        { at: { x: -0.56, y: -0.48 }, elbow: { x: -0.24, y: -0.28 }, fanAngle: -2.42 },
        // 2: Central Crown Arm (sits near vertical middle of screen, fans out top)
        { at: { x: 0.0, y: -0.64 }, elbow: { x: 0.0, y: -0.32 }, fanAngle: -Math.PI / 2 },
        // 3: Upper-Right Corner Sweeping Arm
        { at: { x: 0.56, y: -0.48 }, elbow: { x: 0.24, y: -0.28 }, fanAngle: -0.72 },
        // 4: Mid-Right Horizon Wing (nearly level with core, sweeping to right/lower-right corner)
        { at: { x: 0.78, y: -0.06 }, elbow: { x: 0.38, y: 0.04 }, fanAngle: 0.08 },
      ]
    : [
        // 0: Mid-Left Horizon Wing
        { at: { x: -0.86, y: -0.05 }, elbow: { x: -0.42, y: 0.05 }, fanAngle: Math.PI - 0.06 },
        // 1: Upper-Left Corner Sweeping Arm
        { at: { x: -0.62, y: -0.5 }, elbow: { x: -0.26, y: -0.3 }, fanAngle: -2.44 },
        // 2: Central Crown Arm
        { at: { x: 0.0, y: -0.66 }, elbow: { x: 0.0, y: -0.34 }, fanAngle: -Math.PI / 2 },
        // 3: Upper-Right Corner Sweeping Arm
        { at: { x: 0.62, y: -0.5 }, elbow: { x: 0.26, y: -0.3 }, fanAngle: -0.7 },
        // 4: Mid-Right Horizon Wing
        { at: { x: 0.86, y: -0.05 }, elbow: { x: 0.42, y: 0.05 }, fanAngle: 0.06 },
      ];

  const sockets: Vec[] = [];
  const socketElbows: Vec[] = [];
  const socketAngles: number[] = [];

  for (let i = 0; i < socketCount; i++) {
    const spec = armSpecs[i % armSpecs.length]!;
    sockets.push(
      add(core, {
        x: spec.at.x * radius,
        y: spec.at.y * radius,
      }),
    );
    socketElbows.push(
      add(core, {
        x: spec.elbow.x * radius,
        y: spec.elbow.y * radius,
      }),
    );
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
    scale: Math.hypot(width, height) * 0.66,
  };
}
