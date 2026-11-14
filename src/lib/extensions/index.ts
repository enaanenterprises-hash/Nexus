export { nexusBus, ExtensionBus } from "./bus";
export {
  FREE_ACTIVE_EXTENSION_SLOTS,
  canActivateAnother,
  getProEntitlement,
  proRequiredMessage,
  setStubPro,
} from "./pro-gate";
export { ExtensionRegistry, extensionRegistry } from "./registry";
export {
  EXTENSION_SLOT_BLUEPRINT,
  createEmptySlots,
  freeSlotCount,
} from "./slots";
export type {
  ActivationResult,
  ExtensionCapability,
  ExtensionHandlers,
  ExtensionId,
  ExtensionManifest,
  ExtensionRuntimeContext,
  ExtensionSlot,
  NexusEvent,
  NexusEventHandler,
  NexusEventMap,
  NexusEventType,
  NexusExtension,
  NexusSharedContext,
  SlotTier,
} from "./types";
