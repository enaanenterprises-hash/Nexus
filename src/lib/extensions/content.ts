import type {
  CinemaProjectAnnotationV1,
  CinemaProjectContentV1,
  CinemaProjectListItemV1,
} from "@/lib/cinema/types";
import type {
  ResearchSourceAnnotationV1,
  ResearchSourceContentV1,
  ResearchSourceListItemV1,
} from "@/lib/research/types";
import type {
  StudioRecordingAnnotationV1,
  StudioRecordingContentV1,
  StudioRecordingListItemV1,
} from "@/lib/studio/types";
import type { CommandItemOf, CommandKind } from "@/lib/command/kinds";
import type { ExtensionId } from "./types";

type CommandKindEntries = {
  [K in CommandKind]: { version: 1; listItem: CommandItemOf<K>; item: CommandItemOf<K>; annotation: never };
};

/**
 * Shared content: the typed, versioned data extensions exchange without AI.
 *
 * A content kind is `namespace.name` (e.g. `research.source`). One extension
 * provides it (declared in its manifest under `provides`); others request
 * access with capabilities `content:<kind>:<action>`. Items always travel in a
 * `ContentEnvelope` that names its kind and schema version.
 */

export type ContentAction = "read" | "annotate";

/** `namespace.name`, lowercase. */
export type ContentKindId = `${string}.${string}`;

export type ContentCapability = `content:${ContentKindId}:${ContentAction}`;

export interface ContentKindDeclaration {
  kind: ContentKindId;
  /** Schema version of `data`. Bump on breaking changes; providers may serve older ones. */
  version: number;
  description: string;
  /** Actions consumers may request. `annotate` writes only the kind's annotation fields. */
  actions: readonly ContentAction[];
}

export interface ContentKind extends ContentKindDeclaration {
  provider: ExtensionId;
}

export interface ContentEnvelope<K extends ContentKindId, V extends number, D> {
  kind: K;
  version: V;
  id: string;
  title: string;
  collectionId: string | null;
  createdAt: string;
  updatedAt: string;
  data: D;
}

/** A named group of items of one kind (Research collections, later decks, folders…). */
export interface ContentCollection {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  updatedAt: string;
}

/**
 * Compile-time map from kind to its current types. Future providers add their
 * kind with declaration merging:
 *
 *   declare module "@/lib/extensions/content" {
 *     interface ContentKindMap { "study.flashcard": { version: 1; listItem: …; item: …; annotation: … } }
 *   }
 */
export interface ContentKindMap extends CommandKindEntries {
  "research.source": {
    version: 1;
    listItem: ResearchSourceListItemV1;
    item: ResearchSourceContentV1;
    annotation: ResearchSourceAnnotationV1;
  };
  "studio.recording": {
    version: 1;
    listItem: StudioRecordingListItemV1;
    item: StudioRecordingContentV1;
    annotation: StudioRecordingAnnotationV1;
  };
  "cinema.project": {
    version: 1;
    listItem: CinemaProjectListItemV1;
    item: CinemaProjectContentV1;
    annotation: CinemaProjectAnnotationV1;
  };
}

export type KnownContentKind = keyof ContentKindMap;

/** Versions this build of Nexus speaks, sent with every request. */
export const CONTENT_KIND_VERSIONS: { [K in KnownContentKind]: ContentKindMap[K]["version"] } = {
  "research.source": 1,
  "studio.recording": 1,
  "cinema.project": 1,
  "command.event": 1,
  "command.task": 1,
  "command.deadline": 1,
  "command.activity": 1,
  "command.purchase": 1,
  "command.shipment": 1,
  "command.message": 1,
  "command.signal": 1,
};

const KIND_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const ACTIONS: readonly ContentAction[] = ["read", "annotate"];

export function isContentKindId(value: string): value is ContentKindId {
  return KIND_PATTERN.test(value);
}

export function contentCapability(kind: ContentKindId, action: ContentAction): ContentCapability {
  return `content:${kind}:${action}`;
}

export function parseContentCapability(value: string): { kind: ContentKindId; action: ContentAction } | null {
  const match = /^content:([^:]+):([^:]+)$/.exec(value);
  if (!match || !isContentKindId(match[1]!) || !ACTIONS.includes(match[2] as ContentAction)) return null;
  return { kind: match[1] as ContentKindId, action: match[2] as ContentAction };
}

/** Problems with a manifest's content capabilities and `provides` list. */
export function validateContentDeclarations(capabilities: readonly string[], provides: readonly ContentKindDeclaration[] = []): string[] {
  const problems: string[] = [];
  const granted = new Set<string>();
  for (const cap of capabilities) {
    if (!cap.startsWith("content:")) continue;
    const parsed = parseContentCapability(cap);
    if (!parsed) problems.push(`"${cap}" must look like content:<namespace.name>:<read|annotate>`);
    else granted.add(cap);
  }
  for (const cap of granted) {
    const { kind, action } = parseContentCapability(cap)!;
    if (action === "annotate" && !granted.has(contentCapability(kind, "read"))) {
      problems.push(`"${cap}" requires "${contentCapability(kind, "read")}"`);
    }
  }
  for (const p of provides) {
    if (!isContentKindId(p.kind)) problems.push(`provided kind "${p.kind}" must be namespace.name`);
    if (!Number.isInteger(p.version) || p.version < 1) problems.push(`provided kind "${p.kind}" needs an integer version ≥ 1`);
    if (p.actions.some((a) => !ACTIONS.includes(a))) problems.push(`provided kind "${p.kind}" lists an unknown action`);
  }
  return problems;
}

/** Kinds currently provided by registered extensions and core nodes. */
export class ContentKindRegistry {
  private kinds = new Map<ContentKindId, ContentKind>();

  add(provider: ExtensionId, declarations: readonly ContentKindDeclaration[] = []) {
    for (const d of declarations) {
      const existing = this.kinds.get(d.kind);
      if (existing && existing.provider !== provider) {
        throw new Error(`Content kind "${d.kind}" is already provided by ${existing.provider}`);
      }
      this.kinds.set(d.kind, { ...d, provider });
    }
  }

  removeProvider(provider: ExtensionId) {
    for (const [kind, k] of this.kinds) if (k.provider === provider) this.kinds.delete(kind);
  }

  get(kind: string): ContentKind | undefined {
    return this.kinds.get(kind as ContentKindId);
  }

  list(): ContentKind[] {
    return [...this.kinds.values()];
  }
}

export const contentKinds = new ContentKindRegistry();
