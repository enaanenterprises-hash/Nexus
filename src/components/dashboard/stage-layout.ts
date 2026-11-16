import { add, clamp, polar, type Vec } from "@/lib/network/geometry";

export type ArmGeometry = {
  /** Index of the arm (0..4). */
  index: number;
  /** Departure angle from the central singularity core (radians). */
  coreAngle: number;
  /** Tangent angle passing through the node waist (radians). */
  waistAngle: number;
  /** Outward sweep angle toward the viewport corner/edge (radians). */
  outerAngle: number;
  /** Exact coordinate of the node waist (socket). */
  socket: Vec;
  /** Unit normal vector perpendicular to waistAngle at the socket. */
  waistNormal: Vec;
  /** Distance from core to the node waist. */
  innerSpan: number;
  /** Distance from the node waist to the viewport corner/edge boundary. */
  outerSpan: number;
  /** Reference terminal point on the outer corner boundary. */
  tipCenter: Vec;
};

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  /** Central Singularity Core positioned in the middle of the screen. */
  core: Vec;
  /** Characteristic radius from the core to the 5 node waists. */
  radius: number;
  /** Coordinates of each Node waist (0..4). */
  sockets: Vec[];
  /** Angles of each Node waist (0..4). */
  socketAngles: number[];
  /** Complete mathematical foliation geometry for each of the 5 node arms. */
  arms: ArmGeometry[];
  /** Safe x-boundary protecting the left sidebar from any line overlap. */
  leftSafeX: number;
  /** Safe x-boundary protecting the right node rail. */
  rightSafeX: number;
  /** Overall scale of the stage. */
  scale: number;
};

export const WIDE_MIN_WIDTH = 1100;

/**
 * Computes the exact distance from `origin` along `angle` to the safe viewport
 * boundary so that:
 *   1) Arms extend cleanly to the top and corner edges of the screen.
 *   2) Left-side arms stop before the left sidebar corridor (x = leftSafeX),
 *      never covering the left sidebar buttons.
 */
function computeSafeCornerReach(
  origin: Vec,
  angle: number,
  width: number,
  height: number,
  leftSafeX: number,
  rightSafeX: number,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let tMin = Infinity;

  // Top edge (allow slight 1.06x bleed off the top of the screen for seamless corner exit)
  if (dy < -1e-4) {
    const tTop = (-height * 0.04 - origin.y) / dy;
    if (tTop > 0) tMin = Math.min(tMin, tTop);
  }
  // Left safe boundary (strictly respect the left sidebar negative space!)
  if (dx < -1e-4) {
    const tLeft = (leftSafeX - origin.x) / dx;
    if (tLeft > 0) tMin = Math.min(tMin, tLeft);
  }
  // Right safe boundary (respect the right node rail corridor)
  if (dx > 1e-4) {
    const tRight = (rightSafeX - origin.x) / dx;
    if (tRight > 0) tMin = Math.min(tMin, tRight);
  }

  if (!Number.isFinite(tMin)) {
    return Math.hypot(width, height) * 0.45;
  }
  return clamp(tMin, 140, Math.hypot(width, height) * 0.72);
}

export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;

  // Protected negative-space corridors for the left sidebar and right node rail
  const leftSafeX = compact ? 78 : 104;
  const rightSafeX = compact ? width - 24 : width - 72;

  // Central singularity core sits right in the middle of the screen vertically
  const core: Vec = compact
    ? { x: width * 0.5, y: height * 0.5 }
    : { x: width * 0.5, y: clamp(height * 0.52, 340, height - 245) };

  const usableHalfWidth = Math.max(160, (rightSafeX - leftSafeX) * 0.5);
  const radius = compact
    ? clamp(Math.min(usableHalfWidth * 0.52, height * 0.25), 115, 195)
    : clamp(Math.min(usableHalfWidth * 0.46, height * 0.27), 155, 250);

  // 5 balanced arm angles fanning from -146 deg (upper-left corner) through -90 deg (zenith)
  // to -34 deg (upper-right corner), keeping the left sidebar, right rail, and bottom voice area clear.
  const spread = compact ? 0.64 : 0.62;
  const socketAngles: number[] = [];
  const sockets: Vec[] = [];
  const arms: ArmGeometry[] = [];

  for (let i = 0; i < socketCount; i++) {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    const centered = (t - 0.5) * 2; // -1 .. +1
    const baseAngle = -Math.PI / 2 + centered * (Math.PI * 0.5 * spread);

    // Subtle S-curve inflection so lateral arms sweep gracefully toward the top-left and top-right corners
    const inflection = centered * 0.12;
    const coreAngle = baseAngle - inflection * 0.35;
    const waistAngle = baseAngle + inflection * 0.25;
    const outerAngle = baseAngle + inflection * 0.55;

    const innerSpan = radius * (1 + 0.14 * Math.abs(centered));
    const socket = add(core, polar(innerSpan, baseAngle));

    const waistNormal = {
      x: -Math.sin(waistAngle),
      y: Math.cos(waistAngle),
    };

    const outerSpan = computeSafeCornerReach(
      socket,
      outerAngle,
      width,
      height,
      leftSafeX,
      rightSafeX,
    );
    const tipCenter = add(socket, polar(outerSpan, outerAngle));

    socketAngles.push(baseAngle);
    sockets.push(socket);
    arms.push({
      index: i,
      coreAngle,
      waistAngle,
      outerAngle,
      socket,
      waistNormal,
      innerSpan,
      outerSpan,
      tipCenter,
    });
  }

  return {
    width,
    height,
    compact,
    core,
    radius,
    sockets,
    socketAngles,
    arms,
    leftSafeX,
    rightSafeX,
    scale: Math.min(usableHalfWidth, height * 0.52),
  };
}
