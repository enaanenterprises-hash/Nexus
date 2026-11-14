"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NexusLogo } from "@/components/landing/NexusLogo";
import { SAMPLE_EXTENSIONS } from "@/extensions/samples";
import {
  canUseSlot,
  extensionRegistry,
  setStubPro,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";
import { useExtensionHub } from "@/lib/extensions/use-extension-hub";
import { ExtensionHub } from "./ExtensionHub";
import { NeuralStage, type SocketVisual, type StageSignal } from "./NeuralStage";
import { NexusInput, NexusVoice } from "./NexusVoice";
import { StageSockets } from "./StageSockets";
import { TodayPanel } from "./TodayPanel";
import { useNexusSession } from "./use-nexus-session";
import { WIDE_MIN_WIDTH } from "./stage-layout";

export function Dashboard() {
  const session = useNexusSession();
  const hub = useExtensionHub();
  const [selected, setSelected] = useState<SlotId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const hubRef = useRef<HTMLElement>(null);

  useEffect(() => {
    for (const extension of SAMPLE_EXTENSIONS) {
      if (!extensionRegistry.get(extension.manifest.id)) void extensionRegistry.register(extension);
    }
    return () => window.clearTimeout(noticeTimer.current);
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
    return {
      brain: session.brain,
      sockets: visuals,
      snap: hub.lastSnapped && snapIndex >= 0 ? { index: snapIndex, serial: hub.lastSnapped.serial } : null,
    };
  }, [session.brain, visuals, hub.lastSnapped, hub.slots]);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
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
  }

  function selectSocket(slotId: SlotId) {
    const slot = hub.slots.find((s) => s.id === slotId);
    if (!slot) return;
    setSelected((current) => (current === slotId ? null : slotId));
    if (slot.occupiedBy) {
      flash(`${extensionRegistry.get(slot.occupiedBy)?.manifest.name} is live in this socket.`);
    } else if (!canUseSlot(slot, hub.entitlement)) {
      flash("Pro sockets unlock with Nexus Pro. Try “Preview Pro” to open them.");
    } else {
      flash("Socket selected. Choose an extension to snap into it.");
    }
    if (window.innerWidth < WIDE_MIN_WIDTH) hubRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="dash relative flex min-h-[100svh] flex-1 flex-col min-[1100px]:h-[100svh] min-[1100px]:overflow-hidden">
      <section
        aria-label="Nexus network"
        className="relative h-[clamp(420px,60svh,560px)] w-full overflow-hidden min-[1100px]:absolute min-[1100px]:inset-0 min-[1100px]:h-full"
      >
        <NeuralStage signal={signal} />
        <div className="dash-scrim pointer-events-none absolute inset-0 hidden min-[1100px]:block" />
        <div className="dash-scrim--compact pointer-events-none absolute inset-0 min-[1100px]:hidden" />
        <StageSockets hub={hub} visuals={visuals} selected={selected} onSelect={selectSocket} />
      </section>

      <header className="landing-enter absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 pt-6 sm:px-10 min-[1100px]:px-10 min-[1100px]:pt-8">
        <Link href="/" aria-label="Nexus home" className="inline-flex">
          <NexusLogo className="h-[13px] w-auto sm:h-[15px]" />
        </Link>
        <p className="dash-eyebrow hidden sm:block">{hub.entitlement.isPro ? "Pro preview" : "Free plan"}</p>
      </header>

      <div className="relative z-10 -mt-24 px-6 min-[1100px]:absolute min-[1100px]:left-1/2 min-[1100px]:top-[calc(max(300px,39svh)+64px)] min-[1100px]:mt-0 min-[1100px]:w-[min(560px,calc(100vw-2*(clamp(270px,22vw,330px)+88px)))] min-[1100px]:-translate-x-1/2 min-[1100px]:px-0">
        <NexusVoice
          brain={session.brain}
          current={session.current}
          pendingPrompt={session.pendingPrompt}
          revealed={session.revealed}
          history={session.history}
          followUps={session.followUps}
          onAsk={session.ask}
        />
      </div>

      <div className="sticky bottom-4 z-30 mt-8 px-4 sm:mx-auto sm:w-full sm:max-w-xl min-[1100px]:absolute min-[1100px]:bottom-9 min-[1100px]:left-1/2 min-[1100px]:mt-0 min-[1100px]:w-[min(560px,calc(100vw-2*(clamp(270px,22vw,330px)+88px)))] min-[1100px]:max-w-none min-[1100px]:-translate-x-1/2 min-[1100px]:px-0">
        <NexusInput disabled={session.brain === "thinking"} onAsk={session.ask} />
      </div>

      <div className="relative z-10 grid gap-14 px-6 pb-28 pt-16 sm:grid-cols-2 sm:gap-10 sm:px-10 min-[1100px]:contents">
        <aside className="dash-panel min-[1100px]:absolute min-[1100px]:bottom-9 min-[1100px]:left-10 min-[1100px]:top-28 min-[1100px]:w-[clamp(270px,22vw,330px)] min-[1100px]:overflow-y-auto">
          <TodayPanel
            tasks={session.tasks}
            threads={session.threads}
            touched={session.touched}
            organized={session.organized}
            onToggle={session.toggleTask}
          />
        </aside>
        <aside
          ref={hubRef}
          className="dash-panel scroll-mt-6 min-[1100px]:absolute min-[1100px]:bottom-9 min-[1100px]:right-10 min-[1100px]:top-28 min-[1100px]:w-[clamp(270px,22vw,330px)] min-[1100px]:overflow-y-auto"
        >
          <ExtensionHub
            hub={hub}
            selected={selected}
            notice={notice}
            onSnap={snap}
            onRelease={release}
            onTogglePro={() => setStubPro(!hub.entitlement.isPro)}
          />
        </aside>
      </div>
    </div>
  );
}
