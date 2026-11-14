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

export const SAMPLE_EXTENSIONS = [dailyBrief, focusGuard, quickCapture];
