import { NEXUS_EXTENSION_API_VERSION, defineExtension } from "@/lib/extensions";

/**
 * Small reference extensions that exercise the public contract end to end.
 * They are written exactly as a third-party package would be: manifest plus
 * handlers, talking to Nexus only through the runtime they are handed.
 */

const at = () => new Date().toISOString();

export const dailyBrief = defineExtension({
  manifest: {
    id: "dev.nexus.sample.daily-brief",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Daily Brief",
    version: "0.1.0",
    description: "Summarises your active priorities when it comes online.",
    capabilities: ["context", "tasks"],
    monogram: "DB",
    author: "Nexus samples",
  },
  handlers: {
    onActivate: (runtime) => {
      const { activeTaskIds, focusSummary } = runtime.getSharedContext();
      runtime.emit("nexus:proactive", {
        suggestion: `Daily Brief: ${activeTaskIds.length} active tasks. Focus is “${focusSummary}”.`,
        at: at(),
      });
    },
  },
});

let lastFocus: string | null = null;

export const focusGuard = defineExtension({
  manifest: {
    id: "dev.nexus.sample.focus-guard",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Focus Guard",
    version: "0.1.0",
    description: "Watches your focus and nudges when it changes.",
    capabilities: ["context"],
    monogram: "FG",
    author: "Nexus samples",
  },
  handlers: {
    onActivate: (runtime) => {
      lastFocus = runtime.getSharedContext().focusSummary;
      runtime.emit("nexus:proactive", {
        suggestion: "Focus Guard is watching. I'll speak up if your focus shifts.",
        at: at(),
      });
    },
    onEvent: (event, runtime) => {
      if (event.type !== "nexus:context") return;
      const { focusSummary } = event.payload as { focusSummary: string };
      if (focusSummary === lastFocus) return;
      lastFocus = focusSummary;
      runtime.emit("nexus:proactive", {
        suggestion: `Focus Guard: your focus is now “${focusSummary}”.`,
        at: at(),
      });
    },
  },
});

export const quickCapture = defineExtension({
  manifest: {
    id: "dev.nexus.sample.quick-capture",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Quick Capture",
    version: "0.1.0",
    description: "Keeps a running log of everything you tell Nexus.",
    capabilities: ["context"],
    monogram: "QC",
    author: "Nexus samples",
  },
  handlers: {
    onActivate: (runtime) => {
      runtime.emit("nexus:proactive", {
        suggestion: "Quick Capture is listening. Everything you tell me gets logged.",
        at: at(),
      });
    },
  },
});

/** Builds on Nexus Command: picks up purchases it records, with only `content:command.purchase:read`. */
export const ledger = defineExtension({
  manifest: {
    id: "dev.nexus.sample.ledger",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Ledger",
    version: "0.1.0",
    description: "Keeps a running total of purchases Command finds in your receipts.",
    capabilities: ["content:command.purchase:read"],
    monogram: "Lg",
    author: "Nexus samples",
  },
  handlers: {
    onActivate: async (runtime) => {
      const purchases = await runtime.content.list("command.purchase").catch(() => []);
      const month = new Date().toISOString().slice(0, 7);
      const thisMonth = purchases.filter((p) => p.data.purchasedAt.startsWith(month));
      const total = thisMonth.reduce((sum, p) => sum + (p.data.currency === "USD" ? p.data.total : 0), 0);
      runtime.emit("nexus:proactive", {
        suggestion: thisMonth.length
          ? `Ledger: ${thisMonth.length} purchases this month, $${total.toFixed(2)} in USD.`
          : "Ledger is listening for receipts Command records.",
        at: at(),
      });
    },
    onEvent: (event, runtime) => {
      if (event.type !== "command:item-published") return;
      const { item } = event.payload as { item: { kind: string; data: { merchant?: string; total?: number; currency?: string } } };
      if (item.kind !== "command.purchase") return;
      runtime.emit("nexus:proactive", {
        suggestion: `Ledger logged ${item.data.currency} ${item.data.total?.toFixed(2)} at ${item.data.merchant}.`,
        at: at(),
      });
    },
  },
});

export const SAMPLE_EXTENSIONS = [dailyBrief, focusGuard, quickCapture, ledger];
