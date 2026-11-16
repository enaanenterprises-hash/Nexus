import { add, clamp, polar, type Vec } from "@/lib/network/geometry";

export type ArmGeometry = {
  /** Index of the arm (0..4). */
  index: number;
  /** Departure angle from the singularity core (radians). */
  coreAngle: number;
  /** Asymptotic outward angle toward the viewport corner/edge (radians). */
  cornerAngle: number;
  /** Curvature inflection control point between core and socket. */
  innerControl: Vec;
  /** Exact coordinate of the node's focal caustic waist (socket). */
  socket: Vec;
  /** Outward tangent unit vector at the socket waist. */
  socketTangent: Vec;
  /** Outer curvature control point between socket and viewport corner. */
  outerControl1: Vec;
  /** Second outer curvature control point approaching the viewport corner. */
  outerControl2: Vec;
  /** Terminal anchor well past the viewport corner/edge so arms never cut off. */
  cornerTip: Vec;
  /** Total reach distance from core to cornerTip. */
  totalReach: number;
};

export type HorizonWingGeometry = {
  /** -1 for left corner wing, +1 for right corner wing. */
  side: -1 | 1;
  /** Sweeping control points from core out to the lower-lateral corner. */
  c1: Vec;
  c2: Vec;
  tip: Vec;
  angle: number;
  reach: number;
};

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  /** Primary Singularity Nucleus of the neural network, centered in the middle of the screen. */
  core: Vec;
  /** Characteristic radius from core to the 5 node socket waists. */
  radius: number;
  /** Coordinates of each node socket waist (0..4). */
  sockets: Vec[];
  /** Angles of each node socket waist (0..4). */
  socketAngles: number[];
  /** Complete C2-continuous spine geometry for each of the 5 node arms. */
  arms: ArmGeometry[];
  /** Sweeping lower-lateral horizon wings that extend into the lower corners while keeping center-bottom negative space clear. */
  horizonWings: [HorizonWingGeometry, HorizonWingGeometry];
  /** Overall diagonal scale of the viewport. */
  scale: number;
};

export const WIDE_MIN_WIDTH = 1100;

export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;
  const diag = Math.hypot(width, height);

  // Lower the central singularity core so the entire network and outer nodes sit in the middle of the screen
  const core: Vec = compact
    ? { x: width * 0.5, y: height * 0.5 }
    : { x: width * 0.5, y: clamp(height * 0.52, 340, height - 245) };

  const radius = compact
    ? clamp(Math.min(width * 0.34, height * 0.28), 125, 215)
    : clamp(Math.min(height * 0.26, width * 0.21), 165, 265);

  // 5 functional node arms fanning across the middle and upper-corner quadrants (-158 deg to -22 deg),
  // sweeping all the way past the corners and edges of the screen.
  const spread = compact ? 0.82 : 0.78;
  const socketAngles: number[] = [];
  const sockets: Vec[] = [];
  const arms: ArmGeometry[] = [];

  for (let i = 0; i < socketCount; i++) {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    const centered = (t - 0.5) * 2; // -1 .. +1
    const baseAngle = -Math.PI / 2 + centered * (Math.PI * 0.5 * spread);

    // Subtle S-curve inflection so outer arms sweep gracefully toward the screen corners
    const cornerDeflection = centered * 0.16;
    const coreAngle = baseAngle - cornerDeflection * 0.35;
    const cornerAngle = baseAngle + cornerDeflection;

    // Lateral arms have a wider horizontal span to fill the middle of the screen
    const socketDist = radius * (1 + 0.18 * Math.abs(centered));
    const socket = add(core, polar(socketDist, baseAngle));

    const tangentAngle = baseAngle + cornerDeflection * 0.55;
    const socketTangent = {
      x: Math.cos(tangentAngle),
      y: Math.sin(tangentAngle),
    };

    // Extend far past the viewport corner/edge (0.68 * diagonal) so arms never terminate on screen
    const outerReach = Math.max(diag * 0.68, socketDist * 2.85);
    const cornerTip = add(socket, polar(outerReach, cornerAngle));

    const innerControl = add(core, polar(socketDist * 0.52, coreAngle));
    const outerControl1 = add(socket, polar(outerReach * 0.28, tangentAngle));
    const outerControl2 = add(socket, polar(outerReach * 0.66, (tangentAngle + cornerAngle) * 0.5));

    socketAngles.push(baseAngle);
    sockets.push(socket);
    arms.push({
      index: i,
      coreAngle,
      cornerAngle,
      innerControl,
      socket,
      socketTangent,
      outerControl1,
      outerControl2,
      cornerTip,
      totalReach: socketDist + outerReach,
    });
  }

  // Two lower-lateral horizon wings that sweep into the bottom-left and bottom-right corners
  // while leaving the central-bottom negative space completely dark and open.
  const wingReach = diag * 0.66;
  const leftWingAngle = Math.PI - 0.28;
  const rightWingAngle = 0.28;

  const horizonWings: [HorizonWingGeometry, HorizonWingGeometry] = [
    {
      side: -1,
      angle: leftWingAngle,
      reach: wingReach,
      c1: add(core, polar(wingReach * 0.26, leftWingAngle + 0.08)),
      c2: add(core, polar(wingReach * 0.62, leftWingAngle - 0.04)),
      tip: add(core, polar(wingReach, leftWingAngle)),
    },
    {
      side: 1,
      angle: rightWingAngle,
      reach: wingReach,
      c1: add(core, polar(wingReach * 0.26, rightWingAngle - 0.08)),
      c2: add(core, polar(wingReach * 0.62, rightWingAngle + 0.04)),
      tip: add(core, polar(wingReach, rightWingAngle)),
    },
  ];

  return {
    width,
    height,
    compact,
    core,
    radius,
    sockets,
    socketAngles,
    arms,
    horizonWings,
    scale: diag * 0.68,
  };
}
