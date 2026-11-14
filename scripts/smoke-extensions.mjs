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

if (failed > 0) process.exit(1);
console.log("smoke-extensions passed");
