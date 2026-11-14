import { clamp, polar, add, type Vec } from "@/lib/network/geometry";

export type StageLayout = {
  width: number;
  height: number;
  compact: boolean;
  core: Vec;
  /** Radius of the socket arc around the core. */
  radius: number;
  sockets: Vec[];
  socketAngles: number[];
  /** Overall field scale used for ambient filaments. */
  scale: number;
};

/** Below this width the dashboard stacks and the stage becomes a section. */
export const WIDE_MIN_WIDTH = 1100;

/** Shared by the canvas and the DOM socket overlay so both agree on positions. */
export function computeStageLayout(width: number, height: number, socketCount: number): StageLayout {
  const compact = width < WIDE_MIN_WIDTH;
  const core = compact
    ? { x: width * 0.5, y: height * 0.66 }
    : { x: width * 0.5, y: Math.max(300, height * 0.39) };
  const radius = compact
    ? Math.min(width * 0.37, height * 0.46)
    : clamp(Math.min(height * 0.25, width * 0.19), 150, 250);
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
    scale: compact ? Math.max(width * 0.9, height * 0.7) : Math.max(width * 0.5, height * 0.9),
  };
}
