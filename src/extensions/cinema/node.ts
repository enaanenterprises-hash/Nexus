import { NEXUS_EXTENSION_API_VERSION, defineExtension } from "@/lib/extensions";

export const CINEMA_NODE_ID = "dev.nexus.cinema";

/**
 * Cinema: modular creative video editor occupying Free Socket 2 alongside Recording Studio.
 * Reads `studio.recording` stems/markers directly from Recording Studio and provides
 * `cinema.project` envelopes so audio/study/AI nodes collaborate across Nexus.
 */
export const cinemaExtension = defineExtension({
  manifest: {
    id: CINEMA_NODE_ID,
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Cinema",
    version: "0.1.0",
    description:
      "Multi-track timeline video editor with Canva-style direct canvas editing, live Recording Studio audio sync, and in-browser MP4 export.",
    capabilities: [
      "media",
      "context",
      "content:studio.recording:read",
      "content:studio.recording:annotate",
      "content:optics.project:read",
    ],
    monogram: "Cn",
    author: "Nexus",
    provides: [
      {
        kind: "cinema.project",
        version: 1,
        description:
          "A multi-track Cinema video project: timeline clips, transitions, markers, and synced Studio audio links.",
        actions: ["read", "annotate"],
      },
    ],
  },
  handlers: {
    onActivate: (runtime) => {
      runtime.emit("nexus:proactive", {
        suggestion:
          "Cinema is wired into the Creative Suite. Compose multi-track video or pull stems directly from Studio.",
        at: new Date().toISOString(),
      });
    },
  },
});
