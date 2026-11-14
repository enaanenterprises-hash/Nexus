/** React binding lives in `./use-extension-hub` so this barrel stays framework-free. */
export { nexusBus, ExtensionBus } from "./bus";
export { ManifestError, defineExtension, validateManifest } from "./manifest";
export {
  FREE_ACTIVE_EXTENSION_SLOTS,
  canActivateAnother,
  canUseSlot,
  getProEntitlement,
  proRequiredMessage,
  setStubPro,
  subscribeEntitlement,
} from "./pro-gate";
export { ExtensionRegistry, extensionRegistry } from "./registry";
export {
  EXTENSION_SLOT_BLUEPRINT,
  PLANNED_EXTENSIONS,
  createEmptySlots,
  freeSlotCount,
  placeholderName,
  type PlannedExtension,
} from "./slots";
export { NEXUS_EXTENSION_API_VERSION } from "./types";
export type {
  ActivationFailure,
  ActivationResult,
  ExtensionCapability,
  ExtensionHandlers,
  ExtensionHubSnapshot,
  ExtensionId,
  ExtensionManifest,
  ExtensionRuntimeContext,
  ExtensionSlot,
  NexusBrainState,
  NexusEvent,
  NexusEventHandler,
  NexusEventMap,
  NexusEventSource,
  NexusEventType,
  NexusExtension,
  NexusSharedContext,
  ProEntitlement,
  SlotId,
  SlotTier,
} from "./types";
