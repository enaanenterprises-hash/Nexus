import type {
  ExtensionCapability,
  ExtensionId,
  ExtensionSlot,
  NexusExtension,
} from "./types";

export type ExtensionLinkKind = "content" | "capability";

export interface ExtensionLink {
  fromSlotIndex: number;
  toSlotIndex: number;
  fromId: ExtensionId;
  toId: ExtensionId;
  kind: ExtensionLinkKind;
  channel: string;
}

const DOMAIN_CAPABILITIES: readonly ExtensionCapability[] = [
  "media",
  "tasks",
  "calendar",
  "voice",
  "research",
  "automations",
];

function findContentChannel(provider: NexusExtension, consumer: NexusExtension): string | null {
  const provided = provider.manifest.provides;
  if (!provided || provided.length === 0) return null;
  for (const decl of provided) {
    const readCap = `content:${decl.kind}:read`;
    const annotateCap = `content:${decl.kind}:annotate`;
    if (
      consumer.manifest.capabilities.includes(readCap as ExtensionCapability) ||
      consumer.manifest.capabilities.includes(annotateCap as ExtensionCapability)
    ) {
      return decl.kind;
    }
  }
  return null;
}

function findSharedCapability(a: NexusExtension, b: NexusExtension): string | null {
  const capsA = a.manifest.capabilities;
  const capsB = b.manifest.capabilities;
  for (const cap of DOMAIN_CAPABILITIES) {
    if (capsA.includes(cap) && capsB.includes(cap)) {
      return cap;
    }
  }
  if (capsA.includes("context") && capsB.includes("context")) {
    return "context";
  }
  return null;
}

/**
 * Resolves live inter-node communication bridges across occupied hub slots.
 * Any two nodes that exchange a declared content envelope or share a bus capability
 * receive a direct link so the spatial network renders functional interconnections.
 */
export function computeExtensionLinks(
  slots: readonly ExtensionSlot[],
  extensions: readonly NexusExtension[],
): ExtensionLink[] {
  const byId = new Map<ExtensionId, NexusExtension>();
  for (const ext of extensions) {
    byId.set(ext.manifest.id, ext);
  }

  const occupied: Array<{ slotIndex: number; ext: NexusExtension }> = [];
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i]?.occupiedBy;
    if (!id) continue;
    const ext = byId.get(id);
    if (ext) occupied.push({ slotIndex: i, ext });
  }

  const links: ExtensionLink[] = [];
  for (let a = 0; a < occupied.length; a++) {
    for (let b = a + 1; b < occupied.length; b++) {
      const left = occupied[a]!;
      const right = occupied[b]!;
      const forwardContent = findContentChannel(left.ext, right.ext);
      const reverseContent = forwardContent ? null : findContentChannel(right.ext, left.ext);

      if (forwardContent) {
        links.push({
          fromSlotIndex: left.slotIndex,
          toSlotIndex: right.slotIndex,
          fromId: left.ext.manifest.id,
          toId: right.ext.manifest.id,
          kind: "content",
          channel: forwardContent,
        });
        continue;
      }

      if (reverseContent) {
        links.push({
          fromSlotIndex: right.slotIndex,
          toSlotIndex: left.slotIndex,
          fromId: right.ext.manifest.id,
          toId: left.ext.manifest.id,
          kind: "content",
          channel: reverseContent,
        });
        continue;
      }

      const sharedCap = findSharedCapability(left.ext, right.ext);
      if (sharedCap) {
        links.push({
          fromSlotIndex: left.slotIndex,
          toSlotIndex: right.slotIndex,
          fromId: left.ext.manifest.id,
          toId: right.ext.manifest.id,
          kind: "capability",
          channel: sharedCap,
        });
      }
    }
  }

  return links;
}
