"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { NexusMark } from "@/components/landing/NexusLogo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NexusMenuButton } from "./NexusMenuButton";
import { CommandView, type CommandTab } from "@/components/command/CommandView";
import { ResearchView } from "@/components/research/ResearchView";
import { StudioView } from "@/components/studio/StudioView";
import type { Viewer } from "@/lib/auth/types";
import { COMMAND_NODE_ID } from "@/extensions/command/node";
import { RESEARCH_NODE_ID } from "@/extensions/research/node";
import { SAMPLE_EXTENSIONS } from "@/extensions/samples";
import { STUDIO_NODE_ID, studioExtension } from "@/extensions/studio/node";
import {
  canUseSlot,
  extensionRegistry,
  nexusBus,
  setStubPro,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";
import { useExtensionHub } from "@/lib/extensions/use-extension-hub";
import { getConnector } from "@/lib/connectors/catalog";
import { researchIntent } from "@/lib/nexus/brain";
import { ExtensionHub } from "./ExtensionHub";
import { ExtensionPanel } from "./ExtensionPanel";
import {
  NeuralStage,
  type SocketVisual,
  type StageSignal,
  type StageTransfer,
} from "./NeuralStage";
import { computeCoreCenter } from "./stage-layout";
import { NodeMenu, NodeRail, type PanelId, type Surface } from "./NodeNav";
import { NexusInput, NexusVoice } from "./NexusVoice";
import { SETUP_RESUME_KEY, SetupExperience, type SetupStep } from "./SetupExperience";
import { SettingsPanel } from "./SettingsPanel";
import { TodayPanel } from "./TodayPanel";
import { useNexusSession } from "./use-nexus-session";
import { useTheme } from "@/lib/theme";

const SETUP_DONE_KEY = "nexus:setup-done.v1";
const INSTALLED_NODES_KEY = "nexus:installed-nodes.v1";
const BUILTIN_EXTENSIONS = [studioExtension, ...SAMPLE_EXTENSIONS] as const;
const DEFAULT_NODE_IDS: ExtensionId[] = [
  STUDIO_NODE_ID,
  "dev.nexus.sample.daily-brief",
];

function readSavedNodes(): ExtensionId[] | null {
  try {
    const raw = window.localStorage.getItem(INSTALLED_NODES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is ExtensionId => typeof id === "string") : null;
  } catch {
    return null;
  }
}

function saveInstalledNodes(ids: readonly ExtensionId[]) {
  try {
    window.localStorage.setItem(INSTALLED_NODES_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage access errors
  }
  void fetch("/api/user/state", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installedNodes: ids }),
  }).catch(() => {});
}

function clearResumeSetupStep() {
  try {
    document.cookie = "nexus_setup_resume=; path=/; max-age=0; SameSite=Lax";
    window.sessionStorage.removeItem(SETUP_RESUME_KEY);
    window.localStorage.removeItem(SETUP_RESUME_KEY);
  } catch {
    // Ignore storage access errors
  }
}

/** Research is hidden from navigation for now; its node, routes and tables stay in place. */
const RESEARCH_VISIBLE = false;

const OAUTH_ERRORS: Record<string, string> = {
  config: "That service isn't set up on the server yet.",
  denied: "Access was not granted.",
  state: "The sign-in expired. Try connecting again.",
  exchange: "The service didn't accept the sign-in. Try again.",
  unknown: "Unknown service.",
};

const PRODUCT_PAYLOAD_LABELS: Record<string, string> = {
  [STUDIO_NODE_ID]: "Studio",
  "dev.nexus.sample.daily-brief": "Daily Brief",
  "dev.nexus.sample.focus-guard": "Focus Guard",
  "dev.nexus.sample.quick-capture": "Quick Capture",
  "dev.nexus.sample.ledger": "Ledger",
};

export function Dashboard({
  viewer,
  initialSetupDone = true,
  initialSetupStep = null,
  initialOauthNotice = null,
}: {
  viewer: Viewer;
  initialSetupDone?: boolean;
  initialSetupStep?: SetupStep | null;
  initialOauthNotice?: { ok: boolean; text: string } | null;
}) {
  const session = useNexusSession();
  const hub = useExtensionHub();
  const { theme } = useTheme();
  const viewerKey = viewer.email ?? "signed-in";
  const [viewerName, setViewerName] = useState<string | null>(viewer.name);

  const [setupDone, setSetupDone] = useState(initialSetupDone);
  const [setupResumeStep, setSetupResumeStep] = useState<SetupStep | null>(initialSetupStep);
  const [setupNotice, setSetupNotice] = useState<{ ok: boolean; text: string } | null>(initialOauthNotice);
  const [setupReveal, setSetupReveal] = useState(false);
  const [setupRevealCoreY, setSetupRevealCoreY] = useState<number | null>(null);

  const [surface, setSurface] = useState<Surface>({ view: "home", panel: null });
  const [researchMounted, setResearchMounted] = useState(false);
  const [researchRequest, setResearchRequest] = useState<{ input: string; serial: number } | null>(null);
  const [commandMounted, setCommandMounted] = useState(false);
  const [commandOpenCount, setCommandOpenCount] = useState(0);
  const [studioMounted, setStudioMounted] = useState(false);
  const [commandRequest, setCommandRequest] = useState<{
    tab: CommandTab;
    service: string | null;
    notice: string | null;
    serial: number;
  } | null>(null);
  const [selected, setSelected] = useState<SlotId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<StageTransfer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const noticeTimer = useRef<number | undefined>(undefined);
  const bootedRef = useRef(false);
  const bootCompleteRef = useRef(false);
  const persistedNodesRef = useRef(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuNavRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const openResearch = useCallback((input?: string) => {
    setResearchMounted(true);
    setMenuOpen(false);
    setSurface({ view: "research", panel: null });
    if (input !== undefined) setResearchRequest((r) => ({ input, serial: (r?.serial ?? 0) + 1 }));
  }, []);

  const openCommand = useCallback(
    (request?: { tab: CommandTab; service: string | null; notice: string | null }) => {
      setCommandMounted(true);
      setCommandOpenCount((c) => c + 1);
      setMenuOpen(false);
      setSurface({ view: "command", panel: null });
      if (request) setCommandRequest((r) => ({ ...request, serial: (r?.serial ?? 0) + 1 }));
    },
    [],
  );

  const openStudio = useCallback(() => {
    setStudioMounted(true);
    setMenuOpen(false);
    setSurface({ view: "studio", panel: null });
  }, []);

  const openPanel = useCallback(
    (panel: PanelId) => {
      if (typeof panel === "object" && panel.extension === STUDIO_NODE_ID) {
        openStudio();
        return;
      }
      setSurface((s) => {
        const same =
          typeof panel === "string"
            ? s.panel === panel
            : typeof s.panel === "object" && s.panel?.extension === panel.extension;
        return { view: s.view, panel: same ? null : panel };
      });
    },
    [openStudio],
  );

  const goHome = useCallback(() => {
    setSurface({ view: "home", panel: null });
    setMenuOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((v) => !v);
  }, []);

  const handleOpenCommand = useCallback(() => {
    openCommand();
  }, [openCommand]);

  const hubRef = useRef(hub);
  useEffect(() => {
    hubRef.current = hub;
  }, [hub]);

  const selectSlot = useCallback(
    (slotId: SlotId) => {
      const currentHub = hubRef.current;
      const slot = currentHub.slots.find((s) => s.id === slotId);
      if (!slot) return;
      if (slot.occupiedBy) {
        openPanel({ extension: slot.occupiedBy });
        return;
      }
      setSelected(slotId);
      setSurface((s) => ({ ...s, panel: "nodes" }));
      flash(
        canUseSlot(slot, currentHub.entitlement)
          ? "Socket selected. Choose an extension to snap into it."
          : "Pro sockets unlock with Nexus Pro. Try “Preview Pro” to open them.",
      );
    },
    [openPanel, flash],
  );

  const handleSelectSocket = useCallback(
    (idx: number) => {
      const slot = hubRef.current.slots[idx];
      if (slot) selectSlot(slot.id);
    },
    [selectSlot],
  );

  // Register sample extensions and restore selected Laniakea nodes once setup is complete
  useEffect(() => {
    const timer = noticeTimer.current;
    async function bootExtensions() {
      for (const extension of BUILTIN_EXTENSIONS) {
        if (!extensionRegistry.get(extension.manifest.id)) {
          await extensionRegistry.register(extension);
        }
      }
      if (setupDone && !bootedRef.current) {
        bootedRef.current = true;
        let remoteNodes: ExtensionId[] | null = null;
        try {
          const res = await fetch("/api/user/state", { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as { installedNodes?: unknown };
            if (Array.isArray(data.installedNodes) && data.installedNodes.length > 0) {
              remoteNodes = data.installedNodes.filter((id): id is ExtensionId => typeof id === "string");
              try {
                window.localStorage.setItem(INSTALLED_NODES_KEY, JSON.stringify(remoteNodes));
              } catch {
                // Ignore storage access errors
              }
            }
          }
        } catch {
          // Offline or unconfigured database fallback uses localStorage
        }
        const snap = extensionRegistry.getSnapshot();
        const anyOccupied = snap.slots.some((s) => s.occupiedBy !== null);
        if (!anyOccupied) {
          const initialNodes = remoteNodes ?? readSavedNodes() ?? DEFAULT_NODE_IDS;
          for (const nodeId of initialNodes) {
            if (extensionRegistry.get(nodeId)) {
              await extensionRegistry.activate(nodeId);
            }
          }
        }
        bootCompleteRef.current = true;
      }
    }
    void bootExtensions();
    return () => window.clearTimeout(timer);
  }, [setupDone]);

  useEffect(
    () =>
      nexusBus.subscribe("nexus:open-node", (event) => {
        if (event.payload.nodeId === COMMAND_NODE_ID) openCommand();
        else if (event.payload.nodeId === RESEARCH_NODE_ID && RESEARCH_VISIBLE) openResearch(event.payload.input);
        else if (extensionRegistry.get(event.payload.nodeId)) openPanel({ extension: event.payload.nodeId });
      }),
    [openCommand, openPanel, openResearch],
  );

  // Automatically visualize bus events as travelling product comets between Laniakea arms
  useEffect(() => {
    const unsubCommand = nexusBus.subscribe("command:item-published", () => {
      const snap = extensionRegistry.getSnapshot();
      const ledgerIdx = snap.slots.findIndex((s) => s.occupiedBy === "dev.nexus.sample.ledger");
      const targetIdx = ledgerIdx >= 0 ? ledgerIdx : snap.slots.findIndex((s) => s.occupiedBy !== null);
      if (targetIdx >= 0) {
        const targetId = snap.slots[targetIdx]?.occupiedBy;
        const targetName = targetId
          ? (extensionRegistry.get(targetId)?.manifest.name ?? PRODUCT_PAYLOAD_LABELS[targetId] ?? "Node")
          : "Node";
        setTransfer((prev) => ({
          fromSocket: -1,
          toSocket: targetIdx,
          label: `Command → ${targetName}`,
          serial: (prev?.serial ?? 0) + 1,
        }));
      }
    });

    const unsubProactive = nexusBus.subscribe("nexus:proactive", (event) => {
      if (!bootCompleteRef.current) return;
      if (event.source === "nexus" || event.source === "system") return;
      const snap = extensionRegistry.getSnapshot();
      const fromIdx = snap.slots.findIndex((s) => s.occupiedBy === event.source);
      if (fromIdx >= 0) {
        const otherIdx = snap.slots.findIndex((s, idx) => idx !== fromIdx && s.occupiedBy !== null);
        const fromName =
          extensionRegistry.get(event.source)?.manifest.name ??
          PRODUCT_PAYLOAD_LABELS[event.source] ??
          "Node";
        const otherId = otherIdx >= 0 ? snap.slots[otherIdx]?.occupiedBy : null;
        const toName = otherId
          ? (extensionRegistry.get(otherId)?.manifest.name ?? PRODUCT_PAYLOAD_LABELS[otherId] ?? "Node")
          : "Command";
        setTransfer((prev) => ({
          fromSocket: fromIdx,
          toSocket: otherIdx >= 0 ? otherIdx : -1,
          label: `${fromName} → ${toName}`,
          serial: (prev?.serial ?? 0) + 1,
        }));
      }
    });

    const unsubStudioRouted = nexusBus.subscribe("studio:take-routed", (event) => {
      const snap = extensionRegistry.getSnapshot();
      const fromIdx = snap.slots.findIndex((s) => s.occupiedBy === STUDIO_NODE_ID);
      if (fromIdx < 0) return;
      const targetId = event.payload.targetNodeId;
      const explicitIdx = targetId ? snap.slots.findIndex((s) => s.occupiedBy === targetId) : -1;
      const targetName =
        event.payload.intent === "video-studio"
          ? "Video Studio"
          : event.payload.intent === "study-space"
            ? "Study Space"
            : event.payload.intent === "ai-notes"
              ? "AI Notes"
              : targetId
                ? (extensionRegistry.get(targetId)?.manifest.name ?? PRODUCT_PAYLOAD_LABELS[targetId] ?? "Node")
                : "Command";
      setTransfer((prev) => ({
        fromSocket: fromIdx,
        toSocket: explicitIdx >= 0 ? explicitIdx : -1,
        label: `Studio → ${targetName}`,
        serial: (prev?.serial ?? 0) + 1,
      }));
      flash(`Routed “${event.payload.title}” to ${targetName}.`);
    });

    return () => {
      unsubCommand();
      unsubProactive();
      unsubStudioRouted();
    };
  }, [flash]);

  useEffect(() => {
    clearResumeSetupStep();
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("command");
    if (!outcome) return;
    window.history.replaceState(null, "", window.location.pathname);

    if (!initialSetupDone || initialSetupStep) return;

    const ids = (params.get("service") ?? "").split(",").filter(Boolean);
    const name = ids.length ? ids.map((id) => getConnector(id)?.name ?? id).join(" and ") : "The service";
    const notice =
      outcome === "connected"
        ? `${name} is connected.`
        : `${name} couldn't connect. ${OAUTH_ERRORS[params.get("reason") ?? ""] ?? ""}`.trim();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      openCommand({
        tab: outcome === "connected" ? "overview" : "connections",
        service: ids[0] ?? null,
        notice,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [initialSetupDone, initialSetupStep, openCommand]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        document.querySelector(
          '[data-cmd-expanded="true"], [data-slot="dialog-content"][data-open], [data-slot="alert-dialog-content"][data-open], [data-slot="sheet-content"][data-open], [data-slot="dropdown-menu-content"][data-open], [data-slot="popover-content"][data-open], [data-slot="select-content"][data-open]',
        )
      ) {
        return;
      }
      if (surface.panel) {
        setSurface((s) => ({ ...s, panel: null }));
      } else if (surface.view === "command" || surface.view === "research" || surface.view === "studio") {
        setSurface({ view: "home", panel: null });
      } else if (menuOpen) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface.panel, surface.view, menuOpen]);

  useEffect(() => {
    if ((surface.view !== "home" && surface.view !== "studio" && surface.view !== "command") || !menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        (target as Element).closest?.(
          '[data-slot="dropdown-menu-content"], [data-slot="alert-dialog-content"], [data-slot="alert-dialog-overlay"], [data-slot="dialog-content"], [data-slot="dialog-overlay"], [data-slot="sheet-content"], [data-slot="sheet-overlay"], [data-slot="popover-content"], [data-slot="select-content"], [data-base-ui-inert]',
        )
      ) {
        return;
      }
      if (
        menuTriggerRef.current?.contains(target) ||
        menuNavRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [surface.view, menuOpen]);

  const visuals = useMemo<SocketVisual[]>(
    () =>
      hub.slots.map((slot) =>
        slot.occupiedBy ? "occupied" : canUseSlot(slot, hub.entitlement) ? "open" : "locked",
      ),
    [hub.slots, hub.entitlement],
  );

  const signal = useMemo<StageSignal>(() => {
    const snapIndex = hub.lastSnapped ? hub.slots.findIndex((s) => s.id === hub.lastSnapped!.slotId) : -1;
    const activeExtId = typeof surface.panel === "object" && surface.panel ? surface.panel.extension : null;
    const activeSocketIdx = activeExtId
      ? hub.slots.findIndex((s) => s.occupiedBy === activeExtId)
      : selected
        ? hub.slots.findIndex((s) => s.id === selected)
        : -1;
    const socketLabels = hub.slots.map((slot) => {
      const ext = slot.occupiedBy ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy) : undefined;
      const open = canUseSlot(slot, hub.entitlement);
      return {
        monogram: ext ? (ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)) : "",
        name: ext ? ext.manifest.name : open ? "Open socket" : "Pro socket",
        status: ext ? "connected" : open ? "open" : "locked",
      };
    });
    return {
      brain: session.brain,
      sockets: visuals,
      theme,
      socketLabels,
      snap: hub.lastSnapped && snapIndex >= 0 ? { index: snapIndex, serial: hub.lastSnapped.serial } : null,
      transfer,
      activeSocket: activeSocketIdx >= 0 ? activeSocketIdx : null,
      paused: surface.view !== "home",
      fromSetupExplosion: setupReveal,
    };
  }, [
    session.brain,
    visuals,
    theme,
    hub.lastSnapped,
    hub.slots,
    hub.extensions,
    hub.entitlement,
    transfer,
    surface.view,
    surface.panel,
    selected,
    setupReveal,
  ]);

  const firstName = useMemo(() => {
    const rawName = viewerName?.trim();
    if (rawName) {
      const first = rawName.split(/\s+/)[0];
      if (first) return first;
    }
    const emailPrefix = viewer.email?.split("@")[0]?.split(/[._+-]/)[0]?.trim();
    if (emailPrefix) {
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    return "Friend";
  }, [viewerName, viewer.email]);

  function chat(text: string) {
    const query = RESEARCH_VISIBLE ? researchIntent(text) : null;
    if (query) {
      session.announce(`Opening Research for “${query}”.`);
      openResearch(query);
      return;
    }
    session.ask(text);
  }

  async function applySetupNodes(nodeIds: ExtensionId[]) {
    for (const extension of BUILTIN_EXTENSIONS) {
      if (!extensionRegistry.get(extension.manifest.id)) {
        await extensionRegistry.register(extension);
      }
    }
    const desired = new Set(nodeIds);
    for (const activeId of extensionRegistry.listActive()) {
      if (!desired.has(activeId)) {
        await extensionRegistry.deactivate(activeId);
      }
    }
    for (const id of nodeIds) {
      if (!extensionRegistry.isActive(id) && extensionRegistry.get(id)) {
        await extensionRegistry.activate(id);
      }
    }
    saveInstalledNodes(extensionRegistry.listActive());
  }

  async function persistSetup(nodeIds: ExtensionId[]) {
    if (persistedNodesRef.current) return;
    persistedNodesRef.current = true;
    await applySetupNodes(nodeIds);
    bootedRef.current = true;
    clearResumeSetupStep();
    try {
      window.localStorage.setItem(SETUP_DONE_KEY, viewerKey);
    } catch {
      // Ignore storage access errors
    }
    await fetch("/api/setup", { method: "POST" }).catch(() => null);
  }

  async function completeSetup(nodeIds: ExtensionId[], options?: { fromFinale?: boolean }) {
    await persistSetup(nodeIds);
    setSetupNotice(null);
    setSetupResumeStep(null);
    if (options?.fromFinale) {
      if (typeof window !== "undefined") {
        setSetupRevealCoreY(computeCoreCenter(window.innerWidth, window.innerHeight).y);
      }
      setSetupReveal(true);
    }
    setSetupDone(true);
  }

  async function skipSetup() {
    const existing = extensionRegistry.listActive();
    const fallbackNodes = existing.length > 0 ? existing : (readSavedNodes() ?? DEFAULT_NODE_IDS);
    await completeSetup(fallbackNodes);
  }

  const replaySetup = useCallback(async () => {
    clearResumeSetupStep();
    persistedNodesRef.current = false;
    setSetupReveal(false);
    try {
      window.localStorage.removeItem(SETUP_DONE_KEY);
    } catch {
      // Ignore storage access errors
    }
    await fetch("/api/setup", { method: "DELETE" }).catch(() => null);
    setMenuOpen(false);
    setSurface({ view: "home", panel: null });
    setSetupNotice(null);
    setSetupResumeStep(null);
    setSetupDone(false);
  }, []);

  useEffect(() => {
    if (!setupReveal) return;
    const t = window.setTimeout(() => setSetupReveal(false), 950);
    return () => window.clearTimeout(t);
  }, [setupReveal]);

  async function snap(id: ExtensionId, explicitSlotId?: SlotId) {
    const target = hub.slots.find((s) => s.id === (explicitSlotId ?? selected));
    const slotId = target && !target.occupiedBy && canUseSlot(target, hub.entitlement) ? target.id : undefined;
    const result = await extensionRegistry.activate(id, { slotId });
    const name = extensionRegistry.get(id)?.manifest.name ?? id;
    if (result.ok) {
      saveInstalledNodes(extensionRegistry.listActive());
      const slot = hub.slots.find((s) => s.id === result.slotId);
      flash(`${name} connected to a ${slot?.tier === "pro" ? "Pro" : "free"} socket.`);
      setSelected(null);
    } else {
      flash(result.message);
      if (result.reason === "pro_required") {
        session.announce(`Both free sockets are in use. Release one, or go Pro to wire in ${name} as well.`);
      }
    }
  }

  async function release(id: ExtensionId) {
    const name = extensionRegistry.get(id)?.manifest.name ?? id;
    await extensionRegistry.deactivate(id);
    saveInstalledNodes(extensionRegistry.listActive());
    flash(`${name} disconnected.`);
    setSurface((s) => {
      if (id === STUDIO_NODE_ID && s.view === "studio") {
        return { view: "home", panel: null };
      }
      return typeof s.panel === "object" && s.panel?.extension === id ? { ...s, panel: null } : s;
    });
  }

  function triggerNodeTransfer(fromId: ExtensionId, explicitToId?: ExtensionId) {
    const fromIndex = hub.slots.findIndex((s) => s.occupiedBy === fromId);
    if (fromIndex < 0) return;

    let toIndex = -1;
    if (explicitToId) {
      toIndex = hub.slots.findIndex((s) => s.occupiedBy === explicitToId);
    } else {
      const candidates = hub.slots
        .map((s, idx) => (s.occupiedBy && idx !== fromIndex ? idx : -1))
        .filter((idx) => idx >= 0);
      toIndex = candidates.length > 0 ? candidates[0]! : -1;
    }

    const fromExt = hub.extensions.find((e) => e.manifest.id === fromId);
    const toExt = toIndex >= 0 ? hub.extensions.find((e) => e.manifest.id === hub.slots[toIndex]?.occupiedBy) : null;
    const fromName = fromExt?.manifest.name ?? PRODUCT_PAYLOAD_LABELS[fromId] ?? "Node";
    const toName = toExt?.manifest.name ?? "Command";
    const routeText = `${fromName} → ${toName}`;

    setTransfer((prev) => ({
      fromSocket: fromIndex,
      toSocket: toIndex,
      label: routeText,
      serial: (prev?.serial ?? 0) + 1,
    }));

    flash(`Routing ${routeText}.`);
  }

  const panel = surface.panel;
  const isNetworkHome = surface.view === "home";
  const usesFloatingMenu = isNetworkHome || surface.view === "studio" || surface.view === "command";

  if (!setupDone) {
    return (
      <SetupExperience
        initialName={viewerName ?? ""}
        theme={theme}
        hub={hub}
        initialStep={setupResumeStep}
        oauthNotice={setupNotice}
        onDismissNotice={() => setSetupNotice(null)}
        onNameSaved={(name) => setViewerName(name)}
        onPersistSetup={persistSetup}
        onComplete={completeSetup}
        onSkip={skipSetup}
      />
    );
  }

  return (
    <div
      className={`dash ${theme === "dark" ? "dark" : "light"} relative h-[100svh] w-full flex-1 overflow-hidden`}
      data-theme={theme}
      data-nav-open={usesFloatingMenu ? (menuOpen ? "true" : "false") : "true"}
    >
      {setupReveal ? (
        <div
          className="dash-finale-reveal pointer-events-none fixed inset-0 z-50"
          style={
            setupRevealCoreY !== null
              ? ({ "--dash-core-y": `${setupRevealCoreY}px` } as CSSProperties)
              : undefined
          }
          aria-hidden
          onAnimationEnd={() => setSetupReveal(false)}
        />
      ) : null}
      <section
        aria-label="Nexus Laniakea network"
        className="absolute inset-0"
        hidden={surface.view === "command"}
      >
        <NeuralStage signal={signal} onSelectSocket={handleSelectSocket} />
        <div className="dash-scrim--home pointer-events-none absolute inset-0" />
      </section>

      <header
        className={`landing-enter pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center ${
          surface.view === "command" ? "h-12" : "h-16"
        }`}
      >
            {usesFloatingMenu ? (
              <div
                className={`pointer-events-auto inline-flex shrink-0 justify-center ${
                  surface.view === "command" ? "ml-2 w-[52px]" : "ml-[14px] w-[74px]"
                }`}
              >
                <NexusMenuButton
                  buttonRef={menuTriggerRef}
                  open={menuOpen}
                  hasActivePanel={Boolean(panel)}
                  controlsId="nexus-network-menu"
                  onClick={toggleMenu}
                />
              </div>
            ) : (
              <Link href="/" aria-label="Nexus home" className="pointer-events-auto inline-flex w-[76px] shrink-0 justify-center">
                <NexusMark className="dash-brand-mark h-7 w-auto" />
              </Link>
            )}
          </header>

          <NodeMenu
            id="nexus-network-menu"
            navRef={menuNavRef}
            hub={hub}
            surface={surface}
            floating={usesFloatingMenu}
            open={usesFloatingMenu ? menuOpen : true}
            onHome={goHome}
            onCommand={handleOpenCommand}
            onPanel={openPanel}
            onReplaySetup={replaySetup}
          />
          {isNetworkHome ? (
            <NodeRail hub={hub} surface={surface} onCommand={handleOpenCommand} onSlot={selectSlot} />
          ) : null}

          {surface.view === "home" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-8 sm:px-[88px]">
              <div className="dash-chat pointer-events-auto flex w-full max-w-[620px] flex-col items-center gap-4">
                <NexusVoice
                  firstName={firstName}
                  brain={session.brain}
                  current={session.current}
                  pendingPrompt={session.pendingPrompt}
                  revealed={session.revealed}
                  history={session.history}
                  followUps={session.followUps}
                  skipWake={setupReveal}
                  onAsk={chat}
                />
                <NexusInput
                  disabled={session.brain === "thinking"}
                  onAsk={chat}
                  onResearch={RESEARCH_VISIBLE ? (text) => openResearch(text) : undefined}
                />
              </div>
            </div>
          ) : null}

          {researchMounted ? (
            <div className="node-full" hidden={surface.view !== "research"}>
              <ResearchView request={researchRequest} onClose={() => setSurface({ view: "home", panel: null })} />
            </div>
          ) : null}

          {commandMounted ? (
            <div className="command-screen" hidden={surface.view !== "command"}>
              <CommandView
                userName={firstName}
                openCount={commandOpenCount}
                request={commandRequest}
                onClose={() => setSurface({ view: "home", panel: null })}
              />
            </div>
          ) : null}

          {studioMounted ? (
            <div className="studio-fullscreen" hidden={surface.view !== "studio"}>
              <StudioView
                hub={hub}
                onClose={() => setSurface({ view: "home", panel: null })}
                onReleaseNode={() => void release(STUDIO_NODE_ID)}
              />
            </div>
          ) : null}

          {panel ? (
            <aside ref={panelRef} className="node-panel" aria-label="Node panel">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-3 top-3 z-10 rounded-full text-muted-foreground hover:text-foreground"
                      onClick={() => setSurface((s) => ({ ...s, panel: null }))}
                      aria-label="Close panel"
                    >
                      <X className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent side="left">Close panel</TooltipContent>
              </Tooltip>
              <ScrollArea className="h-full">
                <div className="p-6 pt-7">
                  {panel === "today" ? (
                    <TodayPanel
                      tasks={session.tasks}
                      threads={session.threads}
                      touched={session.touched}
                      organized={session.organized}
                      onToggle={session.toggleTask}
                    />
                  ) : panel === "nodes" ? (
                    <ExtensionHub
                      hub={hub}
                      selected={selected}
                      notice={notice}
                      onSnap={snap}
                      onRelease={release}
                      onTogglePro={() => setStubPro(!hub.entitlement.isPro)}
                    />
                  ) : panel === "settings" ? (
                    <SettingsPanel
                      viewer={{ ...viewer, name: viewerName }}
                      isPro={hub.entitlement.isPro}
                      onTogglePro={() => setStubPro(!hub.entitlement.isPro)}
                      onOpenCommandConnections={() => openCommand({ tab: "connections", service: null, notice: null })}
                      onReplaySetup={() => void replaySetup()}
                    />
                  ) : (
                    <ExtensionPanel
                      hub={hub}
                      id={panel.extension}
                      onRelease={release}
                      onTransfer={(fromId, toId) => triggerNodeTransfer(fromId, toId)}
                    />
                  )}
                </div>
              </ScrollArea>
            </aside>
          ) : null}
    </div>
  );
}
