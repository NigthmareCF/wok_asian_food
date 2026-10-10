const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const jiti = require("jiti")(__filename);
const owner = "a@example.test";
const draft = {
  ownerEmail: owner,
  guests: "3",
  requestedAt: "2099-10-06T12:00",
  notes: "Owner A draft",
  preorder: false,
  savedAt: Date.now(),
};
const policy = {
  timeZone: "America/Guatemala",
  minimumNoticeHours: 2,
  firstRequestTime: "11:00",
  lastRequestTime: "21:00",
  preorderRecommendedAfter: "18:00",
  preorderItemsSupported: false,
  asOf: "2026-10-10T12:00:00Z",
};
const receipt = {
  submitted: true,
  decision: "REQUIRES_HUMAN_APPROVAL",
  message: "Owner A result",
};
const history = [
  {
    requestId: "request-a",
    reservationId: "reservation-a",
    reservationStatus: "REQUESTED",
    message: "Owner A history",
  },
];
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function storage(initial = null) {
  let value = initial;
  return {
    getItemAsync: async () => value,
    setItemAsync: async (_key, raw) => {
      value = raw;
    },
    deleteItemAsync: async () => {
      value = null;
    },
    value: () => value,
  };
}

// Execute production JSX handlers with controlled hooks, storage and transport.
// Keyed component unmounts run cleanup before the next committed effects.
function screenHarness(
  saved = storage(),
  transport = async () => [],
  platform = "ios",
) {
  let session = { email: owner, version: 1, offline: false },
    instance,
    cursor,
    tree;
  const instances = new Map(),
    effects = [],
    timers = new Map();
  let nextTimer = 0;
  const same = (a, b) =>
    a &&
    b &&
    a.length === b.length &&
    a.every((value, index) => Object.is(value, b[index]));
  const slot = (initial) => {
    const index = cursor++;
    if (!(index in instance.cells)) instance.cells[index] = initial();
    return [index, instance.cells[index]];
  };
  const react = {
    useState(initial) {
      const target = instance,
        [index, value] = slot(() =>
          typeof initial === "function" ? initial() : initial,
        );
      return [
        value,
        (next) => {
          target.cells[index] =
            typeof next === "function" ? next(target.cells[index]) : next;
        },
      ];
    },
    useRef(initial) {
      return slot(() => ({ current: initial }))[1];
    },
    useCallback(fn, deps) {
      const [index, old] = slot(() => null);
      if (!old || !same(old.deps, deps)) instance.cells[index] = { fn, deps };
      return instance.cells[index].fn;
    },
    useEffect(run, deps) {
      const target = instance,
        [index, old] = slot(() => null);
      if (!old || !same(old.deps, deps)) {
        instance.cells[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => {
          old?.cleanup?.();
          target.cells[index].cleanup = run();
        });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const ui = Object.fromEntries(
    ["Button", "Card", "Field", "Heading", "Notice", "Page", "StatusChip"].map(
      (name) => [name, name],
    ),
  );
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "expo-secure-store": saved,
    "expo-router": { router: { push() {} } },
    "react-native": {
      Platform: { OS: platform },
      ActivityIndicator: "ActivityIndicator",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
    },
    "@/components/ui": { ...ui, useUiTheme: () => ({ colors: {}, ui: {} }) },
    "@/components/reservation-date-time": {
      ReservationDateTime: "ReservationDateTime",
      stepGuests: (value, step) => String(Number(value) + step),
    },
    "@/lib/slot-time": jiti("../src/lib/slot-time.ts"),
    "@/providers/session-provider": {},
  };
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(require.resolve("../app/(tabs)/reservations.tsx"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  // The real provider keeps request stable until its session changes.
  let currentRequest, currentSession;
  imports["@/providers/session-provider"].useSession = () => {
    if (currentSession !== session) {
      currentSession = session;
      const captured = session;
      currentRequest = (path, options) =>
        path.endsWith("/policy")
          ? Promise.resolve(policy)
          : transport(path, options, captured);
    }
    return { session, request: currentRequest };
  };
  vm.runInNewContext(source, {
    exports,
    Promise,
    Date,
    setTimeout: (fn) => {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
  });
  function walk(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = walk(child, predicate);
      if (found) return found;
    }
  }
  const find = (type, predicate = () => true) => {
    const node = walk(
      tree,
      (node) => node.type === type && predicate(node.props),
    );
    assert.ok(node, type);
    return node.props;
  };
  return {
    render() {
      const visited = new Set();
      function component(fn, props, id) {
        visited.add(id);
        if (!instances.has(id)) instances.set(id, { cells: [] });
        instance = instances.get(id);
        cursor = 0;
        const node = fn(props);
        return typeof node?.type === "function"
          ? component(node.type, node.props, `child:${node.key}`)
          : node;
      }
      tree = component(exports.default, {}, "root");
      for (const [id, old] of instances)
        if (!visited.has(id)) {
          old.cells.forEach((cell) => cell?.cleanup?.());
          instances.delete(id);
        }
      while (effects.length) effects.shift()();
      return tree;
    },
    async settle() {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        this.render();
      }
    },
    switch(email, version = 2) {
      session = email ? { email, version, offline: false } : null;
      this.render();
    },
    notes(value) {
      find("Field").onChangeText(value);
      this.render();
    },
    date(value) {
      find("ReservationDateTime").onChange(value);
      this.render();
    },
    notesValue: () => find("Field").value,
    dateValue: () => find("ReservationDateTime").value,
    button: (title) => find("Button", (props) => props.title === title),
    submit() {
      return this.button("Enviar solicitud de reserva").onPress();
    },
    notices: () => JSON.stringify(tree),
    runTimers() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((fn) => fn());
    },
  };
}

test("owner, logout and same-owner session switches immediately hide all previous state", async () => {
  for (const [email, version] of [
    ["b@example.test", 2],
    [null, 2],
    [owner, 2],
  ]) {
    const h = screenHarness(storage(), async () => history, "web");
    h.render();
    await h.settle();
    h.notes("Owner A form");
    h.date(draft.requestedAt);
    assert.ok(h.notices().includes("Owner A history"));
    h.switch(email, version);
    assert.equal(h.notesValue(), "");
    assert.equal(h.dateValue(), "");
    assert.ok(!h.notices().includes("Owner A history"));
    await h.settle();
  }
});

test("normalized owner drafts restore, but an old restore cannot populate a new session", async () => {
  const oldRead = deferred();
  let reads = 0;
  const h = screenHarness({
    ...storage(),
    getItemAsync: () =>
      ++reads === 1 ? oldRead.promise : Promise.resolve(null),
  });
  h.render();
  await h.settle();
  h.switch("b@example.test");
  oldRead.resolve(JSON.stringify(draft));
  await h.settle();
  assert.equal(h.notesValue(), "");
  const normalized = screenHarness(storage(JSON.stringify(draft)));
  normalized.switch(" A@Example.test ");
  await normalized.settle();
  assert.equal(normalized.notesValue(), draft.notes);
});

for (const outcome of ["success", "failure"]) {
  test(`late history ${outcome} cannot change another owner's results or loading`, async () => {
    const a = deferred(),
      b = deferred();
    const h = screenHarness(storage(), (_path, _options, session) =>
      session.email === owner ? a.promise : b.promise,
    );
    h.render();
    await h.settle();
    h.switch("b@example.test");
    await h.settle();
    if (outcome === "success") a.resolve(history);
    else a.reject(new Error("Owner A history failure"));
    await h.settle();
    assert.ok(!h.notices().includes("Owner A"));
    assert.equal(h.button("Actualizar solicitudes").busy, true);
    b.resolve([]);
    await h.settle();
  });

  test(`late submit ${outcome} cannot clear another owner's form, pending key or busy state`, async () => {
    const a = deferred(),
      b = deferred();
    const posts = [];
    const saved = storage();
    const h = screenHarness(saved, (_path, options, session) => {
      if (options?.method === "POST") {
        posts.push(options);
        return session.email === owner ? a.promise : b.promise;
      }
      return [];
    });
    h.render();
    await h.settle();
    h.date(draft.requestedAt);
    const oldSubmit = h.submit();
    h.switch("b@example.test");
    await h.settle();
    h.notes("Owner B form");
    h.date(draft.requestedAt);
    h.runTimers();
    await h.settle();
    const newSubmit = h.submit();
    assert.equal(JSON.parse(posts[1].body).notes, "Owner B form");
    if (outcome === "success") a.resolve(receipt);
    else a.reject(new Error("Owner A submission failure"));
    await oldSubmit;
    await h.settle();
    assert.equal(h.notesValue(), "Owner B form");
    assert.equal(h.button("Enviar solicitud de reserva").busy, true);
    assert.ok(!h.notices().includes("Owner A"));
    assert.equal(JSON.parse(saved.value()).ownerEmail, "b@example.test");
    b.reject(new Error("Uncertain response"));
    await newSubmit;
    await h.settle();
    const retry = h.submit();
    await retry;
    assert.equal(
      posts[2].headers["Idempotency-Key"],
      posts[1].headers["Idempotency-Key"],
    );
  });

  test(`late cancellation ${outcome} cannot change another owner's notice or cancellation state`, async () => {
    const a = deferred(),
      b = deferred();
    const h = screenHarness(storage(), (_path, options, session) =>
      options?.method === "DELETE"
        ? session.email === owner
          ? a.promise
          : b.promise
        : history,
    );
    h.render();
    await h.settle();
    h.button("Cancelar solicitud pendiente").onPress();
    h.switch("b@example.test");
    await h.settle();
    h.button("Cancelar solicitud pendiente").onPress();
    if (outcome === "success") a.resolve({});
    else a.reject(new Error("Owner A cancellation failure"));
    await h.settle();
    assert.ok(!h.notices().includes("Cancelamos tu solicitud"));
    assert.ok(!h.notices().includes("Owner A cancellation failure"));
    assert.equal(h.button("Cancelar solicitud pendiente").busy, true);
    b.resolve({});
    await h.settle();
  });
}

test("in-flight old draft writes finish before new-owner persistence without contaminating it", async () => {
  const release = deferred();
  const saved = storage();
  let writes = 0;
  const h = screenHarness({
    ...saved,
    setItemAsync: async (name, raw) => {
      if (++writes === 1) await release.promise;
      return saved.setItemAsync(name, raw);
    },
  });
  h.render();
  await h.settle();
  h.notes("Owner A form");
  h.runTimers();
  await h.settle();
  h.switch("b@example.test");
  await h.settle();
  assert.equal(h.notesValue(), "");
  h.notes("Owner B form");
  h.runTimers();
  release.resolve();
  await h.settle();
  h.runTimers();
  await h.settle();
  assert.equal(JSON.parse(saved.value()).ownerEmail, "b@example.test");
  assert.equal(JSON.parse(saved.value()).notes, "Owner B form");
});

test("late draft write failures and stale handlers cannot affect a renewed same-owner session", async () => {
  const release = deferred();
  const saved = storage();
  let writes = 0,
    posts = 0;
  const h = screenHarness(
    {
      ...saved,
      setItemAsync: async (name, raw) => {
        if (++writes === 1) await release.promise;
        return saved.setItemAsync(name, raw);
      },
    },
    (_path, options) => {
      if (options?.method) posts++;
      return [];
    },
  );
  h.render();
  await h.settle();
  h.notes("Owner A form");
  h.date(draft.requestedAt);
  h.runTimers();
  await h.settle();
  const oldSubmit = h.button("Enviar solicitud de reserva").onPress;
  h.switch(owner, 2);
  h.notes("Renewed session");
  release.reject(new Error("Old draft write failed"));
  await h.settle();
  await oldSubmit();
  assert.equal(posts, 0);
  assert.equal(h.notesValue(), "Renewed session");
  assert.ok(!h.notices().includes("No se pudo guardar el borrador"));
  h.runTimers();
  await h.settle();
  assert.equal(JSON.parse(saved.value()).notes, "Renewed session");
});
