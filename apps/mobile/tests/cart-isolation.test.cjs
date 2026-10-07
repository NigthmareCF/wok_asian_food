const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const jiti = require("jiti")(__filename);
const { createCartState } = jiti("../src/lib/cart-state.ts");
const { accountStorageKey } = jiti("../src/lib/account-storage.ts");
const productId = "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee";
const owner = "a@example.test";
const attempt = { email: owner, key: "09b7f19c-7ea1-4b55-bb27-8b342fb73f60",
  body: { requestedFor: "2026-10-06T12:00:00Z", customerNote: "Original body", items: [{ menuItemId: productId, quantity: 2 }] } };
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); }, deleteItemAsync: async (key) => { values.delete(key); } };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
// Execute the production hook with session and React external-store boundaries injected.
// Effects run after render; each render reads the selected store's real snapshot.
function hookHarness(saved, platform = "ios") {
  let session = null;
  let previousCart = Symbol("initial effect");
  let effect;
  const react = { useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect: (run, [cart]) => { if (cart !== previousCart) { previousCart = cart; effect = run; } } };
  const source = ts.transpileModule(readFileSync(require.resolve("../src/hooks/use-cart.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const imports = { react, "react-native": { Platform: { OS: platform } }, "expo-secure-store": saved,
    "@/lib/cart-state": jiti("../src/lib/cart-state.ts"),
    "@/providers/session-provider": { useSession: () => ({ session }) } };
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected hook dependency: ${name}`); return imports[name];
  } });
  return { render(email, version = 1) {
    session = email ? { email, version } : null;
    const result = exports.useCart();
    if (effect) { const run = effect; effect = null; run(); }
    return result;
  } };
}

test("A restores exact pending replay while B and guest remain independent", async () => {
  const saved = storage();
  const a = createCartState(saved, " A@Example.test "); await a.restore();
  a.changeQuantity(productId, 2); await a.prepareAttempt(attempt);
  for (const email of ["b@example.test", null]) {
    const other = createCartState(saved, email); await other.restore();
    assert.deepEqual(other.getSnapshot().items, {}); assert.equal(other.getSnapshot().attempt, null);
  }
  const restored = createCartState(saved, owner); await restored.restore();
  assert.deepEqual(restored.getSnapshot().attempt, attempt);
  assert.equal(restored.getSnapshot().items[productId], 2);
  await restored.prepareAttempt(attempt);
});

test("mismatched-owner and guest attempts are rejected before persistence", async () => {
  for (const email of ["b@example.test", null]) {
    const saved = storage(); const cart = createCartState(saved, email); await cart.restore();
    await assert.rejects(cart.prepareAttempt(attempt), /owner/i);
    assert.equal(saved.values.size, 0); assert.equal(cart.getSnapshot().attempt, null);
  }
});

test("legacy pending evidence migrates only for its owner and never gets deleted by B", async () => {
  const saved = storage({ "wok.pickup.cart.v1": JSON.stringify({ [productId]: 2 }),
    "wok.pickup.pending.v1": JSON.stringify(attempt) });
  const before = new Map(saved.values);
  for (const email of ["b@example.test", null]) {
    const other = createCartState(saved, email); await other.restore();
    assert.deepEqual(other.getSnapshot().items, {}); assert.equal(other.getSnapshot().attempt, null);
  }
  assert.deepEqual(saved.values, before);
  const a = createCartState(saved, owner); await a.restore();
  assert.deepEqual(a.getSnapshot().attempt, attempt);
  assert.equal(a.getSnapshot().items[productId], 2);
  assert.equal(saved.values.get("wok.pickup.pending.v1"), before.get("wok.pickup.pending.v1"));
  await a.completeAttempt(attempt.key);
  const restarted = createCartState(saved, owner); await restarted.restore();
  assert.equal(restarted.getSnapshot().attempt, null, "completed migration must not resurrect legacy attempt");
});

test("ownerless legacy cart is not silently assigned to a new account or guest", async () => {
  const saved = storage({ "wok.pickup.cart.v1": JSON.stringify({ [productId]: 2 }) });
  for (const email of [owner, null]) {
    const cart = createCartState(saved, email); await cart.restore(); assert.deepEqual(cart.getSnapshot().items, {});
  }
  assert.equal(saved.values.size, 1);
});

test("mismatched scoped attempts fail closed while malformed unowned legacy does not block B", async () => {
  const saved = storage({ [accountStorageKey("pending", "b@example.test")]: JSON.stringify(attempt) });
  const b = createCartState(saved, "b@example.test"); await b.restore();
  assert.equal(b.getSnapshot().ready, false); assert.equal(b.getSnapshot().attempt, null);
  await assert.rejects(b.prepareAttempt({ ...attempt, email: "b@example.test" }), /not restored/);
  for (const legacy of ["not-json", JSON.stringify({ email: 42 })]) {
    const other = createCartState(storage({ "wok.pickup.pending.v1": legacy }), "b@example.test");
    await other.restore(); assert.equal(other.getSnapshot().ready, true); assert.equal(other.getSnapshot().attempt, null);
  }
});

test("interrupted legacy migration recovers the body selection and concurrent migration is serialized", async () => {
  const saved = storage({ "wok.pickup.cart.v1": JSON.stringify({ [productId]: 49 }),
    "wok.pickup.pending.v1": JSON.stringify({ ...attempt, email: " A@Example.test " }) });
  let failCart = true;
  const disk = { ...saved, setItemAsync: async (key, value) => {
    if (failCart && key === accountStorageKey("cart", owner)) throw new Error("interrupted migration");
    return saved.setItemAsync(key, value);
  } };
  const interrupted = createCartState(disk, owner); await interrupted.restore();
  assert.equal(interrupted.getSnapshot().ready, false);
  failCart = false;
  const first = createCartState(disk, owner); const second = createCartState(disk, owner);
  await Promise.all([first.restore(), second.restore()]);
  for (const cart of [first, second]) {
    assert.deepEqual(cart.getSnapshot().attempt, attempt); assert.equal(cart.getSnapshot().items[productId], 2);
  }
  assert.equal(saved.values.has("wok.pickup.pending.v1"), true);
});

test("default guest cart keeps quantity contract without transferring on login", async () => {
  const saved = storage(); const guest = createCartState(saved); await guest.restore();
  guest.changeQuantity(productId, 2);
  const a = createCartState(saved, owner); await a.restore(); assert.deepEqual(a.getSnapshot().items, {});
  const restoredGuest = createCartState(saved); await restoredGuest.restore();
  assert.equal(restoredGuest.getSnapshot().items[productId], 2);
});

test("actual hook switches synchronously and late A restore cannot appear in B or logout", async () => {
  const started = deferred(); const release = deferred(); const saved = storage({
    [accountStorageKey("cart", owner)]: JSON.stringify({ [productId]: 2 }),
    [accountStorageKey("pending", owner)]: JSON.stringify(attempt),
  }); let slow = true;
  const harness = hookHarness({ ...saved, getItemAsync: async (key) => {
    if (slow) { started.resolve(); await release.promise; }
    return saved.getItemAsync(key);
  } });
  const a = harness.render(owner); await started.promise;
  slow = false;
  const b = harness.render("b@example.test", 2);
  assert.deepEqual(b.items, {}); assert.equal(b.attempt, null);
  release.resolve(); await a.restore(); await b.restore();
  a.changeQuantity(productId, 2);
  await assert.rejects(a.prepareAttempt(attempt), /inactive|changed/i);
  assert.deepEqual(harness.render("b@example.test", 2).items, {});
  const guest = harness.render(null); await guest.restore(); assert.deepEqual(harness.render(null).items, {});
});

test("late A persistence and same-owner relogin restore ordered bytes without stale methods", async () => {
  const started = deferred(); const release = deferred(); const saved = storage(); let slow = true;
  const harness = hookHarness({ ...saved, setItemAsync: async (key, value) => {
    if (slow) { started.resolve(); await release.promise; }
    return saved.setItemAsync(key, value);
  } });
  const a = harness.render(owner); await a.restore(); a.changeQuantity(productId, 2);
  const preparing = a.prepareAttempt(attempt); const rejected = assert.rejects(preparing, /inactive|changed/i);
  await started.promise;
  const b = harness.render("b@example.test", 2); assert.deepEqual(b.items, {});
  const returning = harness.render(owner, 3);
  slow = false; release.resolve(); await rejected; await returning.restore();
  assert.deepEqual(harness.render(owner, 3).attempt, attempt);
  a.changeQuantity(productId, -1);
  assert.equal(harness.render(owner, 3).items[productId], 2);
  const guest = harness.render(null); await guest.restore(); assert.equal(harness.render(null).attempt, null);
});

test("same-owner hook consumers share one store and web memory survives switching", async () => {
  const harness = hookHarness(storage(), "web");
  const a = harness.render(owner); await a.restore(); a.changeQuantity(productId, 2);
  assert.equal(harness.render(" A@Example.test ").items[productId], 2);
  const b = harness.render("b@example.test", 2); await b.restore(); b.changeQuantity(productId, 1);
  const back = harness.render(owner, 3); await back.restore(); assert.equal(harness.render(owner, 3).items[productId], 2);
});

test("persistence failure still prevents POST through the production prepare path", async () => {
  const harness = hookHarness({ ...storage(), setItemAsync: async () => { throw new Error("disk unavailable"); } });
  const a = harness.render(owner); await a.restore(); let posts = 0;
  await assert.rejects((async () => { await a.prepareAttempt(attempt); posts++; })(), /disk unavailable/);
  assert.equal(posts, 0); assert.deepEqual(harness.render(owner).attempt, attempt);
});
