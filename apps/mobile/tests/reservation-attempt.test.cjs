const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const jiti = require("jiti")(__filename);
const owner = "a@example.test";
const key = "09b7f19c-7ea1-4b55-bb27-8b342fb73f60";
const body = JSON.stringify({ guests: 2, requestedAt: "2099-10-06T12:00:00Z", preorder: false, notes: "Original" });
const draft = { ownerEmail: owner, guests: "2", requestedAt: "2099-10-06T12:00", notes: "Original", preorder: false, savedAt: Date.now() };
const receipt = { requestId: key, reservationId: "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee", submitted: true,
  decision: "REQUIRES_HUMAN_APPROVAL", reasonCodes: [], minimumOccupancyMinutes: 60, maximumOccupancyMinutes: 90, message: "Pending review" };
function helper() { return jiti("../src/lib/reservation-attempt.ts"); }
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItemAsync: async (name) => values.get(name) ?? null,
    setItemAsync: async (name, value) => { values.set(name, value); }, deleteItemAsync: async (name) => { values.delete(name); } };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

// Render the actual production screen and invoke its JSX handlers with deterministic
// React lifecycle/session/storage boundaries. No source regex acts as submission proof.
function screenHarness(saved, transport, platform = "ios") {
  let session = { email: owner, version: 1, offline: false }; let instance; let cursor; let uuidCalls = 0; let visited;
  const instances = new Map(); const effects = []; const timers = new Map(); let nextTimer = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => value === b[index]);
  const slot = (initial) => { const index = cursor++; if (!(index in instance.cells)) instance.cells[index] = initial(); return [index, instance.cells[index]]; };
  const react = {
    useState(initial) { const target = instance; const [index, value] = slot(() => typeof initial === "function" ? initial() : initial);
      return [value, (next) => { target.cells[index] = typeof next === "function" ? next(target.cells[index]) : next; }]; },
    useRef(initial) { return slot(() => ({ current: initial }))[1]; },
    useCallback(fn, deps) { const [index, old] = slot(() => null); if (!old || !same(old.deps, deps)) instance.cells[index] = { fn, deps }; return instance.cells[index].fn; },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useEffect(run, deps) { const target = instance; const [index, old] = slot(() => null);
      if (!old || !same(old.deps, deps)) { instance.cells[index] = { deps, cleanup: old?.cleanup }; effects.push(() => {
        old?.cleanup?.(); target.cells[index].cleanup = run();
      }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, props, elementKey) => ({ type, props: props ?? {}, key: elementKey });
  const ui = Object.fromEntries(["Button", "Card", "Field", "Heading", "Notice", "Page"].map((name) => [name, name]));
  const imports = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "expo-secure-store": saved,
    "expo-crypto": { randomUUID: () => { uuidCalls++; return key; } },
    "react-native": { Platform: { OS: platform }, ActivityIndicator: "ActivityIndicator", ScrollView: "ScrollView", Text: "Text", View: "View" },
    "@/components/ui": { ...ui, palette: {}, ui: {} },
    "@/lib/account-storage": jiti("../src/lib/account-storage.ts"),
    "@/lib/api": { ApiError: jiti("../src/lib/api-client.ts").ApiError },
    "@/providers/session-provider": { useSession: () => ({ session, ready: true, request: transport }) } };
  const exports = {};
  const source = ts.transpileModule(readFileSync(require.resolve("../app/(tabs)/reservations.tsx"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, Promise, Date, setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id) => timers.delete(id), require: (name) => {
      if (name === "@/lib/reservation-attempt") return helper();
      assert.ok(name in imports, `Unexpected screen dependency: ${name}`); return imports[name];
    } });
  let tree;
  function renderComponent(fn, props, id) {
    visited.add(id);
    if (!instances.has(id)) instances.set(id, { cells: [] }); instance = instances.get(id); cursor = 0;
    const node = fn(props);
    if (typeof node?.type === "function") return renderComponent(node.type, node.props, `child:${node.key}`);
    return node;
  }
  function walk(node, predicate) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child, predicate); if (found) return found; }
  }
  return {
    render() {
      visited = new Set(); tree = renderComponent(exports.default, {}, "root");
      for (const [id, old] of instances) if (!visited.has(id)) {
        old.cells.forEach((cell) => cell?.cleanup?.()); instances.delete(id);
      }
      while (effects.length) effects.shift()(); return tree;
    },
    async settle() { for (let i = 0; i < 15; i++) { await Promise.resolve(); this.render(); } },
    field(label, value) { const field = walk(tree, (node) => node.type === "Field" && node.props.label === label); assert.ok(field, label); field.props.onChangeText(value); this.render(); },
    fieldValue(label) { return walk(tree, (node) => node.type === "Field" && node.props.label === label)?.props.value; },
    submit() { const button = walk(tree, (node) => node.type === "Button" && /Enviar solicitud|Reintentar la misma solicitud/.test(node.props.title)); assert.ok(button); return button.props.onPress(); },
    submitHandler() { return walk(tree, (node) => node.type === "Button" && /Enviar solicitud|Reintentar la misma solicitud/.test(node.props.title)).props.onPress; },
    switch(email, version = 2) { session = email ? { email, version, offline: false } : null; this.render(); },
    notices() { return JSON.stringify(tree); },
    uuidCalls: () => uuidCalls,
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
  };
}

test("owner-bound pending attempts survive restart without replacing exact body/key", async () => {
  const { createReservationState } = helper(); const saved = storage();
  const a = createReservationState(saved, " A@Example.test "); await a.restore(); await a.prepare(body, key);
  for (const email of ["b@example.test", null]) {
    const other = createReservationState(saved, email); await other.restore(); assert.equal(other.getSnapshot().pending, null);
    if (email === null) await assert.rejects(other.prepare(body, key), /owner|guest/i);
  }
  const restored = createReservationState(saved, owner); await restored.restore();
  assert.equal(restored.getSnapshot().pending.body, body); assert.equal(restored.getSnapshot().pending.key, key);
  await assert.rejects(restored.prepare(body.replace("Original", "Changed"), key), /unresolved/i);
  await assert.rejects(restored.prepare(body, receipt.reservationId), /unresolved/i);
});

test("drafts isolate owners and migrate only matching normalized legacy evidence", async () => {
  const { createReservationState } = helper(); const saved = storage({ "wok.client.reservation-draft.v1": JSON.stringify({ ...draft, ownerEmail: " A@Example.test " }) });
  const b = createReservationState(saved, "b@example.test"); await b.restore(); assert.equal(b.getSnapshot().draft, null);
  assert.equal(saved.values.size, 1);
  const a = createReservationState(saved, owner); await a.restore(); assert.equal(a.getSnapshot().draft.notes, "Original");
  assert.equal(saved.values.has("wok.client.reservation-draft.v1"), true);
  await assert.rejects(b.saveDraft(draft), /owner/i);
  await a.saveDraft({ ...draft, notes: "Only A" });
  const back = createReservationState(saved, owner); await back.restore(); assert.equal(back.getSnapshot().draft.notes, "Only A");
});

test("malformed pending and mismatched acknowledgements fail closed without deleting evidence", async () => {
  const { createReservationState } = helper(); const { accountStorageKey } = jiti("../src/lib/account-storage.ts");
  const bad = createReservationState(storage({ [accountStorageKey("reservation-pending", owner)]: "not-json" }), owner);
  await bad.restore(); assert.equal(bad.getSnapshot().ready, false);
  const wrongOwner = createReservationState(storage({ [accountStorageKey("reservation-pending", "b@example.test")]:
    JSON.stringify({ ownerEmail: owner, key, body, savedAt: 1 }) }), "b@example.test");
  await wrongOwner.restore(); assert.equal(wrongOwner.getSnapshot().ready, false); assert.equal(wrongOwner.getSnapshot().pending, null);
  const saved = storage(); const a = createReservationState(saved, owner); await a.restore(); await a.prepare(body, key);
  for (const result of [{}, { ...receipt, requestId: receipt.reservationId }, { ...receipt, submitted: true, reservationId: null },
    { ...receipt, decision: "REJECT" }, { ...receipt, maximumOccupancyMinutes: 1 }]) {
    await assert.rejects(a.acknowledge(key, result)); assert.equal(a.getSnapshot().pending.key, key);
  }
  await a.acknowledge(key, { ...receipt, submitted: false, reservationId: null, decision: "REJECT" });
  assert.equal(a.getSnapshot().pending, null);
});

test("production screen persists before POST, uses secure UUID and blocks double tap", async () => {
  const saved = storage(); const response = deferred(); const calls = [];
  const harness = screenHarness(saved, async (_path, options) => {
    if (!options?.method) return []; calls.push(options);
    assert.ok([...saved.values.values()].some((raw) => JSON.parse(raw)?.key === key));
    return response.promise;
  });
  harness.render(); await harness.settle(); harness.field("Fecha y hora", "2099-10-06T12:00");
  const first = harness.submit(); const second = harness.submit(); await harness.settle();
  assert.equal(calls.length, 1); assert.equal(harness.uuidCalls(), 1);
  response.resolve(receipt); await Promise.all([first, second]); await harness.settle();
  assert.equal(harness.fieldValue("Fecha y hora"), ""); assert.ok(harness.notices().includes("Pending review"));
});

test("production screen suppresses POST after persistence failure and refuses guest submission", async () => {
  let posts = 0;
  const harness = screenHarness({ ...storage(), setItemAsync: async () => { throw new Error("disk unavailable"); } },
    async (_path, options) => { if (options?.method) posts++; return []; });
  harness.render(); await harness.settle(); harness.field("Fecha y hora", "2099-10-06T12:00");
  await harness.submit(); assert.equal(posts, 0);
  harness.switch(null); await harness.settle(); await harness.submit(); assert.equal(posts, 0);
});

test("timeout, 5xx and 4xx keep exact replay through screen restart without auto-submit", async () => {
  for (const failure of [new Error("timeout"), ...[503, 401, 409, 422, 429].map((status) => Object.assign(new Error("unavailable"), { status }))]) {
    const saved = storage(); const calls = [];
    const transport = async (_path, options) => { if (!options?.method) return []; calls.push(options); throw failure; };
    const first = screenHarness(saved, transport); first.render(); await first.settle(); first.field("Fecha y hora", "2099-10-06T12:00");
    await first.submit(); await first.settle(); assert.equal(calls.length, 1);
    const restarted = screenHarness(saved, transport); restarted.render(); await restarted.settle(); assert.equal(calls.length, 1);
    restarted.field("Solicitudes especiales (opcional)", "Changed by old callback");
    await restarted.submit(); assert.equal(calls.length, 2);
    assert.equal(calls[1].body, calls[0].body); assert.equal(calls[1].headers["Idempotency-Key"], key); assert.equal(restarted.uuidCalls(), 0);
  }
});

test("failed pending clear keeps screen locked to the successful request's replay", async () => {
  const saved = storage(); let fail = true; const calls = [];
  const disk = { ...saved, deleteItemAsync: async (name) => { if (fail && name.includes("reservation-pending")) throw new Error("cannot clear"); return saved.deleteItemAsync(name); } };
  const harness = screenHarness(disk, async (_path, options) => { if (!options?.method) return []; calls.push(options); return receipt; });
  harness.render(); await harness.settle(); harness.field("Fecha y hora", "2099-10-06T12:00"); await harness.submit(); await harness.settle();
  assert.ok(harness.notices().includes("Reintentar la misma solicitud"));
  fail = false; await harness.submit(); await harness.settle();
  assert.equal(calls.length, 2); assert.equal(calls[1].body, calls[0].body); assert.equal(harness.uuidCalls(), 1);
});

test("account switch discards form/history/errors and stale response cannot clear another account", async () => {
  const saved = storage(); const response = deferred(); let posts = 0;
  const harness = screenHarness(saved, async (_path, options) => { if (!options?.method) return []; posts++; return response.promise; });
  harness.render(); await harness.settle(); harness.field("Fecha y hora", "2099-10-06T12:00"); harness.field("Solicitudes especiales (opcional)", "A private note");
  const oldSubmit = harness.submitHandler(); const pending = harness.submit(); await harness.settle();
  harness.switch("b@example.test"); await harness.settle(); assert.equal(harness.fieldValue("Fecha y hora"), "");
  assert.equal(harness.fieldValue("Solicitudes especiales (opcional)"), "");
  response.resolve(receipt); await pending; await harness.settle();
  assert.ok(!harness.notices().includes("Pending review"));
  assert.ok([...saved.values.values()].some((raw) => JSON.parse(raw)?.key === key));
  await oldSubmit(); assert.equal(posts, 1);
});

test("late pending persistence after logout cannot POST or hydrate a different account", async () => {
  const saved = storage(); const started = deferred(); const release = deferred(); let posts = 0;
  const harness = screenHarness({ ...saved, setItemAsync: async (name, value) => {
    if (name.includes("reservation-pending")) { started.resolve(); await release.promise; }
    return saved.setItemAsync(name, value);
  } }, async (_path, options) => { if (options?.method) posts++; return []; });
  harness.render(); await harness.settle(); harness.field("Fecha y hora", "2099-10-06T12:00");
  const pending = harness.submit(); await started.promise;
  harness.switch(null); harness.switch("b@example.test", 3); release.resolve();
  await pending; await harness.settle(); assert.equal(posts, 0);
  assert.equal(harness.fieldValue("Fecha y hora"), "");
  assert.ok(!harness.notices().includes("Reintentar la misma solicitud"));
});

test("late A restore and history cannot reach B; a new same-owner session restores only its evidence", async () => {
  const { accountStorageKey } = jiti("../src/lib/account-storage.ts");
  const saved = storage({ [accountStorageKey("reservation-pending", owner)]: JSON.stringify({ ownerEmail: owner, body, key, savedAt: 1 }) });
  const started = deferred(); const release = deferred(); const history = deferred(); let slow = true;
  const harness = screenHarness({ ...saved, getItemAsync: async (name) => {
    if (slow) { started.resolve(); await release.promise; } return saved.getItemAsync(name);
  } }, async () => slow ? history.promise : []);
  harness.render(); await started.promise; slow = false; harness.switch("b@example.test");
  release.resolve(); history.resolve([{ ...receipt, requestedAt: "2099-10-06T12:00:00Z", message: "A private history" }]);
  await harness.settle(); assert.equal(harness.fieldValue("Fecha y hora"), ""); assert.ok(!harness.notices().includes("A private history"));
  harness.switch(owner, 3); await harness.settle();
  assert.ok(harness.notices().includes("Reintentar la misma solicitud"));
  assert.equal(harness.fieldValue("Solicitudes especiales (opcional)"), "Original");
});

test("draft persistence and web memory stay owner-scoped through switches and reset forms", async () => {
  for (const platform of ["ios", "web"]) {
    const saved = storage(); const harness = screenHarness(saved, async () => [], platform);
    harness.render(); await harness.settle(); harness.field("Solicitudes especiales (opcional)", "Only A");
    harness.runTimers(); await harness.settle(); harness.switch("b@example.test"); await harness.settle();
    assert.equal(harness.fieldValue("Solicitudes especiales (opcional)"), "");
    harness.field("Solicitudes especiales (opcional)", "Only B"); harness.runTimers(); await harness.settle();
    harness.switch(owner, 3); await harness.settle(); assert.equal(harness.fieldValue("Solicitudes especiales (opcional)"), "Only A");
    harness.field("Solicitudes especiales (opcional)", ""); harness.runTimers(); await harness.settle();
    harness.switch(null); await harness.settle(); harness.switch(owner, 4); await harness.settle();
    assert.equal(harness.fieldValue("Solicitudes especiales (opcional)"), "");
  }
});

test("successful acknowledgement cannot resurrect retained legacy draft after restart", async () => {
  const { createReservationState } = helper();
  const saved = storage({ "wok.client.reservation-draft.v1": JSON.stringify(draft) });
  const a = createReservationState(saved, owner); await a.restore(); await a.prepare(body, key); await a.acknowledge(key, receipt);
  const restarted = createReservationState(saved, owner); await restarted.restore();
  assert.equal(restarted.getSnapshot().draft, null); assert.equal(restarted.getSnapshot().pending, null);
  assert.equal(saved.values.has("wok.client.reservation-draft.v1"), true);
});
