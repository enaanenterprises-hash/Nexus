import { nexusBus, type ExtensionBus } from "./bus";
import {
  canActivateAnother,
  getProEntitlement,
  proRequiredMessage,
} from "./pro-gate";
import type {
  ActivationResult,
  ExtensionId,
  ExtensionRuntimeContext,
  NexusExtension,
} from "./types";

/**
 * Typed extension registry / network socket.
 * Third-party packages call register() then activate() to snap into a slot.
 */
export class ExtensionRegistry {
  private extensions = new Map<ExtensionId, NexusExtension>();
  private active = new Set<ExtensionId>();
  private unsubscribers = new Map<ExtensionId, () => void>();

  constructor(private readonly bus: ExtensionBus = nexusBus) {}

  list(): NexusExtension[] {
    return [...this.extensions.values()];
  }

  listActive(): ExtensionId[] {
    return [...this.active];
  }

  get(id: ExtensionId): NexusExtension | undefined {
    return this.extensions.get(id);
  }

  isActive(id: ExtensionId): boolean {
    return this.active.has(id);
  }

  async register(extension: NexusExtension): Promise<void> {
    const { id } = extension.manifest;
    if (this.extensions.has(id)) {
      await this.unregister(id);
    }

    this.extensions.set(id, extension);

    const runtime: ExtensionRuntimeContext = {
      getSharedContext: () => this.bus.getSharedContext(),
      emit: (type, payload) => this.bus.emit(type, payload, id),
      subscribe: (type, handler) => this.bus.subscribe(type, handler),
    };

    if (extension.handlers?.onEvent) {
      const unsub = this.bus.subscribe("*", (event) => {
        void extension.handlers?.onEvent?.(event);
      });
      this.unsubscribers.set(id, unsub);
    }

    await extension.handlers?.onRegister?.(runtime);
    this.bus.emit("extension:registered", { id }, "system");
  }

  async unregister(id: ExtensionId): Promise<void> {
    if (this.active.has(id)) {
      await this.deactivate(id);
    }
    this.unsubscribers.get(id)?.();
    this.unsubscribers.delete(id);
    this.extensions.delete(id);
    this.bus.emit("extension:unregistered", { id }, "system");
  }

  async activate(id: ExtensionId): Promise<ActivationResult> {
    const extension = this.extensions.get(id);
    if (!extension) {
      return { ok: false, id, reason: "not_registered" };
    }
    if (this.active.has(id)) {
      return { ok: false, id, reason: "already_active" };
    }

    const entitlement = getProEntitlement();
    if (!canActivateAnother(this.active.size, entitlement)) {
      const reason = proRequiredMessage(this.active.size);
      this.bus.emit("extension:denied", { id, reason }, "system");
      return { ok: false, id, reason: "pro_required" };
    }

    this.active.add(id);
    await extension.handlers?.onActivate?.();
    this.bus.emit("extension:activated", { id }, "system");
    return { ok: true, id };
  }

  async deactivate(id: ExtensionId): Promise<void> {
    const extension = this.extensions.get(id);
    if (!extension || !this.active.has(id)) return;
    this.active.delete(id);
    await extension.handlers?.onDeactivate?.();
    this.bus.emit("extension:deactivated", { id }, "system");
  }
}

/** Singleton socket used by the dashboard and future extension loaders. */
export const extensionRegistry = new ExtensionRegistry();
