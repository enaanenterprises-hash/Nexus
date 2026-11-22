/**
 * Smoke test for the extension socket, run against the real TypeScript sources.
 * Run: npm run smoke
 */
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const rootUrl = new URL("../src/", ${JSON.stringify(import.meta.url)}).href;
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith("@/")) {
          const mapped = rootUrl + specifier.slice(2);
          try {
            return await next(mapped, context);
          } catch {
            try {
              return await next(mapped + ".ts", context);
            } catch {
              return next(mapped + "/index.ts", context);
            }
          }
        }
        try {
          return await next(specifier, context);
        } catch (error) {
          if (specifier.startsWith(".") && !/\\.[cm]?[jt]s$/.test(specifier)) {
            return next(specifier + ".ts", context);
          }
          throw error;
        }
      }
    `),
);

const ext = await import("../src/lib/extensions/index.ts");
const {
  EXTENSION_SLOT_BLUEPRINT,
  ExtensionBus,
  ExtensionRegistry,
  NEXUS_EXTENSION_API_VERSION,
  computeExtensionLinks,
  setStubPro,
  validateManifest,
} = ext;
const { STUDIO_NODE_ID, studioExtension } = await import("../src/extensions/studio/node.ts");
const { CINEMA_NODE_ID, cinemaExtension } = await import("../src/extensions/cinema/node.ts");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

const manifest = (id, extra = {}) => ({
  id,
  apiVersion: NEXUS_EXTENSION_API_VERSION,
  name: id,
  version: "0.1.0",
  description: "smoke",
  capabilities: ["context"],
  ...extra,
});

assert(validateManifest(manifest("com.acme.one")).length === 0, "valid manifest passes");
assert(validateManifest(manifest("Bad Id")).length > 0, "invalid id is rejected");
assert(validateManifest(manifest("com.acme.v", { apiVersion: 99 })).length > 0, "wrong apiVersion is rejected");

const bus = new ExtensionBus();
const registry = new ExtensionRegistry(bus);
const seen = [];
bus.subscribe("*", (event) => seen.push(event.type));

for (const id of ["com.acme.a", "com.acme.b", "com.acme.c"]) {
  await registry.register({ manifest: manifest(id) });
}

const a = await registry.activate("com.acme.a");
const b = await registry.activate("com.acme.b");
const c = await registry.activate("com.acme.c");
assert(a.ok && a.slotId === "slot-free-1", "free: first extension takes free socket 1");
assert(b.ok && b.slotId === "slot-free-2", "free: second extension takes free socket 2");
assert(!c.ok && c.reason === "pro_required", "free: third extension is gated");
assert(seen.includes("extension:denied"), "denial is broadcast on the bus");

setStubPro(true);
const c2 = await registry.activate("com.acme.c");
assert(c2.ok && c2.slotId.startsWith("slot-pro"), "pro: third extension takes a Pro socket");

setStubPro(false);
await new Promise((r) => setTimeout(r, 0));
assert(!registry.isActive("com.acme.c"), "downgrade releases Pro sockets");
assert(registry.isActive("com.acme.a") && registry.isActive("com.acme.b"), "downgrade keeps free sockets");

const snapshot = registry.getSnapshot();
assert(snapshot === registry.getSnapshot(), "snapshot is stable between changes");
await registry.deactivate("com.acme.a");
assert(snapshot !== registry.getSnapshot(), "snapshot changes after deactivate");

const R = "content:research.source:read";
const A = "content:research.source:annotate";
assert(validateManifest(manifest("com.acme.r", { capabilities: [R] })).length === 0, "content read capability is valid");
assert(validateManifest(manifest("com.acme.w", { capabilities: [A] })).length > 0, "annotate without read is rejected");
assert(validateManifest(manifest("com.acme.x", { capabilities: ["content:Bad:read"] })).length > 0, "malformed content capability is rejected");
assert(validateManifest(manifest("com.acme.y", { capabilities: ["content:research.source:delete"] })).length > 0, "unknown content action is rejected");
assert(
  validateManifest(manifest("com.acme.p", { provides: [{ kind: "study.flashcard", version: 0, description: "", actions: ["read"] }] })).length > 0,
  "provided kind needs version >= 1",
);

const { createContentClient, contentKinds } = ext;
const calls = [];
const fakeFetch = async (url, init) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ collections: [], items: [] }), { status: 200, headers: { "content-type": "application/json" } });
};
let active = false;
const reader = createContentClient({ extensionId: "com.acme.reader", capabilities: [R], isActive: () => active, fetch: fakeFetch });
assert(reader.can("research.source", "read") && !reader.can("research.source", "annotate"), "client reports declared capabilities");
const inactive = await reader.collections("research.source").then(() => null, (e) => e);
assert(inactive?.code === "inactive" && calls.length === 0, "content client refuses while not in a socket");
active = true;
const denied = await reader.annotate("research.source", "s1", { notes: { body: "x" } }).then(() => null, (e) => e);
assert(denied?.code === "forbidden" && calls.length === 0, "undeclared annotate is refused before any request");
await reader.list("research.source", { collectionId: "c1", tag: "ai" });
const h = calls[0]?.init.headers ?? {};
assert(
  calls[0]?.url === "/api/extensions/content/research.source/items?collectionId=c1&tag=ai" &&
    h["x-nexus-extension"] === "com.acme.reader" &&
    h["x-nexus-capabilities"] === R &&
    h["x-nexus-content-version"] === "1",
  "content client sends id, capabilities and schema version",
);

await registry.register({
  manifest: manifest("com.acme.study", {
    capabilities: [R],
    provides: [{ kind: "study.flashcard", version: 1, description: "smoke", actions: ["read"] }],
  }),
});
assert(contentKinds.get("study.flashcard")?.provider === "com.acme.study", "registering a provider adds its content kind");
const clash = await registry
  .register({ manifest: manifest("com.acme.other", { provides: [{ kind: "study.flashcard", version: 1, description: "x", actions: ["read"] }] }) })
  .then(() => null, (e) => e);
assert(clash instanceof Error, "a second provider for the same kind is refused");
await registry.unregister("com.acme.study");
assert(!contentKinds.get("study.flashcard"), "unregistering removes the provider's kinds");
let runtimeContent;
await registry.register({
  manifest: manifest("com.acme.docs", { capabilities: [R] }),
  handlers: { onRegister: (runtime) => void (runtimeContent = runtime.content) },
});
assert(runtimeContent?.can("research.source", "read"), "registry hands a content client to the runtime");

// ——— Nexus Command platform ———
const { CONNECTOR_CATALOG } = await import("../src/lib/connectors/catalog.ts");
const { validateConnectorManifest } = await import("../src/lib/connectors/validate.ts");
const { planRun, executePlan, resolveParams } = await import("../src/lib/command/automation/engine.ts");
const { BUILT_IN_RECIPES } = await import("../src/lib/command/automation/recipes.ts");
const { parseReceipt } = await import("../src/lib/command/parsers/receipt.ts");
const { buildTimeline } = await import("../src/lib/command/timeline.ts");

assert(CONNECTOR_CATALOG.length >= 30 && CONNECTOR_CATALOG.every((m) => validateConnectorManifest(m).length === 0), "every connector manifest is valid");
assert(new Set(CONNECTOR_CATALOG.map((m) => m.id)).size === CONNECTOR_CATALOG.length, "connector ids are unique");
assert(
  validateConnectorManifest({ ...CONNECTOR_CATALOG[0], actions: ["goal.check"] }).length > 0,
  "connectors cannot claim core actions",
);
assert(
  validateConnectorManifest({ ...CONNECTOR_CATALOG[0], auth: { type: "api_key", docsUrl: "", fields: [{ key: "x", label: "x", secret: false }] } }).length > 0,
  "api_key auth needs a secret field",
);

const item = (kind, data, extra = {}) => ({
  kind,
  version: 1,
  id: `${data.connectorId}:${extra.externalId ?? "x"}`,
  title: extra.title ?? "Item",
  collectionId: data.connectorId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  data: { origin: "sync", externalId: "x", url: null, ...data },
});

const gatedBus = new ExtensionBus();
const gatedRegistry = new ExtensionRegistry(gatedBus);
const got = { ledger: [], blind: [] };
await gatedRegistry.register({
  manifest: manifest("com.acme.ledger", { capabilities: ["content:command.purchase:read"] }),
  handlers: { onEvent: (e) => void got.ledger.push(e.type) },
});
await gatedRegistry.register({ manifest: manifest("com.acme.blind"), handlers: { onEvent: (e) => void got.blind.push(e.type) } });
await gatedRegistry.activate("com.acme.ledger");
await gatedRegistry.activate("com.acme.blind");
const purchase = item("command.purchase", { connectorId: "command", merchant: "Acme", total: 12, currency: "USD" });
gatedBus.emit("command:item-published", { kind: "command.purchase", item: purchase }, "dev.nexus.core.command");
gatedBus.emit("command:item-published", { kind: "command.message", item: purchase }, "dev.nexus.core.command");
await new Promise((r) => setTimeout(r, 0));
assert(got.ledger.filter((t) => t === "command:item-published").length === 1, "command items reach only extensions with content:<kind>:read");
assert(!got.blind.includes("command:item-published"), "extensions without the capability never see command items");

const now = new Date("2026-11-14T15:00:00Z");
const focus = { id: "f1", title: "Fix #42", targetItemId: null, minutes: 50, startedAt: now.toISOString(), endsAt: "2026-11-14T15:50:00Z", endedAt: null };
const deep = BUILT_IN_RECIPES.find((r) => r.id === "deep-work-start");
const targets = [
  { connectorId: "google-calendar", actions: ["calendar.block"] },
  { connectorId: "slack", actions: ["presence.dnd"] },
  { connectorId: "discord", actions: ["presence.dnd"] },
];
const plan = planRun(deep, { type: "focus.started", focus }, targets, now);
const step = (a) => plan.steps.find((s) => s.action === a);
assert(plan.matched && step("calendar.block").params.title === "Focus · Fix #42", "deep work plans a calendar block from templates");
assert(step("presence.dnd").targets.length === 2, "dispatch 'all' fans out to every connected service");
assert(step("music.play").skipped !== null, "actions with no connected service are skipped, not failed");
const results = await executePlan(plan, async (s, c) => {
  if (c === "discord") throw new Error("boom");
  return { detail: `${s.action} on ${c}` };
});
assert(results.some((r) => r.status === "failed") && results.some((r) => r.status === "ok"), "one failing step does not stop the run");
assert(resolveParams({ n: "{{a.b}}", s: "x{{a.b}}" }, { a: { b: 3 } }).n === 3, "whole-template params keep their type");

const email = {
  from: "Acme Store <orders@acme.com>",
  subject: "Your order #A1B2C3D has shipped",
  body: "Thanks for your order!\n1 x Mechanical keyboard $89.00\nOrder total: $94.50\nTracking: 1Z999AA10123456784",
};
const r = parseReceipt(email);
assert(r.isReceipt && r.total === 94.5 && r.currency === "USD" && r.orderNumber === "A1B2C3D", "receipt parser reads total, currency and order number");
assert(r.tracking?.carrier === "ups" && r.tracking.number === "1Z999AA10123456784" && r.merchant === "Acme Store", "receipt parser finds carrier tracking and merchant");
assert(!parseReceipt({ from: "a@b.com", subject: "Lunch?", body: "Total vibes" }).isReceipt, "ordinary mail is not a receipt");
const receiptRecipe = BUILT_IN_RECIPES.find((x) => x.id === "receipt-to-tracker");
const msg = item("command.message", { connectorId: "gmail", channel: "email", ...email, snippet: "", receivedAt: now.toISOString(), labels: [] });
assert(planRun(receiptRecipe, { type: "item.created", item: msg }, [], now).matched, "receipt recipe matches a receipt email");

const run = BUILT_IN_RECIPES.find((x) => x.id === "run-to-goal");
const stravaRun = item("command.activity", { connectorId: "strava", activity: "run", status: "completed", startedAt: now.toISOString(), metrics: { distance_km: 5.2 } });
const ride = item("command.activity", { connectorId: "strava", activity: "ride", status: "completed", startedAt: now.toISOString(), metrics: {} });
const runPlan = planRun(run, { type: "item.created", item: stravaRun }, [], now);
assert(runPlan.matched && runPlan.steps[0].params.value === 5.2, "a Strava run triggers the goal recipe with its distance");
assert(!planRun(run, { type: "item.created", item: ride }, [], now).matched, "a ride does not trigger the run recipe");
const f1 = BUILT_IN_RECIPES.find((x) => x.id === "f1-session-reminder");
const soon = item("command.event", { connectorId: "f1", category: "sport", startsAt: "2026-11-14T15:40:00Z", status: "confirmed" });
const later = item("command.event", { connectorId: "f1", category: "sport", startsAt: "2026-11-14T19:00:00Z", status: "confirmed" });
assert(planRun(f1, { type: "item.upcoming", item: soon }, [], now).matched && !planRun(f1, { type: "item.upcoming", item: later }, [], now).matched, "upcoming triggers respect their window");

const tl = buildTimeline(
  [
    item("command.event", { connectorId: "google-calendar", startsAt: "2026-11-14T14:00:00Z", endsAt: "2026-11-14T16:00:00Z", status: "confirmed" }, { externalId: "a", title: "Standup" }),
    item("command.event", { connectorId: "google-calendar", startsAt: "2026-11-14T20:00:00Z", endsAt: null, status: "confirmed" }, { externalId: "b", title: "Dinner" }),
    item("command.event", { connectorId: "google-calendar", startsAt: "2026-11-15T20:00:00Z", endsAt: null, status: "confirmed" }, { externalId: "c", title: "Tomorrow" }),
    item("command.task", { connectorId: "github", status: "open", priority: "high", dueAt: null }, { externalId: "d", title: "Review PR" }),
    item("command.signal", { connectorId: "weather", metric: "weather.now" }, { externalId: "e", title: "Weather" }),
  ],
  { now, timeZone: "America/Toronto" },
);
assert(tl.day === "2026-11-14" && tl.entries.length === 2, "timeline keeps only today's timed items in the viewer's zone");
assert(tl.entries[0].live && tl.nowIndex === 1, "timeline marks live entries and places the now marker");
assert(tl.anytime.length === 1 && tl.signals.length === 1, "untimed tasks and signals get their own lanes");

// Studio extension contract & gated event delivery
const studioBus = new ExtensionBus();
const studioReg = new ExtensionRegistry(studioBus);
const downstream = { video: [], blind: [] };
await studioReg.register(studioExtension);
await studioReg.register({
  manifest: manifest("com.acme.video", { capabilities: ["media", "content:studio.recording:read"] }),
  handlers: { onEvent: (e) => void downstream.video.push(e.type) },
});
await studioReg.register({
  manifest: manifest("com.acme.stranger", { capabilities: ["media"] }),
  handlers: { onEvent: (e) => void downstream.blind.push(e.type) },
});
const studioAct = await studioReg.activate(STUDIO_NODE_ID);
const videoAct = await studioReg.activate("com.acme.video");
studioReg.getSnapshot();
assert(studioAct.ok && videoAct.ok, "Studio extension and downstream consumer snap cleanly into free sockets");
assert(contentKinds.get("studio.recording")?.provider === STUDIO_NODE_ID, "studio.recording content kind registered to Studio");
studioBus.emit(
  "studio:take-routed",
  {
    recordingId: "rec-1",
    targetNodeId: "com.acme.video",
    intent: "video-studio",
    title: "Intro Voicing",
    envelope: {
      kind: "studio.recording",
      version: 1,
      id: "rec-1",
      title: "Intro Voicing",
      collectionId: "col-1",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      data: {
        description: null,
        bpm: 120,
        countInBars: 1,
        durationMs: 4200,
        masterGain: 1,
        tracks: [],
        markers: [],
        tags: [],
        transcript: null,
        summary: null,
        chapters: null,
      },
    },
  },
  STUDIO_NODE_ID,
);
await new Promise((r) => setTimeout(r, 0));
assert(downstream.video.includes("studio:take-routed"), "studio:take-routed reaches consumers declaring content:studio.recording:read");
assert(!downstream.blind.includes("studio:take-routed"), "nodes without content:studio.recording:read never see studio takes");

// Cinema extension & Studio <-> Cinema Creative Suite contract
const suiteBus = new ExtensionBus();
const suiteReg = new ExtensionRegistry(suiteBus);
const suiteSeen = { cinema: [], reader: [], blind: [] };
await suiteReg.register(studioExtension);
await suiteReg.register({
  ...cinemaExtension,
  handlers: {
    ...cinemaExtension.handlers,
    onEvent: (e) => void suiteSeen.cinema.push(e.type),
  },
});
await suiteReg.register({
  manifest: manifest("com.acme.cinema-reader", { capabilities: ["media", "content:cinema.project:read"] }),
  handlers: { onEvent: (e) => void suiteSeen.reader.push(e.type) },
});
await suiteReg.register({
  manifest: manifest("com.acme.cinema-blind", { capabilities: ["media"] }),
  handlers: { onEvent: (e) => void suiteSeen.blind.push(e.type) },
});
const suiteStAct = await suiteReg.activate(STUDIO_NODE_ID);
const suiteCnAct = await suiteReg.activate(CINEMA_NODE_ID);
assert(suiteStAct.ok && suiteCnAct.ok, "Studio and Cinema both snap into the two free Creative Suite sockets");
setStubPro(true);
await suiteReg.activate("com.acme.cinema-reader");
await suiteReg.activate("com.acme.cinema-blind");
assert(contentKinds.get("cinema.project")?.provider === CINEMA_NODE_ID, "cinema.project content kind registered to Cinema");

suiteBus.emit(
  "studio:take-routed",
  {
    recordingId: "rec-suite",
    targetNodeId: CINEMA_NODE_ID,
    intent: "video-studio",
    title: "Podcast Stem",
    envelope: {
      kind: "studio.recording",
      version: 1,
      id: "rec-suite",
      title: "Podcast Stem",
      collectionId: "col-1",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      data: {
        description: null,
        bpm: 120,
        countInBars: 1,
        durationMs: 3000,
        masterGain: 1,
        tracks: [],
        markers: [],
        tags: [],
        transcript: null,
        summary: null,
        chapters: null,
      },
    },
  },
  STUDIO_NODE_ID,
);
suiteBus.emit(
  "cinema:project-routed",
  {
    projectId: "cin-1",
    targetNodeId: STUDIO_NODE_ID,
    title: "Edit 1",
    envelope: {
      kind: "cinema.project",
      version: 1,
      id: "cin-1",
      title: "Edit 1",
      collectionId: "col-c1",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      data: {
        description: null,
        aspectRatio: "16:9",
        fps: 30,
        width: 1920,
        height: 1080,
        durationMs: 5000,
        background: { type: "solid", colorA: "#0a0a0c", colorB: "#0a0a0c", angleDeg: 135, grain: 0 },
        tracks: [],
        clips: [],
        transitions: [],
        markers: [],
        tags: [],
        notes: null,
      },
    },
  },
  CINEMA_NODE_ID,
);
await new Promise((r) => setTimeout(r, 0));
assert(suiteSeen.cinema.includes("studio:take-routed"), "Cinema receives routed Studio takes cleanly");
assert(suiteSeen.reader.includes("cinema:project-routed"), "cinema:project-routed reaches consumers declaring content:cinema.project:read");
assert(!suiteSeen.blind.includes("cinema:project-routed"), "nodes without content:cinema.project:read never see cinema projects");

suiteBus.emit(
  "studio:smart-cuts",
  {
    recordingId: "rec-smoke",
    title: "Smoke Vocal",
    keepRegions: [{ startMs: 0, endMs: 1200 }],
    removedMs: 800,
    silenceCount: 1,
    createdAt: new Date().toISOString(),
  },
  STUDIO_NODE_ID,
);
suiteBus.emit(
  "studio:rhythm-grid",
  {
    recordingId: "rec-smoke",
    title: "Smoke Beat",
    bpm: 124,
    beatMs: [0, 484, 968],
    transientMs: [0, 484],
    createdAt: new Date().toISOString(),
  },
  STUDIO_NODE_ID,
);
await new Promise((r) => setTimeout(r, 0));
assert(suiteSeen.cinema.includes("studio:smart-cuts"), "Cinema receives studio:smart-cuts with content:studio.recording:read");
assert(suiteSeen.cinema.includes("studio:rhythm-grid"), "Cinema receives studio:rhythm-grid with content:studio.recording:read");
assert(!suiteSeen.blind.includes("studio:smart-cuts"), "nodes without content:studio.recording:read never see smart-cuts");
assert(!suiteSeen.blind.includes("studio:rhythm-grid"), "nodes without content:studio.recording:read never see rhythm-grid");

// 50-slot branching hub blueprint & capability inter-node links
assert(EXTENSION_SLOT_BLUEPRINT.length === 50, "hub defines 50 extension slots (2 free + 48 Pro)");
await suiteReg.register({ manifest: manifest("com.acme.isolated", { capabilities: ["custom"] }) });
await suiteReg.activate("com.acme.isolated");
const linkSnap = suiteReg.getSnapshot();
const computedLinks = computeExtensionLinks(linkSnap.slots, linkSnap.extensions);
const studioCinemaLink = computedLinks.find(
  (l) =>
    ((l.fromId === STUDIO_NODE_ID && l.toId === CINEMA_NODE_ID) ||
      (l.fromId === CINEMA_NODE_ID && l.toId === STUDIO_NODE_ID)),
);
assert(
  studioCinemaLink?.kind === "content" && studioCinemaLink?.channel === "studio.recording",
  "computeExtensionLinks links Studio and Cinema over studio.recording content envelope",
);
assert(
  !computedLinks.some((l) => l.fromId === "com.acme.isolated" || l.toId === "com.acme.isolated"),
  "computeExtensionLinks does not link extensions with no shared capability",
);

setStubPro(false);

if (failed > 0) process.exit(1);
console.log("smoke-extensions passed");
