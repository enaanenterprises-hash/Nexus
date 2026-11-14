# Nexus Extension Contract

Nexus is a central AI network. Extensions (first-party and third-party) plug into the same typed **extension socket** so context and actions flow through the brain instead of living in silos. On the dashboard, every active extension sits in a **hub socket** wired into the golden network.

Contract version: **`apiVersion: 1`** (`NEXUS_EXTENSION_API_VERSION`).

## Modules

| Module | Role |
| --- | --- |
| `src/lib/extensions/types.ts` | Manifest, events, handlers, slots, snapshot types |
| `src/lib/extensions/manifest.ts` | `defineExtension`, `validateManifest`, `ManifestError` |
| `src/lib/extensions/bus.ts` | Typed network bus + shared context |
| `src/lib/extensions/registry.ts` | Register / activate into a socket / deactivate; subscribable snapshot |
| `src/lib/extensions/pro-gate.ts` | Freemium gate (stub) + entitlement changes |
| `src/lib/extensions/slots.ts` | Hub socket blueprint + planned first-party placeholders |
| `src/lib/extensions/use-extension-hub.ts` | React binding (`useSyncExternalStore`) |
| `src/extensions/samples.ts` | Reference extensions written against this contract |

## Lifecycle

1. **Define** — `defineExtension({ manifest, handlers })`. Manifests are validated when defined and again on register; problems throw a `ManifestError` listing every issue.
2. **Register** — `extensionRegistry.register(extension)`. Adds it to the hub catalog and calls `onRegister(runtime)`.
3. **Activate** — `extensionRegistry.activate(id, { slotId? })` snaps it into a socket. Without `slotId`, the first open socket the plan allows is used.
4. **Run** — while active, `onEvent(event, runtime)` receives every bus event not emitted by the extension itself. Use `runtime.emit` / `runtime.subscribe` / `runtime.getSharedContext`.
5. **Deactivate / unregister** — frees the socket, calls `onDeactivate(runtime)`, tears down listeners.

```ts
import { NEXUS_EXTENSION_API_VERSION, defineExtension, extensionRegistry } from "@/lib/extensions";

export const noteNode = defineExtension({
  manifest: {
    id: "com.example.note",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Note Node",
    version: "0.1.0",
    description: "Captures fleeting thoughts into Nexus context",
    capabilities: ["context"],
    monogram: "NN",
  },
  handlers: {
    onActivate: (runtime) =>
      runtime.emit("nexus:proactive", { suggestion: "Note Node is listening.", at: new Date().toISOString() }),
    onEvent: (event, runtime) => {
      if (event.type === "nexus:message") {
        // react to brain traffic
      }
    },
  },
});

await extensionRegistry.register(noteNode);
const result = await extensionRegistry.activate(noteNode.manifest.id);
if (!result.ok) console.warn(result.reason, result.message); // e.g. "pro_required"
```

`nexus:proactive` events emitted by an active extension are spoken by Nexus on the dashboard, attributed to the extension ("Note Node · via Nexus").

## Manifest rules

| Field | Rule |
| --- | --- |
| `id` | Reverse-DNS, lowercase: `com.acme.notes` |
| `apiVersion` | Must equal `NEXUS_EXTENSION_API_VERSION` |
| `version` | Semver |
| `capabilities` | At least one of `tasks`, `context`, `media`, `calendar`, `voice`, `research`, `custom` |
| `monogram` | Optional, ≤ 2 characters, shown inside the hub node |
| `requiresPro` | Optional; activation is denied on the free plan |

## Sockets and the Pro gate

| Socket | Tier | Placeholder (ghost while empty) |
| --- | --- | --- |
| `slot-free-1` | free | Studio |
| `slot-free-2` | free | Study |
| `slot-pro-1` | pro | Call |
| `slot-pro-2` | pro | Calendar |
| `slot-pro-3` | pro | Third-party |

- **Free:** up to `FREE_ACTIVE_EXTENSION_SLOTS` (2) active extensions, free sockets only.
- **Pro:** stub via `setStubPro(true)` until billing exists. It opens every socket.
- **Downgrade:** when Pro turns off, extensions in Pro sockets are deactivated automatically.
- Placeholders are suggestions only. Studio, Study, Call, and Calendar are not implemented yet, and any extension can occupy any socket its plan allows.

`activate()` never throws for expected failures. It returns:

| `reason` | When |
| --- | --- |
| `not_registered` | Unknown id |
| `already_active` | Already in a socket |
| `pro_required` | Free plan is full, the socket is Pro, or the manifest `requiresPro` |
| `slot_occupied` | Requested `slotId` already holds an extension |
| `unknown_slot` | Requested `slotId` does not exist |

## Observing the hub

`extensionRegistry.subscribe(listener)` + `extensionRegistry.getSnapshot()` expose an immutable `ExtensionHubSnapshot` (`extensions`, `slots`, `entitlement`, `lastSnapped`). The snapshot object only changes when something changes, so it works directly with `useSyncExternalStore`; React code can use `useExtensionHub()`.

## Event surface

| Event | Payload | Meaning |
| --- | --- | --- |
| `nexus:ready` | `{ version }` | Brain online |
| `nexus:state` | `{ state: "idle" \| "thinking" \| "responding" }` | What the brain is doing (drives the core visual) |
| `nexus:context` | `NexusSharedContext` | Shared context updated (active tasks, focus) |
| `nexus:message` | `{ role, text, at }` | User / Nexus / system utterance |
| `nexus:proactive` | `{ suggestion, at }` | Brain- or extension-initiated suggestion |
| `extension:registered` / `unregistered` | `{ id }` | Catalog changes |
| `extension:activated` / `deactivated` | `{ id, slotId }` | Socket occupancy |
| `extension:denied` | `{ id, reason }` | Activation blocked (usually Pro) |
| `entitlement:changed` | `{ isPro }` | Plan changed |

Every event carries `source` (extension id, `"nexus"`, or `"system"`) and an ISO `at`. Handler errors are caught and logged; one failing extension cannot break the bus.

## Changes from Step 1

- Manifests require `apiVersion` and are validated (`ManifestError`).
- `activate()` binds to a socket, accepts `{ slotId }`, and returns `slotId` on success or `{ reason, message }` on failure.
- `extension:activated` / `deactivated` payloads include `slotId`. Added the `nexus:state` and `entitlement:changed` events.
- Handlers receive the runtime: `onActivate(runtime)`, `onDeactivate(runtime)`, `onEvent(event, runtime)`. `onEvent` only fires while the extension is active.
- Free plan is limited to free sockets. Downgrades release Pro sockets.
- New: `subscribe` / `getSnapshot`, `useExtensionHub`, `subscribeEntitlement`, `canUseSlot`, `PLANNED_EXTENSIONS`.

## Design rules for authors

- Declare only the `capabilities` you use.
- Prefer bus events over reaching into UI state.
- Treat shared context as read-mostly; emit focused events for writes the brain should merge.
- Never assume Pro. Handle `pro_required` gracefully.

Run `npm run smoke` to check the gate and socket rules against the real sources.
