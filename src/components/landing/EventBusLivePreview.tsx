"use client";

import { useEffect, useRef, useState } from "react";
import {
  BoltIcon,
  CommandIcon,
  LockIcon,
  NetworkIcon,
  NodesIcon,
  PlusIcon,
  ResearchIcon,
  SyncIcon,
  TodayIcon,
} from "@/components/dashboard/icons";
import {
  add,
  clamp,
  fitCanvas,
  lerp,
  pointOnPath,
  polar,
  radialGlow,
  seededHelpers,
  sub,
  type Vec,
} from "@/lib/network/geometry";

export type TierFocus = "all" | "network" | "command" | "nodes";
type FlowScenarioId = "receipt" | "lecture" | "focus";

type FlowScenario = {
  id: FlowScenarioId;
  tag: string;
  title: string;
  routeLabel: string;
  computeBadge: string;
  eventSignature: string;
  sourceTier: "command" | "nodes" | "network";
  targetSocket: number;
  secondarySocket: number;
  commandStatus: {
    connector: string;
    signal: string;
    rule: string;
    timestamp: string;
  };
  networkVoice: {
    state: string;
    prompt: string;
    utterance: string;
  };
  nodeCard: {
    monogram: string;
    name: string;
    socketLabel: string;
    capability: string;
    headline: string;
    metricLabel: string;
    metricValue: string;
    rows: Array<{ label: string; value: string; accent?: boolean }>;
  };
};

const ORBIT_NODES = [
  { id: "studio", monogram: "ST", name: "Studio", role: "Multi-track DAW & transcription", tier: "Free socket 01", live: true },
  { id: "study", monogram: "SY", name: "Study", role: "Active recall & syllabus parser", tier: "Free socket 02", live: true },
  { id: "ledger", monogram: "LG", name: "Ledger", role: "Deterministic expense journal", tier: "Pro socket 03", live: true },
  { id: "canvas", monogram: "CV", name: "Canvas", role: "Spatial research graph", tier: "Pro socket 04", live: true },
  { id: "open", monogram: "+", name: "Open Socket", role: "Third-party Node SDK contract", tier: "Pro socket 05", live: false },
] as const;

const SCENARIOS: FlowScenario[] = [
  {
    id: "receipt",
    tag: "Deterministic Bus",
    title: "Command Receipt → Ledger Node",
    routeLabel: "Gmail API → Shared Bus → Ledger Socket",
    computeBadge: "0 LLM Compute · Deterministic",
    eventSignature: "nexusBus.emit('command:item-published', { kind: 'command.purchase', total: 42.10 })",
    sourceTier: "command",
    targetSocket: 2, // Ledger
    secondarySocket: 0,
    commandStatus: {
      connector: "Gmail · Plaid · Calendar",
      signal: "Receipt detected from AWS Cloud Services ($42.10 USD)",
      rule: "when(mail.receipt) → publish('command.purchase') → Ledger",
      timestamp: "Synced 2s ago",
    },
    networkVoice: {
      state: "Nexus · Ambient Context",
      prompt: "Did the AWS invoice clear into this month's operating budget?",
      utterance:
        "Command parsed your $42.10 AWS receipt and routed it directly into Ledger. Operating expenses are at $624.50 with zero model calls required.",
    },
    nodeCard: {
      monogram: "LG",
      name: "Ledger Node",
      socketLabel: "Wired · Socket 03",
      capability: "content:command.purchase:read",
      headline: "Ingested typed purchase envelope from Command",
      metricLabel: "November Run Rate",
      metricValue: "$624.50",
      rows: [
        { label: "Amazon Web Services", value: "$42.10 · Just now", accent: true },
        { label: "Linear Orbit Pro", value: "$16.00 · Nov 12" },
        { label: "Vercel Pro Seat", value: "$20.00 · Nov 09" },
      ],
    },
  },
  {
    id: "lecture",
    tag: "Cross-Node Pipe",
    title: "Studio Node → Study Node → Calendar",
    routeLabel: "Studio Socket → Shared Bus → Study Socket",
    computeBadge: "Node-to-Node · Typed Contract",
    eventSignature: "runtime.emit('studio:transcript.ready', { duration: '45m', markers: 8 })",
    sourceTier: "nodes",
    targetSocket: 1, // Study
    secondarySocket: 0, // Studio
    commandStatus: {
      connector: "Calendar · Canvas LMS",
      signal: "2 review blocks written back to November timeline",
      rule: "on(study.schedule) → calendar.hold('Spaced Recall · 25m')",
      timestamp: "Bus latency 1.4ms",
    },
    networkVoice: {
      state: "Study · via Nexus",
      prompt: "Queue my highest-priority review cards before the 16:00 seminar.",
      utterance:
        "Studio finished transcribing Lecture 11. Study extracted 8 spaced-repetition cards from your vocal markers and staged a 25-minute review block on Command.",
    },
    nodeCard: {
      monogram: "SY",
      name: "Study Node",
      socketLabel: "Wired · Socket 02",
      capability: "content:studio.transcript:read",
      headline: "8 active-recall cards synthesized from Studio stems",
      metricLabel: "Retention Readiness",
      metricValue: "94%",
      rows: [
        { label: "Deck: Systems Architecture L11", value: "8 new cards", accent: true },
        { label: "Source stem: CH-01 Vocal Mic", value: "45:12 synced" },
        { label: "Next spaced review", value: "Today · 15:30" },
      ],
    },
  },
  {
    id: "focus",
    tag: "Cross-API Rule + AI",
    title: "Deep Work Trigger → Command & Network",
    routeLabel: "Calendar Block → Spotify + GitHub + Core",
    computeBadge: "Deterministic Rule + Optional AI",
    eventSignature: "command.rule('focus:start') → spotify.play('Solaris') + github.quiet()",
    sourceTier: "network",
    targetSocket: 3, // Canvas
    secondarySocket: 1,
    commandStatus: {
      connector: "Calendar · Spotify · GitHub · Strava",
      signal: "Deep Work window active (14:00 – 16:00) · Notifications held",
      rule: "when(calendar.block == 'Deep Work') → queue('Focus') + mute()",
      timestamp: "Rule active",
    },
    networkVoice: {
      state: "Nexus · Speaking",
      prompt: "Prepare my workspace for the afternoon architecture block.",
      utterance:
        "Your two-hour Deep Work block has started. Command queued your focus stems on Spotify, paused PR alerts, and opened your spatial research graph in Canvas.",
    },
    nodeCard: {
      monogram: "CV",
      name: "Canvas Node",
      socketLabel: "Wired · Socket 04",
      capability: "content:research.source:read",
      headline: "Spatial research cluster linked to active session",
      metricLabel: "Linked Sources",
      metricValue: "14 Nodes",
      rows: [
        { label: "Local-First Event Bus Spec", value: "Pinned primary", accent: true },
        { label: "Zero-LLM Deterministic Loops", value: "4 citations" },
        { label: "Capability Manifest v1", value: "Verified contract" },
      ],
    },
  },
];

type AmbientFilament = {
  bucket: number;
  fromLeft: boolean;
  waist: Vec;
  sourceAngle: number;
  sourceRadius: number;
  sourceBend: number;
  arrivalAngle: number;
  arrivalPull: number;
  targetAngle: number;
  targetRadius: number;
  departPull: number;
  endBend: number;
  phase: number;
};

type SocketWire = {
  socket: number;
  bucket: number;
  bendOut: number;
  bendIn: number;
  reach: number;
  jitter: Vec;
  tailAngle: number;
  tailRadius: number;
  phase: number;
};

type CommandWire = {
  bucket: number;
  bendOut: number;
  bendIn: number;
  jitter: Vec;
  phase: number;
};

type StreamParticle = {
  kind: "ambient" | "socket" | "command";
  index: number;
  u: number;
  speed: number;
  size: number;
  alpha: number;
};

type FieldDust = {
  index: number;
  t: number;
  offset: Vec;
  size: number;
  alpha: number;
  phase: number;
};

type StageGeometry = {
  width: number;
  height: number;
  core: Vec;
  commandHub: Vec;
  sockets: Vec[];
  socketAngles: number[];
  scale: number;
  orbitRadius: number;
};

const BUCKETS = [
  { count: 68, width: 0.5, color: "255, 206, 120", alpha: 0.28 },
  { count: 48, width: 0.85, color: "246, 176, 68", alpha: 0.18 },
  { count: 28, width: 1.35, color: "232, 150, 48", alpha: 0.1 },
  { count: 36, width: 0.35, color: "255, 236, 190", alpha: 0.44 },
  { count: 12, width: 2.8, color: "204, 116, 28", alpha: 0.04 },
] as const;

const WIRES_PER_SOCKET = 24;
const COMMAND_WIRE_COUNT = 32;

function createArchitectureField(socketCount: number) {
  const { rnd, gauss, between } = seededHelpers(20261115);

  const ambient: AmbientFilament[] = [];
  BUCKETS.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i++) {
      const fromLeft = rnd() < 0.56;
      const lift = between(0.14, 0.92);
      ambient.push({
        bucket: bucketIndex,
        fromLeft,
        waist: { x: gauss() * 0.008, y: gauss() * 0.009 },
        sourceAngle: fromLeft ? Math.PI - lift * (rnd() < 0.5 ? 1 : -0.8) : -lift * 0.9,
        sourceRadius: between(0.75, 1.45),
        sourceBend: gauss() * 0.38,
        arrivalAngle: (fromLeft ? 1 : -1) * between(0.12, 0.65),
        arrivalPull: between(0.18, 0.42),
        targetAngle: between(-0.85, 0.72),
        targetRadius: between(0.75, 1.5),
        departPull: between(0.2, 0.44),
        endBend: gauss() * 0.36,
        phase: rnd() * Math.PI * 2,
      });
    }
  });

  const socketWires: SocketWire[] = [];
  for (let socket = 0; socket < socketCount; socket++) {
    for (let i = 0; i < WIRES_PER_SOCKET; i++) {
      socketWires.push({
        socket,
        bucket: i % 4,
        bendOut: gauss() * 0.42,
        bendIn: gauss() * 0.38,
        reach: between(0.32, 0.56),
        jitter: { x: gauss() * 0.01, y: gauss() * 0.01 },
        tailAngle: gauss() * 0.65,
        tailRadius: between(0.18, 0.52),
        phase: rnd() * Math.PI * 2,
      });
    }
  }

  const commandWires: CommandWire[] = Array.from({ length: COMMAND_WIRE_COUNT }, (_, i) => ({
    bucket: i % 4,
    bendOut: gauss() * 0.36,
    bendIn: gauss() * 0.36,
    jitter: { x: gauss() * 0.012, y: gauss() * 0.014 },
    phase: rnd() * Math.PI * 2,
  }));

  const particles: StreamParticle[] = [
    ...Array.from({ length: 140 }, () => ({
      kind: "ambient" as const,
      index: Math.floor(rnd() * ambient.length),
      u: rnd(),
      speed: between(0.012, 0.036),
      size: between(0.5, 1.45),
      alpha: between(0.35, 0.9),
    })),
    ...Array.from({ length: 130 }, () => ({
      kind: "socket" as const,
      index: Math.floor(rnd() * socketWires.length),
      u: rnd(),
      speed: between(0.025, 0.065),
      size: between(0.65, 1.75),
      alpha: between(0.45, 0.98),
    })),
    ...Array.from({ length: 70 }, () => ({
      kind: "command" as const,
      index: Math.floor(rnd() * commandWires.length),
      u: rnd(),
      speed: between(0.028, 0.068),
      size: between(0.65, 1.75),
      alpha: between(0.5, 0.98),
    })),
  ];

  const dust: FieldDust[] = Array.from({ length: 1500 }, () => ({
    index: Math.floor(rnd() * ambient.length),
    t: Math.pow(rnd(), 0.85),
    offset: { x: gauss() * 0.038, y: gauss() * 0.038 },
    size: between(0.45, 1.45),
    alpha: between(0.3, 0.95),
    phase: rnd() * Math.PI * 2,
  }));

  return { ambient, socketWires, commandWires, particles, dust };
}

function computeGeometry(width: number, height: number, socketCount: number): StageGeometry {
  const compact = width < 920;
  const core = compact
    ? { x: width * 0.5, y: height * 0.48 }
    : { x: width * 0.5, y: height * 0.52 };
  const commandHub = compact
    ? { x: width * 0.18, y: height * 0.24 }
    : { x: width * 0.2, y: height * 0.44 };
  const orbitRadius = compact
    ? Math.min(width * 0.36, height * 0.32)
    : clamp(Math.min(width * 0.26, height * 0.38), 165, 290);

  // Arc of 5 sockets sweeping from upper-center to right
  const socketAngles = Array.from({ length: socketCount }, (_, i) => {
    const t = socketCount === 1 ? 0.5 : i / (socketCount - 1);
    return compact
      ? -Math.PI * 0.82 + t * Math.PI * 0.64
      : -Math.PI * 0.62 + t * Math.PI * 0.78;
  });

  const sockets = socketAngles.map((a) => add(core, polar(orbitRadius, a)));
  const scale = Math.max(width * 0.54, height * 0.84);

  return { width, height, core, commandHub, sockets, socketAngles, scale, orbitRadius };
}

function buildAmbientSegments(f: AmbientFilament, G: StageGeometry, time: number): Vec[][] {
  const S = G.scale;
  const sway = Math.sin(time * 0.22 + f.phase);
  const pinch = { x: G.core.x + f.waist.x * S, y: G.core.y + f.waist.y * S };
  const p0 = add(G.core, polar(f.sourceRadius * S, f.sourceAngle + 0.03 * sway));
  const c1 = add(p0, polar(f.sourceRadius * S * 0.4, f.sourceAngle + Math.PI + f.sourceBend));
  const c2 = sub(pinch, polar(f.arrivalPull * S, f.arrivalAngle + 0.04 * sway));
  const target = f.targetAngle + 0.04 * Math.sin(time * 0.18 + f.phase * 1.4);
  const d1 = add(pinch, polar(f.departPull * S, target * 0.55));
  const p3 = add(G.core, polar(f.targetRadius * S, target));
  const d2 = sub(p3, polar(f.targetRadius * S * 0.5, target + f.endBend));
  return [
    [p0, c1, c2, pinch],
    [pinch, d1, d2, p3],
  ];
}

function buildSocketSegments(w: SocketWire, G: StageGeometry, time: number): Vec[][] {
  const angle = G.socketAngles[w.socket]!;
  const socket = G.sockets[w.socket]!;
  const R = G.orbitRadius;
  const sway = Math.sin(time * 0.32 + w.phase);
  const end = { x: socket.x + w.jitter.x * R, y: socket.y + w.jitter.y * R };
  const c1 = add(G.core, polar(R * w.reach, angle + w.bendOut + 0.05 * sway));
  const c2 = sub(end, polar(R * 0.34, angle + w.bendIn));
  const tailAngle = angle + w.tailAngle + 0.05 * sway;
  const tip = add(socket, polar(R * w.tailRadius, tailAngle));
  return [
    [G.core, c1, c2, end],
    [end, add(end, polar(R * 0.14, angle)), sub(tip, polar(R * 0.11, tailAngle)), tip],
  ];
}

function buildCommandSegments(w: CommandWire, G: StageGeometry, time: number): Vec[][] {
  const span = Math.hypot(G.core.x - G.commandHub.x, G.core.y - G.commandHub.y);
  const baseAngle = Math.atan2(G.core.y - G.commandHub.y, G.core.x - G.commandHub.x);
  const sway = Math.sin(time * 0.28 + w.phase);
  const start = {
    x: G.commandHub.x + w.jitter.x * span,
    y: G.commandHub.y + w.jitter.y * span,
  };
  const c1 = add(start, polar(span * 0.42, baseAngle + w.bendOut + 0.05 * sway));
  const c2 = sub(G.core, polar(span * 0.38, baseAngle + w.bendIn - 0.04 * sway));
  return [[start, c1, c2, G.core]];
}

export function EventBusLivePreview() {
  const [scenarioId, setScenarioId] = useState<FlowScenarioId>("receipt");
  const [tierFocus, setTierFocus] = useState<TierFocus>("all");
  const [hoveredSocket, setHoveredSocket] = useState<number | null>(null);
  const [pausedByUser, setPausedByUser] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    scenarioId: "receipt" as FlowScenarioId,
    tierFocus: "all" as TierFocus,
    hoveredSocket: null as number | null,
    pulseSerial: 1,
  });

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;
  const focusedSocketIndex = hoveredSocket ?? scenario.targetSocket;

  useEffect(() => {
    stateRef.current = {
      scenarioId,
      tierFocus,
      hoveredSocket,
      pulseSerial: stateRef.current.pulseSerial + 1,
    };
  }, [scenarioId, tierFocus, hoveredSocket]);

  useEffect(() => {
    if (pausedByUser) return;
    const timer = window.setInterval(() => {
      setScenarioId((prev) => {
        if (prev === "receipt") return "lecture";
        if (prev === "lecture") return "focus";
        return "receipt";
      });
    }, 6800);
    return () => window.clearInterval(timer);
  }, [pausedByUser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const socketCount = ORBIT_NODES.length;
    const field = createArchitectureField(socketCount);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const socketLevels: number[] = ORBIT_NODES.map((n) => (n.live ? 0.72 : 0.22));
    let commandLevel = 0.85;
    let coreEnergy = 0.75;
    let lastSerial = stateRef.current.pulseSerial;

    const pulses: Array<{
      kind: "command-to-core" | "core-to-socket";
      socket: number;
      t: number;
    }> = [
      { kind: "command-to-core", socket: 2, t: 0.1 },
      { kind: "core-to-socket", socket: 2, t: 0.45 },
    ];
    const ripples: number[] = [0.25];

    let geom = computeGeometry(1, 1, socketCount);
    let frame = 0;
    let start = 0;
    let last = 0;
    let pulseClock = 0;

    const draw = (time: number, dt: number) => {
      const currentScenario =
        SCENARIOS.find((s) => s.id === stateRef.current.scenarioId) ?? SCENARIOS[0]!;
      const focus = stateRef.current.tierFocus;
      const activeSock = stateRef.current.hoveredSocket ?? currentScenario.targetSocket;
      const secondarySock = currentScenario.secondarySocket;

      if (stateRef.current.pulseSerial !== lastSerial) {
        lastSerial = stateRef.current.pulseSerial;
        if (!reduceMotion) {
          pulses.push({ kind: "command-to-core", socket: activeSock, t: 0 });
          pulses.push({ kind: "core-to-socket", socket: activeSock, t: 0.18 });
          ripples.push(0);
        }
      }

      if (!reduceMotion) {
        pulseClock += dt;
        if (pulseClock > 2.2) {
          pulseClock = 0;
          pulses.push({ kind: "command-to-core", socket: activeSock, t: 0 });
          pulses.push({ kind: "core-to-socket", socket: activeSock, t: 0.25 });
          if (currentScenario.id === "lecture") {
            pulses.push({ kind: "core-to-socket", socket: secondarySock, t: 0 });
          }
          ripples.push(0);
        }
      }

      const { width, height, core, commandHub, sockets, scale: S, orbitRadius: R } = geom;
      const follow = reduceMotion ? 1 : Math.min(1, dt * 3.2);

      const targetCoreEnergy =
        focus === "network" ? 1 : focus === "all" ? 0.82 : 0.62;
      const targetCommandLevel =
        focus === "command"
          ? 1
          : focus === "all" || currentScenario.sourceTier === "command"
            ? 0.88
            : 0.45;

      coreEnergy = lerp(coreEnergy, targetCoreEnergy, follow);
      commandLevel = lerp(commandLevel, targetCommandLevel, follow);

      ORBIT_NODES.forEach((node, idx) => {
        const isPrimary = idx === activeSock;
        const isSecondary = idx === secondarySock;
        const tierBoost = focus === "nodes" ? 0.22 : 0;
        const target = isPrimary
          ? 1
          : isSecondary
            ? 0.82
            : (node.live ? 0.52 : 0.18) + tierBoost;
        socketLevels[idx] = lerp(socketLevels[idx] ?? 0.5, clamp(target, 0.14, 1), follow);
      });

      const breathe = 1 + 0.05 * Math.sin(time * 0.7) + 0.08 * coreEnergy;
      const lightRadius = S * 1.15 * (0.85 + 0.15 * coreEnergy);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      // Ambient atmospheric golden glows
      radialGlow(ctx, core, S * 0.58 * breathe, [
        [0, `rgba(255, 186, 84, ${0.15 + 0.07 * coreEnergy})`],
        [0.38, "rgba(200, 116, 36, 0.06)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      radialGlow(ctx, commandHub, R * 0.72 * commandLevel, [
        [0, `rgba(255, 206, 120, ${0.22 * commandLevel})`],
        [0.45, `rgba(214, 128, 36, ${0.07 * commandLevel})`],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      const ambientPaths = field.ambient.map((f) => buildAmbientSegments(f, geom, time));
      const socketPaths = field.socketWires.map((w) => buildSocketSegments(w, geom, time));
      const commandPaths = field.commandWires.map((w) => buildCommandSegments(w, geom, time));

      const gradientFor = (color: string, a: number) => {
        const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, lightRadius);
        g.addColorStop(0, `rgba(${color}, ${Math.min(1, a * 2.3)})`);
        g.addColorStop(0.26, `rgba(${color}, ${a * 1.25})`);
        g.addColorStop(0.65, `rgba(${color}, ${a * 0.45})`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        return g;
      };

      // 1. Ambient Golden Neural Field
      BUCKETS.forEach((bucket, bucketIndex) => {
        ctx.beginPath();
        field.ambient.forEach((f, i) => {
          if (f.bucket !== bucketIndex) return;
          const [inc, out] = ambientPaths[i]!;
          ctx.moveTo(inc![0]!.x, inc![0]!.y);
          for (const [, b, c, d] of [inc!, out!]) {
            ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
          }
        });
        ctx.lineWidth = bucket.width;
        ctx.strokeStyle = gradientFor(bucket.color, bucket.alpha * (0.55 + 0.45 * coreEnergy));
        ctx.stroke();
      });

      // 2. Command -> Core Multi-Filament Bundle
      for (const bucketIndex of [0, 1, 2, 3]) {
        const bucket = BUCKETS[bucketIndex]!;
        ctx.beginPath();
        field.commandWires.forEach((w, i) => {
          if (w.bucket !== bucketIndex) return;
          const segments = commandPaths[i]!;
          ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
          for (const [, b, c, d] of segments) {
            ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
          }
        });
        ctx.lineWidth = bucket.width * (0.85 + commandLevel * 0.65);
        ctx.strokeStyle = `rgba(${bucket.color}, ${Math.min(
          1,
          bucket.alpha * 4.4 * commandLevel,
        )})`;
        ctx.stroke();
      }

      // 3. Core -> Orbital Node Socket Bundles
      for (let s = 0; s < socketCount; s++) {
        const level = socketLevels[s] ?? 0.5;
        for (const bucketIndex of [0, 1, 2, 3]) {
          const bucket = BUCKETS[bucketIndex]!;
          ctx.beginPath();
          field.socketWires.forEach((w, i) => {
            if (w.socket !== s || w.bucket !== bucketIndex) return;
            const segments = socketPaths[i]!;
            ctx.moveTo(segments[0]![0]!.x, segments[0]![0]!.y);
            for (const [, b, c, d] of segments) {
              ctx.bezierCurveTo(b!.x, b!.y, c!.x, c!.y, d!.x, d!.y);
            }
          });
          ctx.lineWidth = bucket.width * (0.85 + level * 0.7);
          ctx.strokeStyle = `rgba(${bucket.color}, ${Math.min(
            1,
            bucket.alpha * 4.8 * level,
          )})`;
          ctx.stroke();
        }

        const at = sockets[s]!;
        radialGlow(ctx, at, R * (0.16 + 0.14 * level), [
          [0, `rgba(255, 224, 155, ${0.42 * level})`],
          [0.45, `rgba(240, 181, 74, ${0.14 * level})`],
          [1, "rgba(0, 0, 0, 0)"],
        ]);
      }

      // 4. Expanding Speaking / Bus Ripples around Core
      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (!reduceMotion) ripples[i]! += dt * 0.48;
        const r = ripples[i]!;
        if (r >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255, 214, 150, ${0.3 * (1 - r) * (1 - r)})`;
        ctx.beginPath();
        ctx.arc(core.x, core.y, R * (0.14 + r * 0.95), 0, Math.PI * 2);
        ctx.stroke();
      }

      // 5. Luminous Central Network Core & Command Anchor
      radialGlow(ctx, core, S * 0.082 * breathe, [
        [0, "rgba(255, 252, 240, 1)"],
        [0.2, `rgba(255, 228, 165, ${0.75 + 0.2 * coreEnergy})`],
        [0.52, "rgba(250, 176, 70, 0.24)"],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      radialGlow(ctx, commandHub, S * 0.048, [
        [0, "rgba(255, 248, 225, 0.92)"],
        [0.32, `rgba(255, 206, 120, ${0.4 * commandLevel})`],
        [1, "rgba(0, 0, 0, 0)"],
      ]);

      // 6. Travelling Golden Energy Pulses along Bezier Bundles
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i]!;
        if (!reduceMotion) pulse.t += dt / 1.15;
        if (pulse.t >= 1.35) {
          pulses.splice(i, 1);
          continue;
        }
        const travel = clamp(pulse.t, 0, 1);
        const fade = pulse.t > 1 ? 1 - (pulse.t - 1) / 0.35 : 1;

        if (pulse.kind === "command-to-core") {
          const pos = pointOnPath(commandPaths[0]!, travel);
          radialGlow(ctx, pos, R * 0.16, [
            [0, `rgba(255, 248, 225, ${0.9 * fade})`],
            [0.32, `rgba(255, 200, 110, ${0.34 * fade})`],
            [1, "rgba(0, 0, 0, 0)"],
          ]);
        } else {
          const leadIdx = field.socketWires.findIndex((w) => w.socket === pulse.socket);
          if (leadIdx >= 0) {
            const pos = pointOnPath(socketPaths[leadIdx]!.slice(0, 1), travel);
            radialGlow(ctx, pos, R * 0.17, [
              [0, `rgba(255, 250, 230, ${0.95 * fade})`],
              [0.32, `rgba(255, 204, 115, ${0.38 * fade})`],
              [1, "rgba(0, 0, 0, 0)"],
            ]);
            if (pulse.t > 0.82 && sockets[pulse.socket]) {
              radialGlow(ctx, sockets[pulse.socket]!, R * 0.36 * fade, [
                [0, `rgba(255, 224, 155, ${0.42 * fade})`],
                [1, "rgba(0, 0, 0, 0)"],
              ]);
            }
          }
        }
      }

      // 7. Twinkling Golden Dust Field
      const falloff = (p: Vec) =>
        Math.max(0, 1 - Math.hypot(p.x - core.x, p.y - core.y) / lightRadius);

      ctx.fillStyle = "rgb(255, 214, 140)";
      for (const d of field.dust) {
        const base = pointOnPath(ambientPaths[d.index]!.slice(1), d.t);
        const p = { x: base.x + d.offset.x * S, y: base.y + d.offset.y * S };
        const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + d.phase);
        ctx.globalAlpha = d.alpha * twinkle * Math.min(1, falloff(p) * 1.55);
        ctx.fillRect(p.x, p.y, d.size, d.size);
      }

      // 8. Streaming Golden Particles Along All Paths
      ctx.fillStyle = "rgb(255, 240, 205)";
      for (const p of field.particles) {
        let path: Vec[][];
        let level = 1;
        if (p.kind === "ambient") {
          path = ambientPaths[p.index]!;
          level = 0.85;
        } else if (p.kind === "command") {
          path = commandPaths[p.index]!;
          level = commandLevel;
        } else {
          const wire = field.socketWires[p.index]!;
          path = socketPaths[p.index]!;
          level = socketLevels[wire.socket] ?? 0.5;
        }
        if (!reduceMotion) {
          p.u = (p.u + p.speed * dt * (0.65 + level * 0.9)) % 1;
        }
        const pos = pointOnPath(path, p.u);
        const glow = p.kind === "ambient" ? Math.min(1, falloff(pos) * 1.6) : Math.max(0.15, level);
        ctx.globalAlpha = p.alpha * glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const { width, height } = fitCanvas(canvas, ctx);
      geom = computeGeometry(width, height, socketCount);
      if (reduceMotion) draw(6, 0);
    };

    const loop = (now: number) => {
      if (!start) start = last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw((now - start) / 1000, dt);
      frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  function selectScenario(id: FlowScenarioId) {
    setPausedByUser(true);
    setScenarioId(id);
  }

  function selectTier(tier: TierFocus) {
    setPausedByUser(true);
    setTierFocus((prev) => (prev === tier ? "all" : tier));
  }

  return (
    <div className="nx-stage-wrap">
      {/* Interactive Stage Controls — Scenario & Tier Selector */}
      <div className="nx-stage-controls" role="toolbar" aria-label="Nexus architecture live flows">
        <div className="nx-stage-pills">
          {SCENARIOS.map((item) => {
            const active = item.id === scenario.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectScenario(item.id)}
                aria-pressed={active}
                className={`nx-flow-pill ${active ? "nx-flow-pill--active" : ""}`}
              >
                <span className="nx-flow-pill-dot" aria-hidden />
                <span className="nx-flow-pill-tag">{item.tag}</span>
                <span className="nx-flow-pill-title">{item.title}</span>
              </button>
            );
          })}
        </div>

        <div className="nx-bus-readout" aria-live="polite">
          <span className="nx-bus-badge">{scenario.computeBadge}</span>
          <code className="nx-bus-code">{scenario.eventSignature}</code>
        </div>
      </div>

      {/* Monumental Golden Neural Canvas + Structured Nexus Interface Stage */}
      <div className="nx-monolith">
        {/* Background Procedural Golden Neural Canvas */}
        <div className="nx-canvas-layer" aria-hidden>
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="nx-canvas-vignette" />
        </div>

        {/* Top Authentic Nexus Stage Bar */}
        <header className="nx-topbar">
          <div className="flex items-center gap-3">
            <span className="nx-core-beacon" aria-hidden />
            <span className="text-[12px] font-medium tracking-[0.02em] text-[color:var(--land-ink)]">
              Nexus Operating Environment
            </span>
            <span className="landing-beta">shared bus</span>
          </div>

          <div className="nx-tier-toggles" role="group" aria-label="Highlight architecture tier">
            {(
              [
                ["all", "Full Field"],
                ["network", "01 · Network"],
                ["command", "02 · Command"],
                ["nodes", "03 · Nodes"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTier(id)}
                aria-pressed={tierFocus === id}
                className={`nx-tier-chip ${tierFocus === id ? "nx-tier-chip--on" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 text-[11.5px] text-[color:var(--land-muted)] md:flex">
            <span className="text-[color:var(--land-gold-soft)]">{scenario.routeLabel}</span>
          </div>
        </header>

        {/* Main Spatial Interface Grid */}
        <div className="nx-spatial-body">
          {/* Left Authentic NodeMenu Dock */}
          <nav aria-label="Nexus node dock preview" className="nx-dock">
            <button
              type="button"
              onClick={() => selectTier("network")}
              className={`nx-dock-item ${
                tierFocus === "network" || (tierFocus === "all" && scenario.sourceTier === "network")
                  ? "nx-dock-item--on"
                  : ""
              }`}
            >
              <span className="nx-dock-icon">
                <NetworkIcon size={17} />
              </span>
              <span className="nx-dock-label">Network</span>
            </button>
            <button
              type="button"
              onClick={() => selectTier("command")}
              className={`nx-dock-item ${
                tierFocus === "command" || (tierFocus === "all" && scenario.sourceTier === "command")
                  ? "nx-dock-item--on"
                  : ""
              }`}
            >
              <span className="nx-dock-icon">
                <CommandIcon size={17} />
              </span>
              <span className="nx-dock-label">Command</span>
            </button>
            <button
              type="button"
              onClick={() => selectScenario("focus")}
              className={`nx-dock-item ${scenario.id === "focus" ? "nx-dock-item--on" : ""}`}
            >
              <span className="nx-dock-icon">
                <TodayIcon size={17} />
              </span>
              <span className="nx-dock-label">Today</span>
            </button>
            <button
              type="button"
              onClick={() => selectTier("nodes")}
              className={`nx-dock-item ${
                tierFocus === "nodes" || (tierFocus === "all" && scenario.sourceTier === "nodes")
                  ? "nx-dock-item--on"
                  : ""
              }`}
            >
              <span className="nx-dock-icon">
                <NodesIcon size={17} />
              </span>
              <span className="nx-dock-label">Nodes</span>
            </button>

            <span className="node-menu-divider" aria-hidden />

            {ORBIT_NODES.slice(0, 3).map((node, index) => (
              <button
                key={node.id}
                type="button"
                onMouseEnter={() => setHoveredSocket(index)}
                onMouseLeave={() => setHoveredSocket(null)}
                onClick={() => {
                  setPausedByUser(true);
                  setHoveredSocket(index);
                }}
                className={`nx-dock-item ${focusedSocketIndex === index ? "nx-dock-item--on" : ""}`}
              >
                <span className="nx-dock-monogram">{node.monogram}</span>
                <span className="nx-dock-label">{node.name}</span>
              </button>
            ))}

            <div className="mt-auto flex flex-col items-center gap-1 pt-3">
              <span className="flex gap-[3px]" aria-hidden>
                {ORBIT_NODES.map((n, i) => (
                  <span
                    key={n.id}
                    className={`h-1 w-1.5 rounded-full ${
                      i < 4 ? "bg-[color:var(--land-gold)]" : "bg-white/20"
                    }`}
                  />
                ))}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--land-faint)]">
                4/5 Wired
              </span>
            </div>
          </nav>

          {/* 3-Column Spatial Stage: Command (Left), Network Core (Center), Nodes Arc (Right) */}
          <div className="nx-stage-columns">
            {/* COLUMN 1: TIER 02 · COMMAND TELEMETRY & DETERMINISTIC RULES */}
            <article
              className={`nx-glass-card ${
                tierFocus === "command" || scenario.sourceTier === "command" ? "nx-glass-card--lit" : ""
              } ${tierFocus !== "all" && tierFocus !== "command" ? "nx-glass-card--dim" : ""}`}
              onClick={() => selectTier("command")}
            >
              <header className="nx-card-head">
                <div>
                  <p className="nx-card-eyebrow">Tier 02 · Command</p>
                  <h3 className="nx-card-title">Telemetry &amp; Rules Cockpit</h3>
                </div>
                <span className="nx-sync-pill">
                  <SyncIcon size={12} />
                  <span>{scenario.commandStatus.timestamp}</span>
                </span>
              </header>

              {/* Connected Services Strip */}
              <div className="nx-connector-strip" aria-label="Connected accounts">
                {[
                  ["Gmail", true],
                  ["Calendar", true],
                  ["GitHub", true],
                  ["Spotify", true],
                  ["Strava", true],
                  ["Plaid", true],
                ].map(([service, on]) => (
                  <span key={String(service)} className={`nx-connector-pill ${on ? "nx-connector-pill--on" : ""}`}>
                    <span className="nx-connector-dot" aria-hidden />
                    {service}
                  </span>
                ))}
              </div>

              {/* Active Telemetry Signal Box */}
              <div className="nx-signal-box">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--land-gold)]">
                    Live Ingestion Stream
                  </span>
                  <span className="text-[11px] text-[color:var(--land-faint)]">
                    {scenario.commandStatus.connector}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium leading-snug text-[color:var(--land-ink)]">
                  {scenario.commandStatus.signal}
                </p>
              </div>

              {/* Deterministic Automation Rule */}
              <div className="nx-rule-box">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--land-gold-soft)]">
                  <BoltIcon size={13} />
                  <span>Deterministic Cross-API Automation</span>
                </div>
                <code className="mt-1.5 block truncate font-mono text-[11px] text-[color:var(--land-muted)]">
                  {scenario.commandStatus.rule}
                </code>
              </div>

              {/* Mini Unified Day Timeline */}
              <div className="nx-mini-timeline" aria-hidden>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[color:var(--land-faint)]">
                  <span>Unified Timeline</span>
                  <span className="text-[color:var(--land-gold-soft)]">14:00 Now</span>
                </div>
                <div className="nx-mini-track">
                  <span className="nx-mini-now" />
                  <div className="nx-mini-events">
                    <span>09:00 Brief</span>
                    <span className="nx-mini-event--gold">14:00 Deep Work</span>
                    <span>16:30 Run</span>
                  </div>
                </div>
              </div>
            </article>

            {/* COLUMN 2: TIER 01 · NETWORK CORE & AMBIENT VOICE */}
            <div
              className={`nx-core-column ${
                tierFocus !== "all" && tierFocus !== "network" ? "nx-glass-card--dim" : ""
              }`}
              onClick={() => selectTier("network")}
            >
              {/* Spatial Core Ring Label over the Canvas Nucleus */}
              <div className="nx-core-halo">
                <div className="nx-core-ring">
                  <span className="nx-core-kicker">Tier 01 · Network</span>
                  <span className="nx-core-sub">Shared Event Bus Core</span>
                </div>
              </div>

              {/* Authentic NexusVoice + NexusInput Surface */}
              <div
                className={`nx-voice-surface ${
                  tierFocus === "network" || scenario.sourceTier === "network" ? "nx-glass-card--lit" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="dash-eyebrow flex items-center gap-2">
                    <span className="state-dot state-dot--thinking" />
                    {scenario.networkVoice.state}
                  </p>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10.5px] text-[color:var(--land-muted)]">
                    Optional AI Layer
                  </span>
                </div>

                <p className="mt-3 text-[12.5px] text-[color:var(--land-muted)]">
                  <span className="text-[color:var(--land-faint)]">You — </span>
                  {scenario.networkVoice.prompt}
                </p>

                <p className="mt-2 text-[14.5px] font-light leading-relaxed tracking-[-0.01em] text-[color:var(--land-ink)]">
                  {scenario.networkVoice.utterance}
                </p>

                <div className="nx-voice-input" aria-hidden>
                  <span className="truncate text-[13px] text-[color:var(--land-muted)]">
                    Ask Nexus, or search the web…
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="nx-voice-research" title="Bias-aware Research reader">
                      <ResearchIcon size={14} />
                    </span>
                    <span className="nx-voice-send">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 3: TIER 03 · MODULAR NODES & SOCKET HUB */}
            <article
              className={`nx-glass-card ${
                tierFocus === "nodes" || scenario.sourceTier === "nodes" ? "nx-glass-card--lit" : ""
              } ${tierFocus !== "all" && tierFocus !== "nodes" ? "nx-glass-card--dim" : ""}`}
              onClick={() => selectTier("nodes")}
            >
              <header className="nx-card-head">
                <div>
                  <p className="nx-card-eyebrow">Tier 03 · Nodes</p>
                  <h3 className="nx-card-title">Modular Socket Extensions</h3>
                </div>
                <span className="nx-socket-cap">2 Free · Pro ∞</span>
              </header>

              {/* Orbital Socket Selector Pills */}
              <div className="nx-socket-orbit-bar" role="tablist" aria-label="Installed Node sockets">
                {ORBIT_NODES.map((node, idx) => {
                  const isFocused = focusedSocketIndex === idx;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      role="tab"
                      aria-selected={isFocused}
                      onMouseEnter={() => setHoveredSocket(idx)}
                      onMouseLeave={() => setHoveredSocket(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPausedByUser(true);
                        if (idx === 2) setScenarioId("receipt");
                        else if (idx === 0 || idx === 1) setScenarioId("lecture");
                        else setScenarioId("focus");
                      }}
                      className={`nx-socket-node ${isFocused ? "nx-socket-node--active" : ""} ${
                        !node.live ? "nx-socket-node--open" : ""
                      }`}
                    >
                      <span className="nx-socket-mono">{node.monogram}</span>
                      <span className="nx-socket-name">{node.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Node Live Surface */}
              <div className="nx-node-inspector">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="nx-node-badge">{scenario.nodeCard.monogram}</span>
                    <div>
                      <p className="text-[13.5px] font-medium text-[color:var(--land-ink)]">
                        {scenario.nodeCard.name}
                      </p>
                      <p className="font-mono text-[10.5px] text-[color:var(--land-gold-soft)]">
                        {scenario.nodeCard.capability}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-[color:var(--land-faint)]">
                      {scenario.nodeCard.metricLabel}
                    </span>
                    <span className="text-[14px] font-semibold text-[color:var(--land-gold-soft)]">
                      {scenario.nodeCard.metricValue}
                    </span>
                  </div>
                </div>

                <p className="mt-2.5 text-[12px] text-[color:var(--land-muted)]">
                  {scenario.nodeCard.headline}
                </p>

                <ul className="mt-2.5 space-y-1.5">
                  {scenario.nodeCard.rows.map((row) => (
                    <li
                      key={row.label}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] ${
                        row.accent
                          ? "border border-[rgba(240,181,74,0.35)] bg-[rgba(240,181,74,0.09)] text-[color:var(--land-ink)]"
                          : "bg-white/[0.025] text-[color:var(--land-muted)]"
                      }`}
                    >
                      <span className="truncate font-medium">{row.label}</span>
                      <span
                        className={`ml-2 shrink-0 font-mono text-[11px] ${
                          row.accent ? "text-[color:var(--land-gold-soft)]" : "text-[color:var(--land-faint)]"
                        }`}
                      >
                        {row.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>

          {/* Right Authentic NodeRail Socket Bar */}
          <aside aria-label="Quick socket rail preview" className="nx-rail">
            <button
              type="button"
              onClick={() => selectTier("command")}
              className="node-rail-button node-rail-button--core"
              title="Command Core"
              aria-label="Command Core"
            >
              <CommandIcon size={16} />
            </button>
            <span className="node-menu-divider" aria-hidden />
            {ORBIT_NODES.map((node, index) => {
              const active = focusedSocketIndex === index;
              return (
                <button
                  key={node.id}
                  type="button"
                  onMouseEnter={() => setHoveredSocket(index)}
                  onMouseLeave={() => setHoveredSocket(null)}
                  onClick={() => {
                    setPausedByUser(true);
                    setHoveredSocket(index);
                  }}
                  className={`node-rail-button ${
                    node.live ? "node-rail-button--live" : "node-rail-button--open"
                  } ${active ? "node-rail-button--on" : ""}`}
                  title={`${node.name} · ${node.role}`}
                  aria-label={node.name}
                >
                  {node.live ? (
                    <span className="text-[10.5px] font-semibold">{node.monogram}</span>
                  ) : (
                    <PlusIcon size={13} />
                  )}
                </button>
              );
            })}
            <button
              type="button"
              className="node-rail-button node-rail-button--locked"
              title="Pro Socket · Unlimited on Pro"
              aria-label="Locked Pro Socket"
            >
              <LockIcon size={12} />
            </button>
          </aside>
        </div>
      </div>

      {/* Structured 3-Tier Architectural Breakdown Under the Stage */}
      <div className="nx-pillars">
        <button
          type="button"
          onClick={() => selectTier("network")}
          className={`nx-pillar ${tierFocus === "network" ? "nx-pillar--active" : ""}`}
        >
          <div className="nx-pillar-top">
            <span className="nx-pillar-num">01 · Network</span>
            <span className="nx-pillar-tag">Front Page &amp; Optional AI</span>
          </div>
          <h3 className="nx-pillar-heading">One conversation with full situational awareness.</h3>
          <p className="nx-pillar-body">
            The golden neural field you land on. Network has automatic context over everything wired into Command and
            can orchestrate actions across your installed Nodes on demand—while never becoming a dependency for daily
            manual work.
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectTier("command")}
          className={`nx-pillar ${tierFocus === "command" ? "nx-pillar--active" : ""}`}
        >
          <div className="nx-pillar-top">
            <span className="nx-pillar-num">02 · Command</span>
            <span className="nx-pillar-tag">Telemetry &amp; Deterministic Rules</span>
          </div>
          <h3 className="nx-pillar-heading">Every outside account on one real-time timeline.</h3>
          <p className="nx-pillar-body">
            Connect Gmail, Calendar, GitHub, Spotify, Strava, Plaid, and F1 once. Command arranges live widgets in one
            cockpit and runs deterministic cross-API automations—like a calendar block triggering focus music and
            muting alerts—at zero AI compute cost.
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectTier("nodes")}
          className={`nx-pillar ${tierFocus === "nodes" ? "nx-pillar--active" : ""}`}
        >
          <div className="nx-pillar-top">
            <span className="nx-pillar-num">03 · Nodes</span>
            <span className="nx-pillar-tag">Modular Socket Ecosystem</span>
          </div>
          <h3 className="nx-pillar-heading">Heavy-duty standalone apps wired to the shared bus.</h3>
          <p className="nx-pillar-body">
            Snap in full-scale deterministic workspaces—Studio, Study, Ledger, Canvas, or third-party extensions. Nodes
            subscribe to Command streams and pass typed records to one another over the central event bus. Two sockets
            are free; Pro unlocks the rest.
          </p>
        </button>
      </div>
    </div>
  );
}
