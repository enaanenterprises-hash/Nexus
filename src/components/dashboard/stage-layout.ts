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

/** Computes the canonical singularity core coordinate shared by Setup and Dashboard stages. */
export function computeCoreCenter(width: number, height: number): Vec {
  const compact = width < WIDE_MIN_WIDTH;
  const bottomClearance = compact
    ? clamp(height * 0.38, 280, 355)
    : clamp(height * 0.40, 305, 415);
  return {
    x: width * 0.5,
    y: clamp(height - bottomClearance, compact ? 275 : 320, height - 280),
  };
}

export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;
  const diag = Math.hypot(width, height);

  // Position the singularity core in the lower-mid stage (~58%-62% down), leaving comfortable room below for the greeting, responses, and follow-up chips
  const core = computeCoreCenter(width, height);

  // Vast, commanding radius so the 5 node waists fill the stage without wasted space
  const radius = compact
    ? clamp(Math.min(width * 0.38, height * 0.32), 145, 260)
    : clamp(Math.min(width * 0.28, height * 0.34), 210, 370);

  // Wide 166-degree arch (-173 deg to -7 deg) so the 5 arms span the full width and height of the viewport
  const spread = compact ? 0.92 : 0.9;
  const socketAngles: number[] = [];
  const sockets: Vec[] = [];
  const arms: ArmGeometry[] = [];

  for (let i = 0; i < socketCount; i++) {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    const centered = (t - 0.5) * 2; // -1 .. +1
    const baseAngle = -Math.PI / 2 + centered * (Math.PI * 0.5 * spread);

    // Sweeping S-curve inflection guiding each arm into the viewport corners
    const cornerDeflection = centered * 0.18;
    const coreAngle = baseAngle - cornerDeflection * 0.32;
    const cornerAngle = baseAngle + cornerDeflection * 0.85;

    // Wide elliptical horizontal reach so lateral nodes command the left and right wings
    const socketDist = radius * (1 + 0.26 * Math.abs(centered));
    const socket = add(core, polar(socketDist, baseAngle));

    const tangentAngle = baseAngle + cornerDeflection * 0.48;
    const socketTangent = {
      x: Math.cos(tangentAngle),
      y: Math.sin(tangentAngle),
    };

    // Extend well beyond the viewport corners so the vast plumes sweep off-screen seamlessly
    const outerReach = Math.max(diag * 0.84, socketDist * 3.3);
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

  // Two vast lower-lateral horizon wings sweeping into the bottom-left and bottom-right corners
  const wingReach = diag * 0.72;
  const leftWingAngle = Math.PI - 0.26;
  const rightWingAngle = 0.26;

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
    scale: diag * 0.74,
  };
}
