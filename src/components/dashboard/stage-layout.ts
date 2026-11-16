import { add, clamp, polar, type Vec } from "@/lib/network/geometry";

export type ArmGeometry = {
  /** Index of the arm (0..4). */
  index: number;
  /** Departure angle from the central singularity orb (radians). */
  coreAngle: number;
  /** Asymptotic outward angle toward the viewport corner/edge (radians). */
  cornerAngle: number;
  /** Exact coordinate of the node orb (socket). */
  socket: Vec;
  /** Outward unit tangent vector at the node orb. */
  socketTangent: Vec;
  /** Terminal anchor well past the viewport corner/edge so flowing waves extend to the corners. */
  cornerTip: Vec;
  /** Distance from core to the node orb. */
  socketDist: number;
  /** Distance from the node orb out to cornerTip. */
  outerReach: number;
};

export type HorizonWingGeometry = {
  side: -1 | 1;
  angle: number;
  reach: number;
  c1: Vec;
  c2: Vec;
  tip: Vec;
};

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  /** Central Singularity Orb sitting in the middle of the screen. */
  core: Vec;
  /** Characteristic radius from the central orb to the 5 node orbs. */
  radius: number;
  /** Coordinates of each node orb (0..4). */
  sockets: Vec[];
  /** Angles of each node orb (0..4). */
  socketAngles: number[];
  /** Complete C2 spine geometry for each of the 5 functional node arms. */
  arms: ArmGeometry[];
  /** Lower-lateral corner waves sweeping into the bottom-left and bottom-right corners. */
  horizonWings: [HorizonWingGeometry, HorizonWingGeometry];
  /** Overall diagonal scale of the viewport. */
  scale: number;
};

export const WIDE_MIN_WIDTH = 1100;

/**
 * Places the neural network right in the middle of the screen (core.y ≈ 49% height),
 * with 5 functional node arms radiating across the middle & upper-corner quadrants
 * and sweeping all the way into the corners of the screen.
 */
export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;
  const diag = Math.hypot(width, height);

  // Sit the singularity core right in the middle of the screen
  const core: Vec = compact
    ? { x: width * 0.5, y: height * 0.47 }
    : { x: width * 0.5, y: clamp(height * 0.485, 320, height * 0.52) };

  const radius = compact
    ? clamp(Math.min(width * 0.33, height * 0.28), 125, 215)
    : clamp(Math.min(height * 0.26, width * 0.21), 165, 265);

  // Wide, balanced arch around the middle of the screen (-166 deg to -14 deg)
  // so the side arms sit across the middle-left and middle-right and sweep into the corners.
  const spread = compact ? 0.86 : 0.84;
  const socketAngles: number[] = [];
  const sockets: Vec[] = [];
  const arms: ArmGeometry[] = [];

  for (let i = 0; i < socketCount; i++) {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    const centered = (t - 0.5) * 2; // -1 .. +1
    const baseAngle = -Math.PI / 2 + centered * (Math.PI * 0.5 * spread);

    // Gentle outward S-curve deflection so the arms sweep naturally toward the screen corners
    const cornerDeflection = centered * 0.18;
    const coreAngle = baseAngle - cornerDeflection * 0.28;
    const cornerAngle = baseAngle + cornerDeflection * 0.85;

    // Lateral arms reach wider horizontally to fill the middle of the widescreen stage
    const socketDist = radius * (1 + 0.22 * Math.abs(centered));
    const socket = add(core, polar(socketDist, baseAngle));

    const tangentAngle = baseAngle + cornerDeflection * 0.42;
    const socketTangent = {
      x: Math.cos(tangentAngle),
      y: Math.sin(tangentAngle),
    };

    const outerReach = Math.max(diag * 0.66, socketDist * 2.8);
    const cornerTip = add(socket, polar(outerReach, cornerAngle));

    socketAngles.push(baseAngle);
    sockets.push(socket);
    arms.push({
      index: i,
      coreAngle,
      cornerAngle,
      socket,
      socketTangent,
      cornerTip,
      socketDist,
      outerReach,
    });
  }

  // Two lower-corner waves that sweep into the bottom-left and bottom-right corners
  // while leaving the bottom-center negative space open for the greeting and input bar.
  const wingReach = diag * 0.64;
  const leftWingAngle = Math.PI - 0.34; // ~160.5 deg (sweeps toward bottom-left corner)
  const rightWingAngle = 0.34; // ~19.5 deg (sweeps toward bottom-right corner)

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
    scale: diag * 0.68,
  };
}
