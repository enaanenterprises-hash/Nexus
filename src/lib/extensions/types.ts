/**
 * Nexus Extension Contract — typed surface for first- and third-party nodes.
 * Extensions register with the registry, subscribe to the network bus, and
 * share context with the central Nexus brain.
 */

export type ExtensionId = string;

export type ExtensionCapability =
  | "tasks"
  | "context"
  | "media"
  | "calendar"
  | "voice"
  | "research"
  | "custom";

export interface ExtensionManifest {
  id: ExtensionId;
  name: string;
  version: string;
  description: string;
  /** Declared capabilities the extension may emit or consume. */
  capabilities: ExtensionCapability[];
  /** Visual slot key used by the Extension Hub placeholders. */
  slotKey?: string;
  author?: string;
}

export interface NexusSharedContext {
  activeTaskIds: string[];
  focusSummary: string;
  moodHint?: string;
  updatedAt: string;
}

export type NexusEventMap = {
  "nexus:ready": { version: string };
  "nexus:context": NexusSharedContext;
  "nexus:message": {
    role: "user" | "nexus" | "system";
    text: string;
    at: string;
  };
  "nexus:proactive": { suggestion: string; at: string };
  "extension:registered": { id: ExtensionId };
  "extension:unregistered": { id: ExtensionId };
  "extension:activated": { id: ExtensionId };
  "extension:deactivated": { id: ExtensionId };
  "extension:denied": { id: ExtensionId; reason: string };
};

export type NexusEventType = keyof NexusEventMap;

export type NexusEvent<T extends NexusEventType = NexusEventType> = {
  type: T;
  payload: NexusEventMap[T];
  source?: ExtensionId | "nexus" | "system";
  at: string;
};

export type NexusEventHandler<T extends NexusEventType = NexusEventType> = (
  event: NexusEvent<T>,
) => void | Promise<void>;

export interface ExtensionRuntimeContext {
  getSharedContext: () => NexusSharedContext;
  emit: <T extends NexusEventType>(
    type: T,
    payload: NexusEventMap[T],
  ) => void;
  subscribe: <T extends NexusEventType>(
    type: T,
    handler: NexusEventHandler<T>,
  ) => () => void;
}

export interface ExtensionHandlers {
  onRegister?: (runtime: ExtensionRuntimeContext) => void | Promise<void>;
  onActivate?: () => void | Promise<void>;
  onDeactivate?: () => void | Promise<void>;
  onEvent?: (event: NexusEvent) => void | Promise<void>;
}

export interface NexusExtension {
  manifest: ExtensionManifest;
  handlers?: ExtensionHandlers;
}

export type SlotTier = "free" | "pro";

export interface ExtensionSlot {
  id: string;
  label: string;
  tier: SlotTier;
  placeholderKey: string;
  description: string;
  /** Bound extension id when occupied; null when empty. */
  occupiedBy: ExtensionId | null;
}

export type ActivationResult =
  | { ok: true; id: ExtensionId }
  | { ok: false; id: ExtensionId; reason: "not_registered" | "pro_required" | "already_active" };
