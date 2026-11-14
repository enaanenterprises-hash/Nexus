import { COMMAND_KINDS, COMMAND_KIND_DESCRIPTIONS } from "@/lib/command/kinds";
import { NEXUS_EXTENSION_API_VERSION, defineCoreNode } from "@/lib/extensions";

export const COMMAND_NODE_ID = "dev.nexus.core.command";

/**
 * Nexus Command: the cockpit for external services. It owns every `command.*`
 * content kind; UI lives in `src/components/command`, server code in `src/lib/command`.
 */
export const commandNode = defineCoreNode({
  presentation: "full",
  extension: {
    manifest: {
      id: COMMAND_NODE_ID,
      apiVersion: NEXUS_EXTENSION_API_VERSION,
      name: "Command",
      version: "0.1.0",
      description: "Connect the services you use, see your day in one timeline, and let them work together automatically.",
      capabilities: ["context", "tasks", "calendar", "automations"],
      monogram: "Cm",
      author: "Nexus",
      provides: COMMAND_KINDS.map((kind) => ({ kind, version: 1, description: COMMAND_KIND_DESCRIPTIONS[kind], actions: ["read"] as const })),
    },
  },
});
