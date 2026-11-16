import { add, clamp, polar, type Vec } from "@/lib/network/geometry";

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  core: Vec;
  /** Radius of the socket crown arc around the core. */
  radius: number;
  sockets: Vec[];
  socketAngles: number[];
  /** Overall field scale used so ambient filaments sweep all the way to the screen edges. */
  scale: number;
};

/** Below this width the network draws tighter around the core. */
export const WIDE_MIN_WIDTH = 1100;

/** Shared by the canvas stage so the 5 node bundles fan cleanly above the core while leaving negative space below. */
export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;
  const core = compact
    ? { x: width * 0.5, y: height * 0.37 }
    : { x: width * 0.5, y: clamp(height * 0.38, 260, height * 0.42) };
  const radius = compact
    ? Math.min(width * 0.36, height * 0.42)
    : clamp(Math.min(height * 0.26, width * 0.2), 160, 265);
  const spread = compact ? 0.84 : 0.8;
  const socketAngles = Array.from({ length: socketCount }, (_, i) => {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    return -Math.PI / 2 + (t - 0.5) * Math.PI * spread;
  });
  return {
    width,
    height,
    compact,
    core,
    radius,
    sockets: socketAngles.map((a) => add(core, polar(radius, a))),
    socketAngles,
    scale: Math.max(width * 0.68, height * 0.92),
  };
}
