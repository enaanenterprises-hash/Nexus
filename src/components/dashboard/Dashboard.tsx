"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NexusMark } from "@/components/landing/NexusLogo";
import { SubmitButton } from "@/components/landing/SubmitButton";
import { ResearchView } from "@/components/research/ResearchView";
import { signOutAction } from "@/lib/auth/actions";
import type { Viewer } from "@/lib/auth/types";
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
import { researchIntent } from "@/lib/nexus/brain";
import { ExtensionHub } from "./ExtensionHub";
import { ExtensionPanel } from "./ExtensionPanel";
import { CloseIcon } from "./icons";
import { NeuralStage, type SocketVisual, type StageSignal } from "./NeuralStage";
import { NodeMenu, NodeRail, type PanelId, type Surface } from "./NodeNav";
import { NexusInput, NexusVoice } from "./NexusVoice";
import { TodayPanel } from "./TodayPanel";
import { useNexusSession } from "./use-nexus-session";

export function Dashboard({ viewer }: { viewer: Viewer }) {
  const session = useNexusSession();
  const hub = useExtensionHub();
  const [surface, setSurface] = useState<Surface>({ view: "home", panel: null });
  const [researchMounted, setResearchMounted] = useState(false);
  const [researchRequest, setResearchRequest] = useState<{ input: string; serial: number } | null>(null);
  const [selected, setSelected] = useState<SlotId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    for (const extension of SAMPLE_EXTENSIONS) {
      if (!extensionRegistry.get(extension.manifest.id)) void extensionRegistry.register(extension);
    }
    return () => window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(
    () =>
      nexusBus.subscribe("nexus:open-node", (event) => {
        if (event.payload.nodeId === RESEARCH_NODE_ID) openResearch(event.payload.input);
        else if (extensionRegistry.get(event.payload.nodeId)) openPanel({ extension: event.payload.nodeId });
      }),
    [],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSurface((s) => (s.panel ? { ...s, panel: null } : s));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visuals = useMemo<SocketVisual[]>(
    () => hub.slots.map((slot) => (slot.occupiedBy ? "occupied" : canUseSlot(slot, hub.entitlement) ? "open" : "locked")),
    [hub.slots, hub.entitlement],
  );

  const signal = useMemo<StageSignal>(() => {
    const snapIndex = hub.lastSnapped ? hub.slots.findIndex((s) => s.id === hub.lastSnapped!.slotId) : -1;
    return {
      brain: session.brain,
      sockets: visuals,
      snap: hub.lastSnapped && snapIndex >= 0 ? { index: snapIndex, serial: hub.lastSnapped.serial } : null,
      paused: surface.view === "research",
    };
  }, [session.brain, visuals, hub.lastSnapped, hub.slots, surface.view]);

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

  function openPanel(panel: PanelId) {
    setSurface((s) => {
      const same = typeof panel === "string" ? s.panel === panel : typeof s.panel === "object" && s.panel?.extension === panel.extension;
      return { view: s.view, panel: same ? null : panel };
    });
  }

  function chat(text: string) {
    const query = researchIntent(text);
    if (query) {
      session.announce(`Opening Research for “${query}”.`);
      openResearch(query);
      return;
    }
    session.ask(text);
  }

  async function snap(id: ExtensionId) {
    const target = hub.slots.find((s) => s.id === selected);
    const slotId = target && !target.occupiedBy && canUseSlot(target, hub.entitlement) ? target.id : undefined;
    const result = await extensionRegistry.activate(id, { slotId });
    const name = extensionRegistry.get(id)?.manifest.name ?? id;
    if (result.ok) {
      const slot = hub.slots.find((s) => s.id === result.slotId);
      flash(`${name} snapped into a ${slot?.tier === "pro" ? "Pro" : "free"} socket and is wired to the core.`);
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
    flash(`${name} released. Its socket is open again.`);
    setSurface((s) => (typeof s.panel === "object" && s.panel?.extension === id ? { ...s, panel: "nodes" } : s));
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
    flash(canUseSlot(slot, hub.entitlement) ? "Socket selected. Choose an extension to snap into it." : "Pro sockets unlock with Nexus Pro. Try “Preview Pro” to open them.");
  }

  const panel = surface.panel;

  return (
    <div className="dash relative h-[100svh] w-full flex-1 overflow-hidden">
      <section aria-label="Nexus network" className="absolute inset-0">
        <NeuralStage signal={signal} />
        <div className="dash-scrim--home pointer-events-none absolute inset-0" />
      </section>

      <header className="landing-enter absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between gap-3 pr-4 sm:pr-6">
        <Link href="/" aria-label="Nexus home" className="inline-flex w-[76px] shrink-0 justify-center">
          <NexusMark className="h-7 w-auto" />
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <p className="min-w-0 max-w-[34vw] truncate text-[13px] text-[color:var(--land-muted)] sm:max-w-[220px]">
            <span className="sr-only">Signed in as </span>
            {viewer.name || viewer.email || "Signed in"}
          </p>
          <form action={signOutAction} className="shrink-0">
            <SubmitButton className="landing-signup" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </header>

      <NodeMenu hub={hub} surface={surface} onHome={() => setSurface({ view: "home", panel: null })} onResearch={() => openResearch()} onPanel={openPanel} />
      <NodeRail hub={hub} surface={surface} onResearch={() => openResearch()} onSlot={selectSlot} />

      {surface.view === "home" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center pl-[84px] pr-3 sm:bottom-9 sm:pr-[76px]">
          <div className="dash-chat pointer-events-auto flex w-full max-w-[600px] flex-col items-center gap-6">
          <NexusVoice
            brain={session.brain}
            current={session.current}
            pendingPrompt={session.pendingPrompt}
            revealed={session.revealed}
            history={session.history}
            followUps={[]}
            onAsk={chat}
          />
          <NexusInput disabled={session.brain === "thinking"} onAsk={chat} onResearch={(text) => openResearch(text)} />
          </div>
        </div>
      ) : null}

      {researchMounted ? (
        <div className="node-full" hidden={surface.view !== "research"}>
          <ResearchView request={researchRequest} onClose={() => setSurface({ view: "home", panel: null })} />
        </div>
      ) : null}

      {panel ? (
        <aside className="node-panel" aria-label="Node panel">
          <button type="button" className="research-icon-button absolute right-3 top-3 z-10" onClick={() => setSurface((s) => ({ ...s, panel: null }))} aria-label="Close panel">
            <CloseIcon size={15} />
          </button>
          <div className="dash-panel h-full overflow-y-auto p-6 pt-7">
            {panel === "today" ? (
              <TodayPanel tasks={session.tasks} threads={session.threads} touched={session.touched} organized={session.organized} onToggle={session.toggleTask} />
            ) : panel === "nodes" ? (
              <ExtensionHub hub={hub} selected={selected} notice={notice} onSnap={snap} onRelease={release} onTogglePro={() => setStubPro(!hub.entitlement.isPro)} />
            ) : (
              <ExtensionPanel hub={hub} id={panel.extension} onRelease={release} />
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
