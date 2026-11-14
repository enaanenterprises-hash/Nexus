import { nexusBus, type ExtensionBus } from "./bus";
import { ManifestError, validateManifest } from "./manifest";
import {
  canActivateAnother,
  canUseSlot,
  getProEntitlement,
  proRequiredMessage,
  subscribeEntitlement,
} from "./pro-gate";
import { contentKinds } from "./content";
import { createContentClient } from "./content-access";
import { canReceive } from "./event-access";
import { createEmptySlots } from "./slots";
import type {
  ActivationFailure,
  ActivationResult,
  ExtensionHubSnapshot,
  ExtensionId,
  ExtensionRuntimeContext,
  ExtensionSlot,
  NexusExtension,
  ProEntitlement,
  SlotId,
} from "./types";

type Entry = {
  extension: NexusExtension;
  runtime: ExtensionRuntimeContext;
  unsubscribe?: () => void;
};

/**
 * Typed extension registry — the network socket.
 * Packages call register() once, then activate() to snap into a hub socket.
 * UI binds with subscribe() + getSnapshot() (useSyncExternalStore-compatible).
 */
export class ExtensionRegistry {
  private entries = new Map<ExtensionId, Entry>();
  private slots: ExtensionSlot[] = createEmptySlots();
  private listeners = new Set<() => void>();
  private snapSerial = 0;
  private snapshot: ExtensionHubSnapshot;

  constructor(private readonly bus: ExtensionBus = nexusBus) {
    this.snapshot = this.buildSnapshot(null);
    subscribeEntitlement((entitlement) => void this.onEntitlementChange(entitlement));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ExtensionHubSnapshot => this.snapshot;

  list(): NexusExtension[] {
    return [...this.entries.values()].map((e) => e.extension);
  }

  listActive(): ExtensionId[] {
    return this.slots.flatMap((s) => (s.occupiedBy ? [s.occupiedBy] : []));
  }

  get(id: ExtensionId): NexusExtension | undefined {
    return this.entries.get(id)?.extension;
  }

  isActive(id: ExtensionId): boolean {
    return this.slotOf(id) !== undefined;
  }

  slotOf(id: ExtensionId): ExtensionSlot | undefined {
    return this.slots.find((s) => s.occupiedBy === id);
  }

  async register(extension: NexusExtension): Promise<void> {
    const { id } = extension.manifest;
    const problems = validateManifest(extension.manifest);
    if (problems.length > 0) throw new ManifestError(id, problems);
    if (this.entries.has(id)) await this.unregister(id);

    const { capabilities } = extension.manifest;
    const runtime: ExtensionRuntimeContext = {
      extensionId: id,
      getSharedContext: () => this.bus.getSharedContext(),
      emit: (type, payload) => this.bus.emit(type, payload, id),
      subscribe: (type, handler) =>
        this.bus.subscribe(type, (event) => {
          if (canReceive(event, capabilities)) return handler(event);
        }),
      content: createContentClient({
        extensionId: id,
        capabilities,
        isActive: () => this.isActive(id),
      }),
    };
    contentKinds.add(id, extension.manifest.provides);
    const entry: Entry = { extension, runtime };
    const onEvent = extension.handlers?.onEvent;
    if (onEvent) {
      entry.unsubscribe = this.bus.subscribe("*", (event) => {
        if (event.source !== id && this.isActive(id) && canReceive(event, capabilities)) return onEvent(event, runtime);
      });
    }
    this.entries.set(id, entry);

    await extension.handlers?.onRegister?.(runtime);
    this.bus.emit("extension:registered", { id }, "system");
    this.commit();
  }

  async unregister(id: ExtensionId): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    await this.deactivate(id);
    entry.unsubscribe?.();
    contentKinds.removeProvider(id);
    this.entries.delete(id);
    this.bus.emit("extension:unregistered", { id }, "system");
    this.commit();
  }

  /**
   * Snap an extension into a socket. Without `slotId` the first open socket the
   * current plan allows is used; free-plan users are capped at two actives.
   */
  async activate(id: ExtensionId, options: { slotId?: SlotId } = {}): Promise<ActivationResult> {
    const entry = this.entries.get(id);
    if (!entry) return this.fail(id, "not_registered", `"${id}" is not registered`);
    if (this.isActive(id)) return this.fail(id, "already_active", `"${id}" is already active`);

    const entitlement = getProEntitlement();
    const needsPro = entry.extension.manifest.requiresPro && !entitlement.isPro;
    const active = this.listActive().length;
    if (needsPro || !canActivateAnother(active, entitlement)) {
      const message = needsPro
        ? `${entry.extension.manifest.name} requires Nexus Pro.`
        : proRequiredMessage(active);
      return this.deny(id, message);
    }

    let slot: ExtensionSlot | undefined;
    if (options.slotId) {
      slot = this.slots.find((s) => s.id === options.slotId);
      if (!slot) return this.fail(id, "unknown_slot", `No socket "${options.slotId}"`);
      if (slot.occupiedBy) return this.fail(id, "slot_occupied", `${slot.label} is occupied`);
      if (!canUseSlot(slot, entitlement)) return this.deny(id, "Pro sockets unlock with Nexus Pro.");
    } else {
      slot = this.slots.find((s) => !s.occupiedBy && canUseSlot(s, entitlement));
      if (!slot) return this.deny(id, proRequiredMessage(active));
    }

    const slotId = slot.id;
    this.slots = this.slots.map((s) => (s.id === slotId ? { ...s, occupiedBy: id } : s));
    this.snapSerial += 1;
    this.commit({ id, slotId, serial: this.snapSerial });
    await entry.extension.handlers?.onActivate?.(entry.runtime);
    this.bus.emit("extension:activated", { id, slotId }, "system");
    return { ok: true, id, slotId };
  }

  async deactivate(id: ExtensionId): Promise<void> {
    const entry = this.entries.get(id);
    const slot = this.slotOf(id);
    if (!entry || !slot) return;
    this.slots = this.slots.map((s) => (s.id === slot.id ? { ...s, occupiedBy: null } : s));
    this.commit();
    await entry.extension.handlers?.onDeactivate?.(entry.runtime);
    this.bus.emit("extension:deactivated", { id, slotId: slot.id }, "system");
  }

  /** Downgrades release anything sitting in a socket the plan no longer covers. */
  private async onEntitlementChange(entitlement: ProEntitlement) {
    this.bus.emit("entitlement:changed", { isPro: entitlement.isPro }, "system");
    this.commit();
    if (entitlement.isPro) return;
    for (const slot of this.slots) {
      if (slot.occupiedBy && !canUseSlot(slot, entitlement)) await this.deactivate(slot.occupiedBy);
    }
  }

  private deny(id: ExtensionId, message: string): ActivationResult {
    this.bus.emit("extension:denied", { id, reason: message }, "system");
    return this.fail(id, "pro_required", message);
  }

  private fail(id: ExtensionId, reason: ActivationFailure, message: string): ActivationResult {
    return { ok: false, id, reason, message };
  }

  private buildSnapshot(lastSnapped: ExtensionHubSnapshot["lastSnapped"]): ExtensionHubSnapshot {
    return {
      extensions: this.list(),
      slots: this.slots,
      entitlement: getProEntitlement(),
      lastSnapped,
    };
  }

  private commit(lastSnapped = this.snapshot.lastSnapped) {
    this.snapshot = this.buildSnapshot(lastSnapped);
    for (const listener of this.listeners) listener();
  }
}

/** Singleton socket used by the dashboard and future extension loaders. */
export const extensionRegistry = new ExtensionRegistry();
