import { contentKinds } from "./content";
import { defineExtension } from "./manifest";
import type { ExtensionId, NexusExtension } from "./types";

/**
 * Core nodes ship with Nexus. They use the same manifest contract as any
 * extension but are always available: they never occupy a hub socket and do
 * not count toward the free plan's two active extensions.
 */
export interface CoreNode {
  extension: NexusExtension;
  /** "full" takes over the stage; "panel" slides in beside the menu. */
  presentation: "full" | "panel";
}

const coreNodes = new Map<ExtensionId, CoreNode>();

export function defineCoreNode(node: CoreNode): CoreNode {
  defineExtension(node.extension);
  coreNodes.set(node.extension.manifest.id, node);
  contentKinds.add(node.extension.manifest.id, node.extension.manifest.provides);
  return node;
}

export function listCoreNodes(): CoreNode[] {
  return [...coreNodes.values()];
}

export function isCoreNode(id: ExtensionId): boolean {
  return coreNodes.has(id);
}
