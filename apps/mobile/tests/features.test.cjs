const assert = require("node:assert/strict");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const mobileRoot = path.dirname(require.resolve("../package.json"));
const jiti = require("jiti")(path.resolve(mobileRoot, "tests/features.test.cjs"));
const { createApiRequest, ApiError } = jiti("../src/lib/api-client.ts");
const { identitySchemas, profileSchema, tokenPairSchema } = jiti("../src/lib/identity.ts");
const { menuSchema, menuProducts, cartTotals, imageUri, pickupReceiptSchema } = jiti("../src/lib/catalog.ts");
const { createCartState } = jiti("../src/lib/cart-state.ts");
const { createSessionState, refreshKey, emailKey } = jiti("../src/lib/session-state.ts");
const productId = "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee";
const categoryId = "db76102a-9f0f-45cb-8d34-cfb5b16445f8";
const attempt = {
  email: "client@example.test", key: "09b7f19c-7ea1-4b55-bb27-8b342fb73f60",
  body: { requestedFor: "2026-10-06T12:00:00Z", items: [{ menuItemId: productId, quantity: 1 }] },
};
const identity = { email: " Client@Example.test ", name: " Ana ", password: "SafePassword2026!", code: "123456" };
const product = { id: productId, name: "Platillo de prueba", price: 68, currency: "GTQ", estimatedPreparationSeconds: 300, displayOrder: 1 };
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
}

test("identity matches Core validation and does not apply registration policy to login", () => {
  assert.equal(identitySchemas.register.parse(identity).email, "client@example.test");
  assert.equal(identitySchemas.register.parse(identity).name, "Ana");
  for (const password of ["short", "abcdefghijkl!1", "ABCDEFGHIJKL!1", "SafePassword123", "Safe Password123!"]) {
    assert.equal(identitySchemas.register.safeParse({ ...identity, password }).success, false);
    assert.equal(identitySchemas["reset-complete"].safeParse({ ...identity, password }).success, false);
  }
  assert.equal(identitySchemas.login.safeParse({ ...identity, password: "legacy" }).success, true);
  assert.equal(identitySchemas.login.safeParse({ ...identity, password: " " }).success, false);
  assert.equal(identitySchemas.verify.safeParse({ ...identity, code: "12345a" }).success, false);
  assert.equal(identitySchemas["reset-request"].safeParse({ ...identity, password: "", code: "", name: "" }).success, true);
  assert.equal(profileSchema.safeParse({ displayName: "Ana", phone: "+502 1234 5678" }).success, true);
  assert.equal(profileSchema.safeParse({ displayName: "A", phone: "abc" }).success, false);
  assert.equal(tokenPairSchema.safeParse({ accessToken: "x" }).success, false);
});

test("all transport calls target the configured BFF without cookies or header overrides", async () => {
  const calls = [];
  const request = createApiRequest("https://bff.example.test", false, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ message: "Confirmado por servidor" }), { status: 200 });
  });
  await request("/api/v1/auth/register", { method: "POST", body: "{}", credentials: "include", headers: { Authorization: "spoofed" } });
  await request("/api/v1/client/profile", { headers: { Authorization: "spoofed" } }, "memory-access");
  assert.equal(calls[0].url, "https://bff.example.test/api/v1/auth/register");
  assert.equal(calls[0].options.headers.get("Authorization"), null);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[1].options.headers.get("Authorization"), "Bearer memory-access");
});

test("transport fails closed for insecure production origins, missing config and injected paths", async () => {
  let calls = 0;
  const transport = async () => { calls++; return new Response("{}"); };
  for (const base of [undefined, "http://bff.example.test", "https://user:secret@bff.example.test", "https://bff.example.test/other", "https://bff.example.test?redirect=x"]) {
    await assert.rejects(createApiRequest(base, false, transport)("/api/v1/public/menu"), ApiError);
  }
  const request = createApiRequest("https://bff.example.test", false, transport);
  for (const route of ["//evil.example.test", "/api/v1/public/menu?url=evil", "/api/v1/../admin", "https://evil.example.test"]) {
    await assert.rejects(request(route), ApiError);
  }
  assert.equal(calls, 0);
  await createApiRequest("http://192.168.1.20:8082", true, transport)("/api/v1/public/menu");
  assert.equal(calls, 1);
});

test("network failures never claim a write was unsent and do not retry automatically", async () => {
  let calls = 0;
  const request = createApiRequest("https://bff.example.test", false, async () => { calls++; throw new Error("private transport trace"); });
  await assert.rejects(request("/api/v1/auth/register", { method: "POST", body: "{}" }), (error) => {
    assert.match(error.message, /No pudimos confirmar/);
    assert.doesNotMatch(error.message, /no se envió|private/);
    return true;
  });
  assert.equal(calls, 1);
});

test("API errors are sanitized, aborted reads settle, and 204 responses are supported", async () => {
  await assert.rejects(createApiRequest("https://bff.example.test", false,
    async () => new Response("server-private", { status: 429 }))("/api/v1/auth/login"), (error) => error.status === 429 && !error.message.includes("server-private"));
  assert.equal(await createApiRequest("https://bff.example.test", false,
    async () => new Response(null, { status: 204 }))("/api/v1/auth/logout"), undefined);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createApiRequest("https://bff.example.test", false, async (_url, options) => {
    assert.equal(options.signal.aborted, true); throw new Error("aborted");
  })("/api/v1/public/menu", { signal: controller.signal }), ApiError);
});

test("catalog uses only published menu fields and never fabricates stock, options or image paths", () => {
  const menu = menuSchema.parse({ asOf: "2026-10-05T12:00:00.123456Z", categories: [{ id: categoryId, name: "Menú", displayOrder: 1, items: [product] }] });
  assert.equal(menuProducts(menu)[0].id, productId);
  assert.equal(menuProducts(menu)[0].modifiers, undefined);
  assert.equal(menuProducts(menu)[0].availableQuantity, undefined);
  assert.equal(imageUri("asset-key"), null);
  assert.equal(imageUri("file:///private/image.png"), null);
  assert.equal(imageUri("https://user:secret@example.test/photo.png"), null);
  assert.equal(imageUri("https://cdn.example.test/photo.png"), "https://cdn.example.test/photo.png");
  assert.equal(menuSchema.safeParse({ asOf: "bad-date", categories: [] }).success, false);
  assert.equal(pickupReceiptSchema.safeParse({ requestId: 1, status: "ACCEPTED" }).success, false);
});

test("cart subtotals remain separated by currency", () => {
  const second = { ...product, id: categoryId, currency: "USD", price: 10 };
  assert.deepEqual(cartTotals([product, second], { [productId]: 2, [categoryId]: 1 }), [{ currency: "GTQ", price: 136 }, { currency: "USD", price: 10 }]);
});

test("cart restores the existing storage keys and preserves removed products", async () => {
  const saved = storage({ "wok.pickup.cart.v1": JSON.stringify({ [productId]: 2 }) });
  const cart = createCartState(saved);
  cart.changeQuantity(productId, 1);
  assert.deepEqual(cart.getSnapshot().items, {});
  await cart.restore();
  assert.equal(cart.getSnapshot().items[productId], 2);
  cart.changeQuantity(productId, -2);
  assert.deepEqual(cart.getSnapshot().items, {});
});

test("pending attempts lock every quantity edit and retain the exact replay key/body", async () => {
  const saved = storage(); const cart = createCartState(saved);
  await cart.restore(); cart.changeQuantity(productId, 1);
  await cart.prepareAttempt(attempt);
  cart.changeQuantity(productId, -1); cart.changeQuantity(productId, 1);
  assert.equal(cart.getSnapshot().items[productId], 1);
  await assert.rejects(cart.prepareAttempt({ ...attempt, key: categoryId }));
  await assert.rejects(cart.prepareAttempt({ ...attempt, body: { ...attempt.body, customerNote: "Changed payload" } }));
  const restored = createCartState(saved); await restored.restore();
  assert.deepEqual(restored.getSnapshot().attempt, attempt);
  await restored.prepareAttempt(attempt);
  assert.deepEqual(JSON.parse(saved.values.get("wok.pickup.pending.v1")), attempt);
  await restored.completeAttempt(attempt.key);
  assert.equal(restored.getSnapshot().attempt, null);
  assert.deepEqual(restored.getSnapshot().items, {});
});

test("storage errors and malformed pending attempts do not enable new writes", async () => {
  const invalid = createCartState(storage({ "wok.pickup.pending.v1": "not-json" })); await invalid.restore();
  assert.equal(invalid.getSnapshot().ready, false);
  assert.ok(invalid.getSnapshot().error);
  let saves = 0;
  const broken = createCartState({ ...storage(), setItemAsync: async () => { saves++; throw new Error("unavailable"); } });
  await broken.restore(); await assert.rejects(broken.prepareAttempt(attempt));
  assert.equal(broken.getSnapshot().attempt.key, attempt.key);
  assert.equal(saves, 1);
});

test("confirmed validation rejections unlock the draft, but unknown outcomes do not", async () => {
  const saved = storage(); const cart = createCartState(saved);
  await cart.restore(); cart.changeQuantity(productId, 1); await cart.prepareAttempt(attempt);
  for (const status of [401, 409, 503]) await assert.rejects(cart.releaseRejectedAttempt(attempt.key, status));
  assert.equal(cart.getSnapshot().attempt.key, attempt.key);
  await cart.releaseRejectedAttempt(attempt.key, 422);
  assert.equal(cart.getSnapshot().attempt, null);
  assert.equal(cart.getSnapshot().items[productId], 1);
  assert.equal(saved.values.has("wok.pickup.pending.v1"), false);
  cart.changeQuantity(productId, 1);
  assert.equal(cart.getSnapshot().items[productId], 2);
});

test("late refresh storage writes cannot resurrect a logged-out session", async () => {
  const saved = storage(); const state = createSessionState(saved);
  const previous = state.current();
  await state.save(previous, "refresh-old", "old@example.test");
  const next = state.advance();
  await state.clear(next);
  await assert.rejects(state.save(previous, "late-refresh", "old@example.test"), ApiError);
  assert.equal(saved.values.has(refreshKey), false);
  assert.equal(saved.values.has(emailKey), false);
});

test("in-flight refresh writes are cleared before another account is stored", async () => {
  const saved = storage(); let release; let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const pause = new Promise((resolve) => { release = resolve; });
  const state = createSessionState({ ...saved, setItemAsync: async (key, value) => {
    if (value === "slow-refresh") { started(); await pause; }
    await saved.setItemAsync(key, value);
  } });
  const previous = state.current();
  const slow = state.save(previous, "slow-refresh", "old@example.test");
  const rejected = assert.rejects(slow, ApiError);
  await entered;
  const next = state.advance();
  const cleared = state.clear(next);
  release(); await rejected; await cleared;
  await state.save(next, "new-refresh", "new@example.test");
  assert.deepEqual(await state.read(next), { refreshToken: "new-refresh", email: "new@example.test" });
});

test("catalog uses virtualized image lists and retains the existing provider tree", () => {
  const read = (file) => readFileSync(path.resolve(mobileRoot, file), "utf8");
  const menu = read("app/(tabs)/menu.tsx"); const cart = read("app/cart.tsx");
  const layout = read("app/_layout.tsx");
  assert.match(menu, /<FlatList/); assert.match(cart, /<FlatList/);
  assert.match(menu, /<ProductImage/); assert.match(cart, /<ProductImage/);
  assert.match(read("src/components/product-image.tsx"), /from "expo-image"/);
  assert.doesNotMatch(`${menu}\n${cart}`, /#[a-f0-9]{3,8}\b|\[[\d.]+px\]/i);
  assert.doesNotMatch(layout, /QueryClientProvider|CartProvider/);
  assert.doesNotMatch(read("src/hooks/use-cart.ts"), /localStorage|sessionStorage|apiRequest/);
  assert.match(read("app/(tabs)/account.tsx"), /if \(offline\) \{ setLoading\(false\); return; \}/);
  assert.match(read("src/providers/session-provider.tsx"), /else if \(!current\.offline\) setSession/);
});
