import { add, clamp, polar, type Vec } from "@/lib/network/geometry";

export type ArmGeometry = {
  /** Index of the arm (0..4). */
  index: number;
  /** Departure angle from the singularity core (radians). */
  coreAngle: number;
  /** Asymptotic outward angle toward the viewport periphery (radians). */
  cornerAngle: number;
  /** Curvature inflection control point between core and socket. */
  innerControl: Vec;
  /** Exact coordinate of the node's optical waist (socket). */
  socket: Vec;
  /** Outward tangent unit vector at the socket waist. */
  socketTangent: Vec;
  /** Outer curvature control point between socket and outer periphery. */
  outerControl1: Vec;
  /** Second outer curvature control point approaching outer fade. */
  outerControl2: Vec;
  /** Terminal anchor past the viewport periphery so ribbons fade softly with zero abrupt cut-off. */
  cornerTip: Vec;
  /** Total reach distance from core to cornerTip. */
  totalReach: number;
};

export type HorizonWingGeometry = {
  side: -1 | 1;
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
  /** Primary Singularity Nucleus centered in the lower-mid stage with generous room for the voice bar below. */
  core: Vec;
  /** Characteristic orbital radius from core to the 5 node socket waists. */
  radius: number;
  /** Coordinates of each node socket waist (0..4). */
  sockets: Vec[];
  /** Angles of each node socket waist (0..4). */
  socketAngles: number[];
  /** Complete C2-continuous spine geometry for each of the 5 node arms. */
  arms: ArmGeometry[];
  /** Sweeping lateral horizon wings framing the periphery while preserving clean negative space. */
  horizonWings: [HorizonWingGeometry, HorizonWingGeometry];
  /** Overall diagonal scale of the viewport. */
  scale: number;
};

export const WIDE_MIN_WIDTH = 1100;

/** Computes the canonical singularity core coordinate shared by Setup and Dashboard stages. */
export function computeCoreCenter(width: number, height: number): Vec {
  const compact = width < WIDE_MIN_WIDTH;
  const bottomClearance = compact
    ? clamp(height * 0.37, 275, 345)
    : clamp(height * 0.39, 300, 395);
  return {
    x: width * 0.5,
    y: clamp(height - bottomClearance, compact ? 270 : 315, height - 270),
  };
}

export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;
  const diag = Math.hypot(width, height);
  const core = computeCoreCenter(width, height);

  // Poised orbital radius keeping all 5 nodes comfortably inside safe Apple HIG margins
  const maxVertRadius = Math.max(150, core.y - 108);
  const maxHorizRadius = Math.max(150, width * 0.5 - (compact ? 64 : 138));
  const radius = compact
    ? clamp(Math.min(width * 0.36, maxVertRadius * 0.88), 140, 250)
    : clamp(Math.min(width * 0.27, maxVertRadius * 0.88, maxHorizRadius * 0.78), 205, 330);

  // Balanced 148-degree upper-hemisphere orbital arch (-164 deg to -16 deg) for crisp node legibility & natural S-flow
  const spread = compact ? 0.84 : 0.82;
  const socketAngles: number[] = [];
  const sockets: Vec[] = [];
  const arms: ArmGeometry[] = [];

  for (let i = 0; i < socketCount; i++) {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    const centered = (t - 0.5) * 2; // -1 .. +1
    const baseAngle = -Math.PI / 2 + centered * (Math.PI * 0.5 * spread);

    // Gentle S-curve inflection so ribbons bow organically out from the core and glide gracefully through each node
    const inflection = centered * 0.14;
    const coreAngle = baseAngle - inflection * 0.38;
    const cornerAngle = baseAngle + inflection * 0.62;

    // Subtle elliptical stretch so lateral nodes breathe gracefully across wide displays
    const socketDist = clamp(
      radius * (1 + (compact ? 0.14 : 0.24) * Math.abs(centered)),
      135,
      Math.hypot(maxHorizRadius, maxVertRadius),
    );
    const rawSocket = add(core, polar(socketDist, baseAngle));
    const socket: Vec = {
      x: clamp(rawSocket.x, compact ? 52 : 112, width - (compact ? 52 : 112)),
      y: clamp(rawSocket.y, 92, core.y - 36),
    };

    const actualAngle = Math.atan2(socket.y - core.y, socket.x - core.x);
    const actualDist = Math.hypot(socket.x - core.x, socket.y - core.y);
    const tangentAngle = actualAngle + inflection * 0.32;
    const socketTangent = {
      x: Math.cos(tangentAngle),
      y: Math.sin(tangentAngle),
    };

    const outerReach = Math.max(diag * 0.62, actualDist * 2.25);
    const cornerTip = add(socket, polar(outerReach, cornerAngle));

    const innerControl = add(core, polar(actualDist * 0.5, coreAngle));
    const outerControl1 = add(socket, polar(outerReach * 0.28, tangentAngle));
    const outerControl2 = add(socket, polar(outerReach * 0.64, (tangentAngle + cornerAngle) * 0.5));

    socketAngles.push(actualAngle);
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
      totalReach: actualDist + outerReach,
    });
  }

  // Twin serene lateral horizon currents sweeping gently outward into the flanks
  const wingReach = diag * 0.64;
  const leftWingAngle = Math.PI - 0.18;
  const rightWingAngle = 0.18;

  const horizonWings: [HorizonWingGeometry, HorizonWingGeometry] = [
    {
      side: -1,
      angle: leftWingAngle,
      reach: wingReach,
      c1: add(core, polar(wingReach * 0.28, leftWingAngle + 0.06)),
      c2: add(core, polar(wingReach * 0.64, leftWingAngle - 0.03)),
      tip: add(core, polar(wingReach, leftWingAngle)),
    },
    {
      side: 1,
      angle: rightWingAngle,
      reach: wingReach,
      c1: add(core, polar(wingReach * 0.28, rightWingAngle - 0.06)),
      c2: add(core, polar(wingReach * 0.64, rightWingAngle + 0.03)),
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
    scale: diag * 0.72,
  };
}
