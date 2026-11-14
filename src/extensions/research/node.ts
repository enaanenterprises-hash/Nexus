import { NEXUS_EXTENSION_API_VERSION, defineCoreNode } from "@/lib/extensions";

export const RESEARCH_NODE_ID = "dev.nexus.core.research";

/** Research: the browser built into Nexus. UI lives in `src/components/research`. */
export const researchNode = defineCoreNode({
  presentation: "full",
  extension: {
    manifest: {
      id: RESEARCH_NODE_ID,
      apiVersion: NEXUS_EXTENSION_API_VERSION,
      name: "Research",
      version: "0.1.0",
      description: "Search the web, read pages cleanly, and keep sources in collections.",
      capabilities: ["research", "context"],
      monogram: "Re",
      author: "Nexus",
      provides: [
        {
          kind: "research.source",
          version: 1,
          description: "A saved web page: metadata, plain text, tags, highlights, summary and notes.",
          actions: ["read", "annotate"],
        },
      ],
    },
  },
});
