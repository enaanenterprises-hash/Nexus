"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NexusMark } from "@/components/landing/NexusLogo";
import { CommandView, type CommandTab } from "@/components/command/CommandView";
import { ResearchView } from "@/components/research/ResearchView";
import type { Viewer } from "@/lib/auth/types";
import { COMMAND_NODE_ID } from "@/extensions/command/node";
import { RESEARCH_NODE_ID } from "@/extensions/research/node";
import { SAMPLE_EXTENSIONS } from "@/extensions/samples";
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
import { CloseIcon } from "./icons";
import {
  NeuralStage,
  type SocketVisual,
  type StageSignal,
  type StageTransfer,
} from "./NeuralStage";
import { NodeMenu, NodeRail, type PanelId, type Surface } from "./NodeNav";
import { NexusInput, NexusVoice } from "./NexusVoice";
import { TodayPanel } from "./TodayPanel";
import { useNexusSession } from "./use-nexus-session";
import { useTheme } from "@/lib/theme";

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
  "dev.nexus.sample.daily-brief": "Daily Brief",
  "dev.nexus.sample.focus-guard": "Focus Guard",
  "dev.nexus.sample.quick-capture": "Quick Capture",
  "dev.nexus.sample.ledger": "Ledger",
};

export function Dashboard({ viewer }: { viewer: Viewer }) {
  const session = useNexusSession();
  const hub = useExtensionHub();
  const { theme } = useTheme();
  const [surface, setSurface] = useState<Surface>({ view: "home", panel: null });
  const [researchMounted, setResearchMounted] = useState(false);
  const [researchRequest, setResearchRequest] = useState<{ input: string; serial: number } | null>(null);
  const [commandMounted, setCommandMounted] = useState(false);
  const [commandRequest, setCommandRequest] = useState<{
    tab: CommandTab;
    service: string | null;
    notice: string | null;
    serial: number;
  } | null>(null);
  const [selected, setSelected] = useState<SlotId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<StageTransfer | null>(null);

  const noticeTimer = useRef<number | undefined>(undefined);
  const bootedRef = useRef(false);
  const bootCompleteRef = useRef(false);

  // Register sample extensions and wire the first two free Laniakea arms on initial boot
  useEffect(() => {
    const timer = noticeTimer.current;
    async function bootExtensions() {
      for (const extension of SAMPLE_EXTENSIONS) {
        if (!extensionRegistry.get(extension.manifest.id)) {
          await extensionRegistry.register(extension);
        }
      }
      if (!bootedRef.current) {
        bootedRef.current = true;
        const snap = extensionRegistry.getSnapshot();
        const anyOccupied = snap.slots.some((s) => s.occupiedBy !== null);
        if (!anyOccupied) {
          await extensionRegistry.activate("dev.nexus.sample.daily-brief");
          await extensionRegistry.activate("dev.nexus.sample.focus-guard");
        }
      }
      bootCompleteRef.current = true;
    }
    void bootExtensions();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(
    () =>
      nexusBus.subscribe("nexus:open-node", (event) => {
        if (event.payload.nodeId === COMMAND_NODE_ID) openCommand();
        else if (event.payload.nodeId === RESEARCH_NODE_ID && RESEARCH_VISIBLE) openResearch(event.payload.input);
        else if (extensionRegistry.get(event.payload.nodeId)) openPanel({ extension: event.payload.nodeId });
      }),
    [],
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

    return () => {
      unsubCommand();
      unsubProactive();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("command");
    if (!outcome) return;
    const ids = (params.get("service") ?? "").split(",").filter(Boolean);
    const name = ids.length ? ids.map((id) => getConnector(id)?.name ?? id).join(" and ") : "The service";
    const notice =
      outcome === "connected"
        ? `${name} is connected.`
        : `${name} couldn't connect. ${OAUTH_ERRORS[params.get("reason") ?? ""] ?? ""}`.trim();
    window.history.replaceState(null, "", window.location.pathname);
    openCommand({
      tab: outcome === "connected" ? "overview" : "connections",
      service: ids[0] ?? null,
      notice,
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSurface((s) => (s.panel ? { ...s, panel: null } : s.view === "command" ? { view: "home", panel: null } : s));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    };
  }, [session.brain, visuals, theme, hub.lastSnapped, hub.slots, hub.extensions, hub.entitlement, transfer, surface.view, surface.panel, selected]);

  const firstName = useMemo(() => {
    const rawName = viewer.name?.trim();
    if (rawName) {
      const first = rawName.split(/\s+/)[0];
      if (first) return first;
    }
    const emailPrefix = viewer.email?.split("@")[0]?.split(/[._+-]/)[0]?.trim();
    if (emailPrefix) {
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    return "Friend";
  }, [viewer.name, viewer.email]);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  }

  function openResearch(input?: string) {
    setResearchMounted(true);
    setSurface({ view: "research", panel: null });
    if (input !== undefined) setResearchRequest((r) => ({ input, serial: (r?.serial ?? 0) + 1 }));
  }

  function openCommand(request?: { tab: CommandTab; service: string | null; notice: string | null }) {
    setCommandMounted(true);
    setSurface({ view: "command", panel: null });
    if (request) setCommandRequest((r) => ({ ...request, serial: (r?.serial ?? 0) + 1 }));
  }

  function openPanel(panel: PanelId) {
    setSurface((s) => {
      const same =
        typeof panel === "string"
          ? s.panel === panel
          : typeof s.panel === "object" && s.panel?.extension === panel.extension;
      return { view: s.view, panel: same ? null : panel };
    });
  }

  function chat(text: string) {
    const query = RESEARCH_VISIBLE ? researchIntent(text) : null;
    if (query) {
      session.announce(`Opening Research for “${query}”.`);
      openResearch(query);
      return;
    }
    session.ask(text);
  }

  async function snap(id: ExtensionId, explicitSlotId?: SlotId) {
    const target = hub.slots.find((s) => s.id === (explicitSlotId ?? selected));
    const slotId = target && !target.occupiedBy && canUseSlot(target, hub.entitlement) ? target.id : undefined;
    const result = await extensionRegistry.activate(id, { slotId });
    const name = extensionRegistry.get(id)?.manifest.name ?? id;
    if (result.ok) {
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
    flash(`${name} disconnected.`);
    setSurface((s) => (typeof s.panel === "object" && s.panel?.extension === id ? { ...s, panel: null } : s));
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

  function selectSlot(slotId: SlotId) {
    const slot = hub.slots.find((s) => s.id === slotId);
    if (!slot) return;
    if (slot.occupiedBy) {
      openPanel({ extension: slot.occupiedBy });
      return;
    }
    setSelected(slotId);
    setSurface((s) => ({ ...s, panel: "nodes" }));
    flash(
      canUseSlot(slot, hub.entitlement)
        ? "Socket selected. Choose an extension to snap into it."
        : "Pro sockets unlock with Nexus Pro. Try “Preview Pro” to open them.",
    );
  }

  const panel = surface.panel;

  return (
    <div className="dash relative h-[100svh] w-full flex-1 overflow-hidden" data-theme={theme}>
      <section
        aria-label="Nexus Laniakea network"
        className="absolute inset-0"
        hidden={surface.view === "command"}
      >
        <NeuralStage signal={signal} />
        <div className="dash-scrim--home pointer-events-none absolute inset-0" />
      </section>

      <header className="landing-enter pointer-events-none absolute inset-x-0 top-0 z-40 flex h-16 items-center">
        <Link href="/" aria-label="Nexus home" className="pointer-events-auto inline-flex w-[76px] shrink-0 justify-center">
          <NexusMark className="dash-brand-mark h-7 w-auto" />
        </Link>
      </header>

      <NodeMenu
        hub={hub}
        surface={surface}
        onHome={() => setSurface({ view: "home", panel: null })}
        onCommand={() => openCommand()}
        onPanel={openPanel}
      />
      {surface.view === "home" ? (
        <NodeRail hub={hub} surface={surface} onCommand={() => openCommand()} onSlot={selectSlot} />
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
          <CommandView request={commandRequest} onClose={() => setSurface({ view: "home", panel: null })} />
        </div>
      ) : null}

      {panel ? (
        <aside className="node-panel" aria-label="Node panel">
          <button
            type="button"
            className="research-icon-button absolute right-3 top-3 z-10"
            onClick={() => setSurface((s) => ({ ...s, panel: null }))}
            aria-label="Close panel"
          >
            <CloseIcon size={15} />
          </button>
          <div className="dash-panel h-full overflow-y-auto p-6 pt-7">
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
            ) : (
              <ExtensionPanel
                hub={hub}
                id={panel.extension}
                onRelease={release}
                onTransfer={(fromId, toId) => triggerNodeTransfer(fromId, toId)}
              />
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
