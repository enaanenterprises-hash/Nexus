import { NEXUS_EXTENSION_API_VERSION, defineExtension } from "@/lib/extensions";

export const OPTICS_NODE_ID = "dev.nexus.optics";

/**
 * Optics: comprehensive non-destructive photo darkroom & tonal grading studio,
 * occupying Free Socket 3 alongside Recording Studio and Cinema.
 * Collaborates with Cinema & Command Storage over typed `optics.project` envelopes.
 */
export const opticsExtension = defineExtension({
  manifest: {
    id: OPTICS_NODE_ID,
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Optics",
    version: "0.1.0",
    description:
      "Non-destructive photo studio with editable adjustment stacks, U-Point selective retouching, curves, healing, optical film stocks, and Cinema plate export.",
    capabilities: [
      "media",
      "context",
      "tasks",
      "content:cinema.project:read",
    ],
    monogram: "Op",
    author: "Nexus",
    provides: [
      {
        kind: "optics.project",
        version: 1,
        description:
          "A non-destructive Optics photograph: edit stack, local masks, look recipes, and color-graded stills.",
        actions: ["read", "annotate"],
      },
    ],
  },
  handlers: {
    onActivate: (runtime) => {
      runtime.emit("nexus:proactive", {
        suggestion:
          "Optics darkroom is wired in. Develop non-destructive stills, mask selective edits, or send plates straight to Cinema.",
        at: new Date().toISOString(),
      });
    },
  },
});
