import type { VaultItem, VaultItemKind } from "./types";

/**
 * Modular Vault Workflow Action Registry.
 * Any Nexus module (Publishing, Cinema, Studio, Class Notes, Business Analytics)
 * registers item actions here so Storage surfaces workflow actions dynamically without
 * hardcoding feature-specific logic inside the file manager UI.
 */
export type VaultActionGroup = "publish" | "open" | "analyze" | "file";

export interface VaultWorkflowAction {
  id: string;
  label: string;
  description?: string;
  group: VaultActionGroup;
  /** Which item kinds unlock this action; omit to match every file kind. */
  kinds?: readonly VaultItemKind[];
  /** Custom runtime predicate for rich contextual filtering. */
  matches?: (item: VaultItem) => boolean;
  priority: number;
  emphasis?: "gold" | "default";
}

const BUILTIN_ACTIONS: readonly VaultWorkflowAction[] = [
  {
    id: "core.social.publish",
    label: "Publish to Social…",
    description: "Preview per-platform feeds and publish everywhere at once",
    group: "publish",
    kinds: ["video", "image"],
    priority: 10,
    emphasis: "gold",
  },
  {
    id: "dev.nexus.cinema.open",
    label: "Open in Cinema",
    description: "Send directly to your active Cinema video timeline",
    group: "open",
    kinds: ["video", "audio", "image"],
    priority: 20,
    emphasis: "default",
  },
  {
    id: "dev.nexus.studio.open",
    label: "Open in Recording Studio",
    description: "Inspect waveform, stem, or dialogue inside Recording Studio",
    group: "open",
    kinds: ["audio"],
    priority: 30,
    emphasis: "default",
  },
  {
    id: "core.file.download",
    label: "Download file",
    description: "Save a copy to your device",
    group: "file",
    priority: 90,
    emphasis: "default",
  },
];

const actionRegistry = new Map<string, VaultWorkflowAction>(
  BUILTIN_ACTIONS.map((a) => [a.id, a]),
);

export function registerVaultAction(action: VaultWorkflowAction): () => void {
  actionRegistry.set(action.id, action);
  return () => {
    if (!BUILTIN_ACTIONS.some((b) => b.id === action.id)) {
      actionRegistry.delete(action.id);
    }
  };
}

export function unregisterVaultAction(id: string): void {
  actionRegistry.delete(id);
}

export function listVaultActions(): VaultWorkflowAction[] {
  return [...actionRegistry.values()].sort((a, b) => a.priority - b.priority);
}

export function getVaultActionsForItem(item: VaultItem): VaultWorkflowAction[] {
  return listVaultActions().filter((action) => {
    if (action.kinds && !action.kinds.includes(item.kind)) return false;
    if (action.matches && !action.matches(item)) return false;
    return true;
  });
}
