"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Lock,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  PLANNED_EXTENSIONS,
  canActivateAnother,
  canUseSlot,
  nexusBus,
  placeholderName,
  type ExtensionCapability,
  type ExtensionHubSnapshot,
  type ExtensionId,
  type NexusEvent,
  type NexusEventMap,
  type SlotId,
} from "@/lib/extensions";

const CONTRACT_URL = "https://github.com/enaanenterprises-hash/Nexus/blob/main/docs/extensions.md";

const SDK_SNIPPET = `const node = defineExtension({
  manifest: {
    id: "com.yourlab.atelier-node",
    apiVersion: 1,
    name: "Atelier Node",
    version: "0.1.0",
    description: "Shares live workflow context with Nexus.",
    capabilities: ["context", "tasks"],
  },
  handlers: {
    onActivate(rt) {
      rt.emit("nexus:proactive", {
        suggestion: "Atelier Node is wired in.",
        at: new Date().toISOString(),
      });
    },
  },
});

await extensionRegistry.register(node);
await extensionRegistry.activate(node.manifest.id);`;

/** Human-readable permission explanations for Apple HIG clarity. */
function describeCapability(cap: ExtensionCapability): { label: string; detail: string } {
  switch (cap) {
    case "tasks":
      return { label: "Tasks", detail: "Reads and coordinates active Today priorities." };
    case "context":
      return { label: "Shared Context", detail: "Exchanges live focus & workspace context with Core." };
    case "media":
      return { label: "Audio & Media", detail: "Captures, edits, and routes media sessions." };
    case "calendar":
      return { label: "Schedule", detail: "Coordinates time blocks and upcoming calendar events." };
    case "voice":
      return { label: "Voice", detail: "Participates in spoken prompts and voice output." };
    case "research":
      return { label: "Research", detail: "Accesses saved reading sources and highlights." };
    case "automations":
      return { label: "Automations", detail: "Listens to deterministic Command automation runs." };
    case "custom":
      return { label: "Custom Bus", detail: "Publishes custom typed module signals." };
    default: {
      const parts = cap.split(":");
      const kind = parts[1] ?? cap;
      const mode = parts[2] ?? "access";
      return {
        label: `${kind} (${mode})`,
        detail: `Scoped ${mode} access to shared “${kind}” content envelopes.`,
      };
    }
  }
}

type BusLogEntry = {
  id: string;
  type: string;
  source: string;
  summary: string;
  at: string;
};

function summarizeEvent(event: NexusEvent): string {
  switch (event.type) {
    case "extension:activated": {
      const p = event.payload as NexusEventMap["extension:activated"];
      return `Wired ${p.id.split(".").at(-1) ?? p.id} into ${p.slotId}`;
    }
    case "extension:deactivated": {
      const p = event.payload as NexusEventMap["extension:deactivated"];
      return `Released ${p.id.split(".").at(-1) ?? p.id} from ${p.slotId}`;
    }
    case "entitlement:changed": {
      const p = event.payload as NexusEventMap["entitlement:changed"];
      return p.isPro ? "Unlocked Nexus Pro preview sockets" : "Returned to Free tier (2 sockets)";
    }
    case "command:focus-changed": {
      const p = event.payload as NexusEventMap["command:focus-changed"];
      return p.focus ? `Focus started: ${p.focus.title}` : "Focus session ended";
    }
    case "command:automation-ran": {
      const p = event.payload as NexusEventMap["command:automation-ran"];
      return `Automation ran: ${p.run.recipeName}`;
    }
    case "command:connection-changed": {
      const p = event.payload as NexusEventMap["command:connection-changed"];
      return `${p.connectorId} ${p.connected ? "connected" : "disconnected"}`;
    }
    case "studio:take-routed": {
      const p = event.payload as NexusEventMap["studio:take-routed"];
      return `Routed “${p.title}” → ${p.intent}`;
    }
    case "nexus:proactive": {
      const p = event.payload as NexusEventMap["nexus:proactive"];
      return p.suggestion;
    }
    case "nexus:context": {
      const p = event.payload as NexusEventMap["nexus:context"];
      return p.focusSummary;
    }
    default:
      return event.type;
  }
}

/** Coordinates for the 5 orbital sockets arranged in a serene arch above the central Nexus Core. */
const CONSTELLATION_CORE = { x: 300, y: 248 };
const CONSTELLATION_SOCKETS = [
  { x: 96, y: 174 },
  { x: 186, y: 82 },
  { x: 300, y: 50 },
  { x: 414, y: 82 },
  { x: 504, y: 174 },
] as const;

function conduitPath(to: { x: number; y: number }): string {
  const cx1 = CONSTELLATION_CORE.x + (to.x - CONSTELLATION_CORE.x) * 0.14;
  const cy1 = CONSTELLATION_CORE.y - 68;
  const cx2 = to.x - (to.x - CONSTELLATION_CORE.x) * 0.22;
  const cy2 = to.y + 42;
  return `M ${CONSTELLATION_CORE.x} ${CONSTELLATION_CORE.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}

type Props = {
  hub: ExtensionHubSnapshot;
  selectedSlotId: SlotId | null;
  notice: string | null;
  onDismissNotice: () => void;
  onSelectSlot: (slotId: SlotId | null) => void;
  onSnap: (id: ExtensionId, slotId?: SlotId) => void;
  onRelease: (id: ExtensionId) => void;
  onTogglePro: () => void;
  onTransfer: (fromId: ExtensionId, toId?: ExtensionId) => void;
  onOpenStudio: () => void;
  onClose: () => void;
};

/** Full-screen Spatial Nodes Studio: visual socket constellation, live signal router, capability inspector & module catalog. */
export function NodesView({
  hub,
  selectedSlotId,
  notice,
  onDismissNotice,
  onSelectSlot,
  onSnap,
  onRelease,
  onTogglePro,
  onTransfer,
  onOpenStudio,
  onClose,
}: Props) {
  const { entitlement, slots, extensions } = hub;
  const activeSlots = slots.filter((s) => s.occupiedBy !== null);
  const maxSockets = entitlement.isPro ? slots.length : FREE_ACTIVE_EXTENSION_SLOTS;
  const availableExtensions = extensions.filter((e) => !slots.some((s) => s.occupiedBy === e.manifest.id));
  const hasRoom =
    slots.some((s) => !s.occupiedBy && canUseSlot(s, entitlement)) &&
    canActivateAnother(activeSlots.length, entitlement);

  // Default to the user-selected socket, or the first occupied socket, or slot 0
  const effectiveSlotId =
    selectedSlotId ?? activeSlots[0]?.id ?? slots[0]?.id ?? null;
  const inspectedSlot = slots.find((s) => s.id === effectiveSlotId) ?? slots[0] ?? null;
  const inspectedExt = inspectedSlot?.occupiedBy
    ? extensions.find((e) => e.manifest.id === inspectedSlot.occupiedBy) ?? null
    : null;
  const inspectedSlotUsable = inspectedSlot ? canUseSlot(inspectedSlot, entitlement) : false;

  // Catalog search & filter state
  const [search, setSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "connected" | "available" | "upcoming">("all");
  const [copiedSdk, setCopiedSdk] = useState(false);

  // Signal router state
  const liveExtensions = useMemo(
    () =>
      slots
        .filter((s) => s.occupiedBy !== null)
        .map((slot) => ({
          slot,
          ext: extensions.find((e) => e.manifest.id === slot.occupiedBy),
        }))
        .filter((item): item is { slot: typeof item.slot; ext: NonNullable<typeof item.ext> } =>
          Boolean(item.ext),
        ),
    [slots, extensions],
  );

  const [routeFromId, setRouteFromId] = useState<string>("");
  const [routeToId, setRouteToId] = useState<string>("__core__");
  const [activePulseSockets, setActivePulseSockets] = useState<number[]>([]);
  const pulseTimerRef = useRef<number | undefined>(undefined);

  const effectiveFromId = liveExtensions.some((item) => item.ext.manifest.id === routeFromId)
    ? routeFromId
    : (liveExtensions[0]?.ext.manifest.id ?? "");

  const effectiveToId =
    routeToId === "__core__" ||
    liveExtensions.some((item) => item.ext.manifest.id === routeToId && item.ext.manifest.id !== effectiveFromId)
      ? routeToId
      : "__core__";

  // Live nexusBus event stream
  const [busLog, setBusLog] = useState<BusLogEntry[]>([]);
  useEffect(() => {
    const unsub = nexusBus.subscribe("*", (event) => {
      if (event.type === "nexus:state") return;
      const entry: BusLogEntry = {
        id: `${event.at}-${Math.random().toString(36).slice(2, 7)}`,
        type: event.type,
        source: event.source,
        summary: summarizeEvent(event),
        at: event.at,
      };
      setBusLog((prev) => [entry, ...prev].slice(0, 14));
    });
    return () => {
      unsub();
      window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  function fireRoute(fromId: ExtensionId, toId?: ExtensionId) {
    const fromIdx = slots.findIndex((s) => s.occupiedBy === fromId);
    const toIdx = toId ? slots.findIndex((s) => s.occupiedBy === toId) : -1;
    const indices = [fromIdx, toIdx].filter((i) => i >= 0);
    setActivePulseSockets(indices);
    window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setActivePulseSockets([]), 1900);

    onTransfer(fromId, toId);
    const fromName = extensions.find((e) => e.manifest.id === fromId)?.manifest.name ?? "Node";
    const toName = toId
      ? (extensions.find((e) => e.manifest.id === toId)?.manifest.name ?? "Node")
      : "Command Core";
    nexusBus.emit(
      "nexus:proactive",
      { suggestion: `Signal routed: ${fromName} → ${toName}`, at: new Date().toISOString() },
      fromId,
    );
  }

  async function copySdkSnippet() {
    try {
      await navigator.clipboard.writeText(SDK_SNIPPET);
      setCopiedSdk(true);
      window.setTimeout(() => setCopiedSdk(false), 1800);
    } catch {
      // Clipboard unavailable in insecure context
    }
  }

  const normalizedQuery = search.trim().toLowerCase();
  const filteredRegistered = useMemo(() => {
    if (catalogFilter === "upcoming") return [];
    return extensions.filter((ext) => {
      const connected = slots.some((s) => s.occupiedBy === ext.manifest.id);
      if (catalogFilter === "connected" && !connected) return false;
      if (catalogFilter === "available" && connected) return false;
      if (!normalizedQuery) return true;
      return (
        ext.manifest.name.toLowerCase().includes(normalizedQuery) ||
        ext.manifest.description.toLowerCase().includes(normalizedQuery) ||
        ext.manifest.capabilities.some((c) => c.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [catalogFilter, extensions, normalizedQuery, slots]);

  const filteredPlanned = useMemo(() => {
    if (catalogFilter === "connected" || catalogFilter === "available") return [];
    if (!normalizedQuery) return PLANNED_EXTENSIONS;
    return PLANNED_EXTENSIONS.filter(
      (p) =>
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.tagline.toLowerCase().includes(normalizedQuery),
    );
  }, [catalogFilter, normalizedQuery]);

  return (
    <section aria-label="Modular nodes" className="nodes-screen">
      {/* Top Liquid Glass Header */}
      <header className="nodes-header flex shrink-0 flex-wrap items-center justify-between gap-3 py-2.5 pr-4 pl-[66px] sm:pr-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="font-editorial text-[1.2rem] leading-none font-normal tracking-[-0.018em] text-foreground sm:text-[1.3rem]">
            Modular nodes
          </h2>
          <span className="hidden text-[12px] tabular-nums text-muted-foreground sm:inline">
            {activeSlots.length} of {maxSockets} {entitlement.isPro ? "Pro" : "free"} sockets active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Socket Occupancy Indicator */}
          <div
            className="hidden items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1.5 md:flex"
            aria-label={`${activeSlots.length} of ${maxSockets} sockets occupied`}
          >
            {slots.map((s) => {
              const live = Boolean(s.occupiedBy);
              const open = canUseSlot(s, entitlement);
              return (
                <span
                  key={s.id}
                  className={`h-1.5 w-4 rounded-full transition-colors ${
                    live
                      ? "bg-[color:var(--land-gold)]"
                      : open
                        ? "bg-foreground/20"
                        : "bg-foreground/8"
                  }`}
                />
              );
            })}
          </div>

          <Button
            type="button"
            size="sm"
            variant={entitlement.isPro ? "outline" : "default"}
            onClick={onTogglePro}
            className={
              entitlement.isPro
                ? "h-8 gap-1.5 rounded-full px-3 text-[12px]"
                : "h-8 gap-1.5 rounded-full border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/15 px-3 text-[12px] text-foreground hover:bg-[color:var(--land-gold)]/25"
            }
          >
            <Sparkles className="size-3.5 text-[color:var(--land-gold)]" />
            <span>{entitlement.isPro ? "Pro preview active" : "Preview Pro"}</span>
          </Button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                  aria-label="Close Nodes"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Back to the network</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Main Scrollable Spatial Architecture Workspace */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-6 pb-10">
          {notice ? (
            <Alert role="status" className="rounded-2xl border-border/80 bg-card/90 py-2.5">
              <AlertDescription className="text-[13px] text-foreground">{notice}</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDismissNotice}
                  aria-label="Dismiss"
                >
                  <X className="size-3.5" />
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {/* Row 1: Spatial Socket Constellation + Precision Inspector */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
            {/* Spatial Socket Constellation */}
            <div className="nodes-constellation-stage flex flex-col justify-between p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-editorial text-[1.35rem] leading-tight font-normal text-foreground">
                    Socket topology
                  </h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Select any orbital socket to inspect capabilities, snap modules in, or route a
                    live signal across the core.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full px-2.5 font-mono text-[10.5px] tabular-nums"
                >
                  {activeSlots.length}/{maxSockets} wired
                </Badge>
              </div>

              {/* Interactive SVG Constellation */}
              <div className="relative my-3 w-full">
                <svg
                  viewBox="0 0 600 300"
                  className="mx-auto block h-auto w-full max-w-[600px] overflow-visible"
                  role="img"
                  aria-label="Nexus 5-socket constellation map"
                >
                  {/* Subtle orbital reference arc */}
                  <path
                    d="M 96 174 A 220 220 0 0 1 504 174"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.08"
                    strokeWidth="1"
                    strokeDasharray="3 6"
                  />

                  {/* Conduits from Core to all 5 sockets */}
                  {slots.map((slot, idx) => {
                    const pt = CONSTELLATION_SOCKETS[idx];
                    if (!pt) return null;
                    const occupied = Boolean(slot.occupiedBy);
                    const usable = canUseSlot(slot, entitlement);
                    const isSelected = inspectedSlot?.id === slot.id;
                    const isPulsing = activePulseSockets.includes(idx);
                    const d = conduitPath(pt);

                    return (
                      <g key={slot.id}>
                        {/* Base hairline conduit */}
                        <path
                          d={d}
                          fill="none"
                          stroke={occupied ? "var(--land-gold)" : "currentColor"}
                          strokeOpacity={
                            isPulsing ? 0.9 : occupied ? (isSelected ? 0.65 : 0.36) : usable ? 0.14 : 0.08
                          }
                          strokeWidth={isPulsing ? 2.4 : occupied ? (isSelected ? 1.8 : 1.35) : 1}
                          strokeDasharray={occupied ? undefined : "4 5"}
                          style={{ transition: "stroke-opacity 240ms ease, stroke-width 240ms ease" }}
                        />
                        {/* Animated travelling energy dashes on live conduits */}
                        {occupied ? (
                          <path
                            d={d}
                            fill="none"
                            stroke="var(--land-gold)"
                            strokeOpacity={isPulsing ? 1 : 0.72}
                            strokeWidth={isPulsing ? 2.8 : 1.5}
                            className="nodes-conduit-active"
                          />
                        ) : null}
                      </g>
                    );
                  })}

                  {/* Central Nexus Core Medallion */}
                  <g transform={`translate(${CONSTELLATION_CORE.x}, ${CONSTELLATION_CORE.y})`}>
                    <circle
                      r="34"
                      fill="var(--land-gold)"
                      fillOpacity="0.08"
                      stroke="var(--land-gold)"
                      strokeOpacity="0.34"
                      strokeWidth="1"
                    />
                    <circle
                      r="24"
                      fill="var(--card)"
                      stroke="var(--land-gold)"
                      strokeOpacity="0.72"
                      strokeWidth="1.25"
                    />
                    <g transform="translate(-11, -11) scale(0.22)" fill="var(--land-gold)">
                      <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" />
                      <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" transform="rotate(120 50 52)" />
                      <path d="M58.5 7.5 L85.5 23 L85.5 52 L58.5 52 Z" transform="rotate(240 50 52)" />
                    </g>
                    <text
                      y="47"
                      textAnchor="middle"
                      fill="currentColor"
                      fillOpacity="0.58"
                      fontSize="10.5"
                      fontWeight="500"
                    >
                      Nexus Core
                    </text>
                  </g>

                  {/* 5 Interactive Orbital Sockets */}
                  {slots.map((slot, idx) => {
                    const pt = CONSTELLATION_SOCKETS[idx];
                    if (!pt) return null;
                    const ext = slot.occupiedBy
                      ? extensions.find((e) => e.manifest.id === slot.occupiedBy) ?? null
                      : null;
                    const usable = canUseSlot(slot, entitlement);
                    const isSelected = inspectedSlot?.id === slot.id;
                    const isPulsing = activePulseSockets.includes(idx);
                    const label = ext
                      ? ext.manifest.name
                      : usable
                        ? `Open · ${slot.tier === "pro" ? "Pro" : "Free"}`
                        : placeholderName(slot.placeholderKey);
                    const monogram = ext ? (ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)) : "";

                    return (
                      <g
                        key={slot.id}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onClick={() => onSelectSlot(slot.id)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${slot.label}: ${label}`}
                        aria-pressed={isSelected}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectSlot(slot.id);
                          }
                        }}
                        className="cursor-pointer outline-none"
                      >
                        {/* Pulse ring when selected or routing signal */}
                        {isSelected || isPulsing ? (
                          <circle
                            r="29"
                            fill="none"
                            stroke="var(--land-gold)"
                            strokeOpacity={isPulsing ? 0.78 : 0.45}
                            strokeWidth="1.25"
                            className={isPulsing ? "nodes-signal-ring" : undefined}
                          />
                        ) : null}

                        {/* Outer reticle ring */}
                        <circle
                          r="23"
                          fill="var(--card)"
                          stroke={ext ? "var(--land-gold)" : "currentColor"}
                          strokeOpacity={
                            isSelected ? 0.92 : ext ? 0.7 : usable ? 0.3 : 0.16
                          }
                          strokeWidth={isSelected ? 1.85 : ext ? 1.4 : 1.15}
                          strokeDasharray={ext ? undefined : usable ? "3 3" : "2 4"}
                          style={{ transition: "stroke-opacity 200ms ease, stroke-width 200ms ease" }}
                        />

                        {/* Inner symbol */}
                        {ext ? (
                          <text
                            y="4"
                            textAnchor="middle"
                            fill="currentColor"
                            fontSize="11.5"
                            fontWeight="600"
                            letterSpacing="0.02em"
                          >
                            {monogram}
                          </text>
                        ) : usable ? (
                          <text
                            y="5"
                            textAnchor="middle"
                            fill="var(--land-gold)"
                            fontSize="16"
                            fontWeight="400"
                          >
                            +
                          </text>
                        ) : (
                          <circle
                            r="3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeOpacity="0.4"
                            strokeWidth="1.2"
                          />
                        )}

                        {/* Socket caption */}
                        <text
                          y="-31"
                          textAnchor="middle"
                          fill="currentColor"
                          fillOpacity={ext || isSelected ? 0.94 : 0.56}
                          fontSize="11"
                          fontWeight={ext || isSelected ? "600" : "500"}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Interactive Signal Router Bar */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/80 bg-background/60 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Radio className="size-3.5 text-[color:var(--land-gold)]" />
                    Signal router
                  </span>
                  {liveExtensions.length > 0 ? (
                    <>
                      <select
                        aria-label="Source node"
                        value={effectiveFromId}
                        onChange={(e) => setRouteFromId(e.target.value)}
                        className="cmd-field h-8 rounded-full px-3 text-[12px]"
                      >
                        {liveExtensions.map((item) => (
                          <option key={item.ext.manifest.id} value={item.ext.manifest.id}>
                            {item.ext.manifest.name}
                          </option>
                        ))}
                      </select>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <select
                        aria-label="Destination node"
                        value={effectiveToId}
                        onChange={(e) => setRouteToId(e.target.value)}
                        className="cmd-field h-8 rounded-full px-3 text-[12px]"
                      >
                        <option value="__core__">Command Core</option>
                        {liveExtensions
                          .filter((item) => item.ext.manifest.id !== effectiveFromId)
                          .map((item) => (
                            <option key={item.ext.manifest.id} value={item.ext.manifest.id}>
                              {item.ext.manifest.name}
                            </option>
                          ))}
                      </select>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Snap in a node to test live routing.</span>
                  )}
                </div>

                {liveExtensions.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      fireRoute(
                        effectiveFromId,
                        effectiveToId === "__core__" ? undefined : effectiveToId,
                      )
                    }
                    className="h-8 gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background hover:bg-foreground/90"
                  >
                    <Zap className="size-3.5" />
                    <span>Route signal</span>
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Precision Socket & Capability Inspector */}
            <aside className="nodes-panel-card flex flex-col justify-between gap-5 p-5 sm:p-6">
              {inspectedSlot ? (
                inspectedExt ? (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[color:var(--land-gold)]/45 bg-[color:var(--land-gold)]/12 text-[13px] font-semibold text-foreground">
                            {inspectedExt.manifest.monogram ?? inspectedExt.manifest.name.slice(0, 2)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="size-1.5 rounded-full bg-[color:var(--land-gold)]" />
                              <span className="text-[11.5px] font-medium text-muted-foreground">
                                {inspectedSlot.label} · Connected
                              </span>
                            </div>
                            <h3 className="font-editorial text-[1.45rem] leading-tight font-normal text-foreground">
                              {inspectedExt.manifest.name}
                            </h3>
                          </div>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10.5px]">
                          v{inspectedExt.manifest.version}
                        </Badge>
                      </div>

                      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                        {inspectedExt.manifest.description}
                      </p>

                      {/* Capability & Permission Matrix */}
                      <div className="space-y-2">
                        <p className="text-[12px] font-medium text-foreground">
                          Declared capabilities ({inspectedExt.manifest.capabilities.length})
                        </p>
                        <ul className="space-y-2">
                          {inspectedExt.manifest.capabilities.map((cap) => {
                            const info = describeCapability(cap);
                            return (
                              <li
                                key={cap}
                                className="rounded-xl border border-border/80 bg-background/55 px-3 py-2"
                              >
                                <p className="text-[12.5px] font-medium text-foreground">{info.label}</p>
                                <p className="text-[11.5px] text-muted-foreground">{info.detail}</p>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
                      {inspectedExt.manifest.id === STUDIO_NODE_ID ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={onOpenStudio}
                          className="h-9 gap-1.5 rounded-full bg-foreground px-4 text-[12.5px] text-background hover:bg-foreground/90"
                        >
                          <span>Open Studio</span>
                          <ArrowUpRight className="size-3.5" />
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fireRoute(inspectedExt.manifest.id)}
                        className="h-9 gap-1.5 rounded-full px-3.5 text-[12.5px]"
                      >
                        <Zap className="size-3.5 text-[color:var(--land-gold)]" />
                        <span>Ping network</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onRelease(inspectedExt.manifest.id)}
                        className="ml-auto h-9 rounded-full px-3 text-[12.5px] text-muted-foreground hover:text-destructive"
                      >
                        Release
                      </Button>
                    </div>
                  </>
                ) : inspectedSlotUsable ? (
                  <div className="flex h-full flex-col justify-between gap-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Plus className="size-3.5 text-[color:var(--land-gold)]" />
                        <span>{inspectedSlot.label} · Open socket</span>
                      </div>
                      <h3 className="font-editorial text-[1.45rem] leading-tight font-normal text-foreground">
                        Ready for a node
                      </h3>
                      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                        {inspectedSlot.description}. Choose an available module below to snap directly
                        into this socket.
                      </p>

                      {availableExtensions.length > 0 ? (
                        <ul className="mt-4 space-y-2">
                          {availableExtensions.map((ext) => (
                            <li
                              key={ext.manifest.id}
                              className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/55 px-3 py-2.5"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-[11px] font-semibold">
                                {ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-medium text-foreground">
                                  {ext.manifest.name}
                                </p>
                                <p className="truncate text-[11.5px] text-muted-foreground">
                                  {ext.manifest.description}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => onSnap(ext.manifest.id, inspectedSlot.id)}
                                className="h-8 rounded-full bg-foreground px-3.5 text-[12px] text-background hover:bg-foreground/90"
                              >
                                Snap in
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">
                          Every currently registered module is already wired into your network.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col justify-between gap-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Lock className="size-3.5" />
                        <span>{inspectedSlot.label} · Pro socket</span>
                      </div>
                      <h3 className="font-editorial text-[1.45rem] leading-tight font-normal text-foreground">
                        Reserved for {placeholderName(inspectedSlot.placeholderKey)}
                      </h3>
                      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                        {inspectedSlot.description}. Nexus Free includes {FREE_ACTIVE_EXTENSION_SLOTS}{" "}
                        concurrent live sockets. Toggle Preview Pro to unlock all {slots.length}{" "}
                        sockets right now and experiment with a full constellation.
                      </p>
                    </div>

                    <Button
                      type="button"
                      onClick={onTogglePro}
                      className="h-10 gap-2 rounded-full bg-foreground px-5 text-[13px] text-background hover:bg-foreground/90"
                    >
                      <Sparkles className="size-4 text-[color:var(--land-gold)]" />
                      <span>Preview Pro sockets</span>
                    </Button>
                  </div>
                )
              ) : null}
            </aside>
          </div>

          {/* Row 2: Module Atelier Catalog + Live Event Bus & SDK */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
            {/* Searchable Module Catalog */}
            <div className="nodes-panel-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-editorial text-[1.35rem] leading-tight font-normal text-foreground">
                    Module atelier
                  </h3>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Registered extensions built on the public Nexus extension contract.
                  </p>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter modules…"
                    aria-label="Filter modules"
                    className="cmd-field h-8 w-full rounded-full pr-7 pl-8 text-[12.5px]"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear filter"
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Module filter">
                {(
                  [
                    { id: "all", label: "All", count: extensions.length + PLANNED_EXTENSIONS.length },
                    { id: "connected", label: "Connected", count: activeSlots.length },
                    { id: "available", label: "Available", count: availableExtensions.length },
                    { id: "upcoming", label: "Upcoming", count: PLANNED_EXTENSIONS.length },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={catalogFilter === item.id}
                    onClick={() => setCatalogFilter(item.id)}
                    className={`cmd-preset-chip ${catalogFilter === item.id ? "cmd-preset-chip--active" : ""}`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10.5px] tabular-nums opacity-70">{item.count}</span>
                  </button>
                ))}
              </div>

              {filteredRegistered.length > 0 ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {filteredRegistered.map((ext) => {
                    const boundSlot = slots.find((s) => s.occupiedBy === ext.manifest.id) ?? null;
                    const isLive = Boolean(boundSlot);
                    return (
                      <div
                        key={ext.manifest.id}
                        className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all ${
                          isLive
                            ? "border-[color:var(--land-gold)]/38 bg-[color:var(--land-gold)]/[0.04]"
                            : "border-border/80 bg-background/50 hover:border-foreground/25"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`grid size-9 shrink-0 place-items-center rounded-xl text-[11px] font-semibold ${
                                  isLive
                                    ? "border border-[color:var(--land-gold)]/50 bg-[color:var(--land-gold)]/14 text-foreground"
                                    : "border border-border bg-card text-muted-foreground"
                                }`}
                              >
                                {ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-medium text-foreground">
                                  {ext.manifest.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {boundSlot ? boundSlot.label : "Ready to snap in"}
                                </p>
                              </div>
                            </div>
                            {isLive ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--land-gold)]/15 px-2 py-0.5 text-[10.5px] font-medium text-[color:var(--land-gold-soft)]">
                                <span className="size-1.5 rounded-full bg-[color:var(--land-gold)]" />
                                Live
                              </span>
                            ) : null}
                          </div>

                          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                            {ext.manifest.description}
                          </p>

                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {ext.manifest.capabilities.slice(0, 3).map((cap) => (
                              <Badge
                                key={cap}
                                variant="secondary"
                                className="h-5 px-2 text-[10.5px] font-normal"
                              >
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          {isLive && boundSlot ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  ext.manifest.id === STUDIO_NODE_ID
                                    ? onOpenStudio()
                                    : onSelectSlot(boundSlot.id)
                                }
                                className="h-8 rounded-full px-3 text-[12px]"
                              >
                                {ext.manifest.id === STUDIO_NODE_ID ? "Open Studio" : "Inspect"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onRelease(ext.manifest.id)}
                                className="ml-auto h-8 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-destructive"
                              >
                                Release
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onSnap(ext.manifest.id)}
                              className={
                                hasRoom
                                  ? "h-8 rounded-full bg-foreground px-3.5 text-[12px] text-background hover:bg-foreground/90"
                                  : "h-8 rounded-full border border-border bg-transparent px-3.5 text-[12px] text-foreground hover:bg-muted"
                              }
                            >
                              {hasRoom ? "Snap in" : "Unlock with Pro"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {filteredPlanned.length > 0 ? (
                <div className="mt-6">
                  <p className="text-[12px] font-medium text-muted-foreground">
                    Upcoming first-party nodes
                  </p>
                  <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                    {filteredPlanned.map((p) => (
                      <div
                        key={p.key}
                        className="rounded-xl border border-dashed border-border/80 bg-background/30 px-3.5 py-3"
                      >
                        <p className="text-[13.5px] font-medium text-foreground/85">{p.name}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{p.tagline}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {filteredRegistered.length === 0 && filteredPlanned.length === 0 ? (
                <p className="mt-6 rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
                  No modules match “{search}”.
                </p>
              ) : null}
            </div>

            {/* Right Stack: Real-time nexusBus Activity Stream + Copyable SDK */}
            <div className="flex flex-col gap-5">
              {/* Live Event Bus Monitor */}
              <div className="nodes-panel-card flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-[color:var(--land-gold)]" />
                    <h3 className="font-editorial text-[1.2rem] font-normal text-foreground">
                      Live network bus
                    </h3>
                  </div>
                  {busLog.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setBusLog([])}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="size-3" />
                      Clear
                    </button>
                  ) : null}
                </div>

                {busLog.length > 0 ? (
                  <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {busLog.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border border-border/75 bg-background/60 px-3 py-2 text-[12px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10.5px] text-[color:var(--land-gold-soft)]">
                            {entry.type}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                            {new Date(entry.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-foreground">{entry.summary}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-border/80 bg-background/35 px-3.5 py-5 text-[12.5px] leading-relaxed text-muted-foreground">
                    Listening on <code className="dash-code text-foreground">nexusBus</code>. Snap a
                    node, toggle Pro, or route a signal above to watch live typed events stream here.
                  </p>
                )}
              </div>

              {/* Build a Node SDK Starter */}
              <div className="nodes-panel-card flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-editorial text-[1.2rem] font-normal text-foreground">
                    Build a node
                  </h3>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void copySdkSnippet()}
                    className="h-7 gap-1.5 rounded-full px-2.5 text-[11.5px]"
                  >
                    {copiedSdk ? (
                      <>
                        <Check className="size-3 text-[color:var(--land-gold)]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span>Copy starter</span>
                      </>
                    )}
                  </Button>
                </div>

                <pre className="dash-code max-h-48 overflow-auto rounded-xl border border-border/80 bg-background/60 p-3 text-[11px] leading-relaxed">
                  {SDK_SNIPPET}
                </pre>

                <a
                  href={CONTRACT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-foreground underline underline-offset-4 hover:text-[color:var(--land-gold-soft)]"
                >
                  <span>Read the extension contract</span>
                  <ArrowUpRight className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
