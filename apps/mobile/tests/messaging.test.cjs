const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { test } = require("node:test");
const jiti = require("jiti")(__filename);
const root = path.resolve(__dirname, "..");
const moduleUnderTest = () =>
  jiti(path.join(root, "src/lib/messaging-state.ts"));
const owner = "client@example.test";
const id = "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee";
const key = "a45a4cf1-7fd1-4e76-a85c-b438df0247fe";
const conversation = {
  conversationId: id,
  status: "OPEN",
  updatedAt: "2026-10-07T18:00:00Z",
};
const item = {
  messageId: key,
  senderType: "HUMAN",
  body: "Te ayudamos",
  status: "SENT",
  createdAt: "2026-10-07T18:00:00Z",
};
const receipt = {
  messageId: key,
  status: "SENT",
  createdAt: item.createdAt,
  idempotentReplay: false,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function installedWebSecureStore() {
  const file = path.join(
    root,
    "../../node_modules/expo-secure-store/build/SecureStore.js",
  );
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: () => ({ default: {} }) });
  return exports;
}

function fixture(options = {}) {
  const { createMessagingStorage, createMessagingState } = moduleUnderTest();
  const calls = [];
  const request =
    options.request ??
    (async (url, init) => {
      calls.push({ url, init });
      if (init?.method === "POST")
        return url.endsWith("/messages") ? receipt : conversation;
      return url.endsWith("/messages") ? [item] : [conversation];
    });
  const storage =
    options.storage ?? createMessagingStorage("web", installedWebSecureStore());
  const state = createMessagingState({
    owner,
    request,
    storage,
    uuid: () => key,
    online: true,
  });
  return { state, storage, calls };
}

async function renderedMessageScreen(request) {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  const react = {
    useState: (initial) => {
      const index = cursor++;
      if (!(index in hooks))
        hooks[index] = typeof initial === "function" ? initial() : initial;
      return [
        hooks[index],
        (value) => {
          hooks[index] =
            typeof value === "function" ? value(hooks[index]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const index = cursor++;
      return hooks[index] ?? (hooks[index] = { current: initial });
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = true;
        effects.push(fn);
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const session = { email: owner, version: 1, offline: false };
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(path.join(root, "app/messages.tsx"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native")
        return {
          Platform: { OS: "web" },
          ScrollView: "ScrollView",
          Text: "Text",
          View: "View",
          ActivityIndicator: "ActivityIndicator",
        };
      if (name === "expo-secure-store") return installedWebSecureStore();
      if (name === "expo-crypto") return { randomUUID: () => key };
      if (name === "@/providers/session-provider")
        return { useSession: () => ({ session, request }) };
      if (name === "@/lib/messaging-state")
        return require("node:fs").existsSync(
          path.join(root, "src/lib/messaging-state.ts"),
        )
          ? moduleUnderTest()
          : {};
      if (name === "@/components/ui")
        return {
          ...Object.fromEntries(
            ["Button", "Card", "Field", "Heading", "Notice", "Page"].map(
              (name) => [name, name],
            ),
          ),
          useUiTheme: () => ({ colors: {}, ui: {} }),
        };
      if (name === "@/lib/api") return { ApiError: class extends Error {} };
      return {};
    },
  });
  const child = exports.default();
  const render = () => {
    cursor = 0;
    return child.type(child.props);
  };
  render();
  for (const effect of effects) effect();
  for (let turn = 0; turn < 5; turn++) await tick();
  return render();
}

const texts = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(texts)
    : typeof tree === "object" && tree
      ? texts(tree.props?.children)
      : [tree];
test("actual message screen renders successful history with the installed Web adapter", async () => {
  const tree = await renderedMessageScreen(async (url) =>
    url.endsWith("/messages") ? [item] : [conversation],
  );
  assert.ok(texts(tree).includes(item.body));
});

test("actual message error branch does not present empty success or an enabled send", async () => {
  const tree = await renderedMessageScreen(async () => {
    throw new Error("unavailable");
  });
  const elements = (tree) =>
    Array.isArray(tree)
      ? tree.flatMap(elements)
      : tree && typeof tree === "object"
        ? [tree, ...elements(tree.props?.children)]
        : [];
  assert.equal(
    texts(tree).includes(
      "Aún no hay mensajes. Cuéntanos cómo podemos ayudarte.",
    ),
    false,
  );
  assert.equal(
    elements(tree).some(
      (item) =>
        ["Enviar mensaje", "Iniciar conversación"].includes(item.props.title) &&
        !item.props.disabled,
    ),
    false,
  );
  assert.ok(
    elements(tree).some((item) => item.props.title === "Actualizar mensajes"),
  );
});

test("real successful history is not rejected by the installed unsupported Web SecureStore", async () => {
  const secure = installedWebSecureStore();
  await assert.rejects(
    () => secure.getItemAsync("wok.messaging.pending.test"),
    /getValueWithKeyAsync/,
  );
  const { state } = fixture();
  await state.load();
  assert.equal(state.snapshot().historyReady, true);
  assert.equal(state.snapshot().storageReady, true);
  assert.equal(state.snapshot().messages[0].body, item.body);
  assert.equal(state.snapshot().error, "");
});

test("history errors are not empty success and cannot send or open another conversation", async () => {
  const { state } = fixture({
    request: async () => {
      throw new Error("unavailable");
    },
  });
  await state.load();
  assert.equal(state.snapshot().historyReady, false);
  assert.ok(state.snapshot().error);
  assert.equal(await state.submit("hello"), false);
  assert.equal(await state.start(), false);
});

test("storage recovery failure preserves API history but locks new writes", async () => {
  const { state } = fixture({
    storage: {
      getItemAsync: async () => {
        throw new Error("storage");
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    },
  });
  await state.load();
  assert.equal(state.snapshot().historyReady, true);
  assert.equal(state.snapshot().messages.length, 1);
  assert.equal(state.snapshot().storageReady, false);
  assert.ok(state.snapshot().warning);
  assert.equal(await state.submit("hello"), false);
});

test("wire schemas reject malformed history and pending data from another owner or conversation", async () => {
  const { parsePending, messagingStorageKey } = moduleUnderTest();
  const pending = { owner, conversationId: id, key, body: " exact body " };
  assert.equal(
    parsePending(JSON.stringify(pending), owner, id).body,
    pending.body,
  );
  assert.equal(
    parsePending(JSON.stringify({ key, body: "legacy" }), owner, id).owner,
    owner,
  );
  for (const value of [
    { ...pending, owner: "other@example.test" },
    { ...pending, conversationId: key },
    { ...pending, key: "bad" },
    { ...pending, body: "" },
    { ...pending, body: "x".repeat(4001) },
  ])
    assert.throws(() => parsePending(JSON.stringify(value), owner, id));
  assert.notEqual(
    messagingStorageKey(owner, id),
    messagingStorageKey("other@example.test", id),
  );
  const { state } = fixture({
    request: async (url) =>
      url.endsWith("/messages")
        ? [{ ...item, senderType: "AI" }]
        : [conversation],
  });
  await state.load();
  assert.equal(state.snapshot().historyReady, false);
});

test("duplicate clicks and failed sends retain the exact UUID/body for explicit retry only", async () => {
  const gate = deferred();
  const sends = [];
  let fail = true;
  const { state } = fixture({
    request: async (url, init) => {
      if (init?.method === "POST") {
        sends.push(init);
        await gate.promise;
        if (fail) throw new Error("unknown result");
        return receipt;
      }
      return url.endsWith("/messages") ? [] : [conversation];
    },
  });
  await state.load();
  const first = state.submit(" hello ");
  assert.equal(await state.submit("different"), false);
  gate.resolve();
  await first;
  assert.equal(sends.length, 1);
  assert.equal(state.snapshot().pending.body, "hello");
  assert.equal(await state.submit("different"), false);
  fail = false;
  await state.retry();
  assert.equal(sends.length, 2);
  assert.equal(
    sends[0].headers["Idempotency-Key"],
    sends[1].headers["Idempotency-Key"],
  );
  assert.equal(sends[0].body, sends[1].body);
  assert.equal(state.snapshot().pending, null);
});

test("late reads after disposal cannot update a new owner or start writes", async () => {
  const gate = deferred();
  const { state } = fixture({ request: async () => gate.promise });
  let notifications = 0;
  state.subscribe(() => {
    notifications++;
  });
  const loading = state.load();
  state.dispose();
  const before = notifications;
  gate.resolve([conversation]);
  await loading;
  assert.equal(notifications, before);
  assert.equal(await state.submit("hello"), false);
  assert.equal(state.snapshot().conversation, null);
});

test("confirmed POST with cleanup failure retries cleanup only, never POST again", async () => {
  const { createMessagingStorage } = moduleUnderTest();
  const storage = createMessagingStorage("web", installedWebSecureStore());
  const remove = storage.deleteItemAsync;
  let failing = true;
  storage.deleteItemAsync = async (...args) => {
    if (failing) throw new Error("cleanup");
    return remove(...args);
  };
  const { state, calls } = fixture({ storage });
  await state.load();
  await state.submit("hello");
  assert.equal(state.snapshot().pending.confirmed, true);
  assert.ok(state.snapshot().notice);
  assert.ok(state.snapshot().warning);
  failing = false;
  await state.retry();
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
  assert.equal(state.snapshot().pending, null);
});

test("confirmed send followed by failed refresh remains confirmed, never an uncertain retry", async () => {
  let sent = false;
  const { state } = fixture({
    request: async (url, init) => {
      if (init?.method === "POST") {
        sent = true;
        return receipt;
      }
      if (sent) throw new Error("refresh unavailable");
      return url.endsWith("/messages") ? [] : [conversation];
    },
  });
  await state.load();
  assert.equal(await state.submit("hello"), true);
  assert.equal(state.snapshot().pending, null);
  assert.ok(state.snapshot().notice);
  assert.ok(state.snapshot().error);
  assert.equal(state.snapshot().historyReady, false);
});

test("failed pre-send persistence and offline state perform no POST", async () => {
  const { state, calls } = fixture({
    storage: {
      getItemAsync: async () => null,
      setItemAsync: async () => {
        throw new Error("write failure");
      },
      deleteItemAsync: async () => {},
    },
  });
  await state.load();
  await state.submit("hello");
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 0);
  assert.equal(state.snapshot().pending.body, "hello");
  state.setOnline(false);
  assert.equal(await state.retry(), false);
  await tick();
});

test("legacy attempts migrate only after owned history and preserve the exact body", async () => {
  const { messagingStorageKey } = moduleUnderTest();
  const { state, storage, calls } = fixture();
  await storage.setItemAsync(
    `wok.messaging.pending.${id}`,
    JSON.stringify({ key, body: " exact body " }),
  );
  await state.load();
  assert.equal(state.snapshot().pending.body, " exact body ");
  const scoped = JSON.parse(
    await storage.getItemAsync(messagingStorageKey(owner, id)),
  );
  assert.equal(scoped.owner, owner);
  assert.equal(scoped.conversationId, id);
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 0);
  await state.retry();
  const post = calls.find((call) => call.init?.method === "POST");
  assert.equal(post.init.body, JSON.stringify({ body: " exact body " }));
  assert.equal(post.init.headers["Idempotency-Key"], key);
});

test("confirmed persisted attempts rehydrate into cleanup, never resend", async () => {
  const { messagingStorageKey } = moduleUnderTest();
  const { state, storage, calls } = fixture();
  await storage.setItemAsync(
    messagingStorageKey(owner, id),
    JSON.stringify({
      owner,
      conversationId: id,
      key,
      body: "hello",
      confirmed: true,
    }),
  );
  await state.load();
  await state.retry();
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 0);
  assert.equal(state.snapshot().pending, null);
});

test("disposed persistence completion cannot initiate POST or mutate another owner", async () => {
  const gate = deferred();
  const writes = [];
  const { messagingStorageKey } = moduleUnderTest();
  const { state, calls } = fixture({
    storage: {
      getItemAsync: async () => null,
      setItemAsync: async (key, value) => {
        writes.push({ key, value });
        await gate.promise;
      },
      deleteItemAsync: async () => {},
    },
  });
  await state.load();
  const sending = state.submit("hello");
  state.dispose();
  gate.resolve();
  await sending;
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 0);
  assert.equal(writes[0].key, messagingStorageKey(owner, id));
  assert.equal(JSON.parse(writes[0].value).owner, owner);
});

test("Web owner cleanup cannot remove another account's pending content", async () => {
  const { createMessagingStorage, messagingStorageKey } = moduleUnderTest();
  const storage = createMessagingStorage("web", installedWebSecureStore());
  const ownKey = messagingStorageKey(owner, id);
  const otherKey = messagingStorageKey("other@example.test", id);
  await storage.setItemAsync(ownKey, "own");
  await storage.setItemAsync(otherKey, "other");
  storage.clearOwner(owner);
  assert.equal(await storage.getItemAsync(ownKey), null);
  assert.equal(await storage.getItemAsync(otherKey), "other");
  assert.equal(
    await createMessagingStorage("web", installedWebSecureStore()).getItemAsync(
      otherKey,
    ),
    null,
  );
});

test("conversation opening reads real existing history instead of fabricating empty success", async () => {
  const calls = [];
  const { state } = fixture({
    request: async (url, init) => {
      calls.push({ url, init });
      if (init?.method === "POST") return conversation;
      return url.endsWith("/messages") ? [item] : [];
    },
  });
  await state.load();
  await state.start();
  assert.equal(state.snapshot().messages[0].body, item.body);
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
  assert.ok(calls.some((call) => call.url.endsWith(`/${id}/messages`)));
});
