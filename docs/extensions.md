# Nexus Extension Contract

Nexus is a central AI network. Extensions (first-party and third-party) plug into the same typed **extension socket** so context and actions flow through the brain instead of living in silos.

## Packages (Step 1)

| Module | Role |
| --- | --- |
| `src/lib/extensions/types.ts` | Manifest, events, handlers, slots |
| `src/lib/extensions/bus.ts` | Typed network bus + shared context |
| `src/lib/extensions/registry.ts` | Register / activate / deactivate |
| `src/lib/extensions/pro-gate.ts` | Freemium gate (stub) |
| `src/lib/extensions/slots.ts` | Visual hub slot blueprint |

## Lifecycle

1. **Register** — provide a `NexusExtension` (`manifest` + optional `handlers`).
2. **Activate** — claims an active slot. Free plan: **2** concurrent actives.
3. **Receive events** — via `handlers.onEvent` or `runtime.subscribe`.
4. **Share context** — read `runtime.getSharedContext()` or listen for `nexus:context`.
5. **Deactivate / unregister** — release the slot and tear down listeners.

```ts
import { extensionRegistry } from "@/lib/extensions";

await extensionRegistry.register({
  manifest: {
    id: "com.example.note",
    name: "Note Node",
    version: "0.1.0",
    description: "Captures fleeting thoughts into Nexus context",
    capabilities: ["context"],
  },
  handlers: {
    onActivate: () => console.log("Note Node online"),
    onEvent: (event) => {
      if (event.type === "nexus:message") {
        // react to brain traffic
      }
    },
  },
});

const result = await extensionRegistry.activate("com.example.note");
// result.ok === false && result.reason === "pro_required" when free slots are full
```

## Event surface

| Event | Meaning |
| --- | --- |
| `nexus:ready` | Brain online |
| `nexus:context` | Shared context updated |
| `nexus:message` | User / Nexus / system pulse |
| `nexus:proactive` | Brain-initiated suggestion |
| `extension:registered` / `unregistered` | Catalog changes |
| `extension:activated` / `deactivated` | Slot occupancy |
| `extension:denied` | Activation blocked (usually Pro) |

## Freemium

- **Free:** up to `FREE_ACTIVE_EXTENSION_SLOTS` (2) active extensions.
- **Pro:** stub via `setStubPro(true)` until billing exists — unlocks more slots.

Visual hub placeholders for Studio, Study, Call, Calendar, and third-party nodes are empty in Step 1. Do not implement those products here; only the socket and slots.

## Design rules for authors

- Declare only the `capabilities` you use.
- Prefer bus events over reaching into UI state.
- Treat shared context as read-mostly; emit focused events for writes the brain should merge.
- Never assume Pro — handle `pro_required` gracefully.
