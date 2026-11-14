# Nexus Extension Contract

Nexus is a central AI network. Extensions (first-party and third-party) plug into the same typed **extension socket** so context and actions flow through the brain instead of living in silos. Every active extension sits in a **hub socket** wired into the golden network; bundled **core nodes** (Command, Research) are always on.

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
| `src/lib/extensions/core-nodes.ts` | Bundled core nodes (always on, no socket) |
| `src/lib/extensions/content.ts` | Shared content kinds, envelopes, `content:` capabilities |
| `src/lib/extensions/content-access.ts` | `runtime.content` client |
| `src/lib/content/` | Server side: provider interface, capability checks |
| `src/extensions/samples.ts` | Reference extensions written against this contract |
| `src/lib/extensions/event-access.ts` | Which bus events need which capability |
| `src/extensions/research/node.ts` | Research core node manifest |
| `src/extensions/command/node.ts` | Command core node manifest |
| `src/lib/connectors/` | Connector framework: manifests, catalog, credential vault |
| `src/lib/command/` | Command kinds, automation engine, recipes, timeline, storage, sync |

## Lifecycle

1. **Define** — `defineExtension({ manifest, handlers })`. Manifests are validated when defined and again on register; problems throw a `ManifestError` listing every issue.
2. **Register** — `extensionRegistry.register(extension)`. Adds it to the hub catalog and calls `onRegister(runtime)`.
3. **Activate** — `extensionRegistry.activate(id, { slotId? })` snaps it into a socket. Without `slotId`, the first open socket the plan allows is used.
4. **Run** — while active, `onEvent(event, runtime)` receives every bus event not emitted by the extension itself. Use `runtime.emit` / `runtime.subscribe` / `runtime.getSharedContext`, and `runtime.content` for [shared content](#shared-content).
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
| `capabilities` | At least one of `tasks`, `context`, `media`, `calendar`, `voice`, `research`, `automations`, `custom`, or a content capability `content:<kind>:<read\|annotate>` |
| `provides` | Optional; content kinds this extension owns (see [Shared content](#shared-content)) |
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
| `nexus:open-node` | `{ nodeId, input? }` | Ask the dashboard to open a node (Research takes `input` as a URL or query) |
| `research:query` | `{ query, kind: "search" \| "url" }` | Research ran a search or opened an address |
| `research:page-opened` | `{ url, title, siteName, sourceId }` | A page is showing in the reader |
| `research:source-saved` | `{ sourceId, collectionId, url, title }` | A page was saved into a collection |
| `research:highlight-added` | `{ sourceId, highlightId, quote }` | Text was highlighted on a saved source |
| `command:item-published` | `{ kind, item }` | A new Command item reached the network. **Gated:** needs `content:<kind>:read` |
| `command:automation-ran` | `{ run }` | An automation ran (trigger, steps, outcome). **Gated:** needs `automations` |
| `command:connection-changed` | `{ connectorId, connected }` | A service was connected or disconnected |
| `command:focus-changed` | `{ focus }` | A focus session started (`focus`) or ended (`null`) |

Every event carries `source` (extension id, `"nexus"`, or `"system"`) and an ISO `at`. Handler errors are caught and logged; one failing extension cannot break the bus.

**Gated events.** Events that carry user content are only delivered to extensions that declared the matching capability, both through `onEvent` and `runtime.subscribe` (`src/lib/extensions/event-access.ts`). Subscribing to the bus never reveals more than `runtime.content` would.

## Core nodes

Core nodes ship with Nexus and use the same manifest contract, but they are always available: they never take a hub socket and do not count toward the free plan's two active extensions. They are declared with `defineCoreNode({ extension, presentation })`, where `presentation` is `"full"` (takes over the stage) or `"panel"`.

On the dashboard the default view is only the network and the chat box. The **left menu** opens nodes: core nodes as full views, and Today, Nodes (the hub and slot manager), and each wired-in extension as panels. The **right rail** gives one-tap access to Command and to every socket (live, open, or locked). Research is hidden from navigation for now (`RESEARCH_VISIBLE` in `Dashboard.tsx`); its node, routes and tables are unchanged. Socket and Pro rules are unchanged. They live in the registry, and only the UI moved.

### Research (`dev.nexus.core.research`)

Research is the browser built into Nexus.

| Piece | Where |
| --- | --- |
| UI: tabs, back/forward, address bar, reader, live view, collections | `src/components/research/` |
| Reader route: SSRF-guarded fetch, Readability, sanitize | `GET /api/research/read?url=` (`src/lib/research/safe-fetch.ts`, `net-guard.ts`, `extract.ts`) |
| Search: one `SearchProvider` interface, Brave by default | `GET /api/research/search?q=` (`src/lib/research/search.ts`) |
| Library: collections, sources, highlights per user (Postgres) | `/api/research/collections`, `/sources`, `/highlights` (`src/lib/research/store.ts`) |
| Status for the UI (search configured, database present) | `GET /api/research/status` |

- **Address bar:** a URL or bare domain opens the page. Anything else runs a web search. Without `BRAVE_SEARCH_API_KEY` the node shows a notice, and opening addresses still works.
- **Reader:** clean article text plus title, site, author, date, reading time, source and canonical URL. Links open inside Nexus (Cmd/Ctrl-click opens a new tab). **Open original** is always there. A **live view** toggle appears only when the site's `X-Frame-Options` / CSP `frame-ancestors` allow framing.
- **Fetch safety:** only http(s) on ports 80/443. Credentials in URLs, `localhost`, `.local`/`.internal`-style names, and private, loopback, link-local, CGNAT and metadata addresses are refused. DNS answers are checked again at connect time, which covers rebinding and every redirect hop (max 5). Bodies are capped at 3 MB and the whole fetch at 12 s. HTML is sanitized with an allowlist, and links get `rel="noopener noreferrer nofollow"`.
- **Sources:** saving stores sanitized HTML, plain text and metadata, so nothing has to be fetched again. Tags and highlights (text-quote anchors: `quote`, `prefix`, `suffix`) are stored alongside. Client-sent content is re-sanitized on save.
- **AI extension points (not built):** every source has nullable `summary`, `notes` and `lean` columns, typed as `SourceSummary`, `SourceNotes` and `SourceLean` in `src/lib/research/types.ts`. A server-side `SourceAnalyzer` can be registered with `registerSourceAnalyzer()` (`src/lib/research/analyzers.ts`). Analyzers run after each save via `after()` and write one field. None are registered today.
- The chat box hands off to Research: the globe button, "research …", "search for …", "look up …", or a bare URL. `nexus:open-node` does the same from any extension.

## Shared content

Extensions interoperate through **typed, versioned content** rather than through AI. The scheme is small on purpose. Research's saved sources are the first and only kind today. Notes, documents, flashcards, 3D models and the rest get added the same way later.

### Kinds and envelopes

A content kind is named `namespace.name` (lowercase), for example `research.source`. Every item travels in an envelope:

```ts
interface ContentEnvelope<K, V, D> {
  kind: K;            // "research.source"
  version: V;         // schema version of `data`, an integer
  id: string;
  title: string;
  collectionId: string | null;
  createdAt: string;  // ISO
  updatedAt: string;
  data: D;            // kind-specific payload
}
```

Items are grouped in `ContentCollection`s (`id`, `name`, `description`, `itemCount`, `updatedAt`). For Research these are the user's research collections.

**Versioning.** A breaking change to `data` bumps the kind's `version`. Providers list every version they still serve. Clients send the version they were built against (`x-nexus-content-version`), and anything unsupported gets `400 unsupported_version`. Additive, optional fields do not need a bump.

### Providing a kind

The extension that owns a kind declares it in its manifest:

```ts
provides: [{
  kind: "research.source",
  version: 1,
  description: "A saved web page: metadata, plain text, tags, highlights, summary and notes.",
  actions: ["read", "annotate"],
}]
```

The registry records providers in `contentKinds` when an extension (or core node) registers, and drops them on unregister. A kind has exactly one provider, so a second registration for the same kind is refused. On the server each kind has a `ContentProvider` (`src/lib/content/provider.ts`) that implements `collections`, `list`, `get`, and optionally `annotate`. It is listed in `PROVIDERS` in `src/lib/content/access.ts`, and its TypeScript types are added to `ContentKindMap` by declaration merging:

```ts
declare module "@/lib/extensions/content" {
  interface ContentKindMap {
    "study.flashcard": { version: 1; listItem: FlashcardListItemV1; item: FlashcardV1; annotation: FlashcardAnnotationV1 };
  }
}
```

### Requesting access

Consumers declare capabilities `content:<kind>:<action>`:

| Capability | Grants |
| --- | --- |
| `content:<kind>:read` | List collections and items, read full items |
| `content:<kind>:annotate` | Write the kind's annotation fields. Requires `read` for the same kind |

`validateManifest` rejects malformed capabilities, unknown actions, `annotate` without `read`, and bad `provides` entries. A manifest may name a kind whose provider is not installed: calls return `unknown_kind` until it is.

Every extension's runtime has `runtime.content`:

```ts
const notesNode = defineExtension({
  manifest: {
    id: "com.example.notes",
    apiVersion: NEXUS_EXTENSION_API_VERSION,
    name: "Notes",
    version: "0.1.0",
    description: "Turns research sources into notes",
    capabilities: ["content:research.source:read", "content:research.source:annotate"],
  },
  handlers: {
    onEvent: async (event, runtime) => {
      if (event.type !== "research:source-saved") return;
      const source = await runtime.content.get("research.source", event.payload.sourceId);
      await runtime.content.annotate("research.source", source.id, {
        notes: { body: `Read later: ${source.title} (${source.data.wordCount} words)` },
      });
    },
  },
});
```

| Method | Needs |
| --- | --- |
| `can(kind, action)` | — |
| `collections(kind)` | `read` |
| `list(kind, { collectionId?, tag? })` | `read` |
| `get(kind, id)` | `read` |
| `annotate(kind, id, input)` | `annotate` |

Calls fail fast with `ContentClientError` when the capability is not declared (`forbidden`) or the extension is not in a socket (`inactive`).

HTTP, for the client and future out-of-process extensions (all require the user's session):

| Route | Purpose |
| --- | --- |
| `GET /api/extensions/content` | Kinds this server serves, with versions and actions |
| `GET /api/extensions/content/:kind/collections` | Collections |
| `GET /api/extensions/content/:kind/items?collectionId=&tag=` | Item envelopes, listing payload |
| `GET /api/extensions/content/:kind/items/:id` | Full item |
| `PUT /api/extensions/content/:kind/items/:id/annotations` | Annotation write-back |

Headers: `x-nexus-extension` (manifest id), `x-nexus-capabilities` (comma-separated `content:` capabilities), `x-nexus-content-version`. Errors are `{ error, code }` with `forbidden` 403, `not_found` 404, `unknown_kind` 404, `invalid` 400, or `unsupported_version` 400.

**Trust model.** Every query is scoped to the signed-in user, so an extension can never reach another user's data. Today extensions run in the dashboard page with the user's session. That makes capabilities a declared contract the registry and server enforce, not a sandbox. When packaged third-party extensions run isolated, the loader will issue per-extension tokens bound to their declared capabilities, and the same routes and checks apply.

### `research.source` v1

Provided by Research. Types live in `src/lib/research/types.ts`.

| Shape | `data` fields |
| --- | --- |
| List item (`ResearchSourceListItemV1`) | `url`, `canonicalUrl`, `siteName`, `author`, `publishedAt`, `excerpt`, `tags`, `wordCount`, `highlightCount` |
| Item (`ResearchSourceContentV1`) | the above without `highlightCount`, plus `lang`, `imageUrl`, `text` (plain article text), `fetchedAt`, `highlights[]` (`id`, `quote`, `prefix`, `suffix`, `note`, `createdAt`), `summary`, `notes`, `lean` |
| Annotation (`ResearchSourceAnnotationV1`) | `summary?: { text, keyPoints?, model }`, `notes?: { body }` |

Research lists items per collection (`collectionId` is required). The sanitized HTML stays inside Research. Write-back is limited to `summary` and `notes`. The server stamps `generatedAt` / `updatedAt` and the writing `extensionId`, and sets `notes.author` to `"extension"`. `lean` stays read-only for extensions and is reserved for analyzers.

## Nexus Command (`dev.nexus.core.command`)

Command is the cockpit for external services and works without AI. It connects services through **connectors**, normalizes what they report into **`command.*` content kinds**, puts the day on one **timeline**, and lets services work together through deterministic **automations**. Other extensions build on it by reading those kinds and listening for gated events.

### Connectors

One typed manifest per service, in `src/lib/connectors/catalog.ts`, validated by `defineConnector`:

| Field | Meaning |
| --- | --- |
| `id`, `name`, `monogram`, `description` | Identity; `id` is kebab-case |
| `category` | `comms`, `dev`, `academics`, `fitness`, `environment`, `media`, `markets` |
| `auth` | `{ type: "none" }`, `{ type: "api_key", fields, docsUrl }` (at least one `secret` field), or `{ type: "oauth", provider, scopes, docsUrl }` |
| `produces` | `command.*` kinds the service publishes |
| `actions` | Automation actions it can carry out (`calendar.block`, `presence.dnd`, `notify.send`, …). Core actions are refused |
| `settings` | Typed, non-secret settings (`location`, `list`, `text`) with defaults |
| `live` | `{ status: "available", api, env? }` or `{ status: "planned", note }`. Only available connectors can be connected |

The server side of a connector is a `ConnectorDriver` (`src/lib/command/drivers/types.ts`): optional `verify`, `fetch` (a snapshot; items missing from the next snapshot are pruned) and `actions`. Drivers throw `DriverError` (`auth`, `config`, `upstream`) with a message the user can act on.

**Credentials** are stored per user in `command_connection.credentials`, sealed with AES-256-GCM (`src/lib/connectors/vault.ts`). The key is `NEXUS_CREDENTIALS_KEY` (32 bytes, base64), or an HKDF derivation of `AUTH_SECRET` when it is not set. Secrets are never returned to the browser; the client only sees `hasCredentials`.

### Content kinds

All eight kinds are `version: 1`, read-only for consumers, and travel in the usual envelope. `collectionId` is the connector id (`command` for items Command itself creates). Every `data` has `connectorId`, `origin` (`sync`, `automation`, `user`), `externalId` and `url`. Types live in `src/lib/command/kinds.ts`.

| Kind | Kind-specific `data` |
| --- | --- |
| `command.event` | `startsAt`, `endsAt`, `allDay`, `location`, `category`, `status` |
| `command.task` | `status`, `priority`, `dueAt`, `project`, `doneAt`, `goal` (`metric`, `target`, `unit`, `progress`) |
| `command.deadline` | `dueAt`, `course`, `status`, `points` |
| `command.activity` | `activity` (run, ride, sleep, deploy, focus, …), `status`, `startedAt`, `endedAt`, `durationMin`, `metrics`, `detail` |
| `command.purchase` | `merchant`, `total`, `currency`, `orderNumber`, `purchasedAt`, `items[]`, `sourceItemId` |
| `command.shipment` | `carrier`, `trackingNumber`, `status`, `eta`, `merchant`, `lastEvent`, `purchaseItemId` |
| `command.message` | `channel`, `from`, `subject`, `snippet`, `body`, `receivedAt`, `labels`, and for email `threadId`, `rfcMessageId` (optional, still version 1) |
| `command.signal` | `metric`, `value`, `unit`, `display`, `change`, `status`, `observedAt`, `details` |

A finance extension that wants receipts declares `content:command.purchase:read`, then reacts to `command:item-published` and reads history with `runtime.content.list("command.purchase")`. The HTTP routes are the shared ones (`/api/extensions/content/command.purchase/items`, …).

### Automations

`src/lib/command/automation/` is a small deterministic engine. A `Recipe` is a trigger, conditions and action steps:

- **Triggers:** `item.created` (a new item of a kind, or an existing one whose `status` changed, such as a deploy that failed; optionally limited to connectors), `item.upcoming` (fires once per item when its time is within `withinHours`; checked on every sync), `focus.started`, `focus.ended`.
- **Conditions:** `{ path, op, value }` over the run scope (`item`, `focus`, `receipt`, `hoursUntil`, `now`). Operators: `eq`, `neq`, `in`, `contains`, `exists`, `gte`, `lte`, `within_hours`.
- **Actions:** `{ action, params }`, where string params may use `{{path}}` templates. Connector actions dispatch to `one` connected service or to `all` of them (Do Not Disturb on Slack and Discord). `mail.send` goes to the Gmail sending connector (`gmail.send` scope, separate from `gmail.readonly`). Core actions (`purchase.record`, `shipment.track`, `goal.check`, `signal.update`, `task.create`, `activity.log`) run inside Command.
- `planRun()` is pure. `executePlan()` runs each step; a step with no connected service is `skipped`, a failing step is `failed`, and neither stops the rest. Items an automation creates can trigger further recipes, up to two levels deep. Every run is logged in `command_automation_run`.
- The first sync of a new connection is a baseline: automations react to what changes after it, not to history.

Built-in recipes (`recipes.ts`): **Deep work** and **Deep work wrap-up**, **Receipts → tracker + ledger** (deterministic receipt and tracking-number parser in `parsers/receipt.ts`), **Run → goal + recovery**, **Failed deploy alert**, **Due-soon guard**, **F1 session reminder**.

### Drivers shipped

`src/lib/command/drivers/index.ts` registers the real drivers: `weather`, `sky`, `markets` (crypto only; currency exchange was removed), `f1`, `uptime` (keyless), `google-calendar` (next 30 days), `gmail` (recent inbox, kept on `gmail.readonly`), `gmail-send` (`gmail.send` only), `google-tasks` (Google incremental scopes), `github`, `vercel`, `telegram` (tokens), `strava`, `spotify` (OAuth through `drivers/oauth.ts`). Connectors without a driver stay `planned` and cannot be connected. Setup for each is in the README. Today shows keyless weather with no connection; mail, the 30-day calendar and sending stay empty with a connect action until Google is connected.

### HTTP API

All routes need the user's session and Postgres. Mutations return the full Command snapshot plus `created` items and `newRuns`, which the dashboard publishes on the bus as `command:item-published` and `command:automation-ran`.

| Route | Purpose |
| --- | --- |
| `GET /api/command/state` | Connections (no secrets), recent items (from 7 days ago through 31 days ahead), runs, recipes with enablement, active focus, per-connector availability |
| `GET /api/command/weather` | Keyless Open-Meteo reading for Today. Uses a Weather connection's location when one exists, otherwise the viewer's time zone |
| `POST /api/command/mail` | Send or reply through the Gmail sending connection (`to`, `cc`, `subject`, `body`, `threadId`, `inReplyTo`) |
| `POST /api/command/sync` | Pull every connected service, then run automations |
| `POST /api/command/connections` | Connect a keyless or token service (`connectorId`, `credentials`, `settings`), or update settings. Verified before saving |
| `DELETE /api/command/connections/:id` | Disconnect and drop its synced items |
| `POST` / `DELETE /api/command/focus` | Start (`title`, `minutes`, `targetItemId`) or end a Deep work session |
| `PUT /api/command/recipes/:id` | `{ enabled }` |
| `POST /api/command/goals` | Daily goal, e.g. `{ type: "run", target: 5 }` |
| `GET /api/command/oauth/:connector/start` · `/callback` | OAuth for Strava and Spotify (state cookie, code exchange, sealed tokens) |

Google services authorize through the Auth.js Google provider with extra scopes (`connectGoogleService`); the Auth.js `signIn` event stores the grant only for the service the user asked to connect, and refreshes tokens for Google services already connected.

### Timeline

`buildTimeline(items, { now, timeZone })` returns the viewer's day: timed entries in order with `past`/`live` flags and a now index, an `anytime` lane (open untimed tasks and tasks finished today), today's `goals`, the signal strip, and moving shipments.

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
- Share data as a content kind you `provide`, and read others' data only through `runtime.content`. Do not reach into another extension's storage or UI.
- To react to the outside world, consume `command.*` kinds instead of calling services yourself. Declare `content:<kind>:read` for what you need and `automations` only if you watch automation runs.
- Work without AI. AI may enrich content (summaries, lean, drafts) but must not be required to read or exchange it.

Run `npm run smoke` to check the gate and socket rules against the real sources.
