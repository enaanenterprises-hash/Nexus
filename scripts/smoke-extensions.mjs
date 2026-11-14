/**
 * Lightweight smoke test for the freemium activation gate.
 * Run: node --experimental-strip-types is not used; this mirrors the gate logic.
 */

const FREE_ACTIVE_EXTENSION_SLOTS = 2;

function canActivateAnother(currentActiveCount, isPro) {
  const max = isPro ? Number.POSITIVE_INFINITY : FREE_ACTIVE_EXTENSION_SLOTS;
  return currentActiveCount < max;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

assert(canActivateAnother(0, false) === true, "free: first slot ok");
assert(canActivateAnother(1, false) === true, "free: second slot ok");
assert(canActivateAnother(2, false) === false, "free: third slot blocked");
assert(canActivateAnother(2, true) === true, "pro: third slot ok");

if (failed > 0) {
  process.exit(1);
}
console.log("smoke-extensions passed");
