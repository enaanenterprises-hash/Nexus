import { NEXUS_EXTENSION_API_VERSION, defineExtension } from "@/lib/extensions";

export const STUDIO_NODE_ID = "dev.nexus.studio";

/**
 * Recording Studio: modular workspace node occupying a hub socket (e.g. Studio).
 * Provides typed `studio.recording` content so downstream nodes (Video Studio,
 * Study Space, AI analyzers) can read takes and write transcripts/chapters/notes.
 */
export const studioExtension = defineExtension({
  manifest: {
    id: STUDIO_NODE_ID,
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Studio",
    version: "0.1.0",
    description:
      "Multi-track voice and audio recording studio with live reactive metering, timeline markers, and neural node routing.",
    capabilities: ["media", "voice", "context"],
    monogram: "St",
    author: "Nexus",
    provides: [
      {
        kind: "studio.recording",
        version: 1,
        description:
          "A multi-track studio session: audio track references, peaks, markers, transcript, summary, and chapters.",
        actions: ["read", "annotate"],
      },
    ],
  },
  handlers: {
    onActivate: (runtime) => {
      runtime.emit("nexus:proactive", {
        suggestion: "Studio is wired in. Open it anytime to capture layered audio or route takes across Nexus.",
        at: new Date().toISOString(),
      });
    },
  },
});
