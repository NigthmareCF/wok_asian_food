const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const jiti = require("jiti")(__filename);
const { createApiRequest } = jiti("../src/lib/api-client.ts");
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
    Error,
    setTimeout: (fn) => {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      if (name === "@/lib/reservation-attempt")
        return jiti("../src/lib/reservation-attempt.ts");
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
    field: () => find("Field"),
    selector: () => find("ReservationDateTime"),
    submitButton: () =>
      find("Button", (props) =>
        /Enviar solicitud de reserva|Reintentar la misma solicitud/.test(
          props.title,
        ),
      ),
    button: (title) => find("Button", (props) => props.title === title),
    submit() {
      return this.submitButton().onPress();
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

function acknowledgement(options, patch = {}) {
  return {
    requestId:
      options.headers instanceof Headers
        ? options.headers.get("Idempotency-Key")
        : options.headers["Idempotency-Key"],
    reservationId: "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee",
    submitted: true,
    decision: "REQUIRES_HUMAN_APPROVAL",
    reasonCodes: [],
    minimumOccupancyMinutes: 90,
    maximumOccupancyMinutes: 120,
    message: "Solicitud recibida; pendiente de revisión",
    ...patch,
  };
}
function httpTransport(reply, posts = []) {
  const api = createApiRequest(
    "https://restaurant.example.test",
    false,
    async (_url, options) => {
      posts.push(options);
      return reply(options, posts.length);
    },
  );
  return (_path, options) =>
    options?.method === "POST"
      ? api("/api/v1/client/reservations", options)
      : [];
}

test("rapid and reentrant screen submissions send only one immutable attempt", async () => {
  const release = deferred(),
    posts = [];
  let click,
    reentered = false;
  const h = screenHarness(
    storage(),
    (_path, options) => {
      if (options?.method !== "POST") return [];
      posts.push(options);
      if (!reentered) {
        reentered = true;
        void click();
      }
      return release.promise;
    },
    "web",
  );
  h.render();
  await h.settle();
  h.notes("Original form");
  h.date(draft.requestedAt);
  click = h.submitButton().onPress;
  const first = click(),
    duplicate = click();
  release.resolve(acknowledgement(posts[0]));
  await Promise.all([first, duplicate]);
  await h.settle();
  assert.equal(posts.length, 1);
  assert.equal(h.notesValue(), "");
  assert.equal(h.dateValue(), "");
});

test("uncertain screen attempts lock every edit handler and retry the exact body/key", async () => {
  const posts = [];
  const h = screenHarness(
    storage(),
    httpTransport((options, number) => {
      if (number === 1) throw new Error("Transport unavailable");
      return new Response(JSON.stringify(acknowledgement(options)), {
        status: 202,
      });
    }, posts),
    "web",
  );
  h.render();
  await h.settle();
  h.notes("Original form");
  h.date(draft.requestedAt);
  const notes = h.field().onChangeText,
    date = h.selector().onChange,
    guests = h.button("+").onPress;
  const preorder = h.button("¿Requieres preorden? No").onPress;
  await h.submit();
  await h.settle();
  assert.equal(h.field().editable, false);
  assert.equal(h.selector().disabled, true);
  assert.equal(h.button("+").disabled, true);
  notes("Changed notes");
  date("2099-10-07T18:00");
  guests();
  preorder();
  h.render();
  assert.equal(h.notesValue(), "Original form");
  assert.equal(h.dateValue(), draft.requestedAt);
  assert.equal(h.submitButton().title, "Reintentar la misma solicitud");
  await h.submit();
  await h.settle();
  assert.equal(posts[1].body, posts[0].body);
  assert.equal(
    posts[1].headers.get("Idempotency-Key"),
    posts[0].headers.get("Idempotency-Key"),
  );
  assert.deepEqual(JSON.parse(posts[0].body), {
    guests: 2,
    requestedAt: "2099-10-06T18:00:00.000Z",
    preorder: false,
    notes: "Original form",
  });
  assert.equal(h.notesValue(), "");
  assert.equal(h.field().editable, true);
});

for (const decision of ["REJECT", "SUGGEST_OTHER_TIME"]) {
  test(`validated HTTP200 ${decision} preserves the editable draft and releases the attempt`, async () => {
    const saved = storage(),
      posts = [];
    const h = screenHarness(
      saved,
      httpTransport(
        (options) =>
          new Response(
            JSON.stringify(
              acknowledgement(options, {
                requestId: options.headers.get("Idempotency-Key"),
                submitted: false,
                reservationId: null,
                decision,
                message: "Elige otro horario",
              }),
            ),
            { status: 200 },
          ),
        posts,
      ),
    );
    h.render();
    await h.settle();
    h.notes("Editable draft");
    h.date(draft.requestedAt);
    h.runTimers();
    await h.settle();
    await h.submit();
    await h.settle();
    assert.equal(h.notesValue(), "Editable draft");
    assert.equal(h.dateValue(), draft.requestedAt);
    assert.equal(h.field().editable, true);
    assert.equal(h.submitButton().title, "Enviar solicitud de reserva");
    assert.ok(saved.value());
    assert.ok(h.notices().includes("Elige otro horario"));
    h.notes("Adjusted draft");
    await h.submit();
    assert.notEqual(
      posts[1].headers.get("Idempotency-Key"),
      posts[0].headers.get("Idempotency-Key"),
    );
    assert.equal(JSON.parse(posts[1].body).notes, "Adjusted draft");
  });
}

for (const status of [400, 403, 413, 415, 422, 429, 408, 409, 418, 500, 503]) {
  const definitive = [400, 403, 413, 415, 422, 429].includes(status);
  test(`actual transport HTTP${status} ${definitive ? "releases a rejected fresh attempt" : "retains uncertain exact replay"}`, async () => {
    const posts = [];
    const h = screenHarness(
      storage(),
      httpTransport(
        () => new Response("private server detail", { status }),
        posts,
      ),
      "web",
    );
    h.render();
    await h.settle();
    h.notes("Original form");
    h.date(draft.requestedAt);
    await h.submit();
    await h.settle();
    assert.equal(h.field().editable, definitive);
    assert.ok(!h.notices().includes("private server detail"));
    if (definitive) h.notes("Adjusted form");
    await h.submit();
    await h.settle();
    if (definitive) {
      assert.notEqual(
        posts[1].headers.get("Idempotency-Key"),
        posts[0].headers.get("Idempotency-Key"),
      );
      assert.equal(JSON.parse(posts[1].body).notes, "Adjusted form");
    } else {
      assert.equal(posts[1].body, posts[0].body);
      assert.equal(
        posts[1].headers.get("Idempotency-Key"),
        posts[0].headers.get("Idempotency-Key"),
      );
    }
  });
}

for (const malformed of [
  "invalid-json",
  "missing-fields",
  "wrong-request",
  "inconsistent-submission",
  "invalid-decision",
  "invalid-occupancy",
]) {
  test(`malformed acknowledgement ${malformed} cannot clear or release the current draft`, async () => {
    const posts = [];
    const h = screenHarness(
      storage(),
      httpTransport((options) => {
        const result = acknowledgement(options, {
          requestId: options.headers.get("Idempotency-Key"),
        });
        if (malformed === "missing-fields") delete result.reasonCodes;
        if (malformed === "wrong-request")
          result.requestId = "09b7f19c-7ea1-4b55-bb27-8b342fb73f60";
        if (malformed === "inconsistent-submission")
          result.reservationId = null;
        if (malformed === "invalid-decision") result.decision = "CONFIRMED";
        if (malformed === "invalid-occupancy")
          result.maximumOccupancyMinutes = 1;
        return new Response(
          malformed === "invalid-json" ? "not json" : JSON.stringify(result),
          { status: 202 },
        );
      }, posts),
      "web",
    );
    h.render();
    await h.settle();
    h.notes("Original form");
    h.date(draft.requestedAt);
    await h.submit();
    await h.settle();
    assert.equal(h.notesValue(), "Original form");
    assert.equal(h.field().editable, false);
    assert.equal(h.submitButton().title, "Reintentar la misma solicitud");
    await h.submit();
    await h.settle();
    assert.equal(posts[1].body, posts[0].body);
    assert.equal(
      posts[1].headers.get("Idempotency-Key"),
      posts[0].headers.get("Idempotency-Key"),
    );
  });
}

test("HTTP rejection after uncertainty cannot prove the earlier attempt absent", async () => {
  const posts = [];
  const h = screenHarness(
    storage(),
    httpTransport((_options, number) => {
      if (number === 1) throw new Error("Lost response");
      return new Response("", { status: 403 });
    }, posts),
    "web",
  );
  h.render();
  await h.settle();
  h.date(draft.requestedAt);
  await h.submit();
  await h.settle();
  await h.submit();
  await h.settle();
  assert.equal(h.field().editable, false);
  assert.equal(
    posts[1].headers.get("Idempotency-Key"),
    posts[0].headers.get("Idempotency-Key"),
  );
});

test("renewing the same-owner session cannot replay its former uncertain attempt", async () => {
  const posts = [];
  const h = screenHarness(
    storage(),
    httpTransport(() => {
      throw new Error("Lost response");
    }, posts),
    "web",
  );
  h.render();
  await h.settle();
  h.notes("Old session");
  h.date(draft.requestedAt);
  await h.submit();
  await h.settle();
  const oldRetry = h.submitButton().onPress;
  h.switch(owner, 2);
  await h.settle();
  await oldRetry();
  assert.equal(posts.length, 1);
  assert.equal(h.field().editable, true);
  assert.equal(h.notesValue(), "");
  h.notes("New session");
  h.date(draft.requestedAt);
  await h.submit();
  await h.settle();
  assert.notEqual(
    posts[1].headers.get("Idempotency-Key"),
    posts[0].headers.get("Idempotency-Key"),
  );
  assert.equal(JSON.parse(posts[1].body).notes, "New session");
});

test("late native draft restoration cannot replace a locked uncertain request's visible form", async () => {
  const read = deferred(),
    posts = [];
  const h = screenHarness(
    { ...storage(), getItemAsync: () => read.promise },
    httpTransport(() => {
      throw new Error("Lost response");
    }, posts),
  );
  h.render();
  await h.settle();
  h.notes("Current request");
  h.date(draft.requestedAt);
  await h.submit();
  await h.settle();
  read.resolve(JSON.stringify(draft));
  await h.settle();
  assert.equal(h.notesValue(), "Current request");
  assert.equal(h.field().editable, false);
  await h.submit();
  await h.settle();
  assert.equal(posts[1].body, posts[0].body);
});

test("actual aborted transport remains uncertain and keeps the exact replay identity", async () => {
  const aborted = new AbortController(),
    posts = [];
  const api = createApiRequest(
    "https://restaurant.example.test",
    false,
    async (_url, options) => {
      posts.push(options);
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) reject(new Error("Transport aborted"));
        else
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("Transport aborted")),
            { once: true },
          );
      });
    },
  );
  const h = screenHarness(
    storage(),
    (path, options) =>
      options?.method === "POST"
        ? api(path, { ...options, signal: aborted.signal })
        : [],
    "web",
  );
  h.render();
  await h.settle();
  h.date(draft.requestedAt);
  const pending = h.submit();
  aborted.abort();
  await pending;
  await h.settle();
  assert.equal(h.field().editable, false);
  assert.ok(h.notices().includes("No pudimos confirmar el resultado"));
  await h.submit();
  await h.settle();
  assert.equal(
    posts[1].headers.get("Idempotency-Key"),
    posts[0].headers.get("Idempotency-Key"),
  );
  assert.equal(posts[1].body, posts[0].body);
});

test("confirmed submission cleanup cannot be undone by a previously scheduled draft save", async () => {
  const release = deferred(),
    saved = storage();
  const h = screenHarness(
    {
      ...saved,
      deleteItemAsync: async (name) => {
        await release.promise;
        return saved.deleteItemAsync(name);
      },
    },
    httpTransport(
      (options) =>
        new Response(JSON.stringify(acknowledgement(options)), { status: 202 }),
    ),
  );
  h.render();
  await h.settle();
  h.notes("Submitted draft");
  h.date(draft.requestedAt);
  const pending = h.submit();
  await h.settle();
  h.runTimers();
  release.resolve();
  await pending;
  await h.settle();
  assert.equal(saved.value(), null);
  assert.equal(h.notesValue(), "");
  assert.equal(h.field().editable, true);
});

test("a completed submit handler cannot create a second request before the reset renders", async () => {
  const posts = [];
  const h = screenHarness(
    storage(),
    httpTransport(
      (options) =>
        new Response(JSON.stringify(acknowledgement(options)), { status: 202 }),
      posts,
    ),
    "web",
  );
  h.render();
  await h.settle();
  h.date(draft.requestedAt);
  const click = h.submitButton().onPress;
  await click();
  await click();
  assert.equal(posts.length, 1);
  await h.settle();
  assert.equal(h.dateValue(), "");
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
