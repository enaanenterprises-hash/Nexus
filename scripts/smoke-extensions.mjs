/**
 * Smoke test for the extension socket, run against the real TypeScript sources.
 * Run: npm run smoke
 */
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
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
const { ExtensionBus, ExtensionRegistry, NEXUS_EXTENSION_API_VERSION, setStubPro, validateManifest } = ext;

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

if (failed > 0) process.exit(1);
console.log("smoke-extensions passed");
