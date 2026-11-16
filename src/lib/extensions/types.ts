/**
 * Nexus Extension Contract — typed surface for first- and third-party nodes.
 * Extensions register with the registry, snap into a hub socket, subscribe to
 * the network bus, and share context with the central Nexus brain.
 */

import type { AutomationRun, FocusSession } from "@/lib/command/automation/types";
import type { CommandItem, CommandKind } from "@/lib/command/kinds";
import type { StudioRecordingContentV1, StudioRoutingIntent } from "@/lib/studio/types";
import type { ContentClient } from "./content-access";
import type { ContentCapability, ContentKindDeclaration } from "./content";

/** Bumped only on breaking contract changes. Manifests must declare it. */
export const NEXUS_EXTENSION_API_VERSION = 1;

/** Reverse-DNS style, e.g. `com.acme.notes`. */
export type ExtensionId = string;

export type ExtensionCapability =
  | "tasks"
  | "context"
  | "media"
  | "calendar"
  | "voice"
  | "research"
  /** Receive `command:automation-ran` events. */
  | "automations"
  | "custom"
  /** Shared content access, e.g. `content:research.source:read`. */
  | ContentCapability;

export interface ExtensionManifest {
  id: ExtensionId;
  /** Contract version the extension was built against. */
  apiVersion: typeof NEXUS_EXTENSION_API_VERSION;
  name: string;
  /** Semver, e.g. `0.1.0`. */
  version: string;
  description: string;
  /** Declared capabilities the extension may emit or consume. */
  capabilities: ExtensionCapability[];
  /** One or two characters shown inside the hub node. */
  monogram?: string;
  /** Extension only runs in Pro sockets. */
  requiresPro?: boolean;
  author?: string;
  /** Content kinds this extension owns and serves to others. */
  provides?: ContentKindDeclaration[];
}

export interface NexusSharedContext {
  activeTaskIds: string[];
  focusSummary: string;
  moodHint?: string;
  updatedAt: string;
}

/** What the brain is doing right now; the dashboard core visualises it. */
export type NexusBrainState = "idle" | "thinking" | "responding";

export type NexusEventMap = {
  "nexus:ready": { version: string };
  "nexus:context": NexusSharedContext;
  "nexus:state": { state: NexusBrainState };
  "nexus:message": {
    role: "user" | "nexus" | "system";
    text: string;
    at: string;
  };
  "nexus:proactive": { suggestion: string; at: string };
  "extension:registered": { id: ExtensionId };
  "extension:unregistered": { id: ExtensionId };
  "extension:activated": { id: ExtensionId; slotId: SlotId };
  "extension:deactivated": { id: ExtensionId; slotId: SlotId };
  "extension:denied": { id: ExtensionId; reason: string };
  "entitlement:changed": { isPro: boolean };
  /** Ask the dashboard shell to bring a node into view, optionally with input for it. */
  "nexus:open-node": { nodeId: ExtensionId; input?: string };
  "research:query": { query: string; kind: "search" | "url" };
  "research:page-opened": { url: string; title: string; siteName: string | null; sourceId: string | null };
  "research:source-saved": { sourceId: string; collectionId: string; url: string; title: string };
  "research:highlight-added": { sourceId: string; highlightId: string; quote: string };
  "studio:recording-saved": {
    recordingId: string;
    collectionId: string;
    title: string;
    durationMs: number;
    trackCount: number;
  };
  /** Delivered only with `content:studio.recording:read`. */
  "studio:take-routed": {
    recordingId: string;
    targetNodeId?: ExtensionId;
    intent: StudioRoutingIntent;
    title: string;
    envelope: StudioRecordingContentV1;
  };
  /** A new Command item reached the network. Delivered only with `content:<kind>:read`. */
  "command:item-published": { kind: CommandKind; item: CommandItem };
  /** An automation ran. Delivered only with the `automations` capability. */
  "command:automation-ran": { run: AutomationRun };
  "command:connection-changed": { connectorId: string; connected: boolean };
  "command:focus-changed": { focus: FocusSession | null };
};

export type NexusEventType = keyof NexusEventMap;

export type NexusEventSource = ExtensionId | "nexus" | "system";

export type NexusEvent<T extends NexusEventType = NexusEventType> = {
  type: T;
  payload: NexusEventMap[T];
  source: NexusEventSource;
  at: string;
};

export type NexusEventHandler<T extends NexusEventType = NexusEventType> = (
  event: NexusEvent<T>,
) => void | Promise<void>;

/** Handed to an extension on register; the only surface it should touch. */
export interface ExtensionRuntimeContext {
  extensionId: ExtensionId;
  getSharedContext: () => NexusSharedContext;
  emit: <T extends NexusEventType>(type: T, payload: NexusEventMap[T]) => void;
  subscribe: <T extends NexusEventType>(
    type: T,
    handler: NexusEventHandler<T>,
  ) => () => void;
  /** Shared content (`content:<kind>:<action>` capabilities). */
  content: ContentClient;
}

export interface ExtensionHandlers {
  onRegister?: (runtime: ExtensionRuntimeContext) => void | Promise<void>;
  onActivate?: (runtime: ExtensionRuntimeContext) => void | Promise<void>;
  onDeactivate?: (runtime: ExtensionRuntimeContext) => void | Promise<void>;
  onEvent?: (event: NexusEvent, runtime: ExtensionRuntimeContext) => void | Promise<void>;
}

export interface NexusExtension {
  manifest: ExtensionManifest;
  handlers?: ExtensionHandlers;
}

export type SlotId = string;
export type SlotTier = "free" | "pro";

export interface ExtensionSlot {
  id: SlotId;
  label: string;
  tier: SlotTier;
  /** Planned first-party extension shown as a ghost while the socket is empty. */
  placeholderKey: string;
  description: string;
  /** Bound extension id when occupied; null when empty. */
  occupiedBy: ExtensionId | null;
}

export type ActivationFailure =
  | "not_registered"
  | "already_active"
  | "pro_required"
  | "slot_occupied"
  | "unknown_slot";

export type ActivationResult =
  | { ok: true; id: ExtensionId; slotId: SlotId }
  | { ok: false; id: ExtensionId; reason: ActivationFailure; message: string };

export interface ProEntitlement {
  isPro: boolean;
  maxActiveExtensions: number;
}

/** Immutable view of the hub; a new object is produced on every change. */
export interface ExtensionHubSnapshot {
  extensions: readonly NexusExtension[];
  slots: readonly ExtensionSlot[];
  entitlement: ProEntitlement;
  /** Id of the extension that most recently snapped in, for UI emphasis. */
  lastSnapped: { id: ExtensionId; slotId: SlotId; serial: number } | null;
}
